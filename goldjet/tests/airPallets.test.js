import { beforeEach, describe, expect, it } from 'vitest'
import { createAirMasterSeed } from '../src/domain/airMasterData.js'
import { createCapacitySeed } from '../src/domain/airCapacity.js'
import {
  canEditAirAllocationNote, getPalletAllocatedRows, getPalletAllocationRestriction, getPalletCandidates, getPalletFlightRows,
  getPalletOrderCargo, getPalletOrderRestriction, getPalletProfit, getPalletSplitRestriction, getPalletUnloadRestriction,
  getPalletWithdrawRestriction, getPalletWriteRestriction, validatePalletSplit,
} from '../src/domain/airPallets.js'

const clone = value => JSON.parse(JSON.stringify(value))
const session = { name: '李明', role: 'operator' }, handler = { name: '王晴', role: 'handler' }
const flightKey = 'FLIGHT-MU9001:2026-09-10', range = { startDate: '2026-09-10', endDate: '2026-09-10' }
const order = (changes = {}) => ({ id: 'AIR-1', orderNo: 'GJ-AIR-1', customer: '演示客户', flight: 'MU9001', departureDate: '2026-09-10', bookingStatus: '服务已完成', waybillNo: '781-90000010', grossWeight: 100, pieces: 10, volume: 25, assignees: { operator: '李明', handler: '王晴' }, ...changes })
const allocation = (changes = {}) => ({ id: 'PAL-00000001', orderId: 'AIR-1', flightKey, flightId: 'FLIGHT-MU9001', flight: 'MU9001', date: '2026-09-10', operator: '李明', handler: '王晴', cargo: { grossWeight: 100, pieces: 10, volume: 25 }, cargoSource: '预计', parentAllocationId: '', remark: '', ...changes })
let state
beforeEach(() => { state = { airMaster: createAirMasterSeed(), capacityProducts: createCapacitySeed(), airOrders: [order()], palletAllocations: [] } })

