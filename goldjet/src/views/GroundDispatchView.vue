<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { GROUND_VEHICLES, GROUND_SUPPLIERS, createDispatchDraft, getGroundQuotes, validateDispatchDraft, validateBatchGroundOrders } from '../domain/groundOperations.js'

const router = useRouter()
const route = useRoute()
const { state, groundSession, dispatchGroundOrders } = usePrototypeData()
const canDispatch = computed(() => ['hangsheng', 'supervisor'].includes(groundSession.role))
const defaults = () => ({ keyword:'', customer:'', pickup:'', delivery:'', status:'未调度', createdDate:'', pickupDate:'' })
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
const bills = computed(() => state.groundWaybills.filter(bill => bill.orderId === detailId.value))
const targets = computed(() => state.groundOrders.filter(order => targetIds.value.includes(order.id)))
const region = (order, key) => [...new Set((order[key + 'Points'] || []).map(p => p.province + ' / ' + p.city))].join('; ')
const places = key => [...new Set(state.groundOrders.map(order => region(order, key)))]
const rows = computed(() => state.groundOrders.filter(order =>
  (!filters.keyword || [order.orderNo,order.childNo,order.batchNo].includes(filters.keyword.trim())) &&
  (!filters.customer || order.customer === filters.customer) &&
  (!filters.status || order.dispatchStatus === filters.status) &&
  (!filters.pickup || region(order,'pickup') === filters.pickup) &&
  (!filters.delivery || region(order,'delivery') === filters.delivery) &&
  (!filters.createdDate || order.createdAt?.startsWith(filters.createdDate)) &&
  (!filters.pickupDate || order.pickupTime?.startsWith(filters.pickupDate))
).slice().sort((a,b) => {
  if (sort.prop && sort.order) {
    const numeric = ['pieces','weight','volume'].includes(sort.prop)
    const compare = numeric ? Number(a[sort.prop] ?? -Infinity) - Number(b[sort.prop] ?? -Infinity) : String(a[sort.prop] || '').localeCompare(String(b[sort.prop] || ''),'zh-CN')
    return sort.order === 'ascending' ? compare : -compare
  }
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
function openDetail(order) { detailId.value = order.id; detailVisible.value = true }
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
  initial.value = JSON.stringify(drafts.value); visible.value = true
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
  const order = state.groundOrders.find(item => item.id === id || item.orderNo === id)
  if (!order) {
    routeError.value = '未找到对应运输订单，请返回来源页面重新选择或查看全部订单。'
    return
  }
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
    const result = dispatchGroundOrders(targetIds.value, JSON.parse(JSON.stringify(drafts.value)), {specialConfirmed:specialConfirmed.value})
    visible.value = false; selectedIds.value = []; table.value?.clearSelection(); filters.status = ''
    openDetail(targets.value[0]); ElMessage.success('调度提交成功！已生成 ' + result.length + ' 张独立运输运单。')
  } catch (error) { ElMessage.error(error.message) }
  finally { busy.value = false }
}
</script>

<template>
  <div class="module-view">
    <PageHeader title="用车调度" description="航晟客服 · 运输订单调度、车辆司机录入与关联运单">
      <template #actions><el-button type="primary" :disabled="!canDispatch || !selectedIds.length" @click="openDispatch()">批量调度</el-button></template>
    </PageHeader>
    <el-alert class="ground-notice" title="当前覆盖：调度 → 独立运单 → 客服状态管理。手工建单、修改/取消调度、异常上报与费用结算尚未覆盖；不会发送真实通知。" type="info" :closable="false" />
    <el-alert v-if="!canDispatch" class="ground-notice" title="当前角色只读，请从顶部切换为航晟客服或主管处理运输订单。" type="warning" :closable="false" />
    <el-alert v-if="routeError" class="ground-notice" type="warning" :closable="false" :title="routeError"><el-button link type="primary" @click="showAll">查看全部订单</el-button></el-alert>
    <form class="ground-filters" aria-label="运输订单筛选" @submit.prevent>
      <label>订单号 / 子单号 / 批次号<el-input v-model="filters.keyword" placeholder="精确查询" clearable aria-label="运输订单编号查询" /></label>
      <label>委托方<el-select v-model="filters.customer" clearable placeholder="全部" aria-label="运输订单委托方"><el-option v-for="value in [...new Set(state.groundOrders.map(o => o.customer))]" :key="value" :value="value" /></el-select></label>
      <label v-for="key in ['pickup','delivery']" :key="key">{{ key === 'pickup' ? '提货省市' : '送货省市' }}<el-select v-model="filters[key]" clearable placeholder="全部" :aria-label="key === 'pickup' ? '提货省市' : '送货省市'"><el-option v-for="value in places(key)" :key="value" :value="value" /></el-select></label>
      <label>订单状态<el-select v-model="filters.status" clearable placeholder="全部" aria-label="运输订单状态"><el-option v-for="value in ['未调度','已调度','异常中','已完成','已取消']" :key="value" :value="value" /></el-select></label>
      <label>下单日期<el-date-picker v-model="filters.createdDate" value-format="YYYY-MM-DD" aria-label="下单日期" /></label>
      <label>提货日期<el-date-picker v-model="filters.pickupDate" value-format="YYYY-MM-DD" aria-label="订单提货日期" /></label>
      <el-button @click="Object.assign(filters, defaults())">重置</el-button>
    </form>
    <DataTableFrame :rows="rows" :page-size="50" :page-sizes="[20,50,100]" selectable :selected-count="selectedIds.length">
      <template #actions><span>支持跨页选择</span><el-button :disabled="!selectedIds.length" @click="selectedIds = []; table?.clearSelection()">清空选择</el-button></template>
      <template #default="{ rows: pageRows }"><el-table ref="table" :data="pageRows" stripe row-key="id" aria-label="运输订单列表" @sort-change="value => Object.assign(sort,value)" @selection-change="items => selectedIds = items.map(i => i.id)">
        <el-table-column type="selection" reserve-selection width="48" :selectable="row => row.dispatchStatus === '未调度'" />
        <el-table-column prop="orderNo" label="订单号" width="185" sortable="custom" fixed="left"><template #default="{row}"><button class="link-button" @click="openDetail(row)">{{ row.orderNo }}</button></template></el-table-column>
        <el-table-column prop="dispatchStatus" label="订单状态" width="115" sortable="custom"><template #default="{row}"><StatusTag :label="row.dispatchStatus" /></template></el-table-column>
        <el-table-column v-for="[key,label,width] in columns" :key="key" :prop="key" :label="label" :min-width="width" sortable="custom" />
        <el-table-column label="尺寸（cm）" width="145"><template #default="{row}">{{ [row.length,row.width,row.height].filter(v => v != null).join(' × ') }}</template></el-table-column>
        <el-table-column v-for="key in ['pickup','delivery']" :key="key" :label="key === 'pickup' ? '提货联系人及联系方式' : '送货联系人及联系方式'" width="195"><template #default="{row}">{{ (row[key+'Points'] || []).map(p => [p.contact,p.phone].filter(Boolean).join('：')).join('；') }}</template></el-table-column>
        <el-table-column prop="specialVehicle" label="特种车" width="100" /><el-table-column prop="remark" label="备注" min-width="180" />
        <el-table-column label="操作" width="155" fixed="right"><template #default="{row}"><el-button v-if="row.dispatchStatus === '未调度'" link type="primary" @click="openDispatch(row)">调度派车</el-button><el-button link type="primary" @click="openDetail(row)">详情</el-button></template></el-table-column>
      </el-table></template>
    </DataTableFrame>
    <el-dialog v-model="visible" :title="'调度派车 · ' + targets.length + ' 笔订单'" width="min(1120px, 96vw)" class="ground-dialog" align-center destroy-on-close :close-on-click-modal="false" :before-close="close">
      <p>每笔订单、每辆车各生成一张运单；本次将生成 <strong>{{ targets.length * drafts.length }}</strong> 张。</p>
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
          <el-button v-if="index === drafts.length-1" @click="addVehicle">新增调度</el-button>
        </section>
      </el-form>
      <template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button type="primary" :disabled="invalid" :loading="busy" @click="submit">提交调度并生成运单</el-button></template>
    </el-dialog>
    <el-drawer v-model="detailVisible" title="运输订单详情" size="min(1050px, 96vw)">
      <template v-if="selected">
        <div class="detail-hero"><div><small>订单号</small><h2>{{ selected.orderNo }}</h2><span>{{ selected.customer }}</span></div><StatusTag :label="selected.dispatchStatus" /></div>
        <section class="detail-section"><h3>订单信息</h3><dl class="detail-grid">
          <div v-for="[key,label] in [...columns,['customerOrderNo','客户订单号'],['customerContact','委托方联系人'],['customerPhone','联系电话'],['customerEmail','邮箱地址'],['length','长度（cm）'],['width','宽度（cm）'],['height','高度（cm）'],['businessType','业务类型'],['source','订单来源'],['regulated','监管车'],['tailLift','尾板车'],['specialVehicle','特种车'],['remark','备注']]" :key="key"><dt>{{ label }}</dt><dd>{{ selected[key] }}</dd></div>
        </dl></section>
        <section class="detail-section" v-for="key in ['pickup','delivery']" :key="key"><h3>{{ key === 'pickup' ? '提货信息' : '送货信息' }}</h3><el-table :data="selected[key+'Points']"><el-table-column prop="province" label="省" /><el-table-column prop="city" label="市" /><el-table-column prop="district" label="区" /><el-table-column prop="address" label="详细地址" min-width="150" /><el-table-column prop="contact" label="联系人" /><el-table-column prop="phone" label="联系电话" min-width="150" /></el-table></section>
        <section class="detail-section"><h3>调度记录（{{ bills.length }}）</h3><el-table :data="bills" aria-label="订单调度记录" empty-text="尚未调度"><el-table-column prop="waybillNo" label="运单号" width="180" /><el-table-column prop="supplier" label="供应商" min-width="120" /><el-table-column prop="vehicleType" label="车型" width="115" /><el-table-column prop="plate" label="车牌号" width="120" /><el-table-column prop="status" label="运单状态" width="115" /><el-table-column prop="dispatchedBy" label="调度人" width="110" /><el-table-column prop="updatedAt" label="调度更新时间" width="170" /></el-table></section>
        <div class="drawer-actions"><el-button type="primary" @click="toBills(selected)">查看关联运输运单</el-button></div>
      </template>
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
</style>
