<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import BcExportServicesPanel from '../components/BcExportServicesPanel.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  BC_CHANNELS, BC_EXCEPTION_RESULTS, BC_EXPORT_STATUSES, BC_SUPERVISION_MODES,
  bcExportPermissions, filterBcExportOrders,
} from '../domain/bcExportOrders.js'

const {
  state, declarationSession, declareBcExportOrders, enterBcWaybillNo, deleteBcDeclarations,
  recordBcException, importBcExportOrders,
} = usePrototypeData()
const permission = computed(() => bcExportPermissions(declarationSession.value.role))
const pageTab = ref('orders')
const defaults = () => ({ orderNo: '', platformOrderNo: '', waybillNo: '', merchantName: '', expressNo: '', packageNo: '', orderStatus: '', payStatus: '', waybillStatus: '', listStatus: '', waybillDocStatus: '', arrivalStatus: '', departureStatus: '', summaryStatus: '', customsZone: '', discarded: '', supervisionMode: '', channel: '', exceptionResult: '', batchNo: '', createdRange: [] })
const filters = reactive(defaults())
const applied = ref({})
const expanded = ref(true)
const rows = computed(() => filterBcExportOrders(state.bcExportOrders, applied.value))
const selectedIds = ref([])
const table = ref()
function query() {
  const hasCondition = Object.values(filters).some(value => Array.isArray(value) ? value.length : String(value || '').length)
  if (!hasCondition) return
  applied.value = JSON.parse(JSON.stringify(filters))
}
function resetQuery() { Object.assign(filters, defaults()); applied.value = {} }
function clearSelection() { selectedIds.value = []; table.value?.clearSelection() }
function targets() { return selectedIds.value.length ? state.bcExportOrders.filter(order => selectedIds.value.includes(order.id)) : rows.value }
function exportOrders(scope) {
  const list = scope === 'checked' ? state.bcExportOrders.filter(order => selectedIds.value.includes(order.id)) : rows.value
  if (!list.length) { ElMessage.warning(scope === 'checked' ? '请先勾选订单' : '当前查询结果为空'); return }
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const header = ['订单编号', '平台订单编号', '总运单号', '商家备案名称', '快递单号', '订单商品总价', '大包号', '订单状态', '支付单状态', '运单状态', '清单状态', '总运单状态', '运抵状态', '离境状态', '汇总状态', '异常处理结果', '关区', '监管方式', '申报通道', '批次号', '下单时间']
  const lines = list.map(order => [order.orderNo, order.platformOrderNo, order.waybillNo, order.merchantName, order.expressNo, order.amount, order.packageNo, order.orderStatus, order.payStatus, order.waybillStatus, order.listStatus, order.waybillDocStatus, order.arrivalStatus, order.departureStatus, order.summaryStatus, order.exceptionResult, order.customsZone, order.supervisionMode, order.channel, order.batchNo, order.createdAt])
  const csv = '\ufeff' + [header, ...lines].map(line => line.map(escape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'BC出口订单.csv'; link.click(); URL.revokeObjectURL(link.href)
}
// ---- 申报与异常弹窗 ----
const declareVisible = ref(false), declareAction = ref('order'), declareForm = reactive({ channel: BC_CHANNELS[0], businessType: '普通清单', cancelReason: '' })
const declareLabels = { order: '订单申报', pay: '支付单申报', waybill: '运单申报', list: '清单申报', cancelList: '撤销清单申报', waybillDoc: '总运单申报', arrival: '运抵单申报', departure: '离境单申报', summary: '汇总申报' }
function openDeclare(action) {
  if (!permission.value.declare) { ElMessage.warning('当前角色不能执行申报'); return }
  if (!targets().length) { ElMessage.warning('请勾选订单或先查询'); return }
  declareAction.value = action
  declareForm.channel = targets().find(order => order.channel)?.channel || BC_CHANNELS[0]
  declareForm.businessType = '普通清单'; declareForm.cancelReason = ''
  declareVisible.value = true
}
function submitDeclare() {
  try {
    const result = declareBcExportOrders(targets().map(order => order.id), declareAction.value, { ...declareForm })
    declareVisible.value = false
    ElMessage.success(`已申报 ${result.sent.length} 笔${result.skipped.length ? `；跳过 ${result.skipped.length} 笔：${result.skipped.slice(0, 2).map(row => `${row.orderNo}（${row.reason}）`).join('；')}` : ''}`)
    clearSelection()
  } catch (error) { ElMessage.error(error.message) }
}
const waybillVisible = ref(false), waybillNo = ref('')
function openWaybillEntry() { waybillNo.value = targets().find(order => order.waybillNo)?.waybillNo || ''; waybillVisible.value = true }
function submitWaybillEntry() {
  try { const changed = enterBcWaybillNo(targets().map(order => order.id), waybillNo.value); waybillVisible.value = false; ElMessage.success(`已录入总运单号（${changed.length} 笔）`) } catch (error) { ElMessage.error(error.message) }
}
const deleteLabels = { deleteOrder: '删除订单申报', deletePay: '删除支付单申报', deleteWaybill: '删除运单申报', deleteCancel: '删除撤销申报', deleteWaybillDoc: '删除总运单申报', deleteDeparture: '删除离境单申报', deleteSummary: '删除汇总申报' }
function runDelete(action) {
  if (!permission.value.exception) { ElMessage.warning('当前角色不能执行异常处理'); return }
  try { const result = deleteBcDeclarations(targets().map(order => order.id), action); ElMessage.success(`已推送删除报文 ${result.changed.length} 笔，回执后状态改为待报关（本地模拟）`); clearSelection() } catch (error) { ElMessage.error(error.message) }
}
const exceptionVisible = ref(false), exceptionAction = ref('returnScene'), exceptionForm = reactive({ reason: '', waybillNo: '', fileName: '退货申请表' })
const exceptionLabels = { returnScene: '退单退场', deleteScene: '删单退场', discard: '记录弃货', batchNewOrders: '批量生成新订单', modifyWaybill: '修改总运单', deleteOrders: '删除订单' }
function openException(action) {
  if (!permission.value.exception) { ElMessage.warning('当前角色不能执行异常处理'); return }
  if (!targets().length) { ElMessage.warning('请勾选订单或先查询'); return }
  exceptionAction.value = action
  exceptionForm.reason = ''; exceptionForm.waybillNo = targets().find(order => order.waybillNo)?.waybillNo || ''
  exceptionVisible.value = true
}
function submitException() {
  try {
    if (exceptionAction.value === 'deleteOrders') {
      const result = recordBcException(targets().map(order => order.id), exceptionAction.value, {})
      exceptionVisible.value = false
      ElMessage.success(`已删除订单${result.skipped.length ? `；跳过 ${result.skipped.length} 笔` : ''}`)
      clearSelection(); return
    }
    const result = recordBcException(targets().map(order => order.id), exceptionAction.value, { ...exceptionForm })
    exceptionVisible.value = false
    ElMessage.success(`${exceptionLabels[exceptionAction.value]}完成（${result.changed.length} 笔）${result.skipped.length ? `；跳过 ${result.skipped.length} 笔` : ''}`)
    clearSelection()
  } catch (error) { ElMessage.error(error.message) }
}
// ---- 导入 ----
const importVisible = ref(false), importMode = ref('9710'), importText = ref(''), importProblems = ref([]), importCsv = ref('')
function openImport() { importMode.value = '9710'; importText.value = ''; importProblems.value = []; importCsv.value = ''; importVisible.value = true }
const importTemplate = ['订单编号,平台订单编号,商家备案名称,快递单号,大包号,订单商品总价,关区,贸易方式', 'BCO2609080101,PLT-DEMO-101,DEMO 商家甲,DEMO-EXP-101,PKG-101,1200,南沙海关,9710']
function downloadTemplate() {
  const blob = new Blob(['\ufeff' + ['订单编号,平台订单编号,商家备案名称,快递单号,大包号,订单商品总价,关区,贸易方式', ...[]].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'BC出口客户订单模板（原型CSV）.csv'; link.click(); URL.revokeObjectURL(link.href)
}
function submitImport() {
  const result = importBcExportOrders({ mode: importMode.value, rowsText: importText.value })
  importProblems.value = result.problems
  importCsv.value = result.failureCsv
  if (!result.created.length) { ElMessage.error(`导入失败：${result.problems[0]?.reason || '没有有效数据'}`); return }
  ElMessage.success(`导入总数 ${result.history.total}，成功 ${result.history.success}，失败 ${result.history.failed}；批次号 ${result.history.batchNo}`)
  if (!result.problems.length) importVisible.value = false
}
function downloadFailure() {
  const blob = new Blob([importCsv.value], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'BC出口导入失败数据.csv'; link.click(); URL.revokeObjectURL(link.href)
}
// ---- 导入历史 / 打印 / 汇总结果 / 详情 ----
const historyVisible = ref(false)
const historyCsv = ref('')
function downloadHistoryFailure(history) {
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = '\ufeff' + [['订单编号', '失败原因'], ...history.problems.map(row => [row.orderNo, row.reason])].map(line => line.map(escape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${history.batchNo}-失败数据.csv`; link.click(); URL.revokeObjectURL(link.href)
}
const printVisible = ref(false), printType = ref('查验细化表')
const printRows = computed(() => targets().map(order => ({ ...order, declaredAt: order.receipts?.at(-1)?.time || order.createdAt })))
function printNow() { window.print() }
const summaryVisible = ref(false)
const summaryRows = computed(() => targets().filter(order => ['海关审结', '海关入库'].includes(order.listStatus)))
function openSummary() {
  if (!targets().length) { ElMessage.warning('请勾选订单或先查询'); return }
  summaryVisible.value = true
}
const detailId = ref(''), detailVisible = ref(false)
const detail = computed(() => state.bcExportOrders.find(order => order.id === detailId.value))
function openDetail(order) { detailId.value = order.id; detailVisible.value = true }
watch(() => [declarationSession.value.role, declarationSession.value.name], () => { declareVisible.value = false; exceptionVisible.value = false; importVisible.value = false; detailVisible.value = false })
</script>

<template>
  <div class="module-view">
    <PageHeader title="BC出口关务" description="订单列表 · 批量申报与异常处理 · 导入与回执">
      <template #actions>
        <el-dropdown trigger="click" @command="command => { if (command === 'order' || command === 'pay' || command === 'waybill' || command === 'list' || command === 'cancelList' || command === 'waybillDoc' || command === 'arrival' || command === 'departure' || command === 'summary') openDeclare(command); else if (command === 'waybillEntry') openWaybillEntry() }">
          <el-button v-business-write="'bcExportCustoms'" type="primary" :disabled="!permission.declare">批量申报<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="order">订单申报</el-dropdown-item><el-dropdown-item command="pay">支付单申报</el-dropdown-item><el-dropdown-item command="waybill">运单申报</el-dropdown-item>
            <el-dropdown-item command="waybillEntry" divided>总运单录入</el-dropdown-item><el-dropdown-item command="list">清单申报</el-dropdown-item><el-dropdown-item command="cancelList">撤销清单申报</el-dropdown-item>
            <el-dropdown-item command="waybillDoc">总运单申报</el-dropdown-item><el-dropdown-item command="arrival">运抵单申报</el-dropdown-item><el-dropdown-item command="departure">离境单申报</el-dropdown-item><el-dropdown-item command="summary">汇总申报</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
        <el-dropdown trigger="click" @command="command => { if (['deleteOrder', 'deletePay', 'deleteWaybill', 'deleteCancel', 'deleteWaybillDoc', 'deleteDeparture', 'deleteSummary'].includes(command)) runDelete(command); else openException(command) }">
          <el-button v-business-write="'bcExportCustoms'" :disabled="!permission.exception">异常处理<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item v-for="(label, key) in deleteLabels" :key="key" :command="key">{{ label }}</el-dropdown-item>
            <el-dropdown-item command="returnScene" divided>退单退场</el-dropdown-item><el-dropdown-item command="deleteScene">删单退场</el-dropdown-item><el-dropdown-item command="discard">记录弃货</el-dropdown-item>
            <el-dropdown-item command="batchNewOrders">批量生成新订单</el-dropdown-item><el-dropdown-item command="modifyWaybill">修改总运单</el-dropdown-item><el-dropdown-item command="deleteOrders">删除订单</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
        <el-button v-business-write="'bcExportCustoms'" :disabled="!permission.import" @click="openImport">导入</el-button>
        <el-button @click="historyVisible = true">订单导入历史</el-button>
        <el-dropdown trigger="click" @command="command => { if (command === 'print') { printType = '查验细化表'; printVisible = true } else if (command === 'summary') openSummary(); else exportOrders(command) }">
          <el-button>打印 / 导出<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="print">打印表单</el-dropdown-item><el-dropdown-item command="summary" divided>查看汇总结果</el-dropdown-item>
            <el-dropdown-item command="checked" divided>按勾选数据导出</el-dropdown-item><el-dropdown-item command="queried">按查询条件导出</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
      </template>
    </PageHeader>
    <el-tabs v-model="pageTab"><el-tab-pane label="BC出口订单" name="orders" /><el-tab-pane label="服务单" name="services" /></el-tabs>
    <template v-if="pageTab === 'orders'">
    <el-alert class="bc-notice" title="海关报文与回执为浏览器内本地模拟；申报通道、撤单原因、批量生成 A 编号、退场附件时间戳与打印表格均为原型呈现，正式接口与模板待确认（CUSTOMS-B014/B016/B017/B023）。" type="info" :closable="false" />
    <form class="bc-filters" aria-label="BC出口订单筛选" @submit.prevent="query">
      <label>订单编号<el-input v-model="filters.orderNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>平台订单编号<el-input v-model="filters.platformOrderNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>总运单号<el-input v-model="filters.waybillNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>商家备案名称<el-input v-model="filters.merchantName" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>快递单号<el-input v-model="filters.expressNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>大包号<el-input v-model="filters.packageNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <el-button link type="primary" @click="expanded = !expanded">{{ expanded ? '收起' : '展开' }}</el-button>
      <template v-if="expanded">
        <label v-for="[key, label] in [['orderStatus', '订单状态'], ['payStatus', '支付单状态'], ['waybillStatus', '运单状态'], ['listStatus', '清单状态'], ['waybillDocStatus', '总运单状态'], ['arrivalStatus', '运抵状态'], ['departureStatus', '离境状态'], ['summaryStatus', '汇总状态']]" :key="key">{{ label }}<el-select v-model="filters[key]" clearable placeholder="全部"><el-option v-for="value in BC_EXPORT_STATUSES" :key="value" :value="value" /></el-select></label>
        <label>关区<el-select v-model="filters.customsZone" clearable placeholder="全部"><el-option v-for="value in ['南沙海关', '广州白云机场海关', '黄埔海关']" :key="value" :value="value" /></el-select></label>
        <label>是否弃货<el-select v-model="filters.discarded" clearable placeholder="全部"><el-option label="是" value="true" /><el-option label="否" value="false" /></el-select></label>
        <label>贸易方式<el-select v-model="filters.supervisionMode" clearable placeholder="全部"><el-option v-for="[value, label] in BC_SUPERVISION_MODES" :key="value" :value="value" :label="label" /></el-select></label>
        <label>申报通道<el-select v-model="filters.channel" clearable placeholder="全部"><el-option v-for="value in BC_CHANNELS" :key="value" :value="value" /></el-select></label>
        <label>异常处理结果<el-select v-model="filters.exceptionResult" clearable placeholder="全部"><el-option v-for="value in BC_EXCEPTION_RESULTS" :key="value" :value="value" /></el-select></label>
        <label>批次号<el-input v-model="filters.batchNo" clearable /></label>
        <label>下单时间<el-date-picker v-model="filters.createdRange" type="datetimerange" value-format="YYYY-MM-DD HH:mm:ss" start-placeholder="开始" end-placeholder="结束" /></label>
      </template>
      <el-button type="primary" native-type="submit">查询</el-button>
      <el-button @click="resetQuery">重置</el-button>
    </form>
    <DataTableFrame :rows="rows" :page-size="50" :page-sizes="[20, 50, 100]" selectable :selected-count="selectedIds.length">
      <template #default="{ rows: pageRows }">
        <el-table ref="table" :data="pageRows" stripe row-key="id" aria-label="BC出口订单列表" @selection-change="items => selectedIds = items.map(item => item.id)">
          <el-table-column type="selection" reserve-selection width="46" />
          <el-table-column label="订单编号" width="160" fixed="left"><template #default="{ row }"><button class="link-button" @click="openDetail(row)">{{ row.orderNo }}</button></template></el-table-column>
          <el-table-column prop="platformOrderNo" label="平台订单编号" width="140" />
          <el-table-column prop="waybillNo" label="总运单号" width="130" />
          <el-table-column prop="merchantName" label="商家备案名称" width="130" />
          <el-table-column prop="expressNo" label="快递单号" width="130" />
          <el-table-column prop="amount" label="订单商品总价" width="115" />
          <el-table-column prop="packageNo" label="大包号" width="100" />
          <el-table-column v-for="[key, label] in [['orderStatus', '订单状态'], ['payStatus', '支付单状态'], ['waybillStatus', '运单状态'], ['listStatus', '清单状态'], ['waybillDocStatus', '总运单状态'], ['arrivalStatus', '运抵状态'], ['departureStatus', '离境状态'], ['summaryStatus', '汇总状态']]" :key="key" :label="label" width="110"><template #default="{ row }"><StatusTag :label="row[key]" /></template></el-table-column>
          <el-table-column prop="exceptionResult" label="异常处理结果" width="110" />
          <el-table-column prop="customsZone" label="关区" width="150" />
          <el-table-column prop="supervisionMode" label="监管方式" width="95" />
          <el-table-column prop="channel" label="申报通道" width="115" />
          <el-table-column prop="batchNo" label="批次号" width="120" />
          <el-table-column prop="createdAt" label="下单时间" width="170" />
          <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">详情</el-button></template></el-table-column>
        </el-table>
      </template>
    </DataTableFrame>
    </template>
    <BcExportServicesPanel v-else />

    <el-dialog v-model="declareVisible" :title="declareLabels[declareAction]" width="min(520px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item v-if="['order', 'pay', 'waybill', 'list'].includes(declareAction)" label="申报通道" required><el-select v-model="declareForm.channel"><el-option v-for="value in BC_CHANNELS" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item v-if="declareAction === 'list'" label="申报业务类型" required><el-select v-model="declareForm.businessType"><el-option label="普通清单" value="普通清单" /><el-option label="人工审核清单" value="人工审核清单" /></el-select></el-form-item>
        <el-form-item v-if="declareAction === 'cancelList'" label="撤单原因" required><el-input v-model="declareForm.cancelReason" type="textarea" :rows="3" maxlength="200" show-word-limit /></el-form-item>
      </el-form>
      <p class="bc-hint">本次目标 {{ targets().length }} 笔；系统逐条复核资格，未通过自动过滤并反馈原因。</p>
      <template #footer><el-button @click="declareVisible = false">取消</el-button><el-button type="primary" @click="submitDeclare">确定</el-button></template>
    </el-dialog>

    <el-dialog v-model="waybillVisible" title="总运单录入" width="min(520px, 96vw)" align-center>
      <el-form label-position="top"><el-form-item label="总运单号" required><el-input v-model="waybillNo" maxlength="100" /></el-form-item></el-form>
      <el-alert type="info" :closable="false" title="存在不同总运单号时挑选同号最多与无号订单、默认跨境电商类型等规则按来源实现；本原型统一录入所选订单。" />
      <template #footer><el-button @click="waybillVisible = false">取消</el-button><el-button type="primary" @click="submitWaybillEntry">确定</el-button></template>
    </el-dialog>

    <el-dialog v-model="exceptionVisible" :title="exceptionLabels[exceptionAction]" width="min(560px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item v-if="exceptionAction === 'returnScene'" label="退货申请说明" required><el-input v-model="exceptionForm.reason" /></el-form-item>
        <el-form-item v-if="exceptionAction === 'returnScene'" label="上传文件"><el-input v-model="exceptionForm.fileName" /><span class="bc-hint">上传后文件名自动追加时间戳。</span></el-form-item>
        <el-form-item v-if="exceptionAction === 'discard'" label="弃货原因" required><el-input v-model="exceptionForm.reason" type="textarea" :rows="3" /></el-form-item>
        <el-form-item v-if="exceptionAction === 'modifyWaybill'" label="修改为总运单号" required><el-input v-model="exceptionForm.waybillNo" /></el-form-item>
        <el-form-item v-if="exceptionAction === 'batchNewOrders'" label="校验通过的订单票数"><strong>{{ targets().length }}</strong></el-form-item>
        <el-form-item v-if="exceptionAction === 'deleteScene'" label="删单退场"><span class="bc-hint">新页面打开删单退场并带出总运单号；原型记录异常结果，真实删单待接后续作业。</span></el-form-item>
      </el-form>
      <el-alert v-if="exceptionAction !== 'batchNewOrders'" type="info" :closable="false" title="仅清单状态为海关退单且已生成平台订单的订单通过校验（修改总运单要求清单待报关）。" />
      <template #footer><el-button @click="exceptionVisible = false">取消</el-button><el-button type="primary" @click="submitException">{{ exceptionAction === 'batchNewOrders' ? '继续' : '确定' }}</el-button></template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="导入客户订单" width="min(760px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item label="模式" required><el-select v-model="importMode"><el-option v-for="[value, label] in BC_SUPERVISION_MODES" :key="value" :value="value" :label="label" /></el-select></el-form-item>
        <el-form-item label="订单数据（原型以粘贴文本替代 Excel 解析，单文件≤5MB）"><el-input v-model="importText" type="textarea" :rows="6" placeholder="每行：订单编号,平台订单编号,商家备案名称,快递单号,大包号,订单商品总价,关区,贸易方式" /></el-form-item>
      </el-form>
      <div class="bc-actions"><el-button @click="downloadTemplate">下载客户订单模板（原型CSV）</el-button><el-button v-if="importCsv" @click="downloadFailure">下载导入失败数据</el-button></div>
      <el-table v-if="importProblems.length" :data="importProblems" size="small"><el-table-column prop="orderNo" label="订单编号" width="180" /><el-table-column prop="reason" label="失败原因" min-width="220" /></el-table>
      <template #footer><el-button @click="importVisible = false">取消</el-button><el-button type="primary" @click="submitImport">确定</el-button></template>
    </el-dialog>

    <el-dialog v-model="historyVisible" title="订单导入历史" width="min(820px, 96vw)" align-center>
      <el-table :data="state.bcExportImportHistory" size="small" empty-text="暂无导入历史">
        <el-table-column prop="batchNo" label="批次号" width="130" />
        <el-table-column prop="mode" label="模式" width="80" />
        <el-table-column prop="total" label="总数" width="70" />
        <el-table-column prop="success" label="成功" width="70" />
        <el-table-column prop="failed" label="失败" width="70" />
        <el-table-column prop="importedAt" label="导入时间" width="170" />
        <el-table-column label="操作" width="150"><template #default="{ row }"><el-button v-if="row.failed" link type="primary" @click="downloadHistoryFailure(row)">下载失败数据</el-button></template></el-table-column>
      </el-table>
      <el-alert type="info" :closable="false" title="文件格式不符合模板要求时整份失败且不记录历史；本原型以粘贴文本执行同一校验口径。" />
    </el-dialog>

    <el-dialog v-model="printVisible" title="打印表单" width="min(900px, 96vw)" align-center>
      <el-radio-group v-model="printType" class="bc-print-type"><el-radio label="查验细化表">查验细化表</el-radio><el-radio label="清单审理表">清单审理表</el-radio><el-radio label="大包号表格">大包号表格</el-radio></el-radio-group>
      <el-table :data="printRows" size="small" border>
        <el-table-column prop="declaredAt" label="申报日期" width="160" />
        <el-table-column prop="waybillNo" label="总运单号" width="130" />
        <el-table-column label="票数" width="70"><template #default>1</template></el-table-column>
        <el-table-column v-if="printType === '查验细化表'" prop="customsZone" label="目的国/关区" width="150" />
        <el-table-column v-if="printType === '清单审理表'" label="人工票数" width="90"><template #default="{ row }">{{ row.listStatus === '海关入库' ? 1 : 0 }}</template></el-table-column>
        <el-table-column prop="merchantName" label="平台/发货公司" min-width="150" />
        <el-table-column prop="packageNo" label="大包号" width="110" />
      </el-table>
      <p class="bc-hint">申报日期、订单下单时间等日期口径见 CUSTOMS-B016，保留待确认；打印为浏览器打印，不是正式表格模板。</p>
      <template #footer><el-button @click="printVisible = false">关闭</el-button><el-button type="primary" @click="printNow">打印</el-button></template>
    </el-dialog>

    <el-dialog v-model="summaryVisible" title="申报汇总结果" width="min(860px, 96vw)" align-center>
      <el-table :data="summaryRows" size="small" empty-text="所选订单尚无清单审结记录">
        <el-table-column prop="orderNo" label="订单编号" width="160" /><el-table-column prop="waybillNo" label="总运单号" width="130" /><el-table-column prop="listStatus" label="清单状态" width="110" /><el-table-column prop="summaryStatus" label="汇总状态" width="110" /><el-table-column label="最近回执" min-width="200"><template #default="{ row }">{{ row.receipts?.at(-1)?.content || '—' }}</template></el-table-column>
      </el-table>
      <el-alert type="info" :closable="false" title="汇总结果只投影清单审结后的既有回执，不生成第二套汇总状态。" />
    </el-dialog>

    <el-drawer v-model="detailVisible" title="BC出口订单详情" size="min(900px, 96vw)">
      <template v-if="detail">
        <div class="detail-hero"><div><small>订单编号</small><h2>{{ detail.orderNo }}</h2><span>{{ detail.merchantName }} · {{ detail.batchNo }}</span></div><StatusTag :label="detail.orderStatus" /></div>
        <section class="detail-section"><h3>订单与申报状态</h3><dl class="detail-grid">
          <div v-for="[label, value] in [['平台订单编号', detail.platformOrderNo], ['总运单号', detail.waybillNo], ['快递单号', detail.expressNo], ['大包号', detail.packageNo], ['订单商品总价', detail.amount], ['关区', detail.customsZone], ['监管方式', detail.supervisionMode], ['申报通道', detail.channel], ['异常处理结果', detail.exceptionResult], ['下单时间', detail.createdAt], ['订单状态', detail.orderStatus], ['支付单状态', detail.payStatus], ['运单状态', detail.waybillStatus], ['清单状态', detail.listStatus], ['总运单状态', detail.waybillDocStatus], ['撤销清单状态', detail.cancelListStatus], ['运抵状态', detail.arrivalStatus], ['离境状态', detail.departureStatus], ['汇总状态', detail.summaryStatus]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
        </dl>
        <el-table :data="detail.goods || []" size="small" empty-text="无商品"><el-table-column prop="name" label="商品名称" min-width="180" /><el-table-column prop="quantity" label="数量" width="90" /><el-table-column prop="unitPrice" label="单价" width="110" /></el-table>
        </section>
        <section class="detail-section"><h3>申报回执</h3><el-table :data="detail.receipts || []" size="small" empty-text="暂无回执"><el-table-column prop="type" label="申报类型" width="140" /><el-table-column prop="status" label="回执状态" width="110" /><el-table-column prop="time" label="回执时间" width="170" /><el-table-column prop="content" label="回执内容" min-width="220" /></el-table></section>
        <section class="detail-section"><h3>操作日志</h3><el-table :data="detail.logs || []" size="small" empty-text="暂无日志"><el-table-column prop="action" label="操作" width="130" /><el-table-column prop="content" label="内容" min-width="240" /><el-table-column prop="operator" label="操作人" width="110" /><el-table-column prop="time" label="时间" width="170" /></el-table></section>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.bc-notice { margin-bottom: 14px; }
.bc-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 16px; }
.bc-filters label { display: flex; flex-direction: column; gap: 8px; width: 180px; color: var(--muted); }
.bc-filters :deep(.el-date-editor) { width: 100%; }
.bc-hint { color: var(--muted); font-size: 12px; }
.bc-actions { display: flex; gap: 8px; margin: 10px 0; }
.bc-print-type { margin-bottom: 12px; }
.detail-hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.detail-hero h2 { margin: 4px 0; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 8px 18px; margin: 0; }
.detail-grid dt { color: var(--muted); font-size: 12px; }
.detail-grid dd { margin: 2px 0 10px; }
</style>
