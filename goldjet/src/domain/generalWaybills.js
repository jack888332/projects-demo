// PRD 014 综合总运单与分单资料；计费重沿用 max(毛重, 体积 × 166.66) 保留两位。
import { INTEGRATED_PORTS } from './integratedOrders.js'

export const WB_DECLARATION_TYPES = ['普货', '跨境电商']
export const WB_IMPORT_EXPORT = ['进口', '出口']
export const WB_TRANSPORT_TOOLS = ['飞机', '汽车', '船舶']
export const WB_CONTAINER_SPECS = ['1x20GP', '1x40GP', '1x40HQ', '1x45HQ', '1x20RF']
export const WB_BOX_SIZES = ['60×40×40', '80×60×60', '100×80×80']
export const WB_CONTAINER_TYPES = ['散货', '整柜', '拼箱']
export const WB_SPECIAL_CARGO = ['锂电池', '危险品', '生鲜', '机械']
export const WB_ATTRIBUTES = ['采购单', '销售单']
export const WB_IATA_CARRIERS = [
  { iata: 'MU', carrier: 'MU 东方航空' },
  { iata: 'CZ', carrier: 'CZ 南方航空' },
  { iata: 'NH', carrier: 'NH 全日空' },
]

const text = value => String(value ?? '').trim()
const copy = value => JSON.parse(JSON.stringify(value))

export function transportToolFor(transportMode) {
  return ({ 空运: '飞机', 海运: '船舶', 陆运: '汽车' })[transportMode] || '飞机'
}

export function declarationTypeFor(order) {
  return ['BC', 'CC', 'BBC'].includes(order?.businessType) ? '跨境电商' : '普货'
}

export function createGeneralWaybillDraft(waybill) {
  const base = {
    id: '', waybillNo: '', declarationType: '', importExportFlag: '', transportTool: '飞机',
    originPort: '', destinationPort: '', eta: '', etd: '', flightNo: '',
    firstDestination: '', secondDestination: '', thirdDestination: '',
    chineseName: '', englishName: '', specialCargo: '', expectedPieces: '', expectedWeight: '', expectedVolume: '',
    containers: [], billFields: createBillFields(), ecommerce: createEcommerceFields(),
    status: '有效', createdBy: '', createdAt: '', sourceOrderId: '', houses: [],
  }
  if (!waybill) return base
  return { ...base, ...copy(waybill), billFields: { ...base.billFields, ...(waybill.billFields || {}) }, ecommerce: { ...base.ecommerce, ...(waybill.ecommerce || {}), attachments: waybill.ecommerce?.attachments || [] } }
}

export function createBillFields() {
  return {
    waybillNo: '', importExportFlag: '', code: '', shipper: '', consignee: '', marks: '',
    customsDeclaredValue: '', iataCode: '', issuingCarrier: '', issueDate: '', randomDocs: '',
    handlingInformation: '', attribute: '销售单', purchaseOrderNo: '', salesOrderNo: '', invoiceNo: '',
  }
}

export function createEcommerceFields() {
  return {
    importExportPortCode: '', customsDeclarationCode: '', supervisedPlaceCode: '', countryRegionCode: '', countryRegionName: '',
    portCode: '', arrivalDate: '', totalPackageNo: '', houseBillCount: '', totalGrossWeight: '', chargeableWeight: '',
    palletCount: '', reinforcedPalletCount: '', palletizedPalletCount: '', cartonCount: '', volume: '',
    boxSize: '', containerType: '', attachments: [],
  }
}

export function createContainerRow() {
  return { serial: 0, containerNo: '', containerSpec: '' }
}

export function createHouseBillDraft(house) {
  const base = {
    id: '', houseNo: '', originPort: '', firstDestination: '', secondDestination: '', thirdDestination: '',
    chineseName: '', englishName: '', handlingInformation: '', marks: '', warehouseRequirement: '',
    shipper: '', consignee: '', expectedPieces: '', expectedWeight: '', expectedVolume: '',
    status: '有效', inbound: null, billMeasured: null, voidedBy: '', voidedAt: '',
  }
  return house ? { ...base, ...copy(house) } : base
}

export function calculateHouseChargeWeight(house) {
  const toNumber = value => text(value) === '' ? NaN : Number(value)
  const weight = toNumber(house?.expectedWeight)
  const volume = toNumber(house?.expectedVolume)
  const byVolume = Number.isFinite(volume) ? volume * 166.66 : NaN
  const candidates = [weight, byVolume].filter(Number.isFinite)
  if (!candidates.length) return ''
  return Math.max(...candidates).toFixed(2)
}

