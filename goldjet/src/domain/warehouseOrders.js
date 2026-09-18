export const WAREHOUSE_STATUSES = ['待入库', '已入库', '待出库', '部分出库', '已出库', '已取消']
export const WAREHOUSE_BUSINESS_TYPES = ['出口空运', '进口空运', '出口海运', '跨境陆运', '陆运']
export const WAREHOUSE_DATE = '2026-09-08'
export const WAREHOUSE_FIELDS = [
  ['customerOrderNo', '客户订单号', 'text', '委托信息'],
  ['customer', '客户', 'customer', '委托信息'],
  ['contact', '客户联系人', 'text', '委托信息', 50, 2],
  ['phone', '联系电话', 'text', '委托信息', 20, 8],
  ['businessType', '业务类型', 'business', '委托信息'],
  ['expectedWeight', '委托重量（kg）', 'decimal', '委托货物'],
  ['expectedPieces', '委托数量（件）', 'integer', '委托货物'],
  ['expectedVolume', '委托体积（m³）', 'decimal', '委托货物'],
  ['goodsName', '委托中文品名', 'text', '委托货物', 40, 2],
  ['grossWeight', '实际总重量（kg）', 'decimal', '实际货物'],
  ['pieces', '实际总数量（件）', 'integer', '实际货物'],
  ['volume', '实际总体积（m³）', 'decimal', '实际货物'],
  ['volumeWeight', '实际体积重', 'decimal', '实际货物'],
  ['length', '尺寸长度（cm）', 'dimension', '实际货物'],
  ['width', '尺寸宽度（cm）', 'dimension', '实际货物'],
  ['height', '尺寸高度（cm）', 'dimension', '实际货物'],
  ['documents', '随货资料', 'documents', '仓库服务'],
  ['weightTo', '加重到（kg）', 'decimal', '仓库服务'],
  ['palletize', '打托（托）', 'integer', '仓库服务'],
  ['depalletize', '拆托（托）', 'integer', '仓库服务'],
  ['sort', '分拣（次）', 'integer', '仓库服务'],
  ['relabel', '改标签（个）', 'integer', '仓库服务'],
  ['weighing', '我司过磅', 'yesno', '仓库服务'],
  ['transfer', '我司转仓', 'yesno', '仓库服务'],
  ['labeling', '我司贴标签', 'yesno', '仓库服务'],
  ['warehouse', '仓库名称', 'text', '仓库信息', 40, 2],
  ['location', '库位', 'text', '仓库信息', 40, 2],
  ['damage', '货损情况', 'text', '仓库信息', 120, 2],
  ['remark', '备注', 'textarea', '仓库信息', 500, 2],
]
export const WAREHOUSE_SERVICES = [
  ['palletize', '打托', '托'], ['weightTo', '加重', 'kg'], ['depalletize', '拆托', '托'], ['sort', '分拣', '次'], ['relabel', '改标签', '个'],
]
export const WAREHOUSE_COLUMNS = [
  ['customer', '客户', 230], ['inboundNo', '入仓号', 185], ['waybillNo', '提单号', 150],
  ['pieces', '实际件数', 100], ['grossWeight', '实际重量（kg）', 135], ['volume', '实际体积（m³）', 140],
  ['weighing', '我司过磅', 100], ['transfer', '我司转仓', 100], ['labeling', '我司贴标签', 110],
  ['createdAt', '订单创建时间', 165], ['documentAt', '单证上传时间', 165], ['inboundAt', '入库时间', 165],
  ['clearanceAt', '报关审结时间', 165], ['outboundAt', '出库时间', 165], ['remark', '备注', 200],
]
export const PALLET_COLUMNS = [
  ['number', '托盘号', 190], ['status', '状态', 100], ['inPieces', '入库件数', 100], ['inVolume', '入库体积（m³）', 135], ['inWeight', '入库毛重（kg）', 135], ['inboundAt', '入库时间', 165],
  ['outPieces', '出库件数', 100], ['outVolume', '出库体积（m³）', 135], ['outWeight', '出库毛重（kg）', 135], ['outboundAt', '最新出库时间', 165], ['driver', '司机姓名', 120], ['plate', '车牌号', 120], ['seal', '封条号', 160],
]
export const warehouseDraft = (row = {}) => Object.fromEntries(WAREHOUSE_FIELDS.map(([key]) => [key, row[key] ?? '']))
export const warehousePermissions = (persona, row) => ({
  create: ['service', 'supervisor', 'hangsheng', 'groundSupervisor'].includes(persona),
  edit: ['warehouseService', 'warehouseSupervisor'].includes(persona) && ['待入库', '已入库', '部分出库'].includes(row?.status),
  services: ['warehouseService', 'warehouseSupervisor'].includes(persona) && ['待入库', '已入库', '待出库', '部分出库'].includes(row?.status),
  simulate: ['warehouseService', 'warehouseSupervisor'].includes(persona),
  report: ['warehouseSupervisor', 'superAdmin'].includes(persona),
})
export function warehouseCustomers(state, persona) {
  return state.partners.filter(row => row.type === '客户' && row.status !== '已删除'
    && (!['hangsheng', 'groundSupervisor'].includes(persona) || state.groundCustomerPartnerIds.includes(row.id)))
}
export function warehouseErrors(draft, orders, customers, existing) {
  const errors = {}
  if (!draft.customer || (draft.customer !== existing?.customer && !customers.some(row => row.name === draft.customer))) errors.customer = '请选择可见客户档案'
  if (!WAREHOUSE_BUSINESS_TYPES.includes(draft.businessType)) errors.businessType = '请选择业务类型'
  if (draft.customerOrderNo && orders.some(row => row.id !== existing?.id && row.customerOrderNo === String(draft.customerOrderNo).trim())) errors.customerOrderNo = '客户订单号已存在'
  for (const [key, label, type, , max, min] of WAREHOUSE_FIELDS) {
    const value = String(draft[key] ?? '').trim()
    if (!value) continue
    if (max && (value.length < min || value.length > max)) errors[key] = `${label}须为${min}～${max}个字符`
    if (type === 'integer' && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || value.length > 10)) errors[key] = `${label}须为正整数，最多10位`
    if (type === 'decimal' && (!/^-?\d+(\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || value.length > 10)) errors[key] = `${label}最多2位小数，总长度不超过10`
    if (type === 'dimension' && (!/^\d+(\.\d+)?$/.test(value) || value.length > 10)) errors[key] = `${label}须为数字，总长度不超过10`
    const choices = type === 'yesno' ? ['是', '否'] : type === 'documents' ? ['有', '无'] : null
    if (choices && !choices.includes(value)) errors[key] = `请选择${label}`
  }
  return errors
}
export function warehouseRows(state) {
  return state.warehouseOrders.map(row => ({ ...row,
    documentAt: state.groundServiceRecords.filter(record => record.operation === 'document' && record.warehouseId === row.id).map(record => record.updatedAt).sort().at(-1) || '',
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}
export function warehouseHistory(state, order) {
  const scans = state.groundServiceRecords.filter(row => row.operation === 'document' && row.warehouseId === order.id)
    .flatMap(row => row.history.map((event, index) => ({ id: `${row.id}-${index}`, event: '单证上传', remark: event.remark, actor: event.actorId, time: event.time })))
  return [...(order.history || []), ...scans].sort((a, b) => a.time.localeCompare(b.time))
}
export function warehousePallets(state) {
  return state.warehouseOrders.flatMap(order => (order.pallets || []).map(pallet => ({ ...pallet, orderId: order.id, inboundNo: order.inboundNo, customer: order.customer,
    outImages: [...(pallet.outImages || []), ...state.groundServiceRecords.filter(row => row.operation === 'outbound' && row.warehouseId === order.id && row.number === pallet.number).flatMap(row => row.images)],
  }))).sort((a, b) => a.inboundAt.localeCompare(b.inboundAt))
}
export const warehouseSelectedSummary = rows => ({ count: rows.length, ...Object.fromEntries(['expectedPieces', 'expectedWeight', 'expectedVolume'].map(key => [key, rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0)])) })
