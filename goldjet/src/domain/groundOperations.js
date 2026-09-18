// PRD 015 §§1.3.7–18 and 016 §§1.3.2–7. All names, vehicles and quotes are demo data.
export const GROUND_DATE = '2026-09-08'
export const GROUND_NOW = `${GROUND_DATE} 14:30`
export const GROUND_VEHICLES = ['1.5T/0.6', '3T/4.2', '5T/7.0', '8T/7.6', '10T/9.6', '40/45HQ', '17.5米/平板', '17.5米/厢车', '12米平板']
export const GROUND_STATUSES = ['待提货', '提货中', '到达提货点', '已提货', '到达卸货点', '已卸货', '已取消']
export const GROUND_EDITABLE_STATUSES = GROUND_STATUSES.filter(status => status !== '已取消')
export const GROUND_SPECIAL_TYPES = ['危险品', '冷藏车', '气垫车', '平板车']
export const GROUND_SUPPLIERS = [
  { name: '申捷车队', address: '上海市浦东新区演示路 18 号' },
  { name: '远通运输', address: '上海市青浦区演示路 26 号' },
  { name: '安航车队', address: '江苏省苏州市昆山市演示路 35 号' },
]

const PRICE_ROUTES = [
  { pickupProvince: '上海市', pickupCity: '上海市', deliveryProvince: '江苏省', deliveryCity: '苏州市', specialVehicle: '', tailLift: '否', regulated: '否', prices: { '3T/4.2': [980, 1020, 960], '8T/7.6': [1680, 1750, 1720], '10T/9.6': [2360, 2280, 2410] } },
  { pickupProvince: '上海市', pickupCity: '上海市', deliveryProvince: '上海市', deliveryCity: '上海市', specialVehicle: '', tailLift: '否', regulated: '否', prices: { '3T/4.2': [650, 690, 670], '8T/7.6': [1100, 1080, 1150] } },
  { pickupProvince: '上海市', pickupCity: '上海市', deliveryProvince: '江苏省', deliveryCity: '苏州市', specialVehicle: '冷藏车', tailLift: '是', regulated: '否', prices: { '3T/4.2': [1480, 1550, 1520] } },
]

const present = value => value !== undefined && value !== null && value !== ''
const copy = value => JSON.parse(JSON.stringify(value))
const textValue = value => String(value ?? '').trim()

export function createDispatchDraft() {
  return {
    vehicleType: '', supplier: '', cost: null, plate: '',
    drivers: [{ name: '', phone: '', identity: '' }], companyAddress: '',
    customsNo: '', vehicleWeight: null, containerNo: '', frameWeight: null,
    containerWeight: null, customerPassword: '', remark: '',
    specificPieces: null, specificVolume: null, specificWeight: null,
    specificLength: null, specificWidth: null, specificHeight: null,
  }
}

export const GROUND_PLATE_PRESETS = [
  { ...createDispatchDraft(), vehicleType: '3T/4.2', supplier: '安航车队', plate: '沪A·DEMO1', drivers: [{ name: '演示司机甲', phone: '000-00001001', identity: '000000000000000001' }], companyAddress: GROUND_SUPPLIERS[2].address, customsNo: 'DEMO-HG-01', vehicleWeight: 3200, remark: '合成车辆资料，可修改' },
  { ...createDispatchDraft(), vehicleType: '10T/9.6', supplier: '远通运输', plate: '沪B·DEMO2', drivers: [{ name: '演示司机乙', phone: '000-00001002', identity: '000000000000000002' }, { name: '演示司机丙', phone: '000-00001003', identity: '' }], companyAddress: GROUND_SUPPLIERS[1].address, vehicleWeight: 7200, containerNo: 'DEMO-C001', frameWeight: 1300, containerWeight: 2200 },
]

function locations(order, kind) {
  return order?.[`${kind}Points`] || []
}

function routeSignature(point) {
  return point?.province && point?.city ? `${point.province}|${point.city}` : ''
}

function commonLocation(orders, kind) {
  const routeSets = orders.map(order => new Set(locations(order, kind).map(routeSignature).filter(Boolean)))
  return routeSets.length > 0 && routeSets.every(set => set.size > 0) && [...routeSets[0]].some(key => routeSets.every(set => set.has(key)))
}

function specialSignature(order) {
  return [order.specialVehicle || '', order.tailLift || '', order.regulated || ''].join('|')
}

