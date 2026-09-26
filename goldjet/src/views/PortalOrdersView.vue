<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  BBC_REQUIREMENT_MODES, COLLECT_STATUSES, CUSTOMS_ZONES, INTERCEPT_OPTIONS, PORTAL_WAREHOUSES,
  SHORTAGE_OPTIONS, STOCK_STATUSES, createRequirementDraft, createRequirementGoodsRow,
  portalPermissions, smallOrderEligibility, validateRequirementDraft,
} from '../domain/portalOrders.js'

const {
  state, orderSession, markPoolOrders, cancelPoolOrders, restorePoolOrders,
  updatePalletNo, unbindRequirement, bindRequirement, convertToStock, convertToPickup, submitInbound,
  deleteSmallOrders, cancelSmallOrders, restoreSmallOrders, dispatchStockOrders, cancelStockOrders, importSmallOrders,
  savePortalRequirement, submitPortalRequirement, cancelPortalRequirement, deletePortalRequirement,
  confirmReceiptReport, rejectReceiptReport, confirmTallyReport, rejectTallyReport, setShortageHandling, convertDamagedDetail,
} = usePrototypeData()
const permission = computed(() => portalPermissions(orderSession.value.role))
const tabs = ['订单池', 'BC集货', 'BC备货', 'CC集货', 'CC备货', 'BBC小订单', '需求单', '报告确认']
const tab = ref('订单池')
const selectedIds = ref([])
const table = ref()
function currentOrders() {
  const map = { 订单池: state.portalPoolOrders, BC集货: state.portalSmallOrders.filter(row => row.businessType === 'BC' && row.mode === '集货'), BC备货: state.portalSmallOrders.filter(row => row.businessType === 'BC' && row.mode === '备货'), CC集货: state.portalSmallOrders.filter(row => row.businessType === 'CC' && row.mode === '集货'), CC备货: state.portalSmallOrders.filter(row => row.businessType === 'CC' && row.mode === '备货') }
  return map[tab.value] || []
}
const defaults = () => ({ orderNo: '', inboundNo: '', waybillNo: '', expressNo: '', buyer: '', palletNo: '', warehouse: '', warehouseStatus: '', customerCancelled: '', intercept: '', stockStatus: '', presaleType: '', platform: '', shop: '', orderRange: [] })
const filters = reactive(defaults())
const applied = ref(defaults())
const expanded = ref(false)
const rows = computed(() => currentOrders().filter(order =>
  (!applied.value.orderNo || String(order.orderNo || '').split(/\n+/).includes(applied.value.orderNo.trim()) || order.orderNo.includes(applied.value.orderNo.trim())) &&
  (!applied.value.inboundNo || order.inboundNo === applied.value.inboundNo.trim()) &&
  (!applied.value.waybillNo || order.waybillNo === applied.value.waybillNo.trim()) &&
  (!applied.value.expressNo || order.expressNo === applied.value.expressNo.trim()) &&
  (!applied.value.buyer || order.buyer === applied.value.buyer) &&
  (!applied.value.palletNo || order.palletNo === applied.value.palletNo.trim()) &&
  (!applied.value.warehouse || order.warehouse === applied.value.warehouse) &&
  (!applied.value.warehouseStatus || order.warehouseStatus === applied.value.warehouseStatus) &&
  (!applied.value.customerCancelled || String(order.customerCancelled) === applied.value.customerCancelled) &&
  (!applied.value.intercept || order.intercept === applied.value.intercept) &&
  (!applied.value.stockStatus || order.stockStatus === applied.value.stockStatus) &&
  (!applied.value.presaleType || order.presaleType === applied.value.presaleType) &&
  (!applied.value.platform || order.platform === applied.value.platform) &&
  (!applied.value.shop || order.shop === applied.value.shop) &&
  (!applied.value.orderRange?.length || (order.orderTime || '').slice(0, 10) >= applied.value.orderRange[0] && (order.orderTime || '').slice(0, 10) <= applied.value.orderRange[1])))
