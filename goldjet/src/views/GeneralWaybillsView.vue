<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  WB_ATTRIBUTES, WB_BOX_SIZES, WB_CONTAINER_SPECS, WB_CONTAINER_TYPES, WB_DECLARATION_TYPES,
  WB_IATA_CARRIERS, WB_IMPORT_EXPORT, WB_SPECIAL_CARGO, WB_TRANSPORT_TOOLS,
  calculateHouseChargeWeight, createContainerRow, createGeneralWaybillDraft, createHouseBillDraft,
  createWaybillDraftFromOrder, houseBillPermissions, validateGeneralWaybillDraft, validateHouseBillDraft, waybillPermissions,
} from '../domain/generalWaybills.js'
import { INTEGRATED_PORTS } from '../domain/integratedOrders.js'

const route = useRoute()
const {
  state, orderSession, saveGeneralWaybill, voidGeneralWaybill, saveGeneralHouse, voidGeneralHouse,
  addWaybillContainer, removeWaybillContainers, addEcommerceAttachment,
} = usePrototypeData()
const canOperate = computed(() => ['service', 'supervisor', 'business'].includes(orderSession.value.role))
const permission = record => waybillPermissions(record, orderSession.value.role)

const defaults = () => ({ waybillNos: '', houseNos: '', declarationType: '', importExportFlag: '', transportTool: '', flightNo: '' })
const filters = reactive(defaults())
const applied = ref(defaults())
const houseQuery = ref('')
function splitLines(value) { return String(value || '').split(/\n+/).map(row => row.trim()).filter(Boolean) }
function query() {
  if (!Object.values(filters).some(value => String(value || '').trim())) { ElMessage.warning('请先选择条件'); return }
  applied.value = JSON.parse(JSON.stringify(filters))
}
function resetQuery() { Object.assign(filters, defaults()); houseQuery.value = '' }
const rows = computed(() => state.generalWaybills.filter(record => {
  const waybillNos = splitLines(applied.value.waybillNos), houseNos = splitLines(applied.value.houseNos)
  if (waybillNos.length && !waybillNos.includes(record.waybillNo)) return false
  if (houseNos.length && !record.houses.some(house => houseNos.includes(house.houseNo))) return false
  if (applied.value.declarationType && record.declarationType !== applied.value.declarationType) return false
  if (applied.value.importExportFlag && record.importExportFlag !== applied.value.importExportFlag) return false
  if (applied.value.transportTool && record.transportTool !== applied.value.transportTool) return false
  if (applied.value.flightNo && !String(record.flightNo || '').includes(applied.value.flightNo.trim())) return false
  return true
}))
function houseSummary(record) {
  const active = record.houses.filter(house => house.status !== '已作废')
  if (!active.length) return '—'
  const numbers = active.map(house => house.houseNo).filter(Boolean)
  return numbers.length ? numbers.slice(0, 2).join('、') + (numbers.length > 2 ? ` 等 ${numbers.length} 个` : '') : `共 ${active.length} 个`
}

