import { describe, expect, it } from 'vitest'
import {
  createPartnerBank, createPartnerContact, createPartnerDraft, createPartnerRecipient,
  getPartnerLockedFields, getPartnerPermissions, normalizePartner, validateCreditAmount, validatePartnerDraft,
} from '../src/domain/partnerOperations.js'
import { PARTNER_SAMPLE_ATTACHMENT } from '../src/domain/partnerPresentation.js'

const context = { department: '演示业务部', organizationNames: ['演示集团公司'] }
const valid = (changes = {}) => ({
  ...createPartnerDraft('客户'), name: '演示外部客户', shortName: '演示客户', relationship: '境内机构',
  creditCode: '000000000000000001', category: '外部单位',
  address: { country: '中国', province: '上海市', city: '上海市', district: '', detail: '合成地址' },
  longTerm: true, taxRate: 0, sales: '演示业务员', signedContract: '否', paymentDays: 0,
  attachments: [{ ...PARTNER_SAMPLE_ATTACHMENT }], ...changes,
})
const saved = (changes = {}) => normalizePartner({ ...valid(), id: 'P-1', code: 'C00001', status: '新建', department: context.department, ...changes })
const row = (changes = {}) => ({ ...createPartnerContact(), type: '操作联系人', name: '演示联系人', phone: '00000000000', mobile: '00000000000', email: 'demo@example.invalid', ...changes })

describe('GJ-003 合作方草稿与适配', () => {
  it('草稿覆盖基本、业务、地址、附件和三类子表，互不共享引用', () => {
    const first = createPartnerDraft('供应商')
    const second = createPartnerDraft('客户')
    first.address.country = '中国'
    first.banks.push(createPartnerBank())
    expect(second.address.country).toBe('')
    expect(second.banks).toEqual([])
    expect(first.type).toBe('供应商')
    expect(createPartnerContact()).toHaveProperty('mobile', '')
    expect(createPartnerRecipient()).toHaveProperty('position', '')
  })

  it('旧 seed 状态迁移但不伪造缺少的档案或授信值', () => {
    const source = { id: 'P', type: '客户', status: '有效', owner: '演示业务部', creditLimit: 100, availableCredit: -10, contact: '旧联系人', banks: [{ accountNo: 'demo' }] }
    const before = JSON.stringify(source)
    const result = normalizePartner(source)
    expect(result.status).toBe('已生效')
    expect(result.department).toBe('演示业务部')
    expect(result.creditLimit).toBe(100)
    expect(result.availableCredit).toBe(-10)
    expect(result.contacts).toEqual([])
    expect(result.creditCode).toBe('')
    expect(result.banks[0].id).toBe('P-banks-1')
    result.banks[0].accountNo = 'modified'
    expect(JSON.stringify(source)).toBe(before)
    expect(normalizePartner({ status: '失效' }).status).toBe('已失效')
  })
})

describe('GJ-003 合作方字段校验', () => {
  it('接受完整中国地址与零税率/账期，不强迫用户添加可增删子表行', () => {
    expect(validatePartnerDraft(valid(), [], context)).toEqual({})
  })

  it('必填和受控值逐字段反馈，国内统一信用码为18位', () => {
    const errors = validatePartnerDraft(valid({ name: '', taxRate: 2, creditCode: 'short', attachments: [] }), [], context)
    expect(errors).toHaveProperty('name')
    expect(errors).toHaveProperty('taxRate')
    expect(errors).toHaveProperty('creditCode')
    expect(errors).toHaveProperty('attachments')
  })

  it('海外可无信用码、省市；营业期限长期与日期互斥', () => {
    const overseas = valid({ relationship: '境外机构', creditCode: '', address: { country: '日本', province: '', city: '', district: '', detail: 'Synthetic address' } })
    expect(validatePartnerDraft(overseas, [], context)).toEqual({})
    expect(validatePartnerDraft({ ...overseas, businessExpiry: '2030-01-01' }, [], context)).toHaveProperty('businessExpiry')
    expect(validatePartnerDraft({ ...overseas, longTerm: false, businessExpiry: '2026-02-30' }, [], context)).toHaveProperty('businessExpiry')
    expect(validatePartnerDraft({ ...overseas, longTerm: false, businessExpiry: '2030-01-01' }, [], context)).toEqual({})
  })

  it('国内省市必填，海外省市规则矛盾只阻断填入省市的路径', () => {
    const domestic = valid({ address: { country: '中国', detail: '合成地址' } })
    expect(validatePartnerDraft(domestic, [], context)).toHaveProperty('address.province')
    const overseas = valid({ address: { country: '日本', province: '演示省', detail: '合成地址' } })
    expect(validatePartnerDraft(overseas, [], context)).toHaveProperty('address')
  })

  it('按组织匹配合作方类别，缺少组织范围不假设都是外部', () => {
    expect(validatePartnerDraft(valid({ name: '演示集团公司' }), [], context)).toHaveProperty('category')
    expect(validatePartnerDraft(valid({ name: '演示集团公司', category: '集团内部机构' }), [], context)).toEqual({})
    expect(validatePartnerDraft(valid(), [], { department: context.department })).toHaveProperty('category')
  })

  it('同组织、同类型的名称或信用码唯一，已删除和自身记录不冲突', () => {
    const first = saved()
    expect(validatePartnerDraft(valid(), [first], context)).toHaveProperty('name')
    expect(validatePartnerDraft(valid({ name: '不同名称' }), [first], context)).toHaveProperty('creditCode')
    expect(validatePartnerDraft(valid(), [{ ...first, department: '其他部门' }], context)).toEqual({})
    expect(validatePartnerDraft(valid(), [{ ...first, type: '供应商' }], context)).toEqual({})
    expect(validatePartnerDraft(valid(), [{ ...first, status: '已删除' }], context)).toEqual({})
    expect(validatePartnerDraft(first, [first], { ...context, existing: first })).toEqual({})
  })

  it('子表按实际添加行验证必填、长度和重复键', () => {
    const errors = validatePartnerDraft(valid({ contacts: [row(), row(), row({ name: '', phone: '000000000000' })] }), [], context)
    expect(errors).toHaveProperty('contacts.1.email')
    expect(errors).toHaveProperty('contacts.2.name')
    expect(errors).toHaveProperty('contacts.2.phone')
    const banks = [{ ...createPartnerBank(), accountNo: 'demo-account' }, { ...createPartnerBank(), accountNo: 'demo-account' }]
    expect(validatePartnerDraft(valid({ banks }), [], context)).toHaveProperty('banks.1.accountNo')
  })

  it('客户邮箱收件人按邮箱去重，供应商按类型和邮箱组合去重', () => {
    const recipients = [{ ...createPartnerRecipient(), type: '业务', email: 'demo@example.invalid' }, { ...createPartnerRecipient(), type: '财务', email: 'demo@example.invalid' }]
    expect(validatePartnerDraft(valid({ recipients }), [], context)).toHaveProperty('recipients.1.email')
    expect(validatePartnerDraft(valid({ type: '供应商', recipients }), [], context)).toEqual({})
  })
})

