<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  WAREHOUSE_QUOTE_SUBJECTS, WAREHOUSE_QUOTE_SUBJECT_LABELS, WAREHOUSE_QUOTE_UNITS,
  WAREHOUSE_QUOTE_CHARGE_METHODS, WAREHOUSE_QUOTE_CURRENCIES, createWarehouseQuoteDraft,
  normalizeWarehouseQuoteDraft, validateWarehouseQuoteDraft, deriveWarehouseQuoteStatus,
  getWarehouseQuotePermissions, getWarehouseQuoteAction, filterWarehouseQuotes,
} from '../domain/warehouseQuotes.js'

const { state, groundSession, workbenchSession, saveWarehouseQuote, setWarehouseQuoteActive, deleteWarehouseQuote } = usePrototypeData()
const fields = [
  { key: 'partnerId', label: '客户', type: 'select', locked: true },
  { key: 'taxRate', label: '税率（%）', type: 'number', locked: true },
  { key: 'currency', label: '币种', type: 'select', locked: true },
  { key: 'subject', label: '报价科目', type: 'select' },
  { key: 'amount', label: '报价金额', type: 'number' },
  { key: 'unit', label: '单位', type: 'select' },
  { key: 'chargeMethod', label: '计费方式', type: 'select' },
  { key: 'startDate', label: '生效日期', type: 'date' },
  { key: 'endDate', label: '截止日期', type: 'date' },
  { key: 'remark', label: '备注', type: 'textarea', optional: true },
]
const columns = ['partnerId', 'subject', 'amount', 'unit', 'currency', 'taxRate', 'chargeMethod', 'endDate', 'remark'].map(key => fields.find(field => field.key === key))
const permission = computed(() => getWarehouseQuotePermissions(groundSession.role))
const partners = computed(() => state.partners.filter(row => row.type === '客户'))
const filters = ref({ partnerId: '', subject: '' }), applied = ref({ ...filters.value })
const mode = ref(''), draft = ref({}), selectedId = ref(''), initial = ref(''), busy = ref(false), failure = ref(''), submitted = ref(false)
const editor = ref()
const clone = value => JSON.parse(JSON.stringify(value))
const selected = computed(() => state.warehouseQuotes.find(row => row.id === selectedId.value))
const readonly = computed(() => mode.value === 'detail')
const editing = computed(() => ['create', 'edit'].includes(mode.value))
const dirty = computed(() => editing.value && JSON.stringify(draft.value) !== initial.value)
const errors = computed(() => editing.value ? validateWarehouseQuoteDraft(normalizeWarehouseQuoteDraft(draft.value), state.warehouseQuotes, state.partners, { existing: selected.value }) : {})
const rows = computed(() => filterWarehouseQuotes(state.warehouseQuotes, applied.value, state.partners))
const queryKey = computed(() => JSON.stringify(applied.value))
const status = row => deriveWarehouseQuoteStatus(row)
const partyName = id => state.partners.find(row => row.id === id)?.name || '档案不可用'
const roleKey = () => workbenchSession.personaId

