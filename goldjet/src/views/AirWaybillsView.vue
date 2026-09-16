<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import AirWaybillSendDialog from '../components/AirWaybillSendDialog.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { getAirWaybillRows } from '../domain/airWaybills.js'

const router = useRouter()
const { state, airSession, saveAirWaybillNote } = usePrototypeData()
const TABLE = { pageSize: 50, selection: 'cross-page', rowActions: ['edit', 'note'], pagination: true }
const emptyFilters = () => ({ number: '', operator: '', customer: '', departure: [], cutoff: [], status: '' })
const filters = reactive({ ...emptyFilters(), status: '待出提单' }), applied = ref({ ...emptyFilters(), status: '待出提单' })
const selection = ref([]), sendVisible = ref(false), queryVersion = ref(0)
const allowed = computed(() => ['service', 'waybillClerk'].includes(airSession.role))
const allRows = computed(() => getAirWaybillRows(state))
const partners = computed(() => state.partners || [])
const customerOptions = computed(() => [...new Set(allRows.value.map(row => row.customer).filter(Boolean))].map(name => {
  const partner = partners.value.find(row => row.name === name)
  return { name, shortName: partner?.shortName || name }
}))
const includes = (value, query) => !query || String(value || '').toLowerCase().includes(query.trim().toLowerCase())
const inRange = (value, range) => !range?.length || (value && value.slice(0, 10) >= range[0] && value.slice(0, 10) <= range[1])
function cutoff(row) {
  if (row.cutoffAt) return row.cutoffAt
  if (row.cutoffDateTime) return row.cutoffDateTime
  return ''
}
function operator(row) { return row.waybillDocument?.savedBy || row.assignees?.handler || '' }
function customerText(row) { const partner = partners.value.find(item => item.name === row.customer); return `${row.customer || ''} ${partner?.shortName || ''}` }
const rows = computed(() => allRows.value.filter(row => {
  const f = applied.value
  return (includes(row.orderNo, f.number) || includes(row.waybillNo, f.number)) && includes(operator(row), f.operator) && includes(customerText(row), f.customer)
    && inRange(row.departureDate || row.booking?.departureDate, f.departure) && inRange(cutoff(row), f.cutoff) && (!f.status || row.orderStatus === f.status)
}).sort((left, right) => Number(right.orderStatus === '待出提单') - Number(left.orderStatus === '待出提单')))
const selectedCount = computed(() => selection.value.length)
const display = value => value === null || value === undefined || value === '' ? '未取得' : value
function query() { applied.value = JSON.parse(JSON.stringify(filters)); selection.value = []; queryVersion.value += 1 }
function reset() { Object.assign(filters, emptyFilters()); query() }
function key(item) { return `${item.orderId}:${item.childId || ''}` }
function selected(orderId, childId = '') { return selection.value.some(item => key(item) === key({ orderId, childId })) }
function rowTargets(row) { return [{ orderId: row.id, childId: '' }, ...row.children.map(child => ({ orderId: row.id, childId: child.id }))] }
function selectable(row) { return Boolean(row.waybillNo) && allowed.value }
function wholeSelected(row) { return rowTargets(row).every(item => selected(item.orderId, item.childId)) }
function someSelected(row) { return rowTargets(row).some(item => selected(item.orderId, item.childId)) }
function toggle(orderId, childId, value) {
  const item = { orderId, childId: childId || '' }
  selection.value = selection.value.filter(row => key(row) !== key(item))
  if (value) selection.value.push(item)
}
function toggleWhole(row, value) { if (selectable(row)) rowTargets(row).forEach(item => toggle(item.orderId, item.childId, value)) }
function pageSelected(pageRows) { const candidates = pageRows.filter(selectable); return candidates.length > 0 && candidates.every(wholeSelected) }
function togglePage(pageRows, value) { pageRows.forEach(row => toggleWhole(row, value)) }
function selectOnly(row, command) { toggleWhole(row, false); if (command === 'all') toggleWhole(row, true); if (command === 'master') toggle(row.id, '', true) }
function edit(row, childId) { router.push({ path: `/fulfillment/airway-bills/${row.id}`, query: childId ? { child: childId } : {} }) }
const failedChildren = row => row.children.filter(child => child.waybillTransmission?.status === '异常中')
function anomalous(row) { const value = cutoff(row); return row.orderStatus === '待出提单' && value && Date.parse(`${value.replace(' ', 'T')}Z`) > state.airWaybillClockMs }

