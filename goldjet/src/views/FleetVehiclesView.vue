<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import FleetCertificateField from '../components/FleetCertificateField.vue'
import FleetRecordTable from '../components/FleetRecordTable.vue'
import { canViewFleetRecords, fleetRecordRows } from '../domain/fleetRecords.js'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { driverExpiryState } from '../domain/fleetOperations.js'
import { VEHICLE_FIELDS, VEHICLE_MODELS, VEHICLE_FILTER_TYPES, canMaintainFleet, createVehicleDraft, vehicleDraft, validateVehicleDraft, filterVehicles, vehicleDrivers, vehicleTasks, vehicleStatus, vehicleExpiryLabel } from '../domain/fleetVehicles.js'

const { state, groundSession, saveVehicle } = usePrototypeData(), router = useRouter()
const canEdit = computed(() => canMaintainFleet(groundSession.role))
const defaults = () => ({ keyword: '', model: '', regulated: '', registrationDate: '', inspectionDate: '' })
const filters = reactive(defaults()), applied = reactive(defaults()), precision = reactive({ registrationDate: 'date', inspectionDate: 'date' })
const rows = computed(() => filterVehicles(state, applied)), queryKey = ref(0)
const form = reactive(createVehicleDraft()), editor = ref(false), editingId = ref(''), initial = ref(''), uploading = ref(false), busy = ref(false), touched = reactive({})
const errors = computed(() => validateVehicleDraft(form, state, editingId.value))
const dirty = computed(() => editor.value && JSON.stringify(form) !== initial.value)
const detail = ref(false), selectedId = ref(''), taskTab = ref('running')
const selected = computed(() => state.fleetVehicles.find(vehicle => vehicle.id === selectedId.value))
const drivers = computed(() => vehicleDrivers(selected.value, state)), tasks = computed(() => vehicleTasks(selected.value, state))
const sections = [{ key: 'basic', label: '基础信息' }, { key: 'insurance', label: '投保信息' }]
const listFields = VEHICLE_FIELDS.filter(field => ['model', 'dimensions', 'payload', 'regulated', 'registrationDate', 'age', 'mileage'].includes(field.key))
const detailTabs = [{ key: 'running', label: '执行中的任务' }, { key: 'history', label: '历史任务' }, { key: 'incidents', label: '违章事故记录' }, { key: 'repairs', label: '维修记录' }, { key: 'fuel', label: '油耗记录' }]
function query() { Object.assign(applied, filters); queryKey.value++ }
function resetQuery() { Object.assign(filters, defaults()); query() }
function fields(section) { return VEHICLE_FIELDS.filter(field => (field.section || 'basic') === section && !(editingId.value && field.key === 'condition')) }
function display(value) { return value === '' || value == null ? '未填写' : value }
function errorFor(key) { return touched[key] || form[key] ? errors.value[key] || '' : '' }
function openForm(vehicle) {
  if (!canEdit.value) return
  editingId.value = vehicle?.id || ''
  Object.assign(form, vehicleDraft(vehicle, state))
  for (const key of Object.keys(touched)) delete touched[key]
  initial.value = JSON.stringify(form); editor.value = true
}
function openDetail(vehicle) { selectedId.value = vehicle.id; taskTab.value = 'running'; detail.value = true }
async function allowDiscard() {
  if (uploading.value || busy.value) { ElMessage.warning('图片读取中，请稍后再试'); return false }
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('尚未保存的车辆资料将丢弃。', '放弃修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true } catch { return false }
}
async function closeEditor(done) { if (await allowDiscard()) { editor.value = false; if (typeof done === 'function') done() } }
function submit() {
  if (!canEdit.value || busy.value || uploading.value || Object.keys(errors.value).length) return
  busy.value = true
  try { saveVehicle(form, { id: editingId.value }); editor.value = false; resetQuery(); ElMessage.success('提交成功') } catch (error) { ElMessage.error(error.message) } finally { busy.value = false }
}
function beforeUnload(event) { if (dirty.value || uploading.value) { event.preventDefault(); event.returnValue = '' } }
onBeforeRouteLeave(allowDiscard); onBeforeRouteUpdate(allowDiscard)
onMounted(() => window.addEventListener('beforeunload', beforeUnload)); onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
watch(() => groundSession.role, () => { editor.value = false; detail.value = false })
watch(selected, vehicle => { if (!vehicle) detail.value = false })
</script>
<template>
  <div class="module-view vehicle-view">
    <PageHeader title="车辆管理" :description="`航晟物流 · ${groundSession.name}`"><template #actions><el-button type="primary" :icon="Plus" :disabled="!canEdit" @click="openForm()">新增车辆</el-button></template></PageHeader>
    <form class="vehicle-filters" aria-label="车辆筛选" @submit.prevent="query">
      <label>车牌号或分配司机<el-input v-model="filters.keyword" aria-label="车牌号或分配司机" clearable /></label>
      <label>车型<el-select v-model="filters.model" aria-label="筛选车型" clearable placeholder="全部"><el-option v-for="value in VEHICLE_MODELS" :key="value" :value="value" /></el-select></label>
      <label>车辆类型<el-tooltip content="筛选使用厢式、录入使用厢型，名称映射待确认"><el-select aria-label="筛选车辆类型" disabled placeholder="名称映射待确认"><el-option v-for="value in VEHICLE_FILTER_TYPES" :key="value" :value="value" /></el-select></el-tooltip></label>
      <label>监管类型<el-select v-model="filters.regulated" aria-label="筛选监管类型" clearable placeholder="全部"><el-option value="是" /><el-option value="否" /></el-select></label>
      <label v-for="[key, label] in [['registrationDate', '登记日期'], ['inspectionDate', '预计年审时间']]" :key="key" class="date-filter">{{ label }}<div><el-select v-model="precision[key]" :aria-label="label+'精度'" @change="filters[key] = ''"><el-option label="年" value="year" /><el-option label="月" value="month" /><el-option label="日" value="date" /></el-select><el-date-picker :key="precision[key]" v-model="filters[key]" :type="precision[key]" :aria-label="'筛选'+label" :value-format="precision[key] === 'year' ? 'YYYY' : precision[key] === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'" clearable /></div></label>
      <div><el-button native-type="submit" type="primary" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="resetQuery">重置</el-button></div>
    </form>
    <DataTableFrame :key="queryKey" :rows="rows"><template #default="{ rows: pageRows }"><el-table :data="pageRows" row-key="id" aria-label="车辆列表" :row-class-name="({ row }) => driverExpiryState(row.inspectionDate) ? 'expiry-row' : ''">
      <el-table-column prop="plate" label="车牌号" width="145" fixed="left" />
      <el-table-column v-for="field in listFields" :key="field.key" :label="field.label" :min-width="field.key === 'dimensions' ? 180 : 130"><template #default="{ row }">{{ display(row[field.key]) }}</template></el-table-column>
      <el-table-column label="车辆状态" width="100"><template #default="{ row }"><StatusTag :label="vehicleStatus(row, state)" /></template></el-table-column>
      <el-table-column label="司机" width="180"><template #default="{ row }">{{ vehicleDrivers(row, state).map(driver => driver.name).join('、') || '未分配' }}</template></el-table-column>
      <el-table-column label="预计年审时间" width="225"><template #default="{ row }">{{ vehicleExpiryLabel(row.inspectionDate) }}</template></el-table-column>
      <el-table-column label="当前位置" width="140"><template #default>定位来源待确认</template></el-table-column>
      <el-table-column label="操作" width="135" fixed="right"><template #default="{ row }"><el-button link type="primary" :aria-label="`查看${row.plate}`" @click="openDetail(row)">查看</el-button><el-button link type="primary" :disabled="!canEdit" :aria-label="`修改${row.plate}`" @click="openForm(row)">修改</el-button></template></el-table-column>
    </el-table></template></DataTableFrame>
    <el-dialog :model-value="editor" :title="editingId ? '修改车辆' : '新增车辆'" width="min(900px, 95vw)" align-center :close-on-click-modal="false" :before-close="closeEditor" destroy-on-close>
      <el-form label-position="top" class="vehicle-form" @submit.prevent="submit">
        <section v-for="section in sections" :key="section.key"><h3>{{ section.label }}</h3><div class="vehicle-grid">
          <el-form-item v-for="field in fields(section.key)" :key="field.key" :label="field.label" :required="field.required" :error="errorFor(field.key)">
            <el-select v-if="field.options" v-model="form[field.key]" :aria-label="field.label" clearable><el-option v-for="value in field.options" :key="value" :value="value" /></el-select>
            <el-date-picker v-else-if="field.type === 'date'" v-model="form[field.key]" :aria-label="field.label" value-format="YYYY-MM-DD" @blur="touched[field.key] = true" />
            <el-input v-else v-model="form[field.key]" :aria-label="field.label" :inputmode="field.numeric ? 'decimal' : 'text'" :maxlength="field.max" :placeholder="field.placeholder" @blur="touched[field.key] = true" />
            <small v-if="field.note" class="field-note">{{ field.note }}</small>
          </el-form-item>
          <template v-if="section.key === 'basic'">
            <el-form-item label="分配司机" :error="errorFor('driverIds')"><el-select v-model="form.driverIds" aria-label="分配司机" multiple filterable clearable><el-option v-for="driver in state.fleetDrivers.filter(row => row.status !== '已离职')" :key="driver.id" :value="driver.id" :label="driver.name" /></el-select></el-form-item>
            <el-form-item label="行驶证" :error="errorFor('registrationImage')"><FleetCertificateField v-model="form.registrationImage" label="行驶证" @busy="uploading = $event" /></el-form-item>
          </template>
        </div></section>
        <el-form-item label="备注"><el-input v-model="form.remark" aria-label="备注" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><div class="vehicle-footer"><span role="status">{{ uploading ? '正在读取图片' : Object.values(errors)[0] || '' }}</span><div><el-button :disabled="busy || uploading" @click="closeEditor">取消</el-button><el-button type="primary" :loading="busy" :disabled="!canEdit || uploading || Object.keys(errors).length > 0" @click="submit">提交</el-button></div></div></template>
    </el-dialog>
    <el-drawer v-model="detail" title="车辆详情" size="min(1040px, 95vw)">
      <template v-if="selected">
        <div class="detail-hero"><h2>{{ selected.plate }}</h2><StatusTag :label="vehicleStatus(selected, state)" /></div>
        <section v-for="section in sections" :key="section.key" class="detail-section"><h3>{{ section.label }}</h3><dl class="detail-grid"><div v-for="field in VEHICLE_FIELDS.filter(field => (field.section || 'basic') === section.key)" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ field.key === 'inspectionDate' ? vehicleExpiryLabel(selected[field.key]) : display(selected[field.key]) }}</dd></div></dl></section>
        <section class="detail-section"><h3>司机与证件</h3><p>{{ drivers.map(driver => driver.name + ' · ' + driver.phone).join('；') || '未分配司机' }}</p><FleetCertificateField :model-value="selected.registrationImage" label="行驶证" readonly /><p>备注：{{ display(selected.remark) }}</p></section>
        <section class="detail-section"><el-tabs v-model="taskTab"><el-tab-pane v-for="tab in detailTabs" :key="tab.key" :label="tab.label" :name="tab.key" /></el-tabs>
          <DataTableFrame v-if="['running', 'history'].includes(taskTab)" :key="taskTab" :rows="tasks[taskTab]" :page-size="5" :page-sizes="[5]"><template #default="{ rows: pageRows }"><el-table :data="pageRows" aria-label="车辆任务">
            <el-table-column label="运单号" min-width="190"><template #default="{ row }"><el-button link type="primary" @click="router.push({ path: '/fulfillment/ground-waybills', query: { waybill: row.id } })">{{ row.waybillNo }}</el-button></template></el-table-column>
            <el-table-column label="关联订单" min-width="190"><template #default="{ row }"><el-button link type="primary" @click="router.push({ path: '/fulfillment/ground-dispatch', query: { order: row.orderId || row.orderNo, action: 'detail' } })">{{ row.orderNo }}</el-button></template></el-table-column>
            <el-table-column label="司机" width="160"><template #default="{ row }">{{ row.drivers.map(driver => driver.name).join('、') }}</template></el-table-column>
            <el-table-column label="联系方式" width="160"><template #default="{ row }">{{ row.drivers.map(driver => driver.phone).join('、') }}</template></el-table-column>
            <el-table-column prop="status" label="运单状态" width="110" /><el-table-column label="任务下派时间" width="180"><template #default="{ row }">{{ row.createdAt?.length === 16 ? row.createdAt + ':00' : row.createdAt || '未记录' }}</template></el-table-column>
            <el-table-column v-if="taskTab === 'history'" label="运单完成时间" width="180"><template #default="{ row }">{{ row.completedAt || '未记录' }}</template></el-table-column>
            <el-table-column v-if="taskTab === 'history'" label="运单应收" width="140"><template #default>口径待确认</template></el-table-column>
          </el-table></template></DataTableFrame>
          <el-empty v-else-if="!canViewFleetRecords(groundSession.role, taskTab)" description="仅航晟主管可查询该台账" />
          <el-empty v-else-if="taskTab === 'fuel'" description="月度油耗汇总口径待确认（150），尚未生成报表" />
          <FleetRecordTable v-else :key="taskTab" :kind="taskTab" :rows="fleetRecordRows(taskTab, state, { vehicleId: selected.id })" :page-size="5" />
        </section>
      </template>
      <template #footer><el-button @click="detail = false">返回</el-button></template>
    </el-drawer>
  </div>
