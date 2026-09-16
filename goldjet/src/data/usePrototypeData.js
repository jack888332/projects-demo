import { computed, reactive, watch } from 'vue'
import { WORKBENCH_PERSONAS, WORKBENCH_PRODUCT_ASSIGNEES, deriveWorkbenchTasks, getWorkbenchSummary } from '../domain/workbenchTasks.js'
import { initializePartnerState, createPartnerActions } from './partnerActions.js'
import { createAirMasterActions } from './airMasterActions.js'
import { createAirMasterSeed, deriveAirCatalog } from '../domain/airMasterData.js'
import { calculateChargeWeight } from '../domain/chargeWeight.js'
import { WAREHOUSE_FLOW } from '../domain/workflows.js'
import {
  createAirDraft, createBookingDraft, validateAirDraft,
} from '../domain/airOperations.js'
import {
  GROUND_NOW, GROUND_PLATE_PRESETS, createDispatchDraft, createGroundWaybill,
  deriveGroundOrderStatus, validateBatchGroundOrders, validateDispatchDraft, validateGroundStatusChange,
} from '../domain/groundOperations.js'
import { createFleetSeed } from '../domain/fleetOperations.js'
import { createFleetActions } from './fleetActions.js'
import { createTransportQuoteSeed } from '../domain/transportQuotes.js'
import { createTransportQuoteActions } from './transportQuoteActions.js'
import { createWarehouseQuoteSeed } from '../domain/warehouseQuotes.js'
import { createWarehouseQuoteActions } from './warehouseQuoteActions.js'
import { createAirSupplierRateSeed, createFinanceCostItemSeed } from '../domain/airSupplierRates.js'
import { createAirSupplierRateActions } from './airSupplierRateActions.js'
import { createCapacitySeed } from '../domain/airCapacity.js'
import { createCapacityActions } from './airCapacityActions.js'
import { createAirPalletActions } from './airPalletActions.js'
import { createAirOrderSupplementActions } from './airOrderSupplementActions.js'
import { createAirOrderActions, appendAirNotification } from './airOrderActions.js'
import { createAirChildOrderActions } from './airChildOrderActions.js'
import { createAirServiceActions } from './airServiceActions.js'
import { createAirBookingActions } from './airBookingActions.js'
import { createAirWaybillActions } from './airWaybillActions.js'
import { createAirWaybillTemplateActions } from './airWaybillTemplateActions.js'

const clone = (value) => JSON.parse(JSON.stringify(value))

function seedAirOrder(values) {
  const draft = { ...createAirDraft(), product: 'MU-GENERAL', sellRate: 28, foamRatio: 0.5, ...values }
  const submitted = values.bookingStatus !== '待服务'
  const booking = createBookingDraft(submitted ? { departureDate: values.departureDate, booking: {
    airline: '东方航空', flight: 'MU9001', firstDestination: 'CAN', firstLeg: 'PVG - CAN',
    takeoffTime: '20:00', cutoffTime: '16:00', airCost: values.bookingStatus === '待审核' ? 30 : 24,
    guidePrice: 28, waybillType: '自营', secondLeg: 'CAN - NRT', secondDestination: 'NRT',
    thirdLeg: `NRT - ${values.destination}`, palletCompany: 'MU 货站打板', routeType: '国内中转',
    allowLoss: values.bookingStatus === '待审核',
  } } : { departureDate: values.departureDate })
  return {
    ...draft, orderNo: `GJ-${values.id}`, childNo: '01', childCount: 1, businessType: '空运出口',
    creator: values.creator || values.owner, createDate: '2026-09-08', createdAt: '2026-09-08 09:00',
    assignees: { ...WORKBENCH_PRODUCT_ASSIGNEES[draft.product] },
    bookingConfirmedAt: submitted ? '2026-09-08 10:00' : '',
    bookingCompletedAt: values.orderStatus === '待补录' ? '2026-09-08 11:00' : '',
    approval: values.orderStatus === '待审核' ? { status: '待审核', createdAt: '2026-09-08 10:00', lossAmount: Math.abs((28 - 30 - 0.3) * calculateChargeWeight(values.grossWeight, values.volume)) } : null,
    expectedDepartureDate: values.departureDate, departureDate: submitted ? values.departureDate : '',
    route: `${values.origin} - ${values.destination}`, chargeWeight: calculateChargeWeight(values.grossWeight, values.volume),
    supplier: booking.airline, flight: booking.flight, waybillNo: submitted ? `781-9000${values.id.slice(-3)}0` : '', booking,
    services: [
      { id: `${values.id}-BOOKING`, type: 'booking', name: '订舱', status: values.bookingStatus },
      { id: `${values.id}-WAREHOUSE`, type: 'warehouse', name: '仓储', status: '待服务' },
    ],
  }
}

