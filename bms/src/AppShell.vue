<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs'
import {
  ArrowRight, Back, ChatDotSquare, DataAnalysis, Download, Files,
  Grid, List, Lock, Money, OfficeBuilding, Operation, Refresh, Search, Setting,
  Tickets, Upload, User,
} from '@element-plus/icons-vue'
import { BILLING_PATHS, BUSINESS_PATHS, COST_PATHS } from './domain/constants.js'
import { exportPrototypeData, importPrototypeData, resetPrototypeData } from './data/prototypeDataService.js'

const route = useRoute()
const router = useRouter()
const sidebarOpen = ref(false)
const dataToolsVisible = ref(false)
const fileInput = ref(null)

const billingNavigation = [
  { group: '财务日常', items: [
    { key: 'receivableSummary', label: '营收总览', path: BILLING_PATHS.receivableSummary, icon: DataAnalysis },
    { key: 'receivable', label: '应收账单', path: BILLING_PATHS.receivable, icon: Files },
    { key: 'refund', label: '返款账单', path: BILLING_PATHS.refund, icon: Tickets },
    { key: 'remittance', label: '回款管理', path: BILLING_PATHS.remittance, icon: Money },
    { key: 'adjustments', label: '调账中心', path: BILLING_PATHS.adjustments, icon: Operation },
  ] },
  { group: '核心配置', items: [
    { key: 'config', label: '账单配置', path: BILLING_PATHS.config, icon: Setting },
    { key: 'rates', label: '汇率配置', path: BILLING_PATHS.rates, icon: Money },
  ] },
  { group: '过程管控', items: [
    { key: 'tasks', label: '生成任务', path: BILLING_PATHS.tasks, icon: List, count: 4 },
    { key: 'exports', label: '导出管理', path: BILLING_PATHS.exports, icon: Download },
    { key: 'audit', label: '内部审计', path: BILLING_PATHS.audit, icon: Lock },
  ] },
  { group: '辅助测试', items: [
    { key: 'compare', label: '报表比对', path: BILLING_PATHS.compare, icon: Search },
    { key: 'migration', label: '数据迁移', path: BILLING_PATHS.migration, icon: Refresh },
  ] },
]

const costNavigation = [
  { group: '', items: [{ key: 'overview', label: '成本总览', path: COST_PATHS.overview, icon: DataAnalysis }] },
  { group: '成本管理', items: [
    { key: 'suppliers', label: '供应商管理', path: COST_PATHS.suppliers, icon: OfficeBuilding },
    { key: 'bills', label: '成本账单', path: COST_PATHS.bills, icon: Files, count: 8 },
    { key: 'pool', label: '成本池', path: COST_PATHS.pool, icon: Money, count: 23, warn: true },
  ] },
  { group: '分析与配置', items: [
    { key: 'profit', label: '利润分析', path: COST_PATHS.profit, icon: DataAnalysis },
    { key: 'rules', label: '分摊规则', path: COST_PATHS.rules, icon: List },
    { key: 'fees', label: '成本费项索引', path: COST_PATHS.fees, icon: Tickets },
  ] },
]

const businessNavigation = [
  { group: '', items: [{ key: 'routeQuotes', label: '线路报价', path: BUSINESS_PATHS.routeQuotes, icon: Operation }] },
]

const domainConfigs = {
  billing: { navigation: billingNavigation, title: '账单系统', activeMeta: 'billingMenu' },
  cost: { navigation: costNavigation, title: '成本中心', activeMeta: 'costView' },
  business: { navigation: businessNavigation, title: '业务系统', activeMeta: 'businessMenu' },
}

const domain = computed(() => route.meta.domain || 'billing')
const domainConfig = computed(() => domainConfigs[domain.value] || domainConfigs.billing)
const navigation = computed(() => domainConfig.value.navigation)
const sideTitle = computed(() => domainConfig.value.title)
const activeKey = computed(() => route.meta[domainConfig.value.activeMeta])
const backTarget = computed(() => route.meta.back || '')

function navigate(path) {
  sidebarOpen.value = false
  router.push(path)
}

