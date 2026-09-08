import { computed, reactive } from 'vue'
import { calculateChargeWeight } from '../domain/chargeWeight.js'
import { WAREHOUSE_FLOW } from '../domain/workflows.js'

const clone = (value) => JSON.parse(JSON.stringify(value))

function createSeed() {
  return {
    airOrders: [
      { id: 'AIR-260908-001', orderNo: 'GJ-AIR-260908-001', childNo: '01', customer: '启航跨境贸易', owner: '周倩', businessType: '空运出口', route: 'PVG - LAX', grossWeight: 186.5, volume: 1.286, chargeWeight: 214.5, pieces: 42, supplier: '东方航空', flight: 'MU583', departureDate: '2026-09-10', orderStatus: '待补录', bookingStatus: '审核通过', childCount: 2, bookingRequirement: '直飞，优先晚班' },
      { id: 'AIR-260908-002', orderNo: 'GJ-AIR-260908-002', childNo: '01', customer: '云帆供应链', owner: '陈楠', businessType: '空运出口', route: 'SZX - FRA', grossWeight: 320, volume: 1.4, chargeWeight: 320, pieces: 68, supplier: '南方航空', flight: 'CZ331', departureDate: '2026-09-11', orderStatus: '待确认', bookingStatus: '待接单', childCount: 1, bookingRequirement: '需恒温操作' },
      { id: 'AIR-260908-003', orderNo: 'GJ-AIR-260908-003', childNo: '01', customer: '远洲电子商务', owner: '李明', businessType: '空运进口', route: 'NRT - PVG', grossWeight: 96, volume: 0.72, chargeWeight: 120, pieces: 24, supplier: '全日空', flight: 'NH919', departureDate: '2026-09-09', orderStatus: '草稿', bookingStatus: '未提交', childCount: 1, bookingRequirement: '到港后转仓' },
      { id: 'AIR-260907-018', orderNo: 'GJ-AIR-260907-018', childNo: '02', customer: '华越国际商贸', owner: '周倩', businessType: '空运出口', route: 'CAN - AMS', grossWeight: 246.8, volume: 1.1, chargeWeight: 247, pieces: 51, supplier: '厦门航空', flight: 'MF811', departureDate: '2026-09-09', orderStatus: '待确认', bookingStatus: '待审核', childCount: 3, bookingRequirement: '分单报关' },
      { id: 'AIR-260906-011', orderNo: 'GJ-AIR-260906-011', childNo: '01', customer: '星瀚品牌管理', owner: '王晴', businessType: '空运出口', route: 'PVG - SIN', grossWeight: 138, volume: 0.58, chargeWeight: 138, pieces: 30, supplier: '新加坡航空', flight: 'SQ827', departureDate: '2026-09-08', orderStatus: '运输中', bookingStatus: '审核通过', childCount: 1, bookingRequirement: '常规' },
    ],
    groundOrders: [
      { id: 'CAR-260908-021', orderNo: 'GJ-CAR-260908-021', customer: '启航跨境贸易', vehicleType: '9.6 米厢式车', pickup: '浦东机场货站', delivery: '昆山中转仓', weight: 6200, dispatchStatus: '未调度', supplier: '', cost: 0, waybillNo: '', requiredAt: '2026-09-08 16:00' },
      { id: 'CAR-260908-022', orderNo: 'GJ-CAR-260908-022', customer: '云帆供应链', vehicleType: '4.2 米厢式车', pickup: '虹桥货站', delivery: '松江保税仓', weight: 1800, dispatchStatus: '未调度', supplier: '', cost: 0, waybillNo: '', requiredAt: '2026-09-08 17:30' },
      { id: 'CAR-260908-023', orderNo: 'GJ-CAR-260908-023', customer: '远洲电子商务', vehicleType: '7.6 米厢式车', pickup: '浦东机场货站', delivery: '太仓仓库', weight: 4100, dispatchStatus: '已调度', supplier: '申捷车队', cost: 1860, waybillNo: 'WB-260908-036', requiredAt: '2026-09-08 15:20' },
      { id: 'CAR-260908-024', orderNo: 'GJ-CAR-260908-024', customer: '华越国际商贸', vehicleType: '4.2 米厢式车', pickup: '外高桥仓库', delivery: '浦东机场货站', weight: 1600, dispatchStatus: '未调度', supplier: '', cost: 0, waybillNo: '', requiredAt: '2026-09-09 09:00' },
    ],
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
      { id: 'PT-00018', code: 'CUS-0018', name: '启航跨境贸易', type: '客户', owner: '华东业务部', contact: '赵敏', phone: '138****3271', status: '有效', updatedAt: '2026-09-08' },
      { id: 'PT-00027', code: 'SUP-0027', name: '东方航空', type: '供应商', owner: '空运产品部', contact: '商务接口人', phone: '021-****5820', status: '有效', updatedAt: '2026-09-07' },
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
  }
}

