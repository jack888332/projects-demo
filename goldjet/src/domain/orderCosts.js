import { FINANCE_CURRENCIES } from './financeBasics.js'

export const COST_STATES = ['新建', '已提交', '业务审批通过', '业务审批拒绝', '财务审批通过', '财务审批拒绝']
export const COST_EDITABLE = ['新建', '业务审批拒绝', '财务审批拒绝']
export const ADJUSTMENT_TYPES = ['漏录入', '错误录入-多录', '错误录入-少录', '错误录入-抬头', '错误录入-币种', '错误录入-税率', '错误录入-费用项目', '人为原因调整', '不可抗力争议调整-调减', '正常差异调整-调减', '正常差异调整-调减', '新增项目调整-调减'].map((label, index) => ({ value: String(index + 1), label: `${index + 1}. ${label}` }))
export const COST_COLUMNS = [
  ['childNo', '(子)单号', 190], ['status', '状态', 140], ['settlementParty', '结算单位', 180],
  ['feeItem', '成本项目', 150], ['direction', '成本属性', 100], ['quantity', '数量', 100],
  ['unit', '计费单位', 100], ['currency', '币种', 90], ['taxRate', '税率(%)', 100],
  ['unitPrice', '含税单价(原币)', 160], ['referencePrice', '单价参考值(CNY)', 160], ['originalAmount', '总金额(原币)', 150],
  ['spotRate', '即期汇率', 110], ['agreedRate', '约定汇率', 110], ['premium', '汇率溢价(%)', 130],
  ['amount', '人民币金额', 150], ['updatedBy', '更新人', 140], ['updatedAt', '更新时间', 185],
  ['remark', '备注', 200], ['approvalRemark', '审批备注', 200],
]
export const COST_IDENTITY_COLUMNS = [['orderNo', '订单号', 190], ['billNo', '提单号', 150], ['customer', '客户', 180], ['orderCreator', '订单创建人', 130], ['businessDate', '业务日期', 120]]
export const COST_AUDIT_COLUMNS = [['createdBy', '成本创建人', 140], ['createdAt', '成本创建日期', 185], ['businessApprovedAt', '业务审批日期', 185], ['financeApprovedAt', '财务审批日期', 185]]
export const cloneCost = value => JSON.parse(JSON.stringify(value))
export const managedCosts = state => state.costs.filter(row => row.managementVersion === 23 && !row.deleted)
export const money = value => value === null || value === undefined || value === '' ? '—' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const numeric = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))

