import { createAirDraft, validateAirDraft, AIR_PORTS } from './airOperations.js'
import { decimalTotal, validCapacityDate } from './airCapacity.js'
import { TRANSPORT_QUOTE_CURRENCIES } from './transportQuotes.js'

export function cloneAirSupplementValue(value) {
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value
  if (Array.isArray(value)) return value.map(cloneAirSupplementValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneAirSupplementValue(item)]))
  return value
}
const clone = cloneAirSupplementValue
const fileIdentities = new WeakMap()
let nextFileIdentity = 0
export function stringifyAirSupplementValue(value) {
  return JSON.stringify(value, (_, item) => {
    if (typeof Blob === 'undefined' || !(item instanceof Blob)) return item
    if (!fileIdentities.has(item)) fileIdentities.set(item, ++nextFileIdentity)
    return { file: fileIdentities.get(item), name: item.name, size: item.size, type: item.type, lastModified: item.lastModified }
  })
}
const text = value => typeof value === 'string' ? value.trim() : value
const empty = value => value === undefined || value === null || value === ''
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const positive = value => ['number', 'string'].includes(typeof value) && /^\d+(?:\.\d{1,2})?$/.test(String(value)) && Number.isFinite(Number(value)) && Number(value) > 0
const cargoKeys = ['pieces', 'grossWeight', 'volume']
const houseNumberKeys = new Set(['rate', ...cargoKeys])
const houseValue = (key, value) => {
  const normalized = text(value)
  return houseNumberKeys.has(key) && empty(normalized) ? undefined : normalized
}
const mainTextFields = ['orderType', 'englishGoodsName', 'marks', 'customsDeclaredValue', 'shipper', 'consignee', 'issueDate', 'purchaseNo', 'salesNo', 'invoiceNo', 'code']
const houseTextFields = ['housebillNo', 'englishGoodsName', 'marks', 'customsDeclaredValue', 'shipper', 'consignee', 'currency', 'freightTerms', 'otherCharges', 'paymentMethod', 'rate', 'destination', 'warehouseInstruction']
const serviceEditableFields = {
  transfer: ['warehouseArea', 'documentStatus', 'pickupPoint', 'deliveryPoint'],
  customs: ['choice', 'documentType', 'remark', 'phone'],
  security: ['arrivalDate'],
  clearance: ['secondDepartureDate', 'expectedArrival', 'deliveryAddress', 'phone', 'contact', 'remark'],
}
export const AIR_FREIGHT_TERMS = ['FREIGHT PREPAID', 'FREIGHT COLLECT']
export const AIR_HOUSE_CURRENCIES = TRANSPORT_QUOTE_CURRENCIES
export const AIR_WAREHOUSE_OPERATIONS = ['全部', '打托', '拆托', '加重', '分拣', '改标签']
export const AIR_CLEARANCE_ATTACHMENT_EXTENSIONS = ['.rar', '.zip', '.docx', '.doc', '.xls', '.xlsx', '.pdf', '.jpg']
export const AIR_CLEARANCE_ATTACHMENT_MAX_SIZE = 20 * 1024 * 1024

export function validateAirClearanceAttachments(files, { required = true } = {}) {
  if (!Array.isArray(files) || (required && !files.length)) return '请上传清关派送材料'
  const seen = new Set()
  for (const file of files) {
    if (typeof Blob === 'undefined' || !(file instanceof Blob) || typeof file.name !== 'string' || typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size < 0) return '请选择实际的本地文件'
    if (!AIR_CLEARANCE_ATTACHMENT_EXTENSIONS.some(extension => file.name.toLowerCase().endsWith(extension))) return '清关派送材料仅支持 rar、zip、docx、doc、xls、xlsx、pdf、jpg'
    if (file.size > AIR_CLEARANCE_ATTACHMENT_MAX_SIZE) return '单个清关派送材料不能超过 20 MB'
    const key = JSON.stringify([file.name, file.size, file.lastModified])
    if (seen.has(key)) return '重复附件处理规则待确认，请先移除重复文件'
    seen.add(key)
  }
  return ''
}

