import { describe, expect, it } from 'vitest'
import {
  WORKBENCH_PERSONAS, WORKBENCH_PRODUCT_ASSIGNEES, deriveWorkbenchTasks,
  getWorkbenchSummary, getWorkbenchPendingPage, getWorkbenchQuickLinks,
} from '../src/domain/workbenchTasks.js'

const air = (overrides = {}) => ({
  id: 'AIR-1', orderNo: 'GJ-AIR-1', product: 'MU-GENERAL', creator: '周倩',
  createdAt: '2026-09-08 09:00', orderStatus: '待订舱', bookingStatus: '待服务',
  waybillNo: '', booking: {}, ...overrides,
})
const ground = (overrides = {}) => ({
  id: 'GROUND-1', orderNo: 'GJ-GROUND-1', creator: '陈楠', orderType: '',
  createdAt: '2026-09-08 10:00', dispatchStatus: '未调度', ...overrides,
})

describe('第002篇工作台：角色待办由业务事实派生', () => {
  it('产品绑定与下单客服独立，未绑定及其他运营不可见', () => {
    const state = { airOrders: [air({ owner: '李明', product: 'UNKNOWN' })] }
    expect(deriveWorkbenchTasks(state, 'operator')).toEqual([])
    state.airOrders[0].product = 'MU-GENERAL'
    expect(deriveWorkbenchTasks(state, 'operator')).toHaveLength(1)
    expect(deriveWorkbenchTasks(state, { scope: 'air', role: 'operator', name: '另一运营' })).toEqual([])
    state.airOrders[0].assignees = { operator: '另一运营' }
    expect(deriveWorkbenchTasks(state, 'operator')).toEqual([])
    expect(WORKBENCH_PRODUCT_ASSIGNEES['MU-GENERAL'].handler).toBe('王晴')
  })

  it('待订舱只触发确认航班，提单号填入即完成；确认航班才触发航程补充', () => {
    const state = { airOrders: [air()] }
    expect(deriveWorkbenchTasks(state, 'operator')[0]).toMatchObject({ type: 'air-confirm-flight', completed: false })
    expect(deriveWorkbenchTasks(state, 'handler')).toEqual([])
    expect(deriveWorkbenchTasks(state, 'service')).toEqual([])
    Object.assign(state.airOrders[0], { bookingStatus: '服务中', waybillNo: '781-DEMO', bookingConfirmedAt: '2026-09-08 10:00' })
    expect(deriveWorkbenchTasks(state, 'operator')[0].completed).toBe(true)
    expect(deriveWorkbenchTasks(state, 'handler')[0]).toMatchObject({ type: 'air-complete-journey', completed: false, createdAt: '2026-09-08 10:00' })
    Object.assign(state.airOrders[0], { orderStatus: '待补录', bookingStatus: '服务已完成', bookingCompletedAt: '2026-09-08 11:00' })
    expect(deriveWorkbenchTasks(state, 'handler')[0].completed).toBe(true)
    expect(deriveWorkbenchTasks(state, 'service')[0]).toMatchObject({ type: 'air-supplement', completed: false, createdAt: '2026-09-08 11:00', target: { path: '/fulfillment/air-orders/AIR-1/supplement' }, blockedReason: '' })
  })

  it('客服和主管只看本人补录，不从业务员归属猜建单人', () => {
    const state = { airOrders: [air({ creator: '其他客服', owner: '周倩', orderStatus: '待补录' }), air({ id: 'AIR-2', creator: '周倩', orderStatus: '待出提单' })] }
    for (const role of ['service', 'supervisor']) {
      const tasks = deriveWorkbenchTasks(state, role)
      expect(tasks).toHaveLength(1)
      expect(tasks[0]).toMatchObject({ orderId: 'AIR-2', completed: true })
    }
  })

  it('完成时间保留原来已触发的任务，不因进入下游状态而丢失统计', () => {
    const state = { airOrders: [air({
      orderStatus: '已出提单', bookingStatus: '服务已完成', waybillNo: '781-DEMO',
      bookingConfirmedAt: '2026-09-08 10:00', bookingCompletedAt: '2026-09-08 11:00', supplementedAt: '2026-09-08 12:00',
    })] }
    for (const role of ['operator', 'handler', 'service']) expect(deriveWorkbenchTasks(state, role)[0].completed).toBe(true)
  })

  it('未申请亏损不造审批任务，申请后只分给绑定总监，通过或拒绝都完成', () => {
    const state = { airOrders: [air({ booking: { allowLoss: true } })] }
    expect(deriveWorkbenchTasks(state, 'director')).toEqual([])
    Object.assign(state.airOrders[0], { orderStatus: '待审核', bookingStatus: '待审核' })
    expect(deriveWorkbenchTasks(state, 'director')).toEqual([])
    state.airOrders[0].approval = { status: '待审核', lossAmount: 2500, createdAt: '2026-09-08 10:30' }
    expect(deriveWorkbenchTasks(state, 'director')[0].completed).toBe(false)
    expect(deriveWorkbenchTasks(state, 'handler')).toEqual([])
    state.airOrders[0].approval.status = '审核通过'
    expect(deriveWorkbenchTasks(state, 'director')[0]).toMatchObject({ completed: true, createdAt: '2026-09-08 10:30' })
    state.airOrders[0].approval.status = '审核拒绝'
    expect(deriveWorkbenchTasks(state, 'director')[0].completed).toBe(true)
    expect(deriveWorkbenchTasks(state, { scope: 'air', role: 'director', name: '另一总监' })).toEqual([])
  })

  it('运输订单生成运单后调度待办完成，客服和主管可见，不混入中转或未触发取消单', () => {
    const state = { groundOrders: [ground(), ground({ id: 'GROUND-2', orderType: '中转订单' }), ground({ id: 'GROUND-3', dispatchStatus: '已取消' })], groundWaybills: [] }
    for (const role of ['hangsheng', 'groundSupervisor']) expect(deriveWorkbenchTasks(state, role)).toHaveLength(1)
    expect(deriveWorkbenchTasks(state, 'hangsheng')[0]).toMatchObject({ completed: false, target: { path: '/fulfillment/ground-dispatch', query: { order: 'GROUND-1', action: 'dispatch' } } })
    state.groundWaybills.push({ id: 'WAYBILL-1', orderId: 'GROUND-1', status: '待提货' })
    expect(deriveWorkbenchTasks(state, 'hangsheng')[0].completed).toBe(true)
    expect(deriveWorkbenchTasks(state, 'service')).toEqual([])
  })

  it('派生不写原始数据，也不把现有财务或仓库演示记录当作新任务', () => {
    const state = { airOrders: [air()], groundOrders: [ground()], costs: [{ status: '待审批' }], warehouseOrders: [{ status: '待入库' }] }
    const before = JSON.stringify(state)
    for (const persona of WORKBENCH_PERSONAS) deriveWorkbenchTasks(state, persona)
    expect(JSON.stringify(state)).toBe(before)
    expect(deriveWorkbenchTasks(state, 'finance')).toEqual([])
    expect(deriveWorkbenchTasks(state, 'warehouseService')).toEqual([])
    expect(deriveWorkbenchTasks(state, { scope: 'air', role: 'operator', name: '' })).toEqual([])
  })
})

