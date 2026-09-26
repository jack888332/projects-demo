// PRD 030 §5～§6：CC进口订单、附件加工与申报、转BC、更提单、作废与退运。订单编辑（§6.2）见后续切片。
import { BC_CLEARANCE_STEPS } from './bcImportOrders.js'

export const CC_IMPORT_NOW = '2026-09-08 14:30'
export const CC_EXPRESS_TYPES = [['A', 'A类快件'], ['B', 'B类快件'], ['C', 'C类快件']]
export const CC_STATUSES = ['待报关', '电子口岸申报中', '发送海关成功', '发送海关失败', '中心入库失败\nD2', '发往海关失败\nY', '退单\n02', '退单重报\n21', '企业申请退单\n44', '放弃物品退单', '海关入库', '放行', '查验后补税放行', '查验后补证放行', '查验后补税补证放行', '查验后处罚后放', '查验后改单放行', '查验后担保放行', '查验正常货物放行', '整改合格放行', '检疫处理合格放行', '处罚后检疫处理合格放行', '处理异常']
export const CC_RETURN_ALLOWED_STATUSES = ['待报关', '中心入库失败\nD2', '发往海关失败\nY', '退单\n02', '退单重报\n21', '企业申请退单\n44', '放弃物品退单']
export const CC_VOID_ALLOWED_STATUSES = ['放行', '查验后补税放行', '查验后补证放行', '查验后补税补证放行', '查验后处罚后放', '查验后改单放行', '查验后担保放行', '查验正常货物放行', '整改合格放行', '检疫处理合格放行', '处罚后检疫处理合格放行']
export const CC_ATTACHMENT_RULES = {
  B: [['idcard', '身份证'], ['identity', '身份认证'], ['receipt', '小票'], ['face', '面单']],
  AC: [['invoice', '发票'], ['proxy', '委托书'], ['face', '面单']],
  FACE: [['face', '面单']],
}
export const CC_ATTACHMENT_TYPES = [['idcard', '身份证加工', 'B'], ['identity', '身份认证加工', 'B'], ['receipt', '小票加工', 'B'], ['invoice', '发票加工', 'AC'], ['proxy', '委托书加工', 'AC'], ['face', '面单加工', 'ANY']]

const text = value => String(value ?? '').trim()
const splitLines = value => String(value ?? '').split(/\r?\n/).map(row => row.trim()).filter(Boolean)

export function ccImportPermissions(role) {
  const operator = role === 'customsService'
  return { operate: operator, attach: operator, declare: operator, readonly: !operator }
}

export function filterCcImportOrders(rows, filters = {}) {
  const exact = (value, input) => !text(input) || splitLines(input).includes(value)
  const fuzzy = (value, query) => !text(query) || String(value || '').includes(text(query))
  const range = (value, bounds) => {
    if (!Array.isArray(bounds) || !bounds.some(Boolean)) return true
    const time = String(value || '')
    return Boolean(time) && (!bounds[0] || time >= bounds[0]) && (!bounds[1] || time <= `${bounds[1]} 23:59:59`)
  }
  return rows.filter(row =>
    exact(row.orderNo, filters.orderNo) && exact(row.outboundNo, filters.outboundNo) && exact(row.waybillNo, filters.waybillNo) &&
    exact(row.customer, filters.customer) && exact(row.expressNo, filters.expressNo) && exact(row.buyer, filters.buyer) &&
    (!filters.customerCancelled || String(row.customerCancelled) === filters.customerCancelled) &&
    (!filters.conversion || row.conversion === filters.conversion) &&
    fuzzy(row.ecommerceName, filters.ecommerceName) && fuzzy(row.platformName, filters.platformName) &&
    (!filters.warehouse || row.warehouse === filters.warehouse) &&
    (!filters.expressType || row.expressType === filters.expressType) &&
    (!filters.manifestStatus || row.manifestStatus === filters.manifestStatus) &&
    (!filters.attachmentStatus || row.attachmentStatus === filters.attachmentStatus) &&
    (!filters.expressStatus || row.expressStatus === filters.expressStatus) &&
    (!filters.returnResult || row.returnResult === filters.returnResult) &&
    (!filters.customsZone || String(row.customsZone || '').includes(text(filters.customsZone))) &&
    range(row.createdAt, filters.createdRange) &&
    BC_CLEARANCE_STEPS.every(([key]) => !filters[key] || row.logistics?.[key] === filters[key]))
}

