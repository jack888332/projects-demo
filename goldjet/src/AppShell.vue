<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell, Grid, Operation, Refresh, UserFilled } from '@element-plus/icons-vue'
import { domains, moduleCatalog, navigationByDomain } from './domain/catalog.js'
import { usePrototypeData } from './data/usePrototypeData.js'

const route = useRoute()
const router = useRouter()
const sidebarOpen = ref(false)
const resetVisible = ref(false)
const { reset } = usePrototypeData()

const currentDomain = computed(() => route.meta.domain || 'workspace')
const currentGroups = computed(() => navigationByDomain[currentDomain.value] || [])
const currentDomainLabel = computed(() => domains.find((item) => item.id === currentDomain.value)?.label || '运营总览')

function navigate(path) {
  sidebarOpen.value = false
  router.push(path)
}

function confirmReset() {
  reset()
  resetVisible.value = false
  ElMessage.success('已恢复确定性演示数据')
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <button class="brand" type="button" aria-label="返回运营总览" @click="navigate('/workspace')">
        <span class="brand-mark">GJ</span><span class="brand-name">高捷物流</span>
      </button>
      <nav class="top-menu" aria-label="产品主导航">
        <button v-for="domain in domains" :key="domain.id" :class="{ active: currentDomain === domain.id }" @click="navigate(domain.defaultPath)">
          <el-icon><component :is="domain.icon" /></el-icon><span>{{ domain.label }}</span>
        </button>
      </nav>
      <div class="top-actions">
        <button class="icon-button" title="恢复演示数据" aria-label="恢复演示数据" @click="resetVisible = true"><el-icon><Refresh /></el-icon></button>
        <button class="icon-button" title="应用菜单" aria-label="应用菜单"><el-icon><Grid /></el-icon></button>
        <button class="icon-button has-dot" title="消息中心" aria-label="消息中心" @click="navigate('/foundation/messages')"><el-icon><Bell /></el-icon></button>
        <span class="avatar"><el-icon><UserFilled /></el-icon></span><span class="user-name">运营管理员</span>
      </div>
    </header>

    <aside v-if="currentDomain !== 'workspace'" :class="['sidebar', { open: sidebarOpen }]">
      <div class="sidebar-title">{{ currentDomainLabel }}</div>
      <nav class="side-nav" aria-label="业务模块导航">
        <template v-for="group in currentGroups" :key="group.group">
          <div class="nav-group-label">{{ group.group }}</div>
          <button v-for="item in group.items" :key="item.key" :class="['nav-item', { active: route.meta.moduleKey === item.key }]" @click="navigate(item.path)">
            <el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span>
          </button>
        </template>
      </nav>
      <div class="sidebar-foot">一期系统业务工作台</div>
    </aside>

    <main :class="['workspace', { full: currentDomain === 'workspace' }]">
      <div class="routebar">
        <button v-if="currentDomain !== 'workspace'" class="sidebar-toggle icon-button" title="展开或收起菜单" @click="sidebarOpen = !sidebarOpen"><el-icon><Operation /></el-icon></button>
        <span>高捷物流</span><span class="route-divider">/</span><strong>{{ route.meta.title }}</strong>
      </div>
      <section class="content"><RouterView /></section>
    </main>
  </div>

  <el-dialog v-model="resetVisible" title="恢复演示数据" width="480" align-center>
    <p class="dialog-copy">此操作会清除当前会话中的订单、调度、仓储、费用和合作方操作结果，并恢复到固定演示数据。</p>
    <template #footer>
      <el-button @click="resetVisible = false">取消</el-button>
      <el-button type="danger" @click="confirmReset">确认恢复</el-button>
    </template>
  </el-dialog>
</template>
