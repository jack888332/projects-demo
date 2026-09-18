<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell, Grid, Operation, Refresh, UserFilled } from '@element-plus/icons-vue'
import { domains, moduleCatalog, navigationByDomain } from './domain/catalog.js'
import { usePrototypeData } from './data/usePrototypeData.js'
import { WORKBENCH_PERSONAS } from './domain/workbenchTasks.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { accessState, canSeeMenu, canReadModule, getModuleAccess } from './data/accessControl.js'

const route = useRoute()
const router = useRouter()
const sidebarOpen = ref(false)
const resetVisible = ref(false)
const { reset, loadDemoOverview, workbenchSession, selectWorkbenchPersona } = usePrototypeData()
const activePersona = computed(() => WORKBENCH_PERSONAS.find(item => item.id === workbenchSession.personaId) || WORKBENCH_PERSONAS[0])

const currentDomain = computed(() => route.meta.domain || 'workspace')
const currentGroups = computed(() => (navigationByDomain[currentDomain.value] || []).map(group => ({ ...group, items: group.items.filter(item => canSeeMenu(item.key)) })).filter(group => group.items.length))
const visibleDomains = computed(() => domains.flatMap(domain => {
  const first = Object.entries(moduleCatalog).find(([key, item]) => item.domain === domain.id && canSeeMenu(key))
  return first ? [{ ...domain, defaultPath: canSeeMenu(Object.keys(moduleCatalog).find(key => moduleCatalog[key].path === domain.defaultPath)) ? domain.defaultPath : first[1].path }] : []
}))
const currentDomainLabel = computed(() => domains.find((item) => item.id === currentDomain.value)?.label || '运营总览')

function navigate(path) {
  sidebarOpen.value = false
  router.push(path)
}

function confirmReset() {
  reset()
  selectWorkbenchPersona('superAdmin')
  loadDemoOverview()
  resetVisible.value = false
  ElMessage.success('已恢复确定性演示数据')
}
async function changeAirRole(id) {
  if (id === workbenchSession.personaId) return
  try {
    await ElMessageBox.confirm('切换角色会关闭或重载当前表单，尚未提交的输入将丢弃。', '切换演示角色？', { confirmButtonText: '切换角色', cancelButtonText: '保留当前角色', type: 'warning' })
    selectWorkbenchPersona(id)
  } catch { /* Keep the active role and draft. */ }
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <button class="brand" type="button" aria-label="返回运营总览" @click="navigate('/workspace')">
        <span class="brand-mark">GJ</span><span class="brand-name">高捷物流</span>
      </button>
      <nav class="top-menu" aria-label="产品主导航">
        <button v-for="domain in visibleDomains" :key="domain.id" :class="{ active: currentDomain === domain.id }" @click="navigate(domain.defaultPath)">
          <el-icon><component :is="domain.icon" /></el-icon><span>{{ domain.label }}</span>
        </button>
      </nav>
      <div class="top-actions">
        <button class="icon-button" title="恢复演示数据" aria-label="恢复演示数据" @click="resetVisible = true"><el-icon><Refresh /></el-icon></button>
        <el-popover placement="bottom" :width="300" trigger="click"><template #reference><button class="icon-button" title="演示角色" aria-label="切换演示角色"><el-icon><Grid /></el-icon></button></template>
          <p><strong>演示角色</strong></p><p>仅模拟本地处理人，不代表真实鉴权。</p><el-select :model-value="workbenchSession.personaId" aria-label="演示角色" @change="changeAirRole"><el-option v-for="persona in WORKBENCH_PERSONAS" :key="persona.id" :value="persona.id" :label="persona.label + ' · ' + persona.name" /></el-select>
        </el-popover>
        <button v-if="canSeeMenu('messages')" class="icon-button has-dot" title="消息中心" aria-label="消息中心" @click="navigate('/foundation/messages')"><el-icon><Bell /></el-icon></button>
        <span class="avatar"><el-icon><UserFilled /></el-icon></span><span class="user-name">{{ activePersona.label }} · {{ activePersona.name }}</span>
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
      <section class="content"><RouterView v-if="canReadModule(route.meta.moduleKey)" :key="workbenchSession.personaId + ':' + (route.meta.moduleKey === 'permissions' ? 0 : accessState.revision)" /><el-empty v-else :description="getModuleAccess(route.meta.moduleKey).page ? '当前角色无该模块的数据查看权限' : '当前角色无该页面访问权限'" /></section>
    </main>
  </div>

  <el-dialog v-model="resetVisible" title="恢复演示数据" width="480" align-center>
    <p class="dialog-copy">此操作会清除当前会话中的业务操作与角色权限配置，恢复固定演示数据，并切换为超级管理员。</p>
    <template #footer>
      <el-button @click="resetVisible = false">取消</el-button>
      <el-button type="danger" @click="confirmReset">确认恢复</el-button>
    </template>
  </el-dialog>
</template>
