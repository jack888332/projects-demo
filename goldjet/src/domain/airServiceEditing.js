import { createAirDraft, validateAirDraft } from './airOperations.js'
import {
  AIR_WAREHOUSE_OPERATIONS, cloneAirSupplementValue, createAirSupplementDraft,
  normalizeAirSupplementDraft, validateAirServiceInputs,
} from './airOrderSupplement.js'

const editableTypes = ['pickup', 'warehouse', 'transfer', 'security', 'clearance']
const clone = cloneAirSupplementValue
const sourceFor = (order, child) => {
  const englishGoodsName = child ? child.englishGoodsName || '' : order.supplement?.englishGoodsName || order.englishGoodsName || ''
  return { ...order, ...(child || {}), booking: order.booking, waybillNo: order.waybillNo, waybill: child ? child.waybill : order.waybill,
    englishGoodsName, supplement: { englishGoodsName } }
}

export function getAirServiceEditRestriction(order, service, session = {}, child) {
  if (!order) return '主订单不存在'
  if (!service) return '服务不存在'
  if (!['service', 'supervisor'].includes(session.role) && !(session.role === 'hangsheng' && order.orderType === '合成主订单')) return '仅空运客服、客服主管或合成主订单的航晟客服可修改服务'
  if (session.role !== 'supervisor' && (order.creator !== session.name || (child && child.creator !== session.name))) return '仅可修改本人订单的服务；派单后的权限边界待确认'
  if (child && (child.parentId !== order.id || child.deleted || child.orderStatus === '已取消')) return '分单不存在、已取消或不属于当前主订单'
  if (order.deleted || ['已作废', '已废除', '异常作废'].includes(order.orderStatus)) return '订单作废后的服务处理待确认，暂不能修改'
  if (service.status !== '待服务') return '仅待服务的服务可修改；服务中及已结束服务不可编辑'
  if (service.type === 'booking') return '订舱信息请从订舱管理维护'
  if (service.type === 'customs') return '报关材料与服务发送条件待确认，暂不能重发报关指令'
  if (!editableTypes.includes(service.type)) return '该服务的修改规则待确认'
  return ''
}

export function createAirServiceEditDraft(order = {}, service = {}, child) {
  const source = sourceFor(order, child), details = service.details || {}
  const draft = createAirSupplementDraft(source)
  draft.pickup = { ...createAirDraft().pickup, ...clone(source.pickup || {}) }
  draft.warehouseOperations = clone(source.warehouseOperations || [])
  if (service.type === 'pickup') draft.pickup = { ...draft.pickup, ...clone(details) }
  else if (service.type === 'warehouse') draft.warehouseOperations = clone(details.operations || draft.warehouseOperations)
  else if (editableTypes.includes(service.type)) {
    const saved = normalizeAirSupplementDraft({ ...draft, [service.type]: details }, source)
    draft[service.type] = saved[service.type]
  }
  return draft
}

export function normalizeAirServiceEditDraft(payload, order, service, child) {
  const source = sourceFor(order, child), draft = createAirServiceEditDraft(order, service, child)
  if (service.type === 'pickup') {
    for (const key of Object.keys(createAirDraft().pickup)) if (Object.hasOwn(payload?.pickup || {}, key)) draft.pickup[key] = clone(payload.pickup[key])
  } else if (service.type === 'warehouse') draft.warehouseOperations = clone(payload?.warehouseOperations)
  else {
    const normalized = normalizeAirSupplementDraft({ ...draft, [service.type]: { ...draft[service.type], ...(payload?.[service.type] || {}) } }, source)
    draft[service.type] = normalized[service.type]
  }
  return draft
}

export function validateAirServiceEdit(draft, order, service, child) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return { service: '服务信息格式不正确' }
  if (!service || !editableTypes.includes(service.type)) return { service: '该服务的修改规则尚未开放' }
  if (service.type === 'pickup') {
    const errors = validateAirDraft({ ...createAirDraft(), pickup: draft.pickup, services: { booking: true, pickup: true } }, [])
    return Object.fromEntries(Object.entries(errors).filter(([key]) => key.startsWith('pickup.')))
  }
  if (service.type === 'warehouse') return Array.isArray(draft.warehouseOperations) && draft.warehouseOperations.every(value => AIR_WAREHOUSE_OPERATIONS.includes(value)) ? {} : { warehouseOperations: '请选择已定义的仓库操作' }
  return validateAirServiceInputs(draft, { [service.type]: true }, { submitting: true })
}

export function airServiceDetailsFromDraft(draft, type) {
  return clone(type === 'warehouse' ? { operations: draft.warehouseOperations } : draft[type])
}
