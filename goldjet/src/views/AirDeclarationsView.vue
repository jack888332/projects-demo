<script setup>
import { computed, reactive, ref, unref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import AirDeclarationMaterialsDialog from '../components/AirDeclarationMaterialsDialog.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { AIR_DECLARATION_STATUS_BLOCK_REASON, DECLARATION_STATUSES, canManageAirDeclarations, deriveAirDeclarations, filterAirDeclarations } from '../domain/airDeclarations.js'

const route = useRoute(), router = useRouter()
const { state, declarationSession, loadAirDeclarationExamples } = usePrototypeData()
const allowed = computed(() => canManageAirDeclarations(unref(declarationSession)))
const allRows = computed(() => deriveAirDeclarations(state))
const emptyFilters = () => ({ serviceNo: '', waybillNo: '', customer: '', origin: '', destination: '', departure: [], created: [], status: '' })
const filters = reactive(emptyFilters()), applied = ref(emptyFilters()), queryVersion = ref(0)
const rows = computed(() => filterAirDeclarations(allRows.value, applied.value))
const ports = key => [...new Set(allRows.value.map(row => row[key]).filter(Boolean))].sort()
const origins = computed(() => ports('origin')), destinations = computed(() => ports('destination'))
const selected = ref([]), dialogIds = ref([]), materialsVisible = ref(false), mode = ref('materials')
const detailId = ref(''), detailVisible = ref(false), failure = ref('')
const detail = computed(() => allRows.value.find(row => row.id === detailId.value))
const selectedRows = computed(() => allRows.value.filter(row => selected.value.includes(row.id)))
const hasSelectedMaterials = computed(() => selectedRows.value.some(row => row.materials.length))
const display = value => value === undefined || value === null || value === '' ? '未提供' : value
const statusLimit = AIR_DECLARATION_STATUS_BLOCK_REASON

function query() {
  applied.value = { ...filters, departure: [...(filters.departure || [])], created: [...(filters.created || [])] }
  selected.value = []; queryVersion.value += 1
}
function resetQuery() { Object.assign(filters, emptyFilters()); query(); failure.value = '' }
function toggle(id, checked) {
  selected.value = selected.value.filter(value => value !== id)
  if (checked && allowed.value && allRows.value.some(row => row.id === id)) selected.value.push(id)
}
function togglePage(pageRows, checked) { pageRows.forEach(row => toggle(row.id, checked)) }
const pageSelected = pageRows => pageRows.length > 0 && pageRows.every(row => selected.value.includes(row.id))
const pagePartSelected = pageRows => !pageSelected(pageRows) && pageRows.some(row => selected.value.includes(row.id))
function openDetail(row) { detailId.value = row.id; detailVisible.value = true }
function openMaterials(ids, purpose = 'materials') {
  dialogIds.value = ids.filter(id => allRows.value.some(row => row.id === id))
  if (!dialogIds.value.length) return
  mode.value = purpose; materialsVisible.value = true
}
function loadExamples() {
  failure.value = ''
  try { loadAirDeclarationExamples(); resetQuery(); ElMessage.success('已载入报关指令示例，可查询材料并演示补齐通知') }
  catch (error) { failure.value = error.message }
}
function source(row) { router.push({ ...row.target, query: { ...row.target.query, inspect: 'service' } }) }
function waybill(row) { router.push({ path: `/fulfillment/airway-bills/${row.orderId}`, query: row.childId ? { child: row.childId } : {} }) }
function followServiceLink() {
  if (!route.query.service) return
  const row = allRows.value.find(item => item.id === route.query.service)
  if (row) { resetQuery(); filters.serviceNo = row.id; query(); openDetail(row) }
  else failure.value = '该报关服务当前不存在；刷新或恢复数据后，演示期间新增的记录会清空。'
}
watch(() => route.query.service, followServiceLink, { immediate: true })
watch(() => [state.airOrders, state.airChildren, unref(declarationSession).role, unref(declarationSession).name], () => {
  selected.value = []; dialogIds.value = []; materialsVisible.value = false; detailVisible.value = false; failure.value = ''
}, { flush: 'sync' })
</script>

<template>
  <div class="module-view air-declarations-view">
    <PageHeader title="报关单管理" description="查询已收到的报关服务，下载材料并通知建单客服补齐。">
      <template #actions><el-button :disabled="!allowed" @click="loadExamples">载入已收指令示例</el-button></template>
    </PageHeader>
    <el-alert v-if="!allowed" title="当前角色只读。切换为“报关行客服”可下载材料、发起补齐通知。" type="info" :closable="false" />
    <p class="declaration-hint">示例为已收到的合成报关指令，材料名称仅供演示；新指令发送及材料上传条件仍待确认。</p>
    <el-alert v-if="failure" :title="failure" type="error" :closable="false" />
    <form class="declaration-filters" aria-label="报关单查询" @submit.prevent="query">
      <label>报关服务号<el-input v-model="filters.serviceNo" clearable aria-label="报关服务号查询" placeholder="模糊查询" /></label>
      <label>提单号<el-input v-model="filters.waybillNo" clearable aria-label="报关提单号查询" placeholder="模糊查询" /></label>
      <label>客户<el-input v-model="filters.customer" clearable aria-label="报关客户查询" placeholder="模糊查询" /></label>
      <label>始发港<el-select v-model="filters.origin" clearable filterable aria-label="报关始发港查询" placeholder="全部"><el-option v-for="value in origins" :key="value" :value="value" /></el-select></label>
      <label>目的港<el-select v-model="filters.destination" clearable filterable aria-label="报关目的港查询" placeholder="全部"><el-option v-for="value in destinations" :key="value" :value="value" /></el-select></label>
      <label>出港日期<el-date-picker v-model="filters.departure" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" aria-label="报关出港日期查询" /></label>
      <label>创建日期<el-date-picker v-model="filters.created" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" aria-label="报关创建日期查询" /></label>
      <label>报关状态<el-select v-model="filters.status" clearable aria-label="报关状态查询" placeholder="全部"><el-option v-for="value in DECLARATION_STATUSES" :key="value" :value="value" /></el-select></label>
      <div class="declaration-actions"><el-button type="primary" native-type="submit" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="resetQuery">重置</el-button></div>
    </form>
    <DataTableFrame :key="queryVersion" :rows="rows" :page-size="10" :page-sizes="[10, 20, 50]" selectable :selected-count="selected.length">
      <template #actions><div class="declaration-actions"><el-button v-if="selected.length" link @click="selected = []">清除选择</el-button><el-button :disabled="!allowed || !hasSelectedMaterials" @click="openMaterials(selected)">批量下载材料</el-button><el-button type="primary" :disabled="!allowed || !hasSelectedMaterials" @click="openMaterials(selected, 'notify')">批量补齐通知</el-button></div></template>
      <template #default="{ rows: pageRows }">
        <el-table :data="pageRows" row-key="id" aria-label="报关单列表" empty-text="暂无符合条件的报关服务；可载入已收指令示例演示。">
          <el-table-column width="48"><template #header><el-checkbox :disabled="!allowed || !pageRows.length" :model-value="pageSelected(pageRows)" :indeterminate="pagePartSelected(pageRows)" aria-label="选择本页报关服务" @change="value => togglePage(pageRows, value)" /></template><template #default="{ row }"><el-checkbox :disabled="!allowed" :model-value="selected.includes(row.id)" :aria-label="`选择报关服务${row.id}`" @change="value => toggle(row.id, value)" /></template></el-table-column>
          <el-table-column label="报关服务号" min-width="235"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">{{ row.id }}</el-button></template></el-table-column>
          <el-table-column label="提单号 / 分单号" min-width="180"><template #default="{ row }"><el-button v-if="row.waybillNo" link type="primary" @click="waybill(row)">{{ row.waybillNo }}</el-button><span v-else>未提供</span><small class="declaration-secondary">{{ row.housebillNo || '直单' }}</small></template></el-table-column>
          <el-table-column prop="customer" label="客户" min-width="150" />
          <el-table-column prop="origin" label="始发港" width="85" /><el-table-column prop="destination" label="目的港" width="85" />
          <el-table-column prop="departureDate" label="出港日期" width="115" />
          <el-table-column prop="documentType" label="单证类型" min-width="135" />
          <el-table-column label="报关状态" width="115"><template #default="{ row }"><StatusTag :label="row.customsStatus" /></template></el-table-column>
          <el-table-column label="已上传材料" width="110"><template #default="{ row }">{{ row.materials.length }} 份</template></el-table-column>
          <el-table-column prop="creator" label="建单客服" width="100" /><el-table-column prop="createdAt" label="创建时间" min-width="175" />
          <el-table-column label="操作" fixed="right" width="180"><template #default="{ row }"><el-button link type="primary" @click="openMaterials([row.id])">查看材料</el-button><el-button link type="primary" :disabled="!allowed || !row.materials.length" @click="openMaterials([row.id], 'notify')">补齐通知</el-button></template></el-table-column>
        </el-table>
      </template>
    </DataTableFrame>
    <p class="declaration-hint">{{ statusLimit }} 材料清单与上传规则明确前，不推定未上传材料的名称。</p>
    <el-dialog v-model="detailVisible" title="报关服务详情" width="min(850px, 96vw)" :close-on-click-modal="false">
      <div v-if="detail" class="declaration-detail">
        <dl class="declaration-grid">
          <div v-for="field in [{key:'id',label:'报关服务号'}, {key:'orderNo',label:'订单号'}, {key:'housebillNo',label:'分单号'}, {key:'waybillNo',label:'提单号'}, {key:'customer',label:'客户'}, {key:'creator',label:'建单客服'}, {key:'origin',label:'始发港'}, {key:'destination',label:'目的港'}, {key:'departureDate',label:'出港日期'}, {key:'createdAt',label:'创建时间'}, {key:'choice',label:'报关选择'}, {key:'documentType',label:'单证类型'}]" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ field.key === 'housebillNo' && !detail.childId ? '不适用（直单）' : display(detail[field.key]) }}</dd></div>
          <div><dt>报关类型</dt><dd>{{ display(detail.details?.customsType) }}<small class="declaration-secondary">与“报关选择”的对应关系待确认</small></dd></div>
          <div v-for="field in [{key:'phone',label:'报关员电话'}, {key:'pieces',label:'中转件数'}, {key:'grossWeight',label:'中转重量 kg'}, {key:'volume',label:'中转体积 m³'}, {key:'goodsName',label:'品名'}, {key:'remark',label:'报关备注'}]" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ display(detail.details?.[field.key]) }}</dd></div>
          <div><dt>报关状态</dt><dd><StatusTag :label="detail.customsStatus" /></dd></div><div><dt>服务状态</dt><dd><StatusTag :label="detail.serviceStatus" /></dd></div>
        </dl>
        <el-alert :title="statusLimit" type="info" :closable="false" />
        <div class="declaration-actions"><el-button disabled>接单</el-button><el-button disabled>修改报关状态</el-button><el-button @click="source(detail)">查看来源{{ detail.childId ? '分单' : '直单' }}</el-button><el-button :disabled="!detail.waybillNo" @click="waybill(detail)">查看提单</el-button></div>
      </div>
      <el-empty v-else description="该报关服务已不存在" />
      <template #footer><el-button @click="detailVisible = false">关闭</el-button><el-button v-if="detail" type="primary" @click="detailVisible = false; openMaterials([detail.id])">查看报关材料</el-button></template>
    </el-dialog>
    <AirDeclarationMaterialsDialog v-model="materialsVisible" :declarations="allRows" :selected-ids="dialogIds" :mode="mode" />
  </div>
</template>

<style scoped>
.air-declarations-view { min-width: 0; }
.declaration-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr)); gap: 12px 16px; align-items: end; padding: 16px; margin: 16px 0; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
.declaration-filters label { display: grid; gap: 6px; min-width: 0; font-size: 12px; color: var(--muted); }.declaration-filters :deep(.el-select), .declaration-filters :deep(.el-date-editor) { width: 100%; min-width: 0; }
.declaration-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }.declaration-actions :deep(.el-button) { margin-left: 0; }
.declaration-hint, .declaration-secondary { color: var(--muted); font-size: 12px; line-height: 1.7; }.declaration-secondary { display: block; }
.declaration-detail { max-height: 65dvh; overflow-y: auto; display: grid; gap: 16px; }
.declaration-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr)); gap: 18px 20px; margin: 0; }
.declaration-grid dt { font-size: 12px; color: var(--muted); margin-bottom: 5px; }.declaration-grid dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 600px) { .declaration-detail { max-height: 63dvh; }.declaration-grid { grid-template-columns: 1fr; } }
</style>