function query() { applied.value = JSON.parse(JSON.stringify(filters)) }
function resetQuery() { Object.assign(filters, defaults()) }
function clearSelection() { selectedIds.value = []; table.value?.clearSelection() }
const platforms = computed(() => [...new Set(state.portalSmallOrders.map(order => order.platform).filter(Boolean))])
const shops = computed(() => [...new Set(state.portalSmallOrders.map(order => order.shop).filter(Boolean))])
const warehouses = PORTAL_WAREHOUSES
function targets() { return selectedIds.value.length ? currentOrders().filter(order => selectedIds.value.includes(order.id)) : rows.value }
function run(message, action) {
  const list = targets()
  if (!list.length) { ElMessage.warning('没有可操作的记录'); return }
  try { const result = action(list.map(order => order.id)); ElMessage.success(`${message}（${result ?? list.length} 笔）`); clearSelection() } catch (error) { ElMessage.error(error.message) }
}
async function runConfirm(message, title, action) {
  const list = targets()
  if (!list.length) { ElMessage.warning('没有可操作的记录'); return }
  try { await ElMessageBox.confirm(`${message}（共 ${list.length} 笔）`, title, { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  run(title, action)
}
async function editPallet() {
  const list = targets()
  if (!list.length) { ElMessage.warning('没有可操作的记录'); return }
  try {
    const { value } = await ElMessageBox.prompt('输入托盘号（可留空清除）；仅集货且尚未下发仓库的订单可修改。', '修改托盘号', { confirmButtonText: '确定', cancelButtonText: '取消', inputValue: list[0].palletNo || '' })
    updatePalletNo(list.map(order => order.id), value); ElMessage.success('托盘号已更新'); clearSelection()
  } catch (error) { if (error instanceof Error) ElMessage.error(error.message) }
}
// ---- 导入 ----
const importVisible = ref(false), importMode = ref('集货'), importText = ref(''), importPallet = ref(''), importWarehouse = ref(PORTAL_WAREHOUSES[0]), importProblems = ref([]), importCsv = ref('')
function openImport() {
  importMode.value = tab.value.includes('备货') ? '备货' : '集货'
  importText.value = ''; importPallet.value = ''; importWarehouse.value = PORTAL_WAREHOUSES[0]; importProblems.value = []; importCsv.value = ''
  importVisible.value = true
}
const importTemplate = ['订单号,商品名称,数量,单价,平台,店铺,商品ID（可选）', 'BC2609080009,合成商品甲,2,88.5,拼多多,联盛优品海外专营店,SKU-DEMO-101']
function downloadTemplate() {
  const blob = new Blob(['\ufeff' + importTemplate.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = '小订单导入模板（原型CSV）.csv'; link.click(); URL.revokeObjectURL(link.href)
}
function submitImport() {
  const result = importSmallOrders({ mode: importMode.value, rowsText: importText.value, palletNo: importPallet.value, warehouse: importWarehouse.value })
  if (!result.ok) { importProblems.value = result.problems; importCsv.value = result.failureCsv; ElMessage.error(`${result.totalProblems} 条问题订单，整份文件导入失败`); return }
  importVisible.value = false
  ElMessage.success(`导入 ${result.created.length} 笔；${result.poolCount ? `${result.poolCount} 笔进入订单池` : '全部进入对应列表'}`)
}
function downloadFailure() {
  const blob = new Blob([importCsv.value], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = '导入失败数据.csv'; link.click(); URL.revokeObjectURL(link.href)
}
function exportOrders() {
  const list = targets()
  if (!list.length) { ElMessage.warning('没有可导出的记录'); return }
  const header = ['订单编号', '业务类型', '模式', '托盘号', '仓库', '快递单号', '订购人', '订单商品总价', '仓库状态', '客户取消订单', '拦截情况', '退运结果', '下单时间']
  const lines = list.map(order => [order.orderNo, order.businessType, order.mode, order.palletNo, order.warehouse, order.expressNo, order.buyer, order.totalAmount, order.warehouseStatus, order.customerCancelled ? '是' : '否', order.intercept, order.returnResult, order.orderTime])
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = '\ufeff' + [header, ...lines].map(line => line.map(escape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${tab.value}-小订单.csv`; link.click(); URL.revokeObjectURL(link.href)
}
// ---- 绑定入库需求 ----
const bindVisible = ref(false), bindRequirementId = ref('')
const bindableRequirements = computed(() => state.portalRequirements.filter(requirement => !['已完成', '已取消'].includes(requirement.status) && requirement.reportStatus !== '已确认'))
function openBind() {
  if (!permission.value.smallOrder) return
  bindRequirementId.value = bindableRequirements.value[0]?.id || ''
  bindVisible.value = true
}
function submitBind() {
  try { bindRequirement(bindableRequirements.value.length ? targets().map(order => order.id) : [], bindRequirementId.value); bindVisible.value = false; ElMessage.success('已绑定入库需求'); clearSelection() } catch (error) { ElMessage.error(error.message) }
}
// ---- BBC 小订单（客户视图，只读） ----
const bbcRows = computed(() => state.bbcCustomerOrders)
function exportBbc() {
  const header = ['订单编号', '快递单号', '电商平台名称', '订单商品总价', '订购人', '预估税金', '海关税金', '下单时间', '预售类型', '订单状态', '清关状态', '仓库状态', '退货状态']
  const lines = bbcRows.value.map(order => [order.orderNo, order.expressNo, order.platform, order.paymentAmount, order.buyer, order.estimatedTax, order.customsTax, order.orderTime, order.presaleType, order.orderStatus, order.manifestStatus, order.warehouseStatus, order.returnStatus])
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = '\ufeff' + [header, ...lines].map(line => line.map(escape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'BBC小订单.csv'; link.click(); URL.revokeObjectURL(link.href)
}

// ---- 需求单 ----
const requirementVisible = ref(false), requirementDraft = ref(createRequirementDraft()), requirementId = ref(''), requirementErrors = ref({}), busy = ref(false)
const requirementDetailId = ref(''), requirementDetailVisible = ref(false)
const requirementDetail = computed(() => state.portalRequirements.find(row => row.id === requirementDetailId.value))
const newTypeVisible = ref(false), newType = ref('BC'), newMode = ref('集货')
function openNewRequirement() {
  if (!permission.value.requirement) return
  newType.value = 'BC'; newMode.value = '集货'; newTypeVisible.value = true
}
function createNewRequirement() {
  const draft = createRequirementDraft(newType.value, newMode.value)
  draft.createdAt = '待保存'
  requirementDraft.value = draft
  requirementId.value = ''
  requirementErrors.value = {}
  newTypeVisible.value = false
  requirementVisible.value = true
}
function openRequirement(draft) {
  requirementDraft.value = JSON.parse(JSON.stringify(draft))
  requirementId.value = draft.id
  requirementErrors.value = {}
  requirementVisible.value = true
}
const requirementSelectedOrders = computed(() => state.portalSmallOrders.filter(order => (requirementDraft.value.smallOrderIds || []).includes(order.id)))
const pairedType = computed(() => requirementId.value ? '编辑需求' : '新建需求')
function addRequirementGoods() { requirementDraft.value.goods.push(createRequirementGoodsRow()) }
function chooseRequirementCustomer(company) {
  const source = state.portalSmallOrders.find(order => (order.company || order.shop) === company)
  requirementDraft.value.customer = company
  requirementDraft.value.businessType = source?.businessType || requirementDraft.value.businessType
}
function attachRequirementFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  requirementDraft.value.attachments.push({ id: `RA-${Date.now()}`, type: '其他', name: file.name, size: file.size, uploader: orderSession.value.name, uploadedAt: '待保存' })
  event.target.value = ''
}
function saveRequirement(mode) {
  if (busy.value) return
  const errors = validateRequirementDraft(requirementDraft.value, { submit: mode === 'submit' })
  requirementErrors.value = errors
  if (Object.keys(errors).length) { ElMessage.error(Object.values(errors)[0]); return }
  busy.value = true
  try {
    const saved = savePortalRequirement(JSON.parse(JSON.stringify(requirementDraft.value)), requirementId.value)
    if (mode === 'submit') {
      const result = submitPortalRequirement(saved.id)
      ElMessage.success(`需求已提交，形成运营平台待接单记录 ${result.order.orderNo}；服务生成时点待确认`)
    } else ElMessage.success('需求已保存')
    requirementVisible.value = false
  } catch (error) { ElMessage.error(error.message) } finally { busy.value = false }
}
async function cancelRequirement(requirement) {
  try { await ElMessageBox.confirm('取消需求将同步运营平台；BBC 同步时点待确认。', '取消需求', { confirmButtonText: '取消需求', cancelButtonText: '返回', type: 'warning' }) } catch { return }
  try { cancelPortalRequirement(requirement.id); ElMessage.success('需求已取消') } catch (error) { ElMessage.error(error.message) }
}
async function removeRequirement(requirement) {
  try { await ElMessageBox.confirm('删除未提交需求，确认后不再显示。', '删除需求', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try { deletePortalRequirement(requirement.id); ElMessage.success('需求已删除') } catch (error) { ElMessage.error(error.message) }
}
// ---- 报告确认 ----
const reportVisible = ref(false), reportId = ref('')
const report = computed(() => state.portalReports.find(row => row.id === reportId.value))
function openReport(row) { reportId.value = row.id; reportVisible.value = true }
const reportRows = computed(() => state.portalReports)
const reportFilters = reactive({ inboundNo: '', reportType: '', warehouse: '', receiptNo: '', orderStatus: '', dateRange: [] })
const reportList = computed(() => reportRows.value.filter(row =>
  (!reportFilters.inboundNo || row.inboundNo === reportFilters.inboundNo.trim()) &&
  (!reportFilters.reportType || row.reportType === reportFilters.reportType) &&
  (!reportFilters.warehouse || row.warehouse === reportFilters.warehouse) &&
  (!reportFilters.receiptNo || row.receiptNo === reportFilters.receiptNo.trim()) &&
  (!reportFilters.orderStatus || row.status === reportFilters.orderStatus) &&
  (!reportFilters.dateRange?.length || (row.createdAt || '').slice(0, 10) >= reportFilters.dateRange[0] && (row.createdAt || '').slice(0, 10) <= reportFilters.dateRange[1])))
function reportAction(action, ...args) {
  try { action(...args); ElMessage.success('操作成功，结果已同步仓库') } catch (error) { ElMessage.error(error.message) }
}
watch(() => [orderSession.value.role, orderSession.value.name], () => { requirementVisible.value = false; reportVisible.value = false; bindVisible.value = false; importVisible.value = false })
</script>

<template>
  <div class="module-view">
    <PageHeader title="客户门户订单" description="订单池 · 小订单处置 · 物流需求单 · 收货理货确认">
      <template #actions>
        <el-button v-if="['BC集货', 'BC备货', 'CC集货', 'CC备货'].includes(tab)" :icon="Plus" @click="openImport">导入小订单</el-button>
        <el-button v-if="['BC集货', 'BC备货', 'CC集货', 'CC备货'].includes(tab)" @click="exportOrders">导出</el-button>
        <el-button v-if="tab === 'BBC小订单'" @click="exportBbc">导出</el-button>
        <el-button v-if="tab === '需求单'" v-business-write="'portalOrders'" type="primary" @click="openNewRequirement">新建需求</el-button>
      </template>
    </PageHeader>
    <el-alert class="portal-notice" title="客户侧动作（订单池标记、需求单、报告确认）在原型中由演示账号代执行；WMS 拦截、海关撤销、快递拦截与库存预占均为浏览器内本地模拟。服务生成时点冲突见分析清单 GJ-WORD-CROSS-C01。" type="info" :closable="false" />
    <el-tabs v-model="tab"><el-tab-pane v-for="value in tabs" :key="value" :label="value" :name="value" /></el-tabs>

    <template v-if="tab === 'BBC小订单'">
      <el-alert class="portal-notice" title="客户视图仅查看与导出，不提供取消、申报或下发按钮；BBC 取消入口缺失的跨篇缺口保留待确认。" type="info" :closable="false" />
      <DataTableFrame :rows="bbcRows" :page-size="50" :page-sizes="[20, 50]">
        <template #default="{ rows: pageRows }">
          <el-table :data="pageRows" stripe row-key="id" aria-label="BBC小订单客户视图">
            <el-table-column prop="orderNo" label="订单编号" width="165" />
            <el-table-column prop="expressNo" label="快递单号" width="140" />
            <el-table-column prop="platform" label="电商平台名称" width="100" />
            <el-table-column prop="paymentAmount" label="订单商品总价" width="110" />
            <el-table-column prop="buyer" label="订购人" width="100" />
            <el-table-column prop="estimatedTax" label="预估税金" width="90" />
            <el-table-column prop="customsTax" label="海关税金" width="90" />
            <el-table-column prop="orderTime" label="下单时间" width="150" />
            <el-table-column prop="presaleType" label="预售类型" width="90" />
            <el-table-column prop="orderStatus" label="订单状态" width="120" />
            <el-table-column prop="manifestStatus" label="清关状态" width="100" />
            <el-table-column prop="warehouseStatus" label="仓库状态" width="100" />
            <el-table-column prop="returnStatus" label="退货状态" width="100" />
          </el-table>
        </template>
      </DataTableFrame>
    </template>

    <template v-else-if="tab === '需求单'">
      <DataTableFrame :rows="state.portalRequirements" :page-size="50" :page-sizes="[20, 50]">
        <template #default="{ rows: pageRows }">
          <el-table :data="pageRows" stripe row-key="id" aria-label="需求单列表">
            <el-table-column label="需求订单号" width="165"><template #default="{ row }"><button class="link-button" @click="requirementDetailId = row.id; requirementDetailVisible = true">{{ row.orderNo }}</button></template></el-table-column>
            <el-table-column prop="requestType" label="需求类型" width="110" />
            <el-table-column prop="businessType" label="业务类型" width="90" />
            <el-table-column prop="mode" label="业务模式" width="100" />
            <el-table-column prop="transportMode" label="运输方式" width="100" />
            <el-table-column label="货物" min-width="180"><template #default="{ row }">{{ row.mode === '集货' ? `${row.smallOrderIds?.length || 0} 笔小订单` : (row.goods || []).map(good => `${good.name || good.productId}×${good.quantity}`).join('；') }}</template></el-table-column>
            <el-table-column label="服务" min-width="200"><template #default="{ row }">{{ (row.services || []).filter(service => service.selected).map(service => service.label).join('、') }}</template></el-table-column>
            <el-table-column prop="createdBy" label="建单人" width="90" />
            <el-table-column label="建单时间" width="150"><template #default="{ row }">{{ (row.createdAt || '').slice(0, 16) }}</template></el-table-column>
            <el-table-column label="状态" width="100"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
            <el-table-column label="操作" width="220" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="requirementDetailId = row.id; requirementDetailVisible = true">查看</el-button>
                <el-button v-business-write="'portalOrders'" v-if="row.status === '未提交' && permission.requirement" link type="primary" @click="openRequirement(row)">编辑</el-button>
                <el-button v-business-write="'portalOrders'" v-if="['未提交', '已拒接'].includes(row.status) && permission.requirement" link type="primary" @click="openRequirement(row)">重新提交</el-button>
                <el-button v-business-write="'portalOrders'" v-if="!['已完成', '已取消'].includes(row.status) && permission.requirement" link type="danger" @click="cancelRequirement(row)">取消</el-button>
                <el-button v-business-write="'portalOrders'" v-if="row.status === '未提交' && permission.requirement" link type="danger" @click="removeRequirement(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </DataTableFrame>
    </template>

    <template v-else-if="tab === '报告确认'">
      <form class="portal-filters" aria-label="报告查询" @submit.prevent>
        <label>入库单号<el-input v-model="reportFilters.inboundNo" clearable /></label>
        <label>报告类型<el-select v-model="reportFilters.reportType" clearable placeholder="全部"><el-option label="收货" value="收货" /><el-option label="理货" value="理货" /></el-select></label>
        <label>仓库<el-select v-model="reportFilters.warehouse" clearable placeholder="全部"><el-option v-for="value in warehouses" :key="value" :value="value" /></el-select></label>
        <label>收货/理货单号<el-input v-model="reportFilters.receiptNo" clearable /></label>
        <label>确认状态<el-select v-model="reportFilters.orderStatus" clearable placeholder="全部"><el-option v-for="value in ['待确认', '自动确认', '部分确认', '已确认', '已完成', '已驳回']" :key="value" :value="value" /></el-select></label>
        <label>收货/理货日期<el-date-picker v-model="reportFilters.dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
      </form>
      <DataTableFrame :rows="reportList" :page-size="50" :page-sizes="[20, 50]">
        <template #default="{ rows: pageRows }">
          <el-table :data="pageRows" stripe row-key="id" aria-label="仓库报告列表">
            <el-table-column prop="inboundNo" label="入库单号" width="160" />
            <el-table-column prop="reportType" label="报告类型" width="90" />
            <el-table-column prop="businessType" label="业务类型" width="90" />
            <el-table-column prop="mode" label="业务模式" width="90" />
            <el-table-column prop="warehouse" label="仓库" min-width="150" />
            <el-table-column label="需求订单" width="150"><template #default="{ row }">{{ state.portalRequirements.find(requirement => requirement.id === row.requirementId)?.orderNo || row.requirementId }}</template></el-table-column>
            <el-table-column prop="receiptNo" label="收货/理货单号" width="160" />
            <el-table-column label="批次" width="90"><template #default="{ row }">{{ row.batches.length }}</template></el-table-column>
            <el-table-column label="日期" width="150"><template #default="{ row }">{{ (row.batches[0]?.date || row.createdAt || '').slice(0, 10) }}</template></el-table-column>
            <el-table-column label="确认状态" width="110"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
            <el-table-column label="操作日期" width="160"><template #default="{ row }">{{ (row.confirmedAt || row.rejectedAt || '').slice(0, 16) || '待确认时不显示' }}</template></el-table-column>
            <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openReport(row)">查看</el-button></template></el-table-column>
          </el-table>
        </template>
      </DataTableFrame>
    </template>

    <template v-else>
      <div v-if="tab === '订单池'" class="portal-actions">
        <el-button v-business-write="'portalOrders'" :disabled="!permission.pool" @click="run('已标记集货', ids => markPoolOrders(ids, '集货'))">标记集货</el-button>
        <el-button v-business-write="'portalOrders'" :disabled="!permission.pool" @click="run('已标记备货', ids => markPoolOrders(ids, '备货'))">标记备货</el-button>
        <el-button v-business-write="'portalOrders'" :disabled="!permission.pool" @click="run('已取消', cancelPoolOrders)">取消</el-button>
        <el-button v-business-write="'portalOrders'" :disabled="!permission.pool" @click="run('已恢复', restorePoolOrders)">恢复</el-button>
        <span class="portal-hint">已选 {{ selectedIds.length }} 笔；未勾选时按当前查询结果执行。</span>
      </div>
      <div v-else class="portal-actions">
        <template v-if="tab.includes('集货')">
          <el-button v-business-write="'portalOrders'" :disabled="!permission.smallOrder" @click="editPallet">修改托盘号</el-button>
          <el-button v-business-write="'portalOrders'" :disabled="!permission.smallOrder" @click="openBind">绑定入库需求</el-button>
          <el-button v-business-write="'portalOrders'" :disabled="!permission.smallOrder" @click="run('已解绑', unbindRequirement)">解绑入库需求</el-button>
          <el-button v-business-write="'portalOrders'" :disabled="!permission.smallOrder" @click="runConfirm('转备货后进入备货列表，商品ID补齐规则待确认。', '集货转备货', convertToStock)">集货转备货</el-button>
          <el-button v-business-write="'portalOrders'" :disabled="!permission.smallOrder" @click="runConfirm('提交后进入新增入库需求，可继续补充包装汇总与服务。', '提交入库', ids => { const draft = submitInbound(ids); openRequirement(draft) })">提交入库</el-button>
        </template>
        <template v-else>
          <el-button v-business-write="'portalOrders'" :disabled="!permission.smallOrder" @click="runConfirm('全部商品库存充足才锁定并下发；任一不足则该订单缺货不下发。', '下发仓库', ids => dispatchStockOrders(ids))">下发仓库</el-button>
          <el-button v-business-write="'portalOrders'" :disabled="!permission.smallOrder" @click="runConfirm('下发前可转回集货；下发后不能修改托盘号或转换。', '备货转回集货', convertToPickup)">转回集货</el-button>
        </template>
        <el-button v-business-write="'portalOrders'" :disabled="!permission.smallOrder" @click="runConfirm('取消仅修改取消标记并提示外部拦截，不代表 WMS、海关或快递结果成功。', '取消订单', cancelSmallOrders)">取消</el-button>
        <el-button v-business-write="'portalOrders'" :disabled="!permission.smallOrder" @click="run('已恢复', restoreSmallOrders)">恢复</el-button>
        <el-button v-business-write="'portalOrders'" :disabled="!permission.smallOrder" @click="runConfirm('删除仅作用于尚未提交需求的合格订单。', '删除订单', deleteSmallOrders)">删除</el-button>
        <span class="portal-hint">已选 {{ selectedIds.length }} 笔；未勾选时按当前查询结果执行。</span>
      </div>
      <form class="portal-filters" aria-label="小订单筛选" @submit.prevent="query">
        <label>订单编号<el-input v-model="filters.orderNo" clearable placeholder="可换行多个" /></label>
        <label>入库/出库单号<el-input v-model="filters.inboundNo" clearable /></label>
        <label>总运/提单号<el-input v-model="filters.waybillNo" clearable /></label>
        <label>快递单号<el-input v-model="filters.expressNo" clearable /></label>
        <label>订购人<el-input v-model="filters.buyer" clearable /></label>
        <label>托盘号<el-input v-model="filters.palletNo" clearable /></label>
        <label>仓库<el-select v-model="filters.warehouse" clearable placeholder="全部"><el-option v-for="value in warehouses" :key="value" :value="value" /></el-select></label>
        <label>仓库状态<el-select v-model="filters.warehouseStatus" clearable placeholder="全部"><el-option v-for="value in [...COLLECT_STATUSES, ...STOCK_STATUSES]" :key="value" :value="value" /></el-select></label>
        <label>客户取消<el-select v-model="filters.customerCancelled" clearable placeholder="全部"><el-option label="是" value="true" /><el-option label="否" value="false" /></el-select></label>
        <label>拦截情况<el-select v-model="filters.intercept" clearable placeholder="全部"><el-option v-for="value in INTERCEPT_OPTIONS" :key="value" :value="value" /></el-select></label>
        <el-button link type="primary" @click="expanded = !expanded">{{ expanded ? '收起' : '展开' }}</el-button>
        <template v-if="expanded">
          <label>库存情况<el-select v-model="filters.stockStatus" clearable placeholder="全部"><el-option v-for="value in ['待检查', '有货', '缺货', '已锁库', '已释放']" :key="value" :value="value" /></el-select></label>
          <label>预售类型<el-select v-model="filters.presaleType" clearable placeholder="全部"><el-option label="现货" value="现货" /><el-option label="预售" value="预售" /></el-select></label>
          <label>电商平台<el-select v-model="filters.platform" clearable placeholder="全部"><el-option v-for="value in platforms" :key="value" :value="value" /></el-select></label>
          <label>店铺<el-select v-model="filters.shop" clearable placeholder="全部"><el-option v-for="value in shops" :key="value" :value="value" /></el-select></label>
          <label>下单时间<el-date-picker v-model="filters.orderRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
        </template>
        <el-button type="primary" native-type="submit">查询</el-button>
        <el-button @click="resetQuery">重置</el-button>
      </form>
      <DataTableFrame :rows="rows" :page-size="50" :page-sizes="[20, 50, 100]" selectable :selected-count="selectedIds.length">
        <template #default="{ rows: pageRows }">
          <el-table ref="table" :data="pageRows" stripe row-key="id" aria-label="小订单列表" @selection-change="items => selectedIds = items.map(item => item.id)">
            <el-table-column type="selection" reserve-selection width="46" />
            <el-table-column prop="orderNo" label="订单编号" width="150" fixed="left" />
            <el-table-column v-if="tab === '订单池'" prop="businessType" label="业务类型" width="90" />
            <el-table-column v-if="tab !== '订单池'" prop="mode" label="模式" width="70" />
            <el-table-column prop="customerCancelled" label="客户取消订单" width="105"><template #default="{ row }">{{ row.customerCancelled ? '是' : '否' }}</template></el-table-column>
            <el-table-column prop="palletNo" label="托盘号" width="130" />
            <el-table-column prop="company" label="电商企业" width="140" />
            <el-table-column prop="platform" label="电商平台" width="90" />
            <el-table-column prop="shop" label="店铺" min-width="130" />
            <el-table-column prop="warehouse" label="仓库" min-width="140" />
            <el-table-column prop="expressNo" label="快递单号" width="130" />
            <el-table-column prop="totalAmount" label="订单商品总价" width="110" />
            <el-table-column label="商品" min-width="160"><template #default="{ row }">{{ row.goods.map(good => `${good.name}×${good.quantity}`).join('；') }}</template></el-table-column>
            <el-table-column prop="buyer" label="订购人" width="100" />
            <el-table-column prop="warehouseStatus" label="仓库状态" width="100" />
            <el-table-column prop="customsStatus" label="关务状态" width="110" />
            <el-table-column prop="estimatedTax" label="预估税金" width="90" />
            <el-table-column v-if="tab.includes('备货')" prop="stockStatus" label="库存情况" width="95" />
            <el-table-column v-if="tab.includes('备货')" prop="presaleType" label="预售类型" width="90" />
            <el-table-column prop="intercept" label="拦截情况" width="95" />
            <el-table-column prop="returnResult" label="退运结果" width="100" />
            <el-table-column prop="orderTime" label="下单时间" width="150" />
            <el-table-column label="物流节点" width="300"><template #default="{ row }">{{ Object.entries(row.logistics || {}).map(([key, value]) => `${({ flightArrived: '航班到达', pickedUp: '货站提货', clearanceStarted: '开始清关', clearanceDone: '完成清关', expressHandover: '快递交接' })[key] || key}：${value}`).join('；') }}</template></el-table-column>
          </el-table>
        </template>
      </DataTableFrame>
    </template>

    <el-dialog v-model="importVisible" title="小订单导入" width="min(760px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item label="导入入口"><el-radio-group v-model="importMode"><el-radio label="集货">集货</el-radio><el-radio label="备货">备货</el-radio></el-radio-group></el-form-item>
        <el-form-item v-if="importMode === '集货'" label="托盘号（可选）"><el-input v-model="importPallet" /></el-form-item>
        <el-form-item v-else label="出库仓库" required><el-select v-model="importWarehouse"><el-option v-for="value in warehouses" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="订单数据"><el-input v-model="importText" type="textarea" :rows="6" placeholder="每行：订单号,商品名称,数量,单价,平台,店铺,商品ID（可选）" /></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" title="原型以粘贴文本替代 Excel 解析；模板字段、单号重复与同单一致性校验、任一不通过整份失败按 PRD 执行，正式解析与失败数据格式待确认。" />
      <div class="import-actions"><el-button @click="downloadTemplate">下载模板（原型CSV）</el-button><el-button v-if="importCsv" @click="downloadFailure">下载失败数据</el-button></div>
      <el-table v-if="importProblems.length" :data="importProblems" size="small" class="import-problems"><el-table-column prop="orderNo" label="问题订单号" width="180" /><el-table-column prop="reason" label="问题" min-width="220" /></el-table>
      <template #footer><el-button @click="importVisible = false">取消</el-button><el-button type="primary" @click="submitImport">确定</el-button></template>
    </el-dialog>

    <el-dialog v-model="bindVisible" title="绑定入库需求" width="min(560px, 96vw)" align-center>
      <el-form label-position="top"><el-form-item label="入库需求" required><el-select v-model="bindRequirementId"><el-option v-for="requirement in bindableRequirements" :key="requirement.id" :label="`${requirement.orderNo}（${requirement.status}）`" :value="requirement.id" /></el-select></el-form-item></el-form>
      <el-alert type="info" :closable="false" title="仅未绑定、未入库且目标需求收货报告尚未确认的订单可绑定；绑定后是否重算入库需求数量待确认。" />
      <template #footer><el-button @click="bindVisible = false">取消</el-button><el-button type="primary" :disabled="!bindableRequirements.length" @click="submitBind">绑定</el-button></template>
    </el-dialog>

    <el-dialog v-model="newTypeVisible" title="新建需求" width="min(460px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item label="业务类型" required><el-select v-model="newType"><el-option label="BC" value="BC" /><el-option label="CC" value="CC" /><el-option label="BBC" value="BBC" /></el-select></el-form-item>
        <el-form-item label="业务模式" required>
          <el-select v-model="newMode">
            <template v-if="newType === 'BBC'"><el-option v-for="value in BBC_REQUIREMENT_MODES" :key="value" :value="value" /></template>
            <template v-else><el-option label="集货" value="集货" /><el-option label="备货" value="备货" /></template>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="newTypeVisible = false">取消</el-button><el-button type="primary" @click="createNewRequirement">下一步</el-button></template>
    </el-dialog>

    <el-dialog v-model="requirementVisible" :title="pairedType" width="min(980px, 96vw)" align-center destroy-on-close>
      <el-form label-position="top" class="requirement-grid">
        <el-form-item label="需求订单号"><el-input :model-value="requirementDraft.orderNo || '保存后生成'" readonly /></el-form-item>
        <el-form-item label="业务类型" required :error="requirementErrors.businessType"><el-select v-model="requirementDraft.businessType" :disabled="Boolean(requirementId)"><el-option label="BC" value="BC" /><el-option label="CC" value="CC" /><el-option label="BBC" value="BBC" /></el-select></el-form-item>
        <el-form-item label="业务模式" required :error="requirementErrors.mode">
          <el-select v-model="requirementDraft.mode" :disabled="Boolean(requirementId)">
            <template v-if="requirementDraft.businessType === 'BBC'"><el-option v-for="value in BBC_REQUIREMENT_MODES" :key="value" :value="value" /></template>
            <template v-else><el-option label="集货" value="集货" /><el-option label="备货" value="备货" /></template>
          </el-select>
        </el-form-item>
        <el-form-item label="运输方式" required :error="requirementErrors.transportMode"><el-select v-model="requirementDraft.transportMode"><el-option v-for="value in ['非保税区', '监管仓库', '水路运输', '铁路运输', '公路运输', '航空运输', '邮件运输', '保税区', '保税仓库', '其它运输', '全部运输方式', '边境特殊海关作业区']" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="关区" required :error="requirementErrors.customsZone"><el-select v-model="requirementDraft.customsZone" filterable><el-option v-for="value in CUSTOMS_ZONES" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item v-if="requirementDraft.businessType === 'BBC'" label="仓库名称" required :error="requirementErrors.warehouse"><el-select v-model="requirementDraft.warehouse"><el-option v-for="value in warehouses" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item v-if="requirementDraft.businessType === 'BBC'" label="最终目的国" required :error="requirementErrors.finalDestinationCountry"><el-input v-model="requirementDraft.finalDestinationCountry" /></el-form-item>
        <el-form-item v-if="requirementDraft.businessType === 'BBC'" label="境外收发货人代码" required :error="requirementErrors.overseasShipperCode"><el-input v-model="requirementDraft.overseasShipperCode" /></el-form-item>
        <el-form-item v-if="requirementDraft.businessType === 'BBC'" label="境外收发货人名称" required :error="requirementErrors.overseasShipperName"><el-input v-model="requirementDraft.overseasShipperName" /></el-form-item>
        <el-form-item label="货物统称" required :error="requirementErrors.goodsTitle"><el-input v-model="requirementDraft.goodsTitle" maxlength="20" show-word-limit /></el-form-item>
        <el-form-item label="备注"><el-input v-model="requirementDraft.remark" maxlength="100" show-word-limit /></el-form-item>
      </el-form>
      <template v-if="requirementDraft.businessType !== 'BBC' && requirementDraft.mode === '集货'">
        <h4>集货小订单明细</h4>
        <el-table :data="requirementSelectedOrders" size="small" empty-text="未选择小订单">
          <el-table-column prop="orderNo" label="订单号" width="150" /><el-table-column prop="expressNo" label="快递单号" width="130" /><el-table-column prop="buyer" label="订购人" width="100" /><el-table-column label="订单重量" width="100"><template #default="{ row }">{{ row.goods.reduce((total, good) => total + (Number(good.quantity) || 0), 0) }}</template></el-table-column><el-table-column prop="expressCompany" label="快递公司" width="110" /><el-table-column prop="palletNo" label="托盘号" width="120" />
        </el-table>
        <div class="requirement-grid">
          <el-form-item label="件数" required :error="requirementErrors.packagePieces"><el-input v-model="requirementDraft.packagePieces" /></el-form-item>
          <el-form-item label="件数单位"><el-select v-model="requirementDraft.packageUnit"><el-option v-for="value in ['托', '箱', '包裹']" :key="value" :value="value" /></el-select></el-form-item>
          <el-form-item label="毛重（kg）" required :error="requirementErrors.packageWeight"><el-input v-model="requirementDraft.packageWeight" /></el-form-item>
          <el-form-item label="体积（m³）" required :error="requirementErrors.packageVolume"><el-input v-model="requirementDraft.packageVolume" /></el-form-item>
          <el-form-item label="长（cm）"><el-input v-model="requirementDraft.packageLength" /></el-form-item>
          <el-form-item label="宽（cm）"><el-input v-model="requirementDraft.packageWidth" /></el-form-item>
          <el-form-item label="高（cm）"><el-input v-model="requirementDraft.packageHeight" /></el-form-item>
        </div>
      </template>
      <template v-else>
        <h4>{{ requirementDraft.businessType === 'BBC' ? 'BBC 需求商品' : '备货商品明细' }}</h4>
        <el-table :data="requirementDraft.goods" size="small" empty-text="请添加商品">
          <el-table-column label="商品ID" width="140"><template #default="{ row }"><el-input v-model="row.productId" /></template></el-table-column>
          <el-table-column label="商品条形码" width="140"><template #default="{ row }"><el-input v-model="row.barcode" /></template></el-table-column>
          <el-table-column label="商品名称" min-width="130"><template #default="{ row }"><el-input v-model="row.name" /></template></el-table-column>
          <el-table-column label="数量" width="100"><template #default="{ row }"><el-input v-model="row.quantity" /></template></el-table-column>
          <el-table-column v-if="requirementDraft.businessType === 'BBC'" label="单价" width="100"><template #default="{ row }"><el-input v-model="row.unitPrice" /></template></el-table-column>
          <el-table-column label="生产日期" width="150"><template #default="{ row }"><el-date-picker v-model="row.productionDate" value-format="YYYY-MM-DD" /></template></el-table-column>
          <el-table-column label="失效日期" width="150"><template #default="{ row }"><el-date-picker v-model="row.expiryDate" value-format="YYYY-MM-DD" /></template></el-table-column>
          <el-table-column label="产品批次号" width="130"><template #default="{ row }"><el-input v-model="row.batchNo" /></template></el-table-column>
          <el-table-column label="托盘号" width="120"><template #default="{ row }"><el-input v-model="row.palletNo" /></template></el-table-column>
          <el-table-column label="操作" width="80"><template #default="{ $index }"><el-button link type="danger" @click="requirementDraft.goods.splice($index, 1)">删除</el-button></template></el-table-column>
        </el-table>
        <el-button size="small" @click="addRequirementGoods">添加商品</el-button>
      </template>
      <h4>服务选择</h4>
      <div v-for="service in requirementDraft.services" :key="service.key" class="service-line">
        <el-checkbox v-model="service.selected">{{ service.label }}</el-checkbox>
        <template v-if="service.key === 'trunk' && service.selected">
          <el-input v-model="service.fields.originPort" placeholder="启运港" style="width:120px" />
          <el-input v-model="service.fields.destinationPort" placeholder="目的港" style="width:120px" />
          <el-date-picker v-model="service.fields.expectedArrival" type="datetime" value-format="YYYY-MM-DD HH:mm" placeholder="预计到港时间" />
        </template>
        <template v-if="service.key === 'warehouse' && service.selected">
          <el-select v-model="service.fields.warehouse" placeholder="仓库名称" style="width:190px"><el-option v-for="value in warehouses" :key="value" :value="value" /></el-select>
        </template>
        <template v-if="service.key === 'transport' && service.selected">
          <el-input v-model="service.fields.pickupAddress" placeholder="提货地址" style="width:170px" />
          <el-date-picker v-model="service.fields.pickupTime" type="datetime" value-format="YYYY-MM-DD HH:mm" placeholder="提货时间" />
          <el-input v-model="service.fields.deliveryAddress" placeholder="送货地址" style="width:170px" />
          <el-date-picker v-model="service.fields.deliveryTime" type="datetime" value-format="YYYY-MM-DD HH:mm" placeholder="送货时间" />
        </template>
      </div>
      <template v-if="requirementDraft.businessType !== 'BBC' && requirementDraft.mode === '集货'">
        <el-form-item label="客户"><el-select :model-value="requirementDraft.customer" filterable @update:model-value="chooseRequirementCustomer"><el-option v-for="value in [...new Set(requirementSelectedOrders.map(order => order.company || order.shop).filter(Boolean))]" :key="value" :value="value" /></el-select></el-form-item>
      </template>
      <h4>附件资料</h4>
      <el-table :data="requirementDraft.attachments" size="small" empty-text="暂无附件"><el-table-column prop="type" label="附件类型" width="110" /><el-table-column prop="name" label="附件名称" min-width="200" /><el-table-column prop="uploadedAt" label="上传时间" width="150" /></el-table>
      <label class="upload-line">添加附件<input type="file" @change="attachRequirementFile" /></label>
      <template #footer>
        <el-button @click="requirementVisible = false">取消</el-button>
        <el-button v-business-write="'portalOrders'" :disabled="busy" @click="saveRequirement('save')">保存</el-button>
        <el-button v-business-write="'portalOrders'" type="primary" :disabled="busy" @click="saveRequirement('submit')">提交</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="requirementDetailVisible" title="需求详情" size="min(860px, 96vw)">
      <template v-if="requirementDetail">
        <div class="detail-hero"><div><small>需求订单号</small><h2>{{ requirementDetail.orderNo }}</h2><span>{{ requirementDetail.businessType }} · {{ requirementDetail.mode }}</span></div><StatusTag :label="requirementDetail.status" /></div>
        <section class="detail-section"><h3>基本信息</h3><dl class="detail-grid">
          <div v-for="[label, value] in [['业务类型', requirementDetail.businessType], ['业务模式', requirementDetail.mode], ['运输方式', requirementDetail.transportMode], ['关区', requirementDetail.customsZone], ['货物统称', requirementDetail.goodsTitle], ['建单人', requirementDetail.createdBy], ['建单时间', requirementDetail.createdAt], ['运营平台订单', requirementDetail.integratedOrderId], ['备注', requirementDetail.remark]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
        </dl></section>
        <section class="detail-section"><h3>货物</h3>
          <el-table v-if="requirementDetail.mode === '集货'" :data="state.portalSmallOrders.filter(order => (requirementDetail.smallOrderIds || []).includes(order.id))" size="small"><el-table-column prop="orderNo" label="订单号" width="150" /><el-table-column prop="expressNo" label="快递单号" width="130" /><el-table-column label="商品" min-width="180"><template #default="{ row }">{{ row.goods.map(good => `${good.name}×${good.quantity}`).join('；') }}</template></el-table-column><el-table-column prop="palletNo" label="托盘号" width="120" /></el-table>
          <el-table v-else :data="requirementDetail.goods" size="small" empty-text="暂无商品"><el-table-column prop="productId" label="商品ID" width="130" /><el-table-column prop="name" label="商品名称" min-width="130" /><el-table-column prop="quantity" label="数量" width="80" /><el-table-column prop="productionDate" label="生产日期" width="110" /><el-table-column prop="expiryDate" label="失效日期" width="110" /></el-table>
        </section>
        <section class="detail-section"><h3>服务</h3><el-table :data="(requirementDetail.services || []).filter(service => service.selected)" size="small" empty-text="未选择服务"><el-table-column prop="label" label="服务" width="120" /><el-table-column label="明细"><template #default="{ row }">{{ Object.values(row.fields || {}).filter(Boolean).join(' / ') || '—' }}</template></el-table-column></el-table>
        </section>
        <section class="detail-section"><h3>附件与仓库报告</h3>
          <el-table :data="requirementDetail.attachments || []" size="small" empty-text="暂无附件"><el-table-column prop="type" label="类型" width="110" /><el-table-column prop="name" label="名称" min-width="200" /></el-table>
          <el-table :data="state.portalReports.filter(row => row.requirementId === requirementDetail.id)" size="small" empty-text="暂无报告" class="report-link-table"><el-table-column prop="reportType" label="报告" width="80" /><el-table-column prop="receiptNo" label="单号" width="160" /><el-table-column prop="status" label="状态" width="110" /><el-table-column label="查看" width="90"><template #default="{ row }"><el-button link type="primary" @click="requirementDetailVisible = false; tab = '报告确认'; openReport(row)">查看</el-button></template></el-table-column></el-table>
        </section>
      </template>
    </el-drawer>

    <el-dialog v-model="reportVisible" title="仓库报告" width="min(1040px, 96vw)" align-center>
      <template v-if="report">
        <dl class="detail-grid report-head">
          <div v-for="[label, value] in [['报告类型', report.reportType], ['收货/理货单号', report.receiptNo], ['客户', report.customer], ['业务类型/模式', `${report.businessType} · ${report.mode}`], ['仓库', report.warehouse], ['入仓号', report.inboundNo], ['WMS 订单状态', report.wmsStatus], ['实收/通知托数', `${report.actualPallets ?? '—'} / ${report.notifiedPallets ?? '—'}`], ['正常/异常托数', `${report.normalPallets ?? '—'} / ${report.abnormalPallets ?? '—'}`]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
        </dl>
        <section v-for="batch in report.batches" :key="batch.id" class="detail-section batch-section">
          <h3>{{ batch.batchNo }} · {{ batch.date }}<StatusTag :label="(report.reportType === '收货' ? batch.confirmResult : batch.confirmStatus) || '待确认'" /></h3>
          <p class="help">操作人员：{{ batch.operator }}；复核人员：{{ batch.checker }}；确认时间：{{ batch.confirmedAt || '待确认' }}；{{ batch.remark }}</p>
          <p v-if="report.reportType === '收货'" class="help">收货结果：{{ batch.result }}；异常类型：{{ batch.abnormalType || '无' }}；车牌号：{{ batch.vehicle }}；司机：{{ batch.driver }}；预计/实收/异常数量：{{ batch.expectedQty }}/{{ batch.actualQty }}/{{ batch.abnormalQty }} {{ batch.unit }}；图片 {{ batch.images }} 张</p>
          <template v-else>
            <p class="help">集货汇总：容器 {{ batch.collection?.containers }}；包裹 {{ batch.collection?.packages }}；体积 {{ batch.collection?.volume }} m³；毛重 {{ batch.collection?.weight }} kg；尺寸 {{ batch.collection?.size }}</p>
            <el-table :data="batch.details" size="small">
              <el-table-column prop="productName" label="商品" min-width="140" />
              <el-table-column prop="tallyStatus" label="理货状态" width="90" />
              <el-table-column prop="abnormalType" label="异常类型" width="100" />
              <el-table-column prop="goodQty" label="正品数量" width="90" />
              <el-table-column prop="defectQty" label="不良品数量" width="100" />
              <el-table-column label="异常处理方式" width="200"><template #default="{ row }"><el-select v-if="row.abnormalType" v-model="row.handling" clearable placeholder="请填写"><el-option v-for="value in SHORTAGE_OPTIONS" :key="value" :value="value" /><el-option label="包装破损转正品" value="包装破损转正品" /></el-select><span v-else>—</span></template></el-table-column>
              <el-table-column prop="palletNo" label="托盘号" width="120" />
              <el-table-column prop="measuredAt" label="测量时间" width="140" />
              <el-table-column label="操作" width="200" fixed="right"><template #default="{ row }"><template v-if="row.abnormalType === '短溢'"><el-button v-business-write="'portalOrders'" link type="primary" @click="reportAction(setShortageHandling, report.id, batch.id, row.id, row.handling, 'confirm')">确认短溢</el-button><el-button v-business-write="'portalOrders'" link type="danger" @click="reportAction(setShortageHandling, report.id, batch.id, row.id, row.handling, 'reject')">驳回短溢</el-button></template><el-button v-if="row.abnormalType === '包装破损' && Number(row.defectQty) > 0" v-business-write="'portalOrders'" link type="primary" @click="reportAction(convertDamagedDetail, report.id, batch.id, row.id)">转正品</el-button></template></el-table-column>
            </el-table>
          </template>
          <div class="batch-actions">
            <template v-if="report.reportType === '收货'">
              <el-button v-business-write="'portalOrders'" :disabled="batch.result === '正常'" @click="reportAction(confirmReceiptReport, report.id, batch.id)">确认</el-button>
              <el-button v-business-write="'portalOrders'" type="danger" :disabled="batch.result === '正常'" @click="reportAction(rejectReceiptReport, report.id, batch.id)">驳回</el-button>
              <span v-if="batch.result === '正常'" class="help">正常收货由系统自动确认，不要求客户重复操作。</span>
            </template>
            <template v-else>
              <el-button v-business-write="'portalOrders'" @click="reportAction(confirmTallyReport, report.id, batch.id)">理货确认</el-button>
              <el-button v-business-write="'portalOrders'" type="danger" @click="reportAction(rejectTallyReport, report.id, batch.id)">理货驳回</el-button>
            </template>
          </div>
        </section>
      </template>
      <template #footer><el-button @click="reportVisible = false">返回</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.portal-notice { margin-bottom: 14px; }
.portal-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.portal-hint { color: var(--muted); font-size: 12px; }
.portal-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 16px; }
.portal-filters label { display: flex; flex-direction: column; gap: 8px; width: 180px; color: var(--muted); }
.portal-filters :deep(.el-date-editor) { width: 100%; }
.requirement-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 16px; }
.requirement-grid :deep(.el-input), .requirement-grid :deep(.el-select), .requirement-grid :deep(.el-date-editor) { width: 100%; }
.service-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
h4 { margin: 14px 0 8px; }
.import-actions { display: flex; gap: 8px; margin: 10px 0; }
.import-problems { margin-top: 8px; }
.upload-line { display: block; margin: 10px 0; color: var(--muted); font-size: 13px; }
.upload-line input { margin-left: 12px; }
.detail-hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.detail-hero h2 { margin: 4px 0; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 8px 18px; margin: 0; }
.detail-grid dt { color: var(--muted); font-size: 12px; }
.detail-grid dd { margin: 2px 0 10px; }
.report-head { margin: 6px 0 12px; }
.batch-section { border-top: 1px solid var(--border); }
.batch-section h3 { display: flex; align-items: center; gap: 8px; }
.batch-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.report-link-table { margin-top: 8px; }
.help { font-size: 12px; color: var(--muted); line-height: 1.7; }
@media (max-width: 700px) { .requirement-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
