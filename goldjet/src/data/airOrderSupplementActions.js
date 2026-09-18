import { GROUND_NOW } from '../domain/groundOperations.js'
import {
  getAirSupplementRestriction, getAirOrderCodeRestriction, getHouseBillEditRestriction, normalizeAirSupplementDraft,
  normalizeHouseBillDraft, validateAirSupplement, validateHouseBillDraft, cloneAirSupplementValue, stringifyAirSupplementValue,
} from '../domain/airOrderSupplement.js'

const clone = cloneAirSupplementValue
const serviceNames = { pickup: '提货', warehouse: '仓储', transfer: '中转', customs: '报关', security: '货站安检', clearance: '清关派送' }

export const createAirServiceRecords = (id, selections, draft, sequence, existing = []) => Object.entries(selections)
  .filter(([type, enabled]) => enabled && serviceNames[type] && !existing.some(row => row.type === type && row.status !== '服务已取消'))
  .map(([type]) => ({
    id: `${id}-${type.toUpperCase()}-${sequence}`, type, name: serviceNames[type], status: '待服务',
    createdAt: GROUND_NOW, simulation: '本地服务记录，未发送外部系统',
    details: clone(type === 'warehouse' ? { operations: draft.warehouseOperations || [] } : draft[type] || {}),
  }))

