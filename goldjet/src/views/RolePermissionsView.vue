<script setup>
import { computed, ref, onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { Check, Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import { WORKBENCH_PERSONAS } from '../domain/workbenchTasks.js'
import { moduleCatalog, domains } from '../domain/catalog.js'
import { accessState, isSuperAdmin, rolePermissionDraft, saveRolePermissions, resetRolePermissions, groundServicePermissions, saveGroundServicePermissions, stationAccessCeiling } from '../data/accessControl.js'
import { GROUND_SERVICE_OPERATIONS, groundAccount } from '../domain/groundService.js'
import { financeBasicCeiling } from '../domain/financeBasicAccess.js'

const selected = ref('service'), keyword = ref(''), domain = ref(''), tab = ref('permissions')
const draft = ref(rolePermissionDraft(selected.value)), baseline = ref(JSON.stringify(draft.value)), groundDraft = ref([]), groundBaseline = ref('')
const dirty = computed(() => JSON.stringify(draft.value) !== baseline.value || JSON.stringify(groundDraft.value) !== groundBaseline.value)
const locked = computed(() => selected.value === 'superAdmin' || !isSuperAdmin())
const moduleLocked = (key, field) => locked.value || key === 'permissions' || selected.value === 'driver' && key !== 'driver' || selected.value === 'stationPallet' && !stationAccessCeiling(key)[field] || financeBasicCeiling(key,selected.value)?.[field]===false
const roles = computed(() => WORKBENCH_PERSONAS.filter(role => !keyword.value || `${role.label} ${role.name}`.includes(keyword.value.trim())))
const rows = computed(() => Object.entries(moduleCatalog).filter(([, item]) => !domain.value || item.domain === domain.value).map(([key, item]) => ({ key, ...item })))
const role = computed(() => WORKBENCH_PERSONAS.find(item => item.id === selected.value))
const history = computed(() => accessState.history.filter(item => item.role === selected.value))
function hydrate() { draft.value = rolePermissionDraft(selected.value); baseline.value = JSON.stringify(draft.value); groundDraft.value = [...groundServicePermissions(selected.value)]; groundBaseline.value = JSON.stringify(groundDraft.value) }
hydrate()
async function allowLeave() {
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('尚有未保存的权限配置，是否放弃？', '未保存的配置', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true } catch { return false }
}
async function selectRole(id) { if (id !== selected.value && await allowLeave()) { selected.value = id; hydrate() } }
function save() {
  try { const changed = saveRolePermissions(selected.value, draft.value); const groundChanged = groundAccount(selected.value) ? saveGroundServicePermissions(selected.value, groundDraft.value) : false; hydrate(); ElMessage.success(changed || groundChanged ? '权限已生效' : '配置未变化') } catch (error) { ElMessage.error(error.message) }
}
async function restore() {
  try {
    await ElMessageBox.confirm('恢复该角色的默认访问配置，并放弃当前未保存的修改？', '恢复角色默认权限', { confirmButtonText: '确认恢复', cancelButtonText: '取消', type: 'warning' })
    resetRolePermissions(selected.value); if (groundAccount(selected.value)) saveGroundServicePermissions(selected.value, groundAccount(selected.value).operations); hydrate(); ElMessage.success('已恢复默认权限')
  } catch (error) { if (error instanceof Error) ElMessage.error(error.message) }
}
onBeforeRouteLeave(allowLeave)
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>

<template>
  <div class="module-view permission-view">
    <PageHeader title="角色权限"><template #actions><el-button :icon="Refresh" :disabled="locked" @click="restore">恢复默认</el-button><el-button type="primary" :icon="Check" :disabled="locked || !dirty" @click="save">保存配置</el-button></template></PageHeader>
    <div class="permission-layout">
      <aside class="role-list" aria-label="角色列表">
        <el-input v-model="keyword" placeholder="搜索角色" clearable aria-label="搜索角色" />
        <div class="role-options">
        <button v-for="item in roles" :key="item.id" :class="['role-option', { active: selected === item.id }]" :aria-pressed="selected === item.id" @click="selectRole(item.id)"><strong>{{ item.label }}</strong><span>{{ item.name }}</span></button>
        <el-empty v-if="!roles.length" description="没有匹配角色" :image-size="60" />
        </div>
      </aside>
      <section class="permission-content">
        <div class="permission-heading"><h2>{{ role.label }}</h2><el-tag v-if="dirty" type="warning">未保存</el-tag><el-tag v-else type="success">已生效</el-tag></div>
        <p class="permission-scope">{{ locked ? '全模块、全演示数据只读；可配置角色权限。该角色的访问权限固定。' : '数据范围沿用各业务岗位规则；业务操作开启后仍需满足岗位授权、对象归属和状态条件。' }}</p>
        <el-tabs v-model="tab"><el-tab-pane label="访问配置" name="permissions" /><el-tab-pane :label="`变更记录（${history.length}）`" name="history" /></el-tabs>
        <template v-if="tab === 'permissions'">
          <el-select v-model="domain" clearable placeholder="全部业务域" aria-label="筛选业务域"><el-option v-for="item in domains" :key="item.id" :label="item.label" :value="item.id" /></el-select>
          <div class="permission-table"><el-table :data="rows" row-key="key" max-height="calc(100vh - 370px)" aria-label="角色权限配置">
            <el-table-column label="模块" min-width="170"><template #default="{ row }"><strong>{{ row.label }}</strong><small>{{ domains.find(item => item.id === row.domain)?.label }}</small></template></el-table-column>
            <el-table-column label="菜单可见" width="115"><template #default="{ row }"><el-switch v-model="draft[row.key].menu" :disabled="moduleLocked(row.key,'menu')" :aria-label="`${row.label}菜单可见`" /></template></el-table-column>
            <el-table-column label="页面访问" width="115"><template #default="{ row }"><el-switch v-model="draft[row.key].page" :disabled="moduleLocked(row.key,'page')" :aria-label="`${row.label}页面访问`" /></template></el-table-column>
            <el-table-column label="数据查看" width="115"><template #default="{ row }"><el-switch v-model="draft[row.key].data" :disabled="moduleLocked(row.key,'data')" :aria-label="`${row.label}数据查看`" /></template></el-table-column>
            <el-table-column label="业务操作" width="115"><template #default="{ row }"><el-switch v-model="draft[row.key].write" :disabled="moduleLocked(row.key,'write')" :aria-label="`${row.label}业务操作`" /></template></el-table-column>
          </el-table></div>
          <section v-if="groundAccount(selected)" class="ground-operation-policy"><div class="policy-heading"><div><h3>地面服务操作项</h3><p>按单个操作项控制小程序入口；页面与数据权限仍由上方模块配置决定。</p></div><el-tag>{{ groundDraft.length }}/{{ groundAccount(selected).operations.length }} 已授权</el-tag></div><div class="operation-policy-grid"><label v-for="item in GROUND_SERVICE_OPERATIONS" :key="item.id" :class="['operation-policy', { enabled: groundDraft.includes(item.id) }]"><el-checkbox :model-value="groundDraft.includes(item.id)" :disabled="locked || !groundAccount(selected).operations.includes(item.id)" @change="value => groundDraft = value ? [...groundDraft, item.id] : groundDraft.filter(id => id !== item.id)">{{ item.label }}</el-checkbox><small>{{ item.number }} · {{ item.target }}<template v-if="!groundAccount(selected).operations.includes(item.id)"> · 岗位未开放</template></small></label></div></section>
        </template>
        <el-table v-else :data="history" aria-label="权限变更记录"><el-table-column prop="id" label="序号" width="80" /><el-table-column prop="actor" label="操作人" width="130" /><el-table-column prop="action" label="操作" width="120" /><el-table-column label="变更模块" min-width="240"><template #default="{ row }">{{ row.modules.map(key => moduleCatalog[key].label).join('、') }}</template></el-table-column><template #empty>暂无权限变更</template></el-table>
      </section>
    </div>
  </div>
</template>

<style scoped>
.permission-layout { display:grid; grid-template-columns:220px minmax(0, 1fr); gap:24px; }
.role-list { border-right:1px solid var(--border); padding-right:16px; min-width:0; }
.role-options { max-height:calc(100vh - 280px); overflow:auto; margin-top:8px; }
.role-option { display:flex; flex-direction:column; gap:5px; width:100%; padding:11px 12px; margin-top:4px; border:0; border-radius:4px; background:transparent; color:var(--text); text-align:left; cursor:pointer; }
.role-option.active { background:#eaf3fa; color:#165c91; }
.role-option:hover { background:#f0f4f7; }
.role-option span, .permission-scope, small { color:var(--muted); font-size:12px; }
.permission-content { min-width:0; }
.permission-heading { display:flex; align-items:center; gap:12px; }
h2 { margin:0; font-size:18px; }
.permission-scope { line-height:1.7; margin:10px 0; }
.permission-table { overflow:auto; margin-top:16px; }
.permission-table .el-table { min-width:630px; }
.ground-operation-policy { border-top:1px solid var(--border); margin-top:24px; padding-top:20px; }.policy-heading { display:flex; justify-content:space-between; gap:16px; align-items:start; }.policy-heading h3 { margin:0 0 6px; font-size:16px; }.policy-heading p { margin:0; color:var(--muted); font-size:12px; }.operation-policy-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:16px; }.operation-policy { display:flex; flex-direction:column; gap:4px; padding:12px; border:1px solid var(--border); border-radius:5px; }.operation-policy.enabled { border-color:#9fc5b3; background:#f3faf6; }.operation-policy small { padding-left:24px; }
small { display:block; font-weight:400; }
@media(max-width:760px) { .permission-layout { grid-template-columns:minmax(0,1fr); gap:18px; } .role-list { border-right:0; border-bottom:1px solid var(--border); padding:0 0 10px; } .role-options { max-height:160px; } .operation-policy-grid { grid-template-columns:minmax(0,1fr); } }
</style>
