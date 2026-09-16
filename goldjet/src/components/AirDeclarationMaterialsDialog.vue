<script setup>
import { computed, onBeforeUnmount, ref, unref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canManageAirDeclarations, buildAirDeclarationMaterialNotice, getAirDeclarationMaterialFile } from '../domain/airDeclarations.js'

const props = defineProps({
  modelValue: Boolean,
  declarations: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  mode: { type: String, default: 'materials' },
})
const emit = defineEmits(['update:modelValue'])
const { state, declarationSession, getAirDeclarationFiles, notifyAirDeclarationMaterials } = usePrototypeData()
const session = computed(() => unref(declarationSession) || {})
const allowed = computed(() => canManageAirDeclarations(session.value))
const selected = ref([]), pending = ref([]), pendingSnapshot = ref(''), failure = ref(''), result = ref(''), busy = ref(false)
const downloadLinks = ref([])
const downloadUrls = new Set()
const selectedDeclarations = computed(() => props.declarations.filter(row => props.selectedIds.includes(row.id)))
const materialKey = (serviceId, materialId) => JSON.stringify([serviceId, materialId])
const materials = computed(() => selectedDeclarations.value.flatMap(row => (row.materials || []).map(material => ({
  key: materialKey(row.id, material.id), serviceId: row.id, materialId: material.id, row, material,
}))))
const selectedTargets = computed(() => materials.value.filter(item => selected.value.includes(item.key)).map(targetOf))
const allSelected = computed(() => materials.value.length > 0 && selected.value.length === materials.value.length)
const history = computed(() => selectedDeclarations.value.flatMap(row => row.materialRequests || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id))))
const pendingNotices = computed(() => noticesFor(pending.value))
const pendingError = computed(() => pendingNotices.value.find(row => row.error)?.error || '')
const downloadError = computed(() => selectedTargets.value.length ? downloadRestriction(selectedTargets.value) : '请选择要下载的材料')
const notifyError = computed(() => selectedTargets.value.length ? noticesFor(selectedTargets.value).find(row => row.error)?.error || '' : '请选择需要补齐的材料')
let generation = 0
let pendingGeneration = 0

