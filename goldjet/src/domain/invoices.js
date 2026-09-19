import { statementDetails } from './reconciliation.js'
import { columnsFromLabels as expenseColumns } from './recordQuery.js'
export const INVOICE_HEAD=expenseColumns('开票申请号、状态、需要开票、结算单位、成本项目、税率(%)、购买方、纳税识别号、申请金额(原币)、原币币种、即期汇率、申请金额(本位币)、创建人、创建日期')
export const INVOICE_LINES=expenseColumns('对账单号、对账单行号、订单号、业务日期、客户、结算单位、成本项目、总金额(原币)、可开票金额(原币)、币种、提单号、即期汇率、本次开票金额(原币)、本次开票金额(人民币)、对账单创建人、对账单确认日期')
export const TAX_INVOICES=expenseColumns('发票号码、发票类型、开票日期、结算单位、购买方、纳税识别号、开票币种、税额、不含税金额、价税合计、作废、发送邮件次数')
export const GOODS_COLUMNS=expenseColumns('货物或应税劳务名称、规格型号、单位、数量、单价(含税)、金额(含税)、税率(%)、税额')
export const PARTY_COLUMNS=expenseColumns('名称、纳税人识别号、地址、电话、开户行名称、银行账号')
export function invoiceSources(state){
  return statementDetails(state,'应收',{confirmedOnly:true}).map(line=>({id:`${line.statementId}:${line.id}`,sourceCostId:line.sourceCostId,partyId:line.partyId,companyId:line.companyId,
    对账单号:line.statementNo,对账单行号:line.lineNo,订单号:line.orderNo,业务日期:line.businessDate,客户:line.customer,结算单位:line.settlementParty,成本项目:line.feeItem,'总金额(原币)':line.originalAmount,'可开票金额(原币)':null,币种:line.currency,提单号:line.billNo,对账单创建人:line.statementCreator,对账单确认日期:line.confirmedAt,
  })).sort((a,b)=>String(a.对账单确认日期).localeCompare(String(b.对账单确认日期))||b.对账单号.localeCompare(a.对账单号))
}
export function invoicePreview(rows){
  if(!rows.length)throw new Error('请选择已确认应收对账明细')
  if(new Set(rows.map(row=>row.partyId)).size!==1||new Set(rows.map(row=>row.币种)).size!==1)throw new Error('请选择相同结算单位、相同原币币种')
  if(new Set(rows.map(row=>row.companyId)).size!==1)throw new Error('跨组织开票归属待确认（214）')
  return {id:'',partyId:rows[0].partyId,companyId:rows[0].companyId,开票申请号:'保存后生成',状态:'新建',需要开票:'是',结算单位:rows[0].结算单位,原币币种:rows[0].币种,即期汇率:'',创建日期:'2026-09-08',lines:JSON.parse(JSON.stringify(rows)),goods:[],buyer:null,seller:null,收件人:'财务会计演示员',复核人:'财务会计演示员',开票备注:''}
}
export function backfillCandidates(state,application){return state.invoicing.taxInvoices.filter(row=>row.作废==='否'&&row.companyId===application.companyId&&row.partyId===application.partyId&&row.购买方===application.购买方&&row.纳税识别号===application.纳税识别号&&!state.invoicing.applications.some(app=>!app.deleted&&app.invoiceId===row.id))}
export function backfillError(application,invoice){
  if(!invoice)return '请选择未作废、未关联且购买方与税号匹配的税务发票'
  if(application.原币币种!=='CNY'||application['申请金额(原币)']!==invoice.价税合计)return '异币种或金额不一致的补录规则待确认（040）'
  return ''
}
export function createInvoiceSeed(){
  const buyer={名称:'启航演示开票单位',纳税人识别号:'DEMO00000000000001',地址:'合成开票地址一号',电话:'00000000001',开户行名称:'演示银行甲',银行账号:'00000001001'}
  const seller={名称:'合成公司甲',纳税人识别号:'DEMOSELLER0000001',地址:'合成销售地址',电话:'00000000000',开户行名称:'演示银行甲',银行账号:'00000010001'}
  const goods=[{id:'IG-1',货物或应税劳务名称:'合成物流服务',规格型号:'',单位:'票',数量:1,'单价(含税)':1060,'金额(含税)':1060,'税率(%)':6,税额:60}]
  const base={partyId:'PT-00018',companyId:'FIN-DEMO-A',demoOnly:true,结算单位:'启航跨境贸易',成本项目:'合成物流服务','税率(%)':6,购买方:buyer.名称,纳税识别号:buyer.纳税人识别号,'申请金额(原币)':1060,原币币种:'CNY',即期汇率:1,'申请金额(本位币)':1060,创建人:'财务会计演示员',createdById:'financeAccountant',创建日期:'2026-09-08',buyer,seller,goods,收件人:'财务会计演示员',复核人:'财务会计演示员',开票备注:'合成发票，不具备税务效力',lines:[{id:'IL-1',对账单号:'DEMO-RECON-28',对账单行号:1,订单号:'DEMO-ORDER-28',业务日期:'2026-09-05',客户:'启航跨境贸易',结算单位:'启航跨境贸易',成本项目:'合成物流服务','总金额(原币)':1060,'可开票金额(原币)':1060,币种:'CNY',提单号:'DEMO-MAWB-28',即期汇率:1,'本次开票金额(原币)':1060,'本次开票金额(人民币)':1060,对账单创建人:'周倩',对账单确认日期:'2026-09-06'}]}
  return {invoicing:{sequence:0,notices:[],applications:[['新建','是'],['已提交','是'],['已开票','是'],['新建','否']].map(([状态,需要开票],i)=>JSON.parse(JSON.stringify({...base,id:`IA-DEMO-${i+1}`,开票申请号:`IA2609089000${i+1}`,状态,需要开票,invoiceId:状态==='已开票'?'TAX-1':''}))),taxInvoices:[1,2,3].map(i=>JSON.parse(JSON.stringify({...base,id:`TAX-${i}`,发票号码:`DEMO-TAX-26090800${i}`,发票类型:'电子普通发票',开票日期:'2026-09-08',开票币种:'CNY',税额:60,不含税金额:1000,价税合计:1060,作废:i===3?'是':'否',发送邮件次数:0,开票申请号:i===1?'IA26090890003':''})))}}
}