function options(field) {
  if (field.key === 'partnerId') return partners.value.map(row => ({ value: row.id, label: row.name }))
  if (field.key === 'subject') return WAREHOUSE_QUOTE_SUBJECTS.map(value => ({ value, label: WAREHOUSE_QUOTE_SUBJECT_LABELS[value] }))
  const values = { currency: WAREHOUSE_QUOTE_CURRENCIES, unit: WAREHOUSE_QUOTE_UNITS, chargeMethod: WAREHOUSE_QUOTE_CHARGE_METHODS }[field.key] || []
  return values.map(value => ({ value, label: value }))
}
function display(row, field) {
  const value = row[field.key]
  if (field.key === 'partnerId') return partyName(value)
  if (value === '' || value == null) return '未填写'
  if (['amount', 'taxRate'].includes(field.key)) return Number(value).toFixed(2)
  return String(value)
}
function query() { applied.value = clone(filters.value) }
function resetQuery() { filters.value = { partnerId: '', subject: '' }; query() }
function resetEditor() { mode.value = ''; selectedId.value = ''; failure.value = ''; submitted.value = false }
async function focusError() {
  await nextTick()
  const input = editor.value?.querySelector('.is-error input, .is-error textarea, .is-error [tabindex="0"]')
  input?.focus()
}
function save() {
  if (busy.value || !editing.value || !permission.value[mode.value]) return false
  submitted.value = true
  if (Object.keys(errors.value).length) { focusError(); return false }
  busy.value = true; failure.value = ''
  try {
    saveWarehouseQuote(clone(draft.value))
    resetEditor(); ElMessage.success('保存成功'); return true
  } catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
async function open(nextMode, row) {
  if (busy.value || !['create', 'edit', 'detail'].includes(nextMode)) return
  if (nextMode !== 'detail' && !permission.value[nextMode]) return
  if (nextMode !== 'create' && !row) return
  const targetId = row?.id || '', contextRole = roleKey(), collection = state.warehouseQuotes
  if (dirty.value) {
    busy.value = true
    let intent
    try {
      await ElMessageBox.confirm('当前报价尚未保存。是否保存后继续？', '处理未保存报价', {
        confirmButtonText: '保存后继续', cancelButtonText: '不保存', distinguishCancelAndClose: true,
        closeOnClickModal: false, type: 'warning',
      })
      intent = 'save'
    } catch (action) { intent = action === 'cancel' ? 'discard' : 'stay' }
    finally { busy.value = false }
    if (contextRole !== roleKey() || collection !== state.warehouseQuotes || intent === 'stay') return
    if (intent === 'save' && !save()) return
  }
  const source = targetId ? state.warehouseQuotes.find(item => item.id === targetId) : null
  if (targetId && !source) { ElMessage.warning('该仓库报价已不存在，请重新选择'); return }
  resetEditor(); selectedId.value = targetId
  draft.value = source ? clone(source) : createWarehouseQuoteDraft()
  initial.value = JSON.stringify(draft.value); mode.value = nextMode
  await nextTick()
  if (editing.value) editor.value?.scrollIntoView({ block: 'start' })
}
async function allowDiscard() {
  if (busy.value) return false
  if (!dirty.value) return true
  const contextRole = roleKey(), collection = state.warehouseQuotes
  busy.value = true
  try {
    await ElMessageBox.confirm('尚未保存的仓库报价修改将丢弃。', '放弃修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' })
    return contextRole === roleKey() && collection === state.warehouseQuotes
  } catch { return false }
  finally { busy.value = false }
}
async function close(done) {
  if (!await allowDiscard()) return
  resetEditor(); if (typeof done === 'function') done()
}
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(allowDiscard)
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
watch(() => workbenchSession.personaId, () => {
  if (dirty.value) ElMessage.warning('角色已切换，未保存的修改已取消')
  resetEditor()
})
watch(selected, row => {
  if (mode.value && selectedId.value && !row) {
    resetEditor(); ElMessage.warning('该仓库报价已不存在，请重新选择')
  }
})
function actionFor(row) {
  const action = row?.manualDisabled ? 'enable' : 'disable'
  return { action, label: action === 'enable' ? '启用' : '失效', ...getWarehouseQuoteAction(row, action) }
}
async function toggle(row) {
  if (busy.value || !permission.value.toggle) return
  const action = actionFor(row)
  if (!action.allowed) { ElMessage.warning(action.reason); return }
  const id = row.id, contextRole = roleKey(), target = state.warehouseQuotes.find(item => item.id === row.id)
  busy.value = true
  try {
    await ElMessageBox.confirm(`确认${action.label}报价「${id}」？`, action.label + '仓库报价', { confirmButtonText: '确认' + action.label, cancelButtonText: '取消', type: 'warning' })
    if (contextRole !== roleKey()) return
    if (state.warehouseQuotes.find(item => item.id === id) !== target) return
    setWarehouseQuoteActive(id, action.action === 'enable')
    ElMessage.success(action.label + '成功')
  } catch (error) { if (error instanceof Error) ElMessage.error(error.message) }
  finally { busy.value = false }
}
async function remove(row) {
  if (busy.value || !permission.value.delete || !row?.id) return
  const id = row.id, contextRole = roleKey(), target = state.warehouseQuotes.find(item => item.id === row.id)
  busy.value = true
  try {
    await ElMessageBox.confirm(`确认删除报价「${id}」？客户：${partyName(row.partnerId)}；科目：${row.subject}。`, '删除仓库报价', { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' })
    if (contextRole !== roleKey()) return
    if (state.warehouseQuotes.find(item => item.id === id) !== target) return
    deleteWarehouseQuote(id); ElMessage.success('删除成功')
  } catch (error) { if (error instanceof Error) ElMessage.error(error.message) }
  finally { busy.value = false }
}
</script>

<template>
  <div class="module-view warehouse-quotes-view">
    <PageHeader title="仓库报价" :description="'当前角色：' + (permission.create ? '航晟' + (groundSession.role === 'supervisor' ? '主管' : '客服') : '只读查看') + ' · ' + groundSession.name">
      <template #actions><el-button type="primary" :icon="Plus" :disabled="!permission.create || busy" @click="open('create')">新建报价</el-button></template>
    </PageHeader>
    <el-alert v-if="permission.reason" :title="permission.reason" type="info" :closable="false" show-icon class="quote-notice" />
    <section v-if="editing" ref="editor" class="quote-editor" :aria-label="mode === 'create' ? '新增仓库报价' : '修改仓库报价'">
      <h2>{{ mode === 'create' ? '新增仓库报价' : '修改仓库报价 · ' + selectedId }}</h2>
      <el-alert v-if="failure" :title="failure" type="error" :closable="false" show-icon class="quote-notice" />
      <el-form label-position="top" @submit.prevent="save">
        <div class="quote-form-grid">
          <el-form-item v-for="field in fields" :key="field.key" :label="field.label" :required="!field.optional" :error="submitted || draft[field.key] !== '' ? errors[field.key] : ''" :class="{ 'quote-remark': field.key === 'remark' }">
            <el-input v-if="mode === 'edit' && field.locked" :model-value="display(draft, field)" readonly :aria-label="field.label" class="locked-field" />
            <el-select v-else-if="field.type === 'select'" v-model="draft[field.key]" filterable clearable :aria-label="field.label" :placeholder="'请选择' + field.label" :disabled="busy">
              <el-option v-for="option in options(field)" :key="option.value" :value="option.value" :label="option.label" />
            </el-select>
            <el-date-picker v-else-if="field.type === 'date'" v-model="draft[field.key]" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" :aria-label="field.label" placeholder="YYYY-MM-DD" :disabled="busy" />
            <el-input v-else v-model="draft[field.key]" :type="field.type === 'textarea' ? 'textarea' : 'text'" :rows="2" :maxlength="field.key === 'remark' ? 200 : undefined" :show-word-limit="field.key === 'remark'" :inputmode="field.type === 'number' ? 'decimal' : 'text'" :aria-label="field.label" :disabled="busy" />
          </el-form-item>
        </div>
        <div class="quote-editor-footer"><el-button :disabled="busy" @click="close">取消</el-button><el-button native-type="submit" type="primary" :loading="busy" :disabled="!permission[mode]">保存</el-button></div>
      </el-form>
    </section>
    <form class="filter-bar quote-filters" @submit.prevent="query">
      <label>客户<el-select v-model="filters.partnerId" filterable clearable aria-label="查询客户" placeholder="全部客户"><el-option v-for="partner in partners" :key="partner.id" :value="partner.id" :label="partner.name" /></el-select></label>
      <label>报价科目<el-select v-model="filters.subject" clearable aria-label="查询报价科目" placeholder="全部科目"><el-option v-for="subject in WAREHOUSE_QUOTE_SUBJECTS" :key="subject" :value="subject" :label="subject" /></el-select></label>
      <el-button native-type="submit" type="primary" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="resetQuery">重置</el-button>
    </form>
    <DataTableFrame :key="queryKey" :rows="rows">
      <template #default="{ rows: pageRows }">
        <el-table :data="pageRows" row-key="id" stripe aria-label="仓库报价列表">
          <el-table-column label="报价ID" width="155"><template #default="{ row }"><el-button link type="primary" @click="open('detail', row)">{{ row.id }}</el-button></template></el-table-column>
          <el-table-column label="状态" width="115"><template #default="{ row }"><el-tag :type="status(row) === '生效' ? 'success' : status(row) === '待生效' ? 'warning' : 'info'">{{ status(row) }}</el-tag></template></el-table-column>
          <el-table-column v-for="field in columns" :key="field.key" :label="field.label" :min-width="field.key === 'partnerId' ? 190 : field.key === 'remark' ? 220 : 125" :align="['amount', 'taxRate'].includes(field.key) ? 'right' : 'left'"><template #default="{ row }">{{ display(row, field) }}</template></el-table-column>
          <el-table-column label="操作" width="180" fixed="right" class-name="quote-actions"><template #default="{ row }">
            <el-button link type="primary" :disabled="!permission.edit || busy" :aria-label="'修改' + row.id" @click="open('edit', row)">修改</el-button>
            <el-tooltip :content="permission.reason || actionFor(row).reason" :disabled="permission.toggle && actionFor(row).allowed"><span><el-button link type="primary" :disabled="!permission.toggle || !actionFor(row).allowed || busy" :aria-label="actionFor(row).label + row.id" @click="toggle(row)">{{ actionFor(row).label }}</el-button></span></el-tooltip>
            <el-button link type="danger" :disabled="!permission.delete || busy" :aria-label="'删除' + row.id" @click="remove(row)">删除</el-button>
          </template></el-table-column>
          <template #empty><el-empty :description="applied.partnerId || applied.subject ? '没有匹配报价，请调整查询条件' : '暂无仓库报价'" /></template>
        </el-table>
      </template>
    </DataTableFrame>
    <el-dialog :model-value="readonly" title="仓库报价详情" width="min(740px, 96vw)" align-center :close-on-click-modal="false" :before-close="close" destroy-on-close>
      <div class="quote-detail-body" v-if="readonly">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="报价ID">{{ draft.id }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ status(selected) }}</el-descriptions-item>
          <el-descriptions-item v-for="field in fields" :key="field.key" :label="field.label">{{ display(draft, field) }}</el-descriptions-item>
        </el-descriptions>
        <p v-if="!actionFor(selected).allowed" class="quote-hint">{{ actionFor(selected).reason }}</p>
      </div>
      <template #footer><el-button @click="close">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.quote-notice { margin-bottom: 16px; }
.quote-editor { border-block: 1px solid var(--border); padding-block: 18px; margin-bottom: 22px; scroll-margin-top: 16px; }
.quote-editor h2 { margin: 0 0 18px; font-size: 17px; line-height: 1.5; overflow-wrap: anywhere; }
.quote-form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 20px; }
.quote-form-grid > * { min-width: 0; }
.quote-remark { grid-column: 1 / -1; }
.quote-form-grid :deep(.el-date-editor) { width: 100%; }
.locked-field :deep(.el-input__wrapper) { background: var(--el-fill-color-light); }
.quote-editor-footer { display: flex; justify-content: flex-end; gap: 8px; }
.quote-editor-footer .el-button + .el-button { margin-left: 0; }
.quote-filters { align-items: flex-end; }
.quote-filters label { display: grid; gap: 8px; font-size: 13px; width: 220px; max-width: 100%; }
.quote-detail-body { max-height: 65vh; overflow: auto; }
.quote-detail-body :deep(.el-descriptions__label) { width: 110px; white-space: nowrap; }
.quote-detail-body :deep(.el-descriptions__content) { overflow-wrap: anywhere; white-space: pre-wrap; }
.quote-hint { font-size: 13px; color: var(--muted); }
.warehouse-quotes-view :deep(.quote-actions .cell) { display: flex; align-items: center; gap: 10px; }
.warehouse-quotes-view :deep(.quote-actions .el-button) { margin: 0; }
@media (max-width: 900px) { .quote-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .quote-form-grid { grid-template-columns: minmax(0, 1fr); } .quote-filters label { width: 100%; } }
</style>