function targetOf(item) { return { serviceId: item.serviceId, materialId: item.materialId } }
function findTarget(target) { return materials.value.find(item => item.serviceId === target.serviceId && item.materialId === target.materialId) }
function fileAvailable(material) {
  try { return Boolean(getAirDeclarationMaterialFile(material)?.blob) } catch { return false }
}
function noticeFor(item) {
  try { return { ...targetOf(item), ...buildAirDeclarationMaterialNotice(item.row, item.material) } }
  catch (error) { return { ...targetOf(item), error: error.message } }
}
function noticesFor(targets) {
  return targets.map(target => {
    const item = findTarget(target)
    return item ? noticeFor(item) : { ...target, error: '所选材料已变化，请重新选择' }
  })
}
function downloadRestriction(targets) {
  if (!allowed.value) return '仅报关行客服可下载材料'
  return targets.some(target => { const item = findTarget(target); return !item || !fileAvailable(item.material) })
    ? '所选材料中存在不可下载的文件，请重新选择' : ''
}
function releaseDownloads() {
  for (const url of downloadUrls) URL.revokeObjectURL(url)
  downloadUrls.clear(); downloadLinks.value = []
}
function reset() { releaseDownloads(); selected.value = []; pending.value = []; pendingSnapshot.value = ''; failure.value = ''; result.value = ''; busy.value = false }
watch(() => [props.modelValue, JSON.stringify(props.selectedIds), props.mode], () => { generation += 1; reset() }, { immediate: true, flush: 'sync' })
watch(() => [session.value.role, session.value.name, state.airOrders, state.airChildren], () => {
  generation += 1; reset()
  if (props.modelValue) emit('update:modelValue', false)
}, { flush: 'sync' })
watch(materials, rows => {
  const keys = new Set(rows.map(row => row.key))
  selected.value = selected.value.filter(key => keys.has(key))
})
onBeforeUnmount(releaseDownloads)
function close(done) {
  if (busy.value) return false
  generation += 1; reset(); emit('update:modelValue', false)
  if (typeof done === 'function') done()
  return true
}
function toggle(key, checked) {
  if (!props.modelValue || !allowed.value || busy.value || pending.value.length) return false
  const keys = new Set(selected.value)
  if (checked && materials.value.some(row => row.key === key)) keys.add(key)
  else keys.delete(key)
  selected.value = [...keys]
  return true
}
function selectAll(checked) {
  if (!props.modelValue || !allowed.value || busy.value || pending.value.length) return false
  selected.value = checked ? materials.value.map(row => row.key) : []
  return true
}
function download(targets = selectedTargets.value) {
  if (!props.modelValue || !allowed.value || busy.value || !targets.length) return false
  failure.value = ''; result.value = ''
  const restriction = downloadRestriction(targets)
  if (restriction) { failure.value = restriction; return false }
  busy.value = true
  try {
    const files = getAirDeclarationFiles(targets)
    const prepared = []
    try {
      for (const entry of files) {
        if (!entry.name || !(entry.blob instanceof Blob) || !entry.blob.size) throw new Error('材料原文件不可用，请重新选择')
        const file = new File([entry.blob], entry.name, { type: entry.blob.type, lastModified: 0 })
        prepared.push({ name: file.name, size: file.size, url: URL.createObjectURL(file) })
      }
    } catch (error) {
      for (const file of prepared) URL.revokeObjectURL(file.url)
      throw error
    }
    for (const file of prepared) downloadUrls.add(file.url)
    downloadLinks.value = prepared
    for (const file of prepared) {
      const anchor = document.createElement('a')
      anchor.href = file.url; anchor.download = file.name
      document.body.appendChild(anchor)
      try { anchor.click() } finally { anchor.remove() }
    }
    result.value = `已准备 ${files.length} 份材料原文件并发起下载；若浏览器未自动保存，请点击下方文件链接。`
    ElMessage.success(result.value)
    return true
  } catch (error) { failure.value = downloadLinks.value.length ? `自动下载未完成：${error.message}。请点击下方文件链接重试。` : error.message; return false }
  finally { busy.value = false }
}
function retryDownload(file, event) {
  if (!props.modelValue || !allowed.value || busy.value || !downloadUrls.has(file.url) || !downloadLinks.value.includes(file)) {
    event?.preventDefault()
    failure.value = '下载链接已失效，请重新选择材料并下载'
    return false
  }
  failure.value = ''
  result.value = `已请求下载“${file.name}”；请检查浏览器下载记录。`
  return true
}
function prepareNotification(targets = selectedTargets.value) {
  if (!props.modelValue || !allowed.value || busy.value || !targets.length) return false
  failure.value = ''; result.value = ''
  const notices = noticesFor(targets)
  const error = notices.find(row => row.error)
  if (error) { failure.value = error.error; return false }
  pending.value = targets.map(row => ({ ...row }))
  pendingSnapshot.value = JSON.stringify(notices)
  pendingGeneration = generation
  return true
}
function cancelNotification() { if (busy.value) return false; pending.value = []; pendingSnapshot.value = ''; return true }
function confirmNotification() {
  if (!props.modelValue || !allowed.value || busy.value || !pending.value.length) return false
  failure.value = ''; result.value = ''
  if (pendingGeneration !== generation || pendingError.value || pendingSnapshot.value !== JSON.stringify(pendingNotices.value)) {
    failure.value = '材料或接收人已变化，请返回重新选择并确认通知'
    return false
  }
  busy.value = true
  try {
    const requests = notifyAirDeclarationMaterials(pending.value.map(row => ({ ...row })))
    result.value = `已记录 ${requests.length} 条材料补齐通知（本地模拟）`
    pending.value = []; pendingSnapshot.value = ''
    ElMessage.success(result.value)
    return true
  } catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
</script>

<template>
  <el-dialog :model-value="modelValue" :title="pending.length ? '确认材料补齐通知' : mode === 'notify' ? '材料补齐通知' : '报关材料'" width="min(1050px, 96vw)" align-center append-to-body :before-close="close" :close-on-click-modal="false" destroy-on-close>
    <div class="declaration-material-body">
      <el-alert v-if="!allowed" title="仅报关行客服可下载材料或发起补齐通知。" type="info" :closable="false" />
      <el-alert v-if="failure" :title="failure" type="error" :closable="false" role="alert" />
      <el-alert v-if="result" :title="result" type="success" :closable="false" role="status" />
      <section v-if="downloadLinks.length" class="declaration-download-results" aria-label="材料下载文件">
        <h3>材料下载文件</h3>
        <p class="materials-hint">若未自动保存，可点击文件名重新下载。关闭弹窗后链接失效。</p>
        <ul><li v-for="file in downloadLinks" :key="file.url"><a :href="file.url" :download="file.name" :aria-label="`重新下载${file.name}`" @click="retryDownload(file, $event)">{{ file.name }}</a><span>{{ file.size }} 字节</span></li></ul>
      </section>
      <template v-if="pending.length">
        <p class="materials-hint">将向以下建单客服发送材料补齐通知。当前仅记录本地模拟消息。</p>
        <el-alert v-if="pendingError" :title="pendingError" type="error" :closable="false" />
        <div class="materials-table-wrap"><el-table :data="pendingNotices" aria-label="待发送材料补齐通知">
          <el-table-column prop="serviceId" label="报关服务号" min-width="180" />
          <el-table-column prop="recipient" label="接收人" min-width="120" />
          <el-table-column prop="content" label="通知内容" min-width="360" />
        </el-table></div>
      </template>
      <template v-else>
        <div class="material-selection-bar"><el-checkbox :model-value="allSelected" :indeterminate="selected.length > 0 && !allSelected" :disabled="!allowed || busy || !materials.length" @change="selectAll">选择全部材料</el-checkbox><span>已选 {{ selectedTargets.length }} / {{ materials.length }} 份材料 · {{ selectedDeclarations.length }} 个报关服务</span></div>
        <el-empty v-if="!selectedDeclarations.length" description="所选报关服务已不存在，请关闭后重新选择。" />
        <section v-for="row in selectedDeclarations" :key="row.id" class="declaration-material-service">
          <h3>{{ row.id }}</h3>
          <p class="material-context">{{ row.childId ? `分单号：${row.housebillNo || '未填写'}` : `订单号：${row.orderNo || '未填写'}` }} · {{ row.customer }}</p>
          <dl class="material-metadata"><div><dt>报关选择</dt><dd>{{ row.choice || '未填写' }}</dd></div><div><dt>报关类型</dt><dd>{{ row.details?.customsType || '对应关系待确认' }}</dd></div><div><dt>单证类型</dt><dd>{{ row.documentType || '未填写' }}</dd></div><div><dt>建单客服</dt><dd>{{ row.creator || '接收人未确定' }}</dd></div></dl>
          <p v-if="!row.materials?.length" class="materials-hint">尚无已上传材料。</p>
          <ul v-else class="declaration-material-list" :aria-label="`${row.id}已上传材料`">
            <li v-for="material in row.materials" :key="material.id">
              <el-checkbox :model-value="selected.includes(materialKey(row.id, material.id))" :aria-label="`选择${row.id}的${material.name}`" :disabled="!allowed || busy" @change="toggle(materialKey(row.id, material.id), $event)" />
              <div class="material-name"><strong>{{ material.name }}</strong><span>{{ material.fileName || '原文件名未记录' }}</span><span v-if="!fileAvailable(material)" class="material-error">原文件不可用</span><span v-if="noticeFor({ serviceId: row.id, materialId: material.id, row, material }).error" class="material-error">{{ noticeFor({ serviceId: row.id, materialId: material.id, row, material }).error }}</span></div>
              <div class="material-row-actions">
                <el-button v-if="fileAvailable(material)" link type="primary" :disabled="!allowed || busy" :aria-label="`下载${row.id}的${material.name}`" @click="download([{ serviceId: row.id, materialId: material.id }])">下载</el-button>
                <el-button link type="warning" :disabled="!allowed || busy || Boolean(noticeFor({ serviceId: row.id, materialId: material.id, row, material }).error)" :aria-label="`通知补齐${row.id}的${material.name}`" @click="prepareNotification([{ serviceId: row.id, materialId: material.id }])">补齐通知</el-button>
              </div>
            </li>
          </ul>
        </section>
        <section v-if="history.length" class="declaration-notice-history"><h3>补齐通知记录</h3><div class="materials-table-wrap"><el-table :data="history" aria-label="材料补齐通知记录"><el-table-column prop="createdAt" label="时间" min-width="165" /><el-table-column prop="recipient" label="接收人" min-width="100" /><el-table-column prop="content" label="通知内容" min-width="320" /><el-table-column label="结果" min-width="100"><template #default>本地模拟</template></el-table-column></el-table></div></section>
      </template>
    </div>
    <template #footer>
      <div class="declaration-material-footer">
        <template v-if="pending.length"><el-button :disabled="busy" @click="cancelNotification">返回选择材料</el-button><el-button type="primary" :disabled="!allowed || Boolean(pendingError)" :loading="busy" @click="confirmNotification">确认补齐通知</el-button></template>
        <template v-else><el-button :disabled="busy" @click="close">关闭</el-button><el-button :disabled="!allowed || busy || Boolean(downloadError)" :title="downloadError" @click="download()">批量下载</el-button><el-button type="primary" :disabled="!allowed || busy || Boolean(notifyError)" :title="notifyError" @click="prepareNotification()">批量补齐通知</el-button></template>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.declaration-material-body { max-height: min(68dvh, calc(100dvh - 200px), 680px); overflow-y: auto; min-width: 0; padding-right: 4px; }
.declaration-material-body > .el-alert { margin-bottom: 12px; }
.declaration-download-results { margin: 12px 0 18px; padding: 14px; border: 1px solid var(--border); border-radius: 8px; }
.declaration-download-results h3 { margin: 0; font-size: 15px; }
.declaration-download-results ul { margin: 0; padding-left: 20px; }
.declaration-download-results li { margin: 8px 0; overflow-wrap: anywhere; }
.declaration-download-results a { color: var(--primary); text-decoration: underline; }
.declaration-download-results span { margin-left: 12px; color: var(--muted); font-size: 12px; }
.material-selection-bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 14px; }
.material-selection-bar span, .materials-hint, .material-context { color: var(--muted); font-size: 13px; line-height: 1.7; }
.declaration-material-service { border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
.declaration-material-service h3, .declaration-notice-history h3 { margin: 0 0 10px; font-size: 15px; overflow-wrap: anywhere; }
.material-context { margin: 0 0 12px; overflow-wrap: anywhere; }
.material-metadata { display: flex; gap: 12px 28px; flex-wrap: wrap; margin: 0; font-size: 13px; }
.material-metadata div { min-width: 100px; }
.material-metadata dt { color: var(--muted); }
.material-metadata dd { margin: 4px 0 0; overflow-wrap: anywhere; }
.declaration-material-list { list-style: none; padding: 0; margin: 12px 0 0; }
.declaration-material-list li { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 10px 0; border-top: 1px solid var(--border); }
.material-name { flex: 1; min-width: min(180px, 100%); overflow-wrap: anywhere; display: grid; gap: 4px; }
.material-name span { color: var(--muted); font-size: 12px; }
.material-name .material-error { color: var(--danger); }
.material-row-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-left: auto; }
.material-row-actions :deep(.el-button + .el-button) { margin-left: 0; }
.materials-table-wrap { max-width: 100%; overflow-x: auto; }
.declaration-material-footer { display: flex; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.declaration-material-footer :deep(.el-button + .el-button) { margin-left: 0; }
</style>
