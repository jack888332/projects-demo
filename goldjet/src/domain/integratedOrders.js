// PRD 013 综合订单管理；演示数据均为合成值。篇内未决边界只阻断对应分支，不改写规则。
export const INTEGRATED_NOW = '2026-09-08 14:30'
export const INTEGRATED_DATE = '2026-09-08'
export const INTEGRATED_BUSINESS_TYPES = ['普货', 'BC', 'CC', 'BBC', '其他']
// BBC 的模式按下文 §3.1 的关务服务联动场景取值；与 §5.1“BBC 仅进口”的展示口径差异见 README 待确认项。
export const INTEGRATED_MODES = {
  普货: ['进口', '出口'],
  BC: ['进口', '出口'],
  CC: ['进口'],
  BBC: ['一线进境', '包裹出区', '区间调拨', '区内调拨', '简单加工', '物料进区', '卡板出区', '保税展示', '退供', '退运'],
  其他: ['其他'],
}
export const INTEGRATED_TRANSPORT_MODES = ['空运', '海运', '陆运']
export const INTEGRATED_STATUSES = ['未提交', '待接单', '已接单', '进行中', '已完成', '已拒接', '已取消']
export const INTEGRATED_STATUS_NAV = ['总计', '未提交', '待接单', '进行中', '已完成', '已拒接', '已取消']
export const INTEGRATED_ORG = ['广州航晟物流有限公司', '上海高捷物流有限公司']
export const INTEGRATED_DEPARTMENTS = ['华东业务部', '华南业务部', '空运产品部', '关务部', '仓库部', '运输部', '打板组']
export const INTEGRATED_SERVICE_TYPES = ['我司服务', '客自处理', '委外服务']

export const INTEGRATED_PORTS = ['PVG', 'CAN', 'SZX', 'LAX', 'FRA', 'AMS', 'NRT', 'SIN']
export const INTEGRATED_AIRLINES = ['MU 东方航空', 'CZ 南方航空', 'NH 全日空']
export const INTEGRATED_WAREHOUSES = ['广州保税仓 WH001', '南沙仓 WH002', '航晟中转仓 WH003']
export const INTEGRATED_STATIONS = ['广州货站 GS01', '深圳货站 GS02']
export const INTEGRATED_PRECLEARANCE_SUPPLIERS = ['广州电子口岸管理公司', '广东高捷航运物流有限公司']
export const INTEGRATED_INTERNAL_SUPPLIERS = ['广东高捷', '航晟物流']

const CUSTOMS_ITEMS = {
  clear: { key: 'customsClear', label: '国内清关' },
  declare: { key: 'customsDeclare', label: '国内报关', fields: ['customsDeclare'] },
  exchange: { key: 'customsExchange', label: '换单' },
  inspect: { key: 'customsInspect', label: '查验' },
}

export function customsItems(order) {
  const { businessType, businessMode } = order || {}
  if (businessType === '普货' && businessMode === '进口') return [CUSTOMS_ITEMS.declare, CUSTOMS_ITEMS.exchange, CUSTOMS_ITEMS.inspect]
  if (businessType === '普货' && businessMode === '出口') return [CUSTOMS_ITEMS.declare, CUSTOMS_ITEMS.inspect]
  if (businessType === 'BC') return businessMode === '出口' ? [CUSTOMS_ITEMS.declare] : [CUSTOMS_ITEMS.clear]
  if (businessType === 'CC') return [CUSTOMS_ITEMS.clear]
  if (businessType === 'BBC') return ['一线进境', '包裹出区'].includes(businessMode) ? [CUSTOMS_ITEMS.clear] : [CUSTOMS_ITEMS.declare]
  return [CUSTOMS_ITEMS.declare]
}

export function createServiceRecord(categoryKey, itemKey, houseKey = '') {
  return {
    id: '', category: categoryKey, item: itemKey, houseKey,
    serviceType: '我司服务', supplier: '', department: '', remark: '',
    generated: false, status: '待接单', history: [],
    fields: {},
  }
}

