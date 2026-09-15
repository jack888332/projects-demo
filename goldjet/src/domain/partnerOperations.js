import { PARTNER_BASIC_FIELDS, PARTNER_BUSINESS_FIELDS, PARTNER_ROW_GROUPS, newPartnerRow } from './partnerPresentation.js'

export { PARTNER_BASIC_FIELDS, PARTNER_BUSINESS_FIELDS }

const clone = value => JSON.parse(JSON.stringify(value))
const clean = value => String(value ?? '').trim()
const empty = value => value === null || value === undefined || clean(value) === ''
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const basicIdentity = ['relationship', 'creditCode', 'name', 'shortName', 'address', 'code', 'type']
const customerReadonlyBusiness = ['sales', 'invoiceTitle', 'archivedBy', 'servicePerson', 'website', 'companyPhone', 'companyFax']

export function createPartnerBank() {
  return newPartnerRow(PARTNER_ROW_GROUPS.find(group => group.key === 'banks'))
}

export function createPartnerContact() {
  return newPartnerRow(PARTNER_ROW_GROUPS.find(group => group.key === 'contacts'))
}

export function createPartnerRecipient() {
  return newPartnerRow(PARTNER_ROW_GROUPS.find(group => group.key === 'recipients'))
}

export function createPartnerDraft(type = '客户') {
  return {
    type, code: '', relationship: '', creditCode: '', name: '', shortName: '', category: '',
    address: { country: '', province: '', city: '', district: '', detail: '' },
    longTerm: false, businessExpiry: '', taxRate: '', sales: '', signedContract: '', paymentDays: '',
    invoiceTitle: '', archivedBy: '', servicePerson: '', website: '', companyPhone: '', companyFax: '',
    banks: [], contacts: [], recipients: [], attachments: [],
  }
}

// Adapt legacy prototype records without inventing missing product facts or a second credit owner.
export function normalizePartner(seed) {
  const copied = clone(seed)
  const draft = createPartnerDraft(copied.type)
  return {
    ...draft, ...copied,
    address: { ...draft.address, ...(typeof copied.address === 'object' ? copied.address : { detail: copied.address || '' }) },
    status: ({ 有效: '已生效', 失效: '已失效' })[copied.status] || copied.status || '新建',
    department: copied.department ?? copied.owner ?? '',
    ...Object.fromEntries(['banks', 'contacts', 'recipients'].map(group => [group, (copied[group] || []).map((row, index) => ({
      ...row, id: row.id || `${copied.id || 'partner'}-${group}-${index + 1}`,
    }))])),
    attachments: copied.attachments || [],
    operations: copied.operations || [],
  }
}

export function getPartnerLockedFields(partner) {
  if (!partner) return ['code']
  return partner.type === '供应商'
    ? [...basicIdentity, 'longTerm', 'businessExpiry', 'category']
    : [...basicIdentity, ...customerReadonlyBusiness]
}

export function getPartnerPermissions(partner, role) {
  const known = ['business', 'businessSupervisor', 'finance'].includes(role)
  const finance = role === 'finance'
  const status = partner?.status
  const existing = Boolean(partner) && status !== '已删除'
  const editable = known && existing && ['新建', '已生效'].includes(status)
  return {
    view: known && existing,
    create: known,
    edit: editable,
    submit: known && existing && status === '新建',
    approve: finance && existing && status === '已提交',
    reject: false,
    rejectionReason: '第003篇对拒绝后的档案状态存在“新建＋审批拒绝”和“财务审批拒绝”两种口径，待确认后开放。',
    delete: known && existing && (status === '新建' || (finance && status === '已失效')),
    deactivate: finance && existing && status === '已生效',
    activate: finance && existing && status === '已失效',
    requestCredit: role === 'businessSupervisor' && existing && partner.type === '客户' && status === '已生效',
    approveCredit: finance && existing && partner.type === '客户',
  }
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().startsWith(value)
}

