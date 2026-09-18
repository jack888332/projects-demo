import { GROUND_DATE, GROUND_SPECIAL_TYPES } from './groundOperations.js'

const clone = value => JSON.parse(JSON.stringify(value))
const text = value => String(value ?? '').trim()
export const GROUND_BUSINESS_TYPES = ['出口空运', '进口空运', '出口海运', '跨境陆运', '陆运']
export const GROUND_CARGO_FIELDS = [['pieces', '件数（件）'], ['volume', '方数（方）'], ['weight', '重量（kg）'], ['length', '长度（cm）'], ['width', '宽度（cm）'], ['height', '高度（cm）']]
export function createGroundPoint(first = {}) {
  return { province: first.province || '', city: first.city || '', district: '', address: '', contact: '', phone: '', regulated: '', specialVehicle: '', tailLift: '' }
}
export const createGroundContact = () => ({ name: '', phone: '', email: '' })
export function createGroundOrderDraft(order) {
  const draft = { orderNo: '', customer: '', customerPartnerId: '', businessType: '', customerContacts: [],
    ...Object.fromEntries(GROUND_CARGO_FIELDS.map(([key]) => [key, ''])),
    pickupTime: GROUND_DATE, deliveryTime: GROUND_DATE, pickupPoints: [createGroundPoint()], deliveryPoints: [createGroundPoint()], remark: '' }
  if (!order) return draft
  for (const key of Object.keys(draft)) if (order[key] != null) draft[key] = clone(order[key])
  if (!order.customerContacts) draft.customerContacts = order.customerContact || order.customerPhone || order.customerEmail
    ? [{ name: order.customerContact || '', phone: order.customerPhone || '', email: order.customerEmail || '' }] : []
  draft.pickupPoints = draft.pickupPoints.map(point => ({ ...createGroundPoint(), regulated: order.regulated || '', specialVehicle: order.specialVehicle || '', tailLift: order.tailLift || '', ...point }))
  return draft
}
export function groundOrderPermissions(order, role) {
  const manual = order?.source === '航晟手工创建'
  const editable = role === 'hangsheng' && manual && ['未调度', '已调度', '异常中'].includes(order.dispatchStatus)
  return { create: role === 'hangsheng', edit: editable, fullEdit: editable && order.dispatchStatus === '未调度',
    close: editable && order.dispatchStatus === '未调度' }
}
export const groundCustomers = state => state.partners.filter(partner => partner.type === '客户' && partner.status !== '已删除' && state.groundCustomerPartnerIds.includes(partner.id))
export function groundContactChoices(partner) {
  const rows = [...(partner?.businessContacts || []).map(row => ({ name: row.name, phone: row.phone, email: row.emails?.[0] || row.email || '' })),
    ...(partner?.contacts || []).map(row => ({ name: row.name, phone: row.mobile || row.phone || '', email: row.email || '' }))]
  return rows.filter((row, index) => rows.findIndex(other => JSON.stringify(other) === JSON.stringify(row)) === index)
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/.test(value)) return false
  const iso = value.replace(' ', 'T') + (value.length === 10 ? 'T00:00:00Z' : ':00Z')
  const date = new Date(iso)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, value.length).replace('T', ' ') === value
}
export function validateGroundOrderDraft(draft, customers, { remarkOnly = false } = {}) {
  const errors = {}
  const length = (key, value, min, max, required = false) => {
    const count = text(value).length
    if ((required || count) && (count < min || count > max)) errors[key] = `请输入${min}～${max}个字符`
  }
  length('remark', draft.remark, 0, 800)
  if (remarkOnly) return errors
  if (!text(draft.orderNo)) errors.orderNo = '请输入单号'
  if (!customers.some(partner => partner.id === draft.customerPartnerId && partner.name === draft.customer)) errors.customer = '请选择与航晟物流有客户关系的合作方'
  if (!GROUND_BUSINESS_TYPES.includes(draft.businessType)) errors.businessType = '请选择业务类型'
  for (const [key] of GROUND_CARGO_FIELDS) length(key, draft[key], 1, 10)
  for (const [index, contact] of (draft.customerContacts || []).entries()) {
    length(`customerContacts.${index}.name`, contact.name, 2, 50)
    length(`customerContacts.${index}.phone`, contact.phone, 8, 20)
    length(`customerContacts.${index}.email`, contact.email, 6, 50)
    if (text(contact.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(contact.email))) errors[`customerContacts.${index}.email`] = '请输入有效邮箱地址'
  }
  for (const kind of ['pickup', 'delivery']) {
    if (!validDate(text(draft[kind + 'Time']))) errors[kind + 'Time'] = '请输入有效日期或日期时间'
    const points = draft[kind + 'Points'] || []
    if (!points.length) errors[kind + 'Points'] = '至少保留一个地点'
    points.forEach((point, index) => {
      const prefix = `${kind}Points.${index}.`
      for (const key of ['province', 'city', 'district']) if (!text(point[key])) errors[prefix + key] = '请选择省、市、区'
      if (index && (point.province !== points[0].province || point.city !== points[0].city)) errors[prefix + 'city'] = '新增地点的省、市必须与第一个地点相同'
      length(prefix + 'address', point.address, 4, 200, true)
      length(prefix + 'contact', point.contact, 2, 50)
      length(prefix + 'phone', point.phone, 8, 20)
      if (kind === 'pickup') {
        if (point.regulated) errors[prefix + 'regulated'] = '监管类型选项待确认，暂不能提交此值'
        if (point.specialVehicle && !GROUND_SPECIAL_TYPES.includes(point.specialVehicle)) errors[prefix + 'specialVehicle'] = '请选择已定义的特种车'
        if (point.tailLift && !['是', '否'].includes(point.tailLift)) errors[prefix + 'tailLift'] = '请选择是或否'
      }
    })
  }
  return errors
}
export const groundPointLabel = point => [point.province, point.city === point.province ? '' : point.city, point.district, point.address].join('')
export function potentialGroundOrders(order, orders, { dispatch = false } = {}) {
  if (!order?.pickupTime) return []
  const matches = orders.filter(other => other.id !== order.id && other.pickupTime?.slice(0, 10) === order.pickupTime.slice(0, 10) &&
    other.pickupPoints?.some(point => order.pickupPoints?.some(target => point.province === target.province && point.city === target.city &&
      (!dispatch || (point.district === target.district && point.address === target.address)))))
  return matches.sort((a, b) => (a.dispatchStatus !== '未调度') - (b.dispatchStatus !== '未调度') ||
    (dispatch ? b.updatedAt.localeCompare(a.updatedAt) : a.updatedAt.localeCompare(b.updatedAt)))
}
export function groundOrderChanges(before, after) {
  const labels = { orderNo: '单号', customer: '委托方', businessType: '业务类型', customerContacts: '委托方联系人',
    pickupPoints: '提货信息', deliveryPoints: '送货信息', pickupTime: '期望提货时间', deliveryTime: '期望送货时间', remark: '备注',
    ...Object.fromEntries(GROUND_CARGO_FIELDS) }
  return Object.keys(labels).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(key => ({ field: labels[key], before: before[key] ?? '', after: after[key] ?? '' }))
}