describe('GJ-003 编辑与角色权限', () => {
  it('供应商基本信息整体只读，客户营业期限/类别可编辑，业务资料保留各自权限', () => {
    expect(getPartnerLockedFields(saved({ type: '供应商' }))).toContain('businessExpiry')
    expect(getPartnerLockedFields(saved())).not.toContain('businessExpiry')
    expect(getPartnerLockedFields(saved())).toContain('sales')
    const existing = saved()
    expect(validatePartnerDraft({ ...existing, sales: '另一销售' }, [existing], { ...context, existing })).toHaveProperty('sales')
    expect(validatePartnerDraft({ ...existing, taxRate: 6 }, [existing], { ...context, existing })).toEqual({})
  })

  it('客户已有银行/联系人行字段冲突不影响明确的新建、删除与其他编辑', () => {
    const existing = saved({ contacts: [row()], banks: [{ ...createPartnerBank(), accountNo: 'demo' }] })
    const edited = { ...existing, contacts: existing.contacts.map(contact => ({ ...contact, name: '改名' })) }
    expect(validatePartnerDraft(edited, [existing], { ...context, existing })).toHaveProperty('contacts.0')
    const added = { ...existing, contacts: [...existing.contacts, row({ name: '另一联系人' })] }
    expect(validatePartnerDraft(added, [existing], { ...context, existing })).toEqual({})
    expect(validatePartnerDraft({ ...existing, contacts: [], banks: [] }, [existing], { ...context, existing })).toEqual({})
  })

  it('供应商信用码匹配资料发生字段改写时，仅阻断冲突字段', () => {
    const matched = saved({ createdAt: '2026-09-08 10:00' })
    const supplier = { ...matched, type: '供应商', code: '', name: '改名供应商', taxRate: 6 }
    const errors = validatePartnerDraft(supplier, [matched], context)
    expect(errors).toHaveProperty('name')
    expect(errors).not.toHaveProperty('taxRate')
    expect(validatePartnerDraft({ ...supplier, name: matched.name }, [matched], context)).toEqual({})
  })

  it('状态和角色决定提交审批、启停、删除与额度入口；拒绝状态冲突不开放', () => {
    const active = saved({ status: '已生效' })
    expect(getPartnerPermissions(active, 'business').requestCredit).toBe(false)
    expect(getPartnerPermissions(active, 'businessSupervisor').requestCredit).toBe(true)
    expect(getPartnerPermissions(active, 'finance').deactivate).toBe(true)
    expect(getPartnerPermissions(active, 'business').deactivate).toBe(false)
    expect(getPartnerPermissions(active, 'finance').submit).toBe(false)
    const pending = saved({ status: '已提交' })
    expect(getPartnerPermissions(pending, 'finance').approve).toBe(true)
    expect(getPartnerPermissions(pending, 'finance').reject).toBe(false)
    expect(getPartnerPermissions(pending, 'business').edit).toBe(false)
    const disabled = saved({ status: '已失效' })
    expect(getPartnerPermissions(disabled, 'finance').delete).toBe(true)
    expect(getPartnerPermissions(disabled, 'business').delete).toBe(false)
    expect(getPartnerPermissions(active, 'viewer').edit).toBe(false)
    expect(getPartnerPermissions(null, 'viewer').create).toBe(false)
  })
})

describe('GJ-003 授信增减金额', () => {
  it('接受零、增加及扣减到零，不把批复额度当替换总额度', () => {
    expect(validateCreditAmount(0, 100)).toEqual({})
    expect(validateCreditAmount('100.01', 100)).toEqual({})
    expect(validateCreditAmount(-100, 100)).toEqual({})
    expect(validateCreditAmount(-100.01, 100)).toHaveProperty('amount')
  })

  it('申请和批复可复用格式及下限校验，拒绝空值、三位小数和未知原额度', () => {
    for (const amount of ['', null, undefined, 'NaN', 'Infinity', '1.001', '1e3']) expect(validateCreditAmount(amount, 100)).toHaveProperty('amount')
    expect(validateCreditAmount(10, null)).toHaveProperty('amount')
    expect(validateCreditAmount(10, undefined)).toHaveProperty('amount')
  })
})
