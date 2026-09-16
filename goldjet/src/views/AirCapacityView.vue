<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, Delete } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import CapacityDetailsTable from '../components/CapacityDetailsTable.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { CAPACITY_OPERATORS, CAPACITY_HANDLERS, createCapacityDraft, normalizeCapacityDraft, validateCapacityDraft, deriveCapacityRows, canEditCapacityNote, getCapacityEditRestriction, validCapacityDate, getCapacityQueryRestriction } from '../domain/airCapacity.js'

const { state, capacitySession, saveCapacityProduct, saveCapacityNote } = usePrototypeData()
const route = useRoute(), router = useRouter()
const activeTab = computed(() => route.query.view === 'live' ? 'live' : 'products')
const session = computed(() => capacitySession.value ?? capacitySession)
const canMaintain = computed(() => session.value.role === 'operator')
const canReadProducts = computed(() => ['operator', 'handler'].includes(session.value.role))
const canReadLive = computed(() => canReadProducts.value || session.value.role === 'business')
const clone = value => JSON.parse(JSON.stringify(value))
const productDefaults = () => ({ airline: 'bound', operator: '', flight: '', validDate: '', createDate: '' })
const filters = ref(productDefaults()), applied = ref(productDefaults())
const liveDefaults = () => ({ airline: '', flight: '', origin: '', destination: '', startDate: '2026-09-08', endDate: '2026-09-15' })
const liveFilters = ref(liveDefaults()), liveApplied = ref(liveDefaults()), queryError = ref('')
const mode = ref(''), selectedId = ref(''), draft = ref({}), initial = ref(''), busy = ref(false), failure = ref('')
const noteProduct = ref(null), noteText = ref(''), noteInitial = ref('')
const selected = computed(() => state.capacityProducts.find(row => row.id === selectedId.value))
const isEditing = computed(() => ['create', 'edit'].includes(mode.value))
const dirty = computed(() => (isEditing.value && JSON.stringify(draft.value) !== initial.value) || (noteProduct.value && noteText.value !== noteInitial.value))
const editRestriction = row => getCapacityEditRestriction(row, state, session.value)
const errors = computed(() => {
  if (!isEditing.value) return {}
  const result = validateCapacityDraft(normalizeCapacityDraft(draft.value), state, { existing: selected.value })
  if (mode.value === 'edit' && editRestriction(selected.value)) result.product = editRestriction(selected.value)
  return result
})
const flightOf = product => state.airMaster.flights.find(row => row.id === product?.flightId)
const airlineOf = product => state.airMaster.airlines.find(row => row.code === flightOf(product)?.airlineCode)
const pallets = computed(() => state.airMaster.pallets.filter(row => row.airlineCode === flightOf(draft.value)?.airlineCode))
const palletOf = id => state.airMaster.pallets.find(row => row.id === id)
const employeeName = person => typeof person === 'string' ? person : person.name
const bound = product => product.operator === session.value.name || product.handler === session.value.name
const rows = computed(() => !canReadProducts.value ? [] : state.capacityProducts.filter(row => {
  const f = applied.value, flight = flightOf(row)
  return (f.airline === 'bound' ? bound(row) : !f.airline || flight?.airlineCode === f.airline)
    && (!f.operator || row.operator === f.operator) && (!f.flight || flight?.code === f.flight.trim())
    && (!f.validDate || (row.startDate <= f.validDate && row.endDate >= f.validDate))
    && (!f.createDate || row.createdAt?.slice(0, 10) === f.createDate)
}).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)))
const liveRestriction = computed(() => getCapacityQueryRestriction(state, liveApplied.value))
const liveRows = computed(() => !canReadLive.value || liveRestriction.value ? [] : deriveCapacityRows(state, liveApplied.value).filter(row => {
  const f = liveApplied.value
  return (!f.airline || row.airlineCode === f.airline) && (!f.flight || row.flight === f.flight)
    && (!f.origin || row.origin === f.origin) && (!f.destination || row.destination === f.destination)
}))
const liveFlights = computed(() => state.airMaster.flights.filter(row => !liveFilters.value.airline || row.airlineCode === liveFilters.value.airline))
const liveOrigins = computed(() => [...new Set(liveFlights.value.filter(row => !liveFilters.value.flight || row.code === liveFilters.value.flight).map(row => row.origin))])
const numberText = value => value == null ? '待确认' : String(value)
const detailCellClass = ({ rowIndex, column }) => errors.value[`details.${rowIndex}.${column.property}`] ? 'capacity-cell-error' : ''
function queryProducts() { applied.value = clone(filters.value) }
function resetProducts() { filters.value = productDefaults(); queryProducts() }
function queryLive() {
  const { startDate, endDate } = liveFilters.value
  if (!validCapacityDate(startDate) || !validCapacityDate(endDate) || startDate > endDate) { queryError.value = '请选择完整且顺序正确的出港日期范围'; return }
  const reason = getCapacityQueryRestriction(state, liveFilters.value)
  if (reason) { queryError.value = reason; return }
  queryError.value = ''; liveApplied.value = clone(liveFilters.value)
}
function resetLive() { liveFilters.value = liveDefaults(); queryLive() }
function resetEditor() { mode.value = ''; selectedId.value = ''; failure.value = ''; noteProduct.value = null }
async function allowDiscard() {
  if (busy.value) return false
  if (!dirty.value) return true
  const actor = session.value.name, role = session.value.role, source = state.capacityProducts
  busy.value = true
  try {
    await ElMessageBox.confirm('尚未保存的舱位修改将丢弃。', '放弃修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' })
    return actor === session.value.name && role === session.value.role && source === state.capacityProducts
  } catch { return false } finally { busy.value = false }
}
async function close(done) { if (!await allowDiscard()) return; resetEditor(); if (typeof done === 'function') done() }
async function open(nextMode, row) {
  if (busy.value || !['create','edit','detail'].includes(nextMode) || (nextMode !== 'detail' && !canMaintain.value) || !canReadProducts.value) return
  const id = row?.id, source = state.capacityProducts, actor = session.value.name, role = session.value.role
  if (nextMode !== 'create' && !id) return
  if (!await allowDiscard()) return
  if (source !== state.capacityProducts || actor !== session.value.name || role !== session.value.role) return
  const record = id ? state.capacityProducts.find(item => item.id === id) : null
  if (id && !record) { ElMessage.warning('该舱位产品已不存在'); return }
  if (nextMode === 'edit' && editRestriction(record)) { ElMessage.warning(editRestriction(record)); return }
  resetEditor(); selectedId.value = id || ''
  draft.value = record ? clone(record) : createCapacityDraft(session.value)
  initial.value = JSON.stringify(draft.value); mode.value = nextMode
}
function changeFlight() {
  draft.value.details = draft.value.details.map(row => ({ ...row, palletId: '' }))
}
function addDetail() {
  if (!isEditing.value || busy.value) return
  draft.value.details.push(clone(draft.value.details.at(-1) || { weekday: '', palletId: '', baseline: '', quantity: '' }))
}
function removeDetail(index) {
  if (busy.value || !isEditing.value || draft.value.details.length <= 1) return
  draft.value.details.splice(index, 1)
}
function save() {
  if (busy.value || !isEditing.value || !canMaintain.value || Object.keys(errors.value).length) return false
  busy.value = true; failure.value = ''
  try { saveCapacityProduct(clone(draft.value)); resetEditor(); ElMessage.success('已提交成功！'); return true }
  catch (error) { failure.value = error.message; return false } finally { busy.value = false }
}
async function openNote(product) {
  if (busy.value || !canReadLive.value || !product?.id) return
  const source = state.capacityProducts, actor = session.value.name, role = session.value.role
  if (!await allowDiscard()) return
  if (source !== state.capacityProducts || actor !== session.value.name || role !== session.value.role) return
  const record = state.capacityProducts.find(row => row.id === product.id)
  if (!record) { ElMessage.warning('该舱位产品已不存在'); return }
  resetEditor(); noteProduct.value = record; noteText.value = record.remark || ''; noteInitial.value = noteText.value
}
function saveNote() {
  if (busy.value || !noteProduct.value || !canEditCapacityNote(noteProduct.value, session.value)) return
  busy.value = true
  try { saveCapacityNote(noteProduct.value.id, noteText.value); resetEditor(); ElMessage.success('备注已保存') }
  catch (error) { failure.value = error.message } finally { busy.value = false }
}
async function switchTab(name) { if (name === activeTab.value || !await allowDiscard()) return; resetEditor(); router.push({ query: name === 'live' ? {view:'live'} : {} }) }
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(allowDiscard)
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
watch(() => [session.value.name, session.value.role, state.capacityProducts], () => resetEditor())
watch(() => state.capacityProducts.map(row => row.id), () => {
  if ((selectedId.value && !selected.value) || (noteProduct.value && !state.capacityProducts.includes(noteProduct.value))) resetEditor()
})
</script>