function validateFields(record, fields, prefix, errors) {
  for (const field of fields) {
    const value = record[field.key]
    const path = `${prefix}${field.key}`
    if (field.required && empty(value)) errors[path] = `请填写${field.label}`
    else if (!empty(value) && field.options && !field.options.includes(value)) errors[path] = `请选择有效的${field.label}`
    else if (!empty(value) && field.max && clean(value).length > field.max) errors[path] = `${field.label}最多 ${field.max} 个字符`
  }
}

function checkDuplicates(rows, keys, path, errors, label) {
  const seen = new Set()
  rows.forEach((row, index) => {
    if (keys.some(key => empty(row[key]))) return
    const signature = JSON.stringify(keys.map(key => clean(row[key])))
    if (seen.has(signature)) errors[`${path}.${index}.${keys.at(-1)}`] = `${label}重复，请保留一条`
    seen.add(signature)
  })
}

function sameRowValues(left, right, fields) {
  return fields.every(field => same(left[field.key] ?? '', right[field.key] ?? ''))
}

export function validatePartnerDraft(draft, partners = [], { existing = null, organizationNames, department } = {}) {
  const errors = {}
  if (!['客户', '供应商'].includes(draft.type)) errors.type = '请选择客户或供应商'
  validateFields(draft, [...PARTNER_BASIC_FIELDS, ...PARTNER_BUSINESS_FIELDS], '', errors)
  if (draft.relationship === '境内机构' && empty(draft.creditCode)) errors.creditCode = '境内机构必须填写统一社会信用码'
  else if (!empty(draft.creditCode) && clean(draft.creditCode).length !== 18) errors.creditCode = '统一社会信用码必须为 18 位'
  const address = draft.address || {}
  if (empty(address.country)) errors['address.country'] = '请选择国家'
  if (empty(address.detail)) errors['address.detail'] = '请填写详细地址'
  if (address.country === '中国') {
    if (empty(address.province)) errors['address.province'] = '中国地址必须填写省'
    if (empty(address.city)) errors['address.city'] = '中国地址必须填写市'
  } else if (!empty(address.province) || !empty(address.city)) {
    errors.address = '非中国地址的省、市存在“选填”和“不可填写”两种口径，填写该信息前需确认'
  }
  if (!draft.longTerm && (empty(draft.businessExpiry) || !isDate(draft.businessExpiry))) errors.businessExpiry = '请选择有效的营业期限，或选择长期'
  if (draft.longTerm && !empty(draft.businessExpiry)) errors.businessExpiry = '选择长期后不能填写营业期限日期'
  if (empty(draft.attachments) || !Array.isArray(draft.attachments) || draft.attachments.length === 0) errors.attachments = '请附加档案资料；当前原型仅支持明确标识的合成演示附件'

  if (!Array.isArray(organizationNames)) errors.category = '组织架构范围未配置，暂不能校验合作方类别'
  else {
    const expected = organizationNames.some(name => clean(name) === clean(draft.name)) ? '集团内部机构' : '外部单位'
    if (draft.category !== expected) errors.category = `按组织架构匹配结果，合作方类别应为“${expected}”`
  }
  const currentDepartment = department ?? existing?.department ?? draft.department
  if (empty(currentDepartment)) errors.department = '当前组织未明确，暂不能校验档案唯一性'
  const livePartners = partners.filter(item => item.id !== existing?.id && item.status !== '已删除')
  const sameScope = livePartners.filter(item => item.type === draft.type && (item.department ?? item.owner) === currentDepartment)
  if (sameScope.some(item => clean(item.name) === clean(draft.name))) errors.name = '该组织已存在同名的合作方档案'
  if (!empty(draft.creditCode) && sameScope.some(item => clean(item.creditCode) === clean(draft.creditCode))) errors.creditCode = '该组织已存在相同统一社会信用码的同类合作方档案'

  for (const group of PARTNER_ROW_GROUPS) {
    const rows = draft[group.key]
    if (!Array.isArray(rows)) { errors[group.key] = `${group.label}数据格式无效`; continue }
    rows.forEach((row, index) => validateFields(row, group.fields, `${group.key}.${index}.`, errors))
  }
  checkDuplicates(draft.banks || [], ['accountNo'], 'banks', errors, '银行账号')
  checkDuplicates(draft.contacts || [], ['type', 'name', 'phone', 'mobile', 'email'], 'contacts', errors, '联系人')
  checkDuplicates(draft.recipients || [], draft.type === '客户' ? ['email'] : ['type', 'email'], 'recipients', errors, '邮箱收件人')

  if (existing) {
    for (const field of getPartnerLockedFields(existing)) {
      if (!same(draft[field], existing[field])) errors[field] = '该字段在编辑场景只读，不能修改'
    }
    // Existing customer bank/contact rows have contradictory edit wording. Only their value edits are blocked;
    // explicit add/delete operations and the remaining business profile remain usable.
    if (existing.type === '客户') {
      for (const group of PARTNER_ROW_GROUPS.filter(item => ['banks', 'contacts'].includes(item.key))) {
        const before = existing[group.key] || []
        for (const [index, row] of (draft[group.key] || []).entries()) {
          const previous = row.id ? before.find(item => item.id === row.id) : null
          if (previous && !sameRowValues(previous, row, group.fields)) errors[`${group.key}.${index}`] = `已有${group.label}行的可编辑性存在冲突，暂不能修改该行字段`
        }
        if (before.some(row => !row.id) && !(draft[group.key] || []).every(row => row.id || before.some(previous => sameRowValues(previous, row, group.fields)))) {
          errors[group.key] = `已有${group.label}缺少稳定行标识，无法判定新增或修改，请先规范化档案`
        }
      }
    }
  } else if (draft.type === '供应商' && !empty(draft.creditCode)) {
    const matched = livePartners.filter(item => clean(item.creditCode) === clean(draft.creditCode))
      .sort((left, right) => clean(right.createdAt).localeCompare(clean(left.createdAt)))[0]
    if (matched) {
      for (const field of ['name', 'shortName', 'address', 'businessExpiry', 'longTerm', 'category', 'attachments']) {
        if (!same(draft[field], matched[field])) errors[field] = '供应商匹配资料后该字段存在“允许修改”和“不允许修改”两种口径，暂不能改写'
      }
    }
  }
  return errors
}

