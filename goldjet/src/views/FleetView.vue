<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import FleetCertificateField from '../components/FleetCertificateField.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { DRIVER_ATTACHMENT_FIELDS, DRIVER_EMPLOYMENT_TYPES, DRIVER_EMPLOYMENT_FILTERS, DRIVER_LICENSE_CLASSES, DRIVER_STATUSES, createDriverDraft, deriveDriverTaskSummary, normalizeDriver, validateDriverDraft, filterDrivers, driverExpiryState } from '../domain/fleetOperations.js'

const router = useRouter()
const { state, groundSession, saveDriver } = usePrototypeData()
const canEdit = computed(() => ['supervisor', 'admin'].includes(groundSession.role))
const defaults = () => ({ keyword: '', status: '', licenseClass: '', employmentType: '' })
const filters = reactive(defaults()), applied = reactive(defaults())
const dialogVisible = ref(false), detailVisible = ref(false), editingId = ref(''), selectedId = ref('')
const selected = computed(() => state.fleetDrivers.find(row => row.id === selectedId.value))
const form = reactive(createDriverDraft()), initial = ref(''), busy = ref(false), uploads = reactive({}), touched = reactive({})
const taskTab = ref('running')
const rows = computed(() => filterDrivers(state.fleetDrivers, applied))
const errors = computed(() => validateDriverDraft(form, state.fleetDrivers, { existingId: editingId.value }))
const uploading = computed(() => Object.values(uploads).some(Boolean))
const dirty = computed(() => dialogVisible.value && JSON.stringify(form) !== initial.value)
const summary = computed(() => deriveDriverTaskSummary(selected.value, state))
const taskRows = computed(() => taskTab.value === 'history' ? summary.value.history : summary.value.running)
const certificates = DRIVER_ATTACHMENT_FIELDS
const details = [['gender', '性别'], ['identityNo', '身份证/驾驶证号码'], ['licenseClasses', '准驾车型'], ['licenseExpiry', '驾驶证期限'], ['qualificationNo', '从业资格号'], ['employmentType', '从业类别'], ['qualificationExpiry', '资质证有效日期'], ['joinDate', '入职日期'], ['drivingScore', '当前驾驶分数'], ['updatedAt', '更新时间'], ['updatedBy', '更新人'], ['remark', '备注']]
const statistics = ['当年累计任务执行', '本月任务执行', '本周任务执行', '当年累计运单应收']
function query() { Object.assign(applied, filters) }
function resetQuery() { Object.assign(filters, defaults()); query() }
function openForm(driver = null) {
  if (!canEdit.value) return
  editingId.value = driver?.id || ''
  for (const key of Object.keys(form)) delete form[key]
  for (const key of Object.keys(touched)) delete touched[key]
  Object.assign(form, normalizeDriver(driver || createDriverDraft()))
  initial.value = JSON.stringify(form)
  dialogVisible.value = true
}
function openDetail(driver) { selectedId.value = driver.id; taskTab.value = 'running'; detailVisible.value = true }
async function allowDiscard() {
  if (busy.value || uploading.value) { ElMessage.warning('图片读取中，请稍后再试'); return false }
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm('尚未保存的司机资料和证件修改将丢弃。', '放弃修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' })
    return true
  } catch { return false }
}
async function closeForm(done) {
  if (!await allowDiscard()) return
  dialogVisible.value = false
  if (typeof done === 'function') done()
}
function submit() {
  if (!canEdit.value || busy.value || uploading.value || Object.keys(errors.value).length) return
  busy.value = true
  try {
    const saved = saveDriver(form, { id: editingId.value })
    selectedId.value = saved.id
    dialogVisible.value = false
    resetQuery()
    ElMessage.success('提交成功')
  } catch (error) { ElMessage.error(error.message) }
  finally { busy.value = false }
}
function display(value) { return Array.isArray(value) ? value.join('、') || '未填写' : value === '' || value == null ? '未填写' : String(value) }
function showError(field) { const hasValue = Array.isArray(form[field]) ? form[field].length > 0 : Boolean(form[field]); return touched[field] || hasValue ? errors.value[field] || '' : '' }
function expiryText(value) { const status = driverExpiryState(value); return status ? `${display(value)} · ${status === 'expired' ? '已到期' : '即将到期'}` : display(value) }
function rowClass({ row }) { return driverExpiryState(row.licenseExpiry) || driverExpiryState(row.qualificationExpiry) ? 'certificate-warning-row' : '' }
function openTask(row) { router.push({ path: '/fulfillment/ground-waybills', query: { waybill: row.id } }) }
function openOrder(row) { router.push({ path: '/fulfillment/ground-dispatch', query: { order: row.orderId || row.orderNo, action: 'detail' } }) }
function beforeUnload(event) { if (dirty.value || uploading.value) { event.preventDefault(); event.returnValue = '' } }
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(allowDiscard)
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
watch(() => groundSession.role, () => { dialogVisible.value = false })
watch(selected, row => { if (!row) detailVisible.value = false })
</script>

