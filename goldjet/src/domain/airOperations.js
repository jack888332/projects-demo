import { calculateChargeWeight } from './chargeWeight.js'

// These references and identities are deterministic, synthetic demo data.
export const AIR_ROLES = [
  { id: 'service', label: '空运客服' },
  { id: 'supervisor', label: '客服主管' },
  { id: 'operator', label: '航线运营' },
  { id: 'handler', label: '航线操作' },
  { id: 'hangsheng', label: '航晟客服' },
  { id: 'director', label: '航线总监' },
]
export const AIR_SALES = ['周倩', '陈楠', '李明', '王晴']
export const AIR_PICKUP_REGIONS = [
  { value: '上海市', label: '上海市', children: [{ value: '上海市', label: '上海市', children: ['浦东新区', '松江区', '青浦区', '闵行区'].map(value => ({ value, label: value })) }] },
  { value: '江苏省', label: '江苏省', children: [{ value: '苏州市', label: '苏州市', children: ['昆山市', '太仓市', '吴中区'].map(value => ({ value, label: value })) }] },
  { value: '广东省', label: '广东省', children: [
    { value: '广州市', label: '广州市', children: ['白云区', '花都区'].map(value => ({ value, label: value })) },
    { value: '深圳市', label: '深圳市', children: ['宝安区', '龙岗区'].map(value => ({ value, label: value })) },
  ] },
]

export function getAirContacts(partner) {
  if (!partner) return []
  const contacts = [...(partner.contacts || []), ...(partner.businessContacts || [])]
  if (!contacts.length && partner.contact) contacts.push({ name:partner.contact,phone:partner.phone,emails:partner.emails || (partner.email ? [partner.email] : []) })
  return contacts.map(contact => ({ name: contact.name, phone: contact.phone || '', emails: [...(contact.emails || (contact.email ? [contact.email] : []))] }))
}
export const AIR_PORTS = [
  { code: 'PVG', name: '上海浦东' }, { code: 'CAN', name: '广州' },
  { code: 'SZX', name: '深圳' }, { code: 'NRT', name: '东京成田' },
  { code: 'LAX', name: '洛杉矶' }, { code: 'FRA', name: '法兰克福' },
  { code: 'AMS', name: '阿姆斯特丹' }, { code: 'SIN', name: '新加坡' },
]
export const AIR_PRODUCTS = [
  { id: 'MU-GENERAL', label: '东方航空 · 普货产品', airline: '东方航空' },
  { id: 'CZ-GENERAL', label: '南方航空 · 普货产品', airline: '南方航空' },
  { id: 'NH-GENERAL', label: '全日空 · 普货产品', airline: '全日空' },
]
export const AIR_FLIGHTS = [
  { code: 'MU9001', airline: '东方航空', origin: 'PVG', destination: 'CAN', firstDestination: 'CAN', firstLeg: 'PVG - CAN', takeoffTime: '20:00', cutoffTime: '16:00', palletCompany: 'MU 货站打板' },
  { code: 'CZ9002', airline: '南方航空', origin: 'SZX', destination: 'CAN', firstDestination: 'CAN', firstLeg: 'SZX - CAN', takeoffTime: '18:30', cutoffTime: '14:30', palletCompany: 'CZ 航晟打板' },
  { code: 'NH9003', airline: '全日空', origin: 'NRT', destination: 'PVG', firstDestination: 'PVG', firstLeg: 'NRT - PVG', takeoffTime: '19:00', cutoffTime: '15:00', palletCompany: '' },
]
export const AIR_LEGS = ['PVG - CAN', 'SZX - CAN', 'NRT - PVG', 'CAN - NRT', 'NRT - LAX', 'NRT - FRA', 'NRT - AMS', 'NRT - SIN']

export function createAirDraft() {
  return {
    customer: '', owner: '', contact: '', phone: '', contactEmails: [], flowTo: '', goodsName: '',
    pieces: undefined, grossWeight: undefined, volume: undefined,
    length: undefined, width: undefined, height: undefined, expectedArrival: '', specialCargo: '',
    origin: '', destination: '', product: '', departureDate: '', bookingRequirement: '',
    sellRate: undefined, truckSellRate: undefined, foamRatio: undefined,
    services: { booking: true, warehouse: true, pickup: false }, warehouseOperations: [],
    pickup: { supplier: '航晟', time: '', region: [], address: '', contact: '', phone: '', arrivalAddress: '演示中转仓', arrivalContact: '演示收货员', arrivalPhone: '000-00000000', vehicleType: '', remark: '' },
  }
}

const empty = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
const clean = (value) => String(value ?? '').trim()
const precisePositive = (value) => !empty(value) && Number.isFinite(Number(value)) && Number(value) > 0 && /^\d+(\.\d{1,2})?$/.test(String(value))
const rate = (value) => !empty(value) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100
const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().startsWith(value)
const dateTime = (value) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value) && date(value.slice(0, 10)) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.slice(11))

