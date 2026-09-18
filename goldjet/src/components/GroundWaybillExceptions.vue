<script setup>
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import StatusTag from './StatusTag.vue'
import GroundImagesField from './GroundImagesField.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { GROUND_EXCEPTION_TYPES, groundExceptionErrors, groundExceptionCloseReason, groundRemarkError } from '../domain/groundWaybills.js'
const props = defineProps({ bill: { type: Object, required: true } })
const { groundSession, reportGroundException, closeGroundException } = usePrototypeData()
const canManage = computed(() => groundSession.role === 'hangsheng')
const visible = ref(false), closingId = ref(''), uploading = ref(false), initial = ref('')
const draft = reactive({ type: '', remark: '', images: [] })
const errors = computed(() => closingId.value ? { remark: groundRemarkError(draft.remark), eligibility: groundExceptionCloseReason(props.bill, props.bill.exceptions?.find(row => row.id === closingId.value)) } : groundExceptionErrors(draft))
const firstError = computed(() => Object.values(errors.value).find(Boolean))
const rows = computed(() => (props.bill.exceptions || []).slice().sort((a,b) => (a.status !== '异常中') - (b.status !== '异常中') || b.reportedAt.localeCompare(a.reportedAt) || Number(b.id.split('-EX').at(-1)) - Number(a.id.split('-EX').at(-1))))
function open(record) {
  closingId.value = record?.id || ''
  Object.assign(draft,{type:'',remark:'',images:[]}); initial.value = JSON.stringify(draft); visible.value = true
}
const dirty = computed(() => visible.value && JSON.stringify(draft) !== initial.value)
async function allowDiscard() {
  if (uploading.value) { ElMessage.warning('图片读取中，请稍后再试'); return false }
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('未保存的异常信息将被丢弃。','放弃修改？',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑',type:'warning'}); return true } catch { return false }
}
async function close(done) { if (!await allowDiscard()) return; visible.value = false; if (typeof done === 'function') done() }
function submit() {
  if (!canManage.value || firstError.value || uploading.value) return
  try {
    if (closingId.value) closeGroundException(props.bill.id, closingId.value, draft.remark)
    else reportGroundException(props.bill.id, JSON.parse(JSON.stringify(draft)))
    visible.value = false; ElMessage.success('已提交成功！')
  } catch (error) { ElMessage.error(error.message) }
}
function beforeUnload(event) { if (dirty.value || uploading.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload',beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload',beforeUnload))
watch(() => [props.bill.id,groundSession.role],() => { visible.value = false; uploading.value = false })
defineExpose({ allowDiscard })
</script>
<template>
  <div>
    <div class="records-toolbar"><h3>异常记录</h3><el-button v-if="canManage && bill.status !== '已取消'" type="primary" :icon="Plus" @click="open()">异常</el-button></div>
    <el-table :data="rows" aria-label="运单异常记录" empty-text="暂无异常记录">
      <el-table-column prop="type" label="异常类别" min-width="110" /><el-table-column label="异常状态" width="110"><template #default="{row}"><StatusTag :label="row.status" /></template></el-table-column>
      <el-table-column prop="remark" label="异常内容" min-width="160" /><el-table-column label="上报图片" min-width="160"><template #default="{row}"><GroundImagesField :model-value="row.images" readonly /></template></el-table-column>
      <el-table-column prop="reportedAt" label="异常上报时间" width="170" /><el-table-column prop="actor" label="上报账户" min-width="150" />
      <el-table-column label="关闭信息" min-width="180"><template #default="{row}"><template v-if="row.status === '已关闭'">{{ row.closedAt }}<br />{{ row.closedBy }}<br />{{ row.closeRemark }}</template></template></el-table-column>
      <el-table-column label="操作" width="240" fixed="right"><template #default="{row}"><template v-if="row.status === '异常中'"><el-button link type="primary" :disabled="!canManage || !!groundExceptionCloseReason(bill,row)" @click="open(row)">取消异常</el-button><p v-if="groundExceptionCloseReason(bill,row)" class="pending">{{ groundExceptionCloseReason(bill,row) }}</p></template></template></el-table-column>
    </el-table>
    <el-dialog v-model="visible" :title="closingId ? '取消异常' : '新增异常'" width="min(660px,94vw)" append-to-body destroy-on-close :close-on-click-modal="false" :before-close="close">
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item v-if="!closingId" label="异常类型" required :error="errors.type"><el-select v-model="draft.type" aria-label="异常类型"><el-option v-for="type in GROUND_EXCEPTION_TYPES" :key="type" :value="type" /></el-select></el-form-item>
        <el-form-item v-if="!closingId" label="上传图片" :error="errors.images"><GroundImagesField v-model="draft.images" label="异常图片" :readonly="!canManage" @busy="uploading = $event" /></el-form-item>
        <el-form-item label="备注" :error="errors.remark"><el-input v-model="draft.remark" aria-label="异常备注" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
        <p v-if="errors.eligibility" class="pending" role="alert">{{ errors.eligibility }}</p>
      </el-form>
      <template #footer><el-button :disabled="uploading" @click="close">取消</el-button><el-button type="primary" :disabled="!canManage || !!firstError || uploading" @click="submit">{{ closingId ? '确认取消异常' : '提交异常' }}</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.records-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
h3 { margin:0; font-size:15px; }
.pending { color:var(--muted); font-size:12px; line-height:1.6; margin:6px 0 0; }
</style>
