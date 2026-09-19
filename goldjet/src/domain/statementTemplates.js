export const STATEMENT_TEMPLATES=[
  ['hangsheng-general','航晟-客户通用对账单','日期、单号、件数、装货地址、卸货地址、车牌、车型、动态费用项列、合计、到达工厂时间、装货时间、卸货时间、公司户名、开户银行、帐号RMB'],
  ['ground-export','航晟-地面操作出口账单模板','序号、出港日期、分单、件数、毛重、体积重、动态费用项列、应收金额、备注'],
  ['ups-exchange','航晟-UPS账单模板（换单）','序号、业务号、运单号、分运单号、经营单位、转仓、PCS、毛重、计费重、预报日期、换单日期、代理换单手续费(RMB)'],
  ['ups-clearance','航晟-UPS账单模板（清关）','序号、业务号、运单号、分运单号、经营单位、是否航晟提货（是否提出到非监管仓）、PCS、毛重、计费重、取整重量、到货日期、转仓日期、提货日期、商检、货站仓租天数、货站仓租单价、货站仓租金额、航晟仓租天数、航晟仓租单价、航晟仓租金额、动态费用项列、应收金额'],
  ['malaysia','航晟-马航账单模板','序号、日期、单号、件数、计费重、装货地、目的地、车型、动态费用项列、小计、备注、公司户名、开户银行、帐号RMB、制单人'],
  ['zhongzan','航晟-中赞账单模板','序号、日期、航班日期、提单号、分单号、工作号、件数、毛重、计费重、动态费用项列、总金额、备注、公司户名、开户银行、帐号RMB'],
  ['cash','高捷-现金客户账单模板','提单号、工作号、目的港、出港日期、件数、重量、RMB、公司户名、开户银行、帐号RMB'],
  ['aisha','高捷-艾莎账单模板','进仓编号、航班日期、总单号、目的港、航班、箱数、确认毛重、确认体积、确认计重、杂费、空运费、结算单价、结算重量、结算金额（不含税）、公司户名、开户银行、帐号RMB'],
  ['dsv','高捷-得斯威账单模板','序号、船东提单号/总单号、分单号、目的港、起航日期、毛重、计费重量、泡重、件数、单价、动态费用项列、合计'],
  ['lis','高捷-利斯账单模板','MAWB、POL（装货港）、POD(目的港)、Date（日期）、Gross Weight (毛重Kg)、Volume Weight (体积重量Kg)、Chargeable Weight (计费重量Kg)、Total Amount (总金额)、Currency（币种）、Freight Paid(单价)、动态费用项列'],
  ['global','高捷-全球国际账单模板','序号、航班日期、主单号码、目的地、动态费用项列、应收金额'],
  ['xinjietong','高捷-信捷通账单模板','工作号、主单号、航班号、目的地、件数、计费重量、单价、动态费用项列、总数、备注'],
  ['yida','高捷-义达账单模板','序号、航班日期、主单号码、始发地、目的地、实际件数、实际计费重、毛重、实际体积、客户名称、动态费用项列、合计'],
].map(([id,name,fields])=>({id,name,fields:fields.split('、')}))
export function templateProjection(state,statement,template,actor){
  if(!statement||!template)return {rows:[],columns:[]}
  const fees=[...new Set(statement.lines.map(line=>line.feeItem))].sort()
  const columns=template.fields.flatMap(field=>field==='动态费用项列'?fees.map((fee,i)=>[`fee${i}`,fee,150]):[[field,field,Math.max(140,field.length*15)]])
  const basics=state.financeBasics.bankAccounts.filter(bank=>bank.companyId===statement.companyId&&bank.basic==='Y'&&bank.status==='已生效'),bank=basics.length===1?basics[0]:null
  const rows=statement.lines.map((line,index)=>{
    const order=[...state.airOrders,...state.groundOrders,...state.orderCostBook.orders].find(row=>row.id===line.orderId),wb=order?.waybill
    const bills=(state.groundWaybills||[]).filter(row=>row.orderId===order?.id&&row.status!=='已取消'),bill=bills.length===1?bills[0]:null
    const data={id:line.id,序号:index+1,日期:line.businessDate,出港日期:line.businessDate,到货日期:line.businessDate,航班日期:line.businessDate,起航日期:line.businessDate,'Date（日期）':line.businessDate,
      单号:template.id==='malaysia'?line.childNo:line.orderNo,分单:line.childNo,分单号:line.childNo,分运单号:line.childNo,运单号:line.orderNo,工作号:line.orderNo,业务号:template.id==='ups-exchange'?line.orderNo:null,进仓编号:line.orderNo,
      提单号:template.id==='cash'?order?.waybillNo:line.billNo,总单号:line.billNo,主单号:line.orderNo,主单号码:line.orderNo,'船东提单号/总单号':line.orderNo,MAWB:line.orderNo,
      件数:['hangsheng-general','malaysia','zhongzan'].includes(template.id)?line.quantity:template.id==='ground-export'?order?.pieces:wb?.pieces,
      毛重:['ground-export','ups-exchange','ups-clearance','zhongzan'].includes(template.id)?order?.grossWeight:wb?.grossWeight,重量:wb?.grossWeight,箱数:wb?.pieces,确认毛重:wb?.grossWeight,确认计重:wb?.grossWeight,确认体积:wb?.volume,
      目的港:order?.destination,目的地:order?.destination,始发地:order?.origin,航班:order?.booking?.flight,航班号:order?.booking?.flight,PCS:line.unit,
      体积重:order?.volume!=null?Number(order.volume)*166.66:null,计费重量:template.id==='dsv'?line.quantity:null,单价:line.unitPrice,备注:line.remark,
      公司户名:bank?.accountName,开户银行:bank?.bankName,帐号RMB:bank?.accountNo,制单人:actor,客户名称:line.settlementParty,'Currency（币种）':line.currency,
      实际件数:wb?.pieces,实际体积:wb?.volume,空运费:line.feeItem==='空运费'?line.originalAmount:0,杂费:line.feeItem!=='空运费'?line.originalAmount:0,结算单价:line.feeItem==='空运费'?line.unitPrice:null,结算重量:line.feeItem==='空运费'?line.quantity:null,
      '结算金额（不含税）':line.amount!=null&&line.taxRate!=null?line.amount/(1+Number(line.taxRate)/100):null,
    }
    if(['hangsheng-general','malaysia'].includes(template.id))Object.assign(data,{装货地址:order?.pickup,卸货地址:order?.delivery,装货地:order?.pickup,车牌:bill?.plate,车型:bill?.vehicleType,装货时间:order?.pickupTime,...(template.id==='malaysia'?{目的地:order?.delivery}:{})})
    if(template.id==='ups-clearance')Object.assign(data,{航晟仓租单价:line.feeItem==='仓储费'?line.unitPrice:null,航晟仓租金额:line.feeItem==='仓储费'?line.originalAmount:null})
    for(const field of ['合计','应收金额','小计','总金额','总数','Total Amount (总金额)'])data[field]=line.originalAmount
    data.RMB=line.currency==='CNY'?line.originalAmount:null
    if(template.id==='ups-clearance')Object.assign(data,{'是否航晟提货（是否提出到非监管仓）':'否',货站仓租天数:0,货站仓租金额:0,货站仓租单价:0.3})
    fees.forEach((fee,i)=>{data[`fee${i}`]=line.feeItem===fee?line.originalAmount:0})
    return data
  })
  return {rows,columns}
}
