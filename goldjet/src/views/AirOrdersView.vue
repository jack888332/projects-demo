<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Search, Refresh, MapLocation } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import AirOrderCreateDialog from '../components/AirOrderCreateDialog.vue'
import AirOrderPriceDialog from '../components/AirOrderPriceDialog.vue'
import { getAirPriceRestriction } from '../data/airOrderActions.js'
import { getAirSupplementRestriction } from '../domain/airOrderSupplement.js'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { AIR_PRODUCTS } from '../domain/airOperations.js'
import { canViewAirTrackingOrder } from '../domain/airTracking.js'

const route = useRoute()
const router = useRouter()
const { state, airSession, airChildSession, airCatalog } = usePrototypeData()
const createVisible = ref(false)
const priceVisible = ref(false)
const priceOrderId = ref('')
const selectedId = ref('')
const detailVisible = ref(false)
const emptyFilters = () => ({ orderNo: '', waybillNo: '', airline: '', creator: '', owner: '', flight: '', origin: '', destination: '', status: '', departureDate: '', createDate: '' })
const filters = reactive(emptyFilters())
const airlines = computed(() => state.airMaster.airlines.map(airline => airline.name))
const includes = (value, query) => !query || String(value || '').toLowerCase().includes(query.trim().toLowerCase())
const bookingDetailFields = [
  ['airline', '航司'], ['flight', '头程航班'], ['departureDate', '出港日期'], ['firstDestination', '头程目的地'],
  ['firstLeg', '头程航段'], ['takeoffTime', '起飞时刻'], ['cutoffTime', '截单时刻'], ['airCost', '空运成本'],
  ['truckCost', '卡车成本'], ['guidePrice', '指导价'], ['waybillType', '提单属性'], ['profitRules', '预计盈利规则'],
  ['secondLeg', '二程航段'], ['secondDestination', '二程目的地'], ['thirdLeg', '三程航段'], ['palletCompany', '打板公司'],
  ['discountNo', '航司折扣号'], ['handlingInfo', 'Handling Information'], ['routeType', '航线类型'], ['remark', '航线备注'],
]
function displayValue(value) { return value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length) ? '未填写' : Array.isArray(value) ? value.join('、') : value }
const selected = computed(() => state.airOrders.find(item => item.id === selectedId.value))
const canCreate = computed(() => ['service', 'supervisor'].includes(airSession.role))
const visibleOrders = computed(() => state.airOrders.filter(item => airSession.role !== 'service' || item.creator === airSession.name))
const filteredRows = computed(() => visibleOrders.value.filter(item => {
  return includes(item.orderNo, filters.orderNo) && includes(item.waybillNo, filters.waybillNo)
    && includes(item.creator, filters.creator) && includes(item.owner, filters.owner)
    && (!filters.airline || item.booking?.airline === filters.airline)
    && (!filters.flight || item.flight === filters.flight.trim())
    && (!filters.origin || item.origin === filters.origin.toUpperCase())
    && (!filters.destination || item.destination === filters.destination.toUpperCase())
    && (!filters.status || item.orderStatus === filters.status)
    && (!filters.departureDate || item.departureDate === filters.departureDate)
    && (!filters.createDate || item.createDate === filters.createDate)
}))
function openDetail(row) { selectedId.value = row.id; detailVisible.value = true }
function openOrder(row) {
  if (!getAirSupplementRestriction(row, airChildSession.value)) openSupplement(row)
  else openDetail(row)
}
function openSupplement(row) { detailVisible.value = false; router.push(`/fulfillment/air-orders/${row.id}/supplement`) }
function resetFilters() { Object.assign(filters, emptyFilters()) }
function openPrices(row) { priceOrderId.value = row.id; priceVisible.value = true }
function openBooking(order) {
  detailVisible.value = false
  router.push({ path: '/fulfillment/booking', query: { order: order.id } })
}
function created(order) { resetFilters(); openDetail(order) }
watch(() => route.query, query => {
  if (query.action === 'create' && canCreate.value) createVisible.value = true
  if (query.order) {
    const order = visibleOrders.value.find(item => item.id === query.order)
    if (order) openDetail(order)
    else ElMessage.warning('当前角色无法查看该订单，或订单已不存在。')
  }
}, { immediate: true })
watch(() => `${airSession.role}:${airSession.name}`, () => { detailVisible.value = false; createVisible.value = false; priceVisible.value = false })
watch(selected, order => { if (!order) detailVisible.value = false })
</script>

