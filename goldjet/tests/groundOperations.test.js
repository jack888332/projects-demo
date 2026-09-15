import { beforeEach, describe, expect, it } from 'vitest'
import {
  GROUND_DATE, GROUND_VEHICLES, GROUND_SUPPLIERS, createDispatchDraft,
  getGroundQuotes, validateBatchGroundOrders, validateDispatchDraft,
  calculateGroundAllocation, deriveGroundOrderStatus,
} from '../src/domain/groundOperations.js'
import { usePrototypeData } from '../src/data/usePrototypeData.js'

const data = usePrototypeData()
const copy = value => JSON.parse(JSON.stringify(value))
const firstId = 'CAR-260908-021'
const secondId = 'CAR-260908-022'
const specialId = 'CAR-260908-024'
const order = id => data.state.groundOrders.find(item => item.id === id)
const validDispatch = (overrides = {}) => ({ ...createDispatchDraft(), vehicleType: '3T/4.2', supplier: '安航车队', plate: '沪A·DEMO1', ...overrides })

beforeEach(() => { data.reset(); data.selectWorkbenchPersona('hangsheng') })

describe('调度字段与报价：第015篇 1.3.12、1.3.13', () => {
  it('使用完整车型枚举，至少一行可留空的司机，完整更多及特定毛件体字段', () => {
    expect(GROUND_DATE).toBe('2026-09-08')
    expect(GROUND_VEHICLES).toHaveLength(9)
    expect(createDispatchDraft()).toMatchObject({ vehicleType: '', supplier: '', plate: '', cost: null, drivers: [{ name: '', phone: '', identity: '' }], specificPieces: null, specificVolume: null, specificWeight: null, specificLength: null, specificWidth: null, specificHeight: null })
    expect(validateDispatchDraft(validDispatch())).toEqual({})
    expect(validateDispatchDraft(validDispatch({ drivers: [] }))).toHaveProperty('drivers')
    expect(validateDispatchDraft(validDispatch({ drivers: [{ name: '' }, { name: '' }, { name: '' }] }))).toHaveProperty('drivers')
  })

  it('车型、供应商、车牌必填，司机姓名选填但填写需满足字典', () => {
    expect(validateDispatchDraft(createDispatchDraft())).toMatchObject({ vehicleType: expect.any(String), supplier: expect.any(String), plate: expect.any(String) })
    expect(validateDispatchDraft(validDispatch({ drivers: [{ name: '甲', phone: '', identity: 'bad' }] }))).toMatchObject({ 'drivers.0.name': expect.any(String), 'drivers.0.identity': expect.any(String) })
    expect(validateDispatchDraft(validDispatch({ drivers: [{ name: '司机甲', identity: '000000000000000001' }, { name: '司机乙', identity: '' }] }))).toEqual({})
  })

  it('校验特定件数、尺寸、毛体精度与更多字段，不把可选成本伪成0', () => {
    const invalid = validateDispatchDraft(validDispatch({ specificPieces: 0, specificLength: 1.5, specificWeight: 12.345, specificVolume: -2, customsNo: 'x', companyAddress: 'x', remark: 'x'.repeat(801) }))
    expect(Object.keys(invalid)).toEqual(expect.arrayContaining(['specificPieces', 'specificLength', 'specificWeight', 'specificVolume', 'customsNo', 'companyAddress', 'remark']))
    expect(validateDispatchDraft(validDispatch({ specificPieces: 2, specificWeight: 12.34, specificVolume: 0.01, cost: null }))).toEqual({})
  })

  it('路线省市、车型、特殊要求全部匹配才返回报价，按成本升序排列', () => {
    const quotes = getGroundQuotes(order(firstId), '3T/4.2')
    expect(quotes.map(item => item.cost)).toEqual([960, 980, 1020])
    expect(quotes[0].name).toBe('安航车队')
    expect(getGroundQuotes(order(firstId), '12米平板')).toEqual([])
    expect(getGroundQuotes({ ...order(firstId), regulated: '是' }, '3T/4.2')).toEqual([])
    expect(getGroundQuotes({ ...order(firstId), tailLift: '' }, '3T/4.2')).toEqual([])
    expect(getGroundQuotes({ ...order(firstId), deliveryPoints: [{ province: '浙江省', city: '杭州市' }] }, '3T/4.2')).toEqual([])
    expect(getGroundQuotes(order(secondId), '3T/4.2')).toHaveLength(3)
    expect(getGroundQuotes(order(specialId), '3T/4.2')[0].cost).toBe(1480)
  })

  it('跨多个省市的多点订单不随意选第一个地点套价', () => {
    const multiCityOrder = { ...order(firstId), pickupPoints: [...order(firstId).pickupPoints, { province: '江苏省', city: '苏州市' }] }
    expect(getGroundQuotes(multiCityOrder, '3T/4.2')).toEqual([])
  })
})

