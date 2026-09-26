<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  COORDINATION_SERVICES, COORDINATION_SERVICE_NOTE, PREALLOCATION_CUSTOMS_STATUSES,
  PREALLOCATION_SEND_STATUSES, buildPreallocationMaterials, collectServiceLogs,
  deriveCoordinationRows, filterCoordinationRows, preallocationPermissions,
} from '../domain/serviceCoordination.js'

const router = useRouter()
const {
  state, orderSession, savePreallocationThreshold, sendPreallocation, cancelPreallocation, terminatePreallocation,
} = usePrototypeData()
const tab = ref('coordination')
const canOperate = computed(() => preallocationPermissions(orderSession.value.role).send)

// ---- 服务协同 ----
const defaults = () => ({ waybillNo: '', orderNo: '', origin: '', destination: '', airline: '', urgent: '', orderStatus: '', departureRange: [], cutoffRange: [], arrivalRange: [], ...Object.fromEntries(COORDINATION_SERVICES.map(service => [`service_${service.key}`, ''])) })
const filters = reactive(defaults())
const applied = ref(defaults())
const expanded = ref(false)
const statusFilter = ref('全部')
const coordinationRows = computed(() => deriveCoordinationRows(state, { thresholdHours: Number(state.preallocationThresholdHours) || 48 }))
const conditionRows = computed(() => filterCoordinationRows(coordinationRows.value, applied.value))
const rows = computed(() => conditionRows.value.filter(row => statusFilter.value === '全部' || row.urgent === statusFilter.value))
const counts = computed(() => ({ 全部: conditionRows.value.length, 紧急: conditionRows.value.filter(row => row.urgent === '紧急').length, 正常: conditionRows.value.filter(row => row.urgent === '正常').length }))
const ports = computed(() => [...new Set(coordinationRows.value.flatMap(row => [row.origin, row.destination]).filter(Boolean))])
const airlines = computed(() => [...new Set(coordinationRows.value.map(row => row.airline).filter(Boolean))])
function query() {
  if (!Object.values(filters).some(value => Array.isArray(value) ? value.length : String(value || '').length)) { ElMessage.warning('请先选择条件'); return }
  applied.value = JSON.parse(JSON.stringify(filters))
}
function resetQuery() { Object.assign(filters, defaults()) }
const columns = computed(() => [
  ['waybillNo', '总运单号'], ['orderNo', '订单号'], ['childNo', '分单号'], ['departureDate', '出港日期'], ['cutoffAt', '截单时间'],
  ['expectedArrival', '预计到货时间'], ['urgent', '紧急状态'], ['origin', '启运港'], ['destination', '目的港'], ['waybillAttribute', '提单属性'],
  ['airline', '航司代码'], ['cargoType', '货物类型'], ['routeType', '航线类型'], ['flight', '头程航班'], ['inboundWeight', '入仓毛重（kg）'],
  ['inboundPieces', '入仓件数'], ['inboundVolume', '入仓体积（m³）'], ['customer', '客户'], ['orderStatus', '订单状态'],
])
function exportCsv() {
  if (!applied.value || !Object.values(applied.value).some(value => Array.isArray(value) ? value.length : String(value || '').length)) { ElMessage.warning('需要录入条件查询后才能导出'); return }
  if (!rows.value.length) { ElMessage.warning('当前查询结果为空，没有可导出的数据'); return }
  const header = [...columns.value.map(([, label]) => label), ...COORDINATION_SERVICES.map(service => service.label)]
  const lines = rows.value.map(row => [...columns.value.map(([key]) => row[key]), ...COORDINATION_SERVICES.map(service => row.services[service.key])])
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = '\ufeff' + [header, ...lines].map(line => line.map(escape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = '服务协同查询结果.csv'; link.click()
  URL.revokeObjectURL(link.href)
}
// ---- 预警设置 ----
const warningVisible = ref(false), warningHours = ref(state.preallocationThresholdHours)
function openWarning() { warningHours.value = state.preallocationThresholdHours; warningVisible.value = true }
function saveWarning() {
  try { savePreallocationThreshold(warningHours.value); warningVisible.value = false; ElMessage.success('预警小时数已保存') } catch (error) { ElMessage.error(error.message) }
}
// ---- 订单查看与操作日志 ----
const detailVisible = ref(false), detailOrder = ref(null)
function openOrder(row) { detailOrder.value = row.order; detailVisible.value = true }
const logsVisible = ref(false), logService = ref(''), logOrder = ref(null)
const logRows = computed(() => logOrder.value ? collectServiceLogs(state, logOrder.value).filter(row => !logService.value || row.serviceName === logService.value) : [])
function openLogs(row) { logOrder.value = row.order; logService.value = ''; logsVisible.value = true }
const logServices = computed(() => [...new Set(logOrder.value ? collectServiceLogs(state, logOrder.value).map(row => row.serviceName) : [])])
function openServicePage(key) {
  const order = detailOrder.value
  if (!order) return
  const target = { pallet: { path: '/fulfillment/station-pallet', query: { order: order.id } }, warehouse: { path: '/fulfillment/warehouse-orders', query: { order: order.id } }, transport: { path: '/fulfillment/ground-waybills', query: { order: order.id } }, waybill: { path: '/fulfillment/air-orders', query: { order: order.id } }, preallocation: null }[key]
  if (target) router.push(target)
}

// ---- 预配发送 ----
const preDefaults = () => ({ waybillNo: '', orderNo: '', serviceNo: '', customer: '', status: '' })
const preFilters = reactive(preDefaults())
const preApplied = ref(preDefaults())
const preRows = computed(() => state.preallocationRecords.filter(record =>
  (!preApplied.value.waybillNo || String(record.waybillNo || '').includes(preApplied.value.waybillNo.trim())) &&
  (!preApplied.value.orderNo || String(record.orderNo || '').includes(preApplied.value.orderNo.trim())) &&
  (!preApplied.value.serviceNo || record.id.includes(preApplied.value.serviceNo.trim())) &&
  (!preApplied.value.customer || record.customer === preApplied.value.customer) &&
  (!preApplied.value.status || record.status === preApplied.value.status)))
function preQuery() { preApplied.value = JSON.parse(JSON.stringify(preFilters)) }
function preReset() { Object.assign(preFilters, preDefaults()) }
const preCustomers = computed(() => [...new Set(state.preallocationRecords.map(row => row.customer).filter(Boolean))])
const sendVisible = ref(false), sendRecordId = ref(''), sendSelected = ref([]), sendStateFilter = ref(''), sendCustomsFilter = ref([])
const sendRecord = computed(() => state.preallocationRecords.find(row => row.id === sendRecordId.value))
const sendRows = computed(() => {
  if (!sendRecord.value) return []
  const rows = [{ key: 'main', type: '主订单', childNo: '不显示', ...sendRecord.value.main }, ...sendRecord.value.houses.map(house => ({ key: house.childNo, type: '子订单', ...house }))]
  return rows.filter(row => (!sendStateFilter.value || row.sendStatus === sendStateFilter.value) && (!sendCustomsFilter.value.length || sendCustomsFilter.value.includes(row.customsStatus)))
})
function openSend(record) { sendRecordId.value = record.id; sendSelected.value = []; sendStateFilter.value = ''; sendCustomsFilter.value = []; sendVisible.value = true }
function submitSend() {
  const houseNos = sendSelected.value.filter(key => key !== 'main')
  const main = sendSelected.value.includes('main')
  if (!main && !houseNos.length) { ElMessage.warning('请至少选择一条待发送记录'); return }
  try { sendPreallocation(sendRecordId.value, { main, houseNos }); ElMessage.success('已按浏览器内本地模拟发送并记录回执'); sendSelected.value = [] } catch (error) { ElMessage.error(error.message) }
}
const materialsVisible = ref(false), materialsRow = ref(null), materialsHouse = ref('')
const materialRows = computed(() => sendRecord.value && materialsRow.value ? buildPreallocationMaterials(state, sendRecord.value, materialsHouse.value || '') : [])
function openMaterials(row) { materialsRow.value = row; materialsHouse.value = row.type === '子订单' ? row.childNo : ''; materialsVisible.value = true }
const receiptVisible = ref(false), receiptRow = ref(null)
function openReceipt(row) { receiptRow.value = row; receiptVisible.value = true }
async function cancelRecord(record) {
  try { await ElMessageBox.confirm('取消不生成该服务商品的应收应付；外部已申报后的撤回规则待确认。', '取消预配服务', { confirmButtonText: '取消服务', cancelButtonText: '返回', type: 'warning' }) } catch { return }
  try { cancelPreallocation(record.id); ElMessage.success('预配服务已取消') } catch (error) { ElMessage.error(error.message) }
}
async function terminateRecord(record) {
  try { await ElMessageBox.confirm('终止应生成应收应付；计费金额与重复结算保护待确认，本原型不写费用。', '终止预配服务', { confirmButtonText: '终止服务', cancelButtonText: '返回', type: 'warning' }) } catch { return }
  try { terminatePreallocation(record.id); ElMessage.success('预配服务已终止（未写费用）') } catch (error) { ElMessage.error(error.message) }
}
</script>

<template>
  <div class="module-view">
    <PageHeader title="服务协同" description="出口订单服务汇总 · 截单预警 · 预配发送">
      <template #actions>
        <el-button @click="openWarning">预警设置（{{ state.preallocationThresholdHours }} 小时）</el-button>
        <el-button @click="exportCsv">按查询导出</el-button>
      </template>
    </PageHeader>
    <el-alert class="coordination-notice" :title="COORDINATION_SERVICE_NOTE" type="info" :closable="false" />
    <el-tabs v-model="tab">
      <el-tab-pane label="服务协同" name="coordination" />
      <el-tab-pane label="预配发送" name="preallocation" />
    </el-tabs>

    <template v-if="tab === 'coordination'">
      <div class="status-nav">
        <el-button v-for="value in ['全部', '紧急', '正常']" :key="value" :type="statusFilter === value ? 'primary' : ''" size="small" @click="statusFilter = value">{{ value }}（{{ counts[value] }}）</el-button>
      </div>
      <form class="coordination-filters" aria-label="服务协同筛选" @submit.prevent="query">
        <label>总运单号<el-input v-model="filters.waybillNo" clearable placeholder="模糊查询" /></label>
        <label>订单号<el-input v-model="filters.orderNo" clearable placeholder="模糊查询" /></label>
        <label>启运港<el-select v-model="filters.origin" clearable filterable placeholder="全部"><el-option v-for="value in ports" :key="value" :value="value" /></el-select></label>
        <label>目的港<el-select v-model="filters.destination" clearable filterable placeholder="全部"><el-option v-for="value in ports" :key="value" :value="value" /></el-select></label>
        <label>航司代码<el-select v-model="filters.airline" clearable placeholder="全部"><el-option v-for="value in airlines" :key="value" :value="value" /></el-select></label>
        <label>出港日期<el-date-picker v-model="filters.departureRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
        <label>紧急状态<el-select v-model="filters.urgent" clearable placeholder="全部"><el-option label="紧急" value="紧急" /><el-option label="正常" value="正常" /></el-select></label>
        <label>订单状态<el-select v-model="filters.orderStatus" clearable placeholder="全部"><el-option v-for="value in ['未提交', '进行中', '已完成']" :key="value" :value="value" /></el-select></label>
        <el-button link type="primary" @click="expanded = !expanded">{{ expanded ? '收起' : '展开' }}</el-button>
        <template v-if="expanded">
          <label>截单时间<el-date-picker v-model="filters.cutoffRange" type="datetimerange" value-format="YYYY-MM-DD HH:mm" start-placeholder="开始" end-placeholder="结束" /></label>
          <label>预计到货时间<el-date-picker v-model="filters.arrivalRange" type="datetimerange" value-format="YYYY-MM-DD HH:mm" start-placeholder="开始" end-placeholder="结束" /></label>
          <label v-for="service in COORDINATION_SERVICES" :key="service.key">{{ service.label }}状态<el-select v-model="filters['service_' + service.key]" clearable placeholder="全部"><el-option v-for="value in ['待服务', '服务中', '已完成', '待出提单', '已出提单', '待确认']" :key="value" :value="value" /></el-select></label>
        </template>
        <el-button type="primary" native-type="submit">查询</el-button>
        <el-button @click="resetQuery">重置</el-button>
      </form>
      <DataTableFrame :rows="rows" :page-size="20" :page-sizes="[20, 50, 100]">
        <template #default="{ rows: pageRows }">
          <el-table :data="pageRows" stripe row-key="id" aria-label="服务协同列表">
            <el-table-column prop="waybillNo" label="总运单号" width="150" fixed="left" />
            <el-table-column label="订单号" width="180"><template #default="{ row }"><button class="link-button" @click="openOrder(row)">{{ row.orderNo }}</button></template></el-table-column>
            <el-table-column v-for="[key, label] in [['customer', '客户'], ['childNo', '分单号'], ['departureDate', '出港日期'], ['cutoffAt', '截单时间'], ['expectedArrival', '预计到货时间']]" :key="key" :prop="key" :label="label" min-width="140" />
            <el-table-column label="紧急状态" width="100"><template #default="{ row }"><span :class="['urgent-text', row.urgent === '紧急' ? 'urgent' : '']">{{ row.urgent }}</span></template></el-table-column>
            <el-table-column prop="orderStatus" label="订单状态" width="105" />
            <el-table-column v-for="service in COORDINATION_SERVICES" :key="service.key" :label="service.label" width="100">
              <template #default="{ row }"><button v-if="row.services[service.key]" class="link-button" @click="openLogs(row)">{{ row.services[service.key] }}</button><span v-else>无服务</span></template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }"><el-button link type="primary" @click="openOrder(row)">查看</el-button><el-button link type="primary" @click="openLogs(row)">操作日志</el-button></template>
            </el-table-column>
          </el-table>
        </template>
      </DataTableFrame>
    </template>

    <template v-else>
      <el-alert class="coordination-notice" title="首次生成预配执行单的时点、未选服务的分单是否展示以及取消后费用规则按待确认分支保留；发送与回执均为浏览器内本地模拟。" type="info" :closable="false" />
      <form class="coordination-filters" aria-label="预配服务筛选" @submit.prevent="preQuery">
        <label>总运单号<el-input v-model="preFilters.waybillNo" clearable /></label>
        <label>订单号<el-input v-model="preFilters.orderNo" clearable /></label>
        <label>服务单号<el-input v-model="preFilters.serviceNo" clearable /></label>
        <label>客户<el-select v-model="preFilters.customer" clearable filterable placeholder="全部"><el-option v-for="value in preCustomers" :key="value" :value="value" /></el-select></label>
        <label>服务单状态<el-select v-model="preFilters.status" clearable placeholder="全部"><el-option v-for="value in ['进行中', '已完成', '已取消', '已终止']" :key="value" :value="value" /></el-select></label>
        <el-button type="primary" native-type="submit">查询</el-button>
        <el-button @click="preReset">重置</el-button>
      </form>
      <DataTableFrame :rows="preRows" :page-size="20" :page-sizes="[20, 50]">
        <template #default="{ rows: pageRows }">
          <el-table :data="pageRows" stripe row-key="id" aria-label="预配服务列表">
            <el-table-column prop="id" label="服务单号" width="170" fixed="left" />
            <el-table-column prop="orderNo" label="订单号" width="185" />
            <el-table-column prop="waybillNo" label="总运单号" width="140" />
            <el-table-column label="分单号" min-width="120"><template #default="{ row }">{{ row.houses.map(house => house.childNo).join('、') || '—' }}</template></el-table-column>
            <el-table-column prop="customer" label="客户" min-width="130" />
            <el-table-column prop="supplier" label="供应商" min-width="170" />
            <el-table-column prop="createdAt" label="建单时间" width="150" />
            <el-table-column prop="mainSendAt" label="主单发送时间" width="150" />
            <el-table-column prop="houseSendAt" label="分单发送时间" width="150" />
            <el-table-column prop="serviceCompletedAt" label="服务完成时间" width="150" />
            <el-table-column label="状态" width="100"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button v-business-write="'serviceCoordination'" v-if="canOperate && row.status === '进行中'" link type="primary" @click="openSend(row)">发送</el-button>
                <el-button v-business-write="'serviceCoordination'" v-if="canOperate && row.status === '进行中'" link type="danger" @click="cancelRecord(row)">取消服务</el-button>
                <el-button v-business-write="'serviceCoordination'" v-if="canOperate && row.status === '进行中'" link type="danger" @click="terminateRecord(row)">终止服务</el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </DataTableFrame>
    </template>

    <el-dialog v-model="warningVisible" title="截单预警设置" width="min(460px, 96vw)" align-center>
      <el-form label-position="top"><el-form-item label="距截单时间预警小时数" required><el-input-number v-model="warningHours" :min="1" :max="168" :step="1" /></el-form-item></el-form>
      <el-alert type="info" :closable="false" title="阈值范围、整点边界、超过截单时间的处理、截单时间修改后的重算及配置作用范围待确认；本原型按 1～168 整数保存。" />
      <template #footer><el-button @click="warningVisible = false">取消</el-button><el-button type="primary" @click="saveWarning">提交</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="订单查看" size="min(900px, 96vw)">
      <template v-if="detailOrder">
        <div class="detail-hero"><div><small>订单号</small><h2>{{ detailOrder.orderNo }}</h2><span>{{ detailOrder.customer }} · {{ detailOrder.origin }} → {{ detailOrder.destination }}</span></div><StatusTag :label="detailOrder.orderStatus" /></div>
        <section class="detail-section"><h3>订单基本信息</h3><dl class="detail-grid">
          <div v-for="[label, value] in [['业务类型', detailOrder.businessType], ['客户', detailOrder.customer], ['业务员', detailOrder.owner || detailOrder.salesperson], ['建单人', detailOrder.creator], ['建单时间', detailOrder.createdAt], ['运输方式/航线', `${detailOrder.origin} → ${detailOrder.destination}`], ['件数', detailOrder.pieces], ['毛重（kg）', detailOrder.grossWeight], ['体积（m³）', detailOrder.volume]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
        </dl></section>
        <section class="detail-section"><h3>货物与总运单信息</h3><dl class="detail-grid">
          <div v-for="[label, value] in [['中文品名', detailOrder.cargoName], ['英文品名', detailOrder.cargoNameEn], ['特殊货物', detailOrder.specialCargo], ['总运单号', detailOrder.waybillNo], ['头程航班', detailOrder.booking?.flight || detailOrder.flight], ['航班日期', detailOrder.booking?.departureDate || detailOrder.departureDate], ['截单时间', detailOrder.booking?.cutoffTime]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
        </dl></section>
        <section class="detail-section"><h3>服务信息</h3><el-table :data="detailOrder.services" size="small" empty-text="无服务记录"><el-table-column prop="name" label="服务" width="130" /><el-table-column prop="id" label="服务单号" width="170" /><el-table-column prop="status" label="服务状态" width="120" /><el-table-column label="跳转" width="110"><template #default="{ row }"><el-button v-if="['打板', 'warehouse', 'pickup', 'booking'].includes(row.type)" link type="primary" @click="openServicePage(row.type === 'booking' ? 'waybill' : row.type)">进入模块</el-button><span v-else>—</span></template></el-table-column></el-table>
          <p class="help">本页不提供总运单信息补录；跳转不扩大当前角色的操作权限。</p>
        </section>
      </template>
    </el-drawer>

    <el-dialog v-model="logsVisible" title="服务操作日志" width="min(860px, 96vw)" align-center>
      <el-form label-position="top"><el-form-item label="服务名称筛选"><el-select v-model="logService" clearable placeholder="全部服务"><el-option v-for="value in logServices" :key="value" :value="value" /></el-select></el-form-item></el-form>
      <el-table :data="logRows" size="small" empty-text="暂无已记录的服务操作"><el-table-column prop="serviceName" label="服务名称" width="120" /><el-table-column prop="event" label="操作名称" width="140" /><el-table-column prop="content" label="操作内容" min-width="240" /><el-table-column prop="actor" label="操作人" width="130" /><el-table-column prop="time" label="操作时间" width="160" /></el-table>
      <template #footer><el-button @click="logsVisible = false">返回</el-button></template>
    </el-dialog>

    <el-dialog v-model="sendVisible" title="预配发送" width="min(1100px, 96vw)" align-center destroy-on-close>
      <template v-if="sendRecord">
        <p>服务单 {{ sendRecord.id }} · {{ sendRecord.orderNo }} · 供应商 {{ sendRecord.supplier }}</p>
        <div class="send-filters">
          <el-select v-model="sendStateFilter" clearable placeholder="发送状态（全部）" style="width:180px"><el-option v-for="value in PREALLOCATION_SEND_STATUSES" :key="value" :value="value" /></el-select>
          <el-select v-model="sendCustomsFilter" multiple collapse-tags placeholder="海关状态（全部）" style="width:280px"><el-option v-for="value in PREALLOCATION_CUSTOMS_STATUSES" :key="value" :value="value" /></el-select>
          <el-button @click="sendStateFilter = ''; sendCustomsFilter = []">重置</el-button>
        </div>
        <el-table :data="sendRows" size="small" row-key="key" @selection-change="items => sendSelected = items.map(item => item.key)">
          <el-table-column type="selection" width="46" :selectable="row => ['待发送', '发送失败'].includes(row.sendStatus)" />
          <el-table-column prop="type" label="主/子订单" width="90" />
          <el-table-column prop="childNo" label="分单号" width="90" />
          <el-table-column prop="weight" label="重量（kg）" width="110" />
          <el-table-column prop="pieces" label="件数" width="90" />
          <el-table-column prop="sendStatus" label="发送状态" width="110" />
          <el-table-column prop="customsStatus" label="海关状态" width="130" />
          <el-table-column label="操作" width="230"><template #default="{ row }"><el-button link type="primary" @click="openMaterials(row)">查看</el-button><el-button link type="primary" :disabled="row.sendStatus !== '待发送'" @click="openMaterials(row)">编辑</el-button><el-button link type="primary" :disabled="!row.receipt" @click="openReceipt(row)">查看回执</el-button></template></el-table-column>
        </el-table>
        <p class="help">重量与件数取当前主单或分单的毛重和件数；与优先入仓、缺失时询问预计数据的预配规则存在来源差异，待确认。</p>
      </template>
      <template #footer><el-button @click="sendVisible = false">关闭</el-button><el-button v-business-write="'serviceCoordination'" :disabled="!canOperate || !sendSelected.length" type="primary" @click="submitSend">发送</el-button></template>
    </el-dialog>

    <el-dialog v-model="materialsVisible" :title="materialsRow?.type === '子订单' ? `预配申报资料 · 分单 ${materialsRow.childNo}` : '预配申报资料 · 主单'" width="min(760px, 96vw)" align-center>
      <el-table :data="materialRows" size="small" border><el-table-column label="申报资料" width="220"><template #default="{ row }">{{ row[0] }}</template></el-table-column><el-table-column label="值"><template #default="{ row }">{{ row[1] }}</template></el-table-column></el-table>
      <el-alert type="info" :closable="false" title="托运地国家、卸货地、舱单传输人及危险品字段按来源默认或留空；字段编辑与保存后的再次发送规则待确认，本页只读。" />
      <template #footer><el-button @click="materialsVisible = false">返回</el-button></template>
    </el-dialog>

    <el-dialog v-model="receiptVisible" title="预配回执" width="min(640px, 96vw)" align-center>
      <el-table v-if="receiptRow?.receipt" :data="[receiptRow.receipt]" size="small" border>
        <el-table-column prop="function" label="报文功能" width="120" /><el-table-column prop="statusCode" label="回执状态码" width="120" /><el-table-column prop="content" label="回执内容" min-width="200" /><el-table-column prop="receiptAt" label="回执时间" width="160" /><el-table-column prop="receivedAt" label="接收时间" width="160" />
      </el-table>
      <el-empty v-else description="该记录尚无回执" />
      <template #footer><el-button @click="receiptVisible = false">返回</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.coordination-notice { margin-bottom:14px; }
.status-nav { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.coordination-filters { display:flex; flex-wrap:wrap; align-items:end; gap:12px; margin-bottom:16px; }
.coordination-filters label { display:flex; flex-direction:column; gap:8px; width:185px; color:var(--muted); }
.coordination-filters :deep(.el-date-editor) { width:100%; }
.urgent-text { font-size:13px; }
.urgent-text.urgent { color:#c45656; font-weight:600; }
.detail-hero { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.detail-hero h2 { margin:4px 0; }
.detail-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr)); gap:8px 18px; margin:0; }
.detail-grid dt { color:var(--muted); font-size:12px; }
.detail-grid dd { margin:2px 0 10px; }
.help { font-size:12px; color:var(--muted); line-height:1.7; }
.send-filters { display:flex; gap:10px; margin-bottom:12px; }
</style>
