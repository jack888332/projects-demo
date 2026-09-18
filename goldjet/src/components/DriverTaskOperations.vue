<script setup>
import { computed, reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Warning } from '@element-plus/icons-vue'
import GroundImagesField from './GroundImagesField.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canWriteModule, isSuperAdmin } from '../data/accessControl.js'
import { GROUND_DOCUMENT_TYPES } from '../domain/groundWaybills.js'
import { DRIVER_DEMO, DRIVER_EXCEPTION_TYPES, driverNextNode, driverStatus, driverTime, driverWindow, driverExceptions, driverTrajectory, driverEvent, driverDocumentErrors } from '../domain/driverTasks.js'
const props = defineProps({ bill: { type: Object, required: true }, pane: { type: String, default: 'detail' } })
const emit = defineEmits(['completed'])
const data = usePrototypeData()
const editable = computed(() => data.workbenchSession.personaId === 'driver' && Boolean(data.driverSession.phone) && canWriteModule('driver'))
const node = computed(() => driverNextNode(props.bill))
const documents = computed(() => GROUND_DOCUMENT_TYPES.map(type => ({ type, rows: (props.bill.documents || []).filter(row => row.type === type).slice().sort((a,b) => a.createdAt.localeCompare(b.createdAt)) })))
const exceptions = computed(() => driverExceptions(props.bill, data.driverSession.phone, isSuperAdmin()))
const trajectory = computed(() => driverTrajectory(props.bill, data.driverSession.phone, isSuperAdmin()))
const documentWindow = computed(() => driverWindow(props.bill,'document',data.state.driverClockMs))
const exceptionWindow = computed(() => driverWindow(props.bill,'exception',data.state.driverClockMs))
const feeItems = computed(() => data.state.financeCostItems.filter(row => row.department === '航晟车队' && !['运输费','返空费'].includes(row.name)))
const mode = ref(''), visible = ref(false), uploading = ref(false), submitting = ref(false), failure = ref(''), errors = ref({}), expectedStatus = ref(''), nodeSnapshot = ref(null), initial = ref('')
const draft = reactive({ type:'', remark:'', images:[], feeItem:'', amount:'', cargoDocuments:'' })
const dirty = computed(() => visible.value && JSON.stringify(draft) !== initial.value)
const title = computed(() => mode.value === 'node' ? nodeSnapshot.value?.label : mode.value === 'document' ? '上传单据' : '上报异常')
const needsImages = computed(() => mode.value === 'node' ? Boolean(nodeSnapshot.value?.document) : mode.value === 'document' && ['提货单据','卸货单据'].includes(draft.type))
function open(kind) {
  mode.value = kind; expectedStatus.value = driverStatus(props.bill); nodeSnapshot.value = node.value ? {...node.value} : null
  Object.assign(draft,{type:kind === 'node' ? node.value?.document || '' : '',remark:'',images:[],feeItem:'',amount:'',cargoDocuments:''})
  initial.value = JSON.stringify(draft); failure.value = ''; errors.value = {}; visible.value = true
}
async function allowDiscard() {
  if (uploading.value || submitting.value) { ElMessage.warning('请等待当前操作完成'); return false }
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('已填写内容尚未提交，是否放弃？','放弃填写',{confirmButtonText:'放弃',cancelButtonText:'继续填写',type:'warning'}); return true } catch { return false }
}
async function close(done) { if (await allowDiscard()) { visible.value=false; if (typeof done === 'function') done() } }
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(async (to,from) => { if (to.query.bill !== from.query.bill || to.query.pane !== from.query.pane || to.query.tab !== from.query.tab) return await allowDiscard() })
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue='' } }
onMounted(() => window.addEventListener('beforeunload',beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload',beforeUnload))
async function submit() {
  failure.value=''; errors.value={}
  if (mode.value === 'document' || nodeSnapshot.value?.document && mode.value === 'node') errors.value=driverDocumentErrors(draft,mode.value !== 'node')
  if (Object.keys(errors.value).length) { failure.value=Object.values(errors.value)[0]; return }
  submitting.value=true
  try {
    if (mode.value === 'node') data.confirmDriverNode(props.bill.id,expectedStatus.value,draft)
    else if (mode.value === 'document') data.uploadDriverDocument(props.bill.id,draft)
    else data.reportDriverException(props.bill.id,draft)
    visible.value=false; ElMessage.success(mode.value === 'node' ? '运输节点已确认' : mode.value === 'document' ? '单据已上传' : '异常已上报')
    emit('completed',{status:driverStatus(props.bill),pane:props.pane})
  } catch(error) { failure.value=error.message }
  finally { submitting.value=false }
}
defineExpose({ openDocument:()=>open('document'), allowDiscard })
</script>
<template>
  <section v-if="pane === 'trajectory'" class="driver-operations">
    <div class="operations-head"><h3>运输轨迹</h3><el-button v-if="editable && node" type="primary" @click="open('node')">{{ node.label }}</el-button></div>
    <p v-if="bill.expectedArrival">预计到达：{{ bill.expectedArrival }} <span class="muted">（模拟地图耗时）</span></p>
    <p v-else-if="bill.expectedArrivalSource" class="muted">{{ bill.expectedArrivalSource }}</p>
    <p v-if="bill.exceptionStatus === '异常中'" class="warning">运单存在未关闭异常，可继续确认运输节点。</p>
    <el-timeline class="driver-timeline"><el-timeline-item v-for="row in trajectory" :key="row.id" :timestamp="row.time" placement="top" :type="driverEvent(row,bill).status === '异常' ? 'danger' : driverEvent(row,bill).status === '延误' ? 'warning' : 'primary'"><div class="timeline-title"><strong>{{ driverEvent(row,bill).event }}</strong><el-tag :type="driverEvent(row,bill).status === '异常' ? 'danger' : driverEvent(row,bill).status === '延误' ? 'warning' : 'info'">{{ driverEvent(row,bill).status }}</el-tag></div><p>{{ driverEvent(row,bill).actor }}</p><p v-if="row.location" class="muted">{{ row.location }}</p><p v-if="row.remark">{{ row.remark }}</p></el-timeline-item></el-timeline>
  </section>
  <section v-else-if="pane === 'documents'" class="driver-operations">
    <div class="operations-head"><h3>单据</h3><el-button v-if="editable && documentWindow.allowed" :icon="Upload" type="primary" @click="open('document')">上传单据</el-button></div>
    <p v-if="!documentWindow.allowed" class="warning">{{ documentWindow.reason }}</p>
    <section v-for="group in documents" :key="group.type" class="document-group"><h4>{{ group.type }} <span class="muted">{{ group.rows.length }}</span></h4><p v-if="!group.rows.length" class="muted">暂无单据</p><article v-for="row in group.rows" :key="row.id" class="document-row"><div class="operations-head"><strong>{{ row.feeItem || row.type }}</strong><el-tag v-if="row.approvalStatus">{{ row.approvalStatus }}</el-tag></div><p v-if="row.type === '杂费单据'">上报金额：{{ row.amount }} 元</p><p v-if="row.remark">{{ row.remark }}</p><p v-if="row.cargoDocuments">随货资料：{{ row.cargoDocuments }}</p><p class="muted">{{ row.createdAt }} · {{ row.source }}</p><GroundImagesField :model-value="row.images" readonly /></article></section>
  </section>
  <section v-else-if="pane === 'exceptions'" class="driver-operations">
    <div class="operations-head"><h3>异常</h3><el-button v-if="editable && exceptionWindow.allowed" :icon="Warning" type="primary" @click="open('exception')">上报异常</el-button></div>
    <p v-if="!isSuperAdmin()" class="muted">暂展示本人上报记录；其他上报人的异常可见范围待确认（108）。</p>
    <p v-if="!exceptionWindow.allowed" class="warning">{{ exceptionWindow.reason }}</p>
    <el-empty v-if="!exceptions.length" description="暂无可见异常记录" />
    <article v-for="row in exceptions" :key="row.id" class="document-row"><div class="operations-head"><strong>{{ row.type }}</strong><el-tag :type="row.status === '异常中' ? 'danger' : 'info'">{{ row.status }}</el-tag></div><p v-if="row.remark">{{ row.remark }}</p><p class="muted">上报时间：{{ row.reportedAt }}</p><GroundImagesField :model-value="row.images" readonly /><div v-if="row.status === '已关闭'" class="closure"><strong>关闭异常</strong><p>{{ row.closedAt }} · 航晟物流关闭</p><p v-if="row.closeRemark">{{ row.closeRemark }}</p></div></article>
  </section>
  <el-dialog v-model="visible" :title="title" width="min(580px, calc(100vw - 24px))" append-to-body :before-close="close" :close-on-click-modal="false" destroy-on-close>
    <el-form label-position="top" @submit.prevent="submit">
      <template v-if="mode === 'node'"><dl class="confirmation-context"><dt>当前位置</dt><dd>{{ DRIVER_DEMO.location }}</dd><dt>当前时间</dt><dd>{{ driverTime(data.state.driverClockMs) }}（演示时钟）</dd></dl></template>
      <el-form-item v-if="mode === 'document'" label="单据类型" required :error="errors.type"><el-select v-model="draft.type" aria-label="单据类型"><el-option v-for="type in GROUND_DOCUMENT_TYPES" :key="type" :value="type" /></el-select></el-form-item>
      <el-form-item v-if="mode === 'exception'" label="异常类型" required><el-select v-model="draft.type" aria-label="异常类型"><el-option v-for="type in DRIVER_EXCEPTION_TYPES" :key="type" :value="type" /></el-select></el-form-item>
      <template v-if="mode === 'document' && draft.type === '杂费单据'"><el-form-item label="杂费类型" required :error="errors.feeItem"><el-select v-model="draft.feeItem" aria-label="杂费类型" no-data-text="暂无航晟车队科目"><el-option v-for="item in feeItems" :key="item.id" :value="item.name" /></el-select></el-form-item><el-form-item label="杂费金额（元）" required :error="errors.amount"><el-input v-model="draft.amount" aria-label="杂费金额" inputmode="decimal" /></el-form-item><p class="warning">杂费提交与入账时点待确认（140），暂不提交。</p></template>
      <el-form-item :label="mode === 'node' ? '备注' : mode === 'document' ? '情况描述' : '说明内容'" :error="errors.remark"><el-input v-model="draft.remark" type="textarea" :rows="3" :maxlength="mode === 'node' ? undefined : 500" :show-word-limit="mode !== 'node'" aria-label="说明内容" /></el-form-item>
      <el-form-item v-if="draft.type === '提货单据'" label="随货资料"><el-radio-group v-model="draft.cargoDocuments"><el-radio value="有">有</el-radio><el-radio value="无">无</el-radio></el-radio-group><el-button v-if="draft.cargoDocuments" link @click="draft.cargoDocuments=''">清空</el-button></el-form-item>
      <el-form-item v-if="mode !== 'node' || needsImages" label="图片" :required="needsImages" :error="errors.images"><GroundImagesField v-model="draft.images" :max-images="15" camera @busy="value=>uploading=value" /></el-form-item>
      <p v-if="failure" role="alert" class="failure">{{ failure }}</p>
    </el-form>
    <template #footer><el-button :disabled="uploading || submitting" @click="close">取消</el-button><el-button type="primary" :loading="submitting" :disabled="uploading || !editable || draft.type === '杂费单据'" @click="submit">{{ mode === 'node' ? '确认完成' : '提交' }}</el-button></template>
  </el-dialog>
</template>
<style scoped>
.driver-operations { padding:12px 0; } .operations-head,.timeline-title { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; } h3 { font-size:17px; margin:12px 0; } h4 { font-size:15px; margin:0 0 14px; } p { line-height:1.6; overflow-wrap:anywhere; }.muted { color:var(--muted); font-size:13px; }.warning { color:#8a6014; font-size:13px; }.failure { color:var(--danger); }
.driver-timeline { padding:20px 0 0 10px; }.timeline-title { justify-content:start; }.driver-timeline p { margin:6px 0; }.document-group { padding:22px 0; border-top:1px solid var(--border); }.document-row { padding:16px 0; border-bottom:1px solid var(--border); }.confirmation-context { margin:0 0 24px; display:grid; grid-template-columns:75px 1fr; gap:12px; }.confirmation-context dd { margin:0; }.confirmation-context dt { color:var(--muted); }.closure { padding:12px 0 0; margin-top:12px; border-top:1px solid var(--border); }
</style>
