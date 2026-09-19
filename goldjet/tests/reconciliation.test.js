import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { loadReconciliationExamples } from '../src/data/reconciliationExamples.js'
import { pendingStatementCosts, statementRows, statementDraft, statementDetails, statementTotals, matchesStatementQuery, statementFileError, statementCsv, STATEMENT_DETAIL_COLUMNS } from '../src/domain/reconciliation.js'
import { costDraft } from '../src/domain/orderCosts.js'
import { captureReconciliationContext } from '../src/data/reconciliationActions.js'
import { canReadModule, canWriteModule, rolePermissionDraft, saveRolePermissions } from '../src/data/accessControl.js'

const data = usePrototypeData(), actor = { id:'service', name:'周倩' }
const draft = (ids=['COST-23-DEMO-5'], direction='应收') => statementDraft(data.state, ids, direction, actor)
beforeEach(() => { data.reset(); data.loadOrderCostExamples() })
describe('GJ-024 reconciliation', () => {
  it('admits only financially approved unreferenced cost lines, not legacy statuses or ineffective adjustments', () => {
    expect(pendingStatementCosts(data.state,'应收').map(row=>row.id)).toEqual(['COST-23-DEMO-5'])
    expect(pendingStatementCosts(data.state,'应付')).toEqual([])
    data.state.orderCostBook.adjustments.push({id:'unresolved',status:'财务审批通过',direction:'应收'})
    expect(pendingStatementCosts(data.state,'应收')).toHaveLength(1)
  })
  it('flows from chapter23 two-stage approval to new statement and confirmation without mutating original costs', () => {
    const row=data.saveOrderCost('FIN-ORDER-DEMO-001','',{...costDraft(data.state),childNo:'FINDEMO260901',partyId:'PT-00018',feeItemId:'COST-003',quantity:'3',unit:'票',taxRate:'6',unitPrice:'105'})
    data.submitOrderCosts([row.id]);data.selectWorkbenchPersona('supervisor');data.reviewOrderCosts([row.id],true)
    data.selectWorkbenchPersona('financeAccountant');data.reviewOrderCosts([row.id],true)
    data.selectWorkbenchPersona('service')
    const before=JSON.stringify(row), statement=data.saveStatement(draft([row.id]))
    expect(statement).toMatchObject({id:'BL26090800001',status:'新建',statementDirection:'应收',period:null})
    expect(statement.lines[0]).toMatchObject({sourceCostId:row.id,originalAmount:315,quantity:'3',unit:'票',taxRate:'6'})
    expect(pendingStatementCosts(data.state,'应收').some(item=>item.id===row.id)).toBe(false)
    expect(statementDetails(data.state,'应收',{confirmedOnly:true})).toEqual([])
    data.confirmStatement(statement.id)
    expect(statementDetails(data.state,'应收',{confirmedOnly:true})[0]).toMatchObject({originalAmount:315,statementStatus:'已确认'})
    expect(JSON.stringify(row)).toBe(before)
    expect(()=>data.confirmStatement(statement.id)).toThrow('只有新建')
  })
  it('can use an existing payable after both approval stages, without enabling new payable cost creation', () => {
    data.submitOrderCosts(['COST-23-DEMO-6']);data.selectWorkbenchPersona('supervisor');data.reviewOrderCosts(['COST-23-DEMO-6'],true)
    data.selectWorkbenchPersona('financeAccountant');data.reviewOrderCosts(['COST-23-DEMO-6'],true);data.selectWorkbenchPersona('service')
    const row=data.saveStatement(draft(['COST-23-DEMO-6'],'应付'),true)
    expect(row).toMatchObject({status:'已确认',statementDirection:'应付',settlementParty:'东方航空'})
    expect(statementDetails(data.state,'应付',{confirmedOnly:true})).toHaveLength(1)
  })
  it('keeps drafts isolated and derives identities, amounts and states from the source', () => {
    const payload=draft();payload.remark='单独草稿'
    expect(data.state.reconciliation.statements).toEqual([])
    payload.status='已确认';payload.createdBy='forged';payload.statementNo='forged';payload.period='fake';payload.settlementParty='fake'
    const row=data.saveStatement(payload)
    expect(row).toMatchObject({createdBy:'周倩',statementNo:'BL26090800001',status:'新建',settlementParty:'启航跨境贸易',period:null})
    payload.lines[0].unitPrice='9000';expect(row.lines[0].unitPrice).toBe('180')
  })
  it('rejects duplicate, stale, mixed direction and mixed settlement party selections atomically', () => {
    loadReconciliationExamples(data.state)
    expect(()=>draft([])).toThrow('至少一条')
    expect(()=>draft(['COST-23-DEMO-5','COST-23-DEMO-5'])).toThrow('不重复')
    expect(()=>draft(['COST-23-DEMO-5','COST-24-DEMO-3'])).toThrow('相同结算单位')
    expect(()=>draft(['COST-24-DEMO-4'])).toThrow('部分明细')
    const payload=draft();data.saveStatement(payload)
    const before=JSON.stringify(data.state.reconciliation)
    expect(()=>data.saveStatement(payload)).toThrow('部分明细')
    expect(JSON.stringify(data.state.reconciliation)).toBe(before)
  })
  it('refuses stale source fields at save and at confirmation', () => {
    const payload=draft();data.state.costs.find(row=>row.id==='COST-23-DEMO-5').remark='changed'
    expect(()=>data.saveStatement(payload)).toThrow('源明细已变化')
    const row=data.saveStatement(draft());data.state.costs.find(row=>row.id==='COST-23-DEMO-5').originalAmount=1
    expect(()=>data.confirmStatement(row.id)).toThrow('源成本明细已变化')
    expect(row.status).toBe('新建')
  })
  it('blocks cross-company grouping until the ownership rule is specified', () => {
    loadReconciliationExamples(data.state)
    data.state.orderCostBook.orders.find(row=>row.id==='FIN-ORDER-24-DEMO').companyId='OTHER'
    expect(()=>draft(['COST-23-DEMO-5','COST-24-DEMO-1'])).toThrow('200')
  })
  it('groups amounts by original currency, never adds USD and CNY together', () => {
    loadReconciliationExamples(data.state)
    const row=data.saveStatement(draft(['COST-24-DEMO-1','COST-24-DEMO-2']),true)
    expect(statementTotals(row.lines)).toEqual([{currency:'CNY',amount:1200},{currency:'USD',amount:200}])
    expect(row.lines[1].amount).toBe(1410)
  })
  it('does not limit query-scope creation to the first 50 records', () => {
    const base=data.state.costs.find(row=>row.id==='COST-23-DEMO-5')
    for(let index=0;index<54;index++)data.state.costs.push({...base,id:`BULK-${index}`,lineNo:100+index})
    const ids=pendingStatementCosts(data.state,'应收').map(row=>row.id)
    expect(data.saveStatement(draft(ids)).lines).toHaveLength(55)
    expect(pendingStatementCosts(data.state,'应收')).toEqual([])
  })
  it.each(['business','financeClerk'])('permits %s to save-and-confirm but does not infer independent confirm permission', role => {
    data.selectWorkbenchPersona(role)
    const row=data.saveStatement(draft(),true);expect(row.status).toBe('已确认')
    expect(()=>data.confirmStatement(row.id)).toThrow('授权')
  })
  it.each(['finance','financeAccountant','supervisor','driver','stationPallet','masterAdmin'])('does not grant %s by role name similarity or general finance membership', role => {
    data.selectWorkbenchPersona(role)
    expect(canReadModule('reconciliation')).toBe(false)
    expect(()=>data.saveStatement(draft())).toThrow('授权')
    expect(()=>data.exportStatementDetails('应收',{})).toThrow('授权')
  })
  it('keeps SuperAdmin read-only while allowing inspection and real detail export', () => {
    data.saveStatement(draft());data.selectWorkbenchPersona('superAdmin')
    expect(canReadModule('reconciliation')).toBe(true);expect(canWriteModule('reconciliation')).toBe(false)
    expect(()=>data.confirmStatement('BL26090800001')).toThrow('授权')
    expect(data.exportStatementDetails('应收',{}).count).toBe(1)
  })
  it('enforces data-owner authorization after permission changes and rejects stale contexts', () => {
    const row=draft(), valid=captureReconciliationContext(data.state,row)
    data.selectWorkbenchPersona('superAdmin');expect(valid()).toBe(false)
    const policy=rolePermissionDraft('service');policy.reconciliation.write=false;saveRolePermissions('service',policy)
    data.selectWorkbenchPersona('service');expect(()=>data.saveStatement(row)).toThrow('授权')
    const second=captureReconciliationContext(data.state,row);data.reset();expect(second()).toBe(false)
  })
  it('cannot expand the role ceiling through permission configuration', () => {
    data.selectWorkbenchPersona('superAdmin')
    const policy=rolePermissionDraft('financeAccountant');policy.reconciliation={menu:true,page:true,data:true,write:true}
    expect(()=>saveRolePermissions('financeAccountant',policy)).toThrow('不能扩张财务模块')
    expect(canReadModule('reconciliation','financeAccountant')).toBe(false)
  })
  it('leaves gated deletion and email without mutations or fake external success', () => {
    const row=data.saveStatement(draft()), before=JSON.stringify(data.state.reconciliation)
    expect(()=>data.deleteStatement(row.id)).toThrow('194')
    expect(()=>data.sendStatementMail(row.id)).toThrow('197')
    expect(JSON.stringify(data.state.reconciliation)).toBe(before)
  })
  it('uses fuzzy number query for headers but exact match for detail numbers, and inclusive dates', () => {
    const row=data.saveStatement(draft())
    expect(matchesStatementQuery(row,{statementNo:'260908'},'statements')).toBe(true)
    const line=statementDetails(data.state,'应收')[0]
    expect(matchesStatementQuery(line,{statementNo:'260908'},'details')).toBe(false)
    expect(matchesStatementQuery(line,{statementNo:row.statementNo,statementDate:['2026-09-08','2026-09-08']},'details')).toBe(true)
  })
  it('exports all applied results with BOM, identity columns and safe CSV escaping', () => {
    const row=data.saveStatement(draft())
    row.lines[0].customer='=合成,"字段"\n下一行'
    const output=data.exportStatementDetails('应收',{statementNo:row.statementNo})
    expect(output).toMatchObject({name:'应收对账单明细-2026-09-08.csv',count:1})
    expect(output.content.charCodeAt(0)).toBe(0xFEFF)
    expect(output.content).toContain('"\'=合成,""字段""\n下一行"')
    expect(output.content).toContain('"1800"');expect(output.content).toContain('"FINDEMO260902"')
    expect(()=>data.exportStatementDetails('应收',{statementNo:'missing'})).toThrow('没有可导出')
    expect(STATEMENT_DETAIL_COLUMNS.some(([key])=>key==='lineNo')).toBe(true)
    expect(statementCsv([])).toContain('对账单号')
  })
  it('validates and preserves PDF/text/image bytes, remark length and file boundaries', () => {
    const payload=draft(), bytes=Buffer.from('%PDF-1.4\nsynthetic\n')
    payload.attachments=[{name:'demo.pdf',type:'application/pdf',size:bytes.length,dataUrl:`data:application/pdf;base64,${bytes.toString('base64')}`}]
    payload.remark='a'.repeat(201);expect(()=>data.saveStatement(payload)).toThrow('200')
    payload.remark='a'.repeat(200);const row=data.saveStatement(payload)
    expect(row.attachments).toEqual(payload.attachments)
    expect(statementFileError({type:'application/pdf',size:20*1024*1024})).toContain('小于20MB')
    expect(statementFileError({type:'text/html',size:30})).toContain('198')
  })
  it('rejects same-name or invalid attachments before allocating a number', () => {
    const payload=draft(), file={name:'a.txt',type:'text/plain',size:1,dataUrl:'data:text/plain;base64,YQ=='}
    payload.attachments=[file,file];expect(()=>data.saveStatement(payload)).toThrow('同名')
    payload.attachments=[{...file,dataUrl:'javascript:alert(1)'}];expect(()=>data.saveStatement(payload)).toThrow('无效')
    expect(data.state.reconciliation.sequence).toBe(0)
  })
  it('loads synthetic statements idempotently and resets their owner and cost references', () => {
    loadReconciliationExamples(data.state);loadReconciliationExamples(data.state)
    expect(statementRows(data.state)).toHaveLength(2)
    expect(data.state.costs.filter(row=>row.id.startsWith('COST-24-DEMO'))).toHaveLength(6)
    data.reset();expect(statementRows(data.state)).toEqual([])
    expect(data.state.costs.some(row=>row.id.startsWith('COST-24-DEMO'))).toBe(false)
  })
})
