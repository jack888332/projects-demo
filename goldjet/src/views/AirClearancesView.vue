<script setup>
import { computed, onBeforeUnmount, reactive, ref, unref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Download } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { getAirServiceMaterialFile } from '../domain/airServiceMaterials.js'
import {
  CLEARANCE_CARGO_FIELDS, CLEARANCE_LIST_FIELDS, CLEARANCE_ORDER_STATUSES, CLEARANCE_SERVICE_STATUSES,
  CLEARANCE_RESULT_BLOCK_REASON, CLEARANCE_PDF_BLOCK_REASON, canManageAirClearances, clearanceOperationTime, filterAirClearances,
} from '../domain/airClearances.js'

const route = useRoute()
const { state, clearanceSession, airClearances, acceptAirClearance, getAirClearanceFiles } = usePrototypeData()
const allowed = computed(() => unref(clearanceSession).readAll || canManageAirClearances(unref(clearanceSession)))
const allRows = computed(() => allowed.value ? unref(airClearances) : [])
const emptyFilters = () => ({ number: '', customer: '', origin: '', destination: '', created: [], departure: [], orderStatus: '', serviceStatus: '' })
const filters = reactive(emptyFilters()), applied = ref(emptyFilters()), queryVersion = ref(0)
const rows = computed(() => filterAirClearances(allRows.value, applied.value))
const origins = computed(() => [...new Set(allRows.value.map(row => row.origin).filter(Boolean))].sort())
const destinations = computed(() => [...new Set(allRows.value.map(row => row.destination).filter(Boolean))].sort())
const selected = ref([]), detailId = ref(''), detailVisible = ref(false), accepting = ref(false), failure = ref('')
const detail = computed(() => allRows.value.find(row => row.id === detailId.value))
const materialsVisible = ref(false), materialServiceIds = ref([]), selectedMaterials = ref([])
const materialRows = computed(() => allRows.value.filter(row => materialServiceIds.value.includes(row.id)).flatMap(row => row.materials.map(material => ({
  key: JSON.stringify([row.id, material.id]), serviceId: row.id, materialId: material.id,
  number: row.housebillNo || row.orderNo, material,
}))))
const selectedTargets = computed(() => materialRows.value.filter(row => selectedMaterials.value.includes(row.key)))
const selectedHaveMaterials = computed(() => allRows.value.some(row => selected.value.includes(row.id) && row.materials.length))
const downloadLinks = ref([]), downloadFailure = ref(''), downloadBusy = ref(false)
const pickup = ref(false), delivery = ref(false), resultTime = ref('')
const show = value => value === '' || value === null || value === undefined ? '未提供' : value
const cargoGroups = [['warehouseCargo', '入中转仓货物数据'], ['waybillCargo', '提单货物数据']]
const instructionFields = [['secondDepartureDate', '二程出港日期'], ['expectedArrival', '预计到达日期'], ['deliveryAddress', '派送地址'], ['contact', '联系人'], ['phone', '电话']]
const sourceFields = [['orderNo', '来源订单号'], ['mainOrderNo', '主订单号'], ['housebillNo', '分单号'], ['waybillNo', '主提单号'], ['id', '清关派送服务号'], ['instructionAt', '指令时间']]