export function getGroundQuotes(order, vehicleType) {
  if (!GROUND_VEHICLES.includes(vehicleType)) return []
  // Multiple stops are not reduced to one arbitrarily: every stop must share the quoted province/city.
  const pickupKeys = new Set(locations(order, 'pickup').map(routeSignature))
  const deliveryKeys = new Set(locations(order, 'delivery').map(routeSignature))
  if (pickupKeys.size !== 1 || deliveryKeys.size !== 1 || pickupKeys.has('') || deliveryKeys.has('')) return []
  const route = PRICE_ROUTES.find(item => pickupKeys.has(`${item.pickupProvince}|${item.pickupCity}`) && deliveryKeys.has(`${item.deliveryProvince}|${item.deliveryCity}`) && specialSignature(item) === specialSignature(order))
  if (!route?.prices[vehicleType]) return []
  return GROUND_SUPPLIERS.map((supplier, index) => ({ ...supplier, cost: route.prices[vehicleType][index], vehicleType, source: '合成报价表' })).sort((a, b) => a.cost - b.cost)
}

export function validateBatchGroundOrders(orders) {
  if (!Array.isArray(orders) || !orders.length) return { ok: false, code: 'NO_ORDERS', message: '请至少选择一条待调度订单', specialConfirmationRequired: false }
  if (orders.some(order => !order || order.dispatchStatus !== '未调度')) return { ok: false, code: 'INVALID_STATUS', message: '只有待调度的订单可批量调度，请重新选择！', specialConfirmationRequired: false }
  if (!commonLocation(orders, 'pickup') || !commonLocation(orders, 'delivery')) return { ok: false, code: 'DIFFERENT_CITIES', message: '所选订单必须均有同省市的提货点和同省市的卸货点', specialConfirmationRequired: false }
  const specialConfirmationRequired = new Set(orders.map(specialSignature)).size > 1
  return { ok: true, code: specialConfirmationRequired ? 'SPECIAL_CONFIRMATION_REQUIRED' : 'READY', message: specialConfirmationRequired ? '您所选的订单，存在不同的特殊车型需求，请确认。' : '', specialConfirmationRequired }
}

export function validateDispatchDraft(draft) {
  const errors = {}
  const value = draft || {}
  if (!GROUND_VEHICLES.includes(value.vehicleType)) errors.vehicleType = '请选择车型'
  if (!GROUND_SUPPLIERS.some(item => item.name === value.supplier)) errors.supplier = '请选择已知供应商'
  if (textValue(value.plate).length < 4 || textValue(value.plate).length > 50) errors.plate = '请输入 4～50 个字符的车牌号'
  if (!Array.isArray(value.drivers) || value.drivers.length < 1 || value.drivers.length > 2) errors.drivers = '每辆车至少保留一行司机，最多两位司机'
  for (const [index, driver] of (Array.isArray(value.drivers) ? value.drivers : []).entries()) {
    if (present(driver.name) && (textValue(driver.name).length < 2 || textValue(driver.name).length > 50)) errors[`drivers.${index}.name`] = '司机姓名须为 2～50 个字符'
    if (present(driver.identity) && !/^(?:[0-9A-Za-z]{15}|[0-9A-Za-z]{18})$/.test(textValue(driver.identity))) errors[`drivers.${index}.identity`] = '司机身份证须为 15 或 18 位数字或字母'
  }
  for (const [field, label, min, max] of [
    ['companyAddress', '公司地址', 4, 200], ['customsNo', '海关编号', 2, 100],
    ['containerNo', '柜号', 1, 99], ['customerPassword', '客户密码', 1, 40], ['remark', '备注', 0, 800],
  ]) if (present(value[field]) && (String(value[field]).length < min || String(value[field]).length > max)) errors[field] = `${label}须为 ${min}～${max} 个字符`
  for (const [field, label] of [['specificPieces', '特定提货件数'], ['specificLength', '特定长度'], ['specificWidth', '特定宽度'], ['specificHeight', '特定高度']]) {
    if (present(value[field]) && (!Number.isInteger(Number(value[field])) || Number(value[field]) <= 0 || String(value[field]).length > 10)) errors[field] = `${label}须为不超过 10 位的正整数`
  }
  for (const [field, label] of [['specificVolume', '特定提货体积'], ['specificWeight', '特定提货重量']]) {
    if (present(value[field]) && (!/^\d+(?:\.\d{1,2})?$/.test(String(value[field])) || Number(value[field]) <= 0 || String(value[field]).length > 10)) errors[field] = `${label}须为正数，最多 2 位小数、10 个字符`
  }
  for (const [field, label] of [['vehicleWeight', '车自重'], ['frameWeight', '架重'], ['containerWeight', '柜重']]) {
    if (present(value[field]) && (!Number.isFinite(Number(value[field])) || Number(value[field]) < 0 || String(value[field]).length > 10)) errors[field] = `${label}须为不超过 10 个字符的非负数`
  }
  if (present(value.cost) && (!Number.isFinite(Number(value.cost)) || Number(value.cost) < 0)) errors.cost = '成本价格须为非负数或留空待确认'
  return errors
}

