<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { AIR_MASTER_FIELDS, createAirMasterDraft, getAirMasterPermission } from '../domain/airMasterData.js'
import { validateAirMasterSave } from '../data/airMasterActions.js'

const route = useRoute(), router = useRouter()
const { state, airMasterSession, saveAirMaster, deleteAirMaster } = usePrototypeData()
const tabs = [
  { key: 'airlines', label: '航司管理', object: '航司' },
  { key: 'ports', label: '空港管理', object: '空港' },
  { key: 'flights', label: '航班号管理', object: '航班' },
  { key: 'pallets', label: '板型管理', object: '板型' },
]
const kind = computed(() => tabs.some(tab => tab.key === route.query.tab) ? String(route.query.tab) : 'airlines')
const tab = computed(() => tabs.find(item => item.key === kind.value))
const fields = computed(() => AIR_MASTER_FIELDS[kind.value])
const permission = computed(() => getAirMasterPermission(kind.value, airMasterSession.value.role))
const inputKeyword = ref(''), keyword = ref(''), selectedIds = ref([])
const table = ref()
const mode = ref(''), selectedId = ref(''), draft = reactive({}), initial = ref(''), busy = ref(false), failure = ref('')
const selected = computed(() => state.airMaster[kind.value].find(row => row.id === selectedId.value))
const readonly = computed(() => mode.value === 'detail')
const errors = computed(() => mode.value && !readonly.value
  ? validateAirMasterSave(kind.value, draft, state, { existing: selected.value }) : {})
const rows = computed(() => state.airMaster[kind.value].filter(row => !keyword.value || fields.value.some(field => display(row, field).toLowerCase().includes(keyword.value.toLowerCase()))))
const suppliers = computed(() => state.partners.filter(row => row.type === '供应商' && row.status === '已生效'))
const batchAllowed = computed(() => ['airlines', 'pallets'].includes(kind.value))
const dirty = computed(() => mode.value && !readonly.value && JSON.stringify(draft) !== initial.value)
const clone = value => JSON.parse(JSON.stringify(value))

