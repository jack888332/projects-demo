import { getBookingApproval } from './airOperations.js'

// Personnel are synthetic demo identities; product bindings are explicit, never inferred from an order owner.
export const WORKBENCH_PERSONAS = [
  { id: 'service', scope: 'air', role: 'service', name: '周倩', label: '空运客服' },
  { id: 'waybillClerk', scope: 'air', role: 'waybillClerk', name: '提单演示专员', label: '打单员' },
  { id: 'templateProduct', scope: 'airTemplate', role: 'product', name: '模板演示产品人员', label: '提单模板产品人员' },
  { id: 'templateTechnical', scope: 'airTemplate', role: 'technical', name: '模板演示技术人员', label: '提单模板技术人员' },
  { id: 'supervisor', scope: 'air', role: 'supervisor', name: '周倩', label: '空运客服主管' },
  { id: 'operator', scope: 'air', role: 'operator', name: '李明', label: '航线运营' },
  { id: 'handler', scope: 'air', role: 'handler', name: '王晴', label: '航线操作' },
  { id: 'director', scope: 'air', role: 'director', name: '航线总监', label: '航线总监' },
  { id: 'deputyGeneral', scope: 'air', role: 'deputyGeneral', name: '事业部副总经理', label: '事业部副总经理' },
  { id: 'divisionGeneral', scope: 'air', role: 'divisionGeneral', name: '事业部总经理', label: '事业部总经理' },
  { id: 'hangsheng', scope: 'ground', role: 'hangsheng', name: '陈楠', label: '航晟客服' },
  { id: 'groundSupervisor', scope: 'ground', role: 'supervisor', name: '陈楠', label: '航晟主管' },
  { id: 'warehouseService', scope: 'warehouse', role: 'service', name: '仓库演示客服', label: '仓库客服' },
  { id: 'warehouseSupervisor', scope: 'warehouse', role: 'supervisor', name: '仓库演示主管', label: '仓库主管' },
  { id: 'finance', scope: 'finance', role: 'finance', name: '财务演示人员', label: '财务人员' },
  { id: 'business', scope: 'finance', role: 'business', name: '周倩', label: '业务人员' },
  { id: 'businessSupervisor', scope: 'finance', role: 'businessSupervisor', name: '业务演示主管', label: '业务主管' },
  { id: 'masterAdmin', scope: 'airMaster', role: 'admin', name: '主数据演示管理员', label: '空运主数据管理员' },
  { id: 'masterRoute', scope: 'airMaster', role: 'routeStaff', name: '主数据演示航线专员', label: '空运主数据航线专员' },
  { id: 'masterFinance', scope: 'airMaster', role: 'financeStaff', name: '主数据演示财务专员', label: '空运主数据财务专员' },
]

export const WORKBENCH_PRODUCT_ASSIGNEES = {
  'MU-GENERAL': { operator: '李明', handler: '王晴', director: '航线总监' },
  'CZ-GENERAL': { operator: '李明', handler: '王晴', director: '航线总监' },
  'NH-GENERAL': { operator: '李明', handler: '王晴', director: '航线总监' },
}

const resolvePersona = persona => typeof persona === 'string'
  ? WORKBENCH_PERSONAS.find(item => item.id === persona)
  : persona
const present = value => typeof value === 'string' && value.trim().length > 0
const creationTime = order => order.createdAt || order.createDate || ''
const compareTasks = (left, right) => (left.createdAt || '\uffff').localeCompare(right.createdAt || '\uffff') || left.id.localeCompare(right.id)
const bookingTarget = order => ({ path: '/fulfillment/booking', query: { order: order.id } })

function task(order, type, values) {
  return {
    id: `${type}:${order.id}`, type, no: order.orderNo || order.id,
    orderId: order.id, subject: '', createdAt: creationTime(order),
    creator: order.creator || '', handler: '', completed: false,
    actionLabel: '立即处理', target: null, blockedReason: '', ...values,
  }
}

