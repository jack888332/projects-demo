import {reportingChargeWeight} from './reports.js'
const absent=value=>value==null||value===''
const included=row=>!row.deleted&&![row.orderStatus,row.status,row.dispatchStatus].some(status=>['已取消','子订单暂存','主订单暂存'].includes(status))
export function screenOrders(state){
  return [
    ...state.airOrders.map(row=>({...row,source:'空运',date:(row.createdAt||row.createDate||'').slice(0,10),weight:reportingChargeWeight(row,state)})),
    ...state.airChildren.map(row=>({...row,source:'子订单',date:(row.createdAt||row.createDate||'').slice(0,10),weight:reportingChargeWeight(row)})),
    ...state.groundOrders.filter(row=>!['中转','中转订单'].includes(row.orderType)).map(row=>({...row,source:'运输',date:(row.createdAt||row.createDate||'').slice(0,10),weight:absent(row.volume)?null:reportingChargeWeight({...row,grossWeight:row.weight})})),
    ...state.warehouseOrders.map(row=>({...row,source:'仓库',date:(row.createdAt||'').slice(0,10),weight:absent(row.volume)?null:reportingChargeWeight(row)})),
  ].filter(included)
}
export function operationsOverview(state,period='day',date='2026-09-08'){
  const prefix=date.slice(0,period==='day'?10:period==='month'?7:4),rows=screenOrders(state).filter(row=>row.date.startsWith(prefix)&&row.date<=date)
  const customerKeys=rows.map(row=>{if(row.customerId||row.customerPartnerId)return row.customerId||row.customerPartnerId;const partners=state.partners.filter(partner=>partner.type==='客户'&&partner.name===row.customer);return partners.length===1?partners[0].id:null})
  const unknownWeights=rows.filter(row=>row.weight==null&&(!['运输','仓库'].includes(row.source)||!absent(row.volume)))
  return {orders:rows.length,customers:customerKeys.some(key=>!key)?null:new Set(customerKeys).size,volume:unknownWeights.length?null:rows.reduce((sum,row)=>sum+(row.weight??0),0),newCustomers:state.partners.some(row=>row.type==='客户'&&!row.createdAt)?null:state.partners.filter(row=>row.type==='客户'&&row.createdAt?.startsWith(prefix)&&row.createdAt.slice(0,10)<=date).length,excludedWeight:rows.filter(row=>row.weight==null&&['运输','仓库'].includes(row.source)).length}
}
export function airlineRanking(state,period='day',date='2026-09-08',limit=10){
  const prefix=date.slice(0,period==='day'?10:period==='month'?7:4)
  const orders=state.airOrders.filter(row=>included(row)&&(row.createdAt||row.createDate||'').startsWith(prefix)&&(row.createdAt||row.createDate).slice(0,10)<=date&&row.booking?.airline)
  return [...Map.groupBy(orders,row=>row.booking.airline)].map(([airline,rows])=>({id:airline,airline,weight:rows.some(row=>reportingChargeWeight(row,state)==null)?null:rows.reduce((sum,row)=>sum+reportingChargeWeight(row,state),0)})).sort((a,b)=>(b.weight??-1)-(a.weight??-1)).slice(0,limit).map((row,index)=>({...row,rank:index+1}))
}
export const SCREEN_SERVICES=['提货','订舱','仓储','预配发送','中转','货站安检','清关派送'].map(name=>({id:name,name,total:null,completed:null}))