export function createCargoRow(businessType, businessMode) {
  const common = { id: '', chineseName: '', englishName: '', specialCargo: '' }
  if (businessType === 'BC' && businessMode === '出口') return { ...common, hsCode: '', productName: '', specModel: '', quantity: '', grossWeight: '', netWeight: '', originCountry: '' }
  if (businessType === 'BC' && businessMode === '进口') return { ...common, productName: '', specModel: '', batchNo: '', barcode: '', quantity: '', shelfLife: '', productionDate: '', palletSize: '' }
  if (businessType === 'CC') return { ...common, hsCode: '', productName: '', specModel: '', grossWeight: '', netWeight: '', quantity: '', originCountry: '' }
  if (businessType === 'BBC') return { ...common, productId: '', customsCode: '', brand: '', barcode: '', nameSpec: '', quantity: '', grossWeight: '', netWeight: '', originCountry: '' }
  return { ...common, expectedPieces: '', expectedWeight: '', expectedVolume: '' }
}

export function cargoColumns(order) {
  const key = `${order?.businessType || '普货'}|${order?.businessMode || '进口'}`
  const table = {
    '普货|进口': [['chineseName', '中文品名'], ['englishName', '英文品名'], ['specialCargo', '特殊货物'], ['expectedPieces', '预计件数'], ['expectedWeight', '预计毛重（kg）'], ['expectedVolume', '预计体积（m³）']],
    '普货|出口': [['chineseName', '中文品名'], ['englishName', '英文品名'], ['specialCargo', '特殊货物'], ['expectedPieces', '预计件数'], ['expectedWeight', '预计毛重（kg）'], ['expectedVolume', '预计体积（m³）']],
    'BC|出口': [['hsCode', '商品HS编码'], ['productName', '商品名称'], ['specModel', '规格型号'], ['quantity', '数量'], ['grossWeight', '总毛重（kg）'], ['netWeight', '总净重（kg）'], ['originCountry', '原产国代码']],
    'BC|进口': [['productName', '商品名称'], ['specModel', '规格型号'], ['batchNo', '批次号'], ['barcode', '商品条形码'], ['quantity', '数量'], ['shelfLife', '保质期'], ['productionDate', '生产日期'], ['palletSize', '托盘尺寸']],
    'CC|进口': [['hsCode', '商品HS编码'], ['productName', '商品名称'], ['specModel', '规格型号'], ['grossWeight', '总毛重（kg）'], ['netWeight', '总净重（kg）'], ['quantity', '数量'], ['originCountry', '原产国代码']],
    'BBC|一线进境': [['productId', '商品ID'], ['customsCode', '海关编码'], ['brand', '品牌'], ['barcode', '商品条形码'], ['nameSpec', '中文品名及规格'], ['quantity', '数量'], ['grossWeight', '总毛重（kg）'], ['netWeight', '总净重（kg）'], ['originCountry', '原产国']],
  }
  if (table[key]) return table[key]
  if (order?.businessType === 'BBC') return table['BBC|一线进境']
  return table['普货|进口']
}

export function createHouseDraft() {
  return { key: '', houseNo: '', cargo: [], services: [] }
}

export function createIntegratedOrderDraft(order) {
  const base = {
    id: '', businessType: '', businessMode: '', financeOrg: INTEGRATED_ORG[0], department: INTEGRATED_DEPARTMENTS[0],
    serviceClerk: '', salesperson: '', transfer: false, transferOrg: '', transferDepartment: '', originalSalesperson: '',
    remark: '', customerPartnerId: '', customer: '', contactName: '', contactPhone: '', contactEmail: '', customerRemark: '',
    transportMode: '', originPort: '', destinationPort: '', waybillNo: '',
    houses: [createHouseDraft()], attachments: [], services: [], status: '未提交',
    creator: '', createdAt: '', source: '直接建单', orderNo: '', history: [],
  }
  if (!order) return base
  return {
    ...base, ...JSON.parse(JSON.stringify({ ...order, services: undefined, history: undefined })),
    services: order.services || [],
  }
}

