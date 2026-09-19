<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Back, Check, Close, Delete, Download, Plus, Promotion, View } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import OrderCostFacts from '../components/finance/OrderCostFacts.vue'
import OrderCostAttachments from '../components/finance/OrderCostAttachments.vue'
import ApplicationFilters from '../components/finance/ApplicationFilters.vue'
import ApplicationLines from '../components/finance/ApplicationLines.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canReadModule, canWriteModule, accessState } from '../data/accessControl.js'
import { captureApplicationContext } from '../data/financeApplicationActions.js'
import { canReadApplicationKind } from '../domain/financeApplicationAccess.js'
import { APPLICATION_HEAD_COLUMNS, applicationRows, applicationSources, applicationDraft, applicationTotals, matchesApplicationQuery, requestedAmountError, receiptAccountOptions, receiptAccountSnapshot, applicationFileError, applicationAttachmentError } from '../domain/financeApplications.js'
import { WORKBENCH_PERSONAS } from '../domain/workbenchTasks.js'
import { money, cloneCost } from '../domain/orderCosts.js'

const data = usePrototypeData(), { state, workbenchSession } = data, route = useRoute(), router = useRouter()
const kind = computed(() => route.query.kind === 'payment' ? 'payment' : route.query.kind === 'receipt' ? 'receipt' : canReadApplicationKind('receipt', workbenchSession.personaId) ? 'receipt' : 'payment')
const label = computed(() => kind.value === 'receipt' ? '收款' : '付款')
const readable = computed(() => canReadModule('paymentRequests') && canReadApplicationKind(kind.value, workbenchSession.personaId))
const writable = computed(() => readable.value && kind.value === 'receipt' && canWriteModule('paymentRequests') && workbenchSession.personaId === 'financeAccountant')
const tab = computed(() => route.query.tab === 'pending' ? 'pending' : route.query.tab === 'invoices' && kind.value === 'payment' ? 'invoices' : 'applications')
const creating = computed(() => route.query.view === 'create')
const approving = computed(() => route.query.view === 'approve')
const supplementing = computed(() => route.query.view === 'invoice')
const draft = ref(null), selection = ref([]), failure = ref(''), fields = ref({}), busy = ref(false), uploading = ref(false), issues = ref(false)
const opinion = ref(''), initialOpinion = ref(''), accountId = ref('')
const defaultQuery = () => tab.value === 'pending' ? { currency: 'CNY' } : tab.value === 'invoices' ? { status: '财务审批通过' } : {}
const query = ref(defaultQuery())
const rows = computed(() => {
  if (!readable.value) return []
  const source = tab.value === 'pending' ? applicationSources(state, kind.value) : applicationRows(state, kind.value)
  return source.filter(row => (tab.value !== 'invoices' || (row.status === '财务审批通过' && !row.invoice)) && matchesApplicationQuery(row, query.value))
})
const selected = computed(() => readable.value ? applicationRows(state, kind.value).find(row => row.id === route.query.application) : null)
const active = computed(() => creating.value ? draft.value : selected.value)
const isReviewable = computed(() => approving.value && writable.value && active.value?.status === '已提交')
const totals = computed(() => creating.value && draft.value ? applicationTotals(draft.value.lines) : active.value || {})
const accounts = computed(() => draft.value ? receiptAccountOptions(state, workbenchSession.personaId, draft.value.companyId, draft.value.currency) : [])
const accountDirty = computed(() => creating.value && accountId.value !== (draft.value?.account?.id || ''))
const headEntries = computed(() => active.value ? [
  ['申请批次号', active.value.applicationNo || '保存后生成'], ['结算单位', active.value.settlementParty], ['应收应付周期', '待确认（195）'],
  ['状态', active.value.status], ['申请币种', active.value.currency], ['创建人', active.value.createdBy], ['创建日期', active.value.createdAt?.slice(0, 10)],
] : [])
const invoiceEntries = computed(() => [
  ['税务发票号', active.value?.invoice?.invoiceNo || '未录入'], ['发票类型', active.value?.invoice?.type || '未录入'], ['开票日期', active.value?.invoice?.date || '未录入'],
  ['发票含税金额', active.value?.invoice ? money(active.value.invoice.grossAmount) : '未录入'], ['币种', active.value?.invoice?.currency || '未录入'],
  ['税率', active.value?.invoice?.rate ?? '未录入'], ['开票税率', '字段名与公式不一致（203）'], ['未税金额', active.value?.invoice ? money(active.value.invoice.netAmount) : '未录入'],
])
const tableKey = computed(() => `${kind.value}:${tab.value}:${JSON.stringify(query.value)}:${workbenchSession.personaId}:${accessState.revision}`)
let alive = true
const capture = value => captureApplicationContext(state, value, () => alive)
async function confirm(message, title, value) {
  const current = capture(value)
  try {
    await ElMessageBox.confirm(message, title, { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' })
    if (!current()) { ElMessage.warning('数据或权限已变化，请重新操作'); return false }
    return true
  } catch { return false }
}
async function leave() {
  if (busy.value || uploading.value) { ElMessage.warning('当前操作尚未结束'); return false }
  if (!draft.value && opinion.value === initialOpinion.value) return true
  return confirm('放弃尚未保存的申请、附件或审批意见？', '放弃修改', active.value)
}
onBeforeRouteLeave(leave); onBeforeRouteUpdate(leave)
function unload(event) { if (draft.value || opinion.value !== initialOpinion.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', unload))
onBeforeUnmount(() => { alive = false; window.removeEventListener('beforeunload', unload) })
watch(() => route.fullPath, () => { query.value = defaultQuery(); selection.value = []; failure.value = ''; fields.value = {}; if (!creating.value) draft.value = null; opinion.value = ''; initialOpinion.value = ''; accountId.value = '' })
watch(() => [workbenchSession.personaId, accessState.revision, state.financeApplications], () => { draft.value = null; opinion.value = ''; initialOpinion.value = ''; accountId.value = ''; selection.value = []; query.value = defaultQuery(); failure.value = ''; fields.value = {}; busy.value = false; uploading.value = false })
function navigate(nextTab = tab.value, nextKind = kind.value, application = '', view = '') {
  return router.push({ path: '/finance/payment-requests', query: { kind: nextKind, tab: nextTab, ...(application ? { application } : {}), ...(view ? { view } : {}) } })
}
async function startCreate(byQuery) {
  failure.value = ''
  try {
    if (!writable.value) throw new Error('当前申请不可创建')
    const actor = WORKBENCH_PERSONAS.find(row => row.id === workbenchSession.personaId)
    const next = applicationDraft(state, (byQuery ? rows.value : selection.value).map(row => row.id), kind.value, actor), current = capture(next)
    await navigate('pending', kind.value, '', 'create')
    if (current() && creating.value) { draft.value = next; accountId.value = '' }
  } catch (error) { failure.value = error.message }
}
function saveAccount() {
  try { draft.value.account = receiptAccountSnapshot(state, workbenchSession.personaId, draft.value, accountId.value); failure.value = ''; ElMessage.success('收款账户已保存到当前申请') }
  catch (error) { failure.value = error.message }
}
async function save(submit) {
  if (!draft.value || busy.value || uploading.value) return
  fields.value = Object.fromEntries(draft.value.lines.map(row => [row.id, requestedAmountError(row)]).filter(([, error]) => error))
  const attachmentError = applicationAttachmentError(draft.value.attachments)
  if (accountDirty.value) { failure.value = '请先保存收款账户变更'; return }
  if (attachmentError || Object.keys(fields.value).length) { failure.value = attachmentError || '请修正申请明细中的金额'; return }
  busy.value = true; failure.value = ''
  try {
    const value = draft.value
    if (!await confirm(`${submit ? '保存并提交' : '保存'}${value.settlementParty}的${label.value}申请，共${value.lines.length}条明细，${value.currency} ${money(totals.value.totalAmount)}？`, submit ? '提交确认' : '保存确认', value)) return
    const saved = data.saveFinanceApplication(cloneCost(value), submit)
    draft.value = null; busy.value = false
    await navigate('pending'); ElMessage.success(`${saved.applicationNo} 已${submit ? '提交' : '保存'}`)
  } catch (error) { failure.value = error.message; fields.value = error.fields || {} }
  finally { busy.value = false }
}
async function change(row, action) {
  if (busy.value) return
  busy.value = true; failure.value = ''
  try {
    if (!await confirm(`${action} ${row.applicationNo}（${row.settlementParty}）？${action === '删除' ? '删除后释放本申请占用的金额。' : ''}`, `${action}确认`, row)) return
    if (action === '删除') data.deleteFinanceApplication(row.id)
    else data.submitFinanceApplication(row.id)
    selection.value = []; ElMessage.success(`申请已${action}`)
  } catch (error) { failure.value = error.message }
  finally { busy.value = false }
}
async function review(approved) {
  if (!isReviewable.value || busy.value) return
  busy.value = true; failure.value = ''
  try {
    const row = active.value, value = { row, opinion: opinion.value }
    if (!await confirm(`${approved ? '通过' : '拒绝'} ${row.applicationNo}，${row.currency} ${money(row.totalAmount)}？`, '审批确认', value)) return
    data.reviewFinanceApplication(row.id, approved, opinion.value)
    opinion.value = ''; initialOpinion.value = ''; busy.value = false
    await navigate('applications'); ElMessage.success(approved ? '收款申请财务审批通过' : '收款申请财务审批拒绝')
  } catch (error) { failure.value = error.message }
  finally { busy.value = false }
}
function exportRows(byQuery) {
  try {
    const result = data.exportFinanceApplications(kind.value, { pending: tab.value === 'pending', query: cloneCost(query.value), ids: byQuery ? null : selection.value.map(row => row.id) })
    const url = URL.createObjectURL(new Blob([result.content], { type: 'text/csv;charset=utf-8' })), anchor = document.createElement('a')
    anchor.href = url; anchor.download = result.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    ElMessage.success(`已导出${result.count}条记录`)
  } catch (error) { failure.value = error.message }
}
</script>

<template>
  <div class="module-view applications-view">
    <PageHeader :title="creating?`新建${label}申请`:route.query.application?`${label}申请${approving?'审批':supplementing?'发票补录':'详情'}`:'收付款申请'">
      <template #actions><el-button v-if="creating||route.query.application" :icon="Back" @click="navigate(creating?'pending':tab)">返回列表</el-button><el-button :icon="View" @click="issues=!issues">待确认规则</el-button></template>
    </PageHeader>
    <el-alert v-if="issues" class="notice" title="待确认规则" type="warning" :closable="false"><p>037、038：付款审批衔接与金额占用；106、107：岗位及组织边界；195：周期来源；201：付款来源属性；202：零值及负数金额；203：付款发票录入与补录；204：收付款编号；205：银行账户准入；206：附件边界；207：业务日期默认范围；208：收款水单与拒绝后处理。</p></el-alert>
    <el-alert v-if="failure" class="notice" type="error" :title="failure" @close="failure=''"/>
    <el-empty v-if="!readable" description="当前岗位未获该类申请查看授权"/>
    <template v-else-if="!creating&&!route.query.application">
      <el-radio-group :model-value="kind" aria-label="收付款方向" @update:model-value="navigate('applications',$event)">
        <el-radio-button v-if="canReadApplicationKind('receipt',workbenchSession.personaId)" value="receipt">收款申请</el-radio-button><el-radio-button value="payment">付款申请</el-radio-button>
      </el-radio-group>
      <el-tabs :model-value="tab" @update:model-value="navigate($event)"><el-tab-pane :label="`${label}申请列表`" name="applications"/><el-tab-pane :label="`待${label}申请列表`" name="pending"/><el-tab-pane v-if="kind==='payment'" label="付款发票补录" name="invoices"/></el-tabs>
      <el-alert v-if="kind==='payment'" class="notice" title="付款来源、发票及审批规则待确认（037、038、106、201、203），当前仅可查看和导出。" type="warning" :closable="false"/>
      <ApplicationFilters :key="`${kind}:${tab}:${workbenchSession.personaId}:${accessState.revision}`" :mode="tab" :kind="kind" @query="query=$event;selection=[]"/>
      <DataTableFrame :key="tableKey" :rows="rows" :page-size="50" :page-sizes="[50]" selectable :selected-count="selection.length">
        <template #actions>
          <template v-if="tab==='pending'"><el-button v-if="writable" :icon="Plus" type="primary" :disabled="!selection.length" @click="startCreate(false)">按勾选创建</el-button><el-button v-if="writable" :icon="Plus" :disabled="!rows.length" @click="startCreate(true)">按查询条件创建</el-button><el-button v-if="kind==='payment'" :icon="Plus" disabled title="来源与发票要求待确认（201、203）">创建付款申请</el-button></template>
          <el-button v-if="selection.length" :icon="Download" @click="exportRows(false)">导出勾选</el-button><el-button v-if="selection.length&&kind==='receipt'&&tab==='applications'" :icon="Download" @click="exportRows(true)">按查询条件批量导出</el-button>
        </template>
        <template #default="{rows:pageRows}">
          <ApplicationLines v-if="tab==='pending'" :rows="pageRows" selectable @selection="selection=$event"/>
          <el-table v-else :data="pageRows" row-key="id" aria-label="申请列表" @selection-change="selection=$event">
            <el-table-column type="selection" width="48"/>
            <el-table-column v-for="[key,title,width] in APPLICATION_HEAD_COLUMNS" :key="key" :label="title" :min-width="width"><template #default="{row}">
              <el-button v-if="key==='applicationNo'" link type="primary" @click="navigate(tab,kind,row.id)">{{row.applicationNo}}</el-button><StatusTag v-else-if="key==='status'" :label="row.status"/><template v-else-if="key==='period'">待确认</template><template v-else-if="['netAmount','taxAmount','totalAmount'].includes(key)">{{money(row[key])}}</template><template v-else-if="key==='createdAt'">{{row.createdAt.slice(0,10)}}</template><template v-else>{{row[key]||'未填写'}}</template>
            </template></el-table-column>
            <el-table-column label="操作" :width="writable?250:180" fixed="right"><template #default="{row}">
              <el-button link type="primary" :icon="View" @click="navigate(tab,kind,row.id)">查看</el-button>
              <template v-if="writable&&['新建','财务审批拒绝'].includes(row.status)"><el-button link :icon="Promotion" type="primary" :disabled="busy" @click="change(row,'提交')">提交</el-button><el-button link :icon="Delete" type="danger" :disabled="busy" @click="change(row,'删除')">删除</el-button></template>
              <el-button v-if="writable&&row.status==='已提交'" link type="primary" :icon="Check" @click="navigate(tab,kind,row.id,'approve')">审批</el-button>
              <el-button v-if="kind==='payment'&&row.status==='已提交'" link :icon="Check" @click="navigate(tab,kind,row.id,'approve')">审批详情</el-button>
              <el-button v-if="tab==='invoices'" link :icon="View" @click="navigate(tab,kind,row.id,'invoice')">补录详情</el-button>
            </template></el-table-column>
          </el-table>
        </template>
      </DataTableFrame>
    </template>
    <template v-else-if="active">
      <el-alert v-if="active.demoOnly" class="notice" title="独立展示样本，不占用结算明细；付款处理规则待确认。" type="warning" :closable="false"/>
      <OrderCostFacts :entries="headEntries"/>
      <div class="application-totals" aria-label="申请合计"><div v-for="[key,title] in [['totalAmount','申请金额合计'],['taxAmount','税额合计'],['netAmount','不含税金额合计']]" :key="key"><span>{{title}}（{{active.currency}}）</span><strong>{{money(totals[key])}}</strong></div></div>
      <section class="application-section">
        <el-form v-if="creating" label-position="top"><el-form-item label="备注"><el-input v-model="draft.remark" aria-label="申请备注" type="textarea" :rows="3" :disabled="busy"/></el-form-item></el-form>
        <OrderCostFacts v-else :entries="[['备注',active.remark||'未填写'],['审批意见',active.approvalOpinion||'未填写']]"/>
        <h2>附件</h2><OrderCostAttachments :key="creating?`draft:${workbenchSession.personaId}`:active.id" :model-value="active.attachments" :readonly="!creating||busy" :validate-file="applicationFileError" accept=".txt,.csv,.pdf,.png,.jpg,.jpeg,.webp,.gif" input-label="选择申请附件" duplicate-message="同名附件处理待确认（206）" @update:model-value="draft&&(draft.attachments=$event)" @busy="uploading=$event"/>
      </section>
      <section v-if="kind==='receipt'" class="application-section"><h2>收款账户</h2>
        <el-form v-if="creating" class="account-form" label-position="top"><el-form-item label="收款账号"><el-select v-model="accountId" filterable clearable aria-label="收款账号" :disabled="busy"><el-option v-for="account in accounts" :key="account.id" :value="account.id" :label="account.accountNo" :disabled="account.unavailable"><span class="account-option"><span>{{account.accountNo}}</span><span>{{account.bankName}}</span><span>{{account.accountName}}</span></span></el-option></el-select></el-form-item><el-button :icon="Check" :disabled="busy" @click="saveAccount">保存收款账户</el-button></el-form>
        <el-alert v-if="accountDirty" title="收款账户有未保存的修改" type="warning" :closable="false"/>
        <OrderCostFacts :entries="[['收款银行',active.account?.bankName||'未选择'],['收款账户名称',active.account?.accountName||'未选择'],['收款银行账号',active.account?.accountNo||'未选择']]"/>
      </section>
      <section v-else class="application-section"><h2>税务发票信息</h2><OrderCostFacts :entries="invoiceEntries"/>
        <h3>发票附件</h3><OrderCostAttachments :model-value="active.invoice?.attachments||[]" readonly/>
        <el-alert title="发票号选取与手工录入要求冲突，补录关联范围及字段算法待确认（203），暂不保存发票。" type="warning" :closable="false"/>
        <div v-if="supplementing" class="application-actions"><el-button :icon="Check" disabled>提交发票补录</el-button></div>
      </section>
      <section class="application-section"><h2>订单明细</h2><DataTableFrame :key="`${active.id||'draft'}:${approving}`" :rows="active.lines" :page-size="approving?10:50" :page-sizes="[approving?10:50]"><template #default="{rows:pageRows}"><ApplicationLines :rows="pageRows" requested :editable="creating&&writable" :disabled="busy" :errors="fields" @amount="(id,value)=>{draft.lines.find(row=>row.id===id).requestedAmount=value;fields={}}"/></template></DataTableFrame></section>
      <section v-if="approving" class="application-section"><h2>本次审批意见</h2><el-input v-model="opinion" type="textarea" :rows="3" aria-label="本次审批意见" :disabled="!isReviewable||busy"/></section>
      <section v-if="!creating" class="application-section"><h2>操作记录</h2><el-table :data="active.history"><el-table-column prop="action" label="操作" min-width="150"/><el-table-column prop="actor" label="操作人" min-width="140"/><el-table-column prop="time" label="时间" min-width="180"/><el-table-column prop="opinion" label="审批意见" min-width="200"/></el-table></section>
      <div class="application-actions"><el-button :icon="Back" :disabled="busy||uploading" @click="navigate(creating?'pending':tab)">返回列表</el-button>
        <template v-if="creating&&writable"><el-button :icon="Check" :disabled="busy||uploading||accountDirty" @click="save(false)">保存申请</el-button><el-button :icon="Promotion" type="primary" :disabled="busy||uploading||accountDirty" @click="save(true)">保存并提交</el-button></template>
        <template v-if="approving"><el-button :icon="Close" type="danger" :disabled="!isReviewable||busy" @click="review(false)">审批拒绝</el-button><el-button :icon="Check" type="primary" :disabled="!isReviewable||busy" @click="review(true)">审批通过</el-button></template>
      </div>
    </template>
    <el-empty v-else :description="creating?'没有未保存的申请，请返回待申请列表重新选择':'申请不存在、已删除或不属于当前申请方向'"/>
  </div>
</template>

<style scoped>
.applications-view{min-width:0}.applications-view :deep(.table-scroll > .el-table){min-width:0}.notice{margin-block:12px}.notice p{margin:4px 0;line-height:1.8}.el-tabs{margin-top:16px}.application-section{padding-block:20px;border-top:1px solid var(--border)}.application-section h2{font-size:15px;font-weight:600;margin:0 0 14px}.application-section h3{font-size:13px;font-weight:600;margin:16px 0 10px}.application-totals{display:flex;flex-wrap:wrap;gap:20px 48px;padding:20px 0}.application-totals>div{display:flex;flex-direction:column;gap:8px}.application-totals span{color:var(--muted);font-size:13px}.application-totals strong{font-size:22px;color:var(--text)}.application-actions{display:flex;flex-wrap:wrap;gap:10px;padding-block:20px}.application-actions .el-button{margin:0}.account-form{display:flex;align-items:end;gap:16px;flex-wrap:wrap}.account-form .el-form-item{width:min(100%,420px);margin:0}.account-form{margin-bottom:16px}.account-option{display:flex;gap:14px;flex-wrap:wrap;max-width:100%;white-space:normal}.account-option>span{overflow-wrap:anywhere}.application-section{min-width:0}
</style>
