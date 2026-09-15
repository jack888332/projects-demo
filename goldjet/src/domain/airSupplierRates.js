import { GROUND_DATE, GROUND_NOW } from './groundOperations.js'
import { TRANSPORT_QUOTE_CURRENCIES } from './transportQuotes.js'

export const AIR_RATE_TODAY = GROUND_DATE
export const AIR_RATE_NOW = GROUND_NOW
export const AIR_RATE_SERVICES = ['订舱', '提货', '中转', '仓储', '预配发送', '报关', '货站安检', '清关派送']
export const AIR_RATE_UNITS = ['分单数(个)', '主单数(个)', '提单计费重(kg)', '提单毛重(kg)', '按提单件数(件)']
export const AIR_RATE_UNIT_CONFLICTS = ['提单毛重/提单件数（kg/件）', '提单件数/提单毛重']
export const AIR_RATE_METHODS = ['常规方式', '航晟运输报价', '梯度报价', '首加续报价']
export const AIR_RATE_CURRENCIES = TRANSPORT_QUOTE_CURRENCIES
export const AIR_RATE_DETAIL_REASONS = {
  航晟运输报价: '运输路线和车辆只读字段的数据来源、关联规则待确认，暂不提交',
  梯度报价: '梯度起始值、结束值和说明的只读来源及区间计费规则待确认，暂不提交',
  首加续报价: '首值、续值和说明的只读来源及首加续计费规则待确认，暂不提交',
}

export function getAirRateMethodRestriction(method) {
  return AIR_RATE_DETAIL_REASONS[method] || ''
}

const clean = value => String(value ?? '').trim()
const empty = value => value === null || value === undefined || clean(value) === ''
const scalar = value => typeof value === 'string' || typeof value === 'number'
const decimal = value => scalar(value) && Number.isFinite(Number(value)) && /^-?\d+(?:\.\d{1,2})?$/.test(clean(value))
const integer = value => scalar(value) && Number.isSafeInteger(Number(value)) && /^-?\d+$/.test(clean(value))

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function getAirSupplierRatePermissions(role) {
  const allowed = role === 'supervisor'
  return { create: allowed, edit: allowed, toggle: allowed, reason: allowed ? '' : '仅客服主管可维护空运供应商价格' }
}

export function createAirSupplierRateDraft() {
  return {
    partnerId: '', serviceType: '', feeItemId: '', billingUnit: '', chargeMethod: '', unitPrice: '',
    taxRate: 0, currency: '', startDate: '', endDate: '', contractNo: '', details: [],
  }
}

export function normalizeAirSupplierRateDraft(payload) {
  const draft = createAirSupplierRateDraft()
  for (const key of Object.keys(draft)) {
    if (key === 'details') continue
    const value = payload?.[key]
    draft[key] = typeof value === 'string' ? value.trim() : value ?? ''
  }
  if (payload?.id) draft.id = clean(payload.id)
  // Unconfirmed detail write contracts never enter the maintained price records.
  if (draft.chargeMethod !== '常规方式') draft.unitPrice = ''
  return draft
}

function matchingPeriods(draft, rows, exceptId) {
  return rows.filter(row => row.id !== exceptId && row.partnerId === draft.partnerId
    && row.serviceType === draft.serviceType && row.feeItemId === draft.feeItemId
    && validDate(row.startDate) && validDate(row.endDate) && row.startDate <= row.endDate)
}

