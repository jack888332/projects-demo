<script setup>
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { createBookingDraft, validateBookingDraft, getBookingPermission, getBookingDecision, getBookingApproval, BOOKING_JOURNEY_FIELDS, AIR_PRODUCTS } from '../domain/airOperations.js'
import { getBookingAirlineFilter, getOrderBookingAirline, getBookingSourceChildren } from '../domain/airBookingPresentation.js'

const route = useRoute()
const router = useRouter()
const { state, bookingSession: session, airCatalog, saveAirBooking, approveAirBooking } = usePrototypeData()
const status = ref('')
const airlineFilter = computed(() => getBookingAirlineFilter(state.capacityProducts, state.airMaster, session.value))
const defaultFilters = () => ({ orderNo:'', waybillNo:'', customer:'', creator:'', owner:'', foamRatio:'', origin:'', destination:'', departureDate:[], createDate:[], flight:'', specialCargo:'', airline:[...airlineFilter.value.defaults] })
const filters = reactive(defaultFilters())
const textFilters = [{key:'orderNo',label:'订单号'},{key:'waybillNo',label:'提单号'},{key:'customer',label:'客户'},{key:'creator',label:'客服'},{key:'owner',label:'业务员'}]
const selectedId = ref('')
const visible = ref(false)
const busy = ref(false)
const draft = reactive({})
const initial = ref('')
const approvalReason = ref('')
let contextVersion = 0
const selected = computed(() => state.airOrders.find(order => order.id === selectedId.value))
const permission = computed(() => selected.value ? getBookingPermission(selected.value, session.value.role) : { journey: false, supplement: false, action: null })
const errors = computed(() => selected.value ? validateBookingDraft(draft, airCatalog.value) : {})
const decision = computed(() => selected.value ? getBookingDecision(selected.value, draft) : { kind: 'blocked', message: '' })
const approval = computed(() => getBookingApproval(selected.value))
const canApprove = computed(() => selected.value?.orderStatus === '待审核' && selected.value?.bookingStatus === '待审核' && approval.value.currentRole === session.value.role)
const sourceChildren = computed(() => getBookingSourceChildren(selected.value, state.airChildren))
const latestArrival = computed(() => sourceChildren.value.map(row => row.expectedArrival).filter(Boolean).sort().at(-1))
const dirty = computed(() => visible.value && (initial.value !== JSON.stringify(draft) || Boolean(approvalReason.value)))
const identity = computed(() => `${session.value.role}:${session.value.name}`)
const canView = order => session.value.role !== 'service' || order.creator === session.value.name
const airlines = computed(() => state.airMaster.airlines.map(airline => airline.name))
const flights = computed(() => airCatalog.value.flights.filter(f => f.airline === draft.airline))
const stageOrder = ['待审核', '待订舱', '待补录', '待出提单', '已出提单', '已交单', '已作废']
const inRange = (value, range) => !range?.length || (value && value >= range[0] && value <= range[1])
const rows = computed(() => state.airOrders.filter(order => {
  const match = textFilters.every(({key}) => !filters[key] || String(order[key] || '').toLowerCase().includes(filters[key].trim().toLowerCase()))
  return canView(order) && match && (!status.value || order.bookingStatus === status.value)
    && (filters.foamRatio === '' || filters.foamRatio == null || order.foamRatio === filters.foamRatio)
    && ['origin','destination','flight'].every(key => !filters[key] || order[key] === filters[key])
    && (!filters.specialCargo || (order.sourceSpecialCargo || [order.specialCargo]).includes(filters.specialCargo))
    && (!filters.airline.length || filters.airline.includes(getOrderBookingAirline(order)))
    && inRange(order.departureDate,filters.departureDate) && inRange(order.createDate,filters.createDate)
}).slice().sort((a, b) => stageOrder.indexOf(a.orderStatus) - stageOrder.indexOf(b.orderStatus) || (a.createdAt || a.createDate || '').localeCompare(b.createdAt || b.createDate || '') || a.id.localeCompare(b.id)))
function display(value) { return value === '' || value == null ? '未填写' : value }
function resetFilters() { Object.assign(filters, defaultFilters()); status.value = '' }

