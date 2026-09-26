<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import BbcReturnQuantityDialog from '../components/BbcReturnQuantityDialog.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  BBC_EXPRESS_COMPANIES, BBC_MANIFEST_STATUSES, BBC_ORDER_STATUSES, BBC_VIEW_PASSWORD,
  BBC_WAREHOUSE_STATUSES, BBC_WAYBILL_STATUSES, bbcAmountSummary, bbcOrderEligibility, declarationStateFor,
  filterBbcOrders, isBbcTab,
} from '../domain/bbcCustomerOrders.js'

const route = useRoute()
const {
  state, bbcSession, declareBbcOrders, cancelBbcOrder, restoreBbcOrder, voidBbcOrder, modifyBbcOrder,
  fetchBbcExpress, applyBbcReturn,
} = usePrototypeData()
const canOperate = computed(() => ['service', 'supervisor', 'business', 'customsService'].includes(bbcSession.value.role))
const tabs = ['已发货', '未发货', '消退订单', '客退订单']
const tab = ref('未发货')
const defaults = () => ({ outboundOrderNo: '', orderNo: '', expressNo: '', nuclearNoteNo: '', ledgerNo: '', orderRange: [], orderStatus: '', waybillStatus: '', manifestStatus: '', outboundStatus: '', expressCompany: '', warehouseStatus: '', platform: '', shop: '' })
const filters = reactive(defaults())
const applied = ref(defaults())
const rows = computed(() => filterBbcOrders(state.bbcCustomerOrders.filter(order => isBbcTab(order, tab.value)), applied.value))
const selectedIds = ref([])
const table = ref()
const selectedOrders = computed(() => state.bbcCustomerOrders.filter(order => selectedIds.value.includes(order.id)))
function query() { applied.value = JSON.parse(JSON.stringify(filters)) }
function resetQuery() { Object.assign(filters, defaults()) }
function targets() {
  if (selectedIds.value.length) return selectedOrders.value
  return rows.value
}
async function runBatch(message, action) {
  const list = targets()
  if (!list.length) { ElMessage.warning('没有可操作的订单'); return }
  try { await ElMessageBox.confirm(`${message}（共 ${list.length} 笔）`, '订单操作', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  const failures = []
  for (const order of list) {
    try { action(order) } catch (error) { failures.push(`${order.orderNo}：${error.message}`) }
  }
  if (failures.length) ElMessage.warning(`部分订单未执行：${failures.slice(0, 3).join('；')}`)
  else ElMessage.success('操作成功（外部结果均为本地模拟）')
  selectedIds.value = []; table.value?.clearSelection()
}
// ---- 批量申报 ----
const declareVisible = ref(false)
const declareDocs = ref(['order', 'waybill', 'manifest'])
const declareReturnApply = ref(false)
function openDeclare() { declareDocs.value = ['order', 'waybill', 'manifest']; declareReturnApply.value = false; declareVisible.value = true }
function submitDeclare() {
  const list = targets()
  if (!list.length) { ElMessage.warning('没有可申报的订单'); return }
  const result = declareBbcOrders(list.map(order => order.id), declareDocs.value)
  if (declareReturnApply.value) runBatch('同时发送退货申请', order => applyBbcReturn(order.id))
  declareVisible.value = false
  const skipped = result.skipped.map(row => `${row.orderNo}（${row.reason}）`)
  ElMessage.success(`已申报 ${result.declared.length} 笔；跳过 ${skipped.length} 笔${skipped.length ? '：' + skipped.slice(0, 3).join('；') : ''}`)
}
// ---- 下快递 ----
const expressVisible = ref(false), expressCompany = ref(BBC_EXPRESS_COMPANIES[0])
function openExpress() { if (!targets().length) { ElMessage.warning('没有可操作的订单'); return } expressVisible.value = true }
function submitExpress() {
  expressVisible.value = false
  runBatch(`从 ${expressCompany.value} 获取新快递单号`, order => fetchBbcExpress(order.id, expressCompany.value))
}
// ---- 修改订单信息 ----
const modifyVisible = ref(false), modifyId = ref(''), modifyForm = reactive({ remark: '', buyer: '', buyerPhone: '', address: '' })
function openModify() {
  const list = targets()
  if (list.length !== 1) { ElMessage.warning('修改订单信息仅支持勾选一条订单'); return }
  const order = list[0]
  if (!bbcOrderEligibility(order).modify) { ElMessage.warning('仅待报关或已取消订单可修改信息'); return }
  modifyId.value = order.id
  Object.assign(modifyForm, { remark: order.remark || '', buyer: order.buyer || '', buyerPhone: order.buyerPhone || '', address: order.address || '' })
  modifyVisible.value = true
}
function submitModify() {
  try { modifyBbcOrder(modifyId.value, { ...modifyForm }); modifyVisible.value = false; ElMessage.success('已保存；可修改字段与修改后重报边界待确认') } catch (error) { ElMessage.error(error.message) }
}
// ---- 详情与敏感信息 ----
const detailId = ref(''), detailVisible = ref(false), receiptType = ref(''), sensitiveVisible = ref(false), sensitiveInput = ref(''), revealed = ref(false)
const detail = computed(() => state.bbcCustomerOrders.find(order => order.id === detailId.value))
const detailReceipts = computed(() => (detail.value?.receipts || []).filter(row => !receiptType.value || row.type === receiptType.value).slice().sort((a, b) => String(b.time).localeCompare(String(a.time))))
const detailAmount = computed(() => detail.value ? bbcAmountSummary(detail.value) : null)
const detailDeclaration = computed(() => detail.value ? declarationStateFor(detail.value) : null)
const receiptTypes = computed(() => [...new Set((detail.value?.receipts || []).map(row => row.type))])
function openDetail(order) { detailId.value = order.id; detailVisible.value = true; receiptType.value = ''; revealed.value = false }
function verifySensitive() {
  if (sensitiveInput.value !== BBC_VIEW_PASSWORD) { ElMessage.error('查看口令不正确（演示口令，不是生产鉴权）'); return }
  revealed.value = true; sensitiveVisible.value = false
}
// ---- 逆向操作 ----
const returnDialog = ref()
function arrangeReturn(kind) {
  const list = targets()
  if (list.length !== 1) { ElMessage.warning(kind === 'consumer' ? '安排客退每次选择一条订单' : '安排消退每次选择一条订单'); return }
  returnDialog.value.open(list[0], kind)
}
function applyReturn() { runBatch('发送退货申请', order => applyBbcReturn(order.id)) }
function exportDetail() {
  const list = targets()
  if (!list.length) { ElMessage.warning('没有可导出的订单'); return }
  const header = ['订单号', '快递单号', '出区订单号', '核注清单号', '账册编号', '平台', '店铺', '订购人', '下单时间', '支付金额', '估算税款', '订单状态', '运单状态', '清单状态', '仓库状态', '退货状态']
  const lines = list.map(order => [order.orderNo, order.expressNo, order.outboundOrderNo, order.nuclearNoteNos.join('、'), order.ledgerNo, order.platform, order.shop, order.buyer, order.orderTime, order.paymentAmount, order.estimatedTax, order.orderStatus, order.waybillStatus, order.manifestStatus, order.warehouseStatus, order.returnStatus])
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = '\ufeff' + [header, ...lines].map(line => line.map(escape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'BBC客户订单明细.csv'; link.click(); URL.revokeObjectURL(link.href)
}
watch(() => route.query.order, id => {
  if (!id) return
  const order = state.bbcCustomerOrders.find(row => row.id === id || row.orderNo === id)
  if (order) { tab.value = isBbcTab(order, '已发货') ? '已发货' : '未发货'; applied.value = { ...defaults(), orderNo: order.orderNo }; openDetail(order) }
  else ElMessage.warning('未找到对应 BBC 客户订单')
}, { immediate: true })
watch(() => [bbcSession.value.role, bbcSession.value.name], () => { detailVisible.value = false; declareVisible.value = false })
</script>

<template>
  <div class="module-view">
    <PageHeader title="BBC客户订单" description="平台小订单 · 三单申报 · 订单处置与回执">
      <template #actions>
        <el-button v-business-write="'bbcOrders'" type="primary" :disabled="!canOperate" @click="openDeclare">批量申报</el-button>
        <el-button v-business-write="'bbcOrders'" :disabled="!canOperate" @click="openExpress">下快递</el-button>
        <el-button v-business-write="'bbcOrders'" :disabled="!canOperate" @click="openModify">修改订单信息</el-button>
        <el-button @click="exportDetail">导出明细</el-button>
      </template>
    </PageHeader>
    <el-alert class="bbc-notice" title="海关回执、WMS 下发与撤销均为浏览器内本地模拟；取消不等于撤销或拦截成功，库存预占与关务篇的口径尚未统一。" type="info" :closable="false" />
    <el-tabs v-model="tab"><el-tab-pane v-for="value in tabs" :key="value" :label="value" :name="value" /></el-tabs>
    <div class="bbc-actions">
      <el-dropdown v-if="canOperate" trigger="click" @command="command => {
        if (command === 'cancel') runBatch('取消所选订单并同步 WMS 与海关撤销申请', order => cancelBbcOrder(order.id))
        if (command === 'restore') runBatch('恢复所选订单并重新进入三单自动申报', order => restoreBbcOrder(order.id))
        if (command === 'void') runBatch('作废所选订单（不可恢复）', order => voidBbcOrder(order.id))
        if (command === 'consumer') arrangeReturn('consumer')
        if (command === 'cancelReturn') arrangeReturn('cancel')
        if (command === 'returnApply') applyReturn()
      }">
        <el-button v-business-write="'bbcOrders'">订单操作<el-icon class="el-icon--right"><arrow-down /></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="cancel">取消订单</el-dropdown-item>
            <el-dropdown-item command="restore">恢复订单</el-dropdown-item>
            <el-dropdown-item command="void">作废订单</el-dropdown-item>
            <el-dropdown-item command="consumer" divided>安排客退</el-dropdown-item>
            <el-dropdown-item command="cancelReturn">安排消退</el-dropdown-item>
            <el-dropdown-item command="returnApply">退货申请</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <span class="bbc-selection">已选 {{ selectedIds.length }} 笔；未勾选时操作与导出按当前查询结果执行。</span>
      <el-button v-if="selectedIds.length" @click="selectedIds = []; table?.clearSelection()">清空选择</el-button>
    </div>
    <form class="bbc-filters" aria-label="BBC客户订单筛选" @submit.prevent="query">
      <label>出区订单号<el-input v-model="filters.outboundOrderNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>订单号<el-input v-model="filters.orderNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>快递单号<el-input v-model="filters.expressNo" type="textarea" :rows="1" placeholder="可换行多个" /></label>
      <label>核注清单号<el-input v-model="filters.nuclearNoteNo" placeholder="可换行多个" /></label>
      <label>账册编号<el-input v-model="filters.ledgerNo" placeholder="可换行多个" /></label>
      <label>下单时间<el-date-picker v-model="filters.orderRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
      <label>订单状态<el-select v-model="filters.orderStatus" clearable placeholder="全部"><el-option v-for="value in BBC_ORDER_STATUSES" :key="value" :value="value" /></el-select></label>
      <label>运单状态<el-select v-model="filters.waybillStatus" clearable placeholder="全部"><el-option v-for="value in BBC_WAYBILL_STATUSES" :key="value" :value="value" /></el-select></label>
      <label>清单状态<el-select v-model="filters.manifestStatus" clearable placeholder="全部"><el-option v-for="value in BBC_MANIFEST_STATUSES" :key="value" :value="value" /></el-select></label>
      <label>出区状态<el-select v-model="filters.outboundStatus" clearable placeholder="全部"><el-option v-for="value in ['待出区', '已出区']" :key="value" :value="value" /></el-select></label>
      <label>快递方式<el-select v-model="filters.expressCompany" clearable placeholder="全部"><el-option v-for="value in BBC_EXPRESS_COMPANIES" :key="value" :value="value" /></el-select></label>
      <label>仓库状态<el-select v-model="filters.warehouseStatus" clearable placeholder="全部"><el-option v-for="value in BBC_WAREHOUSE_STATUSES" :key="value" :value="value" /></el-select></label>
      <label>电商平台名称<el-input v-model="filters.platform" /></label>
      <label>店铺名称<el-input v-model="filters.shop" /></label>
      <el-button type="primary" native-type="submit">查询</el-button>
      <el-button @click="resetQuery">重置</el-button>
    </form>
    <DataTableFrame :rows="rows" :page-size="50" :page-sizes="[20, 50, 100]" selectable :selected-count="selectedIds.length">
      <template #default="{ rows: pageRows }">
        <el-table ref="table" :data="pageRows" stripe row-key="id" aria-label="BBC客户订单列表" @selection-change="items => selectedIds = items.map(item => item.id)">
          <el-table-column type="selection" reserve-selection width="46" />
          <el-table-column label="订单号" width="165" fixed="left"><template #default="{ row }"><button class="link-button" @click="openDetail(row)">{{ row.orderNo }}</button></template></el-table-column>
          <el-table-column prop="expressNo" label="快递单号" width="130" />
          <el-table-column prop="outboundOrderNo" label="出区订单号" width="150" />
          <el-table-column label="核注清单号" width="130"><template #default="{ row }">{{ row.nuclearNoteNos.join('、') || '—' }}</template></el-table-column>
          <el-table-column prop="ledgerNo" label="账册编号" width="120" />
          <el-table-column prop="platform" label="电商平台" width="90" />
          <el-table-column prop="shop" label="店铺" min-width="130" />
          <el-table-column prop="buyer" label="订购人" width="100" />
          <el-table-column label="下单时间" width="150"><template #default="{ row }">{{ row.orderTime }}</template></el-table-column>
          <el-table-column prop="paymentAmount" label="支付金额" width="100" />
          <el-table-column prop="estimatedTax" label="估算税款" width="100" />
          <el-table-column prop="stockStatus" label="库存情况" width="95" />
          <el-table-column prop="presaleType" label="预售类型" width="90" />
          <el-table-column label="商品" min-width="160"><template #default="{ row }">{{ row.goods.map(good => `${good.name}×${good.quantity}`).join('；') }}</template></el-table-column>
          <el-table-column label="状态" width="520">
            <template #default="{ row }">
              <StatusTag :label="row.orderStatus" /> <StatusTag :label="row.waybillStatus" /> <StatusTag :label="row.manifestStatus" /> <StatusTag :label="row.warehouseStatus" />
              <span v-if="row.outboundStatus" class="bbc-extra">出区 {{ row.outboundStatus }}</span>
              <span v-if="row.cancelStatus" class="bbc-extra">撤销单 {{ row.cancelStatus }}</span>
              <span v-if="row.returnStatus" class="bbc-extra">退货 {{ row.returnStatus }}</span>
              <span v-if="row.consumerReturnResult" class="bbc-extra">客退 {{ row.consumerReturnResult }}</span>
              <span v-if="row.cancelReturnResult" class="bbc-extra">消退 {{ row.cancelReturnResult }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="returnDeadline" label="截止退货日期" width="120" />
          <el-table-column label="客户取消订单" width="105"><template #default="{ row }">{{ row.customerCancelled ? '是' : '否' }}</template></el-table-column>
          <el-table-column label="操作" width="110" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">查看</el-button></template></el-table-column>
        </el-table>
      </template>
    </DataTableFrame>

    <el-dialog v-model="declareVisible" title="批量申报" width="min(620px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item label="申报单据"><el-checkbox v-for="document in [{ key: 'order', label: '订单申报' }, { key: 'waybill', label: '运单申报' }, { key: 'manifest', label: '清单申报' }]" :key="document.key" v-model="declareDocs" :label="document.key">{{ document.label }}</el-checkbox></el-form-item>
        <el-form-item><el-checkbox v-model="declareReturnApply">同时发送退货申请（客户取消标识与退货截止日期须满足）</el-checkbox></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" title="自动申报与手动重报的状态门槛是否一致、混合资格批次是整批拒绝还是逐条处理待确认；原型逐条执行并反馈跳过原因。" />
      <template #footer><el-button @click="declareVisible = false">取消</el-button><el-button v-business-write="'bbcOrders'" type="primary" @click="submitDeclare">申报</el-button></template>
    </el-dialog>
    <el-dialog v-model="expressVisible" title="下快递" width="min(460px, 96vw)" align-center>
      <el-form label-position="top"><el-form-item label="快递公司" required><el-select v-model="expressCompany"><el-option v-for="value in BBC_EXPRESS_COMPANIES" :key="value" :value="value" /></el-select></el-form-item></el-form>
      <el-alert type="info" :closable="false" title="已有快递号的订单仅运单待报关时可下快递；原型会保留原号失效记录。" />
      <template #footer><el-button @click="expressVisible = false">取消</el-button><el-button v-business-write="'bbcOrders'" type="primary" @click="submitExpress">获取单号</el-button></template>
    </el-dialog>
    <el-dialog v-model="modifyVisible" title="修改订单信息" width="min(560px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item label="订购人"><el-input v-model="modifyForm.buyer" /></el-form-item>
        <el-form-item label="订购人电话"><el-input v-model="modifyForm.buyerPhone" /></el-form-item>
        <el-form-item label="收件地址"><el-input v-model="modifyForm.address" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="modifyForm.remark" type="textarea" maxlength="100" show-word-limit /></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" title="具体可修改字段与修改后的重报边界待确认；原型只开放备注与收件资料。" />
      <template #footer><el-button @click="modifyVisible = false">取消</el-button><el-button v-business-write="'bbcOrders'" type="primary" @click="submitModify">保存</el-button></template>
    </el-dialog>

    <BbcReturnQuantityDialog ref="returnDialog" @created="() => { selectedIds = []; table?.clearSelection() }" />

    <el-drawer v-model="detailVisible" title="BBC客户订单详情" size="min(1040px, 96vw)">
      <template v-if="detail">
        <div class="detail-hero"><div><small>订单号</small><h2>{{ detail.orderNo }}</h2><span>{{ detail.platform }} · {{ detail.shop }}</span></div><StatusTag :label="detail.orderStatus" /></div>
        <el-alert v-if="detailDeclaration" :type="detailDeclaration.ok ? 'info' : 'warning'" :closable="false" :title="detailDeclaration.ok ? '三单允许自动申报；满足条件后自动下发 WMS。' : detailDeclaration.reason" />
        <section class="detail-section"><h3>订单基础</h3><dl class="detail-grid">
          <div v-for="[label, value] in [['订单商品描述', detail.goods.map(good => good.name).join('；')], ['收件人', detail.buyer], ['订购人', detail.buyer], ['收件地址', detail.address], ['订单总毛重', detail.goods.reduce((total, good) => total + (Number(good.quantity) || 0), 0)], ['订单总净重', detail.goods.reduce((total, good) => total + (Number(good.quantity) || 0), 0)], ['运单号', detail.expressNo], ['担保企业', detail.companyCode ? '客户档案担保企业（演示）' : ''], ['快递公司', detail.expressCompany], ['预售类型', detail.presaleType], ['备注', detail.remark]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
        </dl></section>
        <section class="detail-section"><h3>金额</h3><dl class="detail-grid">
          <div v-for="[label, value] in [['商品总额', detailAmount.goodsTotal], ['运费', detailAmount.freight], ['保价费', detailAmount.insurance], ['预收税款', detailAmount.prepaidTax], ['非现金抵扣', detailAmount.nonCashDeduction], ['实际支付金额', detailAmount.payable], ['估算税额', detailAmount.estimatedTax], ['海关回执税额', detailAmount.customsTax || '待税单导入']]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
        </dl></section>
        <section class="detail-section"><h3>敏感信息</h3>
          <p v-if="revealed">订购人电话：{{ detail.buyerPhone }}；身份证号：{{ detail.buyerIdNo }}</p>
          <p v-else>订购人电话与身份证号默认隐藏。<el-button link type="primary" @click="sensitiveVisible = true; sensitiveInput = ''">查看</el-button></p>
        </section>
        <section class="detail-section"><h3>申报与履约关联</h3><dl class="detail-grid">
          <div v-for="[label, value] in [['海关清单号', detail.nuclearNoteNos.join('、') || ''], ['经营单位及代码', `${detail.company} / ${detail.companyCode}`], ['关区代码', '5165 南沙保税（默认值冲突待确认）'], ['出区订单号', detail.outboundOrderNo], ['核注清单号', detail.nuclearNoteNos.join('、') || ''], ['账册编号', detail.ledgerNo], ['仓库状态', detail.warehouseStatus], ['出区状态', detail.outboundStatus], ['撤销单状态', detail.cancelStatus], ['退货状态', detail.returnStatus], ['客退结果', detail.consumerReturnResult], ['消退结果', detail.cancelReturnResult], ['截止退货日期', detail.returnDeadline]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
        </dl></section>
        <section class="detail-section"><h3>商品明细</h3><el-table :data="detail.goods" size="small" empty-text="无商品">
          <el-table-column type="index" label="序号" width="60" />
          <el-table-column prop="productId" label="备案商品ID" width="130" />
          <el-table-column prop="name" label="商品名称" min-width="150" />
          <el-table-column prop="barcode" label="商品条码" width="140" />
          <el-table-column prop="hsCode" label="备案HS号" width="110" />
          <el-table-column prop="originCountry" label="原产国" width="90" />
          <el-table-column label="数量及单位" width="110"><template #default="{ row }">{{ row.quantity }} {{ row.unit }}</template></el-table-column>
          <el-table-column prop="unitPrice" label="单价" width="90" />
          <el-table-column prop="estimatedVat" label="估算增值税" width="100" />
          <el-table-column prop="estimatedConsumptionTax" label="估算消费税" width="100" />
          <el-table-column prop="cancelReturnQty" label="消退数量" width="90" />
          <el-table-column prop="consumerReturnQty" label="客退数量" width="90" />
        </el-table></section>
        <section class="detail-section"><h3>回执查询</h3>
          <el-select v-model="receiptType" clearable placeholder="全部回执类型" style="max-width:220px;margin-bottom:10px"><el-option v-for="value in receiptTypes" :key="value" :value="value" /></el-select>
          <el-table :data="detailReceipts" size="small" empty-text="暂无回执"><el-table-column prop="type" label="回执类型" width="120" /><el-table-column prop="status" label="回执状态" width="120" /><el-table-column prop="time" label="回执时间" width="160" /><el-table-column prop="content" label="回执信息" min-width="220" /></el-table>
        </section>
      </template>
    </el-drawer>
    <el-dialog v-model="sensitiveVisible" title="敏感信息授权查看" width="min(420px, 96vw)" align-center>
      <el-form label-position="top"><el-form-item label="查看口令"><el-input v-model="sensitiveInput" type="password" show-password @keyup.enter="verifySensitive" /></el-form-item></el-form>
      <el-alert type="info" :closable="false" title="演示口令为 demo123；授权范围、有效期与失败限制待确认，不代表生产鉴权。" />
      <template #footer><el-button @click="sensitiveVisible = false">取消</el-button><el-button type="primary" @click="verifySensitive">查看</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.bbc-notice { margin-bottom: 14px; }
.bbc-actions { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.bbc-selection { color: var(--muted); font-size: 12px; }
.bbc-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 16px; }
.bbc-filters label { display: flex; flex-direction: column; gap: 8px; width: 185px; color: var(--muted); }
.bbc-filters :deep(.el-date-editor) { width: 100%; }
.bbc-extra { display: inline-block; margin: 0 4px 4px 0; font-size: 12px; color: var(--muted); }
.detail-hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.detail-hero h2 { margin: 4px 0; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 8px 18px; margin: 0; }
.detail-grid dt { color: var(--muted); font-size: 12px; }
.detail-grid dd { margin: 2px 0 10px; }
</style>