describe('GJ-008 配板候选与毛件体', () => {
  it('只展示本人航线或明确绑定订单，航线部两角色可写且其他角色不越权', () => {
    expect(getPalletCandidates(state, session)).toHaveLength(1)
    expect(getPalletCandidates(state, handler)).toHaveLength(1)
    expect(getPalletCandidates(state, { name: '另一人', role: 'operator' })).toEqual([])
    expect(getPalletCandidates(state, { name: '李明', role: 'business' })).toEqual([])
    expect(getPalletWriteRestriction(handler)).toBe('')
    expect(getPalletWriteRestriction(session)).toBe('')
  })

  it('服务、提单、航班和日期未齐的本人订单均有不合格原因', () => {
    for (const [changes, expected] of [[{ bookingStatus: '待服务' }, '尚未完成'], [{ waybillNo: '' }, '提单'], [{ flight: '' }, '航班'], [{ departureDate: '' }, '出港日期']]) {
      state.airOrders = [order(changes)]
      expect(getPalletCandidates(state, session)[0]).toMatchObject({ eligible: false, reason: expect.stringContaining(expected) })
    }
    expect(getPalletOrderRestriction(order({ parentOrderId: 'AIR-2' }))).toContain('分单不能')
    expect(getPalletOrderRestriction(order({ departureDate: '2026-02-29' }))).toContain('有效出港日期')
  })

  it('预计是唯一完整来源即可配板，不用入仓或提单缺值虚构货物', () => {
    const result = getPalletOrderCargo(state.airOrders[0], state)
    expect(result).toMatchObject({ cargo: { grossWeight: 100, pieces: 10, volume: 25 }, cargoSource: '预计', reason: '' })
    expect(result.cargoSources.waybill).toEqual({ grossWeight: null, pieces: null, volume: null })
    state.airOrders[0].volume = ''
    expect(getPalletOrderCargo(state.airOrders[0], state).reason).toContain('部分或无效')
  })

  it('多完整来源一致时可用，任何完整来源不同都不自设优先级', () => {
    state.airOrders[0].warehouse = { grossWeight: 100, pieces: 10, volume: 25 }
    expect(getPalletOrderCargo(state.airOrders[0], state).cargoSource).toBe('预计、入仓')
    state.airOrders[0].waybill = { grossWeight: 101, pieces: 10, volume: 25 }
    expect(getPalletOrderCargo(state.airOrders[0], state)).toMatchObject({ cargo: null, reason: expect.stringContaining('取值口径待确认') })
  })

  it('只选完整一组，不跨预计、仓库和提单凑三元组', () => {
    const input = order({ volume: '', warehouse: { volume: 25 }, waybill: { pieces: 10 } })
    expect(getPalletOrderCargo(input, state).cargo).toBeNull()
    input.warehouse = { grossWeight: 101, pieces: 11, volume: 26 }
    expect(getPalletOrderCargo(input, state).cargo).toBeNull()
    delete input.grossWeight
    delete input.pieces
    delete input.waybill
    expect(getPalletOrderCargo(input, state).cargo).toEqual({ grossWeight: 101, pieces: 11, volume: 26 })
    for (const invalid of [0, -1, 'bad', {}, false]) expect(getPalletOrderCargo(order({ volume: invalid }), state).cargo).toBeNull()
  })

  it('明确仓库关联才参与，客户名相同不构成关联', () => {
    state.warehouseOrders = [{ customer: '演示客户', grossWeight: 101, pieces: 11, volume: 26 }]
    expect(getPalletOrderCargo(state.airOrders[0], state).reason).toBe('')
    state.warehouseOrders[0].airOrderId = 'AIR-1'
    expect(getPalletOrderCargo(state.airOrders[0], state).reason).toContain('口径待确认')
  })

  it('任何已有来源的部分或无效数据都阻断，不忽略已知仓库体积差异', () => {
    for (const warehouse of [{ volume: 26 }, { volume: 25 }, { grossWeight: 100, pieces: 10, volume: false }, { grossWeight: 100, pieces: 10, volume: 'invalid' }]) {
      state.airOrders[0].warehouse = warehouse
      expect(getPalletOrderCargo(state.airOrders[0], state)).toMatchObject({ cargo: null, reason: expect.stringContaining('部分或无效') })
    }
    state.airOrders[0].warehouse = false
    expect(getPalletOrderCargo(state.airOrders[0], state).reason).toContain('格式不正确')
  })

  it('显式入仓体积或入仓时间不能被忽略，更不能拼入预计毛重和件数', () => {
    for (const changes of [{ warehouseVolume: 26 }, { warehouseVolume: 25 }, { warehouseVolume: '' }, { warehouseEnteredAt: '2026-09-08 12:00' }]) {
      const result = getPalletOrderCargo(order(changes), state)
      expect(result).toMatchObject({ cargo: null, reason: expect.stringContaining('入仓毛件体不完整') })
      expect(result.cargoSources.warehouse.grossWeight).toBeNull()
      expect(result.cargoSources.warehouse.pieces).toBeNull()
    }
    expect(getPalletOrderCargo(order({ warehouse: { grossWeight: 100, pieces: 10, volume: 25 }, warehouseVolume: 26 }), state).reason).toContain('体积不一致')
    expect(getPalletOrderCargo(order({ warehouse: { grossWeight: 100, pieces: 10, volume: 25 }, warehouseVolume: 25 }), state).cargoSource).toBe('预计、入仓')
  })

  it('已配主订单不再待配，分单不重复进入候选', () => {
    state.airOrders.push(order({ id: 'AIR-CHILD', parentOrderId: 'AIR-1' }))
    state.palletAllocations = [allocation()]
    expect(getPalletCandidates(state, session)).toEqual([])
  })

  it('货物尺寸仅在显式托盘货类型下展示，不凭尺寸非空推测', () => {
    state.airOrders[0] = order({ length: 10, width: 20, height: 30, specialCargo: '电池' })
    expect(getPalletCandidates(state, session)[0]).toMatchObject({ dimensions: '', dimensionReason: expect.stringContaining('待确认'), specialCargo: '电池' })
    state.airOrders[0].packagingType = '托盘货'
    expect(getPalletCandidates(state, session)[0].dimensions).toBe('10 × 20 × 30')
  })
})