describe('批量调度与运单生成：第015篇 1.3.15、1.3.18', () => {
  it('有同省市提货点和卸货点的待调度订单可合批；非待调度或不同省市拒绝', () => {
    expect(validateBatchGroundOrders([order(firstId), order(secondId)])).toMatchObject({ ok: true, specialConfirmationRequired: false })
    expect(validateBatchGroundOrders([]).ok).toBe(false)
    expect(validateBatchGroundOrders([order('CAR-260908-023')])).toMatchObject({ ok: false, code: 'INVALID_STATUS' })
    expect(validateBatchGroundOrders([order(firstId), { ...order(secondId), deliveryPoints: [{ province: '浙江省', city: '杭州市' }] }])).toMatchObject({ ok: false, code: 'DIFFERENT_CITIES' })
  })

  it('特殊车型不同需要确认；确认前不修改数据', () => {
    const before = JSON.stringify(data.state.groundOrders)
    const result = validateBatchGroundOrders([order(firstId), order(specialId)])
    expect(result).toMatchObject({ ok: true, specialConfirmationRequired: true })
    expect(() => data.dispatchGroundOrders([firstId, specialId], [validDispatch()])).toThrow('不同的特殊车型需求')
    expect(JSON.stringify(data.state.groundOrders)).toBe(before)
    const generated = data.dispatchGroundOrders([firstId, specialId], [validDispatch()], { specialConfirmed: true })
    expect(generated).toHaveLength(2)
    expect(generated.map(item => item.cost)).toEqual([960, 1520])
  })

  it('两个订单两辆车产生四张唯一运单，所有订单共享同一运单owner', () => {
    const generated = data.dispatchGroundOrders([firstId, secondId], [validDispatch(), validDispatch({ plate: '沪B·DEMO2' })])
    expect(generated).toHaveLength(4)
    expect(generated.map(item => item.waybillNo)).toEqual(['D20126090800002', 'D20126090800003', 'D20126090800004', 'D20126090800005'])
    expect(data.state.groundWaybills).toHaveLength(5)
    expect(generated.filter(item => item.orderId === firstId)).toHaveLength(2)
    expect(generated.filter(item => item.orderId === secondId)).toHaveLength(2)
    expect(order(firstId).dispatchStatus).toBe('已调度')
    expect(order(secondId).dispatchStatus).toBe('已调度')
    expect(generated[0]).toMatchObject({ customer: '启航跨境贸易', status: '待提货', expectedPieces: 155, expectedWeight: 3100, expectedVolume: 12, expectedLength: null, cost: 960, settlementStatus: '未覆盖：自动费用尚未实现' })
    expect(generated[0].trajectory[0]).toMatchObject({ event: '调度完成', actor: '陈楠', role: '航晟客服', time: '2026-09-08 14:30' })
  })

  it('逐字段取特定毛件体值，否则按该订单总车辆数均分，尺寸不从订单沿用', () => {
    const allocation = calculateGroundAllocation({ pieces: 11, weight: 101, volume: 5, length: 100 }, validDispatch({ specificWeight: 22.22, specificLength: 80, specificWidth: 60, specificHeight: 40 }), 3)
    expect(allocation).toEqual({ expectedPieces: 4, expectedWeight: 22.22, expectedVolume: 1.67, expectedLength: 80, expectedWidth: 60, expectedHeight: 40 })
    expect(calculateGroundAllocation({ pieces: null, weight: null, volume: null }, validDispatch(), 2)).toMatchObject({ expectedPieces: null, expectedWeight: null, expectedVolume: null })
  })

  it('未匹配报价允许已知供应商，但成本为null且标待确认，不信任传入成本', () => {
    const generated = data.dispatchGroundOrders([firstId], [validDispatch({ vehicleType: '12米平板', cost: 999 })])
    expect(generated[0]).toMatchObject({ supplier: '安航车队', cost: null, costStatus: '待确认：未匹配报价' })
    expect(data.state.costs).toHaveLength(4)
  })

  it('验证失败不部分调度、不占编号、不更新热词', () => {
    const before = JSON.stringify([data.state.groundOrders, data.state.groundWaybills, data.state.groundPlateHistory, data.state.groundSequence])
    expect(() => data.dispatchGroundOrders([firstId, secondId], [validDispatch(), validDispatch({ plate: '' })])).toThrow('第 2 辆车')
    expect(JSON.stringify([data.state.groundOrders, data.state.groundWaybills, data.state.groundPlateHistory, data.state.groundSequence])).toBe(before)
    expect(() => data.dispatchGroundOrders([firstId, firstId], [validDispatch()])).toThrow('不重复')
    expect(() => data.dispatchGroundOrders([firstId, 'missing'], [validDispatch()])).toThrow('只有待调度')
    expect(data.dispatchGroundOrders([firstId], [validDispatch()])[0].waybillNo).toBe('D20126090800002')
  })

  it('同车牌只保留最近成组司机与更多信息，不跨订单复用特定毛件体', () => {
    data.dispatchGroundOrders([firstId], [validDispatch({ drivers: [{ name: '更新司机', phone: '000-00001111', identity: '' }], customsNo: 'NEW-HG', specificPieces: 15 })])
    const records = data.state.groundPlateHistory.filter(item => item.plate === '沪A·DEMO1')
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ customsNo: 'NEW-HG', specificPieces: null })
    expect(records[0].drivers[0].name).toBe('更新司机')
    data.reset()
    expect(data.state.groundPlateHistory[0].drivers[0].name).toBe('演示司机甲')
    expect(data.state.groundWaybills).toHaveLength(1)
  })
})