<template>
  <div class="module-view fleet-view">
    <PageHeader title="司机管理" :description="`航晟物流 · ${groundSession.name}`"><template #actions><el-button type="primary" :icon="Plus" :disabled="!canEdit" @click="openForm()">新增司机</el-button></template></PageHeader>
    <p v-if="!canEdit" class="permission-note">当前角色只读；客服维护权限待确认。</p>
    <form class="fleet-filters" aria-label="司机筛选" @submit.prevent="query">
      <label>姓名或手机号<el-input v-model="filters.keyword" aria-label="姓名或手机号" clearable placeholder="精准查询" /></label>
      <label>状态<el-select v-model="filters.status" aria-label="筛选状态" clearable placeholder="全部"><el-option v-for="value in DRIVER_STATUSES" :key="value" :value="value" /></el-select></label>
      <label>准驾车型<el-select v-model="filters.licenseClass" aria-label="筛选准驾车型" clearable placeholder="全部"><el-option v-for="value in DRIVER_LICENSE_CLASSES" :key="value" :value="value" /></el-select></label>
      <label>从业类型<el-select v-model="filters.employmentType" aria-label="筛选从业类型" clearable placeholder="全部"><el-option v-for="value in DRIVER_EMPLOYMENT_FILTERS" :key="value" :value="value" /></el-select></label>
      <div class="filter-actions"><el-button native-type="submit" :icon="Search" type="primary">查询</el-button><el-button :icon="Refresh" @click="resetQuery">重置</el-button></div>
    </form>
    <DataTableFrame :rows="rows" :page-size="10"><template #default="{ rows: pageRows }">
      <el-table :data="pageRows" :row-class-name="rowClass" row-key="id" aria-label="司机列表">
        <el-table-column prop="name" label="姓名" width="130" fixed="left" /><el-table-column prop="gender" label="性别" width="65" />
        <el-table-column prop="identityNo" label="身份证/驾驶证号码" width="190" />
        <el-table-column label="车辆" width="135"><template #default="{ row }">{{ row.vehicle || '未分配' }}</template></el-table-column>
        <el-table-column prop="phone" label="联系方式" width="140" />
        <el-table-column label="状态" width="90"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
        <el-table-column v-for="label in statistics" :key="label" :label="label" width="158"><template #default><span class="pending-value">口径待确认</span></template></el-table-column>
        <el-table-column label="准驾车型" width="125"><template #default="{ row }">{{ display(row.licenseClasses) }}</template></el-table-column>
        <el-table-column label="驾驶证期限" width="220"><template #default="{ row }">{{ expiryText(row.licenseExpiry) }}</template></el-table-column>
        <el-table-column label="从业资格证号" width="150"><template #default="{ row }">{{ display(row.qualificationNo) }}</template></el-table-column>
        <el-table-column label="从业类别" width="120"><template #default="{ row }">{{ display(row.employmentType) }}</template></el-table-column>
        <el-table-column label="资格证有效期" width="220"><template #default="{ row }">{{ expiryText(row.qualificationExpiry) }}</template></el-table-column>
        <el-table-column label="操作" width="135" fixed="right"><template #default="{ row }"><el-button link type="primary" :aria-label="`查看${row.name}`" @click="openDetail(row)">查看</el-button><el-button link type="primary" :disabled="!canEdit" :aria-label="`修改${row.name}`" @click="openForm(row)">修改</el-button></template></el-table-column>
      </el-table>
    </template></DataTableFrame>
    <el-dialog :model-value="dialogVisible" :title="editingId ? '修改司机' : '新增司机'" width="min(860px, 95vw)" align-center :close-on-click-modal="false" :before-close="closeForm" destroy-on-close>
      <el-form label-position="top" class="fleet-form" @submit.prevent="submit">
        <section class="form-section"><h3>个人信息</h3><div class="form-grid">
          <el-form-item label="姓名" required :error="showError('name')"><el-input v-model="form.name" aria-label="姓名" maxlength="50" @blur="touched.name = true" /></el-form-item>
          <el-form-item label="性别" required :error="showError('gender')"><el-select v-model="form.gender" aria-label="性别"><el-option value="男" /><el-option value="女" /></el-select></el-form-item>
          <el-form-item label="身份证/驾驶证号码" required :error="showError('identityNo')"><el-input v-model="form.identityNo" aria-label="身份证/驾驶证号码" maxlength="18" @blur="touched.identityNo = true" /></el-form-item>
          <el-form-item label="联系方式" required :error="showError('phone')"><el-input v-model="form.phone" aria-label="联系方式" maxlength="11" @blur="touched.phone = true" /></el-form-item>
        </div></section>
        <section class="form-section"><h3>证件图片</h3><div class="form-grid">
          <el-form-item v-for="field in certificates" :key="field.key" :label="field.label" :required="field.required" :error="showError(field.key)"><FleetCertificateField v-model="form[field.key]" :label="field.label" @update:model-value="touched[field.key] = true" @busy="uploads[field.key] = $event" /></el-form-item>
        </div></section>
        <section class="form-section"><h3>资质信息</h3><div class="form-grid">
          <el-form-item label="准驾车型" required :error="showError('licenseClasses')"><el-select v-model="form.licenseClasses" aria-label="准驾车型" multiple><el-option v-for="value in DRIVER_LICENSE_CLASSES" :key="value" :value="value" /></el-select></el-form-item>
          <el-form-item label="驾驶证期限" required :error="showError('licenseExpiry')"><el-date-picker v-model="form.licenseExpiry" aria-label="驾驶证期限" value-format="YYYY-MM-DD" @blur="touched.licenseExpiry = true" /></el-form-item>
          <el-form-item label="从业资格号" :error="showError('qualificationNo')"><el-input v-model="form.qualificationNo" aria-label="从业资格号" maxlength="20" /></el-form-item>
          <el-form-item label="从业类别" :error="showError('employmentType')"><el-select v-model="form.employmentType" aria-label="从业类别" clearable><el-option v-for="value in DRIVER_EMPLOYMENT_TYPES" :key="value" :value="value" /></el-select></el-form-item>
          <el-form-item label="资质证有效日期" :error="showError('qualificationExpiry')"><el-date-picker v-model="form.qualificationExpiry" aria-label="资质证有效日期" value-format="YYYY-MM-DD" @blur="touched.qualificationExpiry = true" /><small class="field-note">未填写时能否提交待确认</small></el-form-item>
        </div></section>
        <section class="form-section"><h3>其他信息</h3><div class="form-grid">
          <el-form-item label="入职日期" required :error="showError('joinDate')"><el-date-picker v-model="form.joinDate" aria-label="入职日期" value-format="YYYY-MM-DD" @blur="touched.joinDate = true" /></el-form-item>
          <el-form-item label="当前分配车辆"><el-input :model-value="form.vehicle" aria-label="当前分配车辆" disabled placeholder="未分配" /><small class="field-note">车辆档案候选未接入，暂不可修改</small></el-form-item>
          <el-form-item label="当前驾驶分数" :error="showError('drivingScore')"><el-input v-model="form.drivingScore" aria-label="当前驾驶分数" inputmode="numeric" maxlength="20" /></el-form-item>
          <el-form-item v-if="editingId" label="司机状态"><el-select v-model="form.status" aria-label="司机状态"><el-option v-for="value in DRIVER_STATUSES" :key="value" :value="value" /></el-select></el-form-item>
        </div><el-form-item label="备注"><el-input v-model="form.remark" aria-label="备注" type="textarea" :rows="2" /></el-form-item></section>
      </el-form>
      <template #footer><div class="fleet-footer"><span role="status">{{ uploading ? '正在读取图片' : Object.values(errors)[0] || '' }}</span><div><el-button :disabled="busy || uploading" @click="closeForm">取消</el-button><el-button type="primary" :loading="busy" :disabled="!canEdit || uploading || Object.keys(errors).length > 0" @click="submit">提交</el-button></div></div></template>
    </el-dialog>
    <el-drawer v-model="detailVisible" title="司机详情" size="min(1040px, 95vw)">
      <template v-if="selected">
        <div class="detail-hero"><div><h2>{{ selected.name }}</h2><span>{{ selected.phone }} · {{ selected.vehicle || '未分配车辆' }}</span></div><StatusTag :label="selected.status" /></div>
        <dl class="detail-grid detail-section"><div v-for="[key, label] in details" :key="key"><dt>{{ label }}</dt><dd>{{ ['licenseExpiry', 'qualificationExpiry'].includes(key) ? expiryText(selected[key]) : display(selected[key]) }}</dd></div></dl>
        <section class="detail-section"><h3>证件图片</h3><div class="form-grid"><div v-for="field in certificates" :key="field.key" class="detail-certificate"><h4>{{ field.label }}</h4><FleetCertificateField :model-value="selected[field.key]" :label="field.label" readonly /></div></div></section>
        <section class="detail-section"><h3>业绩统计</h3><p class="field-note">{{ summary.statisticsReason }}</p><dl class="fleet-statistics"><div v-for="label in statistics" :key="label"><dt>{{ label }}</dt><dd>口径待确认</dd></div></dl></section>
        <section class="detail-section">
          <el-tabs v-model="taskTab"><el-tab-pane label="执行中的任务" name="running" /><el-tab-pane label="历史任务" name="history" /><el-tab-pane label="违章事故记录（未覆盖）" name="violations" disabled /></el-tabs>
          <DataTableFrame :key="taskTab" :rows="taskRows" :page-size="5" :page-sizes="[5]"><template #default="{ rows: pageRows }"><el-table :data="pageRows" :aria-label="taskTab === 'history' ? '历史任务' : '执行中的任务'" empty-text="暂无符合条件的任务">
            <el-table-column label="运单号" min-width="180"><template #default="{ row }"><el-button link type="primary" @click="openTask(row)">{{ row.waybillNo }}</el-button></template></el-table-column>
            <el-table-column label="关联订单" min-width="180"><template #default="{ row }"><el-button link type="primary" @click="openOrder(row)">{{ row.orderNo }}</el-button></template></el-table-column>
            <el-table-column prop="plate" label="车牌号" width="135" /><el-table-column prop="status" label="运单状态" width="110" />
            <el-table-column label="任务下派时间" width="180"><template #default="{ row }">{{ row.createdAt?.length === 16 ? row.createdAt + ':00' : row.createdAt || '未记录' }}</template></el-table-column>
            <el-table-column v-if="taskTab === 'history'" label="运单完成时间" width="180"><template #default="{ row }">{{ row.completedAt || '未记录' }}</template></el-table-column>
            <el-table-column v-if="taskTab === 'history'" label="运单应收" width="120"><template #default="{ row }">{{ row.receivable == null ? '未接入' : Number(row.receivable).toFixed(2) }}</template></el-table-column>
          </el-table></template></DataTableFrame>
        </section>
      </template>
    </el-drawer>
  </div>
