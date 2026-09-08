import {
  Bell, Box, Briefcase, ChatDotSquare, Coin, Connection, Crop, DataAnalysis,
  DataBoard, Document, DocumentChecked, Goods, Grid, Guide, House, MapLocation,
  Money, OfficeBuilding, Position, Promotion, Ship, Tickets, TrendCharts,
  UserFilled, Van, Wallet,
} from '@element-plus/icons-vue'

export const moduleCatalog = {
  dashboard: { label: '运营总览', path: '/workspace', domain: 'workspace', icon: Grid },
  airOrders: { label: '空运订单', path: '/fulfillment/air-orders', domain: 'fulfillment', group: '空运履约', icon: Promotion },
  airCapacity: { label: '舱位产品', path: '/fulfillment/air-capacity', domain: 'fulfillment', group: '空运履约', icon: Position },
  airSupplierRates: { label: '供应商价格', path: '/fulfillment/air-supplier-rates', domain: 'fulfillment', group: '空运履约', icon: Money },
  booking: { label: '订舱管理', path: '/fulfillment/booking', domain: 'fulfillment', group: '空运履约', icon: DocumentChecked },
  pallet: { label: '配板管理', path: '/fulfillment/pallet', domain: 'fulfillment', group: '空运履约', icon: Goods },
  airwayBills: { label: '提单管理', path: '/fulfillment/airway-bills', domain: 'fulfillment', group: '空运履约', icon: Document },
  declarations: { label: '报关单管理', path: '/fulfillment/declarations', domain: 'fulfillment', group: '空运履约', icon: OfficeBuilding },
  tracking: { label: '在途跟踪', path: '/fulfillment/tracking', domain: 'fulfillment', group: '空运履约', icon: MapLocation },
  clearance: { label: '清关派送', path: '/fulfillment/clearance', domain: 'fulfillment', group: '空运履约', icon: Guide },
  groundDispatch: { label: '用车调度', path: '/fulfillment/ground-dispatch', domain: 'fulfillment', group: '地面运输', icon: Van },
  groundWaybills: { label: '运输运单', path: '/fulfillment/ground-waybills', domain: 'fulfillment', group: '地面运输', icon: Van },
  fleet: { label: '车队管理', path: '/fulfillment/fleet', domain: 'fulfillment', group: '地面运输', icon: Ship },
  driver: { label: '司机端任务', path: '/fulfillment/driver', domain: 'fulfillment', group: '地面运输', icon: Connection },
  groundService: { label: '地面服务', path: '/fulfillment/ground-service', domain: 'fulfillment', group: '地面运输', icon: Crop },
  warehouseOrders: { label: '仓库订单', path: '/fulfillment/warehouse-orders', domain: 'fulfillment', group: '仓储货站', icon: House },
  stationPallet: { label: '货站打板', path: '/fulfillment/station-pallet', domain: 'fulfillment', group: '仓储货站', icon: Box },
  costs: { label: '订单成本', path: '/finance/costs', domain: 'finance', group: '结算业务', icon: Coin },
  reconciliation: { label: '对账管理', path: '/finance/reconciliation', domain: 'finance', group: '结算业务', icon: Tickets },
  paymentRequests: { label: '收付款申请', path: '/finance/payment-requests', domain: 'finance', group: '结算业务', icon: Wallet },
  writeoffs: { label: '收付款核销', path: '/finance/writeoffs', domain: 'finance', group: '结算业务', icon: DocumentChecked },
  reimbursements: { label: '费用报销', path: '/finance/reimbursements', domain: 'finance', group: '结算业务', icon: Briefcase },
  invoices: { label: '销项发票', path: '/finance/invoices', domain: 'finance', group: '结算业务', icon: Document },
  financeWorkspace: { label: '结算工作台', path: '/finance/workspace', domain: 'finance', group: '工作台', icon: DataBoard },
  partners: { label: '合作方档案', path: '/foundation/partners', domain: 'foundation', group: '基础资料与报价', icon: UserFilled },
  customerQuotes: { label: '客户供应商报价', path: '/foundation/customer-quotes', domain: 'foundation', group: '基础资料与报价', icon: Money },
  warehouseQuotes: { label: '仓库报价', path: '/foundation/warehouse-quotes', domain: 'foundation', group: '基础资料与报价', icon: OfficeBuilding },
  airMasterData: { label: '空运主数据', path: '/foundation/air-master-data', domain: 'foundation', group: '基础资料与报价', icon: Box },
  integrations: { label: '航司系统对接', path: '/foundation/integrations', domain: 'foundation', group: '系统协同', icon: Promotion },
  messages: { label: '消息推送', path: '/foundation/messages', domain: 'foundation', group: '系统协同', icon: Bell },
  reports: { label: '报表管理', path: '/foundation/reports', domain: 'foundation', group: '运营支撑', icon: DataAnalysis },
  bigscreen: { label: '大屏数据', path: '/foundation/bigscreen', domain: 'foundation', group: '运营支撑', icon: TrendCharts },
  ddpFlows: { label: 'DDP 流程视图', path: '/foundation/ddp-flows', domain: 'foundation', group: '运营支撑', icon: Guide },
}

export const domains = [
  { id: 'workspace', label: '运营总览', defaultPath: '/workspace', icon: Grid },
  { id: 'fulfillment', label: '履约中心', defaultPath: '/fulfillment/air-orders', icon: Promotion },
  { id: 'finance', label: '财务结算', defaultPath: '/finance/costs', icon: Money },
  { id: 'foundation', label: '基础协同', defaultPath: '/foundation/partners', icon: Connection },
]

export const navigationByDomain = Object.fromEntries(domains.map((domain) => {
  const modules = Object.entries(moduleCatalog)
    .filter(([, item]) => item.domain === domain.id && item.group)
    .map(([key, item]) => ({ key, ...item }))
  const groups = [...new Set(modules.map((item) => item.group))]
  return [domain.id, groups.map((group) => ({ group, items: modules.filter((item) => item.group === group) }))]
}))

export const genericModuleKeys = Object.keys(moduleCatalog).filter((key) => ![
  'dashboard', 'airOrders', 'groundDispatch', 'warehouseOrders', 'costs', 'partners', 'integrations',
].includes(key))

export function getModuleByPath(path) {
  return Object.entries(moduleCatalog).find(([, item]) => item.path === path)
}