export function getAirCredit(customer, partners) {
  const partner = partners.find((item) => item.name === customer && item.type === '客户' && ['已生效', '有效'].includes(item.status))
  if (!partner) return { kind: 'blocked', message: '请选择有效的客户档案', partner: null }
  if (!Number.isFinite(partner.availableCredit) || !Number.isFinite(partner.creditLimit)) return { kind: 'unconfirmed', message: '该客户授信信息待确认', partner }
  if (partner.availableCredit < 0) return { kind: 'blocked', message: '客户可用授信额度低于 0，禁止下单', partner }
  if (partner.availableCredit === 0) return { kind: 'unconfirmed', message: '可用额度为 0：第003篇禁止下单，第009篇仅禁止负数，该边界待确认；请先审批增加额度。', partner }
  if (partner.creditLimit > 0 && partner.availableCredit / partner.creditLimit < 0.2) return { kind: 'warning', message: '此客户额度不足', partner }
  return { kind: 'ready', message: '', partner }
}

export function validateAirDraft(form, partners, catalog = { ports: AIR_PORTS }) {
  const errors = {}
  const credit = getAirCredit(form.customer, partners)
  if (['blocked', 'unconfirmed'].includes(credit.kind)) errors.customer = credit.message
  if (!AIR_SALES.includes(form.owner)) errors.owner = '请选择业务员'
  if (!Number.isInteger(Number(form.pieces)) || Number(form.pieces) <= 0) errors.pieces = '件数必须为正整数'
  for (const field of ['grossWeight', 'volume']) if (!precisePositive(form[field])) errors[field] = '请输入正数，最多两位小数'
  for (const field of ['length', 'width', 'height']) if (!empty(form[field]) && !precisePositive(form[field])) errors[field] = '请输入正数，最多两位小数'
  for (const field of ['origin', 'destination']) if (!catalog.ports.some((port) => port.code === form[field])) errors[field] = '请选择空港基础数据中的港口'
  if (!AIR_PRODUCTS.some((product) => product.id === form.product)) errors.product = '请选择航司产品'
  if (!rate(form.sellRate)) errors.sellRate = '运费卖价必须为 0～100'
  if (!empty(form.truckSellRate) && !rate(form.truckSellRate)) errors.truckSellRate = '后段卡车卖价必须为 0～100'
  if (!empty(form.foamRatio) && ![0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].includes(Number(form.foamRatio))) errors.foamRatio = '分泡请选择 0～1 的十分位值'
  for (const [field, max] of [['contact', 256], ['goodsName', 256], ['bookingRequirement', 50]]) if (clean(form[field]).length > max) errors[field] = `最多 ${max} 个字符`
  if (!empty(form.phone) && (clean(form.phone).length < 8 || clean(form.phone).length > 20)) errors.phone = '联系电话为 8～20 个字符'
  for (const [index, email] of (form.contactEmails || []).entries()) if (!empty(email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(email))) errors[`contactEmails.${index}`] = '请输入有效的联系人邮箱'
  if (!empty(form.departureDate) && !date(form.departureDate)) errors.departureDate = '日期格式应为 YYYY-MM-DD'
  if (!empty(form.expectedArrival) && !dateTime(form.expectedArrival)) errors.expectedArrival = '日期时间格式应为 YYYY-MM-DD HH:mm'
  if (!empty(form.specialCargo) && !['锂电池', '危险品', '鲜活'].includes(form.specialCargo)) errors.specialCargo = '请选择已有特殊货物类型'
  if (form.services?.booking !== true) errors.services = '订舱服务为必选项'
  if (form.services?.pickup) {
    const pickup = form.pickup || {}
    for (const field of ['supplier', 'time', 'address', 'contact', 'phone', 'arrivalAddress', 'arrivalContact']) if (!clean(pickup[field])) errors[`pickup.${field}`] = '必填'
    if (!Array.isArray(pickup.region) || pickup.region.length !== 3) errors['pickup.region'] = '请选择提货点省、市、区'
    if (!empty(pickup.time) && !dateTime(pickup.time)) errors['pickup.time'] = '日期时间格式应为 YYYY-MM-DD HH:mm'
    if (clean(pickup.contact).length > 4) errors['pickup.contact'] = '提货联系人最多 4 个字符'
    if (clean(pickup.arrivalContact).length > 60) errors['pickup.arrivalContact'] = '到货联系人最多 60 个字符'
    if (clean(pickup.remark).length > 256) errors['pickup.remark'] = '备注最多 256 个字符'
  }
  return errors
}

// The PRD does not enumerate the two regions: this grouping is a demo assumption.
// The role restrictions themselves come from chapter 010, section 1.3.3.
export const BOOKING_JOURNEY_FIELDS = ['airline', 'flight', 'departureDate', 'firstDestination', 'firstLeg', 'takeoffTime', 'cutoffTime', 'airCost', 'truckCost', 'guidePrice', 'waybillType', 'profitRules', 'routeType', 'allowLoss']
export const BOOKING_SUPPLEMENT_FIELDS = ['secondLeg', 'secondDestination', 'thirdLeg', 'palletCompany', 'discountNo', 'handlingInfo', 'remark']

