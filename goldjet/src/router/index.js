import { createRouter, createWebHashHistory } from 'vue-router'
import { genericModuleKeys, moduleCatalog } from '../domain/catalog.js'

const coreRoutes = [
  { key: 'dashboard', component: () => import('../views/DashboardView.vue') },
  { key: 'financeWorkspace', component: () => import('../views/DashboardView.vue') },
  { key: 'airOrders', component: () => import('../views/AirOrdersView.vue') },
  { key: 'booking', component: () => import('../views/BookingView.vue') },
  { key: 'groundDispatch', component: () => import('../views/GroundDispatchView.vue') },
  { key: 'groundWaybills', component: () => import('../views/GroundWaybillsView.vue') },
  { key: 'fleet', component: () => import('../views/FleetView.vue') },
  { key: 'warehouseOrders', component: () => import('../views/WarehouseOrdersView.vue') },
  { key: 'costs', component: () => import('../views/FinanceCostsView.vue') },
  { key: 'partners', component: () => import('../views/PartnersView.vue') },
  { key: 'airMasterData', component: () => import('../views/AirMasterDataView.vue') },
  { key: 'customerQuotes', component: () => import('../views/TransportQuotesView.vue') },
  { key: 'warehouseQuotes', component: () => import('../views/WarehouseQuotesView.vue') },
  { key: 'airSupplierRates', component: () => import('../views/AirSupplierRatesView.vue') },
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
    ...routes,
    { path: '/:pathMatch(.*)*', redirect: '/workspace' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
