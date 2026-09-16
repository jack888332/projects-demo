import { describe, expect, it } from 'vitest'
import { createAirMasterSeed } from '../src/domain/airMasterData.js'
import {
  createAirWaybillDraft, createAirWaybillContact, getAirWaybillTotals,
  validateAirWaybillDraft, getDescriptionCodeConfig, getAirWaybillRows, getAirWaybillSendRestriction, getAirWaybillCutoffAt,
} from '../src/domain/airWaybills.js'

const master = createAirMasterSeed()
const order = () => ({ id: 'AIR-1', waybillNo: '784-12345678', orderStatus: '待出提单', origin: 'PVG', destination: 'LAX', pieces: 20, grossWeight: 100, volume: 1,
  booking: { airline: '东方航空', flight: 'MU9001', firstDestination: 'CAN', firstLeg: 'PVG - CAN', discountNo: 'DEMO' },
  supplement: { shipper: 'DEMO SHIPPER', consignee: 'DEMO CONSIGNEE', englishGoodsName: 'DEMO GOODS', iataCode: 'DEMO-IATA', issueDate: '2026-09-10' },
})

describe('第011篇提单来源与计算', () => {
  it('主分单均不把预报毛件体当实测；已提供的独立提单数据优先', () => {
    const parent = order(), child = { id: 'CHILD-1', housebillNo: 'DEMO-HOUSE', pieces: 2, grossWeight: 8, volume: 0.2, shipper: 'HOUSE SHIPPER' }
    const main = createAirWaybillDraft(parent, null, master), house = createAirWaybillDraft(parent, child, master)
    expect(main).toMatchObject({ pieces: undefined, grossWeight: undefined, volume: undefined, shipper: { printText: 'DEMO SHIPPER' }, firstDestination: '', iataCode: 'DEMO-IATA' })
    expect(house).toMatchObject({ pieces: undefined, grossWeight: undefined, volume: undefined, shipper: { printText: 'HOUSE SHIPPER' }, weightCode: 'Q', waybillSuffix: '' })
    child.waybill = { pieces: 3, grossWeight: 10, volume: 0.1 }
    expect(createAirWaybillDraft(parent, child, master)).toMatchObject(child.waybill)
    expect(main.dimensions).toHaveLength(10)
    expect(main.charges).toEqual([])
  })
  it('联系人保存同一结构，打印文字不强拆成姓名或地址', () => {
    expect(createAirWaybillContact('SHIPPER\nADDRESS')).toMatchObject({ name: '', address: '', postcode: '', printText: 'SHIPPER\nADDRESS' })
    expect(createAirWaybillContact({ name: 'DEMO', printText: 'PRINT', postcode: '000000' })).toMatchObject({ name: 'DEMO', printText: 'PRINT', postcode: '000000' })
  })
  it('仅始发地必填；空白货量不阻断暂存和提交，但已填无效数据必须纠正', () => {
    const draft = createAirWaybillDraft(order(), null, master)
    expect(validateAirWaybillDraft(draft, master)).toEqual({})
    expect(validateAirWaybillDraft({ ...draft, origin: '' }, master)).toHaveProperty('origin')
    expect(validateAirWaybillDraft({ ...draft, pieces: 1.5, grossWeight: -1, rate: false }, master)).toMatchObject({ pieces: '件数须为整数', grossWeight: '请输入有效的非负数', rate: '请输入有效的非负数' })
  })
  it('提单计费重向上调整为0.5倍数，手工运价计算总运费，未知总价不拼接', () => {
    expect(getAirWaybillTotals({ grossWeight: 214.3, volume: 1, rate: 2 })).toMatchObject({ chargeWeight: 214.5, freightTotal: 429, total: null })
    expect(getAirWaybillTotals({ grossWeight: 214.6, volume: 1 })).toMatchObject({ chargeWeight: 215, freightTotal: null })
    expect(getAirWaybillTotals({ grossWeight: null, volume: 1, rate: 5 })).toMatchObject({ chargeWeight: null, freightTotal: null })
  })
  it('尺寸汇总先累加体积再四舍五入，部分行阻断；不直接替换主表件体', () => {
    const draft = createAirWaybillDraft(order(), null, master)
    draft.dimensions = [{ length: 11, width: 20, height: 20, pieces: 1 }, { length: 11, width: 20, height: 20, pieces: 1 }]
    expect(getAirWaybillTotals(draft)).toMatchObject({ dimensionPieces: 2, dimensionVolume: 0.01 })
    expect(draft.volume).toBeUndefined()
    draft.dimensions[1].height = undefined
    expect(validateAirWaybillDraft(draft, master)).toHaveProperty('dimensions.1.height')
    expect(getAirWaybillTotals(draft).dimensionVolume).toBeNull()
  })
  it('杂费候选六项按单价乘数量汇总，缺数量不误算为0', () => {
    const charges = [{ code: 'AWC', unitPrice: 10, quantity: 2 }, { code: 'MYC', unitPrice: 2, quantity: 100 }]
    expect(getAirWaybillTotals({ charges })).toMatchObject({ chargesTotal: 220, chargeRows: [{ subtotal: 20 }, { subtotal: 200 }], total: null })
    expect(getAirWaybillTotals({ charges: [{ code: 'AWC', unitPrice: 1, quantity: null }] }).chargesTotal).toBeNull()
    expect(getAirWaybillTotals({ charges: [{ code: 'AWC', unitPrice: 0.1, quantity: 3 }] }).chargesTotal).toBe(0.3)
  })
  it('列表汇总只读提单实测，混合发送状态不臆造总状态', () => {
    const parent = { ...order(), waybill: { pieces: 3, grossWeight: 11, volume: 0.6 } }
    const children = [{ id: 'C1', parentId: parent.id, waybill: { pieces: 1, grossWeight: 4, volume: 0.2 }, waybillTransmission: { status: '成功' } }, { id: 'C2', parentId: parent.id, waybill: { pieces: 2, grossWeight: 7, volume: 0.4 } }]
    const rows = getAirWaybillRows({ airOrders: [parent], airChildren: children })
    expect(rows[0]).toMatchObject({ mainCargo: parent.waybill, childCargo: { pieces: 3, grossWeight: 11 }, childCount: 2, childSendStatus: null, childSendReason: '混合状态的聚合规则待确认' })
  })
  it('完整截单日期复用航班非正天数；跨月正确，基础数据缺失不猜当天', () => {
    const parent = order(), catalog = createAirMasterSeed()
    Object.assign(parent.booking, { departureDate: '2026-10-01', cutoffTime: '15:30' })
    catalog.flights.find(row => row.code === 'MU9001').cutoffDays = -1
    expect(getAirWaybillCutoffAt(parent, catalog)).toBe('2026-09-30 15:30')
    expect(getAirWaybillRows({ airOrders: [parent], airMaster: catalog })[0].cutoffAt).toBe('2026-09-30 15:30')
    catalog.flights.find(row => row.code === 'MU9001').cutoffDays = null
    expect(getAirWaybillCutoffAt(parent, catalog)).toBe('')
  })
})

