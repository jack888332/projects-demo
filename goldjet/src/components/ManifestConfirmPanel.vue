<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, Plus } from '@element-plus/icons-vue'
import DataTableFrame from './DataTableFrame.vue'
import StatusTag from './StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  CUSTOMS_CLEARANCE_CODES, CONFIRM_TYPES, MANIFEST_STATUSES, MANIFEST_SYNC_STATUSES, PACKAGE_TYPES,
  PORT_OPTIONS, TRAILER_TYPES, createConfirmationDraft, createManifestDraft, filterConfirmations, filterManifests,
  manifestGoodsCsvTemplate, manifestPermissions, parseManifestGoodsCsv, validateConfirmationDraft, validateManifestDraft,
} from '../domain/manifestAndConfirmation.js'

const {
  state, declarationSession, saveManifest, resubmitManifestSync, saveConfirmation, deleteConfirmation, recordVehicleInfo,
} = usePrototypeData()
const permission = computed(() => manifestPermissions(declarationSession.value.role))
const tab = ref('manifest')
const ecommerceOptions = computed(() => [...new Set([...state.bcImportOrders, ...state.ccImportOrders].map(order => order.ecommerceName).filter(Boolean))])

// ---- 原始舱单 ----
const manifestDefaults = () => ({ batchNo: '', waybillNo: '', containerNo: '', port: '', unloadCode: '', clearanceCode: '', loadingTime: '', createdBy: '', createdRange: [], status: '', syncStatus: '' })
const manifestFilters = reactive(manifestDefaults())
const manifestApplied = ref({})
const manifestRows = computed(() => filterManifests(state.originalManifests, manifestApplied.value))
const manifestSelected = ref([])
const manifestTable = ref()
function queryManifests() {
  if (!Object.values(manifestFilters).some(value => Array.isArray(value) ? value.length : String(value || '').length)) return
  manifestApplied.value = JSON.parse(JSON.stringify(manifestFilters))
}
function resetManifests() { Object.assign(manifestFilters, manifestDefaults()); manifestApplied.value = {} }
function manifestTargets() { return manifestSelected.value.length ? state.originalManifests.filter(row => manifestSelected.value.includes(row.id)) : manifestRows.value }
const manifestVisible = ref(false), manifestEditingId = ref(''), manifestDraft = ref(createManifestDraft()), manifestErrors = ref({}), goodsImportError = ref('')
function openManifest(record) {
  if (record && !['待报关', '发送失败', '海关退单'].includes(record.status)) { ElMessage.warning('仅待报关、发送失败、海关退单的舱单可以修改'); return }
  manifestEditingId.value = record?.id || ''
  manifestDraft.value = createManifestDraft(record ? JSON.parse(JSON.stringify(record)) : undefined)
  manifestErrors.value = {}
  goodsImportError.value = ''
  manifestVisible.value = true
}
function addManifestGoods() { manifestDraft.value.goods.push({ id: `M-G${manifestDraft.value.goods.length + 1}`, description: '', pieces: '', weight: '', packageType: 'CT 纸板箱', dangerNo: '', receiver: '', shipper: '', dangerContact: '' }) }
function downloadGoodsTemplate() {
  const blob = new Blob([manifestGoodsCsvTemplate()], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = '原始舱单商品信息模板（原型CSV）.csv'; link.click(); URL.revokeObjectURL(link.href)
}
async function importManifestGoods(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.csv')) { goodsImportError.value = 'PRD未定义导入文件的扩展名与正式模板；本原型只接受明确标注的 CSV 演示模板。'; return }
  if (manifestDraft.value.goods.length) {
    try { await ElMessageBox.confirm('导入成功后会覆盖当前商品信息，是否继续？', '覆盖当前商品信息', { confirmButtonText: '选择文件并校验', cancelButtonText: '取消', type: 'warning' }) }
    catch { return }
  }
  const parsed = parseManifestGoodsCsv(await file.text(), manifestDraft.value.goods.length + 1)
  if (!parsed.ok) { goodsImportError.value = parsed.error; return }
  manifestDraft.value.goods = parsed.goods
  goodsImportError.value = ''
  ElMessage.success(`已原子覆盖商品信息（${parsed.goods.length} 行）；尚未保存到舱单`)
}
function submitManifest(submit) {
  const errors = validateManifestDraft(manifestDraft.value, { submit })
  manifestErrors.value = errors
  if (Object.keys(errors).length) { ElMessage.error(Object.values(errors)[0]); return }
  try {
    const record = saveManifest(manifestEditingId.value, JSON.parse(JSON.stringify(manifestDraft.value)), { submit })
    manifestVisible.value = false
    ElMessage.success(submit ? '已保存并申报，同步陆运通成功（本地模拟）' : '舱单已保存，状态待报关')
    if (record) ElMessage.info(`舱单 ${record.batchNo}`)
  } catch (error) { if (error.fields) manifestErrors.value = error.fields; ElMessage.error(error.message) }
}
function resubmitSync(record) {
  try { resubmitManifestSync(record.id); ElMessage.success('同步失败单据已重新提交成功（本地模拟）') } catch (error) { ElMessage.error(error.message) }
}
const manifestDetailId = ref(''), manifestDetailVisible = ref(false)
const manifestDetail = computed(() => state.originalManifests.find(row => row.id === manifestDetailId.value))
function viewManifest(record) { manifestDetailId.value = record.id; manifestDetailVisible.value = true }

// ---- 载货确报 ----
const confirmDefaults = () => ({ batchNo: '', type: '', port: '', vehicleCode: '', vehicleName: '', driverCode: '', driverName: '', createdBy: '', confirmRange: [], createdRange: [] })
const confirmFilters = reactive(confirmDefaults())
const confirmApplied = ref({})
const confirmRows = computed(() => filterConfirmations(state.cargoConfirmations, confirmApplied.value))
const confirmSelected = ref([])
const confirmTable = ref()
function queryConfirms() {
  if (!Object.values(confirmFilters).some(value => Array.isArray(value) ? value.length : String(value || '').length)) return
  confirmApplied.value = JSON.parse(JSON.stringify(confirmFilters))
}
function resetConfirms() { Object.assign(confirmFilters, confirmDefaults()); confirmApplied.value = {} }
function confirmTargets() { return confirmSelected.value.length ? state.cargoConfirmations.filter(row => confirmSelected.value.includes(row.id)) : confirmRows.value }
const confirmVisible = ref(false), confirmEditingId = ref(''), confirmDraft = ref(createConfirmationDraft()), confirmErrors = ref({})
function openConfirm(record) {
  confirmEditingId.value = record?.id || ''
  confirmDraft.value = createConfirmationDraft(record ? JSON.parse(JSON.stringify(record)) : undefined)
  confirmErrors.value = {}
  confirmVisible.value = true
}
function addTrailer() { confirmDraft.value.trailers.push({ id: `T-${confirmDraft.value.trailers.length + 1}`, vehicleCode: '', plate: '', type: '02 二轴', weight: '' }) }
function addContainer() { confirmDraft.value.containers.push({ id: `C-${confirmDraft.value.containers.length + 1}`, vehicleCode: '', containerNo: '', sizeType: 'DC20（22G0）', sourceCode: '', emptyFlag: '1', weight: '', sealType: '', sealNo: '', sealer: '' }) }
function submitConfirm(submit) {
  const errors = validateConfirmationDraft(confirmDraft.value, { submit })
  confirmErrors.value = errors
  if (Object.keys(errors).length) { ElMessage.error(Object.values(errors)[0]); return }
  try {
    saveConfirmation(confirmEditingId.value, JSON.parse(JSON.stringify(confirmDraft.value)), { submit })
    confirmVisible.value = false
    ElMessage.success(submit ? '已保存并提交，同步陆运通成功（本地模拟）' : '确报已保存，状态待报关')
  } catch (error) { if (error.fields) confirmErrors.value = error.fields; ElMessage.error(error.message) }
}
async function removeConfirm(record) {
  try { await ElMessageBox.confirm('删除确报将同步删除陆运通的数据（本地模拟）。', '删除确报', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try { deleteConfirmation(record.id); ElMessage.success('确报已删除并同步删除') } catch (error) { ElMessage.error(error.message) }
}
const vehicleVisible = ref(false), vehicleId = ref(''), vehicleForm = reactive({ vehicleCode: '', vehicleName: '', driverCode: '', driverName: '' })
function openVehicle(record) {
  vehicleId.value = record.id
  Object.assign(vehicleForm, { vehicleCode: record.vehicleCode || '', vehicleName: record.vehicleName || '', driverCode: record.driverCode || '', driverName: record.driverName || '' })
  vehicleVisible.value = true
}
function submitVehicle() {
  try { recordVehicleInfo(vehicleId.value, { ...vehicleForm }); vehicleVisible.value = false; ElMessage.success('车辆信息已录入') } catch (error) { ElMessage.error(error.message) }
}
const confirmDetailId = ref(''), confirmDetailVisible = ref(false)
const confirmDetail = computed(() => state.cargoConfirmations.find(row => row.id === confirmDetailId.value))
function viewConfirm(record) { confirmDetailId.value = record.id; confirmDetailVisible.value = true }
watch(() => [declarationSession.value.role, declarationSession.value.name], () => { manifestVisible.value = false; confirmVisible.value = false; vehicleVisible.value = false; manifestDetailVisible.value = false; confirmDetailVisible.value = false })
</script>

<template>
  <div>
    <el-alert class="mc-notice" title="在本系统录入后同步到陆运通；同步与海关回执均为浏览器内本地模拟，商品导入使用原型 CSV 演示模板（正式模板与部分字段编辑资格按 CUSTOMS-B028 保留待确认）。" type="info" :closable="false" />
    <el-tabs v-model="tab"><el-tab-pane label="原始舱单" name="manifest" /><el-tab-pane label="载货确报" name="confirmation" /></el-tabs>

    <template v-if="tab === 'manifest'">
      <div class="mc-actions">
        <el-button v-business-write="'bcImportCustoms'" :disabled="!permission.write" type="primary" :icon="Plus" @click="openManifest()">新增</el-button>
        <el-button @click="viewManifest(manifestTargets()[0])" :disabled="manifestTargets().length !== 1">查看</el-button>
        <el-button v-business-write="'bcImportCustoms'" :disabled="!permission.write || manifestTargets().length !== 1" @click="openManifest(manifestTargets()[0])">修改</el-button>
        <el-button v-business-write="'bcImportCustoms'" :disabled="!permission.write || manifestTargets().filter(row => row.syncStatus === '失败').length !== 1" @click="resubmitSync(manifestTargets().find(row => row.syncStatus === '失败'))">重新提交同步</el-button>
        <span class="mc-hint">已选 {{ manifestSelected.length }} 笔；未勾选时按当前查询结果执行。</span>
      </div>
      <form class="mc-filters" aria-label="原始舱单筛选" @submit.prevent="queryManifests">
        <label>货物运输批次号<el-input v-model="manifestFilters.batchNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
        <label>总运/提单号<el-input v-model="manifestFilters.waybillNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
        <label>箱号<el-input v-model="manifestFilters.containerNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
        <label>过境口岸<el-select v-model="manifestFilters.port" clearable filterable placeholder="全部"><el-option v-for="value in PORT_OPTIONS" :key="value" :value="value" /></el-select></label>
        <label>卸货地代码<el-select v-model="manifestFilters.unloadCode" clearable filterable placeholder="全部"><el-option v-for="value in PORT_OPTIONS" :key="value" :value="value" /></el-select></label>
        <label>货物通关代码<el-select v-model="manifestFilters.clearanceCode" clearable filterable placeholder="全部"><el-option v-for="value in CUSTOMS_CLEARANCE_CODES" :key="value" :value="value" /></el-select></label>
        <label>货物装载时间<el-input v-model="manifestFilters.loadingTime" type="textarea" :rows="1" placeholder="精确到 YYYY-MM-DD hh:mm:ss，可换行多个" /></label>
        <label>录入者<el-select v-model="manifestFilters.createdBy" clearable placeholder="全部"><el-option v-for="value in [...new Set(state.originalManifests.map(row => row.createdBy))]" :key="value" :value="value" /></el-select></label>
        <label>录入时间<el-date-picker v-model="manifestFilters.createdRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
        <label>海关审核状态<el-select v-model="manifestFilters.status" clearable placeholder="全部"><el-option v-for="value in MANIFEST_STATUSES" :key="value" :value="value" /></el-select></label>
        <label>同步状态<el-select v-model="manifestFilters.syncStatus" clearable placeholder="全部"><el-option v-for="value in MANIFEST_SYNC_STATUSES" :key="value" :value="value" /></el-select></label>
        <el-button type="primary" native-type="submit">查询</el-button>
        <el-button @click="resetManifests">重置</el-button>
      </form>
      <DataTableFrame :rows="manifestRows" :page-size="50" :page-sizes="[20, 50]" selectable :selected-count="manifestSelected.length">
        <template #default="{ rows: pageRows }">
          <el-table ref="manifestTable" :data="pageRows" stripe row-key="id" aria-label="原始舱单列表" @selection-change="items => manifestSelected = items.map(item => item.id)">
            <el-table-column type="selection" reserve-selection width="46" />
            <el-table-column prop="batchNo" label="货物运输批次号" width="150" fixed="left" />
            <el-table-column prop="port" label="过境口岸" width="140" />
            <el-table-column prop="loadingTime" label="货物装载时间" width="170" />
            <el-table-column prop="unloadCode" label="卸货地代码" width="120" />
            <el-table-column prop="waybillNo" label="总运/提单号" width="130" />
            <el-table-column prop="clearanceCode" label="货物通关代码" width="150" />
            <el-table-column label="箱号" width="150"><template #default="{ row }">{{ row.containerNo ? `${row.containerNo}${row.containerNo.length > 6 ? '…' : ''}` : '—' }}</template></el-table-column>
            <el-table-column prop="createdBy" label="录入者" width="120" />
            <el-table-column prop="createdAt" label="录入时间" width="170" />
            <el-table-column label="海关审核状态" width="120"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
            <el-table-column label="同步状态" width="100"><template #default="{ row }"><StatusTag :label="row.syncStatus" /></template></el-table-column>
            <el-table-column label="操作" width="150" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="viewManifest(row)">查看</el-button><el-button v-business-write="'bcImportCustoms'" link type="primary" :disabled="!['待报关', '发送失败', '海关退单'].includes(row.status)" @click="openManifest(row)">修改</el-button></template></el-table-column>
          </el-table>
        </template>
      </DataTableFrame>
    </template>

    <template v-else>
      <div class="mc-actions">
        <el-button v-business-write="'bcImportCustoms'" :disabled="!permission.write" type="primary" :icon="Plus" @click="openConfirm()">新增</el-button>
        <el-button @click="viewConfirm(confirmTargets()[0])" :disabled="confirmTargets().length !== 1">查看</el-button>
        <el-button v-business-write="'bcImportCustoms'" :disabled="!permission.write || confirmTargets().length !== 1" @click="openConfirm(confirmTargets()[0])">修改</el-button>
        <el-button v-business-write="'bcImportCustoms'" :disabled="!permission.write || confirmTargets().length !== 1" @click="removeConfirm(confirmTargets()[0])">删除</el-button>
        <el-button v-business-write="'bcImportCustoms'" :disabled="!permission.write || confirmTargets().length !== 1" @click="openVehicle(confirmTargets()[0])">录入车辆信息</el-button>
        <span class="mc-hint">已选 {{ confirmSelected.length }} 笔；未勾选时按当前查询结果执行。</span>
      </div>
      <form class="mc-filters" aria-label="载货确报筛选" @submit.prevent="queryConfirms">
        <label>货物运输批次号<el-input v-model="confirmFilters.batchNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
        <label>确报类型<el-select v-model="confirmFilters.type" clearable placeholder="全部"><el-option v-for="value in CONFIRM_TYPES" :key="value" :value="value" /></el-select></label>
        <label>过境口岸<el-select v-model="confirmFilters.port" clearable filterable placeholder="全部"><el-option v-for="value in PORT_OPTIONS" :key="value" :value="value" /></el-select></label>
        <label>运输工具代码<el-select v-model="confirmFilters.vehicleCode" clearable filterable placeholder="全部"><el-option v-for="value in [...new Set(state.cargoConfirmations.map(row => row.vehicleCode).filter(Boolean))]" :key="value" :value="value" /></el-select></label>
        <label>运输工具名称<el-select v-model="confirmFilters.vehicleName" clearable placeholder="全部"><el-option v-for="value in [...new Set(state.cargoConfirmations.map(row => row.vehicleName).filter(Boolean))]" :key="value" :value="value" /></el-select></label>
        <label>驾驶员代码<el-input v-model="confirmFilters.driverCode" type="textarea" :rows="1" placeholder="可换行多个" /></label>
        <label>驾驶员名称<el-input v-model="confirmFilters.driverName" type="textarea" :rows="1" placeholder="可换行多个" /></label>
        <label>录入者<el-select v-model="confirmFilters.createdBy" clearable placeholder="全部"><el-option v-for="value in [...new Set(state.cargoConfirmations.map(row => row.createdBy))]" :key="value" :value="value" /></el-select></label>
        <label>确报时间<el-date-picker v-model="confirmFilters.confirmRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
        <label>录入时间<el-date-picker v-model="confirmFilters.createdRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
        <el-button type="primary" native-type="submit">查询</el-button>
        <el-button @click="resetConfirms">重置</el-button>
      </form>
      <DataTableFrame :rows="confirmRows" :page-size="50" :page-sizes="[20, 50]" selectable :selected-count="confirmSelected.length">
        <template #default="{ rows: pageRows }">
          <el-table ref="confirmTable" :data="pageRows" stripe row-key="id" aria-label="载货确报列表" @selection-change="items => confirmSelected = items.map(item => item.id)">
            <el-table-column type="selection" reserve-selection width="46" />
            <el-table-column prop="batchNo" label="货物运输批次号" width="150" fixed="left" />
            <el-table-column prop="type" label="确报类型" width="190" />
            <el-table-column prop="port" label="过境口岸" width="140" />
            <el-table-column prop="confirmTime" label="确报时间" width="170" />
            <el-table-column prop="vehicleCode" label="运输工具代码" width="120" />
            <el-table-column prop="vehicleName" label="运输工具名称" width="130" />
            <el-table-column prop="driverCode" label="驾驶员代码" width="110" />
            <el-table-column prop="driverName" label="驾驶员名称" width="110" />
            <el-table-column prop="createdBy" label="录入者" width="120" />
            <el-table-column prop="createdAt" label="录入时间" width="170" />
            <el-table-column label="操作" width="200" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="viewConfirm(row)">查看</el-button><el-button v-business-write="'bcImportCustoms'" link type="primary" @click="openConfirm(row)">修改</el-button><el-button v-business-write="'bcImportCustoms'" link type="danger" @click="removeConfirm(row)">删除</el-button></template></el-table-column>
          </el-table>
        </template>
      </DataTableFrame>
    </template>

    <el-dialog v-model="manifestVisible" :title="manifestEditingId ? '修改舱单' : '新增舱单'" width="min(1020px, 96vw)" align-center destroy-on-close>
      <el-form label-position="top" class="mc-grid">
        <el-form-item label="货物运输批次号" required :error="manifestErrors.batchNo"><el-input v-model="manifestDraft.batchNo" maxlength="13" placeholder="13 位数字，原始 1-4 / 预配 5-9 开头" /></el-form-item>
        <el-form-item label="客户端消息生成ID"><el-input v-model="manifestDraft.messageId" maxlength="32" /></el-form-item>
        <el-form-item label="过境口岸" required><el-select v-model="manifestDraft.port"><el-option v-for="value in PORT_OPTIONS" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="运输方式"><el-select v-model="manifestDraft.transportMode"><el-option label="3 公路运输" value="3 公路运输" /><el-option label="6 其他" value="6 其他" /></el-select></el-form-item>
        <el-form-item label="货物装载时间" required :error="manifestErrors.loadingTime"><el-input v-model="manifestDraft.loadingTime" placeholder="YYYY-MM-DD hh:mm:ss" /></el-form-item>
        <el-form-item label="卸货地代码" required><el-select v-model="manifestDraft.unloadCode"><el-option v-for="value in PORT_OPTIONS" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="总运/提单号" required :error="manifestErrors.waybillNo"><el-input v-model="manifestDraft.waybillNo" maxlength="35" placeholder="选择后可带出平台订单商品" /></el-form-item>
        <el-form-item label="货物通关代码"><el-select v-model="manifestDraft.clearanceCode"><el-option v-for="value in CUSTOMS_CLEARANCE_CODES" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="货物价值" required :error="manifestErrors.goodsValue"><el-input v-model="manifestDraft.goodsValue" maxlength="16" /></el-form-item>
        <el-form-item label="金额类型"><el-input v-model="manifestDraft.currency" maxlength="4" /></el-form-item>
        <el-form-item label="货物总件数" required :error="manifestErrors.totalPieces"><el-input v-model="manifestDraft.totalPieces" maxlength="8" /></el-form-item>
        <el-form-item label="包装类型"><el-select v-model="manifestDraft.packageType"><el-option v-for="value in PACKAGE_TYPES" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="货物总重（KG）" required :error="manifestErrors.totalWeight"><el-input v-model="manifestDraft.totalWeight" maxlength="14" /></el-form-item>
        <el-form-item label="运费支付方式"><el-input v-model="manifestDraft.freightPayMethod" maxlength="50" /></el-form-item>
        <el-form-item label="跨境指运地"><el-input v-model="manifestDraft.crossDestination" /></el-form-item>
        <el-form-item label="箱号（柜车必填）"><el-input v-model="manifestDraft.containerNo" maxlength="11" /></el-form-item>
        <el-form-item label="尺寸和类型"><el-input v-model="manifestDraft.sizeType" /></el-form-item>
        <el-form-item label="箱属"><el-input v-model="manifestDraft.containerOwner" /></el-form-item>
        <el-form-item label="空重标识"><el-select v-model="manifestDraft.emptyEmpty"><el-option label="1 货物多于1/4容量" value="1" /><el-option label="2 其他" value="2" /></el-select></el-form-item>
      </el-form>
      <h4>商品信息</h4>
      <div class="mc-import">
        <el-button size="small" @click="downloadGoodsTemplate">下载模板（原型 CSV）</el-button>
        <label class="mc-upload">导入 CSV<input type="file" accept=".csv,text/csv" @change="importManifestGoods" /></label>
      </div>
      <el-alert v-if="goodsImportError" class="mc-import-error" type="error" :closable="false" :title="goodsImportError" show-icon />
      <el-table :data="manifestDraft.goods" size="small" empty-text="请添加商品">
        <el-table-column label="商品描述" min-width="160"><template #default="{ row }"><el-input v-model="row.description" maxlength="256" /></template></el-table-column>
        <el-table-column label="货物件数" width="100"><template #default="{ row }"><el-input v-model="row.pieces" maxlength="8" /></template></el-table-column>
        <el-table-column label="毛重（KG）" width="110"><template #default="{ row }"><el-input v-model="row.weight" maxlength="14" /></template></el-table-column>
        <el-table-column label="包装类型" width="130"><template #default="{ row }"><el-select v-model="row.packageType"><el-option v-for="value in PACKAGE_TYPES" :key="value" :value="value" /></el-select></template></el-table-column>
        <el-table-column label="危险品编号" width="120"><template #default="{ row }"><el-input v-model="row.dangerNo" maxlength="30" /></template></el-table-column>
        <el-table-column label="收货人（企业）" width="150"><template #default="{ row }"><el-select v-model="row.receiver" filterable clearable placeholder="选择电商企业"><el-option v-for="value in ecommerceOptions" :key="value" :value="value" /></el-select></template></el-table-column>
        <el-table-column label="发货人（企业）" width="150"><template #default="{ row }"><el-select v-model="row.shipper" filterable clearable placeholder="选择电商企业"><el-option v-for="value in ecommerceOptions" :key="value" :value="value" /></el-select></template></el-table-column>
        <el-table-column label="危险品联系人" width="130"><template #default="{ row }"><el-input v-model="row.dangerContact" /></template></el-table-column>
        <el-table-column label="操作" width="80"><template #default="{ $index }"><el-button link type="danger" @click="manifestDraft.goods.splice($index, 1)">删除</el-button></template></el-table-column>
      </el-table>
      <el-button size="small" @click="addManifestGoods">添加商品</el-button>
      <template #footer><el-button @click="manifestVisible = false">取消</el-button><el-button v-business-write="'bcImportCustoms'" @click="submitManifest(false)">保存</el-button><el-button v-business-write="'bcImportCustoms'" type="primary" @click="submitManifest(true)">保存并申报</el-button></template>
    </el-dialog>

    <el-dialog v-model="confirmVisible" :title="confirmEditingId ? '修改确报' : '新增确报'" width="min(1020px, 96vw)" align-center destroy-on-close>
      <el-form label-position="top" class="mc-grid">
        <el-form-item label="货物运输批次号" required :error="confirmErrors.batchNo"><el-input v-model="confirmDraft.batchNo" maxlength="13" /></el-form-item>
        <el-form-item label="确报类型" required :error="confirmErrors.type"><el-select v-model="confirmDraft.type"><el-option v-for="value in CONFIRM_TYPES" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="过境口岸" required><el-select v-model="confirmDraft.port"><el-option v-for="value in PORT_OPTIONS" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="确报时间"><el-input v-model="confirmDraft.confirmTime" /></el-form-item>
        <el-form-item label="海关备注（发往海关）"><el-input v-model="confirmDraft.customsRemark" maxlength="14" /></el-form-item>
        <el-form-item label="公司备注（保存本地）"><el-input v-model="confirmDraft.companyRemark" maxlength="4" /></el-form-item>
        <el-form-item label="运输工具代码" required :error="confirmErrors.vehicleCode"><el-input v-model="confirmDraft.vehicleCode" maxlength="4" /></el-form-item>
        <el-form-item label="运输工具名称" required :error="confirmErrors.vehicleName"><el-input v-model="confirmDraft.vehicleName" /></el-form-item>
        <el-form-item label="驾驶员代码" required :error="confirmErrors.driverCode"><el-input v-model="confirmDraft.driverCode" maxlength="16" /></el-form-item>
        <el-form-item label="驾驶员名称" required :error="confirmErrors.driverName"><el-input v-model="confirmDraft.driverName" /></el-form-item>
      </el-form>
      <h4>挂车托架信息</h4>
      <el-table :data="confirmDraft.trailers" size="small" empty-text="无挂车托架（吨车不填）">
        <el-table-column label="运输工具代码" width="130"><template #default="{ row }"><el-input v-model="row.vehicleCode" maxlength="2" /></template></el-table-column>
        <el-table-column label="运输托架/托挂车牌号" min-width="170"><template #default="{ row }"><el-input v-model="row.plate" /></template></el-table-column>
        <el-table-column label="类型" width="140"><template #default="{ row }"><el-select v-model="row.type"><el-option v-for="value in TRAILER_TYPES" :key="value" :value="value" /></el-select></template></el-table-column>
        <el-table-column label="自重" width="110"><template #default="{ row }"><el-input v-model="row.weight" /></template></el-table-column>
        <el-table-column label="操作" width="80"><template #default="{ $index }"><el-button link type="danger" @click="confirmDraft.trailers.splice($index, 1)">删除</el-button></template></el-table-column>
      </el-table>
      <el-button size="small" @click="addTrailer">添加托架</el-button>
      <h4>集装箱信息</h4>
      <el-table :data="confirmDraft.containers" size="small" empty-text="无集装箱">
        <el-table-column label="运输工具代码" width="120"><template #default="{ row }"><el-input v-model="row.vehicleCode" maxlength="20" /></template></el-table-column>
        <el-table-column label="集装箱编号" width="140"><template #default="{ row }"><el-input v-model="row.containerNo" maxlength="11" /></template></el-table-column>
        <el-table-column label="尺寸和类型" width="150"><template #default="{ row }"><el-input v-model="row.sizeType" /></template></el-table-column>
        <el-table-column label="来源代码" width="130"><template #default="{ row }"><el-input v-model="row.sourceCode" maxlength="256" /></template></el-table-column>
        <el-table-column label="空重标识" width="110"><template #default="{ row }"><el-input v-model="row.emptyFlag" /></template></el-table-column>
        <el-table-column label="自重" width="100"><template #default="{ row }"><el-input v-model="row.weight" /></template></el-table-column>
        <el-table-column label="封志类型" width="130"><template #default="{ row }"><el-input v-model="row.sealType" /></template></el-table-column>
        <el-table-column label="封志号（电子关联号）" width="170"><template #default="{ row }"><el-input v-model="row.sealNo" /></template></el-table-column>
        <el-table-column label="施封人" width="120"><template #default="{ row }"><el-input v-model="row.sealer" /></template></el-table-column>
        <el-table-column label="操作" width="80"><template #default="{ $index }"><el-button link type="danger" @click="confirmDraft.containers.splice($index, 1)">删除</el-button></template></el-table-column>
      </el-table>
      <el-button size="small" @click="addContainer">添加集装箱</el-button>
      <template #footer><el-button @click="confirmVisible = false">取消</el-button><el-button v-business-write="'bcImportCustoms'" @click="submitConfirm(false)">保存</el-button><el-button v-business-write="'bcImportCustoms'" type="primary" @click="submitConfirm(true)">保存并提交</el-button></template>
    </el-dialog>

    <el-dialog v-model="vehicleVisible" title="录入车辆信息" width="min(560px, 96vw)" align-center>
      <el-form label-position="top" class="mc-grid">
        <el-form-item label="运输工具代码"><el-input v-model="vehicleForm.vehicleCode" maxlength="4" /></el-form-item>
        <el-form-item label="运输工具名称"><el-input v-model="vehicleForm.vehicleName" /></el-form-item>
        <el-form-item label="驾驶员代码"><el-input v-model="vehicleForm.driverCode" maxlength="16" /></el-form-item>
        <el-form-item label="驾驶员名称"><el-input v-model="vehicleForm.driverName" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="vehicleVisible = false">取消</el-button><el-button type="primary" @click="submitVehicle">确定</el-button></template>
    </el-dialog>

    <el-drawer v-model="manifestDetailVisible" title="原始舱单详情" size="min(860px, 96vw)">
      <template v-if="manifestDetail">
        <div class="detail-hero"><div><small>货物运输批次号</small><h2>{{ manifestDetail.batchNo }}</h2><span>{{ manifestDetail.port }} · {{ manifestDetail.waybillNo }}</span></div><StatusTag :label="manifestDetail.status" /></div>
        <section class="detail-section"><h3>舱单信息</h3><dl class="detail-grid"><div v-for="[label, value] in [['过境口岸', manifestDetail.port], ['运输方式', manifestDetail.transportMode], ['货物装载时间', manifestDetail.loadingTime], ['卸货地代码', manifestDetail.unloadCode], ['总运/提单号', manifestDetail.waybillNo], ['货物通关代码', manifestDetail.clearanceCode], ['货物价值', `${manifestDetail.currency} ${manifestDetail.goodsValue}`], ['货物总件数', manifestDetail.totalPieces], ['包装类型', manifestDetail.packageType], ['货物总重（KG）', manifestDetail.totalWeight], ['运费支付方式', manifestDetail.freightPayMethod], ['跨境指运地', manifestDetail.crossDestination], ['箱号', manifestDetail.containerNo], ['尺寸和类型', manifestDetail.sizeType], ['箱属', manifestDetail.containerOwner], ['空重标识', manifestDetail.emptyEmpty], ['录入者', manifestDetail.createdBy], ['录入时间', manifestDetail.createdAt], ['海关审核状态', manifestDetail.status], ['同步状态', manifestDetail.syncStatus]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl></section>
        <section class="detail-section"><h3>商品信息</h3><el-table :data="manifestDetail.goods" size="small" empty-text="无商品"><el-table-column prop="description" label="商品描述" min-width="160" /><el-table-column prop="pieces" label="货物件数" width="100" /><el-table-column prop="weight" label="毛重（KG）" width="110" /><el-table-column prop="packageType" label="包装类型" width="130" /><el-table-column prop="dangerNo" label="危险品编号" width="120" /><el-table-column prop="receiver" label="收货人（企业）" width="140" /><el-table-column prop="shipper" label="发货人（企业）" width="140" /><el-table-column prop="dangerContact" label="危险品联系人" width="130" /></el-table></section>
        <section class="detail-section"><h3>回执与日志</h3><el-table :data="manifestDetail.receipts" size="small" empty-text="暂无回执"><el-table-column prop="type" label="类型" width="120" /><el-table-column prop="status" label="状态" width="110" /><el-table-column prop="time" label="时间" width="170" /><el-table-column prop="content" label="内容" min-width="200" /></el-table><el-table :data="manifestDetail.logs" size="small" empty-text="暂无日志" class="mc-log"><el-table-column prop="action" label="操作" width="130" /><el-table-column prop="content" label="内容" min-width="220" /><el-table-column prop="operator" label="操作人" width="110" /><el-table-column prop="time" label="时间" width="170" /></el-table></section>
      </template>
    </el-drawer>

    <el-drawer v-model="confirmDetailVisible" title="载货确报详情" size="min(860px, 96vw)">
      <template v-if="confirmDetail">
        <div class="detail-hero"><div><small>货物运输批次号</small><h2>{{ confirmDetail.batchNo }}</h2><span>{{ confirmDetail.type }}</span></div><StatusTag :label="confirmDetail.status" /></div>
        <section class="detail-section"><h3>确报信息</h3><dl class="detail-grid"><div v-for="[label, value] in [['确报类型', confirmDetail.type], ['过境口岸', confirmDetail.port], ['确报时间', confirmDetail.confirmTime], ['海关备注', confirmDetail.customsRemark], ['公司备注', confirmDetail.companyRemark], ['运输工具代码', confirmDetail.vehicleCode], ['运输工具名称', confirmDetail.vehicleName], ['驾驶员代码', confirmDetail.driverCode], ['驾驶员名称', confirmDetail.driverName], ['录入者', confirmDetail.createdBy], ['录入时间', confirmDetail.createdAt], ['状态', confirmDetail.status], ['同步状态', confirmDetail.syncStatus]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl></section>
        <section class="detail-section"><h3>挂车托架与集装箱</h3><el-table :data="confirmDetail.trailers" size="small" empty-text="无挂车托架"><el-table-column prop="vehicleCode" label="运输工具代码" width="120" /><el-table-column prop="plate" label="托挂车牌号" min-width="150" /><el-table-column prop="type" label="类型" width="130" /><el-table-column prop="weight" label="自重" width="100" /></el-table><el-table :data="confirmDetail.containers" size="small" empty-text="无集装箱" class="mc-log"><el-table-column prop="containerNo" label="集装箱编号" width="140" /><el-table-column prop="sizeType" label="尺寸和类型" width="140" /><el-table-column prop="sealType" label="封志类型" width="120" /><el-table-column prop="sealNo" label="封志号（电子关联号）" width="170" /><el-table-column prop="sealer" label="施封人" width="110" /><el-table-column prop="weight" label="自重" width="90" /></el-table></section>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.mc-notice { margin-bottom: 12px; }
.mc-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.mc-hint { color: var(--muted); font-size: 12px; }
.mc-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 16px; }
.mc-filters label { display: flex; flex-direction: column; gap: 8px; width: 180px; color: var(--muted); }
.mc-filters :deep(.el-date-editor) { width: 100%; }
.mc-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 14px; }
.mc-grid :deep(.el-input), .mc-grid :deep(.el-select) { width: 100%; }
.mc-import { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.mc-upload { display: inline-flex; align-items: center; padding: 5px 12px; border: 1px solid var(--el-border-color); border-radius: 4px; font-size: 12px; cursor: pointer; color: var(--el-text-color-regular); }
.mc-upload input { display: none; }
.mc-import-error { margin-bottom: 8px; }
h4 { margin: 14px 0 8px; }
.mc-log { margin-top: 8px; }
.detail-hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.detail-hero h2 { margin: 4px 0; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 8px 18px; margin: 0; }
.detail-grid dt { color: var(--muted); font-size: 12px; }
.detail-grid dd { margin: 2px 0 10px; }
@media (max-width: 800px) { .mc-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
