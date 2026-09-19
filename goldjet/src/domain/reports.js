import {warehouseMonthly} from './warehouseViews.js'
import {groundMonthlyRows} from './groundOrders.js'
export const REPORTS=[
  ['warehouse-month','航晟仓库月度报表','仓储与陆运','warehouseSupervisor','月份、总入库订单数、总出库订单数、中转出库订单数、总应收、总应付、预计盈利','月份'],
  ['warehouse-customer','仓库客户贡献度月报','仓储与陆运','warehouseSupervisor','月份、客户名称、仓库订单总数、入库总重量、入库总件数、出库总重量、出库总件数、总应收金额','月份'],
  ['ground-customer','用车客户贡献度月报','仓储与陆运','groundSupervisor','月份、客户名称、运输订单总数、运输订单调度数、总应收金额','月份'],
  ['ground-supplier','陆运供应商贡献度月报','仓储与陆运','groundSupervisor','月份、供应商名称、运输订单总数、运输订单调度数、总应付金额','月份'],
  ['driver-usage','陆运不配合司机','仓储与陆运','groundSupervisor','司机姓名、联系方式、供应商公司、累计未操作小程序订单数','供应商公司'],
  ['ground-month','航晟陆运月度报表','仓储与陆运','groundTransportSupervisor','月份、调度订单数、完成运输订单数、完成中转订单数、完成总订单数、总应收、总应付、预计盈利','月份'],
  ['partner','合作方交易检查表','财务与账龄','financeSupervisor','合作方类型、合作方编码、合作方名称、最后一次交易时间',''],
  ...[['cost','结算成本'],['payment','付款申请'],['receipt','收款申请']].map(([id,label])=>[`timeout-${id}`,`审批超时报表-${label}`,'财务与账龄','financeSupervisor','单据类型、单据编码、超时审批节点、超时时长','']),
  ['pay-cycle','应付周期报表','财务与账龄','financeSupervisor','日期区间、供应商名称、应付总额、一个月、两个月、三个月、四个月、半年、一年内、一年以上、付款合计、余额、业务员',''],
  ['pay-aging','应付账款账龄表','财务与账龄','financeSupervisor','序号、供应商、一个月、两个月、三个月、1~2年、2~3年、3年以前、汇总',''],
  ['receipt-cycle','收款周期报表','财务与账龄','financeSupervisor','序号、客户、一个月、两个月、三个月、1~2年、2~3年、3年以前、汇总',''],
  ['receipt-aging','应收账款账龄表','财务与账龄','financeSupervisor','序号、客户、一个月、两个月、三个月、1~2年、2~3年、3年以前、汇总',''],
  ['company-performance','公司业绩表','业绩与利润','financeSupervisor','组织名称、业务类型、实际重量、应收金额、应付金额、预计毛利、上年应收、上年应付、上年毛利',''],
  ['partner-performance','供应商与客户业绩表','业绩与利润','financeSupervisor','组织名称、客户名称、供应商、目的地、实际重量、应收金额、应付金额、预计毛利、上年应收、上年应付、上年毛利',''],
  ['company-profit','公司利润表','业绩与利润','financeSupervisor','序号、组织名称、出港日期、客户名称、供应商名称、提单号、工作号、业务员、业务类型、始发地、目的地、航空公司、应收本位币、拖欠本位币、应付本位币、未付本位币、预计利润、实际件数、实际毛重、实际计费重、实际体积、提单件数、提单毛重、提单计费重、提单体积、损益金额、让利金额、实际毛利、航司或同行、提单属性、备注、同意亏损、t量、亏损备注、财务结算日、建档人、操作审核人、原工作号、是否需提货、我司报关、我司进仓调、全程货、我司转仓、原业务类型',''],
  ['business-profit','业务利润表','业绩与利润','financeSupervisor','业务员、客户名称、收款期限、应收款合计、第一周收款、第二周收款、第三周收款、第四周收款、收款合计、所有合计',''],
  ['air-customer','空运客户贡献月度报表','空运经营','','月份、客户名称、主订单数、总应收金额（CNY）','月份'],
  ['air-sales','空运业务员月度绩效报表','空运经营','','业务员、月份、主订单数、业绩（CNY）','业务员、月份'],
  ['air-airline','航司月度出货量报表','空运经营','','航司、月份、订单量、出货量（kg）','航司、月份'],
  ...['电商利润分析表','电商毛利分析表','电商统计表'].map((name,index)=>[`commerce-${index}`,name,'业绩与利润','financeSupervisor','','']),
].map(([id,name,group,role,fields,filters])=>({id,name,group,role,fields:fields?fields.split('、'):[],filters:filters?filters.split('、'):[],manual:role==='financeSupervisor'}))
export const visibleReports=persona=>REPORTS.filter(report=>persona==='superAdmin'||report.role===persona)
const grouped=(rows,key)=>[...Map.groupBy(rows,key).entries()]
const monthOf=row=>(row.createdAt||row.createDate||'').slice(0,7)
const sumKnown=(rows,fn)=>rows.every(row=>fn(row)!=null&&Number.isFinite(Number(fn(row))))?rows.reduce((sum,row)=>sum+Number(fn(row)),0):null
export function reportingChargeWeight(order,state){
  const warehouses=state?.warehouseOrders?.filter(row=>row.airOrderId===order.id&&row.status!=='已取消')||[]
  const actual=warehouses.length===1?warehouses[0]:order.warehouse
  for(const cargo of [order.waybill,actual,order])if(cargo&&cargo.grossWeight!=null&&cargo.grossWeight!==''&&cargo.volume!=null&&cargo.volume!==''&&Number.isFinite(Number(cargo.grossWeight))&&Number.isFinite(Number(cargo.volume)))return Math.max(Number(cargo.grossWeight),Number(cargo.volume)*166.66)
  return null
}
export function reportRows(state,id){
  if(id==='warehouse-month')return warehouseMonthly(state).map(row=>({id:row.month,月份:row.month,总入库订单数:row.unresolvedInbound?null:row.inbound,总出库订单数:row.outbound,中转出库订单数:row.transferOutbound,总应收:row.amounts.map(amount=>`${amount.currency} ${amount.receivable.toFixed(2)}`).join('；')||null,总应付:row.amounts.map(amount=>`${amount.currency} ${amount.payable.toFixed(2)}`).join('；')||null,预计盈利:row.amounts.map(amount=>`${amount.currency} ${amount.profit.toFixed(2)}`).join('；')||null}))
  if(id==='ground-month')return groundMonthlyRows(state.groundOrders).map(row=>({id:row.month,月份:row.month,调度订单数:row.dispatchCount,完成运输订单数:row.transportCount,完成中转订单数:row.transferCount,完成总订单数:row.totalCount,总应收:row.receivable,总应付:row.payable,预计盈利:row.profit}))
  if(id==='warehouse-customer')return grouped(state.warehouseOrders.filter(row=>row.status!=='已取消'),row=>`${monthOf(row)}|${row.customer}`).map(([key,orders])=>({id:key,月份:monthOf(orders[0]),客户名称:orders[0].customer,仓库订单总数:orders.length,入库总重量:sumKnown(orders,row=>row.pallets.reduce((sum,pallet)=>sum+Number(pallet.inWeight),0)),入库总件数:sumKnown(orders,row=>row.pallets.reduce((sum,pallet)=>sum+Number(pallet.inPieces),0)),出库总重量:sumKnown(orders,row=>row.pallets.reduce((sum,pallet)=>sum+Number(pallet.outWeight),0)),出库总件数:sumKnown(orders,row=>row.pallets.reduce((sum,pallet)=>sum+Number(pallet.outPieces),0)),总应收金额:null})).sort((a,b)=>b.月份.localeCompare(a.月份)||b.仓库订单总数-a.仓库订单总数)
  if(id==='ground-customer')return grouped(state.groundOrders.filter(row=>!['中转','中转订单'].includes(row.orderType)),row=>`${monthOf(row)}|${row.customer}`).map(([key,orders])=>({id:key,月份:monthOf(orders[0]),客户名称:orders[0].customer,运输订单总数:orders.length,运输订单调度数:state.groundWaybills.filter(bill=>orders.some(order=>order.id===bill.orderId)&&bill.status==='已卸货').length,总应收金额:null})).sort((a,b)=>b.月份.localeCompare(a.月份)||b.运输订单总数-a.运输订单总数)
  if(id==='air-airline')return grouped(state.airOrders.filter(row=>!row.deleted&&row.booking?.airline),row=>`${monthOf(row)}|${row.booking.airline}`).map(([key,orders])=>({id:key,月份:monthOf(orders[0]),航司:orders[0].booking.airline,订单量:orders.length,'出货量（kg）':sumKnown(orders,reportingChargeWeight)})).sort((a,b)=>b.月份.localeCompare(a.月份)||(b['出货量（kg）']??-1)-(a['出货量（kg）']??-1))
  if(id==='air-customer'||id==='air-sales')return []
  return reportSamples(id)
}
export function reportSamples(id){
  const schema=REPORTS.find(row=>row.id===id);if(!schema?.fields.length)return []
  const sample={id:`REPORT-SAMPLE-${id}`,月份:'2026-08',序号:1,组织名称:'合成公司甲',业务类型:'空运出口',客户名称:'启航跨境贸易',客户:'启航跨境贸易',供应商:'东方航空',供应商名称:'东方航空',司机姓名:'合成司机',联系方式:'00000031001',供应商公司:'合成车队',累计未操作小程序订单数:null,业务员:'合成业务员',合作方类型:'客户',合作方编码:'DEMO-CUSTOMER-31',合作方名称:'启航跨境贸易',最后一次交易时间:'2026-08-18',单据类型:id==='timeout-cost'?'结算单':id==='timeout-payment'?'付款单':'收款单',单据编码:'DEMO-DOC-31',超时审批节点:'财务审批',超时时长:null,实际重量:1000,应收金额:10000,应付金额:8000,预计毛利:2000,上年应收:9000,上年应付:7500,上年毛利:1500,日期区间:'2026-08-01 至 2026-08-31',出港日期:'2026-08-18',提单号:'DEMO-MAWB-31',工作号:'DEMO-ORDER-31',始发地:'PVG',目的地:'LAX',航空公司:'东方航空',应收本位币:10000,应付本位币:8000,预计利润:2000,备注:'固定合成样表，不是审批生成结果'}
  return [Object.fromEntries([['id',sample.id],...schema.fields.map(field=>[field,sample[field]??null])])]
}