// ---- 总运单编辑与查看 ----
const editorVisible = ref(false), editingId = ref(''), busy = ref(false)
const draft = ref(createGeneralWaybillDraft()), draftErrors = ref({})
const customsAdjustInfo = computed(() => draft.value.declarationType === '普货' ? '补录入口带入订单资料；独立新建未列默认值的字段为空。' : '跨境电商总运单不提供分单管理入口。')
function openCreate(seed) {
  const order = seed?.sourceOrderId ? state.integratedOrders.find(row => row.id === seed.sourceOrderId) : null
  draft.value = order ? createWaybillDraftFromOrder(order) : createGeneralWaybillDraft()
  editingId.value = ''
  draftErrors.value = {}
  editorVisible.value = true
}
function openEdit(record) {
  if (!permission(record).edit) return
  draft.value = createGeneralWaybillDraft(record)
  editingId.value = record.id
  draftErrors.value = {}
  editorVisible.value = true
}
function openCreateFromOrder(order) {
  draft.value = createWaybillDraftFromOrder(order)
  editingId.value = ''
  draftErrors.value = {}
  editorVisible.value = true
}
function addContainer() { draft.value.containers.push({ ...createContainerRow(), serial: draft.value.containers.length + 1 }) }
function removeLastContainers() { if (draft.value.containers.length) draft.value.containers.pop() }
function chooseCarrier(value) {
  const carrier = WB_IATA_CARRIERS.find(row => row.iata === value)
  draft.value.billFields.iataCode = carrier?.iata || ''
  draft.value.billFields.issuingCarrier = carrier?.carrier || ''
}
function saveWaybill() {
  if (busy.value) return
  const errors = validateGeneralWaybillDraft(draft.value, { submit: true })
  draftErrors.value = errors
  if (Object.keys(errors).length) { ElMessage.error(Object.values(errors)[0]); return }
  busy.value = true
  try {
    const record = saveGeneralWaybill(JSON.parse(JSON.stringify(draft.value)), editingId.value)
    editorVisible.value = false
    ElMessage.success(editingId.value ? '总运单已保存' : '总运单已保存并返回列表')
    openDetail(record)
  } catch (error) { ElMessage.error(error.message) } finally { busy.value = false }
}
async function attachEcommerceFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const dataUrl = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.readAsDataURL(file) })
  if (editingId.value) {
    try { addEcommerceAttachment(editingId.value, { name: file.name, size: file.size, dataUrl }); draft.value = createGeneralWaybillDraft(state.generalWaybills.find(row => row.id === editingId.value)); ElMessage.success('附件已保存') } catch (error) { ElMessage.error(error.message) }
  } else {
    if (file.size > 20 * 1024 * 1024) { ElMessage.error('单个附件不能超过 20M'); return }
    draft.value.ecommerce.attachments.push({ id: `ATT-DRAFT-${Date.now()}`, name: file.name, size: file.size, uploadedAt: '待保存', dataUrl })
  }
  event.target.value = ''
}
const transportPairs = computed(() => {
  const record = detail.value; if (!record) return []
  return [['始发港代码', record.originPort], ['目的港代码', record.destinationPort], ['预计到货时间', record.eta], ['预计出港时间', record.etd], ['运输工具', record.transportTool], ['航班号/车牌号', record.flightNo], ['头程目的地', record.firstDestination], ['二程目的地', record.secondDestination], ['三程目的地', record.thirdDestination], ['中文品名', record.chineseName], ['英文品名', record.englishName], ['特殊货物', record.specialCargo], ['预计件数', record.expectedPieces], ['预计毛重（kg）', record.expectedWeight], ['预计体积（m³）', record.expectedVolume]]
})
const billPairs = computed(() => {
  const fields = detail.value?.billFields || {}
  return [['提单号', fields.waybillNo], ['进出口标志', fields.importExportFlag], ['代码', fields.code], ['发货人', fields.shipper], ['收货人', fields.consignee], ['唛头', fields.marks], ['海关申报价值', fields.customsDeclaredValue], ['IATA CODE', fields.iataCode], ['ISSUING CARRIER', fields.issuingCarrier], ['签发日期', fields.issueDate], ['随机文件', fields.randomDocs], ['Handling Information', fields.handlingInformation], ['提单属性', fields.attribute], ['采购/销售单号', fields.attribute === '采购单' ? fields.purchaseOrderNo : fields.salesOrderNo], ['发票号', fields.invoiceNo]]
})
const ecommercePairs = computed(() => {
  const record = detail.value; if (!record) return []
  const fields = record.ecommerce || {}
  return [['总运单号', record.waybillNo], ['进出口标志', record.importExportFlag], ['进出口岸代码', fields.importExportPortCode], ['申报海关代码', fields.customsDeclarationCode], ['监管场所代码', fields.supervisedPlaceCode], ['国家地区代码/名称', [fields.countryRegionCode, fields.countryRegionName].filter(Boolean).join(' ')],
    ['港口代码', fields.portCode], ['进港日期', fields.arrivalDate], ['运输工具', record.transportTool], ['航班号/车牌号', record.flightNo], ['头程目的地', record.firstDestination], ['二程目的地', record.secondDestination], ['三程目的地', record.thirdDestination], ['ETD', record.etd], ['ETA', record.eta],
    ['中文品名', record.chineseName], ['英文品名', record.englishName], ['特殊货物', record.specialCargo], ['总包号/箱号', fields.totalPackageNo], ['分运单数量', fields.houseBillCount], ['提单总毛重（kg）', fields.totalGrossWeight], ['提单计费重量（kg）', fields.chargeableWeight], ['托数/箱数', fields.palletCount], ['加固托盘数量', fields.reinforcedPalletCount], ['打托托盘数量', fields.palletizedPalletCount], ['纸箱数', fields.cartonCount], ['体积（m³）', fields.volume], ['箱尺寸', fields.boxSize], ['柜型', fields.containerType]]
})
function downloadAttachment(attachment) {
  if (!attachment.dataUrl) { ElMessage.warning('该演示附件没有可下载的原文件'); return }
  const link = document.createElement('a'); link.href = attachment.dataUrl; link.download = attachment.name; link.click()
}
async function voidWaybill(record) {
  try { await ElMessageBox.confirm('作废后该总运单资料无效并展示已作废标识；下游分单与关联订单的处理条件待确认。', '作废总运单', { confirmButtonText: '作废', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try { voidGeneralWaybill(record.id); ElMessage.success('总运单已作废') } catch (error) { ElMessage.error(error.message) }
}

// ---- 详情与分单管理 ----
const detailId = ref(''), detailVisible = ref(false)
const detail = computed(() => state.generalWaybills.find(row => row.id === detailId.value))
const housesVisible = ref(false), houseEditorVisible = ref(false), editingHouseId = ref('')
const houseDraft = ref(createHouseBillDraft()), houseErrors = ref({})
const houseRows = computed(() => (detail.value?.houses || []).filter(house => !houseQuery.value.trim() || String(house.houseNo || '').includes(houseQuery.value.trim())))
const houseTotals = computed(() => {
  const active = (detail.value?.houses || []).filter(house => house.status !== '已作废')
  const sum = key => active.reduce((total, house) => total + (Number(house[key]) || 0), 0)
  return { pieces: sum('expectedPieces'), weight: sum('expectedWeight'), volume: sum('expectedVolume'), chargeWeight: active.reduce((total, house) => total + (Number(calculateHouseChargeWeight(house)) || 0), 0).toFixed(2) }
})
function openDetail(record) { detailId.value = record.id; detailVisible.value = true }
function openHouses(record) { detailId.value = record.id; houseQuery.value = ''; housesVisible.value = true }
function editHouse(house) {
  const waybill = detail.value
  if (!houseBillPermissions(waybill, house, orderSession.value.role).edit) return
  houseDraft.value = createHouseBillDraft(house); editingHouseId.value = house.id; houseErrors.value = {}; houseEditorVisible.value = true
}
function createHouse() {
  if (!waybillPermissions(detail.value, orderSession.value.role).manageHouses) return
  houseDraft.value = createHouseBillDraft({ originPort: detail.value.originPort, firstDestination: detail.value.firstDestination, secondDestination: detail.value.secondDestination, thirdDestination: detail.value.thirdDestination, shipper: detail.value.billFields?.shipper, consignee: detail.value.billFields?.consignee })
  editingHouseId.value = ''; houseErrors.value = {}; houseEditorVisible.value = true
}
function saveHouse() {
  const errors = validateHouseBillDraft(houseDraft.value)
  houseErrors.value = errors
  if (Object.keys(errors).length) { ElMessage.error(Object.values(errors)[0]); return }
  try { saveGeneralHouse(detail.value.id, JSON.parse(JSON.stringify(houseDraft.value)), editingHouseId.value); houseEditorVisible.value = false; ElMessage.success('分单已保存') } catch (error) { ElMessage.error(error.message) }
}
async function voidHouse(house) {
  try { await ElMessageBox.confirm('作废经二次确认后使分单资料无效并展示已作废标识。', '作废分单', { confirmButtonText: '作废', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try { voidGeneralHouse(detail.value.id, house.id); ElMessage.success('分单已作废') } catch (error) { ElMessage.error(error.message) }
}
function openEcommerceAttachment(event, waybill) {
  const file = event.target.files?.[0]
  if (!file) return
  if (file.size > 20 * 1024 * 1024) { ElMessage.error('单个附件不能超过 20M'); event.target.value = ''; return }
  const reader = new FileReader()
  reader.onload = () => { try { addEcommerceAttachment(waybill.id, { name: file.name, size: file.size, dataUrl: String(reader.result || '') }); ElMessage.success('附件已保存') } catch (error) { ElMessage.error(error.message) } }
  reader.readAsDataURL(file); event.target.value = ''
}

watch(() => route.query, query => {
  if (query.waybill) { const record = state.generalWaybills.find(row => row.id === query.waybill); if (record) openDetail(record); else ElMessage.warning('未找到对应总运单') }
  else if (query.order) { const order = state.integratedOrders.find(row => row.id === query.order); if (order) openCreateFromOrder(order); else ElMessage.warning('未找到对应综合订单') }
}, { immediate: true })
watch(() => [orderSession.value.role, orderSession.value.name], () => { editorVisible.value = false; detailVisible.value = false; housesVisible.value = false; houseEditorVisible.value = false }, { flush: 'sync' })
</script>

<template>
  <div class="module-view">
    <PageHeader title="总运单与分单" description="综合订单总运单与普货分单资料维护">
      <template #actions><el-button v-business-write="'generalWaybills'" v-if="canOperate" :icon="Plus" type="primary" @click="openCreate()">新建总运单</el-button></template>
    </PageHeader>
    <el-alert class="wb-notice" title="仅普货总运单提供分单管理；总运单自身作废的下游处理、集装箱规格候选来源及分单计费重归属按待确认边界保留。" type="info" :closable="false" />
    <form class="wb-filters" aria-label="总运单筛选" @submit.prevent="query">
      <label>总运单号（逐行批量精确）<el-input v-model="filters.waybillNos" type="textarea" :rows="2" placeholder="每行一个号码" /></label>
      <label>分单号（逐行批量精确）<el-input v-model="filters.houseNos" type="textarea" :rows="2" placeholder="每行一个号码" /></label>
      <label>申报类型<el-select v-model="filters.declarationType" clearable placeholder="全部"><el-option v-for="value in WB_DECLARATION_TYPES" :key="value" :value="value" /></el-select></label>
      <label>进出口标志<el-select v-model="filters.importExportFlag" clearable placeholder="全部"><el-option v-for="value in WB_IMPORT_EXPORT" :key="value" :value="value" /></el-select></label>
      <label>运输工具<el-select v-model="filters.transportTool" clearable placeholder="全部"><el-option v-for="value in WB_TRANSPORT_TOOLS" :key="value" :value="value" /></el-select></label>
      <label>航班号/车牌号<el-input v-model="filters.flightNo" clearable /></label>
      <el-button type="primary" native-type="submit">查询</el-button>
      <el-button @click="resetQuery">重置</el-button>
    </form>
    <DataTableFrame :rows="rows" :page-size="20" :page-sizes="[20, 50, 100]">
      <template #default="{ rows: pageRows }">
        <el-table :data="pageRows" stripe row-key="id" aria-label="总运单列表">
          <el-table-column label="总运单号" width="185" fixed="left"><template #default="{ row }"><button class="link-button" @click="openDetail(row)">{{ row.waybillNo }}</button><StatusTag v-if="row.status === '已作废'" label="已作废" /></template></el-table-column>
          <el-table-column label="申报类型" width="105" prop="declarationType" />
          <el-table-column label="进出口标志" width="105" prop="importExportFlag" />
          <el-table-column label="分单号" min-width="180"><template #default="{ row }">{{ row.declarationType === '普货' ? houseSummary(row) : '—' }}</template></el-table-column>
          <el-table-column prop="transportTool" label="运输工具" width="95" />
          <el-table-column prop="flightNo" label="航班号/车牌号" width="130" />
          <el-table-column prop="originPort" label="始发港" width="90" />
          <el-table-column prop="destinationPort" label="目的港" width="90" />
          <el-table-column prop="chineseName" label="中文品名" min-width="140" />
          <el-table-column prop="createdBy" label="创建人" width="100" />
          <el-table-column label="创建时间" width="150"><template #default="{ row }">{{ (row.createdAt || '').slice(0, 16) }}</template></el-table-column>
          <el-table-column label="操作" width="230" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row)">查看</el-button>
              <el-button v-business-write="'generalWaybills'" v-if="permission(row).edit" link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button v-business-write="'generalWaybills'" v-if="permission(row).manageHouses" link type="primary" @click="openHouses(row)">分单管理</el-button>
              <el-button v-business-write="'generalWaybills'" v-if="permission(row).void" link type="danger" @click="voidWaybill(row)">作废</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </DataTableFrame>

    <el-dialog v-model="editorVisible" :title="editingId ? '编辑总运单' : '新建总运单'" width="min(1080px, 96vw)" align-center destroy-on-close :close-on-click-modal="false">
      <el-alert v-if="draft.sourceOrderId" type="info" :closable="false" :title="`从综合订单补录：${draft.sourceOrderId}；提交后总运单号回写订单。`" />
      <el-form label-position="top" @submit.prevent>
        <div class="wb-grid">
          <el-form-item label="申报类型" required :error="draftErrors.declarationType"><el-select v-model="draft.declarationType" :disabled="Boolean(draft.sourceOrderId)"><el-option v-for="value in WB_DECLARATION_TYPES" :key="value" :value="value" /></el-select></el-form-item>
          <el-form-item v-if="draft.declarationType === '普货'" label="运输工具" required :error="draftErrors.transportTool"><el-select v-model="draft.transportTool"><el-option v-for="value in WB_TRANSPORT_TOOLS" :key="value" :value="value" /></el-select></el-form-item>
        </div>
        <p class="help">{{ customsAdjustInfo }}</p>
        <template v-if="draft.declarationType === '普货'">
          <h3>运输与货物资料</h3>
          <div class="wb-grid">
            <el-form-item label="始发港代码" required :error="draftErrors.originPort"><el-select v-model="draft.originPort" filterable><el-option v-for="value in INTEGRATED_PORTS" :key="value" :value="value" /></el-select></el-form-item>
            <el-form-item label="目的港代码" required :error="draftErrors.destinationPort"><el-select v-model="draft.destinationPort" filterable><el-option v-for="value in INTEGRATED_PORTS" :key="value" :value="value" /></el-select></el-form-item>
            <el-form-item label="预计到货时间" required :error="draftErrors.eta"><el-date-picker v-model="draft.eta" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item>
            <el-form-item label="预计出港时间" required :error="draftErrors.etd"><el-date-picker v-model="draft.etd" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item>
            <el-form-item label="航班号/车牌号"><el-input v-model="draft.flightNo" maxlength="50" /></el-form-item>
            <el-form-item v-for="[key, label] in [['firstDestination', '头程目的地'], ['secondDestination', '二程目的地'], ['thirdDestination', '三程目的地']]" :key="key" :label="label"><el-input v-model="draft[key]" /></el-form-item>
            <el-form-item label="中文品名" required :error="draftErrors.chineseName"><el-input v-model="draft.chineseName" maxlength="500" /></el-form-item>
            <el-form-item label="英文品名"><el-input v-model="draft.englishName" maxlength="500" /></el-form-item>
            <el-form-item label="特殊货物"><el-select v-model="draft.specialCargo" clearable><el-option v-for="value in WB_SPECIAL_CARGO" :key="value" :value="value" /></el-select></el-form-item>
            <el-form-item label="预计件数" required :error="draftErrors.expectedPieces"><el-input v-model="draft.expectedPieces" /></el-form-item>
            <el-form-item label="预计毛重（kg）" required :error="draftErrors.expectedWeight"><el-input v-model="draft.expectedWeight" /></el-form-item>
            <el-form-item label="预计体积（m³）" required :error="draftErrors.expectedVolume"><el-input v-model="draft.expectedVolume" /></el-form-item>
          </div>
          <h3>集装箱</h3>
          <el-table :data="draft.containers" size="small" empty-text="暂无集装箱，按需添加">
            <el-table-column prop="serial" label="序号" width="70" />
            <el-table-column label="集装箱号" min-width="160"><template #default="{ row }"><el-input v-model="row.containerNo" /></template></el-table-column>
            <el-table-column label="集装箱规格" width="160"><template #default="{ row }"><el-select v-model="row.containerSpec"><el-option v-for="value in WB_CONTAINER_SPECS" :key="value" :value="value" /></el-select></template></el-table-column>
          </el-table>
          <template v-if="canOperate">
            <el-button size="small" @click="addContainer">添加集装箱</el-button>
            <el-button size="small" :disabled="!draft.containers.length" @click="removeLastContainers">删除末行</el-button>
            <span class="help">按勾选删除的下游处理与规格候选来源待确认，这里提供显式的末行删除。</span>
          </template>
          <h3>提单资料</h3>
          <div class="wb-grid">
            <el-form-item label="提单号" required :error="draftErrors['billFields.waybillNo']"><el-input v-model="draft.billFields.waybillNo" maxlength="100" /></el-form-item>
            <el-form-item label="进出口标志" required :error="draftErrors['billFields.importExportFlag']"><el-select v-model="draft.billFields.importExportFlag"><el-option v-for="value in WB_IMPORT_EXPORT" :key="value" :value="value" /></el-select></el-form-item>
            <el-form-item label="代码"><el-input v-model="draft.billFields.code" /></el-form-item>
            <el-form-item label="发货人" required :error="draftErrors['billFields.shipper']"><el-input v-model="draft.billFields.shipper" /></el-form-item>
            <el-form-item label="收货人" required :error="draftErrors['billFields.consignee']"><el-input v-model="draft.billFields.consignee" /></el-form-item>
            <el-form-item label="唛头"><el-input v-model="draft.billFields.marks" /></el-form-item>
            <el-form-item label="海关申报价值"><el-input v-model="draft.billFields.customsDeclaredValue" /></el-form-item>
            <el-form-item label="IATA CODE"><el-select v-model="draft.billFields.iataCode" clearable @change="chooseCarrier"><el-option v-for="carrier in WB_IATA_CARRIERS" :key="carrier.iata" :label="carrier.iata" :value="carrier.iata" /></el-select></el-form-item>
            <el-form-item label="ISSUING CARRIER"><el-input v-model="draft.billFields.issuingCarrier" readonly /></el-form-item>
            <el-form-item label="签发日期"><el-date-picker v-model="draft.billFields.issueDate" value-format="YYYY-MM-DD" /></el-form-item>
            <el-form-item label="随机文件"><el-input v-model="draft.billFields.randomDocs" /></el-form-item>
            <el-form-item label="Handling Information"><el-input v-model="draft.billFields.handlingInformation" /></el-form-item>
            <el-form-item label="提单属性"><el-select v-model="draft.billFields.attribute"><el-option v-for="value in WB_ATTRIBUTES" :key="value" :value="value" /></el-select></el-form-item>
            <el-form-item :label="draft.billFields.attribute === '采购单' ? '采购单号' : '销售单号'"><el-input :model-value="draft.billFields.attribute === '采购单' ? draft.billFields.purchaseOrderNo : draft.billFields.salesOrderNo" @update:model-value="value => draft.billFields[draft.billFields.attribute === '采购单' ? 'purchaseOrderNo' : 'salesOrderNo'] = value" /></el-form-item>
            <el-form-item label="发票号"><el-input v-model="draft.billFields.invoiceNo" /></el-form-item>
          </div>
        </template>
        <template v-else>
          <h3>跨境运输资料</h3>
          <div class="wb-grid">
            <el-form-item label="总运单号" required :error="draftErrors.waybillNo"><el-input v-model="draft.waybillNo" maxlength="100" /></el-form-item>
            <el-form-item label="进出口标志" required :error="draftErrors.importExportFlag"><el-select v-model="draft.importExportFlag"><el-option v-for="value in WB_IMPORT_EXPORT" :key="value" :value="value" /></el-select></el-form-item>
            <el-form-item label="进出口岸代码"><el-input v-model="draft.ecommerce.importExportPortCode" /></el-form-item>
            <el-form-item label="申报海关代码"><el-input v-model="draft.ecommerce.customsDeclarationCode" /></el-form-item>
            <el-form-item label="监管场所代码" required :error="draftErrors.supervisedPlaceCode"><el-input v-model="draft.ecommerce.supervisedPlaceCode" /></el-form-item>
            <el-form-item label="国家地区代码"><el-input v-model="draft.ecommerce.countryRegionCode" /></el-form-item>
            <el-form-item label="国家地区名称"><el-input v-model="draft.ecommerce.countryRegionName" /></el-form-item>
            <el-form-item label="港口代码" required :error="draftErrors.portCode"><el-select v-model="draft.ecommerce.portCode" filterable><el-option v-for="value in INTEGRATED_PORTS" :key="value" :value="value" /></el-select></el-form-item>
            <el-form-item label="进港日期"><el-date-picker v-model="draft.ecommerce.arrivalDate" value-format="YYYY-MM-DD" /></el-form-item>
            <el-form-item label="运输工具" required :error="draftErrors.transportTool"><el-select v-model="draft.transportTool"><el-option v-for="value in WB_TRANSPORT_TOOLS" :key="value" :value="value" /></el-select></el-form-item>
            <el-form-item label="航班号/车牌号"><el-input v-model="draft.flightNo" /></el-form-item>
            <el-form-item v-for="[key, label] in [['firstDestination', '头程目的地'], ['secondDestination', '二程目的地'], ['thirdDestination', '三程目的地']]" :key="key" :label="label"><el-input v-model="draft[key]" /></el-form-item>
            <el-form-item label="预计离港时间 ETD"><el-date-picker v-model="draft.etd" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item>
            <el-form-item label="预计到港时间 ETA"><el-date-picker v-model="draft.eta" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item>
          </div>
          <h3>跨境货物与附件</h3>
          <div class="wb-grid">
            <el-form-item label="中文品名" required :error="draftErrors.chineseName"><el-input v-model="draft.chineseName" maxlength="500" /></el-form-item>
            <el-form-item label="英文品名"><el-input v-model="draft.englishName" maxlength="500" /></el-form-item>
            <el-form-item label="特殊货物"><el-select v-model="draft.specialCargo" clearable><el-option v-for="value in WB_SPECIAL_CARGO" :key="value" :value="value" /></el-select></el-form-item>
            <el-form-item v-for="[key, label] in [['totalPackageNo', '总包号/箱号'], ['houseBillCount', '分运单数量'], ['totalGrossWeight', '提单总毛重（kg）'], ['chargeableWeight', '提单计费重量（kg）'], ['palletCount', '托数/箱数'], ['reinforcedPalletCount', '加固托盘数量'], ['palletizedPalletCount', '打托托盘数量'], ['cartonCount', '纸箱数'], ['volume', '体积（m³）']]" :key="key" :label="label"><el-input v-model="draft.ecommerce[key]" /></el-form-item>
            <el-form-item label="箱尺寸"><el-select v-model="draft.ecommerce.boxSize" clearable><el-option v-for="value in WB_BOX_SIZES" :key="value" :value="value" /></el-select></el-form-item>
            <el-form-item label="柜型"><el-select v-model="draft.ecommerce.containerType" clearable><el-option v-for="value in WB_CONTAINER_TYPES" :key="value" :value="value" /></el-select></el-form-item>
          </div>
          <el-table :data="draft.ecommerce.attachments" size="small" empty-text="暂无附件">
            <el-table-column label="附件" min-width="220"><template #default="{ row }"><el-button link type="primary" @click="downloadAttachment(row)">{{ row.name }}</el-button></template></el-table-column>
            <el-table-column prop="size" label="大小（字节）" width="120" />
            <el-table-column prop="uploadedAt" label="上传时间" width="170" />
          </el-table>
          <label class="upload-line">上传附件<input type="file" @change="attachEcommerceFile" /></label>
        </template>
      </el-form>
      <template #footer><el-button @click="editorVisible = false">取消</el-button><el-button v-business-write="'generalWaybills'" type="primary" :loading="busy" @click="saveWaybill">提交并返回</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="总运单详情" size="min(1000px, 96vw)">
      <template v-if="detail">
        <div class="detail-hero"><div><small>总运单号</small><h2>{{ detail.waybillNo }}</h2><span>{{ detail.declarationType }} · {{ detail.importExportFlag }} · {{ detail.transportTool }}</span></div><StatusTag :label="detail.status" /></div>
        <el-alert v-if="detail.status === '已作废'" type="warning" :closable="false" :title="`已作废：${detail.voidedBy} ${detail.voidedAt}`" />
        <section class="detail-section"><h3>运输与货物资料</h3>
          <dl class="detail-grid"><div v-for="[label, value] in transportPairs" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl>
        </section>
        <template v-if="detail.declarationType === '普货'">
          <section class="detail-section"><h3>集装箱</h3><el-table :data="detail.containers" size="small" empty-text="无集装箱"><el-table-column prop="serial" label="序号" width="70" /><el-table-column prop="containerNo" label="集装箱号" min-width="150" /><el-table-column prop="containerSpec" label="集装箱规格" width="150" /></el-table>
            <p class="help">分单计费重（主单汇总）：{{ houseTotals.chargeWeight }} kg；其归属尚未确认，按分单列表合计展示。</p>
          </section>
          <section class="detail-section"><h3>提单资料</h3><dl class="detail-grid"><div v-for="[label, value] in billPairs" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl></section>
        </template>
        <template v-else>
          <section class="detail-section"><h3>跨境运输与货物资料</h3><dl class="detail-grid"><div v-for="[label, value] in ecommercePairs" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl></section>
          <section class="detail-section"><h3>附件</h3><el-table :data="detail.ecommerce.attachments" size="small" empty-text="暂无附件"><el-table-column label="附件" min-width="220"><template #default="{ row }"><el-button link type="primary" @click="downloadAttachment(row)">{{ row.name }}</el-button></template></el-table-column><el-table-column prop="uploadedAt" label="上传时间" width="170" /></el-table></section>
        </template>
      </template>
      <template #footer><el-button v-if="detail?.declarationType === '普货'" type="primary" @click="housesVisible = true">分单管理</el-button></template>
    </el-drawer>

    <el-dialog v-model="housesVisible" title="普货分单管理" width="min(1080px, 96vw)" align-center destroy-on-close>
      <template v-if="detail">
        <div class="main-summary">
          <span>主单摘要：{{ detail.originPort }} → {{ detail.firstDestination }} · 头程航班 {{ detail.flightNo || '—' }} · 目的港 {{ detail.destinationPort }}</span>
          <span>入仓件数/毛重/体积：{{ houseTotals.pieces }} / {{ houseTotals.weight }} / {{ houseTotals.volume }}（合计）</span>
          <span>提单计费重：{{ houseTotals.chargeWeight }} kg</span>
        </div>
        <div class="house-toolbar"><el-input v-model="houseQuery" placeholder="按分单号查询；留空显示当前主单全部分单" clearable style="max-width:360px" /><el-button @click="houseQuery = ''">重置</el-button><el-button v-if="waybillPermissions(detail, orderSession.role).manageHouses" type="primary" :icon="Plus" @click="createHouse">新建分单</el-button></div>
        <el-table :data="houseRows" size="small" aria-label="分单列表">
          <el-table-column label="分单号" width="150"><template #default="{ row }"><button class="link-button" @click="editHouse(row)">{{ row.houseNo }}</button><StatusTag v-if="row.status === '已作废'" label="已作废" /></template></el-table-column>
          <el-table-column prop="chineseName" label="中文品名" min-width="130" />
          <el-table-column prop="expectedPieces" label="分单件数" width="95" />
          <el-table-column prop="expectedWeight" label="分单毛重（kg）" width="130" />
          <el-table-column prop="expectedVolume" label="分单体积（m³）" width="130" />
          <el-table-column label="分单计费重（kg）" width="140"><template #default="{ row }">{{ calculateHouseChargeWeight(row) }}</template></el-table-column>
          <el-table-column label="入仓毛件体" min-width="160"><template #default="{ row }">{{ row.inbound ? `${row.inbound.pieces}/${row.inbound.weight}/${row.inbound.volume}` : '无实测来源' }}</template></el-table-column>
          <el-table-column label="提单毛件体" min-width="160"><template #default="{ row }">{{ row.billMeasured ? `${row.billMeasured.pieces}/${row.billMeasured.weight}/${row.billMeasured.volume}` : '无实测来源' }}</template></el-table-column>
          <el-table-column label="操作" width="150" fixed="right"><template #default="{ row }"><el-button link type="primary" :disabled="!houseBillPermissions(detail, row, orderSession.role).edit" @click="editHouse(row)">编辑</el-button><el-button v-if="row.status !== '已作废'" link type="danger" :disabled="!houseBillPermissions(detail, row, orderSession.role).void" @click="voidHouse(row)">作废</el-button></template></el-table-column>
        </el-table>
        <p class="help">合计按未作废分单计算；已作废分单是否计入及合计基于筛选还是全部分单待确认。入仓与提单实测来自仓储收货与货站实测，原型没有来源时留空，不以预计数据冒充实测。</p>
      </template>
    </el-dialog>

    <el-dialog v-model="houseEditorVisible" :title="editingHouseId ? '编辑分单' : '新建分单'" width="min(820px, 96vw)" align-center destroy-on-close>
      <el-form label-position="top" @submit.prevent>
        <div class="wb-grid">
          <el-form-item label="分单号"><el-input v-model="houseDraft.houseNo" maxlength="50" placeholder="为空时提交按合成编号生成" /></el-form-item>
          <el-form-item v-for="[key, label] in [['originPort', '始发港'], ['firstDestination', '头程目的地'], ['secondDestination', '二程目的地'], ['thirdDestination', '三程目的地']]" :key="key" :label="label" :required="['originPort', 'firstDestination'].includes(key)" :error="houseErrors[key]"><el-input v-model="houseDraft[key]" /></el-form-item>
          <el-form-item label="中文品名" required :error="houseErrors.chineseName"><el-input v-model="houseDraft.chineseName" maxlength="500" /></el-form-item>
          <el-form-item label="英文品名"><el-input v-model="houseDraft.englishName" maxlength="500" /></el-form-item>
          <el-form-item label="预计件数" required :error="houseErrors.expectedPieces"><el-input v-model="houseDraft.expectedPieces" /></el-form-item>
          <el-form-item label="预计毛重（kg）" required :error="houseErrors.expectedWeight"><el-input v-model="houseDraft.expectedWeight" /></el-form-item>
          <el-form-item label="预计体积（m³）" required :error="houseErrors.expectedVolume"><el-input v-model="houseDraft.expectedVolume" /></el-form-item>
          <el-form-item label="分单计费重（kg，只读）"><el-input :model-value="calculateHouseChargeWeight(houseDraft)" readonly /></el-form-item>
          <el-form-item label="Handling Information"><el-input v-model="houseDraft.handlingInformation" /></el-form-item>
          <el-form-item label="唛头"><el-input v-model="houseDraft.marks" /></el-form-item>
          <el-form-item label="仓库操作要求"><el-input v-model="houseDraft.warehouseRequirement" /></el-form-item>
          <el-form-item label="发货人"><el-input v-model="houseDraft.shipper" /></el-form-item>
          <el-form-item label="收货人"><el-input v-model="houseDraft.consignee" /></el-form-item>
        </div>
        <el-alert type="info" :closable="false" title="收发货人选择历史联系人并显示别称的交互与主单一致；本页按已明确的录入字段维护。二程/三程目的地候选来源待确认。" />
      </el-form>
      <template #footer><el-button @click="houseEditorVisible = false">取消</el-button><el-button type="primary" @click="saveHouse">提交</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.wb-notice { margin-bottom:14px; }
.wb-filters { display:flex; flex-wrap:wrap; align-items:end; gap:12px; margin-bottom:16px; }
.wb-filters label { display:flex; flex-direction:column; gap:8px; width:190px; color:var(--muted); }
.wb-filters label:first-child, .wb-filters label:nth-child(2) { width:230px; }
.wb-filters :deep(.el-date-editor) { width:100%; }
.wb-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0 16px; }
.help { font-size:12px; color:var(--muted); line-height:1.7; }
.upload-line { display:block; margin:10px 0; color:var(--muted); font-size:13px; }
.upload-line input { margin-left:12px; }
.detail-hero { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.detail-hero h2 { margin:4px 0; }
.detail-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr)); gap:8px 18px; margin:0; }
.detail-grid dt { color:var(--muted); font-size:12px; }
.detail-grid dd { margin:2px 0 10px; }
.main-summary { display:flex; flex-wrap:wrap; gap:16px; padding:10px 12px; background:#f5f7fa; border-radius:6px; margin-bottom:12px; font-size:13px; }
.house-toolbar { display:flex; gap:8px; margin-bottom:12px; }
:deep(.el-select), :deep(.el-cascader), :deep(.el-date-editor) { width:100%; }
@media (max-width:700px) { .wb-grid { grid-template-columns:minmax(0,1fr); } }
</style>
