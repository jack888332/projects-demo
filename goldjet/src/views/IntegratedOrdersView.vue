<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import IntegratedOrderEditor from '../components/IntegratedOrderEditor.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  INTEGRATED_BUSINESS_TYPES, INTEGRATED_DEPARTMENTS, INTEGRATED_ORG, INTEGRATED_STATUS_NAV,
  cargoColumns, deriveServiceSummary, integratedOrderPermissions, serviceCategoryLabel, servicePlan,
} from '../domain/integratedOrders.js'

const route = useRoute()
const router = useRouter()
const {
  state, orderSession, submitIntegratedOrder, acceptIntegratedOrder, deleteIntegratedOrder,
  transferIntegratedOrder, cancelIntegratedOrder, dispatchIntegratedServices, cancelIntegratedService,
} = usePrototypeData()

const editor = ref()
const tab = ref('全部')
const detailId = ref(''), detailVisible = ref(false), detailTab = ref('order')
const routeError = ref('')
const transferVisible = ref(false), transferForm = reactive({ transferOrg: INTEGRATED_ORG[0], transferDepartment: INTEGRATED_DEPARTMENTS[0] })
const defaults = () => ({ financeOrg: '', orderNo: '', waybillNo: '', houseNo: '', customer: '', salesperson: '', transfer: '', createdRange: [] })
const filters = reactive(defaults())
const applied = ref(defaults())
const statusFilter = ref('总计')
const selected = computed(() => state.integratedOrders.find(order => order.id === detailId.value))
const planOfSelected = computed(() => selected.value ? servicePlan(selected.value) : [])
const permission = order => integratedOrderPermissions(order, orderSession.value.role)
const canOperate = computed(() => ['service', 'supervisor', 'business'].includes(orderSession.value.role))

function typeMatched(order) { return tab.value === '全部' || order.businessType === tab.value }
const conditionRows = computed(() => state.integratedOrders.filter(order => typeMatched(order) &&
  (!applied.value.financeOrg || order.financeOrg === applied.value.financeOrg) &&
  (!applied.value.orderNo || order.orderNo.includes(applied.value.orderNo.trim())) &&
  (!applied.value.waybillNo || (order.waybillNo || '').includes(applied.value.waybillNo.trim())) &&
  (!applied.value.houseNo || order.houses.some(house => (house.houseNo || '').includes(applied.value.houseNo.trim()))) &&
  (!applied.value.customer || order.customer === applied.value.customer) &&
  (!applied.value.salesperson || order.salesperson === applied.value.salesperson) &&
  (!applied.value.transfer || String(order.transfer) === applied.value.transfer) &&
  (!applied.value.createdRange?.length || (order.createdAt || '') >= applied.value.createdRange[0].slice(0, 10) && (order.createdAt || '') <= applied.value.createdRange[1].slice(0, 10))))
const rows = computed(() => conditionRows.value.filter(order => statusFilter.value === '总计' ||
  (statusFilter.value === '进行中' ? ['已接单', '进行中'].includes(order.status) : order.status === statusFilter.value)))
const statusCounts = computed(() => Object.fromEntries(INTEGRATED_STATUS_NAV.map(status => [status,
  status === '总计' ? conditionRows.value.length
    : status === '进行中' ? conditionRows.value.filter(order => ['已接单', '进行中'].includes(order.status)).length
      : conditionRows.value.filter(order => order.status === status).length])))
const customers = computed(() => state.partners.filter(partner => partner.type === '客户' && partner.status !== '失效'))
const salespeople = computed(() => [...new Set(state.integratedOrders.map(order => order.salesperson).filter(Boolean))])

