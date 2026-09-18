import { WAREHOUSE_DATE } from './warehouseOrders.js'

const text = value => String(value ?? '')
export const inDateRange = (value, range) => !range?.length || (Boolean(value) && value.slice(0, 10) >= range[0] && value.slice(0, 10) <= range[1])
export function warehouseReturns(state) {
  const groups = new Map()
  for (const entry of state.groundServiceRecords.filter(row => row.operation === 'return')) {
    const group = groups.get(entry.number) || { id: `return:${entry.number}`, number: entry.number, customer: state.airOrders.find(row => row.id === entry.orderId)?.customer || '', children: [] }
    for (const code of entry.packages) {
      const events = state.groundServiceRecords.filter(row => row.number === entry.number && ['return', 'returnIn', 'returnOut'].includes(row.operation) && row.packages?.includes(code)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      const returned = events.filter(row => row.operation === 'return').at(-1), inbound = events.filter(row => row.operation === 'returnIn').at(-1), outbound = events.filter(row => row.operation === 'returnOut').at(-1)
      const latest = events.at(-1)
      const child = { id: `${entry.number}:${code}`, number: entry.number, code, customer: group.customer, returnedAt: returned.updatedAt, inboundAt: inbound?.updatedAt || '', outboundAt: outbound?.updatedAt || '', actor: latest.history.at(-1)?.actorId || '', collectorName: outbound?.collectorName || '', collectorPhone: outbound?.collectorPhone || '', collectorPlate: outbound?.collectorPlate || '' }
      const index = group.children.findIndex(row => row.code === code)
      if (index < 0) group.children.push(child); else group.children[index] = child
    }
    groups.set(entry.number, group)
  }
  return [...groups.values()].map(group => ({ ...group, returnedAt: group.children.map(row => row.returnedAt).sort().at(-1), total: group.children.length, inCount: group.children.filter(row => row.inboundAt).length, outCount: group.children.filter(row => row.outboundAt).length,
    children: group.children.sort((a, b) => b.returnedAt.localeCompare(a.returnedAt)),
  })).sort((a, b) => b.returnedAt.localeCompare(a.returnedAt))
}
export function warehouseReturnExport(rows, address) {
  return { columns: ['客户名称', '提货地址', '提货人姓名', '提货车牌', '提货人手机', '提单号', '包裹条码', '安检退件时间'],
    rows: rows.map(row => ['', address, row.collectorName, row.collectorPlate, row.collectorPhone, row.number, row.code, row.returnedAt]) }
}
export function warehouseCsv(columns, rows) {
  const cell = value => `"${(/^[\s]*[=+\-@\t\r]/.test(text(value)) ? "'" : '') + text(value).replaceAll('"', '""')}"`
  return '\uFEFF' + [columns, ...rows].map(row => row.map(cell).join(',')).join('\r\n')
}
export function warehouseCosts(state, order) {
  return state.costs.filter(row => row.warehouseOrderId === order.id || row.orderNo === order.inboundNo)
}
export function warehouseMonthly(state, endMonth = WAREHOUSE_DATE.slice(0, 7)) {
  const earliest = state.warehouseOrders.map(row => row.createdAt?.slice(0, 7)).filter(Boolean).sort()[0]
  if (!earliest) return []
  const rows = []
  for (let month = endMonth; month >= earliest;) {
    const inbound = state.warehouseOrders.filter(row => row.inboundAt?.startsWith(month))
    const completed = state.warehouseOrders.filter(row => row.status === '已出库' && row.completedAt?.startsWith(month))
    const approved = completed.flatMap(order => warehouseCosts(state, order)).filter(row => row.businessApprovedAt)
    const currencies = [...new Set(approved.map(row => row.currency).filter(Boolean))]
    const amounts = currencies.map(currency => {
      const total = direction => approved.filter(row => row.currency === currency && row.direction === direction).reduce((sum, row) => sum + Number(row.amount), 0)
      return { currency, receivable: total('应收'), payable: total('应付'), profit: total('应收') - total('应付') }
    })
    rows.push({ month, inbound: inbound.length, outbound: completed.length, transferOutbound: completed.some(row => !Object.hasOwn(row, 'isTransit')) ? null : completed.filter(row => row.isTransit === true).length, amounts,
      unresolvedInbound: state.warehouseOrders.some(row => new Set(row.pallets.map(pallet => pallet.inboundAt.slice(0, 7))).size > 1 && row.pallets.some(pallet => pallet.inboundAt.startsWith(month))) })
    const [year, number] = month.split('-').map(Number); month = number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`
  }
  return rows
}
const matchesWarehouse = points => (points || []).some(point => point.address?.includes('航晟') && point.address.includes('仓库'))
export function warehouseTransportOrders(state) {
  const now = Date.parse(`${WAREHOUSE_DATE}T14:30:00`)
  const distance = value => { const parsed = Date.parse(value); return Number.isFinite(parsed) ? Math.abs(parsed - now) : Infinity }
  return state.groundOrders.flatMap(order => {
    const pickup = ['中转', '中转订单'].includes(order.orderType) || matchesWarehouse(order.pickupPoints), delivery = matchesWarehouse(order.deliveryPoints)
    if (!pickup && !delivery) return []
    return [{ ...order, inboundNo: order.orderNo || order.childNo || order.batchNo || '', type: pickup && delivery ? '双端匹配待确认' : pickup ? '提货' : '卸货', plannedAt: order.pickupTime,
      dimensions: [order.length, order.width, order.height].some(value => value === '' || value == null) ? '' : `${order.length} × ${order.width} × ${order.height} cm` }]
  }).sort((a, b) => distance(a.plannedAt) - distance(b.plannedAt))
}
export function warehouseTransportBills(state) {
  const orders = warehouseTransportOrders(state), result = []
  for (const bill of state.groundWaybills) {
    const order = orders.find(row => row.id === bill.orderId)
    if (!order) continue
    const pickup = order.type === '提货', ambiguous = order.type === '双端匹配待确认'
    const driverEvents = (bill.trajectory || []).filter(row => row.role === '司机')
    const arrived = driverEvents.filter(row => row.status === (pickup ? '到达提货点' : '到达卸货点')).at(-1)
    const location = driverEvents.filter(row => row.location).at(-1)?.location
    result.push({ ...bill, inboundNo: order.inboundNo, type: order.type, contact: (bill.drivers || []).map(row => `${row.name}：${row.phone}`).join('；'), dimensions: [bill.length, bill.width, bill.height].every(value => value != null && value !== '') ? `${bill.length} × ${bill.width} × ${bill.height} cm` : '',
      plannedAt: pickup ? order.pickupTime : ambiguous ? '' : order.deliveryTime,
      expectedAt: !ambiguous && pickup ? bill.expectedArrival || '' : '', actualAt: !ambiguous ? arrived?.time || '' : '', latestLocation: typeof location === 'string' ? location : location?.address || '',
      etaReason: ambiguous ? '双端作业方向待确认' : pickup ? bill.expectedArrivalSource || '司机出发与地图耗时尚未取得' : '卸货点地图耗时尚未接入',
    })
  }
  const now = Date.parse(`${WAREHOUSE_DATE}T14:30:00`), distance = value => value ? Math.abs(Date.parse(value) - now) : Infinity
  return result.sort((a, b) => distance(a.expectedAt) - distance(b.expectedAt))
}
