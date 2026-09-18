import { createRouter, createWebHashHistory } from 'vue-router'
import { genericModuleKeys, moduleCatalog } from '../domain/catalog.js'

const coreRoutes = [
  { key: 'permissions', component: () => import('../views/RolePermissionsView.vue') },
  { key: 'dashboard', component: () => import('../views/DashboardView.vue') },
  { key: 'financeWorkspace', component: () => import('../views/DashboardView.vue') },
  { key: 'airOrders', component: () => import('../views/AirOrdersView.vue') },
  { key: 'airChildren', component: () => import('../views/AirChildOrdersView.vue') },
  { key: 'booking', component: () => import('../views/BookingView.vue') },
  { key: 'airwayBills', component: () => import('../views/AirWaybillsView.vue') },
  { key: 'declarations', component: () => import('../views/AirDeclarationsView.vue') },
  { key: 'clearance', component: () => import('../views/AirClearancesView.vue') },
  { key: 'tracking', component: () => import('../views/AirTrackingView.vue') },
  { key: 'groundDispatch', component: () => import('../views/GroundDispatchView.vue') },
  { key: 'groundWaybills', component: () => import('../views/GroundWaybillsView.vue') },
  { key: 'fleet', component: () => import('../views/FleetManagementView.vue') },
  { key: 'warehouseOrders', component: () => import('../views/WarehouseOrdersView.vue') },
  { key: 'costs', component: () => import('../views/FinanceCostsView.vue') },
  { key: 'partners', component: () => import('../views/PartnersView.vue') },
  { key: 'airMasterData', component: () => import('../views/AirMasterDataView.vue') },
  { key: 'customerQuotes', component: () => import('../views/TransportQuotesView.vue') },
  { key: 'warehouseQuotes', component: () => import('../views/WarehouseQuotesView.vue') },
  { key: 'airSupplierRates', component: () => import('../views/AirSupplierRatesView.vue') },
  { key: 'airCapacity', component: () => import('../views/AirCapacityView.vue') },
  { key: 'pallet', component: () => import('../views/AirPalletView.vue') },
  { key: 'messages', component: () => import('../views/MessagesView.vue') },
  { key: 'integrations', component: () => import('../views/IntegrationView.vue') },
]

const routes = coreRoutes.map(({ key, component }) => ({
  path: moduleCatalog[key].path,
  component,
  meta: { moduleKey: key, title: moduleCatalog[key].label, domain: moduleCatalog[key].domain },
}))

for (const key of genericModuleKeys) {
  routes.push({
    path: moduleCatalog[key].path,
    component: () => import('../views/GenericModuleView.vue'),
    meta: { moduleKey: key, title: moduleCatalog[key].label, domain: moduleCatalog[key].domain },
  })
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/workspace' },
    { path: '/fulfillment/ground-monthly', component: () => import('../views/GroundMonthlyView.vue'), meta: { moduleKey: 'groundDispatch', title: '航晟陆运月报', domain: 'fulfillment' } },
    { path: '/fulfillment/airway-bills/:orderId', component: () => import('../views/AirWaybillEditView.vue'), meta: { moduleKey: 'airwayBills', title: '提单编辑', domain: 'fulfillment' } },
    { path: '/fulfillment/airway-bill-templates', component: () => import('../views/AirWaybillTemplatesView.vue'), meta: { moduleKey: 'airwayBills', title: '提单模板管理', domain: 'fulfillment' } },
    { path: '/fulfillment/declarations/:serviceId/source', component: () => import('../views/AirDeclarationSourceView.vue'), meta: { moduleKey: 'declarations', title: '分单报关来源', domain: 'fulfillment' } },
    { path: '/fulfillment/air-orders/:orderId/supplement', component: () => import('../views/AirOrderSupplementView.vue'), meta: { moduleKey: 'airOrders', title: '主订单补录', domain: 'fulfillment' } },
    ...routes,
    { path: '/:pathMatch(.*)*', redirect: '/workspace' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
