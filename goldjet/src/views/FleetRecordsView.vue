<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search, Delete, Document } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import FleetRecordTable from '../components/FleetRecordTable.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { AIR_PICKUP_REGIONS } from '../domain/airOperations.js'
import { GROUND_NOW } from '../domain/groundOperations.js'
import { FLEET_RECORD_KINDS, FLEET_RECORD_FIELDS, REPAIR_UNITS, canViewFleetRecords, createFleetRecordDraft, fleetRecordDraft, fleetRecordRows, fleetRecordCell, validateFleetRecord, newRepairItem, repairAmounts } from '../domain/fleetRecords.js'

const props = defineProps({ kind: { type: String, required: true } })
const { state, groundSession, saveFleetRecord } = usePrototypeData()
const config = computed(() => FLEET_RECORD_KINDS[props.kind]), fields = computed(() => FLEET_RECORD_FIELDS[props.kind])
const allowed = computed(() => groundSession.readAll || canViewFleetRecords(groundSession.role, props.kind))
const defaults = () => ({ vehicleId: '', driverId: '', date: '', type: '', updatedDate: '', keyword: '' })
const filters = reactive(defaults()), applied = reactive(defaults()), queryKey = ref(0)
const rows = computed(() => allowed.value ? fleetRecordRows(props.kind, state, applied) : [])
const form = reactive(createFleetRecordDraft(props.kind)), editor = ref(false), editingId = ref(''), initial = ref(''), touched = reactive({})
const errors = computed(() => validateFleetRecord(props.kind, form, state)), amounts = computed(() => repairAmounts(form.items))
const dirty = computed(() => editor.value && JSON.stringify(form) !== initial.value)
const detail = ref(false), selectedId = ref(''), report = ref(false), month = ref('2026-08')
const selected = computed(() => state[config.value.stateKey].find(row => row.id === selectedId.value))
function query() { Object.assign(applied, filters); queryKey.value++ }
function resetQuery() { Object.assign(filters, defaults()); query() }
function openEditor(record) {
  if (!allowed.value) return
  editingId.value = record?.id || ''
  for (const key of Object.keys(form)) delete form[key]
  for (const key of Object.keys(touched)) delete touched[key]
  Object.assign(form, fleetRecordDraft(props.kind, record))
  initial.value = JSON.stringify(form); editor.value = true
}
function openDetail(record) { selectedId.value = record.id; detail.value = true }
function showError(key) { return touched[key] || (Array.isArray(form[key]) ? form[key].length : form[key]) ? errors.value[key] || '' : '' }
async function allowDiscard() {
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('尚未保存的台账修改将丢弃。', '放弃修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true } catch { return false }
}
async function closeEditor(done) { if (await allowDiscard()) { editor.value = false; if (typeof done === 'function') done() } }
function submit() {
  if (!allowed.value || Object.keys(errors.value).length || config.value.blocker) return
  try { saveFleetRecord(props.kind, form, { id: editingId.value }); editor.value = false; resetQuery(); ElMessage.success('提交成功') } catch (error) { ElMessage.error(error.message) }
}
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onBeforeRouteLeave(allowDiscard); onBeforeRouteUpdate(allowDiscard)
onMounted(() => window.addEventListener('beforeunload', beforeUnload)); onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
watch(() => groundSession.role, () => { editor.value = false; detail.value = false; report.value = false })
watch(selected, row => { if (!row) detail.value = false })
</script>
<template>
  <div v-if="allowed" class="module-view fleet-records">
    <PageHeader :title="config.label+'管理'" :description="`航晟物流 · ${groundSession.name}`"><template #actions><el-button v-if="kind === 'fuel'" :icon="Document" @click="report = true">油耗月报</el-button><el-button v-business-write="'fleet'" type="primary" :icon="Plus" @click="openEditor()">新增{{ config.label }}</el-button></template></PageHeader>
    <form class="record-filters" :aria-label="config.label+'筛选'" @submit.prevent="query">
      <label>车牌号<el-select v-model="filters.vehicleId" aria-label="筛选车牌号" filterable clearable placeholder="全部"><el-option v-for="vehicle in state.fleetVehicles" :key="vehicle.id" :value="vehicle.id" :label="vehicle.plate" /></el-select></label>
      <template v-if="kind === 'incidents'">
        <label>类型<el-select v-model="filters.type" aria-label="筛选事故类型" clearable placeholder="全部"><el-option value="违章" /><el-option value="事故" /></el-select></label>
        <label>司机<el-select v-model="filters.driverId" aria-label="筛选司机" filterable clearable placeholder="全部"><el-option v-for="driver in state.fleetDrivers" :key="driver.id" :value="driver.id" :label="driver.name" /></el-select></label>
        <label>更新时间<el-date-picker v-model="filters.updatedDate" aria-label="筛选更新时间" value-format="YYYY-MM-DD" /></label>
      </template>
      <label>{{ config.dateLabel }}<el-date-picker v-model="filters.date" :aria-label="'筛选'+config.dateLabel" value-format="YYYY-MM-DD" /></label>
      <label v-if="kind === 'fuel'">油卡卡号或经手人<el-input v-model="filters.keyword" aria-label="油卡卡号或经手人" clearable /></label>
      <div><el-button type="primary" native-type="submit" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="resetQuery">重置</el-button></div>
    </form>
    <FleetRecordTable :key="queryKey" :kind="kind" :rows="rows" actions><template #actions="{ row }"><el-button link type="primary" :aria-label="'查看'+row.id" @click="openDetail(row)">查看</el-button><el-button v-business-write="'fleet'" link type="primary" :aria-label="'修改'+row.id" @click="openEditor(row)">修改</el-button><el-tooltip content="删除权限及关联处理待确认（147）"><span><el-button link type="danger" :aria-label="'删除'+row.id" disabled>删除</el-button></span></el-tooltip></template></FleetRecordTable>
    <el-dialog :model-value="editor" :title="(editingId ? '修改' : '新增')+config.label" width="min(960px, 95vw)" align-center :close-on-click-modal="false" :before-close="closeEditor" destroy-on-close>
      <el-form label-position="top" class="record-form" @submit.prevent="submit">
        <div class="record-grid">
          <el-form-item label="车牌号" required :error="showError('vehicleId')"><el-select v-model="form.vehicleId" aria-label="车牌号" filterable :disabled="kind === 'fuel' && !!editingId"><el-option v-for="vehicle in state.fleetVehicles" :key="vehicle.id" :value="vehicle.id" :label="vehicle.plate" /></el-select></el-form-item>
          <el-form-item :label="config.dateLabel" required :error="showError('date')"><el-date-picker v-model="form.date" :aria-label="config.dateLabel" value-format="YYYY-MM-DD" @blur="touched.date = true" /></el-form-item>
          <template v-if="kind === 'incidents'">
            <el-form-item label="司机" required :error="showError('driverId')"><el-select v-model="form.driverId" aria-label="司机" filterable><el-option v-for="driver in state.fleetDrivers.filter(row => row.status !== '已离职')" :key="driver.id" :value="driver.id" :label="driver.name" /></el-select></el-form-item>
            <el-form-item label="发生地点省市区" required :error="showError('region')"><el-cascader v-model="form.region" aria-label="发生地点省市区" :options="AIR_PICKUP_REGIONS" filterable clearable /></el-form-item>
            <el-form-item label="详细发生地点" required :error="showError('address')"><el-input v-model="form.address" aria-label="详细发生地点" @blur="touched.address = true" /></el-form-item>
          </template>
          <el-form-item v-for="field in fields" :key="field.key" :label="field.label" :required="field.required" :error="showError(field.key)">
            <el-input v-if="field.readonly" model-value="计算口径待确认" :aria-label="field.label" readonly />
            <el-select v-else-if="field.options" v-model="form[field.key]" :aria-label="field.label"><el-option v-for="value in field.options" :key="value" :value="value" /></el-select>
            <el-input v-else v-model="form[field.key]" :aria-label="field.label" :type="field.multiline ? 'textarea' : 'text'" :rows="2" :maxlength="field.max" :inputmode="field.decimal ? 'decimal' : 'text'" @blur="touched[field.key] = true" />
            <small v-if="field.note" class="field-note">{{ field.note }}</small>
          </el-form-item>
        </div>
        <section v-if="kind === 'repairs'" class="repair-section"><div class="section-head"><h3>维修项目及价格清单</h3><el-tooltip content="添加维修科目"><el-button :icon="Plus" aria-label="添加维修科目" @click="form.items.push(newRepairItem())" /></el-tooltip></div>
          <div class="repair-scroll"><el-table :data="form.items" aria-label="维修科目明细">
            <el-table-column label="维修科目" min-width="175"><template #default="{ row, $index }"><el-input v-model="row.subject" :aria-label="'维修科目'+($index+1)" /></template></el-table-column>
            <el-table-column label="数量" width="110"><template #default="{ row, $index }"><el-input v-model="row.quantity" :aria-label="'数量'+($index+1)" inputmode="decimal" /></template></el-table-column>
            <el-table-column label="单位" width="100"><template #default="{ row, $index }"><el-select v-model="row.unit" :aria-label="'单位'+($index+1)"><el-option v-for="unit in REPAIR_UNITS" :key="unit" :value="unit" /></el-select></template></el-table-column>
            <el-table-column label="单价（元）" width="115"><template #default="{ row, $index }"><el-input v-model="row.price" :aria-label="'单价'+($index+1)" inputmode="decimal" /></template></el-table-column>
            <el-table-column label="金额（元）" width="165"><template #default="{ $index }">{{ amounts.amounts[$index] ?? '输入或舍入口径待确认' }}</template></el-table-column>
            <el-table-column label="操作" width="70"><template #default="{ $index }"><el-tooltip content="移除未保存科目"><el-button :icon="Delete" :aria-label="'移除科目'+($index+1)" :disabled="form.items.length === 1" @click="form.items.splice($index, 1)" /></el-tooltip></template></el-table-column>
          </el-table></div><p v-if="errors.items" class="error-text" role="alert">{{ errors.items }}</p><p class="repair-total">维修总额：<strong>{{ amounts.total ?? '输入或舍入口径待确认' }}</strong> 元</p>
        </section>
        <el-form-item label="备注"><el-input v-model="form.remark" aria-label="备注" type="textarea" :rows="2" /></el-form-item>
        <dl class="metadata"><div><dt>更新人</dt><dd>{{ groundSession.name }}</dd></div><div><dt>更新时间</dt><dd>{{ GROUND_NOW }}</dd></div></dl>
      </el-form>
      <template #footer><div class="record-footer"><span role="status">{{ config.blocker || Object.values(errors)[0] || '' }}</span><div><el-button @click="closeEditor">取消</el-button><el-button v-business-write="'fleet'" type="primary" :disabled="!allowed || !!config.blocker || Object.keys(errors).length > 0" @click="submit">提交</el-button></div></div></template>
    </el-dialog>
    <el-drawer v-model="detail" :title="config.label+'详情'" size="min(900px, 95vw)"><template v-if="selected">
      <h2>{{ fleetRecordCell(kind, selected, 'plate', state) }}</h2>
      <dl class="detail-grid"><div><dt>{{ config.dateLabel }}</dt><dd>{{ selected.date }}</dd></div>
        <template v-if="kind === 'incidents'"><div><dt>司机</dt><dd>{{ fleetRecordCell(kind, selected, 'driver', state) }}</dd></div><div><dt>发生地点</dt><dd>{{ fleetRecordCell(kind, selected, 'location', state) }}</dd></div></template>
        <div v-for="field in fields" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ fleetRecordCell(kind, selected, field.key, state) }}</dd></div>
        <div><dt>备注</dt><dd>{{ selected.remark || '未填写' }}</dd></div><div><dt>更新人</dt><dd>{{ selected.updatedBy }}</dd></div><div><dt>更新日期</dt><dd>{{ selected.updatedAt }}</dd></div>
      </dl>
      <section v-if="kind === 'repairs'" class="repair-section"><h3>维修项目及价格清单</h3><ul class="repair-detail"><li v-for="(item, index) in selected.items" :key="index">{{ item.subject }}：{{ item.quantity }} {{ item.unit }} × {{ item.price }} = {{ repairAmounts(selected.items).amounts[index] ?? '舍入口径待确认' }} 元</li></ul><p>维修总额：{{ repairAmounts(selected.items).total ?? '舍入口径待确认' }} 元</p></section>
    </template><template #footer><el-button @click="detail = false">返回</el-button></template></el-drawer>
    <el-drawer v-model="report" title="油耗月报" size="min(850px, 95vw)"><label class="month-filter">月份<el-date-picker v-model="month" type="month" aria-label="月报月份" value-format="YYYY-MM" /></label><el-alert title="月度汇总公式、耗油量归属及迟到更正规则待确认（150），尚未生成报表" type="warning" :closable="false" /><el-table :data="[]" empty-text="月度汇总待确认"><el-table-column label="车牌号" min-width="150" /><el-table-column label="月份" min-width="120" /><el-table-column label="行驶里程（KM）" min-width="150" /><el-table-column label="耗油量（L）" min-width="130" /><el-table-column label="百公里油耗（L）" min-width="160" /></el-table><template #footer><el-button @click="report = false">返回</el-button></template></el-drawer>
  </div>
  <el-empty v-else description="仅航晟主管可查询、维护该台账" />