// 服务类别与 §3.1 服务项目联动；打板未在联动表中定义条件，暂不开放。
export function servicePlan(order) {
  const type = order?.businessType, mode = order?.businessMode, transport = order?.transportMode
  const trunkItems = []
  if (transport === '陆运') trunkItems.push({ key: 'crossTruck', label: '约中港车', department: '运输部' })
  else {
    trunkItems.push({ key: 'booking', label: '订舱', department: transport === '海运' ? '海运客服部' : '空运产品部', airlineCode: transport !== '海运' })
  }
  const plan = [
    { key: 'trunk', label: '干线服务', items: trunkItems },
    { key: 'warehouse', label: '仓储服务', items: [{ key: 'warehouse', label: '仓储服务', department: '仓库部' }] },
    { key: 'customs', label: '关务服务', items: customsItems(order).map(item => ({ ...item, department: '关务部' })) },
    { key: 'transport', label: '运输服务', items: [{ key: 'transport', label: '运输服务', department: '运输部' }] },
    { key: 'ground', label: '地面操作', items: [
      { key: 'preclearance', label: '预配发送', department: '关务部' },
      { key: 'securityCheck', label: '货物安检', department: '关务部' },
      { key: 'clearanceDelivery', label: '清关派送', department: '关务部' },
    ] },
    { key: 'valueAdded', label: '增值服务', items: [
      { key: 'unpack', label: '拆盒', department: '仓库部' },
      { key: 'labeling', label: '贴标', department: '仓库部' },
      { key: 'otherValue', label: '其他', department: '仓库部', remark: true },
    ] },
  ]
  // 仅干线类别随运输方式收敛；其余类别固定，不强套无关场景。
  return plan.filter(group => group.items.length)
}

export function defaultSupplier(categoryKey, itemKey) {
  if (categoryKey === 'transport') return '航晟物流'
  if (categoryKey === 'ground' && itemKey === 'preclearance') return '广州电子口岸管理公司'
  return '广东高捷'
}

export function isPerHouseCategory(categoryKey) {
  return ['warehouse', 'customs', 'transport', 'ground', 'valueAdded'].includes(categoryKey)
}

export function serviceCategoryLabel(key) {
  return ({ trunk: '干线', warehouse: '仓储', customs: '关务', transport: '运输', ground: '地面操作', valueAdded: '增值服务' })[key] || key
}

const text = value => String(value ?? '').trim()

export function deriveServiceSummary(order, categoryKey) {
  const records = (order?.services || []).filter(record => record.category === categoryKey && record.generated)
  if (!records.length) return ''
  if (records.some(record => record.status === '待接单')) return '待服务'
  if (records.some(record => record.status === '进行中')) return '服务中'
  return '服务完成'
}

export function deriveOrderAutoComplete(order) {
  const records = (order?.services || []).filter(record => record.generated)
  if (!records.length) return false
  return records.every(record => ['已完成', '已终止', '已取消'].includes(record.status))
}

export function createServiceHistory(event, actor, content, time = INTEGRATED_NOW) {
  return { id: `H${time}-${Math.random().toString(36).slice(2, 7)}`, event, actor, content, time }
}

export function validateServiceRecord(record, order) {
  const errors = {}
  if (!INTEGRATED_SERVICE_TYPES.includes(record.serviceType)) errors.serviceType = '请选择服务类型'
  if (!text(record.department)) errors.department = '我司服务须指定部门'
  if (record.serviceType === '委外服务' && !text(record.supplier)) errors.supplier = '委外服务须选择供应商'
  if (record.category === 'trunk' && record.item === 'booking' && order?.transportMode !== '海运' && !text(record.fields?.airlineCode)) errors.airlineCode = '空运订舱须选择航司代码'
  if (record.category === 'warehouse' && !text(record.fields?.warehouseName)) errors.warehouseName = '请选择仓库'
  if (record.category === 'warehouse' && !text(record.fields?.expectedInboundTime)) errors.expectedInboundTime = '请选择预计入仓时间'
  if (record.category === 'customs' && /调拨/.test(order?.businessMode || '')) {
    for (const [key, label] of [['outWarehouse', '出区仓库'], ['outLedger', '转出账册'], ['inWarehouse', '进区仓库'], ['inLedger', '转入账册']]) {
      if (!text(record.fields?.[key])) errors[key] = `请填写${label}`
    }
  }
  if (record.category === 'transport') {
    for (const [key, label] of [['pickupAddress', '提货详细地址'], ['pickupTime', '提货时间'], ['pickupContact', '提货联系人'], ['pickupPhone', '提货联系电话'], ['deliveryAddress', '送货详细地址'], ['deliveryTime', '送货时间'], ['deliveryContact', '送货联系人'], ['deliveryPhone', '送货联系电话']]) {
      if (!text(record.fields?.[key])) errors[key] = `请填写${label}`
    }
  }
  if (record.category === 'ground' && record.item === 'preclearance' && !text(record.fields?.supplier)) errors.preclearanceSupplier = '请选择预配发送供应商'
  if (record.category === 'ground' && record.item === 'securityCheck' && !text(record.fields?.station)) errors.station = '请选择货站'
  if (record.category === 'valueAdded' && record.item === 'otherValue' && !text(record.fields?.goodsName)) errors.goodsName = '其他增值服务须填写服务内容'
  return errors
}