const fields = computed(() => [
  { key: 'airline', label: '航司', type: 'airline', required: true },
  { key: 'flight', label: '头程航班', type: 'flight', required: true },
  { key: 'departureDate', label: '出港日期', type: 'date', required: true },
  { key: 'firstDestination', label: '头程目的地', type: 'port', required: true },
  { key: 'firstLeg', label: '头程航段', type: 'enum', options: airCatalog.value.legs, required: true },
  { key: 'takeoffTime', label: '起飞时刻', type: 'time', required: true },
  { key: 'cutoffTime', label: '截单时刻', type: 'time', required: true },
  { key: 'airCost', label: '空运成本', type: 'number', required: true },
  { key: 'truckCost', label: '卡车成本', type: 'number' },
  { key: 'guidePrice', label: '指导价', type: 'number', required: true },
  { key: 'waybillType', label: '提单属性', type: 'enum', options: ['自营', '非自营'], required: true },
  { key: 'secondLeg', label: '二程航段', type: 'enum', options: airCatalog.value.legs },
  { key: 'secondDestination', label: '二程目的地', type: 'port', required: true },
  { key: 'thirdLeg', label: '三程航段', type: 'enum', options: airCatalog.value.legs, required: true },
  { key: 'palletCompany', label: '打板公司', type: 'enum', options: ['MH 翡翠打板', 'JL 航晟打板', 'CZ 航晟打板', 'BR 货站打板', 'MU 货站打板', '3U 货站打板'] },
  { key: 'discountNo', label: '航司折扣号', max: 30 },
  { key: 'handlingInfo', label: 'Handling Information', max: 256, multiline: true },
  { key: 'routeType', label: '航线类型', type: 'enum', options: ['直航', '国内中转'] },
  { key: 'remark', label: '航线备注', max: 256, multiline: true },
])
const fieldGroups = computed(() => [
  { title: '航程信息', items: fields.value.filter(f => BOOKING_JOURNEY_FIELDS.includes(f.key)) },
  { title: '航程补充', items: fields.value.filter(f => !BOOKING_JOURNEY_FIELDS.includes(f.key)) },
])
function fieldDisabled(key) {
  if (busy.value) return true
  if (key === 'waybillType' && selected.value?.bookingStatus !== '待服务') return true
  return BOOKING_JOURNEY_FIELDS.includes(key) ? !permission.value.journey : !permission.value.supplement
}
function onAirlineChange() {
  for (const key of ['flight', 'firstLeg', 'firstDestination', 'takeoffTime', 'cutoffTime', 'secondLeg', 'secondDestination', 'thirdLeg', 'palletCompany']) draft[key] = ''
}
function onFlightChange() {
  const flight = airCatalog.value.flights.find(f => f.code === draft.flight && f.airline === draft.airline)
  if (!flight) return
  Object.assign(draft, { firstDestination: flight.destination, firstLeg: flight.firstLeg, takeoffTime: flight.takeoffTime, cutoffTime: flight.cutoffTime, secondLeg: flight.secondLeg || '', secondDestination: flight.secondDestination || '', thirdLeg: flight.thirdLeg || '', palletCompany: flight.palletCompany || '' })
}
function hydrate(order) {
  contextVersion += 1
  selectedId.value = order.id
  for (const key of Object.keys(draft)) delete draft[key]
  Object.assign(draft, createBookingDraft(order))
  initial.value = JSON.stringify(draft)
  approvalReason.value = ''
  visible.value = true
}
async function open(order) {
  if (busy.value || !canView(order) || !await allowDiscard()) return
  hydrate(order)
}
async function allowDiscard() {
  if (busy.value) return false
  if (!dirty.value) return true
  const version = contextVersion
  busy.value = true
  try { await ElMessageBox.confirm('航程修改尚未保存，离开将丢弃本次输入。', '放弃未保存的订舱信息？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return version === contextVersion }
  catch { return false }
  finally { busy.value = false }
}
async function close(done) {
  if (!await allowDiscard()) return
  visible.value = false
  if (typeof done === 'function') done()
}
onBeforeRouteLeave(async () => allowDiscard())
onBeforeRouteUpdate(async (to, from) => to.query.order === from.query.order || allowDiscard())
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
watch(() => route.query.order, id => {
  if (!id) { visible.value = false; return }
  const order = state.airOrders.find(item => item.id === id && canView(item))
  if (order) hydrate(order)
  else ElMessage.warning('当前角色无法查看该订舱订单。')
}, { immediate: true })
watch(identity, () => {
  contextVersion += 1
  filters.airline = [...airlineFilter.value.defaults]
  if (!selected.value || !visible.value) return
  if (!canView(selected.value)) { visible.value = false; return }
  hydrate(selected.value)
})
watch(selected, (order, previous) => {
  if (order === previous) return
  contextVersion += 1
  if (!order) visible.value = false
  else if (visible.value) hydrate(order)
})
const actionLabel = computed(() => ({ confirm: '确认航班', complete: '订舱完成', save: '保存' })[permission.value.action] || '')
const blocked = computed(() => !actionLabel.value || Object.keys(errors.value).length > 0 || ['blocked', 'unconfirmed', 'unknown'].includes(decision.value.kind))
async function submit() {
  if (busy.value || blocked.value) return
  const source = selected.value, version = contextVersion, actor = identity.value
  const payload = JSON.parse(JSON.stringify(draft)), reason = approvalReason.value
  busy.value = true
  try {
    let confirmedApproval = false
    if (decision.value.kind === 'approval') {
      await ElMessageBox.confirm(decision.value.message, '提交亏损审核', { confirmButtonText: '提交审核', cancelButtonText: '返回修改', type: 'warning' })
      confirmedApproval = true
    }
    if (version !== contextVersion || actor !== identity.value || source !== selected.value) return
    saveAirBooking(source.id, payload, { role: session.value.role, confirmedApproval, approvalReason: reason })
    initial.value = JSON.stringify(draft)
    approvalReason.value = ''
    visible.value = false
    ElMessage.success(confirmedApproval ? '已提交航线总监审核' : '已提交成功！订舱信息已同步至主订单。')
  } catch (error) { if (error instanceof Error) ElMessage.error(error.message) }
  finally { busy.value = false }
}
async function approve() {
  if (busy.value || !canApprove.value) return
  const source = selected.value, version = contextVersion, actor = identity.value
  busy.value = true
  try {
    await ElMessageBox.confirm('确认通过当前审批节点？后续仍有审批时将流转至下一审批人。', approval.value.currentLabel + '审核', { confirmButtonText: '审核通过', cancelButtonText: '取消', type: 'warning' })
    if (version !== contextVersion || actor !== identity.value || source !== selected.value || !canApprove.value) return
    approveAirBooking(source.id)
    initial.value = JSON.stringify(draft)
    visible.value = false
    ElMessage.success(source.orderStatus === '待补录' ? '审核通过，主订单已进入待补录' : `当前节点已通过，等待${getBookingApproval(source).currentLabel}`)
  } catch (error) { if (error instanceof Error) ElMessage.error(error.message) }
  finally { busy.value = false }
}
function backToOrder() { if (selected.value) router.push({ path: '/fulfillment/air-orders', query: { order: selected.value.id } }) }
</script>

<template>
  <div class="module-view">
    <PageHeader title="订舱管理" description="航线运营确认航班，航线操作完成订舱，结果同步客服主订单" />
    <div class="booking-filters">
      <label v-for="field in textFilters" :key="field.key">{{ field.label }}<el-input v-model="filters[field.key]" :prefix-icon="Search" clearable :aria-label="'订舱筛选'+field.label" placeholder="模糊查询" /></label>
      <label>分泡比例<el-select v-model="filters.foamRatio" clearable placeholder="全部" aria-label="订舱分泡比例"><el-option v-for="n in 11" :key="n" :value="(n-1)/10" :label="String((n-1)/10)" /></el-select></label>
      <label v-for="field in [{key:'origin',label:'始发港'},{key:'destination',label:'目的港'}]" :key="field.key">{{ field.label }}<el-select v-model="filters[field.key]" clearable placeholder="全部" :aria-label="'订舱筛选'+field.label"><el-option v-for="port in airCatalog.ports" :key="port.code" :value="port.code" :label="port.code+' · '+port.name" /></el-select></label>
      <label class="date-range" v-for="field in [{key:'departureDate',label:'出港日期'},{key:'createDate',label:'建单日期'}]" :key="field.key">{{ field.label }}<el-date-picker v-model="filters[field.key]" type="daterange" value-format="YYYY-MM-DD" :aria-label="'订舱筛选'+field.label" start-placeholder="开始日期" end-placeholder="结束日期" /></label>
      <label>航班号<el-select v-model="filters.flight" clearable placeholder="精确查询" aria-label="订舱航班号"><el-option v-for="f in airCatalog.flights" :key="f.code" :value="f.code" /></el-select></label>
      <label>特殊货物<el-select v-model="filters.specialCargo" clearable placeholder="全部" aria-label="订舱特殊货物"><el-option v-for="value in ['锂电池','危险品','鲜活','枪械']" :key="value" :value="value" /></el-select></label>
      <label>航司<el-select v-model="filters.airline" multiple collapse-tags collapse-tags-tooltip clearable placeholder="全部" aria-label="订舱航司筛选"><el-option v-for="value in airlineFilter.options" :key="value" :value="value" /></el-select></label>
      <label>订舱服务状态<el-select v-model="status" clearable placeholder="全部" aria-label="订舱服务状态"><el-option v-for="s in ['待服务','服务中','待审核','服务已完成']" :key="s" :value="s" /></el-select></label>
      <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
    </div>
    <p class="booking-caveat">航司候选来自舱位产品，运营和操作默认选中本人绑定航司；清空可查看全部。日期默认不限。</p>
    <DataTableFrame :rows="rows" :page-size="10">
      <template #default="{ rows: pageRows }"><el-table :data="pageRows" stripe row-key="id" aria-label="订舱订单列表" empty-text="无符合条件的订舱订单" @row-dblclick="open">
        <el-table-column prop="orderNo" label="订单号" width="185" fixed="left"><template #default="{ row }"><button class="link-button" @click="open(row)">{{ row.orderNo }}</button></template></el-table-column>
        <el-table-column prop="customer" label="客户" min-width="145" />
        <el-table-column prop="waybillNo" label="提单号" width="155" />
        <el-table-column label="订单类型" width="125"><template #default="{ row }">{{ display(row.orderType) }}</template></el-table-column>
        <el-table-column prop="route" label="航线" width="130" />
        <el-table-column prop="flight" label="头程航班" width="110" />
        <el-table-column prop="departureDate" label="出港日期" width="125" />
        <el-table-column label="订单状态" width="110"><template #default="{ row }"><StatusTag :label="row.orderStatus" /></template></el-table-column>
        <el-table-column label="订舱服务" width="120"><template #default="{ row }"><StatusTag :label="row.bookingStatus" /></template></el-table-column>
        <el-table-column prop="sellRate" label="运费卖价" width="100" align="right" />
        <el-table-column label="预计毛件体" min-width="200"><template #default="{ row }">{{ row.pieces }} 件 / {{ row.grossWeight }} kg / {{ row.volume }} m³</template></el-table-column>
        <el-table-column prop="creator" label="客服" width="90" />
        <el-table-column prop="owner" label="业务员" width="100" />
        <el-table-column prop="createdAt" label="创建时间" width="170" />
        <el-table-column label="操作" fixed="right" width="100"><template #default="{ row }"><el-button link type="primary" @click="open(row)">查看 / 处理</el-button></template></el-table-column>
      </el-table></template>
    </DataTableFrame>
    <el-dialog v-model="visible" title="订舱处理" width="min(980px, 96vw)" class="air-booking-dialog" align-center destroy-on-close :before-close="close" :close-on-click-modal="false">
      <template v-if="selected">
        <div class="detail-hero"><div><small>{{ selected.orderNo }}</small><h2>{{ selected.route }}</h2><span>{{ selected.customer }} · {{ selected.pieces }} 件 / {{ selected.grossWeight }} kg / {{ selected.volume }} m³</span></div><div><StatusTag :label="selected.bookingStatus" /></div></div>
        <section class="booking-group" aria-label="订舱来源信息"><h3>订舱来源信息</h3>
          <dl class="booking-summary">
            <div><dt>订单类型</dt><dd>{{ display(selected.orderType) }}</dd></div>
            <div><dt>主订单状态</dt><dd><StatusTag :label="selected.orderStatus" /></dd></div>
            <div><dt>提单号</dt><dd>{{ display(selected.waybillNo) }}</dd></div>
            <div><dt>客户</dt><dd>{{ (selected.sourceCustomers || [selected.customer]).join('、') }}</dd></div>
            <div><dt>始发港 / 目的港</dt><dd>{{ selected.origin }} / {{ selected.destination }}</dd></div>
            <div><dt>航司产品</dt><dd>{{ AIR_PRODUCTS.find(row => row.id === selected.product)?.label || display(selected.product) }}</dd></div>
            <div><dt>特殊货物</dt><dd>{{ (selected.sourceSpecialCargo || [selected.specialCargo]).filter(Boolean).join('、') || '无' }}</dd></div>
            <div><dt>后段卡车卖价</dt><dd>{{ display(selected.truckSellRate) }}</dd></div>
            <div><dt>订舱要求</dt><dd>{{ display(selected.bookingRequirement) }}</dd></div>
            <div><dt>客服 / 业务员</dt><dd>{{ display(selected.creator) }} / {{ display(selected.owner) }}</dd></div>
            <div v-if="selected.orderType !== '合成主订单'"><dt>中文品名</dt><dd>{{ display(selected.goodsName) }}</dd></div>
            <div><dt>{{ selected.orderType === '合成主订单' ? '最晚期望到货时间' : '期望到货时间' }}</dt><dd>{{ display(selected.orderType === '合成主订单' ? latestArrival : selected.expectedArrival) }}</dd></div>
            <div v-if="selected.orderType === '合成主订单'"><dt>预计送货时间</dt><dd>来源待确认</dd></div>
          </dl>
          <template v-if="selected.orderType === '合成主订单'">
            <el-table :data="sourceChildren" aria-label="合成来源子订单" empty-text="暂无来源子订单信息">
              <el-table-column prop="orderNo" label="子订单号" min-width="175" />
              <el-table-column prop="customer" label="客户" min-width="140" />
              <el-table-column label="中文品名" min-width="230"><template #default="{ row }"><details v-if="row.fullGoodsName" class="goods-names"><summary :title="row.fullGoodsName">{{ row.shortGoodsName }}</summary><p>{{ row.fullGoodsName }}</p></details><span v-else>未填写</span></template></el-table-column>
              <el-table-column prop="specialCargo" label="特殊货物" width="110" />
              <el-table-column label="预报毛件体" min-width="190"><template #default="{ row }">{{ row.pieces }} 件 / {{ row.grossWeight }} kg / {{ row.volume }} m³</template></el-table-column>
              <el-table-column prop="sellRate" label="运费卖价" width="100" />
              <el-table-column prop="truckSellRate" label="卡车卖价" width="100" />
              <el-table-column prop="foamRatio" label="分泡比例" width="100" />
            </el-table>
            <p class="booking-caveat">显示合成时保存的货量与加权报价；“期望到货时间”不代替尚未明确来源的“送货时间”。</p>
          </template>
        </section>
        <el-alert v-if="permission.reason" :title="permission.reason" type="info" :closable="false" class="booking-notice" />
        <el-alert v-if="selected.approval?.serviceStatePending" title="亏损审核已通过，主订单为待补录；订舱服务的后续状态待确认，暂保留待审核。" type="warning" :closable="false" class="booking-notice" />
        <section v-if="selected.approval" class="booking-group" aria-label="亏损审批进度"><h3>亏损审批进度</h3>
          <p>亏损额：{{ display(approval.lossAmount) }} 元 · 申请理由：{{ display(approval.reason) }}</p>
          <ol class="approval-stages"><li v-for="stage in approval.stages" :key="stage.role">{{ stage.label }} · {{ stage.status }}<span v-if="stage.actor"> · {{ stage.actor }} {{ stage.decidedAt }}</span></li></ol>
          <el-alert v-if="approval.blockedReason" :title="approval.blockedReason" type="warning" :closable="false" />
          <p class="booking-caveat">拒绝后的单据状态与重提规则待确认，暂不开放拒绝操作。</p>
        </section>
        <el-form :model="draft" label-position="top" @submit.prevent="submit">
          <section v-for="group in fieldGroups" :key="group.title" class="booking-group">
            <h3>{{ group.title }}</h3>
            <div class="booking-grid">
              <el-form-item v-for="field in group.items" :key="field.key" :label="field.label" :required="field.required" :error="fieldDisabled(field.key) ? '' : errors[field.key]">
                <el-select v-if="field.type === 'airline'" v-model="draft[field.key]" :aria-label="field.label" :disabled="fieldDisabled(field.key)" placeholder="请选择航司" @change="onAirlineChange"><el-option v-for="a in airlines" :key="a" :value="a" /></el-select>
                <el-select v-else-if="field.type === 'flight'" v-model="draft[field.key]" :aria-label="field.label" :disabled="fieldDisabled(field.key)" placeholder="请选择关联航班" @change="onFlightChange"><el-option v-for="f in flights" :key="f.code" :label="f.code" :value="f.code" /></el-select>
                <el-select v-else-if="field.type === 'port'" v-model="draft[field.key]" :aria-label="field.label" :disabled="fieldDisabled(field.key)" filterable><el-option v-for="p in airCatalog.ports" :key="p.code" :label="p.code + ' · ' + p.name" :value="p.code" /></el-select>
                <el-select v-else-if="field.type === 'enum'" v-model="draft[field.key]" :aria-label="field.label" :disabled="fieldDisabled(field.key)"><el-option v-for="v in field.options" :key="v" :value="v" /></el-select>
                <el-date-picker v-else-if="field.type === 'date'" v-model="draft[field.key]" :aria-label="field.label" :disabled="fieldDisabled(field.key)" value-format="YYYY-MM-DD" />
                <el-time-picker v-else-if="field.type === 'time'" v-model="draft[field.key]" :aria-label="field.label" :disabled="fieldDisabled(field.key)" format="HH:mm" value-format="HH:mm" />
                <el-input-number v-else-if="field.type === 'number'" v-model="draft[field.key]" :aria-label="field.label" :disabled="fieldDisabled(field.key)" :min="0.01" :precision="2" controls-position="right" />
                <el-input v-else v-model="draft[field.key]" :aria-label="field.label" :readonly="fieldDisabled(field.key)" :maxlength="field.max" :type="field.multiline ? 'textarea' : 'text'" :rows="2" />
              </el-form-item>
            </div>
          </section>
          <section class="booking-group"><h3>盈利校验</h3>
            <div class="booking-profit"><span>运费卖价 <strong>{{ display(selected.sellRate) }}</strong></span><span>预计计费重 <strong>{{ display(selected.chargeWeight) }} kg</strong></span></div>
            <p v-if="decision.lossAmount > 0">预计亏损额：{{ decision.lossAmount.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) }} 元</p>
            <el-form-item label="预计盈利规则" required :error="permission.journey ? errors.profitRules : ''"><el-checkbox-group v-model="draft.profitRules" :disabled="!permission.journey || busy"><el-checkbox v-for="v in ['大于等于','小于等于','大于','小于']" :key="v" :value="v">{{ v }}</el-checkbox></el-checkbox-group></el-form-item>
            <el-checkbox v-model="draft.allowLoss" :disabled="!permission.journey || busy">允许亏损</el-checkbox>
            <el-form-item v-if="decision.kind === 'approval' && permission.action" label="亏损申请理由"><el-input v-model="approvalReason" aria-label="亏损申请理由" type="textarea" :disabled="busy" placeholder="填写本次亏损申请的说明（选填）" /></el-form-item>
            <el-alert v-if="permission.action" :title="decision.message || '空运成本未超过运费卖价，无需亏损审批。'" :type="['blocked','unconfirmed','approval'].includes(decision.kind) ? 'warning' : 'info'" :closable="false" show-icon class="booking-notice" />
            <details class="booking-caveat"><summary>查看当前未覆盖规则</summary><p>实际毛件体允许区间尚未定义，未执行入仓区间校验及标红预警；直航仍按现有字段表校验二程目的地与三程航段。待出提单订单重新订舱的补录处理仍待确认，当前保留主订单与补录结果。</p></details>
          </section>
        </el-form>
      </template>
      <template #footer>
        <div class="booking-footer"><el-button @click="backToOrder">查看主订单</el-button><span /><el-button @click="close">取消</el-button>
          <el-button v-if="canApprove" type="primary" :loading="busy" @click="approve">审核通过</el-button>
          <el-button v-else-if="actionLabel" type="primary" :loading="busy" :disabled="blocked" @click="submit">{{ decision.kind === 'approval' ? '提交航线总监审核' : actionLabel }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.booking-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 16px; }
.booking-filters label { width: 200px; display: flex; flex-direction: column; gap: 8px; color: var(--muted); }
.booking-filters label:first-child { width: 280px; }
.booking-filters label.date-range { width: 320px; }
.booking-filters :deep(.el-date-editor) { width: 100%; }
.booking-group { margin-top: 24px; }
.booking-group h3 { font-size: 15px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
.booking-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); column-gap: 20px; }
.booking-grid :deep(.el-input-number), .booking-grid :deep(.el-date-editor), .booking-grid :deep(.el-select) { width: 100%; }
.booking-notice { margin-top: 12px; }
.booking-profit { display: flex; gap: 24px; margin: 16px 0; }
.booking-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 16px 24px; }
.booking-summary dt { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.booking-summary dd { margin: 0; overflow-wrap: anywhere; }
.goods-names summary, .booking-caveat summary { cursor: pointer; }
.goods-names p { white-space: normal; overflow-wrap: anywhere; }
.approval-stages { line-height: 2; padding-left: 22px; }
.booking-caveat details, details.booking-caveat { margin-top: 12px; }
.booking-caveat { font-size: 12px; line-height: 1.7; color: var(--muted); }
.booking-footer { display: flex; flex-wrap: wrap; gap: 8px; }
.booking-footer > span { flex: 1; }
@media (max-width: 600px) {
  .booking-filters label, .booking-filters label:first-child, .booking-filters label.date-range { width: 100%; min-width: 0; }
  .booking-profit { flex-wrap: wrap; gap: 12px; }
}
</style>
