import { beforeEach, describe, expect, it } from 'vitest'
import { createAirBookingActions } from '../src/data/airBookingActions.js'
import { createBookingDraft, getBookingApproval, getBookingDecision, validateBookingDraft } from '../src/domain/airOperations.js'
import { createAirMasterSeed, deriveAirCatalog } from '../src/domain/airMasterData.js'

const copy = value => JSON.parse(JSON.stringify(value))
let state, session, actions
const validDraft = overrides => ({ ...createBookingDraft(), airline: '东方航空', flight: 'MU9001', departureDate: '2026-09-10',
  firstDestination: 'CAN', firstLeg: 'PVG - CAN', takeoffTime: '20:00', cutoffTime: '16:00',
  airCost: 24, guidePrice: 28, waybillType: '自营', secondDestination: 'NRT', secondLeg: 'CAN - NRT',
  thirdLeg: 'NRT - LAX', routeType: '国内中转', ...overrides })
const orderOf = () => state.airOrders[0]
function lossRequest(weight) {
  Object.assign(orderOf(), { sellRate: 0.3, chargeWeight: weight })
  return actions.saveAirBooking('AIR-001', validDraft({ airCost: 50, allowLoss: true }), { confirmedApproval: true, approvalReason: '合同板避免惩罚金' })
}
beforeEach(() => {
  state = { airMaster: createAirMasterSeed(), messages: [], palletAllocations: [], airOrders: [{
    id: 'AIR-001', orderNo: 'GJ-AIR-001', creator: '周倩', orderStatus: '待订舱', bookingStatus: '待服务',
    sellRate: 28, grossWeight: 186.5, volume: 1.28, chargeWeight: 213.5, booking: createBookingDraft(),
    assignees: { operator: '李明', handler: '王晴', director: '航线总监' },
    services: [{ id: 'AIR-001-BOOKING', type: 'booking', status: '待服务' }],
  }] }
  session = { role: 'operator', name: '李明' }
  actions = createAirBookingActions(state, () => session, () => deriveAirCatalog(state.airMaster))
})

describe('第010篇亏损输入与分级边界', () => {
  it.each([null, undefined, '', '  ', true, false, [], {}])('缺失或非数字卖价 %j 不能被强转成零', value => {
    expect(getBookingDecision({ sellRate: value, chargeWeight: 100 }, { airCost: 50, allowLoss: true }).kind).toBe('unconfirmed')
  })
  it('缺失成本、缺失重量与部分毛件体不计算盈利；明确零卖价可计算', () => {
    for (const airCost of [null, '', false]) expect(getBookingDecision({ sellRate: 28, chargeWeight: 100 }, { airCost }).kind).toBe('unconfirmed')
    expect(getBookingDecision({ sellRate: 28, grossWeight: null, volume: 2 }, { airCost: 25 }).kind).toBe('unconfirmed')
    expect(getBookingDecision({ sellRate: 28, grossWeight: 100, volume: 1 }, { airCost: 25 }).kind).toBe('ready')
    expect(getBookingDecision({ sellRate: 0, chargeWeight: 100 }, { airCost: 1, allowLoss: true }).kind).toBe('approval')
    expect(validateBookingDraft(validDraft({ allowLoss: 'false' }))).toHaveProperty('allowLoss')
  })
  it.each([
    [100, ['director']], [100.01, ['director', 'deputyGeneral']], [200, ['director', 'deputyGeneral']],
    [200.01, ['director', 'deputyGeneral', 'divisionGeneral']], [600, ['director', 'deputyGeneral', 'divisionGeneral']],
  ])('亏损额按包含边界的层级累计审批：重量 %s', (weight, roles) => {
    const result = getBookingDecision({ sellRate: 0.3, chargeWeight: weight }, { airCost: 50, allowLoss: true })
    expect(result.kind).toBe('approval')
    expect(result.stages.map(stage => stage.role)).toEqual(roles)
  })
  it('超过30000保持待确认，确认参数也不能绕过，失败不写入', () => {
    Object.assign(orderOf(), { sellRate: 0.3, chargeWeight: 600.01 })
    const before = copy(state)
    expect(() => actions.saveAirBooking('AIR-001', validDraft({ airCost: 50, allowLoss: true }), { confirmedApproval: true })).toThrow('超过 30,000')
    expect(state).toEqual(before)
  })
  it('空数字草稿保持未填，供数字控件使用', () => {
    expect(createBookingDraft({ booking: { airCost: null, guidePrice: '', truckCost: null } })).toMatchObject({ airCost: undefined, guidePrice: undefined, truckCost: undefined })
  })
})

