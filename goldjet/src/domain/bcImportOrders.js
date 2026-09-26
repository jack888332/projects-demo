// PRD 030 §3～§4 BC进口订单与申报；CC进口订单、套件拆价、服务单、舱单/确报/派送/进出区见后续切片。
export const BC_IMPORT_NOW = '2026-09-08 14:30'
export const BC_IMPORT_DECLARE_STATUSES = ['待报关', '电子口岸申报中', '发送海关成功', '发送海关失败', '海关退单', '海关入库', '处理异常']
export const BC_IMPORT_LIST_STATUSES = [...BC_IMPORT_DECLARE_STATUSES, '人工审核', '海关审结', '放行', '结关', '查验', '扣留移送通关', '扣留移送缉私', '扣留移送法规', '其它扣留', '退运']
export const BC_RETURN_STATUSES = ['待报关', '电子口岸申报中', '发送海关成功', '发送海关失败', '海关退单', '海关入库', '海关审结']
export const BC_CHANGE_RESULTS = ['无', '作废', 'CC转BC', '报废']
export const BC_IMPORT_CHANNELS = ['广州电子口岸', '单一窗口', '地方电子口岸']
export const BC_CLEARANCE_STEPS = [['pickedUp', '货站提货', ['未提货', '已提货']], ['clearanceStarted', '开始清关', ['未开始', '已开始']], ['clearanceDone', '完成清关', ['未完成', '已完成']]]
export const BC_VIEW_PASSWORD = 'demo123'

const text = value => String(value ?? '').trim()
const splitLines = value => String(value ?? '').split(/\r?\n/).map(row => row.trim()).filter(Boolean)

export function bcImportPermissions(role) {
  const operator = role === 'customsService'
  return { operate: operator, dispatch: operator, bind: operator, declare: operator, exception: operator, clearance: operator, read: true }
}

export function filterBcImportOrders(rows, filters = {}) {
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
    (!filters.orderStatus || row.orderStatus === filters.orderStatus) && (!filters.waybillStatus || row.waybillStatus === filters.waybillStatus) &&
    (!filters.listStatus || row.listStatus === filters.listStatus) && (!filters.cancelListStatus || row.cancelListStatus === filters.cancelListStatus) &&
    (!filters.returnStatus || row.returnStatus === filters.returnStatus) && (!filters.returnResult || row.returnResult === filters.returnResult) &&
    (!filters.customsZone || String(row.customsZone || '').includes(text(filters.customsZone))) &&
    range(row.createdAt, filters.createdRange) &&
    BC_CLEARANCE_STEPS.every(([key]) => !filters[key] || row.logistics?.[key] === filters[key]))
}

export function bcDispatchEligibility(order) {
  if (order.mode !== '备货') return { ok: false, reason: '仅备货订单可下发仓库' }
  if (order.warehouseStatus !== '待下发') return { ok: false, reason: '仅待下发状态可下发仓库' }
  if (order.stockStatus !== '有货') return { ok: false, reason: order.saleType === '预售' ? '预售订单需客服确认库存后下发（B025 待确认）' : '缺货订单需仓库上架后手动下发（B025）' }
  if (order.customerCancelled) return { ok: false, reason: '客户取消订单为是，不能下发' }
  // 现货接入时有货自动下发；预售需客服手工下发（B025 的两处表述差异保留）。
  return { ok: true, reason: '', note: order.saleType === '预售' ? '预售订单由客服确认后手工下发' : '' }
}

export function bcBindEligibility(order) {
  if (order.shipped) return { ok: false, reason: '没有可操作的订单（已发货订单请在已发货列表处理绑定与提单）' }
  if (order.waybillNo) return { ok: false, reason: '没有可操作的订单：已绑定干线' }
  if (order.customerCancelled) return { ok: false, reason: '客户取消订单为是' }
  return { ok: true, reason: '' }
}

export function bcWaybillEntryEligibility(order) {
  if (!order.waybillNo) return { ok: false, reason: '还没有绑定干线' }
  if (order.waybillEntered) return { ok: false, reason: '没有可操作的订单：已录入提单' }
  return { ok: true, reason: '' }
}

