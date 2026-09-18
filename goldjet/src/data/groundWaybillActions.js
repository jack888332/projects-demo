import { GROUND_NOW, deriveGroundOrderStatus } from '../domain/groundOperations.js'
import { groundExceptionErrors, groundExceptionCloseReason, groundRemarkError, groundDocumentErrors } from '../domain/groundWaybills.js'

const clone = value => JSON.parse(JSON.stringify(value))
export function syncGroundWaybillOrder(state, bill, time = GROUND_NOW) {
  const order = state.groundOrders.find(row => row.id === bill.orderId)
  if (!order) return
  const bills = state.groundWaybills.filter(row => row.orderId === order.id)
  order.updatedAt = time
  if (bills.some(row => row.exceptionStatus === '异常中' || row.status === '异常中')) {
    order.statusPendingReason = '存在未关闭异常，订单汇总状态待确认（035）'
    return
  }
  order.statusPendingReason = ''
  const previous = order.dispatchStatus
  order.dispatchStatus = deriveGroundOrderStatus(bills, previous)
  if (order.dispatchStatus === '已完成' && previous !== '已完成') order.completedAt = time
}
export function createGroundWaybillActions(state, getSession) {
  function find(id) {
    if (getSession().role !== 'hangsheng') throw new Error('仅航晟客服可操作运单异常及单据')
    const bill = state.groundWaybills.find(row => row.id === id)
    if (!bill) throw new Error('运单不存在，请重新查询')
    return bill
  }
  function trajectory(bill, event, remark) {
    bill.trajectory.push({ id: `${bill.id}-T${bill.trajectory.length + 1}`, event, status: bill.status,
      time: GROUND_NOW, actor: getSession().accountId, actorName: getSession().name, role: '航晟客服', remark: remark || '' })
    bill.updatedAt = GROUND_NOW
    syncGroundWaybillOrder(state, bill)
  }
  function reportGroundException(id, draft) {
    const bill = find(id)
    if (bill.status === '已取消') throw new Error('已取消运单不能上报异常')
    const errors = groundExceptionErrors(draft)
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0])
    const open = (bill.exceptions || []).filter(row => row.status === '异常中')
    const remark = String(draft.remark || '').trim()
    const record = { id: `${id}-EX${(bill.exceptions || []).length + 1}`, type: draft.type, remark, images: clone(draft.images),
      status: '异常中', reportedAt: GROUND_NOW, actor: getSession().accountId, actorName: getSession().name,
      previousStatus: bill.status, trajectoryLength: bill.trajectory.length + 1, multipleOpen: open.length > 0 }
    for (const row of open) row.multipleOpen = true
    bill.exceptions ||= []
    bill.exceptions.push(record)
    if (bill.status !== '异常中') bill.fulfillmentStatus = bill.status
    bill.status = '异常中'; bill.exceptionStatus = '异常中'
    trajectory(bill, '上报异常', [draft.type, remark].filter(Boolean).join('；'))
    return record
  }
  function closeGroundException(id, exceptionId, remark = '') {
    const bill = find(id), record = bill.exceptions?.find(row => row.id === exceptionId)
    const error = groundExceptionCloseReason(bill, record) || groundRemarkError(remark)
    if (error) throw new Error(error)
    record.status = '已关闭'; record.closedAt = GROUND_NOW; record.closedBy = getSession().accountId; record.closeRemark = remark.trim()
    bill.status = record.previousStatus; bill.fulfillmentStatus = record.previousStatus; bill.exceptionStatus = '异常已关闭'
    trajectory(bill, '取消异常', remark.trim())
    bill.trajectory.at(-1).exceptionId = record.id
    return record
  }
  function saveGroundDocument(id, draft, documentId = '') {
    const bill = find(id), existing = documentId ? bill.documents?.find(row => row.id === documentId) : null
    if (documentId && !existing) throw new Error('单据已不存在，请重新查询')
    if (existing?.type === '杂费单据') throw new Error('杂费单据不提供修改入口，已通过须走调整单')
    const errors = groundDocumentErrors(draft)
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0])
    bill.documents ||= []
    const serial = (bill.documentSequence || 0) + 1
    const record = { type: draft.type, remark: String(draft.remark || '').trim(), images: clone(draft.images), feeItem:'',amount:null,
      approvalStatus:'',actor:getSession().accountId,updatedAt:GROUND_NOW }
    if (existing) Object.assign(existing,record)
    else { bill.documentSequence = serial; bill.documents.push({...record,id:`${id}-DOC${serial}`,createdAt:GROUND_NOW,source:'航晟客服'}) }
    return existing || bill.documents.at(-1)
  }
  function deleteGroundDocument(id, documentId) {
    const bill = find(id), index = bill.documents?.findIndex(row => row.id === documentId) ?? -1
    if (index < 0) throw new Error('单据已不存在，请重新查询')
    if (bill.documents[index].type === '杂费单据') throw new Error('杂费单据不提供删除入口')
    bill.documents.splice(index,1)
  }
  function reviewGroundDocument(id, documentId, decision) {
    const bill = find(id), record = bill.documents?.find(row => row.id === documentId)
    if (record?.type !== '杂费单据' || record.approvalStatus !== '待审批') throw new Error('仅待审批杂费单据可审批')
    if (!['通过','驳回','通过并修改金额'].includes(decision?.result)) throw new Error('请选择审批结果')
    if (decision.result !== '驳回') throw new Error('杂费通过后的入账与财务审批衔接待确认（140）')
    Object.assign(record,{approvalStatus:'驳回',approvalRemark:String(decision.remark || ''),actor:getSession().accountId,updatedAt:GROUND_NOW})
    return record
  }
  return { reportGroundException, closeGroundException, saveGroundDocument, deleteGroundDocument, reviewGroundDocument }
}