export function requiredAttachments(expressType) {
  if (expressType === 'B') return CC_ATTACHMENT_RULES.B.map(([key, label]) => ({ key, label }))
  return CC_ATTACHMENT_RULES.AC.map(([key, label]) => ({ key, label }))
}

export function missingAttachments(order) {
  const done = new Set((order.attachments || []).map(row => row.type))
  return requiredAttachments(order.expressType).filter(item => !done.has(item.key))
}

export function ccAttachmentEligibility(orders, type) {
  if (!orders.length) return { ok: false, reason: '请选择订单' }
  const waybills = new Set(orders.map(order => order.waybillNo).filter(Boolean))
  if (waybills.size > 1) return { ok: false, reason: '请选择相同总运/提单号的订单！' }
  const rule = CC_ATTACHMENT_TYPES.find(([key]) => key === type)
  if (!rule) return { ok: false, reason: '未定义的加工类型' }
  const target = rule[2]
  if (target === 'B' && orders.some(order => order.expressType !== 'B')) return { ok: false, reason: '请选择B类快件！' }
  if (target === 'AC' && orders.some(order => !['A', 'C'].includes(order.expressType))) return { ok: false, reason: '请选择A类或C类快件！' }
  return { ok: true, reason: '' }
}

export function ccConvertEligibility(order) {
  if (!CC_RETURN_ALLOWED_STATUSES.includes(order.expressStatus)) return { ok: false, reason: '没有可转换的订单' }
  const missing = (order.goods || []).filter(row => !text(row.productId))
  if (missing.length) return { ok: false, reason: `${missing.map(row => row.name).join('、')}没有备案，请把商品进行CC和BC备案后再转换！` }
  return { ok: true, reason: '' }
}

export function ccWaybillChangeEligibility(order) {
  if (!order.waybillNo) return { ok: false, reason: '没有可修改的订单：未绑定干线' }
  if (['海关入库', '放行', '海关审结'].includes(order.expressStatus)) return { ok: false, reason: '没有可修改的订单：订单申报已完成' }
  return { ok: true, reason: '' }
}

export function ccDeclarationEligibility(order, action) {
  if (order.customerCancelled) return { ok: false, reason: '客户取消订单为是，不能再申报' }
  if (action === 'attachments') {
    const missing = missingAttachments(order)
    return missing.length ? { ok: false, reason: `请完成附件加工后再申报！（缺少 ${missing.map(item => item.label).join('、')}）` } : { ok: true, reason: '' }
  }
  if (action === 'express') {
    const missing = missingAttachments(order)
    return missing.length ? { ok: false, reason: `请完成附件加工后再申报！（缺少 ${missing.map(item => item.label).join('、')}）` } : { ok: true, reason: '' }
  }
  if (action === 'void') return CC_VOID_ALLOWED_STATUSES.includes(order.expressStatus) ? { ok: true, reason: '' } : { ok: false, reason: '当前报关单状态不能作废' }
  if (action === 'return') return CC_RETURN_ALLOWED_STATUSES.includes(order.expressStatus) || CC_VOID_ALLOWED_STATUSES.includes(order.expressStatus) ? { ok: true, reason: '' } : { ok: false, reason: '没有可退运的订单！' }
  return { ok: false, reason: '未定义的申报动作' }
}

export function duplicateReceivers(rows, order) {
  if (!order?.waybillNo) return []
  return rows.filter(row => row.waybillNo === order.waybillNo && row.buyer === order.buyer && row.id !== order.id)
}

export function createCcReceiptCsv(orders, type) {
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const label = { manifest: '舱单', attachments: '附件', express: '快件' }[type] || type
  const header = ['提单号（总运单号）', '订单编号', '客户名称（商家名称）', '快递单号', '回执类型', '回执状态', '回执时间', '回执信息']
  const lines = []
  for (const order of orders) {
    const receipts = (order.receipts || []).filter(row => row.type === type)
    if (receipts.length) for (const receipt of receipts) lines.push([order.waybillNo, order.orderNo, order.customer, order.expressNo, label, receipt.status, receipt.time, receipt.content])
    else lines.push([order.waybillNo, order.orderNo, order.customer, order.expressNo, label, order[type === 'manifest' ? 'manifestStatus' : type === 'attachments' ? 'attachmentStatus' : 'expressStatus'] || '', '', '暂无回执记录'])
  }
  return '\ufeff' + [header, ...lines].map(line => line.map(escape).join(',')).join('\r\n')
}
