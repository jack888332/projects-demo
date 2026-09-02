import { createApp } from 'vue'
import AppShell from './AppShell.vue'
import { router } from './router/index.js'
import { initializePrototypeData } from './data/prototypeDataService.js'
import TableFieldSortButton from './shared/components/TableFieldSortButton.vue'
import TableActionColumn from './shared/components/TableActionColumn.vue'
import { applyUiDefaults, bindViewportMode } from './shared/config/uiDefaults.js'
import '../styles.css'
import '../billing-embedded.css'

applyUiDefaults()
bindViewportMode()

async function bootstrap() {
  try {
    await initializePrototypeData()
  } catch (error) {
    console.error('原型数据库初始化失败', error)
  }
  const app = createApp(AppShell).use(router)
  app.component('TableFieldSortButton', TableFieldSortButton)
  app.component('TableActionColumn', TableActionColumn)
  app.mount('#app')
}

bootstrap()
