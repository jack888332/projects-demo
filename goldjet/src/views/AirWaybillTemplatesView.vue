<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  AIR_WAYBILL_TEMPLATE_TYPES, AIR_WAYBILL_TEMPLATE_ACCEPT, canManageAirWaybillTemplates,
  createAirWaybillTemplateDraft, validateAirWaybillTemplateFile, validateAirWaybillTemplateDraft, filterAirWaybillTemplates,
} from '../domain/airWaybillTemplates.js'

const { state, airTemplateSession, saveAirWaybillTemplate, getAirWaybillTemplateFiles } = usePrototypeData()
const session = computed(() => unref(airTemplateSession) || {})
const allowed = computed(() => canManageAirWaybillTemplates(session.value))
const airlines = computed(() => state.airMaster?.airlines || [])
const emptyFilters = () => ({ airlineCode: '', type: '', status: '' })
const filters = ref(emptyFilters()), applied = ref(emptyFilters())
const rows = computed(() => allowed.value || session.value.readAll ? filterAirWaybillTemplates(state.airWaybillTemplates, applied.value) : [])
const selectedIds = ref([]), table = ref(null)
const visible = ref(false), draft = ref(createAirWaybillTemplateDraft()), busy = ref(false), failure = ref(''), fileFailure = ref(''), submitted = ref(false)
const input = ref(null), editor = ref(null)
const errors = computed(() => validateAirWaybillTemplateDraft(draft.value, state))
const dirty = computed(() => visible.value && Boolean(draft.value.airlineCode || draft.value.type || draft.value.file))
let generation = 0
function query() { applied.value = { ...filters.value }; selectedIds.value = []; table.value?.clearSelection() }
function resetQuery() { filters.value = emptyFilters(); query() }
function resetEditor() { visible.value = false; draft.value = createAirWaybillTemplateDraft(); submitted.value = false; failure.value = ''; fileFailure.value = '' }
async function allowLeave() {
  if (busy.value) return false
  if (!dirty.value) return true
  const version = generation
  busy.value = true
  try {
    await ElMessageBox.confirm('尚未保存的模板信息和已选文件将被丢弃。', '放弃模板上传？', { confirmButtonText: '放弃上传', cancelButtonText: '继续编辑', type: 'warning' })
    return version === generation
  } catch { return false }
  finally { if (version === generation) busy.value = false }
}
async function close(done) {
  const version = generation
  if (!await allowLeave() || version !== generation) return false
  resetEditor()
  if (typeof done === 'function') done()
  return true
}
async function open() {
  const version = generation
  if (!allowed.value || busy.value || !await allowLeave() || version !== generation || !allowed.value) return false
  resetEditor(); visible.value = true
  return true
}
function selectFile(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!allowed.value || !visible.value || busy.value || !files.length) return false
  if (files.length !== 1) { fileFailure.value = '每次请选择一个模板文件'; return false }
  fileFailure.value = validateAirWaybillTemplateFile(files[0])
  if (fileFailure.value) return false
  draft.value.file = files[0]
  return true
}
function removeFile() {
  if (!allowed.value || !visible.value || busy.value) return false
  draft.value.file = null; fileFailure.value = ''
  return true
}
async function focusError() {
  await nextTick()
  editor.value?.querySelector('.is-error input, .is-error [tabindex="0"], .is-error button')?.focus()
}
function save() {
  if (!allowed.value || !visible.value || busy.value) return false
  submitted.value = true; failure.value = ''
  if (Object.keys(errors.value).length) { focusError(); return false }
  busy.value = true
  try {
    saveAirWaybillTemplate(draft.value)
    resetEditor(); resetQuery()
    ElMessage.success('模板文件已上传')
    return true
  } catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
function download(ids = selectedIds.value) {
  if ((!allowed.value && !session.value.readAll) || busy.value) return false
  busy.value = true; failure.value = ''
  try {
    const files = getAirWaybillTemplateFiles(ids)
    const prepared = []
    try {
      for (const entry of files) prepared.push({ file: entry.file, url: URL.createObjectURL(entry.file) })
      for (const entry of prepared) {
        const anchor = document.createElement('a')
        anchor.href = entry.url; anchor.download = entry.file.name
        document.body.appendChild(anchor); anchor.click(); anchor.remove()
      }
    } finally { for (const entry of prepared) setTimeout(() => URL.revokeObjectURL(entry.url), 1000) }
    ElMessage.success(`已发起 ${files.length} 份原文件下载`)
    return true
  } catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
function fileSize(file) { return file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : '' }
onBeforeRouteLeave(allowLeave)
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => { generation += 1; window.removeEventListener('beforeunload', beforeUnload) })
watch(() => [session.value.role, session.value.name, state.airWaybillTemplates], () => {
  generation += 1; busy.value = false; resetEditor(); selectedIds.value = []; table.value?.clearSelection()
}, { flush: 'sync' })
</script>

<template>
  <div>
    <PageHeader title="提单模板管理" description="按航司和类型管理模板原文件。">
      <template #actions><el-button v-business-write="'airwayBills'" type="primary" :disabled="!allowed || busy" @click="open">模板上传</el-button></template>
    </PageHeader>
    <el-alert v-if="!allowed && !session.readAll" title="仅产品人员和技术人员可管理提单模板。" type="info" :closable="false" />
    <template v-else>
      <el-alert title="模板配置方式待确认；已上传文件暂不标记为已完成。" type="info" :closable="false" class="template-notice" />
      <el-alert v-if="failure && !visible" :title="failure" type="error" :closable="false" role="alert" />
      <el-form class="filter-card template-filters" :inline="true" @submit.prevent="query">
        <el-form-item label="航司代码"><el-select v-model="filters.airlineCode" clearable filterable aria-label="查询航司代码" placeholder="全部"><el-option v-for="airline in airlines" :key="airline.id" :label="`${airline.code} · ${airline.name}`" :value="airline.code" /></el-select></el-form-item>
        <el-form-item label="类型"><el-select v-model="filters.type" clearable aria-label="查询模板类型" placeholder="全部"><el-option v-for="type in AIR_WAYBILL_TEMPLATE_TYPES" :key="type" :value="type" /></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="filters.status" clearable aria-label="查询模板状态" placeholder="全部"><el-option v-for="status in ['已完成', '已上传']" :key="status" :value="status" /></el-select></el-form-item>
        <el-form-item><el-button native-type="submit" type="primary">查询</el-button><el-button @click="resetQuery">重置</el-button></el-form-item>
      </el-form>
      <DataTableFrame :key="JSON.stringify(applied)" :rows="rows" :selectable="true" :selected-count="selectedIds.length">
        <template #actions><el-button :disabled="!selectedIds.length || busy" @click="download()">批量下载</el-button><el-button :disabled="!selectedIds.length || busy" @click="selectedIds = []; table?.clearSelection()">清空选择</el-button></template>
        <template #default="{ rows: pageRows }">
          <el-table ref="table" :data="pageRows" row-key="id" aria-label="提单模板列表" @selection-change="items => selectedIds = items.map(row => row.id)">
            <el-table-column type="selection" width="48" reserve-selection />
            <el-table-column prop="airlineCode" label="航司代码" width="110" />
            <el-table-column label="航线代码" width="115"><template #default><span title="航线代码来源待确认">—</span></template></el-table-column>
            <el-table-column prop="type" label="类型" min-width="190" />
            <el-table-column label="原文件" min-width="200"><template #default="{ row }">{{ row.file?.name || '原文件不可用' }}</template></el-table-column>
            <el-table-column prop="createdAt" label="创建时间" width="160" />
            <el-table-column label="状态" width="100"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
            <el-table-column label="操作" width="80" fixed="right"><template #default="{ row }"><el-button link type="primary" :disabled="busy" @click="download([row.id])">下载</el-button></template></el-table-column>
            <template #empty><el-empty description="暂无匹配的模板，可清除筛选或上传模板文件。" /></template>
          </el-table>
        </template>
      </DataTableFrame>
    </template>
    <el-dialog :model-value="visible" title="模板上传" width="min(640px, 96vw)" align-center :close-on-click-modal="false" :before-close="close" destroy-on-close>
      <div ref="editor" class="template-upload-body">
        <el-alert v-if="failure" :title="failure" type="error" :closable="false" role="alert" />
        <el-alert v-if="errors.duplicate" :title="errors.duplicate" type="warning" :closable="false" />
        <el-form :model="draft" label-position="top" @submit.prevent="save">
          <el-form-item label="航司代码" required :error="submitted ? errors.airlineCode : ''"><el-select v-model="draft.airlineCode" filterable :disabled="busy || !allowed" aria-label="上传模板航司代码"><el-option v-for="airline in airlines" :key="airline.id" :label="`${airline.code} · ${airline.name}`" :value="airline.code" /></el-select></el-form-item>
          <el-form-item label="类型" required :error="submitted ? errors.type : ''"><el-select v-model="draft.type" :disabled="busy || !allowed" aria-label="上传模板类型"><el-option v-for="type in AIR_WAYBILL_TEMPLATE_TYPES" :key="type" :value="type" /></el-select></el-form-item>
          <el-form-item label="上传文件" required :error="fileFailure || (submitted ? errors.file : '')">
            <div class="template-file-control">
              <input ref="input" type="file" :accept="AIR_WAYBILL_TEMPLATE_ACCEPT" class="template-file-input" aria-label="选择提单模板文件" :disabled="busy || !allowed" @change="selectFile" />
              <el-button :disabled="busy || !allowed" @click="input?.click()">{{ draft.file ? '重新选择文件' : '选择文件' }}</el-button>
              <p class="template-file-hint">支持 DOC、DOCX、XLSX、XLS；单个文件不超过 20 MB。</p>
              <div v-if="draft.file" class="template-file"><span>{{ draft.file.name }} · {{ fileSize(draft.file) }}</span><el-button link type="danger" :disabled="busy || !allowed" @click="removeFile">删除待上传文件</el-button></div>
            </div>
          </el-form-item>
        </el-form>
      </div>
      <template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button v-business-write="'airwayBills'" type="primary" :disabled="!allowed || Boolean(errors.duplicate)" :loading="busy" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.template-notice { margin-bottom: 16px; }
.template-filters :deep(.el-select) { width: 210px; }
.template-file-input { display: none; }
.template-file-control { min-width: 0; width: 100%; }
.template-file-hint { margin: 8px 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.template-file { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.template-file span { overflow-wrap: anywhere; }
.template-upload-body { max-height: 65vh; overflow-y: auto; }
@media (max-width: 760px) { .template-filters :deep(.el-form-item) { display: flex; margin-right: 0; } .template-filters :deep(.el-select) { width: 100%; } }
</style>
