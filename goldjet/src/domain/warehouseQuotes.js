import { GROUND_DATE, GROUND_NOW } from './groundOperations.js'
import { TRANSPORT_QUOTE_CURRENCIES } from './transportQuotes.js'

export const WAREHOUSE_QUOTE_TODAY = GROUND_DATE
export const WAREHOUSE_QUOTE_NOW = GROUND_NOW
export const WAREHOUSE_QUOTE_CURRENCIES = TRANSPORT_QUOTE_CURRENCIES
export const WAREHOUSE_QUOTE_SUBJECTS = ['卸载操作费', '卸载最低费', '仓储费', '免租期', '打托费', '拆托费', '加重费', '分拣费', '改标签']
export const WAREHOUSE_QUOTE_SUBJECT_LABELS = Object.fromEntries(WAREHOUSE_QUOTE_SUBJECTS.map((subject, index) => [
  subject, `${subject}（${['元/KG', '元', 'KG/天', '天', '元', '元', '元', '元', '元'][index]}）`,
]))
export const WAREHOUSE_QUOTE_UNITS = ['千克', '个', '托', '次']
export const WAREHOUSE_QUOTE_CHARGE_METHODS = ['常规', '其他']

const clean = value => String(value ?? '').trim()
const empty = value => value === null || value === undefined || clean(value) === ''
const decimal = value => ['string', 'number'].includes(typeof value) && Number.isFinite(Number(value))
  && /^-?\d+(?:\.\d{1,2})?$/.test(clean(value))
const same = (left, right) => clean(left) === clean(right)

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function getWarehouseQuotePermissions(role) {
  const allowed = ['hangsheng', 'supervisor'].includes(role)
  return { create: allowed, edit: allowed, delete: allowed, toggle: allowed, reason: allowed ? '' : '仅航晟客服或主管可维护仓库报价' }
}

export function createWarehouseQuoteDraft() {
  return {
    partnerId: '', taxRate: '', currency: '', subject: '', amount: '', unit: '', chargeMethod: '',
    startDate: WAREHOUSE_QUOTE_TODAY, endDate: '', remark: '',
  }
}

export function normalizeWarehouseQuoteDraft(payload) {
  const draft = createWarehouseQuoteDraft()
  for (const key of Object.keys(draft)) {
    const value = payload?.[key]
    draft[key] = typeof value === 'string' ? value.trim() : value ?? ''
  }
  if (payload?.id) draft.id = clean(payload.id)
  return draft
}

export function validateWarehouseQuoteDraft(draft, quotes = [], partners = [], { existing = null } = {}) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return { quote: '报价格式不正确' }
  const errors = {}
  if (!partners.some(row => row.id === draft.partnerId && row.type === '客户')) errors.partnerId = '请选择客户档案中的客户'
  if (empty(draft.taxRate)) errors.taxRate = '请填写税率'
  else if (!decimal(draft.taxRate) || Number(draft.taxRate) < 0 || Number(draft.taxRate) > 100) errors.taxRate = '税率须为 0～100，最多两位小数'
  if (!WAREHOUSE_QUOTE_CURRENCIES.includes(draft.currency)) errors.currency = '请选择币种字典中的币种'
  if (!WAREHOUSE_QUOTE_SUBJECTS.includes(draft.subject)) errors.subject = '请选择报价科目'
  else if (draft.subject === '免租期') errors.subject = '免租期的天数与单位口径待确认，暂不保存'
  if (empty(draft.amount)) errors.amount = '请填写报价金额'
  else if (!decimal(draft.amount)) errors.amount = '报价金额须为数值，最多两位小数'
  if (!WAREHOUSE_QUOTE_UNITS.includes(draft.unit)) errors.unit = '请选择单位'
  if (!WAREHOUSE_QUOTE_CHARGE_METHODS.includes(draft.chargeMethod)) errors.chargeMethod = '请选择计费方式'
  if (!validDate(draft.startDate)) errors.startDate = '请输入有效生效日期，格式为 YYYY-MM-DD'
  if (!validDate(draft.endDate)) errors.endDate = '请输入有效截止日期，格式为 YYYY-MM-DD'
  else if (validDate(draft.startDate) && draft.endDate < draft.startDate) errors.endDate = '截止日期不能早于生效日期'
  else if (draft.endDate === draft.startDate) errors.endDate = '生效日期与截止日期同日的适用边界待确认，暂不保存'
  if (typeof draft.remark !== 'string') errors.remark = '备注须为文本'
  else if (draft.remark.length > 200) errors.remark = '备注最多 200 个字符'
  if (existing) {
    for (const [key, label] of [['partnerId', '客户'], ['taxRate', '税率'], ['currency', '币种']]) {
      const unchanged = key === 'taxRate' ? decimal(draft[key]) && Number(draft[key]) === Number(existing[key]) : same(draft[key], existing[key])
      if (!unchanged) errors[key] = `${label}不可修改`
    }
  }
  if (!errors.startDate && !errors.endDate) {
    const sameQuotes = quotes.filter(row => (!existing || row.id !== existing.id)
      && row.partnerId === draft.partnerId && row.subject === draft.subject
      && validDate(row.startDate) && validDate(row.endDate) && row.endDate >= row.startDate)
    const overlapping = sameQuotes.filter(row => row.startDate < draft.endDate && draft.startDate < row.endDate)
    const boundary = sameQuotes.some(row => row.startDate === draft.endDate || row.endDate === draft.startDate)
    if (overlapping.some(row => !row.manualDisabled)) errors.endDate = '已存在报价，请勿重复添加'
    else if (overlapping.length) errors.endDate = '存在期间重叠的人工停用报价，去重范围待确认，暂不保存'
    else if (boundary) errors.endDate = '报价期间在同日相接，截止当日的重叠口径待确认，暂不保存'
  }
  return errors
}