function serviceDrafts(order = {}) {
  const cargo = Object.fromEntries(cargoKeys.map(key => [key, order[key] ?? '']))
  const waybillCargo = Object.fromEntries(cargoKeys.map(key => [key, order.waybill?.[key] ?? '']))
  const waybillNo = order.waybillNo || '', flight = order.booking?.flight || order.flight || ''
  const customsMode = order.booking?.routeType === '直航' ? '预报关' : order.booking?.routeType === '国内中转' ? '非预报关' : ''
  return {
    transfer: { warehouseArea: '', documentStatus: '', customsMode, waybillNo, flight, ...cargo, pickupPoint: '', deliveryPoint: '' },
    customs: { choice: '', documentType: '', attachments: [], remark: '', phone: '', ...cargo, goodsName: order.englishGoodsName || order.goodsName || '' },
    security: { customsMode, ...cargo, customer: order.customer || '', waybillNo, origin: order.origin || '', destination: order.destination || '', flight, cutoffTime: order.booking?.cutoffTime || '', housebillNo: order.housebillNo || '', goodsName: order.englishGoodsName || order.goodsName || '', arrivalDate: '' },
    clearance: { waybillNo, ...waybillCargo, departureDate: order.booking?.departureDate || order.departureDate || '', secondDepartureDate: '', expectedArrival: '', deliveryAddress: '', phone: '', contact: '', remark: '', attachments: [] },
  }
}

function copyServiceInputs(target, source) {
  for (const [kind, keys] of Object.entries(serviceEditableFields)) {
    if (!record(source?.[kind])) continue
    for (const key of keys) if (Object.hasOwn(source[kind], key)) target[kind][key] = text(source[kind][key])
  }
  for (const kind of ['customs', 'clearance']) if (source?.[kind] && Object.hasOwn(source[kind], 'attachments')) target[kind].attachments = clone(source[kind].attachments)
  return target
}

export function createAirSupplementDraft(order = {}, airMaster = {}) {
  const saved = order.supplement || {}
  const airlineName = order.booking?.airline || order.supplier || ''
  const airline = (airMaster.airlines || []).find(row => row.name === airlineName || row.code === airlineName)
  const result = {
    orderType: order.orderType || '直单', englishGoodsName: '', marks: '', customsDeclaredValue: '', shipper: '', consignee: '',
    issueDate: order.booking?.departureDate || order.departureDate || '', accompanyingDocuments: [], purchaseNo: '', salesNo: '', invoiceNo: '', code: order.code ?? 'EAP',
    iataCode: airline?.iataCode || '', issuingCarrier: airline?.issuingCarrier || '',
    groundServices: { preallocation: true, transfer: true, security: true, clearance: false, customs: false },
    ...serviceDrafts(order),
  }
  for (const key of mainTextFields) if (Object.hasOwn(saved, key)) result[key] = saved[key]
  if (order.orderType === '合成主订单') result.orderType = '合成主订单'
  if (Object.hasOwn(saved, 'accompanyingDocuments')) result.accompanyingDocuments = clone(saved.accompanyingDocuments)
  if (record(saved.groundServices)) for (const key of Object.keys(result.groundServices)) if (Object.hasOwn(saved.groundServices, key)) result.groundServices[key] = saved.groundServices[key]
  Object.assign(result, serviceDrafts({ ...order, ...result }))
  return copyServiceInputs(result, saved)
}

export function normalizeAirSupplementDraft(payload, order, airMaster = {}) {
  const draft = createAirSupplementDraft(order, airMaster)
  const previousServices = Object.fromEntries(Object.keys(serviceEditableFields).map(key => [key, draft[key]]))
  for (const key of mainTextFields) if (Object.hasOwn(payload || {}, key)) draft[key] = text(payload[key])
  if (Object.hasOwn(payload || {}, 'accompanyingDocuments')) draft.accompanyingDocuments = clone(payload.accompanyingDocuments)
  if (record(payload?.groundServices)) for (const key of Object.keys(draft.groundServices)) draft.groundServices[key] = payload.groundServices[key]
  else draft.groundServices = payload?.groundServices
  if (record(draft.groundServices) && draft.orderType !== '直单') Object.assign(draft.groundServices, { customs: false, clearance: false })
  Object.assign(draft, serviceDrafts({ ...order, ...draft }))
  return copyServiceInputs(copyServiceInputs(draft, previousServices), payload)
}