describe('第010篇订舱单所有者与消息', () => {
  it('确认后通知对应操作员，完成后同一服务和主单前进并通知客服', () => {
    actions.saveAirBooking('AIR-001', validDraft())
    expect(orderOf()).toMatchObject({ orderStatus: '待订舱', bookingStatus: '服务中' })
    expect(state.messages.at(-1)).toMatchObject({ type: '航程待补充', recipient: '王晴' })
    session = { role: 'handler', name: '王晴' }
    actions.saveAirBooking('AIR-001', createBookingDraft(orderOf()))
    expect(orderOf()).toMatchObject({ orderStatus: '待补录', bookingStatus: '服务已完成' })
    expect(orderOf().services[0].status).toBe('服务已完成')
    expect(state.messages.at(-1)).toMatchObject({ type: '订单待补录', recipient: '周倩' })
  })
  it('航晟客服的真实会话可以直接完成订舱', () => {
    session = { role: 'hangsheng', name: '陈楠' }
    actions.saveAirBooking('AIR-001', validDraft())
    expect(orderOf()).toMatchObject({ orderStatus: '待补录', bookingStatus: '服务已完成' })
    expect(state.messages).toHaveLength(0)
  })
  it('待出提单的改航班只回退服务；再次完成不退回待补录', () => {
    Object.assign(orderOf(), { booking: validDraft(), orderStatus: '待出提单', bookingStatus: '服务已完成', bookingCompletedAt: '2026-09-08 11:00' })
    actions.saveAirBooking('AIR-001', validDraft({ departureDate: '2026-09-11' }))
    expect(orderOf()).toMatchObject({ orderStatus: '待出提单', bookingStatus: '服务中', bookingCompletedAt: '' })
    expect(state.messages.at(-1)).toMatchObject({ type: '订舱信息变更', recipient: '周倩' })
    expect(state.messages.at(-1).content).toContain('2026-09-10 → 2026-09-11')
    expect(state.messages.at(-1).content).toContain('MU演示货站')
    session = { role: 'handler', name: '王晴' }
    actions.saveAirBooking('AIR-001', createBookingDraft(orderOf()))
    expect(orderOf()).toMatchObject({ orderStatus: '待出提单', bookingStatus: '服务已完成' })
    expect(state.messages.filter(row => row.type === '订单待补录')).toHaveLength(0)
  })
  it('非航班备注与非亏损成本保存不回退服务；重复保存不发重复消息', () => {
    Object.assign(orderOf(), { booking: validDraft(), orderStatus: '待补录', bookingStatus: '服务已完成', bookingCompletedAt: '2026-09-08 11:00' })
    actions.saveAirBooking('AIR-001', validDraft({ remark: '装箱备注', airCost: 25 }))
    expect(orderOf()).toMatchObject({ bookingStatus: '服务已完成', bookingCompletedAt: '2026-09-08 11:00' })
    expect(state.messages).toHaveLength(0)
    const before = copy(state)
    actions.saveAirBooking('AIR-001', createBookingDraft(orderOf()))
    expect(state).toEqual(before)
  })
  it('单改成本不触发未定义通知，成本随明确航程变更一并展示', () => {
    Object.assign(orderOf(), { booking: validDraft(), orderStatus: '待补录', bookingStatus: '服务已完成' })
    actions.saveAirBooking('AIR-001', validDraft({ departureDate: '2026-09-11', airCost: 25 }))
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].content).toContain('空运成本：24 → 25')
    expect(state.messages[0].content).toContain('出港日期：2026-09-10 → 2026-09-11')
    session = { role: 'handler', name: '王晴' }
    actions.saveAirBooking('AIR-001', createBookingDraft(orderOf()))
    expect(orderOf().orderStatus).toBe('待补录')
    expect(state.messages.filter(row => row.type === '订单待补录')).toHaveLength(0)
  })
  it('角色越权和配板保护在写入及发消息前拒绝', () => {
    Object.assign(orderOf(), { booking: validDraft(), orderStatus: '待补录', bookingStatus: '服务已完成' })
    state.palletAllocations.push({ id: 'PALLET-1', orderId: 'AIR-001' })
    const before = copy(state)
    expect(() => actions.saveAirBooking('AIR-001', validDraft({ departureDate: '2026-09-11' }))).toThrow('已有配板')
    expect(state).toEqual(before)
    session = { role: 'handler', name: '王晴' }
    expect(() => actions.saveAirBooking('AIR-001', validDraft({ airCost: 25 }))).toThrow('不允许修改 airCost')
    expect(state).toEqual(before)
  })
})

