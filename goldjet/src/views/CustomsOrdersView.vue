<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  CUSTOMS_ORDER_TYPES, CUSTOMS_SERVICE_STATUSES, DECLARATION_CUSTOMS_STATUSES,
  createMaterialDraft, customsOperationPermissions, declarationEligibility, deriveCustomsStatus, filterCustomsOrders,
  requiredMaterialWarning, serviceOrderPermissions,
} from '../domain/customsOperations.js'

const route = useRoute(), router = useRouter()
const {
  state, declarationSession, acceptCustomsOrders, transferCustomsOrders, terminateCustomsOrders, cancelCustomsOrders,
  reviewCustomsMaterials, uploadCustomsAttachment, deleteCustomsAttachment, generateCustomsDocuments,
  submitDeclaration, reviewDeclaration, sendDeclaration, copyDeclaration, voidDeclaration,
  manageDeclarationCustomsStatus, recordDeclarationLetter, arrangeCustomsInspection,
} = usePrototypeData()
const permission = computed(() => customsOperationPermissions(declarationSession.value.role))
const actor = computed(() => ({ role: declarationSession.value.role, name: declarationSession.value.name }))
const canAct = computed(() => permission.value.operate)

const tabs = CUSTOMS_ORDER_TYPES
const tab = ref('普货进口')
const defaults = () => ({ serviceNo: '', orderNo: '', waybillNo: '', houseNo: '', serviceItems: [], customer: '', salesperson: '', customsStatuses: [], range: ['2026-08-08', '2026-09-08'] })
const filters = reactive(defaults())
const applied = ref(defaults())
const expanded = ref(true)
const selectedIds = ref([])
const table = ref()
const currentRows = computed(() => state.customsServiceOrders.filter(row => row.businessType === tab.value))
const conditionRows = computed(() => filterCustomsOrders(currentRows.value, applied.value, { statusOf: row => deriveCustomsStatus(state, row) }))
const statusNav = ['总计', ...CUSTOMS_SERVICE_STATUSES]
const statusFilter = ref('总计')
const rows = computed(() => conditionRows.value.filter(row => statusFilter.value === '总计' || row.status === statusFilter.value))
const counts = computed(() => Object.fromEntries(statusNav.map(status => [status, status === '总计' ? conditionRows.value.length : conditionRows.value.filter(row => row.status === status).length])))
const serviceItemOptions = ['国内报关', '换单', '查验']
function query() { applied.value = JSON.parse(JSON.stringify(filters)) }
function resetQuery() { Object.assign(filters, defaults()) }
function clearSelection() { selectedIds.value = []; table.value?.clearSelection() }
function targets() { return selectedIds.value.length ? currentRows.value.filter(row => selectedIds.value.includes(row.id)) : rows.value }
function run(message, action) {
  const list = targets()
  if (!list.length) { ElMessage.warning('没有可操作的记录'); return }
  try { const result = action(list.map(row => row.id)); ElMessage.success(`${message}（${result?.length ?? list.length} 笔）`); clearSelection() } catch (error) { ElMessage.error(error.message) }
}
async function runConfirm(message, title, action) {
  const list = targets()
  if (!list.length) { ElMessage.warning('没有可操作的记录'); return }
  try { await ElMessageBox.confirm(`${message}（共 ${list.length} 笔）`, title, { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  run(title, action)
}

// ---- 详情 ----
const detailId = ref(''), detailVisible = ref(false), detailTab = ref('info')
const detail = computed(() => state.customsServiceOrders.find(row => row.id === detailId.value))
const detailPermissions = computed(() => detail.value ? serviceOrderPermissions(detail.value, actor.value.role, actor.value.name) : {})
const declarations = computed(() => (detail.value?.declarationIds || []).map(id => state.customsDeclarations.find(row => row.id === id)).filter(Boolean))
const selectedDeclarationId = ref('')
const selectedDeclaration = computed(() => declarations.value.find(row => row.id === selectedDeclarationId.value))
const declarationEligibilities = computed(() => selectedDeclaration.value ? declarationEligibility(selectedDeclaration.value) : null)
function openDetail(order) { detailId.value = order.id; detailTab.value = 'info'; selectedDeclarationId.value = ''; detailVisible.value = true }
async function modifyOutsourced(value) {
  if (value !== '是') return
  try {
    await ElMessageBox.confirm('选择委外后不可再修改，并生成该供应商门户的服务订单（原型仅记录选择）。', '确认委外', { confirmButtonText: '确认委外', cancelButtonText: '取消' })
    detail.value.outsourced = true
    detail.value.outsourcedSupplier ||= '申捷车队'
    detail.value.serviceRecords.push({ id: `${detail.value.id}-R${detail.value.serviceRecords.length + 1}`, event: '委外', content: `委外给 ${detail.value.outsourcedSupplier}；确认后生成供应商门户服务订单（本地模拟）`, actor: actor.value.name, time: CUSTOMS_NOW })
  } catch { detail.value.outsourced = false }
}
function downloadAttachment(attachment) {
  if (!attachment.dataUrl) { ElMessage.warning('该演示附件没有可下载的原文件'); return }
  const link = document.createElement('a'); link.href = attachment.dataUrl; link.download = attachment.name; link.click()
}
async function removeAttachment(attachment) {
  try { await ElMessageBox.confirm('只能删除自己上传的附件。', '删除附件', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try { deleteCustomsAttachment(detail.value.id, attachment.id); ElMessage.success('附件已删除') } catch (error) { ElMessage.error(error.message) }
}
async function pickAttachment(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const dataUrl = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.readAsDataURL(file) })
  try { uploadCustomsAttachment(detail.value.id, { name: file.name, size: file.size, type: '其他', dataUrl }); ElMessage.success('附件已上传') } catch (error) { ElMessage.error(error.message) }
  event.target.value = ''
}

// ---- 审核资料 ----
const reviewVisible = ref(false), reviewForm = reactive({ approved: true, reason: '', recipients: [], attachments: [] })
const REVIEW_MAIL_TEMPLATE = (reason) => `尊敬的客户：\n经审核，以下资料未通过：${reason || '（原因）'}\n请修改后重新上传。\n报关员：${actor.value.name}`
function openReview() { reviewForm.approved = true; reviewForm.reason = ''; reviewForm.recipients = []; reviewForm.attachments = []; reviewVisible.value = true }
function submitReview() {
  try {
    reviewCustomsMaterials(detail.value.id, { ...reviewForm, attachments: JSON.parse(JSON.stringify(reviewForm.attachments)) })
    reviewVisible.value = false
    ElMessage.success(reviewForm.approved ? '审核通过已保存' : '审核不通过已保存并发送邮件（本地模拟）')
  } catch (error) { ElMessage.error(error.message) }
}
async function addReviewAttachment(event) {
  const file = event.target.files?.[0]
  if (!file) return
  reviewForm.attachments.push({ id: `RA-${Date.now()}`, name: file.name, size: file.size })
  event.target.value = ''
}

// ---- 单证制作 ----
const materialVisible = ref(false), materialDraft = reactive(createMaterialDraft())
function openMaterial() { Object.assign(materialDraft, createMaterialDraft(detail.value)); materialVisible.value = true }
function submitMaterial() {
  const warnings = requiredMaterialWarning(materialDraft)
  try {
    generateCustomsDocuments(detail.value.id, JSON.parse(JSON.stringify(materialDraft)))
    materialVisible.value = false
    ElMessage.success(`已生成报关单、发票、装箱单、合同${warnings.length ? `；${warnings.join('、')}` : ''}`)
  } catch (error) { ElMessage.error(error.message) }
}

// ---- 报关单操作 ----
const printVisible = ref(false), printDeclaration = ref(null)
function requireDeclaration() {
  if (!selectedDeclarationId.value) { ElMessage.warning('请先在单据操作区选择一条报关单'); return false }
  return true
}
function addDeclaration() {
  if (!detail.value) return
  if (detail.value.businessType !== '普货进口') {
    ElMessage.info('此切片只实现进口整合申报；出口整合、一次录入与转关申报按后续切片推进。')
    return
  }
  router.push({ path: `/fulfillment/customs-orders/${detail.value.id}/preentry` })
}
function editDeclarationPreentry(declaration) {
  if (!detail.value || declaration.status !== '新增' || !canAct.value) { ElMessage.info('仅当前接单人可编辑新增状态的报关单'); return }
  router.push({ path: `/fulfillment/customs-orders/${detail.value.id}/preentry/${declaration.id}` })
}
function submitForReview() {
  if (!requireDeclaration()) return
  try { submitDeclaration(selectedDeclarationId.value); ElMessage.success('已提交复审') } catch (error) { ElMessage.error(error.message) }
}
const declReviewVisible = ref(false), declReviewForm = reactive({ approved: true, reason: '' })
function openDeclReview() { if (!requireDeclaration()) return; declReviewForm.approved = true; declReviewForm.reason = ''; declReviewVisible.value = true }
function submitDeclReview() {
  try { reviewDeclaration(selectedDeclarationId.value, { ...declReviewForm }); declReviewVisible.value = false; ElMessage.success('复审结果已保存') } catch (error) { ElMessage.error(error.message) }
}
const sendVisible = ref(false), sendForm = reactive({ icCard: '' })
function openSend() { if (!requireDeclaration()) return; sendForm.icCard = ''; sendVisible.value = true }
function submitSend() {
  try { sendDeclaration(selectedDeclarationId.value, sendForm.icCard); sendVisible.value = false; ElMessage.success('发送单一窗口成功（本地模拟），报关状态为已申报') } catch (error) { ElMessage.error(error.message) }
}
async function copyDecl() {
  if (!requireDeclaration()) return
  try { const copy = copyDeclaration(selectedDeclarationId.value); selectedDeclarationId.value = copy.id; ElMessage.success(`已复制为 ${copy.docNo}，状态为新增`) } catch (error) { ElMessage.error(error.message) }
}
async function voidDecl() {
  if (!requireDeclaration()) return
  try { await ElMessageBox.confirm('作废后单据状态为已作废；如需删单请选择“删单”操作。', '作废报关单', { confirmButtonText: '作废', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try { voidDeclaration(selectedDeclarationId.value); ElMessage.success('报关单已作废') } catch (error) { ElMessage.error(error.message) }
}
const statusManageVisible = ref(false), manageStatus = ref('')
function openStatusManage() { if (!requireDeclaration()) return; manageStatus.value = selectedDeclaration.value.customsStatus; statusManageVisible.value = true }
function submitStatusManage() {
  try { manageDeclarationCustomsStatus(selectedDeclarationId.value, manageStatus.value); statusManageVisible.value = false; ElMessage.success('报关状态已更新') } catch (error) { ElMessage.error(error.message) }
}
const letterVisible = ref(false), letterKind = ref('退单'), letterContent = ref('')
function openLetter(kind) { if (!requireDeclaration()) return; letterKind.value = kind; letterContent.value = ''; letterVisible.value = true }
function submitLetter() {
  try { recordDeclarationLetter(selectedDeclarationId.value, letterKind.value, letterContent.value); letterVisible.value = false; ElMessage.success(`${letterKind.value}处理记录已生成`) } catch (error) { ElMessage.error(error.message) }
}
function openPrint() { if (!requireDeclaration()) return; printDeclaration.value = selectedDeclaration.value; printVisible.value = true }
function printNow() { window.print() }
function downloadDeclaration() {
  if (!requireDeclaration()) return
  const declaration = selectedDeclaration.value
  const lines = [['单据编号', declaration.docNo], ['单据类型', declaration.typeLabel], ['海关编号', declaration.declarationNo], ['单据状态', declaration.status], ['报关状态', declaration.customsStatus], ['提运单号', declaration.waybillNo], ['境内收发货人', declaration.domesticConsignor], ['总毛重', declaration.grossWeight], ['总价', `${declaration.currency} ${declaration.totalValue}`]]
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = '\ufeff' + lines.map(line => line.map(escape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${declaration.docNo || '报关单'}.csv`; link.click(); URL.revokeObjectURL(link.href)
  ElMessage.success('已下载打印格式数据（原型用 CSV 代替 PDF，正式模板待确认）')
}
const inspectVisible = ref(false), inspectForm = reactive({ inspector: '', declarationNo: '', waybillNo: '' })
function openInspect() { inspectForm.inspector = ''; inspectForm.declarationNo = selectedDeclaration.value?.declarationNo || ''; inspectForm.waybillNo = detail.value?.waybillNo || ''; inspectVisible.value = true }
function submitInspect() {
  try { arrangeCustomsInspection(detail.value.id, { ...inspectForm }); inspectVisible.value = false; ElMessage.success('已生成安排查验记录，查验员在小程序可见（本地模拟）') } catch (error) { ElMessage.error(error.message) }
}
function disabledAction(name) { ElMessage.info(`“${name}”归入后续切片：改单/删单/退运/落装/改配与预录、复审界面细节按第028篇后续章节实现。`) }

// ---- 流转 ----
const transferVisible = ref(false), transferMode = ref('department'), transferTarget = ref('')
const clerkOptions = [...new Set(state.customsServiceOrders.map(row => row.clerk).filter(Boolean))]
function openTransfer() {
  const list = targets().filter(row => serviceOrderPermissions(row, actor.value.role, actor.value.name).transfer)
  if (!list.length) { ElMessage.warning('所选订单不能流转'); return }
  transferMode.value = 'department'; transferTarget.value = ''; transferVisible.value = true
}
function submitTransfer() {
  try { transferCustomsOrders(targets().map(row => row.id), { mode: transferMode.value, target: transferTarget.value }); transferVisible.value = false; ElMessage.success('已流转'); clearSelection() } catch (error) { ElMessage.error(error.message) }
}
watch(() => [declarationSession.value.role, declarationSession.value.name], () => { detailVisible.value = false; reviewVisible.value = false; materialVisible.value = false })
watch(tab, () => { clearSelection(); statusFilter.value = '总计'; Object.assign(filters, defaults()); applied.value = defaults() })
watch(() => route.query.serviceId, serviceId => {
  if (!serviceId) return
  const service = state.customsServiceOrders.find(row => row.id === serviceId)
  if (!service) { ElMessage.warning('未找到关务服务订单'); return }
  tab.value = service.businessType
  openDetail(service)
  detailTab.value = 'service'
  selectedDeclarationId.value = String(route.query.declarationId || '')
}, { immediate: true })
</script>

<template>
  <div class="module-view">
    <PageHeader title="普货关务" description="服务订单受理与流转 · 单证制作与单据操作">
      <template #actions>
        <el-button v-business-write="'customsOrders'" :disabled="!canAct" @click="openTransfer">流转</el-button>
        <el-button v-business-write="'customsOrders'" :disabled="!canAct" @click="runConfirm('仅待接单的订单会被接单，其他状态自动过滤。', '接单', acceptCustomsOrders)">接单</el-button>
        <el-button v-business-write="'customsOrders'" :disabled="!canAct" @click="runConfirm('仅上游取消服务=是的进行中订单可终止；终止不影响应收应付生成。', '终止服务', terminateCustomsOrders)">终止服务</el-button>
        <el-button v-business-write="'customsOrders'" :disabled="!canAct" @click="runConfirm('仅上游取消服务=是的进行中订单可取消；取消不再生成应收应付。', '取消服务', cancelCustomsOrders)">取消服务</el-button>
      </template>
    </PageHeader>
    <el-alert class="customs-notice" title="单一窗口、海关回执、邮件与供应商门户均为浏览器内本地模拟；概要/一次录入、出口/转关申报、涉检/集装箱/随附单证及改单/删单/退运/落装/改配归后续切片。" type="info" :closable="false" />
    <el-tabs v-model="tab"><el-tab-pane v-for="value in tabs" :key="value" :label="value" :name="value" /></el-tabs>
    <div class="status-nav">
      <el-button v-for="status in statusNav" :key="status" size="small" :type="statusFilter === status ? 'primary' : ''" @click="statusFilter = status">{{ status }}（{{ counts[status] }}）</el-button>
      <span class="customs-hint">已选 {{ selectedIds.length }} 笔；未勾选时操作按当前查询结果执行。</span>
    </div>
    <form class="customs-filters" aria-label="关务服务订单筛选" @submit.prevent="query">
      <label v-for="[key, label] in [['serviceNo', '服务订单号'], ['orderNo', '订单号'], ['waybillNo', '总运单号'], ['houseNo', '客户分单号']]" :key="key">{{ label }}<el-input v-model="filters[key]" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>服务项<el-select v-model="filters.serviceItems" multiple collapse-tags placeholder="全部"><el-option v-for="value in serviceItemOptions" :key="value" :value="value" /></el-select></label>
      <label>客户名称<el-input v-model="filters.customer" clearable /></label>
      <label>业务员<el-input v-model="filters.salesperson" clearable /></label>
      <label>报关状态<el-select v-model="filters.customsStatuses" multiple collapse-tags placeholder="全部"><el-option label="无" value="无" /><el-option v-for="value in DECLARATION_CUSTOMS_STATUSES" :key="value" :value="value" /></el-select></label>
      <label>下单日期<el-date-picker v-model="filters.range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
      <el-button type="primary" native-type="submit">查询</el-button>
      <el-button @click="resetQuery">重置</el-button>
      <el-button link type="primary" @click="expanded = !expanded">{{ expanded ? '收起' : '展开' }}</el-button>
    </form>
    <DataTableFrame :rows="rows" :page-size="50" :page-sizes="[20, 50, 100]" selectable :selected-count="selectedIds.length">
      <template #default="{ rows: pageRows }">
        <el-table ref="table" :data="pageRows" stripe row-key="id" aria-label="关务服务订单列表" @selection-change="items => selectedIds = items.map(item => item.id)">
          <el-table-column type="selection" reserve-selection width="46" />
          <el-table-column label="服务订单号" width="160" fixed="left"><template #default="{ row }"><button class="link-button" @click="openDetail(row)">{{ row.serviceNo }}</button></template></el-table-column>
          <el-table-column prop="orderNo" label="订单号" width="170" />
          <el-table-column prop="waybillNo" label="总运单号" width="130" />
          <el-table-column prop="houseNo" label="客户分单号" width="110" />
          <el-table-column prop="businessType" label="业务类型" width="95" />
          <el-table-column prop="transportMode" label="运输方式" width="90" />
          <el-table-column label="服务项" min-width="140"><template #default="{ row }">{{ (row.services || []).join('、') }}</template></el-table-column>
          <el-table-column prop="customer" label="客户名称" min-width="130" />
          <el-table-column prop="salesperson" label="业务员" width="90" />
          <el-table-column prop="creator" label="建单人" width="90" />
          <el-table-column label="下单时间" width="150"><template #default="{ row }">{{ (row.createdAt || '').slice(0, 16) }}</template></el-table-column>
          <el-table-column prop="orderStatus" label="订单状态" width="95" />
          <el-table-column label="服务订单状态" width="120"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
          <el-table-column label="报关状态" width="95"><template #default="{ row }">{{ deriveCustomsStatus(state, row) }}</template></el-table-column>
          <el-table-column label="操作" width="110" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">查看详情</el-button></template></el-table-column>
        </el-table>
      </template>
    </DataTableFrame>

    <el-dialog v-model="transferVisible" title="流转服务订单" width="min(460px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item label="流转方式"><el-radio-group v-model="transferMode"><el-radio label="department">流转给所有报关员（重置待接单）</el-radio><el-radio label="person">流转给指定人（无需接单）</el-radio></el-radio-group></el-form-item>
        <el-form-item v-if="transferMode === 'person'" label="指定报关员"><el-select v-model="transferTarget" filterable placeholder="选择报关员"><el-option v-for="value in clerkOptions" :key="value" :value="value" /></el-select></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" title="仅本人接单且进行中的订单会被流转；原接单人只读。" />
      <template #footer><el-button @click="transferVisible = false">取消</el-button><el-button type="primary" @click="submitTransfer">确定</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="关务服务订单详情" size="min(1080px, 96vw)">
      <template v-if="detail">
        <div class="detail-hero"><div><small>服务订单号</small><h2>{{ detail.serviceNo }}</h2><span>{{ detail.businessType }} · {{ detail.customer }}</span></div><StatusTag :label="detail.status" /></div>
        <el-alert v-if="detail.upstreamCancelled" type="warning" :closable="false" title="上游取消服务=是：进行中订单可执行终止或取消服务；待接单由上游取消自动转已取消（本地模拟）。" />
        <el-tabs v-model="detailTab">
          <el-tab-pane label="基本信息" name="info">
            <section class="detail-section"><h3>订单信息（上游只读）</h3><dl class="detail-grid">
              <div v-for="[label, value] in [['订单号', detail.orderNo], ['总运单号', detail.waybillNo], ['客户分单号', detail.houseNo], ['业务类型', detail.businessType], ['运输方式', detail.transportMode], ['客户名称', detail.customer], ['业务员', detail.salesperson], ['建单人', detail.creator], ['下单时间', detail.createdAt], ['订单状态', detail.orderStatus], ['服务订单号', detail.serviceNo]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
            </dl>
            <el-table :data="detail.goods || []" size="small" empty-text="无货物明细（由上游订单带出）"><el-table-column prop="name" label="品名" min-width="140" /><el-table-column prop="hsCode" label="HS编码" width="120" /><el-table-column prop="quantity" label="数量" width="90" /><el-table-column prop="unitPrice" label="单价" width="90" /></el-table>
            </section>
          </el-tab-pane>
          <el-tab-pane label="服务信息" name="service">
            <section class="detail-section"><h3>服务基本信息</h3><dl class="detail-grid">
              <div><dt>服务类型</dt><dd>{{ (detail.services || []).join('、') }}</dd></div>
              <div><dt>供应商 / 内部部门</dt><dd>广东高捷 / {{ detail.department }}</dd></div>
              <div><dt>报关类型</dt><dd>{{ detail.customsType || '代理报关' }}</dd></div>
              <div><dt>是否转仓</dt><dd>{{ detail.transferWarehouse ? '是' : '否' }}</dd></div>
              <div><dt>是否委外</dt><dd><el-select :model-value="detail.outsourced ? '是' : '否'" :disabled="detail.outsourced" size="small" style="width:90px" @update:model-value="modifyOutsourced"><el-option label="否" value="否" /><el-option label="是" value="是" /></el-select></dd></div>
              <div v-if="detail.outsourced"><dt>外部单位</dt><dd>{{ detail.outsourcedSupplier }}</dd></div>
              <div><dt>服务状态</dt><dd>{{ detail.status }}</dd></div>
            </dl></section>
            <section class="detail-section"><h3>附件资料</h3>
              <el-table :data="detail.attachments || []" size="small" empty-text="暂无附件">
                <el-table-column prop="name" label="资料名称" min-width="170" />
                <el-table-column prop="type" label="附件类型" width="100" />
                <el-table-column prop="source" label="来源" width="110" />
                <el-table-column prop="operator" label="操作人" width="100" />
                <el-table-column label="操作时间" width="150"><template #default="{ row }">{{ (row.operatedAt || '').slice(0, 16) }}</template></el-table-column>
                <el-table-column prop="receipt" label="回执信息" min-width="180" />
                <el-table-column label="操作" width="150" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="downloadAttachment(row)">下载</el-button><el-button v-if="row.source === '当前服务订单' && row.operator === actor.name" v-business-write="'customsOrders'" link type="danger" @click="removeAttachment(row)">删除</el-button></template></el-table-column>
              </el-table>
              <div class="service-actions">
                <el-button v-business-write="'customsOrders'" :disabled="!canAct || detail.status !== '进行中'" @click="openMaterial">单证制作</el-button>
                <el-button v-business-write="'customsOrders'" :disabled="!canAct || detail.status !== '进行中'" @click="openReview">审核资料</el-button>
                <label v-if="detail.handler === actor.name" class="customs-upload">上传附件<input type="file" @change="pickAttachment" /></label>
              </div>
              <p class="customs-hint">下载附件对所有人可见；上传与删除仅接单员，删除只作用于自己上传的附件。</p>
            </section>
            <section class="detail-section"><h3>单据操作区</h3>
              <el-table :data="declarations" size="small" empty-text="暂无报关单">
                <el-table-column width="46"><template #default="{ row }"><el-radio v-model="selectedDeclarationId" :label="row.id"><span /></el-radio></template></el-table-column>
                <el-table-column prop="docNo" label="单据编号" width="150" />
                <el-table-column prop="typeLabel" label="单据类型" width="160" />
                <el-table-column prop="declarationNo" label="海关编号" width="150" />
                <el-table-column label="单据状态" width="100"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
                <el-table-column prop="customsStatus" label="报关状态" width="95" />
                <el-table-column prop="note" label="备注" min-width="150" />
                <el-table-column label="操作" width="170" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="selectedDeclarationId = row.id; detailTab = 'declaration'">查看</el-button><el-button v-if="row.status === '新增'" v-business-write="'customsOrders'" link type="primary" @click="editDeclarationPreentry(row)">继续预录</el-button></template></el-table-column>
              </el-table>
              <div class="service-actions">
                <el-button v-business-write="'customsOrders'" :disabled="!canAct || detail.status !== '进行中'" size="small" @click="addDeclaration">新增</el-button>
                <el-button v-business-write="'customsOrders'" :disabled="!canAct || !declarationEligibilities?.submit" size="small" @click="submitForReview">提交审核</el-button>
                <el-button v-business-write="'customsOrders'" :disabled="!canAct || !declarationEligibilities?.review" size="small" @click="openDeclReview">复审</el-button>
                <el-button v-business-write="'customsOrders'" :disabled="!canAct || !declarationEligibilities?.send" size="small" @click="openSend">发送单一窗口</el-button>
                <el-button v-business-write="'customsOrders'" :disabled="!canAct || !selectedDeclaration" size="small" @click="copyDecl">复制</el-button>
                <el-button v-business-write="'customsOrders'" :disabled="!canAct || !declarationEligibilities?.void" size="small" @click="voidDecl">作废</el-button>
                <el-button v-business-write="'customsOrders'" :disabled="!canAct || !declarationEligibilities?.statusManage" size="small" @click="openStatusManage">报关状态管理</el-button>
                <el-button v-business-write="'customsOrders'" :disabled="!canAct || !declarationEligibilities?.inspect" size="small" @click="openInspect">安排查验</el-button>
                <el-button v-business-write="'customsOrders'" :disabled="!canAct || !declarationEligibilities?.letterRecord" size="small" @click="openLetter(selectedDeclaration?.customsStatus)">{{ selectedDeclaration?.customsStatus === '挂单' ? '挂单处理' : '退单处理' }}</el-button>
                <el-button :disabled="!selectedDeclaration" size="small" @click="openPrint">打印</el-button>
                <el-button :disabled="!selectedDeclaration" size="small" @click="downloadDeclaration">下载</el-button>
                <el-dropdown trigger="click" @command="disabledAction">
                  <el-button size="small">更多操作<el-icon class="el-icon--right"><arrow-down /></el-icon></el-button>
                  <template #dropdown><el-dropdown-menu><el-dropdown-item v-for="name in ['编辑', '补充申报', '改单', '删单', '删单退仓/退场', '退运货物', '落装', '改配']" :key="name" :command="name">{{ name }}</el-dropdown-item></el-dropdown-menu></template>
                </el-dropdown>
              </div>
              <p class="customs-hint">“编辑/补充申报/改单/删单/退运/落装/改配”与其他申报模式及预录的涉检/集装箱/随附单证内容按后续切片实现；作废与状态管理允许范围受 CUSTOMS-B004/B005 限制。</p>
            </section>
          </el-tab-pane>
          <el-tab-pane label="报关单" name="declaration">
            <template v-if="selectedDeclaration">
              <section class="detail-section"><h3>{{ selectedDeclaration.docNo }}（{{ selectedDeclaration.status }}）</h3><dl class="detail-grid">
                <div v-for="[label, value] in [['单据编号', selectedDeclaration.docNo], ['单据类型', selectedDeclaration.typeLabel], ['海关编号', selectedDeclaration.declarationNo], ['单据状态', selectedDeclaration.status], ['报关状态', selectedDeclaration.customsStatus], ['提运单号', selectedDeclaration.waybillNo], ['境内收发货人', selectedDeclaration.domesticConsignor], ['监管方式', selectedDeclaration.supervisionMode], ['申报地海关', selectedDeclaration.declarationCustoms], ['申报日期', selectedDeclaration.declarationDate], ['总毛重（kg）', selectedDeclaration.grossWeight], ['总价', `${selectedDeclaration.currency} ${selectedDeclaration.totalValue}`], ['备注', selectedDeclaration.note]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
              </dl>
              <el-table :data="selectedDeclaration.logs || []" size="small" empty-text="暂无操作记录"><el-table-column prop="action" label="操作" width="120" /><el-table-column prop="content" label="内容" min-width="240" /><el-table-column prop="operator" label="操作人" width="110" /><el-table-column prop="time" label="时间" width="150" /></el-table>
              <div v-if="selectedDeclaration.letterRecord" class="customs-hint">处理记录：{{ selectedDeclaration.letterRecord.kind }} · {{ selectedDeclaration.letterRecord.content }}（{{ selectedDeclaration.letterRecord.operator }} {{ selectedDeclaration.letterRecord.time }}）</div>
              </section>
            </template>
            <el-empty v-else description="请从单据操作区选择一条报关单" />
          </el-tab-pane>
          <el-tab-pane label="服务记录" name="records">
            <el-table :data="(detail.serviceRecords || []).slice().sort((a, b) => String(a.time).localeCompare(String(b.time)))" size="small" empty-text="暂无服务记录"><el-table-column prop="event" label="处理事项" width="140" /><el-table-column prop="content" label="处理详情" min-width="260" /><el-table-column prop="actor" label="操作人" width="110" /><el-table-column prop="time" label="处理时间" width="150" /></el-table>
          </el-tab-pane>
          <el-tab-pane label="应收应付" name="costs">
            <el-alert type="info" :closable="false" title="应收应付按报价规则自动生成，完整字段与结算行为引用财务模块；本原型不新建关务计费口径。" />
            <el-table :data="state.costs.filter(cost => cost.orderNo === detail.orderNo)" size="small" empty-text="暂无明确关联的费用"><el-table-column prop="direction" label="方向" width="80" /><el-table-column prop="feeItem" label="费用科目" width="120" /><el-table-column prop="amount" label="金额" width="110" /><el-table-column prop="currency" label="币种" width="80" /><el-table-column prop="status" label="状态" width="120" /></el-table>
          </el-tab-pane>
          <el-tab-pane label="操作日志" name="logs">
            <el-table :data="(detail.logs || []).slice().sort((a, b) => String(a.time).localeCompare(String(b.time)))" size="small" empty-text="暂无操作日志"><el-table-column prop="operator" label="操作人" width="110" /><el-table-column prop="action" label="操作名称" width="130" /><el-table-column prop="time" label="操作时间" width="150" /><el-table-column prop="content" label="操作内容" min-width="220" /></el-table>
          </el-tab-pane>
          <el-tab-pane label="客户收到的邮件" name="emails">
            <el-table :data="detail.emails || []" size="small" empty-text="暂无邮件记录"><el-table-column prop="subject" label="标题-提运单号" width="150" /><el-table-column prop="body" label="正文内容" min-width="220" /><el-table-column prop="signName" label="电子签名-姓名" width="120" /><el-table-column prop="signPhone" label="电子签名-手机号" width="130" /><el-table-column label="收件人" width="180"><template #default="{ row }">{{ row.to.join('；') }}</template></el-table-column><el-table-column prop="sentAt" label="发送时间" width="150" /></el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>

    <el-dialog v-model="reviewVisible" title="审核资料" width="min(560px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item label="审核结果"><el-radio-group v-model="reviewForm.approved"><el-radio :label="true">通过</el-radio><el-radio :label="false">不通过</el-radio></el-radio-group></el-form-item>
        <template v-if="!reviewForm.approved">
          <el-form-item label="原因描述（必填）" required><el-input v-model="reviewForm.reason" type="textarea" maxlength="200" show-word-limit /></el-form-item>
          <el-form-item label="附件上传（非必填）"><input type="file" @change="addReviewAttachment" /><span v-for="file in reviewForm.attachments" :key="file.id" class="customs-hint">{{ file.name }}</span></el-form-item>
          <el-form-item label="邮件反馈"><el-checkbox v-model="reviewForm.recipients" label="客户邮箱（演示）">客户（默认选中）</el-checkbox><el-checkbox v-model="reviewForm.recipients" label="客服邮箱（演示）">其他客服/账号邮箱</el-checkbox></el-form-item>
          <el-input :model-value="REVIEW_MAIL_TEMPLATE(reviewForm.reason)" type="textarea" :rows="4" readonly />
        </template>
      </el-form>
      <el-alert type="info" :closable="false" title="审核结果提交后不能修改；新附件是否自动触发再次审核待确认（GJ-DSL-001）。邮件为本地模拟。" />
      <template #footer><el-button @click="reviewVisible = false">取消</el-button><el-button type="primary" @click="submitReview">提交审核</el-button></template>
    </el-dialog>

    <el-dialog v-model="materialVisible" title="单证制作 · 资料录入" width="min(980px, 96vw)" align-center destroy-on-close>
      <h4>公司资料</h4>
      <el-form label-position="top" class="material-grid">
        <el-form-item label="申报日期"><el-date-picker v-model="materialDraft.declarationDate" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="联系人"><el-input v-model="materialDraft.contact" /></el-form-item>
        <el-form-item label="申报口岸（默认 5141）"><el-input v-model="materialDraft.port" /></el-form-item>
        <el-form-item label="经营单位"><el-input v-model="materialDraft.operatorUnit" /></el-form-item>
        <el-form-item label="公司地址"><el-input v-model="materialDraft.operatorAddress" /></el-form-item>
        <el-form-item label="电话号码"><el-input v-model="materialDraft.operatorPhone" /></el-form-item>
        <el-form-item label="传真号码"><el-input v-model="materialDraft.operatorFax" /></el-form-item>
        <el-form-item label="外方单位"><el-input v-model="materialDraft.foreignUnit" /></el-form-item>
        <el-form-item label="外方地址"><el-input v-model="materialDraft.foreignAddress" /></el-form-item>
        <el-form-item label="外方电话"><el-input v-model="materialDraft.foreignPhone" /></el-form-item>
        <el-form-item label="外方传真"><el-input v-model="materialDraft.foreignFax" /></el-form-item>
      </el-form>
      <h4>海关资料</h4>
      <el-form label-position="top" class="material-grid">
        <el-form-item v-for="[key, label] in [['customsNo', '海关编号'], ['entryPort', detail?.businessType === '普货进口' ? '进口口岸' : '出口口岸'], ['contractNo', '合同协议号'], ['recordNo', '备案号'], ['exemptionNature', '征免性质'], ['contractDate', '合同签约时间'], ['licenseNo', '许可证号'], ['supervisionMode', '监管方式'], ['contractPlace', '合同签约地点'], ['approvalNo', '批准文号'], ['tradeMode', '成交方式'], ['shipmentPeriod', '装运期'], ['containerNo', '集装箱号'], ['settlementMode', '结汇方式'], ['invoiceNo', '发票号'], ['destinationPort', '指运港'], ['exemptionMode', '征免方式'], ['waybillNo', '提运单号'], ['destinationCountry', '目的国'], ['currency', '外汇币制'], ['manufacturer', '生产厂家'], ['transportMode', '运输方式'], ['conveyanceName', '运输工具'], ['domesticSource', '境内货源地'], ['freight', '运费'], ['packageType', '包装种类'], ['attachmentsNote', '随附单据'], ['insurance', '保险费'], ['miscFee', '杂费'], ['trademark', '商标'], ['markCode', '标记唛码']]" :key="key" :label="label"><el-input v-model="materialDraft[key]" /></el-form-item>
        <el-form-item label="备注" class="span-2"><el-input v-model="materialDraft.remark" type="textarea" maxlength="200" show-word-limit /></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" title="确认后自动生成报关单、发票、装箱单、合同四类单证到附件资料；固定申报企业与场所代码为待确认配置（CUSTOMS-B011）。" />
      <template #footer><el-button @click="materialVisible = false">取消</el-button><el-button type="primary" @click="submitMaterial">生成四类单证</el-button></template>
    </el-dialog>

    <el-dialog v-model="declReviewVisible" title="报关单复审" width="min(520px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item label="复审结果"><el-radio-group v-model="declReviewForm.approved"><el-radio :label="true">通过</el-radio><el-radio :label="false">不通过</el-radio></el-radio-group></el-form-item>
        <el-form-item v-if="!declReviewForm.approved" label="不通过原因（必填）" required><el-input v-model="declReviewForm.reason" type="textarea" maxlength="200" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button @click="declReviewVisible = false">取消</el-button><el-button type="primary" @click="submitDeclReview">提交复审</el-button></template>
    </el-dialog>
    <el-dialog v-model="sendVisible" title="发送单一窗口" width="min(480px, 96vw)" align-center>
      <el-form label-position="top"><el-form-item label="报关员 IC 卡号（基础数据-数据字典维护）" required><el-input v-model="sendForm.icCard" /></el-form-item></el-form>
      <el-alert type="info" :closable="false" title="确定后通过接口推送报关单到单一窗口暂存；本原型为本地模拟：发送中→发送成功并回填海关编号。" />
      <template #footer><el-button @click="sendVisible = false">取消</el-button><el-button type="primary" @click="submitSend">发送</el-button></template>
    </el-dialog>
    <el-dialog v-model="inspectVisible" title="安排查验" width="min(520px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item label="查验员" required><el-select v-model="inspectForm.inspector" filterable><el-option v-for="value in ['查验演示员甲', '查验演示员乙']" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="报关单号（读取海关编号或手动录入）" required><el-input v-model="inspectForm.declarationNo" /></el-form-item>
        <el-form-item label="总运单号"><el-input v-model="inspectForm.waybillNo" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="inspectVisible = false">取消</el-button><el-button type="primary" @click="submitInspect">确定</el-button></template>
    </el-dialog>
    <el-dialog v-model="statusManageVisible" title="报关状态管理" width="min(460px, 96vw)" align-center>
      <el-form label-position="top"><el-form-item label="报关状态" required><el-select v-model="manageStatus"><el-option v-for="value in DECLARATION_CUSTOMS_STATUSES" :key="value" :value="value" /></el-select></el-form-item></el-form>
      <el-alert type="info" :closable="false" title="手动状态会显示到报关状态栏；海关返回新状态后以最新为准。允许范围受 CUSTOMS-B005 限制。" />
      <template #footer><el-button @click="statusManageVisible = false">取消</el-button><el-button type="primary" @click="submitStatusManage">确定</el-button></template>
    </el-dialog>
    <el-dialog v-model="letterVisible" :title="`${letterKind}处理`" width="min(520px, 96vw)" align-center>
      <el-form label-position="top"><el-form-item label="处理内容" required><el-input v-model="letterContent" type="textarea" :rows="4" maxlength="500" show-word-limit /></el-form-item></el-form>
      <el-alert type="info" :closable="false" title="提交后生成处理记录且不能重复操作；仅退单或挂单状态可处理。" />
      <template #footer><el-button @click="letterVisible = false">取消</el-button><el-button type="primary" @click="submitLetter">提交</el-button></template>
    </el-dialog>
    <el-dialog v-model="printVisible" title="报关单打印预览" width="min(640px, 96vw)" align-center>
      <template v-if="printDeclaration">
        <dl class="detail-grid">
          <div v-for="[label, value] in [['单据编号', printDeclaration.docNo], ['单据类型', printDeclaration.typeLabel], ['海关编号', printDeclaration.declarationNo], ['境内收发货人', printDeclaration.domesticConsignor], ['监管方式', printDeclaration.supervisionMode], ['提运单号', printDeclaration.waybillNo], ['申报地海关', printDeclaration.declarationCustoms], ['申报日期', printDeclaration.declarationDate], ['总毛重（kg）', printDeclaration.grossWeight], ['总价', `${printDeclaration.currency} ${printDeclaration.totalValue}`]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
        </dl>
        <el-alert type="info" :closable="false" title="打印格式为原型简化版，不代表正式报关单打印模板。" />
      </template>
      <template #footer><el-button @click="printVisible = false">关闭</el-button><el-button type="primary" @click="printNow">打印</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.customs-notice { margin-bottom: 14px; }
.status-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.customs-hint { color: var(--muted); font-size: 12px; }
.customs-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 16px; }
.customs-filters label { display: flex; flex-direction: column; gap: 8px; width: 175px; color: var(--muted); }
.customs-filters :deep(.el-date-editor) { width: 100%; }
.detail-hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.detail-hero h2 { margin: 4px 0; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 8px 18px; margin: 0; }
.detail-grid dt { color: var(--muted); font-size: 12px; }
.detail-grid dd { margin: 2px 0 10px; }
.service-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.customs-upload { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
.material-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 14px; }
.material-grid :deep(.el-input), .material-grid :deep(.el-date-editor), .material-grid :deep(.el-textarea) { width: 100%; }
.material-grid .span-2 { grid-column: span 4; }
h4 { margin: 14px 0 8px; }
@media (max-width: 900px) { .material-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .material-grid .span-2 { grid-column: span 2; } }
</style>