export function createHouseBillDraft(order = {}) {
  const isChild = Boolean(order.isChild || order.housebillNo || order.parentId)
  const draft = {
    housebillNo: '', englishGoodsName: order.englishGoodsName || order.supplement?.englishGoodsName || '', marks: '', customsDeclaredValue: '',
    shipper: order.shipper || order.supplement?.shipper || '', consignee: order.consignee || order.supplement?.consignee || '',
    currency: '', freightTerms: 'FREIGHT PREPAID', otherCharges: 'FREIGHT PREPAID', paymentMethod: 'PP', rate: undefined, destination: '', warehouseInstruction: '',
    pieces: undefined, grossWeight: undefined, volume: undefined, services: { pickup: false, warehouse: false, customs: true, clearance: false },
    pickup: createAirDraft().pickup, warehouseOperations: [], ...serviceDrafts({ ...order, waybill: isChild ? order.waybill : null }),
  }
  if (!isChild) return draft
  for (const key of [...houseTextFields, ...cargoKeys]) if (Object.hasOwn(order, key)) draft[key] = houseValue(key, order[key])
  if (record(order.services)) for (const key of Object.keys(draft.services)) if (Object.hasOwn(order.services, key)) draft.services[key] = order.services[key]
  if (record(order.pickup)) for (const key of Object.keys(draft.pickup)) if (Object.hasOwn(order.pickup, key)) draft.pickup[key] = clone(order.pickup[key])
  if (Array.isArray(order.warehouseOperations)) draft.warehouseOperations = clone(order.warehouseOperations)
  return copyServiceInputs(draft, order)
}

export function normalizeHouseBillDraft(payload, order = {}) {
  const draft = createHouseBillDraft(order)
  for (const key of [...houseTextFields, ...cargoKeys]) if (Object.hasOwn(payload || {}, key)) draft[key] = houseValue(key, payload[key])
  if (record(payload?.services)) for (const key of Object.keys(draft.services)) draft.services[key] = payload.services[key]
  else draft.services = payload?.services
  if (record(payload?.pickup)) for (const key of Object.keys(draft.pickup)) if (Object.hasOwn(payload.pickup, key)) draft.pickup[key] = clone(payload.pickup[key])
  if (Object.hasOwn(payload || {}, 'warehouseOperations')) draft.warehouseOperations = clone(payload.warehouseOperations)
  Object.assign(draft, serviceDrafts({ ...order, ...draft, waybill: order.isChild || order.housebillNo || order.parentId ? order.waybill : null }))
  return copyServiceInputs(draft, payload)
}

function billFieldErrors(draft) {
  const errors = {}
  for (const [key, label, max, required] of [['englishGoodsName', '英文品名', 256, true], ['marks', '唛头', 256, false], ['shipper', '发货人', 500, true], ['consignee', '收货人', 500, true]]) {
    const value = draft[key]
    if ((required && empty(value)) || (!empty(value) && (typeof value !== 'string' || !value.trim() || value.length > max))) errors[key] = `${label}${required ? '必填，' : ''}最多 ${max} 个字符`
  }
  const declared = draft.customsDeclaredValue
  if (!empty(declared) && (!['string', 'number'].includes(typeof declared) || !/^(?:[A-Za-z]+|\d+(?:\.\d{1,2})?)$/.test(String(declared)))) errors.customsDeclaredValue = '海关申报价值请输入字母或数字；数字最多两位小数'
  return errors
}

export function validateAirServiceInputs(draft, options, { submitting = false } = {}) {
  const errors = {}
  if (!record(options) || Object.values(options).some(value => typeof value !== 'boolean')) return { services: '服务选择格式不正确' }
  if (options.customs) {
    const data = draft.customs || {}
    if (!empty(data.choice) && !['我司报关', '客自报关'].includes(data.choice)) errors['customs.choice'] = '请选择我司报关或客自报关'
    if (!empty(data.documentType) && !['代理出口报关', '单证报关', 'B2C报关'].includes(data.documentType)) errors['customs.documentType'] = '请选择已定义的单证类型'
    if (!Array.isArray(data.attachments) || data.attachments.length) errors['customs.attachments'] = '报关附件的格式、大小和处理规则待确认，暂不接收附件'
    else if (submitting) errors['customs.attachments'] = '报关材料与缺失材料时的发送条件待确认，暂不能生成报关服务指令'
  }
  if (options.clearance) {
    const attachmentError = validateAirClearanceAttachments(draft.clearance?.attachments, { required: submitting })
    if (attachmentError) errors['clearance.attachments'] = attachmentError
  }
  for (const [kind, key] of [['security', 'arrivalDate'], ['clearance', 'secondDepartureDate']]) if (options[kind] && !empty(draft[kind]?.[key]) && !validCapacityDate(draft[kind][key])) errors[`${kind}.${key}`] = '请输入有效日期，格式为 YYYY-MM-DD'
  if (options.clearance && !empty(draft.clearance?.expectedArrival)) {
    const value = draft.clearance.expectedArrival
    if (typeof value !== 'string' || !validCapacityDate(value.slice(0, 10)) || !/ \d{2}:\d{2}$/.test(value) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.slice(11))) errors['clearance.expectedArrival'] = '请输入有效日期时间，格式为 YYYY-MM-DD HH:mm'
  }
  for (const [kind, keys] of Object.entries(serviceEditableFields)) if (options[kind]) for (const key of keys) if (!empty(draft[kind]?.[key]) && typeof draft[kind][key] !== 'string') errors[`${kind}.${key}`] = '请输入文本'
  return errors
}