export function validateIntegratedOrderDraft(draft, options = {}) {
  const errors = {}
  const value = draft || {}
  if (!INTEGRATED_BUSINESS_TYPES.includes(value.businessType)) errors.businessType = '请选择业务类型'
  if (value.businessType && !(INTEGRATED_MODES[value.businessType] || []).includes(value.businessMode)) errors.businessMode = '请选择业务模式'
  for (const [key, label] of [['financeOrg', '财务组织'], ['department', '所属部门'], ['salesperson', '业务员'], ['customer', '客户名称'], ['contactName', '联系人姓名'], ['contactPhone', '联系人电话'], ['contactEmail', '联系人邮箱']]) {
    if (!text(value[key])) errors[key] = `${label}为必填项`
  }
  if (value.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value.contactEmail))) errors.contactEmail = '请输入有效的联系人邮箱'
  if (text(value.customerRemark).length > 500) errors.customerRemark = '客户备注最多 500 字'
  if (value.transfer && (!text(value.transferOrg) || !text(value.transferDepartment))) errors.transfer = '选择流转时须填写流转组织和流转部门'
  if (value.transportMode && !INTEGRATED_TRANSPORT_MODES.includes(value.transportMode)) errors.transportMode = '请选择运输方式'
  // §5.1：其他业务的总运单字段全部可空；其余业务在已选择运输方式时要求港口与总运单号。
  if (value.businessType && value.businessType !== '其他' && value.transportMode) {
    if (!text(value.originPort)) errors.originPort = '请选择始发港'
    if (!text(value.destinationPort)) errors.destinationPort = '请选择目的港'
  }
  const houses = value.houses?.length ? value.houses : [createHouseDraft()]
  const columns = cargoColumns(value)
  const requiredCargo = options.submit ? (columns.find(([, label]) => label === '中文品名' || label === '商品名称')?.[0]) : null
  houses.forEach((house, houseIndex) => {
    house.cargo.forEach((row, rowIndex) => {
      if (options.submit && requiredCargo && !text(row[requiredCargo])) errors[`house-${houseIndex}-cargo-${rowIndex}`] = '货物信息：请填写必填品名'
    })
  })
  if (options.submit) {
    for (const record of value.services || []) {
      const recordErrors = validateServiceRecord(record, value)
      if (Object.keys(recordErrors).length) errors[`service-${record.id || record.item}`] = Object.values(recordErrors)[0]
    }
  }
  return errors
}

export function integratedOrderPermissions(order, role) {
  const isSuper = role === 'superAdmin'
  const operator = ['service', 'supervisor', 'business'].includes(role)
  if (isSuper) return { create: false, edit: false, submit: false, accept: false, delete: false, transfer: false, cancel: false, editScope: 'readonly' }
  const status = order?.status || '未提交'
  const created = order && order.creator === WORKBENCH_NAME[role]
  const editableStatus = ['未提交', '待接单', '进行中'].includes(status)
  return {
    create: operator,
    edit: operator && editableStatus && (!order || created || role === 'supervisor'),
    submit: operator && created && status === '未提交',
    accept: ['service', 'supervisor'].includes(role) && status === '待接单',
    delete: operator && created && status === '未提交',
    transfer: operator && ['已接单', '未提交'].includes(status),
    cancel: ['service', 'supervisor'].includes(role) && ['已接单', '进行中'].includes(status),
    editScope: status === '未提交' || status === '待接单' ? 'draft' : status === '进行中' ? 'running' : 'readonly',
  }
}

export const WORKBENCH_NAME = { service: '周倩', supervisor: '周倩', business: '周倩' }

export function formatTons(value, digits = 2) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  return number.toFixed(digits)
}

export function orderNoFor(type, sequence, date = INTEGRATED_DATE) {
  const code = ({ 普货: 'G', BC: 'C', CC: 'C', BBC: 'C', 其他: 'O' })[type] || 'O'
  return `${code}${date.slice(2).replaceAll('-', '')}${String(sequence).padStart(5, '0')}`
}

export function houseNoFor(sequence, date = INTEGRATED_DATE) {
  // 地区代码来源与重复处置待确认，使用明确标识的合成地区码 GJ。
  return `GJ${date.slice(2, 7).replace('-', '')}${String(sequence).padStart(5, '0')}`
}
