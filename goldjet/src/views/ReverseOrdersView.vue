<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import BbcReturnQuantityDialog from '../components/BbcReturnQuantityDialog.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  REVERSE_NOW, VALUE_ADDED_ITEMS, VALUE_ADDED_STATUSES, airReturnEligibility, bcccReturnEligibility,
  reversePermissions, reverseServiceDraft, validateReturnSupplyRows, validateValueAddedComplete, valueAddedEligibility,
} from '../domain/reverseOrders.js'
import { canApplyBbcReturn, canArrangeBbcCancelReturn, canArrangeBbcConsumerReturn } from '../domain/bbcCustomerOrders.js'

const {
  state, bbcSession, createAirReturnOrder, createBcccReturnOrder, applyBbcReturn,
  saveReverseOrder, submitReverseOrder, cancelReverseOrder, deleteReverseOrder,
  createStockReturn, cancelStockReturn,
  acceptValueAdded, transferValueAdded, saveValueAdded, completeValueAdded, terminateValueAdded, cancelValueAdded,
} = usePrototypeData()
const permission = computed(() => reversePermissions(bbcSession.value.role))
const tabs = ['空运退运', 'BC/CC退运', 'BBC客退·消退', '退供与库存退运', '增值服务']
const tab = ref('空运退运')
const reverseRows = computed(() => state.reverseOrders.filter(order =>
  (tab.value === '空运退运' && order.category === '空运退运') ||
  (tab.value === 'BC/CC退运' && order.category === 'BC/CC退运') ||
  (tab.value === 'BBC客退·消退' && ['BBC客退', 'BBC消退'].includes(order.category)) ||
  (tab.value === '退供与库存退运' && ['退供', 'BBC库存退运'].includes(order.category))))

