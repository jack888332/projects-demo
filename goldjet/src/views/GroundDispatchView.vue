<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import GroundOrderEditor from '../components/GroundOrderEditor.vue'
import GroundRelatedOrders from '../components/GroundRelatedOrders.vue'
import { Plus } from '@element-plus/icons-vue'
import { groundOrderPermissions, potentialGroundOrders, groundChangeText } from '../domain/groundOrders.js'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { GROUND_VEHICLES, GROUND_SUPPLIERS, createDispatchDraft, getGroundQuotes, validateDispatchDraft, validateBatchGroundOrders } from '../domain/groundOperations.js'

const router = useRouter()
const route = useRoute()
const { state, groundSession, dispatchGroundOrders, closeGroundOrder, modifyGroundDispatch } = usePrototypeData()
const editor = ref()
const detailTab = ref('order'), orderExpanded = ref(true), modifyingBillId = ref('')
const access = order => groundOrderPermissions(order, groundSession.role)
const canDispatch = computed(() => ['hangsheng', 'supervisor'].includes(groundSession.role))
const listKind = ref(route.query.tab === 'transfer' ? 'transfer' : 'transport')
const defaults = () => ({ keyword:'', searchKey:'orderNo', orderType:'', customer:'', pickup:'', delivery:'', status:listKind.value === 'transfer' ? '' : '未调度', createdDate:'', pickupDate:'' })
const filters = reactive(defaults())
const sort = reactive({ prop:'', order:'' })
const selectedIds = ref([])
const table = ref()
const visible = ref(false)
const targetIds = ref([])
const drafts = ref([])
const expanded = ref([])
const initial = ref('')
const busy = ref(false)
const specialConfirmed = ref(false)
const detailId = ref('')
const detailVisible = ref(false)
const routeError = ref('')
const selected = computed(() => state.groundOrders.find(order => order.id === detailId.value))
const bills = computed(() => state.groundWaybills.filter(bill => bill.orderId === detailId.value).slice().sort((a,b) => (a.dispatchUpdatedAt || a.createdAt).localeCompare(b.dispatchUpdatedAt || b.createdAt)))
const orderCosts = computed(() => state.costs.filter(cost => cost.groundOrderId === selected.value?.id || bills.value.some(bill => bill.id === cost.waybillId)))
const targets = computed(() => state.groundOrders.filter(order => targetIds.value.includes(order.id)))
const region = (order, key) => [...new Set((order[key + 'Points'] || []).map(p => p.province + ' / ' + p.city))].join('; ')
const listOrders = computed(() => state.groundOrders.filter(order => (order.orderType === '中转订单') === (listKind.value === 'transfer')))
const customerName = order => order.source === '航晟手工创建' ? order.customer : '高捷物流集团-空运事业部'
const showOrderType = computed(() => Boolean(state.groundUpsPartnerId) && state.partners.some(partner => partner.id === state.groundUpsPartnerId && partner.name === filters.customer))
const places = key => [...new Set(listOrders.value.map(order => region(order, key)))]
const rows = computed(() => listOrders.value.filter(order =>
  (!filters.keyword || order[filters.searchKey] === filters.keyword.trim()) &&
  (!filters.customer || customerName(order) === filters.customer) &&
  (!showOrderType.value || !filters.orderType || order.orderType === filters.orderType) &&
  (!filters.status || order.dispatchStatus === filters.status) &&
  (!filters.pickup || region(order,'pickup') === filters.pickup) &&
  (!filters.delivery || region(order,'delivery') === filters.delivery) &&
  (!filters.createdDate || order.createdAt?.startsWith(filters.createdDate)) &&
  (!filters.pickupDate || order.pickupTime?.startsWith(filters.pickupDate))
).slice().sort((a,b) => {
  if (sort.prop && sort.order) {
    const numeric = ['pieces','weight','volume'].includes(sort.prop)
    const left = sort.prop === 'customer' ? customerName(a) : a[sort.prop]
    const right = sort.prop === 'customer' ? customerName(b) : b[sort.prop]
    const compare = numeric && Number.isFinite(Number(left)) && Number.isFinite(Number(right)) ? Number(left) - Number(right) : String(left ?? '').localeCompare(String(right ?? ''),'zh-CN')
    return sort.order === 'ascending' ? compare : -compare
  }
  if (listKind.value === 'transfer') return (a.dispatchStatus !== '未调度') - (b.dispatchStatus !== '未调度') || b.createdAt.localeCompare(a.createdAt)
  return (a.dispatchStatus !== '未调度') - (b.dispatchStatus !== '未调度') ||
    (a.dispatchStatus === '未调度' ? a.pickupTime.localeCompare(b.pickupTime) : b.updatedAt.localeCompare(a.updatedAt))
}))
const errors = computed(() => drafts.value.map(validateDispatchDraft))
const invalid = computed(() => !drafts.value.length || errors.value.some(e => Object.keys(e).length))
const columns = [
  ['childNo','子单号',120],['batchNo','批次号',120],['customer','委托方',150],
  ['pieces','件数（件）',110],['weight','重量（kg）',125],['volume','体积（m³）',125],
  ['pickup','提货点',220],['delivery','卸货点',220],['pickupTime','提货时间',165],['deliveryTime','送货时间',165],
]
const moreFields = [
  ['companyAddress','公司地址',200],['customsNo','海关编号',100],['vehicleWeight','车自重（kg）',10],
  ['containerNo','柜号',99],['frameWeight','架重（kg）',10],['containerWeight','柜重（kg）',10],['customerPassword','客户密码',40],
]
const specificFields = [['specificPieces','件数（件）',0],['specificVolume','体积（m³）',2],['specificWeight','重量（kg）',2],['specificLength','长度（cm）',0],['specificWidth','宽度（cm）',0],['specificHeight','高度（cm）',0]]
function quotes(draft) { return targets.value.length ? getGroundQuotes(targets.value[0], draft.vehicleType) : [] }
function vehicleChanged(draft) { const quote = quotes(draft)[0]; draft.supplier = quote?.name || ''; supplierChanged(draft) }
function supplierChanged(draft) {
  draft.cost = quotes(draft).find(q => q.name === draft.supplier)?.cost ?? null
  draft.companyAddress = GROUND_SUPPLIERS.find(s => s.name === draft.supplier)?.address || ''
}
function suggestPlates(query, callback) { callback((state.groundPlateHistory || []).filter(p => p.plate.includes(query)).map(p => ({value:p.plate, record:p}))) }
function choosePlate(draft, item, index) {
  const p = item.record
  for (const key of ['drivers', ...moreFields.map(f => f[0])]) draft[key] = JSON.parse(JSON.stringify(p[key] ?? createDispatchDraft()[key]))
  expanded.value[index] = moreFields.some(([key]) => draft[key] !== '' && draft[key] != null)
}
function addVehicle() { drafts.value.push(createDispatchDraft()); expanded.value.push(false) }
function openDetail(order, tab = 'order') { detailId.value = order.id; detailTab.value = tab; orderExpanded.value = true; detailVisible.value = true }
async function openRelated(order) {
  if (!await allowDiscard()) return
  visible.value = false; openDetail(order)
}
function switchList(value) { router.replace({ path: '/fulfillment/ground-dispatch', query: value === 'transfer' ? { tab: 'transfer' } : {} }) }
watch(() => route.query.tab, value => { listKind.value = value === 'transfer' ? 'transfer' : 'transport'; Object.assign(filters, defaults()); selectedIds.value = []; table.value?.clearSelection() })
watch(showOrderType, value => { if (!value) filters.orderType = '' })
function editOrder(order) { detailVisible.value = false; editor.value.open(order) }
function savedOrder(order) { filters.status = ''; filters.keyword = order.orderNo; openDetail(order) }
async function closeOrder(order) {
  try { await ElMessageBox.confirm('关闭后不可再编辑，未调度订单不产生费用。', '关闭订单', { confirmButtonText: '关闭订单', cancelButtonText: '取消', type: 'warning' }); closeGroundOrder(order.id); ElMessage.success('订单已关闭') } catch (error) { if (error instanceof Error) ElMessage.error(error.message) }
}
async function showAll() {
  if (!await router.replace('/fulfillment/ground-dispatch')) Object.assign(filters, defaults(), { status: '' })
}
function toBills(order) { router.push({path:'/fulfillment/ground-waybills',query:{order:order.id}}) }
async function openDispatch(order) {
  if (!canDispatch.value) return ElMessage.warning('请切换为航晟客服或主管后调度。')
  const ids = order ? [order.id] : selectedIds.value
  const check = validateBatchGroundOrders(state.groundOrders.filter(o => ids.includes(o.id)))
  if (!check.ok) return ElMessage.warning(check.message)
  specialConfirmed.value = false
  if (check.specialConfirmationRequired) {
    try { await ElMessageBox.confirm(check.message,'批量调度',{confirmButtonText:'继续批量调度',cancelButtonText:'取消',type:'warning'}); specialConfirmed.value = true }
    catch { return }
  }
  targetIds.value = [...ids]; drafts.value = []; expanded.value = []; addVehicle()
  modifyingBillId.value = ''
  initial.value = JSON.stringify(drafts.value); visible.value = true
}
function canModify(bill) {
  return canDispatch.value && selected.value?.source === '航晟手工创建' && selected.value?.dispatchStatus === '已调度' && bill.status === '待提货' && bill.exceptionStatus !== '异常中'
}
function openModify(bill) {
  if (!canModify(bill)) return
  targetIds.value = [bill.orderId]; modifyingBillId.value = bill.id
  drafts.value = [Object.fromEntries(Object.keys(createDispatchDraft()).map(key => [key, JSON.parse(JSON.stringify(bill[key] ?? createDispatchDraft()[key]))]))]
  expanded.value = [true]; initial.value = JSON.stringify(drafts.value); detailVisible.value = false; visible.value = true
}
async function allowDiscard() {
  if (busy.value) return false
  if (!visible.value || initial.value === JSON.stringify(drafts.value)) return true
  try { await ElMessageBox.confirm('车辆和司机信息尚未提交，离开将丢弃本次输入。','放弃调度？',{confirmButtonText:'放弃输入',cancelButtonText:'继续编辑',type:'warning'}); return true }
  catch { return false }
}
async function close(done) { if (busy.value || !await allowDiscard()) return; visible.value = false; if (typeof done === 'function') done() }
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(async () => {
  if (!await allowDiscard()) return false
  visible.value = false
  return true
})
watch(() => groundSession.role, () => { visible.value = false })
watch(() => [route.query.order, route.query.action], async ([id, action]) => {
  routeError.value = ''
  detailVisible.value = false
  detailId.value = ''
  if (!id) return
  const matches = state.groundOrders.filter(item => item.id === id || item.orderNo === id)
  if (matches.length > 1) {
    Object.assign(filters, defaults(), {status:'',keyword:id})
    routeError.value = '该单号对应多笔订单，请从列表选择具体订单。'
    return
  }
  const order = matches[0]
  if (!order) {
    routeError.value = '未找到对应运输订单，请返回来源页面重新选择或查看全部订单。'
    return
  }
  listKind.value = order.orderType === '中转订单' ? 'transfer' : 'transport'
  Object.assign(filters, defaults(), { status: '', keyword: order.orderNo })
  if (action === 'dispatch' && order.dispatchStatus === '未调度') await openDispatch(order)
  else openDetail(order)
}, { immediate: true })
watch(selected, order => {
  if (order) return
  detailVisible.value = false
  if (detailId.value && route.query.order) routeError.value = '未找到对应运输订单，请返回来源页面重新选择或查看全部订单。'
})
function submit() {
  if (invalid.value || busy.value) return
  busy.value = true
  try {
    const result = modifyingBillId.value ? [modifyGroundDispatch(modifyingBillId.value, JSON.parse(JSON.stringify(drafts.value[0])))] : dispatchGroundOrders(targetIds.value, JSON.parse(JSON.stringify(drafts.value)), {specialConfirmed:specialConfirmed.value})
    visible.value = false; selectedIds.value = []; table.value?.clearSelection(); filters.status = ''
    openDetail(targets.value[0], 'dispatch'); ElMessage.success(modifyingBillId.value ? '调度已修改，保留原运单。' : '调度提交成功！已生成 ' + result.length + ' 张独立运输运单。')
  } catch (error) { ElMessage.error(error.message) }
  finally { busy.value = false }
}
</script>