export function deriveWarehouseQuoteStatus(row, today = WAREHOUSE_QUOTE_TODAY) {
  if (!row || !validDate(today) || !validDate(row.startDate) || !validDate(row.endDate) || row.endDate < row.startDate) return '口径待确认'
  if (row.manualDisabled === true || today > row.endDate) return '失效'
  if (today < row.startDate) return '待生效'
  if (today === row.endDate) return '口径待确认'
  return '生效'
}

export function getWarehouseQuoteAction(row, action, today = WAREHOUSE_QUOTE_TODAY) {
  if (!['enable', 'disable'].includes(action)) return { allowed: false, reason: '未知报价操作' }
  if (!row) return { allowed: false, reason: '报价记录不存在' }
  const status = deriveWarehouseQuoteStatus(row, today)
  if (!validDate(today) || !validDate(row.startDate) || !validDate(row.endDate) || row.endDate < row.startDate) return { allowed: false, reason: '报价期间无效，暂不能变更状态' }
  if (today === row.endDate) return { allowed: false, reason: '截止当日的生效边界待确认，暂不能变更状态' }
  if (today > row.endDate) return { allowed: false, reason: '报价已过截止日期，不能启用或停用' }
  if (today < row.startDate) return { allowed: false, reason: '报价尚未到生效日期，不能提前启用或停用' }
  if (action === 'disable') return status === '生效'
    ? { allowed: true, reason: '' } : { allowed: false, reason: '报价已失效，无需重复停用' }
  return row.manualDisabled === true
    ? { allowed: true, reason: '' } : { allowed: false, reason: '报价已生效，无需重复启用' }
}

export function filterWarehouseQuotes(rows, filters = {}, partners = []) {
  const names = new Map(partners.map(row => [row.id, row.name || row.id]))
  const firstCharacter = value => Array.from(clean(value))[0] || ''
  return rows.filter(row => (!filters.partnerId || row.partnerId === filters.partnerId)
    && (!filters.subject || row.subject === filters.subject)).slice().sort((left, right) => {
    const partyOrder = firstCharacter(names.get(left.partnerId) || left.partnerId).localeCompare(firstCharacter(names.get(right.partnerId) || right.partnerId), 'zh-CN')
    return partyOrder || firstCharacter(left.subject).localeCompare(firstCharacter(right.subject), 'zh-CN')
  })
}

export function createWarehouseQuoteSeed() {
  return [
    { id: 'WQ-00000001', partnerId: 'PT-00018', subject: '卸载操作费', amount: 0.35, unit: '千克', startDate: '2026-09-01', endDate: '2026-09-30' },
    { id: 'WQ-00000002', partnerId: 'PT-00018', subject: '仓储费', amount: 0.12, unit: '千克', startDate: '2026-10-01', endDate: '2026-10-31' },
    { id: 'WQ-00000003', partnerId: 'PT-00019', subject: '打托费', amount: 45, unit: '托', startDate: '2026-08-01', endDate: '2026-08-31' },
    { id: 'WQ-00000004', partnerId: 'PT-00019', subject: '分拣费', amount: 20, unit: '次', startDate: '2026-09-01', endDate: '2026-09-30', manualDisabled: true },
  ].map(row => ({
    ...createWarehouseQuoteDraft(), taxRate: 6, currency: 'CNY', chargeMethod: '常规', manualDisabled: false,
    ...row, updatedBy: '演示航晟客服', updatedAt: '2026-09-08 09:00',
  }))
}