<template>
  <div class="module-view capacity-view">
    <PageHeader title="舱位管理" :description="'当前角色：' + session.label + ' · ' + session.name"><template #actions><el-button v-if="activeTab === 'products' && canMaintain" type="primary" :icon="Plus" @click="open('create')">新增</el-button></template></PageHeader>
    <el-tabs :model-value="activeTab" @tab-change="switchTab"><el-tab-pane label="舱位产品" name="products" /><el-tab-pane label="舱位实时查询" name="live" /></el-tabs>
    <template v-if="activeTab === 'products'">
      <el-alert v-if="!canReadProducts" title="舱位产品由航线运营维护，航线操作可查看" type="info" :closable="false" />
      <template v-else>
        <form class="capacity-filters" @submit.prevent="queryProducts">
          <label>板类型<el-tooltip content="板类型与板型筛选来源不一致，口径待确认"><el-select disabled placeholder="筛选口径待确认" aria-label="查询板类型" /></el-tooltip></label>
          <label>航司代码<el-select v-model="filters.airline" aria-label="查询航司代码"><el-option value="bound" label="本人绑定" /><el-option value="" label="全部" /><el-option v-for="row in state.airMaster.airlines" :key="row.id" :value="row.code" :label="row.code" /></el-select></label>
          <label>航线运营<el-select v-model="filters.operator" clearable aria-label="查询航线运营" placeholder="全部"><el-option v-for="person in CAPACITY_OPERATORS" :key="employeeName(person)" :value="employeeName(person)" :label="employeeName(person)" /></el-select></label>
          <label>有效期限<el-date-picker v-model="filters.validDate" type="date" value-format="YYYY-MM-DD" aria-label="查询有效期限" placeholder="全部日期" /></label>
          <label>航班号<el-input v-model="filters.flight" clearable aria-label="查询航班号" placeholder="精确查询" /></label>
          <label>创建时间<el-date-picker v-model="filters.createDate" type="date" value-format="YYYY-MM-DD" aria-label="查询创建时间" placeholder="全部日期" /></label>
          <div class="capacity-query"><el-button native-type="submit" type="primary" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="resetProducts">重置</el-button></div>
        </form>
        <DataTableFrame :key="JSON.stringify(applied)" :rows="rows" :page-sizes="[10]">
          <template #default="{rows:pageRows}"><el-table :data="pageRows" row-key="id" aria-label="舱位产品列表">
            <el-table-column type="expand"><template #default="{row}"><CapacityDetailsTable :rows="row.details" :master="state.airMaster" /></template></el-table-column>
            <el-table-column label="航班号" min-width="145"><template #default="{row}"><el-button link type="primary" :aria-label="'查看舱位' + row.id" @click="open('detail',row)">{{ flightOf(row)?.code || '航班不可用' }}</el-button></template></el-table-column>
            <el-table-column label="航司" min-width="135"><template #default="{row}">{{ airlineOf(row)?.name || '来源不可用' }}</template></el-table-column>
            <el-table-column label="目的港" min-width="95"><template #default="{row}">{{ flightOf(row)?.destination || '未返回' }}</template></el-table-column>
            <el-table-column prop="boardType" label="板类型" min-width="110" />
            <el-table-column label="有效期限" min-width="220"><template #default="{row}">{{ row.startDate }} 至 {{ row.endDate }}</template></el-table-column>
            <el-table-column prop="operator" label="航线运营" min-width="110" /><el-table-column prop="handler" label="航线操作" min-width="110" /><el-table-column prop="createdAt" label="创建时间" min-width="170" />
            <el-table-column v-if="canMaintain" label="操作" width="124" fixed="right"><template #default="{row}"><el-button link type="primary" :aria-label="'编辑舱位' + row.id" @click="open('edit',row)">编辑</el-button><el-tooltip content="删除权限及已使用舱位的处理规则待确认"><span><el-button link disabled>删除</el-button></span></el-tooltip></template></el-table-column>
            <template #empty><el-empty description="没有匹配的舱位产品" /></template>
          </el-table></template>
        </DataTableFrame>
      </template>
    </template>
    <template v-else>
      <el-alert v-if="!canReadLive" title="舱位实时查询向业务人员、航线运营和航线操作开放" type="info" :closable="false" />
      <template v-else>
        <form class="capacity-filters" @submit.prevent="queryLive">
          <label>航司<el-select v-model="liveFilters.airline" clearable aria-label="实时查询航司" placeholder="全部" @change="liveFilters.flight = ''; liveFilters.origin = ''"><el-option v-for="row in state.airMaster.airlines" :key="row.id" :value="row.code" :label="row.name" /></el-select></label>
          <label>航班号<el-select v-model="liveFilters.flight" clearable aria-label="实时查询航班号" placeholder="全部" @change="liveFilters.origin = ''"><el-option v-for="row in liveFlights" :key="row.id" :value="row.code" :label="row.code" /></el-select></label>
          <label>始发港<el-select v-model="liveFilters.origin" clearable aria-label="实时查询始发港" placeholder="全部"><el-option v-for="code in liveOrigins" :key="code" :value="code" /></el-select></label>
          <label>目的港<el-select v-model="liveFilters.destination" clearable aria-label="实时查询目的港" placeholder="全部"><el-option v-for="port in state.airMaster.ports" :key="port.id" :value="port.code" /></el-select></label>
          <label>出港开始日期<el-date-picker v-model="liveFilters.startDate" type="date" value-format="YYYY-MM-DD" aria-label="出港开始日期" /></label>
          <label>出港结束日期<el-date-picker v-model="liveFilters.endDate" type="date" value-format="YYYY-MM-DD" aria-label="出港结束日期" /></label>
          <div class="capacity-query"><el-button native-type="submit" type="primary" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="resetLive">重置</el-button></div>
        </form>
        <el-alert v-if="queryError || liveRestriction" :title="queryError || liveRestriction" type="error" :closable="false" />
        <DataTableFrame :key="JSON.stringify(liveApplied)" :rows="liveRows" :page-sizes="[10]"><template #default="{rows:pageRows}"><el-table :data="pageRows" row-key="key" aria-label="实时舱位列表">
          <el-table-column prop="flight" label="航班号" min-width="125" /><el-table-column prop="airline" label="航司" min-width="130" /><el-table-column prop="origin" label="始发港" min-width="90" /><el-table-column prop="destination" label="目的港" min-width="90" /><el-table-column prop="date" label="出港日期" min-width="125" />
          <el-table-column v-for="field in [{key:'takeoffTime',label:'起飞时刻'},{key:'arrivalTime',label:'到港时刻'},{key:'cutoffTime',label:'截单时刻'}]" :key="field.key" :label="field.label" min-width="105"><template #default="{row}">{{ row[field.key] || '来源未返回' }}</template></el-table-column>
          <el-table-column v-for="field in [{key:'boardCount',label:'板数'},{key:'totalVolume',label:'舱位总体积 (m³)'},{key:'bookedVolume',label:'已订体积 (m³)'},{key:'remainingVolume',label:'剩余体积 (m³)'}]" :key="field.key" :label="field.label" min-width="160" align="right"><template #default="{row}"><span :class="{'capacity-shortage':row[field.key] < 0}">{{ numberText(row[field.key]) }}</span></template></el-table-column>
          <el-table-column label="备注与数据说明" min-width="280"><template #default="{row}"><p v-if="row.capacityReason || row.volumeReason">{{ row.capacityReason || row.volumeReason }}</p><div v-for="product in row.products" :key="product.id" class="capacity-note"><span>{{ product.boardType }} · {{ product.operator }}</span><el-button link type="primary" :aria-label="'舱位备注' + product.id + row.date" @click="openNote(product)">{{ product.remark || '未填写备注' }}</el-button></div></template></el-table-column>
          <template #empty><el-empty description="查询期间没有舱位产品" /></template>
        </el-table></template></DataTableFrame>
      </template>
    </template>
    <el-dialog :model-value="!!mode" :title="mode === 'create' ? '新增舱位产品' : mode === 'edit' ? '编辑舱位产品' : '舱位产品详情'" width="min(1100px, 96vw)" align-center destroy-on-close :close-on-click-modal="false" :before-close="close">
      <el-alert v-if="failure" :title="failure" type="error" :closable="false" />
      <template v-if="mode === 'detail'"><el-descriptions :column="1" border><el-descriptions-item label="航司">{{ airlineOf(draft)?.name }}</el-descriptions-item><el-descriptions-item label="航班号">{{ flightOf(draft)?.code }}</el-descriptions-item><el-descriptions-item label="目的港">{{ flightOf(draft)?.destination }}</el-descriptions-item><el-descriptions-item label="板类型">{{ draft.boardType }}</el-descriptions-item><el-descriptions-item label="有效期限">{{ draft.startDate }} 至 {{ draft.endDate }}</el-descriptions-item><el-descriptions-item label="航线运营">{{ draft.operator }}</el-descriptions-item><el-descriptions-item label="航线操作">{{ draft.handler }}</el-descriptions-item><el-descriptions-item label="创建时间">{{ draft.createdAt }}</el-descriptions-item></el-descriptions><CapacityDetailsTable :rows="draft.details" :master="state.airMaster" /></template>
      <el-form v-else-if="isEditing" label-position="top" @submit.prevent="save">
        <div class="capacity-form-grid">
          <el-form-item label="航班号" required :error="errors.flightId"><el-select v-model="draft.flightId" filterable aria-label="航班号" :disabled="busy || mode === 'edit'" @change="changeFlight"><el-option v-for="flight in state.airMaster.flights" :key="flight.id" :value="flight.id" :label="flight.code + ' · ' + flight.airlineCode" /></el-select></el-form-item>
          <el-form-item label="航司"><el-input :model-value="airlineOf(draft)?.name || ''" readonly aria-label="航司" placeholder="选择航班后带出" /></el-form-item>
          <el-form-item label="目的港"><el-input :model-value="flightOf(draft)?.destination || ''" readonly aria-label="目的港" /></el-form-item>
          <el-form-item label="板类型" required :error="errors.boardType"><el-radio-group v-model="draft.boardType" :disabled="busy || mode === 'edit'" aria-label="板类型"><el-radio-button value="临时板">临时板</el-radio-button><el-radio-button value="合同板">合同板</el-radio-button></el-radio-group></el-form-item>
          <el-form-item label="有效开始日期" required :error="errors.startDate"><el-date-picker v-model="draft.startDate" type="date" value-format="YYYY-MM-DD" aria-label="有效开始日期" :disabled="busy" /></el-form-item>
          <el-form-item label="有效结束日期" required :error="errors.endDate"><el-date-picker v-model="draft.endDate" type="date" value-format="YYYY-MM-DD" aria-label="有效结束日期" :disabled="busy" /></el-form-item>
          <el-form-item label="航线运营" required :error="errors.operator"><el-select v-model="draft.operator" aria-label="航线运营" :disabled="busy"><el-option v-for="person in CAPACITY_OPERATORS" :key="employeeName(person)" :value="employeeName(person)" :label="employeeName(person)" /></el-select></el-form-item>
          <el-form-item label="航线操作" required :error="errors.handler"><el-select v-model="draft.handler" aria-label="航线操作" :disabled="busy"><el-option v-for="person in CAPACITY_HANDLERS" :key="employeeName(person)" :value="employeeName(person)" :label="employeeName(person)" /></el-select></el-form-item>
          <el-form-item label="创建时间"><el-input :model-value="draft.createdAt || '提交时记录'" readonly aria-label="创建时间" /></el-form-item>
        </div>
        <div class="capacity-detail-heading"><h3>周期日与板型明细</h3><el-button :icon="Plus" :disabled="busy" @click="addDetail">添加</el-button></div>
        <el-table :data="draft.details" :cell-class-name="detailCellClass" aria-label="编辑周期日板型明细">
          <el-table-column prop="weekday" label="周期日" min-width="145"><template #default="{row,$index}"><el-select v-model="row.weekday" :aria-label="'明细' + ($index+1) + '周期日'" :disabled="busy"><el-option v-for="(label,index) in ['周一','周二','周三','周四','周五','周六','周日']" :key="label" :label="label" :value="index+1" /></el-select></template></el-table-column>
          <el-table-column prop="palletId" label="板型" min-width="175"><template #default="{row,$index}"><el-select v-model="row.palletId" :aria-label="'明细' + ($index+1) + '板型'" :disabled="busy || !draft.flightId"><el-option v-for="pallet in pallets" :key="pallet.id" :value="pallet.id" :label="pallet.code" /></el-select></template></el-table-column>
          <el-table-column label="板体积 (m³)" min-width="130" align="right"><template #default="{row}">{{ palletOf(row.palletId)?.volume ?? '未带出' }}</template></el-table-column>
          <el-table-column prop="baseline" label="基准载重 (kg)" min-width="165"><template #default="{row,$index}"><el-input v-model="row.baseline" inputmode="numeric" :aria-label="'明细' + ($index+1) + '基准载重'" :disabled="busy" /></template></el-table-column>
          <el-table-column prop="quantity" label="数量" min-width="125"><template #default="{row,$index}"><el-input v-model="row.quantity" inputmode="numeric" :aria-label="'明细' + ($index+1) + '数量'" :disabled="busy" /></template></el-table-column>
          <el-table-column label="操作" width="80" fixed="right"><template #default="{$index}"><el-tooltip content="移除本条未提交明细"><el-button :icon="Delete" :aria-label="'移除明细' + ($index+1)" :disabled="busy || draft.details.length <= 1" @click="removeDetail($index)" /></el-tooltip></template></el-table-column>
        </el-table>
        <div v-if="Object.keys(errors).length" class="capacity-errors" role="alert"><p v-for="(error,key) in errors" :key="key">{{ key.startsWith('details.') ? '明细' + (Number(key.split('.')[1])+1) + '：' : '' }}{{ error }}</p></div>
      </el-form>
      <template #footer><el-button :disabled="busy" @click="close">{{ mode === 'detail' ? '关闭' : '取消' }}</el-button><el-button v-if="isEditing" type="primary" :disabled="Object.keys(errors).length > 0" :loading="busy" @click="save">{{ mode === 'create' ? '提交' : '保存' }}</el-button></template>
    </el-dialog>
    <el-dialog :model-value="!!noteProduct" title="舱位备注" width="min(600px, 96vw)" align-center :before-close="close" :close-on-click-modal="false"><template v-if="noteProduct"><p>{{ flightOf(noteProduct)?.code }} · {{ noteProduct.boardType }} · {{ noteProduct.operator }}</p><el-alert v-if="failure" :title="failure" type="error" :closable="false" /><el-input v-model="noteText" type="textarea" :rows="5" aria-label="舱位备注" :readonly="!canEditCapacityNote(noteProduct,session)" :disabled="busy" /></template><template #footer><el-button :disabled="busy" @click="close">关闭</el-button><el-button v-if="noteProduct && canEditCapacityNote(noteProduct,session)" type="primary" :loading="busy" @click="saveNote">保存</el-button></template></el-dialog>
  </div>
</template>
<style scoped>
.capacity-filters, .capacity-form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px; }
.capacity-filters label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; min-width: 0; }
.capacity-filters :deep(.el-date-editor), .capacity-form-grid :deep(.el-date-editor) { width: 100%; }
.capacity-query, .capacity-detail-heading { display: flex; align-items: center; gap: 8px; }
.capacity-detail-heading { justify-content: space-between; margin-block: 10px; }
.capacity-detail-heading h3 { font-size: 15px; }
.capacity-errors, .capacity-shortage { color: var(--el-color-danger); }
.capacity-errors { font-size: 13px; margin-top: 12px; }
.capacity-errors p { margin: 4px 0; }
.capacity-view :deep(.capacity-cell-error .el-select__wrapper), .capacity-view :deep(.capacity-cell-error .el-input__wrapper) { box-shadow: 0 0 0 1px var(--el-color-danger) inset; }
.capacity-note { display: flex; flex-direction: column; align-items: flex-start; }
.capacity-note .el-button { white-space: normal; height: auto; overflow-wrap: anywhere; }
@media (max-width: 760px) { .capacity-filters, .capacity-form-grid { grid-template-columns: minmax(0,1fr); } }
</style>