describe('GJ-008 配板资格与实时结果', () => {
  it('只匹配原航班原日期，不允许重复、跨航班或跨日期配板', () => {
    expect(getPalletAllocationRestriction(state, session, ['AIR-1'], flightKey)).toBe('')
    expect(getPalletAllocationRestriction(state, session, ['AIR-1', 'AIR-1'], flightKey)).toContain('重复选择')
    expect(getPalletAllocationRestriction(state, session, ['AIR-1'], 'FLIGHT-MU9001:2026-09-11')).toContain('跨出港日期')
    expect(getPalletAllocationRestriction(state, handler, ['AIR-1'], flightKey)).toBe('')
    state.palletAllocations = [allocation()]
    expect(getPalletAllocationRestriction(state, session, ['AIR-1'], flightKey)).toContain('已经配板')
  })

  it('板容量未知不可执行配板，空产品的已订订单显示原因', () => {
    state.capacityProducts[0].details.forEach(row => { row.quantity = '' })
    expect(getPalletAllocationRestriction(state, session, ['AIR-1'], flightKey)).toContain('容量尚未确定')
    state.capacityProducts = []
    expect(getPalletCandidates(state, session)[0]).toMatchObject({ eligible: false, reason: expect.stringContaining('未维护本人绑定') })
    expect(getPalletFlightRows(state, session, range)).toEqual([])
  })

  it('航线操作跨产品绑定不同运营时不写入空负责人，单一运营路径不受影响', () => {
    state.capacityProducts.push({ ...clone(state.capacityProducts[0]), id: 'CAP-2', boardType: '合同板', operator: '赵航' })
    expect(getPalletAllocationRestriction(state, handler, ['AIR-1'], flightKey)).toContain('运营归属不唯一')
    expect(getPalletAllocationRestriction(state, session, ['AIR-1'], flightKey)).toBe('')
    state.capacityProducts[1].operator = '李明'
    expect(getPalletAllocationRestriction(state, handler, ['AIR-1'], flightKey)).toBe('')
  })

  it('已配量只来自分配记录，总量与主订单实际量各自独立', () => {
    state.palletAllocations = [allocation({ cargo: { grossWeight: 50, pieces: 5, volume: 12.5 } }), allocation({ id: 'PAL-2', cargo: { grossWeight: 50, pieces: 5, volume: 12.5 }, parentAllocationId: 'PAL-00000001' })]
    expect(getPalletFlightRows(state, session, range)[0]).toMatchObject({ allocatedVolume: 25, allocatedGrossWeight: 100, allocatedPieces: 10 })
    expect(getPalletAllocatedRows(state, session, flightKey)).toMatchObject([{ hasSplit: true, isSplit: false }, { isSplit: true }])
    expect(state.airOrders[0].volume).toBe(25)
    expect(getPalletAllocatedRows(state, { name: '赵航', role: 'operator' }, flightKey)).toEqual([])
  })

  it('容量超过是分批必要条件，无倍率阈值且需操作员明确确认', () => {
    state.palletAllocations = [allocation()]
    expect(getPalletSplitRestriction(state, session, 'PAL-00000001')).toBe('')
    expect(validatePalletSplit(state.palletAllocations[0], { grossWeight: 50, pieces: 5, volume: 10, flight: 'MU9001', date: '2026-09-10' })).toHaveProperty('confirmedInsufficient')
    state.palletAllocations[0].cargo.volume = 20
    expect(getPalletSplitRestriction(state, session, 'PAL-00000001')).toContain('未超过')
    state.palletAllocations[0].cargo.volume = 20.01
    expect(getPalletSplitRestriction(state, session, 'PAL-00000001')).toBe('')
  })

  it('分批三元组均大于零小于原量、件数整数且不可更换目标', () => {
    const parent = allocation(), payload = { grossWeight: 50, pieces: 5, volume: 10, flight: 'MU9001', date: '2026-09-10', confirmedInsufficient: true }
    expect(validatePalletSplit(parent, payload)).toEqual({})
    expect(validatePalletSplit(parent, { ...payload, pieces: 1.5 })).toHaveProperty('pieces')
    expect(validatePalletSplit(parent, { ...payload, grossWeight: 100 })).toHaveProperty('grossWeight')
    expect(validatePalletSplit(parent, { ...payload, volume: 0 })).toHaveProperty('volume')
    expect(validatePalletSplit(parent, { ...payload, date: '2026-09-11' }).flight).toContain('待确认')
  })

  it('分批后父子均不可再拆、单独卸下或重配；只能子记录撤回', () => {
    state.palletAllocations = [allocation(), allocation({ id: 'PAL-2', parentAllocationId: 'PAL-00000001' })]
    expect(getPalletSplitRestriction(state, session, 'PAL-00000001')).toContain('单次分批')
    expect(getPalletSplitRestriction(state, session, 'PAL-2')).toContain('单次分批')
    for (const id of ['PAL-00000001', 'PAL-2']) expect(getPalletUnloadRestriction(state, session, [id])).toContain('须先撤回')
    expect(getPalletWithdrawRestriction(state, session, 'PAL-00000001')).toContain('分批生成')
    expect(getPalletWithdrawRestriction(state, session, 'PAL-2')).toBe('')
    expect(canEditAirAllocationNote(state.palletAllocations[0], handler)).toBe(false)
  })
})

