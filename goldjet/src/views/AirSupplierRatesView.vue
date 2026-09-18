<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import AirRateMethodDialog from '../components/AirRateMethodDialog.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  AIR_RATE_SERVICES, AIR_RATE_UNITS, AIR_RATE_METHODS, AIR_RATE_CURRENCIES, AIR_RATE_UNIT_CONFLICTS,
  createAirSupplierRateDraft, normalizeAirSupplierRateDraft, validateAirSupplierRateDraft,
  getAirSupplierRatePermissions, deriveAirSupplierRateStatus, getAirSupplierRateAction,
  filterAirSupplierRates,
} from '../domain/airSupplierRates.js'

const router = useRouter()
const { state, airSession, workbenchSession, saveAirSupplierRate, setAirSupplierRateActive } = usePrototypeData()
const fields = [
  { key: 'partnerId', label: '供应商', type: 'select' }, { key: 'serviceType', label: '服务类型', type: 'select' },
  { key: 'feeItemId', label: '成本类型', type: 'select' }, { key: 'billingUnit', label: '计费单位', type: 'select' },
  { key: 'chargeMethod', label: '计费方式', type: 'select' }, { key: 'unitPrice', label: '计费单价', type: 'number' },
  { key: 'taxRate', label: '税率', type: 'integer' }, { key: 'currency', label: '币种', type: 'select' },
  { key: 'startDate', label: '生效日期', type: 'date' }, { key: 'endDate', label: '截止日期', type: 'date' },
  { key: 'contractNo', label: '合同编号', type: 'text', optional: true, max: 20 },
]
const columns = [...fields, { key: 'creator', label: '创建人' }, { key: 'updatedAt', label: '更新时间' }]
const permission = computed(() => getAirSupplierRatePermissions(airSession.role))
const partners = computed(() => state.partners.filter(row => row.type === '供应商'))
const filterDefaults = () => ({ feeItem: '', status: '', billingUnit: '', serviceType: '', supplier: '' })
const filters = ref(filterDefaults()), applied = ref(filterDefaults())
const mode = ref(''), draft = ref({}), initial = ref(''), selectedId = ref(''), busy = ref(false), submitted = ref(false), failure = ref('')
const editor = ref(), methodDialog = ref(null)
const selected = computed(() => state.airSupplierRates.find(row => row.id === selectedId.value))
const readonly = computed(() => mode.value === 'detail')
const editing = computed(() => ['create', 'edit'].includes(mode.value))
const dirty = computed(() => editing.value && JSON.stringify(draft.value) !== initial.value)
const errors = computed(() => editing.value ? validateAirSupplierRateDraft(normalizeAirSupplierRateDraft(draft.value), state, { existing: selected.value }) : {})
const methodChanged = computed(() => mode.value === 'edit' && selected.value && draft.value.chargeMethod !== selected.value.chargeMethod)
const rows = computed(() => filterAirSupplierRates(state.airSupplierRates, applied.value, state))
const clone = value => JSON.parse(JSON.stringify(value))
const status = row => deriveAirSupplierRateStatus(row)
const partyName = id => state.partners.find(row => row.id === id)?.name || '档案不可用'
const feeName = id => state.financeCostItems.find(row => row.id === id)?.name || '成本项目不可用'
const roleKey = () => workbenchSession.personaId