export function createBookingDraft(order = {}) {
  return {
    airline: '', flight: '', departureDate: order.departureDate || '', firstDestination: '', firstLeg: '',
    takeoffTime: '', cutoffTime: '', airCost: undefined, truckCost: undefined, guidePrice: undefined,
    waybillType: '', profitRules: ['大于等于'], secondLeg: '', secondDestination: '', thirdLeg: '',
    palletCompany: '', discountNo: '', handlingInfo: '', routeType: '直航', remark: '', allowLoss: false,
    ...JSON.parse(JSON.stringify(order.booking || {})),
  }
}

export function validateBookingDraft(draft, catalog = { ports: AIR_PORTS, flights: AIR_FLIGHTS, legs: AIR_LEGS }) {
  const errors = {}
  for (const field of ['airline', 'flight', 'departureDate', 'firstDestination', 'firstLeg', 'takeoffTime', 'cutoffTime', 'waybillType', 'secondDestination', 'thirdLeg']) if (!clean(draft[field])) errors[field] = '必填'
  const flight = catalog.flights.find((item) => item.code === draft.flight)
  if (!flight || flight.airline !== draft.airline) errors.flight = '请选择属于当前航司的头程航班'
  for (const field of ['firstDestination', 'secondDestination']) if (!catalog.ports.some((port) => port.code === draft[field])) errors[field] = '请选择空港基础数据中的港口'
  for (const field of ['firstLeg', 'secondLeg', 'thirdLeg']) if (!empty(draft[field]) && !catalog.legs.includes(draft[field])) errors[field] = '请选择航司基础数据中的航段'
  if (!date(draft.departureDate)) errors.departureDate = '请选择有效出港日期'
  for (const field of ['takeoffTime', 'cutoffTime']) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft[field])) errors[field] = '时刻格式应为 HH:mm'
  for (const field of ['airCost', 'guidePrice']) if (!precisePositive(draft[field])) errors[field] = '请输入正数，最多两位小数'
  if (!empty(draft.truckCost) && !precisePositive(draft.truckCost)) errors.truckCost = '请输入正数，最多两位小数'
  if (!['自营', '非自营'].includes(draft.waybillType)) errors.waybillType = '请选择提单属性'
  if (!Array.isArray(draft.profitRules) || !draft.profitRules.length || draft.profitRules.some((rule) => !['大于等于', '小于等于', '大于', '小于'].includes(rule))) errors.profitRules = '请选择预计盈利规则'
  if (!empty(draft.routeType) && !['直航', '国内中转'].includes(draft.routeType)) errors.routeType = '请选择航线类型'
  for (const [field, max] of [['discountNo', 30], ['handlingInfo', 256], ['remark', 256]]) if (clean(draft[field]).length > max) errors[field] = `最多 ${max} 个字符`
  return errors
}

export function getBookingPermission(order, role) {
  const denied = (reason) => ({ journey: false, supplement: false, action: null, reason })
  if (!order) return denied('请选择订单')
  if (!['operator', 'handler', 'hangsheng'].includes(role)) return denied('当前角色仅可查看订舱信息')
  if (!['待订舱', '待补录', '待出提单'].includes(order.orderStatus) || order.bookingStatus === '待审核') return denied('当前状态不允许修改订舱信息')
  if (order.bookingStatus === '待服务' && role === 'handler') return denied('请等待航线运营确认航班')
  const action = order.bookingStatus === '待服务' ? (role === 'operator' ? 'confirm' : 'complete')
    : order.bookingStatus === '服务中' && ['handler', 'hangsheng'].includes(role) ? 'complete' : 'save'
  return { journey: role !== 'handler', supplement: role !== 'handler', action, reason: role === 'handler' ? '航程补充的字段归属待确认；暂仅支持核对已保存信息后完成订舱，不开放未确认字段的编辑。' : '' }
}

export function getBookingDecision(order, draft) {
  const sell = Number(order.sellRate)
  const cost = Number(draft.airCost)
  const weight = Number(order.chargeWeight ?? calculateChargeWeight(order.grossWeight, order.volume))
  if (!Number.isFinite(sell) || !Number.isFinite(cost) || !Number.isFinite(weight) || weight <= 0) return { kind: 'unconfirmed', message: '卖价、空运成本或计费重不完整，需确认后继续', lossAmount: 0 }
  if (cost <= sell) return { kind: 'ready', message: '', lossAmount: 0 }
  const lossAmount = Math.abs((sell - cost - 0.3) * weight)
  if (!draft.allowLoss) return { kind: 'blocked', message: '空运成本大于运费卖价，未允许亏损，禁止提交', lossAmount }
  if (lossAmount <= 5000) return { kind: 'approval', message: '本单需航线总监审核，确认后提交审核', lossAmount }
  return { kind: 'unconfirmed', message: '第002篇规定超过 5,000 元追加事业部副总审批，超过 10,000 元追加事业部总经理审批；该多级链尚未实现。超过 30,000 元的公司总经理触发顺序待确认。', lossAmount }
}