function query() {
  applied.value = { ...filters, departure: [...(filters.departure || [])], created: [...(filters.created || [])] }
  selected.value = []; queryVersion.value += 1
}
function resetQuery() { Object.assign(filters, emptyFilters()); query(); failure.value = '' }
function toggle(id, checked) {
  selected.value = selected.value.filter(value => value !== id)
  if (checked && allRows.value.some(row => row.id === id)) selected.value.push(id)
}
function togglePage(pageRows, checked) { pageRows.forEach(row => toggle(row.id, checked)) }
const pageSelected = pageRows => pageRows.length > 0 && pageRows.every(row => selected.value.includes(row.id))
function openDetail(row) {
  if (!allRows.value.some(item => item.id === row.id)) return false
  detailId.value = row.id; detailVisible.value = true; accepting.value = false
  pickup.value = false; delivery.value = false; resultTime.value = ''
  failure.value = ''
  return true
}
function prepareAcceptance() {
  if (!detail.value || detail.value.acceptanceBlockReason) return false
  accepting.value = true
  return true
}
function confirmAcceptance() {
  if (!detailVisible.value || !accepting.value || !allowed.value || !detail.value) return false
  try {
    acceptAirClearance(detail.value.id)
    accepting.value = false; failure.value = ''
    ElMessage.success('已记录接单人和接单时间；服务状态保持不变')
    return true
  } catch (error) { failure.value = error.message; return false }
}
function resultChanged() { if ((pickup.value || delivery.value) && !resultTime.value) resultTime.value = clearanceOperationTime() }
function releaseDownloads() {
  for (const file of downloadLinks.value) URL.revokeObjectURL(file.url)
  downloadLinks.value = []
}
function openMaterials(ids) {
  if (!allowed.value) return false
  materialServiceIds.value = ids.filter(id => allRows.value.some(row => row.id === id))
  if (!materialServiceIds.value.length) return false
  selectedMaterials.value = []; downloadFailure.value = ''; releaseDownloads()
  materialsVisible.value = true
  return true
}
function fileAvailable(material) { try { return Boolean(getAirServiceMaterialFile(material)) } catch { return false } }
function toggleMaterial(key, checked) {
  selectedMaterials.value = selectedMaterials.value.filter(value => value !== key)
  if (checked && allowed.value && materialRows.value.some(row => row.key === key)) selectedMaterials.value.push(key)
}
function selectAllMaterials(checked) { selectedMaterials.value = allowed.value && checked ? materialRows.value.map(row => row.key) : [] }
function download(targets = selectedTargets.value) {
  if (!allowed.value || !materialsVisible.value || downloadBusy.value || !targets.length) return false
  downloadFailure.value = ''; downloadBusy.value = true; releaseDownloads()
  const prepared = []
  try {
    const files = getAirClearanceFiles(targets.map(({ serviceId, materialId }) => ({ serviceId, materialId })))
    for (const file of files) prepared.push({ name: file.name, size: file.blob.size, url: URL.createObjectURL(file.blob) })
    downloadLinks.value = prepared
    for (const file of prepared) {
      const anchor = document.createElement('a')
      anchor.href = file.url; anchor.download = file.name; document.body.appendChild(anchor)
      try { anchor.click() } finally { anchor.remove() }
    }
    ElMessage.success(`已请求下载 ${files.length} 份原文件`)
    return true
  } catch (error) {
    if (!downloadLinks.value.length) for (const file of prepared) URL.revokeObjectURL(file.url)
    downloadFailure.value = error.message
    return false
  } finally { downloadBusy.value = false }
}
function retryDownload(file, event) {
  if (!allowed.value || !materialsVisible.value || !downloadLinks.value.includes(file)) { event?.preventDefault(); return false }
  return true
}
function followLink() {
  if (!allowed.value || !route.query.service) return
  const row = allRows.value.find(row => row.id === route.query.service)
  if (row) openDetail(row)
  else { detailVisible.value = false; failure.value = '该清关派送指令不存在，请重新查询。' }
}
watch(() => [route.query.service, allowed.value], followLink, { immediate: true })
watch(() => [state.airOrders, state.airChildren, unref(clearanceSession).role, unref(clearanceSession).name], () => {
  selected.value = []; detailVisible.value = false; materialsVisible.value = false; accepting.value = false
  materialServiceIds.value = []; selectedMaterials.value = []; failure.value = ''; downloadFailure.value = ''; releaseDownloads()
}, { flush: 'sync' })
watch(materialsVisible, value => { if (!value) { selectedMaterials.value = []; releaseDownloads() } }, { flush: 'sync' })
// An upstream attachment replacement invalidates every previously prepared file URL.
watch(() => materialRows.value.map(row => [row.key, row.material.content, row.material.fileName]), () => {
  selectedMaterials.value = []; releaseDownloads()
}, { flush: 'sync' })
onBeforeUnmount(releaseDownloads)
</script>