export function calculateGroundAllocation(order, draft, vehicleCount) {
  const allocate = (specificKey, orderKey, digits) => {
    const value = present(draft[specificKey]) ? Number(draft[specificKey]) : present(order[orderKey]) ? Number(order[orderKey]) / vehicleCount : null
    return value === null ? null : Number(value.toFixed(digits))
  }
  return {
    expectedPieces: allocate('specificPieces', 'pieces', 0),
    expectedWeight: allocate('specificWeight', 'weight', 2),
    expectedVolume: allocate('specificVolume', 'volume', 2),
    expectedLength: present(draft.specificLength) ? Number(draft.specificLength) : null,
    expectedWidth: present(draft.specificWidth) ? Number(draft.specificWidth) : null,
    expectedHeight: present(draft.specificHeight) ? Number(draft.specificHeight) : null,
  }
}

export function deriveGroundOrderStatus(waybills, previousStatus = '未调度') {
  if (!waybills.length) return previousStatus === '已取消' ? '已取消' : '未调度'
  if (waybills.some(item => item.status === '异常中' || item.exceptionStatus === '异常中')) return '异常中'
  return waybills.every(item => ['已卸货', '已取消'].includes(item.status)) ? '已完成' : '已调度'
}

export function createGroundWaybill(order, draft, { serial, vehicleCount, actor, time = GROUND_NOW }) {
  const normalized = Object.fromEntries(Object.keys(createDispatchDraft()).map(key => [key, copy(draft[key] ?? createDispatchDraft()[key])]))
  const quote = getGroundQuotes(order, draft.vehicleType).find(item => item.name === draft.supplier)
  const waybillNo = `D201${GROUND_DATE.slice(2).replaceAll('-', '')}${String(serial).padStart(5, '0')}`
  return {
    ...normalized, ...calculateGroundAllocation(order, draft, vehicleCount),
    id: waybillNo, waybillNo, orderId: order.id, orderNo: order.orderNo, childNo: order.childNo, batchNo: order.batchNo,
    customer: order.customer, pickup: order.pickup, delivery: order.delivery,
    pickupPoints: copy(order.pickupPoints), deliveryPoints: copy(order.deliveryPoints),
    pickupTime: order.pickupTime, deliveryTime: order.deliveryTime,
    specialVehicle: order.specialVehicle, tailLift: order.tailLift, regulated: order.regulated,
    cost: quote?.cost ?? null, costStatus: quote ? '合成报价匹配' : '待确认：未匹配报价',
    status: '待提货', exceptionStatus: '', cargoDocuments: '', sealNo: '', expectedArrival: '',
    createdAt: time, updatedAt: time, dispatchUpdatedAt: time, dispatchedBy: actor,
    settlementStatus: '未覆盖：自动费用尚未实现',
    trajectory: [{ id: `${waybillNo}-T1`, event: '调度完成', status: '待提货', time, remark: draft.remark || '', actor, role: '航晟客服' }],
  }
}

export function groundWaybillTerminal(waybill) {
  return ['已卸货', '已取消'].includes(waybill?.status === '异常中' ? waybill.fulfillmentStatus : waybill?.status)
}

export function validateGroundStatusChange(waybill, update) {
  if (!waybill) return '未找到运输运单'
  if (groundWaybillTerminal(waybill)) return '已卸货或已取消的运单不能再修改状态'
  if (update?.status === '已取消') return '取消调度涉及返空费，当前未覆盖；不能通过状态管理直接取消'
  if (!GROUND_EDITABLE_STATUSES.includes(update?.status)) return '请选择已定义的运输节点；异常上报请使用异常管理'
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(update?.time || '')) return '请选择操作时间，格式为 YYYY-MM-DD HH:mm'
  const [date, clock] = update.time.split(' ')
  const parsed = new Date(`${date}T${clock}:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 16) !== `${date}T${clock}`) return '请输入有效的操作时间'
  return ''
}