async function downloadData() {
  const payload = await exportPrototypeData()
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `bms-prototype-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success('模拟数据已下载')
}

async function handleImport(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    await importPrototypeData(JSON.parse(await file.text()))
    dataToolsVisible.value = false
    ElMessage.success('模拟数据已导入')
  } catch (error) {
    ElMessage.error(error.message || '导入失败')
  }
}

async function resetData() {
  await ElMessageBox.confirm('将清除当前浏览器中的全部原型操作结果，确认继续？', '恢复初始数据', { type: 'warning' })
  await resetPrototypeData()
  dataToolsVisible.value = false
  ElMessage.success('已恢复初始模拟数据')
}
</script>

<template>
  <el-config-provider :locale="zhCn">
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">BMS</div><span>测试供应链</span></div>
<nav class="top-menu" aria-label="顶部菜单">
  <button :class="{ active: domain === 'billing' }" @click="navigate(BILLING_PATHS.receivableSummary)"><el-icon><Tickets /></el-icon><span>账单系统</span></button>
  <button :class="{ active: domain === 'cost' }" @click="navigate(COST_PATHS.overview)"><el-icon><DataAnalysis /></el-icon><span>成本中心</span></button>
  <button :class="{ active: domain === 'business' }" @click="navigate(BUSINESS_PATHS.routeQuotes)"><el-icon><Operation /></el-icon><span>业务系统</span></button>
</nav>
      <div class="top-actions">
        <button class="icon-btn topbar-icon" title="供应商管理" @click="navigate(COST_PATHS.suppliers)"><el-icon><OfficeBuilding /></el-icon></button>
        <button class="icon-btn topbar-icon" title="模拟数据管理" @click="dataToolsVisible = true"><el-icon><Upload /></el-icon></button>
        <button class="icon-btn topbar-icon" title="应用"><el-icon><Grid /></el-icon></button>
        <button class="icon-btn topbar-icon" title="消息"><el-icon><ChatDotSquare /></el-icon><span class="notification-dot" /></button>
        <span class="avatar"><User /></span><span class="user-name">财务管理员</span>
      </div>
    </header>

    <aside id="sidebar" :class="['sidebar', { open: sidebarOpen }]">
      <nav class="side-nav">
        <template v-for="group in navigation" :key="group.group || 'root'">
          <div v-if="group.group" class="nav-group-label">{{ group.group }}</div>
          <button v-for="item in group.items" :key="item.key" :class="['nav-item', { active: activeKey === item.key }]" @click="navigate(item.path)">
            <el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span>
            <span v-if="item.count" :class="['nav-count', { warn: item.warn }]">{{ item.count }}</span>
          </button>
        </template>
      </nav>
      <div class="sidebar-foot"><span>{{ sideTitle }}操作指引</span></div>
    </aside>

    <main class="workspace">
      <div class="route-tabs">
        <div class="route-crumbs">
          <button class="sidebar-toggle icon-btn" title="展开或收起菜单" @click="sidebarOpen = !sidebarOpen"><el-icon><Grid /></el-icon></button>
          <span>BMS</span><el-icon><ArrowRight /></el-icon><span class="current-route">{{ route.meta.title }}</span>
        </div>
        <button v-if="backTarget" class="route-back" title="返回上级页面" @click="navigate(backTarget)"><el-icon><Back /></el-icon><span>返回</span></button>
      </div>
      <section id="content" class="content"><RouterView /></section>
    </main>
  </div>

  <el-dialog v-model="dataToolsVisible" title="模拟数据管理" class="module-dialog" align-center append-to-body destroy-on-close>
      <div class="data-tools-note">账单系统、成本中心与业务系统的演示数据统一保存在当前浏览器的 IndexedDB 中。</div>
    <div class="data-tools-grid">
      <button type="button" @click="downloadData"><el-icon><Download /></el-icon><span><strong>下载</strong><small>下载账单、任务、供应商、成本和分摊模拟数据</small></span></button>
      <button type="button" @click="fileInput?.click()"><el-icon><Upload /></el-icon><span><strong>导入模拟数据</strong><small>使用已导出的 JSON 覆盖当前浏览器数据</small></span></button>
      <button type="button" class="danger" @click="resetData"><el-icon><Refresh /></el-icon><span><strong>恢复初始数据</strong><small>清除操作结果并重新载入全部演示数据</small></span></button>
    </div>
    <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="handleImport">
    <template #footer><el-button @click="dataToolsVisible = false">关闭</el-button></template>
  </el-dialog>
  </el-config-provider>
</template>

<style scoped>
.data-tools-note { margin-bottom: var(--space-4); padding: var(--space-3); color: var(--muted); background: var(--primary-soft); }
.data-tools-grid { display: grid; gap: var(--space-3); }
.data-tools-grid button { min-height: 72px; padding: var(--space-3) var(--space-4); display: flex; align-items: center; gap: var(--space-3); border: 1px solid var(--border); border-radius: 4px; color: var(--ink); background: #fff; text-align: left; cursor: pointer; }
.data-tools-grid button:hover { border-color: var(--primary); background: var(--primary-soft); }.data-tools-grid button.danger:hover { border-color: var(--danger); color: var(--danger); background: #fff4f5; }
.data-tools-grid .el-icon { font-size: 22px; }.data-tools-grid span { display: flex; flex-direction: column; gap: var(--space-1); }.data-tools-grid small { color: var(--muted); }
</style>