const noteVisible = ref(false), noteId = ref(''), note = ref(''), originalNote = ref(''), noteFailure = ref(''), noteBusy = ref(false)
const noteOrder = computed(() => state.airOrders.find(row => row.id === noteId.value))
const noteDirty = computed(() => noteVisible.value && note.value !== originalNote.value)
let generation = 0
function openNote(row) { noteId.value = row.id; note.value = row.waybillNote || ''; originalNote.value = note.value; noteFailure.value = ''; noteVisible.value = true }
async function closeNote(done) {
  if (noteBusy.value) return false
  const token = generation
  if (noteDirty.value) {
    try { await ElMessageBox.confirm('放弃尚未保存的提单备注？', '放弃备注修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑' }) }
    catch { return false }
  }
  if (token !== generation) return false
  noteVisible.value = false; if (typeof done === 'function') done(); return true
}
function saveNote() {
  if (noteBusy.value || !allowed.value || note.value.length > 256 || !noteOrder.value) return
  noteBusy.value = true; noteFailure.value = ''
  try { saveAirWaybillNote(noteId.value, note.value); originalNote.value = note.value; noteVisible.value = false; ElMessage.success('提单备注已保存') }
  catch (error) { noteFailure.value = error.message }
  finally { noteBusy.value = false }
}
const downloadVisible = ref(false), downloadIds = ref([]), downloadTypes = ref([]), downloadFeedback = ref('')
const formats = ['提单（有格式）', '中性提单（有格式）', '中性提单（无格式）', '中性提单（TPE）', '中性提单（电池）', 'UPS提单（有格式）', 'UPS提单（无格式）', '舱单', '分单（有格式）', '分单（无格式）', '托运书']
function openDownload() { downloadIds.value = []; downloadTypes.value = []; downloadFeedback.value = ''; downloadVisible.value = true }
function download() { downloadFeedback.value = `已选择 ${downloadIds.value.length} 票、${downloadTypes.value.length} 类格式。提单模板的配置完成、数据映射和输出格式尚待确认，当前不能生成业务文件；可在模板管理下载已上传的原文件。` }
watch(() => [state.airOrders, airSession.role, airSession.name], () => {
  generation += 1; selection.value = []; sendVisible.value = false; noteVisible.value = false; downloadVisible.value = false
}, { flush: 'sync' })
onBeforeRouteLeave(async () => !noteDirty.value || await closeNote())
function beforeUnload(event) { if (noteDirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>

<template>
  <div class="module-view air-waybills-view">
    <PageHeader title="提单管理" description="编辑主分提单，查看发送结果并维护提单备注。"><template #actions><el-button @click="router.push('/fulfillment/airway-bill-templates')">提单模板管理</el-button></template></PageHeader>
    <el-alert v-if="!allowed" title="当前角色只读；空运客服和打单员可维护及发送提单。" type="info" :closable="false" />
    <form class="waybill-filters" aria-label="提单列表查询" @submit.prevent="query">
      <label>工作号 / 提单号<el-input v-model="filters.number" clearable aria-label="工作号或提单号查询" placeholder="模糊查询" /></label>
      <label>操作人员<el-input v-model="filters.operator" clearable aria-label="操作人员查询" placeholder="模糊查询" /></label>
      <label>客户简称<el-select v-model="filters.customer" filterable allow-create clearable default-first-option aria-label="客户简称查询" placeholder="全部，可输入搜索"><el-option v-for="option in customerOptions" :key="option.name" :label="option.shortName" :value="option.name" /></el-select></label>
      <label>出港日期<el-date-picker v-model="filters.departure" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" aria-label="出港日期查询范围" /></label>
      <label>截单时间<el-date-picker v-model="filters.cutoff" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" aria-label="截单时间查询范围" /></label>
      <label>订单状态<el-select v-model="filters.status" clearable aria-label="提单订单状态查询" placeholder="全部"><el-option v-for="value in ['待出提单', '已出提单', '已交单']" :key="value" :value="value" /></el-select></label>
      <div class="query-actions"><el-button native-type="submit" type="primary" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button></div>
    </form>
    <DataTableFrame :key="queryVersion" :rows="rows" :page-size="TABLE.pageSize" :page-sizes="[50]" selectable :selected-count="selectedCount">
      <template #actions><div class="waybill-toolbar"><span>已选 {{ selectedCount }} 份运单，支持跨页</span><el-button v-if="selection.length" link @click="selection = []">清除选择</el-button><el-button :disabled="!selection.length || !allowed" type="primary" @click="sendVisible = true">批量发送运单</el-button><el-button :disabled="!rows.length" @click="openDownload">批量下载提单</el-button></div></template>
      <template #default="{ rows: pageRows }">
        <el-table :data="pageRows" row-key="id" aria-label="提单列表" empty-text="暂无符合条件的提单，可先完成订单补录后再查询。">
          <el-table-column type="expand" width="45"><template #default="{ row }"><div class="waybill-expand">
            <p>{{ row.orderNo }} · 按主单或分单选择发送；已选项在翻页后保留。</p>
            <el-checkbox :model-value="selected(row.id)" :disabled="!selectable(row)" :aria-label="`单独选择主单${row.waybillNo}`" @change="value => toggle(row.id, '', value)">主单 {{ row.waybillNo }}</el-checkbox>
            <el-table v-if="row.children.length" :data="row.children" row-key="id" aria-label="提单分单明细" max-height="270">
              <el-table-column width="50"><template #default="{ row: child }"><el-checkbox :model-value="selected(row.id, child.id)" :disabled="!selectable(row)" :aria-label="`选择分单${child.housebillNo || child.id}`" @change="value => toggle(row.id, child.id, value)" /></template></el-table-column>
              <el-table-column label="分单号" min-width="160"><template #default="{ row: child }"><el-button link type="primary" @click="edit(row, child.id)">{{ child.housebillNo || '分单号未填写' }}</el-button></template></el-table-column>
              <el-table-column label="发送状态" width="110"><template #default="{ row: child }">{{ child.waybillTransmission?.status || '待发送' }}</template></el-table-column>
              <el-table-column label="件数" width="85" align="right"><template #default="{ row: child }">{{ display(child.waybill?.pieces) }}</template></el-table-column>
              <el-table-column label="毛重 kg" width="110" align="right"><template #default="{ row: child }">{{ display(child.waybill?.grossWeight) }}</template></el-table-column>
              <el-table-column label="体积 m³" width="110" align="right"><template #default="{ row: child }">{{ display(child.waybill?.volume) }}</template></el-table-column>
              <el-table-column label="异常信息" min-width="220"><template #default="{ row: child }">{{ child.waybillTransmission?.error || '无异常回执' }}</template></el-table-column>
            </el-table><p v-else class="waybill-muted">该票无分单。</p>
          </div></template></el-table-column>
          <el-table-column width="86"><template #header><el-checkbox :model-value="pageSelected(pageRows)" :indeterminate="!pageSelected(pageRows) && pageRows.some(someSelected)" :disabled="!pageRows.some(selectable)" aria-label="选择本页整票运单" @change="value => togglePage(pageRows, value)" /></template><template #default="{ row }"><div class="waybill-select"><el-checkbox :model-value="wholeSelected(row)" :indeterminate="!wholeSelected(row) && someSelected(row)" :disabled="!selectable(row)" :aria-label="`选择整票${row.waybillNo || row.orderNo}`" @change="value => toggleWhole(row, value)" /><el-dropdown :disabled="!selectable(row)" @command="command => selectOnly(row, command)"><el-button link :disabled="!selectable(row)" :aria-label="`${row.waybillNo}选择范围`">⌄</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="all">主单及全部分单</el-dropdown-item><el-dropdown-item command="master">仅主单</el-dropdown-item><el-dropdown-item command="none">清除该票选择</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div></template></el-table-column>
          <el-table-column label="提单号" min-width="170"><template #default="{ row }"><el-button link type="primary" @click="edit(row)">{{ row.waybillNo || '提单号未绑定' }}</el-button><div><StatusTag :label="row.orderStatus" /></div><span v-if="anomalous(row)" class="waybill-warning">截单异常 · 口径待确认</span></template></el-table-column>
          <el-table-column label="分单号" min-width="175"><template #default="{ row }"><div v-if="row.children.length" class="house-number-list"><el-button v-for="child in row.children" :key="child.id" link type="primary" @click="edit(row, child.id)">{{ child.housebillNo || '分单号未填写' }}</el-button></div><span v-else>无分单</span></template></el-table-column>
          <el-table-column label="主单数据"><el-table-column v-for="field in [{ key: 'grossWeight', label: '重量 kg' }, { key: 'pieces', label: '件数' }, { key: 'volume', label: '体积 m³' }]" :key="field.key" :label="field.label" width="105" align="right"><template #default="{ row }">{{ display(row.mainCargo[field.key]) }}</template></el-table-column></el-table-column>
          <el-table-column label="分单数据合计"><el-table-column v-for="field in [{ key: 'grossWeight', label: '重量 kg' }, { key: 'pieces', label: '件数' }, { key: 'volume', label: '体积 m³' }]" :key="field.key" :label="field.label" width="105" align="right"><template #default="{ row }">{{ row.children.length ? display(row.childCargo[field.key]) : '不适用' }}</template></el-table-column></el-table-column>
          <el-table-column label="主单发送状态" min-width="145"><template #default="{ row }"><span>{{ row.mainSendStatus }}</span><details v-if="row.waybillTransmission?.error"><summary>查看异常</summary><p>{{ row.waybillTransmission.error }}</p></details></template></el-table-column>
          <el-table-column label="分单发送总状态" min-width="185"><template #default="{ row }"><span>{{ row.childSendStatus || (row.children.length ? '混合状态待确认' : '无分单') }}</span><el-popover v-if="failedChildren(row).length" trigger="hover" placement="bottom" :width="310"><template #reference><span class="waybill-failure-label">异常明细</span></template><div class="failure-list"><p v-for="child in failedChildren(row)" :key="child.id">{{ child.housebillNo }} · {{ child.waybillTransmission.status }}<br>{{ child.waybillTransmission.error }}</p></div></el-popover><details v-if="failedChildren(row).length"><summary>展开异常内容</summary><p v-for="child in failedChildren(row)" :key="child.id">{{ child.housebillNo }}：{{ child.waybillTransmission.error }}</p></details></template></el-table-column>
          <el-table-column prop="destination" label="目的港" width="95" /><el-table-column label="头程航班号" min-width="130"><template #default="{ row }">{{ display(row.booking?.flight || row.flight) }}</template></el-table-column><el-table-column label="出港日期" width="125"><template #default="{ row }">{{ display(row.booking?.departureDate || row.departureDate) }}</template></el-table-column>
          <el-table-column prop="creator" label="客服" width="100" /><el-table-column label="航线" min-width="130"><template #default="{ row }">{{ display(row.assignees?.operator) }}</template></el-table-column><el-table-column label="截单时间" min-width="175"><template #default="{ row }">{{ cutoff(row) || (row.booking?.cutoffTime ? `${row.booking.cutoffTime} · 日期未明确` : '未取得') }}</template></el-table-column><el-table-column label="航司 / 同行" min-width="150"><template #default="{ row }">{{ display(row.booking?.airline || row.supplier) }}</template></el-table-column><el-table-column prop="orderNo" label="订单号" min-width="180" />
          <el-table-column label="交单时间" min-width="165"><template #default="{ row }">{{ display(row.documentHandoffAt) }}</template></el-table-column><el-table-column label="交单人" width="110"><template #default="{ row }">{{ display(row.documentHandoffBy) }}</template></el-table-column><el-table-column label="建单日期" min-width="150"><template #default="{ row }">{{ display(row.createdAt || row.createDate) }}</template></el-table-column>
          <el-table-column label="提单备注" min-width="230"><template #default="{ row }"><span class="waybill-note">{{ row.waybillNote || '无备注' }}</span><el-button link type="primary" @click="openNote(row)">{{ allowed ? '修改备注' : '查看备注' }}</el-button></template></el-table-column>
        </el-table>
      </template>
    </DataTableFrame>
    <p class="waybill-muted">毛件体展示提单资料，未取得的数据留空，不以预计数据替代。混合发送状态、截单异常方向及交单回写规则仍待确认。</p>
    <AirWaybillSendDialog v-model="sendVisible" :selection="selection" />
    <el-dialog v-model="noteVisible" title="提单备注" width="min(560px, 94vw)" :before-close="closeNote" :close-on-click-modal="false">
      <p>{{ noteOrder?.waybillNo }} · {{ noteOrder?.orderNo }}</p><el-alert v-if="noteFailure" :title="noteFailure" type="error" :closable="false" />
      <el-form label-position="top" @submit.prevent="saveNote"><el-form-item label="提单备注" :error="note.length > 256 ? '最多256个字符' : ''"><el-input v-model="note" type="textarea" :rows="5" maxlength="256" show-word-limit :readonly="!allowed" aria-label="提单备注" /></el-form-item></el-form>
      <template #footer><el-button :disabled="noteBusy" @click="closeNote">取消</el-button><el-button type="primary" :disabled="!allowed || note.length > 256" :loading="noteBusy" @click="saveNote">保存备注</el-button></template>
    </el-dialog>
    <el-dialog v-model="downloadVisible" title="批量下载提单" width="min(760px, 96vw)" :close-on-click-modal="false">
      <div class="download-content"><p>选择要下载的订单和提单格式，初始均未选择。</p><el-checkbox-group v-model="downloadIds" aria-label="下载订单选择"><el-checkbox v-for="row in rows" :key="row.id" :value="row.id">{{ row.waybillNo || row.orderNo }}</el-checkbox></el-checkbox-group><h3>提单格式</h3><el-checkbox-group v-model="downloadTypes" aria-label="下载提单格式"><el-checkbox v-for="format in formats" :key="format" :value="format">{{ format }}</el-checkbox></el-checkbox-group><el-alert v-if="downloadFeedback" :title="downloadFeedback" type="warning" :closable="false" role="status" /><el-button v-if="downloadFeedback" @click="router.push('/fulfillment/airway-bill-templates')">查看提单模板</el-button></div>
      <template #footer><el-button @click="downloadVisible = false">取消</el-button><el-button type="primary" :disabled="!downloadIds.length || !downloadTypes.length" @click="download">确认下载</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.air-waybills-view { min-width: 0; }
.waybill-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr)); gap: 12px 16px; padding: 16px; margin: 16px 0; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; align-items: end; }
.waybill-filters label { display: grid; min-width: 0; gap: 6px; font-size: 12px; color: var(--muted); }.waybill-filters :deep(.el-select), .waybill-filters :deep(.el-date-editor) { width: 100%; min-width: 0; }
.query-actions, .waybill-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }.query-actions :deep(.el-button), .waybill-toolbar :deep(.el-button) { margin-left: 0; }
.waybill-toolbar > span, .waybill-muted { color: var(--muted); font-size: 12px; line-height: 1.7; }
.waybill-expand { padding: 12px 20px; max-width: 1100px; }.waybill-expand p { margin-top: 0; }.waybill-select { display: flex; align-items: center; gap: 6px; }
.house-number-list { display: flex; flex-direction: column; align-items: flex-start; max-height: 76px; overflow-y: auto; }.house-number-list :deep(.el-button) { margin-left: 0; min-height: 28px; }
.waybill-warning { display: block; color: #b45309; font-size: 12px; margin-top: 5px; }.waybill-note { display: block; white-space: pre-wrap; overflow-wrap: anywhere; }
.waybill-failure-label { display: block; color: #b42318; }
.failure-list { max-height: 220px; overflow-y: auto; }.failure-list p { overflow-wrap: anywhere; }.air-waybills-view details p { overflow-wrap: anywhere; white-space: normal; }.air-waybills-view summary { cursor: pointer; color: var(--primary); }
.download-content { max-height: 62dvh; overflow-y: auto; display: grid; gap: 12px; }.download-content h3 { font-size: 14px; margin: 0; }.download-content :deep(.el-checkbox-group) { display: flex; flex-wrap: wrap; gap: 8px 16px; }.download-content :deep(.el-checkbox) { margin-right: 0; height: auto; white-space: normal; }.download-content :deep(.el-checkbox__label) { white-space: normal; }
</style>
