import { costOrders } from './orderCosts.js'

const target = (path, query = {}) => ({ path, query })
const numberKnown = value => value !== '' && value != null && Number.isFinite(Number(value))

export function manifestDecision(inbound, declared, conditions) {
  if (!numberKnown(inbound) || !numberKnown(declared)) return { code: 'pending', error: null, message: '请填写入仓重量与报关重量' }
  if (Number(inbound) < 0 || Number(declared) < 0) return { code: 'invalid', error: null, message: '重量不能为负数' }
  if (Number(declared) === 0) return { code: 'pending', error: null, message: '报关重量为零，处理边界待确认（222）' }
  const error = Math.abs(Number(inbound) - Number(declared)) / Number(declared) * 100
  if (Math.abs(error - 3) < 1e-10) return { code: 'pending', error, message: '重量误差等于3%，处理边界待确认（222）' }
  if (error > 3 || conditions === 'no') return { code: 'manual', error, message: '需空运或航晟物流客户部人工确认重量，再由业务系统报送' }
  if (conditions !== 'yes') return { code: 'pending', error, message: '密度等操作条件是否满足尚未确认（222）' }
  return { code: 'automatic', error, message: '满足仓库系统自动发送预配舱单的条件' }
}

// Follow explicit source identities only; matching customer names never establishes a workflow link.
export function ddpDocuments(state, airId) {
  const air = state.airOrders.find(row => row.id === airId && !row.deleted)
  if (!air) return []
  const ground = state.groundOrders.filter(row => row.airOrderId === air.id)
  const warehouses = state.warehouseOrders.filter(row => row.airOrderId === air.id)
  const station = state.stationOrders.filter(row => row.airOrderId === air.id)
  const bills = state.groundWaybills.filter(row => ground.some(order => order.id === row.orderId))
  const linkedIds = new Set([air.id, ...ground.map(row => row.id)])
  const costs = costOrders(state).filter(row => linkedIds.has(row.id))
  const statements = state.reconciliation.statements.filter(row => !row.deleted && row.lines.some(line => linkedIds.has(line.orderId)))
  const applications = state.financeApplications.rows.filter(row => !row.deleted && !row.demoOnly && row.lines.some(line => linkedIds.has(line.orderId)))
  const rows = []
  const add = (row, stage, number, status, source, destination) => rows.push({ id: `${stage}:${row.id}`, stage, number, status, source, target: destination })
  add(air, '空运订单', air.orderNo || air.id, air.orderStatus, '主订单', target('/fulfillment/air-orders', { order: air.id }))
  ground.forEach(row => add(row, row.orderType === '中转订单' ? '中转派车' : '提货调度', row.orderNo, row.dispatchStatus, `空运订单 ${row.airOrderId}`, target('/fulfillment/ground-dispatch', { order: row.id, ...(row.orderType === '中转订单' ? { tab: 'transfer' } : {}) })))
  bills.forEach(row => add(row, '运单执行', row.waybillNo, row.status, `用车订单 ${row.orderId}`, target('/fulfillment/ground-waybills', { order: row.orderId, waybill: row.id, ...(ground.find(order => order.id === row.orderId)?.orderType === '中转订单' ? { tab: 'transfer' } : {}) })))
  warehouses.forEach(row => add(row, '仓库作业', row.inboundNo, row.status, `空运订单 ${row.airOrderId}`, target('/fulfillment/warehouse-orders', { order: row.id })))
  station.forEach(row => add(row, '货站打板', row.orderNo, row.status, `空运订单 ${row.airOrderId}`, target('/fulfillment/station-pallet', { tab: 'orders', order: row.id })))
  costs.forEach(row => add(row, '订单成本', row.orderNo, row.status, '已完成且财务归属明确的关联订单', target('/finance/costs', { tab: 'summary', order: row.id })))
  statements.forEach(row => add(row, '对账', row.statementNo, row.status, '对账明细中的关联订单', target('/finance/reconciliation', { statement: row.id, direction: row.statementDirection })))
  applications.forEach(row => add(row, '收付款申请', row.applicationNo, row.status, '申请明细中的关联订单', target('/finance/payment-requests', { application: row.id, kind: row.kind })))
  return rows
}

export const DDP_STAGES = [
  ['报价依据', '客户、供应商及仓库报价', '/foundation/customer-quotes', '既有报价模块；复杂自动计费规则待确认（049、141）'],
  ['提货调度', '用车订单与运单', '/fulfillment/ground-dispatch', '调度与司机节点可演示；默认应收与应付生成待确认（133、140、141）'],
  ['仓库作业', '仓库订单与WMS', '/fulfillment/warehouse-orders', '接收入仓与服务数量可演示；出库终态待确认（036、164）'],
  ['预配与报关', '预配、报关与海关放行', '/fulfillment/declarations', '预配发送、回执及出仓通知衔接待确认（080、102、222）'],
  ['中转派车', '中转仓用车与扫描匹配', '/fulfillment/ground-dispatch?tab=transfer', '上游自动接入；匹配唯一性和重发处理待确认（142）'],
  ['货站入区', '入区登记、货站与板纸', '/fulfillment/station-pallet', '板纸上传可演示；入区回执与打板状态不得相互替代（120、222）'],
  ['财务结算', '成本、对账与收付款申请', '/finance/costs', '已确认的应收链路可演示；自动生成费用不以手工样本替代（141、201）'],
  ['核销与发票', '核销及销项发票', '/finance/writeoffs', '核销金额与额度恢复待确认（209）；合成发票可独立补录'],
].map(([name, title, path, status], index) => ({ id: String(index + 1), name, title, path, status }))
