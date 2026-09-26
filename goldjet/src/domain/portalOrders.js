// PRD 015 客户门户订单管理：订单池、小订单处置、需求单、仓库报告确认。
export const PORTAL_NOW = '2026-09-08 14:30'
export const PORTAL_DATE = '2026-09-08'
export const POOL_MARKS = ['集货', '备货']
export const COLLECT_STATUSES = ['待出库', '已出库', '已取消']
export const STOCK_STATUSES = ['待下发', '待拣货', '待打包', '待出库', '已出库', '已取消']
export const INTERCEPT_OPTIONS = ['无', '拦截成功', '拦截失败', '拦截中']
export const SHORTAGE_OPTIONS = ['按实收数量结算', '补齐缺少商品', '退回多余商品', '不再等候缺少商品']
export const REQUIREMENT_SERVICES = [
  { key: 'trunk', label: '干线服务', fields: ['originPort', 'destinationPort', 'expectedArrival'] },
  { key: 'warehouse', label: '仓储服务', fields: ['warehouse'] },
  { key: 'customs', label: '关务服务', fields: [] },
  { key: 'transport', label: '运输服务', fields: ['pickupAddress', 'pickupTime', 'deliveryAddress', 'deliveryTime'] },
  { key: 'security', label: '货站安检', fields: [] },
  { key: 'clearance', label: '清关派送', fields: [] },
  { key: 'valueAdded', label: '增值服务', fields: [] },
]
export const BBC_REQUIREMENT_MODES = ['一线进境', '区间调拨', '区内调拨', '简单加工', '保税展示', '物料进区', '卡板出区', '退运', '其他']
export const CUSTOMS_ZONES = ['南沙海关', '广州白云机场海关', '黄埔海关']
export const PORTAL_WAREHOUSES = ['南沙保税仓 WH002', '广州保税仓 WH001', '航晟中转仓 WH003']

const text = value => String(value ?? '').trim()

export function portalPermissions(role) {
  const operator = ['service', 'supervisor', 'business'].includes(role)
  return {
    // 客户侧动作（订单池标记、需求单、报告确认）在原型中由演示账号代执行。
    pool: operator, smallOrder: operator, requirement: operator, report: operator,
    read: true,
  }
}

export function createRequirementDraft(type = 'BC', mode = '集货') {
  const bbc = type === 'BBC'
  return {
    id: '', orderNo: '', requestType: bbc ? 'BBC需求' : (mode === '集货' ? '小订单需求' : '商品需求'),
    businessType: bbc ? 'BBC' : type, mode: bbc ? '一线进境' : mode, transportMode: bbc ? '航空运输' : '公路运输', customsZone: '南沙海关',
    warehouse: PORTAL_WAREHOUSES[0], originPort: '', destinationPort: '', expectedArrival: '', status: '未提交',
    createdBy: '客户门户', createdAt: '', smallOrderIds: [], goods: [], goodsTitle: '', remark: '', customer: '',
    finalDestinationCountry: '', overseasShipperCode: '', overseasShipperName: '', inboundNo: '',
    services: REQUIREMENT_SERVICES.map(service => ({ key: service.key, label: service.label, selected: service.key === 'customs', fields: {} })),
    attachments: [],
  }
}

export function createRequirementGoodsRow() {
  return { productId: '', barcode: '', name: '', spec: '', quantity: '', unitPrice: '', productionDate: '', expiryDate: '', batchNo: '', palletNo: '' }
}

export function validateRequirementDraft(draft, { submit = false } = {}) {
  const errors = {}
  const value = draft || {}
  if (!text(value.businessType)) errors.businessType = '请选择业务类型'
  if (!text(value.mode)) errors.mode = '请选择业务模式'
  if (!text(value.transportMode)) errors.transportMode = '请选择运输方式'
  if (!text(value.customsZone)) errors.customsZone = '请选择关区'
  if (!text(value.goodsTitle)) errors.goodsTitle = '请填写货物统称'
  if (text(value.goodsTitle).length > 20) errors.goodsTitle = '货物统称最多 20 个中文字'
  if (text(value.remark).length > 100) errors.remark = '备注最多 100 个中文字'
  if (value.businessType === 'BBC') {
    for (const [key, label] of [['warehouse', '仓库名称'], ['finalDestinationCountry', '最终目的国'], ['overseasShipperCode', '境外收发货人代码'], ['overseasShipperName', '境外收发货人名称']]) {
      if (!text(value[key])) errors[key] = `请填写${label}`
    }
  } else if (value.mode === '集货') {
    if (!value.smallOrderIds?.length) errors.smallOrderIds = '集货需求须选择小订单'
    if (submit) {
      for (const [key, label] of [['packagePieces', '件数'], ['packageUnit', '件数单位'], ['packageWeight', '毛重'], ['packageVolume', '体积']]) {
        if (!text(value[key])) errors[key] = `请填写集货包装汇总${label}`
      }
    }
  } else if (submit) {
    if (!value.goods?.length) errors.goods = '备货需求须添加商品'
    value.goods?.forEach((row, index) => {
      if (!text(row.productId)) errors[`goods.${index}.productId`] = '商品ID必填'
      if (!text(row.barcode)) errors[`goods.${index}.barcode`] = '商品条形码必填'
      if (!Number.isInteger(Number(row.quantity)) || Number(row.quantity) <= 0) errors[`goods.${index}.quantity`] = '数量须为正整数'
      if (!text(row.productionDate) || !text(row.expiryDate)) errors[`goods.${index}.date`] = '生产日期与失效日期必填'
    })
  }
  if (submit) {
    const selected = new Set((value.services || []).filter(service => service.selected).map(service => service.key))
    if (!selected.size) errors.services = '请至少选择一项服务'
    if (selected.has('trunk')) {
      if (!text(value.services.find(service => service.key === 'trunk')?.fields?.originPort)) errors.trunkOrigin = '干线服务须填写启运港'
      if (!text(value.services.find(service => service.key === 'trunk')?.fields?.destinationPort)) errors.trunkDestination = '干线服务须填写目的港'
      if (!text(value.services.find(service => service.key === 'trunk')?.fields?.expectedArrival)) errors.trunkArrival = '干线服务须填写预计到港时间'
      if (value.services.find(service => service.key === 'trunk')?.fields?.originPort === value.services.find(service => service.key === 'trunk')?.fields?.destinationPort) errors.trunkDestination = '目的港不能与启运港相同'
    }
    if (selected.has('warehouse') && !text(value.services.find(service => service.key === 'warehouse')?.fields?.warehouse)) errors.serviceWarehouse = '仓储服务须选择仓库'
    if (selected.has('transport')) {
      const fields = value.services.find(service => service.key === 'transport')?.fields || {}
      for (const [key, label] of [['pickupAddress', '提货地址'], ['pickupTime', '提货时间'], ['deliveryAddress', '送货地址'], ['deliveryTime', '送货时间']]) {
        if (!text(fields[key])) errors[`transport.${key}`] = `运输服务须填写${label}`
      }
    }
  }
  return errors
}

