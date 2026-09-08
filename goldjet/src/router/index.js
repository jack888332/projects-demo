import { createRouter, createWebHashHistory } from 'vue-router'
import { genericModuleKeys, moduleCatalog } from '../domain/catalog.js'

const coreRoutes = [
  { key: 'dashboard', component: () => import('../views/DashboardView.vue') },
  { key: 'airOrders', component: () => import('../views/AirOrdersView.vue') },
  { key: 'groundDispatch', component: () => import('../views/GroundDispatchView.vue') },
  { key: 'warehouseOrders', component: () => import('../views/WarehouseOrdersView.vue') },
  { key: 'costs', component: () => import('../views/FinanceCostsView.vue') },
  { key: 'partners', component: () => import('../views/PartnersView.vue') },
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