function seedGroundData() {
  const point = (province, city, district, address, contact, phone) => ({ province, city, district, address, contact, phone })
  const pudong = point('上海市', '上海市', '浦东新区', '浦东机场演示货站 A 区', '提货联系人甲', '000-00002001')
  const kunshan = point('江苏省', '苏州市', '昆山市', '昆山演示中转仓 1 号门', '送货联系人甲', '000-00003001')
  const orders = [
    { id: 'CAR-260908-021', customer: '启航跨境贸易', customerOrderNo: 'QH-DEMO-0921', childNo: 'HAWB-DEMO-021', batchNo: 'BATCH-DEMO-01', vehicleType: '10T/9.6', pieces: 310, weight: 6200, volume: 24, length: 80, width: 60, height: 55, pickupPoints: [pudong], deliveryPoints: [kunshan], pickupTime: '2026-09-08 16:00', deliveryTime: '2026-09-08 19:00', remark: '电子配件；两个同路线订单可合批演示。' },
    { id: 'CAR-260908-022', customer: '云帆供应链', customerOrderNo: 'YF-DEMO-0922', childNo: '', batchNo: 'BATCH-DEMO-02', vehicleType: '3T/4.2', pieces: 90, weight: 1800, volume: 8, length: 60, width: 40, height: 40, pickupPoints: [pudong, point('上海市', '上海市', '浦东新区', '机场演示物流园 B 区', '提货联系人乙', '000-00002002')], deliveryPoints: [kunshan], pickupTime: '2026-09-08 17:30', deliveryTime: '2026-09-08 20:00', remark: '两处提货点；同省市可批量调度。' },
    { id: 'CAR-260908-023', customer: '远洲电子商务', customerOrderNo: 'YZ-DEMO-0923', childNo: 'HAWB-DEMO-023', batchNo: '', vehicleType: '8T/7.6', pieces: 205, weight: 4100, volume: 18, length: null, width: null, height: null, pickupPoints: [pudong], deliveryPoints: [point('江苏省', '苏州市', '太仓市', '太仓演示仓库 2 号门', '送货联系人乙', '000-00003002')], pickupTime: '2026-09-08 15:20', deliveryTime: '2026-09-08 18:20', remark: '已调度演示订单，可从运单页面更新运输节点。' },
    { id: 'CAR-260908-024', customer: '华越国际商贸', customerOrderNo: 'HY-DEMO-0924', childNo: '', batchNo: '', vehicleType: '3T/4.2', pieces: 80, weight: 1600, volume: 7, length: 70, width: 50, height: 50, pickupPoints: [point('上海市', '上海市', '浦东新区', '外高桥演示仓库', '提货联系人丙', '000-00002003')], deliveryPoints: [kunshan], pickupTime: '2026-09-09 09:00', deliveryTime: '2026-09-09 12:00', specialVehicle: '冷藏车', tailLift: '是', regulated: '否', remark: '有特殊车型要求，与普通订单合批需二次确认。' },
  ].map((value, index) => ({
    orderNo: `GJ-${value.id}`, customerContact: `业务联系人${index + 1}`, customerPhone: `000-0000400${index + 1}`, customerEmail: `ground${index + 1}@example.invalid`,
    source: '航晟手工创建', businessType: '陆运', orderType: '', specialVehicle: '', tailLift: '否', regulated: '否',
    dispatchStatus: '未调度', createDate: '2026-09-08', createdAt: `2026-09-08 0${8 + Math.floor(index / 2)}:${index % 2 ? '30' : '00'}`, updatedAt: `2026-09-08 1${index}:00`,
    ...value,
    pickup: value.pickupPoints.map(item => `${item.province}${item.city === item.province ? '' : item.city}${item.district}${item.address}`).join('；'),
    delivery: value.deliveryPoints.map(item => `${item.province}${item.city === item.province ? '' : item.city}${item.district}${item.address}`).join('；'),
    requiredAt: value.pickupTime,
  }))
  const seedDispatch = { ...createDispatchDraft(), ...clone(GROUND_PLATE_PRESETS[0]), vehicleType: '8T/7.6', supplier: '申捷车队', companyAddress: '上海市浦东新区演示路 18 号', remark: '已完成调度，等待前往提货。' }
  const waybill = createGroundWaybill(orders[2], seedDispatch, { serial: 1, vehicleCount: 1, actor: '陈楠', time: '2026-09-08 12:05' })
  orders[2].dispatchStatus = deriveGroundOrderStatus([waybill])
  return { groundOrders: orders, groundWaybills: [waybill], groundPlateHistory: clone(GROUND_PLATE_PRESETS), groundSequence: 1 }
}

