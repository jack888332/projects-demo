<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Delete, DocumentCopy, Plus, Refresh, Search, Upload } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { createTransportQuoteDraft, getTransportQuoteStatus, filterTransportQuotes, TRANSPORT_QUOTE_VEHICLES, TRANSPORT_QUOTE_CURRENCIES, TRANSPORT_QUOTE_REGIONS, TRANSPORT_QUOTE_SPECIAL_TYPES } from '../domain/transportQuotes.js'
import { validateTransportQuoteBatch } from '../data/transportQuoteActions.js'

const route = useRoute(), router = useRouter()
const { state, groundSession, saveTransportQuotes, deleteTransportQuotes } = usePrototypeData()
const kind = computed(() => route.query.tab === 'customer' ? 'customer' : 'supplier')
const partyLabel = computed(() => kind.value === 'supplier' ? '供应商车行' : '客户')
const fixedLabel = computed(() => kind.value === 'supplier' ? '运输费' : '提货费')
const canEdit = computed(() => ['hangsheng', 'supervisor', 'admin'].includes(groundSession.role))
const filterDefaults = () => ({ keyword: '', partnerId: '', vehicleType: '', pickup: [], delivery: [], status: '', regulated: '', transportType: '', tailLift: '', specialVehicle: '', currency: '', chargeMode: '' })
const filters = ref(filterDefaults()), applied = ref(filterDefaults()), table = ref(), selectedIds = ref([])
const mode = ref(''), draftRows = ref([]), activeIndex = ref(0), initial = ref(''), busy = ref(false), failure = ref(''), clipboard = ref(null), contextIndex = ref(null)
const clone = value => JSON.parse(JSON.stringify(value))
const draft = computed(() => draftRows.value[activeIndex.value])
const readonly = computed(() => mode.value === 'detail')
const dirty = computed(() => mode.value && !readonly.value && JSON.stringify(draftRows.value) !== initial.value)
const rowErrors = computed(() => !mode.value || readonly.value ? [] : validateTransportQuoteBatch(kind.value, draftRows.value, state))
const errors = computed(() => rowErrors.value.find(item => item.index === activeIndex.value)?.fields || {})
const rows = computed(() => filterTransportQuotes(state.transportQuotes, { ...applied.value, kind: kind.value }, state.partners))
const partners = computed(() => state.partners.filter(row => row.type === (kind.value === 'supplier' ? '供应商' : '客户') && ['已生效', '有效'].includes(row.status)))
const fields = computed(() => [
  { key: 'partnerId', label: partyLabel.value, type: 'partner', required: true, locked: true },
  { key: 'taxRate', label: '税率（%）', required: true, locked: true },
  { key: 'currency', label: '币种', options: TRANSPORT_QUOTE_CURRENCIES, required: true, locked: true },
  { key: 'vehicleType', label: '车型', options: TRANSPORT_QUOTE_VEHICLES, required: true },
  { key: 'transportType', label: '运输类型', options: ['单程', '往返'] },
  { key: 'transitHours', label: '运输时效（小时）' },
  { key: 'regulated', label: '监管类型', options: ['是', '否'] },
  { key: 'tailLift', label: '尾板车', options: ['是', '否'] },
  { key: 'specialVehicle', label: '特种车', options: TRANSPORT_QUOTE_SPECIAL_TYPES, locked: true },
])
const priceFields = computed(() => [
  ...(draft.value?.chargeMode === 'unit' ? [{ key: 'unitPrice', label: '单价', required: true }, { key: 'unit', label: '单位', required: true, text: true }] : [{ key: 'transportFee', label: fixedLabel.value + '（元/车）', required: true }]),
  { key: 'startPrice', label: '起步价' }, { key: 'waitingFee', label: '压日费（元/日）' },
  { key: 'returnRate', label: '返空费（%）', required: true },
])
const listFields = computed(() => [
  ['vehicleType', '车型'], ['currency', '币种'], ['transportType', '运输类型'], ['regulated', '监管类型'], ['taxRate', '税率（%）'],
  ['transportFee', fixedLabel.value + '（元/车）'], ['unitPrice', '单价'], ['unit', '单位'], ['startPrice', '起步价'],
  ['transitHours', '运输时效（小时）'], ['waitingFee', '压日费（元/日）'], ['returnRate', '返空费（%）'],
  ['tailLift', '尾板车'], ['specialVehicle', '特种车'], ['startDate', '起始日期'], ['endDate', '有效期'], ['remark', '备注'], ['updatedBy', '操作人'], ['updatedAt', '更新时间'],
])
const querySelects = computed(() => [
  { key: 'vehicleType', label: '车型', options: TRANSPORT_QUOTE_VEHICLES, disabled: kind.value === 'customer', pending: '车型映射待确认' },
  { key: 'status', label: '状态', options: kind.value === 'supplier' ? ['有效', '失效', '待生效'] : ['有效', '失效'] },
  { key: 'regulated', label: '监管类型', options: ['是', '否'] },
  { key: 'transportType', label: '运输类型', options: ['单程', '往返'] },
  { key: 'tailLift', label: '尾板车', options: ['是', '否'] },
  { key: 'specialVehicle', label: '特种车', options: TRANSPORT_QUOTE_SPECIAL_TYPES, disabled: !['4.2车', '7.6车', '40尺柜'].includes(filters.value.vehicleType) },
  ...(kind.value === 'customer' ? [{ key: 'currency', label: '币种', options: TRANSPORT_QUOTE_CURRENCIES }] : []),
])
const queryRegions = TRANSPORT_QUOTE_REGIONS.map(province => ({ ...province, children: province.children.map(city => ({ value: city.value, label: city.label })) }))
const detailFields = computed(() => !draft.value ? [] : [
  ['报价ID', draft.value.id], [partyLabel.value, partyName(draft.value.partnerId)], ['状态', getTransportQuoteStatus(draft.value)],
  ['提货点', address(draft.value.pickup)], ['卸货点', address(draft.value.delivery)],
  ['收费模式', draft.value.chargeMode === 'unit' ? '单价' : fixedLabel.value],
  ...listFields.value.map(([key, label]) => [label, displayField(draft.value, key)]),
])
function partyName(id) { return state.partners.find(row => row.id === id)?.name || '档案不可用' }
function display(value) { return value === '' || value == null ? '未填写' : String(value) }
function displayField(row, key) { return ['transportFee', 'unitPrice', 'startPrice'].includes(key) && row[key] !== '' && row[key] != null ? Number(row[key]).toFixed(2) : display(row[key]) }
function address(value) { return [value.province, value.city === value.province ? '' : value.city, value.district, value.address].filter(Boolean).join(' / ') }
function clearSelection() { selectedIds.value = []; table.value?.clearSelection() }
function query() { applied.value = clone(filters.value); clearSelection() }
function resetQuery() { filters.value = filterDefaults(); query() }
function options(field) { return field.type === 'partner' ? partners.value.map(row => ({ value: row.id, label: row.name })) : field.options.map(value => ({ value, label: value })) }
function cities(point) { return TRANSPORT_QUOTE_REGIONS.find(row => row.value === point.province)?.children || [] }
function districts(point) { return cities(point).find(row => row.value === point.city)?.children || [] }
function changeLocation(point, level) { if (level === 'province') point.city = ''; point.district = '' }
function changeChargeMode() {
  if (!draft.value || readonly.value) return
  if (draft.value.chargeMode === 'fixed') { draft.value.unitPrice = ''; draft.value.unit = '' }
  else if (draft.value.chargeMode === 'unit') draft.value.transportFee = ''
}
function open(nextMode, row) {
  if (busy.value || mode.value || !['create', 'edit', 'detail'].includes(nextMode) || nextMode !== 'detail' && !canEdit.value) return
  draftRows.value = row ? [clone(row)] : Array.from({ length: 10 }, () => createTransportQuoteDraft(kind.value))
  initial.value = JSON.stringify(draftRows.value); activeIndex.value = 0; failure.value = ''; clipboard.value = null; contextIndex.value = null; mode.value = nextMode
}
function addRow() { if (mode.value !== 'create' || busy.value) return; draftRows.value.push(createTransportQuoteDraft(kind.value)); activeIndex.value = draftRows.value.length - 1 }
function deleteRow(index) {
  if (mode.value !== 'create' || busy.value) return
  draftRows.value.splice(index, 1); activeIndex.value = Math.min(activeIndex.value, Math.max(0, draftRows.value.length - 1)); contextIndex.value = null
}
function clearEmptyRows() {
  if (mode.value !== 'create' || busy.value) return
  const empty = JSON.stringify(createTransportQuoteDraft(kind.value))
  draftRows.value = draftRows.value.filter(row => JSON.stringify(row) !== empty)
  activeIndex.value = Math.min(activeIndex.value, Math.max(0, draftRows.value.length - 1)); contextIndex.value = null
}
function copyRow(index) { if (mode.value === 'create') clipboard.value = clone(draftRows.value[index]) }
function pasteRow(index) {
  if (mode.value !== 'create' || !clipboard.value || busy.value) return
  draftRows.value[index] = clone(clipboard.value); activeIndex.value = index; contextIndex.value = null
}
async function allowDiscard() {
  if (busy.value) return false
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('尚未保存的报价将丢弃。', '放弃修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true } catch { return false }
}
async function close(done) { if (!await allowDiscard()) return; mode.value = ''; if (typeof done === 'function') done() }
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
function submit() {
  if (!canEdit.value || !['create', 'edit'].includes(mode.value) || busy.value || !draftRows.value.length || rowErrors.value.length) return
  busy.value = true; failure.value = ''
  try { saveTransportQuotes(kind.value, clone(draftRows.value)); mode.value = ''; resetQuery(); ElMessage.success('已提交成功！') }
  catch (error) { failure.value = error.message; if (Number.isInteger(error.rowIndex)) activeIndex.value = error.rowIndex }
  finally { busy.value = false }
}
async function remove(ids) {
  if (!canEdit.value || busy.value || !ids.length) return
  const targetKind = kind.value, targetRole = groundSession.role, targetIds = [...ids]
  busy.value = true
  try {
    await ElMessageBox.confirm(`确认删除选中的 ${targetIds.length} 条报价？`, '删除报价', { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' })
    if (kind.value !== targetKind || groundSession.role !== targetRole) return
    deleteTransportQuotes(targetKind, targetIds); clearSelection(); ElMessage.success('删除成功')
  } catch (error) { if (error instanceof Error) ElMessage.error(error.message) }
  finally { busy.value = false }
}
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(allowDiscard)
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
watch(kind, () => { mode.value = ''; resetQuery() })
watch(() => groundSession.role, () => { mode.value = ''; clearSelection() })
watch(() => filters.value.vehicleType, () => { filters.value.specialVehicle = '' })
watch(() => state.transportQuotes.map(row => row.id), ids => {
  if (selectedIds.value.some(id => !ids.includes(id))) clearSelection()
  if (['edit', 'detail'].includes(mode.value) && !ids.includes(draft.value?.id)) { mode.value = ''; ElMessage.warning('报价已不存在，请重新选择') }
})
</script>

<template>
  <div class="module-view transport-quotes-view">
    <PageHeader title="客户供应商报价" :description="groundSession.name"><template #actions>
      <el-tooltip content="Excel 模板与重复范围待确认"><span><el-button :icon="Upload" disabled>上传报价</el-button></span></el-tooltip>
      <el-button type="primary" :icon="Plus" :disabled="!canEdit || busy" @click="open('create')">新增报价</el-button>
    </template></PageHeader>
    <el-tabs :model-value="kind" @tab-change="value => router.push({ path: route.path, query: { tab: value } })"><el-tab-pane name="supplier" label="供应商运输报价" /><el-tab-pane name="customer" label="客户收费报价" /></el-tabs>
    <p v-if="!canEdit" class="quote-note">当前角色只读</p>
    <p class="quote-note">调度计价未接入：车型映射与报价生效边界待确认。</p>
    <form class="quote-filters" aria-label="报价筛选" @submit.prevent="query">
      <label>{{ kind === 'supplier' ? '供应商名称' : '报价ID' }}<el-input v-model="filters.keyword" :aria-label="kind === 'supplier' ? '查询供应商名称' : '查询报价ID'" clearable :placeholder="kind === 'supplier' ? '模糊查询' : '精准查询'" /></label>
      <label>{{ partyLabel }}<el-select v-model="filters.partnerId" :aria-label="'筛选' + partyLabel" :disabled="kind === 'supplier'" clearable filterable :placeholder="kind === 'supplier' ? '候选来源待确认' : '全部'"><el-option v-for="party in partners" :key="party.id" :label="party.name" :value="party.id" /></el-select></label>
      <label v-for="point in [{ key: 'pickup', label: '提货点' }, { key: 'delivery', label: '卸货点' }]" :key="point.key">{{ point.label }}<el-cascader v-model="filters[point.key]" :aria-label="'筛选' + point.label" :options="queryRegions" clearable placeholder="全部" /></label>
      <label v-for="field in querySelects" :key="field.key">{{ field.label }}<el-select v-model="filters[field.key]" :aria-label="'筛选' + field.label" :disabled="field.disabled" clearable :placeholder="field.disabled && field.pending ? field.pending : '全部'"><el-option v-for="value in field.options" :key="value" :value="value" :disabled="value === '待生效'" :label="value === '待生效' ? '待生效（判定待确认）' : value" /></el-select></label>
      <label>收费模式<el-select v-model="filters.chargeMode" aria-label="筛选收费模式" clearable placeholder="全部"><el-option value="fixed" :label="fixedLabel" /><el-option value="unit" label="单价" /></el-select></label>
      <div class="filter-actions"><el-button type="primary" :icon="Search" native-type="submit">查询</el-button><el-button :icon="Refresh" @click="resetQuery">重置</el-button></div>
    </form>
    <DataTableFrame :key="kind + JSON.stringify(applied)" :rows="rows" :selected-count="selectedIds.length" selectable>
      <template #actions><el-button :icon="Delete" type="danger" plain :disabled="!canEdit || busy || !selectedIds.length" @click="remove(selectedIds)">批量删除</el-button></template>
      <template #default="{ rows: pageRows }"><el-table ref="table" :data="pageRows" row-key="id" aria-label="运输报价列表" @selection-change="values => selectedIds = values.map(row => row.id)">
        <el-table-column type="selection" width="46" reserve-selection />
        <el-table-column label="报价ID" width="200" fixed="left"><template #default="{ row }"><el-button link type="primary" @click="open('detail', row)">{{ row.id }}</el-button></template></el-table-column>
        <el-table-column :label="partyLabel" width="200"><template #default="{ row }">{{ partyName(row.partnerId) }}</template></el-table-column>
        <el-table-column v-for="point in [{ key: 'pickup', label: '提货点' }, { key: 'delivery', label: '卸货点' }]" :key="point.key" :label="point.label" width="260"><template #default="{ row }">{{ address(row[point.key]) }}</template></el-table-column>
        <el-table-column v-for="[key, label] in listFields" :key="key" :label="label" :width="['remark', 'updatedAt'].includes(key) ? 190 : 140"><template #default="{ row }">{{ displayField(row, key) }}</template></el-table-column>
        <el-table-column label="状态" width="135"><template #default="{ row }"><StatusTag :label="getTransportQuoteStatus(row)" /></template></el-table-column>
        <el-table-column label="操作" fixed="right" width="165"><template #default="{ row }"><el-button link type="primary" :aria-label="'查看' + row.id" @click="open('detail', row)">查看</el-button><el-button link type="primary" :aria-label="'修改' + row.id" :disabled="!canEdit || busy" @click="open('edit', row)">修改</el-button><el-button link type="danger" :aria-label="'删除' + row.id" :disabled="!canEdit || busy" @click="remove([row.id])">删除</el-button></template></el-table-column>
      </el-table></template>
    </DataTableFrame>
    <el-dialog :model-value="!!mode" :title="(readonly ? '查看' : mode === 'create' ? '新增' : '修改') + (kind === 'supplier' ? '供应商报价' : '客户报价')" :width="readonly ? 'min(860px, 96vw)' : 'min(1180px, 96vw)'" align-center :close-on-click-modal="false" :before-close="close" destroy-on-close>
      <el-alert v-if="failure" :title="failure" type="error" :closable="false" />
      <div v-if="mode" class="quote-editor" :class="{ 'with-rows': mode === 'create' }">
        <aside v-if="mode === 'create'" class="draft-rail">
          <div class="draft-toolbar"><strong>{{ draftRows.length }} 条报价</strong><el-tooltip content="新增行"><el-button :icon="Plus" aria-label="新增行" @click="addRow" /></el-tooltip></div>
          <div class="draft-row-list"><div v-for="(row, index) in draftRows" :key="index" class="draft-row" :class="{ active: activeIndex === index }" @contextmenu.prevent="contextIndex = index">
            <button class="draft-select" :aria-label="'编辑第' + (index + 1) + '行'" @click="activeIndex = index; contextIndex = null"><strong>第 {{ index + 1 }} 行</strong><span>{{ row.partnerId ? partyName(row.partnerId) : '未填写' }}</span><small>{{ rowErrors.some(item => item.index === index) ? '待完善' : '已填写' }}</small></button>
            <div class="draft-row-tools"><el-tooltip content="复制行"><el-button :icon="CopyDocument" :aria-label="'复制第' + (index + 1) + '行'" @click="copyRow(index)" /></el-tooltip><el-tooltip content="粘贴行"><el-button :icon="DocumentCopy" :disabled="!clipboard" :aria-label="'粘贴到第' + (index + 1) + '行'" @click="pasteRow(index)" /></el-tooltip><el-tooltip content="删除行"><el-button :icon="Delete" :aria-label="'删除第' + (index + 1) + '行'" @click="deleteRow(index)" /></el-tooltip></div>
            <div v-if="contextIndex === index" class="draft-context" role="menu"><el-button role="menuitem" :icon="DocumentCopy" :disabled="!clipboard" @click="pasteRow(index)">粘贴</el-button><el-button role="menuitem" @click="contextIndex = null">关闭</el-button></div>
          </div></div>
          <el-button :icon="Delete" class="empty-rows-command" @click="clearEmptyRows">删除空行</el-button>
        </aside>
        <div class="quote-form-body">
          <el-empty v-if="!draft" description="暂无报价行"><el-button :icon="Plus" @click="addRow">新增行</el-button></el-empty>
          <el-descriptions v-else-if="readonly" :column="1" border><el-descriptions-item v-for="[label, value] in detailFields" :key="label" :label="label" :label-width="150">{{ display(value) }}</el-descriptions-item></el-descriptions>
          <el-form v-else label-position="top" :disabled="readonly" @submit.prevent="submit">
            <section class="quote-section"><h3>合作方与车辆</h3><div class="quote-grid">
              <el-form-item v-for="field in fields" :key="field.key" :label="field.label" :required="field.required" :error="errors[field.key]">
                <el-select v-if="field.options || field.type === 'partner'" v-model="draft[field.key]" :aria-label="field.label" filterable clearable :disabled="mode === 'edit' && field.locked"><el-option v-for="option in options(field)" :key="option.value" :value="option.value" :label="option.label" /></el-select>
                <el-input v-else v-model="draft[field.key]" :aria-label="field.label" inputmode="decimal" :readonly="mode === 'edit' && field.locked" />
              </el-form-item>
            </div></section>
            <section v-for="point in [{ key: 'pickup', label: '提货点' }, { key: 'delivery', label: '卸货点' }]" :key="point.key" class="quote-section"><h3>{{ point.label }}</h3><div class="quote-grid">
              <el-form-item label="省" required :error="errors[point.key + '.province']"><el-select v-model="draft[point.key].province" :aria-label="point.label + '省'" clearable @change="changeLocation(draft[point.key], 'province')"><el-option v-for="province in TRANSPORT_QUOTE_REGIONS" :key="province.value" :value="province.value" /></el-select></el-form-item>
              <el-form-item label="市" required :error="errors[point.key + '.city']"><el-select v-model="draft[point.key].city" :aria-label="point.label + '市'" clearable @change="changeLocation(draft[point.key], 'city')"><el-option v-for="city in cities(draft[point.key])" :key="city.value" :value="city.value" /></el-select></el-form-item>
              <el-form-item label="区" :error="errors[point.key + '.district']"><el-select v-model="draft[point.key].district" :aria-label="point.label + '区'" clearable><el-option v-for="district in districts(draft[point.key])" :key="district.value" :value="district.value" /></el-select></el-form-item>
            </div><el-form-item label="详细地点" :error="errors[point.key + '.address']"><el-input v-model="draft[point.key].address" :aria-label="point.label + '详细地点'" /></el-form-item></section>
            <section class="quote-section"><h3>报价信息</h3>
              <el-form-item label="收费模式" required :error="errors.chargeMode"><el-radio-group v-model="draft.chargeMode" aria-label="收费模式" @change="changeChargeMode"><el-radio-button value="fixed">{{ fixedLabel }}</el-radio-button><el-radio-button value="unit">单价</el-radio-button></el-radio-group></el-form-item>
              <div class="quote-grid"><el-form-item v-for="field in priceFields" :key="field.key" :label="field.label" :required="field.required" :error="errors[field.key]"><el-input v-model="draft[field.key]" :aria-label="field.label" :inputmode="field.text ? 'text' : 'decimal'" /></el-form-item>
                <el-form-item label="起始日期" required :error="errors.startDate"><el-date-picker v-model="draft.startDate" aria-label="起始日期" value-format="YYYY-MM-DD" /></el-form-item>
                <el-form-item label="有效期" required :error="errors.endDate"><el-date-picker v-model="draft.endDate" aria-label="有效期" value-format="YYYY-MM-DD" /></el-form-item>
              </div>
              <el-alert v-if="draft.startDate && draft.endDate && getTransportQuoteStatus(draft) === '口径待确认'" title="此日期区间的报价状态待确认" type="info" :closable="false" />
              <el-form-item label="备注" :error="errors.remark"><el-input v-model="draft.remark" aria-label="备注" type="textarea" maxlength="200" :rows="2" show-word-limit /></el-form-item>
            </section>
          </el-form>
        </div>
      </div>
      <template #footer><div class="quote-footer"><span role="status">{{ !readonly && rowErrors.length ? `${rowErrors.length} 行待完善：第 ${rowErrors[0].index + 1} 行，${Object.values(rowErrors[0].fields)[0]}` : '' }}</span><div><el-button :disabled="busy" @click="close">{{ readonly ? '关闭' : '取消' }}</el-button><el-button v-if="!readonly" type="primary" :loading="busy" :disabled="!canEdit || !draftRows.length || !!rowErrors.length" @click="submit">{{ mode === 'create' ? '提交' : '保存' }}</el-button></div></div></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.transport-quotes-view { min-width: 0; }
.quote-note { color: var(--muted); font-size: 13px; }
.quote-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin: 16px 0; }
.quote-filters > label { width: 178px; display: flex; flex-direction: column; gap: 8px; color: var(--muted); }
.quote-filters .el-cascader { width: 100%; }
.filter-actions { display: flex; }
.quote-editor { min-width: 0; }
.quote-editor.with-rows { display: grid; grid-template-columns: 206px minmax(0, 1fr); gap: 20px; }
.draft-rail { border-right: 1px solid var(--line); padding-right: 14px; min-width: 0; display: flex; flex-direction: column; max-height: 63vh; }
.draft-toolbar { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; }
.draft-row-list { overflow: auto; flex: 1; }
.draft-row { border-bottom: 1px solid var(--line); position: relative; padding: 8px; }
.draft-row.active { background: #edf5ff; }
.draft-select { display: flex; flex-direction: column; gap: 5px; background: none; border: 0; padding: 0; width: 100%; text-align: left; cursor: pointer; color: var(--text); }
.draft-select > * { max-width: 100%; overflow-wrap: anywhere; }
.draft-select small { color: var(--muted); }
.draft-row-tools { display: flex; gap: 6px; margin-top: 8px; }
.draft-row-tools .el-button { margin: 0; width: 30px; height: 28px; padding: 0; }
.draft-context { position: absolute; right: 4px; bottom: 4px; background: white; border: 1px solid var(--line); padding: 8px; z-index: 2; }
.empty-rows-command { margin-top: 10px; }
.quote-form-body { max-height: 63vh; min-width: 0; overflow: auto; padding: 0 10px 2px 2px; container-type: inline-size; }
.quote-section { border-bottom: 1px solid var(--line); padding: 16px 0 2px; }
.quote-section:first-child { padding-top: 0; }
.quote-section h3 { font-size: 15px; margin: 0 0 16px; }
.quote-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 16px; }
.quote-grid > * { min-width: 0; }
.quote-grid :deep(.el-select), .quote-grid :deep(.el-date-editor.el-input) { width: 100%; }
.quote-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.quote-footer > span { color: var(--danger); text-align: left; font-size: 12px; overflow-wrap: anywhere; }
.quote-footer > div { flex: none; }
@container (max-width: 560px) { .quote-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .quote-filters > label { width: 100%; } .quote-editor.with-rows { grid-template-columns: minmax(0, 1fr); gap: 12px; } .draft-rail { max-height: 155px; border-right: 0; padding: 0; } .draft-row-list { display: flex; gap: 8px; overflow: auto; } .draft-row { min-width: 160px; } .draft-toolbar { padding-bottom: 4px; } .empty-rows-command { position: absolute; right: 65px; margin: 0; } .quote-form-body { max-height: 45vh; } .quote-editor:not(.with-rows) .quote-form-body { max-height: 63vh; } .quote-footer { align-items: end; } }
@media (max-width: 430px) { .quote-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