describe('第010篇订舱变更与逐级亏损审批工作台', () => {
  const stages = () => [
    { role: 'director', label: '航线总监', status: '待审核', actor: '', decidedAt: '' },
    { role: 'deputyGeneral', label: '事业部副总经理', status: '未开始', actor: '', decidedAt: '' },
    { role: 'divisionGeneral', label: '事业部总经理', status: '未开始', actor: '', decidedAt: '' },
  ]
  const approving = () => ({ airOrders: [air({ orderStatus: '待审核', bookingStatus: '待审核', approval: {
    status: '待审核', lossAmount: 12000, createdAt: '2026-09-08 10:00', reason: '演示亏损申请', stages: stages(),
  } })] })

  it('只当前审批阶段为待办，前级通过后保留已办，后级不能提前处理', () => {
    const state = approving(), approval = state.airOrders[0].approval
    expect(deriveWorkbenchTasks(state, 'director')[0]).toMatchObject({ type: 'air-loss-approval', completed: false, creator: '李明', handler: '航线总监', createdAt: '2026-09-08 10:00' })
    expect(deriveWorkbenchTasks(state, 'deputyGeneral')).toEqual([])
    expect(deriveWorkbenchTasks(state, 'divisionGeneral')).toEqual([])
    Object.assign(approval.stages[0], { status: '审核通过', actor: '航线总监', decidedAt: '2026-09-08 10:05' })
    approval.stages[1].status = '待审核'
    expect(deriveWorkbenchTasks(state, 'director')[0].completed).toBe(true)
    expect(deriveWorkbenchTasks(state, 'deputyGeneral')[0]).toMatchObject({ completed: false, creator: '航线总监', handler: '事业部副总经理', createdAt: '2026-09-08 10:05', target: { path: '/fulfillment/booking', query: { order: 'AIR-1' } } })
    expect(deriveWorkbenchTasks(state, 'divisionGeneral')).toEqual([])
    Object.assign(approval.stages[1], { status: '审核通过', actor: '事业部副总经理', decidedAt: '2026-09-08 10:10' })
    approval.stages[2].status = '待审核'
    expect(deriveWorkbenchTasks(state, 'deputyGeneral')[0].completed).toBe(true)
    expect(deriveWorkbenchTasks(state, 'divisionGeneral')[0]).toMatchObject({ completed: false, creator: '事业部副总经理', createdAt: '2026-09-08 10:10' })
    Object.assign(approval.stages[2], { status: '审核通过', actor: '事业部总经理', decidedAt: '2026-09-08 10:15' })
    approval.status = '审核通过'
    for (const role of ['director', 'deputyGeneral', 'divisionGeneral']) expect(getWorkbenchSummary(deriveWorkbenchTasks(state, role))).toEqual({ total: 1, pending: 0, completed: 1, ratio: 0 })
  })

  it.each([[5000, 1], [5000.01, 2], [10000, 2], [10000.01, 3], [30000, 3]])('兼容旧审批记录：亏损%s元只产生%s个已执行阶段', (lossAmount, stageCount) => {
    const state = { airOrders: [air({ approval: { status: '审核通过', lossAmount, createdAt: '2026-09-08 10:00' } })] }
    const results = ['director', 'deputyGeneral', 'divisionGeneral'].map(role => deriveWorkbenchTasks(state, role))
    expect(results.filter(tasks => tasks.length)).toHaveLength(stageCount)
    expect(results.flat().every(task => task.completed)).toBe(true)
  })

  it('新审批角色只处理明确绑定的本人阶段，不获得运营、操作或客服待办', () => {
    const state = approving()
    Object.assign(state.airOrders[0].approval.stages[0], { status: '审核通过', actor: '航线总监' })
    state.airOrders[0].approval.stages[1].status = '待审核'
    state.airOrders.push(air({ id: 'BOOKING' }), air({ id: 'SUPPLEMENT', orderStatus: '待补录', bookingStatus: '服务已完成' }))
    const tasks = deriveWorkbenchTasks(state, 'deputyGeneral')
    expect(tasks).toHaveLength(1)
    expect(tasks[0].type).toBe('air-loss-approval')
    expect(deriveWorkbenchTasks(state, { scope: 'air', role: 'deputyGeneral', name: '其他副总经理' })).toEqual([])
    state.airOrders[0].assignees = { operator: '李明', director: '航线总监', deputyGeneral: '指定演示副总经理' }
    expect(deriveWorkbenchTasks(state, 'deputyGeneral')).toEqual([])
    expect(deriveWorkbenchTasks(state, { scope: 'air', role: 'deputyGeneral', name: '指定演示副总经理' })).toHaveLength(1)
    for (const role of ['deputyGeneral', 'divisionGeneral']) {
      expect(WORKBENCH_PERSONAS.find(persona => persona.id === role)).toMatchObject({ scope: 'air', role })
      expect(getWorkbenchQuickLinks(role).filter(link => !link.disabled)).toEqual([{ label: '订舱管理', target: { path: '/fulfillment/booking' }, disabled: false, blockedReason: '' }])
    }
  })

  it.each(['待补录', '待出提单'])('主订单仍为%s，航班变更退回服务中后航程补充重新成为待办', orderStatus => {
    const state = { airOrders: [air({ orderStatus, bookingStatus: '服务已完成', bookingConfirmedAt: '2026-09-08 10:00', bookingCompletedAt: '2026-09-08 11:00', booking: { completedAt: '2026-09-08 11:00' } })] }
    expect(deriveWorkbenchTasks(state, 'handler')[0].completed).toBe(true)
    state.airOrders[0].bookingStatus = '服务中'
    expect(deriveWorkbenchTasks(state, 'handler')[0]).toMatchObject({ type: 'air-complete-journey', completed: false, target: { path: '/fulfillment/booking', query: { order: 'AIR-1' } } })
    expect(getWorkbenchSummary(deriveWorkbenchTasks(state, 'handler')).pending).toBe(1)
    state.airOrders[0].bookingStatus = '服务已完成'
    expect(deriveWorkbenchTasks(state, 'handler')[0].completed).toBe(true)
  })

  it('审核拒绝后未开始的下级阶段不生成待办，派生不修改审批记录', () => {
    const state = approving(), approval = state.airOrders[0].approval
    approval.status = '审核拒绝'
    approval.stages[0].status = '审核拒绝'
    const before = JSON.stringify(state)
    expect(deriveWorkbenchTasks(state, 'director')[0].completed).toBe(true)
    expect(deriveWorkbenchTasks(state, 'deputyGeneral')).toEqual([])
    expect(deriveWorkbenchTasks(state, 'divisionGeneral')).toEqual([])
    expect(JSON.stringify(state)).toBe(before)
  })

  it.each([30000.01, undefined, 0, -1])('亏损额%s缺少可执行审批路径时不产生可处理待办', lossAmount => {
    const state = approving()
    state.airOrders[0].approval.lossAmount = lossAmount
    for (const role of ['director', 'deputyGeneral', 'divisionGeneral']) expect(deriveWorkbenchTasks(state, role)).toEqual([])
  })

  it('异常阶段角色不能为航线操作生成亏损审批权限', () => {
    const state = approving()
    state.airOrders[0].approval.stages = [{ role: 'handler', label: '异常阶段', status: '待审核' }]
    expect(deriveWorkbenchTasks(state, 'handler')).toEqual([])
  })
})

