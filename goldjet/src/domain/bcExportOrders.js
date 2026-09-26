// PRD 029 BC出口关务：订单列表、批量申报与异常处理、导入与回执。服务单受理与详情见后续切片。
export const BC_EXPORT_NOW = '2026-09-08 14:30'
export const BC_EXPORT_STATUSES = ['待报关', '发送中', '发送成功', '海关入库', '海关审结', '海关退单', '发送失败', '处理异常']
export const BC_SUPERVISION_MODES = [['9710', '9710 企业级大订单'], ['9610', '9610 个人级小订单']]
export const BC_EXCEPTION_RESULTS = ['无', '删单退场', '退单退场', '弃货']
export const BC_CHANNELS = ['单一窗口', '海关总署通道', '地方电子口岸']
export const BC_DECLARE_TYPES = {
  order: ['订单申报', 'orderStatus'],
  pay: ['支付单申报', 'payStatus'],
  waybill: ['运单申报', 'waybillStatus'],
  list: ['清单申报', 'listStatus'],
  waybillDoc: ['总运单申报', 'waybillDocStatus'],
  arrival: ['运抵单申报', 'arrivalStatus'],
  departure: ['离境单申报', 'departureStatus'],
  summary: ['汇总申报', 'summaryStatus'],
}

const text = value => String(value ?? '').trim()
const splitLines = value => String(value ?? '').split(/\r?\n/).map(row => row.trim()).filter(Boolean)

export function bcExportPermissions(role) {
  const operator = role === 'customsService'
  return { create: operator, declare: operator, exception: operator, import: operator, read: true }
}

export function createBcExportBatchNo(sequence, date = BC_EXPORT_NOW) {
  return `${date.slice(0, 4)}${date.slice(5, 7)}${date.slice(8, 10)}${String(sequence).padStart(4, '0')}`
}

export function filterBcExportOrders(rows, filters = {}) {
  const exact = (value, input) => !text(input) || splitLines(input).includes(value)
  const range = (value, bounds) => {
    if (!Array.isArray(bounds) || !bounds.some(Boolean)) return true
    const time = String(value || '')
    return Boolean(time) && (!bounds[0] || time >= bounds[0]) && (!bounds[1] || time <= `${bounds[1]} 23:59:59`)
  }
  return rows.filter(row =>
    exact(row.orderNo, filters.orderNo) && exact(row.platformOrderNo, filters.platformOrderNo) &&
    exact(row.waybillNo, filters.waybillNo) && exact(row.merchantName, filters.merchantName) &&
    exact(row.expressNo, filters.expressNo) && exact(row.packageNo, filters.packageNo) &&
    (!filters.orderStatus || row.orderStatus === filters.orderStatus) && (!filters.payStatus || row.payStatus === filters.payStatus) &&
    (!filters.waybillStatus || row.waybillStatus === filters.waybillStatus) && (!filters.listStatus || row.listStatus === filters.listStatus) &&
    (!filters.waybillDocStatus || row.waybillDocStatus === filters.waybillDocStatus) && (!filters.arrivalStatus || row.arrivalStatus === filters.arrivalStatus) &&
    (!filters.departureStatus || row.departureStatus === filters.departureStatus) && (!filters.summaryStatus || row.summaryStatus === filters.summaryStatus) &&
    (!filters.customsZone || row.customsZone === filters.customsZone) && (!filters.discarded || String(row.exceptionResult === '弃货') === filters.discarded) &&
    (!filters.supervisionMode || row.supervisionMode === filters.supervisionMode) && (!filters.channel || row.channel === filters.channel) &&
    (!filters.exceptionResult || row.exceptionResult === filters.exceptionResult) && (!text(filters.batchNo) || row.batchNo.includes(text(filters.batchNo))) &&
    range(row.createdAt, filters.createdRange))
}

