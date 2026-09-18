<script setup>
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import GroundImagesField from './GroundImagesField.vue'
import StatusTag from './StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { GROUND_DOCUMENT_TYPES, groundDocumentErrors } from '../domain/groundWaybills.js'
const props = defineProps({ bill: { type: Object, required: true } })
const { state, groundSession, saveGroundDocument, deleteGroundDocument, reviewGroundDocument } = usePrototypeData()
const allowed = computed(() => groundSession.role === 'hangsheng')
const visible = ref(false), documentId = ref(''), mode = ref('create'), uploading = ref(false), initial = ref('')
const draft = reactive({type:'',remark:'',images:[],feeItem:'',amount:'',result:'',newAmount:''})
const reviewing = computed(() => mode.value === 'review')
const rows = computed(() => (props.bill.documents || []).slice().sort((a,b) => a.updatedAt.localeCompare(b.updatedAt)))
const feeItems = computed(() => (state.financeCostItems || []).filter(row => row.department === '航晟车队' && !['运输费','返空费'].includes(row.name)))
const errors = computed(() => {
  if (!reviewing.value) return groundDocumentErrors(draft)
  const result = {}
  if (!draft.result) result.result = '请选择审批结果'
  if (draft.result === '通过并修改金额' && (!/^\d+(?:\.\d{1,2})?$/.test(String(draft.newAmount)) || Number(draft.newAmount) <= 0)) result.newAmount = '请输入正数金额，最多2位小数'
  if (draft.result && draft.result !== '驳回') result.pending = '审批通过的费用入账衔接待确认（140），暂不提交'
  return result
})
function open(record, action = 'create') {
  documentId.value = record?.id || ''; mode.value = action
  Object.assign(draft,{type:record?.type || '',remark:action === 'review' ? '' : record?.remark || '',images:JSON.parse(JSON.stringify(record?.images || [])),feeItem:record?.feeItem || '',amount:record?.amount ?? '',result:'',newAmount:''})
  initial.value = JSON.stringify(draft); visible.value = true
}
watch(() => draft.type, type => { if (type !== '杂费单据') { draft.feeItem = ''; draft.amount = '' } })
const dirty = computed(() => visible.value && initial.value !== JSON.stringify(draft))
async function allowDiscard() {
  if (uploading.value) { ElMessage.warning('图片读取中，请稍后再试'); return false }
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('未保存的单据信息将被丢弃。','放弃修改？',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑',type:'warning'}); return true } catch { return false }
}
async function close(done) { if (!await allowDiscard()) return; visible.value = false; if (typeof done === 'function') done() }
function submit() {
  if (!allowed.value || uploading.value || Object.keys(errors.value).length) return
  try {
    if (reviewing.value) reviewGroundDocument(props.bill.id,documentId.value,{result:draft.result,remark:draft.remark,newAmount:draft.newAmount})
    else saveGroundDocument(props.bill.id,JSON.parse(JSON.stringify(draft)),documentId.value)
    visible.value = false; ElMessage.success('已提交成功！')
  } catch (error) { ElMessage.error(error.message) }
}
async function remove(record) {
  try {
    await ElMessageBox.confirm(`删除此${record.type}及关联图片？`,'删除单据',{confirmButtonText:'删除单据',cancelButtonText:'保留单据',type:'warning'})
    deleteGroundDocument(props.bill.id,record.id); ElMessage.success('单据已删除')
  } catch (error) { if (error instanceof Error) ElMessage.error(error.message) }
}
function beforeUnload(event) { if (dirty.value || uploading.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload',beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload',beforeUnload))
watch(() => [props.bill.id,groundSession.role],() => { visible.value = false; uploading.value = false })
defineExpose({allowDiscard})
</script>
<template>
  <div>
    <div class="records-toolbar"><h3>单据记录</h3><el-button v-business-write="'groundWaybills'" v-if="allowed" type="primary" :icon="Plus" @click="open()">单据</el-button></div>
    <el-table :data="rows" aria-label="运单单据记录" empty-text="暂无单据记录">
      <el-table-column prop="type" label="单据类型" width="110" /><el-table-column prop="remark" label="描述" min-width="160" />
      <el-table-column label="杂费类型" width="120"><template #default="{row}">{{ row.type === '杂费单据' ? row.feeItem : '' }}</template></el-table-column>
      <el-table-column label="杂费金额（元）" width="135" align="right"><template #default="{row}">{{ row.type === '杂费单据' && row.amount != null ? Number(row.amount).toFixed(2) : '' }}</template></el-table-column>
      <el-table-column label="图片" min-width="150"><template #default="{row}"><GroundImagesField :model-value="row.images" readonly /></template></el-table-column>
      <el-table-column label="杂费审批状态" width="130"><template #default="{row}"><StatusTag v-if="row.approvalStatus" :label="row.approvalStatus" /></template></el-table-column>
      <el-table-column prop="actor" label="操作人" min-width="155" /><el-table-column prop="updatedAt" label="操作时间" width="170" /><el-table-column prop="approvalRemark" label="审批备注" min-width="170" />
      <el-table-column label="操作" width="150" fixed="right"><template #default="{row}"><template v-if="allowed"><template v-if="row.type !== '杂费单据'"><el-button v-business-write="'groundWaybills'" link type="primary" @click="open(row,'edit')">修改</el-button><el-button v-business-write="'groundWaybills'" link type="danger" @click="remove(row)">删除</el-button></template><el-button v-business-write="'groundWaybills'" v-else-if="row.approvalStatus === '待审批'" link type="primary" @click="open(row,'review')">审批</el-button></template></template></el-table-column>
    </el-table>
    <el-dialog v-model="visible" :title="reviewing ? '杂费审批' : documentId ? '修改单据' : '新增单据'" width="min(660px,94vw)" append-to-body destroy-on-close :close-on-click-modal="false" :before-close="close">
      <el-form label-position="top" @submit.prevent="submit">
        <template v-if="reviewing">
          <p>{{ draft.feeItem }} · {{ Number(draft.amount).toFixed(2) }} 元</p>
          <el-form-item label="审批结果" required :error="errors.result"><el-radio-group v-model="draft.result" aria-label="审批结果"><el-radio value="通过">通过</el-radio><el-radio value="驳回">驳回</el-radio><el-radio value="通过并修改金额">通过并修改金额</el-radio></el-radio-group></el-form-item>
          <el-form-item v-if="draft.result === '通过并修改金额'" label="修改后金额（元）" required :error="errors.newAmount"><el-input v-model="draft.newAmount" inputmode="decimal" aria-label="修改后金额" /></el-form-item>
        </template>
        <template v-else>
          <el-form-item label="单据类型" required :error="errors.type"><el-select v-model="draft.type" aria-label="单据类型"><el-option v-for="type in GROUND_DOCUMENT_TYPES" :key="type" :value="type" /></el-select></el-form-item>
          <template v-if="draft.type === '杂费单据'"><el-form-item label="杂费类型" required :error="errors.feeItem"><el-select v-model="draft.feeItem" aria-label="杂费类型" no-data-text="暂无航晟车队成本科目配置"><el-option v-for="item in feeItems" :key="item.id" :value="item.name" /></el-select></el-form-item><el-form-item label="杂费金额（元）" required :error="errors.amount"><el-input v-model="draft.amount" inputmode="decimal" aria-label="杂费金额" /></el-form-item></template>
          <el-form-item label="上传图片" :error="errors.images"><GroundImagesField v-model="draft.images" label="单据图片" :readonly="!allowed" @busy="uploading = $event" /></el-form-item>
        </template>
        <el-form-item :label="reviewing ? '审批备注' : '备注'" :error="errors.remark"><el-input v-model="draft.remark" type="textarea" :rows="3" :maxlength="reviewing ? undefined : 500" :show-word-limit="!reviewing" aria-label="单据备注" /></el-form-item>
        <el-alert v-if="errors.pending" :title="errors.pending" type="warning" :closable="false" />
      </el-form>
      <template #footer><el-button :disabled="uploading" @click="close">取消</el-button><el-button v-business-write="'groundWaybills'" type="primary" :disabled="!allowed || uploading || !!Object.keys(errors).length" @click="submit">{{ reviewing ? '提交审批' : documentId ? '保存单据' : '提交单据' }}</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.records-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
h3 { margin:0; font-size:15px; }
:deep(.el-radio-group) { gap:8px; flex-wrap:wrap; }
:deep(.el-radio) { margin-right:12px; }
</style>