export function hasAirActualCargo(order) {
  return Boolean(order && (order.warehouse || order.warehouseCargo || order.station || order.stationCargo || order.warehouseEnteredAt || order.stationEnteredAt || ['已入仓', '已出仓', '已进货站', '已入货站'].includes(order.cargoStatus) || ['warehouse', 'station'].some(stage => cargoKeys.some(key => Object.hasOwn(order, `${stage}${key[0].toUpperCase()}${key.slice(1)}`)))))
}

export function getAirHouseBillTotals(children = []) {
  const rows = children.filter(child => !child.deleted && child.orderStatus !== '已取消')
  return Object.fromEntries(cargoKeys.map(key => [key, rows.every(child => positive(child[key])) ? decimalTotal(rows.map(child => [child[key]])) : null]))
}

export function validateAirSupplement(draft, order = {}, children = [], catalog) {
  if (!record(draft)) return { supplement: '补录信息格式不正确' }
  const errors = billFieldErrors(draft)
  if (!['直单', '主单', '合成主订单'].includes(draft.orderType)) errors.orderType = '请选择直单或主单'
  if (order.orderType === '合成主订单' && draft.orderType !== '合成主订单') errors.orderType = '合成主订单的类型不可修改'
  if (order.orderType !== '合成主订单' && draft.orderType === '合成主订单') errors.orderType = '合成主订单须由子订单合成入口生成'
  const previousType = order.supplement?.orderType || order.orderType || '直单'
  const preallocations = (order.services || []).filter(row => row.type === 'preallocation')
  if (draft.orderType !== previousType && (preallocations.some(row => row.status !== '服务已取消') || (order.preallocationSentAt && !preallocations.length))) errors.orderType = '已发送预配后必须先取消预配服务，才可更改订单类型'
  if (!empty(draft.issueDate) && !validCapacityDate(draft.issueDate)) errors.issueDate = '请输入有效签发日期'
  for (const key of ['purchaseNo', 'salesNo', 'invoiceNo']) if (!empty(draft[key]) && (typeof draft[key] !== 'string' || draft[key].length > 50)) errors[key] = '最多 50 个字符'
  if (!empty(draft.code) && !['EAP', 'EAW'].includes(draft.code)) errors.code = '代码只能选择 EAP 或 EAW'
  if (!Array.isArray(draft.accompanyingDocuments) || draft.accompanyingDocuments.length) errors.accompanyingDocuments = '随机文件选项来源尚待确认，暂不接收自定义选项'
  for (const [key, max] of [['iataCode', 10], ['issuingCarrier', 256]]) if (!empty(draft[key]) && (typeof draft[key] !== 'string' || draft[key].length > max)) errors[key] = '航司基础数据超出补录字段长度，请先核对基础数据'
  Object.assign(errors, validateAirServiceInputs(draft, draft.groundServices, { submitting: true }))
  if (draft.orderType !== '直单' && (draft.groundServices?.customs || draft.groundServices?.clearance)) errors.groundServices = '主单的报关和清关派送应选择在分单上'
  const active = children.filter(child => !child.deleted && child.orderStatus !== '已取消')
  if (draft.orderType === '直单' && active.length) errors.children = '直单不可包含分单，请先移单或取消暂存分单'
  if (draft.orderType !== '直单') {
    if (!active.length) errors.children = '请先保存或引入至少一个分单'
    else if ([order, ...active].some(hasAirActualCargo)) errors.children = '存在入仓或货站实测数据，主分单毛件体校验来源尚待确认'
    else {
      const totals = getAirHouseBillTotals(active)
      for (const [key, label] of [['pieces', '件数'], ['grossWeight', '毛重'], ['volume', '体积']]) if (!positive(order[key]) || totals[key] === null || totals[key] !== Number(order[key])) errors[`children.${key}`] = `分单${label}合计必须等于主单预计${label}`
      if (active.some(child => !['子订单暂存', '子订单完成'].includes(child.orderStatus))) errors.children = '存在状态不允许提交的分单'
    }
    if (order.orderType !== '合成主订单') for (const child of active.filter(row => row.orderStatus === '子订单暂存')) {
      for (const [key, message] of Object.entries(validateHouseBillDraft(child, catalog, { submitting: true }))) errors[`children.${child.id}.${key}`] = `${child.housebillNo || child.orderNo}：${message}`
    }
  }
  return errors
}