export function validateAirSupplierRateDraft(draft, state = {}, { existing = null, activating = false, today = AIR_RATE_TODAY } = {}) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return { rate: '价格规则格式不正确' }
  const errors = {}
  if (!(state.partners || []).some(row => row.id === draft.partnerId && row.type === '供应商')) errors.partnerId = '请选择供应商档案中的供应商'
  if (!AIR_RATE_SERVICES.includes(draft.serviceType)) errors.serviceType = '请选择服务类型'
  if (!(state.financeCostItems || []).some(row => row.id === draft.feeItemId)) errors.feeItemId = '请选择结算中心费用项'
  if (AIR_RATE_UNIT_CONFLICTS.includes(draft.billingUnit)) errors.billingUnit = '件重比的分子、分母口径冲突，暂不能保存'
  else if (!AIR_RATE_UNITS.includes(draft.billingUnit)) errors.billingUnit = '请选择计费单位'
  if (!AIR_RATE_METHODS.includes(draft.chargeMethod)) errors.chargeMethod = '请选择计费方式'
  else if (draft.chargeMethod !== '常规方式') errors.details = getAirRateMethodRestriction(draft.chargeMethod)
  else if (empty(draft.unitPrice)) errors.unitPrice = '请填写计费单价'
  else if (!decimal(draft.unitPrice)) errors.unitPrice = '计费单价须为数值，最多两位小数'
  if (empty(draft.taxRate)) errors.taxRate = '请填写税率'
  else if (!integer(draft.taxRate)) errors.taxRate = '税率须为整数'
  if (!AIR_RATE_CURRENCIES.includes(draft.currency)) errors.currency = '请选择币种字典中的币种'
  if (!validDate(draft.startDate)) errors.startDate = '请输入有效生效日期，格式为 YYYY-MM-DD'
  if (!validDate(draft.endDate)) errors.endDate = '请输入有效截止日期，格式为 YYYY-MM-DD'
  else if (validDate(draft.startDate) && draft.endDate < draft.startDate) errors.endDate = '截止日期不能早于生效日期'
  else if (draft.endDate === draft.startDate) errors.endDate = '生效日期与截止日期同日的适用边界待确认，暂不保存'
  else if (draft.endDate === today) errors.endDate = '截止当日的适用边界待确认，暂不保存'
  if (existing && validDate(draft.endDate) && draft.endDate < today) errors.endDate = '截止日期早于当前日期，不允许保存'
  else if (existing && validDate(existing.endDate) && existing.endDate < today) errors.endDate = '超期规则修改期间后的状态口径待确认，暂不保存'
  if (typeof draft.contractNo !== 'string') errors.contractNo = '合同编号须为文本'
  else if (draft.contractNo.length > 20) errors.contractNo = '合同编号最多 20 个字符'
  if (!errors.startDate && !errors.endDate) {
    const matches = matchingPeriods(draft, state.airSupplierRates || [], existing?.id)
    const overlapping = matches.filter(row => row.startDate < draft.endDate && draft.startDate < row.endDate)
    const touching = matches.filter(row => row.startDate === draft.endDate || row.endDate === draft.startDate)
    if (!existing && overlapping.length) errors.endDate = '同一供应商、服务和成本类型已存在有效期重叠的价格规则，不允许新增'
    else if (existing && overlapping.length) {
      const active = overlapping.some(row => deriveAirSupplierRateStatus(row, today) === '已生效')
      const candidateActive = activating || deriveAirSupplierRateStatus(existing, today) === '已生效'
      if (active && candidateActive) errors.endDate = '同一供应商、服务和成本类型已存在生效且有效期重叠的价格规则'
      else if (!activating) errors.endDate = '涉及失效价格规则的编辑重叠范围待确认，暂不保存'
    }
    if (!errors.endDate && touching.length) errors.endDate = '价格期间在同日相接，截止当日的重叠口径待确认，暂不保存'
  }
  return errors
}

export function deriveAirSupplierRateStatus(row, today = AIR_RATE_TODAY) {
  if (validDate(today) && validDate(row?.endDate) && today > row.endDate) return '失效'
  return ['已生效', '失效'].includes(row?.status) ? row.status : ''
}