function createSeed() {
  return initializePartnerState({
    airMaster: createAirMasterSeed(),
    airMasterSequence: 0,
    transportQuotes: createTransportQuoteSeed(),
    transportQuoteSequence: 2,
    warehouseQuotes: createWarehouseQuoteSeed(),
    warehouseQuoteSequence: 4,
    airSupplierRates: createAirSupplierRateSeed(),
    airSupplierRateSequence: 6,
    financeCostItems: createFinanceCostItemSeed(),
    capacityProducts: createCapacitySeed(),
    capacitySequence: 1,
    palletAllocations: [],
    palletSequence: 0,
    airChildren: [],
    airWaybillContacts: [],
    airWaybillContactSequence: 0,
    airWaybillClockMs: Date.UTC(2026, 8, 8, 14, 30),
    airWaybillTemplates: [],
    airWaybillTemplateSequence: 0,
    airOrderSequence: 25,
    airChildSequence: 0,
    airOrderEventSequence: 0,
    airOrders: [
      seedAirOrder({ id: 'AIR-260908-001', customer: '启航跨境贸易', owner: '周倩', origin: 'PVG', destination: 'LAX', grossWeight: 186.5, volume: 1.28, pieces: 42, departureDate: '2026-09-10', orderStatus: '待补录', bookingStatus: '服务已完成', bookingRequirement: '优先晚班' }),
      seedAirOrder({ id: 'AIR-260908-002', customer: '云帆供应链', owner: '陈楠', origin: 'SZX', destination: 'FRA', grossWeight: 320, volume: 1.4, pieces: 68, departureDate: '2026-09-11', orderStatus: '待订舱', bookingStatus: '待服务', bookingRequirement: '需恒温操作' }),
      seedAirOrder({ id: 'AIR-260908-003', customer: '远洲电子商务', owner: '李明', origin: 'PVG', destination: 'LAX', grossWeight: 96, volume: 0.72, pieces: 24, departureDate: '2026-09-09', orderStatus: '待订舱', bookingStatus: '待服务', bookingRequirement: '到港后转仓' }),
      seedAirOrder({ id: 'AIR-260907-018', customer: '华越国际商贸', owner: '周倩', origin: 'PVG', destination: 'AMS', grossWeight: 246.8, volume: 1.1, pieces: 51, departureDate: '2026-09-09', orderStatus: '待审核', bookingStatus: '待审核', bookingRequirement: '分单报关' }),
      seedAirOrder({ id: 'AIR-260906-011', customer: '星瀚品牌管理', owner: '王晴', origin: 'PVG', destination: 'SIN', grossWeight: 138, volume: 0.58, pieces: 30, departureDate: '2026-09-08', orderStatus: '待订舱', bookingStatus: '服务中', bookingRequirement: '常规' }),
    ],
    ...seedGroundData(),
    fleetDrivers: createFleetSeed(),
    warehouseOrders: [
      { id: 'WH-260908-006', serviceNo: 'GJ-WH-260908-006', customer: '启航跨境贸易', warehouse: '昆山中转仓', inboundType: '备货入库', forecastQty: 320, actualQty: 288, goodQty: 272, damagedQty: 10, abnormalQty: 6, status: '部分收货', updatedAt: '2026-09-08 13:42' },
      { id: 'WH-260908-007', serviceNo: 'GJ-WH-260908-007', customer: '云帆供应链', warehouse: '松江保税仓', inboundType: '备货入库', forecastQty: 180, actualQty: 180, goodQty: 174, damagedQty: 4, abnormalQty: 2, status: '待确认', updatedAt: '2026-09-08 12:18' },
      { id: 'WH-260907-019', serviceNo: 'GJ-WH-260907-019', customer: '远洲电子商务', warehouse: '太仓仓库', inboundType: '集货入库', forecastQty: 96, actualQty: 96, goodQty: 96, damagedQty: 0, abnormalQty: 0, status: '待上架', updatedAt: '2026-09-08 10:36' },
      { id: 'WH-260906-031', serviceNo: 'GJ-WH-260906-031', customer: '星瀚品牌管理', warehouse: '昆山中转仓', inboundType: '备货入库', forecastQty: 240, actualQty: 240, goodQty: 235, damagedQty: 3, abnormalQty: 2, status: '已完成', updatedAt: '2026-09-07 18:20' },
    ],
    costs: [
      { id: 'COST-260908-101', orderNo: 'GJ-AIR-260908-001', feeItem: '空运费', direction: '应付', settlementParty: '东方航空', currency: 'CNY', amount: 12860, status: '审批通过', applicant: '周倩', updatedAt: '2026-09-08 13:30' },
      { id: 'COST-260908-102', orderNo: 'GJ-AIR-260908-001', feeItem: '空运服务费', direction: '应收', settlementParty: '启航跨境贸易', currency: 'CNY', amount: 15680, status: '待审批', applicant: '周倩', updatedAt: '2026-09-08 13:31' },
      { id: 'COST-260908-103', orderNo: 'GJ-CAR-260908-023', feeItem: '提货车费', direction: '应付', settlementParty: '申捷车队', currency: 'CNY', amount: 1860, status: '待审批', applicant: '陈楠', updatedAt: '2026-09-08 12:05' },
      { id: 'COST-260907-087', orderNo: 'GJ-AIR-260907-018', feeItem: '报关服务费', direction: '应收', settlementParty: '华越国际商贸', currency: 'CNY', amount: 780, status: '审批拒绝', applicant: '王晴', updatedAt: '2026-09-08 09:56', rejectReason: '缺少费用依据' },
    ],
    partners: [
      { id: 'PT-00018', code: 'CUS-0018', name: '启航跨境贸易', type: '客户', owner: '华东业务部', contact: '赵敏', phone: '138****3271', status: '有效', creditLimit: 100000, availableCredit: 76000, updatedAt: '2026-09-08' },
      { id: 'PT-00019', code: 'CUS-0019', name: '云帆供应链', type: '客户', owner: '华东业务部', contact: '陈一', phone: '000-00000001', status: '有效', creditLimit: 100000, availableCredit: 15000, updatedAt: '2026-09-08' },
      { id: 'PT-00020', code: 'CUS-0020', name: '远洲电子商务', type: '客户', owner: '华东业务部', contact: '林二', phone: '000-00000002', status: '有效', creditLimit: 100000, availableCredit: -500, updatedAt: '2026-09-08' },
      { id: 'PT-00021', code: 'CUS-0021', name: '华越国际商贸', type: '客户', owner: '华东业务部', contact: '许三', phone: '000-00000003', status: '有效', creditLimit: 100000, availableCredit: 0, updatedAt: '2026-09-08' },
      { id: 'PT-00022', code: 'CUS-0022', name: '星瀚品牌管理', type: '客户', owner: '华东业务部', contact: '江四', phone: '000-00000004', status: '有效', creditLimit: 100000, availableCredit: 56000, updatedAt: '2026-09-08' },
      { id: 'PT-00027', code: 'SUP-0027', name: '东方航空', type: '供应商', owner: '空运产品部', contact: '商务接口人', phone: '021-****5820', status: '有效', updatedAt: '2026-09-07' },
      { id: 'PT-00028', name: '南方航空', type: '供应商', owner: '空运产品部', contact: '演示航司接口人', phone: '000-00000028', status: '有效', updatedAt: '2026-09-07' },
      { id: 'PT-00029', name: '全日空', type: '供应商', owner: '空运产品部', contact: '演示航司接口人', phone: '000-00000029', status: '有效', updatedAt: '2026-09-07' },
      { id: 'PT-00031', code: 'SUP-0031', name: '申捷车队', type: '供应商', owner: '地面运输部', contact: '调度中心', phone: '400-***-6218', status: '有效', updatedAt: '2026-09-06' },
      { id: 'PT-00009', code: 'CUS-0009', name: '旧版演示客户', type: '客户', owner: '华南业务部', contact: '业务接口人', phone: '020-****1268', status: '失效', updatedAt: '2026-08-28' },
    ],
    integrations: [
      { id: 'INT-260908-128', businessNo: 'GJ-AIR-260908-001', system: '航空公司接口', action: '订舱信息推送', status: '成功', attempts: 1, lastAt: '2026-09-08 13:34', result: '航司已接收' },
      { id: 'INT-260908-129', businessNo: 'GJ-AIR-260907-018', system: '航空公司接口', action: '提单信息推送', status: '失败', attempts: 2, lastAt: '2026-09-08 13:29', result: '连接超时' },
      { id: 'INT-260908-130', businessNo: 'GJ-WH-260908-007', system: 'WMS', action: '理货报告同步', status: '失败', attempts: 3, lastAt: '2026-09-08 12:20', result: '连接超时，等待人工重试' },
      { id: 'INT-260908-131', businessNo: 'GJ-CAR-260908-023', system: '企业微信', action: '调度结果通知', status: '成功', attempts: 1, lastAt: '2026-09-08 12:08', result: '通知已送达' },
    ],
    genericRows: {},
    workbenchProgress: {},
    progressSequence: 0,
  })
}

