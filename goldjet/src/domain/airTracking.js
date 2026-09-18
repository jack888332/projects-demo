const rows = value => Array.isArray(value) ? value : []
const text = value => typeof value === 'string' ? value.trim() : ''
const present = value => value !== null && value !== undefined && value !== ''
const services = [['booking', '订舱'], ['pickup', '提货'], ['warehouse', '仓储'], ['preallocation', '预配发送'], ['transfer', '中转'], ['customs', '报关'], ['security', '货站安检'], ['clearance', '清关派送']]
const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export const TRACKING_ORDER_FIELDS = [
  ['orderNo', '订单号'], ['waybillNo', '提单号'], ['customer', '客户'], ['origin', '起始港'], ['destination', '目的港'],
  ['flight', '航班号'], ['departureDate', '出港日期'], ['grossWeight', '货物毛重（kg）'], ['pieces', '货物件数（件）'],
  ['volume', '货物体积（m³）'], ['sellRate', '运费卖价'],
]
export const TRACKING_TRANSPORT_FIELDS = [
  ['waybillNo', '运单号'], ['driver', '司机'], ['phone', '联系方式（司机）'], ['plate', '车牌'], ['vehicleType', '车型'],
  ['length', '长度（cm）'], ['width', '宽度（cm）'], ['height', '高度（cm）'],
  ['handoverDriver', '交单司机'], ['handoverPhone', '交单司机联系方式'], ['handoverAt', '交单时间'],
]
export const TRACKING_CONTACT_FIELDS = [
  ['firstFlight', '一程航班号'], ['station', '货站'], ['cutoffAt', '截单日期'],
  ['handler', '航线操作'], ['handlerPhone', '联系方式（航线操作）'], ['operator', '航线运营'], ['operatorPhone', '联系方式（航线运营）'],
  ['warehouseService', '仓库客服'], ['warehousePhone', '联系方式（仓库客服）'],
  ['preallocationService', '客服（预配发送）'], ['preallocationPhone', '联系方式（预配发送）'],
  ['customsService', '报关员'], ['customsPhone', '联系方式（报关）'], ['securityService', '货站人员'],
  ['securityPhone', '联系方式（货站安检）'], ['overseas', '海外部'], ['overseasPhone', '联系方式（清关派送）'],
]

export const canQueryAirTracking = session => Boolean(session?.readAll || (session?.role === 'service' && text(session.name)))
export const canViewAirTrackingOrder = (order, session) => canQueryAirTracking(session) && Boolean(order && !order.deleted && (session.readAll || order.creator === session.name))

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function trackingTime(value) {
  const source = text(value)
  if (!/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(source) || !validDate(source.slice(0, 10))) return ''
  return source.slice(0, 16)
}

export function formatTrackingFlight(flight, date) {
  if (!text(flight)) return ''
  const departure = text(date)
  return validDate(departure) ? `${text(flight)}/${departure.slice(8, 10)}.${months[Number(departure.slice(5, 7)) - 1]}` : text(flight)
}

export function trackingNodeShape(selected, status) {
  if (selected === false) return 'square'
  if (status === '服务已完成') return 'hollow'
  if (status === '服务中') return 'solid'
  return ''
}

export function sortTrackingEvents(events) {
  return events.map((event, index) => ({ ...event, time: trackingTime(event.time), sortIndex: index,
    sortTime: trackingTime(event.time) ? text(event.time).padEnd(19, ':00') : '' }))
    .sort((a, b) => b.sortTime.localeCompare(a.sortTime) || a.sortIndex - b.sortIndex)
    .map(({ sortIndex, sortTime, ...event }) => event)
}

export const visibleTrackingEvents = (events, expanded = false) => expanded ? events : events.slice(0, 2)

function serviceEvents(service, entity, isMain) {
  const result = []
  const add = (id, time, status, content) => {
    if (present(time)) result.push({ id: `${service.id}:${id}`, time, status, content, service: service.name,
      abnormal: service.status === '异常结束' || status === '异常结束' })
  }
  if (service.type === 'booking' && isMain) {
    add('created', entity.createdAt, '待服务', '订舱服务创建')
    // An approval request also has bookingConfirmedAt; it is not a flight confirmation.
    if (entity.bookingStatus !== '待审核') add('confirmed', entity.bookingConfirmedAt, '服务中', '航班已确认')
    add('completed', entity.bookingCompletedAt, '服务已完成', '订舱完成')
  } else add('created', service.createdAt, '待服务', `${service.name}指令已生成`)
  for (const event of rows(service.trajectory)) {
    result.push({ id: `${service.id}:event:${event.id}`, time: event.time, status: event.status || '',
      content: event.content || event.event || '', service: service.name,
      abnormal: service.status === '异常结束' || event.status === '异常结束' })
  }
  for (const transmission of rows(service.transmissions)) add(`sent:${transmission.id}`, transmission.sentAt, '', `${service.name}资料已修改并记录本地重发`)
  if (service.acceptance) add('accepted', service.acceptance.time, '', `${service.name}接单：${service.acceptance.actor}`)
  return result
}