function clearSelection() { selectedIds.value = []; table.value?.clearSelection() }
function query() { keyword.value = inputKeyword.value.trim(); clearSelection() }
function resetQuery() { inputKeyword.value = ''; query() }
function options(field) {
  if (field.options) return field.options.map(value => ({ value, label: field.key === 'weekdays' ? '周' + '一二三四五六日'[value - 1] : value }))
  if (field.key === 'supplierIds') return suppliers.value.map(row => ({ value: row.id, label: row.name }))
  if (field.key === 'airlineCode') return state.airMaster.airlines.filter(row => row.code).map(row => ({ value: row.code, label: row.code + ' · ' + row.name }))
  if (['origin', 'destination'].includes(field.key)) return state.airMaster.ports.map(row => ({ value: row.code, label: row.code + ' · ' + row.name }))
  if (field.key === 'station') return state.airMaster.stations.map(row => ({ value: row.id, label: row.name }))
  if (field.key === 'country') return state.airMaster.countries.map(row => ({ value: row.name, label: row.name }))
  if (field.key === 'city') return state.airMaster.cities.filter(row => row.countryCode === draft.countryCode).map(row => ({ value: row.name, label: row.name }))
  return []
}
function change(field) {
  if (field.key === 'country') {
    const code = state.airMaster.countries.find(row => row.name === draft.country)?.code || ''
    if (code !== draft.countryCode) { draft.city = ''; draft.cityCode = '' }
    draft.countryCode = code
  }
  if (field.key === 'city') draft.cityCode = state.airMaster.cities.find(row => row.name === draft.city && row.countryCode === draft.countryCode)?.code || ''
}
function display(row, field) {
  const value = row[field.key]
  if (field.key === 'supplierIds') return (value || []).map(id => state.partners.find(p => p.id === id)?.name || '档案不可用').join('、') || '未填写'
  if (field.key === 'station') return state.airMaster.stations.find(station => station.id === value)?.name || '未填写'
  if (field.key === 'weekdays') return [...(value || [])].sort().join('+') || '未填写'
  return value === '' || value == null ? '未填写' : String(value)
}
function open(nextMode, row) {
  if (busy.value || mode.value || !['create', 'edit', 'detail'].includes(nextMode)) return
  if (nextMode === 'create' && !permission.value.create || nextMode === 'edit' && !permission.value.edit) return
  selectedId.value = row?.id || ''
  for (const key of Object.keys(draft)) delete draft[key]
  Object.assign(draft, row ? clone(row) : createAirMasterDraft(kind.value))
  initial.value = JSON.stringify(draft); failure.value = ''; mode.value = nextMode
}
async function allowDiscard() {
  if (busy.value) return false
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm('尚未保存的主数据修改将丢弃。', '放弃修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' })
    return true
  } catch { return false }
}
async function close(done) {
  if (busy.value || !await allowDiscard()) return
  mode.value = ''; if (typeof done === 'function') done()
}
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(allowDiscard)
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
watch(kind, () => { mode.value = ''; selectedId.value = ''; resetQuery() })
watch(keyword, clearSelection)
watch(() => state.airMaster[kind.value].map(row => row.id), ids => {
  if (selectedIds.value.some(id => !ids.includes(id))) clearSelection()
})
watch(() => airMasterSession.value.role, () => {
  if (dirty.value) ElMessage.warning('角色已切换，未保存的修改已取消')
  mode.value = ''; clearSelection()
})
watch(selected, row => {
  if (mode.value && selectedId.value && !row) {
    mode.value = ''; selectedId.value = ''; clearSelection(); ElMessage.warning('该主数据记录已不存在，请重新选择')
  }
})
async function save() {
  if (busy.value || !['create', 'edit'].includes(mode.value) || !permission.value[mode.value] || Object.keys(errors.value).length) return
  busy.value = true; failure.value = ''
  try {
    const editing = mode.value === 'edit'
    saveAirMaster(kind.value, clone(draft))
    mode.value = ''; ElMessage.success(editing ? '提交修改成功' : '提交成功')
  } catch (error) { failure.value = error.message }
  finally { busy.value = false }
}
async function remove(ids) {
  if (busy.value || !ids.length || !permission.value.delete) return
  const targetKind = kind.value, targetIds = [...ids], targetRole = airMasterSession.value.role
  const targets = state.airMaster[targetKind].filter(row => targetIds.includes(row.id))
  busy.value = true
  try {
    await ElMessageBox.confirm('确认删除' + targets.map(row => '「' + (row.code || row.name) + '」').join('、') + '？', '删除' + tab.value.object, { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' })
    if (targetKind !== kind.value || targetRole !== airMasterSession.value.role) return
    deleteAirMaster(targetKind, targetIds); clearSelection(); ElMessage.success('删除成功')
  } catch (error) { if (error instanceof Error) ElMessage.error(error.message) }
  finally { busy.value = false }
}
</script>

<template>
  <div class="module-view air-master-view">
    <PageHeader title="空运主数据" :description="'当前角色：' + airMasterSession.label + ' · ' + airMasterSession.name">
      <template #actions><el-button v-business-write="'airMasterData'" type="primary" :icon="Plus" :disabled="!permission.create || busy" @click="open('create')">新增{{ tab.object }}</el-button></template>
    </PageHeader>
    <el-tabs :model-value="kind" @tab-change="value => router.push({ path: route.path, query: { tab: value } })">
      <el-tab-pane v-for="item in tabs" :key="item.key" :name="item.key" :label="item.label + ' · ' + state.airMaster[item.key].length" />
    </el-tabs>
    <el-alert v-if="permission.reason" :title="permission.reason" type="info" :closable="false" show-icon class="master-notice" />
    <form class="filter-bar" @submit.prevent="query">
      <el-input v-model="inputKeyword" class="keyword-filter" clearable placeholder="查询代码、名称或其他字段" aria-label="空运主数据关键字" />
      <el-button native-type="submit" type="primary" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="resetQuery">重置</el-button>
    </form>
    <DataTableFrame :key="kind + keyword" :rows="rows" :selectable="batchAllowed" :selected-count="selectedIds.length">
      <template #actions><el-button v-business-write="'airMasterData'" v-if="batchAllowed" type="danger" plain :icon="Delete" :disabled="!permission.delete || !selectedIds.length || busy" @click="remove(selectedIds)">批量删除</el-button></template>
      <template #default="{ rows: pageRows }">
        <el-table ref="table" :key="kind" :data="pageRows" row-key="id" stripe :aria-label="tab.label" @selection-change="values => selectedIds = values.map(row => row.id)">
          <el-table-column v-if="batchAllowed" type="selection" width="46" :reserve-selection="true" />
          <el-table-column v-for="(field, index) in fields" :key="field.key" :label="field.label" :min-width="['supplierIds','name','englishName','printTitle','issuingCarrier','dimensions'].includes(field.key) ? 210 : 125" :fixed="index === 0 ? 'left' : false">
            <template #default="{ row }"><el-button v-if="index === 0" link type="primary" @click="open('detail', row)">{{ display(row, field) }}</el-button><span v-else>{{ display(row, field) }}</span></template>
          </el-table-column>
          <el-table-column label="操作" :width="kind === 'pallets' ? 125 : 175" fixed="right"><template #default="{ row }">
            <el-button link type="primary" :aria-label="'查看' + (row.code || row.name)" @click="open('detail', row)">查看</el-button>
            <el-button v-business-write="'airMasterData'" link type="primary" :aria-label="'编辑' + (row.code || row.name)" :disabled="!permission.edit || busy" @click="open('edit', row)">编辑</el-button>
            <el-button v-business-write="'airMasterData'" v-if="kind !== 'pallets'" link type="danger" :aria-label="'删除' + (row.code || row.name)" :disabled="!permission.delete || busy" @click="remove([row.id])">删除</el-button>
          </template></el-table-column>
          <template #empty><el-empty :description="keyword ? '没有匹配记录，请调整查询条件' : '暂无此类主数据'" /></template>
        </el-table>
      </template>
    </DataTableFrame>
    <el-dialog :model-value="!!mode" :title="(readonly ? '查看' : mode === 'create' ? '新增' : '编辑') + tab.object" width="min(860px, 96vw)" align-center :close-on-click-modal="false" :before-close="close" destroy-on-close>
      <div v-if="mode" class="master-dialog-body">
        <el-alert v-if="failure" :title="failure" type="error" :closable="false" show-icon class="master-notice" />
        <el-descriptions v-if="readonly" :column="1" border>
          <el-descriptions-item v-for="field in fields" :key="field.key" :label="field.label">{{ display(draft, field) }}</el-descriptions-item>
        </el-descriptions>
        <el-form v-else label-position="top" @submit.prevent="save">
          <div class="form-grid">
            <el-form-item v-for="field in fields" :key="field.key" :label="field.label" :required="field.required" :error="errors[field.key]" :class="{ 'span-2': ['supplierIds','printTitle','issuingCarrier'].includes(field.key) }">
              <el-select v-if="['select', 'multiselect'].includes(field.type)" v-model="draft[field.key]" :multiple="field.type === 'multiselect'" filterable clearable :aria-label="field.label" :placeholder="'请选择' + field.label" @change="change(field)">
                <el-option v-for="option in options(field)" :key="option.value" :value="option.value" :label="String(option.label)" />
              </el-select>
              <el-time-picker v-else-if="field.type === 'time'" v-model="draft[field.key]" format="HH:mm" value-format="HH:mm" :aria-label="field.label" placeholder="HH:mm" />
              <el-input v-else v-model="draft[field.key]" :maxlength="field.max" :readonly="['countryCode', 'cityCode'].includes(field.key)" :disabled="field.key === 'arrivalDay'" :inputmode="field.key === 'cutoffDays' ? 'numeric' : field.type === 'number' ? 'decimal' : 'text'" :aria-label="field.label" :placeholder="field.key === 'arrivalDay' ? '口径待确认' : ['countryCode', 'cityCode'].includes(field.key) ? '自动带出' : '请输入' + field.label" @change="change(field)" />
            </el-form-item>
          </div>
        </el-form>
        <section v-if="kind === 'ports'" class="master-rates">
          <h3>公布运价</h3><div><label v-for="rate in ['-45', '+45', '+100', '+300', '+500']" :key="rate">{{ rate }}<el-input model-value="待配置" disabled :aria-label="'公布运价 ' + rate" /></label></div>
          <p class="master-hint">维护与计费口径待确认</p>
        </section>
      </div>
      <template #footer><el-button @click="close">{{ readonly ? '关闭' : '取消' }}</el-button><el-button v-business-write="'airMasterData'" v-if="!readonly" type="primary" :loading="busy" :disabled="Object.keys(errors).length > 0 || (mode === 'create' ? !permission.create : !permission.edit)" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.master-dialog-body { max-height: 65vh; overflow: auto; padding: 0 10px 2px 2px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; }
.form-grid > * { min-width: 0; }
.master-notice { margin-bottom: 16px; }
.master-hint { color: var(--muted); display: block; font-size: 12px; line-height: 1.5; margin-top: 6px; }
.form-grid :deep(.el-date-editor) { width: 100%; }
.master-rates { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
.master-rates h3 { font-size: 15px; margin: 0 0 12px; }
.master-rates > div { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
.master-rates label { color: var(--muted); font-size: 13px; }
.master-rates .el-input { margin-top: 8px; }
@media (max-width: 700px) { .master-rates > div { grid-template-columns: repeat(2, 1fr); } .form-grid { grid-template-columns: minmax(0, 1fr); } .form-grid .span-2 { grid-column: auto; } }
</style>
