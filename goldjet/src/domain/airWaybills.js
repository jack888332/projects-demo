import { calculateChargeWeight } from './chargeWeight.js'
import { AIR_FREIGHT_TERMS } from './airOrderSupplement.js'
import { decimalTotal, validCapacityDate } from './airCapacity.js'

const empty = value => value === undefined || value === null || (typeof value === 'string' && !value.trim())
const text = value => typeof value === 'string' ? value : ''
const number = value => !empty(value) && ['number', 'string'].includes(typeof value) && Number.isFinite(Number(value)) ? Number(value) : null
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
const cargoFields = ['pieces', 'grossWeight', 'volume']
export const AIR_WAYBILL_CHARGE_CODES = ['AWC', 'MYC', 'SCC', 'MWC', 'CHC', 'CGC']
export const AIR_WAYBILL_CONTACT_FIELDS = ['name', 'address', 'phone', 'postcode', 'country', 'countryCode', 'province', 'city', 'alias', 'printText']
export const AIR_WAYBILL_TEXT_FIELDS = ['origin', 'originName', 'accountingInformation', 'discountNo', 'firstDestination', 'firstLeg', 'secondDestination', 'secondLeg', 'thirdDestination', 'thirdLeg', 'currency', 'wtVal', 'other', 'transportValue', 'customsDeclaredValue', 'destinationName', 'flight', 'insuranceAmount', 'handlingInfo', 'weightCode', 'freightTerms', 'englishGoodsName', 'issueDate']
const visibleStates = ['待出提单', '已出提单', '已交单', '交单', '已作废']

export function createAirWaybillContact(source = {}) {
  if (typeof source === 'string') source = { printText: source }
  return Object.fromEntries(AIR_WAYBILL_CONTACT_FIELDS.map(key => [key, text(source?.[key])]))
}

export function createAirWaybillDimension() {
  return { length: undefined, width: undefined, height: undefined, pieces: undefined }
}

export function createAirWaybillCharge() {
  return { code: '', unitPrice: undefined, quantity: undefined }
}

export function getAirWaybillChildren(state, orderId) {
  return (state.airChildren || []).filter(row => row.parentId === orderId && !row.deleted && row.orderStatus !== '已取消')
}

export function createAirWaybillDraft(order = {}, child = null, master = {}) {
  const entity = child || order, saved = entity.waybillDocument || {}, supplement = child || order.supplement || {}
  const booking = order.booking || {}
  const airline = (master.airlines || []).find(row => row.name === booking.airline || row.code === booking.airline) || {}
  const cargo = entity.waybill || {}
  const draft = {
    origin: order.origin || '', originName: '', waybillNo: order.waybillNo || '', housebillNo: child?.housebillNo || '',
    waybillPrefix: (order.waybillNo || '').slice(0, 3), waybillSuffix: '', airlineCode: airline.code || '', airlineName: airline.name || '',
    companyName: 'GUANGDONG GOLDJET INT’L LOGISTICS CO.，LTD', iataCode: child ? airline.iataCode || '' : supplement.iataCode || '', accountNo: airline.accountNo || '',
    shipper: createAirWaybillContact(supplement.shipper), consignee: createAirWaybillContact(supplement.consignee),
    accountingInformation: child ? supplement.freightTerms || 'FREIGHT PREPAID' : 'FREIGHT PREPAID',
    discountNo: child ? '' : booking.discountNo || '', firstDestination: '', firstLeg: booking.firstLeg || '',
    secondDestination: booking.secondDestination || '', secondLeg: booking.secondLeg || '', thirdDestination: booking.thirdDestination || '', thirdLeg: booking.thirdLeg || '',
    currency: child?.currency || 'CNY', wtVal: 'PP', other: 'PP', transportValue: 'NVD', customsDeclaredValue: supplement.customsDeclaredValue || '',
    destinationName: '', flight: booking.flight || order.flight || '', insuranceAmount: '', handlingInfo: supplement.handlingInfo || '',
    pieces: number(cargo.pieces) ?? undefined, grossWeight: number(cargo.grossWeight) ?? undefined, volume: number(cargo.volume) ?? undefined,
    weightCode: child ? 'Q' : '', freightTerms: child?.freightTerms || 'FREIGHT PREPAID', rate: undefined,
    englishGoodsName: supplement.englishGoodsName || '', marks: child?.marks || '', issueDate: child ? '' : supplement.issueDate || '',
    dimensions: Array.from({ length: 10 }, createAirWaybillDimension), charges: [],
  }
  for (const key of [...AIR_WAYBILL_TEXT_FIELDS, ...cargoFields, 'rate', 'dimensions', 'charges', 'shipper', 'consignee']) if (Object.hasOwn(saved, key)) draft[key] = clone(saved[key])
  for (const key of AIR_WAYBILL_TEXT_FIELDS) if (empty(draft[key])) draft[key] = ''
  for (const key of [...cargoFields, 'rate']) if (empty(draft[key])) draft[key] = undefined
  for (const key of ['shipper', 'consignee']) draft[key] = createAirWaybillContact(draft[key])
  return draft
}