export function validateHouseBillDraft(draft, catalog = { ports: AIR_PORTS }, { submitting = false } = {}) {
  if (!record(draft)) return { housebill: '分单信息格式不正确' }
  const errors = billFieldErrors(draft)
  if (!empty(draft.housebillNo) && (typeof draft.housebillNo !== 'string' || !/^[A-Za-z0-9]{12}$/.test(draft.housebillNo))) errors.housebillNo = '分单号须为 12 位字母或数字'
  if (!Number.isSafeInteger(Number(draft.pieces)) || !positive(draft.pieces)) errors.pieces = '预计件数须为正整数'
  for (const key of ['grossWeight', 'volume']) if (!positive(draft[key])) errors[key] = '请输入正数，最多两位小数'
  if (!empty(draft.currency) && !AIR_HOUSE_CURRENCIES.includes(draft.currency)) errors.currency = '请选择币种字典中的币种'
  if (!AIR_FREIGHT_TERMS.includes(draft.freightTerms)) errors.freightTerms = '请选择预付或到付条款'
  if (draft.otherCharges !== 'FREIGHT PREPAID') errors.otherCharges = '杂费预付到付目前仅明确默认值 FREIGHT PREPAID，其他取值待确认'
  if (draft.paymentMethod !== 'PP') errors.paymentMethod = '付费方式目前仅明确默认值 PP，其他取值待确认'
  if (!empty(draft.rate) && (!['number', 'string'].includes(typeof draft.rate) || !/^\d+(?:\.\d+)?$/.test(String(draft.rate)) || Number(draft.rate) < 1 || Number(draft.rate) > 100)) errors.rate = '费率范围为 1～100'
  if (!empty(draft.destination) && !(catalog.ports || []).some(port => port.code === draft.destination)) errors.destination = '请选择空港基础数据中的目的港'
  if (!empty(draft.warehouseInstruction) && (typeof draft.warehouseInstruction !== 'string' || draft.warehouseInstruction.length > 256)) errors.warehouseInstruction = '仓库操作要求最多 256 个字符'
  Object.assign(errors, validateAirServiceInputs(draft, draft.services, { submitting }))
  if (draft.services?.pickup) {
    const allErrors = validateAirDraft({ ...createAirDraft(), pickup: draft.pickup, services: { booking: true, pickup: true } }, [])
    Object.assign(errors, Object.fromEntries(Object.entries(allErrors).filter(([key]) => key.startsWith('pickup.'))))
  }
  if (!Array.isArray(draft.warehouseOperations) || draft.warehouseOperations.some(value => !AIR_WAREHOUSE_OPERATIONS.includes(value))) errors.warehouseOperations = '请选择已定义的仓库操作'
  return errors
}

export function getAirSupplementRestriction(order, session = {}) {
  if (!order) return '主订单不存在'
  if (!['service', 'supervisor'].includes(session.role) && !(session.role === 'hangsheng' && order.orderType === '合成主订单')) return '仅空运客服、客服主管或合成主订单的航晟客服可补录订单'
  if (session.role !== 'supervisor' && order.creator !== session.name) return '仅可补录本人创建的订单'
  if (order.orderStatus !== '待补录') return '订单须处于待补录状态'
  if (order.bookingStatus !== '服务已完成') return '订舱服务尚未完成'
  return ''
}

export function getAirOrderCodeRestriction(order, session = {}) {
  if (!order) return '主订单不存在'
  if ((!['service', 'supervisor'].includes(session.role) && !(session.role === 'hangsheng' && order.orderType === '合成主订单')) || (session.role !== 'supervisor' && order.creator !== session.name)) return '仅本人客服或客服主管可修改代码'
  if (!['待补录', '待出提单'].includes(order.orderStatus)) return '仅待补录或待出提单状态可修改代码'
  return ''
}

export function getHouseBillEditRestriction(order, child, session = {}) {
  const reason = getAirSupplementRestriction(order, session)
  if (reason) return reason
  if (order.orderType === '合成主订单') return '合成主订单的原子订单信息只读'
  if (child && child.parentId !== order.id) return '分单不属于当前主订单'
  if (child?.deleted) return '分单已删除'
  if (child && child.orderStatus !== '子订单暂存') return '仅子订单暂存状态可编辑，完成分单的编辑范围尚有冲突'
  return ''
}