</template>
<style scoped>
.fleet-view { min-width:0; }
.fleet-filters { display:flex; flex-wrap:wrap; align-items:end; gap:12px; margin:16px 0; }
.fleet-filters label { display:flex; flex-direction:column; gap:8px; width:172px; color:var(--muted); }
.fleet-filters label:first-child { width:210px; }
.filter-actions { display:flex; }
.fleet-form { max-height:65vh; overflow:auto; padding:0 10px 0 2px; container-type:inline-size; }
.form-section { padding:16px 0 4px; border-bottom:1px solid var(--line); }
.form-section:first-child { padding-top:0; }
.form-section h3, .detail-section h3 { margin:0 0 14px; font-size:15px; }
.form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 20px; }
.form-grid :deep(.el-select), .form-grid :deep(.el-date-editor.el-input) { width:100%; }
.field-note { display:block; width:100%; margin:6px 0 0; font-size:12px; color:var(--muted); line-height:1.6; }
.permission-note, .pending-value { color:var(--muted); font-size:13px; }
.fleet-footer { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.fleet-footer > span { font-size:12px; color:var(--danger); text-align:left; }
.fleet-footer > div { flex:none; }
.detail-section { margin-top:24px; }
.detail-hero h2 { font-size:22px; }
.detail-certificate { padding-bottom:18px; }
.detail-certificate h4 { font-size:13px; margin:0 0 8px; color:var(--muted); font-weight:400; }
.fleet-statistics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; padding:16px 0; border-block:1px solid var(--line); }
.fleet-statistics dt { color:var(--muted); font-size:13px; }
.fleet-statistics dd { margin:6px 0 0; font-size:14px; }
:deep(.certificate-warning-row) { --el-table-tr-bg-color:#fff7df; }
@container (max-width:560px) { .form-grid { grid-template-columns:1fr; } }
@media (max-width:720px) { .fleet-filters label, .fleet-filters label:first-child { width:100%; } .form-grid { grid-template-columns:1fr; } .fleet-footer { align-items:flex-end; } }
</style>
