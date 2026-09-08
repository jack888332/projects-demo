import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs'
import 'element-plus/dist/index.css'
import AppShell from './AppShell.vue'
import { router } from './router/index.js'
import './styles.css'

createApp(AppShell)
  .use(router)
  .use(ElementPlus, { locale: zhCn })
  .mount('#app')