describe('GJ-008 预计利润明确与待确认分支', () => {
  it('CA不计算；CZ/MH缺合同罚金；其他航司不自选规则', () => {
    expect(getPalletProfit(state, { airlineCode: 'CA' }, []).reason).toBe('CA 不计算预计利润')
    for (const code of ['CZ', 'MH']) expect(getPalletProfit(state, { airlineCode: code }, []).reason).toContain('合同罚金')
    expect(getPalletProfit(state, { airlineCode: 'MU' }, []).reason).toContain('规则待确认')
  })

  it('TK只有真实提单计算字段齐全且币种一致才输出金额', () => {
    const flight = { airlineCode: 'TK' }, allocated = [allocation()]
    expect(getPalletProfit(state, flight, allocated).value).toBeNull()
    state.airOrders[0] = order({ sellRate: 10, foamRatio: 0.5, waybill: { grossWeight: 100, pieces: 10, volume: 1, volumeWeight: 167, chargeWeight: 167 }, booking: { airCost: 5 } })
    expect(getPalletProfit(state, flight, allocated).reason).toContain('币种')
    state.airOrders[0].currency = 'CNY'
    state.airOrders[0].booking.currency = 'CNY'
    expect(getPalletProfit(state, flight, allocated)).toEqual({ value: 500, currency: 'CNY', reason: '' })
    state.airOrders[0].booking.currency = 'USD'
    expect(getPalletProfit(state, flight, allocated).value).toBeNull()
  })

  it('同航班分批不重复计算原订单运费和成本', () => {
    state.airOrders[0] = order({ currency: 'CNY', sellRate: 10, foamRatio: 0.5, waybill: { grossWeight: 100, volume: 1, volumeWeight: 167, chargeWeight: 167 }, booking: { airCost: 5, currency: 'CNY' } })
    const allocated = [allocation(), allocation({ id: 'PAL-2', parentAllocationId: 'PAL-00000001' })]
    expect(getPalletProfit(state, { airlineCode: 'TK' }, allocated).value).toBe(500)
    expect(JSON.stringify(state)).toBe(JSON.stringify(clone(state)))
  })
})
