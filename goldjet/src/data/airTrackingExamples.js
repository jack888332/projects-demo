import { createAirDraft, createBookingDraft } from '../domain/airOperations.js'
import { createDispatchDraft, createGroundWaybill, GROUND_PLATE_PRESETS } from '../domain/groundOperations.js'
import { canQueryAirTracking } from '../domain/airTracking.js'

export function loadAirTrackingExamples(state, session) {
  if (!canQueryAirTracking(session)) throw new Error('仅空运客服可载入在途跟踪示例')
  const id = 'DEMO-TRACKING-014'
  const existing = state.airOrders.find(order => order.id === id)
  if (existing) {
    if (existing.creator !== session.name) throw new Error('该示例已由其他客服载入，请恢复演示数据后重试')
    return existing
  }
  const order = {
    ...createAirDraft(), id, orderNo: `GJ-${id}`, waybillNo: '781-90001401', orderType: '直单', businessType: '空运出口',
    customer: '启航跨境贸易', creator: session.name, owner: session.name, product: 'MU-GENERAL', sellRate: 28,
    origin: 'PVG', destination: 'LAX', route: 'PVG - LAX', pieces: 42, grossWeight: 186.5, volume: 1.28,
    waybill: { pieces: 40, grossWeight: 185, volume: 1.2 }, chargeWeight: 200, source: '在途合成示例',
    orderStatus: '待出提单', bookingStatus: '服务已完成', departureDate: '2026-09-10', expectedDepartureDate: '2026-09-10',
    createdAt: '2026-09-08 08:00', createDate: '2026-09-08', bookingConfirmedAt: '2026-09-08 09:00', bookingCompletedAt: '2026-09-08 10:00',
    flight: 'MU9001', supplier: '东方航空', assignees: { operator: '李明', handler: '王晴' },
    booking: createBookingDraft({ departureDate: '2026-09-10', booking: { airline: '东方航空', flight: 'MU9001', firstDestination: 'CAN', firstLeg: 'PVG - CAN', cutoffTime: '16:00', takeoffTime: '20:00', airCost: 24, guidePrice: 28, waybillType: '自营', routeType: '国内中转' } }),
    supplement: { groundServices: { preallocation: false, customs: false, security: false, transfer: false, clearance: false } },
    services: [
      { id: `${id}-BOOKING`, type: 'booking', name: '订舱', status: '服务已完成' },
      { id: `${id}-PICKUP`, type: 'pickup', name: '提货', status: '服务中', createdAt: '2026-09-08 08:00',
        trajectory: [{ id: 'P1', time: '2026-09-08 12:00', status: '服务中', content: '提货车辆已调度' }] },
      { id: `${id}-WAREHOUSE`, type: 'warehouse', name: '仓储', status: '异常结束', createdAt: '2026-09-08 08:00',
        trajectory: [{ id: 'W1', time: '2026-09-08 11:30', status: '异常结束', content: '仓储服务异常结束：合成回执' }] },
    ],
  }
  const point = (address, contact, phone) => ({ province: '上海市', city: '上海市', district: '浦东新区', address, contact, phone })
  const ground = { id: `${id}-GROUND`, airOrderId: id, orderNo: order.orderNo, customer: order.customer,
    source: '空运API（合成已收记录）', businessType: '空运出口', childNo: '', batchNo: '', orderType: '',
    pieces: 40, weight: 185, volume: 1.2, vehicleType: '3T/4.2', specialVehicle: '', tailLift: '否', regulated: '否',
    pickup: '浦东演示仓', delivery: '浦东演示货站', pickupPoints: [point('浦东演示仓', '演示提货人', '000-00001401')],
    deliveryPoints: [point('浦东演示货站', '演示收货人', '000-00001402')],
    pickupTime: '2026-09-08 13:00', deliveryTime: '2026-09-08 17:00', dispatchStatus: '已调度', createdAt: '2026-09-08 11:00', createDate: '2026-09-08', remark: '在途合成示例',
  }
  let serial = state.groundSequence
  const waybills = GROUND_PLATE_PRESETS.map((preset, index) => {
    const waybill = createGroundWaybill(ground, { ...createDispatchDraft(), ...preset, vehicleType: '3T/4.2', specificLength: 80, specificWidth: 60, specificHeight: 55 },
      { serial: ++serial, vehicleCount: 2, actor: '陈楠', time: `2026-09-08 12:0${index}` })
    if (index === 0) {
      waybill.status = '到达提货点'
      waybill.trajectory.push(
        { id: `${waybill.id}-T2`, time: '2026-09-08 12:20', event: '前往提货', status: '提货中', actor: '陈楠', role: '航晟客服' },
        { id: `${waybill.id}-T3`, time: '2026-09-08 12:40', event: '到达提货点', status: '到达提货点', actor: '陈楠', role: '航晟客服' },
      )
    }
    return waybill
  })
  state.airOrders.push(order)
  state.groundOrders.push(ground)
  state.groundWaybills.push(...waybills)
  state.groundSequence = serial
  return order
}