const state = reactive(createSeed())
const airSession = reactive({ role: 'service', name: '周倩' })
const groundSession = reactive({ role: 'viewer', name: '周倩' })
const workbenchSession = reactive({ personaId: 'service' })
const partnerSession = computed(() => {
  const persona=WORKBENCH_PERSONAS.find(item=>item.id===workbenchSession.personaId) || WORKBENCH_PERSONAS[0]
  return {role:persona.scope==='finance'?persona.role:'viewer',name:persona.name,label:persona.scope==='finance'?persona.label:'只读查看',department:'华东业务部'}
})
const partnerActions = createPartnerActions(state, () => partnerSession.value)
const airMasterSession = computed(() => {
  const persona = WORKBENCH_PERSONAS.find(item => item.id === workbenchSession.personaId) || WORKBENCH_PERSONAS[0]
  return { role: persona.scope === 'airMaster' ? persona.role : 'viewer', name: persona.name, label: persona.scope === 'airMaster' ? persona.label : '只读查看' }
})
const airCatalog = computed(() => deriveAirCatalog(state.airMaster))
const airMasterActions = createAirMasterActions(state, () => airMasterSession.value)
const fleetActions = createFleetActions(state, () => groundSession)
const transportQuoteActions = createTransportQuoteActions(state, () => groundSession)
const warehouseQuoteActions = createWarehouseQuoteActions(state, () => groundSession)
const airSupplierRateActions = createAirSupplierRateActions(state, () => airSession)
const capacitySession = computed(() => {
  const persona = WORKBENCH_PERSONAS.find(item => item.id === workbenchSession.personaId)
  const role = persona?.scope === 'air' && ['operator', 'handler'].includes(persona.role) ? persona.role : persona?.id === 'business' ? 'business' : 'viewer'
  return { role, name: persona?.name || '', label: persona?.label || '只读查看' }
})
const capacityActions = createCapacityActions(state, () => capacitySession.value)
const palletActions = createAirPalletActions(state, () => capacitySession.value)
const airOrderActions = createAirOrderActions(state, () => airSession)
const airChildSession = computed(() => {
  if (['service', 'supervisor'].includes(airSession.role)) return airSession
  if (groundSession.role === 'hangsheng') return { role: 'hangsheng', name: groundSession.name }
  return { role: 'viewer', name: airSession.name }
})
const airChildOrderActions = createAirChildOrderActions(state, () => airChildSession.value, () => state.airMaster)
const airOrderSupplementActions = createAirOrderSupplementActions(state, () => airChildSession.value)
const airServiceActions = createAirServiceActions(state, () => airChildSession.value)
const bookingSession = computed(() => groundSession.role === 'hangsheng'
  ? { role: 'hangsheng', name: groundSession.name }
  : { role: airSession.role, name: airSession.name })