function query() {
  if (!Object.values(filters).some(value => Array.isArray(value) ? value.length : String(value || '').length)) {
    ElMessage.warning('请先选择条件')
    return
  }
  applied.value = JSON.parse(JSON.stringify(filters))
}
function resetQuery() { Object.assign(filters, defaults()) }
function openDetail(order, target = 'order') { detailId.value = order.id; detailTab.value = target; detailVisible.value = true }
function created(order) { detailVisible.value = false; filters.orderNo = order.orderNo; applied.value = JSON.parse(JSON.stringify(filters)); openDetail(order) }
async function confirmAction(message, title, action) {
  try { await ElMessageBox.confirm(message, title, { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try { const result = action(); ElMessage.success('操作成功'); return result } catch (error) { ElMessage.error(error.message) }
}
function submitOrder(order) { return confirmAction(`提交订单 ${order.orderNo} 后转入进行中，并按服务规则生成未下发的服务单。`, '提交订单', () => submitIntegratedOrder(order.id)) }
function acceptOrder(order) { return confirmAction(`确认接单 ${order.orderNo}？`, '接单', () => acceptIntegratedOrder(order.id)) }
function cancelOrder(order) { return confirmAction(`取消订单 ${order.orderNo}？`, '取消订单', () => cancelIntegratedOrder(order.id)) }
function removeOrder(order) { return confirmAction(`删除未提交订单 ${order.orderNo}？删除不等同于作废或取消。`, '删除订单', () => deleteIntegratedOrder(order.id)) }
function openTransfer(order) { if (!permission(order).transfer) return; transferForm.transferOrg = INTEGRATED_ORG[0]; transferForm.transferDepartment = INTEGRATED_DEPARTMENTS[0]; transferVisible.value = true; detailId.value = order.id }
function submitTransfer() {
  try { transferIntegratedOrder(detailId.value, transferForm); transferVisible.value = false; ElMessage.success('订单已流转，目标接单方式待确认') } catch (error) { ElMessage.error(error.message) }
}
function dispatchServices(order) {
  try { const generated = dispatchIntegratedServices(order.id); ElMessage.success(generated.length ? `已下发 ${generated.length} 个服务记录` : '没有尚未下发的服务记录') } catch (error) { ElMessage.error(error.message) }
}
function cancelService(record) {
  const order = selected.value
  return confirmAction(`上游取消服务 ${record.id}？待接单将转已取消；进行中保留原状态，由下游人工取消或终止。`, '上游取消服务', () => {
    cancelIntegratedService(order.id, record.id)
    ElMessage.success('已标记上游取消服务')
  })
}
function serviceSummary(order, category) { return deriveServiceSummary(order, category) }
function houseName(order, houseKey) {
  const index = order.houses.findIndex(house => house.key === houseKey)
  if (index < 0) return '主单'
  return order.houses[index].houseNo || (index === 0 ? '主单' : `分单${index + 1}`)
}
const orderCosts = computed(() => state.costs.filter(cost => cost.orderNo === selected.value?.orderNo || cost.integratedOrderId === selected.value?.id))
const nodeTrack = computed(() => (selected.value?.services || []).filter(record => record.generated).flatMap(record => (record.history || []).map(entry => ({ ...entry, serviceId: record.id, serviceName: `${serviceCategoryLabel(record.category)}·${record.item}` }))).sort((a, b) => String(a.time).localeCompare(String(b.time))))
function backfillWaybill(order) {
  const waybill = order.waybillNo ? state.generalWaybills.find(row => row.waybillNo === order.waybillNo) : null
  router.push({ path: '/fulfillment/general-waybills', query: waybill ? { waybill: waybill.id } : { order: order.id } })
}
function downloadAttachment(attachment) {
  if (!attachment.dataUrl) { ElMessage.warning('该演示附件没有可下载的原文件'); return }
  const link = document.createElement('a')
  link.href = attachment.dataUrl; link.download = attachment.name; link.click()
}
watch(() => route.query.order, orderId => {
  routeError.value = ''
  if (!orderId) return
  const order = state.integratedOrders.find(row => row.id === orderId || row.orderNo === orderId)
  if (!order) { routeError.value = '未找到对应综合订单，请返回来源页面重新选择。'; return }
  applied.value = { ...defaults(), orderNo: order.orderNo }
  statusFilter.value = '总计'
  tab.value = '全部'
  openDetail(order)
}, { immediate: true })
watch([detailVisible, detailId], () => { if (!detailVisible.value) transferVisible.value = false })
watch(() => [orderSession.value.role, orderSession.value.name], () => { detailVisible.value = false; transferVisible.value = false })
</script>

<template>
  <div class="module-view">
    <PageHeader title="综合订单" description="跨业务建单 · 服务编排 · 订单协作与信息交接">
      <template #actions>
        <el-button @click="router.push('/fulfillment/general-waybills')">总运单与分单</el-button>
        <el-button v-business-write="'integratedOrders'" v-if="canOperate" :icon="Plus" type="primary" @click="editor.open()">新建订单</el-button>
      </template>
    </PageHeader>
    <el-alert class="order-notice" title="服务下发仅在本模块登记服务单与状态，未在空运、仓储、关务等模块生成作业单；拒接、人工完成与流转目标接单方式按待确认分支保留。" type="info" :closable="false" />
    <el-alert v-if="routeError" class="order-notice" type="warning" :closable="false" :title="routeError">
      <el-button link type="primary" @click="routeError = ''; applied = defaults()">查看全部订单</el-button>
    </el-alert>
    <el-tabs v-model="tab">
      <el-tab-pane v-for="value in ['全部', ...INTEGRATED_BUSINESS_TYPES]" :key="value" :label="value" :name="value" />
    </el-tabs>
    <div class="status-nav">
      <el-button v-for="status in INTEGRATED_STATUS_NAV" :key="status" :type="statusFilter === status ? 'primary' : ''" size="small" @click="statusFilter = status">
        {{ status }}（{{ statusCounts[status] }}）
      </el-button>
    </div>
    <form class="order-filters" aria-label="综合订单筛选" @submit.prevent="query">
      <label>财务组织<el-select v-model="filters.financeOrg" clearable placeholder="全部"><el-option v-for="value in INTEGRATED_ORG" :key="value" :value="value" /></el-select></label>
      <label>订单号<el-input v-model="filters.orderNo" clearable placeholder="支持模糊" /></label>
      <label>总运单号<el-input v-model="filters.waybillNo" clearable /></label>
      <label>客户分单号<el-input v-model="filters.houseNo" clearable /></label>
      <label>客户名称<el-select v-model="filters.customer" clearable filterable placeholder="全部"><el-option v-for="partner in customers" :key="partner.id" :label="partner.name" :value="partner.name" /></el-select></label>
      <label>业务员<el-select v-model="filters.salesperson" clearable placeholder="全部"><el-option v-for="value in salespeople" :key="value" :value="value" /></el-select></label>
      <label>是否流转<el-select v-model="filters.transfer" clearable placeholder="全部"><el-option label="是" value="true" /><el-option label="否" value="false" /></el-select></label>
      <label>建单日期<el-date-picker v-model="filters.createdRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
      <el-button type="primary" native-type="submit">查询</el-button>
      <el-button @click="resetQuery">重置</el-button>
    </form>
    <DataTableFrame :rows="rows" :page-size="20" :page-sizes="[20, 50, 100]">
      <template #default="{ rows: pageRows }">
        <el-table :data="pageRows" stripe row-key="id" aria-label="综合订单列表">
          <el-table-column prop="orderNo" label="订单号" width="185" fixed="left"><template #default="{ row }"><button class="link-button" @click="openDetail(row)">{{ row.orderNo }}</button></template></el-table-column>
          <el-table-column label="业务类型/模式" width="150"><template #default="{ row }">{{ row.businessType }} · {{ row.businessMode }}</template></el-table-column>
          <el-table-column prop="customer" label="客户" min-width="140" />
          <el-table-column prop="salesperson" label="业务员" width="100" />
          <el-table-column prop="creator" label="建单人" width="100" />
          <el-table-column label="建单时间" width="150"><template #default="{ row }">{{ (row.createdAt || '').slice(0, 16) }}</template></el-table-column>
          <el-table-column label="订单状态" width="115"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
          <el-table-column v-for="category in ['trunk', 'warehouse', 'customs', 'transport', 'ground', 'valueAdded']" :key="category" :label="serviceCategoryLabel(category)" width="110">
            <template #default="{ row }"><button v-if="serviceSummary(row, category)" class="link-button" @click="openDetail(row)">{{ serviceSummary(row, category) }}</button><span v-else>—</span></template>
          </el-table-column>
          <el-table-column label="是否流转" width="95"><template #default="{ row }">{{ row.transfer ? `是（${row.transferOrg}）` : '否' }}</template></el-table-column>
          <el-table-column label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row)">查看</el-button>
              <el-button v-business-write="'integratedOrders'" v-if="permission(row).edit" link type="primary" @click="editor.open(row)">编辑</el-button>
              <el-button v-business-write="'integratedOrders'" v-if="permission(row).submit" link type="primary" @click="submitOrder(row)">提交</el-button>
              <el-button v-business-write="'integratedOrders'" v-if="permission(row).accept" link type="primary" @click="acceptOrder(row)">接单</el-button>
              <el-tooltip v-if="row.status === '待接单' && row.source === '客户门户需求' && !permission(row).accept" content="拒接资格与结果待确认"><span><el-button link disabled>拒接</el-button></span></el-tooltip>
              <el-button v-business-write="'integratedOrders'" v-if="permission(row).transfer" link type="primary" @click="openTransfer(row)">流转</el-button>
              <el-button v-business-write="'integratedOrders'" v-if="permission(row).cancel" link type="danger" @click="cancelOrder(row)">取消</el-button>
              <el-button v-business-write="'integratedOrders'" v-if="permission(row).delete" link type="danger" @click="removeOrder(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </DataTableFrame>

    <IntegratedOrderEditor ref="editor" @saved="created" />

    <el-dialog v-model="transferVisible" title="订单流转" width="min(480px, 96vw)" align-center>
      <el-form label-position="top">
        <el-form-item label="流转组织" required><el-select v-model="transferForm.transferOrg"><el-option v-for="value in INTEGRATED_ORG" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="流转部门" required><el-select v-model="transferForm.transferDepartment"><el-option v-for="value in INTEGRATED_DEPARTMENTS" :key="value" :value="value" /></el-select></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" title="目标组织的接单方式与后续权限待确认；流转后原组织信息保留可追溯。" />
      <template #footer><el-button @click="transferVisible = false">取消</el-button><el-button type="primary" @click="submitTransfer">确认流转</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="综合订单详情" size="min(1100px, 96vw)">
      <template v-if="selected">
        <div class="detail-hero">
          <div><small>订单号</small><h2>{{ selected.orderNo }}</h2><span>{{ selected.businessType }} · {{ selected.businessMode }} · {{ selected.customer }}</span></div>
          <StatusTag :label="selected.status" />
        </div>
        <div class="detail-actions">
          <el-button v-business-write="'integratedOrders'" v-if="permission(selected).edit" @click="editor.open(selected)">编辑订单</el-button>
          <el-button v-business-write="'integratedOrders'" v-if="selected.status === '进行中'" @click="dispatchServices(selected)">下发服务</el-button>
          <el-button @click="backfillWaybill(selected)">{{ selected.waybillNo ? '查看总运单' : '总运单信息补录' }}</el-button>
        </div>
        <el-tabs v-model="detailTab">
          <el-tab-pane label="订单信息" name="order">
            <section class="detail-section"><h3>基本信息</h3>
              <dl class="detail-grid">
                <div v-for="[label, value] in [['业务类型', selected.businessType], ['业务模式', selected.businessMode], ['财务组织', selected.financeOrg], ['所属部门', selected.department], ['客服', selected.serviceClerk], ['业务员', selected.salesperson], ['是否流转', selected.transfer ? '是' : '否'], ['流转组织', selected.transferOrg], ['流转部门', selected.transferDepartment], ['原业务员', selected.originalSalesperson], ['订单来源', selected.source], ['建单人', selected.creator], ['建单时间', selected.createdAt], ['备注', selected.remark]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
              </dl>
            </section>
            <section class="detail-section"><h3>客户信息</h3>
              <dl class="detail-grid"><div v-for="[label, value] in [['客户名称', selected.customer], ['联系人', selected.contactName], ['联系电话', selected.contactPhone], ['联系人邮箱', selected.contactEmail], ['客户备注', selected.customerRemark]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl>
            </section>
            <section class="detail-section"><h3>总运单信息</h3>
              <dl class="detail-grid"><div v-for="[label, value] in [['运输方式', selected.transportMode], ['始发港', selected.originPort], ['目的港', selected.destinationPort], ['总运单号', selected.waybillNo]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl>
            </section>
            <section v-for="(house, index) in selected.houses" :key="house.key" class="detail-section">
              <h3>{{ house.houseNo || (index === 0 ? '主单（未填分单号）' : `分单 ${index + 1}`) }}</h3>
              <el-table :data="house.cargo" size="small" empty-text="暂无货物明细">
                <el-table-column type="index" label="序号" width="60" />
                <el-table-column v-for="[key, label] in cargoColumns(selected)" :key="key" :prop="key" :label="label" min-width="120" />
              </el-table>
            </section>
            <section class="detail-section"><h3>服务信息</h3>
              <el-table :data="selected.services" size="small" empty-text="尚未配置服务">
                <el-table-column prop="id" label="服务订单号" width="150"><template #default="{ row }">{{ row.generated ? row.id : '未生成' }}</template></el-table-column>
                <el-table-column label="服务类别" width="110"><template #default="{ row }">{{ serviceCategoryLabel(row.category) }}</template></el-table-column>
                <el-table-column label="服务项" width="110"><template #default="{ row }">{{ (planOfSelected.find(group => group.key === row.category)?.items.find(item => item.key === row.item) || {}).label || row.item }}</template></el-table-column>
                <el-table-column label="分单" width="120"><template #default="{ row }">{{ ['warehouse', 'customs', 'transport', 'ground', 'valueAdded'].includes(row.category) ? houseName(selected, row.houseKey) : '订单级' }}</template></el-table-column>
                <el-table-column prop="serviceType" label="服务类型" width="105" />
                <el-table-column prop="supplier" label="供应商" width="160" />
                <el-table-column prop="department" label="部门" width="110" />
                <el-table-column label="服务状态" width="110"><template #default="{ row }">{{ row.generated ? row.status : row.serviceType === '客自处理' ? '客自处理' : '未下发' }}</template></el-table-column>
                <el-table-column label="查看商品明细" width="130"><template #default="{ row }"><el-button v-if="row.category === 'valueAdded'" link type="primary" @click="openDetail(selected)">商品</el-button><span v-else>—</span></template></el-table-column>
                <el-table-column label="操作" width="170"><template #default="{ row }"><el-button v-if="row.generated && ['待接单', '进行中'].includes(row.status)" link type="danger" @click="cancelService(row)">取消服务</el-button><span v-else>—</span></template></el-table-column>
              </el-table>
            </section>
            <section class="detail-section"><h3>附件</h3>
              <el-table :data="selected.attachments" size="small" empty-text="暂无附件">
                <el-table-column prop="type" label="附件类型" width="120" />
                <el-table-column label="名称" min-width="200"><template #default="{ row }"><el-button link type="primary" @click="downloadAttachment(row)">{{ row.name }}</el-button></template></el-table-column>
                <el-table-column prop="uploader" label="上传人" width="100" />
                <el-table-column prop="uploadedAt" label="上传时间" width="170" />
                <el-table-column label="服务类目可见性" min-width="220"><template #default="{ row }">{{ (row.visibility || []).map(key => serviceCategoryLabel(key)).join('、') || '不向服务类型公开' }}</template></el-table-column>
              </el-table>
            </section>
          </el-tab-pane>
          <el-tab-pane label="应收应付" name="costs">
            <el-alert type="info" :closable="false" title="应收应付引用财务管理，仅列按明确关联的已登记费用；本模块不生成费用。" />
            <el-table :data="orderCosts" empty-text="暂无明确关联的应收付记录">
              <el-table-column v-for="[key, label] in [['direction', '方向'], ['feeItem', '费用科目'], ['settlementParty', '结算对象'], ['currency', '币种'], ['amount', '金额'], ['status', '审批状态']]" :key="key" :prop="key" :label="label" min-width="130" />
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="节点轨迹" name="track">
            <el-table :data="nodeTrack" empty-text="暂无下游服务节点">
              <el-table-column prop="serviceId" label="服务订单号" width="160" />
              <el-table-column prop="serviceName" label="服务项" width="140" />
              <el-table-column label="服务状态" width="110"><template #default="{ row }">{{ (selected.services.find(item => item.id === row.serviceId) || {}).status }}</template></el-table-column>
              <el-table-column prop="event" label="处理事项" width="120" />
              <el-table-column prop="actor" label="操作人" width="130" />
              <el-table-column label="操作时间" width="170"><template #default="{ row }">{{ row.time }}</template></el-table-column>
              <el-table-column prop="content" label="回执信息" min-width="220" />
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="操作日志" name="history">
            <el-table :data="(selected.history || []).slice().reverse()" empty-text="暂无操作记录">
              <el-table-column prop="actor" label="操作人" width="120" />
              <el-table-column prop="event" label="操作名称" width="130" />
              <el-table-column label="操作内容" min-width="260"><template #default="{ row }">{{ row.content }}<details v-if="row.changes?.length"><summary>查看修改前后</summary><div v-for="(change, index) in row.changes" :key="index" class="change-row"><strong>{{ change.field }}</strong>：{{ change.before || '空' }} → {{ change.after || '空' }}</div></details></template></el-table-column>
              <el-table-column label="操作时间" width="170"><template #default="{ row }">{{ row.time }}</template></el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.order-notice { margin-bottom:14px; }
.status-nav { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.order-filters { display:flex; flex-wrap:wrap; align-items:end; gap:12px; margin-bottom:16px; }
.order-filters label { display:flex; flex-direction:column; gap:8px; width:180px; color:var(--muted); }
.order-filters :deep(.el-date-editor) { width:100%; }
.detail-hero { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.detail-hero h2 { margin:4px 0; }
.detail-actions { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; }
.detail-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr)); gap:8px 18px; margin:0; }
.detail-grid dt { color:var(--muted); font-size:12px; }
.detail-grid dd { margin:2px 0 10px; }
.change-row { margin:6px 0; white-space:pre-wrap; overflow-wrap:anywhere; }
</style>
