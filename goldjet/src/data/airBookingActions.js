import {
  BOOKING_JOURNEY_FIELDS, BOOKING_SUPPLEMENT_FIELDS, createBookingDraft,
  getBookingApproval, getBookingDecision, getBookingPermission, validateBookingDraft,
} from '../domain/airOperations.js'
import { GROUND_NOW } from '../domain/groundOperations.js'
import { appendAirNotification } from './airOrderActions.js'

const clone = value => JSON.parse(JSON.stringify(value))
const changed = (previous, next, key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key])
const flightFields = ['airline', 'flight', 'departureDate', 'firstDestination', 'firstLeg', 'secondLeg', 'secondDestination', 'thirdLeg', 'takeoffTime', 'cutoffTime']
const bookingTarget = order => ({ path: '/fulfillment/booking', query: { order: order.id } })
const display = value => value === undefined || value === null || value === '' ? '未填写' : value

function stationName(state, booking) {
  const flight = (state.airMaster?.flights || []).find(row => row.code === booking.flight)
  return (state.airMaster?.stations || []).find(row => row.id === flight?.station)?.name || ''
}

function notifyApproval(state, order, approval) {
  const stage = approval.stages.find(item => item.status === '待审核')
  if (!stage) return
  const recipient = order.assignees?.[stage.role] || stage.label
  appendAirNotification(state, order, '亏损审批申请', recipient,
    `订单号：${order.orderNo}，提单号：${display(order.waybillNo)}，申请理由：${display(approval.reason)}。请${stage.label}审核是否允许亏损。`, bookingTarget(order))
}