const airBookingActions = createAirBookingActions(state, () => bookingSession.value, () => airCatalog.value)
const airWaybillActions = createAirWaybillActions(state, () => airSession, () => state.airWaybillClockMs)
const airTemplateSession = computed(() => {
  const persona = WORKBENCH_PERSONAS.find(item => item.id === workbenchSession.personaId)
  return { role: persona?.scope === 'airTemplate' ? persona.role : 'viewer', name: persona?.name || '' }
})
const airWaybillTemplateActions = createAirWaybillTemplateActions(state, () => airTemplateSession.value)

// Store only the last progress-change timestamp, never a second task status.
watch(() => WORKBENCH_PERSONAS.map(persona => {
  const summary = getWorkbenchSummary(deriveWorkbenchTasks(state, persona))
  return { id: persona.id, ratio: summary.ratio }
}), summaries => {
  for (const { id, ratio } of summaries) {
    const previous = state.workbenchProgress[id]
    if (!previous || previous.ratio !== ratio) {
      const timestamp = new Date(Date.UTC(2026, 8, 8, 14, 30, ++state.progressSequence)).toISOString().slice(0, 19).replace('T', ' ')
      state.workbenchProgress[id] = { ratio, updatedAt: timestamp }
    }
  }
}, { immediate: true, flush: 'sync' })

