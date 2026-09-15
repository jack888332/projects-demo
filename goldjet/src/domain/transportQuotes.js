import { AIR_PICKUP_REGIONS } from './airOperations.js'
import { GROUND_DATE, GROUND_NOW, GROUND_SPECIAL_TYPES } from './groundOperations.js'

export const TRANSPORT_QUOTE_TODAY = GROUND_DATE
export const TRANSPORT_QUOTE_NOW = GROUND_NOW
export const TRANSPORT_QUOTE_REGIONS = AIR_PICKUP_REGIONS
export const TRANSPORT_QUOTE_SPECIAL_TYPES = GROUND_SPECIAL_TYPES
export const TRANSPORT_QUOTE_CURRENCIES = ['USD', 'HKD', 'CNY', 'GBP', 'EUR', 'AUD']
export const TRANSPORT_QUOTE_VEHICLES = ['1.5T', '4.2车', '6.8车', '7.6车', '3T', '5T', '8T', '10T', '12T', '20尺柜', '40尺柜', '40/45尺柜']
export const TRANSPORT_QUOTE_KINDS = ['supplier', 'customer']

const clean = value => String(value ?? '').trim()
const empty = value => value === null || value === undefined || clean(value) === ''
const scalar = value => typeof value === 'string' || typeof value === 'number'
const decimal = (value, digits) => scalar(value) && Number.isFinite(Number(value))
  && (digits === undefined ? /^-?\d+(?:\.\d+)?$/ : new RegExp(`^-?\\d+(?:\\.\\d{1,${digits}})?$`)).test(clean(value))
const same = (left, right) => clean(left) === clean(right)
const location = () => ({ province: '', city: '', district: '', address: '' })

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function createTransportQuoteDraft(kind) {
  if (!TRANSPORT_QUOTE_KINDS.includes(kind)) throw new Error('未知报价类别')
  return {
    kind, partnerId: '', taxRate: '', currency: '', pickup: location(), delivery: location(),
    vehicleType: '', transportType: '', regulated: '', tailLift: '', specialVehicle: '', transitHours: '',
    chargeMode: '', unitPrice: '', unit: '', transportFee: '', startPrice: '', waitingFee: '', returnRate: '',
    startDate: TRANSPORT_QUOTE_TODAY, endDate: '', remark: '',
  }
}

export function normalizeTransportQuoteDraft(kind, payload) {
  const draft = createTransportQuoteDraft(kind)
  for (const key of Object.keys(draft)) {
    if (key === 'kind') continue
    if (['pickup', 'delivery'].includes(key)) {
      draft[key] = Object.fromEntries(Object.keys(location()).map(field => [field, clean(payload?.[key]?.[field])]))
    } else {
      const value = payload?.[key]
      draft[key] = typeof value === 'string' ? value.trim() : value ?? ''
    }
  }
  if (payload?.id) draft.id = clean(payload.id)
  return draft
}

function routeKey(row) {
  return [row.kind, row.partnerId, row.pickup?.province, row.pickup?.city, row.delivery?.province, row.delivery?.city,
    row.vehicleType, row.regulated, row.tailLift, row.specialVehicle].map(clean).join('|')
}

function detailKey(row) {
  return [row.pickup?.district, row.pickup?.address, row.delivery?.district, row.delivery?.address, row.transportType].map(clean).join('|')
}