const state = reactive(createSeed())

export function usePrototypeData() {
  function reset() {
    const seed = createSeed()
    for (const key of Object.keys(seed)) state[key] = clone(seed[key])
  }

  function createAirOrder(payload) {
    const index = state.airOrders.length + 1
    const orderNo = `GJ-AIR-260908-${String(index + 20).padStart(3, '0')}`
    state.airOrders.unshift({
      id: `AIR-260908-${String(index + 20).padStart(3, '0')}`,
      orderNo,
      childNo: '01',
      supplier: '', flight: '', departureDate: '', orderStatus: '草稿', bookingStatus: '未提交', childCount: 1,
      chargeWeight: calculateChargeWeight(payload.grossWeight, payload.volume),
      ...payload,
    })
    return state.airOrders[0]
  }

  function dispatchGroundOrders(ids, supplier) {
    const affected = state.groundOrders.filter((item) => ids.includes(item.id) && item.dispatchStatus === '未调度')
    affected.forEach((item, index) => {
      item.dispatchStatus = '已调度'
      item.supplier = supplier.name
      item.cost = supplier.priceByVehicle[item.vehicleType] || supplier.basePrice
      item.waybillNo = `WB-260908-${String(40 + index).padStart(3, '0')}`
    })
    return affected
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

  function addPartner(payload) {
    const partner = { id: `PT-${String(state.partners.length + 40).padStart(5, '0')}`, code: `${payload.type === '客户' ? 'CUS' : 'SUP'}-${String(state.partners.length + 40).padStart(4, '0')}`, status: '有效', updatedAt: '2026-09-08', ...payload }
    state.partners.unshift(partner)
    return partner
  }

  function togglePartner(id) {
    const partner = state.partners.find((item) => item.id === id)
    if (!partner) return null
    partner.status = partner.status === '有效' ? '失效' : '有效'
    partner.updatedAt = '2026-09-08'
    return partner
  }

  function retryIntegration(id) {
    const task = state.integrations.find((item) => item.id === id)
    if (!task || task.status !== '失败') return null
    task.attempts += 1
    task.status = '成功'
    task.lastAt = '2026-09-08 14:35'
    task.result = '人工重试成功'
    return task
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
    pendingAir: state.airOrders.filter((item) => ['草稿', '待确认', '待补录'].includes(item.orderStatus) || item.bookingStatus === '待审核').length,
    undispatched: state.groundOrders.filter((item) => item.dispatchStatus === '未调度').length,
    warehousePending: state.warehouseOrders.filter((item) => item.status !== '已完成').length,
    costPending: state.costs.filter((item) => item.status === '待审批').length,
    integrationFailures: state.integrations.filter((item) => item.status === '失败').length,
  }))

  return {
    state, dashboard, reset, createAirOrder, dispatchGroundOrders, advanceWarehouseOrder,
    addCost, reviewCost, addPartner, togglePartner, retryIntegration,
    ensureGenericRows, addGenericRow,
  }
}
