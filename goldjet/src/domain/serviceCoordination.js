// PRD 018 服务协同管理：按订单汇总各服务进度、截单预警、预配执行与操作日志。
import { deriveAirDeclarations } from './airDeclarations.js'

export const COORDINATION_NOW = '2026-09-08 14:30'
export const COORDINATION_SERVICES = [
  { key: 'preallocation', label: '预配' },
  { key: 'handover', label: '交运' },
  { key: 'waybill', label: '提单' },
  { key: 'security', label: '安检' },
  { key: 'pallet', label: '打板' },
  { key: 'transport', label: '运输' },
  { key: 'customs', label: '关务' },
  { key: 'warehouse', label: '仓储' },
]
export const PREALLOCATION_SEND_STATUSES = ['待发送', '已发送', '发送失败', '发送中']
export const PREALLOCATION_CUSTOMS_STATUSES = ['接收申报', '待人工审核', '提运单放行', '退单', '待申报', '申报中']
export const PREALLOCATION_SUPPLIER = '广州电子口岸管理公司'
export const COORDINATION_SERVICE_NOTE = '服务单状态由所属业务模块维护；交运与部分服务在本原型没有上游记录时显示无服务，不以空集合推断完成。'

const text = value => String(value ?? '').trim()
const entries = value => Array.isArray(value) ? value : []

export function mapServiceStatus(status) {
  if (['已完成', '服务已完成'].includes(status)) return '已完成'
  if (['待服务', '待接单', '待发送'].includes(status)) return '待服务'
  if (['服务中', '进行中', '已接单'].includes(status)) return '服务中'
  return ''
}

function aggregate(records, { mixedPending = false, statusOf = row => row.status } = {}) {
  const cancelled = ['已取消', '已终止', '服务已取消', '异常取消', '异常结束']
  const active = records.filter(row => !cancelled.includes(statusOf(row)))
  if (!active.length) return records.length ? '待确认' : ''
  const mapped = active.map(row => mapServiceStatus(statusOf(row))).filter(Boolean)
  if (!mapped.length) return '待确认'
  if (mapped.every(status => status === '待服务')) return '待服务'
  if (mapped.every(status => status === '已完成')) return '已完成'
  if (mixedPending && new Set(mapped).size > 1) return '待确认'
  return '服务中'
}

function serviceRecords(order, type) {
  return entries(order.services).filter(service => service.type === type)
}

function cutoffAt(order) {
  const date = order?.booking?.cutoffDate || order?.booking?.departureDate || order?.departureDate
  const time = order?.booking?.cutoffTime
  return date && time ? `${date} ${time}` : ''
}

function hoursUntil(moment, now = COORDINATION_NOW) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(moment)) return null
  const diff = new Date(`${moment.replace(' ', 'T')}:00+08:00`).getTime() - new Date(`${now.replace(' ', 'T')}:00+08:00`).getTime()
  return diff / 3600000
}

// 出口空运订单才纳入协同页面；已取消订单不纳入。
export function deriveCoordinationRows(state, { thresholdHours = 48, now = COORDINATION_NOW } = {}) {
  const rows = []
  const declarationProjection = deriveAirDeclarations(state)
  for (const order of entries(state.airOrders)) {
    if (order.businessType !== '空运出口' || ['已取消', '已作废'].includes(order.orderStatus)) continue
    const declarations = declarationProjection.filter(row => row.orderId === order.id || row.childId === order.id)
    const palletOrders = entries(state.stationOrders).filter(row => row.airOrderId === order.id)
    const preallocation = entries(state.preallocationRecords).find(row => row.orderId === order.id)
    const warehouseOrders = entries(state.warehouseOrders).filter(row => row.airOrderId === order.id || row.sourceOrderId === order.id)
    const cutoff = cutoffAt(order)
    const remaining = hoursUntil(cutoff, now)
    const completed = order.orderStatus === '已完成'
    const urgent = completed ? '正常' : remaining !== null && remaining >= 0 && remaining <= thresholdHours ? '紧急' : '正常'
    const inbound = warehouseOrders.flatMap(row => entries(row.pallets)).reduce((total, pallet) => ({
      pieces: total.pieces + (Number(pallet.inPieces) || 0), weight: total.weight + (Number(pallet.inWeight) || 0), volume: total.volume + (Number(pallet.inVolume) || 0),
    }), { pieces: 0, weight: 0, volume: 0 })
    rows.push({
      id: order.id, orderId: order.id, orderNo: order.orderNo, childNo: order.childNo || '', waybillNo: order.waybillNo || '', customer: order.customer,
      origin: order.origin, destination: order.destination, orderStatus: order.orderStatus,
      departureDate: order.booking?.departureDate || order.departureDate || '', cutoffAt: cutoff, expectedArrival: order.expectedArrival || '',
      flight: order.booking?.flight || order.flight || '', airline: order.supplier || order.booking?.airline || '', waybillAttribute: order.booking?.waybillType || '',
      cargoType: order.specialCargo || order.booking?.specialCargo || '', routeType: order.booking?.routeType || '',
      inboundPieces: warehouseOrders.length ? inbound.pieces : null, inboundWeight: warehouseOrders.length ? Number(inbound.weight.toFixed(2)) : null, inboundVolume: warehouseOrders.length ? Number(inbound.volume.toFixed(2)) : null,
      urgent, remainingHours: remaining,
      services: {
        preallocation: preallocation ? preallocationSummary(preallocation) : '',
        handover: '',
        waybill: waybillSummary(order),
        security: aggregate(serviceRecords(order, 'security')),
        pallet: palletSummary(palletOrders),
        transport: aggregate(serviceRecords(order, 'pickup')),
        customs: declarations.length ? aggregate(declarations, { mixedPending: true, statusOf: row => row.serviceStatus }) : '',
        warehouse: aggregate(serviceRecords(order, 'warehouse')),
      },
      order,
    })
  }
  // 紧急在前；同类按截单时间升序；无截单时间的订单不自行补位，排在最后。
  return rows.sort((left, right) => (right.urgent === '紧急') - (left.urgent === '紧急') ||
    (left.cutoffAt || '\uffff').localeCompare(right.cutoffAt || '\uffff') || left.orderNo.localeCompare(right.orderNo))
}