export function getAirSupplierRateAction(row, action, today = AIR_RATE_TODAY) {
  if (!['enable', 'disable'].includes(action)) return { allowed: false, reason: '未知价格规则操作' }
  if (!row) return { allowed: false, reason: '价格规则不存在' }
  if (!validDate(today) || !validDate(row.startDate) || !validDate(row.endDate) || row.endDate <= row.startDate) return { allowed: false, reason: '价格期间无效或同日边界待确认，暂不能变更状态' }
  if (today === row.endDate) return { allowed: false, reason: '截止当日的适用边界待确认，暂不能变更状态' }
  if (today > row.endDate) return { allowed: false, reason: '超期价格规则的再次启用口径待确认，暂不能变更状态' }
  if (today < row.startDate) return { allowed: false, reason: '生效日前的启用、失效口径待确认，暂不能变更状态' }
  const status = deriveAirSupplierRateStatus(row, today)
  if (action === 'disable') return status === '已生效'
    ? { allowed: true, reason: '' } : { allowed: false, reason: status === '失效' ? '价格规则已失效，无需重复失效' : '价格规则状态待确认，暂不能变更状态' }
  if (status !== '失效') return { allowed: false, reason: status === '已生效' ? '价格规则已生效，无需重复启用' : '价格规则状态待确认，暂不能变更状态' }
  if (row.chargeMethod !== '常规方式') return { allowed: false, reason: getAirRateMethodRestriction(row.chargeMethod) || '计费方式无效，暂不能启用' }
  return { allowed: true, reason: '' }
}

export function filterAirSupplierRates(rows, filters = {}, state = {}) {
  const partnerNames = new Map((state.partners || []).map(row => [row.id, clean(row.name)]))
  const feeNames = new Map((state.financeCostItems || []).map(row => [row.id, clean(row.name)]))
  const supplier = clean(filters.supplier), feeItem = clean(filters.feeItem)
  return rows.filter(row => ['serviceType', 'billingUnit'].every(key => !filters[key] || row[key] === filters[key])
    && (!supplier || (partnerNames.get(row.partnerId) || '').includes(supplier))
    && (!feeItem || (feeNames.get(row.feeItemId) || '').includes(feeItem))
    && (!filters.status || deriveAirSupplierRateStatus(row, filters.today || AIR_RATE_TODAY) === filters.status))
    .slice().sort((left, right) => clean(right.updatedAt).localeCompare(clean(left.updatedAt)) || (right.updateSequence || 0) - (left.updateSequence || 0))
}

export function createFinanceCostItemSeed() {
  return ['运费成本', '提货', '中转', '仓储', '预配发送', '报关', '货站安检', '清关派送', '提单费', '燃油附加费', '安全附加费', '燃油费', '信息费', '分单费']
    .map((name, index) => ({ id: `FC-${String(index + 1).padStart(4, '0')}`, code: `F${String(index + 1).padStart(3, '0')}`, name, status: '已生效' }))
}

export function createAirSupplierRateSeed() {
  return [
    { id: 'ASR-00000001', serviceType: '订舱', feeItemId: 'FC-0001', unitPrice: 18.5, status: '已生效' },
    { id: 'ASR-00000002', serviceType: '报关', feeItemId: 'FC-0006', billingUnit: '分单数(个)', unitPrice: 150, status: '失效' },
    { id: 'ASR-00000003', serviceType: '仓储', feeItemId: 'FC-0004', unitPrice: 0.1, endDate: '2026-08-31', status: '已生效' },
    { id: 'ASR-00000004', serviceType: '提货', feeItemId: 'FC-0002', chargeMethod: '航晟运输报价', status: '失效' },
    { id: 'ASR-00000005', serviceType: '中转', feeItemId: 'FC-0003', chargeMethod: '梯度报价', status: '失效' },
    { id: 'ASR-00000006', serviceType: '清关派送', feeItemId: 'FC-0008', chargeMethod: '首加续报价', status: '失效' },
  ].map((row, index) => ({
    ...createAirSupplierRateDraft(), partnerId: 'PT-00027', billingUnit: '提单计费重(kg)', chargeMethod: '常规方式',
    currency: 'CNY', startDate: '2026-08-01', endDate: '2026-09-30', ...row,
    creator: '演示客服主管', updatedBy: '演示客服主管', updatedAt: '2026-09-08 09:00', updateSequence: index + 1,
  }))
}
