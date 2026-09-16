export const DECLARATION_STATUSES = ['单证预审', '报关审结', '报关查验', '放行', '已结关']
export const AIR_DECLARATION_STATUS_BLOCK_REASON = '接单条件、报关状态流转及其与翌飞审结、服务状态的关系待确认，暂不能接单或修改状态。'
export const AIR_DECLARATION_MATERIAL_BLOCK_REASON = '各单证类型的必备材料、上传限制和补齐接收规则待确认，暂不能新增或替换报关材料。'

const text = value => typeof value === 'string' ? value.trim() : ''
const entries = value => Array.isArray(value) ? value : []
const isBlob = value => typeof Blob !== 'undefined' && value instanceof Blob

export function canManageAirDeclarations(session = {}) {
  return session.role === 'customsService'
}

function projectMaterial(attachment, serviceId, index) {
  const source = attachment && typeof attachment === 'object' ? attachment : {}
  const content = isBlob(attachment) ? attachment : source.content ?? source.file ?? null
  const fileName = text(source.fileName) || text(source.name) || text(content?.name)
  return {
    id: text(source.id) || `${serviceId}-MATERIAL-${index + 1}`,
    name: text(source.materialName) || text(source.name) || fileName,
    fileName, content, type: text(source.type) || text(content?.type),
  }
}

export function deriveAirDeclarations(state = {}) {
  const rows = []
  function append(order, child, service) {
    if (!service || service.type !== 'customs') return
    const details = service.details || {}, entity = child || order
    rows.push({
      id: service.id, orderId: order.id, childId: child?.id || '', orderNo: order.orderNo || '',
      housebillNo: child?.housebillNo || '', waybillNo: order.waybillNo || '',
      origin: child?.origin || order.origin || '', destination: child?.destination || order.destination || '',
      customer: entity.customer || order.customer || '', departureDate: order.booking?.departureDate || order.departureDate || '',
      createdAt: service.createdAt || '', customsStatus: service.customsStatus || '单证预审', serviceStatus: service.status || '',
      choice: details.choice || '', documentType: details.documentType || '',
      materials: entries(details.attachments).map((attachment, index) => projectMaterial(attachment, service.id, index)),
      details, creator: entity.creator || '', materialRequests: entries(service.materialRequests),
      exampleLabel: service.declarationExample === 'chapter012' ? '已收指令示例' : '',
      blockReason: AIR_DECLARATION_STATUS_BLOCK_REASON, materialBlockReason: AIR_DECLARATION_MATERIAL_BLOCK_REASON,
      target: { path: `/fulfillment/air-orders/${order.id}/supplement`, query: { customs: service.id, ...(child ? { child: child.id } : {}) } },
    })
  }
  for (const order of entries(state.airOrders)) {
    for (const service of entries(order.services)) append(order, null, service)
    for (const child of entries(state.airChildren).filter(row => row.parentId === order.id)) {
      for (const service of entries(child.serviceRecords)) append(order, child, service)
    }
  }
  return rows.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || String(left.id).localeCompare(String(right.id)))
}

export function filterAirDeclarations(rows, filters = {}) {
  const fuzzy = (value, query) => !text(query) || String(value || '').toLocaleLowerCase().includes(text(query).toLocaleLowerCase())
  const exact = (value, query) => !text(query) || query === '全部' || value === query
  const inRange = (value, range) => {
    if (!Array.isArray(range) || !range.some(Boolean)) return true
    const date = String(value || '').slice(0, 10), [from, to] = range
    return Boolean(date) && (!from || date >= from) && (!to || date <= to)
  }
  return rows.filter(row => fuzzy(row.id, filters.serviceNo) && fuzzy(row.waybillNo, filters.waybillNo)
    && fuzzy(row.customer, filters.customer) && exact(row.origin, filters.origin) && exact(row.destination, filters.destination)
    && inRange(row.departureDate, filters.departure) && inRange(row.createdAt, filters.created) && exact(row.customsStatus, filters.status))
}

export function getAirDeclarationMaterialFile(material) {
  if (!material || !text(material.fileName)) throw new Error('该材料没有可下载的文件')
  const content = material.content
  const blob = isBlob(content) ? content : typeof content === 'string' && content.length
    ? new Blob([content], { type: material.type || 'text/plain;charset=utf-8' }) : null
  if (!blob?.size) throw new Error('该材料没有可下载的文件内容')
  return { name: material.fileName, blob }
}

export function buildAirDeclarationMaterialNotice(row, material) {
  const recipient = text(row?.creator), materialName = text(material?.name)
  if (!recipient) throw new Error('建单客服未确定，暂不能发起补齐通知')
  if (!materialName) throw new Error('材料名称缺失，暂不能发起补齐通知')
  const number = text(row?.childId ? row.housebillNo : row?.orderNo)
  if (!number) throw new Error(`${row?.childId ? '分单号' : '订单号'}缺失，暂不能发起补齐通知`)
  return { recipient, content: `${row.childId ? '分单号' : '订单号'}：${number}的${materialName}有误，请补齐材料。` }
}