function options(field) {
  if (field.key === 'partnerId') return partners.value.map(row => ({ value: row.id, label: row.name }))
  if (field.key === 'feeItemId') return state.financeCostItems.map(row => ({ value: row.id, label: row.name }))
  const values = { serviceType: AIR_RATE_SERVICES, billingUnit: AIR_RATE_UNITS, chargeMethod: AIR_RATE_METHODS, currency: AIR_RATE_CURRENCIES }[field.key] || []
  return values.map(value => ({ value, label: value }))
}
function display(row, field) {
  if (field.key === 'partnerId') return partyName(row.partnerId)
  if (field.key === 'feeItemId') return feeName(row.feeItemId)
  if (row[field.key] === '' || row[field.key] == null) return '未填写'
  if (field.key === 'unitPrice') return Number(row.unitPrice).toFixed(2)
  return String(row[field.key])
}
function query() { applied.value = clone(filters.value) }
function resetQuery() { filters.value = filterDefaults(); query() }
function resetEditor() { mode.value = ''; selectedId.value = ''; submitted.value = false; failure.value = ''; methodDialog.value = null }
function changeMethod() {
  if (!editing.value || busy.value) return
  draft.value.unitPrice = ''; draft.value.details = []
  methodDialog.value = null
}
function showMethod(row = draft.value, readOnly = false) {
  if (busy.value || !AIR_RATE_METHODS.includes(row?.chargeMethod) || row.chargeMethod === '常规方式') return
  if (!readOnly && (!editing.value || !permission.value.edit)) return
  methodDialog.value = { method: row.chargeMethod, rows: clone(row.details || []), billingUnit: row.billingUnit, readonly: readOnly,
    partnerName: row.partnerId ? partyName(row.partnerId) : '', feeItemName: row.feeItemId ? feeName(row.feeItemId) : '' }
}
async function focusError() {
  await nextTick()
  editor.value?.querySelector('.is-error input, .is-error [tabindex="0"], .is-error button')?.focus()
}
function save() {
  if (busy.value || methodDialog.value || !editing.value || !permission.value[mode.value]) return false
  submitted.value = true
  if (Object.keys(errors.value).length) { focusError(); return false }
  busy.value = true; failure.value = ''
  try {
    const editingExisting = mode.value === 'edit'
    saveAirSupplierRate(clone(draft.value))
    resetEditor(); ElMessage.success(editingExisting ? '编辑供应商价格规则成功' : '新增供应商价格规则成功'); return true
  } catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
async function allowDiscard() {
  if (busy.value) return false
  if (!dirty.value) return true
  const person = roleKey(), source = state.airSupplierRates
  busy.value = true
  try {
    await ElMessageBox.confirm('尚未保存的价格规则修改将丢弃。', '放弃修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' })
    return person === roleKey() && source === state.airSupplierRates
  } catch { return false }
  finally { busy.value = false }
}
async function close(done) {
  if (!await allowDiscard()) return
  resetEditor(); if (typeof done === 'function') done()
}
async function open(nextMode, row) {
  if (busy.value || methodDialog.value || !['create', 'edit', 'detail'].includes(nextMode)) return
  if (nextMode !== 'detail' && !permission.value[nextMode]) return
  const id = row?.id || '', person = roleKey(), source = state.airSupplierRates
  if (nextMode !== 'create' && !id) return
  if (dirty.value) {
    busy.value = true
    try {
      await ElMessageBox.confirm(nextMode === 'create' ? '有修改的内容尚未保存，是否新增' : '有修改的内容尚未保存，是否放弃并切换？', '未保存的价格规则', { confirmButtonText: '放弃并继续', cancelButtonText: '继续编辑', type: 'warning', closeOnClickModal: false })
    } catch { return }
    finally { busy.value = false }
    if (person !== roleKey() || source !== state.airSupplierRates) return
  }
  const record = id ? state.airSupplierRates.find(item => item.id === id) : null
  if (id && !record) { ElMessage.warning('该价格规则已不存在，请重新选择'); return }
  resetEditor(); selectedId.value = id
  draft.value = record ? clone(record) : createAirSupplierRateDraft()
  initial.value = JSON.stringify(draft.value); mode.value = nextMode
  await nextTick()
  if (editing.value) editor.value?.scrollIntoView({ block: 'start' })
}
function actionFor(row, action) {
  const result = getAirSupplierRateAction(row, action)
  return editing.value ? { allowed: false, reason: '请先保存或取消当前价格编辑' } : result
}
async function toggle(row, action) {
  if (busy.value || !permission.value.toggle || !['enable', 'disable'].includes(action)) return
  const eligibility = actionFor(row, action)
  if (!eligibility.allowed) { ElMessage.warning(eligibility.reason); return }
  const person = roleKey(), target = state.airSupplierRates.find(item => item.id === row.id), id = row.id
  const label = action === 'enable' ? '启用' : '失效'
  busy.value = true
  try {
    await ElMessageBox.confirm(`确认${label}「${partyName(row.partnerId)} / ${row.serviceType} / ${feeName(row.feeItemId)}」？`, '供应商价格规则' + label, { confirmButtonText: label, cancelButtonText: '取消', type: 'warning' })
    if (person !== roleKey() || state.airSupplierRates.find(item => item.id === id) !== target) return
    setAirSupplierRateActive(id, action === 'enable'); ElMessage.success(label + '成功')
  } catch (error) { if (error instanceof Error) ElMessage.error(error.message) }
  finally { busy.value = false }
}
function goPartners() { router.push({ path: '/foundation/partners', query: { type: '供应商' } }) }
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(allowDiscard)
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
watch(() => workbenchSession.personaId, () => {
  if (dirty.value) ElMessage.warning('角色已切换，未保存的修改已取消')
  resetEditor()
})
watch(() => state.airSupplierRates, () => resetEditor())
watch(selected, row => {
  if (mode.value && selectedId.value && !row) { resetEditor(); ElMessage.warning('该价格规则已不存在，请重新选择') }
})
</script>

