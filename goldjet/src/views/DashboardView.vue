<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import BusinessMessages from '../components/BusinessMessages.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { WORKBENCH_PERSONAS, deriveWorkbenchTasks, getWorkbenchSummary, getWorkbenchQuickLinks, getWorkbenchPendingPage } from '../domain/workbenchTasks.js'

const router = useRouter()
const route = useRoute()
const { state, workbenchSession, selectWorkbenchPersona } = usePrototypeData()
const page = ref(1)
const persona = computed(() => WORKBENCH_PERSONAS.find(item => item.id === workbenchSession.personaId) || WORKBENCH_PERSONAS[0])
const tasks = computed(() => deriveWorkbenchTasks(state, persona.value))
const summary = computed(() => getWorkbenchSummary(tasks.value))
const taskPage = computed(() => getWorkbenchPendingPage(tasks.value, page.value, 20))
const taskLabels = { 'air-supplement': '立即补录', 'air-confirm-flight': '确认航班', 'air-complete-journey': '航程补充', 'air-loss-approval': '亏损审核', 'ground-dispatch': '立即调度', 'partner-approval':'档案审批', 'credit-approval':'额度审批' }
const messages=computed(()=>state.messages.filter(row=>row.recipient===persona.value.name || row.recipientRole===persona.value.role).slice().reverse())
const shortcuts = computed(() => getWorkbenchQuickLinks(persona.value))
const updatedAt = computed(() => state.workbenchProgress[persona.value.id]?.updatedAt || '尚无进度变化')
const unavailable = computed(() => ({
  air: '补录任务可进入订单补录并提交至待出提单；报关补料、废单审批和提单制作尚未覆盖。',
  ground: '司机异常、上游变更通知、车辆到期及中转赶单待对应篇章接入。',
  warehouse: '仓库工作台待出库指令、上游事件与入仓节点接入。',
  finance: '已接入合作方和授信审批。订单成本、付款、核销等分级结算待办尚未覆盖。',
}[persona.value.scope] || '该角色的下游业务尚未全部覆盖。'))
watch(() => persona.value.id, () => { page.value = 1 })
watch(() => taskPage.value.page, value => { if (page.value !== value) page.value = value })
watch(() => route.path, path => {
  if (path === '/finance/workspace' && persona.value.scope !== 'finance') {
    const finance = WORKBENCH_PERSONAS.find(item => item.scope === 'finance' && item.role === 'finance')
    if (finance) selectWorkbenchPersona(finance.id)
  }
}, { immediate: true })
function process(task) { if (task.target) router.push(task.target) }
</script>

<template>
  <div class="dashboard-view">
    <PageHeader :title="persona.label + '工作台'" description="待办按当前角色和订单事实汇总；处理结果与业务页面同步" />
    <div class="workbench-context">
      <span>当前处理人：<strong>{{ persona.name }}</strong></span>
      <span class="workbench-hint">通过顶部“演示角色”切换处理人；刷新恢复固定演示数据。</span>
    </div>
    <section class="workbench-progress" aria-label="待办任务统计">
      <div><span>总待办</span><strong>{{ summary.pending }}<small> 项</small></strong></div>
      <div><span>已处理</span><strong>{{ summary.completed }}<small> 项</small></strong></div>
      <div class="progress-detail">
        <span>待办任务进度 · 未处理占比</span>
        <el-progress :percentage="Number((summary.ratio * 100).toFixed(1))" :stroke-width="10" />
        <small>{{ summary.pending }} / {{ summary.total }} · 最近变化 {{ updatedAt }}</small>
      </div>
    </section>
    <el-alert class="workbench-note" :title="unavailable" type="info" :closable="false" />
    <div class="workbench-columns">
      <section class="dashboard-section">
        <div class="section-title"><h2>我的待办</h2><span>按创建时间升序 · 每页最多 20 条</span></div>
        <div class="table-scroll">
          <el-table :data="taskPage.items" row-key="id" aria-label="当前角色待办">
            <el-table-column label="任务类型" width="115"><template #default="{ row }">{{ taskLabels[row.type] || row.type }}</template></el-table-column>
            <el-table-column prop="no" label="业务单号" min-width="185" />
            <el-table-column prop="subject" label="任务详情" min-width="240">
              <template #default="{ row }"><div>{{ row.subject }}</div><small v-if="row.blockedReason" class="task-limit">{{ row.blockedReason }}</small></template>
            </el-table-column>
            <el-table-column prop="creator" label="发起人" width="110" />
            <el-table-column prop="createdAt" label="创建时间" width="165" />
            <el-table-column label="操作" width="120" fixed="right"><template #default="{ row }"><el-button link type="primary" :disabled="!row.target" @click="process(row)">{{ row.actionLabel }}</el-button></template></el-table-column>
            <template #empty><el-empty description="当前没有已接入的未处理任务" :image-size="80" /></template>
          </el-table>
        </div>
        <div class="table-pagination"><el-pagination v-model:current-page="page" layout="total, prev, pager, next" :page-size="20" :total="taskPage.total" /></div>
      </section>
      <div>
        <section class="dashboard-section">
          <div class="section-title"><h2>快捷入口</h2><span>当前角色</span></div>
          <div class="workbench-links">
            <div v-for="item in shortcuts" :key="item.label"><el-button :disabled="item.disabled" @click="router.push(item.target)">{{ item.label }}</el-button><small v-if="item.disabled">{{ item.blockedReason || '待对应篇章实现' }}</small></div>
          </div>
        </section>
        <section class="dashboard-section">
          <div class="section-title"><h2>消息通知</h2><span>每页最多 10 条</span></div>
          <p class="workbench-hint">仅本地模拟消息；没有发送至外部渠道。</p><BusinessMessages :messages="messages" />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workbench-context { display:flex; flex-wrap:wrap; gap:12px 24px; margin-bottom:20px; }
.workbench-hint, .task-limit { color:var(--muted); font-size:13px; line-height:1.6; }
.task-limit { display:block; margin-top:4px; }
.workbench-progress { display:grid; grid-template-columns:minmax(120px,1fr) minmax(120px,1fr) minmax(260px,3fr); gap:24px; padding:24px; margin-bottom:20px; border:1px solid var(--border); border-radius:7px; background:var(--surface,#fff); }
.workbench-progress > div { display:flex; flex-direction:column; gap:12px; }
.workbench-progress span, .workbench-progress small { color:var(--muted); }
.workbench-progress strong { font-size:30px; font-variant-numeric:tabular-nums; }
.workbench-progress strong small { font-size:14px; font-weight:400; }
.workbench-note { margin-bottom:20px; }
.workbench-columns { display:grid; grid-template-columns:minmax(0,3fr) minmax(260px,1fr); gap:20px; }
.workbench-links { padding:16px; display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:16px; }
.workbench-links > div { display:flex; flex-direction:column; gap:6px; }
.workbench-links small { color:var(--muted); font-size:13px; }
.workbench-links .el-button { margin:0; width:100%; }
@media (max-width:1100px) { .workbench-columns { grid-template-columns:1fr; } }
@media (max-width:650px) { .workbench-progress { grid-template-columns:1fr 1fr; } .progress-detail { grid-column:1 / -1; } }
</style>