export function bcConvertEligibility(order, goods = []) {
  if (order.listStatus !== '海关退单') return { ok: false, reason: '没有可转换的订单' }
  const missing = goods.filter(row => !text(row.productId))
  if (missing.length) return { ok: false, reason: `${missing.map(row => row.name).join('、')}没有备案，请把商品进行CC和BC备案后再转换！` }
  return { ok: true, reason: '' }
}

export function bcUnbindEligibility(order) {
  if (order.orderStatus !== '待报关' || order.waybillEntered) return { ok: false, reason: '没有可解绑的订单' }
  return { ok: true, reason: '' }
}

export function bcDeclarationEligibility(order, action) {
  const blocked = reason => ({ ok: false, reason })
  if (order.customerCancelled && ['order', 'waybill', 'list'].includes(action)) return blocked('客户取消订单为是，不能再申报')
  if (action === 'order') return ['待报关', '发送海关失败', '海关退单', '处理异常', '海关入库'].includes(order.orderStatus) ? { ok: true, reason: '' } : blocked('订单状态不允许订单申报')
  if (action === 'waybill') return ['待报关', '发送海关失败', '海关退单', '处理异常', '海关入库'].includes(order.waybillStatus) ? { ok: true, reason: '' } : blocked('运单状态不允许运单申报')
  if (action === 'list') {
    if (!['海关入库'].includes(order.orderStatus) || !['海关入库'].includes(order.waybillStatus)) return blocked('订单与运单状态须为海关入库')
    return order.listStatus === '待报关' ? { ok: true, reason: '' } : blocked('清单状态须为待报关')
  }
  if (action === 'cancelList') return order.listStatus === '海关入库' ? { ok: true, reason: '' } : blocked('清单状态须为海关入库')
  if (action === 'return') return order.listStatus === '放行' ? { ok: true, reason: '' } : blocked('清单状态须为放行才可以申请退货')
  if (action === 'deleteOrder') return order.orderStatus === '海关入库' ? { ok: true, reason: '' } : blocked('订单状态须为海关入库')
  if (action === 'deleteWaybill') return order.waybillStatus === '海关入库' ? { ok: true, reason: '' } : blocked('运单状态须为海关入库')
  if (action === 'deleteCancel') return order.cancelListStatus === '海关审结' ? { ok: true, reason: '' } : blocked('撤销清单状态须为海关审结')
  return blocked('未定义的申报动作')
}

export function bcClearanceUpdate(order, update) {
  // 顺序约束：未提货不能改开始清关，未开始清关不能改完成清关。
  const next = { ...order.logistics }
  if (update.pickedUp === '已提货') next.pickedUp = '已提货'
  if (update.clearanceStarted === '已开始') {
    if (next.pickedUp !== '已提货') return { ok: false, reason: '未提货不能改开始清关状态' }
    next.clearanceStarted = '已开始'
  }
  if (update.clearanceDone === '已完成') {
    if (next.clearanceStarted !== '已开始') return { ok: false, reason: '未开始清关不能改完成状态' }
    next.clearanceDone = '已完成'
  }
  return { ok: true, reason: '', logistics: { ...next, clearedAt: update.clearedAt || '' } }
}

export function createBcReceiptCsv(orders, type) {
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const field = { order: 'orderStatus', waybill: 'waybillStatus', list: 'listStatus', cancelList: 'cancelListStatus', return: 'returnStatus' }[type]
  const header = ['提单号（总运单号）', '订单编号', '客户名称（商家名称）', '快递单号', '回执类型', '回执状态', '回执时间', '回执信息']
  const lines = []
  for (const order of orders) {
    for (const receipt of (order.receipts || []).filter(row => !type || row.type === type)) {
      lines.push([order.waybillNo, order.orderNo, order.customer, order.expressNo, receipt.type, receipt.status, receipt.time, receipt.content])
    }
    if (!(order.receipts || []).some(row => row.type === type)) lines.push([order.waybillNo, order.orderNo, order.customer, order.expressNo, type, order[field] || '', '', '暂无回执记录'])
  }
  return '\ufeff' + [header, ...lines].map(line => line.map(escape).join(',')).join('\r\n')
}