<template>
  <div class="module-view air-rates-view">
    <PageHeader title="供应商价格" :description="'当前角色：' + (permission.create ? '空运客服主管' : '只读查看') + ' · ' + airSession.name">
      <template #actions><el-button v-business-write="'airSupplierRates'" v-if="permission.create" type="primary" :icon="Plus" :disabled="busy" @click="open('create')">新增</el-button></template>
    </PageHeader>
    <section v-if="editing" ref="editor" class="rate-editor" :aria-label="mode === 'create' ? '新增供应商价格' : '编辑供应商价格'">
      <h2>{{ mode === 'create' ? '新增供应商价格' : '编辑供应商价格 · ' + selectedId }}</h2>
      <el-alert v-if="failure" :title="failure" type="error" :closable="false" show-icon class="rate-notice" />
      <el-form label-position="top" @submit.prevent="save">
        <div class="rate-form-grid">
          <el-form-item v-for="field in fields" :key="field.key" :label="field.label" :required="!field.optional && (field.key !== 'unitPrice' || draft.chargeMethod === '常规方式')" :error="field.key === 'unitPrice' && errors.details ? errors.details : submitted || draft[field.key] !== '' ? errors[field.key] : ''">
            <template v-if="field.key === 'unitPrice' && draft.chargeMethod && draft.chargeMethod !== '常规方式'"><el-button :disabled="busy" @click="showMethod()">修改</el-button></template>
            <el-select v-else-if="field.type === 'select'" v-model="draft[field.key]" filterable clearable :aria-label="field.label" :placeholder="'请选择' + field.label" :disabled="busy" @change="field.key === 'chargeMethod' && changeMethod()">
              <el-option v-for="option in options(field)" :key="option.value" :value="option.value" :label="option.label" />
              <el-option v-if="field.key === 'billingUnit'" :value="AIR_RATE_UNIT_CONFLICTS[1]" :label="AIR_RATE_UNIT_CONFLICTS[1] + '（口径待确认）'" disabled />
            </el-select>
            <el-date-picker v-else-if="field.type === 'date'" v-model="draft[field.key]" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" :aria-label="field.label" placeholder="YYYY-MM-DD" :disabled="busy" />
            <el-input v-else v-model="draft[field.key]" :aria-label="field.label" :maxlength="field.max" :inputmode="field.type === 'number' ? 'decimal' : field.type === 'integer' ? 'numeric' : 'text'" :disabled="busy" />
            <div v-if="field.key === 'partnerId'" class="supplier-links"><el-button link type="primary" @click="goPartners">供应商档案</el-button><el-tooltip content="当前角色的供应商建档入口尚未接入"><span><el-button link disabled :icon="Plus">新增供应商</el-button></span></el-tooltip></div>
            <small v-if="field.key === 'chargeMethod' && methodChanged" class="rate-warning">与之前的计费方式不一致，请确认后继续操作</small>
          </el-form-item>
        </div>
        <div class="rate-system-fields"><span>创建人：{{ selected?.creator || airSession.name }}</span><span>状态：{{ selected ? status(selected) : '已生效' }}</span><span>更新时间：{{ selected?.updatedAt || '保存时记录' }}</span></div>
        <div class="rate-editor-footer"><el-button :disabled="busy" @click="close">取消</el-button><el-button native-type="submit" type="primary" :loading="busy">保存</el-button></div>
      </el-form>
    </section>
    <form class="filter-bar rate-filters" @submit.prevent="query">
      <label>成本类型<el-select v-model="filters.feeItem" filterable allow-create default-first-option clearable aria-label="查询成本类型" placeholder="全部成本类型"><el-option v-for="item in state.financeCostItems" :key="item.id" :value="item.name" :label="item.name" /></el-select></label>
      <label>状态<el-select v-model="filters.status" clearable aria-label="查询状态" placeholder="全部状态"><el-option v-for="value in ['已生效', '失效']" :key="value" :value="value" :label="value" /></el-select></label>
      <label>计费单位<el-select v-model="filters.billingUnit" clearable aria-label="查询计费单位" placeholder="全部计费单位"><el-option v-for="value in AIR_RATE_UNITS" :key="value" :value="value" :label="value" /><el-option :value="AIR_RATE_UNIT_CONFLICTS[0]" :label="AIR_RATE_UNIT_CONFLICTS[0] + '（口径待确认）'" disabled /></el-select></label>
      <label>服务类型<el-select v-model="filters.serviceType" clearable aria-label="查询服务类型" placeholder="全部服务类型"><el-option v-for="value in AIR_RATE_SERVICES" :key="value" :value="value" :label="value" /></el-select></label>
      <label>供应商<el-select v-model="filters.supplier" filterable allow-create default-first-option clearable aria-label="查询供应商" placeholder="全部供应商"><el-option v-for="item in partners" :key="item.id" :value="item.name" :label="item.name" /></el-select></label>
      <div class="rate-query-actions"><el-button native-type="submit" type="primary" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="resetQuery">重置</el-button></div>
    </form>
    <DataTableFrame :key="JSON.stringify(applied)" :rows="rows">
      <template #default="{ rows: pageRows }">
        <el-table :data="pageRows" row-key="id" stripe aria-label="供应商价格维护列表">
          <el-table-column v-for="field in columns" :key="field.key" :label="field.label" :min-width="['partnerId','billingUnit'].includes(field.key) ? 190 : field.key === 'updatedAt' ? 180 : 130" :align="['unitPrice','taxRate'].includes(field.key) ? 'right' : 'left'">
            <template #default="{ row }"><el-button v-if="field.key === 'partnerId'" link type="primary" :aria-label="'查看价格' + row.id" @click="open('detail', row)">{{ partyName(row.partnerId) }}</el-button><el-button v-else-if="field.key === 'unitPrice' && row.chargeMethod !== '常规方式'" link type="primary" :aria-label="'查看计费方式' + row.id" @click="showMethod(row, true)">查看</el-button><span v-else>{{ display(row, field) }}</span></template>
          </el-table-column>
          <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="status(row) === '已生效' ? 'success' : 'info'">{{ status(row) }}</el-tag></template></el-table-column>
          <el-table-column v-if="permission.edit" label="操作" width="172" fixed="right" class-name="rate-actions"><template #default="{ row }">
            <el-button v-business-write="'airSupplierRates'" link type="primary" :aria-label="'编辑' + row.id" :disabled="busy" @click="open('edit', row)">编辑</el-button>
            <el-tooltip v-for="action in ['enable', 'disable']" :key="action" :content="actionFor(row, action).reason" :disabled="actionFor(row, action).allowed"><span><el-button v-business-write="'airSupplierRates'" link type="primary" :aria-label="(action === 'enable' ? '启用' : '失效') + row.id" :disabled="busy || !actionFor(row, action).allowed" @click="toggle(row, action)">{{ action === 'enable' ? '启用' : '失效' }}</el-button></span></el-tooltip>
          </template></el-table-column>
          <template #empty><el-empty :description="Object.values(applied).some(Boolean) ? '没有匹配价格，请调整查询条件' : '暂无供应商价格'" /></template>
        </el-table>
      </template>
    </DataTableFrame>
    <el-dialog :model-value="readonly" title="供应商价格详情" width="min(780px, 96vw)" align-center :close-on-click-modal="false" :before-close="close" destroy-on-close>
      <div v-if="readonly" class="rate-detail-body"><el-descriptions :column="1" border><el-descriptions-item v-for="field in columns" :key="field.key" :label="field.label"><template v-if="field.key === 'unitPrice' && draft.chargeMethod !== '常规方式'">不适用</template><template v-else>{{ display(draft, field) }}</template></el-descriptions-item><el-descriptions-item label="状态">{{ status(selected) }}</el-descriptions-item></el-descriptions><p v-if="!actionFor(selected, status(selected) === '已生效' ? 'disable' : 'enable').allowed" class="rate-hint">{{ actionFor(selected, status(selected) === '已生效' ? 'disable' : 'enable').reason }}</p></div>
      <template #footer><el-button @click="close">关闭</el-button></template>
    </el-dialog>
    <AirRateMethodDialog :context="methodDialog" @close="methodDialog = null" />
  </div>
