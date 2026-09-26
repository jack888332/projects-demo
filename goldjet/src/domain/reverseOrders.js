// PRD 017 逆向订单与增值服务：退运、退供、客退、消退与增值服务作业。
import { BBC_TODAY } from './bbcCustomerOrders.js'

export const REVERSE_NOW = '2026-09-08 14:30'
export const REVERSE_CATEGORIES = ['空运退运', 'BC/CC退运', 'BBC客退', 'BBC消退', '退供', 'BBC库存退运']
export const REVERSE_STATUSES = ['未提交', '待接单', '进行中', '已完成', '已取消']
export const REVERSE_BUSINESS_TYPES = ['出口退运', '进口退运', 'BC进口退运', 'CC进口退运', 'BC进口退供', 'CC进口退供', 'BBC进口']
export const VALUE_ADDED_ITEMS = ['拆盒', '贴标', '其他']
export const VALUE_ADDED_STATUSES = ['待接单', '进行中', '已完成', '已取消', '已终止']
export const REVERSE_SERVICE_SETS = {
  空运退运: [['warehouse', '仓储服务'], ['customs', '关务服务'], ['transport', '运输服务'], ['ground', '地面操作'], ['valueAdded', '增值服务']],
  'BC/CC退运': [['warehouse', '仓储服务'], ['transport', '运输服务'], ['customs', '关务服务'], ['valueAdded', '增值服务']],
  BBC客退: [['transport', '运输服务'], ['warehouse', '仓储服务']],
  BBC消退: [['transport', '运输服务'], ['warehouse', '仓储服务'], ['customs', '关务服务']],
  退供: [['warehouse', '仓储服务'], ['transport', '运输服务'], ['security', '货站安检'], ['clearance', '清关派送']],
  BBC库存退运: [['warehouse', '仓储服务'], ['customs', '关务服务'], ['transport', '运输服务'], ['security', '货站安检']],
}

const text = value => String(value ?? '').trim()

export function reversePermissions(role) {
  const isSuper = role === 'superAdmin'
  return {
    createReturn: !isSuper && ['service', 'supervisor', 'business'].includes(role),
    createStockReturn: !isSuper && ['service', 'supervisor', 'business'].includes(role),
    handleValueAdded: !isSuper && ['service', 'supervisor', 'warehouseService', 'warehouseSupervisor'].includes(role),
    read: true,
  }
}

// 原型空运订单状态为待订舱/待补录/待出提单/已出提单/已完成等；与第017篇“进行中、已完成或已取消”的
// 完整映射待确认（见分析清单 GJ-PRD-227），这里开放订舱完成后的在途状态与终态。
const AIR_RETURN_OPEN_STATUSES = ['待补录', '待出提单', '已出提单', '已完成', '已取消']

export function airReturnEligibility(order) {
  if (!order) return { ok: false, message: '未找到原空运订单' }
  if (!AIR_RETURN_OPEN_STATUSES.includes(order.orderStatus)) return { ok: false, message: '当前订单不支持发起退运' }
  return { ok: true, message: '' }
}

export function bcccReturnEligibility(orders) {
  if (!orders?.length) return { ok: false, message: '请选择小订单' }
  if (orders.some(order => !order.customerCancelled)) return { ok: false, message: '所选订单不支持发起退运：客户取消订单必须为是' }
  const modes = new Set(orders.map(order => order.mode))
  if (modes.size > 1) return { ok: false, message: '所选订单业务模式需一致' }
  const types = new Set(orders.map(order => order.businessType))
  if (types.size > 1) return { ok: false, message: 'BC 与 CC 需分别发起退运，不能混合生成一个退运订单' }
  return { ok: true, message: '' }
}

export function createReverseOrderNo(sequence, date = BBC_TODAY) {
  return `VR${date.slice(2).replaceAll('-', '')}${String(sequence).padStart(5, '0')}`
}

export function createValueAddedServiceNo(sequence, date = BBC_TODAY) {
  return `S111${date.slice(2).replaceAll('-', '')}${String(sequence).padStart(5, '0')}`
}

export function reverseServiceDraft(category) {
  return (REVERSE_SERVICE_SETS[category] || []).map(([key, label]) => ({ key, label, selected: ['warehouse', 'customs'].includes(key), status: '待接单', generated: false, id: '' }))
}