describe('第002篇工作台：统计、分页和真实入口', () => {
  it('进度按未处理 / 全部已触发任务计算，空列表为零', () => {
    expect(getWorkbenchSummary([{ completed: true }, { completed: false }, { completed: false }])).toEqual({ total: 3, pending: 2, completed: 1, ratio: 2 / 3 })
    expect(getWorkbenchSummary([])).toEqual({ total: 0, pending: 0, completed: 0, ratio: 0 })
  })

  it('只分页未处理任务，按任务创建时间升序，每页最多20且页码钳制', () => {
    const orders = Array.from({ length: 25 }, (_, index) => ground({ id: `G-${String(index).padStart(2, '0')}`, createdAt: `2026-09-08 10:${String(index).padStart(2, '0')}` })).reverse()
    const tasks = deriveWorkbenchTasks({ groundOrders: orders }, 'hangsheng')
    tasks[0].completed = true
    const before = tasks.map(item => item.id)
    expect(getWorkbenchPendingPage(tasks, 1, 100)).toMatchObject({ total: 24, page: 1, pageSize: 20, pageCount: 2 })
    expect(getWorkbenchPendingPage(tasks, 1, 100).items).toHaveLength(20)
    expect(getWorkbenchPendingPage(tasks, 1).items[0].orderId).toBe('G-01')
    expect(getWorkbenchPendingPage(tasks, 999).items).toHaveLength(4)
    expect(getWorkbenchPendingPage(tasks, NaN, NaN)).toMatchObject({ page: 1, pageSize: 20 })
    expect(tasks.map(item => item.id)).toEqual(before)
  })

  it('未实现快捷入口禁用且没有虚假跳转', () => {
    const service = getWorkbenchQuickLinks('service')
    expect(service[0]).toMatchObject({ label: '主订单', disabled: false, target: { path: '/fulfillment/air-orders' } })
    expect(service.find(item => item.label === '子订单')).toMatchObject({ disabled: false, target: { path: '/fulfillment/air-children' } })
    expect(getWorkbenchQuickLinks('hangsheng').filter(item => !item.disabled).map(item => item.label)).toEqual(['运输订单', '中转订单', '运输运单'])
    expect(getWorkbenchQuickLinks('finance').filter(item => !item.disabled).map(item => item.label)).toEqual(['供应商列表', '客户列表'])
    expect(getWorkbenchQuickLinks('finance').find(item => item.label === '订单成本审批明细').disabled).toBe(true)
    expect(getWorkbenchQuickLinks('missing')).toEqual([])
  })
})