describe('第002/030篇亏损审批衔接', () => {
  it('确认前保持原单，首级申请消息带订单、提单及理由', () => {
    const before = copy(state)
    expect(() => actions.saveAirBooking('AIR-001', validDraft({ airCost: 30, allowLoss: true }))).toThrow('需航线总监审核')
    expect(state).toEqual(before)
    lossRequest(100)
    expect(orderOf()).toMatchObject({ orderStatus: '待审核', bookingStatus: '待审核' })
    expect(getBookingApproval(orderOf())).toMatchObject({ currentRole: 'director', currentLabel: '航线总监' })
    expect(state.messages.at(-1)).toMatchObject({ type: '亏损审批申请', recipient: '航线总监' })
    expect(state.messages.at(-1).content).toContain('合同板避免惩罚金')
    expect(state.messages.at(-1).content).toContain(orderOf().waybillNo)
  })
  it('逐级前进，未轮到的角色拒绝；仅最终通过令主单待补录，不虚构服务结果', () => {
    lossRequest(300)
    session = { role: 'divisionGeneral', name: '事业部总经理' }
    const before = copy(state)
    expect(() => actions.approveAirBooking('AIR-001')).toThrow('仅航线总监')
    expect(state).toEqual(before)
    for (const [role, nextRole] of [['director', 'deputyGeneral'], ['deputyGeneral', 'divisionGeneral'], ['divisionGeneral', '']]) {
      session = { role, name: role }
      actions.approveAirBooking('AIR-001')
      expect(getBookingApproval(orderOf()).currentRole).toBe(nextRole)
      expect(orderOf().bookingStatus).toBe('待审核')
      expect(orderOf().orderStatus).toBe(nextRole ? '待审核' : '待补录')
    }
    expect(getBookingApproval(orderOf()).stages.every(stage => stage.status === '审核通过')).toBe(true)
    expect(orderOf().approval.serviceStatePending).toBe(true)
    expect(state.messages.filter(row => row.type === '亏损审批结果').every(row => row.recipient === '李明')).toBe(true)
    expect(state.messages.filter(row => row.type === '亏损审批申请').map(row => row.recipient)).toEqual(['航线总监', '事业部副总经理', '事业部总经理'])
    expect(() => actions.approveAirBooking('AIR-001')).toThrow()
  })
  it('兼容原有单级seed审批，不持久化派生的当前级别', () => {
    Object.assign(orderOf(), { orderStatus: '待审核', bookingStatus: '待审核', approval: { status: '待审核', lossAmount: 200, createdAt: '2026-09-08 10:00' } })
    session = { role: 'director', name: '航线总监' }
    actions.approveAirBooking('AIR-001')
    expect(orderOf().orderStatus).toBe('待补录')
    expect(orderOf().approval).not.toHaveProperty('currentRole')
    expect(getBookingApproval(orderOf()).currentRole).toBe('')
  })
})
