import { canWriteModule } from './accessControl.js'
import { financeBasicCeiling } from '../domain/financeBasicAccess.js'
import { financeRateDraft, financeRateErrors, costItemErrors, invoiceUnitDraft, invoiceUnitErrors, bankAccountDraft, bankAccountErrors } from '../domain/financeBasics.js'

export function createFinanceBasicActions(state, getSession) {
  const db = () => state.financeBasics
  function authorize(key) {
    const session = getSession()
    if (!canWriteModule(key) || !financeBasicCeiling(key,session.id)?.write) throw new Error('当前岗位未获该财务基础资料操作授权')
    return session
  }
  const stamp = () => ({updatedBy:getSession().name,updatedAt:new Date(Date.UTC(2026,8,8,14,30,++db().eventSequence)).toISOString().slice(0,19).replace('T',' ')})
  const validate = errors => { if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]),{fields:errors}) }
  function saveFinanceRates(payloads) {
    authorize('exchangeRates')
    if (!Array.isArray(payloads) || !payloads.length) throw new Error('至少保留一条汇率')
    const drafts = payloads.map(financeRateDraft), keys = new Set()
    for (const [index,row] of drafts.entries()) {
      validate(financeRateErrors(row,state))
      const key = JSON.stringify([row.period,row.sourceCurrency,row.targetCurrency])
      if (keys.has(key)) throw new Error(`第${index + 1}行与本批次其他汇率重复`)
      keys.add(key)
    }
    const audit = stamp(), rows = drafts.map(row => ({...row,id:`FX-DEMO-${++db().sequence}`,status:'已生效',...audit}))
    db().rates.push(...rows)
    return rows
  }
  function findRate(id) {
    const row = db().rates.find(item => item.id === id)
    if (!row || row.status !== '已生效') throw new Error('该汇率不存在或已删除')
    if (db().rateReferences.some(item => item.rateId === id)) throw new Error('已引用汇率的修改、删除与历史重算待确认（177）')
    return row
  }
  function editFinanceRate(id, payload) {
    authorize('exchangeRates')
    const row = findRate(id), draft = financeRateDraft(payload)
    if (['period','sourceCurrency','targetCurrency'].some(key => draft[key] !== row[key])) throw new Error('编辑时仅允许修改直接汇率')
    validate(financeRateErrors(draft,state,id))
    if (row.rate !== draft.rate) Object.assign(row,{rate:draft.rate},stamp())
    return row
  }
  function deleteFinanceRate(id) {
    authorize('exchangeRates')
    const row = findRate(id)
    Object.assign(row,{status:'已删除'},stamp())
  }
  function saveFinanceCostItem(id, payload) {
    authorize('costItems')
    validate(costItemErrors(payload.name,state,id))
    if (!id) throw new Error('新增成本项目的初始状态待确认（178），暂不保存')
    const row = state.financeCostItems.find(item=>item.id===id)
    if (!row) throw new Error('成本项目不存在')
    if (payload.code !== row.code) throw new Error('成本代码不可修改')
    const name = payload.name.trim()
    if (name !== row.name) Object.assign(row,{name},stamp())
    return row
  }
  function setFinanceCostStatus(id, status) {
    authorize('costItems')
    const row = state.financeCostItems.find(item=>item.id===id)
    if (!row || !['已生效','已停用'].includes(status)) throw new Error('成本项目或目标状态无效')
    if (row.status === status) return row
    if (status === '已停用') {
      if (db().businessCostLinks.some(link=>link.costId===id&&link.status==='已生效')) throw new Error('存在已生效的业务类型与成本项关系，无法停用')
      if (state.financeCostItems.some(item=>item.parentId===id&&item.status==='已生效') || db().departmentMappings?.some(item=>item.status==='已生效'&&[item.level1Id,item.level2Id,item.detailId].includes(id)) || state.airSupplierRates?.some(item=>item.feeItemId===id)) throw new Error('成本层级或已有引用的停用处理待确认（179）')
    }
    Object.assign(row,{status},stamp())
    return row
  }
  function saveFinanceMapping(payload) {
    const session = authorize('departmentCosts')
    if (!session.departmentIds?.includes(payload.departmentId)) throw new Error('该部门不在当前授权范围')
    for (const [key,level] of [['level1Id',1],['level2Id',2],['detailId',3]]) {
      if (!state.financeCostItems.some(row=>row.id===payload[key]&&row.level===level&&row.status==='已生效')) throw new Error('请选择已生效的对应层级成本项目')
    }
    throw new Error('成本层级来源、映射唯一键及新增后的列表结果待确认（179、180），暂不保存')
  }
  function deleteFinanceMapping(id) {
    const session = authorize('departmentCosts'), row = db().departmentMappings.find(item=>item.id===id)
    if (!row || row.status==='已删除') throw new Error('部门成本关系不存在或已删除')
    if (!session.departmentIds?.includes(row.departmentId)) throw new Error('该部门不在当前授权范围')
    Object.assign(row,{status:'已删除'},stamp())
  }
  function findInvoiceProfile(id) {
    const row=db().invoiceProfiles.find(item=>item.id===id)
    if(!row || !state.partners.some(item=>item.id===row.partnerId&&item.type==='客户'&&item.status!=='已删除')) throw new Error('客户开票资料或客户不存在')
    return row
  }
  function editableInvoiceUnit(profileId,id) {
    const row=db().invoiceUnits.find(item=>item.id===id&&item.profileId===profileId&&!item.deleted)
    if(!row) throw new Error('该客户下不存在此开票单位')
    if(db().invoiceReferences.some(item=>item.unitId===id)) throw new Error('已引用开票单位的变更和删除结果待确认（183）')
    return row
  }
  function saveInvoiceUnit(profileId,id,payload) {
    authorize('invoiceEntities')
    const profile=findInvoiceProfile(profileId),row=id?editableInvoiceUnit(profileId,id):null,draft=invoiceUnitDraft(payload)
    for(const key of Object.keys(draft)) draft[key]=draft[key].trim()
    validate(invoiceUnitErrors(draft,state,profileId,id))
    if(row&&Object.keys(draft).every(key=>draft[key]===row[key])) return row
    const audit=stamp()
    if(row) Object.assign(row,draft,audit)
    else db().invoiceUnits.push({...draft,id:`INV-UNIT-NEW-${++db().sequence}`,profileId,deleted:false,...audit})
    Object.assign(profile,audit)
    return row || db().invoiceUnits.at(-1)
  }
  function deleteInvoiceUnit(profileId,id) {
    authorize('invoiceEntities')
    const profile=findInvoiceProfile(profileId),row=editableInvoiceUnit(profileId,id),audit=stamp()
    Object.assign(row,{deleted:true},audit);Object.assign(profile,audit)
  }
  function createInvoiceProfile() {authorize('invoiceEntities');throw new Error('新增开票资料的身份字段、必填项和初始状态待确认（181、182、183）')}
  function deleteInvoiceProfile(id) {authorize('invoiceEntities');findInvoiceProfile(id);throw new Error('客户级删除的级联和引用处理待确认（183）')}
  function findBank(id,session) {
    const row=db().bankAccounts.find(item=>item.id===id)
    if(!row||row.companyId!==session.companyId) throw new Error('银行账户不在当前公司范围')
    return row
  }
  function saveBankAccount(id,payload) {
    const session=authorize('bankAccounts'),row=id?findBank(id,session):null,draft=bankAccountDraft(payload)
    if(!session.companyId||!session.organizationId||!session.departmentId) throw new Error('当前公司的组织归属待确认（107）')
    for(const key of Object.keys(draft)) draft[key]=draft[key].trim()
    validate(bankAccountErrors(draft,state,session,id))
    if(row&&Object.keys(draft).every(key=>draft[key]===row[key])) return row
    if(row&&db().bankReferences.some(item=>item.bankId===id)) throw new Error('已引用银行账户的修改影响待确认（184）')
    const organizationId=row?.organizationId||session.organizationId
    if(organizationId!==session.organizationId) throw new Error('跨组织维护资格待确认（107）')
    const audit=stamp()
    if(draft.basic==='Y') for(const item of db().bankAccounts) {
      if(item.id!==id&&item.organizationId===organizationId&&item.basic==='Y') Object.assign(item,{basic:'N'},audit)
    }
    if(row) Object.assign(row,draft,audit)
    else db().bankAccounts.push({...draft,id:`BANK-NEW-${++db().sequence}`,companyId:session.companyId,organizationId,departmentId:session.departmentId,status:'已生效',...audit})
    return row||db().bankAccounts.at(-1)
  }
  function setBankAccountStatus(id,status) {
    const session=authorize('bankAccounts'),row=findBank(id,session)
    if(!['已生效','已停用'].includes(status)) throw new Error('银行账户目标状态无效')
    if(row.status===status) return row
    if(status==='已停用'&&row.basic==='Y') throw new Error('基本户不能停用，请先调整基本户')
    if(row.organizationId!==session.organizationId) throw new Error('跨组织维护资格待确认（107）')
    if(db().bankReferences.some(item=>item.bankId===id)) throw new Error('已引用银行账户的启停影响待确认（184）')
    Object.assign(row,{status},stamp());return row
  }
  return {saveFinanceRates,editFinanceRate,deleteFinanceRate,saveFinanceCostItem,setFinanceCostStatus,saveFinanceMapping,deleteFinanceMapping,saveInvoiceUnit,deleteInvoiceUnit,createInvoiceProfile,deleteInvoiceProfile,saveBankAccount,setBankAccountStatus}
}