// 从综合订单补录时带入订单资料；订单没有的值保持为空，不套用手工默认值。
export function createWaybillDraftFromOrder(order) {
  const draft = createGeneralWaybillDraft()
  const cargo = (order?.houses || []).flatMap(house => house.cargo || [])[0] || {}
  draft.declarationType = declarationTypeFor(order)
  draft.importExportFlag = order?.businessMode === '出口' ? '出口' : '进口'
  draft.transportTool = transportToolFor(order?.transportMode)
  draft.originPort = order?.originPort || ''
  draft.destinationPort = order?.destinationPort || ''
  draft.firstDestination = order?.destinationPort || ''
  draft.flightNo = order?.flightNo || ''
  draft.chineseName = cargo.chineseName || cargo.productName || ''
  draft.englishName = cargo.englishName || ''
  draft.specialCargo = cargo.specialCargo || ''
  draft.sourceOrderId = order?.id || ''
  const houses = (order?.houses || []).filter(house => house.houseNo || house.cargo?.length)
  draft.houses = houses.map(house => {
    const row = (house.cargo || [])[0] || {}
    const sum = key => (house.cargo || []).reduce((total, item) => total + (Number(item[key]) || 0), 0)
    return createHouseBillDraft({
      houseNo: house.houseNo || '', originPort: draft.originPort, firstDestination: draft.firstDestination,
      chineseName: row.chineseName || row.productName || '', englishName: row.englishName || '',
      expectedPieces: sum('expectedPieces') || sum('quantity') || '', expectedWeight: sum('expectedWeight') || sum('grossWeight') || '', expectedVolume: sum('expectedVolume') || '',
    })
  })
  if (draft.declarationType === '普货') {
    draft.expectedPieces = draft.houses.reduce((total, house) => total + (Number(house.expectedPieces) || 0), 0) || ''
    draft.expectedWeight = draft.houses.length ? draft.houses.reduce((total, house) => total + (Number(house.expectedWeight) || 0), 0) : ''
    draft.expectedVolume = draft.houses.length ? draft.houses.reduce((total, house) => total + (Number(house.expectedVolume) || 0), 0) : ''
    if (!houses.length) {
      draft.expectedPieces = cargo.expectedPieces || ''
      draft.expectedWeight = cargo.expectedWeight || ''
      draft.expectedVolume = cargo.expectedVolume || ''
    }
  } else {
    draft.ecommerce.totalGrossWeight = cargo.grossWeight || ''
    draft.ecommerce.volume = cargo.expectedVolume || ''
  }
  draft.billFields.waybillNo = order?.waybillNo || ''
  return draft
}

export function validateGeneralWaybillDraft(draft, { submit = false } = {}) {
  const errors = {}
  const value = draft || {}
  if (!WB_DECLARATION_TYPES.includes(value.declarationType)) errors.declarationType = '请选择申报类型'
  if (submit) {
    if (!text(value.transportTool)) errors.transportTool = '请选择运输工具'
    if (value.declarationType === '普货') {
      for (const [key, label] of [['originPort', '始发港代码'], ['destinationPort', '目的港代码'], ['eta', '预计到货时间'], ['etd', '预计出港时间'], ['chineseName', '中文品名'], ['expectedPieces', '预计件数'], ['expectedWeight', '预计毛重'], ['expectedVolume', '预计体积']]) {
        if (!text(value[key])) errors[key] = `请填写${label}`
      }
    }
    if (value.declarationType === '跨境电商') {
      for (const [key, label] of [['waybillNo', '总运单号'], ['importExportFlag', '进出口标志'], ['supervisedPlaceCode', '监管场所代码'], ['portCode', '港口代码'], ['chineseName', '中文品名']]) {
        if (!text(value[key])) errors[key] = `请填写${label}`
      }
    }
    if (value.declarationType === '普货') {
      for (const [key, label] of [['waybillNo', '提单号'], ['importExportFlag', '进出口标志'], ['shipper', '发货人'], ['consignee', '收货人']]) {
        if (!text(value.billFields?.[key])) errors[`billFields.${key}`] = `请填写${label}`
      }
    }
  }
  return errors
}

export function validateHouseBillDraft(draft) {
  const errors = {}
  const value = draft || {}
  for (const [key, label] of [['originPort', '始发港'], ['firstDestination', '头程目的地'], ['chineseName', '中文品名'], ['expectedPieces', '预计件数'], ['expectedWeight', '预计毛重'], ['expectedVolume', '预计体积']]) {
    if (!text(value[key])) errors[key] = `请填写${label}`
  }
  for (const [key, label] of [['expectedPieces', '预计件数']]) {
    if (text(value[key]) && !Number.isInteger(Number(value[key]))) errors[key] = `${label}须为整数`
  }
  for (const [key, label] of [['expectedWeight', '预计毛重'], ['expectedVolume', '预计体积']]) {
    if (text(value[key]) && (!/^\d+(?:\.\d{1,2})?$/.test(String(value[key])) || Number(value[key]) <= 0)) errors[key] = `${label}须为正数且最多两位小数`
  }
  return errors
}

export function waybillPermissions(waybill, role) {
  const operator = ['service', 'supervisor', 'business'].includes(role)
  const status = waybill?.status || '有效'
  return {
    create: operator,
    edit: operator && status === '有效',
    void: operator && status === '有效',
    manageHouses: operator && status === '有效' && waybill?.declarationType === '普货',
    read: true,
  }
}

export function houseBillPermissions(waybill, house, role) {
  const operator = ['service', 'supervisor', 'business'].includes(role)
  return {
    create: operator && waybill?.status === '有效' && waybill?.declarationType === '普货',
    edit: operator && waybill?.status === '有效' && house?.status !== '已作废',
    void: operator && waybill?.status === '有效' && house?.status !== '已作废',
  }
}

export function waybillPortOptions() {
  return INTEGRATED_PORTS
}