function preallocationSummary(record) {
  const rows = [record.main, ...entries(record.houses)]
  if (rows.every(row => row.sendStatus === '待发送')) return '待服务'
  if (rows.every(row => ['接收申报', '提运单放行'].includes(row.customsStatus))) return '已完成'
  return '服务中'
}

function waybillSummary(order) {
  if (order.orderStatus === '待出提单') return '待出提单'
  if (order.orderStatus === '已出提单' || order.orderStatus === '已完成') return '已出提单'
  return '服务中'
}

function palletSummary(palletOrders) {
  const active = palletOrders.filter(row => row.status !== '已取消')
  if (!active.length) return ''
  if (active.every(row => row.status === '已打板')) return '已完成'
  return '服务中'
}

export function filterCoordinationRows(rows, filters = {}, thresholdHours = 48) {
  const fuzzy = (value, query) => !text(query) || String(value || '').toLocaleLowerCase().includes(text(query).toLocaleLowerCase())
  const range = (value, bounds) => {
    if (!Array.isArray(bounds) || !bounds.some(Boolean)) return true
    const moment = String(value || '')
    return Boolean(moment) && (!bounds[0] || moment >= bounds[0]) && (!bounds[1] || moment <= bounds[1])
  }
  return rows.filter(row =>
    fuzzy(row.waybillNo, filters.waybillNo) && fuzzy(row.orderNo, filters.orderNo) &&
    (!filters.origin || row.origin === filters.origin) && (!filters.destination || row.destination === filters.destination) &&
    (!filters.airline || row.airline === filters.airline) &&
    range(row.departureDate, filters.departureRange) && range(row.cutoffAt, filters.cutoffRange) && range(row.expectedArrival, filters.arrivalRange) &&
    (!filters.urgent || row.urgent === filters.urgent) && (!filters.orderStatus || row.orderStatus === filters.orderStatus) &&
    COORDINATION_SERVICES.every(service => !filters[`service_${service.key}`] || row.services[service.key] === filters[`service_${service.key}`]))
}

export function collectServiceLogs(state, order) {
  const entries_ = []
  for (const service of entries(order.services)) {
    for (const log of entries(service.history || service.logs)) {
      entries_.push({ serviceName: service.name || service.type, event: log.event || log.action || '', content: log.content || log.remark || '', actor: log.actor || log.operator || '', time: log.time || log.createdAt || '' })
    }
  }
  const declaration = deriveAirDeclarations(state).find(row => row.orderId === order.id)
  if (declaration) entries_.push({ serviceName: '关务', event: '材料补齐通知', content: entries(declaration.materialRequests).map(row => row.type).join('、') || '已记录报关材料', actor: declaration.creator || '', time: declaration.createdAt || '' })
  const preallocation = entries(state.preallocationRecords).find(row => row.orderId === order.id)
  if (preallocation) for (const log of entries(preallocation.history)) entries_.push({ serviceName: '预配', event: log.event, content: log.content, actor: log.actor, time: log.time })
  return entries_.sort((left, right) => String(left.time).localeCompare(String(right.time)))
}

// §5.3 申报资料来源；不把来源截图位置作为字段名。
export function buildPreallocationMaterials(state, record, houseNo = '') {
  const order = entries(state.airOrders).find(row => row.id === record.orderId)
  const house = houseNo ? entries(record.houses).find(row => row.childNo === houseNo) : null
  const pieces = house ? house.pieces : record.main.pieces
  const weight = house ? house.weight : record.main.weight
  const cargoName = order?.cargoName || order?.booking?.cargoName || ''
  return [
    ['总提运单号', record.waybillNo || order?.waybillNo || ''], ['分单号', house ? house.childNo : ''],
    ['航班号', order?.booking?.flight || order?.flight || ''], ['航班日期', order?.booking?.departureDate || order?.departureDate || ''],
    ['离境地/装货地', order?.origin || ''], ['承运人', order?.booking?.airline || order?.supplier || ''],
    ['货物海关状态', '进出口货'], ['支付方式', order?.booking?.paymentMethod || '待确认'],
    ['托运地国家', '待确认'], ['卸货地', 'ATC88'], ['装载时间', order?.booking?.departureDate || ''],
    ['总件数', pieces ?? ''], ['总毛重', weight ?? ''], ['货物信息', cargoName],
    ['舱单传输人', '5141761575765广东高捷航运物流有限公司'],
    ['发货人', record.shipper || '待确认'], ['收货人', record.consignee || '待确认'],
    ['危险品编码', house?.dangerCode || ''], ['危险品联系人及通讯类别', ''], ['危险品通讯号码', ''],
  ]
}

export function derivePreallocationRows(state) {
  return entries(state.preallocationRecords).map(record => ({
    ...record, serviceNo: record.serviceNo || record.id.replace('PRE', 'SV'),
    mainSendAt: record.main.sentAt || '', houseSendAt: entries(record.houses).map(row => row.sentAt).filter(Boolean).sort().at(-1) || '',
    status: record.status, supplier: record.supplier || PREALLOCATION_SUPPLIER,
  }))
}

export function preallocationPermissions(role) {
  const operator = ['service', 'supervisor'].includes(role)
  return { send: operator, cancel: operator, terminate: operator, threshold: operator }
}