</template>
<style scoped>
.vehicle-view { min-width:0; }
.vehicle-filters { display:flex; flex-wrap:wrap; gap:12px; align-items:end; margin:16px 0; }
.vehicle-filters > label { display:flex; flex-direction:column; gap:8px; width:175px; color:var(--muted); }
.vehicle-filters > .date-filter { width:285px; }
.date-filter > div { display:flex; gap:6px; }
.date-filter .el-select { width:70px; flex:none; }
.date-filter :deep(.el-date-editor) { width:100%; min-width:0; }
.vehicle-form { max-height:65vh; overflow:auto; padding:0 10px 0 2px; }
.vehicle-form section { padding:12px 0 0; border-bottom:1px solid var(--border); margin-bottom:16px; }
h3 { font-size:15px; margin:0 0 16px; } h2 { font-size:22px; }
.vehicle-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 20px; }
.vehicle-grid :deep(.el-date-editor), .vehicle-grid .el-select { width:100%; }
.field-note { display:block; color:var(--muted); font-size:12px; line-height:1.5; margin-top:4px; }
.vehicle-footer { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.vehicle-footer > span { color:var(--danger); font-size:12px; text-align:left; }
.vehicle-footer > div { flex:none; }
.detail-section { margin-top:24px; } .detail-section p, dd { overflow-wrap:anywhere; }
:deep(.expiry-row) { --el-table-tr-bg-color:#fff7df; }
@media (max-width:720px) { .vehicle-filters > label, .vehicle-filters > .date-filter { width:100%; } .vehicle-grid { grid-template-columns:1fr; } .vehicle-footer { align-items:flex-end; } }
</style>