// The returned records are projections of the authoritative orders, not mutable task copies.
export function deriveWorkbenchTasks(state, persona) {
  const session = resolvePersona(persona)
  if (!session || !present(session.name)) return []
  const tasks = []
  if (session.scope === 'air') {
    for (const order of state.airOrders || []) {
      const assignees = order.assignees ?? WORKBENCH_PRODUCT_ASSIGNEES[order.product] ?? {}
      const booking = order.booking || {}
      const supplementDone = present(order.supplementedAt) || order.orderStatus === '待出提单'
      if (['service', 'supervisor'].includes(session.role) && order.creator === session.name
        && (order.orderStatus === '待补录' || supplementDone)) {
        tasks.push(task(order, 'air-supplement', {
          subject: '航线已订舱，请立即补录', handler: order.creator,
          createdAt: order.bookingCompletedAt || booking.completedAt || '',
          completed: supplementDone, actionLabel: '立即补录',
          target: { path: `/fulfillment/air-orders/${order.id}/supplement` },
          blockedReason: !supplementDone && order.bookingStatus !== '服务已完成' ? '订舱服务状态尚未完成，需先确认' : '',
        }))
      }
      if (session.role === 'operator' && assignees.operator === session.name
        && (order.orderStatus === '待订舱' || present(order.waybillNo) || present(order.bookingConfirmedAt))) {
        const completed = present(order.waybillNo)
        tasks.push(task(order, 'air-confirm-flight', {
          subject: '客服已建单，请立即确认航班', handler: assignees.operator, completed,
          actionLabel: '确认航班', target: bookingTarget(order),
          blockedReason: !completed && order.bookingStatus === '待审核' ? '等待亏损审批' : '',
        }))
      }
      const confirmed = present(order.bookingConfirmedAt) || present(booking.confirmedAt)
        || ['服务中', '服务已完成'].includes(order.bookingStatus)
      if (session.role === 'handler' && assignees.handler === session.name && confirmed) {
        tasks.push(task(order, 'air-complete-journey', {
          subject: '已确认航班，请立即补充航程信息', handler: assignees.handler,
          creator: assignees.operator || '', createdAt: order.bookingConfirmedAt || booking.confirmedAt || '',
          completed: order.bookingStatus === '服务已完成',
          actionLabel: '航程补充', target: bookingTarget(order),
        }))
      }
      const approval = getBookingApproval(order)
      const stageIndex = approval.stages.findIndex(stage => stage.role === session.role)
      const stage = approval.stages[stageIndex]
      const approvalAssignee = assignees[session.role] || (['deputyGeneral', 'divisionGeneral'].includes(session.role)
        ? WORKBENCH_PERSONAS.find(persona => persona.id === session.role)?.name : '')
      const stageCompleted = ['审核通过', '审核拒绝', '审批通过', '审批拒绝'].includes(stage?.status)
      if (['director', 'deputyGeneral', 'divisionGeneral'].includes(session.role) && stage && approvalAssignee === session.name && (stageCompleted || approval.currentRole === session.role)) {
        const previousStage = approval.stages[stageIndex - 1]
        tasks.push(task(order, 'air-loss-approval', {
          subject: '审核该订单是否允许亏损', handler: approvalAssignee,
          creator: previousStage ? previousStage.actor || previousStage.label : assignees.operator || '',
          createdAt: previousStage ? previousStage.decidedAt || '' : approval.createdAt || order.bookingSubmittedAt || '',
          completed: stageCompleted, actionLabel: '亏损审核', target: bookingTarget(order),
          blockedReason: stageCompleted ? '' : approval.blockedReason || '',
        }))
      }
    }
  }
  if (session.scope === 'ground' && ['hangsheng', 'supervisor'].includes(session.role)) {
    for (const order of state.groundOrders || []) {
      // Transfer-order reminders have different triggers and are not transportation-order tasks.
      if (order.orderType === '中转' || order.orderType === '中转订单') continue
      const related = (state.groundWaybills || []).filter(item => item.orderId === order.id)
      const dispatched = present(order.dispatchedAt) || related.length > 0
      if (!['未调度', '待调度', '已调度', '已完成'].includes(order.dispatchStatus) && !dispatched) continue
      tasks.push(task(order, 'ground-dispatch', {
        subject: '收到新运输订单，立即调度', handler: '航晟客服、主管',
        completed: dispatched || ['已调度', '已完成'].includes(order.dispatchStatus),
        actionLabel: '立即调度', target: { path: '/fulfillment/ground-dispatch', query: { order: order.id, action: 'dispatch' } },
      }))
    }
  }
  if (session.scope === 'finance' && session.role === 'finance') {
    for (const partner of state.partners || []) {
      for (const approval of partner.approvals || []) tasks.push({
        id:approval.id,type:'partner-approval',no:partner.code,subject:partner.type+'新建审批 · '+partner.name,
        createdAt:approval.createdAt,creator:approval.creator,handler:session.name,completed:approval.status!=='已提交',actionLabel:'立即审批',
        target:{path:'/foundation/partners',query:{partner:partner.id,type:partner.type,mode:'approve'}},blockedReason:'',
      })
    }
    for (const application of state.creditApplications || []) {
      if (application.id.startsWith('CREDIT-SEED-')) continue
      const partner=(state.partners || []).find(row=>row.id===application.partnerId)
      if(!partner) continue
      tasks.push({id:application.id,type:'credit-approval',no:partner.code,subject:'客户授信额度审批 · '+partner.name,createdAt:application.createdAt,creator:application.creator,handler:session.name,
        completed:application.status!=='已提交',actionLabel:'额度审批',target:{path:'/foundation/partners',query:{partner:partner.id,type:'客户',mode:'credit',application:application.id}},blockedReason:''})
    }
  }
  return tasks.sort(compareTasks)
}

