import { createRouter, createWebHashHistory } from 'vue-router'
import { BILLING_PATHS, BUSINESS_PATHS, COST_PATHS } from '../domain/constants.js'

const routeMeta = (domain, key, title, back = '') => ({
  domain,
  ...(domain === 'billing'
    ? { billingMenu: key }
    : domain === 'cost'
      ? { costView: key }
      : { businessMenu: key }),
  title,
  ...(back ? { back } : {}),
})

const billingRoute = (path, key, title, component, props) => ({
  path,
  component,
  ...(props ? { props } : {}),
  meta: routeMeta('billing', key, title),
})

const processRoute = (path, key, title, mode) => billingRoute(
  path,
  key,
  title,
  () => import('../billing/views/ProcessView.vue'),
  { mode },
)

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: BILLING_PATHS.receivableSummary },
    billingRoute(BILLING_PATHS.receivableSummary, 'receivableSummary', '营收总览', () => import('../billing/views/ReceivableSummaryView.vue')),
    billingRoute(BILLING_PATHS.receivable, 'receivable', '应收账单', () => import('../billing/views/BillsView.vue'), { billType: 'AR' }),
    { path: `${BILLING_PATHS.receivable}/:billNo`, component: () => import('../billing/views/BillDetailView.vue'), props: (route) => ({ billType: 'AR', billNo: route.params.billNo }), meta: routeMeta('billing', 'receivable', '应收账单详情', BILLING_PATHS.receivable) },
    billingRoute(BILLING_PATHS.refund, 'refund', '返款账单', () => import('../billing/views/BillsView.vue'), { billType: 'RF' }),
    { path: `${BILLING_PATHS.refund}/:billNo`, component: () => import('../billing/views/BillDetailView.vue'), props: (route) => ({ billType: 'RF', billNo: route.params.billNo }), meta: routeMeta('billing', 'refund', '返款账单详情', BILLING_PATHS.refund) },
    billingRoute(BILLING_PATHS.remittance, 'remittance', '回款管理', () => import('../billing/views/RemittanceView.vue')),
    billingRoute(BILLING_PATHS.adjustments, 'adjustments', '调账中心', () => import('../billing/views/AdjustmentView.vue')),
    billingRoute(BILLING_PATHS.config, 'config', '账单配置', () => import('../billing/views/BillingConfigView.vue')),
    billingRoute(BILLING_PATHS.rates, 'rates', '汇率配置', () => import('../billing/views/RateConfigView.vue')),
    billingRoute(BILLING_PATHS.tasks, 'tasks', '生成任务', () => import('../billing/views/TasksView.vue')),
    billingRoute(BILLING_PATHS.base, 'tasks', '基础配置', () => import('../billing/views/TasksView.vue'), { initialTaskTab: 'base' }),
    processRoute(BILLING_PATHS.exports, 'exports', '导出管理', 'exports'),
    processRoute(BILLING_PATHS.audit, 'audit', '内部审计', 'audit'),
    processRoute(BILLING_PATHS.compare, 'compare', '报表比对', 'compare'),
    processRoute(BILLING_PATHS.migration, 'migration', '数据迁移', 'migration'),
    { path: COST_PATHS.overview, component: () => import('../cost/views/OverviewView.vue'), meta: routeMeta('cost', 'overview', '成本总览') },
    { path: COST_PATHS.suppliers, component: () => import('../cost/views/SupplierView.vue'), meta: routeMeta('cost', 'suppliers', '供应商管理') },
    { path: COST_PATHS.bills, component: () => import('../cost/views/CostBillView.vue'), meta: routeMeta('cost', 'bills', '成本账单') },
    { path: COST_PATHS.billImport, component: () => import('../cost/views/CostBillImportView.vue'), meta: routeMeta('cost', 'bills', '导入供应商账单', COST_PATHS.bills) },
    { path: `${COST_PATHS.bills}/:id`, component: () => import('../cost/views/CostBillDetailView.vue'), meta: routeMeta('cost', 'bills', '成本账单详情', COST_PATHS.bills) },
    { path: COST_PATHS.pool, component: () => import('../cost/views/CostPoolView.vue'), meta: routeMeta('cost', 'pool', '成本池') },
    { path: COST_PATHS.rules, component: () => import('../cost/views/AllocationRuleView.vue'), meta: routeMeta('cost', 'rules', '分摊规则') },
    { path: COST_PATHS.profit, component: () => import('../cost/views/ProfitView.vue'), meta: routeMeta('cost', 'profit', '利润分析') },
    { path: COST_PATHS.fees, component: () => import('../cost/views/FeeIndexView.vue'), meta: routeMeta('cost', 'fees', '成本费项索引') },
    { path: BUSINESS_PATHS.routeQuotes, component: () => import('../business/views/RouteQuotationView.vue'), meta: routeMeta('business', 'routeQuotes', '线路报价') },
    { path: '/__dev/ui', component: () => import('../shared/views/UiGalleryView.vue'), meta: routeMeta('billing', '', '组件陈列') },
    { path: '/:pathMatch(.*)*', redirect: BILLING_PATHS.receivableSummary },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