</template>
<style scoped>
.fleet-records { min-width:0; }
.record-filters { display:flex; flex-wrap:wrap; gap:12px; align-items:end; margin:16px 0; }
.record-filters label { display:flex; flex-direction:column; gap:8px; width:190px; color:var(--muted); }
.record-filters :deep(.el-date-editor) { width:100%; }
.record-form { max-height:65vh; overflow:auto; padding:0 10px 0 2px; }
.record-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 20px; }
.record-grid :deep(.el-date-editor), .record-grid :deep(.el-select), .record-grid :deep(.el-cascader) { width:100%; }
.repair-section { margin:20px 0; padding-block:16px; border-block:1px solid var(--border); }
.section-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
h3 { font-size:15px; margin:0; } h2 { font-size:20px; } dd, .repair-detail { overflow-wrap:anywhere; }
.repair-scroll { overflow-x:auto; } .repair-scroll .el-table { min-width:735px; }
.repair-total { text-align:right; }.error-text { color:var(--danger); font-size:12px; }
.metadata { display:flex; flex-wrap:wrap; gap:24px; margin:16px 0 0; color:var(--muted); font-size:12px; }
.metadata dd { margin:6px 0; }.field-note { color:var(--muted); font-size:12px; line-height:1.5; }
.record-footer { display:flex; justify-content:space-between; gap:12px; align-items:center; }
.record-footer > span { color:var(--warning); font-size:12px; text-align:left; line-height:1.6; }.record-footer > div { flex:none; }
.month-filter { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-bottom:18px; }
@media (max-width:720px) { .record-filters label { width:100%; } .record-grid { grid-template-columns:1fr; } .record-footer { flex-direction:column; align-items:stretch; } .record-footer > div { text-align:right; } }
</style>
