export function businessNotifications(state,persona){
  const admin=persona.id==='superAdmin',visible=row=>admin||row.recipient===persona.id||row.recipient===persona.name||row.recipientRole===persona.role
  const shared=[...(state.messages||[]),...(state.financeApplications?.notices||[])].filter(visible)
  const costs=(state.orderCostBook?.notices||[]).filter(row=>admin||row.recipient===persona.id||(['service','business'].includes(persona.id)&&row.recipient===persona.name)).map(row=>({id:row.id,type:row.event,content:row.event+' · '+row.rowId,recipient:row.recipient,channel:row.channel,createdAt:row.time,related:{path:'/finance/costs',query:row.adjustmentId&&!['supervisor','financeAccountant'].includes(persona.id)?{tab:'adjustments',adjustment:row.adjustmentId}:{tab:['supervisor','financeAccountant'].includes(persona.id)?'approvals':'orders',order:row.orderId,...(row.adjustmentId?{adjustment:row.adjustmentId}:{})}}}))
  const mails=admin||['hangsheng','groundSupervisor'].includes(persona.id)?state.groundOrders.flatMap(order=>(order.dispatchMails||[]).map(mail=>({id:mail.id,type:'调度邮件',content:mail.subject,body:mail.body,recipient:mail.to.join('；'),cc:mail.cc.join('；'),channel:'邮件（本地模拟）',createdAt:mail.time,status:mail.status,related:{path:'/fulfillment/ground-dispatch',query:{order:order.id}}}))):[]
  return [...shared,...costs,...mails].map(row=>({...row,recipient:row.recipient||row.recipientRole||'未提供',status:row.status||'本地模拟，未发送'})).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))
}
export function scheduledNotificationPreview(state,dateTime,persona){
  if(!/^\d{4}-\d{2}-\d{2} (09:00|18:00)$/.test(dateTime))return []
  const [date,time]=dateTime.split(' '),rows=[],admin=persona.id==='superAdmin',allowed=ids=>admin||ids.includes(persona.id)
  const add=(id,type,recipient,content,target)=>rows.push({id,type,recipient,content,channel:'企业微信',createdAt:dateTime,status:'待发送预览，未投递',related:target})
  if(time==='09:00')for(const vehicle of state.fleetVehicles){
    for(const [field,type,roles,receiver,label] of [['inspectionDate','年审到期提醒',['groundSupervisor'],'航晟卡车部主管','年审'],['insuranceEnd','保险到期提醒',['hangsheng'],'航晟卡车部客服','保险到期']]){
      const remaining=(Date.parse(vehicle[field]+'T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/86400000
      if(allowed(roles)&&remaining>=0&&remaining<=30)add(`${type}:${vehicle.id}`,type,receiver,`车牌号：${vehicle.plate}，距离本次${label}（${vehicle[field]}）已不足30天，请留意处理！`,{path:'/fulfillment/fleet',query:{tab:'vehicles'}})
    }
  }
  if(time==='18:00'){
    const tomorrow=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10)
    const ground=state.groundOrders.filter(order=>order.dispatchStatus==='未调度'&&!['已取消','已删除'].includes(order.status)&&order.pickupTime&&order.pickupTime.slice(0,10)<=tomorrow)
    if(ground.length&&allowed(['hangsheng','groundSupervisor']))add('undispatched','未调度订单提醒','航晟卡车部主管、客服',`今天还有${ground.length}个订单未处理，请尽快处理！`,{path:'/fulfillment/ground-dispatch'})
    for(const type of ['客户','供应商']){
      const pending=state.partners.filter(row=>row.type===type&&row.status==='已提交')
      if(pending.length&&allowed(['financeClerk','financeAccountant']))add(`partner:${type}`,`${type}未审批提醒`,'财务部',`尊敬的用户，您今天还有${pending[0].name}等${pending.length}个${type}申请未审批，请尽快处理！`,{path:'/foundation/partners'})
    }
  }
  return rows
}
