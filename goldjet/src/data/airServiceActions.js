import { GROUND_NOW } from '../domain/groundOperations.js'
import { cloneAirSupplementValue } from '../domain/airOrderSupplement.js'
import {
  airServiceDetailsFromDraft, getAirServiceEditRestriction, normalizeAirServiceEditDraft, validateAirServiceEdit,
} from '../domain/airServiceEditing.js'

export function createAirServiceActions(state, getSession) {
  function saveAirServiceDetails(orderId, serviceId, payload, childId = '') {
    const order = state.airOrders.find(row => row.id === orderId)
    const child = childId ? state.airChildren.find(row => row.id === childId) : undefined
    if (childId && !child) throw new Error('分单不存在')
    const service = (child ? child.serviceRecords : order?.services)?.find(row => row.id === serviceId)
    const session = getSession(), reason = getAirServiceEditRestriction(order, service, session, child)
    if (reason) throw new Error(reason)
    const draft = normalizeAirServiceEditDraft(payload, order, service, child)
    const fields = validateAirServiceEdit(draft, order, service, child)
    if (Object.keys(fields).length) throw Object.assign(new Error(Object.values(fields)[0]), { fields })
    const current = Number.isSafeInteger(state.airOrderEventSequence) && state.airOrderEventSequence >= 0 ? state.airOrderEventSequence : 0
    if (current >= Number.MAX_SAFE_INTEGER) throw new Error('订单演示事件序号已用尽，请恢复演示数据')
    const sequence = current + 1, details = airServiceDetailsFromDraft(draft, service.type)
    const transmission = { id: `${service.id}-RESEND-${sequence}`, sentAt: GROUND_NOW, sender: session.name,
      kind: '重新发送', details: cloneAirSupplementValue(details), simulation: '本地重发记录，未发送外部系统' }
    const transmissions = [...(service.transmissions || []), transmission]
    const target = child || order
    const sourceUpdates = service.type === 'warehouse' ? { warehouseOperations: cloneAirSupplementValue(draft.warehouseOperations) }
      : service.type === 'pickup' ? { pickup: cloneAirSupplementValue(details) }
        : child ? { [service.type]: cloneAirSupplementValue(details) }
          : { supplement: { ...(order.supplement || {}), [service.type]: cloneAirSupplementValue(details) } }
    Object.assign(service, { details, transmissions, resendCount: transmissions.length, lastSentAt: GROUND_NOW, updatedAt: GROUND_NOW })
    Object.assign(target, sourceUpdates, { updatedAt: GROUND_NOW })
    state.airOrderEventSequence = sequence
    return service
  }
  return { saveAirServiceDetails }
}