<template>
  <div class="module-view clearance-view">
    <PageHeader title="清关派送" />
    <el-alert v-if="!allowed" title="当前角色无权查看清关派送指令。办理角色：海外部客服。" type="info" :closable="false" />
    <template v-else>
      <el-alert v-if="failure && !detailVisible" :title="failure" type="error" :closable="false" role="alert" />
      <form class="clearance-filters" aria-label="清关派送查询" @submit.prevent="query">
        <label>订单号 / 提单号<el-input v-model="filters.number" clearable aria-label="清关订单号或提单号" /></label>
        <label>客户<el-input v-model="filters.customer" clearable aria-label="清关客户" /></label>
        <label>始发港<el-select v-model="filters.origin" clearable filterable placeholder="全部" aria-label="清关始发港"><el-option v-for="value in origins" :key="value" :value="value" /></el-select></label>
        <label>目的港<el-select v-model="filters.destination" clearable filterable placeholder="全部" aria-label="清关目的港"><el-option v-for="value in destinations" :key="value" :value="value" /></el-select></label>
        <label>建单日期<el-date-picker v-model="filters.created" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" aria-label="清关建单日期" /></label>
        <label>出港日期<el-date-picker v-model="filters.departure" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" aria-label="清关出港日期" /></label>
        <label>订单状态<el-select v-model="filters.orderStatus" clearable placeholder="全部" aria-label="清关订单状态"><el-option v-for="value in CLEARANCE_ORDER_STATUSES" :key="value" :value="value" /></el-select></label>
        <label>服务状态<el-select v-model="filters.serviceStatus" clearable placeholder="全部" aria-label="清关服务状态"><el-option v-for="value in CLEARANCE_SERVICE_STATUSES" :key="value" :value="value" /></el-select></label>
        <div class="clearance-actions"><el-button type="primary" native-type="submit" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="resetQuery">重置</el-button></div>
      </form>
      <DataTableFrame :key="queryVersion" :rows="rows" :page-size="10" :page-sizes="[10, 20, 50]" selectable :selected-count="selected.length">
        <template #actions><div class="clearance-actions"><el-button v-if="selected.length" link @click="selected = []">清除选择</el-button><el-button :icon="Download" :disabled="!selectedHaveMaterials" @click="openMaterials(selected)">批量下载材料</el-button></div></template>
        <template #default="{ rows: pageRows }">
          <el-table :data="pageRows" row-key="id" aria-label="清关派送订单列表" empty-text="暂无符合条件的清关派送指令">
            <el-table-column width="48"><template #header><el-checkbox :model-value="pageSelected(pageRows)" :indeterminate="!pageSelected(pageRows) && pageRows.some(row => selected.includes(row.id))" :disabled="!pageRows.length" aria-label="选择本页清关服务" @change="value => togglePage(pageRows, value)" /></template><template #default="{ row }"><el-checkbox :model-value="selected.includes(row.id)" :aria-label="`选择清关服务${row.id}`" @change="value => toggle(row.id, value)" /></template></el-table-column>
            <el-table-column label="提单号 / 分单号" min-width="180"><template #default="{ row }"><el-button link type="primary" :aria-label="`查看清关服务${row.id}`" @click="openDetail(row)">{{ row.waybillNo || row.orderNo }}</el-button><small>{{ row.housebillNo || '直单' }}</small></template></el-table-column>
            <el-table-column prop="orderNo" label="来源订单号" min-width="195" />
            <el-table-column v-for="[key, label] in cargoGroups" :key="key" :label="label"><el-table-column v-for="[field, title] in CLEARANCE_CARGO_FIELDS" :key="field" :label="title" width="120" align="right"><template #default="{ row }">{{ show(row[key][field]) }}</template></el-table-column></el-table-column>
            <el-table-column v-for="[key, label, width] in CLEARANCE_LIST_FIELDS" :key="key" :label="label" :min-width="width" show-overflow-tooltip><template #default="{ row }">{{ show(row[key]) }}</template></el-table-column>
            <el-table-column label="订单状态" width="115"><template #default="{ row }"><StatusTag :label="row.orderStatus" /></template></el-table-column>
            <el-table-column label="服务状态" width="120"><template #default="{ row }"><StatusTag :label="row.serviceStatus" /></template></el-table-column>
            <el-table-column label="接单人 / 时间" min-width="175"><template #default="{ row }">{{ row.acceptance?.actor || '未接单' }}<small>{{ row.acceptance?.time }}</small></template></el-table-column>
            <el-table-column label="操作" fixed="right" width="145"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">详情</el-button><el-button link type="primary" @click="openMaterials([row.id])">材料</el-button></template></el-table-column>
          </el-table>
        </template>
      </DataTableFrame>
    </template>

    <el-dialog v-model="detailVisible" title="清关派送详情" width="min(1050px, 96vw)" :close-on-click-modal="false" destroy-on-close>
      <div v-if="detail && allowed" class="clearance-dialog-body">
        <el-alert v-if="failure" :title="failure" type="error" :closable="false" role="alert" />
        <section><h3>订单与指令</h3><dl class="clearance-grid"><div v-for="[key, label] in [...sourceFields, ...CLEARANCE_LIST_FIELDS]" :key="key"><dt>{{ label }}</dt><dd>{{ key === 'housebillNo' && !detail.childId ? '不适用（直单）' : show(detail[key]) }}</dd></div><div><dt>订单状态</dt><dd><StatusTag :label="detail.orderStatus" /></dd></div><div><dt>服务状态</dt><dd><StatusTag :label="detail.serviceStatus" /></dd></div></dl></section>
        <section><h3>货物数据</h3><el-table :data="cargoGroups.map(([key, label]) => ({ label, ...detail[key] }))" aria-label="清关货物数据"><el-table-column prop="label" label="数据阶段" min-width="180" /><el-table-column v-for="[key, label] in CLEARANCE_CARGO_FIELDS" :key="key" :label="label" min-width="120" align="right"><template #default="{ row }">{{ show(row[key]) }}</template></el-table-column></el-table></section>
        <section><h3>派送信息</h3><dl class="clearance-grid"><div v-for="[key, label] in instructionFields" :key="key"><dt>{{ label }}</dt><dd>{{ show(detail.details[key]) }}</dd></div></dl></section>
        <section><h3>接单记录</h3><dl v-if="detail.acceptance" class="clearance-grid"><div><dt>接单人</dt><dd>{{ detail.acceptance.actor }}</dd></div><div><dt>接单时间</dt><dd>{{ detail.acceptance.time }}</dd></div></dl><template v-else><p v-if="detail.acceptanceBlockReason" class="muted">{{ detail.acceptanceBlockReason }}</p><template v-else-if="accepting"><p>确认由 {{ unref(clearanceSession).name }} 接单？仅记录接单信息，服务状态仍以清关回执为准。</p><div class="clearance-actions"><el-button @click="accepting = false">取消</el-button><el-button v-business-write="'clearance'" type="primary" @click="confirmAcceptance">确认接单</el-button></div></template><el-button v-business-write="'clearance'" v-else type="primary" @click="prepareAcceptance">接单</el-button></template></section>
        <section><h3>提货与送达结果</h3><el-alert :title="CLEARANCE_RESULT_BLOCK_REASON" type="info" :closable="false" /><div class="clearance-actions result-choice"><el-checkbox v-model="pickup" @change="resultChanged">目的地提货</el-checkbox><el-checkbox v-model="delivery" @change="resultChanged">清关送达</el-checkbox></div><dl v-if="pickup || delivery" class="clearance-grid"><div><dt>操作时间</dt><dd>{{ resultTime }}</dd></div><div><dt>数量 / 剩余毛件体</dt><dd>录入维度及扣减口径待确认</dd></div></dl><el-button v-if="pickup || delivery" disabled>确认保存</el-button></section>
      </div>
      <el-empty v-else description="该清关派送指令不存在或不可见" />
      <template #footer><div class="clearance-actions dialog-footer"><el-button @click="detailVisible = false">关闭</el-button><el-button v-if="detail" type="primary" :icon="Download" @click="detailVisible = false; openMaterials([detail.id])">查看材料</el-button></div></template>
    </el-dialog>

    <el-dialog v-model="materialsVisible" title="清关派送材料" width="min(950px, 96vw)" :close-on-click-modal="false" destroy-on-close>
      <div class="clearance-dialog-body">
        <el-alert v-if="downloadFailure" :title="downloadFailure" type="error" :closable="false" role="alert" />
        <div class="clearance-actions"><el-checkbox :model-value="materialRows.length > 0 && selectedMaterials.length === materialRows.length" :indeterminate="selectedMaterials.length > 0 && selectedMaterials.length < materialRows.length" :disabled="!materialRows.length || !allowed" @change="selectAllMaterials">选择全部材料</el-checkbox><span class="muted">已选 {{ selectedMaterials.length }} / {{ materialRows.length }} 份</span></div>
        <el-table :data="materialRows" row-key="key" aria-label="清关派送材料列表" empty-text="尚无已上传材料">
          <el-table-column width="45"><template #default="{ row }"><el-checkbox :model-value="selectedMaterials.includes(row.key)" :aria-label="`选择材料${row.material.fileName}`" @change="value => toggleMaterial(row.key, value)" /></template></el-table-column>
          <el-table-column label="文件名" min-width="210"><template #default="{ row }">{{ show(row.material.fileName) }}<small v-if="!fileAvailable(row.material)" class="file-error">原文件不可用</small></template></el-table-column>
          <el-table-column prop="number" label="来源订单 / 分单" min-width="190" />
          <el-table-column label="操作" width="85" fixed="right"><template #default="{ row }"><el-button link type="primary" :disabled="!fileAvailable(row.material) || downloadBusy" :aria-label="`下载材料${row.material.fileName}`" @click="download([row])">下载</el-button></template></el-table-column>
        </el-table>
        <section v-if="downloadLinks.length" aria-label="清关下载文件"><h3>下载文件</h3><ul class="download-files"><li v-for="file in downloadLinks" :key="file.url"><a :href="file.url" :download="file.name" @click="retryDownload(file, $event)">{{ file.name }}</a><span>{{ file.size }} 字节</span></li></ul></section>
        <section><h3>航司单据</h3><p class="muted">{{ CLEARANCE_PDF_BLOCK_REASON }}</p><div class="clearance-actions"><el-button v-for="label in ['提单 PDF', '分单 PDF', '舱单 PDF']" :key="label" :icon="Download" disabled>{{ label }}</el-button></div></section>
      </div>
      <template #footer><div class="clearance-actions dialog-footer"><el-button @click="materialsVisible = false">关闭</el-button><el-button type="primary" :icon="Download" :disabled="!selectedTargets.length || selectedTargets.some(row => !fileAvailable(row.material)) || !allowed" :loading="downloadBusy" @click="download()">下载所选材料</el-button></div></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.clearance-view { min-width: 0; }