export function validateCreditAmount(amount, currentLimit) {
  if (empty(amount)) return { amount: '请填写本次额度' }
  if (!/^-?\d+(\.\d{1,2})?$/.test(clean(amount)) || !Number.isFinite(Number(amount))) return { amount: '额度必须为数字，最多保留 2 位小数' }
  if (empty(currentLimit) || !Number.isFinite(Number(currentLimit))) return { amount: '原授信额度待确认，暂不能提交' }
  if (Number(amount) < -Number(currentLimit)) return { amount: `本次额度不能小于 ${-Number(currentLimit)}，实际总额度不能为负数` }
  return {}
}

export const getPartnerCustomerKey = partner => partner.creditCode || partner.name
export function getPartnerCreditTotal(partner, applications) {
  const key=getPartnerCustomerKey(partner)
  return Math.round(applications.filter(row=>row.customerKey===key && row.status==='已生效').reduce((sum,row)=>sum+row.approvedAmount,0)*100)/100
}
export function getPartnerCreditHistory(partner, applications) {
  if(!partner) return []
  const accepted=applications.filter(row=>row.customerKey===getPartnerCustomerKey(partner) && row.status==='已生效')
  return accepted.map(row=>({...row, originalAmount:Math.round(accepted.filter(previous=>previous.approvedAt<row.createdAt).reduce((sum,previous)=>sum+previous.approvedAmount,0)*100)/100}))
    .sort((a,b)=>b.approvedAt.localeCompare(a.approvedAt) || b.id.localeCompare(a.id))
}