<template>
  <div class="module-view">
    <PageHeader title="用车订单" description="航晟物流 · 订单管理">
      <template #actions><el-button v-if="groundSession.role === 'transportSupervisor'" @click="router.push('/fulfillment/ground-monthly')">陆运月报</el-button><el-button v-if="access().create && listKind === 'transport'" :icon="Plus" type="primary" @click="editor.open()">新建订单</el-button><el-button :disabled="!canDispatch || !selectedIds.length" @click="openDispatch()">批量调度</el-button></template>
    </PageHeader>
    <el-tabs :model-value="listKind" @update:model-value="switchList"><el-tab-pane label="运输订单" name="transport" /><el-tab-pane label="中转订单" name="transfer" /></el-tabs>
    <el-alert class="ground-notice" title="取消调度、已调度关闭及费用结算待确认；外部接口和通知未连接。" type="info" :closable="false" />
    <el-alert v-if="!canDispatch" class="ground-notice" title="当前角色只读，请从顶部切换为航晟客服或主管处理运输订单。" type="warning" :closable="false" />
    <el-alert v-if="routeError" class="ground-notice" type="warning" :closable="false" :title="routeError"><el-button link type="primary" @click="showAll">查看全部订单</el-button></el-alert>
    <form class="ground-filters" aria-label="运输订单筛选" @submit.prevent>
      <label>查询字段<el-select v-model="filters.searchKey" aria-label="运输订单查询字段"><el-option v-for="[value,label] in [['orderNo','订单号'],['childNo','分单号'],['batchNo','批次号']]" :key="value" :value="value" :label="label" /></el-select></label>
      <label>精确查询<el-input v-model="filters.keyword" placeholder="输入完整编号" clearable aria-label="运输订单编号查询" /></label>
      <label>委托方<el-select v-model="filters.customer" clearable placeholder="全部" aria-label="运输订单委托方"><el-option v-for="value in [...new Set(listOrders.map(customerName))]" :key="value" :value="value" /></el-select></label>
      <label v-if="showOrderType">订单类型<el-select v-model="filters.orderType" clearable placeholder="全部" aria-label="UPS订单类型"><el-option v-for="value in ['空运部','海运部']" :key="value" :value="value" /></el-select></label>
      <label v-for="key in ['pickup','delivery']" :key="key">{{ key === 'pickup' ? '提货省市' : '送货省市' }}<el-select v-model="filters[key]" clearable placeholder="全部" :aria-label="key === 'pickup' ? '提货省市' : '送货省市'"><el-option v-for="value in places(key)" :key="value" :value="value" /></el-select></label>
      <label>订单状态<el-select v-model="filters.status" clearable placeholder="全部" aria-label="运输订单状态"><el-option v-for="value in ['未调度','已调度','异常中','已完成','已取消','已关闭']" :key="value" :value="value" /></el-select></label>
      <label>下单日期<el-date-picker v-model="filters.createdDate" value-format="YYYY-MM-DD" aria-label="下单日期" /></label>
      <label>提货日期<el-date-picker v-model="filters.pickupDate" value-format="YYYY-MM-DD" aria-label="订单提货日期" /></label>
      <el-button @click="Object.assign(filters, defaults())">重置</el-button>
    </form>
    <DataTableFrame :rows="rows" :page-size="50" :page-sizes="[20,50,100]" selectable :selected-count="selectedIds.length">
      <template #actions><span>支持跨页选择</span><el-button :disabled="!selectedIds.length" @click="selectedIds = []; table?.clearSelection()">清空选择</el-button></template>
      <template #default="{ rows: pageRows }"><el-table ref="table" :data="pageRows" stripe row-key="id" aria-label="运输订单列表" @sort-change="value => Object.assign(sort,value)" @selection-change="items => selectedIds = items.map(i => i.id)">
        <el-table-column type="selection" reserve-selection width="48" :selectable="row => row.dispatchStatus === '未调度'" />
        <el-table-column prop="orderNo" label="订单号" width="185" sortable="custom" fixed="left"><template #default="{row}"><button class="link-button" @click="openDetail(row)">{{ row.orderNo }}</button></template></el-table-column>
        <el-table-column prop="dispatchStatus" label="订单状态" width="140" sortable="custom"><template #default="{row}"><StatusTag :label="row.dispatchStatus" /><el-tooltip v-if="row.statusPendingReason" :content="row.statusPendingReason"><span class="pending-status">汇总待确认</span></el-tooltip></template></el-table-column>
        <el-table-column v-for="[key,label,width] in columns" :key="key" :prop="key" :label="label" :min-width="width" sortable="custom"><template #default="{row}">{{ key === 'customer' ? customerName(row) : row[key] }}</template></el-table-column>
        <el-table-column label="尺寸（cm）" width="145"><template #default="{row}">{{ [row.length,row.width,row.height].filter(v => v != null).join(' × ') }}</template></el-table-column>
        <el-table-column v-for="key in ['pickup','delivery']" :key="key" :label="key === 'pickup' ? '提货联系人及联系方式' : '送货联系人及联系方式'" width="195"><template #default="{row}">{{ (row[key+'Points'] || []).map(p => [p.contact,p.phone].filter(Boolean).join('：')).join('；') }}</template></el-table-column>
        <el-table-column prop="specialVehicle" label="特种车" width="100" /><el-table-column v-if="listKind==='transfer'" prop="regulated" label="监管车" width="100" /><el-table-column label="备注" min-width="200"><template #default="{row}"><div>{{ row.remark }}</div><el-button v-if="potentialGroundOrders(row,state.groundOrders).length" link type="warning" @click="openDetail(row,'potential')">有潜在同类订单</el-button></template></el-table-column>
        <el-table-column label="操作" width="235" fixed="right"><template #default="{row}"><el-button v-if="canDispatch && row.dispatchStatus === '未调度'" link type="primary" @click="openDispatch(row)">调度派车</el-button><el-button v-if="access(row).edit" link type="primary" @click="editOrder(row)">修改订单</el-button><el-button link type="primary" @click="openDetail(row)">详情</el-button></template></el-table-column>
      </el-table></template>
    </DataTableFrame>
    <el-dialog v-model="visible" :title="modifyingBillId ? '修改调度' : '调度派车 · ' + targets.length + ' 笔订单'" width="min(1120px, 96vw)" class="ground-dialog" align-center destroy-on-close :close-on-click-modal="false" :before-close="close">
      <p v-if="!modifyingBillId">本次生成运单：<strong>{{ targets.length * drafts.length }}</strong> 张</p>
      <p v-else>运单号：{{ modifyingBillId }}</p>
      <el-table :data="targets" size="small" aria-label="本次调度订单"><el-table-column prop="orderNo" label="订单号" min-width="180" /><el-table-column prop="customer" label="委托方" min-width="140" /><el-table-column prop="pickup" label="提货点" min-width="180" /><el-table-column prop="delivery" label="卸货点" min-width="180" /></el-table>
      <el-form label-position="top" @submit.prevent="submit">
        <section v-for="(draft,index) in drafts" :key="index" class="dispatch-vehicle">
          <div class="ground-section-title"><h3>车辆 {{ index+1 }}</h3><el-button v-if="drafts.length>1" text type="danger" @click="drafts.splice(index,1); expanded.splice(index,1)">移除此车辆</el-button></div>
          <div class="dispatch-grid">
            <el-form-item label="车型" required :error="errors[index]?.vehicleType"><el-select v-model="draft.vehicleType" :aria-label="'车辆'+(index+1)+'车型'" @change="vehicleChanged(draft)"><el-option v-for="value in GROUND_VEHICLES" :key="value" :value="value" /></el-select></el-form-item>
            <el-form-item label="供应商名称" required :error="errors[index]?.supplier"><el-select v-model="draft.supplier" :aria-label="'车辆'+(index+1)+'供应商'" @change="supplierChanged(draft)"><el-option v-for="s in GROUND_SUPPLIERS" :key="s.name" :value="s.name" /></el-select></el-form-item>
            <el-form-item label="成本价格（元/车）"><el-input :model-value="draft.cost == null ? '无匹配报价' : Number(draft.cost).toFixed(2)" readonly /></el-form-item>
            <el-form-item label="车牌号" required :error="errors[index]?.plate"><el-autocomplete v-model="draft.plate" :fetch-suggestions="suggestPlates" :aria-label="'车辆'+(index+1)+'车牌号'" placeholder="输入或选择最近车辆" @select="item => choosePlate(draft,item,index)" /></el-form-item>
          </div>
          <details v-if="quotes(draft).length"><summary>查看更多供应商报价 · 按成本升序</summary><p class="ground-help">展示首笔订单报价；批量提交时各订单按自身路线与特殊车辆要求分别匹配。</p><el-table :data="quotes(draft)" size="small"><el-table-column prop="name" label="供应商" /><el-table-column prop="cost" label="元/车" align="right" /><el-table-column prop="address" label="公司地址" /></el-table></details>
          <p v-else class="ground-help">报价只匹配合成路线和车辆要求，无匹配时留空，不补造结算金额。批量各单分别匹配，以上报价对应首笔订单。</p>
          <div v-for="(driver,di) in draft.drivers" :key="di" class="dispatch-grid driver-row">
            <el-form-item :label="'司机 '+(di+1)+' 姓名'" :error="errors[index]?.['drivers.'+di+'.name']"><el-input v-model="driver.name" maxlength="50" :aria-label="'车辆'+(index+1)+'司机'+(di+1)+'姓名'" /></el-form-item>
            <el-form-item label="联系方式"><el-input v-model="driver.phone" :aria-label="'车辆'+(index+1)+'司机'+(di+1)+'联系方式'" /></el-form-item>
            <el-form-item label="司机身份证" :error="errors[index]?.['drivers.'+di+'.identity']"><el-input v-model="driver.identity" maxlength="18" placeholder="请勿输入真实身份证" :aria-label="'车辆'+(index+1)+'司机'+(di+1)+'身份证'" /></el-form-item>
            <el-button v-if="di" text type="danger" @click="draft.drivers.splice(di,1)">移除第二司机</el-button>
          </div>
          <el-button v-if="draft.drivers.length<2" link type="primary" @click="draft.drivers.push({name:'',phone:'',identity:''})">+ 司机</el-button>
          <el-button link type="primary" @click="expanded[index] = !expanded[index]">{{ expanded[index] ? '收起更多信息' : '更多信息' }}</el-button>
          <div v-if="expanded[index]" class="dispatch-grid">
            <el-form-item v-for="[key,label,max] in moreFields" :key="key" :label="label" :error="errors[index]?.[key]"><el-input v-model="draft[key]" :maxlength="max" :type="key === 'customerPassword' ? 'password' : 'text'" :show-password="key === 'customerPassword'" :aria-label="'车辆'+(index+1)+label" /></el-form-item>
          </div>
          <h4>特定提货毛件体与尺寸</h4><p class="ground-help">选填；未指定毛件体按订单总车辆数分配，未指定尺寸留空。</p>
          <div class="dispatch-grid"><el-form-item v-for="[key,label,precision] in specificFields" :key="key" :label="label" :error="errors[index]?.[key]"><el-input-number v-model="draft[key]" :precision="precision" :min="precision ? 0.01 : 1" controls-position="right" :aria-label="'车辆'+(index+1)+'特定'+label" /></el-form-item></div>
          <el-form-item label="备注" :error="errors[index]?.remark"><el-input v-model="draft.remark" type="textarea" maxlength="800" show-word-limit :aria-label="'车辆'+(index+1)+'备注'" /></el-form-item>
          <el-button v-if="!modifyingBillId && index === drafts.length-1" @click="addVehicle">新增调度</el-button>
        </section>
      </el-form>
      <section v-if="!modifyingBillId && targets.length===1" class="detail-section"><h3>潜在关联订单</h3><GroundRelatedOrders :order="targets[0]" dispatch @open="openRelated" /></section>
      <template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button type="primary" :disabled="invalid" :loading="busy" @click="submit">{{ modifyingBillId ? '保存调度' : '提交调度并生成运单' }}</el-button></template>
    </el-dialog>
    <GroundOrderEditor ref="editor" @saved="savedOrder" />
    <el-drawer v-model="detailVisible" title="运输订单详情" size="min(1050px, 96vw)">
      <template v-if="selected">
        <div class="detail-hero"><div><small>{{ selected.orderNo ? '订单号' : selected.childNo ? '分单号' : '用车单号' }}</small><h2>{{ selected.orderNo || selected.childNo || selected.systemOrderNo }}</h2><span>{{ customerName(selected) }}</span></div><StatusTag :label="selected.dispatchStatus" /></div>
        <el-alert v-if="selected.statusPendingReason" :title="selected.statusPendingReason + '；保留上次已知状态。'" type="warning" :closable="false" />
        <div class="order-detail-actions"><el-button @click="orderExpanded = !orderExpanded">{{ orderExpanded ? '收起订单信息' : '展开订单信息' }}</el-button><el-button :disabled="!access(selected).edit" @click="editOrder(selected)">修改订单</el-button><el-button :disabled="!access(selected).close" @click="closeOrder(selected)">关闭订单</el-button><el-button @click="detailVisible = false">返回</el-button></div>
        <el-tabs v-model="detailTab">
        <el-tab-pane label="订单详情" name="order">
        <template v-if="orderExpanded">
        <section class="detail-section"><h3>订单信息</h3><dl class="detail-grid">
          <div v-for="[key,label] in [...columns,['systemOrderNo','系统用车单号'],['customerOrderNo','客户订单号'],['length','长度（cm）'],['width','宽度（cm）'],['height','高度（cm）'],['businessType','业务类型'],['source','订单来源'],['regulated','监管车'],['tailLift','尾板车'],['specialVehicle','特种车'],['remark','备注']]" :key="key"><dt>{{ label }}</dt><dd>{{ key === 'customer' ? customerName(selected) : selected[key] }}</dd></div>
        </dl></section>
        <section class="detail-section"><h3>委托方联系人</h3><el-table :data="selected.customerContacts || [{name:selected.customerContact,phone:selected.customerPhone,email:selected.customerEmail}]"><el-table-column prop="name" label="姓名" min-width="120" /><el-table-column prop="phone" label="联系电话" min-width="150" /><el-table-column prop="email" label="邮箱" min-width="240" /></el-table></section>
        <section class="detail-section" v-for="key in ['pickup','delivery']" :key="key"><h3>{{ key === 'pickup' ? '提货信息' : '送货信息' }}</h3><el-table :data="selected[key+'Points']"><el-table-column prop="province" label="省" min-width="100" /><el-table-column prop="city" label="市" min-width="100" /><el-table-column prop="district" label="区" min-width="100" /><el-table-column prop="address" label="详细地址" min-width="180" /><el-table-column prop="contact" label="联系人" min-width="120" /><el-table-column prop="phone" label="联系电话" min-width="150" /><template v-if="key==='pickup'"><el-table-column prop="regulated" label="监管类型" width="110" /><el-table-column prop="specialVehicle" label="特种车" width="110" /><el-table-column prop="tailLift" label="尾板车" width="100" /></template></el-table></section>
        </template></el-tab-pane>
        <el-tab-pane label="调度记录" name="dispatch">
        <section class="detail-section"><h3>调度记录（{{ bills.length }}）</h3><el-table :data="bills" aria-label="订单调度记录" empty-text="尚未调度">
          <el-table-column prop="waybillNo" label="运单号" width="180" /><el-table-column prop="supplier" label="供应商" min-width="120" /><el-table-column prop="vehicleType" label="车型" width="115" /><el-table-column prop="plate" label="车牌号" width="120" />
          <el-table-column label="司机及联系方式" min-width="210"><template #default="{row}">{{ row.drivers.map(d => [d.name,d.phone].filter(Boolean).join('：')).join('；') }}</template></el-table-column>
          <el-table-column v-for="[key,label,specific] in [['pieces','提货件数（件）','specificPieces'],['weight','重量（kg）','specificWeight'],['volume','体积（m³）','specificVolume']]" :key="key" :label="label" width="140"><template #default="{row}">{{ row[specific] ?? selected[key] }}</template></el-table-column>
          <el-table-column label="备注" min-width="180"><template #default>{{ selected.remark }}</template></el-table-column><el-table-column prop="status" label="运单状态" width="115" /><el-table-column prop="dispatchedById" label="调度人账户" width="145" /><el-table-column label="调度更新时间" width="175"><template #default="{row}">{{ (row.dispatchUpdatedAt || row.createdAt)?.slice(0,16) }}</template></el-table-column>
          <el-table-column label="操作" fixed="right" width="190"><template #default="{row}"><el-button :disabled="!canModify(row)" link type="primary" @click="openModify(row)">修改调度</el-button><el-tooltip content="返空费及取消规则待确认"><span><el-button link disabled>取消调度</el-button></span></el-tooltip></template></el-table-column>
        </el-table></section>
        </el-tab-pane>
        <el-tab-pane label="调度邮件" name="mails"><el-table :data="selected.dispatchMails || []" empty-text="暂无调度邮件记录"><el-table-column prop="subject" label="主题" min-width="220" /><el-table-column label="收件人" min-width="200"><template #default="{row}">{{ row.to.join('；') }}</template></el-table-column><el-table-column prop="status" label="状态" width="165" /><el-table-column label="邮件内容" min-width="220"><template #default="{row}"><details><summary>查看邮件</summary><p>抄送：{{ row.cc.join('；') }}</p><div class="change-row">{{ row.body }}</div></details></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="订单记录" name="history"><el-table :data="selected.history || []" aria-label="订单操作记录" empty-text="暂无已记录的操作"><el-table-column prop="event" label="事件" width="110" /><el-table-column label="内容" min-width="260"><template #default="{row}">{{ row.content }}<details v-if="row.changes?.length"><summary>查看修改前后</summary><div v-for="(change,index) in row.changes" :key="index" class="change-row"><strong>{{ change.field }}</strong><div>修改前：{{ groundChangeText(change.before) }}</div><div>修改后：{{ groundChangeText(change.after) }}</div></div></details></template></el-table-column><el-table-column prop="actor" label="操作人账户" width="145" /><el-table-column label="操作时间" width="175"><template #default="{row}">{{ row.time?.slice(0,16) }}</template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="应收付账单" name="costs"><el-alert title="订单应收写入口径待确认；以下仅列已明确关联的费用。" type="info" :closable="false" /><el-table :data="orderCosts" empty-text="暂无明确关联的应收付记录"><el-table-column v-for="[key,label] in [['direction','方向'],['feeItem','费用科目'],['settlementParty','结算对象'],['currency','币种'],['amount','金额'],['status','审批状态']]" :key="key" :prop="key" :label="label" min-width="130" /></el-table></el-tab-pane>
        <el-tab-pane label="潜在关联订单" name="potential"><GroundRelatedOrders :order="selected" @open="openDetail" /></el-tab-pane>
        </el-tabs>
      </template>
      <template #footer><el-button v-if="selected" type="primary" @click="toBills(selected)">查看关联运输运单</el-button></template>
    </el-drawer>
  </div>
</template>

<style scoped>
.ground-notice { margin-bottom:16px; }
.ground-filters { display:flex; flex-wrap:wrap; align-items:end; gap:12px; margin-bottom:16px; }
.ground-filters label { display:flex; flex-direction:column; gap:8px; width:180px; color:var(--muted); }
.ground-filters label:first-child { width:245px; }
.ground-filters :deep(.el-date-editor) { width:100%; }
.dispatch-vehicle { margin:20px 0; padding:18px; border:1px solid var(--border); border-radius:6px; background:#fafbfd; }
.ground-section-title { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.ground-section-title h3 { margin:0; font-size:16px; }
.dispatch-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr)); gap:0 16px; }
.dispatch-grid :deep(.el-input-number), .dispatch-grid :deep(.el-select), .dispatch-grid :deep(.el-autocomplete) { width:100%; }
.driver-row { margin-top:16px; }
.ground-help { font-size:12px; color:var(--muted); line-height:1.7; }
summary { color:var(--primary); cursor:pointer; padding:8px 0; }
.order-detail-actions { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; }
.order-detail-actions .el-button { margin-left:0; }
.change-row { white-space:pre-wrap; overflow-wrap:anywhere; margin:12px 0; }
</style>
