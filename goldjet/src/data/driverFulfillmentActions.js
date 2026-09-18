import { canWriteModule } from './accessControl.js'
import { syncGroundWaybillOrder } from './groundWaybillActions.js'
import { groundImagesError, groundRemarkError } from '../domain/groundWaybills.js'
import { DRIVER_DEMO, DRIVER_EXCEPTION_TYPES, driverOwns, driverStatus, driverNextNode, driverTime, driverWindow, driverDocumentErrors } from '../domain/driverTasks.js'
const clone = value => JSON.parse(JSON.stringify(value))

export function createDriverFulfillmentActions(state, getSession, getPersona) {
  function find(id) {
    const session = getSession()
    if (getPersona() !== 'driver' || !canWriteModule('driver') || !session.phone) throw new Error('请使用获授权的司机身份登录')
    const bill = state.groundWaybills.find(row => row.id === id)
    if (!bill || !driverOwns(bill, session.phone)) throw new Error('无权操作该运单')
    return bill
  }
  const now = () => driverTime(state.driverClockMs)
  const actor = bill => ({ actor: `DRIVER-${getSession().phone}`, actorId: `DRIVER-${getSession().phone}`, actorPhone: getSession().phone, actorName: bill.drivers.find(row => row.phone === getSession().phone)?.name || '', role: '司机' })
  function trajectory(bill, event, remark, extra = {}) {
    bill.trajectory.push({ id: `${bill.id}-T${bill.trajectory.length+1}`, event, status: driverStatus(bill), time: now(), remark: remark || '', ...actor(bill), ...extra })
    bill.updatedAt = now()
    syncGroundWaybillOrder(state, bill, now())
    state.driverClockMs += 60000
  }
  function appendDocument(bill, draft) {
    bill.documents ||= []
    const serial = (bill.documentSequence || 0) + 1
    const record = { id: `${bill.id}-DOC${serial}`, type: draft.type, remark: String(draft.remark || '').trim(), images: clone(draft.images), source: '司机', ...actor(bill), createdAt: now(), updatedAt: now(), feeItem: '', amount: null, approvalStatus: '', cargoDocuments: draft.type === '提货单据' ? draft.cargoDocuments || '' : '' }
    bill.documentSequence = serial; bill.documents.push(record)
    if (draft.type === '提货单据' && draft.cargoDocuments) bill.cargoDocuments = draft.cargoDocuments
    return record
  }
  function confirmDriverNode(id, expectedStatus, draft) {
    const bill = find(id), node = driverNextNode(bill)
    if (!node || expectedStatus !== driverStatus(bill)) throw new Error('运单节点已变化，请返回后重新确认')
    const errors = node.document ? driverDocumentErrors({ ...draft, type: node.document }, false) : {}
    if (Object.values(errors).some(Boolean)) throw new Error(Object.values(errors).find(Boolean))
    if (node.document) appendDocument(bill, { ...draft, type: node.document })
    bill.fulfillmentStatus = node.to
    if (bill.status !== '异常中') bill.status = node.to
    if (node.to === '提货中') {
      bill.expectedArrival = bill.pickupPoints?.length === 1 ? driverTime(state.driverClockMs + DRIVER_DEMO.travelMinutes * 60000) : ''
      bill.expectedArrivalSource = bill.pickupPoints?.length === 1 ? '本地模拟地图耗时25分钟' : '多提货点ETA目标待确认（157）'
    }
    trajectory(bill, node.event, draft.remark, { location: DRIVER_DEMO.location })
    return bill
  }
  function uploadDriverDocument(id, draft) {
    const bill = find(id), window = driverWindow(bill, 'document', state.driverClockMs)
    if (!window.allowed) throw new Error(window.reason)
    const errors = driverDocumentErrors(draft)
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0])
    const record = appendDocument(bill, draft)
    state.driverClockMs += 60000
    return record
  }
  function reportDriverException(id, draft) {
    const bill = find(id), window = driverWindow(bill, 'exception', state.driverClockMs)
    if (!window.allowed) throw new Error(window.reason)
    if (!DRIVER_EXCEPTION_TYPES.includes(draft.type)) throw new Error('请选择异常类型')
    const error = groundRemarkError(draft.remark) || groundImagesError(draft.images, 15)
    if (error) throw new Error(error)
    bill.exceptions ||= []
    const open = bill.exceptions.filter(row => row.status === '异常中')
    const record = { id: `${id}-EX${bill.exceptions.length+1}`, type: draft.type, remark: String(draft.remark || '').trim(), images: clone(draft.images), status: '异常中', reportedAt: now(), ...actor(bill), previousStatus: driverStatus(bill), trajectoryLength: bill.trajectory.length + 1, multipleOpen: open.length > 0 }
    open.forEach(row => { row.multipleOpen = true })
    bill.exceptions.push(record); bill.exceptionStatus = '异常中'
    trajectory(bill, '上报异常', [draft.type, draft.remark].filter(Boolean).join('；'), { exceptionId: record.id })
    state.messages.push({ id: `MSG-${record.id}`, recipientRole: 'hangsheng', type: '司机异常提醒', content: `运单号${bill.waybillNo}：司机（联系方式：${getSession().phone}）上报了异常（${draft.type}），请关注处理！`, createdAt: record.reportedAt, related: { path: '/fulfillment/ground-waybills', query: { waybill: bill.id } }, channel: '本地模拟' })
    return record
  }
  return { confirmDriverNode, uploadDriverDocument, reportDriverException }
}