// 批量申报资格：返回每个动作可执行/阻断原因，动作前逐项复核。
export function declarationEligibility(order, action) {
  const hasPlatform = Boolean(text(order.platformOrderNo))
  const blocked = reason => ({ ok: false, reason })
  if (['order', 'pay', 'waybill'].includes(action)) {
    if (!hasPlatform) return blocked('客户订单尚未生成平台订单')
    // 来源写“验证是否已完成清单申报”，与清单申报要求三单海关入库互锁（见分析清单 GJ-PRD-236）；
    // 原型按待报关起始的正常顺序演示，未申报/失败/退单状态可申报。
    const field = { order: 'orderStatus', pay: 'payStatus', waybill: 'waybillStatus' }[action]
    if (!['待报关', '发送失败', '海关退单', '处理异常'].includes(order[field])) return blocked('该申报当前状态不允许再次申报')
    return { ok: true, reason: '' }
  }
  if (action === 'list') {
    if (!hasPlatform) return blocked('客户订单尚未生成平台订单')
    if (!['海关入库'].includes(order.orderStatus) || !['海关入库'].includes(order.payStatus) || !['海关入库'].includes(order.waybillStatus)) return blocked('订单、支付单、运单申报状态须均为海关入库')
    if (!text(order.waybillNo)) return blocked('总运单号未填写')
    if (['申报中', '发送成功', '海关入库', '人工审核', '海关审结', '放行', '结关'].includes(order.listStatus)) return blocked('当前清单状态不提交')
    return { ok: true, reason: '' }
  }
  if (action === 'cancelList') return ['海关审结', '海关入库'].includes(order.listStatus) ? { ok: true, reason: '' } : blocked('清单状态须为海关审结或海关入库')
  if (action === 'waybillDoc') {
    // 来源按钮要求总运单已海关审结/入库，用例又以清单申报成功为首次申报资格（CUSTOMS-B017）；
    // 原型允许清单已申报后的待报关/失败/退单状态首次申报，已入库状态可重报。
    if (!['海关入库', '海关审结'].includes(order.listStatus)) return blocked('须先完成清单申报并通过审核')
    if (!['待报关', '发送失败', '海关退单', '处理异常', '海关审结', '海关入库'].includes(order.waybillDocStatus)) return blocked('总运单状态不允许申报')
    if (!['待报关', '发送失败', '海关退单', '处理异常'].includes(order.cancelListStatus)) return blocked('撤销清单状态不允许总运单申报')
    return { ok: true, reason: '' }
  }
  if (action === 'arrival') return order.waybillDocStatus === '海关入库' ? { ok: true, reason: '' } : blocked('总运单状态须为海关入库')
  if (action === 'departure') return order.waybillDocStatus === '海关入库' ? { ok: true, reason: '' } : blocked('总运单申报状态须为海关入库')
  if (action === 'summary') return order.listStatus === '海关审结' ? { ok: true, reason: '' } : blocked('清单申报状态须为海关审结')
  return { ok: true, reason: '' }
}

export function deletionEligibility(order, action) {
  const map = { deleteOrder: ['orderStatus', '订单'], deletePay: ['payStatus', '支付单'], deleteWaybill: ['waybillStatus', '运单'], deleteCancel: ['cancelListStatus', '撤销清单'], deleteWaybillDoc: ['waybillDocStatus', '总运单'], deleteDeparture: ['departureStatus', '离境'], deleteSummary: ['summaryStatus', '汇总'] }
  const [field, label] = map[action] || []
  if (!field) return { ok: false, reason: '未定义的删除动作' }
  const target = action === 'deleteSummary' ? '海关审结' : '海关入库'
  return order[field] === target ? { ok: true, reason: '' } : { ok: false, reason: `${label}状态须为${target}` }
}

export function exceptionEligibility(order, action) {
  if (action === 'modifyWaybill') return order.listStatus === '待报关' ? { ok: true, reason: '' } : { ok: false, reason: '清单状态须为待报关' }
  if (action === 'deleteOrder') return order.listStatus === '海关退单' ? { ok: true, reason: '' } : { ok: false, reason: '清单状态须为海关退单' }
  if (['returnScene', 'deleteScene', 'discard'].includes(action)) {
    if (!text(order.platformOrderNo)) return { ok: false, reason: '客户订单尚未生成平台订单' }
    return order.listStatus === '海关退单' ? { ok: true, reason: '' } : { ok: false, reason: '清单状态须为海关退单' }
  }
  return { ok: true, reason: '' }
}

export function parseBcImportRows(textValue, existingOrderNos = []) {
  const rows = String(textValue || '').split(/\r?\n/).map(row => row.trim()).filter(Boolean)
  const header = '订单编号,平台订单编号,商家备案名称,快递单号,大包号,订单商品总价,关区,贸易方式'
  const problems = []
  const orders = []
  const seen = new Set()
  for (const [index, row] of rows.entries()) {
    const [orderNo, platformOrderNo = '', merchantName, expressNo = '', packageNo = '', amount = '', customsZone = '', supervisionMode = ''] = row.split(',').map(cell => cell.trim())
    if (!orderNo || !merchantName) { problems.push({ orderNo: orderNo || `第 ${index + 2} 行`, reason: '订单编号与商家备案名称为必填' }); continue }
    if (seen.has(orderNo)) { problems.push({ orderNo, reason: '同一文件内订单编号重复' }); continue }
    if (existingOrderNos.includes(orderNo)) { problems.push({ orderNo, reason: '系统已存在该订单编号' }); continue }
    seen.add(orderNo)
    orders.push({ orderNo, platformOrderNo, merchantName, expressNo, packageNo, amount: Number(amount) || 0, customsZone, supervisionMode: supervisionMode || '9710' })
  }
  return { orders, problems, header }
}

export function buildBcFailureCsv(problems) {
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  return '\ufeff' + [['订单编号', '失败原因'], ...problems.map(row => [row.orderNo, row.reason])].map(line => line.map(escape).join(',')).join('\r\n')
}
