<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Connection, Download, RefreshLeft } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canReadModule } from '../data/accessControl.js'
import { validCapacityDate, getCapacityQueryRestriction } from '../domain/airCapacity.js'
import { getPalletCandidates, getPalletFlightRows, getPalletAllocatedRows, getPalletAllocationRestriction, getPalletSplitRestriction, getPalletUnloadRestriction, getPalletWithdrawRestriction, getPalletWriteRestriction, canEditAirAllocationNote, validatePalletSplit } from '../domain/airPallets.js'

const { state, capacitySession, allocateAirOrders, unloadAirAllocations, splitAirAllocation, withdrawAirSplit, saveAirAllocationNote, reallocateAirFlight } = usePrototypeData()
const session = computed(() => capacitySession.value ?? capacitySession)
const router = useRouter()
const canRead = computed(() => session.value.readAll || ['operator', 'handler'].includes(session.value.role))
const writeReason = computed(() => getPalletWriteRestriction(session.value))
const clone = value => JSON.parse(JSON.stringify(value))
const defaults = () => ({ orderNo: '', waybillNo: '', customer: '', creator: '', foamRatio: '', origin: '', destination: '', owner: '', departureDate: [], createDate: [], flight: '', specialCargo: '', airline: '' })
const filters = ref(defaults()), applied = ref(defaults()), queryError = ref('')
const textFields = [{ key: 'orderNo', label: '订单号' }, { key: 'waybillNo', label: '提单号' }, { key: 'customer', label: '客户' }, { key: 'creator', label: '客服' }, { key: 'owner', label: '业务员' }]
const sourceLabels = [{ key: 'expected', label: '预计' }, { key: 'warehouse', label: '入仓' }, { key: 'waybill', label: '提单' }]
const cargoFields = [{ key: 'grossWeight', name: '毛重', label: '毛重 (kg)' }, { key: 'pieces', name: '件数', label: '件数' }, { key: 'volume', name: '体积', label: '体积 (m³)' }]
const candidateIds = ref([]), allocatedIds = ref([]), flightKey = ref(''), selectionVersion = ref(0)
const busy = ref(false), failure = ref(''), dialog = ref(''), editingId = ref(''), draft = ref({}), initial = ref('')
const editing = computed(() => state.palletAllocations.find(row => row.id === editingId.value))
const dirty = computed(() => !!dialog.value && JSON.stringify(draft.value) !== initial.value)
const ownProducts = computed(() => canRead.value ? state.capacityProducts.filter(row => session.value.readAll || row[session.value.role] === session.value.name) : [])
const airlines = computed(() => state.airMaster.airlines.filter(airline => ownProducts.value.some(product => state.airMaster.flights.some(flight => flight.id === product.flightId && flight.airlineCode === airline.code))))
const flights = computed(() => state.airMaster.flights.filter(row => airlines.value.some(airline => airline.code === row.airlineCode)))
const allCandidates = computed(() => canRead.value ? getPalletCandidates(state, session.value) : [])
const orderOf = row => state.airOrders.find(order => order.id === row.orderId)
const inRange = (value, range) => !range?.length || (!!value && value.slice(0, 10) >= range[0] && value.slice(0, 10) <= range[1])
const rows = computed(() => allCandidates.value.filter(row => {
  const order = orderOf(row) || {}, f = applied.value
  const flight = state.airMaster.flights.find(item => item.code === row.flight)
  return textFields.every(({ key }) => !f[key] || String(row[key] ?? order[key] ?? '').toLowerCase().includes(f[key].trim().toLowerCase()))
    && (f.foamRatio === '' || f.foamRatio == null || (order.foamRatio !== '' && order.foamRatio != null && Number(order.foamRatio) === Number(f.foamRatio)))
    && (!f.origin || order.origin === f.origin) && (!f.destination || order.destination === f.destination)
    && (!f.flight || row.flight === f.flight) && (!f.specialCargo || (order.sourceSpecialCargo || [row.specialCargo]).includes(f.specialCargo))
    && (!f.airline || flight?.airlineCode === f.airline) && inRange(row.date, f.departureDate) && inRange(order.createDate || order.createdAt, f.createDate)
}))
const flightRange = computed(() => {
  if (applied.value.departureDate?.length === 2) return { startDate: applied.value.departureDate[0], endDate: applied.value.departureDate[1] }
  const dates = ownProducts.value.flatMap(product => [product.startDate, product.endDate]).filter(validCapacityDate).sort()
  return { startDate: dates[0] || '2026-09-08', endDate: dates.at(-1) || '2026-09-15' }
})
const flightQueryReason = computed(() => getCapacityQueryRestriction(state, flightRange.value))
const flightRows = computed(() => !canRead.value || flightQueryReason.value ? [] : getPalletFlightRows(state, session.value, flightRange.value).filter(row => (!applied.value.flight || row.flight === applied.value.flight) && (!applied.value.airline || row.airlineCode === applied.value.airline)))
const target = computed(() => flightRows.value.find(row => row.key === flightKey.value))
const allocatedRows = computed(() => target.value ? getPalletAllocatedRows(state, session.value, flightKey.value) : [])
const allocationReason = computed(() => getPalletAllocationRestriction(state, session.value, candidateIds.value, flightKey.value))
const unloadReason = computed(() => getPalletUnloadRestriction(state, session.value, allocatedIds.value))
const reallocateReason = computed(() => getPalletUnloadRestriction(state, session.value, allocatedRows.value.map(row => row.id)))
const splitReason = row => getPalletSplitRestriction(state, session.value, row.id)
const withdrawReason = row => getPalletWithdrawRestriction(state, session.value, row.id)
const splitErrors = computed(() => dialog.value === 'split' && editing.value ? { ...validatePalletSplit(editing.value, draft.value), ...(!draft.value.confirmedInsufficient ? { confirmedInsufficient: '请确认本订单货物一批运不完' } : {}) } : {})
const numericText = value => value == null ? '未提供' : String(value)
const cargoText = cargo => cargoFields.map(field => numericText(cargo?.[field.key])).join(' / ')
const snapshot = () => ({ actor: session.value.name, role: session.value.role, orders: state.airOrders, products: state.capacityProducts, allocations: state.palletAllocations, sequence: state.palletSequence })
const current = token => token.actor === session.value.name && token.role === session.value.role && token.orders === state.airOrders && token.products === state.capacityProducts && token.allocations === state.palletAllocations && token.sequence === state.palletSequence
function resetEditor() { dialog.value = ''; editingId.value = ''; draft.value = {}; initial.value = ''; failure.value = '' }
function clearSelections() { candidateIds.value = []; allocatedIds.value = []; selectionVersion.value += 1 }
function query() {
  for (const key of ['departureDate', 'createDate']) {
    const range = filters.value[key]
    if (range?.length && (range.length !== 2 || !range.every(validCapacityDate) || range[0] > range[1])) { queryError.value = '请选择完整且顺序正确的日期范围'; return false }
  }
  queryError.value = ''; applied.value = clone(filters.value); clearSelections(); flightKey.value = ''; return true
}
function resetQuery() { filters.value = defaults(); return query() }
function selectCandidates(selected) { if (!busy.value) candidateIds.value = selected.filter(row => row.eligible).map(row => row.id) }
function selectAllocated(selected) { if (!busy.value) allocatedIds.value = selected.map(row => row.id) }
function selectFlight(row) { if (busy.value || dialog.value || !row) return; flightKey.value = row.key; allocatedIds.value = [] }
async function allowDiscard() {
  if (busy.value) return false
  if (!dirty.value) return true
  const token = snapshot(); busy.value = true
  try { await ElMessageBox.confirm('尚未保存的配板修改将丢弃。', '放弃修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return current(token) }
  catch { return false } finally { busy.value = false }
}
async function close(done) { if (!await allowDiscard()) return; resetEditor(); if (typeof done === 'function') done() }
async function open(nextDialog, row) {
  if (busy.value || !['split', 'note'].includes(nextDialog) || !canRead.value) return
  const token = snapshot()
  if (!await allowDiscard() || !current(token)) return
  const record = state.palletAllocations.find(item => item.id === row?.id)
  if (!record || !getPalletAllocatedRows(state, session.value, record.flightKey).some(item => item.id === record.id)) { ElMessage.warning('配板记录已不存在或不可访问'); return }
  if (nextDialog === 'split' && splitReason(record)) { ElMessage.warning(splitReason(record)); return }
  resetEditor(); editingId.value = record.id; dialog.value = nextDialog
  draft.value = nextDialog === 'split' ? { grossWeight: '', pieces: '', volume: '', flight: record.flight, date: record.date, confirmedInsufficient: false } : { remark: record.remark || '' }
  initial.value = JSON.stringify(draft.value)
}
function perform(command, message) {
  if (busy.value) return false
  busy.value = true; failure.value = ''
  try { command(); clearSelections(); ElMessage.success(message); return true }
  catch (error) { failure.value = error.message; return false } finally { busy.value = false }
}
function allocate() {
  if (allocationReason.value || dialog.value) return false
  return perform(() => allocateAirOrders([...candidateIds.value], flightKey.value), '已提交成功！')
}
async function confirmAction(kind, row) {
  if (busy.value || dialog.value) return false
  const reason = kind === 'unload' ? unloadReason.value : kind === 'reallocate' ? reallocateReason.value : withdrawReason(row)
  if (reason) { ElMessage.warning(reason); return false }
  const token = snapshot(), ids = [...allocatedIds.value], key = flightKey.value, id = row?.id
  const count = kind === 'reallocate' ? allocatedRows.value.length : ids.length
  const label = { unload: '卸下', reallocate: '重配', withdraw: '撤回分批' }[kind]
  const message = kind === 'withdraw' ? `${row.orderNo} 的拆出毛件体将合并回原配板记录。` : `${target.value?.flight} ${target.value?.date}：${kind === 'reallocate' ? '当前航班全部' : '选中的'} ${count} 条已配板记录将卸下，订单回到待配板列表。`
  busy.value = true
  try { await ElMessageBox.confirm(message, `${label}确认`, { confirmButtonText: label, cancelButtonText: '取消', type: 'warning' }) }
  catch { busy.value = false; return false }
  busy.value = false
  if (!current(token) || key !== flightKey.value) return false
  return perform(() => kind === 'unload' ? unloadAirAllocations(ids) : kind === 'reallocate' ? reallocateAirFlight(key) : withdrawAirSplit(id), `${label}成功`)
}
function save() {
  if (!editing.value || busy.value) return false
  if (dialog.value === 'split' && (splitReason(editing.value) || Object.keys(splitErrors.value).length)) return false
  if (dialog.value === 'note' && !canEditAirAllocationNote(editing.value, session.value)) return false
  const id = editingId.value, payload = clone(draft.value)
  const success = perform(() => dialog.value === 'split' ? splitAirAllocation(id, payload) : saveAirAllocationNote(id, payload.remark), dialog.value === 'split' ? '已提交成功！' : '备注已保存')
  if (success) resetEditor()
  return success
}
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(allowDiscard)
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
watch(() => [session.value.role, session.value.name, state.airOrders, state.capacityProducts], () => { resetEditor(); clearSelections(); flightKey.value = '' })
watch(() => state.palletAllocations.map(row => row.id), () => { if (editingId.value && !editing.value) resetEditor(); allocatedIds.value = allocatedIds.value.filter(id => state.palletAllocations.some(row => row.id === id)) })
</script>

<template>
  <div class="module-view pallet-view">
    <PageHeader title="配板管理" :description="session.label + ' · ' + session.name"><template #actions><el-button v-if="canReadModule('stationPallet')&&canRead" @click="router.push({path:'/fulfillment/station-pallet',query:{tab:'plans'}})">打板计划</el-button></template></PageHeader>
    <el-alert v-if="!canRead" title="配板管理仅向本人负责航线的航线运营、航线操作开放" type="info" :closable="false" />
    <template v-else>
      <el-alert v-if="writeReason" :title="writeReason" type="info" :closable="false" />
      <form class="pallet-filters" @submit.prevent="query">
        <label v-for="field in textFields" :key="field.key">{{ field.label }}<el-input v-model="filters[field.key]" clearable :aria-label="'配板筛选' + field.label" placeholder="模糊查询" /></label>
        <label>分泡比例<el-select v-model="filters.foamRatio" clearable aria-label="配板筛选分泡比例" placeholder="全部"><el-option v-for="n in 11" :key="n" :value="(n-1)/10" :label="String((n-1)/10)" /></el-select></label>
        <label v-for="field in [{key:'origin',label:'始发港'},{key:'destination',label:'目的港'}]" :key="field.key">{{ field.label }}<el-select v-model="filters[field.key]" clearable :aria-label="'配板筛选' + field.label" placeholder="全部"><el-option v-for="port in state.airMaster.ports" :key="port.id" :value="port.code" :label="port.code + ' · ' + port.name" /></el-select></label>
        <label v-for="field in [{key:'departureDate',label:'出港日期'},{key:'createDate',label:'建单日期'}]" :key="field.key">{{ field.label }}<el-date-picker v-model="filters[field.key]" type="daterange" value-format="YYYY-MM-DD" :aria-label="'配板筛选' + field.label" start-placeholder="开始日期" end-placeholder="结束日期" /></label>
        <label>航班号<el-select v-model="filters.flight" clearable filterable aria-label="配板筛选航班号" placeholder="精确查询"><el-option v-for="flight in flights" :key="flight.id" :value="flight.code" /></el-select></label>
        <label>特殊货物<el-select v-model="filters.specialCargo" clearable aria-label="配板筛选特殊货物" placeholder="全部"><el-option v-for="value in ['锂电池','危险品','鲜活','枪械']" :key="value" :value="value" /></el-select></label>
        <label>航司<el-select v-model="filters.airline" clearable aria-label="配板筛选航司" placeholder="本人绑定航司"><el-option v-for="airline in airlines" :key="airline.id" :value="airline.code" :label="airline.code + ' · ' + airline.name" /></el-select></label>
        <div class="pallet-query"><el-button type="primary" native-type="submit" :icon="Search" :disabled="busy">查询</el-button><el-button :icon="Refresh" :disabled="busy" @click="resetQuery">重置</el-button></div>
      </form>
      <el-alert v-if="queryError || flightQueryReason" :title="queryError || flightQueryReason" type="error" :closable="false" />
      <el-alert v-if="failure && !dialog" :title="failure" type="error" :closable="false" />
      <section class="pallet-section">
        <div class="pallet-heading"><h2>待配板订单</h2><span>{{ candidateIds.length }} 条已选</span></div>
        <DataTableFrame :key="'candidate' + selectionVersion + JSON.stringify(applied)" :rows="rows" :page-sizes="[10]">
          <template #default="{rows:pageRows}"><el-table :data="pageRows" row-key="id" aria-label="待配板订单" @selection-change="selectCandidates">
            <el-table-column type="selection" width="42" reserve-selection :selectable="row => row.eligible && !writeReason && !busy" />
            <el-table-column type="expand"><template #default="{row}"><div class="pallet-cargo-details"><el-descriptions :column="1" border><el-descriptions-item v-for="source in sourceLabels" :key="source.key" :label="source.label + '毛重 / 件数 / 体积'">{{ cargoText(row.cargoSources[source.key]) }}</el-descriptions-item><el-descriptions-item v-if="row.dimensions" label="托盘尺寸 (cm)">{{ row.dimensions }}</el-descriptions-item><el-descriptions-item v-if="row.specialCargo" label="特殊物品">{{ row.specialCargo }}</el-descriptions-item></el-descriptions><p v-if="row.dimensionReason" class="pallet-reason">{{ row.dimensionReason }}</p></div></template></el-table-column>
            <el-table-column prop="orderNo" label="订单号" min-width="170" /><el-table-column prop="waybillNo" label="提单号" min-width="145" /><el-table-column prop="customer" label="客户" min-width="160" /><el-table-column prop="flight" label="航班号" min-width="115" /><el-table-column prop="date" label="出港日期" min-width="120" />
            <el-table-column v-for="field in cargoFields" :key="field.key" :label="field.label" min-width="110" align="right"><template #default="{row}">{{ numericText(row.cargo?.[field.key]) }}</template></el-table-column>
            <el-table-column label="配板状态" min-width="260"><template #default="{row}"><span :class="{'pallet-error':!row.eligible}">{{ row.reason || '待配板 · ' + row.cargoSource }}</span></template></el-table-column>
            <template #empty><el-empty description="没有匹配的待配板订单" /></template>
          </el-table></template>
        </DataTableFrame>
      </section>
      <section class="pallet-section">
        <div class="pallet-heading"><h2>目标航班</h2><el-tooltip :content="allocationReason || '将已选订单配至当前航班'"><span><el-button v-business-write="'pallet'" type="primary" :icon="Connection" :disabled="!!allocationReason || busy || !!dialog" @click="allocate">配板</el-button></span></el-tooltip></div>
        <p v-if="candidateIds.length && allocationReason" class="pallet-reason">{{ allocationReason }}</p>
        <DataTableFrame :key="'flights' + JSON.stringify(applied)" :rows="flightRows" :page-sizes="[10]"><template #default="{rows:pageRows}"><el-table :data="pageRows" row-key="key" highlight-current-row aria-label="目标航班列表" @row-click="selectFlight">
          <el-table-column label="选择" width="62"><template #default="{row}"><el-radio :model-value="flightKey" :value="row.key" :disabled="busy" :aria-label="'选择航班' + row.flight + row.date" @change="selectFlight(row)"><span /></el-radio></template></el-table-column>
          <el-table-column prop="flight" label="航班号" min-width="115" /><el-table-column prop="date" label="出港日期" min-width="120" /><el-table-column prop="airline" label="航司" min-width="120" />
          <el-table-column v-for="field in [{key:'boardCount',label:'板数'},{key:'totalVolume',label:'舱位总体积 (m³)'},{key:'allocatedVolume',label:'已配体积 (m³)'},{key:'allocatedGrossWeight',label:'已配毛重 (kg)'},{key:'allocatedPieces',label:'已配件数'}]" :key="field.key" :label="field.label" min-width="140" align="right"><template #default="{row}"><span :class="{'pallet-error':field.key === 'allocatedVolume' && row.totalVolume != null && row.allocatedVolume > row.totalVolume}">{{ row[field.key] == null ? '待确认' : row[field.key] }}</span></template></el-table-column>
          <el-table-column label="预计利润" min-width="270"><template #default="{row}">{{ row.profit.value == null ? row.profit.reason : row.profit.value + ' ' + row.profit.currency }}</template></el-table-column>
          <template #empty><el-empty description="查询期间没有本人绑定航班" /></template>
        </el-table></template></DataTableFrame>
      </section>
      <section class="pallet-section">
        <div class="pallet-heading"><h2>{{ target ? target.flight + ' · ' + target.date + ' 已配板订单' : '已配板订单' }}</h2><div><el-tooltip :content="unloadReason || '卸下选中的已配板记录'"><span><el-button v-business-write="'pallet'" :icon="Download" :disabled="!!unloadReason || busy || !!dialog" @click="confirmAction('unload')">卸下</el-button></span></el-tooltip><el-tooltip :content="reallocateReason || '卸下当前航班全部已配板记录'"><span><el-button v-business-write="'pallet'" :icon="RefreshLeft" :disabled="!!reallocateReason || busy || !!dialog" @click="confirmAction('reallocate')">重配</el-button></span></el-tooltip></div></div>
        <DataTableFrame :key="'allocated' + selectionVersion + flightKey" :rows="allocatedRows" :page-sizes="[10]"><template #default="{rows:pageRows}"><el-table :data="pageRows" row-key="id" aria-label="已配板订单" @selection-change="selectAllocated">
          <el-table-column type="selection" width="42" reserve-selection :selectable="() => !writeReason && !busy" />
          <el-table-column type="expand"><template #default="{row}"><div class="pallet-cargo-details"><el-descriptions :column="1" border><el-descriptions-item v-for="source in sourceLabels" :key="source.key" :label="source.label + '毛重 / 件数 / 体积'">{{ cargoText(row.cargoSources[source.key]) }}</el-descriptions-item><el-descriptions-item v-if="row.dimensions" label="托盘尺寸 (cm)">{{ row.dimensions }}</el-descriptions-item><el-descriptions-item v-if="row.specialCargo" label="特殊物品">{{ row.specialCargo }}</el-descriptions-item><el-descriptions-item label="配板来源">{{ row.cargoSource }}</el-descriptions-item></el-descriptions><p v-if="row.dimensionReason" class="pallet-reason">{{ row.dimensionReason }}</p></div></template></el-table-column>
          <el-table-column label="订单号" min-width="175"><template #default="{row}">{{ row.orderNo }}<el-tag v-if="row.isSplit" size="small" type="warning">分批</el-tag></template></el-table-column><el-table-column prop="waybillNo" label="提单号" min-width="145" /><el-table-column prop="customer" label="客户" min-width="145" />
          <el-table-column v-for="field in cargoFields" :key="field.key" :label="field.label" min-width="110" align="right"><template #default="{row}">{{ numericText(row.cargo?.[field.key]) }}</template></el-table-column>
          <el-table-column label="备注" min-width="180"><template #default="{row}"><el-button v-business-write="'pallet'" link type="primary" :aria-label="'配板备注' + row.id" @click="open('note',row)">{{ row.remark || '未填写备注' }}</el-button></template></el-table-column>
          <el-table-column label="操作" width="95" fixed="right"><template #default="{row}"><el-tooltip v-if="row.isSplit" :content="withdrawReason(row) || '取消分批并恢复原配板毛件体'"><span><el-button v-business-write="'pallet'" link type="primary" :disabled="!!withdrawReason(row) || busy" @click="confirmAction('withdraw',row)">撤回</el-button></span></el-tooltip><el-tooltip v-else :content="splitReason(row) || '拆出本订单的一部分毛件体'"><span><el-button v-business-write="'pallet'" link type="primary" :disabled="!!splitReason(row) || busy" @click="open('split',row)">分批</el-button></span></el-tooltip></template></el-table-column>
          <template #empty><el-empty :description="target ? '当前航班尚无已配板订单' : '请选择目标航班'" /></template>
        </el-table></template></DataTableFrame>
      </section>
    </template>
    <el-dialog :model-value="!!dialog" :title="dialog === 'split' ? '订单分批' : '配板备注'" width="min(680px, 96vw)" align-center destroy-on-close :close-on-click-modal="false" :before-close="close">
      <template v-if="editing"><p>{{ orderOf(editing)?.orderNo || editing.orderId }} · {{ editing.flight }} · {{ editing.date }}</p><el-alert v-if="failure" :title="failure" type="error" :closable="false" />
        <el-form v-if="dialog === 'split'" label-position="top" @submit.prevent="save"><p>当前配板：{{ cargoText(editing.cargo) }}（kg / 件 / m³）</p><div class="pallet-split-fields"><el-form-item v-for="field in cargoFields" :key="field.key" :label="'拆出' + field.label" required :error="splitErrors[field.key]"><el-input v-model="draft[field.key]" inputmode="decimal" :aria-label="'拆出' + field.name" :disabled="busy" /></el-form-item><el-form-item label="航班号" :error="splitErrors.flight" required><el-select v-model="draft.flight" filterable aria-label="分批航班号" :disabled="busy"><el-option v-for="flight in flights" :key="flight.id" :value="flight.code" /></el-select></el-form-item><el-form-item label="出港日期" required><el-date-picker v-model="draft.date" type="date" value-format="YYYY-MM-DD" aria-label="分批出港日期" :disabled="busy" /></el-form-item></div><el-form-item :error="splitErrors.confirmedInsufficient"><el-checkbox v-model="draft.confirmedInsufficient" :disabled="busy">确认本订单货物一批运不完</el-checkbox></el-form-item><p class="pallet-reason">跨航班或跨日期分批的订舱、提单及舱位联动规则待确认。</p></el-form>
        <el-input v-else v-model="draft.remark" type="textarea" :rows="5" aria-label="配板备注" :readonly="!canEditAirAllocationNote(editing,session)" :disabled="busy" />
      </template>
      <template #footer><el-button :disabled="busy" @click="close">{{ dialog === 'note' && !canEditAirAllocationNote(editing,session) ? '关闭' : '取消' }}</el-button><el-button v-business-write="'pallet'" v-if="dialog === 'split' || canEditAirAllocationNote(editing,session)" type="primary" :disabled="dialog === 'split' && Object.keys(splitErrors).length > 0" :loading="busy" @click="save">{{ dialog === 'split' ? '提交' : '保存' }}</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.pallet-filters { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 14px 16px; margin-block: 20px; }
.pallet-filters label { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: 13px; }
.pallet-filters :deep(.el-date-editor), .pallet-split-fields :deep(.el-date-editor) { width: 100%; }
.pallet-query { display: flex; align-items: flex-end; gap: 8px; }
.pallet-section { border-top: 1px solid var(--el-border-color-light); padding-block: 18px; min-width: 0; }
.pallet-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.pallet-heading h2 { margin: 0; font-size: 16px; }
.pallet-heading > span { color: var(--el-text-color-secondary); font-size: 13px; }
.pallet-heading > div { display: flex; gap: 8px; }
.pallet-reason { color: var(--el-text-color-secondary); font-size: 13px; margin-block: 8px; }
.pallet-error { color: var(--el-color-danger); }
.pallet-cargo-details { padding: 12px 20px; max-width: 720px; }
.pallet-split-fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 16px; }
.pallet-view :deep(.el-table .el-button.is-link) { white-space: normal; height: auto; overflow-wrap: anywhere; }
@media (max-width: 1100px) { .pallet-filters { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 760px) { .pallet-filters, .pallet-split-fields { grid-template-columns: minmax(0,1fr); } .pallet-cargo-details { padding-inline: 8px; } }
</style>