export function createAirOrderSupplementActions(state, getSession) {
  const reject = reason => { if (reason) throw new Error(reason) }
  const check = fields => { if (Object.keys(fields).length) throw Object.assign(new Error(Object.values(fields)[0]), { fields }) }
  const parentFor = id => {
    const order = state.airOrders.find(row => row.id === id)
    reject(getAirSupplementRestriction(order, getSession()))
    return order
  }
  const childrenFor = id => state.airChildren.filter(row => row.parentId === id && !row.deleted)
  const nextEvent = () => {
    const current = Number.isSafeInteger(state.airOrderEventSequence) && state.airOrderEventSequence >= 0 ? state.airOrderEventSequence : 0
    if (current >= Number.MAX_SAFE_INTEGER) throw new Error('订单演示事件序号已用尽，请恢复演示数据')
    return current + 1
  }

  function saveAirSupplement(orderId, payload) {
    const order = parentFor(orderId), children = childrenFor(orderId)
    const draft = normalizeAirSupplementDraft(payload, order, state.airMaster)
    check(validateAirSupplement(draft, order, children, state.airMaster))
    // Re-submission cannot silently modify a previously generated service.
    for (const service of order.services || []) {
      if (!['transfer', 'customs', 'security', 'clearance'].includes(service.type) || service.status === '服务已取消') continue
      if (!draft.groundServices[service.type] || stringifyAirSupplementValue(draft[service.type]) !== stringifyAirSupplementValue(service.details)) throw new Error('已生成服务须通过独立服务修改或取消流程处理，补录提交不会覆盖原服务')
    }
    const sequence = nextEvent()
    const services = createAirServiceRecords(order.id, draft.groundServices, draft, sequence, order.services || [])
    const childUpdates = order.orderType === '合成主订单' ? [] : children.filter(row => row.orderStatus === '子订单暂存').map(child => {
      const serviceDraft = normalizeHouseBillDraft(child, { ...order, ...child, booking: order.booking, waybillNo: order.waybillNo, waybill: child.waybill })
      return { child, updates: {
        orderStatus: '子订单完成', completedAt: GROUND_NOW, updatedAt: GROUND_NOW,
        serviceRecords: [...(child.serviceRecords || []), ...createAirServiceRecords(child.id, child.services, serviceDraft, sequence, child.serviceRecords || [])],
      } }
    })
    const updates = {
      supplement: clone(draft), orderType: draft.orderType, code: draft.code,
      orderStatus: '待出提单', supplementedAt: GROUND_NOW, updatedAt: GROUND_NOW,
      services: [...(order.services || []), ...services],
    }
    Object.assign(order, updates)
    for (const { child, updates: values } of childUpdates) Object.assign(child, values)
    state.airOrderEventSequence = sequence
    return order
  }

  function saveAirOrderCode(orderId, code) {
    const order = state.airOrders.find(row => row.id === orderId), session = getSession()
    reject(getAirOrderCodeRestriction(order, session))
    if (!['', 'EAP', 'EAW'].includes(code)) throw new Error('代码只能选择 EAP 或 EAW')
    const sequence = nextEvent()
    order.code = code
    if (order.supplement) order.supplement.code = code
    order.updatedAt = GROUND_NOW
    state.airOrderEventSequence = sequence
    return order
  }

  function saveAirHouseBill(parentId, childId, payload) {
    const order = parentFor(parentId)
    const existing = childId ? state.airChildren.find(row => row.id === childId) : null
    if (childId && !existing) throw new Error('分单不存在')
    reject(getHouseBillEditRestriction(order, existing, getSession()))
    const draft = normalizeHouseBillDraft(payload, existing ? { ...order, ...existing, booking: order.booking, waybillNo: order.waybillNo, waybill: existing.waybill } : order)
    check(validateHouseBillDraft(draft, state.airMaster))
    if (draft.housebillNo && state.airChildren.some(row => row.id !== childId && row.housebillNo?.toUpperCase() === draft.housebillNo.toUpperCase())) throw Object.assign(new Error('分单号已存在'), { fields: { housebillNo: '分单号已存在' } })
    let sequence = Number.isSafeInteger(state.airChildSequence) && state.airChildSequence >= 0 ? state.airChildSequence : 0
    let id = childId, generatedNo = ''
    if (!existing) {
      do {
        if (sequence >= 99999999) throw new Error('分单演示序号已用尽，请恢复演示数据')
        sequence += 1
        id = `AIR-CHILD-${String(sequence).padStart(8, '0')}`
        generatedNo = `DEMO${String(sequence).padStart(8, '0')}`
      } while (state.airChildren.some(row => row.id === id || (!draft.housebillNo && row.housebillNo?.toUpperCase() === generatedNo)))
    } else if (!draft.housebillNo) {
      generatedNo = existing.housebillNo
    }
    const child = {
      ...(existing || {}), ...clone(draft), id, orderNo: existing?.orderNo || id, parentId, isChild: true,
      housebillNo: draft.housebillNo || generatedNo, identifierSource: draft.housebillNo ? (existing?.housebillNo === draft.housebillNo ? existing.identifierSource || '客户提供' : '客户提供') : existing?.identifierSource || '合成演示编号',
      customer: order.customer, creator: existing?.creator || getSession().name, owner: existing?.owner || order.owner,
      origin: order.origin, orderStatus: '子订单暂存', cargoSource: '预计',
      pieces: Number(draft.pieces), grossWeight: Number(draft.grossWeight), volume: Number(draft.volume),
      serviceRecords: clone(existing?.serviceRecords || []), createdAt: existing?.createdAt || GROUND_NOW, updatedAt: GROUND_NOW,
    }
    if (existing) Object.assign(existing, child)
    else { state.airChildren.push(child); state.airChildSequence = sequence }
    return existing || child
  }

  function cancelAirHouseBill(parentId, childId) {
    const order = parentFor(parentId), child = state.airChildren.find(row => row.id === childId && row.parentId === parentId)
    if (!child || child.deleted) throw new Error('分单不存在或不属于当前主订单')
    if (order.orderType === '合成主订单') throw new Error('合成主订单的原子订单信息只读')
    if (child.orderStatus !== '子订单暂存') throw new Error('完成分单的取消、保留服务与结算费用处理待确认，暂不取消')
    if (child.serviceRecords?.length) throw new Error('暂存分单已有服务记录，取消后服务处理待确认，暂不取消')
    state.airChildren = state.airChildren.filter(row => row.id !== childId)
    return child
  }

  function moveAirHouseBill(parentId, childId) {
    const order = parentFor(parentId), child = state.airChildren.find(row => row.id === childId && row.parentId === parentId)
    if (!child) throw new Error('分单不存在或不属于当前主订单')
    if (order.orderType === '合成主订单') throw new Error('合成主订单的原子订单信息只读')
    if (!['子订单暂存', '子订单完成'].includes(child.orderStatus) || child.deleted) throw new Error('当前分单状态不允许移单')
    child.parentId = ''
    child.updatedAt = GROUND_NOW
    return child
  }

  function importAirHouseBills(parentId, ids) {
    const order = parentFor(parentId), session = getSession()
    if (order.orderType === '合成主订单') throw new Error('合成主订单的原子订单信息只读')
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) throw new Error('请选择需要引入的子订单')
    if (new Set(ids).size !== ids.length) throw new Error('不可重复选择同一子订单')
    const selected = ids.map(id => state.airChildren.find(row => row.id === id))
    for (const child of selected) {
      if (!child || child.deleted) throw new Error('选择的子订单不存在或已删除')
      if (child.parentId) throw new Error('已关联主订单的子订单能否再次引入待确认；当前演示仅支持未关联子订单')
      if (child.customer !== order.customer) throw new Error('只能引入同一客户的子订单')
      if (session.role === 'service' && child.creator !== session.name) throw new Error('只能引入本人可见的子订单')
      if (!['子订单暂存', '子订单完成'].includes(child.orderStatus)) throw new Error('该状态的子订单能否引入待确认；当前演示仅支持暂存或完成子订单')
    }
    for (const child of selected) { child.parentId = parentId; child.updatedAt = GROUND_NOW }
    return selected
  }

  return { saveAirSupplement, saveAirOrderCode, saveAirHouseBill, cancelAirHouseBill, moveAirHouseBill, importAirHouseBills }
}
