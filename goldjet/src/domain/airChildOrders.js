import { AIR_PRODUCTS, AIR_PRICE_FIELDS, createAirDraft, validateAirDraft, validateAirPrices } from './airOperations.js'
import { decimalTotal } from './airCapacity.js'
import { hasAirActualCargo } from './airOrderSupplement.js'

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
const empty = value => value === undefined || value === null || value === ''
const baseKeys = Object.keys(createAirDraft())
export const AIR_CHILD_PRICE_FIELDS = AIR_PRICE_FIELDS
export const AIR_CHILD_TABLE = { pagination: true, pageSize: 10, selection: 'cross-page', rowActions: ['detail', 'edit', 'submit', 'copy', 'delete'], sort: [] }

export function createAirChildDraft(order = {}) {
  const draft = { ...createAirDraft(), shipper: '', consignee: '', housebillNo: '', batchManagement: false }
  for (const key of [...baseKeys, 'shipper', 'consignee', 'housebillNo', 'batchManagement']) if (Object.hasOwn(order, key)) draft[key] = clone(order[key])
  draft.services = { booking: false, warehouse: order.services?.warehouse ?? true, pickup: order.services?.pickup ?? false }
  return draft
}

export function normalizeAirChildDraft(payload = {}) {
  const draft = createAirChildDraft()
  for (const key of Object.keys(draft)) if (Object.hasOwn(payload, key)) draft[key] = clone(payload[key])
  for (const key of ['customer', 'owner', 'contact', 'phone', 'flowTo', 'goodsName', 'shipper', 'consignee', 'housebillNo']) if (typeof draft[key] === 'string') draft[key] = draft[key].trim()
  draft.services = { booking: false, warehouse: payload.services?.warehouse, pickup: payload.services?.pickup }
  return draft
}

export function validateAirChildPrices(draft = {}) {
  return validateAirPrices(draft)
}

export function validateAirChildDraft(draft, partners, catalog) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return { child: '子订单信息格式不正确' }
  const errors = validateAirDraft({ ...draft, services: { ...draft.services, booking: true } }, partners, catalog)
  if (!draft.services || ['warehouse', 'pickup'].some(key => typeof draft.services[key] !== 'boolean')) errors.services = '请选择有效的服务项'
  if (draft.batchManagement) errors.batchManagement = '批次编号及累计发送边界待确认，本轮可提交不使用批次管理的子订单'
  for (const key of ['shipper', 'consignee']) if (!empty(draft[key]) && (typeof draft[key] !== 'string' || draft[key].length > 500)) errors[key] = '收发货人信息最多 500 个字符'
  if (!empty(draft.housebillNo) && (typeof draft.housebillNo !== 'string' || !/^[A-Za-z0-9]{12}$/.test(draft.housebillNo))) errors.housebillNo = '分单号须为 12 位字母或数字'
  return errors
}

export function getAirChildRestriction(order, session = {}, action = 'edit') {
  if (session.readAll && action === 'detail') return order?.deleted ? '子订单已删除' : ''
  if (!['service', 'supervisor', 'hangsheng'].includes(session.role)) return '仅空运客服、客服主管或航晟客服可处理子订单'
  if (!order) return ''
  if (order.deleted || order.orderStatus === '已取消') return '子订单已删除或取消'
  if (session.role !== 'supervisor' && order.creator !== session.name) return '仅可处理本人创建的子订单'
  if (order.parentId && action !== 'detail') return '子订单已归属主订单，请在主订单中查看；来源信息只读'
  if (order.sourceKind !== 'standalone' && action !== 'detail') return '本入口暂支持独立子订单；移入的分单可查看或引入主订单'
  if (action === 'submit' && order.orderStatus !== '子订单暂存') return '仅暂存子订单可提交'
  if (!['子订单暂存', '子订单完成'].includes(order.orderStatus)) return '当前子订单状态不能执行此操作'
  return ''
}