<template>
  <div class="module-view">
    <PageHeader title="主订单管理" description="客服受理、服务指令与航线订舱共享同一订单">
      <template #actions><el-button v-business-write="'airOrders'" type="primary" :icon="Plus" :disabled="!canCreate" @click="createVisible = true">新建主订单</el-button></template>
    </PageHeader>
    <div v-if="!canCreate" class="air-context">当前角色不能新建主订单。航线人员可进入订舱管理，航晟客服可从子订单管理创建及合成订单。</div>
    <form class="air-filters" aria-label="主订单筛选" @submit.prevent>
      <label>订单号<el-input v-model="filters.orderNo" :prefix-icon="Search" clearable aria-label="订单号筛选" placeholder="模糊查询" /></label>
      <label>提单号<el-input v-model="filters.waybillNo" clearable aria-label="提单号筛选" placeholder="模糊查询" /></label>
      <label>航司<el-select v-model="filters.airline" clearable aria-label="航司筛选" placeholder="全部"><el-option v-for="name in airlines" :key="name" :value="name" /></el-select></label>
      <label>客服<el-input v-model="filters.creator" clearable aria-label="客服筛选" placeholder="全部，支持模糊查询" /></label>
      <label>业务员<el-input v-model="filters.owner" clearable aria-label="业务员筛选" placeholder="模糊查询" /></label>
      <label>航班号<el-input v-model="filters.flight" clearable aria-label="航班号筛选" placeholder="精确查询" /></label>
      <label>始发港<el-select v-model="filters.origin" filterable clearable aria-label="始发港筛选" placeholder="全部"><el-option v-for="port in airCatalog.ports" :key="port.code" :label="`${port.code} · ${port.name}`" :value="port.code" /></el-select></label>
      <label>目的港<el-select v-model="filters.destination" filterable clearable aria-label="目的港筛选" placeholder="全部"><el-option v-for="port in airCatalog.ports" :key="port.code" :label="`${port.code} · ${port.name}`" :value="port.code" /></el-select></label>
      <label>订单状态<el-select v-model="filters.status" clearable aria-label="订单状态筛选" placeholder="全部"><el-option v-for="s in ['待订舱', '待补录', '待出提单', '已出提单', '已交单', '待审核', '已作废']" :key="s" :value="s" /></el-select></label>
      <label>出港日期<el-date-picker v-model="filters.departureDate" value-format="YYYY-MM-DD" aria-label="出港日期筛选" placeholder="全部" /></label>
      <label>创建日期<el-date-picker v-model="filters.createDate" value-format="YYYY-MM-DD" aria-label="创建日期筛选" placeholder="全部" /></label>
      <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
    </form>
    <DataTableFrame :rows="filteredRows" :page-size="10">
      <template #actions><span>{{ airSession.role === 'service' ? '仅本人创建的订单' : '当前演示角色可见订单' }}</span></template>
      <template #default="{ rows }">
        <el-table :data="rows" row-key="id" stripe empty-text="无符合条件的主订单" aria-label="主订单列表" @row-dblclick="openDetail">
          <el-table-column prop="orderNo" label="订单号" width="185" fixed="left"><template #default="{ row }"><button class="link-button" @click="openOrder(row)">{{ row.orderNo }}</button></template></el-table-column>
          <el-table-column prop="customer" label="客户" min-width="145" />
          <el-table-column prop="waybillNo" label="提单号" width="145" />
          <el-table-column prop="route" label="始发港 / 目的港" width="140" />
          <el-table-column prop="pieces" label="件数" width="72" align="right" />
          <el-table-column prop="grossWeight" label="重量 kg" width="96" align="right" />
          <el-table-column prop="volume" label="体积 m³" width="94" align="right" />
          <el-table-column label="订单状态" width="110"><template #default="{ row }"><StatusTag :label="row.orderStatus" /></template></el-table-column>
          <el-table-column label="订舱服务" width="120"><template #default="{ row }"><StatusTag :label="row.bookingStatus" /></template></el-table-column>
          <el-table-column prop="flight" label="航班号" width="100" />
          <el-table-column prop="supplier" label="航司" width="110" />
          <el-table-column prop="departureDate" label="出港日期" width="118" />
          <el-table-column prop="creator" label="客服" width="90" />
          <el-table-column prop="owner" label="业务员" width="90" />
          <el-table-column prop="createDate" label="创建日期" width="118" />
          <el-table-column label="操作" width="180" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">详情</el-button><el-button link type="primary" @click="openBooking(row)">订舱</el-button><el-button v-business-write="'airOrders'" v-if="!getAirPriceRestriction(row, airSession)" link type="primary" @click="openPrices(row)">改价</el-button></template></el-table-column>
        </el-table>
      </template>
    </DataTableFrame>
    <AirOrderCreateDialog v-model="createVisible" @created="created" />
    <AirOrderPriceDialog v-model="priceVisible" :order-id="priceOrderId" />
    <el-drawer v-model="detailVisible" title="主订单详情" size="min(760px, 94vw)">
      <template v-if="selected">
        <div class="detail-hero"><div><small>空运主订单</small><h2>{{ selected.orderNo }}</h2><span>{{ selected.customer }} · {{ selected.route }}</span></div><div><StatusTag :label="selected.orderStatus" /><StatusTag :label="selected.bookingStatus" /></div></div>
        <div class="detail-section"><h3>客户与货物</h3><dl class="detail-grid">
          <div><dt>业务员 / 客服</dt><dd>{{ selected.owner }} / {{ selected.creator }}</dd></div><div><dt>联系人 / 电话</dt><dd>{{ selected.contact || '未填写' }} / {{ selected.phone || '未填写' }}</dd></div>
          <div><dt>联系人邮箱</dt><dd>{{ displayValue(selected.contactEmails?.filter(Boolean)) }}</dd></div><div><dt>订单流转</dt><dd>{{ displayValue(selected.flowTo) }}</dd></div>
          <div><dt>中文品名</dt><dd>{{ selected.goodsName || '未填写' }}</dd></div><div><dt>特殊货物</dt><dd>{{ selected.specialCargo || '无' }}</dd></div>
          <div><dt>件数 / 重量 / 体积</dt><dd>{{ selected.pieces }} 件 / {{ selected.grossWeight }} kg / {{ selected.volume }} m³</dd></div><div><dt>预计提单计费重</dt><dd>{{ Number.isFinite(selected.chargeWeight) ? selected.chargeWeight.toFixed(1) + ' kg' : '待补全' }}</dd></div>
          <div><dt>尺寸：长 / 宽 / 高（cm）</dt><dd>{{ displayValue(selected.length) }} / {{ displayValue(selected.width) }} / {{ displayValue(selected.height) }}</dd></div><div><dt>期望到货时间</dt><dd>{{ displayValue(selected.expectedArrival) }}</dd></div>
          <div><dt>运费卖价</dt><dd>{{ selected.sellRate }}</dd></div><div><dt>后段卡车卖价</dt><dd>{{ displayValue(selected.truckSellRate) }}</dd></div><div><dt>分泡</dt><dd>{{ selected.foamRatio ?? '未填写' }}</dd></div><div><dt>创建日期</dt><dd>{{ selected.createDate }}</dd></div>
        </dl></div>
        <div class="detail-section"><h3>空运与航程</h3><dl class="detail-grid">
          <div><dt>航司产品</dt><dd>{{ AIR_PRODUCTS.find(p => p.id === selected.product)?.label || selected.product }}</dd></div><div><dt>预计出港日期</dt><dd>{{ selected.expectedDepartureDate || '未填写' }}</dd></div>
          <div><dt>已确认航班</dt><dd>{{ selected.flight || '待确认' }}</dd></div><div><dt>出港日期</dt><dd>{{ selected.departureDate || '待确认' }}</dd></div>
          <div><dt>提单号</dt><dd>{{ selected.waybillNo || '待分配' }}</dd></div><div><dt>订舱要求</dt><dd>{{ selected.bookingRequirement || '无补充要求' }}</dd></div>
        </dl></div>
        <div class="detail-section" v-if="selected.booking?.flight"><h3>已保存的订舱信息</h3><dl class="detail-grid">
          <div v-for="[key, label] in bookingDetailFields" :key="key"><dt>{{ label }}</dt><dd>{{ displayValue(selected.booking[key]) }}</dd></div>
          <div><dt>允许亏损</dt><dd>{{ selected.booking.allowLoss ? '是' : '否' }}</dd></div>
        </dl></div>
        <div class="detail-section"><h3>服务单据</h3><el-button v-if="canViewAirTrackingOrder(selected, airSession)" :icon="MapLocation" @click="detailVisible = false; router.push({ path: '/fulfillment/tracking', query: { number: selected.orderNo } })">在途跟踪</el-button><el-table :data="selected.services || []" aria-label="订单服务单据"><el-table-column prop="id" label="服务单号" min-width="180" /><el-table-column prop="name" label="服务" width="90" /><el-table-column label="状态" min-width="110"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column></el-table></div>
        <div v-if="selected.services?.some(service => service.type === 'warehouse')" class="detail-section"><h3>仓储服务信息</h3><dl class="detail-grid"><div><dt>仓储操作</dt><dd>{{ displayValue(selected.warehouseOperations) }}</dd></div></dl></div>
        <div v-if="selected.services?.some(service => service.type === 'pickup')" class="detail-section"><h3>提货服务信息</h3><dl class="detail-grid">
          <div><dt>供应商</dt><dd>{{ displayValue(selected.pickup?.supplier) }}</dd></div><div><dt>提货时间</dt><dd>{{ displayValue(selected.pickup?.time) }}</dd></div>
          <div><dt>提货点</dt><dd>{{ selected.pickup?.region?.join(' / ') }} {{ displayValue(selected.pickup?.address) }}</dd></div><div><dt>提货联系人 / 电话</dt><dd>{{ displayValue(selected.pickup?.contact) }} / {{ displayValue(selected.pickup?.phone) }}</dd></div>
          <div><dt>到货点</dt><dd>{{ displayValue(selected.pickup?.arrivalAddress) }}</dd></div><div><dt>到货联系人 / 电话</dt><dd>{{ displayValue(selected.pickup?.arrivalContact) }} / {{ displayValue(selected.pickup?.arrivalPhone) }}</dd></div>
          <div><dt>特种车</dt><dd>{{ displayValue(selected.pickup?.vehicleType) }}</dd></div><div><dt>备注</dt><dd>{{ displayValue(selected.pickup?.remark) }}</dd></div>
        </dl></div>
        <div class="detail-section" v-if="selected.events?.length"><h3>处理记录</h3><el-timeline><el-timeline-item v-for="(event, index) in selected.events" :key="index" :timestamp="event.at || event.time">{{ event.text || event.message }}<span v-if="event.actor"> · {{ event.actor }}</span></el-timeline-item></el-timeline></div>
        <div class="drawer-actions"><el-button v-if="selected.orderStatus === '待补录' || selected.supplement" type="primary" @click="openSupplement(selected)">{{ !getAirSupplementRestriction(selected, airChildSession) ? '订单补录' : '查看补录' }}</el-button><el-button @click="openBooking(selected)">进入该订单订舱</el-button><el-button v-if="['待出提单', '已出提单', '已交单'].includes(selected.orderStatus)" @click="router.push(`/fulfillment/airway-bills/${selected.id}`)">进入提单</el-button></div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.air-filters { margin: 0 0 16px; display: flex; align-items: end; flex-wrap: wrap; gap: 12px; }
.air-filters label { display: flex; flex-direction: column; gap: 8px; width: 150px; color: var(--muted); }
.air-filters label:first-child { width: 250px; }
.air-filters :deep(.el-date-editor) { width: 100%; }
.air-context { margin-bottom: 16px; color: var(--muted); }
@media (max-width: 680px) { .air-filters label, .air-filters label:first-child { width: 100%; } }
</style>
