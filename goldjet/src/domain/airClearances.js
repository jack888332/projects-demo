import { projectAirServiceMaterial } from './airServiceMaterials.js'

export const CLEARANCE_ORDER_STATUSES = ['待订舱', '待补录', '待出提单', '已出提单', '已交单', '待审核', '已作废', '异常作废']
export const CLEARANCE_SERVICE_STATUSES = ['待服务', '服务中', '服务已完成', '异常结束', '服务已取消']
export const CLEARANCE_RESULT_BLOCK_REASON = '服务完成节点与分批剩余数量口径待确认，暂不能保存提货或送达结果。'
export const CLEARANCE_PDF_BLOCK_REASON = '航司模板的选用与业务输出规则待确认，暂不能生成提单、分单、舱单 PDF。'
export const CLEARANCE_LIST_FIELDS = [
  ['cargoStatus', '货物状态', 115], ['origin', '始发港', 85], ['destination', '目的港', 85],
  ['flight', '头程航班号', 120], ['secondDestination', '二程目的地', 110], ['thirdDestination', '三程目的地', 110],
  ['departureDate', '出港日期', 115], ['goodsName', '品名', 160], ['creator', '客服', 100],
  ['customer', '客户', 150], ['remark', '备注', 220], ['createdAt', '建单日期', 165],
]
export const CLEARANCE_CARGO_FIELDS = [['pieces', '件数（件）'], ['grossWeight', '重量（kg）'], ['volume', '体积（m³）']]
const entries = value => Array.isArray(value) ? value : []
const text = value => typeof value === 'string' ? value.trim() : ''
const cargo = source => Object.fromEntries(CLEARANCE_CARGO_FIELDS.map(([key]) => [key, source?.[key] ?? null]))

export const canManageAirClearances = session => session?.role === 'overseasService' && Boolean(text(session.name))

export function airClearanceSources(state = {}) {
  return [
    ...entries(state.airOrders).flatMap(order => entries(order.services).map(service => ({ order, child: null, service }))),
    ...entries(state.airChildren).flatMap(child => entries(child.serviceRecords).map(service => ({
      order: entries(state.airOrders).find(order => order.id === child.parentId) || null, child, service,
    }))),
  ].filter(({ service }) => service?.type === 'clearance')
}

function acceptanceRestriction({ order, child, service }) {
  if (service.acceptance) return '已记录接单；重复接单或改派规则待确认'
  if (service.deleted || !['待服务', '服务中'].includes(service.status)) return '当前服务不是活动指令，接单资格待确认'
  if (!order && child) return '分单未关联有效主订单，接单资格待确认'
  if ([order, child].some(entity => entity && (entity.deleted || ['已取消', '已作废', '已废除', '异常作废'].includes(entity.orderStatus)))) return '来源订单已取消、作废或删除，不能接单'
  return ''
}

export function deriveAirClearances(state = {}) {
  return airClearanceSources(state).map(source => {
    const { order, child, service } = source, entity = child || order, details = service.details || {}
    const warehouse = entity.warehouse || entries(state.warehouseOrders).find(row => row.airOrderId === entity.id || row.sourceOrderId === entity.id)
    // A child's measured cargo never falls back to its parent's full shipment or estimated cargo.
    return {
      id: service.id, orderId: order?.id || '', childId: child?.id || '',
      orderNo: entity.orderNo || entity.id, mainOrderNo: order?.orderNo || '', housebillNo: child?.housebillNo || '',
      waybillNo: order?.waybillNo || details.waybillNo || '', customer: entity.customer || '', creator: entity.creator || '',
      origin: entity.origin || order?.origin || '', destination: entity.destination || '',
      warehouseCargo: cargo(warehouse), waybillCargo: cargo(entity.waybill),
      cargoStatus: entity.cargoStatus || '', orderStatus: entity.orderStatus || '', serviceStatus: service.status || '',
      flight: order?.booking?.flight || order?.flight || '', secondDestination: order?.booking?.secondDestination || '',
      thirdDestination: order?.booking?.thirdDestination || '', departureDate: order?.booking?.departureDate || details.departureDate || '',
      goodsName: entity.goodsName || entity.englishGoodsName || entity.supplement?.englishGoodsName || '',
      remark: details.remark || '', createdAt: entity.createdAt || entity.createDate || '', instructionAt: service.createdAt || '',
      details, acceptance: service.acceptance || null, acceptanceBlockReason: acceptanceRestriction(source),
      materials: entries(details.attachments).map((file, index) => projectAirServiceMaterial(file, service.id, index)),
    }
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || String(a.id).localeCompare(String(b.id)))
}

export function filterAirClearances(rows, filters = {}) {
  const fuzzy = (value, query) => !text(query) || String(value || '').toLocaleLowerCase().includes(text(query).toLocaleLowerCase())
  const exact = (value, query) => !text(query) || query === '全部' || value === query
  const inRange = (value, range) => {
    if (!Array.isArray(range) || !range.some(Boolean)) return true
    const date = String(value || '').slice(0, 10), [from, to] = range
    return Boolean(date) && (!from || date >= from) && (!to || date <= to)
  }
  return rows.filter(row => [row.orderNo, row.mainOrderNo, row.housebillNo, row.waybillNo].some(value => fuzzy(value, filters.number))
    && fuzzy(row.customer, filters.customer) && exact(row.origin, filters.origin) && exact(row.destination, filters.destination)
    && exact(row.orderStatus, filters.orderStatus) && exact(row.serviceStatus, filters.serviceStatus)
    && inRange(row.createdAt, filters.created) && inRange(row.departureDate, filters.departure))
}

export function clearanceOperationTime(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