export function createAirBookingActions(state, getSession, getCatalog) {
  function saveAirBooking(id, draft, { role = getSession().role, confirmedApproval = false, approvalReason = '' } = {}) {
    const session = getSession()
    if (role !== session.role) throw new Error('演示角色已变化，请重新打开订舱信息')
    const order = state.airOrders.find(item => item.id === id)
    const permission = getBookingPermission(order, role)
    if (!permission.action) throw new Error(permission.reason)
    const previous = createBookingDraft(order)
    const allowed = new Set([...(permission.journey ? BOOKING_JOURNEY_FIELDS : []), ...(permission.supplement ? BOOKING_SUPPLEMENT_FIELDS : [])])
    if (order.bookingStatus !== '待服务') allowed.delete('waybillType')
    for (const key of [...BOOKING_JOURNEY_FIELDS, ...BOOKING_SUPPLEMENT_FIELDS]) {
      if (!allowed.has(key) && changed(previous, draft, key)) throw new Error(`当前角色或状态不允许修改 ${key}`)
    }
    const next = { ...previous, ...Object.fromEntries([...allowed].map(key => [key, draft[key]])) }
    const errors = validateBookingDraft(next, getCatalog())
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    const decision = getBookingDecision(order, next)
    if (['blocked', 'unconfirmed'].includes(decision.kind)) throw new Error(decision.message)
    if (decision.kind === 'approval' && !confirmedApproval) throw Object.assign(new Error(decision.message), { code: 'APPROVAL_CONFIRMATION_REQUIRED' })
    if (typeof approvalReason !== 'string') throw new Error('申请理由须为文字')
    const hasChanges = [...BOOKING_JOURNEY_FIELDS, ...BOOKING_SUPPLEMENT_FIELDS].some(key => changed(previous, next, key))
    if (permission.action === 'save' && !hasChanges) return order
    const flightChanged = flightFields.some(key => changed(previous, next, key))
    let bookingStatus = order.bookingStatus
    const previousOrderStatus = order.orderStatus
    let orderStatus = previousOrderStatus
    if (decision.kind === 'approval') {
      bookingStatus = '待审核'
      orderStatus = '待审核'
    } else if (permission.action === 'confirm') bookingStatus = '服务中'
    else if (permission.action === 'complete') {
      bookingStatus = '服务已完成'
      if (orderStatus === '待订舱') orderStatus = '待补录'
    } else if (flightChanged && ['待补录', '待出提单'].includes(order.orderStatus) && order.bookingStatus === '服务已完成') bookingStatus = '服务中'
    if ((state.palletAllocations || []).some(row => row.orderId === id)
      && (bookingStatus !== order.bookingStatus || next.flight !== previous.flight || next.departureDate !== previous.departureDate)) {
      throw new Error('该订单已有配板，订舱变更后的关联处理待确认；请先撤回分批并卸下配板')
    }
    const approval = decision.kind === 'approval' ? {
      status: '待审核', lossAmount: decision.lossAmount, reason: approvalReason.trim(), createdAt: GROUND_NOW,
      stages: decision.stages.map((stage, index) => ({ ...stage, status: index === 0 ? '待审核' : '未开始', actor: '', decidedAt: '' })),
    } : order.approval
    const wasCompleted = order.bookingStatus === '服务已完成'
    Object.assign(order, {
      booking: clone(next), orderStatus, bookingStatus, supplier: next.airline, flight: next.flight,
      departureDate: next.departureDate, waybillNo: order.waybillNo || `781-9000${order.id.slice(-3)}0`, approval,
      bookingConfirmedAt: order.bookingConfirmedAt || GROUND_NOW,
      bookingCompletedAt: permission.action === 'complete' && decision.kind !== 'approval' ? GROUND_NOW
        : wasCompleted && bookingStatus !== '服务已完成' ? '' : order.bookingCompletedAt,
    })
    const service = order.services.find(item => item.type === 'booking')
    if (service) service.status = bookingStatus
    if (decision.kind === 'approval') notifyApproval(state, order, approval)
    else if (permission.action === 'confirm') appendAirNotification(state, order, '航程待补充', order.assignees?.handler, `订单号：${order.orderNo}航线信息待补充，请尽快处理！`, bookingTarget(order))
    else if (permission.action === 'complete' && role === 'handler' && previousOrderStatus === '待订舱' && orderStatus === '待补录') appendAirNotification(state, order, '订单待补录', order.creator, `订单号：${order.orderNo}待补录，请尽快处理！`, { path: `/fulfillment/air-orders/${order.id}/supplement` })
    if (permission.action === 'save' && role === 'operator'
      && [...flightFields, 'palletCompany'].some(key => changed(previous, next, key))) {
      const fields = [
        ['航班号', previous.flight, next.flight], ['货站', stationName(state, previous), stationName(state, next)],
        ['出港日期', previous.departureDate, next.departureDate],
        ['截单时间', previous.cutoffTime, next.cutoffTime], ['装板公司', previous.palletCompany, next.palletCompany],
        ...['airCost', 'truckCost', 'guidePrice'].filter(key => changed(previous, next, key)).map(key => [{ airCost: '空运成本', truckCost: '卡车成本', guidePrice: '指导价' }[key], previous[key], next[key]]),
      ]
      const content = `订单号：${order.orderNo}，提单号：${order.waybillNo}，${fields.map(([label, before, after]) => `${label}：${display(before)} → ${display(after)}`).join('；')}。`
      appendAirNotification(state, order, '订舱信息变更', order.creator, content)
    }
    return order
  }

  function approveAirBooking(id) {
    const order = state.airOrders.find(item => item.id === id)
    const session = getSession(), approval = getBookingApproval(order)
    if (!approval.currentRole || session.role !== approval.currentRole) throw new Error(`仅${approval.currentLabel || '当前审批人'}可审核该亏损申请`)
    if (!order || order.orderStatus !== '待审核' || order.bookingStatus !== '待审核') throw new Error('该订单当前不处于订舱待审核状态')
    if (!(approval.lossAmount > 0) || approval.lossAmount > 30000) throw new Error('亏损额无效或超过 30,000 元，审批规则待确认')
    const stages = approval.stages.map(stage => ({ ...stage }))
    const index = stages.findIndex(stage => stage.role === approval.currentRole)
    Object.assign(stages[index], { status: '审核通过', actor: session.name, decidedAt: GROUND_NOW })
    const next = stages[index + 1]
    if (next) next.status = '待审核'
    order.approval = { ...approval, stages, status: next ? '待审核' : '审核通过',
      ...(next ? {} : { decidedAt: GROUND_NOW, serviceStatePending: true }),
    }
    delete order.approval.currentRole
    delete order.approval.currentLabel
    delete order.approval.blockedReason
    if (!next) order.orderStatus = '待补录'
    appendAirNotification(state, order, '亏损审批结果', order.assignees?.operator,
      `订单号：${order.orderNo}，提单号：${display(order.waybillNo)}，审批结果：${stages[index].label}审核通过${next ? `，待${next.label}审核` : ''}。`, bookingTarget(order))
    if (next) notifyApproval(state, order, order.approval)
    return order
  }
  return { saveAirBooking, approveAirBooking }
}
