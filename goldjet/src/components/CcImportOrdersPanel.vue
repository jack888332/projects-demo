<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import DataTableFrame from './DataTableFrame.vue'
import StatusTag from './StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { BC_CLEARANCE_STEPS } from '../domain/bcImportOrders.js'
import {
  CC_ATTACHMENT_TYPES, CC_EXPRESS_TYPES, CC_IMPORT_NOW, CC_STATUSES,
  ccImportPermissions, createCcReceiptCsv, filterCcImportOrders, requiredAttachments,
} from '../domain/ccImportOrders.js'

const {
  state, declarationSession, dispatchCcImportOrders, bindCcImportOrders, enterCcImportWaybills,
  processCcAttachments, declareCcImportOrders, convertCcToBc, changeCcWaybillNo, receiverDuplicateCheck,
  voidCcDeclaration, startCcReturn,
} = usePrototypeData()
const permission = computed(() => ccImportPermissions(declarationSession.value.role))
const tabs = [['shipped', '已发货'], ['unshipped', '未发货']]
const tab = ref('shipped')
const defaults = () => ({ orderNo: '', outboundNo: '', waybillNo: '', customer: '', expressNo: '', buyer: '', customerCancelled: '', conversion: '', ecommerceName: '', platformName: '', warehouse: '', expressType: '', manifestStatus: '', attachmentStatus: '', expressStatus: '', returnResult: '', customsZone: '', createdRange: [], pickedUp: '', clearanceStarted: '', clearanceDone: '' })
const filters = reactive(defaults())
const applied = ref({})
const expanded = ref(false)
const rows = computed(() => filterCcImportOrders(state.ccImportOrders.filter(order => order.shipped === (tab.value === 'shipped')), applied.value))
const selectedIds = ref([])
const table = ref()
function query() {
  if (!Object.values(filters).some(value => Array.isArray(value) ? value.length : String(value || '').length)) return
  applied.value = JSON.parse(JSON.stringify(filters))
}
function resetQuery() { Object.assign(filters, defaults()); applied.value = {} }
function clearSelection() { selectedIds.value = []; table.value?.clearSelection() }
function targets() { return selectedIds.value.length ? state.ccImportOrders.filter(order => selectedIds.value.includes(order.id)) : rows.value }
function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href)
}
function exportOrders(scope) {
  const list = scope === 'checked' ? state.ccImportOrders.filter(order => selectedIds.value.includes(order.id)) : rows.value
  if (!list.length) { ElMessage.warning(scope === 'checked' ? '请先勾选订单' : '当前查询结果为空'); return }
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const header = ['订单编号', '出库单号', '总运/提单号', '客户名称', '客户取消订单', '转换情况', '托盘号', '电商企业', '电商平台', '仓库', '快递单号', '订单商品总价', '订购人', '快件类型', '舱单状态', '附件状态', '快件状态', '退运结果', '关区', '预估税金', '海关税金', '下单时间']
  const lines = list.map(order => [order.orderNo, order.outboundNo, order.waybillNo, order.customer, order.customerCancelled ? '是' : '否', order.conversion, order.palletNo, order.ecommerceName, order.platformName, order.warehouse, order.expressNo, order.amount, order.buyer, order.expressType, order.manifestStatus, order.attachmentStatus, order.expressStatus, order.returnResult, order.customsZone, order.estimatedTax, order.customsTax, order.createdAt])
  downloadCsv('CC进口订单.csv', '\ufeff' + [header, ...lines].map(line => line.map(escape).join(',')).join('\r\n'))
}
// ---- 订单操作 ----
async function runWithConfirm(action, message, title) {
  const list = targets()
  if (!list.length) { ElMessage.warning('请勾选订单或先查询'); return }
  try { await ElMessageBox.confirm(`${message}（共 ${list.length} 笔）`, title, { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try {
    if (action === 'dispatch') {
      const result = dispatchCcImportOrders(list.map(order => order.id))
      ElMessage.success(`已下发 ${result.dispatched.length} 笔`)
    } else if (action === 'convert') {
      const result = convertCcToBc(list.map(order => order.id))
      ElMessage.success(`已转为 BC 订单 ${result.converted.length} 笔（预估税金重算待确认）`)
    } else if (action === 'void') {
      const result = voidCcDeclaration(list.map(order => order.id))
      ElMessage.success(`已作废 ${result.changed.length} 笔报关单`)
    } else if (action === 'return') {
      const result = startCcReturn(list.map(order => order.id))
      ElMessage.success(`已发起退运 ${result.changed.length} 笔`)
    }
    clearSelection()
  } catch (error) { ElMessage.error(error.message) }
}
const bindVisible = ref(false), bindForm = reactive({ waybillNo: '', outboundNo: '' })
function openBind() { bindForm.waybillNo = targets()[0]?.waybillNo || ''; bindForm.outboundNo = targets()[0]?.outboundNo || ''; bindVisible.value = true }
function submitBind() {
  try { const result = bindCcImportOrders(targets().map(order => order.id), { ...bindForm }); bindVisible.value = false; ElMessage.success(`已绑定干线 ${result.bound.length} 笔`) } catch (error) { ElMessage.error(error.message) }
}
const waybillVisible = ref(false), waybillForm = reactive({ departurePort: 'CAN', expectedDeparture: '2026-09-09', volume: '0.4', grossWeight: '9.6' })
function openWaybill() { waybillVisible.value = true }
function submitWaybill() {
  try { const result = enterCcImportWaybills(targets().map(order => order.id), { ...waybillForm }); waybillVisible.value = false; ElMessage.success(`已录入提单 ${result.entered.length} 笔；舱单自动申报，快件附件齐全时自动申报（本地模拟）`) } catch (error) { ElMessage.error(error.message) }
}
const changeVisible = ref(false), changeWaybill = ref('')
function openChangeWaybill() { changeWaybill.value = targets()[0]?.waybillNo || ''; changeVisible.value = true }
function submitChangeWaybill() {
  try { const result = changeCcWaybillNo(targets().map(order => order.id), changeWaybill.value); changeVisible.value = false; ElMessage.success(`已更改提单号 ${result.changed.length} 笔`) } catch (error) { ElMessage.error(error.message) }
}
// ---- 附件加工与申报 ----
const attachVisible = ref(false), attachAction = ref('face'), attachRows = ref([]), attachBusy = ref(false)
const attachLabel = computed(() => (CC_ATTACHMENT_TYPES.find(([key]) => key === attachAction.value) || [])[1] || '')
function openAttach(type) {
  if (!permission.value.attach) { ElMessage.warning('当前角色不能执行附件加工'); return }
  if (!targets().length) { ElMessage.warning('请勾选订单或先查询'); return }
  attachAction.value = type
  attachRows.value = targets().map(order => ({ orderNo: order.orderNo, expressType: order.expressType, status: '待加工' }))
  attachVisible.value = true
}
function submitAttach() {
  attachBusy.value = true
  try {
    const orders = targets()
    const result = processCcAttachments(orders.map(order => order.id), attachAction.value)
    for (const [index, row] of attachRows.value.entries()) row.status = result.generated[index]?.id ? '已完成' : '已完成'
    ElMessage.success(`${result.label}完成；附件压缩包保留 30 天，可下载（本地模拟）`)
    clearSelection()
  } catch (error) { ElMessage.error(error.message); attachVisible.value = false } finally { attachBusy.value = false }
}
function downloadAttach() {
  const lines = [['加工类型', attachLabel.value], ['订单编号', targets().map(order => order.orderNo).join('；')], ['生成时间', CC_IMPORT_NOW], ['保留至', '2026-10-08']]
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  downloadCsv(`${attachLabel.value}-附件清单.csv`, '\ufeff' + lines.map(line => line.map(escape).join(',')).join('\r\n'))
  attachVisible.value = false
  ElMessage.success('已下载附件清单（原型 CSV，压缩包与正式接口待确认）')
}
function runDeclare(action) {
  const list = targets()
  if (!list.length) { ElMessage.warning('请勾选订单或先查询'); return }
  try {
    const result = declareCcImportOrders(list.map(order => order.id), action)
    ElMessage.success(`${action === 'attachments' ? '附件申报' : '快件申报'}完成 ${result.changed.length} 笔${result.skipped.length ? `；跳过 ${result.skipped.length} 笔` : ''}`)
    clearSelection()
  } catch (error) { ElMessage.error(error.message) }
}
// ---- 收件人重复校验与回执 ----
const receiverVisible = ref(false), receiverRows = ref([])
function openReceiverCheck() {
  const list = targets()
  if (list.length !== 1) { ElMessage.warning('收件人信息重复校验每次选择一条订单'); return }
  try { receiverRows.value = receiverDuplicateCheck(list[0].id); receiverVisible.value = true } catch (error) { ElMessage.error(error.message) }
}
function downloadReceipts(type, label) {
  if (!targets().length) { ElMessage.warning('请勾选订单或先查询'); return }
  downloadCsv(`${label}回执-${targets()[0].waybillNo || '未绑定'}-20260908.csv`, createCcReceiptCsv(targets(), type))
}
const proofVisible = ref(false)
function downloadProof() {
  const lines = [['业务类型', 'CC进口'], ['总运单号', targets()[0]?.waybillNo || ''], ['订单编号', targets().map(order => order.orderNo).join('；')], ['提货日期', '2026-09-08']]
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  downloadCsv('提货证明（原型文本）.csv', '\ufeff' + lines.map(line => line.map(escape).join(',')).join('\r\n'))
  proofVisible.value = false
  ElMessage.success('已下载原型提货证明文本；正式 docx 模板待确认')
}
// ---- 详情 ----
const detailId = ref(''), detailVisible = ref(false), detailTab = ref('info')
const detail = computed(() => state.ccImportOrders.find(order => order.id === detailId.value))
function openDetail(order) { detailId.value = order.id; detailTab.value = 'info'; detailVisible.value = true }
watch(() => [declarationSession.value.role, declarationSession.value.name], () => { detailVisible.value = false })
watch(tab, () => { clearSelection(); Object.assign(filters, defaults()); applied.value = {} })
</script>

<template>
  <div>
    <el-alert class="cci-notice" title="CC 订单编辑（§6.2）、套件拆价与税费测算、关务服务单、原始舱单、载货确报、快递派送与进出区登记归后续切片；附件加工与回执为本地模拟，附件保留 30 天。" type="info" :closable="false" />
    <el-tabs v-model="tab"><el-tab-pane v-for="[value, label] in tabs" :key="value" :label="label" :name="value" /></el-tabs>
    <div class="cci-actions">
      <el-dropdown trigger="click" @command="command => { if (command === 'bind') openBind(); else if (command === 'waybillEntry') openWaybill(); else if (command === 'changeWaybill') openChangeWaybill(); else if (command === 'receiver') openReceiverCheck(); else runWithConfirm(command, { dispatch: '仅备货待下发且现货有货的订单可下发。', convert: '仅报关单状态允许且商品全部备案的订单可转为 BC。' }[command], { dispatch: '下发仓库', convert: '转为BC订单' }[command]) }">
        <el-button v-business-write="'bcImportCustoms'" :disabled="!permission.operate">订单操作<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
        <template #dropdown><el-dropdown-menu>
          <el-dropdown-item command="dispatch">下发仓库</el-dropdown-item><el-dropdown-item command="bind">绑定干线</el-dropdown-item><el-dropdown-item command="waybillEntry">提单录入</el-dropdown-item>
          <el-dropdown-item command="convert" divided>转为BC订单</el-dropdown-item><el-dropdown-item command="changeWaybill">更改提单号</el-dropdown-item><el-dropdown-item command="receiver">收件人信息重复校验</el-dropdown-item>
        </el-dropdown-menu></template>
      </el-dropdown>
      <el-dropdown trigger="click" @command="openAttach">
        <el-button v-business-write="'bcImportCustoms'" :disabled="!permission.attach">附件加工<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
        <template #dropdown><el-dropdown-menu><el-dropdown-item v-for="[key, label] in CC_ATTACHMENT_TYPES" :key="key" :command="key">{{ label }}</el-dropdown-item></el-dropdown-menu></template>
      </el-dropdown>
      <el-dropdown trigger="click" @command="command => { if (command === 'attachments' || command === 'express') runDeclare(command); else runWithConfirm(command, command === 'void' ? '作废按放行状态集执行。' : '仅允许状态集内订单发起退运。', command === 'void' ? '作废报关单' : '发起退运') }">
        <el-button v-business-write="'bcImportCustoms'" :disabled="!permission.declare">申报<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
        <template #dropdown><el-dropdown-menu><el-dropdown-item command="attachments">附件申报</el-dropdown-item><el-dropdown-item command="express">快件申报</el-dropdown-item><el-dropdown-item command="void" divided>作废报关单</el-dropdown-item><el-dropdown-item command="return">发起退运</el-dropdown-item></el-dropdown-menu></template>
      </el-dropdown>
      <el-dropdown trigger="click" @command="command => { if (command === 'proof') proofVisible = true; else downloadReceipts(command, { manifest: '舱单', attachments: '附件', express: '快件' }[command]) }">
        <el-button>下载<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
        <template #dropdown><el-dropdown-menu><el-dropdown-item command="proof">下载提货证明（原型文本）</el-dropdown-item><el-dropdown-item command="manifest" divided>下载舱单回执</el-dropdown-item><el-dropdown-item command="attachments">下载附件回执</el-dropdown-item><el-dropdown-item command="express">下载快件回执</el-dropdown-item></el-dropdown-menu></template>
      </el-dropdown>
      <el-dropdown trigger="click" @command="exportOrders"><el-button>导出<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="checked">按勾选数据导出</el-dropdown-item><el-dropdown-item command="queried">按查询条件导出</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
      <span class="cci-hint">已选 {{ selectedIds.length }} 笔；未勾选时按当前查询结果执行。</span>
    </div>
    <form class="cci-filters" aria-label="CC进口订单筛选" @submit.prevent="query">
      <label>订单编号<el-input v-model="filters.orderNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>出库单号<el-input v-model="filters.outboundNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>总运/提单号<el-input v-model="filters.waybillNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>客户名称<el-input v-model="filters.customer" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>快递单号<el-input v-model="filters.expressNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <el-button link type="primary" @click="expanded = !expanded">{{ expanded ? '收起' : '展开' }}</el-button>
      <template v-if="expanded">
        <label>订购人<el-input v-model="filters.buyer" type="textarea" :rows="1" placeholder="可换行多个" /></label>
        <label>客户取消订单<el-select v-model="filters.customerCancelled" clearable placeholder="全部"><el-option label="是" value="true" /><el-option label="否" value="false" /></el-select></label>
        <label>转换情况<el-select v-model="filters.conversion" clearable placeholder="全部"><el-option v-for="value in ['无', '作废', 'CC转BC']" :key="value" :value="value" /></el-select></label>
        <label>快件类型<el-select v-model="filters.expressType" clearable placeholder="全部"><el-option v-for="[value, label] in CC_EXPRESS_TYPES" :key="value" :value="value" :label="label" /></el-select></label>
        <label>电商企业<el-input v-model="filters.ecommerceName" clearable /></label>
        <label>电商平台<el-input v-model="filters.platformName" clearable /></label>
        <label>仓库<el-select v-model="filters.warehouse" clearable placeholder="全部"><el-option v-for="value in ['南沙保税仓 WH002', '广州保税仓 WH001']" :key="value" :value="value" /></el-select></label>
        <label v-for="[key, label] in [['manifestStatus', '舱单状态'], ['attachmentStatus', '附件状态'], ['expressStatus', '快件状态']]" :key="key">{{ label }}<el-select v-model="filters[key]" clearable filterable placeholder="全部"><el-option v-for="value in key === 'attachmentStatus' ? ['待加工', '部分完成', '已完成'] : CC_STATUSES" :key="value" :value="value" /></el-select></label>
        <label>退运结果<el-select v-model="filters.returnResult" clearable placeholder="全部"><el-option label="退运中" value="退运中" /><el-option label="已退运" value="已退运" /></el-select></label>
        <label>关区<el-input v-model="filters.customsZone" clearable /></label>
        <label v-for="[key, label, options] in BC_CLEARANCE_STEPS" :key="key">{{ label }}<el-select v-model="filters[key]" clearable placeholder="全部"><el-option v-for="value in options" :key="value" :value="value" /></el-select></label>
        <label>下单时间<el-date-picker v-model="filters.createdRange" type="datetimerange" value-format="YYYY-MM-DD HH:mm:ss" start-placeholder="开始" end-placeholder="结束" /></label>
      </template>
      <el-button type="primary" native-type="submit">查询</el-button>
      <el-button @click="resetQuery">重置</el-button>
    </form>
    <DataTableFrame :rows="rows" :page-size="50" :page-sizes="[20, 50, 100]" selectable :selected-count="selectedIds.length">
      <template #default="{ rows: pageRows }">
        <el-table ref="table" :data="pageRows" stripe row-key="id" aria-label="CC进口订单列表" @selection-change="items => selectedIds = items.map(item => item.id)">
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
          <el-table-column label="快件类型" width="90"><template #default="{ row }">{{ row.expressType }}</template></el-table-column>
          <el-table-column v-for="[key, label] in [['manifestStatus', '舱单状态'], ['attachmentStatus', '附件状态'], ['expressStatus', '快件状态']]" :key="key" :label="label" width="115"><template #default="{ row }"><StatusTag :label="row[key]" /></template></el-table-column>
          <el-table-column prop="returnResult" label="退运结果" width="95" />
          <el-table-column prop="customsZone" label="关区" width="120" />
          <el-table-column prop="estimatedTax" label="预估税金" width="95" />
          <el-table-column prop="customsTax" label="海关税金" width="95" />
          <el-table-column prop="createdAt" label="下单时间" width="170" />
          <el-table-column v-for="[key, label] in BC_CLEARANCE_STEPS.map(([key, label]) => [key, label])" :key="key" :label="label" width="100"><template #default="{ row }">{{ row.logistics[key] }}</template></el-table-column>
          <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">详情</el-button></template></el-table-column>
        </el-table>
      </template>
    </DataTableFrame>

    <el-dialog v-model="bindVisible" title="绑定干线" width="min(520px, 96vw)" align-center>
      <el-form label-position="top"><el-form-item label="出库单号"><el-input v-model="bindForm.outboundNo" /></el-form-item><el-form-item label="总运单号" required><el-input v-model="bindForm.waybillNo" /></el-form-item></el-form>
      <template #footer><el-button @click="bindVisible = false">取消</el-button><el-button type="primary" @click="submitBind">确定</el-button></template>
    </el-dialog>
    <el-dialog v-model="waybillVisible" title="提单录入（总运单）" width="min(560px, 96vw)" align-center>
      <el-form label-position="top" class="cci-grid">
        <el-form-item label="启运港"><el-input v-model="waybillForm.departurePort" /></el-form-item>
        <el-form-item label="预计出港日期"><el-date-picker v-model="waybillForm.expectedDeparture" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="体积（m³）"><el-input v-model="waybillForm.volume" /></el-form-item>
        <el-form-item label="提单总毛重（kg）"><el-input v-model="waybillForm.grossWeight" /></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" title="录入提货后自动舱单申报；快件附件齐全时自动快件申报，缺附件则等待加工后再申报（本地模拟）。" />
      <template #footer><el-button @click="waybillVisible = false">取消</el-button><el-button type="primary" @click="submitWaybill">录入并自动申报</el-button></template>
    </el-dialog>
    <el-dialog v-model="changeVisible" title="更改提单号" width="min(460px, 96vw)" align-center>
      <el-form label-position="top"><el-form-item label="新的提单号" required><el-input v-model="changeWaybill" /></el-form-item></el-form>
      <el-alert type="info" :closable="false" title="仅已绑定干线且订单申报未完成的订单可修改。" />
      <template #footer><el-button @click="changeVisible = false">取消</el-button><el-button type="primary" @click="submitChangeWaybill">确定</el-button></template>
    </el-dialog>
    <el-dialog v-model="attachVisible" :title="attachLabel" width="min(680px, 96vw)" align-center>
      <el-table :data="attachRows" size="small" aria-label="附件加工进度">
        <el-table-column prop="orderNo" label="订单编号" width="170" /><el-table-column prop="expressType" label="快件类型" width="100" /><el-table-column prop="status" label="加工进度" width="110" />
        <el-table-column label="所需附件" min-width="180"><template #default="{ row }">{{ requiredAttachments(row.expressType).map(item => item.label).join('、') }}</template></el-table-column>
      </el-table>
      <el-alert type="info" :closable="false" title="B类需要面单、小票、身份证、身份认证；A/C类需要面单、发票、委托书；附件由接口生成压缩包并保留30天，失败与过期重生成规则待确认。" />
      <template #footer><el-button @click="attachVisible = false">关闭</el-button><el-button :disabled="attachBusy" type="primary" @click="submitAttach">开始加工</el-button><el-button @click="downloadAttach">下载附件清单</el-button></template>
    </el-dialog>
    <el-dialog v-model="receiverVisible" title="收件人信息重复校验" width="min(760px, 96vw)" align-center>
      <el-table :data="receiverRows" size="small" empty-text="该提单号下没有相同收件人的其他订单">
        <el-table-column prop="orderNo" label="订单编号" width="170" /><el-table-column prop="buyer" label="订购人" width="110" /><el-table-column prop="expressNo" label="快递单号" width="140" /><el-table-column prop="expressStatus" label="快件状态" width="120" />
      </el-table>
      <el-alert type="info" :closable="false" title="原型只展示同提单号相同收件人的订单；修改收件人信息入口按订单编辑切片后续接入。" />
    </el-dialog>
    <el-dialog v-model="proofVisible" title="下载提货证明" width="min(460px, 96vw)" align-center>
      <el-alert type="info" :closable="false" title="来源要求 docx 模板；原型用文本内容替代，正式模板待确认。" />
      <template #footer><el-button @click="proofVisible = false">取消</el-button><el-button type="primary" @click="downloadProof">下载原型文本</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="CC进口订单详情" size="min(980px, 96vw)">
      <template v-if="detail">
        <div class="detail-hero"><div><small>订单编号</small><h2>{{ detail.orderNo }}</h2><span>{{ detail.customer }} · {{ detail.expressType }} 类</span></div><StatusTag :label="detail.expressStatus" /></div>
        <el-tabs v-model="detailTab">
          <el-tab-pane label="订单信息" name="info">
            <section class="detail-section"><h3>表头</h3><dl class="detail-grid">
              <div v-for="[label, value] in [['订单编号', detail.orderNo], ['出库单号', detail.outboundNo], ['总运/提单号', detail.waybillNo], ['客户名称', detail.customer], ['客户取消订单', detail.customerCancelled ? '是' : '否'], ['转换情况', detail.conversion], ['托盘号', detail.palletNo], ['电商企业', detail.ecommerceName], ['电商平台', detail.platformName], ['仓库', detail.warehouse], ['快递单号', detail.expressNo], ['订单商品总价', detail.amount], ['订购人', detail.buyer], ['快件类型', detail.expressType], ['舱单状态', detail.manifestStatus], ['附件状态', detail.attachmentStatus], ['快件状态', detail.expressStatus], ['作废状态', detail.voidStatus || '—'], ['退运结果', detail.returnResult || '—'], ['关区', detail.customsZone], ['预估税金', detail.estimatedTax ?? '待确认'], ['海关税金', detail.customsTax || '待税单导入'], ['下单时间', detail.createdAt]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
            </dl></section>
          </el-tab-pane>
          <el-tab-pane label="商品信息" name="goods">
            <el-table :data="detail.goods || []" size="small" empty-text="无商品"><el-table-column prop="productId" label="商品ID" width="130" /><el-table-column prop="name" label="商品名称" min-width="150" /><el-table-column prop="spec" label="规格型号" width="120" /><el-table-column prop="hsCode" label="HS编码" width="110" /><el-table-column prop="mailTaxNo" label="行邮税号" width="110" /><el-table-column prop="quantity" label="数量" width="80" /><el-table-column prop="unitPrice" label="单价" width="100" /></el-table>
          </el-tab-pane>
          <el-tab-pane label="附件资料" name="attachments">
            <el-table :data="detail.attachments || []" size="small" empty-text="暂无附件"><el-table-column prop="label" label="资料" width="120" /><el-table-column prop="status" label="状态" width="100" /><el-table-column prop="generatedAt" label="生成时间" width="170" /><el-table-column prop="retainUntil" label="保留至" width="120" /></el-table>
            <p class="cci-hint">B类需要面单、小票、身份证、身份认证；A/C类需要面单、发票、委托书；附件保留 30 天。</p>
          </el-tab-pane>
          <el-tab-pane label="申报回执" name="receipts">
            <el-table :data="detail.receipts || []" size="small" empty-text="暂无回执"><el-table-column prop="type" label="回执类型" width="130" /><el-table-column prop="status" label="回执状态" width="120" /><el-table-column prop="time" label="回执时间" width="170" /><el-table-column prop="content" label="回执信息" min-width="240" /></el-table>
          </el-tab-pane>
          <el-tab-pane label="操作日志" name="logs">
            <el-table :data="detail.logs || []" size="small" empty-text="暂无日志"><el-table-column prop="action" label="操作" width="130" /><el-table-column prop="content" label="内容" min-width="240" /><el-table-column prop="operator" label="操作人" width="110" /><el-table-column prop="time" label="时间" width="170" /></el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.cci-notice { margin-bottom: 12px; }
.cci-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.cci-hint { color: var(--muted); font-size: 12px; }
.cci-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 16px; }
.cci-filters label { display: flex; flex-direction: column; gap: 8px; width: 180px; color: var(--muted); }
.cci-filters :deep(.el-date-editor) { width: 100%; }
.cci-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.cci-grid :deep(.el-input), .cci-grid :deep(.el-date-editor) { width: 100%; }
.detail-hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.detail-hero h2 { margin: 4px 0; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 8px 18px; margin: 0; }
.detail-grid dt { color: var(--muted); font-size: 12px; }
.detail-grid dd { margin: 2px 0 10px; }
</style>
