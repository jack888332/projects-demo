<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, unref } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import AirOrderCreateDialog from '../components/AirOrderCreateDialog.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { AIR_PRODUCTS } from '../domain/airOperations.js'
import { AIR_CHILD_TABLE, createAirConsolidationDraft, getAirChildRestriction, getAirConsolidationContext, validateAirConsolidation } from '../domain/airChildOrders.js'

const route = useRoute(), router = useRouter()
const { state, airChildSession, airCatalog, submitAirChildOrder, deleteAirChildOrder, createAirConsolidatedOrder } = usePrototypeData()
const session = computed(() => unref(airChildSession) || {})
const createRestriction = computed(() => getAirChildRestriction(null, session.value, 'create'))
const emptyFilters = () => ({ orderNo: '', waybillNo: '', airline: '', creator: '', owner: '', flight: '', origin: '', destination: '', departureDate: '', createDate: '', status: '' })
const filters = reactive(emptyFilters())
const visibleRows = computed(() => (state.airChildren || []).filter(row => !row.deleted && !getAirChildRestriction(row, session.value, 'detail')))
const includes = (value, query) => !query || String(value || '').toLowerCase().includes(query.trim().toLowerCase())
const rows = computed(() => visibleRows.value.filter(row => includes(row.orderNo, filters.orderNo) && includes(row.waybillNo, filters.waybillNo)
  && includes(row.creator, filters.creator) && includes(row.owner, filters.owner)
  && (!filters.airline || row.booking?.airline === filters.airline || AIR_PRODUCTS.find(item => item.id === row.product)?.airline === filters.airline)
  && (!filters.flight || row.flight === filters.flight.trim()) && (!filters.origin || row.origin === filters.origin)
  && (!filters.destination || row.destination === filters.destination) && (!filters.departureDate || (row.departureDate || row.expectedDepartureDate) === filters.departureDate)
  && (!filters.createDate || (row.createDate || row.createdAt?.slice(0, 10)) === filters.createDate) && (!filters.status || row.orderStatus === filters.status)))