export function getWorkbenchSummary(tasks) {
  const completed = tasks.filter(item => item.completed).length
  const total = tasks.length
  const pending = total - completed
  return { total, pending, completed, ratio: total ? pending / total : 0 }
}

export function getWorkbenchPendingPage(tasks, page = 1, pageSize = 20) {
  const size = Number.isFinite(Number(pageSize)) ? Math.min(20, Math.max(1, Math.floor(Number(pageSize)))) : 20
  const pending = tasks.filter(item => !item.completed).sort(compareTasks)
  const pageCount = Math.max(1, Math.ceil(pending.length / size))
  const requestedPage = Number.isFinite(Number(page)) ? Math.floor(Number(page)) : 1
  const currentPage = Math.min(pageCount, Math.max(1, requestedPage))
  return { items: pending.slice((currentPage - 1) * size, currentPage * size), total: pending.length, page: currentPage, pageSize: size, pageCount }
}

const link = (label, path = '', reason = '尚未覆盖') => ({ label, target: path ? { path } : null, disabled: !path, blockedReason: path ? '' : reason })

export function getWorkbenchQuickLinks(persona) {
  const session = resolvePersona(persona)
  if (!session) return []
  if (session.scope === 'airTemplate') return [link('提单模板管理', '/fulfillment/airway-bill-templates')]
  if (session.role === 'waybillClerk') return [link('提单制作', '/fulfillment/airway-bills')]
  if (session.scope === 'air' && ['service', 'supervisor'].includes(session.role)) {
    return [link('主订单', '/fulfillment/air-orders'), link('子订单', '/fulfillment/air-children'), link('提单制作', '/fulfillment/airway-bills'), link('自建仓库订单'), link('结算订单成本'), link('核算订单成本')]
  }
  if (session.scope === 'air' && ['operator', 'handler', 'director', 'deputyGeneral', 'divisionGeneral'].includes(session.role)) {
    return [link('订舱管理', '/fulfillment/booking'), link('舱位产品'), link('舱位实时查询'), link('配板管理'), ...(['director', 'deputyGeneral', 'divisionGeneral'].includes(session.role) ? [link('核算订单成本')] : [link('提单号')]), link('结算订单成本')]
  }
  if (session.scope === 'ground' && ['hangsheng', 'supervisor'].includes(session.role)) {
    return [link('运输订单', '/fulfillment/ground-dispatch'), link('中转订单'), link('供应商报价'), link('客户报价'), link('运输运单', '/fulfillment/ground-waybills'), link('中转运单')]
  }
  if (session.scope === 'warehouse' && ['service', 'supervisor'].includes(session.role)) {
    return ['仓库订单', '运输订单预报看板', '运输运单预报看板', '货物管理', '退货管理'].map(label => link(label))
  }
  if (session.scope === 'finance') {
    return [
      {label:'供应商列表',target:{path:'/foundation/partners',query:{type:'供应商'}},disabled:false},
      {label:'客户列表',target:{path:'/foundation/partners',query:{type:'客户'}},disabled:false},
      ...['订单成本审批明细', '付款申请审批明细', '付款申请编辑列表', '付款核销编辑', '收款核销编辑'].map(label => link(label)),
    ]
  }
  return []
}
