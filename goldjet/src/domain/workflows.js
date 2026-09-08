export const AIR_TRANSITIONS = {
  草稿: { label: '提交订舱', nextOrderStatus: '待确认', nextBookingStatus: '待接单' },
  待确认: { label: '接单并订舱', nextOrderStatus: '待确认', nextBookingStatus: '待审核' },
  待审核: { label: '审核通过', nextOrderStatus: '待补录', nextBookingStatus: '审核通过' },
  待补录: { label: '补录完成', nextOrderStatus: '运输中', nextBookingStatus: '审核通过' },
}

export const WAREHOUSE_FLOW = [
  '待收货', '部分收货', '待理货', '部分理货', '待确认', '待上架', '部分上架', '已完成',
]

export const WAREHOUSE_ACTIONS = {
  待收货: '登记部分收货',
  部分收货: '完成收货',
  待理货: '登记部分理货',
  部分理货: '完成理货',
  待确认: '客户确认',
  待上架: '登记部分上架',
  部分上架: '完成上架',
}

export function resolveAirTransition(order) {
  if (order.bookingStatus === '待审核') return AIR_TRANSITIONS.待审核
  return AIR_TRANSITIONS[order.orderStatus] || null
}