export function smallOrderEligibility(order) {
  return {
    updatePallet: order.mode === '集货' && order.warehouseStatus === '待出库',
    unbind: Boolean(order.requirementId),
    bind: !order.requirementId && order.warehouseStatus === '待出库' && !order.customerCancelled,
    convertToStock: order.mode === '集货' && !order.requirementId && order.warehouseStatus === '待出库',
    convertToPickup: order.mode === '备货' && order.warehouseStatus === '待下发' && !order.customerCancelled,
    submitInbound: order.mode === '集货' && !order.customerCancelled && !['已出库', '已取消'].includes(order.warehouseStatus),
    delete: !order.requirementId && order.warehouseStatus !== '已出库',
    cancel: !order.customerCancelled,
    restore: order.customerCancelled && order.warehouseStatus !== '已出库',
    dispatch: order.mode === '备货' && order.warehouseStatus === '待下发' && !order.customerCancelled,
    release: order.mode === '备货' && order.warehouseStatus !== '已出库' && order.warehouseStatus !== '已取消',
  }
}

export function checkStockAvailability(order, stock, remaining) {
  const problems = []
  for (const good of order.goods || []) {
    const entry = stock.find(item => item.warehouse === order.warehouse && item.barcode === good.barcode)
    const available = entry ? (remaining.get(`${order.warehouse}|${good.barcode}`) ?? entry.good) : 0
    if (!entry || available < Number(good.quantity)) problems.push(good.barcode || good.name)
  }
  return problems
}

// 导入校验：订单号不得与订单中心重复、同单公共信息一致、必填完整；任一不通过整份失败。
export function parseImportRows(textValue) {
  const rows = String(textValue || '').split(/\r?\n/).map(row => row.trim()).filter(Boolean)
  const problems = []
  const orders = []
  const register = new Map()
  for (const [index, row] of rows.entries()) {
    const [orderNo, productName, rawQuantity, rawPrice, platform = '', shop = '', productId = ''] = row.split(',').map(cell => cell.trim())
    if (!orderNo || !productName || !rawQuantity || !rawPrice) { problems.push({ orderNo: orderNo || `第 ${index + 1} 行`, reason: '订单号、商品名称、数量、单价为必填' }); continue }
    if (!Number.isInteger(Number(rawQuantity)) || Number(rawQuantity) <= 0) { problems.push({ orderNo, reason: '数量须为正整数' }); continue }
    if (!(Number(rawPrice) > 0)) { problems.push({ orderNo, reason: '单价须为正数' }); continue }
    if (register.has(orderNo)) {
      const existing = register.get(orderNo)
      if (platform && existing.platform && platform !== existing.platform) { problems.push({ orderNo, reason: '同单公共信息不一致' }); continue }
      if (shop && existing.shop && shop !== existing.shop) { problems.push({ orderNo, reason: '同单公共信息不一致' }); continue }
      existing.goods.push({ name: productName, quantity: Number(rawQuantity), unitPrice: Number(rawPrice), productId })
      continue
    }
    const order = { orderNo, platform, shop, goods: [{ name: productName, quantity: Number(rawQuantity), unitPrice: Number(rawPrice), productId }] }
    register.set(orderNo, order)
    orders.push(order)
  }
  return { orders, problems }
}

export function buildPortalFailureCsv(problems) {
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  return '\ufeff' + [['订单号', '问题'], ...problems.map(row => [row.orderNo, row.reason])].map(line => line.map(escape).join(',')).join('\r\n')
}

export function tallyIssues(batch) {
  const issues = []
  for (const detail of batch?.details || []) {
    if (detail.tallyStatus === '异常' && !text(detail.handling)) issues.push(detail.id)
  }
  return issues
}
