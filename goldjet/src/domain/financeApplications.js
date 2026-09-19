import { cloneCost, matchesCostQuery } from './orderCosts.js'
import { statementDetails, statementFileError, statementAttachmentError } from './reconciliation.js'
import { FINANCE_BASIC_ACCOUNTS } from './financeBasicAccess.js'

export const APPLICATION_STATES = ['新建', '已提交', '财务审批通过', '财务审批拒绝']
export const PAYMENT_STATES = [...APPLICATION_STATES, '业务审批通过', '业务审批拒绝']
export const APPLICATION_HEAD_COLUMNS = [
  ['applicationNo', '申请批次号', 180], ['status', '状态', 150], ['settlementParty', '结算单位', 180], ['period', '应收应付周期', 140],
  ['netAmount', '不含税总金额', 150], ['taxAmount', '税额合计', 135], ['totalAmount', '申请总金额', 150], ['currency', '币种', 90],
  ['createdBy', '创建人', 150], ['createdAt', '创建日期', 130], ['remark', '备注', 200], ['approvalOpinion', '审批备注', 200],
]
export const APPLICATION_LINE_COLUMNS = [
  ['orderNo', '订单号', 180], ['customer', '客户', 180], ['orderCreator', '订单创建人', 140], ['businessDate', '业务日期', 130],
  ['childNo', '(子)单号', 185], ['lineNo', '订单行号', 100], ['settlementParty', '结算单位', 180], ['feeItem', '成本项目', 135],
  ['direction', '成本属性', 100], ['taxRate', '税率(%)', 100], ['quantity', '数量', 100], ['unit', '计费单位', 100],
  ['unitPrice', '含税单价(原币)', 155], ['originalAmount', '总金额(原币)', 155], ['currency', '币种', 90], ['billNo', '提单号', 155],
  ['remark', '备注', 200], ['statementNo', '来源对账单', 180], ['appliedAmount', '已申请金额(原币)', 170], ['availableAmount', '可申请金额(原币)', 170],
]
export const APPLICATION_TABLE_SCHEMA = {
  pagination: { list: 50, create: 50, approval: 10 }, sort: { list: 'applicationNo-desc', pending: 'businessDate-orderNo-asc' },
  selection: { scope: 'current-page', clearOn: ['query', 'page', 'kind', 'tab', 'role', 'reset'] },
  export: { format: 'CSV', encoding: 'UTF-8-BOM', pending: 'selection', receipt: ['selection', 'applied-query'], payment: ['selection'] },
}
export const cleanAmount = value => Number(Number(value).toPrecision(15))
export function applicationTotals(lines) {
  const totalAmount = cleanAmount(lines.reduce((sum, line) => sum + Number(line.requestedAmount || 0), 0))
  const taxCents = lines.reduce((sum, line) => sum + Math.round((Number(line.requestedAmount || 0) * Number(line.taxRate) / (100 + Number(line.taxRate)) + Number.EPSILON) * 100), 0)
  return { totalAmount, taxAmount: taxCents / 100, netAmount: cleanAmount(totalAmount - taxCents / 100) }
}
export function createFinanceApplicationSeed() {
  return { financeApplications: { rows: [], notices: [], sequence: 0, eventSequence: 0, today: '2026-09-08' } }
}
export function applicationRows(state, kind) {
  return state.financeApplications.rows.filter(row => row.kind === kind && !row.deleted)
    .toSorted((a, b) => b.applicationNo.localeCompare(a.applicationNo))
}
export function applicationSources(state, kind = 'receipt') {
  // Payment eligibility is disputed (201). It must not reuse receivables as payable sources.
  if (kind !== 'receipt') return []
  const currentCosts = new Map(state.costs.filter(row => !row.deleted && row.status === '财务审批通过').map(row => [row.id, row]))
  return statementDetails(state, '应收', { confirmedOnly: true }).filter(line => {
    const cost = currentCosts.get(line.sourceCostId)
    return cost && ['partyId', 'direction', 'currency', 'originalAmount', 'taxRate', 'quantity', 'unitPrice'].every(key => cost[key] === line[key])
  }).map(line => {
    const held = state.financeApplications.rows.filter(row => !row.deleted && !row.demoOnly && APPLICATION_STATES.includes(row.status))
      .flatMap(row => row.lines).filter(row => row.sourceCostId === line.sourceCostId)
    const appliedAmount = cleanAmount(held.reduce((sum, row) => sum + Number(row.requestedAmount), 0))
    return { ...cloneCost(line), appliedAmount, availableAmount: cleanAmount(line.originalAmount - appliedAmount) }
  }).sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.orderNo.localeCompare(b.orderNo) || a.id.localeCompare(b.id))
}
export function applicationSelection(state, ids, kind) {
  if (kind !== 'receipt') throw new Error('付款申请来源与发票规则待确认（201、203），暂不创建')
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('请选择至少一条不重复的明细')
  const sources = new Map(applicationSources(state, kind).map(row => [row.id, row]))
  const lines = ids.map(id => sources.get(id))
  if (lines.some(row => !row)) throw new Error('明细尚未确认对账、源成本已变化或已不可用，请重新查询')
  if (new Set(lines.map(row => row.sourceCostId)).size !== lines.length) throw new Error('同一成本明细不能重复申请')
  if (lines.some(row => !row.partyId) || new Set(lines.map(row => row.partyId)).size !== 1) throw new Error('请选择相同结算单位的明细')
  if (new Set(lines.map(row => row.currency)).size !== 1) throw new Error('请选择相同币种的明细')
  if (lines.some(row => !row.companyId) || new Set(lines.map(row => row.companyId)).size !== 1) throw new Error('跨公司申请归属待确认（107），请按同一公司选择')
  if (lines.some(row => !Number.isFinite(row.originalAmount) || !Number.isFinite(Number(row.taxRate)) || Number(row.taxRate) < 0)) throw new Error('源金额或税率无效，请核对来源')
  if (lines.some(row => row.originalAmount <= 0)) throw new Error('非正数源金额的申请边界待确认（202）')
  if (lines.some(row => row.availableAmount <= 0)) throw new Error('所选明细的可申请金额已用尽')
  return lines
}
export function applicationDraft(state, ids, kind, actor) {
  const lines = applicationSelection(state, ids, kind)
  return {
    kind, applicationNo: '', partyId: lines[0].partyId, settlementParty: lines[0].settlementParty, companyId: lines[0].companyId,
    period: null, status: '新建', currency: lines[0].currency, createdBy: actor.name, createdAt: state.financeApplications.today,
    remark: '', attachments: [], account: null, approvalOpinion: '', lines: lines.map(row => ({ ...row, requestedAmount: String(row.availableAmount) })),
  }
}
export function requestedAmountError(line) {
  if (line.requestedAmount === null || line.requestedAmount === undefined || !/^\d+(\.\d+)?$/.test(String(line.requestedAmount))) return '请填写本次申请金额'
  const amount = Number(line.requestedAmount)
  if (!Number.isFinite(amount) || amount > line.availableAmount) return '本次申请金额不得大于可申请金额'
  if (amount === 0) return '零金额能否保存存在冲突（202），请填写大于0的金额'
  return ''
}
export function receiptAccountOptions(state, persona, companyId, currency) {
  const account = FINANCE_BASIC_ACCOUNTS[persona]
  return state.financeBasics.bankAccounts.filter(row => row.companyId === account?.companyId && row.companyId === companyId).map(row => ({
    ...row, unavailable: row.status !== '已生效' || row.currency !== currency,
    unavailableReason: '停用或异币种账户的引用规则待确认（205）',
  }))
}
export function receiptAccountSnapshot(state, persona, draft, id) {
  if (!id) return null
  const row = receiptAccountOptions(state, persona, draft.companyId, draft.currency).find(row => row.id === id && !row.unavailable)
  if (!row) throw new Error('收款账户不可用或不属于当前公司；账户准入规则见205')
  return Object.fromEntries(['id', 'bankName', 'accountName', 'accountNo', 'currency'].map(key => [key, row[key]]))
}
export function matchesApplicationQuery(row, query) {
  const { minAmount, maxAmount, ...rest } = query
  if (minAmount !== '' && minAmount != null && row.totalAmount < Number(minAmount)) return false
  if (maxAmount !== '' && maxAmount != null && row.totalAmount > Number(maxAmount)) return false
  return matchesCostQuery(row, rest)
}
export const applicationFileError = file => statementFileError(file).replaceAll('198', '206')
export const applicationAttachmentError = files => statementAttachmentError(files).replaceAll('198', '206')
export function applicationCsv(rows, pending = false) {
  const columns = pending ? APPLICATION_LINE_COLUMNS : APPLICATION_HEAD_COLUMNS
  const cell = value => `"${String(value ?? '').replace(/^[\s]*[=+\-@]/, match => `'${match}`).replaceAll('"', '""')}"`
  return '\uFEFF' + [columns.map(([, label]) => cell(label)).join(','), ...rows.map(row => columns.map(([key]) => cell(key === 'period' && row.period == null ? '待确认（195）' : row[key])).join(','))].join('\r\n')
}
