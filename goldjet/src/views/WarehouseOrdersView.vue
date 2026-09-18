<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { Edit, View, Download, Back } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import WarehouseOrderEditor from '../components/WarehouseOrderEditor.vue'
import WarehousePallets from '../components/WarehousePallets.vue'
import WarehouseOrderOperations from '../components/WarehouseOrderOperations.vue'
import WarehouseReturns from '../components/WarehouseReturns.vue'
import WarehouseTransportBoards from '../components/WarehouseTransportBoards.vue'
import WarehouseMonthlyReport from '../components/WarehouseMonthlyReport.vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canReadModule, canWriteModule } from '../data/accessControl.js'
import { warehouseRows, warehouseHistory, warehousePermissions, warehouseSelectedSummary, WAREHOUSE_FIELDS, WAREHOUSE_COLUMNS, WAREHOUSE_STATUSES } from '../domain/warehouseOrders.js'
const { state, workbenchSession, receiveWarehouseUpstream } = usePrototypeData()
const route = useRoute(), router = useRouter(), editor = ref(), selection = ref([]), table = ref()
const tab = computed(() => String(route.query.tab || 'orders'))
const rows = computed(() => canReadModule('warehouseOrders') ? warehouseRows(state) : [])
const selected = computed(() => rows.value.find(row => row.id === route.query.order))
const summary = computed(() => warehouseSelectedSummary(rows.value.filter(row => selection.value.includes(row.id))))
const permissions = computed(() => warehousePermissions(workbenchSession.personaId, selected.value))
const history = computed(() => selected.value ? warehouseHistory(state, selected.value) : [])
const info = ref(['order'])
const detailTab = computed(() => String(route.query.detail || 'history'))
function detailNavigate(value) { router.push({ query: { ...route.query, detail: value } }) }
function open(row) { router.push({ query: { tab: 'orders', order: row.id } }) }
function navigate(value) { router.push({ query: { tab: value } }) }
const upstream = ref(false), upstreamAir = ref(''), upstreamNo = ref(''), upstreamFailure = ref('')
const upstreamDirty = computed(() => upstream.value && Boolean(upstreamAir.value || upstreamNo.value))
function clearUpstream() { upstream.value = false; upstreamAir.value = ''; upstreamNo.value = ''; upstreamFailure.value = '' }
async function discardUpstream() {
  if (!upstreamDirty.value) return true
  try { await ElMessageBox.confirm('放弃尚未接收的上游订单输入？','放弃修改',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑'}); return true } catch { return false }
}
async function toggleUpstream() {
  if (upstream.value) { if (await discardUpstream()) clearUpstream() } else upstream.value = true
}
async function leaveUpstream() { if (!await discardUpstream()) return false; clearUpstream() }
onBeforeRouteLeave(leaveUpstream)
onBeforeRouteUpdate(leaveUpstream)
const beforeUnload = event => { if (upstreamDirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload',beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload',beforeUnload))
const upstreamOrders = computed(() => canReadModule('airOrders') ? state.airOrders.filter(row => !row.deleted && row.services?.some(service => service.type === 'warehouse')) : [])
function receive() {
  try { const row = receiveWarehouseUpstream(upstreamAir.value, upstreamNo.value); clearUpstream(); open(row); ElMessage.success('已接收上游订单（本地模拟）') } catch(error) { upstreamFailure.value = error.message }
}
watch(() => workbenchSession.personaId, () => { selection.value = []; clearUpstream() })
</script>

<template>
  <div class="module-view warehouse-view">
    <PageHeader title="仓库订单管理"><template #actions><el-button v-if="selected" :icon="Back" @click="navigate('orders')">返回列表</el-button><el-button v-if="tab === 'orders' && !selected && permissions.create && canWriteModule('airOrders') && canWriteModule('warehouseOrders')" @click="router.push({path:'/fulfillment/air-orders',query:{action:'createWarehouse'}})">空运建单入口</el-button><el-button v-if="tab === 'orders' && !selected && permissions.simulate && canWriteModule('warehouseOrders')" @click="toggleUpstream">模拟接收上游订单</el-button></template></PageHeader>
    <el-tabs :model-value="tab" @tab-change="navigate"><el-tab-pane label="仓库订单" name="orders" /><el-tab-pane label="托盘管理" name="pallets" /><el-tab-pane label="退货管理" name="returns" /><el-tab-pane label="运输订单看板" name="transportOrders" /><el-tab-pane label="运输运单看板" name="transportBills" /><el-tab-pane v-if="permissions.report" label="仓库月报" name="monthly" /></el-tabs>
    <section v-if="upstream && tab === 'orders' && !selected" class="upstream-form">
      <el-alert title="本地接收模拟；上游入仓号须显式提供，不从空运单号推断。" type="info" :closable="false" />
      <el-alert v-if="upstreamFailure" :title="upstreamFailure" type="error" :closable="false" />
      <el-form label-position="top" @submit.prevent="receive"><el-form-item label="空运主订单"><el-select v-model="upstreamAir" filterable aria-label="上游空运主订单"><el-option v-for="row in upstreamOrders" :key="row.id" :label="row.orderNo" :value="row.id" /></el-select></el-form-item><el-form-item label="上游入仓号"><el-input v-model="upstreamNo" aria-label="上游入仓号" /></el-form-item><el-button type="primary" native-type="submit">接收本地订单</el-button></el-form>
    </section>
    <WarehousePallets v-if="tab === 'pallets'" @open-order="row => router.push({query:{tab:'orders',order:row.orderId,detail:'pallets'}})" />
    <WarehouseReturns v-else-if="tab === 'returns'" />
    <WarehouseTransportBoards v-else-if="['transportOrders','transportBills'].includes(tab)" :key="tab" :kind="tab === 'transportOrders' ? 'orders' : 'bills'" />
    <WarehouseMonthlyReport v-else-if="tab === 'monthly'" />
    <template v-else-if="!selected">
      <div class="warehouse-status-summary"><span v-for="status in WAREHOUSE_STATUSES" :key="status">{{ status }} <strong>{{ rows.filter(row => row.status === status).length }}</strong></span></div>
      <DataTableFrame :rows="rows" :page-size="50" :page-sizes="[50]" selectable :selected-count="selection.length">
        <template #actions><span v-if="selection.length">委托 {{ summary.expectedPieces }} 件 · {{ summary.expectedWeight.toFixed(2) }} kg · {{ summary.expectedVolume.toFixed(2) }} m³</span><el-button v-if="selection.length" @click="table.clearSelection()">清空</el-button><el-tooltip content="航空标签内容与模板待确认"><span><el-button :icon="Download" disabled>下载标签</el-button></span></el-tooltip></template>
        <template #default="{rows: pageRows}"><el-table ref="table" :data="pageRows" row-key="id" aria-label="仓库订单列表" @selection-change="selection = $event.map(row => row.id)">
          <el-table-column type="selection" width="44" />
          <el-table-column label="状态" width="105"><template #default="{row}"><StatusTag :label="row.status" /></template></el-table-column>
          <el-table-column v-for="[key,label,width] in WAREHOUSE_COLUMNS" :key="key" :prop="key" :label="label" :min-width="width" />
          <el-table-column label="操作" width="185" fixed="right"><template #default="{row}"><el-button :icon="View" link type="primary" @click="open(row)">详情</el-button><el-button v-if="warehousePermissions(workbenchSession.personaId,row).edit && canWriteModule('warehouseOrders')" :icon="Edit" link type="primary" @click="editor.open(row)">编辑</el-button><el-tooltip content="航空标签模板待确认"><el-button link disabled>标签</el-button></el-tooltip></template></el-table-column>
        </el-table></template>
      </DataTableFrame>
    </template>
    <template v-else>
      <div class="warehouse-detail-heading"><div><h2>{{ selected.inboundNo }}</h2><span>{{ selected.customer }}</span></div><StatusTag :label="selected.status" /><el-button v-if="permissions.edit && canWriteModule('warehouseOrders')" :icon="Edit" @click="editor.open(selected)">编辑订单</el-button></div>
      <el-collapse v-model="info"><el-collapse-item title="订单信息" name="order"><dl class="warehouse-detail-grid"><template v-for="[key,label] in WAREHOUSE_FIELDS" :key="key"><div v-if="key !== 'customerOrderNo' || selected.manual"><dt>{{ label }}</dt><dd>{{ selected[key] }}</dd></div></template></dl></el-collapse-item>
        <el-collapse-item title="航班航线其他信息" name="air"><dl class="warehouse-detail-grid"><div v-for="[key,label] in [['waybillNo','提单号'],['flight','航班号'],['route','航线'],['departureDate','出港日期']]" :key="key"><dt>{{ label }}</dt><dd>{{ canReadModule('airOrders') ? state.airOrders.find(row => row.id === selected.airOrderId)?.[key] : '' }}</dd></div></dl></el-collapse-item>
      </el-collapse>
      <el-tabs :model-value="detailTab" @tab-change="detailNavigate"><el-tab-pane label="操作记录" name="history" /><el-tab-pane label="托盘管理" name="pallets" /><el-tab-pane label="服务管理" name="services" /><el-tab-pane label="应收付账单" name="costs" /></el-tabs>
      <template v-if="detailTab === 'history'"><el-table :data="history" aria-label="仓库订单操作记录"><el-table-column prop="event" label="事件" min-width="160" /><el-table-column prop="remark" label="备注" min-width="260" /><el-table-column prop="actor" label="操作人" min-width="190" /><el-table-column prop="time" label="时间" min-width="170" /></el-table></template>
      <WarehousePallets v-else-if="detailTab === 'pallets'" :order-id="selected.id" />
      <WarehouseOrderOperations :key="selected.id+detailTab" :order="selected" :panel="detailTab" />
    </template>
    <WarehouseOrderEditor ref="editor" @saved="open" />
  </div>
</template>

<style scoped>
.warehouse-status-summary { display:flex; gap:24px; flex-wrap:wrap; padding:10px 0 20px; color:var(--muted); }
.upstream-form { padding:16px 0; margin-bottom:20px; border-bottom:1px solid var(--border); }
.upstream-form .el-form { display:flex; flex-wrap:wrap; align-items:center; gap:16px; margin-top:16px; }
.upstream-form .el-form-item { width:280px; max-width:100%; }
.upstream-form .el-select { width:100%; }
.warehouse-status-summary strong { color:var(--ink); margin-left:8px; }
.warehouse-detail-heading { display:flex; flex-wrap:wrap; gap:18px; align-items:center; margin:8px 0 20px; }
h2 { font-size:20px; overflow-wrap:anywhere; margin:0 0 8px; } h3 { font-size:16px; }
.warehouse-detail-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; margin:12px 0; }
dt { color:var(--muted); font-size:12px; margin-bottom:6px; } dd { margin:0; min-height:20px; overflow-wrap:anywhere; }
@media(max-width:700px) { .warehouse-detail-grid { grid-template-columns:minmax(0,1fr); } .warehouse-status-summary { gap:12px; } }
</style>