export function normalizeAirWaybillDraft(payload, order, child, master) {
  const draft = createAirWaybillDraft(order, child, master)
  for (const key of AIR_WAYBILL_TEXT_FIELDS) if (Object.hasOwn(payload || {}, key) && (child || key !== 'weightCode')) draft[key] = empty(payload[key]) ? '' : typeof payload[key] === 'string' ? payload[key].trim() : payload[key]
  for (const key of [...cargoFields, 'rate']) if (Object.hasOwn(payload || {}, key)) draft[key] = empty(payload[key]) ? undefined : payload[key]
  for (const key of ['shipper', 'consignee']) if (Object.hasOwn(payload || {}, key)) draft[key] = createAirWaybillContact(payload[key])
  for (const key of ['dimensions', 'charges']) if (Object.hasOwn(payload || {}, key)) draft[key] = clone(payload[key])
  return draft
}

export function validateAirWaybillDraft(draft, master = {}) {
  const errors = {}
  if (!(master.ports || []).some(port => port.code === draft.origin)) errors.origin = '请选择空港基础数据中的始发地'
  for (const key of AIR_WAYBILL_TEXT_FIELDS) if (typeof draft[key] !== 'string') errors[key] = '请输入文字'
  for (const key of [...cargoFields, 'rate']) if (!empty(draft[key]) && (number(draft[key]) === null || number(draft[key]) < 0)) errors[key] = '请输入有效的非负数'
  if (!empty(draft.pieces) && !Number.isSafeInteger(number(draft.pieces))) errors.pieces = '件数须为整数'
  if (draft.freightTerms && !AIR_FREIGHT_TERMS.includes(draft.freightTerms)) errors.freightTerms = '请选择运费条款'
  if (draft.issueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.issueDate) || Number.isNaN(Date.parse(draft.issueDate)) || !new Date(draft.issueDate).toISOString().startsWith(draft.issueDate))) errors.issueDate = '请选择有效日期'
  if (!Array.isArray(draft.dimensions)) errors.dimensions = '体积明细格式不正确'
  else draft.dimensions.forEach((row, index) => {
    const keys = ['length', 'width', 'height', 'pieces']
    if (keys.every(key => empty(row?.[key]))) return
    for (const key of keys) if (number(row?.[key]) === null || number(row?.[key]) <= 0) errors[`dimensions.${index}.${key}`] = '请补齐有效尺寸和件数'
    if (!Number.isSafeInteger(number(row?.pieces))) errors[`dimensions.${index}.pieces`] = '件数须为正整数'
  })
  if (!Array.isArray(draft.charges)) errors.charges = '杂费明细格式不正确'
  else draft.charges.forEach((row, index) => {
    if (['code', 'unitPrice', 'quantity'].every(key => empty(row?.[key]))) return
    if (!AIR_WAYBILL_CHARGE_CODES.includes(row?.code)) errors[`charges.${index}.code`] = '请选择杂费代码'
    for (const key of ['unitPrice', 'quantity']) if (!empty(row?.[key]) && (number(row[key]) === null || number(row[key]) < 0)) errors[`charges.${index}.${key}`] = '请输入有效的非负数'
  })
  return errors
}

export function getAirWaybillTotals(draft = {}) {
  const gross = number(draft.grossWeight), volume = number(draft.volume)
  const chargeWeight = gross !== null && gross >= 0 && volume !== null && volume >= 0 ? calculateChargeWeight(gross, volume) : null
  const rate = number(draft.rate)
  const dimensions = (draft.dimensions || []).filter(row => ['length', 'width', 'height', 'pieces'].some(key => !empty(row?.[key])))
  const validDimensions = dimensions.length && dimensions.every(row => ['length', 'width', 'height', 'pieces'].every(key => number(row[key]) > 0))
  const chargeRows = (draft.charges || []).map(row => ({ ...row, subtotal: number(row.unitPrice) !== null && number(row.quantity) !== null ? decimalTotal([[number(row.unitPrice), number(row.quantity)]]) : null }))
  const activeCharges = chargeRows.filter(row => ['code', 'unitPrice', 'quantity'].some(key => !empty(row[key])))
  return {
    chargeWeight, freightTotal: chargeWeight !== null && rate !== null ? decimalTotal([[chargeWeight, rate]]) : null,
    dimensionPieces: validDimensions ? dimensions.reduce((sum, row) => sum + number(row.pieces), 0) : null,
    dimensionVolume: validDimensions ? Math.round((decimalTotal(dimensions.map(row => [number(row.length), number(row.width), number(row.height), number(row.pieces), 0.000001])) + Number.EPSILON) * 100) / 100 : null,
    chargeRows, chargesTotal: activeCharges.length && activeCharges.every(row => row.subtotal !== null && AIR_WAYBILL_CHARGE_CODES.includes(row.code)) ? decimalTotal(activeCharges.map(row => [row.subtotal])) : null,
    total: null,
  }
}