export function usePrototypeData() {
  function advanceAirWaybillClock() { state.airWaybillClockMs += 121000 }
  function reset() {
    const seed = createSeed()
    for (const key of Object.keys(seed)) state[key] = clone(seed[key])
    Object.assign(airSession, { role: 'service', name: '周倩' })
    Object.assign(groundSession, { role: 'viewer', name: '周倩' })
    workbenchSession.personaId = 'service'
    state.progressSequence = 0
    state.workbenchProgress = Object.fromEntries(WORKBENCH_PERSONAS.map(persona => [persona.id, {
      ratio: getWorkbenchSummary(deriveWorkbenchTasks(state, persona)).ratio, updatedAt: '2026-09-08 14:30:00',
    }]))
  }

  function selectWorkbenchPersona(id) {
    const persona = WORKBENCH_PERSONAS.find(item => item.id === id)
    if (!persona) throw new Error('未找到演示角色')
    workbenchSession.personaId = id
    Object.assign(airSession, { role: persona.scope === 'air' ? persona.role : 'viewer', name: persona.name })
    Object.assign(groundSession, { role: persona.scope === 'ground' ? persona.role : 'viewer', name: persona.name })
  }

  function createAirOrder(payload) {
    if (!['service', 'supervisor'].includes(airSession.role)) throw new Error('当前角色不能创建主订单')
    const errors = validateAirDraft(payload, state.partners, airCatalog.value)
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    const id = `AIR-260908-${String(++state.airOrderSequence).padStart(3, '0')}`
    const draft = Object.fromEntries(Object.keys(createAirDraft()).filter((key) => key !== 'services').map((key) => [key, clone(payload[key] ?? createAirDraft()[key] ?? null)]))
    const order = {
      ...draft, id, orderNo: `GJ-${id}`, childNo: '01', childCount: 0, businessType: '空运出口',
      creator: airSession.name, createDate: '2026-09-08', createdAt: '2026-09-08 14:30',
      assignees: { ...WORKBENCH_PRODUCT_ASSIGNEES[payload.product] }, route: `${payload.origin} - ${payload.destination}`,
      expectedDepartureDate: payload.departureDate || '', departureDate: '',
      supplier: '', flight: '', waybillNo: '', orderStatus: '待订舱', bookingStatus: '待服务',
      chargeWeight: calculateChargeWeight(payload.grossWeight, payload.volume), booking: createBookingDraft(payload),
      services: ['booking', 'warehouse', 'pickup'].filter((type) => payload.services[type]).map((type) => ({ id: `${id}-${type.toUpperCase()}`, type, name: { booking: '订舱', warehouse: '仓储', pickup: '提货' }[type], status: '待服务' })),
    }
    const partner = state.partners.find(item => item.name === payload.customer && item.type === '客户')
    const emails = [...new Set((payload.contactEmails || []).map(value => value.trim()).filter(Boolean))]
    if (partner && (payload.contact?.trim() || payload.phone?.trim() || emails.length)) {
      const contact = { name: payload.contact?.trim() || '', phone: payload.phone?.trim() || '', emails }
      partner.businessContacts ||= partner.contact ? [{ name: partner.contact, phone: partner.phone || '', emails: partner.email ? [partner.email] : [] }] : []
      if (!partner.businessContacts.some(item => JSON.stringify(item) === JSON.stringify(contact))) partner.businessContacts.push(contact)
    }
    state.airOrders.unshift(order)
    appendAirNotification(state, order, '订单待订舱', order.assignees.operator, `订单号：${order.orderNo}待订舱，请尽快处理！`, { path: '/fulfillment/booking', query: { order: order.id } })
    return state.airOrders[0]
  }

  function dispatchGroundOrders(ids, drafts, { specialConfirmed = false } = {}) {
    if (!['hangsheng', 'supervisor'].includes(groundSession.role)) throw new Error('仅航晟客服或主管可调度派车')
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw new Error('请选择不重复的待调度订单')
    const orders = ids.map(id => state.groundOrders.find(item => item.id === id))
    const batch = validateBatchGroundOrders(orders)
    if (!batch.ok) throw Object.assign(new Error(batch.message), { code: batch.code })
    if (batch.specialConfirmationRequired && !specialConfirmed) throw Object.assign(new Error(batch.message), { code: batch.code })
    if (!Array.isArray(drafts) || !drafts.length) throw new Error('请至少录入一辆调度车辆')
    for (const [index, draft] of drafts.entries()) {
      const errors = validateDispatchDraft(draft)
      if (Object.keys(errors).length) throw Object.assign(new Error(`第 ${index + 1} 辆车：${Object.values(errors)[0]}`), { fields: errors, vehicleIndex: index })
    }
    let serial = state.groundSequence
    const generated = orders.flatMap(order => drafts.map(draft => createGroundWaybill(order, draft, { serial: ++serial, vehicleCount: drafts.length, actor: groundSession.name })))
    const nextHistory = clone(state.groundPlateHistory)
    for (const draft of drafts) {
      // Cargo allocations belong to the current order, not the reusable vehicle record.
      const record = { ...createDispatchDraft(), ...clone(draft), cost: null, specificPieces: null, specificVolume: null, specificWeight: null, specificLength: null, specificWidth: null, specificHeight: null }
      const existing = nextHistory.findIndex(item => item.plate === record.plate)
      if (existing >= 0) nextHistory.splice(existing, 1)
      nextHistory.unshift(record)
    }
    // No product writes happen before all orders, vehicles and derived records have validated.
    state.groundWaybills.unshift(...generated)
    state.groundSequence = serial
    state.groundPlateHistory = nextHistory
    for (const order of orders) {
      order.dispatchStatus = deriveGroundOrderStatus(state.groundWaybills.filter(item => item.orderId === order.id), order.dispatchStatus)
      order.updatedAt = GROUND_NOW
    }
    return generated
  }

  function updateGroundWaybillStatus(id, update) {
    if (groundSession.role !== 'hangsheng') throw new Error('仅航晟客服可管理运单状态')
    const waybill = state.groundWaybills.find(item => item.id === id)
    const error = validateGroundStatusChange(waybill, update)
    if (error) throw new Error(error)
    const record = { id: `${id}-T${waybill.trajectory.length + 1}`, event: update.status === '提货中' ? '前往提货' : update.status, status: update.status, time: update.time, remark: update.remark || '', actor: groundSession.name, role: '航晟客服' }
    waybill.status = update.status
    waybill.updatedAt = GROUND_NOW
    waybill.trajectory.push(record)
    const order = state.groundOrders.find(item => item.id === waybill.orderId)
    if (order) {
      order.dispatchStatus = deriveGroundOrderStatus(state.groundWaybills.filter(item => item.orderId === order.id), order.dispatchStatus)
      order.updatedAt = GROUND_NOW
    }
    return waybill
  }

  function advanceWarehouseOrder(id) {
    const order = state.warehouseOrders.find((item) => item.id === id)
    const index = WAREHOUSE_FLOW.indexOf(order?.status)
    if (!order || index < 0 || index === WAREHOUSE_FLOW.length - 1) return null
    order.status = WAREHOUSE_FLOW[index + 1]
    order.updatedAt = '2026-09-08 14:30'
    return order
  }

  function addCost(payload) {
    const cost = { id: `COST-260908-${110 + state.costs.length}`, status: '待审批', updatedAt: '2026-09-08 14:30', ...payload }
    state.costs.unshift(cost)
    return cost
  }

  function reviewCost(id, approved, reason = '') {
    const cost = state.costs.find((item) => item.id === id)
    if (!cost) return null
    cost.status = approved ? '审批通过' : '审批拒绝'
    cost.rejectReason = approved ? '' : reason
    cost.updatedAt = '2026-09-08 14:32'
    return cost
  }

  function ensureGenericRows(moduleKey, label) {
    if (!state.genericRows[moduleKey]) {
      state.genericRows[moduleKey] = [1, 2, 3, 4].map((index) => ({
        id: `${moduleKey.toUpperCase()}-${String(index).padStart(3, '0')}`,
        businessNo: `GJ-${String(index + 260900).padStart(6, '0')}`,
        subject: `${label}记录 ${index}`,
        customer: ['启航跨境贸易', '云帆供应链', '远洲电子商务', '华越国际商贸'][index - 1],
        owner: ['周倩', '陈楠', '李明', '王晴'][index - 1],
        status: ['待处理', '处理中', '已完成', '待确认'][index - 1],
        updatedAt: `2026-09-0${9 - index} 1${index}:20`,
      }))
    }
    return state.genericRows[moduleKey]
  }

  function addGenericRow(moduleKey, label, payload) {
    const rows = ensureGenericRows(moduleKey, label)
    const row = {
      id: `${moduleKey.toUpperCase()}-${String(rows.length + 1).padStart(3, '0')}`,
      businessNo: `GJ-${String(260905 + rows.length).padStart(6, '0')}`,
      status: '待处理', updatedAt: '2026-09-08 14:40', ...payload,
    }
    rows.unshift(row)
    return row
  }

  const dashboard = computed(() => ({
    pendingAir: state.airOrders.filter((item) => ['待订舱', '待补录', '待出提单', '待审核'].includes(item.orderStatus)).length,
    undispatched: state.groundOrders.filter((item) => item.dispatchStatus === '未调度').length,
    warehousePending: state.warehouseOrders.filter((item) => item.status !== '已完成').length,
    costPending: state.costs.filter((item) => item.status === '待审批').length,
    integrationFailures: [...state.airOrders, ...state.airChildren].filter(item => item.waybillTransmission?.status === '异常中').length,
  }))

  return {
    state, airSession, groundSession, workbenchSession, selectWorkbenchPersona, dashboard, reset, createAirOrder, bookingSession, ...airBookingActions, dispatchGroundOrders, updateGroundWaybillStatus, advanceWarehouseOrder,
    ...airOrderSupplementActions, ...airOrderActions, airChildSession, ...airChildOrderActions, ...airServiceActions,
    ...airWaybillActions, advanceAirWaybillClock,
    airTemplateSession, ...airWaybillTemplateActions,
    addCost, reviewCost, partnerSession, ...partnerActions, airMasterSession, airCatalog, ...airMasterActions,
    ...fleetActions, ...transportQuoteActions, ...warehouseQuoteActions, ...airSupplierRateActions, capacitySession, ...capacityActions, ...palletActions, ensureGenericRows, addGenericRow,
  }
}