</template>

<style scoped>
.rate-notice { margin-bottom: 16px; }
.rate-editor { padding-block: 18px; border-block: 1px solid var(--border); margin-bottom: 20px; scroll-margin-top: 16px; }
.rate-editor h2 { font-size: 17px; line-height: 1.5; margin: 0 0 18px; overflow-wrap: anywhere; }
.rate-form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 20px; }
.rate-form-grid > * { min-width: 0; }
.rate-form-grid :deep(.el-date-editor) { width: 100%; }
.rate-system-fields { display: flex; gap: 8px 20px; flex-wrap: wrap; color: var(--muted); font-size: 13px; margin-bottom: 16px; }
.rate-editor-footer { display: flex; justify-content: flex-end; gap: 8px; }
.rate-editor-footer .el-button { margin: 0; }
.rate-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: end; }
.rate-filters label { display: grid; gap: 8px; font-size: 13px; min-width: 0; }
.rate-warning { color: var(--el-color-danger); display: block; width: 100%; font-size: 12px; line-height: 1.5; margin-top: 6px; }
.supplier-links { display: flex; gap: 12px; margin-top: 4px; }
.rate-detail-body { max-height: 64vh; overflow: auto; }
.rate-detail-body :deep(.el-descriptions__label) { width: 120px; white-space: nowrap; }
.rate-detail-body :deep(.el-descriptions__content) { overflow-wrap: anywhere; }
.rate-hint { color: var(--muted); font-size: 13px; }
.air-rates-view :deep(.rate-actions .cell) { display: flex; align-items: center; gap: 10px; }
.air-rates-view :deep(.rate-actions .el-button) { margin: 0; }
@media (max-width: 900px) { .rate-form-grid, .rate-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .rate-form-grid, .rate-filters { grid-template-columns: minmax(0, 1fr); } .rate-query-actions { display: flex; } .rate-query-actions .el-button { flex: 1; } }
</style>
