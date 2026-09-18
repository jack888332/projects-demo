import { TRANSPORT_QUOTE_CURRENCIES } from './transportQuotes.js'

const currencyNames = {USD:'美元',HKD:'港元',CNY:'人民币',GBP:'英镑',EUR:'欧元',AUD:'澳元'}
export const FINANCE_CURRENCIES = TRANSPORT_QUOTE_CURRENCIES.map(code => ({code,name:currencyNames[code]}))
export const currencyName = code => currencyNames[code] || ''
export const financeRateDraft = (row = {}) => Object.fromEntries(['period','sourceCurrency','targetCurrency','rate'].map(key => [key,String(row[key] ?? '')]))
export const rateDescription = row => row.rate && currencyName(row.sourceCurrency) && currencyName(row.targetCurrency) ? `1${currencyName(row.sourceCurrency)}=${row.rate}${currencyName(row.targetCurrency)}` : ''
export const validFinancePeriod = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
export function nextFinancePeriod(current) {
  const [year,month] = current.split('-').map(Number)
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2,'0')}`
}
export function financeRateErrors(row, state, id = '') {
  const errors = {}, db = state.financeBasics
  if (!validFinancePeriod(row.period) || row.period > nextFinancePeriod(db.currentPeriod)) errors.period = '请选择历史、当前或下一个期间'
  if (!TRANSPORT_QUOTE_CURRENCIES.includes(row.sourceCurrency)) errors.sourceCurrency = '请选择原币代码'
  if (!['CNY','HKD'].includes(row.targetCurrency)) errors.targetCurrency = '目标币种仅限CNY或HKD'
  if (!/^\d+(\.\d{1,4})?$/.test(row.rate) || !Number.isFinite(Number(row.rate))) errors.rate = '请填写最多4位小数的直接汇率'
  else if (Number(row.rate) <= 0) errors.rate = '非正汇率的处理待确认（177），暂不保存'
  if (row.sourceCurrency && row.sourceCurrency === row.targetCurrency) errors.targetCurrency = '同币种汇率维护口径待确认（177）'
  if (db.rates.some(item => item.id !== id && item.status === '已生效' && ['period','sourceCurrency','targetCurrency'].every(key => item[key] === row[key]))) errors.duplicate = '已存在相同期间、原币与目标币种的已生效汇率'
  return errors
}
export const financeRateRows = state => state.financeBasics.rates.map(row => ({...row,sourceName:currencyName(row.sourceCurrency),targetName:currencyName(row.targetCurrency),description:rateDescription(row)})).sort((a,b) => b.period.localeCompare(a.period) || a.targetCurrency.localeCompare(b.targetCurrency) || a.sourceCurrency.localeCompare(b.sourceCurrency))

export function costItemErrors(name, state, id = '') {
  const value = String(name || '').trim()
  if (!value || value.length > 30) return {name:'请填写30字以内的成本项目名称'}
  if (state.financeCostItems.some(row => row.id !== id && row.name === value)) return {name:'所有状态下的成本项目名称均不能重复'}
  return {}
}

export function financeMappingRows(state, account, superAdmin = false) {
  const db = state.financeBasics
  const cost = id => state.financeCostItems.find(row=>row.id===id) || {}
  return db.departmentMappings.filter(row=>row.status!=='已删除'&&(superAdmin||account?.departmentIds?.includes(row.departmentId))).map(row=>({
    ...row,departmentCode:db.departments.find(item=>item.id===row.departmentId)?.code||'',departmentName:db.departments.find(item=>item.id===row.departmentId)?.name||'',
    level1Name:cost(row.level1Id).name,level2Name:cost(row.level2Id).name,detailName:cost(row.detailId).name,level1Code:cost(row.level1Id).code,detailCode:cost(row.detailId).code,
  })).sort((a,b)=>a.departmentCode.localeCompare(b.departmentCode)||a.level1Code.localeCompare(b.level1Code)||a.detailCode.localeCompare(b.detailCode))
}

export const INVOICE_UNIT_FIELDS = [
  {key:'name',label:'开票单位名称',required:true,max:200},
  {key:'isDefault',label:'是否默认',required:true},
  {key:'taxpayerId',label:'纳税人识别号',required:true},
  {key:'bankName',label:'开户行',max:200},
  {key:'accountNo',label:'银行账号'},
  {key:'address',label:'地址',max:200},
  {key:'phone',label:'电话',max:20},
]
export const invoiceUnitDraft = (row={}) => Object.fromEntries(INVOICE_UNIT_FIELDS.map(({key})=>[key,String(row[key]??'')]))
export function invoiceUnitErrors(row, state, profileId, id='') {
  const errors={}
  for(const field of INVOICE_UNIT_FIELDS) {
    if(field.required&&!row[field.key]?.trim()) errors[field.key]=`请填写${field.label}`
    else if(field.max&&row[field.key]?.length>field.max) errors[field.key]=`${field.label}不能超过${field.max}字`
  }
  if(!['是','否'].includes(row.isDefault)) errors.isDefault='请选择是否默认'
  if(row.accountNo&&!/^\d+$/.test(row.accountNo)) errors.accountNo='银行账号仅包含数字'
  const others=state.financeBasics.invoiceUnits.filter(item=>item.profileId===profileId&&item.id!==id&&!item.deleted)
  if(others.some(item=>item.name===row.name.trim())) errors.name='该客户已存在同名开票单位'
  if(row.isDefault==='是'&&others.some(item=>item.isDefault==='是')) errors.isDefault='该客户已有默认开票单位'
  return errors
}
export function invoiceProfileRows(state) {
  return state.financeBasics.invoiceProfiles.map(row=>{
    const partner=state.partners.find(item=>item.id===row.partnerId)
    return {...row,customerName:partner?.name||'客户不存在',creditCode:partner?.creditCode||''}
  }).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.customerName.localeCompare(b.customerName,'zh-CN'))
}

export const BANK_FIELDS=[{key:'bankName',label:'开户行名称',max:200},{key:'accountName',label:'账户名称',max:200},{key:'accountNo',label:'银行账号'},{key:'currency',label:'币种代码'},{key:'basic',label:'是否基本户'}]
export const bankAccountDraft=(row={})=>Object.fromEntries(BANK_FIELDS.map(({key})=>[key,String(row[key]??'')]))
export function bankAccountErrors(row,state,account,id='') {
  const errors={},db=state.financeBasics,existing=db.bankAccounts.find(item=>item.id===id),organizationId=existing?.organizationId||account?.organizationId
  for(const field of BANK_FIELDS) {
    if(!row[field.key]?.trim()) errors[field.key]=`请填写${field.label}`
    else if(field.max&&row[field.key].length>field.max) errors[field.key]=`${field.label}不能超过${field.max}字`
  }
  if(row.accountNo&&!/^\d+$/.test(row.accountNo)) errors.accountNo='银行账号仅包含数字'
  if(!FINANCE_CURRENCIES.some(item=>item.code===row.currency)) errors.currency='请选择币种代码'
  if(!['Y','N'].includes(row.basic)) errors.basic='请选择是否基本户'
  const others=db.bankAccounts.filter(item=>item.id!==id)
  if(others.some(item=>item.accountNo===row.accountNo&&item.companyId===account?.companyId)) errors.accountNo='相同银行账号的重复准入口径待确认（184）'
  if(row.basic==='N'&&!others.some(item=>item.organizationId===organizationId&&item.basic==='Y')) errors.basic='该组织必须保留一个基本户'
  if(existing?.status==='已停用'&&row.basic==='Y') errors.basic='已停用账户转为基本户的处理待确认（184）'
  return errors
}
export const bankAccountRows=(state,account,superAdmin=false)=>state.financeBasics.bankAccounts.filter(row=>superAdmin||row.companyId===account?.companyId).toSorted((a,b)=>a.accountNo.localeCompare(b.accountNo))
