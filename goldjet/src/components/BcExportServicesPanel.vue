<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DataTableFrame from './DataTableFrame.vue'
import StatusTag from './StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  BC_ATTACHMENT_FORMATS, BC_COST_ATTRIBUTES, BC_SERVICE_ITEMS, BC_SERVICE_STATUSES, bcServiceEligibility,
  bcServicePermissions, bcServiceStatistics, calculateBcCostTotal, createBcCostRow, filterBcServices, validateBcAttachment,
} from '../domain/bcExportServices.js'

const props = defineProps({
  businessTypes: { type: Array, default: () => ['BC出口'] },
  serviceLabel: { type: String, default: 'BC出口' },
  moduleKey: { type: String, default: 'bcExportCustoms' },
})
const {
  state, declarationSession, acceptBcExportServices, transferBcExportServices, terminateBcExportServices,
  cancelBcExportServices, finishBcExportServices, uploadBcServiceAttachment, deleteBcServiceAttachment,
  saveBcServiceCosts, appointBcOutsourced,
} = usePrototypeData()
const permission = computed(() => bcServicePermissions(declarationSession.value.role))
const services = computed(() => state.customsServiceOrders.filter(row => props.businessTypes.includes(row.businessType)))
const defaults = () => ({ serviceNo: '', platformOrderNo: '', waybillNo: '', transportMode: '', serviceItem: '', ecommerceName: '', salesperson: '', creator: '', createdRange: [], orderStatus: '', status: '', upstreamCancelled: '', handler: '' })
const filters = reactive(defaults())
const applied = ref({})
const expanded = ref(true)
const rows = computed(() => filterBcServices(services.value, applied.value))
const statistics = computed(() => bcServiceStatistics(rows.value))
const statusFilter = ref('')
function query() {
  if (!Object.values(filters).some(value => Array.isArray(value) ? value.length : String(value || '').length)) return
  applied.value = JSON.parse(JSON.stringify(filters))
}
function resetQuery() { Object.assign(filters, defaults()); applied.value = {}; statusFilter.value = '' }
const selectedIds = ref([])
const table = ref()
function clearSelection() { selectedIds.value = []; table.value?.clearSelection() }
function targets() { return selectedIds.value.length ? services.value.filter(row => selectedIds.value.includes(row.id)) : rows.value }
function filteredRows() { return statusFilter.value ? rows.value.filter(row => row.status === statusFilter.value) : rows.value }
function runAction(action, message) {
  const list = targets()
  if (!list.length) { ElMessage.warning('请勾选服务单或先查询'); return }
  try {
    const result = { accept: acceptBcExportServices, transfer: ids => transferBcExportServices(ids, { mode: 'department' }), terminate: terminateBcExportServices, cancel: cancelBcExportServices, finish: finishBcExportServices }[action](list.map(row => row.id))
    ElMessage.success(message ?? `操作完成（${result.length} 笔）`)
    clearSelection()
  } catch (error) { ElMessage.error(error.message) }
}
async function runConfirm(action, message, title) {
  const list = targets()
  if (!list.length) { ElMessage.warning('请勾选服务单或先查询'); return }
  try { await ElMessageBox.confirm(`${message}（共 ${list.length} 笔）`, title, { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  runAction(action)
}
// ---- 详情 ----
const detailId = ref(''), detailVisible = ref(false), detailTab = ref('info'), orderExpanded = ref(true)
const detail = computed(() => services.value.find(row => row.id === detailId.value))
const detailEligibility = computed(() => detail.value ? bcServiceEligibility(detail.value, 'accept') : null)
function openDetail(service) { detailId.value = service.id; detailTab.value = 'info'; detailVisible.value = true }
// ---- 附件 ----
async function pickAttachment(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const errors = validateBcAttachment(file)
  if (Object.keys(errors).length) { ElMessage.error(Object.values(errors)[0]); event.target.value = ''; return }
  const dataUrl = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.readAsDataURL(file) })
  try { uploadBcServiceAttachment(detail.value.id, { name: file.name, size: file.size, dataUrl }); ElMessage.success('附件已上传') } catch (error) { ElMessage.error(error.message) }
  event.target.value = ''
}
function downloadAttachment(attachment) {
  if (!attachment.dataUrl) { ElMessage.warning('该演示附件没有可下载的原文件'); return }
  const link = document.createElement('a'); link.href = attachment.dataUrl; link.download = attachment.name; link.click()
}
async function removeAttachment(attachment) {
  try { await ElMessageBox.confirm('删除后不再显示附件。', '删除附件', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try { deleteBcServiceAttachment(detail.value.id, attachment.id); ElMessage.success('附件已删除') } catch (error) { ElMessage.error(error.message) }
}
// ---- 委外 ----
const outsourcedVisible = ref(false), outsourcedSupplier = ref('申捷车队')
function openOutsourced() { outsourcedSupplier.value = detail.value.outsourcedSupplier || '申捷车队'; outsourcedVisible.value = true }
function submitOutsourced() {
  try { appointBcOutsourced(detail.value.id, outsourcedSupplier.value); outsourcedVisible.value = false; ElMessage.success('已设置委外，供应商可在门户接单（本地模拟）') } catch (error) { ElMessage.error(error.message) }
}
// ---- 应收应付 ----
const costDraft = ref([])
function startCosts() { costDraft.value = (detail.value.costs || []).map(row => ({ ...createBcCostRow(), ...row })) }
function addCostRow() { costDraft.value.push(createBcCostRow()) }
function removeCostRow(index) { costDraft.value.splice(index, 1) }
function saveCosts() {
  try { saveBcServiceCosts(detail.value.id, JSON.parse(JSON.stringify(costDraft.value))); ElMessage.success('应收应付已保存'); startCosts() } catch (error) { ElMessage.error(error.message) }
}
watch(detail, value => { if (value) startCosts() })
watch(() => [declarationSession.value.role, declarationSession.value.name], () => { detailVisible.value = false })
const summary = computed(() => {
  const rows_ = detail.value?.costs || []
  const receivable = rows_.filter(row => row.attribute === '应收').reduce((sum, row) => sum + (Number(row.total) || 0), 0)
  const payable = rows_.filter(row => row.attribute === '应付').reduce((sum, row) => sum + (Number(row.total) || 0), 0)
  return { receivable: receivable.toFixed(2), payable: payable.toFixed(2) }
})
</script>

<template>
  <div>
    <el-alert class="bc-notice" title="服务单只汇聚对应关务作业；FWD/XQD 编号映射（CUSTOMS-B024）、统计窗口（B019）、指定人流转（B018）与手工结果/结束服务关系（B045）按待确认保留。" type="info" :closable="false" />
    <div class="bc-actions">
      <el-button v-for="[key, label] in [['总计数量', '总计数量'], ['待接单', '待接单'], ['进行中', '进行中'], ['已完成', '已完成'], ['已终止', '已终止'], ['已取消', '已取消']]" :key="key" size="small" :type="statusFilter === (key === '总计数量' ? '' : key) ? 'primary' : ''" @click="statusFilter = key === '总计数量' ? '' : key">{{ label }}（{{ statistics[key] }}）</el-button>
      <span class="bc-hint">统计口径：{{ statistics.note }}；已选 {{ selectedIds.length }} 笔。</span>
    </div>
    <div class="bc-actions">
      <el-button v-business-write="moduleKey" :disabled="!permission.accept" @click="runAction('accept', '接单完成')">接单</el-button>
      <el-button v-business-write="moduleKey" :disabled="!permission.transfer" @click="runConfirm('transfer', '流转给所有报关员后订单改为待接单并从当前列表移出。', '流转')">流转</el-button>
      <el-button v-business-write="moduleKey" :disabled="!permission.terminate" @click="runConfirm('terminate', '终止后限制对应订单继续报关操作。', '终止服务')">终止服务</el-button>
      <el-button v-business-write="moduleKey" :disabled="!permission.cancel" @click="runConfirm('cancel', '仅进行中且上游取消服务=是。', '取消服务')">取消服务</el-button>
      <el-button v-business-write="moduleKey" :disabled="!permission.finish" @click="runConfirm('finish', '手工结束服务，不替代海关回执。', '结束服务')">结束服务</el-button>
    </div>
    <form class="bc-filters" aria-label="BC出口服务单筛选" @submit.prevent="query">
      <label>服务单号<el-input v-model="filters.serviceNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>平台订单号<el-input v-model="filters.platformOrderNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>总运单号<el-input v-model="filters.waybillNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>运输方式<el-select v-model="filters.transportMode" clearable filterable placeholder="全部"><el-option v-for="value in ['空运', '海运', '陆运']" :key="value" :value="value" /></el-select></label>
      <label>服务项<el-select v-model="filters.serviceItem" clearable filterable placeholder="全部"><el-option v-for="value in BC_SERVICE_ITEMS" :key="value" :value="value" /></el-select></label>
      <el-button link type="primary" @click="expanded = !expanded">{{ expanded ? '收起' : '展开' }}</el-button>
      <template v-if="expanded">
        <label>电商企业名称<el-select v-model="filters.ecommerceName" clearable filterable placeholder="全部"><el-option v-for="value in [...new Set(services.map(row => row.ecommerceName).filter(Boolean))]" :key="value" :value="value" /></el-select></label>
        <label>业务员<el-select v-model="filters.salesperson" clearable filterable placeholder="全部"><el-option v-for="value in [...new Set(services.map(row => row.salesperson).filter(Boolean))]" :key="value" :value="value" /></el-select></label>
        <label>建单人<el-select v-model="filters.creator" clearable filterable placeholder="全部"><el-option v-for="value in [...new Set(services.map(row => row.creator).filter(Boolean))]" :key="value" :value="value" /></el-select></label>
        <label>建单日期<el-date-picker v-model="filters.createdRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
        <label>订单状态<el-select v-model="filters.orderStatus" clearable placeholder="全部"><el-option v-for="value in ['进行中', '已完成', '已取消']" :key="value" :value="value" /></el-select></label>
        <label>服务单状态<el-select v-model="filters.status" clearable placeholder="全部"><el-option v-for="value in BC_SERVICE_STATUSES" :key="value" :value="value" /></el-select></label>
        <label>上游取消服务<el-select v-model="filters.upstreamCancelled" clearable placeholder="全部"><el-option label="是" value="true" /><el-option label="否" value="false" /></el-select></label>
        <label>接单人<el-select v-model="filters.handler" clearable filterable placeholder="全部"><el-option v-for="value in [...new Set(services.map(row => row.handler).filter(Boolean))]" :key="value" :value="value" /></el-select></label>
      </template>
      <el-button type="primary" native-type="submit">查询</el-button>
      <el-button @click="resetQuery">重置</el-button>
    </form>
    <DataTableFrame :rows="filteredRows()" :page-size="50" :page-sizes="[20, 50, 100]" selectable :selected-count="selectedIds.length">
      <template #default="{ rows: pageRows }">
        <el-table ref="table" :data="pageRows" stripe row-key="id" aria-label="BC出口服务单列表" @selection-change="items => selectedIds = items.map(item => item.id)">
          <el-table-column type="selection" reserve-selection width="46" />
          <el-table-column label="服务单号" width="150" fixed="left"><template #default="{ row }"><button class="link-button" @click="openDetail(row)">{{ row.serviceNo }}</button></template></el-table-column>
          <el-table-column prop="platformOrderNo" label="平台订单号" width="150" />
          <el-table-column prop="waybillNo" label="总运单号" width="130" />
          <el-table-column prop="transportMode" label="运输方式" width="90" />
          <el-table-column label="服务项" min-width="160"><template #default="{ row }">{{ (row.services || []).join('、') }}</template></el-table-column>
          <el-table-column prop="ecommerceName" label="电商企业名称" width="130" />
          <el-table-column prop="salesperson" label="业务员" width="90" />
          <el-table-column prop="creator" label="建单人" width="100" />
          <el-table-column label="建单日期" width="150"><template #default="{ row }">{{ (row.createdAt || '').slice(0, 16) }}</template></el-table-column>
          <el-table-column prop="orderStatus" label="订单状态" width="95" />
          <el-table-column label="服务单状态" width="110"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
          <el-table-column label="上游取消服务" width="110"><template #default="{ row }">{{ row.upstreamCancelled ? '是' : '否' }}</template></el-table-column>
          <el-table-column prop="handler" label="接单人" width="100" />
          <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">查看</el-button></template></el-table-column>
        </el-table>
      </template>
    </DataTableFrame>

    <el-drawer v-model="detailVisible" title="BC出口服务单详情" size="min(1000px, 96vw)">
      <template v-if="detail">
        <div class="detail-hero"><div><small>服务单号</small><h2>{{ detail.serviceNo }}</h2><span>{{ detail.platformOrderNo }} · {{ detail.ecommerceName }}</span></div><StatusTag :label="detail.status" /></div>
        <el-tabs v-model="detailTab">
          <el-tab-pane label="服务单信息" name="info">
            <section class="detail-section"><h3>订单信息</h3>
              <el-button link type="primary" @click="orderExpanded = !orderExpanded">{{ orderExpanded ? '收起订单信息' : '展开订单信息' }}</el-button>
              <dl v-if="orderExpanded" class="detail-grid">
                <div v-for="[label, value] in [['平台订单编号', detail.platformOrderNo], ['订单状态', detail.orderStatus], ['业务类型', 'BC出口'], ['财务名称', '广州航晟物流有限公司'], ['所属部门', detail.department], ['业务员', detail.salesperson], ['客户名称', detail.customer], ['联系人', '演示联系人'], ['联系人电话', '000-00000000'], ['联系人邮箱', 'demo@example.invalid'], ['备注', detail.remark || '无'], ['运输方式', detail.transportMode], ['始发港', detail.origin || 'CAN'], ['目的港', detail.destination || 'LAX'], ['总运单号', detail.waybillNo], ['服务项', (detail.services || []).join('、')], ['货物统称', '合成出口货物'], ['HS编码', '33049900'], ['商品名称', (detail.goods || []).map(row => row.name).join('、') || '合成出口商品（演示）'], ['规格型号', 'DEMO'], ['预计件数', detail.parcelCount || 120], ['总毛重（KG）', 320], ['总净重（KG）', 300]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
              </dl>
            </section>
            <section class="detail-section"><h3>服务信息</h3><dl class="detail-grid">
              <div v-for="[label, value] in [['服务类型', detail.outsourced ? '委外服务' : '我司服务'], ['供应商', detail.outsourcedSupplier || '广东高捷'], ['内部部门', detail.department], ['报关类型', '代理报关'], ['是否转仓', '否'], ['接单人', detail.handler || '未接单'], ['备注', detail.remark || '无']]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
            </dl>
            <div class="bc-actions">
              <el-button v-business-write="moduleKey" :disabled="!permission.accept" @click="openOutsourced">委外服务</el-button>
              <label v-if="permission.attach" class="bc-upload">上传（≤5MB，{{ BC_ATTACHMENT_FORMATS.join('/') }}）<input type="file" @change="pickAttachment" /></label>
            </div>
            </section>
            <section class="detail-section"><h3>资料附件</h3>
              <el-table :data="detail.attachments || []" size="small" empty-text="暂无附件">
                <el-table-column prop="name" label="资料" min-width="200" />
                <el-table-column prop="size" label="大小（字节）" width="110" />
                <el-table-column prop="uploader" label="上传人" width="110" />
                <el-table-column prop="uploadedAt" label="上传时间" width="170" />
                <el-table-column label="操作" width="140" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="downloadAttachment(row)">下载</el-button><el-button v-if="permission.attach" link type="danger" @click="removeAttachment(row)">删除</el-button></template></el-table-column>
              </el-table>
            </section>
          </el-tab-pane>
          <el-tab-pane label="服务记录" name="records">
            <el-table :data="detail.serviceRecords || []" size="small" empty-text="暂无服务记录"><el-table-column prop="event" label="处理事项" width="130" /><el-table-column prop="result" label="处理结果" width="90" /><el-table-column prop="actor" label="操作人" width="110" /><el-table-column prop="time" label="处理时间" width="170" /><el-table-column prop="content" label="操作内容" min-width="240" /></el-table>
            <p class="bc-hint">异常处理说明：修改总运单、记录弃货、清单撤单申请、总运单撤单申请、退单退场、删单退场按订单页动作记录。</p>
          </el-tab-pane>
          <el-tab-pane label="应收应付" name="costs">
            <div class="bc-actions"><el-button v-business-write="moduleKey" :disabled="!permission.cost" size="small" @click="addCostRow">添加</el-button><el-button v-business-write="moduleKey" :disabled="!permission.cost" size="small" @click="saveCosts">保存</el-button><span class="bc-hint">应收合计 {{ summary.receivable }}；应付合计 {{ summary.payable }}；来源为结算管理创建的应收应付单。</span></div>
            <el-table :data="costDraft" size="small" empty-text="暂无应收应付">
              <el-table-column label="结算单位" width="150"><template #default="{ row }"><el-input v-model="row.settlementParty" size="small" /></template></el-table-column>
              <el-table-column label="状态" width="110"><template #default="{ row }"><el-select v-model="row.status" size="small"><el-option v-for="value in ['未结算', '已结算', '部分结算']" :key="value" :value="value" /></el-select></template></el-table-column>
              <el-table-column label="成本项目" width="130"><template #default="{ row }"><el-input v-model="row.costItem" size="small" /></template></el-table-column>
              <el-table-column label="成本属性" width="105"><template #default="{ row }"><el-select v-model="row.attribute" size="small"><el-option v-for="value in BC_COST_ATTRIBUTES" :key="value" :value="value" /></el-select></template></el-table-column>
              <el-table-column label="数量" width="90"><template #default="{ row }"><el-input v-model="row.quantity" size="small" /></template></el-table-column>
              <el-table-column label="计费单位" width="100"><template #default="{ row }"><el-input v-model="row.unit" size="small" /></template></el-table-column>
              <el-table-column label="币种" width="80"><template #default="{ row }"><el-input v-model="row.currency" size="small" /></template></el-table-column>
              <el-table-column label="含税单价（原币）" width="140"><template #default="{ row }"><el-input v-model="row.unitPrice" size="small" /></template></el-table-column>
              <el-table-column label="总金额（原币）" width="120"><template #default="{ row }">{{ calculateBcCostTotal(row) }}</template></el-table-column>
              <el-table-column label="是否代收" width="95"><template #default="{ row }"><el-select v-model="row.collect" size="small"><el-option label="是" value="是" /><el-option label="否" value="否" /></el-select></template></el-table-column>
              <el-table-column label="操作" width="80" fixed="right"><template #default="{ $index }"><el-button v-if="permission.cost" link type="danger" @click="removeCostRow($index)">删除</el-button></template></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="操作日志" name="logs">
            <el-table :data="detail.logs || []" size="small" empty-text="暂无操作日志"><el-table-column prop="operator" label="操作人" width="110" /><el-table-column prop="action" label="操作名称" width="130" /><el-table-column prop="time" label="操作时间" width="170" /><el-table-column prop="content" label="操作内容" min-width="220" /></el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>

    <el-dialog v-model="outsourcedVisible" title="委外服务" width="min(460px, 96vw)" align-center>
      <el-form label-position="top"><el-form-item label="委外供应商" required><el-select v-model="outsourcedSupplier" filterable><el-option v-for="value in ['申捷车队', '远通运输', '广东高捷']" :key="value" :value="value" /></el-select></el-form-item></el-form>
      <el-alert type="info" :closable="false" title="确认后供应商可在供应商门户接单；本原型仅记录委外标记。" />
      <template #footer><el-button @click="outsourcedVisible = false">取消</el-button><el-button type="primary" @click="submitOutsourced">确定</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.bc-notice { margin-bottom: 12px; }
.bc-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.bc-hint { color: var(--muted); font-size: 12px; }
.bc-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 16px; }
.bc-filters label { display: flex; flex-direction: column; gap: 8px; width: 180px; color: var(--muted); }
.bc-filters :deep(.el-date-editor) { width: 100%; }
.detail-hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.detail-hero h2 { margin: 4px 0; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 8px 18px; margin: 0; }
.detail-grid dt { color: var(--muted); font-size: 12px; }
.detail-grid dd { margin: 2px 0 10px; }
.bc-upload { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
</style>