// ---- 逆向订单详情与草稿操作 ----
const detailId = ref(''), detailVisible = ref(false)
const detail = computed(() => state.reverseOrders.find(order => order.id === detailId.value))
function openDetail(order) { detailId.value = order.id; detailVisible.value = true }
async function submitDraft(order) {
  try { await ElMessageBox.confirm('提交后按服务下发规则生成服务单。', '提交逆向订单', { confirmButtonText: '提交', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try { submitReverseOrder(order.id); ElMessage.success('已提交') } catch (error) { ElMessage.error(error.message) }
}
async function cancelReverse(order) {
  try { await ElMessageBox.confirm('取消不代表海关撤销或仓库拦截成功；库存与费用按对应规则处理。', '取消逆向订单', { confirmButtonText: '取消订单', cancelButtonText: '返回', type: 'warning' }) } catch { return }
  try { cancelReverseOrder(order.id); ElMessage.success('已取消') } catch (error) { ElMessage.error(error.message) }
}
async function removeReverse(order) {
  try { await ElMessageBox.confirm('删除未提交订单，确认后不再显示。', '删除逆向订单', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try { deleteReverseOrder(order.id); ElMessage.success('已删除') } catch (error) { ElMessage.error(error.message) }
}

// ---- 空运退运发起 ----
const airPickerVisible = ref(false), airCreateVisible = ref(false), airSourceId = ref('')
const airTargets = computed(() => state.airOrders)
function openAirPicker() { airSourceId.value = ''; airPickerVisible.value = true }
function chooseAirSource(order) {
  const check = airReturnEligibility(order)
  if (!check.ok) { ElMessage.warning(check.message); return }
  airSourceId.value = order.id
  const source = state.airOrders.find(row => row.id === order.id)
  Object.assign(airDraft, { transportMode: source.booking?.transportMode || '空运', originPort: source.origin, destinationPort: source.destination, waybillNo: source.waybillNo || '', remark: '' })
  airDraft.expectedPieces = source.pieces || ''
  airDraft.services = reverseServiceDraft('空运退运')
  airPickerVisible.value = false; airCreateVisible.value = true
}
const airDraft = reactive({ transportMode: '空运', originPort: '', destinationPort: '', waybillNo: '', expectedPieces: '', remark: '', services: [] })
function submitAir(mode) {
  try {
    const created = createAirReturnOrder({ orderId: airSourceId.value, payload: { ...airDraft, services: JSON.parse(JSON.stringify(airDraft.services)) }, submit: mode === 'submit' })
    airCreateVisible.value = false
    ElMessage.success(mode === 'submit' ? '退运单已提交' : '退运单已保存')
    openDetail(created)
  } catch (error) { ElMessage.error(error.message) }
}
// ---- BC/CC 退运发起 ----
const bcccPickerVisible = ref(false), bcccCreateVisible = ref(false), bcccIds = ref([]), bcccTable = ref()
const bcccTargets = computed(() => state.portalSmallOrders)
const bcccDraft = reactive({ transportMode: '公路运输', originPort: 'CAN', destinationPort: 'HKG', waybillNo: '', remark: '', services: [] })
function openBcccPicker() { bcccIds.value = []; bcccPickerVisible.value = true }
function chooseBccc() {
  const orders = state.portalSmallOrders.filter(order => bcccIds.value.includes(order.id))
  const check = bcccReturnEligibility(orders)
  if (!check.ok) { ElMessage.warning(check.message); return }
  bcccDraft.transportMode = '公路运输'; bcccDraft.waybillNo = ''; bcccDraft.remark = ''
  bcccDraft.services = reverseServiceDraft('BC/CC退运')
  bcccPickerVisible.value = false; bcccCreateVisible.value = true
}
function submitBccc(mode) {
  try {
    const created = createBcccReturnOrder({ smallOrderIds: bcccIds.value, payload: { ...bcccDraft, services: JSON.parse(JSON.stringify(bcccDraft.services)) }, submit: mode === 'submit' })
    bcccCreateVisible.value = false
    ElMessage.success(mode === 'submit' ? '退运单已提交，小订单退运结果为退运中' : '退运单已保存')
    openDetail(created)
  } catch (error) { ElMessage.error(error.message) }
}
// ---- BBC 客退/消退 ----
const returnDialog = ref()
const bbcReturnable = computed(() => state.bbcCustomerOrders.filter(order => canArrangeBbcConsumerReturn(order).ok || canArrangeBbcCancelReturn(order).ok || canApplyBbcReturn(order).ok))
function arrange(kind, order) {
  const check = kind === 'consumer' ? canArrangeBbcConsumerReturn(order) : canArrangeBbcCancelReturn(order)
  if (!check.ok) { ElMessage.warning(check.message); return }
  returnDialog.value.open(order, kind)
}
function applyReturn(order) {
  try { applyBbcReturn(order.id); ElMessage.success('退货申请已发送（本地模拟），列表退货状态更新为海关入库') } catch (error) { ElMessage.error(error.message) }
}
// ---- 退供与库存退运 ----
const stockVisible = ref(false)
const stockDraft = reactive({ entrance: 'portal-bccc', businessType: 'BC进口退供', warehouse: '南沙保税仓 WH002', remark: '', rows: [], services: [] })
const stockErrors = computed(() => validateReturnSupplyRows(stockDraft.rows, { warehouse: stockDraft.warehouse, stock: state.portalStock }))
const stockChoices = computed(() => state.portalStock.filter(entry => entry.warehouse === stockDraft.warehouse))
function openStock() {
  stockDraft.entrance = 'portal-bccc'; stockDraft.businessType = 'BC进口退供'; stockDraft.warehouse = '南沙保税仓 WH002'; stockDraft.remark = ''
  stockDraft.rows = []; stockDraft.services = reverseServiceDraft('退供')
  stockVisible.value = true
}
function changeStockEntrance() {
  const bbc = stockDraft.entrance === 'ops-bbc'
  stockDraft.businessType = bbc ? 'BBC进口' : (stockDraft.entrance === 'portal-bbc' ? 'BBC进口' : 'BC进口退供')
  stockDraft.services = reverseServiceDraft(bbc || stockDraft.entrance === 'portal-bbc' ? 'BBC库存退运' : '退供')
}
function addStockRow() { stockDraft.rows.push({ barcode: '', productId: '', name: '', goodQty: 0, defectQty: 0, batchNo: '' }) }
function chooseStockProduct(row, barcode) {
  const entry = stockChoices.value.find(item => item.barcode === barcode)
  if (!entry) return
  row.productId = entry.productId; row.name = entry.name
}
function submitStock(mode) {
  if (Object.keys(stockErrors.value).length) { ElMessage.error(Object.values(stockErrors.value)[0]); return }
  try {
    const created = createStockReturn({ entrance: stockDraft.entrance, businessType: stockDraft.businessType, warehouse: stockDraft.warehouse, rows: JSON.parse(JSON.stringify(stockDraft.rows)), payload: { remark: stockDraft.remark, services: JSON.parse(JSON.stringify(stockDraft.services)) }, submit: mode === 'submit' })
    stockVisible.value = false
    ElMessage.success(mode === 'submit' ? '需求已提交并预占库存' : '已保存并预占库存')
    openDetail(created)
  } catch (error) { ElMessage.error(error.message) }
}
async function cancelStock(order) {
  try { await ElMessageBox.confirm('取消是否释放预占库存取决于取消入口和下游服务状态。', '取消退供/库存退运', { confirmButtonText: '取消订单', cancelButtonText: '返回', type: 'warning' }) } catch { return }
  try { cancelStockReturn(order.id); ElMessage.success('已取消；释放结果见操作历史') } catch (error) { ElMessage.error(error.message) }
}

// ---- 增值服务 ----
const valueStatus = ref('总计')
const valueFilters = reactive({ serviceNo: '', orderNo: '', businessType: '', serviceItem: '', customer: '', salesperson: '', supplier: '', department: '', createdRange: [] })
const valueRows = computed(() => state.valueAddedServices.filter(service =>
  (!valueFilters.serviceNo || service.id.includes(valueFilters.serviceNo.trim())) &&
  (!valueFilters.orderNo || service.orderNo.includes(valueFilters.orderNo.trim())) &&
  (!valueFilters.businessType || service.businessType === valueFilters.businessType) &&
  (!valueFilters.serviceItem || service.serviceItem === valueFilters.serviceItem) &&
  (!valueFilters.customer || service.customer === valueFilters.customer) &&
  (!valueFilters.salesperson || service.salesperson === valueFilters.salesperson) &&
  (!valueFilters.supplier || service.supplier === valueFilters.supplier) &&
  (!valueFilters.department || service.department === valueFilters.department) &&
  (!valueFilters.createdRange?.length || (service.createdAt || '').slice(0, 10) >= valueFilters.createdRange[0] && (service.createdAt || '').slice(0, 10) <= valueFilters.createdRange[1])))
const valueStatusRows = computed(() => valueRows.value.filter(service => valueStatus.value === '总计' || service.status === valueStatus.value))
const valueCounts = computed(() => Object.fromEntries(['总计', ...VALUE_ADDED_STATUSES].map(status => [status, status === '总计' ? valueRows.value.length : valueRows.value.filter(service => service.status === status).length])))
const valueSelected = ref([]), valueTable = ref()
function valueTargets() { return valueSelected.value.length ? valueSelected.value.map(id => state.valueAddedServices.find(service => service.id === id)).filter(Boolean) : valueStatusRows.value }
function runValue(message, action) {
  const list = valueTargets()
  if (!list.length) { ElMessage.warning('没有可处理的增值服务单'); return }
  try { action(list.map(service => service.id)); ElMessage.success(`${message}（外部/计费结果按待确认边界保留）`); valueSelected.value = []; valueTable.value?.clearSelection() } catch (error) { ElMessage.error(error.message) }
}
const transferVisible = ref(false), transferMode = ref('department'), transferTarget = ref('')
function openTransfer() {
  const list = valueTargets().filter(service => service.status === '进行中' && service.handler === bbcSession.value.name)
  if (!list.length) { ElMessage.warning('仅本人接单且进行中的记录可流转'); return }
  transferMode.value = 'department'; transferTarget.value = ''; transferVisible.value = true
}
function submitTransfer() {
  try { transferValueAdded(valueTargets().map(service => service.id), { mode: transferMode.value, target: transferTarget.value }); transferVisible.value = false; ElMessage.success('已流转') } catch (error) { ElMessage.error(error.message) }
}
const valueDetailId = ref(''), valueDetailVisible = ref(false)
const valueDetail = computed(() => state.valueAddedServices.find(service => service.id === valueDetailId.value))
const valueEdit = reactive({ outsourced: '否', outsourcedSupplier: '', handler: '', startAt: '', finishAt: '', result: '', remark: '', attachments: [] })
function openValueDetail(service) {
  valueDetailId.value = service.id
  Object.assign(valueEdit, { outsourced: service.outsourced || '否', outsourcedSupplier: service.outsourcedSupplier || '', handler: service.handler || '', startAt: service.startAt || '', finishAt: service.finishAt || '', result: service.result || '', remark: service.remark || '', attachments: JSON.parse(JSON.stringify(service.attachments || [])) })
  valueDetailVisible.value = true
}
const canEditValue = computed(() => valueDetail.value ? valueAddedEligibility(valueDetail.value, bbcSession.value.role).edit : false)
function saveValue() {
  try { saveValueAdded(valueDetailId.value, { ...valueEdit }); ElMessage.success('已保存，状态不变') } catch (error) { ElMessage.error(error.message) }
}
function completeValue() {
  const check = valueDetail.value ? validateValueAddedComplete({ ...valueDetail.value, ...valueEdit }) : {}
  if (Object.keys(check).length) { ElMessage.error(Object.values(check)[0]); return }
  try { saveValueAdded(valueDetailId.value, { ...valueEdit }); completeValueAdded(valueDetailId.value); ElMessage.success('服务已完成') } catch (error) { ElMessage.error(error.message) }
}
function addValueAttachment(event) {
  const file = event.target.files?.[0]
  if (!file) return
  valueEdit.attachments.push({ id: `VA-${Date.now()}`, name: file.name, size: file.size })
  event.target.value = ''
}
watch(() => [bbcSession.value.role, bbcSession.value.name], () => { detailVisible.value = false; valueDetailVisible.value = false; airCreateVisible.value = false; bcccCreateVisible.value = false; stockVisible.value = false })
</script>

<template>
  <div class="module-view">
    <PageHeader title="逆向订单与增值服务" description="退运 · 退供 · 客退 · 消退 · 增值服务作业">
      <template #actions>
        <template v-if="tab === '空运退运'"><el-button v-business-write="'reverseOrders'" type="primary" :disabled="!permission.createReturn" @click="openAirPicker">发起退运</el-button></template>
        <template v-if="tab === 'BC/CC退运'"><el-button v-business-write="'reverseOrders'" type="primary" :disabled="!permission.createReturn" @click="openBcccPicker">发起退运</el-button></template>
        <template v-if="tab === '退供与库存退运'"><el-button v-business-write="'reverseOrders'" type="primary" :disabled="!permission.createStockReturn" @click="openStock">新建退供 / 库存退运</el-button></template>
      </template>
    </PageHeader>
    <el-alert class="reverse-notice" title="退运单、退供与库存预占为浏览器内本地记录：海关删单、WMS 拦截、撤销回执与实物出库均未接入；增值服务计费结果引用财务待确认。" type="info" :closable="false" />
    <el-tabs v-model="tab">
      <el-tab-pane v-for="value in tabs" :key="value" :label="value" :name="value" />
    </el-tabs>

    <template v-if="tab !== '增值服务'">
      <DataTableFrame :rows="reverseRows" :page-size="50" :page-sizes="[20, 50]">
        <template #default="{ rows: pageRows }">
          <el-table :data="pageRows" stripe row-key="id" aria-label="逆向订单列表">
            <el-table-column label="逆向订单号" width="165" fixed="left"><template #default="{ row }"><button class="link-button" @click="openDetail(row)">{{ row.orderNo }}</button></template></el-table-column>
            <el-table-column prop="category" label="类别" width="115" />
            <el-table-column prop="businessType" label="业务类型" width="120" />
            <el-table-column prop="sourceLabel" label="关联原订单 / 小订单" min-width="180" />
            <el-table-column prop="customer" label="客户" min-width="130" />
            <el-table-column prop="transportMode" label="运输方式" width="95" />
            <el-table-column prop="waybillNo" label="总运/提单号" width="140" />
            <el-table-column label="货物" min-width="170"><template #default="{ row }">{{ row.goods.map(good => `${good.name}×${good.quantity}`).join('；') }}</template></el-table-column>
            <el-table-column prop="returnResult" label="退运/退货结果" width="120" />
            <el-table-column label="状态" width="100"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
            <el-table-column prop="creator" label="建单人" width="90" />
            <el-table-column label="建单时间" width="150"><template #default="{ row }">{{ (row.createdAt || '').slice(0, 16) }}</template></el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openDetail(row)">查看</el-button>
                <el-button v-business-write="'reverseOrders'" v-if="row.status === '未提交' && permission.createReturn" link type="primary" @click="submitDraft(row)">提交</el-button>
                <el-button v-business-write="'reverseOrders'" v-if="['待接单', '进行中'].includes(row.status) && permission.createReturn" link type="danger" @click="['退供', 'BBC库存退运'].includes(row.category) ? cancelStock(row) : cancelReverse(row)">取消</el-button>
                <el-button v-business-write="'reverseOrders'" v-if="row.status === '未提交' && permission.createReturn" link type="danger" @click="removeReverse(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </DataTableFrame>
      <section v-if="tab === 'BBC客退·消退'" class="detail-section">
        <h3>BBC 小订单退货入口</h3>
        <p class="help">客退要求客户取消订单为是；消退要求退货状态为海关入库；退货申请要求在清单放行起 30 天内且客户取消标识为是。</p>
        <el-table :data="bbcReturnable" size="small" empty-text="当前没有可发起退货的 BBC 小订单">
          <el-table-column prop="orderNo" label="订单号" width="165" />
          <el-table-column prop="buyer" label="订购人" width="100" />
          <el-table-column label="商品" min-width="180"><template #default="{ row }">{{ row.goods.map(good => `${good.name}×${good.quantity}`).join('；') }}</template></el-table-column>
          <el-table-column prop="customerCancelled" label="客户取消" width="90"><template #default="{ row }">{{ row.customerCancelled ? '是' : '否' }}</template></el-table-column>
          <el-table-column prop="returnDeadline" label="截止退货日期" width="120" />
          <el-table-column prop="returnStatus" label="退货状态" width="100" />
          <el-table-column label="操作" width="230"><template #default="{ row }"><el-button v-business-write="'reverseOrders'" link type="primary" :disabled="!canArrangeBbcConsumerReturn(row).ok" @click="arrange('consumer', row)">安排客退</el-button><el-button v-business-write="'reverseOrders'" link type="primary" :disabled="!canArrangeBbcCancelReturn(row).ok" @click="arrange('cancel', row)">安排消退</el-button><el-button v-business-write="'reverseOrders'" link type="primary" :disabled="!canApplyBbcReturn(row).ok" @click="applyReturn(row)">退货申请</el-button></template></el-table-column>
        </el-table>
      </section>
    </template>

    <template v-else>
      <div class="value-nav">
        <el-button v-for="status in ['总计', ...VALUE_ADDED_STATUSES]" :key="status" size="small" :type="valueStatus === status ? 'primary' : ''" @click="valueStatus = status">{{ status }}（{{ valueCounts[status] }}）</el-button>
      </div>
      <div class="value-actions">
        <el-button v-business-write="'reverseOrders'" :disabled="!permission.handleValueAdded" @click="runValue('已接单', acceptValueAdded)">接单</el-button>
        <el-button v-business-write="'reverseOrders'" :disabled="!permission.handleValueAdded" @click="openTransfer">流转</el-button>
        <el-button v-business-write="'reverseOrders'" :disabled="!permission.handleValueAdded" @click="runValue('已终止', terminateValueAdded)">终止服务</el-button>
        <el-button v-business-write="'reverseOrders'" :disabled="!permission.handleValueAdded" @click="runValue('已取消', cancelValueAdded)">取消服务</el-button>
        <span class="help">未勾选时按当前查询结果处理；接单/流转按本人资格逐条过滤。</span>
      </div>
      <form class="value-filters" aria-label="增值服务筛选" @submit.prevent>
        <label>服务订单号<el-input v-model="valueFilters.serviceNo" clearable /></label>
        <label>订单号<el-input v-model="valueFilters.orderNo" clearable /></label>
        <label>业务类型<el-select v-model="valueFilters.businessType" clearable placeholder="全部"><el-option v-for="value in ['普货', 'BC', 'CC', 'BBC']" :key="value" :value="value" /></el-select></label>
        <label>服务项<el-select v-model="valueFilters.serviceItem" clearable placeholder="全部"><el-option v-for="value in VALUE_ADDED_ITEMS" :key="value" :value="value" /></el-select></label>
        <label>客户<el-input v-model="valueFilters.customer" clearable /></label>
        <label>业务员<el-input v-model="valueFilters.salesperson" clearable /></label>
        <label>供应商<el-input v-model="valueFilters.supplier" clearable /></label>
        <label>内部部门<el-input v-model="valueFilters.department" clearable /></label>
        <label>建单日期<el-date-picker v-model="valueFilters.createdRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
      </form>
      <DataTableFrame :rows="valueStatusRows" :page-size="50" :page-sizes="[20, 50, 100]" selectable :selected-count="valueSelected.length">
        <template #default="{ rows: pageRows }">
          <el-table ref="valueTable" :data="pageRows" stripe row-key="id" aria-label="增值服务列表" @selection-change="items => valueSelected = items.map(item => item.id)">
            <el-table-column type="selection" reserve-selection width="46" />
            <el-table-column label="服务订单号" width="170" fixed="left"><template #default="{ row }"><button class="link-button" @click="openValueDetail(row)">{{ row.id }}</button></template></el-table-column>
            <el-table-column prop="orderNo" label="订单号" width="165" />
            <el-table-column prop="businessType" label="业务类型" width="90" />
            <el-table-column prop="serviceItem" label="服务项" width="90" />
            <el-table-column prop="supplier" label="供应商" width="110" />
            <el-table-column prop="department" label="内部部门" width="100" />
            <el-table-column prop="customer" label="客户" min-width="130" />
            <el-table-column prop="salesperson" label="业务员" width="90" />
            <el-table-column prop="createdBy" label="建单人" width="90" />
            <el-table-column label="建单时间" width="150"><template #default="{ row }">{{ (row.createdAt || '').slice(0, 16) }}</template></el-table-column>
            <el-table-column prop="updatedBy" label="最后修改人" width="110" />
            <el-table-column label="最后修改时间" width="150"><template #default="{ row }">{{ (row.updatedAt || '').slice(0, 16) }}</template></el-table-column>
            <el-table-column prop="handler" label="处理人" width="110" />
            <el-table-column label="状态" width="100"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
            <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openValueDetail(row)">详情</el-button></template></el-table-column>
          </el-table>
        </template>
      </DataTableFrame>
    </template>

    <BbcReturnQuantityDialog ref="returnDialog" />

    <el-dialog v-model="airPickerVisible" title="选择原空运订单" width="min(760px, 96vw)" align-center>
      <el-table :data="airTargets" size="small" empty-text="没有空运订单">
        <el-table-column prop="orderNo" label="订单号" width="185" />
        <el-table-column prop="customer" label="客户" min-width="130" />
        <el-table-column prop="orderStatus" label="订单状态" width="110" />
        <el-table-column label="可发起退运" width="110"><template #default="{ row }">{{ airReturnEligibility(row).ok ? '是' : '否' }}</template></el-table-column>
        <el-table-column label="操作" width="110"><template #default="{ row }"><el-button link type="primary" :disabled="!airReturnEligibility(row).ok" @click="chooseAirSource(row)">选择</el-button></template></el-table-column>
      </el-table>
      <el-alert type="info" :closable="false" title="仅进行中、已完成或已取消的原订单可发起退运；多个客户分单时先选择分单（原型中无分单的空运订单直接进入建单）。" />
    </el-dialog>
    <el-dialog v-model="airCreateVisible" title="空运退运建单" width="min(820px, 96vw)" align-center>
      <el-form label-position="top" class="reverse-grid">
        <el-form-item label="业务类型"><el-input model-value="出口退运" readonly /></el-form-item>
        <el-form-item label="运输方式"><el-select v-model="airDraft.transportMode"><el-option v-for="value in ['空运', '海运', '陆运']" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="启运港"><el-input v-model="airDraft.originPort" /></el-form-item>
        <el-form-item label="目的港"><el-input v-model="airDraft.destinationPort" /></el-form-item>
        <el-form-item label="总运单号"><el-input v-model="airDraft.waybillNo" /></el-form-item>
        <el-form-item label="预计件数（不得大于原订单数量，跨量纲上限待确认）"><el-input v-model="airDraft.expectedPieces" /></el-form-item>
        <el-form-item label="服务信息" class="span-2"><el-checkbox v-for="service in airDraft.services" :key="service.key" v-model="service.selected">{{ service.label }}</el-checkbox></el-form-item>
        <el-form-item label="备注" class="span-2"><el-input v-model="airDraft.remark" type="textarea" maxlength="100" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button @click="airCreateVisible = false">取消</el-button><el-button v-business-write="'reverseOrders'" @click="submitAir('save')">保存</el-button><el-button v-business-write="'reverseOrders'" type="primary" @click="submitAir('submit')">提交</el-button></template>
    </el-dialog>

    <el-dialog v-model="bcccPickerVisible" title="选择 BC/CC 小订单" width="min(860px, 96vw)" align-center>
      <el-table ref="bcccTable" :data="bcccTargets" size="small" row-key="id" @selection-change="items => bcccIds = items.map(item => item.id)">
        <el-table-column type="selection" width="46" :selectable="row => row.customerCancelled" />
        <el-table-column prop="orderNo" label="订单号" width="150" />
        <el-table-column prop="businessType" label="类型" width="70" />
        <el-table-column prop="mode" label="模式" width="70" />
        <el-table-column prop="buyer" label="订购人" width="100" />
        <el-table-column label="客户取消" width="90"><template #default="{ row }">{{ row.customerCancelled ? '是' : '否' }}</template></el-table-column>
        <el-table-column label="货物" min-width="160"><template #default="{ row }">{{ row.goods.map(good => `${good.name}×${good.quantity}`).join('；') }}</template></el-table-column>
      </el-table>
      <el-alert type="info" :closable="false" title="客户取消订单必须为是；同批业务模式需一致；BC 与 CC 分别发起，不能混合生成一个退运订单。" />
      <template #footer><el-button @click="bcccPickerVisible = false">取消</el-button><el-button type="primary" :disabled="!bcccIds.length" @click="chooseBccc">下一步</el-button></template>
    </el-dialog>
    <el-dialog v-model="bcccCreateVisible" title="BC/CC 退运建单" width="min(820px, 96vw)" align-center>
      <el-form label-position="top" class="reverse-grid">
        <el-form-item label="业务类型"><el-input :model-value="state.portalSmallOrders.find(order => bcccIds.includes(order.id))?.businessType === 'CC' ? 'CC进口退运' : 'BC进口退运'" readonly /></el-form-item>
        <el-form-item label="业务模式"><el-input :model-value="state.portalSmallOrders.find(order => bcccIds.includes(order.id))?.mode" readonly /></el-form-item>
        <el-form-item label="运输方式"><el-select v-model="bcccDraft.transportMode"><el-option v-for="value in ['公路运输', '航空运输', '水路运输']" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="启运港"><el-input v-model="bcccDraft.originPort" /></el-form-item>
        <el-form-item label="目的港（已明确承接目的仓为香港仓）"><el-input v-model="bcccDraft.destinationPort" /></el-form-item>
        <el-form-item label="服务信息" class="span-2"><el-checkbox v-for="service in bcccDraft.services" :key="service.key" v-model="service.selected">{{ service.label }}</el-checkbox></el-form-item>
        <el-form-item label="备注" class="span-2"><el-input v-model="bcccDraft.remark" type="textarea" maxlength="100" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button @click="bcccCreateVisible = false">取消</el-button><el-button v-business-write="'reverseOrders'" @click="submitBccc('save')">保存</el-button><el-button v-business-write="'reverseOrders'" type="primary" @click="submitBccc('submit')">提交</el-button></template>
    </el-dialog>

    <el-dialog v-model="stockVisible" title="退供 / 库存退运" width="min(980px, 96vw)" align-center>
      <el-form label-position="top" class="reverse-grid">
        <el-form-item label="入口"><el-select v-model="stockDraft.entrance" @change="changeStockEntrance"><el-option label="客户门户 BC/CC 退供" value="portal-bccc" /><el-option label="客户门户 BBC 退运" value="portal-bbc" /><el-option label="运营平台 BBC 退运" value="ops-bbc" /></el-select></el-form-item>
        <el-form-item label="业务类型"><el-input v-model="stockDraft.businessType" readonly /></el-form-item>
        <el-form-item label="仓库"><el-select v-model="stockDraft.warehouse"><el-option v-for="value in ['南沙保税仓 WH002', '广州保税仓 WH001']" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="备注"><el-input v-model="stockDraft.remark" maxlength="100" /></el-form-item>
      </el-form>
      <el-table :data="stockDraft.rows" size="small" empty-text="请添加商品">
        <el-table-column label="商品条码" width="190"><template #default="{ row }"><el-select v-model="row.barcode" filterable placeholder="选择已备货商品" @change="value => chooseStockProduct(row, value)"><el-option v-for="entry in stockChoices" :key="entry.barcode" :label="`${entry.barcode}（良品 ${entry.good} / 不良 ${entry.defective}）`" :value="entry.barcode" /></el-select></template></el-table-column>
        <el-table-column prop="productId" label="商品ID" width="130" />
        <el-table-column prop="name" label="商品名称" min-width="140" />
        <el-table-column label="退供良品数量" width="130"><template #default="{ row }"><el-input-number v-model="row.goodQty" :min="0" :step="1" size="small" /></template></el-table-column>
        <el-table-column label="退供不良品数量" width="140"><template #default="{ row }"><el-input-number v-model="row.defectQty" :min="0" :step="1" size="small" /></template></el-table-column>
        <el-table-column label="批次号" width="150"><template #default="{ row }"><el-input v-model="row.batchNo" /></template></el-table-column>
        <el-table-column label="操作" width="80"><template #default="{ $index }"><el-button link type="danger" @click="stockDraft.rows.splice($index, 1)">删除</el-button></template></el-table-column>
      </el-table>
      <el-button size="small" @click="addStockRow">添加商品</el-button>
      <p v-if="Object.keys(stockErrors).length" class="stock-error">{{ Object.values(stockErrors)[0] }}</p>
      <p class="help">提交时校验并预占库存：门户 BC/CC 退供校验 WMS；BBC 退运同时校验账册与 WMS。取消是否释放按入口和下游服务状态判定。</p>
      <template #footer><el-button @click="stockVisible = false">取消</el-button><el-button v-business-write="'reverseOrders'" @click="submitStock('save')">保存</el-button><el-button v-business-write="'reverseOrders'" type="primary" @click="submitStock('submit')">提交</el-button></template>
    </el-dialog>

    <el-dialog v-model="transferVisible" title="流转增值服务" width="min(460px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item label="流转方式"><el-radio-group v-model="transferMode"><el-radio label="department">给部门所有人员（重置待接单）</el-radio><el-radio label="person">给同组织部门指定人</el-radio></el-radio-group></el-form-item>
        <el-form-item v-if="transferMode === 'person'" label="指定处理人"><el-input v-model="transferTarget" placeholder="输入同组织部门人员" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="transferVisible = false">取消</el-button><el-button type="primary" @click="submitTransfer">确定</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="逆向订单详情" size="min(880px, 96vw)">
      <template v-if="detail">
        <div class="detail-hero"><div><small>{{ detail.category }}</small><h2>{{ detail.orderNo }}</h2><span>{{ detail.businessType }} · {{ detail.customer }}</span></div><StatusTag :label="detail.status" /></div>
        <section class="detail-section"><h3>基本信息</h3><dl class="detail-grid">
          <div v-for="[label, value] in [['关联原订单/小订单', detail.sourceLabel], ['财务组织', '广州航晟物流有限公司'], ['所属部门', '华东业务部'], ['客服', detail.creator], ['运输方式', detail.transportMode], ['启运港', detail.originPort], ['目的港', detail.destinationPort], ['总运单号', detail.waybillNo], ['客户取消订单', detail.customerCancelled ? '是' : '否'], ['退运/退货结果', detail.returnResult], ['备注', detail.remark]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
        </dl></section>
        <section class="detail-section"><h3>货物</h3><el-table :data="detail.goods" size="small"><el-table-column prop="name" label="商品名称" min-width="150" /><el-table-column prop="barcode" label="条码" width="140" /><el-table-column prop="quantity" label="数量" width="80" /><el-table-column prop="unit" label="单位" width="70" /><el-table-column prop="totalPrice" label="总价" width="100" /><el-table-column prop="batchNo" label="批次号" width="120" /><el-table-column prop="goodQty" label="良品" width="70" /><el-table-column prop="defectQty" label="不良品" width="80" /></el-table>
        </section>
        <section class="detail-section"><h3>服务信息</h3><el-table :data="detail.services" size="small" empty-text="未配置服务"><el-table-column prop="label" label="服务项" width="130" /><el-table-column label="服务单号" width="160"><template #default="{ row }">{{ row.generated ? row.id : '未生成' }}</template></el-table-column><el-table-column label="状态" width="100"><template #default="{ row }">{{ row.generated ? row.status : '未下发' }}</template></el-table-column></el-table>
        </section>
        <section class="detail-section"><h3>操作历史</h3><el-table :data="detail.history || []" size="small" empty-text="暂无记录"><el-table-column prop="event" label="操作" width="130" /><el-table-column prop="content" label="内容" min-width="240" /><el-table-column prop="actor" label="操作人" width="120" /><el-table-column prop="time" label="时间" width="160" /></el-table>
        </section>
      </template>
    </el-drawer>

    <el-drawer v-model="valueDetailVisible" title="增值服务详情" size="min(920px, 96vw)">
      <template v-if="valueDetail">
        <div class="detail-hero"><div><small>服务订单号</small><h2>{{ valueDetail.id }}</h2><span>{{ valueDetail.serviceItem }} · {{ valueDetail.customer }}</span></div><StatusTag :label="valueDetail.status" /></div>
        <el-tabs model-value="info">
          <el-tab-pane label="基本信息" name="info">
            <section class="detail-section"><h3>上游与服务信息</h3><dl class="detail-grid">
              <div v-for="[label, value] in [['订单号', valueDetail.orderNo], ['业务类型', valueDetail.businessType], ['客户', valueDetail.customer], ['业务员', valueDetail.salesperson], ['供应商', valueDetail.supplier], ['内部部门', valueDetail.department], ['建单人', valueDetail.createdBy], ['建单时间', valueDetail.createdAt], ['服务项', valueDetail.serviceItem], ['是否委外', valueEdit.outsourced], ['委外供应商', valueEdit.outsourcedSupplier], ['服务备注', valueEdit.remark]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
            </dl></section>
            <section class="detail-section"><h3>处理信息</h3>
              <el-form label-position="top" class="reverse-grid" :disabled="!canEditValue">
                <el-form-item label="处理人"><el-input v-model="valueEdit.handler" /></el-form-item>
                <el-form-item label="开始处理时间"><el-date-picker v-model="valueEdit.startAt" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item>
                <el-form-item label="处理完成时间"><el-date-picker v-model="valueEdit.finishAt" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item>
                <el-form-item label="处理结果（最多 1000 字）"><el-input v-model="valueEdit.result" type="textarea" maxlength="1000" show-word-limit /></el-form-item>
              </el-form>
              <el-table :data="valueEdit.attachments" size="small" empty-text="暂无处理附件"><el-table-column prop="name" label="附件名称" min-width="200" /><el-table-column prop="size" label="大小（字节）" width="110" /><el-table-column label="操作" width="90"><template #default="{ $index }"><el-button v-if="canEditValue" link type="danger" @click="valueEdit.attachments.splice($index, 1)">删除</el-button></template></el-table-column></el-table>
              <label v-if="canEditValue" class="upload-line">上传处理附件<input type="file" @change="addValueAttachment" /></label>
              <div class="value-buttons"><el-button v-business-write="'reverseOrders'" :disabled="!canEditValue" @click="saveValue">保存</el-button><el-button v-business-write="'reverseOrders'" type="primary" :disabled="!canEditValue" @click="completeValue">完成服务</el-button><el-button @click="valueDetailVisible = false">返回列表</el-button></div>
            </section>
          </el-tab-pane>
          <el-tab-pane label="应收应付" name="costs">
            <el-alert type="info" :closable="false" title="应收应付引用财务篇；字段与操作未定义前不自行生成费用，取消不生成、终止不影响计费。" />
          </el-tab-pane>
          <el-tab-pane label="操作日志" name="history">
            <el-table :data="(valueDetail.history || []).slice().reverse()" size="small" empty-text="暂无记录"><el-table-column prop="actor" label="操作人" width="120" /><el-table-column prop="event" label="操作名称" width="120" /><el-table-column prop="content" label="操作内容" min-width="260" /><el-table-column prop="time" label="操作时间" width="160" /></el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.reverse-notice { margin-bottom: 14px; }
.reverse-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.reverse-grid .span-2 { grid-column: span 2; }
.reverse-grid :deep(.el-checkbox) { margin-right: 18px; }
.value-nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.value-actions { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.value-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 16px; }
.value-filters label { display: flex; flex-direction: column; gap: 8px; width: 170px; color: var(--muted); }
.value-filters :deep(.el-date-editor) { width: 100%; }
.detail-hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.detail-hero h2 { margin: 4px 0; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 8px 18px; margin: 0; }
.detail-grid dt { color: var(--muted); font-size: 12px; }
.detail-grid dd { margin: 2px 0 10px; }
.help { font-size: 12px; color: var(--muted); line-height: 1.7; }
.stock-error { color: #c45656; font-size: 13px; }
.upload-line { display: block; margin: 10px 0; color: var(--muted); font-size: 13px; }
.upload-line input { margin-left: 12px; }
.value-buttons { display: flex; gap: 8px; margin-top: 12px; }
@media (max-width: 700px) { .reverse-grid { grid-template-columns: minmax(0, 1fr); } .reverse-grid .span-2 { grid-column: span 1; } }
</style>
