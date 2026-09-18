import { createDispatchDraft, createGroundWaybill } from '../domain/groundOperations.js'
import { DRIVER_DEMO } from '../domain/driverTasks.js'

export function loadDriverExamples(state) {
  if (state.groundOrders.some(row => row.id === 'DEMO-DRIVER-018')) return
  const base = state.groundOrders.find(row => row.id === 'CAR-260908-022')
  for (const [index, status] of ['待提货', '已卸货', '已取消'].entries()) {
    const order = { ...JSON.parse(JSON.stringify(base)), id: index ? `DEMO-DRIVER-018-${index}` : 'DEMO-DRIVER-018', orderNo: `GJ-DEMO-DRIVER-018-${index + 1}`, childNo: '', batchNo: '', dispatchStatus: index ? '已完成' : '已调度', pickupTime: index ? '2026-09-07 10:00' : '2026-09-08 15:00', deliveryTime: index ? '2026-09-07 12:00' : '2026-09-08 18:00', remark: '司机端合成任务' }
    const bill = createGroundWaybill(order, { ...createDispatchDraft(), vehicleType: '3T/4.2', supplier: '申捷车队', plate: '沪D·DEMO18', drivers: [{ name: '演示司机十八', phone: DRIVER_DEMO.phone, identity: '' }] }, { serial: ++state.groundSequence, vehicleCount: 1, actor: '陈楠', time: index ? '2026-09-07 09:00' : '2026-09-08 13:00' })
    bill.dispatchedById = 'DEMO-hangsheng'
    if (index) {
      bill.status = status; bill.fulfillmentStatus = status
      bill.trajectory.push({ id: `${bill.id}-T2`, event: status, status, time: '2026-09-07 13:00', actor: 'DEMO-hangsheng', role: '航晟客服', remark: '合成历史节点' })
    }
    state.groundOrders.push(order); state.groundWaybills.push(bill)
  }
}