export function costAmounts(row) {
  const originalAmount = numeric(row.unitPrice) && numeric(row.quantity) ? Number(row.unitPrice) * Number(row.quantity) : null
  return {
    originalAmount,
    amount: originalAmount !== null && numeric(row.agreedRate) ? originalAmount * Number(row.agreedRate) : null,
    premium: Number(row.spotRate) > 0 && numeric(row.agreedRate) ? (Number(row.agreedRate) - Number(row.spotRate)) / Number(row.spotRate) * 100 : null,
  }
}
export function costTotals(rows) {
  const total = direction => rows.filter(row => row.direction === direction && !row.deleted).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const receivable = total('应收'), payable = total('应付')
  return { receivable, payable, profit: receivable - payable }
}
export function costReference(state, orderId, feeItemId) {
  const rows = managedCosts(state).filter(row => row.orderId === orderId && row.feeItemId === feeItemId && row.direction === '应付')
  const quantity = rows.reduce((sum, row) => sum + Number(row.quantity), 0)
  return quantity > 0 ? rows.reduce((sum, row) => sum + row.amount, 0) / quantity : null
}
export function costOrders(state) {
  // Existing operational orders are admitted only with explicit completion and ownership facts.
  const live = [
    ...(state.airOrders || []).filter(row => row.orderStatus === '已完成'),
    ...(state.groundOrders || []).filter(row => row.status === '已完成'),
  ].filter(row => row.companyId && row.businessDate).map(row => ({ ...row, orderNo: row.orderNo || row.id, status: '已完成', billNo: row.billNo || row.waybillNo || '', childNumbers: row.childNumbers || [] }))
  return [...state.orderCostBook.orders, ...live].filter(row => row.status === '已完成').map(row => ({ ...row, orderCreator: row.creator, approvalRemark: state.orderCostBook.orderRemarks[row.id] || '', ...costTotals(managedCosts(state).filter(cost => cost.orderId === row.id)) }))
}
export function costItems(state, order, adjustment = false) {
  const ids = state.financeBasics.businessCostLinks.filter(link => link.businessType === order?.businessType && link.status === '已生效').map(link => link.costId)
  return state.financeCostItems.filter(row => row.status === '已生效' && (adjustment || ids.includes(row.id)))
}
export function costParties(state, order, direction) {
  const ids = state.orderCostBook.partyBindings.filter(row => row.companyId === order?.companyId).map(row => row.partnerId)
  return state.partners.filter(row => ids.includes(row.id) && row.type === (direction === '应收' ? '客户' : '供应商') && row.status !== '已删除')
}
export function lookupCostRate(state, currency, date) {
  const matches = state.financeBasics.rates.filter(row => row.status === '已生效' && row.sourceCurrency === currency && row.targetCurrency === 'CNY' && row.period === date.slice(0, 7))
  if (matches.length === 1 && Number(matches[0].rate) > 0) return { rate: String(matches[0].rate), id: matches[0].id }
  const sample = state.orderCostBook.demoRates.find(row => row.currency === currency && row.date === date)
  if (!matches.length && sample) return { rate: sample.rate, id: sample.id }
  return { rate: '', id: '' }
}
export function costDraft(state, direction = '应收', row = {}) {
  const rate = lookupCostRate(state, row.currency || 'CNY', (row.createdAt || state.orderCostBook.today).slice(0, 10))
  return { childNo: '', partyId: '', feeItemId: '', direction, quantity: '', unit: '', currency: 'CNY', taxRate: '', unitPrice: '', agreedRate: rate.rate, spotRate: rate.rate, rateId: rate.id, remark: '', attachments: [], ...cloneCost(row) }
}
export function costFileError(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0 || file.size > 20 * 1024 * 1024) return '附件大小须大于0且不超过20MB'
  if (!['text/plain', 'text/csv', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) return '请选择文本或常用图片文件；其他文件格式待确认（190）'
  return ''
}
export function costErrors(state, order, row, { adjustment = false, existing = false } = {}) {
  const errors = {}
  if (!order || order.status !== '已完成') errors.order = '仅可维护已完成且归属明确的订单'
  if (!adjustment && ![order?.orderNo, ...(order?.childNumbers || [])].includes(row.childNo)) errors.childNo = '请选择当前主体下与订单关联的单号'
  if (!['应收', '应付'].includes(row.direction)) errors.direction = '请选择应收或应付'
  if (!costParties(state, order, row.direction).some(party => party.id === row.partyId)) errors.partyId = '请选择当前主体关联的结算单位'
  if (!adjustment && !existing && row.direction === '应付') errors.partyId = '新增应付的结算单位类型待确认（186），暂不保存'
  const item = costItems(state, order, adjustment).find(item => item.id === row.feeItemId)
  if (!item) errors.feeItemId = '请选择已生效且符合业务类型的成本项目'
  else if (['押金', '税金'].includes(item.name)) errors.feeItemId = '押金/税金成本属性待确认（185），暂不保存'
  if (!numeric(row.quantity) || Number(row.quantity) <= 0) errors.quantity = '请输入正数数量；零或负值口径待确认（192）'
  if (!String(row.unit || '').trim()) errors.unit = '请填写计费单位'
  if (!FINANCE_CURRENCIES.some(item => item.code === row.currency)) errors.currency = '请选择币种'
  if (!numeric(row.taxRate) || Number(row.taxRate) < 0 || Number(row.taxRate) > 100) errors.taxRate = '请明确填写0～100的税率'
  if (!numeric(row.unitPrice) || Number(row.unitPrice) < 0) errors.unitPrice = '请输入非负含税单价；负值口径待确认（192）'
  if (!numeric(row.spotRate) || Number(row.spotRate) <= 0) errors.spotRate = '没有唯一有效的即期汇率，不能保存'
  if (!numeric(row.agreedRate) || Number(row.agreedRate) <= 0) errors.agreedRate = '请输入正数约定汇率'
  if (String(row.remark || '').length > 200) errors.remark = '备注不超过200字'
  if (String(row.adjustmentReason || '').length > 200) errors.adjustmentReason = '调账原因不超过200字'
  if (!Array.isArray(row.attachments) || row.attachments.some(file => costFileError(file) || !file.dataUrl?.startsWith(`data:${file.type};base64,`))) errors.attachments = '附件内容或格式无效，请重新选择文件'
  if (adjustment) {
    if ((!existing || row.responsibleId) && !state.orderCostBook.users.some(user => user.id === row.responsibleId && user.companyId === order?.companyId)) errors.responsibleId = '请选择当前主体的调账责任人'
    if (row.adjustmentType && !ADJUSTMENT_TYPES.some(type => type.value === row.adjustmentType)) errors.adjustmentType = '调账种类无效'
    if (['10', '11'].includes(row.adjustmentType)) errors.adjustmentType = '种类10与11重复，含义待确认（189）'
    if (Number(row.adjustmentType) >= 9 && !row.attachments.length) errors.attachments = '调账种类9～12必须提供附件'
  }
  if (Object.values(costAmounts(row)).some(value => value !== null && !Number.isFinite(value))) errors.amount = '计算结果超出可表示范围'
  return errors
}
export function matchesCostQuery(row, query) {
  return Object.entries(query).every(([key, value]) => {
    if (!value || (Array.isArray(value) && !value.length)) return true
    if (Array.isArray(value)) return String(row[key] || '').slice(0, 10) >= value[0] && String(row[key] || '').slice(0, 10) <= value[1]
    if (['status', 'direction', 'currency'].includes(key)) return row[key] === value
    return String(row[key] ?? '').toLowerCase().includes(String(value).trim().toLowerCase())
  })
}
export function costRows(state) {
  const orders = new Map(costOrders(state).map(order => [order.id, order]))
  return managedCosts(state).filter(row => orders.has(row.orderId)).map(row => ({ ...orders.get(row.orderId), ...row, referencePrice: row.direction==='应收' ? costReference(state,row.orderId,row.feeItemId) : null }))
}
export function fxWarnings(rows) {
  return rows.filter(row => costAmounts(row).premium > 3).map(row => `行号${row.lineNo || '新增'} ${row.childNo || row.sourceChildNo || ''}，约定汇率高于即期汇率 ${costAmounts(row).premium.toFixed(2)}%`)
}
export function costCsv(rows) {
  const columns = [...COST_IDENTITY_COLUMNS, ...COST_COLUMNS, ...COST_AUDIT_COLUMNS]
  const cell = value => `"${String(value ?? '').replace(/^[\s]*[=+\-@]/, match => `'${match}`).replaceAll('"', '""')}"`
  return '\uFEFF' + [columns.map(([, label]) => cell(label)).join(','), ...rows.map(row => columns.map(([key]) => cell(row[key])).join(','))].join('\r\n')
}
