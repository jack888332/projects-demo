import { beforeEach, describe, expect, it } from 'vitest'
import { createAirMasterSeed } from '../src/domain/airMasterData.js'
import {
  CAPACITY_HANDLERS, CAPACITY_OPERATORS, canEditCapacityNote, createCapacityDraft, createCapacitySeed,
  deriveCapacityRows, getCapacityEditRestriction, getCapacityOrderVolume, getCapacityProductView,
  getCapacityQueryRestriction, normalizeCapacityDraft, validCapacityDate, validateCapacityDraft,
} from '../src/domain/airCapacity.js'

let state
const copy = value => JSON.parse(JSON.stringify(value))
const draft = (changes = {}) => ({
  ...createCapacityDraft({ name: '李明' }), flightId: 'FLIGHT-MU9001', startDate: '2026-10-01', endDate: '2026-10-31', handler: '王晴',
  details: [{ weekday: 1, palletId: 'PALLET-DEMO-PMC', baseline: '', quantity: 2 }], ...changes,
})
const bookedOrder = (changes = {}) => ({
  id: 'AIR-1', orderNo: 'GJ-AIR-1', flight: 'MU9001', departureDate: '2026-09-10', bookingStatus: '服务已完成', waybillNo: '781-90000010', volume: 1.28, ...changes,
})
const rows = () => deriveCapacityRows(state, { startDate: '2026-09-08', endDate: '2026-09-15' })

beforeEach(() => { state = { airMaster: createAirMasterSeed(), capacityProducts: createCapacitySeed(), airOrders: [bookedOrder()] } })