export function getAirWaybillRestriction(order, session = {}, { submit = false, entity = order } = {}) {
  if (!order) return '订单不存在'
  if (!['service', 'waybillClerk'].includes(session.role)) return '仅空运客服或打单员可维护提单'
  if (order.orderStatus !== '待出提单') return submit ? '仅待出提单订单可提交出单' : '当前仅开放待出提单的资料维护；出单后的修改边界待确认'
  if (entity?.waybillTransmission && entity.waybillTransmission.status !== '待发送') return '发送后修改资料对发送状态的影响待确认，暂不修改'
  return ''
}

export function getDescriptionCodeConfig(waybillNo = '') {
  const prefix = waybillNo.slice(0, 3)
  if (['784', '043', '131', '235'].includes(prefix)) return { visible: true, required: true, options: ['EAP', 'EAW'], defaultValue: 'EAP' }
  if (prefix === '999') return { visible: true, required: false, options: ['EAP', 'EAW', '中性提单999'], defaultValue: 'EAP' }
  return { visible: false, required: false, options: [], defaultValue: '' }
}

export function getAirWaybillRows(state) {
  return (state.airOrders || []).filter(order => visibleStates.includes(order.orderStatus)).map(order => {
    const children = getAirWaybillChildren(state, order.id)
    const cargo = order.waybill || {}
    const sum = key => children.length && children.every(child => number(child.waybill?.[key]) !== null) ? decimalTotal(children.map(child => [number(child.waybill[key])])) : null
    const statuses = children.map(child => child.waybillTransmission?.status || '待发送')
    return { ...order, children, mainCargo: { ...cargo }, childCount: children.length, cutoffAt: getAirWaybillCutoffAt(order, state.airMaster),
      childCargo: Object.fromEntries(cargoFields.map(key => [key, sum(key)])),
      mainSendStatus: order.waybillTransmission?.status || '待发送',
      childSendStatus: statuses.length && new Set(statuses).size === 1 ? statuses[0] : null,
      childSendReason: new Set(statuses).size > 1 ? '混合状态的聚合规则待确认' : '',
    }
  })
}

export function getAirWaybillCutoffAt(order, master = {}) {
  const booking = order.booking || {}, departureDate = booking.departureDate || order.departureDate || ''
  const flight = (master.flights || []).find(row => row.code === (booking.flight || order.flight))
  const days = empty(flight?.cutoffDays) ? null : number(flight.cutoffDays)
  const time = booking.cutoffTime || flight?.cutoffTime || ''
  if (!validCapacityDate(departureDate) || days === null || !Number.isInteger(days) || days > 0 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return ''
  const date = new Date(`${departureDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return `${date.toISOString().slice(0, 10)} ${time}`
}

export function getAirWaybillSendRestriction(state, selections, codes = {}, nowMs) {
  if (!Array.isArray(selections) || !selections.length) return '请选择要发送的主单或分单'
  if (!Number.isFinite(nowMs)) return '演示时钟无效'
  const keys = selections.map(item => `${item.orderId}:${item.childId || ''}`)
  if (new Set(keys).size !== keys.length) return '请勿重复选择相同运单'
  for (const selection of selections) {
    const order = (state.airOrders || []).find(row => row.id === selection.orderId)
    if (!order?.waybillNo) return '订单尚未绑定提单号'
    if (!visibleStates.includes(order.orderStatus) || ['已作废', '交单', '已交单'].includes(order.orderStatus)) return '当前订单状态的发送资格待确认'
    const child = selection.childId ? getAirWaybillChildren(state, order.id).find(row => row.id === selection.childId) : null
    if (selection.childId && !child) return '分单不存在或不属于当前主单'
    const entity = child || order, transmission = entity.waybillTransmission
    if (transmission?.status === '发送中') return '该运单正在发送，请等待本地模拟回执'
    if (transmission?.status === '异常中') return '异常后的重发规则待确认，暂不能重发'
    if (transmission?.status === '成功') {
      const elapsed = nowMs - transmission.succeededAtMs
      if (!Number.isFinite(elapsed) || elapsed < 120000) return '本地模拟接收端：成功后的 2 分钟内不能重复发送'
      if (elapsed === 120000) return '恰好 2 分钟的边界待确认，请稍后重试'
    }
    if (child && order.waybillTransmission?.status !== '成功' && !selections.some(item => item.orderId === order.id && !item.childId)) return '本地模拟接收端：请先成功发送主运单，再发送分运单'
    const draft = createAirWaybillDraft(order, child, state.airMaster)
    if (!draft.flight || !draft.origin || !(child?.destination || order.destination) || !(number(draft.pieces) > 0) || !(number(draft.grossWeight) > 0)) return '发送需填写航班、起降港及有效件数和重量'
    const config = getDescriptionCodeConfig(order.waybillNo), code = codes[order.id] ?? config.defaultValue
    if ((!config.visible && code !== '') || (config.visible && code !== '' && !config.options.includes(code)) || (config.required && !code)) return '请选择该航司支持的 DescriptionCode'
  }
  return ''
}
