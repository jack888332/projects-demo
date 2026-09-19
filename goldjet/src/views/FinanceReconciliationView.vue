<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Back, Check, Delete, Download, Message, Plus, View } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import OrderCostFacts from '../components/finance/OrderCostFacts.vue'
import OrderCostAttachments from '../components/finance/OrderCostAttachments.vue'
import ReconciliationFilters from '../components/finance/ReconciliationFilters.vue'
import ReconciliationLines from '../components/finance/ReconciliationLines.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canReadModule, canWriteModule, accessState } from '../data/accessControl.js'
import { captureReconciliationContext } from '../data/reconciliationActions.js'
import { RECONCILIATION_CREATE_ROLES, RECONCILIATION_CONFIRM_ROLES } from '../domain/reconciliationAccess.js'
import { WORKBENCH_PERSONAS } from '../domain/workbenchTasks.js'
import { STATEMENT_HEAD_COLUMNS, statementRows, pendingStatementCosts, statementDetails, statementTotals, statementDraft, statementFileError, statementAttachmentError, matchesStatementQuery } from '../domain/reconciliation.js'
import { money, cloneCost } from '../domain/orderCosts.js'

const data = usePrototypeData(), { state, workbenchSession } = data
const route = useRoute(), router = useRouter()
const direction = computed(() => route.query.direction === '应付' ? '应付' : '应收')
const tab = computed(() => ['pending','details'].includes(route.query.tab) ? route.query.tab : 'statements')
const creating = computed(() => route.query.view === 'create')
const selectedStatement = computed(() => statementRows(state, direction.value).find(row => row.id === route.query.statement))
const canCreate = computed(() => canWriteModule('reconciliation') && RECONCILIATION_CREATE_ROLES.includes(workbenchSession.personaId))
const canConfirm = computed(() => canWriteModule('reconciliation') && RECONCILIATION_CONFIRM_ROLES.includes(workbenchSession.personaId))
const canOpenCosts = computed(() => canReadModule('costs'))
const query = ref({}), selection = ref([]), draft = ref(null), failure = ref(''), busy = ref(false), uploading = ref(false), issues = ref(false)
const active = computed(() => creating.value ? draft.value : selectedStatement.value)
const rows = computed(() => {
  const source = tab.value === 'pending' ? pendingStatementCosts(state, direction.value) : tab.value === 'details' ? statementDetails(state, direction.value) : statementRows(state, direction.value)
  return source.filter(row => matchesStatementQuery(row, query.value, tab.value))
})
const totals = computed(() => statementTotals(active.value?.lines || []))
const pagerKey = computed(() => `${direction.value}:${tab.value}:${JSON.stringify(query.value)}`)
const headEntries = computed(() => active.value ? STATEMENT_HEAD_COLUMNS.map(([key, label]) => [label, key === 'period' ? '待确认（195）' : key === 'statementNo' ? active.value[key] || '保存后生成' : key === 'createdAt' ? active.value[key]?.slice(0,10) : active.value[key]]) : [])
let alive = true
const capture = value => captureReconciliationContext(state, value, () => alive)
async function confirm(message, title, value) {
  const current = capture(value)
  try {
    await ElMessageBox.confirm(message, title, { confirmButtonText:'确认', cancelButtonText:'取消', type:'warning' })
    if (!current()) { ElMessage.warning('数据或权限已变化，请重新操作'); return false }
    return true
  } catch { return false }
}
async function leave() {
  if (busy.value || uploading.value) { ElMessage.warning('当前操作尚未结束'); return false }
  if (!draft.value) return true
  return confirm('放弃本次尚未保存的对账单、备注和附件？', '放弃新增', draft.value)
}
onBeforeRouteLeave(leave)
onBeforeRouteUpdate(leave)
function unload(event) { if (draft.value || uploading.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', unload))
onBeforeUnmount(() => { alive = false; window.removeEventListener('beforeunload', unload) })
watch(() => route.fullPath, () => {
  query.value = {}; selection.value = []; failure.value = ''
  if (!creating.value) draft.value = null
})
watch(() => [workbenchSession.personaId, accessState.revision, state.reconciliation], () => {
  draft.value = null; selection.value = []; query.value = {}; failure.value = ''; uploading.value = false; busy.value = false
})
function navigate(nextTab = tab.value, nextDirection = direction.value, statement = '') {
  return router.push({ path:'/finance/reconciliation', query:{ direction:nextDirection, tab:nextTab, ...(statement ? {statement} : {}) } })
}
async function startCreate(byQuery) {
  failure.value = ''
  try {
    if (!canCreate.value) throw new Error('当前岗位仅可查看')
    const actor = WORKBENCH_PERSONAS.find(row => row.id === workbenchSession.personaId)
    const next = statementDraft(state, (byQuery ? rows.value : selection.value).map(row => row.id), direction.value, actor)
    const current = capture(next)
    await router.push({ path:'/finance/reconciliation', query:{ direction:direction.value, tab:'pending', view:'create' } })
    if (current() && creating.value) draft.value = next
  } catch (error) { failure.value = error.message }
}
async function save(confirmNow) {
  if (!draft.value || busy.value || uploading.value) return
  const attachmentError = statementAttachmentError(draft.value.attachments)
  if (draft.value.remark.length > 200 || attachmentError) { failure.value = attachmentError || '备注不超过200字'; return }
  const current = draft.value
  busy.value = true; failure.value = ''
  try {
    if (!await confirm(`${confirmNow ? '已取得对方确认，保存并确认' : '保存'}${direction.value}对账单：${current.settlementParty}，共${current.lines.length}条明细？`, confirmNow ? '确认对账单无误' : '保存确认', current)) return
    const saved = data.saveStatement(cloneCost(current), confirmNow)
    draft.value = null; busy.value = false
    await navigate('pending')
    ElMessage.success(`${saved.statementNo} 已${confirmNow ? '确认' : '保存'}`)
  } catch (error) { failure.value = error.message }
  finally { busy.value = false }
}
async function confirmExisting(row) {
  if (busy.value) return
  busy.value = true; failure.value = ''
  try {
    if (!await confirm(`确认 ${row.statementNo}（${row.settlementParty}）已获对方核对无误？确认后不可修改或删除。`, '对账单确认', row)) return
    data.confirmStatement(row.id); ElMessage.success('对账单已确认')
  } catch (error) { failure.value = error.message }
  finally { busy.value = false }
}
function exportDetails() {
  try {
    const result = data.exportStatementDetails(direction.value, cloneCost(query.value))
    const url = URL.createObjectURL(new Blob([result.content], {type:'text/csv;charset=utf-8'}))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.name; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    ElMessage.success(`已导出${result.count}条明细`)
  } catch (error) { failure.value = error.message }
}
function openSource(row) { router.push({path:'/finance/costs',query:{tab:'summary',order:row.orderId}}) }
</script>

<template>
  <div class="module-view reconciliation-view">
    <PageHeader :title="creating ? `新建${direction}对账单` : selectedStatement ? `${direction}对账单详情` : '对账管理'">
      <template #actions><el-button v-if="creating||route.query.statement" :icon="Back" @click="navigate(creating?'pending':'statements')">返回列表</el-button><el-button :icon="View" @click="issues=!issues">待确认规则</el-button></template>
    </PageHeader>
    <el-alert v-if="issues" class="notice" type="warning" :closable="false" title="待确认规则">
      <p>194：新建占用与删除释放；195：周期来源；196：标准模板选用；197：邮件收件人与发送结果；198：附件格式与保存后维护；199：部分查询字段映射；200：跨公司组单与岗位操作边界。调整单财务生效仍受188限制。</p>
    </el-alert>
    <el-alert v-if="failure" class="notice" type="error" :title="failure" @close="failure=''"/>
    <template v-if="!creating&&!route.query.statement">
      <el-radio-group :model-value="direction" aria-label="对账方向" @update:model-value="navigate('statements',$event)"><el-radio-button value="应收">应收对账单</el-radio-button><el-radio-button value="应付">应付对账单</el-radio-button></el-radio-group>
      <el-tabs :model-value="tab" @update:model-value="navigate($event)"><el-tab-pane label="对账单列表" name="statements"/><el-tab-pane label="待对账列表" name="pending"/><el-tab-pane label="对账单明细列表" name="details"/></el-tabs>
      <ReconciliationFilters :key="`${direction}:${tab}:${workbenchSession.personaId}:${accessState.revision}`" :mode="tab" :direction="direction" @query="query=$event;selection=[]"/>
      <DataTableFrame :key="pagerKey" :rows="rows" :page-size="50" :page-sizes="[50]" :selectable="tab==='pending'&&canCreate" :selected-count="selection.length">
        <template #actions>
          <template v-if="tab==='pending'&&canCreate"><el-button :icon="Plus" type="primary" :disabled="!selection.length" @click="startCreate(false)">按勾选创建</el-button><el-button :icon="Plus" :disabled="!rows.length" @click="startCreate(true)">按查询条件创建</el-button></template>
          <el-button v-if="tab==='details'" :icon="Download" :disabled="!rows.length" @click="exportDetails">导出查询结果</el-button>
        </template>
        <template #default="{rows:pageRows}">
          <ReconciliationLines v-if="tab!=='statements'" :rows="pageRows" :details="tab==='details'" :selectable="tab==='pending'&&canCreate" :source-link="canOpenCosts" @selection="selection=$event" @source="openSource" @statement="navigate('details',direction,$event)"/>
          <el-table v-else :data="pageRows" row-key="id" aria-label="对账单列表">
            <el-table-column v-for="[key,label,width] in STATEMENT_HEAD_COLUMNS" :key="key" :label="label" :min-width="width">
              <template #default="{row}"><el-button v-if="key==='statementNo'" link type="primary" @click="navigate('statements',direction,row.id)">{{row.statementNo}}</el-button><StatusTag v-else-if="key==='status'" :label="row.status"/><template v-else-if="key==='period'">待确认</template><template v-else-if="key==='createdAt'">{{row.createdAt.slice(0,10)}}</template><template v-else>{{row[key]}}</template></template>
            </el-table-column>
            <el-table-column label="操作" :width="canCreate?300:90" fixed="right"><template #default="{row}">
              <el-button link type="primary" :icon="View" @click="navigate('statements',direction,row.id)">查看</el-button>
              <template v-if="row.status==='新建'&&canCreate">
                <el-button link type="primary" :icon="Check" :disabled="!canConfirm||busy" :title="canConfirm?'确认对账单':'独立确认的岗位授权待确认（200）'" @click="confirmExisting(row)">确认</el-button>
                <el-tooltip content="删除授权与明细释放规则待确认（194、200）"><span><el-button link :icon="Delete" disabled>删除</el-button></span></el-tooltip>
                <el-tooltip content="收件人和发送规则待确认（197），未连接邮件服务"><span><el-button link :icon="Message" disabled>邮件</el-button></span></el-tooltip>
              </template>
            </template></el-table-column>
          </el-table>
        </template>
      </DataTableFrame>
    </template>
    <template v-else-if="active">
      <OrderCostFacts :entries="headEntries"/>
      <el-alert class="notice" title="应收应付周期来源待确认（195），当前未写入周期值。" type="warning" :closable="false"/>
      <div class="statement-totals" aria-label="分币种合计"><div v-for="total in totals" :key="total.currency"><span>{{total.currency}} 合计</span><strong>{{money(total.amount)}}</strong></div></div>
      <section class="statement-section">
        <el-form v-if="creating" label-position="top"><el-form-item label="备注"><el-input v-model="draft.remark" aria-label="对账单备注" type="textarea" :rows="3" maxlength="200" show-word-limit :disabled="busy"/></el-form-item></el-form>
        <OrderCostFacts v-else :entries="[['备注',active.remark||'未填写'],['更新人',active.updatedBy],['更新时间',active.updatedAt],['确认人',active.confirmedBy||'尚未确认'],['确认时间',active.confirmedAt||'尚未确认']]"/>
        <h2>附件</h2>
        <OrderCostAttachments :key="creating?`draft:${workbenchSession.personaId}`:active.id" :model-value="active.attachments" :readonly="!creating||busy" :validate-file="statementFileError" accept=".txt,.csv,.pdf,.png,.jpg,.jpeg,.webp,.gif" input-label="选择对账附件" duplicate-message="同名附件替换或并存规则待确认（198）" @update:model-value="draft&&(draft.attachments=$event)" @busy="uploading=$event"/>
      </section>
      <section class="statement-section"><h2>对账明细</h2><DataTableFrame :rows="active.lines" :page-size="50" :page-sizes="[50]"><template #default="{rows:pageRows}"><ReconciliationLines :rows="pageRows" :source-link="canOpenCosts&&!creating" @source="openSource"/></template></DataTableFrame></section>
      <section v-if="!creating" class="statement-section"><h2>操作记录</h2><el-table :data="active.history"><el-table-column prop="action" label="操作"/><el-table-column prop="actor" label="操作人" min-width="140"/><el-table-column prop="time" label="时间" min-width="180"/></el-table></section>
      <div class="statement-actions">
        <el-button :icon="Back" :disabled="busy||uploading" @click="navigate(creating?'pending':'statements')">返回列表</el-button>
        <el-tooltip content="高捷标准模板及选用规则待确认（196）；明细列表可导出CSV"><span><el-button :icon="Download" disabled>导出标准对账单</el-button></span></el-tooltip>
        <template v-if="creating&&canCreate"><el-button :icon="Check" :disabled="busy||uploading" @click="save(false)">保存</el-button><el-button :icon="Check" type="primary" :disabled="busy||uploading" @click="save(true)">保存并确认</el-button></template>
      </div>
    </template>
    <el-empty v-else :description="creating?'没有未保存的对账单，请返回待对账列表重新选择':'对账单不存在、已删除或不属于当前对账方向'"/>
  </div>
</template>

<style scoped>
.reconciliation-view{min-width:0}.notice{margin-block:12px}.notice p{margin:4px 0;line-height:1.8}.el-tabs{margin-top:16px}.statement-section{padding-block:20px;border-top:1px solid var(--border)}.statement-section h2{font-size:15px;font-weight:600;margin:0 0 14px}.statement-totals{display:flex;flex-wrap:wrap;gap:20px 48px;padding:20px 0}.statement-totals>div{display:flex;flex-direction:column;gap:8px}.statement-totals span{color:var(--muted);font-size:13px}.statement-totals strong{font-size:22px;color:var(--text)}.statement-actions{display:flex;flex-wrap:wrap;gap:10px;padding-block:20px;border-top:1px solid var(--border)}.statement-actions .el-button{margin:0}.statement-section :deep(textarea){max-width:100%}
</style>
