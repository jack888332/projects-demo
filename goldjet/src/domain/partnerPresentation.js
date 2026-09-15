// GJ-003: shared field descriptions for create/detail; behavior remains in partner rules.
export const PARTNER_BASIC_FIELDS = [
  { key: 'relationship', label: '境内外关系', options: ['境内机构', '境外机构'], required: true },
  { key: 'creditCode', label: '统一社会信用码', max: 18 },
  { key: 'name', label: '中文名称', required: true, max: 60 },
  { key: 'shortName', label: '简称', required: true, max: 60 },
  { key: 'category', label: '合作方类别', options: ['集团内部机构', '外部单位'], required: true },
]
export const PARTNER_BUSINESS_FIELDS = [
  { key: 'taxRate', label: '税率（%）', options: [0, 1, 3, 6, 9, 11], required: true },
  { key: 'sales', label: '销售', required: true },
  { key: 'signedContract', label: '是否已签合同', options: ['是', '否'], required: true },
  { key: 'paymentDays', label: '账期（天）', required: true },
  { key: 'invoiceTitle', label: '发票抬头', max: 120 },
  { key: 'archivedBy', label: '归档' }, { key: 'servicePerson', label: '对应客服' },
  { key: 'website', label: '公司网站', max: 60 }, { key: 'companyPhone', label: '公司电话', max: 20 },
  { key: 'companyFax', label: '公司传真', max: 20 },
]
export const PARTNER_ROW_GROUPS = [
  { key: 'banks', label: '银行账户', fields: [
    { key: 'bankName', label: '银行名称', max: 60 }, { key: 'branchName', label: '开户行名称', max: 60 },
    { key: 'accountName', label: '账户名称', max: 60 }, { key: 'accountNo', label: '银行账号' },
  ] },
  { key: 'contacts', label: '联系人', fields: [
    { key: 'type', label: '联系人类型', options: ['法人', '财务联系人', '操作联系人'], required: true },
    { key: 'name', label: '联系人姓名', required: true, max: 60 },
    { key: 'phone', label: '联系人电话', required: true, max: 11 },
    { key: 'fax', label: '联系人传真', max: 60 },
    { key: 'mobile', label: '联系人移动电话', required: true, max: 11 },
    { key: 'email', label: '联系人电子邮箱', required: true, max: 60 },
    { key: 'remark', label: '备注', max: 240 },
  ] },
  { key: 'recipients', label: '邮箱收件人', fields: [
    { key: 'type', label: '类型', options: ['业务', '财务'], required: true },
    { key: 'name', label: '姓名', max: 60 }, { key: 'position', label: '岗位', max: 240 },
    { key: 'email', label: '电子邮箱', required: true, max: 60 }, { key: 'remark', label: '备注', max: 240 },
  ] },
]
export const newPartnerRow = group => Object.fromEntries(group.fields.map(field => [field.key, '']))
export const partnerAddress = partner => ['country', 'province', 'city', 'district', 'detail'].map(key => partner.address?.[key]).filter(Boolean).join(' / ')
export const partnerTerm = partner => partner.longTerm ? '长期' : partner.businessExpiry || '未填写'
export const PARTNER_SAMPLE_ATTACHMENT = {
  id: 'partner-synthetic-material', name: '合作方演示营业资料.txt', type: 'text/plain',
  content: '合成演示营业资料\n仅用于高捷物流 Web 原型的档案与审批演示，不是真实营业执照。\n',
}