describe('第011篇发送条件与代码', () => {
  it.each(['784', '043', '131', '235'])('%s默认EAP且必选', prefix => {
    expect(getDescriptionCodeConfig(prefix + '-12345678')).toEqual({ visible: true, required: true, options: ['EAP', 'EAW'], defaultValue: 'EAP' })
  })
  it('999允许中性提单枚举，其余航司发送代码必须为空', () => {
    expect(getDescriptionCodeConfig('999-12345678').options).toContain('中性提单999')
    expect(getDescriptionCodeConfig('781-12345678')).toEqual({ visible: false, required: false, options: [], defaultValue: '' })
  })
  it('2分钟内拒绝不覆盖成功，恰好2分钟待确认，超过可重新发送', () => {
    const parent = { ...order(), waybill: { pieces: 1, grossWeight: 10, volume: 0.1 }, waybillTransmission: { status: '成功', succeededAtMs: 1000 } }
    const state = { airMaster: master, airOrders: [parent], airChildren: [] }, selection = [{ orderId: parent.id }]
    const before = JSON.stringify(state)
    expect(getAirWaybillSendRestriction(state, selection, {}, 120999)).toContain('2 分钟内')
    expect(getAirWaybillSendRestriction(state, selection, {}, 121000)).toContain('恰好')
    expect(getAirWaybillSendRestriction(state, selection, {}, 121001)).toBe('')
    expect(JSON.stringify(state)).toBe(before)
  })
})