const dialogVisible = ref(false), dialogMode = ref('create'), selectedOrder = ref(null)
const selection = ref([]), table = ref(), busy = ref(false), failure = ref('')
const consolidateVisible = ref(false), consolidationIds = ref([]), consolidation = reactive(createAirConsolidationDraft())
const initialConsolidationIds = ref('[]')
const consolidationRows = computed(() => consolidationIds.value.map(id => state.airChildren.find(row => row.id === id)).filter(Boolean))
const aggregate = computed(() => getAirConsolidationContext(consolidationRows.value))
const consolidationErrors = computed(() => validateAirConsolidation(consolidation, consolidationRows.value, state.airMaster))
const products = computed(() => AIR_PRODUCTS.filter(row => row.airline === consolidation.airline))
const isDirty = computed(() => consolidateVisible.value && (JSON.stringify(consolidation) !== JSON.stringify(createAirConsolidationDraft()) || JSON.stringify(consolidationIds.value) !== initialConsolidationIds.value))
const stamp = () => ({ collection: state.airChildren, role: session.value.role, name: session.value.name })
const unchanged = value => value.collection === state.airChildren && value.role === session.value.role && value.name === session.value.name
let generation = 0
function restriction(row, action) { return getAirChildRestriction(row, session.value, action) }
function open(mode = 'create', row = null) {
  if (mode !== 'detail' && (row ? restriction(row, mode) : createRestriction.value)) return false
  dialogMode.value = mode; selectedOrder.value = row; dialogVisible.value = true; return true
}
function saved() { Object.assign(filters, emptyFilters()); clearSelection() }
function clearSelection() { selection.value = []; table.value?.clearSelection() }
function selected(rows) { selection.value = rows.map(row => row.id) }
function selectable(row) { return row.orderStatus === '子订单完成' && !restriction(row, 'consolidate') }
function submit(row) {
  if (busy.value || restriction(row, 'submit')) return false
  busy.value = true; failure.value = ''
  try { submitAirChildOrder(row.id); ElMessage.success('子订单已提交，订舱将在合成主订单时创建'); return true }
  catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
async function remove(row) {
  if (busy.value || restriction(row, 'delete')) return false
  const current = stamp(), expected = row, token = generation
  busy.value = true
  try {
    await ElMessageBox.confirm(`作废子订单 ${row.orderNo}？暂存订单将删除；已完成且无服务的订单将标记删除。`, '作废子订单', { confirmButtonText: '确认作废', cancelButtonText: '保留订单', type: 'warning' })
    if (!unchanged(current) || token !== generation || state.airChildren.find(item => item.id === row.id) !== expected) return false
    deleteAirChildOrder(row.id); clearSelection(); ElMessage.success('子订单已作废'); return true
  } catch (error) { if (error instanceof Error) failure.value = error.message; return false }
  finally { busy.value = false }
}
function openConsolidation() {
  if (busy.value || !selection.value.length || createRestriction.value) return false
  consolidationIds.value = [...selection.value]
  initialConsolidationIds.value = JSON.stringify(consolidationIds.value)
  Object.assign(consolidation, createAirConsolidationDraft())
  failure.value = ''; consolidateVisible.value = true; return true
}
async function closeConsolidation(done) {
  if (busy.value) return false
  const current = stamp(), token = generation
  busy.value = true
  try {
  if (isDirty.value) {
    try { await ElMessageBox.confirm('放弃本次合成主订单填写内容？原子订单保持不变。', '放弃合成', { confirmButtonText: '放弃填写', cancelButtonText: '继续编辑' }) }
    catch { return false }
  }
  if (!unchanged(current) || token !== generation) return false
  consolidateVisible.value = false; if (typeof done === 'function') done(); return true
  } finally { busy.value = false }
}
function consolidate() {
  if (busy.value || createRestriction.value || Object.keys(consolidationErrors.value).length) return false
  busy.value = true; failure.value = ''
  try {
    const order = createAirConsolidatedOrder([...consolidationIds.value], { ...consolidation })
    consolidateVisible.value = false; clearSelection(); ElMessage.success('已生成主订单并创建订舱服务')
    router.push({ path: '/fulfillment/air-orders', query: { order: order.id } }); return true
  } catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
watch(() => [state.airChildren, session.value.role, session.value.name], () => {
  generation += 1; dialogVisible.value = false; consolidateVisible.value = false; clearSelection(); failure.value = ''
}, { flush: 'sync' })
watch(() => route.query, query => {
  if (query.action === 'create' && !createRestriction.value) open('create')
  if (query.order) { const row = visibleRows.value.find(item => item.id === query.order); if (row) open('detail', row) }
}, { immediate: true })
onBeforeRouteLeave(async () => !isDirty.value || await closeConsolidation())
onBeforeRouteUpdate(async (to, from) => {
  if (!consolidateVisible.value) return true
  const opensCreate = to.query.action === 'create' && to.query.action !== from.query.action && !createRestriction.value
  const opensOrder = to.query.order && to.query.order !== from.query.order && visibleRows.value.some(row => row.id === to.query.order)
  return !(opensCreate || opensOrder) || await closeConsolidation()
})
function beforeUnload(event) { if (isDirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>

<template>
  <div class="module-view child-orders-view">
    <PageHeader title="子订单管理" description="独立子订单先维护客户、货物和服务，合成主订单后统一订舱。">
      <template #actions><el-button type="primary" :icon="Plus" :disabled="Boolean(createRestriction)" @click="open('create')">创建子订单</el-button></template>
    </PageHeader>
    <el-alert v-if="createRestriction" :title="createRestriction" type="info" :closable="false" />
    <el-alert v-if="failure && !consolidateVisible" :title="failure" type="error" :closable="false" role="alert" />
    <form class="child-filters" aria-label="子订单筛选" @submit.prevent>
      <label>子订单号<el-input v-model="filters.orderNo" clearable aria-label="子订单号筛选" placeholder="模糊查询" /></label>
      <label>提单号<el-input v-model="filters.waybillNo" clearable aria-label="子订单提单号筛选" placeholder="模糊查询" /></label>
      <label>航司<el-select v-model="filters.airline" clearable aria-label="子订单航司筛选" placeholder="全部"><el-option v-for="airline in state.airMaster.airlines" :key="airline.id" :value="airline.name" /></el-select></label>
      <label>客服<el-input v-model="filters.creator" clearable aria-label="子订单客服筛选" placeholder="全部，支持模糊查询" /></label>
      <label>业务员<el-input v-model="filters.owner" clearable aria-label="子订单业务员筛选" placeholder="模糊查询" /></label>
      <label>航班号<el-input v-model="filters.flight" clearable aria-label="子订单航班号筛选" placeholder="精确查询" /></label>
      <label>始发港<el-select v-model="filters.origin" clearable filterable aria-label="子订单始发港筛选" placeholder="全部"><el-option v-for="port in airCatalog.ports" :key="port.code" :label="`${port.code} · ${port.name}`" :value="port.code" /></el-select></label>
      <label>目的港<el-select v-model="filters.destination" clearable filterable aria-label="子订单目的港筛选" placeholder="全部"><el-option v-for="port in airCatalog.ports" :key="port.code" :label="`${port.code} · ${port.name}`" :value="port.code" /></el-select></label>
      <label>出港日期<el-date-picker v-model="filters.departureDate" value-format="YYYY-MM-DD" aria-label="子订单出港日期筛选" placeholder="全部" /></label>
      <label>创建日期<el-date-picker v-model="filters.createDate" value-format="YYYY-MM-DD" aria-label="子订单创建日期筛选" placeholder="全部" /></label>
      <label>订单状态<el-select v-model="filters.status" clearable aria-label="子订单状态筛选" placeholder="全部"><el-option v-for="value in ['子订单暂存', '子订单完成']" :key="value" :value="value" /></el-select></label>
      <el-button :icon="Refresh" @click="Object.assign(filters, emptyFilters())">重置</el-button>
    </form>
    <DataTableFrame :rows="rows" :page-size="AIR_CHILD_TABLE.pageSize" :page-sizes="[10]" selectable :selected-count="selection.length">
      <template #actions><div class="child-toolbar"><span>跨页选择</span><el-button v-if="selection.length" link @click="clearSelection">清除选择</el-button><el-button type="primary" :disabled="!selection.length || Boolean(createRestriction)" @click="openConsolidation">合成主订单（{{ selection.length }}）</el-button></div></template>
      <template #default="{ rows: pageRows }"><el-table ref="table" :data="pageRows" row-key="id" aria-label="子订单列表" empty-text="暂无符合条件的子订单" @selection-change="selected">
        <el-table-column type="selection" width="45" reserve-selection :selectable="selectable" />
        <el-table-column label="子订单号" min-width="210"><template #default="{ row }"><el-button link type="primary" @click="open('detail', row)">{{ row.orderNo }}</el-button><div class="child-subtext">{{ row.housebillNo || '分单号未填写' }}</div></template></el-table-column>
        <el-table-column prop="customer" label="客户" min-width="180" />
        <el-table-column label="状态" width="130"><template #default="{ row }"><StatusTag :label="row.orderStatus" /></template></el-table-column>
        <el-table-column label="归属" min-width="170"><template #default="{ row }"><el-button v-if="row.parentId" link type="primary" @click="router.push({ path: '/fulfillment/air-orders', query: { order: row.parentId } })">查看主订单</el-button><span v-else>{{ row.sourceKind === 'standalone' ? '独立子订单' : '移入分单' }}</span></template></el-table-column>
        <el-table-column prop="goodsName" label="中文品名" min-width="180" /><el-table-column prop="pieces" label="预计件数" width="100" align="right" /><el-table-column prop="grossWeight" label="预计毛重 kg" width="120" align="right" /><el-table-column prop="volume" label="预计体积 m³" width="125" align="right" />
        <el-table-column prop="sellRate" label="运费卖价" width="105" align="right" /><el-table-column prop="creator" label="客服" width="100" /><el-table-column prop="owner" label="业务员" width="100" />
        <el-table-column label="操作" fixed="right" min-width="245"><template #default="{ row }"><el-button link type="primary" :disabled="Boolean(restriction(row, 'edit'))" @click="open('edit', row)">{{ row.orderStatus === '子订单完成' ? '修改报价' : '编辑' }}</el-button><el-button v-if="row.orderStatus === '子订单暂存'" link type="primary" :disabled="Boolean(restriction(row, 'submit')) || busy" @click="submit(row)">提交</el-button><el-button link type="primary" :disabled="Boolean(restriction(row, 'copy'))" @click="open('copy', row)">复制</el-button><el-button link type="danger" :disabled="Boolean(restriction(row, 'delete')) || Boolean(row.serviceRecords?.length) || busy" @click="remove(row)">作废</el-button></template></el-table-column>
      </el-table></template>
    </DataTableFrame>
    <p class="child-subtext">完成单的预计毛件体编辑、已有服务的作废费用、批次管理及跨客户合成仍有待确认口径。</p>
    <AirOrderCreateDialog v-model="dialogVisible" kind="child" :mode="dialogMode" :order="selectedOrder" @created="saved" />
    <el-dialog v-model="consolidateVisible" title="合成主订单" width="min(1050px, 96vw)" align-center :close-on-click-modal="false" :before-close="closeConsolidation">
      <el-alert v-if="failure" :title="failure" type="error" :closable="false" role="alert" />
      <p>已选 {{ consolidationRows.length }} 个子订单。来源信息只读，可从本次选择中移除；原服务及状态继续保留在分单上。</p>
      <el-table :data="consolidationRows" row-key="id" aria-label="合成来源子订单"><el-table-column prop="orderNo" label="子订单号" min-width="195" /><el-table-column prop="customer" label="客户" min-width="165" /><el-table-column prop="pieces" label="预计件数" width="100" /><el-table-column prop="grossWeight" label="预计毛重 kg" width="120" /><el-table-column prop="volume" label="预计体积 m³" width="125" /><el-table-column label="操作" width="145"><template #default="{ row }"><el-button link @click="open('detail', row)">查看</el-button><el-button link type="danger" @click="consolidationIds = consolidationIds.filter(id => id !== row.id)">移除</el-button></template></el-table-column></el-table>
      <dl class="consolidation-totals"><div><dt>件数合计</dt><dd>{{ aggregate.pieces }}</dd></div><div><dt>毛重合计 kg</dt><dd>{{ aggregate.grossWeight }}</dd></div><div><dt>体积合计 m³</dt><dd>{{ aggregate.volume }}</dd></div><div><dt>聚合运费卖价</dt><dd>{{ aggregate.sellRate === null ? '待补齐取值' : Number(aggregate.sellRate.toFixed(6)) }}</dd></div><div><dt>聚合后段卡车卖价</dt><dd>{{ aggregate.truckSellRate === null ? '未填写或待确认' : Number(aggregate.truckSellRate.toFixed(6)) }}</dd></div></dl>
      <el-form label-position="top" :model="consolidation" class="consolidation-form" @submit.prevent="consolidate">
        <el-form-item v-for="field in [{ key: 'origin', label: '始发港' }, { key: 'destination', label: '目的港' }]" :key="field.key" :label="field.label" required :error="consolidationErrors[field.key]"><el-select v-model="consolidation[field.key]" filterable :aria-label="`合成${field.label}`"><el-option v-for="port in airCatalog.ports" :key="port.code" :value="port.code" :label="`${port.code} · ${port.name}`" /></el-select></el-form-item>
        <el-form-item label="订单流转"><el-select v-model="consolidation.flowTo" clearable aria-label="合成订单流转" placeholder="选填"><el-option v-for="name in ['空运出口部', '航晟物流部']" :key="name" :value="name" /></el-select></el-form-item>
        <el-form-item label="航司" required :error="consolidationErrors.airline"><el-select v-model="consolidation.airline" aria-label="合成航司"><el-option v-for="airline in state.airMaster.airlines" :key="airline.id" :value="airline.name" /></el-select></el-form-item>
        <el-form-item label="航司产品" required :error="consolidationErrors.product"><el-select v-model="consolidation.product" aria-label="合成航司产品"><el-option v-for="product in products" :key="product.id" :value="product.id" :label="product.label" /></el-select></el-form-item>
        <el-form-item label="订舱要求" :error="consolidationErrors.bookingRequirement"><el-input v-model="consolidation.bookingRequirement" maxlength="50" aria-label="合成订舱要求" /></el-form-item>
      </el-form>
      <p>订舱服务为必选，提交后生成待订舱主订单。</p>
      <el-alert v-if="consolidationErrors.children" :title="consolidationErrors.children" type="warning" :closable="false" />
      <template #footer><el-button :disabled="busy" @click="closeConsolidation">取消</el-button><el-button type="primary" :loading="busy" :disabled="Boolean(createRestriction) || Object.keys(consolidationErrors).length > 0" @click="consolidate">确定生成并提交订舱</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.child-orders-view { min-width: 0; }
.child-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(185px, 100%), 1fr)); gap: 12px 16px; align-items: end; padding: 16px; margin-bottom: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.child-filters label { display: grid; gap: 6px; font-size: 12px; color: var(--muted); min-width: 0; }
.child-filters :deep(.el-select), .child-filters :deep(.el-date-editor), .consolidation-form :deep(.el-select) { width: 100%; }
.child-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.child-subtext { font-size: 12px; color: var(--muted); line-height: 1.6; }
.consolidation-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 0 18px; }
.consolidation-form > * { min-width: 0; }
.consolidation-totals { display: flex; flex-wrap: wrap; gap: 18px 30px; padding: 16px; background: var(--surface-alt, #f6f8fb); }
.consolidation-totals div { min-width: 110px; }
.consolidation-totals dt { color: var(--muted); font-size: 12px; }.consolidation-totals dd { margin: 6px 0 0; font-weight: 600; }
</style>
