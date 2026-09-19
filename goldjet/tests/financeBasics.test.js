import {beforeEach,describe,it,expect} from 'vitest'
import {usePrototypeData} from '../src/data/usePrototypeData.js'
import {rolePermissionDraft,saveRolePermissions,resetRolePermissions,canReadTarget} from '../src/data/accessControl.js'
import {financeRateErrors,financeRateRows,rateDescription,financeMappingRows,bankAccountRows} from '../src/domain/financeBasics.js'
import {FINANCE_BASIC_ACCOUNTS} from '../src/domain/financeBasicAccess.js'
import {captureFinanceContext} from '../src/data/financeBasicContext.js'
import {filterAirSupplierRates} from '../src/domain/airSupplierRates.js'
import {getWorkbenchQuickLinks} from '../src/domain/workbenchTasks.js'
const data=usePrototypeData(),draft=()=>({period:'2026-10',sourceCurrency:'EUR',targetCurrency:'CNY',rate:'7.1234'})
beforeEach(()=>{data.reset();data.selectWorkbenchPersona('financeAccountant')})
describe('GJ-022 finance basics',()=>{
  it('invalidates delayed confirmations after role, data, permission or record changes',()=>{
    const first=captureFinanceContext(data.state)
    data.selectWorkbenchPersona('financeClerk');expect(first()).toBe(false)
    const second=captureFinanceContext(data.state)
    data.reset();expect(second()).toBe(false)
    data.selectWorkbenchPersona('financeAccountant')
    const row=data.state.financeBasics.rates[0],third=captureFinanceContext(data.state,row)
    row.rate='7.2';expect(third()).toBe(false)
    expect(captureFinanceContext(data.state,row,()=>false)()).toBe(false)
  })
  it('shares maintained cost names with supplier pricing and exposes scoped workbench entrances',()=>{
    data.selectWorkbenchPersona('financeAdmin')
    data.saveFinanceCostItem('FC-0001',{code:'F001',name:'合成更名运费成本'})
    expect(filterAirSupplierRates(data.state.airSupplierRates,{feeItem:'合成更名'},data.state)).toHaveLength(1)
    expect(()=>data.setFinanceCostStatus('FC-0001','已停用')).toThrow('179')
    expect(getWorkbenchQuickLinks('financeAccountant').map(row=>row.target.path)).toEqual(['/finance/exchange-rates','/finance/department-costs','/finance/bank-accounts','/finance/costs'])
    expect(getWorkbenchQuickLinks('financeClerk')[0].target.path).toBe('/finance/invoice-entities')
  })
  it('keeps bank company scope, leading zeros and atomic organization basic-account changes',()=>{
    const account=FINANCE_BASIC_ACCOUNTS.financeAccountant,payload={bankName:'合成银行',accountName:'新增账户',accountNo:'000777',currency:'CNY',basic:'Y'}
    expect(bankAccountRows(data.state,account)).toHaveLength(3);expect(bankAccountRows(data.state,null,true)).toHaveLength(4)
    const first=data.state.financeBasics.bankAccounts[0],other=data.state.financeBasics.bankAccounts[2]
    const before=JSON.stringify(data.state.financeBasics)
    expect(()=>data.saveBankAccount('',{...payload,accountNo:'abc'})).toThrow('数字');expect(JSON.stringify(data.state.financeBasics)).toBe(before)
    expect(()=>data.saveBankAccount(first.id,{...first,basic:'N'})).toThrow('保留一个基本户')
    expect(()=>data.setBankAccountStatus(first.id,'已停用')).toThrow('基本户不能停用')
    expect(()=>data.saveBankAccount(other.id,other)).toThrow('当前公司范围')
    expect(()=>data.saveBankAccount('BANK-DEMO-004',{...payload,basic:'Y'})).toThrow('184')
    const added=data.saveBankAccount('',payload);expect(added).toMatchObject({accountNo:'000777',companyId:'FIN-DEMO-A',departmentId:'FIN-DEMO-D1',status:'已生效',basic:'Y'})
    expect(first.basic).toBe('N');expect(other.basic).toBe('Y')
    expect(()=>data.saveBankAccount('',payload)).toThrow('184')
    data.setBankAccountStatus(first.id,'已停用');data.setBankAccountStatus(first.id,'已生效')
    expect(()=>data.setBankAccountStatus('BANK-DEMO-002','已停用')).toThrow('184')
    data.selectWorkbenchPersona('superAdmin');expect(()=>data.saveBankAccount('',{...payload,accountNo:'000778'})).toThrow('授权')
  })
  it('keeps customer-level uniqueness and at most one invoice default without silent replacement',()=>{
    data.selectWorkbenchPersona('financeClerk')
    const payload={name:'合成新开票单位',isDefault:'是',taxpayerId:'TEST-TAX-ID',bankName:'',accountNo:'000123',address:'',phone:''}
    const before=JSON.stringify(data.state.financeBasics)
    expect(()=>data.saveInvoiceUnit('INV-PROFILE-001','',payload)).toThrow('已有默认');expect(JSON.stringify(data.state.financeBasics)).toBe(before)
    const row=data.saveInvoiceUnit('INV-PROFILE-001','',{...payload,isDefault:'否'});expect(row.accountNo).toBe('000123')
    expect(()=>data.saveInvoiceUnit('INV-PROFILE-001','',{...payload,isDefault:'否'})).toThrow('同名')
    expect(data.saveInvoiceUnit('INV-PROFILE-002','',{...payload,isDefault:'否'}).name).toBe(payload.name)
    const old=data.state.financeBasics.invoiceUnits.find(item=>item.id==='INV-UNIT-001')
    data.saveInvoiceUnit('INV-PROFILE-001',old.id,{...old,isDefault:'否'})
    data.saveInvoiceUnit('INV-PROFILE-001',row.id,{...row,isDefault:'是'})
    data.deleteInvoiceUnit('INV-PROFILE-001',row.id);expect(row.deleted).toBe(true)
    expect(()=>data.deleteInvoiceUnit('INV-PROFILE-001','INV-UNIT-003')).toThrow('该客户下')
    expect(()=>data.deleteInvoiceUnit('INV-PROFILE-001','INV-UNIT-002')).toThrow('183')
    expect(()=>data.createInvoiceProfile({})).toThrow('181');expect(()=>data.deleteInvoiceProfile('INV-PROFILE-001')).toThrow('183')
    data.selectWorkbenchPersona('finance');expect(()=>data.saveInvoiceUnit('INV-PROFILE-001','',{...payload,isDefault:'否'})).toThrow('授权')
  })
  it('scopes mappings, refuses ambiguous writes and hides soft-deleted associations',()=>{
    const account=FINANCE_BASIC_ACCOUNTS.financeAccountant
    expect(financeMappingRows(data.state,account)).toHaveLength(1)
    expect(financeMappingRows(data.state,null,true)).toHaveLength(2)
    expect(()=>data.deleteFinanceMapping('MAP-DEMO-002')).toThrow('授权范围')
    expect(()=>data.saveFinanceMapping({departmentId:'FIN-DEMO-D1',level1Id:'COST-001',level2Id:'COST-002',detailId:'COST-005'})).toThrow('已生效')
    expect(()=>data.saveFinanceMapping({departmentId:'FIN-DEMO-D1',level1Id:'COST-001',level2Id:'COST-002',detailId:'COST-004'})).toThrow('180')
    data.deleteFinanceMapping('MAP-DEMO-001');expect(financeMappingRows(data.state,account)).toHaveLength(0)
    expect(data.state.financeBasics.departmentMappings[0].status).toBe('已删除')
    expect(data.state.financeBasics.businessCostLinks[0].status).toBe('已生效')
  })
  it('maintains costs without inventing initial status or bypassing effective references',()=>{
    data.selectWorkbenchPersona('financeAdmin')
    expect(()=>data.saveFinanceCostItem('',{name:'新成本'})).toThrow('178')
    expect(()=>data.saveFinanceCostItem('COST-004',{code:'F018',name:'历史保管成本'})).toThrow('不能重复')
    data.saveFinanceCostItem('COST-004',{code:'F018',name:'演示改名成本'})
    expect(data.state.financeCostItems.find(row=>row.id==='COST-004').name).toBe('演示改名成本')
    const before=JSON.stringify(data.state.financeBasics)
    expect(()=>data.setFinanceCostStatus('COST-003','已停用')).toThrow('业务类型');expect(JSON.stringify(data.state.financeBasics)).toBe(before)
    expect(()=>data.setFinanceCostStatus('COST-001','已停用')).toThrow('179')
    data.setFinanceCostStatus('COST-004','已停用');data.setFinanceCostStatus('COST-004','已生效')
    data.selectWorkbenchPersona('financeAccountant');expect(()=>data.setFinanceCostStatus('COST-004','已停用')).toThrow('授权')
  })
  it('saves batches atomically and enforces precision, period and active uniqueness',()=>{
    const before=JSON.stringify(data.state.financeBasics)
    expect(()=>data.saveFinanceRates([draft(),draft()])).toThrow('本批次');expect(JSON.stringify(data.state.financeBasics)).toBe(before)
    expect(()=>data.saveFinanceRates([{...draft(),rate:'7.12345'}])).toThrow('4位')
    expect(()=>data.saveFinanceRates([{...draft(),period:'2026-11'}])).toThrow('期间')
    const [row]=data.saveFinanceRates([draft()]);expect(row.status).toBe('已生效');expect(row.updatedBy).toBe('财务会计演示员')
    expect(()=>data.saveFinanceRates([draft()])).toThrow('已存在');expect(rateDescription(row)).toBe('1欧元=7.1234人民币')
  })
  it('locks keys, soft-deletes and allows a new active rate after deletion',()=>{
    const [row]=data.saveFinanceRates([draft()]);expect(()=>data.editFinanceRate(row.id,{...row,period:'2026-09'})).toThrow('仅允许')
    data.editFinanceRate(row.id,{...row,rate:'7.1'});expect(row.rate).toBe('7.1')
    data.deleteFinanceRate(row.id);expect(row.status).toBe('已删除');expect(()=>data.editFinanceRate(row.id,row)).toThrow('已删除')
    expect(data.saveFinanceRates([draft()])).toHaveLength(1)
    expect(financeRateRows(data.state)[0].period).toBe('2026-10')
  })
  it('protects explicit historic references and unresolved nonpositive/same-currency cases',()=>{
    const before=JSON.stringify(data.state.financeBasics)
    expect(()=>data.deleteFinanceRate('FX-DEMO-003')).toThrow('177');expect(JSON.stringify(data.state.financeBasics)).toBe(before)
    expect(financeRateErrors({...draft(),rate:'0'},data.state).rate).toContain('177')
    expect(financeRateErrors({...draft(),sourceCurrency:'CNY'},data.state).targetCurrency).toContain('177')
  })
  it('separates accountant from generic finance and admin; applies narrowing',()=>{
    for(const persona of ['finance','business','superAdmin']){data.selectWorkbenchPersona(persona);expect(()=>data.saveFinanceRates([draft()])).toThrow()}
    const permissions=rolePermissionDraft('financeAccountant');permissions.exchangeRates.write=false;saveRolePermissions('financeAccountant',permissions)
    data.selectWorkbenchPersona('financeAccountant');expect(()=>data.saveFinanceRates([draft()])).toThrow();expect(canReadTarget('/finance/costs')).toBe(true)
    data.selectWorkbenchPersona('superAdmin');resetRolePermissions('financeAccountant');data.selectWorkbenchPersona('financeAccountant');expect(data.saveFinanceRates([draft()])).toHaveLength(1)
  })
})
