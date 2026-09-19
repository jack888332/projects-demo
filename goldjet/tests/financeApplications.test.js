import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { loadReconciliationExamples } from '../src/data/reconciliationExamples.js'
import { loadFinanceApplicationExamples } from '../src/data/financeApplicationExamples.js'
import { statementDraft } from '../src/domain/reconciliation.js'
import { applicationSources, applicationDraft, applicationRows, applicationTotals, matchesApplicationQuery, receiptAccountOptions, receiptAccountSnapshot, applicationFileError } from '../src/domain/financeApplications.js'
import { canReadModule, canWriteModule, rolePermissionDraft, saveRolePermissions } from '../src/data/accessControl.js'
import { canReadApplicationKind } from '../src/domain/financeApplicationAccess.js'
import { captureApplicationContext } from '../src/data/financeApplicationActions.js'
import { deriveWorkbenchTasks } from '../src/domain/workbenchTasks.js'

const data = usePrototypeData(), actor = { id: 'financeAccountant', name: '财务会计演示员' }
const draft = (indices = [0]) => applicationDraft(data.state, indices.map(index => applicationSources(data.state)[index].id), 'receipt', actor)
function confirmSources(ids = ['COST-24-DEMO-1']) {
  data.selectWorkbenchPersona('service')
  const statement = data.saveStatement(statementDraft(data.state, ids, '应收', { name: '周倩' }), true)
  data.selectWorkbenchPersona('financeAccountant')
  return statement
}
beforeEach(() => { data.reset(); data.loadOrderCostExamples(); loadReconciliationExamples(data.state); confirmSources() })
describe('GJ-025 finance applications', () => {
  it('only consumes financially approved confirmed AR, preserving upstream owners', () => {
    expect(applicationSources(data.state)).toHaveLength(1)
    expect(applicationSources(data.state)[0]).toMatchObject({ sourceCostId: 'COST-24-DEMO-1', availableAmount: 1200, appliedAmount: 0 })
    const before = JSON.stringify([data.state.costs, data.state.reconciliation]), payload = draft()
    payload.lines[0].requestedAmount = '400'
    const row = data.saveFinanceApplication(payload)
    expect(row).toMatchObject({ applicationNo: 'RA26090800001', status: '新建', totalAmount: 400, taxAmount: 22.64, netAmount: 377.36 })
    expect(applicationSources(data.state)[0]).toMatchObject({ appliedAmount: 400, availableAmount: 800 })
    expect(JSON.stringify([data.state.costs, data.state.reconciliation])).toBe(before)
  })
  it('retains rejected occupancy, resubmits without doubling, approves without writeoff or credit release', () => {
    const payload = draft(); payload.lines[0].requestedAmount = '600'
    const before = JSON.stringify(data.state.partners), row = data.saveFinanceApplication(payload, true)
    expect(deriveWorkbenchTasks(data.state, 'financeAccountant').filter(row => row.type === 'receipt-approval')).toHaveLength(1)
    data.reviewFinanceApplication(row.id, false, '请核对依据')
    expect(row).toMatchObject({ status: '财务审批拒绝', approvalOpinion: '请核对依据' })
    expect(applicationSources(data.state)[0].appliedAmount).toBe(600)
    data.submitFinanceApplication(row.id); data.reviewFinanceApplication(row.id, true, '核对无误')
    expect(applicationSources(data.state)[0].appliedAmount).toBe(600)
    expect(deriveWorkbenchTasks(data.state, 'financeAccountant').filter(row => row.type === 'receipt-approval')).toHaveLength(0)
    expect(data.state.financeApplications.notices.map(row => row.type)).toEqual(['财务审批通过', '收款申请待审批', '财务审批拒绝', '收款申请待审批'])
    expect(JSON.stringify(data.state.partners)).toBe(before)
    expect(() => data.deleteFinanceApplication(row.id)).toThrow('只有新建')
    expect(() => data.submitFinanceApplication(row.id)).toThrow('只有新建')
    expect(() => data.reviewFinanceApplication(row.id, true)).toThrow('只有已提交')
  })
  it.each([false, true])('deletes a new/rejected application and releases only its amount (%s)', submitted => {
    const first = draft(); first.lines[0].requestedAmount = '200'
    const row = data.saveFinanceApplication(first, submitted)
    const second = draft(); second.lines[0].requestedAmount = '300'; data.saveFinanceApplication(second)
    if (submitted) data.reviewFinanceApplication(row.id, false)
    data.deleteFinanceApplication(row.id)
    expect(applicationRows(data.state, 'receipt')).toHaveLength(1)
    expect(applicationSources(data.state)[0]).toMatchObject({ appliedAmount: 300, availableAmount: 900 })
    expect(() => data.deleteFinanceApplication(row.id)).toThrow('已删除')
  })
  it.each(['', '0', '-1', '1201', 'Infinity', 'NaN'])('rejects invalid or disputed amount %s atomically', value => {
    const payload = draft(); payload.lines[0].requestedAmount = value
    const before = JSON.stringify(data.state.financeApplications)
    expect(() => data.saveFinanceApplication(payload)).toThrow()
    expect(JSON.stringify(data.state.financeApplications)).toBe(before)
  })
  it('checks stale budgets and source snapshots at save and approval', () => {
    const stale = draft(); stale.lines[0].requestedAmount = '500'; data.saveFinanceApplication(stale)
    expect(() => data.saveFinanceApplication(stale)).toThrow('已变化')
    const payload = draft(), row = data.saveFinanceApplication(payload, true)
    data.state.costs.find(cost => cost.id === 'COST-24-DEMO-1').originalAmount = 10
    expect(() => data.reviewFinanceApplication(row.id, true)).toThrow('源明细')
    expect(row.status).toBe('已提交')
  })
  it('derives identities and totals; does not accept forged draft headers', () => {
    const payload = { ...draft(), status: '财务审批通过', currency: 'USD', partyId: 'fake', totalAmount: 999, createdBy: 'fake' }
    expect(data.saveFinanceApplication(payload)).toMatchObject({ status: '新建', currency: 'CNY', partyId: 'PT-00018', totalAmount: 1200, createdBy: actor.name })
  })
  it('checks duplicate sources, currency, party and company grouping', () => {
    confirmSources(['COST-24-DEMO-2']); confirmSources(['COST-24-DEMO-3'])
    const sources = applicationSources(data.state)
    expect(() => applicationDraft(data.state, [sources[0].id, sources[0].id], 'receipt', actor)).toThrow('不重复')
    expect(() => draft([0, 1])).toThrow('相同币种')
    expect(() => draft([0, 2])).toThrow('相同结算单位')
  })
  it('rounds tax per line before summing; preserves fractional original amounts', () => {
    expect(applicationTotals([{ requestedAmount: '0.1', taxRate: '6' }, { requestedAmount: '0.1', taxRate: '6' }])).toEqual({ totalAmount: .2, taxAmount: .02, netAmount: .18 })
    const payload = draft(); payload.lines[0].requestedAmount = '.1'
    expect(() => data.saveFinanceApplication(payload)).toThrow('请填写')
    payload.lines[0].requestedAmount = '0.1'; data.saveFinanceApplication(payload)
    const other = draft(); other.lines[0].requestedAmount = '0.2'; data.saveFinanceApplication(other)
    expect(applicationSources(data.state)[0].appliedAmount).toBe(.3)
  })
  it('uses saved account snapshots and rejects unknown/changed accounts', () => {
    const payload = draft(), accounts = receiptAccountOptions(data.state, actor.id, payload.companyId, payload.currency)
    expect(accounts.every(account => account.companyId === 'FIN-DEMO-A')).toBe(true)
    const account = accounts.find(row => !row.unavailable)
    payload.lines[0].requestedAmount = '500'
    payload.account = receiptAccountSnapshot(data.state, actor.id, payload, account.id)
    const row = data.saveFinanceApplication(payload)
    data.state.financeBasics.bankAccounts.find(item => item.id === account.id).bankName = '已改名'
    expect(row.account.bankName).toBe(account.bankName)
    const next = draft()
    next.account = { id: 'foreign' }; expect(() => data.saveFinanceApplication(next)).toThrow('不可用')
  })
  it.each(['superAdmin', 'service', 'supervisor', 'business', 'finance', 'driver', 'financeClerk'])('does not allow %s receipt writes', role => {
    const payload = draft(); data.selectWorkbenchPersona(role)
    expect(() => data.saveFinanceApplication(payload)).toThrow('授权')
    expect(canReadApplicationKind('receipt', role)).toBe(role === 'superAdmin')
  })
  it('honors narrowed permissions and invalidates dialogs after role/reset changes', () => {
    const payload = draft(), current = captureApplicationContext(data.state, payload)
    data.selectWorkbenchPersona('superAdmin'); expect(current()).toBe(false)
    const policy = rolePermissionDraft('financeAccountant'); policy.paymentRequests.write = false
    saveRolePermissions('financeAccountant', policy); data.selectWorkbenchPersona('financeAccountant')
    expect(canWriteModule('paymentRequests')).toBe(false); expect(() => data.saveFinanceApplication(payload)).toThrow('授权')
    const valid = captureApplicationContext(data.state, payload); data.reset(); expect(valid()).toBe(false)
  })
  it('does not permit configured roles to exceed the application ceiling', () => {
    data.selectWorkbenchPersona('superAdmin')
    const policy = rolePermissionDraft('service'); policy.paymentRequests.write = true
    expect(() => saveRolePermissions('service', policy)).toThrow('不能扩张财务模块')
  })
  it('keeps payment samples isolated and disputed payment mutations blocked', () => {
    loadFinanceApplicationExamples(data.state); loadFinanceApplicationExamples(data.state)
    expect(applicationRows(data.state, 'payment')).toHaveLength(6)
    expect(applicationSources(data.state)[0].appliedAmount).toBe(0)
    expect(applicationSources(data.state, 'payment')).toEqual([])
    expect(() => data.saveFinanceApplication({ kind: 'payment', lines: [] })).toThrow('待确认')
    expect(() => data.submitFinanceApplication('RA26090790001')).toThrow('待确认')
    data.selectWorkbenchPersona('superAdmin'); expect(canReadModule('paymentRequests')).toBe(true)
    expect(data.exportFinanceApplications('payment', { ids: ['RA26090790001'] }).count).toBe(1)
  })
  it('filters exact states/currency and inclusive numeric/date ranges, exports selected versus query scope', () => {
    const first = draft(); first.lines[0].requestedAmount = '400'; first.remark = '=合成,"备注"\n换行'
    const row = data.saveFinanceApplication(first), other = data.saveFinanceApplication(draft(), true)
    expect(matchesApplicationQuery(row, { minAmount: '400', maxAmount: '400', status: '新建', currency: 'CNY', createdAt: ['2026-09-08', '2026-09-08'] })).toBe(true)
    expect(matchesApplicationQuery(row, { status: '已提交' })).toBe(false)
    const output = data.exportFinanceApplications('receipt', { ids: [row.id] })
    expect(output.count).toBe(1); expect(output.content.charCodeAt(0)).toBe(0xFEFF)
    expect(output.content).toContain('"\'=合成,""备注""\n换行"'); expect(output.content).not.toContain(other.id)
    expect(data.exportFinanceApplications('receipt').count).toBe(2)
    expect(() => data.exportFinanceApplications('receipt', { ids: [row.id], query: { status: '已提交' } })).toThrow('已变化')
  })
  it('preserves real attachment bytes, rejects duplicates and unsafe formats before persistence', () => {
    const payload = draft(), file = { name: 'proof.pdf', type: 'application/pdf', size: 8, dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=' }
    payload.attachments = [file, file]; expect(() => data.saveFinanceApplication(payload)).toThrow('206')
    payload.attachments = [file]; expect(data.saveFinanceApplication(payload).attachments).toEqual([file])
    expect(applicationFileError({ type: 'text/html', size: 20 })).toContain('206')
    expect(applicationFileError({ type: 'application/pdf', size: 20 * 1024 * 1024 })).toContain('206')
  })
  it('supports query-scope creation beyond the first 50 lines', () => {
    data.selectWorkbenchPersona('service')
    const base = data.state.costs.find(row => row.id === 'COST-24-DEMO-1')
    const ids = Array.from({ length: 51 }, (_, index) => `APP-BULK-${index}`)
    data.state.costs.push(...ids.map((id, index) => ({ ...base, id, lineNo: index + 100 })))
    confirmSources(ids)
    const payload = applicationDraft(data.state, applicationSources(data.state).map(row => row.id), 'receipt', actor)
    expect(data.saveFinanceApplication(payload).lines).toHaveLength(52)
  })
})