describe('GJ-008 舱位产品规则', () => {
  it('默认临时板、一条空明细、创建人运营、无操作员和期限', () => {
    expect(createCapacityDraft({ name: '李明' })).toEqual({ flightId: '', boardType: '临时板', startDate: '', endDate: '', operator: '李明', handler: '', details: [{ weekday: '', palletId: '', baseline: '', quantity: '' }] })
    expect(CAPACITY_OPERATORS).toContain('李明')
    expect(CAPACITY_HANDLERS).toContain('王晴')
  })

  it('白名单不存储航司、目的港、板体积、创建人和备注投影', () => {
    const value = normalizeCapacityDraft({ ...draft(), airline: 'FORGED', createdAt: 'FORGED', remark: 'FORGED', details: [{ weekday: ' 1 ', palletId: ' PALLET-DEMO-PMC ', quantity: ' 2 ', baseline: '', volume: 999 }] })
    expect(value).not.toHaveProperty('airline')
    expect(value).not.toHaveProperty('createdAt')
    expect(value).not.toHaveProperty('remark')
    expect(value.details[0]).toEqual({ weekday: '1', palletId: 'PALLET-DEMO-PMC', baseline: '', quantity: '2' })
  })

  it('所有必填项提供定位错误，空值基重与数量可以保存', () => {
    expect(validateCapacityDraft(draft({ details: [{ weekday: 1, palletId: 'PALLET-DEMO-PMC', baseline: '', quantity: '' }] }), state)).toEqual({})
    const errors = validateCapacityDraft(createCapacityDraft(), state)
    for (const key of ['flightId', 'operator', 'handler', 'startDate', 'endDate', 'details.0.weekday', 'details.0.palletId']) expect(errors).toHaveProperty(key)
    for (const details of [[], null, 'invalid']) expect(validateCapacityDraft(draft({ details }), state)).toHaveProperty('details')
  })

  it('只允许主数据中同航司板型以及受控人员、板类型', () => {
    const invalid = draft({ operator: '未知', handler: '未知', boardType: 'PMC' })
    expect(validateCapacityDraft(invalid, state)).toMatchObject({ operator: expect.any(String), handler: expect.any(String), boardType: expect.any(String) })
    state.airMaster.pallets[0].airlineCode = 'CZ'
    expect(validateCapacityDraft(draft(), state)['details.0.palletId']).toContain('须属于')
    state.airMaster.airlines = []
    expect(validateCapacityDraft(draft(), state).flightId).toContain('主数据不存在')
  })

  it('周期日与板型组合唯一，数字和字符串不能绕过重复', () => {
    const value = draft()
    value.details.push({ ...value.details[0], weekday: '1' })
    expect(validateCapacityDraft(value, state)['details.1.palletId']).toBe('数据重复，请重新录入')
    value.details[1].weekday = 2
    expect(validateCapacityDraft(value, state)).toEqual({})
  })

  it('数量与基准载重仅正整数或空，拒绝小数、0、负数、对象和危险整数', () => {
    for (const input of [0, -1, 1.2, '1e2', false, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
      const errors = validateCapacityDraft(draft({ details: [{ weekday: 1, palletId: 'PALLET-DEMO-PMC', quantity: input, baseline: input }] }), state)
      expect(errors).toHaveProperty('details.0.quantity')
      expect(errors).toHaveProperty('details.0.baseline')
    }
    expect(validateCapacityDraft(draft({ details: [null] }), state)['details.0.weekday']).toContain('格式')
  })

  it('严格检查真实日历日期，不把无效日期自动进位', () => {
    for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-9-01', 'bad', null]) expect(validCapacityDate(value)).toBe(false)
    expect(validCapacityDate('2028-02-29')).toBe(true)
    expect(validateCapacityDraft(draft({ startDate: '2026-11-01' }), state).endDate).toContain('不能早于')
    expect(validateCapacityDraft(draft({ startDate: '2026-10-31' }), state).endDate).toContain('待确认')
  })

  it('同航班同板类型重叠拒绝，相接待确认，不同类型可同期间保存', () => {
    expect(validateCapacityDraft(draft({ startDate: '2026-09-10' }), state).endDate).toBe('数据重复，请重新录入')
    expect(validateCapacityDraft(draft({ startDate: '2026-09-30' }), state).endDate).toContain('同日相接')
    expect(validateCapacityDraft(draft({ boardType: '合同板', startDate: '2026-09-01', endDate: '2026-09-30' }), state)).toEqual({})
  })

  it('编辑只能改允许字段，并排除自身重复', () => {
    const existing = state.capacityProducts[0]
    expect(validateCapacityDraft(existing, state, { existing })).toEqual({})
    expect(validateCapacityDraft({ ...existing, flightId: 'FLIGHT-CZ9002', boardType: '合同板' }, state, { existing })).toMatchObject({ flightId: '编辑时不可修改航班', boardType: '编辑时不可修改板类型' })
  })

  it('展示从当前主数据派生航班和板体积，不改变产品', () => {
    const before = JSON.stringify(state.capacityProducts)
    const product = getCapacityProductView(state.capacityProducts[0], state.airMaster)
    expect(product).toMatchObject({ flight: 'MU9001', airline: '东方航空', origin: 'PVG', destination: 'CAN' })
    expect(product.details[0]).toMatchObject({ pallet: 'PMC-DEMO', volume: 10 })
    state.airMaster.pallets[0].volume = 12
    expect(getCapacityProductView(state.capacityProducts[0], state.airMaster).details[0].volume).toBe(12)
    expect(JSON.stringify(state.capacityProducts)).toBe(before)
  })

  it('仅本人运营且无引用产品可编辑，备注是产品级本人运营权限', () => {
    const product = state.capacityProducts[0], owner = { name: '李明', role: 'operator' }
    expect(getCapacityEditRestriction(product, state, owner)).toContain('已有业务的影响待确认')
    state.airOrders = []
    expect(getCapacityEditRestriction(product, state, owner)).toBe('')
    expect(getCapacityEditRestriction(product, state, { ...owner, name: '赵航' })).toContain('权限范围待确认')
    expect(getCapacityEditRestriction(product, state, { ...owner, role: 'handler' })).toContain('仅航线运营')
    expect(canEditCapacityNote(product, owner)).toBe(true)
    expect(canEditCapacityNote(product, { ...owner, name: '赵航' })).toBe(false)
    expect(canEditCapacityNote(product, { ...owner, role: 'business' })).toBe(false)
  })
})

describe('GJ-008 实时容量派生', () => {
  it('仅枚举明确期间，按日期升序，产品日历覆盖到已完成订舱主订单', () => {
    expect(deriveCapacityRows(state)).toEqual([])
    expect(deriveCapacityRows(state, { startDate: '2026-09-10', endDate: '2026-09-01' })).toEqual([])
    const result = rows()
    expect(result).toHaveLength(8)
    expect(result.map(row => row.date)).toEqual(['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15'])
    expect(result[2]).toMatchObject({ flight: 'MU9001', boardCount: 2, totalVolume: 20, bookedVolume: 1.28, remainingVolume: 18.72 })
    expect(result[0].bookedVolume).toBe(0)
  })

  it('日期有效期与周期日均匹配才汇总，合同板和临时板叠加', () => {
    state.capacityProducts.push({ ...copy(state.capacityProducts[0]), id: 'CAP-2', boardType: '合同板', details: [{ weekday: 4, palletId: 'PALLET-DEMO-PMC', quantity: 3, baseline: 1000 }] })
    expect(rows()[2]).toMatchObject({ boardCount: 5, totalVolume: 50, totalBaseline: 3000, remainingVolume: 48.72 })
    expect(rows()[0]).toMatchObject({ boardCount: 2, totalVolume: 20, totalBaseline: 0 })
    expect(deriveCapacityRows(state, { startDate: '2026-10-01', endDate: '2026-10-02' })).toEqual([])
  })

  it('缺数量不冒充零，缺基重不影响已知体积，但合同基重未知', () => {
    state.capacityProducts[0].details.forEach(row => { row.quantity = '' })
    expect(rows()[2]).toMatchObject({ boardCount: null, totalVolume: null, bookedVolume: 1.28, remainingVolume: null, capacityReason: expect.stringContaining('数量未填写') })
    state.capacityProducts[0].details.forEach(row => { row.quantity = 2 })
    state.capacityProducts[0].boardType = '合同板'
    expect(rows()[2]).toMatchObject({ totalVolume: 20, totalBaseline: null })
  })

  it('缺板型主数据只阻断容量，不改变已订舱体积', () => {
    state.airMaster.pallets = []
    expect(rows()[2]).toMatchObject({ boardCount: 2, totalVolume: null, bookedVolume: 1.28, remainingVolume: null, capacityReason: expect.stringContaining('主数据缺失') })
  })

  it('只计算完成订舱且有提单的匹配主订单，不把分单、其他日期和航班混算', () => {
    state.airOrders.push(...[
      { bookingStatus: '服务中' }, { waybillNo: '' }, { parentOrderId: 'AIR-1' }, { masterOrderId: 'AIR-1' },
      { isChild: true }, { orderType: '分单' }, { flight: 'CZ9002' }, { departureDate: '2026-09-11' },
    ].map((change, index) => bookedOrder({ id: `OTHER-${index}`, volume: 100, ...change })))
    expect(rows().find(row => row.date === '2026-09-10' && row.flight === 'MU9001').bookedVolume).toBe(1.28)
    expect(rows().find(row => row.date === '2026-09-11' && row.flight === 'MU9001').bookedVolume).toBe(100)
  })

  it('订舱完成和航班日期改动实时派生，不存第二份容量数据', () => {
    const before = JSON.stringify(state)
    rows()
    expect(JSON.stringify(state)).toBe(before)
    state.airOrders[0].bookingStatus = '服务中'
    expect(rows()[2].bookedVolume).toBe(0)
    state.airOrders[0].bookingStatus = '服务已完成'
    state.airOrders[0].booking = { flight: 'MU9001', departureDate: '2026-09-11' }
    expect(rows()[2].bookedVolume).toBe(0)
    expect(rows()[3].bookedVolume).toBe(1.28)
  })

  it('按预计、入仓、入货站优先级取当前体积，缺后阶段值绝不回退', () => {
    const order = state.airOrders[0]
    expect(getCapacityOrderVolume(order, state)).toEqual({ volume: 1.28, source: '预计', reason: '' })
    order.warehouse = { volume: 1.5 }
    expect(rows()[2].bookedVolume).toBe(1.5)
    order.station = { volume: 1.8, enteredAt: '2026-09-08 12:00' }
    expect(rows()[2].bookedVolume).toBe(1.8)
    order.station.volume = ''
    expect(rows()[2]).toMatchObject({ bookedVolume: null, remainingVolume: null, volumeReason: expect.stringContaining('入货站体积尚未接入') })
  })

  it('仓库对象只有明确空运关联才参与，无关演示仓库订单不串入', () => {
    state.warehouseOrders = [{ id: 'WH-1', customer: '相同客户', volume: 999 }]
    expect(rows()[2].bookedVolume).toBe(1.28)
    state.warehouseOrders[0].airOrderId = 'AIR-1'
    state.warehouseOrders[0].receivedAt = '2026-09-08 12:00'
    expect(rows()[2].bookedVolume).toBe(999)
    delete state.warehouseOrders[0].volume
    expect(rows()[2].bookedVolume).toBeNull()
    state.stationOrders = [{ sourceOrderId: 'AIR-1', volume: 2.6 }]
    expect(rows()[2].bookedVolume).toBe(2.6)
  })

  it('明确零体积是零，空值体积未知，超售负余额不擅自截为零', () => {
    state.airOrders[0].volume = 0
    expect(rows()[2].bookedVolume).toBe(0)
    state.airOrders[0].volume = ''
    expect(rows()[2].bookedVolume).toBeNull()
    state.airOrders[0].volume = 30
    expect(rows()[2].remainingVolume).toBe(-10)
  })

  it('关联但未入仓对象不等于已入仓，入仓证据成立后缺值才阻断', () => {
    state.warehouseOrders = [{ id: 'WH-1', airOrderId: 'AIR-1', status: '待服务' }]
    expect(rows()[2].bookedVolume).toBe(1.28)
    state.airOrders[0].warehouse = { status: '待收货', volume: '' }
    expect(rows()[2].bookedVolume).toBe(1.28)
    state.airOrders[0].warehouse.receivedAt = '2026-09-08 12:00'
    expect(rows()[2].bookedVolume).toBeNull()
    state.airOrders[0].warehouse.volume = 0
    expect(rows()[2].bookedVolume).toBe(0)
  })

  it('没有产品仍保留已订舱航班，不把未确定容量冒充零', () => {
    state.capacityProducts = []
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({ date: '2026-09-10', totalVolume: null, boardCount: null, bookedVolume: 1.28, remainingVolume: null, capacityReason: expect.stringContaining('未维护匹配') })
    state.airOrders[0].flight = 'UNKNOWN-DEMO'
    expect(rows()[0]).toMatchObject({ flight: 'UNKNOWN-DEMO', bookedVolume: 1.28, totalVolume: null })
  })

  it('任意查询跨度只枚举实际产品和订舱日期，不逐日扫描空白年份', () => {
    expect(getCapacityQueryRestriction(state, { startDate: '0001-01-01', endDate: '9999-12-31' })).toBe('')
    expect(deriveCapacityRows(state, { startDate: '0001-01-01', endDate: '9999-12-31' })).toHaveLength(30)
    state.capacityProducts[0].startDate = '0001-01-01'
    state.capacityProducts[0].endDate = '9999-12-31'
    expect(getCapacityQueryRestriction(state, { startDate: '0001-01-01', endDate: '9999-12-31' })).toContain('演示查询结果过多')
    expect(() => deriveCapacityRows(state, { startDate: '0001-01-01', endDate: '9999-12-31' })).toThrow('缩小出港日期范围')
  })

  it('十进制相加相乘和相减不泄漏二进制浮点尾数，不指定业务舍入位数', () => {
    state.airMaster.pallets[0].volume = 0.1
    state.capacityProducts[0].details.forEach(row => { row.quantity = 3 })
    state.airOrders = [bookedOrder({ volume: 0.1 }), bookedOrder({ id: 'AIR-2', volume: 0.2 })]
    expect(rows()[2]).toMatchObject({ totalVolume: 0.3, bookedVolume: 0.3, remainingVolume: 0 })
  })

  it('种子每次独立，不因上轮演示写入污染重置', () => {
    state.capacityProducts[0].details[0].quantity = 999
    expect(createCapacitySeed()[0].details[0].quantity).toBe(2)
  })
})
