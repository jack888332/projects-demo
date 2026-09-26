// PRD 029 §11～§14：BC出口服务单受理、详情、应收应付与操作日志。
export const BC_SERVICE_NOW = '2026-09-08 14:30'
export const BC_SERVICE_STATUSES = ['待接单', '进行中', '已完成', '已终止', '已取消']
export const BC_SERVICE_ITEMS = ['订单申报', '清单申报', '总运单申报', '离境单申报']
export const BC_ATTACHMENT_FORMATS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', 'pdf', 'jpg']
export const BC_COST_ATTRIBUTES = ['应收', '应付']

const text = value => String(value ?? '').trim()
const splitLines = value => String(value ?? '').split(/\r?\n/).map(row => row.trim()).filter(Boolean)

export function bcServicePermissions(role) {
  const operator = role === 'customsService'
  return { accept: operator, transfer: operator, terminate: operator, cancel: operator, finish: operator, attach: operator, cost: operator, read: true }
}

export function createBcServiceNo(sequence) {
  return `FWD${String(sequence).padStart(11, '0')}`
}

export function createBcPlatformOrderNo(sequence) {
  return `XQD${String(sequence).padStart(11, '0')}`
}

export function filterBcServices(rows, filters = {}) {
  const exact = (value, input) => !text(input) || splitLines(input).includes(value)
  const range = (value, bounds) => {
    if (!Array.isArray(bounds) || !bounds.some(Boolean)) return true
    const day = String(value || '').slice(0, 10)
    return Boolean(day) && (!bounds[0] || day >= bounds[0]) && (!bounds[1] || day <= bounds[1])
  }
  return rows.filter(row =>
    exact(row.serviceNo, filters.serviceNo) && exact(row.platformOrderNo, filters.platformOrderNo) && exact(row.waybillNo, filters.waybillNo) &&
    (!filters.transportMode || row.transportMode === filters.transportMode) &&
    (!filters.serviceItem || (row.services || []).includes(filters.serviceItem)) &&
    (!filters.ecommerceName || row.ecommerceName === filters.ecommerceName) &&
    (!filters.salesperson || row.salesperson === filters.salesperson) && (!filters.creator || row.creator === filters.creator) &&
    range(row.createdAt, filters.createdRange) &&
    (!filters.orderStatus || row.orderStatus === filters.orderStatus) && (!filters.status || row.status === filters.status) &&
    (!filters.upstreamCancelled || String(Boolean(row.upstreamCancelled)) === filters.upstreamCancelled) &&
    (!filters.handler || row.handler === filters.handler))
}

// 统计口径按 CUSTOMS-B019：总计与三类终态取最近一个月，待接单/进行中取全部；筛选后按同一口径重算。
export function bcServiceStatistics(rows, now = BC_SERVICE_NOW) {
  const month = now.slice(0, 7)
  const withinMonth = row => String(row.createdAt || '').slice(0, 7) === month
  return {
    总计数量: rows.filter(withinMonth).length,
    待接单: rows.filter(row => row.status === '待接单').length,
    进行中: rows.filter(row => row.status === '进行中').length,
    已完成: rows.filter(row => row.status === '已完成' && withinMonth(row)).length,
    已终止: rows.filter(row => row.status === '已终止' && withinMonth(row)).length,
    已取消: rows.filter(row => row.status === '已取消' && withinMonth(row)).length,
    note: 'B019：统计窗口按来源实现，筛选与汇总口径待确认',
  }
}

export function bcServiceEligibility(service, action) {
  if (action === 'accept') return service?.status === '待接单' ? { ok: true, reason: '' } : { ok: false, reason: '所选订单已被接单' }
  if (action === 'transfer') return service?.status === '进行中' ? { ok: true, reason: '' } : { ok: false, reason: '没有可流转的服务单' }
  if (action === 'terminate') return service?.status === '进行中' ? { ok: true, reason: '' } : { ok: false, reason: '没有可终止的服务单' }
  if (action === 'cancel') {
    if (service?.status !== '进行中') return { ok: false, reason: '没有可取消的服务单' }
    return service.upstreamCancelled ? { ok: true, reason: '' } : { ok: false, reason: '上游取消服务须为是' }
  }
  if (action === 'finish') return service?.status === '进行中' ? { ok: true, reason: '' } : { ok: false, reason: '没有可结束的服务单' }
  return { ok: true, reason: '' }
}

export function validateBcAttachment(file) {
  const errors = {}
  const name = text(file?.name)
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  if (!name) errors.name = '请选择文件'
  else if (!BC_ATTACHMENT_FORMATS.includes(ext)) errors.name = `仅支持 ${BC_ATTACHMENT_FORMATS.join('、')} 格式`
  if (Number(file?.size) > 5 * 1024 * 1024) errors.size = '每个文件不超过 5Mb'
  return errors
}

export function createBcCostRow() {
  return { id: '', settlementParty: '', status: '未结算', costItem: '', attribute: '应收', quantity: '', unit: '', currency: 'CNY', unitPrice: '', total: '', collect: '否' }
}

export function calculateBcCostTotal(row) {
  const total = (Number(row?.quantity) || 0) * (Number(row?.unitPrice) || 0)
  return total ? total.toFixed(2) : ''
}

export function validateBcCostRows(rows) {
  const errors = {}
  for (const [index, row] of (rows || []).entries()) {
    if (!text(row.settlementParty)) errors[`${index}.settlementParty`] = '结算单位必填'
    if (!text(row.costItem)) errors[`${index}.costItem`] = '成本项目必填'
    if (!(Number(row.quantity) > 0)) errors[`${index}.quantity`] = '数量须为正数'
    if (!(Number(row.unitPrice) > 0)) errors[`${index}.unitPrice`] = '含税单价须为正数'
  }
  return errors
}

export function bcCostSummary(rows) {
  const receivable = (rows || []).filter(row => row.attribute === '应收').reduce((sum, row) => sum + (Number(row.total) || 0), 0)
  const payable = (rows || []).filter(row => row.attribute === '应付').reduce((sum, row) => sum + (Number(row.total) || 0), 0)
  return { receivable: receivable.toFixed(2), payable: payable.toFixed(2), profit: (receivable - payable).toFixed(2) }
}