export function groundChangeText(value) {
  if (value == null || value === '') return '未填写'
  if (Array.isArray(value)) return value.length ? value.map(groundChangeText).join('\n') : '未填写'
  if (typeof value !== 'object') return String(value)
  const labels = {name:'姓名',phone:'电话',email:'邮箱',emails:'邮箱',identity:'身份证',province:'省',city:'市',district:'区',address:'地址',contact:'联系人',regulated:'监管类型',specialVehicle:'特种车',tailLift:'尾板车'}
  return Object.entries(value).filter(([key, item]) => labels[key] && item !== '' && item != null).map(([key, item]) => `${labels[key]}：${groundChangeText(item)}`).join('；') || '未填写'
}

export function groundMonthlyRows(orders, currentMonth = GROUND_DATE.slice(0, 7)) {
  const months = orders.map(order => order.createdAt?.slice(0, 7)).filter(value => /^\d{4}-\d{2}$/.test(value || '')).sort()
  if (!months.length) return []
  const [year, month] = months[0].split('-').map(Number), [endYear, endMonth] = currentMonth.split('-').map(Number)
  const missingCompletionTime = orders.some(order => order.dispatchStatus === '已完成' && !order.completedAt)
  const result = []
  for (let index = endYear * 12 + endMonth - 1; index >= year * 12 + month - 1; index--) {
    const value = `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`
    const completed = orders.filter(order => order.dispatchStatus === '已完成' && order.completedAt?.startsWith(value))
    const transfer = completed.filter(order => order.orderType === '中转订单').length
    result.push({ month: value, dispatchCount: null, transportCount: missingCompletionTime ? null : completed.length - transfer,
      transferCount: missingCompletionTime ? null : transfer, totalCount: missingCompletionTime ? null : completed.length,
      receivable: null, payable: null, profit: null, missingCompletionTime })
  }
  return result
}
