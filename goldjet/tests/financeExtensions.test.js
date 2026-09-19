import { describe, it, expect } from 'vitest'
import { createWriteoffSeed, writeoffSources, writeoffPreview, writeoffCalculation } from '../src/domain/writeoffs.js'
import { filterRecords, recordsCsv } from '../src/domain/recordQuery.js'
import {createExpenseSeed,expenseOffsetDraft,expenseOffsetCheck,expenseAvailable} from '../src/domain/reimbursements.js'
import {createInvoiceSeed,backfillCandidates,backfillError} from '../src/domain/invoices.js'
import {createInvoiceActions} from '../src/data/invoiceActions.js'
import {workbenchSession,resetAccessControl} from '../src/data/accessControl.js'
import {STATEMENT_TEMPLATES,templateProjection} from '../src/domain/statementTemplates.js'
import {businessNotifications,scheduledNotificationPreview} from '../src/domain/businessNotifications.js'
import {REPORTS,visibleReports,reportRows,reportingChargeWeight} from '../src/domain/reports.js'
import {operationsOverview} from '../src/domain/operationsScreen.js'
import {manifestDecision,ddpDocuments} from '../src/domain/ddpFlows.js'
import {usePrototypeData} from '../src/data/usePrototypeData.js'
import {getModuleAccess} from '../src/data/accessControl.js'
describe('chapter33 handoffs',()=>{
  it.each([[102,100,'yes','automatic'],[104,100,'yes','manual'],[101,100,'no','manual'],[101,100,'unknown','pending'],[103,100,'yes','pending'],[97,100,'yes','pending'],[10,0,'yes','pending'],['',100,'yes','pending'],[-1,100,'yes','invalid']])('preserves the manifest boundary for %s/%s/%s',(inbound,declared,conditions,code)=>{expect(manifestDecision(inbound,declared,conditions).code).toBe(code)})
  it('follows explicit shared-owner relations and does not infer links from customers',()=>{
    const {state,reset}=usePrototypeData();reset();const before=JSON.stringify(state)
    const rows=ddpDocuments(state,'AIR-260908-001')
    expect(rows.map(row=>row.stage)).toContain('仓库作业');expect(rows.map(row=>row.stage)).toContain('货站打板')
    expect(rows.map(row=>row.stage)).not.toContain('提货调度');expect(JSON.stringify(state)).toBe(before)
    expect(ddpDocuments(state,'missing')).toEqual([])
  })
  it('does not widen business access through read-only aggregations',()=>{
    expect(getModuleAccess('ddpFlows','service').data).toBe(false)
    expect(getModuleAccess('ddpFlows','superAdmin')).toMatchObject({data:true,write:false})
    expect(getModuleAccess('reports','financeSupervisor')).toMatchObject({data:true,write:false})
  })
})
describe('chapter32 overview',()=>{it('deduplicates customers, excludes drafts and volume-less transport without converting unknown air weight to zero',()=>{
  const state={airOrders:[{id:'A',customer:'C',createdAt:'2026-09-08',grossWeight:100,volume:1},{id:'B',customer:'C',createdAt:'2026-09-08',orderStatus:'主订单暂存'}],airChildren:[],groundOrders:[{id:'G',orderType:'运输订单',customer:'C',createdAt:'2026-09-08',weight:500,volume:''}],warehouseOrders:[],partners:[{id:'P',name:'C',type:'客户',createdAt:'2026-09-08'}]}
  expect(operationsOverview(state)).toMatchObject({orders:2,customers:1,volume:166.66,newCustomers:1,excludedWeight:1})
  delete state.airOrders[0].volume;expect(operationsOverview(state).volume).toBeNull()
})})
describe('chapter31 report contracts',()=>{it('limits roles, preserves missing values and counts unloaded waybills',()=>{
  expect(REPORTS).toHaveLength(24);expect(visibleReports('service')).toEqual([]);expect(visibleReports('warehouseSupervisor').map(row=>row.id)).toEqual(['warehouse-month','warehouse-customer'])
  expect(reportingChargeWeight({waybill:{grossWeight:0,volume:0},grossWeight:500,volume:10})).toBe(0)
  expect(reportingChargeWeight({grossWeight:100,volume:1})).toBe(166.66)
  const rows=reportRows({groundOrders:[{id:'O1',orderType:'运输订单',customer:'C1',createdAt:'2026-09-08'}],groundWaybills:[{orderId:'O1',status:'已卸货'},{orderId:'O1',status:'已卸货'},{orderId:'O1',status:'已提货'}]},'ground-customer')
  expect(rows[0].运输订单总数).toBe(1);expect(rows[0].运输订单调度数).toBe(2);expect(rows[0].总应收金额).toBeNull()
})})
describe('chapter30 notifications',()=>{it('previews fixed time and recipient scope without sending or modifying data',()=>{
  const state={fleetVehicles:[{id:'V1',plate:'DEMO',inspectionDate:'2026-10-08'}],groundOrders:[{id:'O1',dispatchStatus:'未调度',pickupTime:'2026-09-09 16:00'}],partners:[],messages:[{id:'M1',recipient:'A',createdAt:'2026-09-08',content:'only A'}]}
  const before=JSON.stringify(state);expect(scheduledNotificationPreview(state,'2026-09-08 09:00',{id:'superAdmin'})).toHaveLength(1)
  expect(scheduledNotificationPreview(state,'2026-09-08 18:00',{id:'hangsheng'})).toHaveLength(1);expect(scheduledNotificationPreview(state,'2026-09-08 18:00',{id:'service'})).toEqual([])
  expect(businessNotifications(state,{id:'B',name:'B',role:'B'})).toEqual([]);expect(JSON.stringify(state)).toBe(before)
})})
describe('chapter29 templates',()=>{it('covers 13 layouts, expands fees and preserves unknown values',()=>{
  expect(STATEMENT_TEMPLATES).toHaveLength(13)
  const state={airOrders:[],groundOrders:[],orderCostBook:{orders:[]},financeBasics:{bankAccounts:[]}},statement={lines:[{id:'L1',feeItem:'费一',originalAmount:100,currency:'USD',orderNo:'O1'}]}
  const output=templateProjection(state,statement,STATEMENT_TEMPLATES[0],'演示员');expect(output.rows[0].合计).toBe(100);expect(output.rows[0].fee0).toBe(100);expect(output.rows[0].RMB).toBeNull();expect(output.rows[0].毛重).toBeUndefined()
})})
describe('chapter28 intersection-only backfill',()=>{
  it('excludes void/linked invoices and requires role, current status and equal CNY amounts',()=>{
    resetAccessControl();const state=createInvoiceSeed(),app=state.invoicing.applications[3],actions=createInvoiceActions(state)
    expect(backfillCandidates(state,app).map(row=>row.id)).toEqual(['TAX-2'])
    expect(backfillError({...app,'申请金额(原币)':100},state.invoicing.taxInvoices[1])).toContain('040')
    workbenchSession.personaId='superAdmin';expect(()=>actions.backfillInvoice(app.id,'TAX-2')).toThrow('仅财务会计')
    workbenchSession.personaId='financeAccountant';actions.backfillInvoice(app.id,'TAX-2');expect(app.状态).toBe('已补录')
    expect(backfillCandidates(state,app)).toEqual([]);expect(()=>actions.backfillInvoice(app.id,'TAX-2')).toThrow('不允许')
    workbenchSession.personaId='service'
  })
})
describe('chapter27 offset preview',()=>{
  it('balances 1000 loan against 800 reimbursement and 200 refund without mutations',()=>{
    const {expenses}=createExpenseSeed(),before=JSON.stringify(expenses),draft=expenseOffsetDraft(expenses.documents)
    expect(expenseOffsetCheck(draft).error).toBe('');draft[0].本次核销金额='999';expect(expenseOffsetCheck(draft).error).toContain('必须等于')
    expect(JSON.stringify(expenses)).toBe(before)
    expect(expenseAvailable({...expenses.documents[0],单据状态:'已结清'})).toBe(0)
    expect(()=>expenseOffsetDraft([expenses.documents[0]])).toThrow('至少')
  })
})
describe('chapter26 confirmed read and calculation contracts',()=>{
  it('projects only approved real sources with globally unique identities',()=>{
    const source={id:'A',kind:'receipt',status:'财务审批通过',createdAt:'2026-09-08',lines:[{id:'C1',requestedAmount:100}],account:{}}
    const state={financeApplications:{rows:[source,{...source,id:'B'},{...source,id:'C',demoOnly:true},{...source,id:'D',deleted:true},{...source,id:'E',status:'已提交'}]}}
    const rows=writeoffSources(state,'receipt');expect(rows.map(row=>row.id)).toEqual(['A:C1','B:C1']);expect(rows[0].availableAmount).toBeNull()
    expect(writeoffSources(state,'payment')).toEqual([])
  })
  it('rejects mixed selection and keeps calculation separate from financial state',()=>{
    const lines=[{id:'1',partyId:'P',currency:'CNY',companyId:'C',businessRate:1}]
    expect(()=>writeoffPreview([...lines,{...lines[0],currency:'USD'}])).toThrow('相同币种')
    const draft=writeoffPreview(lines);draft.accountId='B';draft.actualDate='2026-09-08';draft.actualAmount='100';draft.lines[0].writeoffAmount='80'
    expect(writeoffCalculation(draft,[],[{id:'B',currency:'CNY'}])).toMatchObject({actualLocal:100,localAmount:80,difference:20,purchase:null})
    draft.lines[0].businessRate=null;expect(writeoffCalculation(draft,[],[{id:'B',currency:'CNY'}]).difference).toBeNull()
    expect(lines[0].writeoffAmount).toBeUndefined();expect(createWriteoffSeed().writeoffs.rows.every(row=>row.demoOnly)).toBe(true)
  })
  it('filters applied numeric and date constraints and escapes CSV',()=>{
    const rows=[{id:'1',amount:10,date:'2026-09-08',text:'=SUM(1,2)'}]
    expect(filterRecords(rows,{min:11},[['min','从','min',null,'amount']])).toHaveLength(0)
    expect(filterRecords(rows,{date:['2026-09-08','2026-09-08']},[['date','日期','range']])).toHaveLength(1)
    expect(recordsCsv(rows,[['text','内容']])).toContain("'=SUM(1,2)")
  })
})
