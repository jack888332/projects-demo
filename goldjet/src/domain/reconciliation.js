import { cloneCost, costRows, matchesCostQuery } from './orderCosts.js'

export const STATEMENT_HEAD_COLUMNS = [
  ['statementNo', '对账单号', 180], ['status', '状态', 110], ['settlementParty', '结算单位', 180],
  ['period', '应收应付周期', 145], ['statementDirection', '对账单属性', 120], ['createdBy', '创建人', 140], ['createdAt', '创建日期', 130],
]
export const STATEMENT_LINE_COLUMNS = [
  ['orderNo', '订单号', 180], ['customer', '客户', 180], ['orderCreator', '订单创建人', 130], ['businessDate', '业务日期', 125],
  ['childNo', '(子)单号', 190], ['settlementParty', '结算单位', 180], ['feeItem', '成本项目', 140], ['direction', '成本属性', 100],
  ['quantity', '数量', 100], ['unit', '计量单位', 100], ['taxRate', '税率(%)', 100], ['unitPrice', '含税单价(原币)', 155],
  ['originalAmount', '总金额(原币)', 155], ['currency', '币种', 90], ['billNo', '提单号', 150], ['createdBy', '成本创建人', 140], ['createdAt', '成本创建日期', 135],
]
export const STATEMENT_DETAIL_COLUMNS = [
  ['statementNo', '对账单号', 180], ['statementDirection', '对账单属性', 120], ...STATEMENT_LINE_COLUMNS.slice(0, 4),
  ['childNo', '(子)单号', 190], ['lineNo', '订单行号', 100], ...STATEMENT_LINE_COLUMNS.slice(5, 8),
  ...STATEMENT_LINE_COLUMNS.slice(10, 15), ['statementCreator', '对账单创建人', 150], ['statementDate', '对账单创建日期', 145],
]
export const STATEMENT_TABLE_SCHEMA = {
  pagination: { pageSize: 50 }, sort: { default: 'createdAt', direction: 'descending' },
  selection: { scope: 'current-page', clearOn: ['query', 'page', 'direction', 'view', 'role', 'data-reset'] },
  export: { details: 'all-applied-query-rows', format: 'CSV', encoding: 'UTF-8-BOM' },
}
export function createReconciliationSeed() {
  return { reconciliation: { statements: [], sequence: 0, eventSequence: 0, today: '2026-09-08' } }
}
export function statementRows(state, direction) {
  return state.reconciliation.statements.filter(row => ['新建', '已确认'].includes(row.status) && (!direction || row.statementDirection === direction))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.statementNo.localeCompare(a.statementNo))
}
export function pendingStatementCosts(state, direction) {
  // Any existing reference is held until deletion/release semantics are confirmed.
  const held = new Set(state.reconciliation.statements.flatMap(row => row.lines.map(line => line.sourceCostId)))
  return costRows(state).filter(row => row.direction === direction && row.status === '财务审批通过' && !held.has(row.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}
export function statementDetails(state, direction, { confirmedOnly = false } = {}) {
  return statementRows(state, direction).filter(row => !confirmedOnly || row.status === '已确认').flatMap(statement => statement.lines.map(line => ({
    ...line, statementId: statement.id, statementNo: statement.statementNo, statementDirection: statement.statementDirection,
    statementCreator: statement.createdBy, statementDate: statement.createdAt, statementStatus: statement.status, confirmedAt: statement.confirmedAt,
  })))
}
export function statementTotals(rows) {
  return [...new Set(rows.map(row => row.currency))].sort().map(currency => ({ currency, amount: rows.filter(row => row.currency === currency).reduce((sum, row) => sum + Number(row.originalAmount), 0) }))
}
export function matchesStatementQuery(row, query, mode = 'statements') {
  const { statementNo, ...rest } = query
  if (statementNo && mode === 'details' && row.statementNo !== statementNo.trim()) return false
  return matchesCostQuery(row, { ...rest, ...(mode === 'statements' ? { statementNo } : {}) })
}
export function statementSelection(state, ids, direction) {
  if (!['应收', '应付'].includes(direction)) throw new Error('请选择应收或应付')
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('请选择至少一条不重复的待对账明细')
  const available = new Map(pendingStatementCosts(state, direction).map(row => [row.id, row]))
  const rows = ids.map(id => available.get(id))
  if (rows.some(row => !row)) throw new Error('部分明细已对账、未通过财务审批或已不可用，请重新查询')
  if (rows.some(row => !row.partyId) || new Set(rows.map(row => row.partyId)).size !== 1) throw new Error('只有相同结算单位的明细才能创建一张对账单')
  if (rows.some(row => !row.companyId) || new Set(rows.map(row => row.companyId)).size !== 1) throw new Error('跨公司组单规则待确认（200），请按同一公司选择')
  if (rows.some(row => !row.currency || !Number.isFinite(row.originalAmount))) throw new Error('明细的原币金额或币种不完整')
  return rows
}
export function statementDraft(state, ids, direction, actor) {
  const rows = statementSelection(state, ids, direction)
  return {
    statementNo: '', status: '新建', partyId: rows[0].partyId, settlementParty: rows[0].settlementParty,
    companyId: rows[0].companyId, period: null, statementDirection: direction, createdBy: actor.name,
    createdAt: state.reconciliation.today, remark: '', attachments: [],
    lines: cloneCost(rows.map(row => ({ ...row, sourceCostId: row.id }))),
  }
}
export function statementFileError(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0 || file.size >= 20 * 1024 * 1024) return '附件须大于0且小于20MB；20MB边界待确认（198）'
  if (!['text/plain', 'text/csv', 'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) return '支持文本、PDF和常用图片；其他文档格式待确认（198）'
  return ''
}
export function statementAttachmentError(files) {
  if (!Array.isArray(files)) return '附件列表无效'
  if (new Set(files.map(file => file.name)).size !== files.length) return '同名附件的替换或并存规则待确认（198）'
  return files.map(file => statementFileError(file) || (!file.dataUrl?.startsWith(`data:${file.type};base64,`) ? '附件内容无效，请重新上传' : '')).find(Boolean) || ''
}
export function statementCsv(rows) {
  const cell = value => `"${String(value ?? '').replace(/^[\s]*[=+\-@]/, match => `'${match}`).replaceAll('"', '""')}"`
  return '\uFEFF' + [STATEMENT_DETAIL_COLUMNS.map(([, label]) => cell(label)).join(','), ...rows.map(row => STATEMENT_DETAIL_COLUMNS.map(([key]) => cell(['businessDate', 'statementDate', 'createdAt'].includes(key) ? row[key]?.slice(0, 10) : row[key])).join(','))].join('\r\n')
}
