import { TRANSPORT_QUOTE_CURRENCIES } from './transportQuotes.js'
import { validCapacityDate } from './airCapacity.js'
export const STATION_CURRENCIES = TRANSPORT_QUOTE_CURRENCIES
export const STATION_CHARGE_METHODS = ['常规','物流计费方式','梯度报价方式','首加续报价方式']
export const STATION_QUOTE_COLUMNS = [['customer','客户'],['taxRate','税率（%）'],['currency','币种'],['subject','报价科目'],['amount','报价金额'],['unit','单位'],['chargeMethod','计费方式'],['startDate','生效日期'],['endDate','截止日期'],['remark','备注'],['updatedAt','更新时间']]
export const stationQuoteDraft = (row={}) => Object.fromEntries(Object.entries({partnerId:'',taxRate:'',currency:'CNY',subject:'打板费',amount:'',unit:'kg',chargeMethod:'常规',startDate:'',endDate:'',remark:''}).map(([key,value])=>[key,row[key]??value]))
export const stationQuoteCustomers = state => state.partners.filter(row=>row.type==='客户'&&state.groundCustomerPartnerIds.includes(row.id)&&row.status!=='已删除')
export const stationQuoteRows = state => state.stationQuotes.map(row=>({...row,customer:state.partners.find(partner=>partner.id===row.partnerId)?.name||''})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id))
export function stationQuoteErrors(draft,state,existing){
  const errors={}
  if(!stationQuoteCustomers(state).some(row=>row.id===draft.partnerId))errors.partnerId='请选择航晟客户档案'
  if(draft.taxRate===''||!state.stationTaxRates.includes(Number(draft.taxRate)))errors.taxRate='请选择已配置税率'
  if(!STATION_CURRENCIES.includes(draft.currency))errors.currency='请选择币种'
  if(draft.subject!=='打板费')errors.subject='报价科目须为打板费'
  if(draft.unit!=='kg')errors.unit='单位须为kg'
  if(!/^-?\d+(\.\d+)?$/.test(String(draft.amount))||!Number.isFinite(Number(draft.amount)))errors.amount='请填写有效报价金额'
  if(draft.chargeMethod!=='常规')errors.chargeMethod='复杂计费配置及算法待确认（173），暂不保存'
  if(!validCapacityDate(draft.startDate))errors.startDate='请选择有效生效日期'
  if(!validCapacityDate(draft.endDate))errors.endDate='请选择有效截止日期'
  else if(draft.endDate<draft.startDate)errors.endDate='截止日期不能早于生效日期'
  if(typeof draft.remark!=='string'||draft.remark.length>500)errors.remark='备注最多500个字符'
  if(existing){
    for(const key of ['partnerId','taxRate','currency'])if(String(draft[key])!==String(existing[key]))errors[key]='该字段的编辑继承规则待确认（173），暂不修改'
    if((state.costs||[]).some(row=>row.stationQuoteId===existing.id))errors.quote='报价已关联费用，历史重算规则待确认（055），暂不修改'
  }
  return errors
}