export function validateTransportQuoteDraft(draft, quotes = [], partners = [], { existing = null } = {}) {
  if (!draft || !TRANSPORT_QUOTE_KINDS.includes(draft.kind)) return { kind: '未知报价类别' }
  const errors = {}
  const partyType = draft.kind === 'supplier' ? '供应商' : '客户'
  if (!partners.some(row => row.id === draft.partnerId && row.type === partyType && ['已生效', '有效'].includes(row.status))) {
    errors.partnerId = `请选择已生效的${partyType}档案`
  }
  for (const [key, label] of [['taxRate', '税率'], ['returnRate', '返空费比例']]) {
    if (empty(draft[key])) errors[key] = `请填写${label}`
    else if (!decimal(draft[key], 2) || Number(draft[key]) < 0 || Number(draft[key]) > 100) errors[key] = `${label}须为 0～100，最多两位小数`
  }
  if (!TRANSPORT_QUOTE_CURRENCIES.includes(draft.currency)) errors.currency = '请选择币种字典中的币种'
  for (const key of ['pickup', 'delivery']) {
    const value = draft[key] || {}
    const province = TRANSPORT_QUOTE_REGIONS.find(row => row.value === value.province)
    const city = province?.children.find(row => row.value === value.city)
    if (!province) errors[`${key}.province`] = '请选择省份'
    if (!city) errors[`${key}.city`] = '请选择所选省份下的城市'
    if (!empty(value.district) && !city?.children.some(row => row.value === value.district)) errors[`${key}.district`] = '请选择所选城市下的区县'
  }
  if (!TRANSPORT_QUOTE_VEHICLES.includes(draft.vehicleType)) errors.vehicleType = '请选择报价新增规则中的车型'
  for (const [key, options, label] of [
    ['transportType', ['单程', '往返'], '运输类型'], ['regulated', ['是', '否'], '监管类型'],
    ['tailLift', ['是', '否'], '尾板车'], ['specialVehicle', TRANSPORT_QUOTE_SPECIAL_TYPES, '特种车'],
  ]) if (!empty(draft[key]) && !options.includes(draft[key])) errors[key] = `请选择有效的${label}`
  if (!empty(draft.transitHours) && (!decimal(draft.transitHours) || Number(draft.transitHours) < 0)) errors.transitHours = '运输时效须为非负小时数'
  if (!['fixed', 'unit'].includes(draft.chargeMode)) errors.chargeMode = '请选择一种收费模式'
  if (draft.chargeMode === 'fixed') {
    if (empty(draft.transportFee)) errors.transportFee = '请填写运输费'
    if (!empty(draft.unitPrice) || !empty(draft.unit)) errors.chargeMode = '运输费与单价、单位只能二选一'
  }
  if (draft.chargeMode === 'unit') {
    if (empty(draft.unitPrice)) errors.unitPrice = '请填写单价'
    if (typeof draft.unit !== 'string' || empty(draft.unit)) errors.unit = '请填写计价单位'
    if (!empty(draft.transportFee)) errors.chargeMode = '单价、单位与运输费只能二选一'
  }
  for (const [key, label] of [['unitPrice', '单价'], ['transportFee', '运输费'], ['startPrice', '起步价']]) {
    if (!empty(draft[key]) && !decimal(draft[key], 2)) errors[key] = `${label}最多保留两位小数`
  }
  if (!empty(draft.waitingFee) && !decimal(draft.waitingFee)) errors.waitingFee = '压日费须为有效数值'
  if (!validDate(draft.startDate)) errors.startDate = '请输入有效起始日期，格式为 YYYY-MM-DD'
  if (!validDate(draft.endDate)) errors.endDate = '请输入有效截止日期，格式为 YYYY-MM-DD'
  else if (validDate(draft.startDate) && draft.endDate < draft.startDate) errors.endDate = '截止日期不能早于起始日期'
  if (clean(draft.remark).length > 200) errors.remark = '备注最多 200 个字符'
  if (existing) {
    for (const [key, label] of [['partnerId', partyType], ['taxRate', '税率'], ['currency', '币种'], ['specialVehicle', '特种车']]) {
      const unchanged = key === 'taxRate' ? decimal(draft[key], 2) && Number(draft[key]) === Number(existing[key]) : same(draft[key], existing[key])
      if (!unchanged) errors[key] = `${label}不可修改`
    }
  }
  if (!errors.startDate && !errors.endDate) {
    const duplicates = quotes.filter(row => (!existing || row.id !== existing.id) && routeKey(row) === routeKey(draft)
      && validDate(row.startDate) && validDate(row.endDate) && row.startDate <= draft.endDate && draft.startDate <= row.endDate)
    if (duplicates.length) {
      const uncertain = draft.kind === 'customer' || duplicates.some(row => detailKey(row) !== detailKey(draft)
        || row.startDate === draft.endDate || draft.startDate === row.endDate)
      errors.endDate = uncertain
        ? '存在同合作方、路线及车辆条件的重叠报价；去重边界待确认，暂不保存'
        : '已存在报价，请勿重复添加'
    }
  }
  return errors
}

export function getTransportQuoteStatus(row, today = TRANSPORT_QUOTE_TODAY) {
  if (!validDate(today) || !validDate(row.startDate) || !validDate(row.endDate) || row.endDate < row.startDate) return '口径待确认'
  if (today > row.endDate) return '失效'
  if (row.startDate < today && today < row.endDate) return '有效'
  return '口径待确认'
}

export function filterTransportQuotes(rows, filters = {}, partners = []) {
  const partyName = row => partners.find(party => party.id === row.partnerId)?.name || row.partnerId
  const keyword = clean(filters.keyword)
  const regionMatches = (row, key) => {
    const chosen = filters[key]
    return !Array.isArray(chosen) || chosen.every((value, index) => !value || row[key]?.[['province', 'city'][index]] === value)
  }
  const today = filters.today || TRANSPORT_QUOTE_TODAY
  const statusRank = row => ({ 有效: 0, 口径待确认: 1, 失效: 2 })[getTransportQuoteStatus(row, today)]
  return rows.filter(row => {
    if (filters.kind && row.kind !== filters.kind) return false
    if (keyword && (row.kind === 'supplier' ? !partyName(row).includes(keyword) : row.id !== keyword)) return false
    for (const key of ['partnerId', 'vehicleType', 'regulated', 'transportType', 'tailLift', 'specialVehicle', 'currency', 'chargeMode']) {
      if (filters[key] && row[key] !== filters[key]) return false
    }
    return regionMatches(row, 'pickup') && regionMatches(row, 'delivery')
      && (!filters.status || getTransportQuoteStatus(row, today) === filters.status)
  }).slice().sort((left, right) => partyName(left).localeCompare(partyName(right), 'zh-CN') || statusRank(left) - statusRank(right))
}

export function createTransportQuoteSeed() {
  // Fixed sample quotes are maintained here; they do not supply dispatch costs until matching rules are confirmed.
  return [
    { kind: 'supplier', partnerId: 'PT-00031', transportFee: 980, id: 'TQS-00000001' },
    { kind: 'customer', partnerId: 'PT-00018', transportFee: 1280, id: 'TQC-00000002' },
  ].map(row => ({
    ...createTransportQuoteDraft(row.kind), ...row, taxRate: 6, currency: 'CNY',
    pickup: { province: '上海市', city: '上海市', district: '', address: '' },
    delivery: { province: '江苏省', city: '苏州市', district: '', address: '' },
    vehicleType: '3T', transportType: '单程', regulated: '否', tailLift: '否', transitHours: 3,
    chargeMode: 'fixed', returnRate: 20, startDate: '2026-09-01', endDate: '2026-09-30',
    updatedBy: '演示航晟客服', updatedAt: '2026-09-08 09:00',
  }))
}