export function createReverseDraft(category, values = {}) {
  return {
    id: '', orderNo: '', category, businessType: '', customer: '', customerPartnerId: '', sourceOrderId: '', sourceLabel: '',
    status: '未提交', transportMode: '', originPort: '', destinationPort: '', waybillNo: '',
    contactName: '', contactPhone: '', contactEmail: '', remark: '', customerRemark: '',
    goods: [], services: reverseServiceDraft(category), attachments: [],
    createdAt: '', submittedAt: '', creator: '', customerCancelled: false, returnResult: '', ...values,
  }
}

export function bbcReturnRows(order, kind = 'consumer') {
  return (order?.goods || []).map(row => ({
    id: row.id, productId: row.productId, barcode: row.barcode, name: row.name, hsCode: row.hsCode, originCountry: row.originCountry,
    originalQuantity: Number(row.quantity) || 0, unit: row.unit || '件', quantity: Number(row.quantity) || 0,
    previousQuantity: Number(kind === 'consumer' ? row.consumerReturnQty : row.cancelReturnQty) || 0,
  }))
}

export function validateReturnSupplyRows(rows, { warehouse, stock = [] } = {}) {
  const errors = {}
  for (const [index, row] of (rows || []).entries()) {
    const good = row.goodQty === '' || row.goodQty == null ? null : Number(row.goodQty)
    const defect = row.defectQty === '' || row.defectQty == null ? null : Number(row.defectQty)
    if (!text(row.barcode)) errors[`${index}.barcode`] = '请选择或输入商品条码'
    if ((good === null || good === 0) && (defect === null || defect === 0)) errors[`${index}.quantity`] = '退供良品与不良品数量不得同时为空或同时为 0'
    for (const [value, label] of [[good, '良品'], [defect, '不良品']]) if (value !== null && (!Number.isInteger(value) || value < 0)) errors[`${index}.quantity`] = `${label}数量须为不小于 0 的整数`
    const entry = stock.find(item => item.warehouse === warehouse && item.barcode === row.barcode)
    if (!entry) errors[`${index}.stock`] = `条码 ${row.barcode} 在所选仓库没有库存`
    else {
      if (good !== null && good > entry.good) errors[`${index}.stock`] = `条码 ${row.barcode} 可分配良品库存不足`
      if (defect !== null && defect > entry.defective) errors[`${index}.stock`] = `条码 ${row.barcode} 可分配不良品库存不足`
    }
  }
  return errors
}

export function reserveStock(stock, warehouse, rows, reserveTag) {
  for (const row of rows) {
    const entry = stock.find(item => item.warehouse === warehouse && item.barcode === row.barcode)
    if (!entry) continue
    const good = Number(row.goodQty) || 0, defect = Number(row.defectQty) || 0
    entry.good -= good
    entry.defective -= defect
    entry.reserved = entry.reserved || []
    entry.reserved.push({ tag: reserveTag, warehouse, barcode: row.barcode, goodQty: good, defectQty: defect })
  }
}

export function releaseStock(stock, reserveTag) {
  for (const entry of stock) {
    const kept = []
    for (const record of entry.reserved || []) {
      if (record.tag !== reserveTag) { kept.push(record); continue }
      entry.good += record.goodQty
      entry.defective += record.defectQty
    }
    entry.reserved = kept
  }
}

export function valueAddedEligibility(service, role) {
  const handler = ['service', 'supervisor', 'warehouseService', 'warehouseSupervisor'].includes(role)
  const mine = service?.handler === '' || service?.handlerRole === role
  return {
    accept: handler && service?.status === '待接单',
    transfer: handler && service?.status === '进行中' && Boolean(service?.handler),
    edit: handler && service?.status === '进行中' && Boolean(service?.handler),
    complete: handler && service?.status === '进行中' && Boolean(service?.handler),
    terminate: handler && ['待接单', '进行中'].includes(service?.status),
    cancel: handler && ['待接单', '进行中'].includes(service?.status),
  }
}

export function validateValueAddedComplete(service) {
  const errors = {}
  for (const [key, label] of [['handler', '处理人'], ['startAt', '开始处理时间'], ['finishAt', '处理完成时间']]) {
    if (!text(service?.[key])) errors[key] = `完成服务前请填写${label}`
  }
  if (service?.outsourced === '是' && !text(service?.outsourcedSupplier)) errors.outsourcedSupplier = '委外时必须选择委外供应商'
  return errors
}