describe('运单状态与轨迹：第016篇 1.3.5、1.3.7', () => {
  it('客服可不按顺序调整节点，准确保留操作时间、备注与操作者', () => {
    const [waybill] = data.dispatchGroundOrders([firstId], [validDispatch({ remark: '两处装货请核对' })])
    data.updateGroundWaybillStatus(waybill.id, { status: '到达卸货点', time: '2026-09-09 10:20', remark: '人工补录节点' })
    const saved = data.state.groundWaybills.find(item => item.id === waybill.id)
    expect(saved.status).toBe('到达卸货点')
    expect(saved.trajectory.at(-1)).toMatchObject({ status: '到达卸货点', time: '2026-09-09 10:20', remark: '人工补录节点', actor: '陈楠' })
    data.updateGroundWaybillStatus(waybill.id, { status: '提货中', time: '2026-09-08 16:20', remark: '补充早前操作' })
    expect(saved.trajectory.at(-1).event).toBe('前往提货')
    expect(saved.expectedArrival).toBe('')
  })

  it('所有关联运单均为终态才完成订单，终态不允许再改', () => {
    const generated = data.dispatchGroundOrders([firstId], [validDispatch(), validDispatch({ plate: '沪B·DEMO2' })])
    data.updateGroundWaybillStatus(generated[0].id, { status: '已卸货', time: '2026-09-08 18:30', remark: '完成' })
    expect(order(firstId).dispatchStatus).toBe('已调度')
    data.updateGroundWaybillStatus(generated[1].id, { status: '已卸货', time: '2026-09-08 19:30', remark: '完成' })
    expect(order(firstId).dispatchStatus).toBe('已完成')
    expect(() => data.updateGroundWaybillStatus(generated[0].id, { status: '待提货', time: '2026-09-08 19:40' })).toThrow('不能再修改')
    expect(deriveGroundOrderStatus([{ status: '已取消' }, { status: '已卸货' }])).toBe('已完成')
    expect(deriveGroundOrderStatus([{ status: '待提货', exceptionStatus: '异常中' }])).toBe('异常中')
  })

  it('禁止通过状态管理直接取消与伪造异常，非法日期不产生轨迹', () => {
    const [waybill] = data.dispatchGroundOrders([firstId], [validDispatch()])
    const saved = data.state.groundWaybills.find(item => item.id === waybill.id)
    const before = copy(saved)
    expect(() => data.updateGroundWaybillStatus(waybill.id, { status: '已取消', time: '2026-09-08 18:30' })).toThrow('返空费')
    expect(() => data.updateGroundWaybillStatus(waybill.id, { status: '异常中', time: '2026-09-08 18:30' })).toThrow('异常上报不在本次范围')
    expect(() => data.updateGroundWaybillStatus(waybill.id, { status: '已提货', time: '2026-02-30 18:30' })).toThrow('有效的操作时间')
    expect(copy(saved)).toEqual(before)
  })

  it('写入口限制航晟客服，重置恢复角色和全部运单状态', () => {
    data.groundSession.role = 'service'
    expect(() => data.dispatchGroundOrders([firstId], [validDispatch()])).toThrow('仅航晟客服')
    expect(() => data.updateGroundWaybillStatus(data.state.groundWaybills[0].id, { status: '已卸货', time: '2026-09-08 18:30' })).toThrow('仅航晟客服')
    data.reset()
    expect(data.groundSession.role).toBe('viewer')
    expect(data.state.groundWaybills[0].status).toBe('待提货')
    expect(GROUND_SUPPLIERS.map(item => item.name)).toEqual(['申捷车队', '远通运输', '安航车队'])
  })
})
