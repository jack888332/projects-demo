<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import CcImportOrdersPanel from '../components/CcImportOrdersPanel.vue'
import BcExportServicesPanel from '../components/BcExportServicesPanel.vue'
import ManifestConfirmPanel from '../components/ManifestConfirmPanel.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  BC_CLEARANCE_STEPS, BC_IMPORT_CHANNELS, BC_IMPORT_LIST_STATUSES, BC_RETURN_STATUSES,
  BC_VIEW_PASSWORD, bcImportPermissions, createBcReceiptCsv, filterBcImportOrders,
} from '../domain/bcImportOrders.js'

const {
  state, declarationSession, dispatchBcImportOrders, bindBcImportOrders, enterBcImportWaybills,
  declareBcImportOrders, convertBcToCc, unbindBcImportOrders, updateBcClearance,
} = usePrototypeData()
const permission = computed(() => bcImportPermissions(declarationSession.value.role))
const pageTab = ref('bc')
const tabs = [['shipped', '已发货'], ['unshipped', '未发货']]
const tab = ref('shipped')
const defaults = () => ({ orderNo: '', outboundNo: '', waybillNo: '', customer: '', expressNo: '', buyer: '', customerCancelled: '', conversion: '', ecommerceName: '', platformName: '', warehouse: '', orderStatus: '', waybillStatus: '', listStatus: '', cancelListStatus: '', returnStatus: '', returnResult: '', customsZone: '', createdRange: [], pickedUp: '', clearanceStarted: '', clearanceDone: '' })
const filters = reactive(defaults())
const applied = ref({})
const expanded = ref(false)
const rows = computed(() => filterBcImportOrders(state.bcImportOrders.filter(order => order.shipped === (tab.value === 'shipped')), applied.value))
const selectedIds = ref([])
const table = ref()
function query() {
  if (!Object.values(filters).some(value => Array.isArray(value) ? value.length : String(value || '').length)) return
  applied.value = JSON.parse(JSON.stringify(filters))
}
function resetQuery() { Object.assign(filters, defaults()); applied.value = {} }
function clearSelection() { selectedIds.value = []; table.value?.clearSelection() }
function targets() { return selectedIds.value.length ? state.bcImportOrders.filter(order => selectedIds.value.includes(order.id)) : rows.value }
function exportOrders(scope) {
  const list = scope === 'checked' ? state.bcImportOrders.filter(order => selectedIds.value.includes(order.id)) : rows.value
  if (!list.length) { ElMessage.warning(scope === 'checked' ? '请先勾选订单' : '当前查询结果为空'); return }
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const header = ['订单编号', '出库单号', '总运/提单号', '客户名称', '客户取消订单', '转换情况', '托盘号', '电商企业', '电商平台', '仓库', '快递单号', '订单商品总价', '订购人', '订单状态', '运单状态', '清单状态', '撤销清单状态', '退货状态', '退运结果', '关区', '预估税金', '海关税金', '下单时间', '航班到达', '货站提货', '开始清关', '完成清关', '快递交接']
  const lines = list.map(order => [order.orderNo, order.outboundNo, order.waybillNo, order.customer, order.customerCancelled ? '是' : '否', order.conversion, order.palletNo, order.ecommerceName, order.platformName, order.warehouse, order.expressNo, order.amount, order.buyer, order.orderStatus, order.waybillStatus, order.listStatus, order.cancelListStatus, order.returnStatus, order.returnResult, order.customsZone, order.estimatedTax, order.customsTax, order.createdAt, order.logistics.flightArrived, order.logistics.pickedUp, order.logistics.clearanceStarted, order.logistics.clearanceDone, order.logistics.expressHandover])
  const csv = '\ufeff' + [header, ...lines].map(line => line.map(escape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'BC进口订单.csv'; link.click(); URL.revokeObjectURL(link.href)
}
function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href)
}
function downloadReceipts(type, label) {
  if (!targets().length) { ElMessage.warning('请勾选订单或先查询'); return }
  const waybill = targets()[0].waybillNo || '未绑定'
  downloadCsv(`${label}回执-${waybill}-20260908.csv`, createBcReceiptCsv(targets(), type))
  ElMessage.success('已按相同提单号生成回执（原型CSV，正式模板待确认）')
}
// ---- 订单操作 ----
function runConfirm(message, title, action) {
  const list = targets()
  if (!list.length) { ElMessage.warning('请勾选订单或先查询'); return }
  try {
    if (action === 'dispatch') {
      const result = dispatchBcImportOrders(list.map(order => order.id))
      ElMessage.success(`已下发 ${result.dispatched.length} 笔${result.skipped.length ? `；跳过 ${result.skipped.length} 笔` : ''}`)
    } else if (action === 'convert') {
      const result = convertBcToCc(list.map(order => order.id))
      ElMessage.success(`已转为 CC 订单 ${result.converted.length} 笔（转换为作废，预估税金按行邮税号重算待确认）`)
    } else if (action === 'unbind') {
      const result = unbindBcImportOrders(list.map(order => order.id))
      ElMessage.success(`已解绑 ${result.unbound.length} 笔并回到未发货列表`)
    }
    clearSelection()
  } catch (error) { ElMessage.error(error.message) }
}
async function confirmThen(message, title, action) {
  const list = targets()
  if (!list.length) { ElMessage.warning('请勾选订单或先查询'); return }
  try { await ElMessageBox.confirm(`${message}（共 ${list.length} 笔）`, title, { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  runConfirm(message, title, action)
}
const bindVisible = ref(false), bindForm = reactive({ waybillNo: '', outboundNo: '' })
function openBind() { bindForm.waybillNo = targets()[0]?.waybillNo || ''; bindForm.outboundNo = targets()[0]?.outboundNo || ''; bindVisible.value = true }
function submitBind() {
  try {
    const result = bindBcImportOrders(targets().map(order => order.id), { ...bindForm })
    bindVisible.value = false
    ElMessage.success(`已绑定干线 ${result.bound.length} 笔；相同总运单号订单共享干线`)
    clearSelection()
  } catch (error) { ElMessage.error(error.message) }
}
const waybillVisible = ref(false), waybillForm = reactive({ departurePort: 'CAN', expectedDeparture: '2026-09-09', volume: '0.5', grossWeight: '12.5' })
function openWaybillEntry() { waybillVisible.value = true }
function submitWaybillEntry() {
  try {
    const result = enterBcImportWaybills(targets().map(order => order.id), { ...waybillForm })
    waybillVisible.value = false
    ElMessage.success(`已录入提单 ${result.entered.length} 笔，并按通道自动订单申报与运单申报（本地模拟）`)
    clearSelection()
  } catch (error) { ElMessage.error(error.message) }
}
const clearanceVisible = ref(false), clearanceForm = reactive({ pickedUp: '未提货', clearanceStarted: '未开始', clearanceDone: '未完成', clearedAt: '2026-09-08' })
function openClearance() {
  const first = targets()[0]
  if (first) Object.assign(clearanceForm, { pickedUp: first.logistics.pickedUp, clearanceStarted: first.logistics.clearanceStarted, clearanceDone: first.logistics.clearanceDone, clearedAt: first.logistics.clearedAt || '2026-09-08' })
  clearanceVisible.value = true
}
function submitClearance() {
  try {
    const result = updateBcClearance(targets().map(order => order.id), { ...clearanceForm })
    clearanceVisible.value = false
    ElMessage.success(`已补充清关信息 ${result.changed.length} 笔${result.skipped.length ? `；跳过 ${result.skipped.length} 笔` : ''}`)
    clearSelection()
  } catch (error) { ElMessage.error(error.message) }
}
// ---- 申报 ----
const declareVisible = ref(false), declareAction = ref('order'), declareForm = reactive({ channel: BC_IMPORT_CHANNELS[0], reason: '' })
const declareLabels = { order: '订单申报', waybill: '运单申报', list: '清单申报', cancelList: '撤销清单申报', return: '退货申报', deleteOrder: '删除订单申报', deleteWaybill: '删除运单申报', deleteCancel: '删除撤销申报' }
function openDeclare(action) {
  if (!permission.value.declare) { ElMessage.warning('当前角色不能申报'); return }
  if (!targets().length) { ElMessage.warning('请勾选订单或先查询'); return }
  declareAction.value = action
  declareForm.channel = targets().find(order => order.channel)?.channel || BC_IMPORT_CHANNELS[0]
  declareForm.reason = ''
  declareVisible.value = true
}
function submitDeclare() {
  try {
    const result = declareBcImportOrders(targets().map(order => order.id), declareAction.value, { ...declareForm })
    declareVisible.value = false
    ElMessage.success(`已申报 ${result.changed.length} 笔${result.skipped.length ? `；跳过 ${result.skipped.length} 笔：${result.skipped.slice(0, 2).map(row => `${row.orderNo}（${row.reason}）`).join('；')}` : ''}`)
    clearSelection()
  } catch (error) { ElMessage.error(error.message) }
}
const proofVisible = ref(false)
function downloadProof() {
  const lines = [['业务类型', 'BC进口'], ['总运单号', targets()[0]?.waybillNo || ''], ['订单编号', targets().map(order => order.orderNo).join('；')], ['客户名称', targets()[0]?.customer || ''], ['提货日期', '2026-09-08']]
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  downloadCsv('提货证明（原型文本）.csv', '\ufeff' + lines.map(line => line.map(escape).join(',')).join('\r\n'))
  proofVisible.value = false
  ElMessage.success('已下载原型提货证明文本；正式 docx 模板待确认')
}
// ---- 详情 ----
const detailId = ref(''), detailVisible = ref(false), detailTab = ref('info'), revealed = ref(false), sensitiveVisible = ref(false), sensitiveInput = ref('')
const detail = computed(() => state.bcImportOrders.find(order => order.id === detailId.value))
const detailAmount = computed(() => {
  if (!detail.value) return ''
  return (Number(detail.value.amount) + 120 + 20 - 0).toFixed(2)
})
function openDetail(order) { detailId.value = order.id; detailTab.value = 'info'; revealed.value = false; detailVisible.value = true }
function verifySensitive() {
  if (sensitiveInput.value !== BC_VIEW_PASSWORD) { ElMessage.error('查看口令不正确（演示口令）'); return }
  revealed.value = true; sensitiveVisible.value = false
}
watch(() => [declarationSession.value.role, declarationSession.value.name], () => { detailVisible.value = false; bindVisible.value = false; declareVisible.value = false; clearanceVisible.value = false; waybillVisible.value = false })
watch(tab, () => { clearSelection(); Object.assign(filters, defaults()); applied.value = {} })
</script>

<template>
  <div class="module-view">
    <PageHeader title="BC与CC进口关务" description="BC / CC 进口订单 · 申报、服务单与舱单确报">
      <template #actions><template v-if="pageTab === 'bc'">
        <el-dropdown trigger="click" @command="command => { if (command === 'dispatch' || command === 'convert' || command === 'unbind') confirmThen(command === 'dispatch' ? '仅备货待下发且现货有货的订单可下发。' : command === 'convert' ? '仅清单海关退单且商品全部备案的订单可转为 CC，转换后库存不动。' : '仅未开始报关的订单可从总运单解绑。', { dispatch: '下发仓库', convert: '转为CC订单', unbind: '从总运单解绑' }[command], command); else if (command === 'bind') openBind(); else if (command === 'waybillEntry') openWaybillEntry(); else if (command === 'clearance') openClearance() }">
          <el-button v-business-write="'bcImportCustoms'" :disabled="!permission.operate">订单操作<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="dispatch">下发仓库</el-dropdown-item><el-dropdown-item command="bind">绑定干线</el-dropdown-item><el-dropdown-item command="waybillEntry">提单录入</el-dropdown-item>
            <el-dropdown-item command="convert" divided>转为CC订单</el-dropdown-item><el-dropdown-item command="unbind">从总运单解绑</el-dropdown-item><el-dropdown-item command="clearance">补充清关信息</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
        <el-dropdown trigger="click" @command="command => openDeclare(command)">
          <el-button v-business-write="'bcImportCustoms'" :disabled="!permission.declare">申报<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item v-for="(label, key) in declareLabels" :key="key" :command="key" :divided="key === 'deleteOrder'">{{ label }}</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
        <el-dropdown trigger="click" @command="command => { if (command === 'proof') proofVisible = true; else downloadReceipts(command, { order: '订单', waybill: '运单', list: '清单', cancelList: '撤销清单', return: '退货' }[command]) }">
          <el-button>下载<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="proof">下载提货证明（原型文本）</el-dropdown-item>
            <el-dropdown-item command="order" divided>下载订单回执</el-dropdown-item><el-dropdown-item command="waybill">下载运单回执</el-dropdown-item><el-dropdown-item command="list">下载清单回执</el-dropdown-item><el-dropdown-item command="cancelList">下载撤销清单回执</el-dropdown-item><el-dropdown-item command="return">下载退货回执</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
        <el-dropdown trigger="click" @command="exportOrders">
          <el-button>导出<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown><el-dropdown-menu><el-dropdown-item command="checked">按勾选数据导出</el-dropdown-item><el-dropdown-item command="queried">按查询条件导出</el-dropdown-item></el-dropdown-menu></template>
        </el-dropdown>
      </template></template>
    </PageHeader>
    <el-alert class="bci-notice" title="海关报文与回执为浏览器内本地模拟；CC 订单编辑、套件拆价与税费测算、快递派送与进出区登记归后续切片（CUSTOMS-B025/B026/B028 边界保留）。" type="info" :closable="false" />
    <el-tabs v-model="pageTab">
      <el-tab-pane label="BC进口订单" name="bc" />
      <el-tab-pane label="CC进口订单" name="cc" />
      <el-tab-pane label="进口关务服务单" name="services" />
      <el-tab-pane label="舱单与确报" name="manifest" />
    </el-tabs>
    <ManifestConfirmPanel v-if="pageTab === 'manifest'" />
    <BcExportServicesPanel v-else-if="pageTab === 'services'" :business-types="['BC进口']" service-label="BC进口" module-key="bcImportCustoms" />
    <CcImportOrdersPanel v-else-if="pageTab === 'cc'" />
    <template v-else>
    <el-tabs v-model="tab"><el-tab-pane v-for="[value, label] in tabs" :key="value" :label="label" :name="value" /></el-tabs>
    <form class="bci-filters" aria-label="BC进口订单筛选" @submit.prevent="query">
      <label>订单编号<el-input v-model="filters.orderNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>出库单号<el-input v-model="filters.outboundNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>总运/提单号<el-input v-model="filters.waybillNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>客户名称<el-input v-model="filters.customer" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>快递单号<el-input v-model="filters.expressNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <el-button link type="primary" @click="expanded = !expanded">{{ expanded ? '收起' : '展开' }}</el-button>
      <template v-if="expanded">
        <label>订购人<el-input v-model="filters.buyer" type="textarea" :rows="1" placeholder="可换行多个" /></label>
        <label>客户取消订单<el-select v-model="filters.customerCancelled" clearable placeholder="全部"><el-option label="是" value="true" /><el-option label="否" value="false" /></el-select></label>
        <label>转换情况<el-select v-model="filters.conversion" clearable placeholder="全部"><el-option v-for="value in ['无', '作废', 'CC转BC', '报废']" :key="value" :value="value" /></el-select></label>
        <label>电商企业<el-input v-model="filters.ecommerceName" clearable /></label>
        <label>电商平台<el-input v-model="filters.platformName" clearable /></label>
        <label>仓库<el-select v-model="filters.warehouse" clearable placeholder="全部"><el-option v-for="value in ['南沙保税仓 WH002', '广州保税仓 WH001']" :key="value" :value="value" /></el-select></label>
        <label v-for="[key, label] in [['orderStatus', '订单状态'], ['waybillStatus', '运单状态'], ['listStatus', '清单状态'], ['cancelListStatus', '撤销清单状态']]" :key="key">{{ label }}<el-select v-model="filters[key]" clearable placeholder="全部"><el-option v-for="value in BC_IMPORT_LIST_STATUSES" :key="value" :value="value" /></el-select></label>
        <label>退货状态<el-select v-model="filters.returnStatus" clearable placeholder="全部"><el-option v-for="value in BC_RETURN_STATUSES" :key="value" :value="value" /></el-select></label>
        <label>退运结果<el-select v-model="filters.returnResult" clearable placeholder="全部"><el-option label="进行中" value="进行中" /><el-option label="已完成" value="已完成" /></el-select></label>
        <label>关区<el-input v-model="filters.customsZone" clearable /></label>
        <label v-for="[key, label] in BC_CLEARANCE_STEPS.map(([key, label, options]) => [key, label])" :key="key">{{ label }}<el-select v-model="filters[key]" clearable placeholder="全部"><el-option v-for="value in BC_CLEARANCE_STEPS.find(([k]) => k === key)[2]" :key="value" :value="value" /></el-select></label>
        <label>下单时间<el-date-picker v-model="filters.createdRange" type="datetimerange" value-format="YYYY-MM-DD HH:mm:ss" start-placeholder="开始" end-placeholder="结束" /></label>
      </template>
      <el-button type="primary" native-type="submit">查询</el-button>
      <el-button @click="resetQuery">重置</el-button>
    </form>
    <DataTableFrame :rows="rows" :page-size="50" :page-sizes="[20, 50, 100]" selectable :selected-count="selectedIds.length">
      <template #default="{ rows: pageRows }">
        <el-table ref="table" :data="pageRows" stripe row-key="id" aria-label="BC进口订单列表" @selection-change="items => selectedIds = items.map(item => item.id)">
          <el-table-column type="selection" reserve-selection width="46" />
          <el-table-column label="订单编号" width="160" fixed="left"><template #default="{ row }"><button class="link-button" @click="openDetail(row)">{{ row.orderNo }}</button></template></el-table-column>
          <el-table-column prop="outboundNo" label="出库单号" width="130" />
          <el-table-column prop="waybillNo" label="总运/提单号" width="130" />
          <el-table-column prop="customer" label="客户名称" width="130" />
          <el-table-column label="客户取消订单" width="105"><template #default="{ row }">{{ row.customerCancelled ? '是' : '否' }}</template></el-table-column>
          <el-table-column prop="conversion" label="转换情况" width="95" />
          <el-table-column prop="palletNo" label="托盘号" width="110" />
          <el-table-column prop="ecommerceName" label="电商企业" width="120" />
          <el-table-column prop="platformName" label="电商平台" width="90" />
          <el-table-column prop="warehouse" label="仓库" min-width="140" />
          <el-table-column prop="expressNo" label="快递单号" width="130" />
          <el-table-column prop="amount" label="订单商品总价" width="115" />
          <el-table-column prop="buyer" label="订购人" width="100" />
          <el-table-column v-for="[key, label] in [['orderStatus', '订单状态'], ['waybillStatus', '运单状态'], ['listStatus', '清单状态'], ['cancelListStatus', '撤销清单状态'], ['returnStatus', '退货状态']]" :key="key" :label="label" width="115"><template #default="{ row }"><StatusTag :label="row[key]" /></template></el-table-column>
          <el-table-column prop="returnResult" label="退运结果" width="95" />
          <el-table-column prop="customsZone" label="关区" width="120" />
          <el-table-column prop="estimatedTax" label="预估税金" width="95" />
          <el-table-column prop="customsTax" label="海关税金" width="95" />
          <el-table-column prop="createdAt" label="下单时间" width="170" />
          <el-table-column v-for="[key, label] in BC_CLEARANCE_STEPS.map(([key, label]) => [key, label])" :key="key" :label="label" width="100"><template #default="{ row }">{{ row.logistics[key] }}</template></el-table-column>
          <el-table-column label="快递交接" width="95"><template #default="{ row }">{{ row.logistics.expressHandover }}</template></el-table-column>
          <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">详情</el-button></template></el-table-column>
        </el-table>
      </template>
    </DataTableFrame>
    </template>

    <el-dialog v-model="bindVisible" title="绑定干线" width="min(520px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item label="出库单号"><el-input v-model="bindForm.outboundNo" /></el-form-item>
        <el-form-item label="总运单号" required><el-input v-model="bindForm.waybillNo" /></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" title="一个客户订单绑定干线即把相同总运单号的客户订单一起绑定；原型以出库单号分组同步，订舱页跳转由干线服务页承担。" />
      <template #footer><el-button @click="bindVisible = false">取消</el-button><el-button type="primary" @click="submitBind">确定</el-button></template>
    </el-dialog>
    <el-dialog v-model="waybillVisible" title="提单录入（总运单）" width="min(560px, 96vw)" align-center>
      <el-form label-position="top" class="bci-grid">
        <el-form-item label="启运港"><el-input v-model="waybillForm.departurePort" /></el-form-item>
        <el-form-item label="预计出港日期"><el-date-picker v-model="waybillForm.expectedDeparture" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="体积（m³）"><el-input v-model="waybillForm.volume" /></el-form-item>
        <el-form-item label="提单总毛重（kg）"><el-input v-model="waybillForm.grossWeight" /></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" title="按出库单号带出总运单字段（总运单号/港口/预计离港/品名/件数/体积/毛重）；录入提货后自动订单申报与运单申报，默认通道广州电子口岸（本地模拟）。" />
      <template #footer><el-button @click="waybillVisible = false">取消</el-button><el-button type="primary" @click="submitWaybillEntry">录入并自动申报</el-button></template>
    </el-dialog>
    <el-dialog v-model="clearanceVisible" title="补充清关信息" width="min(620px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item v-for="[key, label, options] in BC_CLEARANCE_STEPS" :key="key" :label="label"><el-radio-group v-model="clearanceForm[key]"><el-radio v-for="value in options" :key="value" :label="value">{{ value }}</el-radio></el-radio-group></el-form-item>
        <el-form-item label="到达时间（改状态时默认当前日期）"><el-date-picker v-model="clearanceForm.clearedAt" value-format="YYYY-MM-DD" /></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" title="仅相同提单号可批量；未提货不能改开始清关、未开始清关不能改完成清关；新录入信息覆盖旧数据，客户取消订单自动过滤。" />
      <template #footer><el-button @click="clearanceVisible = false">取消</el-button><el-button type="primary" @click="submitClearance">确定</el-button></template>
    </el-dialog>
    <el-dialog v-model="declareVisible" :title="declareLabels[declareAction]" width="min(520px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item v-if="['order', 'waybill'].includes(declareAction)" label="申报通道" required><el-select v-model="declareForm.channel"><el-option v-for="value in BC_IMPORT_CHANNELS" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item v-if="['cancelList', 'return'].includes(declareAction)" label="原因" required><el-input v-model="declareForm.reason" type="textarea" :rows="3" maxlength="200" show-word-limit /></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" title="申报按相同总运单号整组进行；状态为海关入库时按来源为变更类型。删除申报回执后状态恢复待报关。" />
      <template #footer><el-button @click="declareVisible = false">取消</el-button><el-button type="primary" @click="submitDeclare">确定</el-button></template>
    </el-dialog>
    <el-dialog v-model="proofVisible" title="下载提货证明" width="min(460px, 96vw)" align-center>
      <el-alert type="info" :closable="false" title="来源要求 docx 提货证明模板；原型用文本内容替代正式模板，文件命名与模板待确认。" />
      <template #footer><el-button @click="proofVisible = false">取消</el-button><el-button type="primary" @click="downloadProof">下载原型文本</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="BC进口订单详情" size="min(1020px, 96vw)">
      <template v-if="detail">
        <div class="detail-hero"><div><small>订单编号</small><h2>{{ detail.orderNo }}</h2><span>{{ detail.customer }} · {{ detail.ecommerceName }}</span></div><StatusTag :label="detail.orderStatus" /></div>
        <el-tabs v-model="detailTab">
          <el-tab-pane label="订单信息" name="info">
            <section class="detail-section"><h3>表头</h3><dl class="detail-grid">
              <div v-for="[label, value] in [['订单编号', detail.orderNo], ['出库单号', detail.outboundNo], ['总运/提单号', detail.waybillNo], ['订单商品描述', (detail.goods || []).map(row => row.name).join('、')], ['商品总额', detail.amount], ['运费', 120], ['保费', 20], ['预收税金', 0], ['非现金抵扣', 0], ['实际支付金额', detailAmount], ['收件人', detail.buyer], ['订购人', detail.buyer], ['订单总毛重', (detail.goods || []).reduce((sum, row) => sum + (Number(row.weight) || 0) * (Number(row.quantity) || 0), 0).toFixed(5)], ['订单总净重', (detail.goods || []).reduce((sum, row) => sum + (Number(row.weight) || 0) * (Number(row.quantity) || 0), 0).toFixed(5)], ['收件地址', '广东省广州市演示地址（合成）'], ['快递单号', detail.expressNo], ['担保企业编号', '演示客户已授权保函（合成）'], ['快递代码', 'YT'], ['电商企业名称', detail.ecommerceName], ['预估税金', detail.estimatedTax], ['电商平台名称', detail.platformName], ['海关税金', detail.customsTax || '待税单导入'], ['海关清单号', detail.listStatus === '海关入库' || detail.listStatus === '放行' ? `清单-DEMO-${detail.id.slice(-3)}` : ''], ['customs_id', `SYS-${detail.id}`], ['自编清单号', ''], ['预录入编号', detail.listStatus === '放行' ? 'PRE-DEMO-001' : ''], ['关区代码', '5165'], ['备注', detail.remark || '无']]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
              <div><dt>订购人电话 / 身份证号</dt><dd><template v-if="revealed">000-00000000 / 000000000000000001</template><template v-else><el-button link type="primary" @click="sensitiveVisible = true; sensitiveInput = ''">查看</el-button></template></dd></div>
            </dl></section>
          </el-tab-pane>
          <el-tab-pane label="商品信息" name="goods">
            <el-table :data="detail.goods || []" size="small" empty-text="无商品">
              <el-table-column prop="barcode" label="条码" width="140" />
              <el-table-column prop="productId" label="商品ID" width="130" />
              <el-table-column prop="name" label="商品名称" min-width="150" />
              <el-table-column prop="brand" label="品牌" width="90" />
              <el-table-column prop="spec" label="规格型号" width="120" />
              <el-table-column prop="mailTaxNo" label="行邮税号" width="110" />
              <el-table-column prop="hsCode" label="HS编码" width="110" />
              <el-table-column prop="legalQty1" label="第一法定数量" width="120" />
              <el-table-column prop="legalQty2" label="第二法定数量" width="120" />
              <el-table-column label="单价" width="100"><template #default="{ row }">{{ revealed ? row.unitPrice : '••••' }}</template></el-table-column>
              <el-table-column prop="weight" label="重量" width="90" />
              <el-table-column prop="vat" label="增值税" width="100" />
              <el-table-column prop="consumptionTax" label="消费税" width="100" />
              <el-table-column prop="quantity" label="数量" width="90" />
            </el-table>
            <p class="bci-hint">单价默认隐藏，消费授权口令后显示；行邮税号/HS编码/法定数量按商品备案带入或显示待确认。</p>
          </el-tab-pane>
          <el-tab-pane label="附件资料" name="attachments">
            <el-table :data="detail.attachments || []" size="small" empty-text="暂无附件（CC 进口申报所需，BC 转 CC 时使用）">
              <el-table-column prop="name" label="文件名称" min-width="200" /><el-table-column prop="type" label="所需资料" width="140" /><el-table-column prop="uploadedAt" label="上传时间" width="170" />
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="申报回执" name="receipts">
            <el-table :data="detail.receipts || []" size="small" empty-text="暂无回执"><el-table-column prop="type" label="回执类型" width="140" /><el-table-column prop="status" label="回执状态" width="120" /><el-table-column prop="time" label="回执时间" width="170" /><el-table-column prop="content" label="回执信息" min-width="240" /></el-table>
          </el-tab-pane>
          <el-tab-pane label="操作日志" name="logs">
            <el-table :data="detail.logs || []" size="small" empty-text="暂无日志"><el-table-column prop="action" label="操作" width="130" /><el-table-column prop="content" label="内容" min-width="240" /><el-table-column prop="operator" label="操作人" width="110" /><el-table-column prop="time" label="时间" width="170" /></el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>
    <el-dialog v-model="sensitiveVisible" title="敏感信息授权查看" width="min(420px, 96vw)" align-center>
      <el-form label-position="top"><el-form-item label="查看口令"><el-input v-model="sensitiveInput" type="password" show-password @keyup.enter="verifySensitive" /></el-form-item></el-form>
      <el-alert type="info" :closable="false" title="演示口令 demo123；授权范围与失败限制待确认。" />
      <template #footer><el-button @click="sensitiveVisible = false">取消</el-button><el-button type="primary" @click="verifySensitive">查看</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.bci-notice { margin-bottom: 14px; }
.bci-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 16px; }
.bci-filters label { display: flex; flex-direction: column; gap: 8px; width: 180px; color: var(--muted); }
.bci-filters :deep(.el-date-editor) { width: 100%; }
.bci-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.bci-grid :deep(.el-input), .bci-grid :deep(.el-date-editor) { width: 100%; }
.bci-hint { color: var(--muted); font-size: 12px; }
.detail-hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.detail-hero h2 { margin: 4px 0; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 8px 18px; margin: 0; }
.detail-grid dt { color: var(--muted); font-size: 12px; }
.detail-grid dd { margin: 2px 0 10px; }
</style>