.clearance-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 14px 16px; align-items: end; margin: 16px 0 20px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
.clearance-filters label { display: grid; gap: 6px; min-width: 0; color: var(--muted); font-size: 12px; }
.clearance-filters :deep(.el-select), .clearance-filters :deep(.el-date-editor) { width: 100%; min-width: 0; }
.clearance-actions { display: flex; gap: 8px 12px; align-items: center; flex-wrap: wrap; }
.clearance-actions :deep(.el-button + .el-button) { margin-left: 0; }
.clearance-view small { display: block; color: var(--muted); font-size: 12px; }
.clearance-dialog-body { max-height: min(68dvh, calc(100dvh - 200px)); overflow-y: auto; min-width: 0; display: grid; gap: 18px; }
.clearance-dialog-body section { min-width: 0; border-bottom: 1px solid var(--border); padding-bottom: 18px; }
.clearance-dialog-body h3 { margin: 0 0 14px; font-size: 15px; }
.clearance-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 16px 20px; margin: 0; }
.clearance-grid dt { color: var(--muted); font-size: 12px; margin-bottom: 5px; }
.clearance-grid dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.muted { color: var(--muted); font-size: 13px; line-height: 1.7; }
.file-error { color: var(--danger); }
.result-choice { margin: 12px 0; }.dialog-footer { justify-content: flex-end; }
.download-files { margin: 0; padding-left: 20px; }.download-files li { margin: 8px 0; overflow-wrap: anywhere; }.download-files a { color: var(--primary); }.download-files span { margin-left: 12px; color: var(--muted); font-size: 12px; }
</style>