function serviceGroup(entity, isMain) {
  const records = rows(isMain ? entity.services : entity.serviceRecords).filter(service => !service.deleted)
  const selections = isMain ? entity.supplement?.groundServices || {} : entity.services || {}
  const nodes = services.flatMap(([type, name]) => {
    const found = records.filter(service => service.type === type)
    if (found.length) return found.map(service => ({ id: service.id, name, status: service.status || '',
      shape: trackingNodeShape(true, service.status), abnormal: service.status === '异常结束' }))
    // Absence of an instruction does not prove the service was deselected.
    if (!Object.hasOwn(selections, type)) return []
    return [{ id: `${entity.id}:${type}`, name, status: selections[type] ? '已选择，尚无服务记录' : '未选择',
      shape: trackingNodeShape(selections[type], ''), abnormal: false }]
  })
  return { id: entity.id, label: isMain ? '订单服务轨迹' : `分单 ${entity.housebillNo || entity.orderNo || entity.id}`,
    nodes, events: sortTrackingEvents(records.flatMap(service => serviceEvents(service, entity, isMain))) }
}

function transportView(waybill) {
  return { id: waybill.id, waybillNo: waybill.waybillNo || '', status: waybill.status || '',
    driver: rows(waybill.drivers).map(row => row.name || '').join(' / '), phone: rows(waybill.drivers).map(row => row.phone || '').join(' / '),
    plate: waybill.plate || '', vehicleType: waybill.vehicleType || '', length: waybill.expectedLength ?? '', width: waybill.expectedWidth ?? '', height: waybill.expectedHeight ?? '',
    handoverDriver: '', handoverPhone: '', handoverAt: '',
    events: sortTrackingEvents(rows(waybill.trajectory).map(event => ({ id: event.id, time: event.time, status: event.status || '',
      service: '运输', content: [event.event, event.remark].filter(Boolean).join('；'), abnormal: event.status === '异常结束' }))),
  }
}

export function queryAirTracking(state, session, query) {
  if (!canQueryAirTracking(session)) return { kind: 'denied' }
  const number = text(query)
  if (!number) return { kind: 'idle' }
  const matches = rows(state.airOrders).filter(order => canViewAirTrackingOrder(order, session)
    && (order.orderNo === number || (text(order.waybillNo) && order.waybillNo === number)))
  if (!matches.length) return { kind: 'not-found' }
  if (matches.length !== 1) return { kind: 'ambiguous' }
  const order = matches[0], booking = order.booking || {}, cargo = order.waybill || {}
  const flight = text(booking.flight), departureDate = validDate(text(booking.departureDate)) ? booking.departureDate : ''
  const flights = rows(state.airMaster?.flights).filter(row => row.code === flight)
  const station = flights.length === 1 ? rows(state.airMaster?.stations).find(row => row.id === flights[0].station)?.name || '' : ''
  const linkedGroundIds = new Set(rows(state.groundOrders).filter(row => row.airOrderId === order.id && !row.deleted).map(row => row.id))
  const transports = rows(state.groundWaybills).filter(row => linkedGroundIds.has(row.orderId) && !row.deleted).map(transportView)
  const children = rows(state.airChildren).filter(child => child.parentId === order.id && (session.readAll || child.creator === session.name) && !child.deleted)
  return { kind: 'ready', order: {
    id: order.id, orderNo: order.orderNo, waybillNo: order.waybillNo || '', customer: order.customer || '',
    origin: order.origin || '', destination: order.destination || '', flight: formatTrackingFlight(flight, departureDate), departureDate,
    pieces: cargo.pieces ?? '', grossWeight: cargo.grossWeight ?? '', volume: cargo.volume ?? '', sellRate: '',
  }, contacts: { firstFlight: formatTrackingFlight(flight, departureDate), station, handler: order.assignees?.handler || '', operator: order.assignees?.operator || '' },
  groups: [serviceGroup(order, true), ...children.map(child => serviceGroup(child, false))], transports }
}