export function createAirConsolidationDraft() {
  return { origin: '', destination: '', flowTo: '', airline: '', product: '', bookingRequirement: '' }
}

export function getAirConsolidationContext(children = []) {
  const reasons = []
  if (!children.length) reasons.push('请选择至少一个子订单')
  if (children.some(row => row.orderStatus !== '子订单完成' || row.deleted || row.parentId || row.sourceKind !== 'standalone')) reasons.push('本轮支持未归属主订单的已完成独立子订单，其他候选资格待确认')
  const customers = [...new Set(children.map(row => row.customer))]
  if (customers.length > 1) reasons.push('跨客户合成的归属与操作权限待确认；可先选择同一客户的子订单')
  if (children.some(row => row.batchManagement || row.batches?.length)) reasons.push('含批次子订单的合成与已发送数量处理待确认')
  if (children.some(hasAirActualCargo)) reasons.push('已有实测毛件体的合成取值待确认，本轮支持仅有预计数据的子订单')
  if (children.some(row => empty(row.foamRatio))) reasons.push('分泡未填写时的收客户重量缺少确定口径，请先补齐子订单报价中的分泡')
  if (children.some(row => ['pieces', 'grossWeight', 'volume'].some(key => !Number.isFinite(Number(row[key])) || Number(row[key]) <= 0))) reasons.push('子订单预计毛件体不完整')
  const trucks = children.filter(row => !empty(row.truckSellRate))
  if (trucks.length > 0 && trucks.length !== children.length) reasons.push('部分子订单未填后段卡车卖价，其合成费用口径待确认')
  if (children.some(row => Object.keys(validateAirChildPrices(row)).length)) reasons.push('子订单报价不符合填写范围')
  const totals = Object.fromEntries(['pieces', 'grossWeight', 'volume'].map(key => [key, children.every(row => Number.isFinite(Number(row[key]))) ? decimalTotal(children.map(row => [Number(row[key])])) : null]))
  const customerWeights = children.map(row => (Number(row.volume) * 166.66 - Number(row.grossWeight)) * Number(row.foamRatio) + Number(row.grossWeight))
  const sumCustomerWeight = customerWeights.reduce((sum, value) => sum + value, 0)
  const chargeWeights = children.map(row => Math.max(Number(row.grossWeight), Number(row.volume) * 166.66))
  const sumChargeWeight = chargeWeights.reduce((sum, value) => sum + value, 0)
  const sellRate = reasons.length || sumCustomerWeight <= 0 ? null : children.reduce((sum, row, index) => sum + Number(row.sellRate) * customerWeights[index], 0) / sumCustomerWeight
  const truckSellRate = reasons.length || !trucks.length || sumChargeWeight <= 0 ? null : children.reduce((sum, row, index) => sum + Number(row.truckSellRate) * chargeWeights[index], 0) / sumChargeWeight
  return { reasons, customers, owners: [...new Set(children.map(row => row.owner).filter(Boolean))], ...totals, sellRate, truckSellRate, chargeWeight: Math.max(totals.grossWeight, totals.volume * 166.66) }
}

export function validateAirConsolidation(draft = {}, children = [], catalog = {}) {
  const errors = {}
  const context = getAirConsolidationContext(children)
  if (context.reasons.length) errors.children = context.reasons.join('；')
  for (const key of ['origin', 'destination']) if (!(catalog.ports || []).some(row => row.code === draft[key])) errors[key] = '请重新选择始发港和目的港'
  if (!(catalog.airlines || []).some(row => row.name === draft.airline)) errors.airline = '请选择航司基础数据中的航司'
  if (!AIR_PRODUCTS.some(row => row.id === draft.product && row.airline === draft.airline)) errors.product = '请选择所选航司的产品'
  if (typeof draft.bookingRequirement !== 'string' || draft.bookingRequirement.length > 50) errors.bookingRequirement = '订舱要求最多 50 个字符'
  return errors
}
