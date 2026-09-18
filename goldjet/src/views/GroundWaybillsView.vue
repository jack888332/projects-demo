<script setup>
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { DocumentAdd } from '@element-plus/icons-vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import GroundWaybillExceptions from '../components/GroundWaybillExceptions.vue'
import GroundWaybillDocuments from '../components/GroundWaybillDocuments.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { GROUND_DATE, GROUND_NOW, GROUND_STATUSES, GROUND_EDITABLE_STATUSES, GROUND_VEHICLES, GROUND_SPECIAL_TYPES, validateGroundStatusChange, groundWaybillTerminal } from '../domain/groundOperations.js'

const route = useRoute()
const router = useRouter()
const { state, groundSession, updateGroundWaybillStatus, loadGroundWaybillExamples } = usePrototypeData()
const canManage = computed(() => groundSession.role === 'hangsheng')
const managementPermissionReason = '仅航晟客服可管理运单状态'
const listKind = ref(route.query.tab === 'transfer' ? 'transfer' : 'transport')
const isTransfer = bill => state.groundOrders.find(order => order.id === bill.orderId)?.orderType === '中转订单'
const pageTitle = computed(() => listKind.value === 'transfer' ? '中转运单' : '运输运单')
const defaults = () => ({ keyword:'', customer:'', supplier:'', vehicleType:'', specialVehicle:'', tailLift:'', regulated:'', cargoDocuments:'', status:'', exceptionStatus:'', pickupDate:GROUND_DATE })
const filters = reactive(defaults())
const linkedOrders = computed(() => {
  const exact = state.groundOrders.find(order => order.id === route.query.order)
  return exact ? [exact] : state.groundOrders.filter(order => order.orderNo === route.query.order)
})
const linkedOrder = computed(() => linkedOrders.value.length === 1 ? linkedOrders.value[0] : null)
const routeError = ref('')
const detailId = ref('')
const detailVisible = ref(false)
const detailTab = ref('trajectory'), exceptionsPanel = ref(), documentsPanel = ref()
const selectedCosts = computed(() => selected.value ? state.costs.filter(row => row.waybillId === selected.value.id) : [])
const informationVisible = ref(true)
const statusId = ref('')
const statusVisible = ref(false)
const draft = reactive({status:'',time:GROUND_NOW,remark:''})
const initial = ref('')
const busy = ref(false)
const selected = computed(() => state.groundWaybills.find(b => b.id === detailId.value))
const updating = computed(() => state.groundWaybills.find(b => b.id === statusId.value))
const error = computed(() => validateGroundStatusChange(updating.value,draft))
const terminal = groundWaybillTerminal
const listBills = computed(() => state.groundWaybills.filter(bill => isTransfer(bill) === (listKind.value === 'transfer')))
const rows = computed(() => listBills.value.filter(bill =>
  (!route.query.order || bill.orderId === linkedOrder.value?.id) &&
  (!filters.keyword || [bill.waybillNo,bill.orderNo,bill.plate,...(listKind.value === 'transfer' ? [bill.sealNo] : [])].includes(filters.keyword.trim())) &&
  (!filters.pickupDate || bill.pickupTime?.startsWith(filters.pickupDate)) &&
  ['customer','supplier','vehicleType','specialVehicle','tailLift','regulated','cargoDocuments','status','exceptionStatus'].every(key => !filters[key] || (key === 'exceptionStatus' && filters[key] === '空白' ? !bill[key] : bill[key] === filters[key]))
).slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.waybillNo.localeCompare(a.waybillNo)))
const filterOptions = computed(() => [
  {key:'customer',label:'委托方',values:[...new Set(listBills.value.map(b => b.customer).filter(Boolean))]},
  {key:'supplier',label:'供应商',values:[...new Set(listBills.value.map(b => b.supplier).filter(Boolean))]},
  {key:'vehicleType',label:'车型',values:GROUND_VEHICLES}, {key:'specialVehicle',label:'特种车',values:GROUND_SPECIAL_TYPES},
  {key:'tailLift',label:'尾板车',values:['是','否']}, {key:'regulated',label:'监管车',values:['是','否']},
  {key:'cargoDocuments',label:'随货资料',values:['有','无']}, {key:'status',label:'运单状态',values:[...GROUND_STATUSES,'异常中']},
  {key:'exceptionStatus',label:'异常状态',values:['异常中','异常已关闭',...(listKind.value === 'transfer' ? ['空白'] : [])]},
])
const detailFields = [
  ['orderNo','订单号'],['childNo','分单号'],['batchNo','批次号'],['sealNo','封条号'],['customer','委托方'],['supplier','供应商'],['plate','车牌号'],['vehicleType','车型'],
  ['pickup','提货点'],['delivery','卸货点'],['pickupTime','提货时间'],['deliveryTime','送货时间'],['expectedArrival','预计到达时间'],
  ['regulated','监管车'],['tailLift','尾板车'],['specialVehicle','特种车'],['cargoDocuments','随货资料'],
  ['expectedPieces','预计件数（件）'],['expectedVolume','预计体积（m³）'],['expectedWeight','预计重量（kg）'],
  ['expectedLength','预计长度（cm）'],['expectedWidth','预计宽度（cm）'],['expectedHeight','预计高度（cm）'],
  ['companyAddress','公司地址'],['customsNo','海关编号'],['vehicleWeight','车自重（kg）'],['containerNo','柜号'],['frameWeight','架重（kg）'],['containerWeight','柜重（kg）'],
  ['cost','匹配成本（元/车）'],['costStatus','报价匹配结果'],['remark','调度备注'],['dispatchedBy','调度人'],['createdAt','调度时间'],
]
const showValue = (bill,key) => bill[key] == null ? '' : ['expectedVolume','expectedWeight','cost'].includes(key) ? Number(bill[key]).toFixed(2) : bill[key]
function open(bill) { if (detailId.value !== bill.id) { informationVisible.value = true; detailTab.value = 'trajectory' }; detailId.value = bill.id; detailVisible.value = true }
async function closeDetail(done) { if (!await allowDiscard()) return; detailVisible.value = false; if (typeof done === 'function') done() }
function switchList(value) { router.replace({ path: '/fulfillment/ground-waybills', query: value === 'transfer' ? { tab: 'transfer' } : {} }) }
async function loadExamples() {
  try { const bill = loadGroundWaybillExamples(); await router.replace({path:'/fulfillment/ground-waybills',query:{waybill:bill.id,tab:'transfer'}}) }
  catch (error) { ElMessage.error(error.message) }
}
async function showAll() {
  if (!await router.replace('/fulfillment/ground-waybills')) Object.assign(filters, defaults(), { pickupDate: '' })
}
function manage(bill) {
  if (!canManage.value) return ElMessage.warning(managementPermissionReason)
  if (!bill || terminal(bill)) return
  statusId.value = bill.id
  Object.assign(draft,{status:bill.status,time:GROUND_NOW,remark:''})
  initial.value = JSON.stringify(draft)
  statusVisible.value = true
}
async function allowDiscard() {
  if (busy.value) return false
  if (exceptionsPanel.value && !await exceptionsPanel.value.allowDiscard()) return false
  if (documentsPanel.value && !await documentsPanel.value.allowDiscard()) return false
  if (!statusVisible.value || initial.value === JSON.stringify(draft)) return true
  try { await ElMessageBox.confirm('节点信息尚未保存，离开将丢弃本次修改。','放弃状态修改？',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑',type:'warning'}); return true }
  catch { return false }
}
async function close(done) { if (busy.value || !await allowDiscard()) return; statusVisible.value = false; if (typeof done === 'function') done() }
onBeforeRouteLeave(allowDiscard)
function beforeUnload(event) { if (statusVisible.value && initial.value !== JSON.stringify(draft)) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
onBeforeRouteUpdate(async () => {
  if (!await allowDiscard()) return false
  statusVisible.value = false
  return true
})
watch(() => groundSession.role, () => { statusVisible.value = false })
function submit() {
  if (!canManage.value || error.value || busy.value) return
  busy.value = true
  try { const bill = updateGroundWaybillStatus(statusId.value,{...draft}); statusVisible.value = false; open(bill); ElMessage.success('已提交成功！') }
  catch (err) { ElMessage.error(err.message) }
  finally { busy.value = false }
}
watch(() => [route.query.order, route.query.waybill, route.query.tab], ([orderReference, waybillReference, tab]) => {
  routeError.value = ''
  listKind.value = tab === 'transfer' ? 'transfer' : 'transport'
  Object.assign(filters, defaults())
  detailVisible.value = false
  detailId.value = ''
  if (orderReference && !linkedOrder.value) {
    routeError.value = linkedOrders.value.length > 1 ? '该业务单号匹配多笔订单，请通过订单详情重新进入。' : '未找到关联运输订单，请返回订单详情重新选择或查看全部运单。'
    return
  }
  if (orderReference) { filters.pickupDate = ''; listKind.value = linkedOrder.value.orderType === '中转订单' ? 'transfer' : 'transport' }
  if (!waybillReference) return
  const bill = state.groundWaybills.find(item => item.id === waybillReference || item.waybillNo === waybillReference)
  if (!bill || (orderReference && bill.orderId !== linkedOrder.value.id)) {
    routeError.value = '未找到对应运输运单，请返回司机详情重新选择或查看全部运单。'
    return
  }
  Object.assign(filters, defaults(), { keyword: bill.waybillNo, pickupDate: '' })
  listKind.value = isTransfer(bill) ? 'transfer' : 'transport'
  open(bill)
}, { immediate: true })
watch(selected, bill => {
  if (bill) return
  detailVisible.value = false
  if (detailId.value && route.query.waybill) routeError.value = '未找到对应运输运单，请返回司机详情重新选择或查看全部运单。'
})
</script>

<template>
  <div class="module-view">
    <PageHeader :title="pageTitle" :description="'航晟物流 · ' + groundSession.name">
      <template #actions><el-button v-if="canManage" :icon="DocumentAdd" @click="loadExamples">载入中转合成示例</el-button><el-button @click="router.push('/fulfillment/ground-dispatch')">返回用车调度</el-button></template>
    </PageHeader>
    <el-tabs :model-value="listKind" @update:model-value="switchList"><el-tab-pane label="运输运单" name="transport" /><el-tab-pane label="中转运单" name="transfer" /></el-tabs>
    <el-alert class="waybill-notice" type="info" :closable="false" title="地图、WMS回传及自动费用尚未接入；异常恢复的未决情形暂不开放。" />
    <el-alert v-if="routeError" class="waybill-notice" type="warning" :closable="false" :title="routeError"><el-button link type="primary" @click="showAll">查看全部运单</el-button></el-alert>
    <div v-if="route.query.order" class="linked-order">关联订单：{{ linkedOrder?.orderNo || route.query.order }} <StatusTag v-if="linkedOrder" :label="linkedOrder.dispatchStatus" /><el-button link type="primary" @click="showAll">查看全部运单</el-button></div>
    <div v-else-if="route.query.waybill && !routeError" class="linked-order">指定运单：{{ route.query.waybill }}<el-button link type="primary" @click="showAll">查看全部运单</el-button></div>
    <form class="waybill-filters" aria-label="运输运单筛选" @submit.prevent>
      <label>{{ listKind === 'transfer' ? '运单号 / 订单号 / 车牌号 / 封条号' : '运单号 / 订单号 / 车牌号' }}<el-input v-model="filters.keyword" clearable placeholder="精确查询" aria-label="运输运单编号查询" /></label>
      <label v-for="field in filterOptions" :key="field.key">{{ field.label }}<el-select v-model="filters[field.key]" clearable placeholder="全部" :aria-label="'运单'+field.label"><el-option v-for="value in field.values" :key="value" :value="value" /></el-select></label>
      <label>提货日期<el-date-picker v-model="filters.pickupDate" value-format="YYYY-MM-DD" clearable aria-label="运单提货日期" /></label>
      <el-button @click="Object.assign(filters, defaults())">重置</el-button>
    </form>
    <DataTableFrame :rows="rows" :page-size="50" :page-sizes="[20,50,100]">
      <template #default="{ rows: pageRows }"><el-table :data="pageRows" stripe row-key="id" aria-label="运输运单列表" empty-text="没有符合条件的运单，可清除提货日期或返回调度生成运单。">
        <el-table-column prop="waybillNo" label="运单号" width="190" fixed="left"><template #default="{row}"><button class="link-button" @click="open(row)">{{ row.waybillNo }}</button></template></el-table-column>
        <el-table-column label="运单状态" width="115"><template #default="{row}"><StatusTag :label="row.status" /></template></el-table-column>
        <el-table-column v-if="listKind === 'transfer'" prop="sealNo" label="封条号" width="170" /><el-table-column v-if="listKind === 'transfer'" prop="childNo" label="分单号" width="170" />
        <el-table-column v-for="[key,label,width] in [['customer','委托方',145],['orderNo','订单号',185],['supplier','供应商',130],['plate','车牌号',130],['pickupTime','提货时间',170],['vehicleType','车型',120],['regulated','监管车',95],['tailLift','尾板车',95],['specialVehicle','特种车',100]]" :key="key" :prop="key" :label="label" :width="width" />
        <el-table-column label="司机及联系方式" width="220"><template #default="{row}">{{ row.drivers.map(d => [d.name,d.phone].filter(Boolean).join('：')).join('；') }}</template></el-table-column>
        <el-table-column v-for="[key,label] in [['expectedPieces','预计件数（件）'],['expectedVolume','预计体积（m³）'],['expectedWeight','预计重量（kg）']]" :key="key" :label="label" width="145" align="right"><template #default="{row}">{{ showValue(row,key) }}</template></el-table-column>
        <el-table-column label="预计尺寸（cm）" width="160"><template #default="{row}">{{ [row.expectedLength,row.expectedWidth,row.expectedHeight].filter(v => v != null).join(' × ') }}</template></el-table-column>
        <el-table-column prop="expectedArrival" label="预计到达时间" width="170" /><el-table-column prop="exceptionStatus" label="异常状态" width="130" /><el-table-column prop="cargoDocuments" label="随货资料" width="100" /><el-table-column prop="remark" label="备注" min-width="180" />
        <el-table-column label="操作" width="170" fixed="right"><template #default="{row}"><el-button link type="primary" @click="open(row)">查看详情</el-button><el-tooltip v-if="!terminal(row)" :disabled="canManage" :content="managementPermissionReason"><span class="status-action" :tabindex="canManage ? undefined : 0"><el-button v-business-write="'groundWaybills'" link type="primary" :disabled="!canManage" @click="manage(row)">状态管理</el-button></span></el-tooltip></template></el-table-column>
      </el-table></template>
    </DataTableFrame>
    <el-drawer v-model="detailVisible" :title="pageTitle + '详情'" size="min(980px, 96vw)" :before-close="closeDetail" destroy-on-close>
      <template v-if="selected">
        <div class="detail-hero"><div><small>{{ selected.orderNo }}</small><h2>{{ selected.waybillNo }}</h2><span>{{ selected.customer }} · {{ selected.plate }}</span></div><div><StatusTag :label="selected.status" /><StatusTag v-if="selected.exceptionStatus" :label="selected.exceptionStatus" /></div></div>
        <el-alert v-if="selected.exampleSource" :title="selected.exampleSource" type="info" :closable="false" />
        <el-button class="info-toggle" @click="informationVisible = !informationVisible">{{ informationVisible ? '收起运单信息' : '展开运单信息' }}</el-button>
        <template v-if="informationVisible"><dl class="detail-grid"><div v-for="[key,label] in detailFields" :key="key"><dt>{{ label }}</dt><dd>{{ showValue(selected,key) }}</dd></div></dl>
          <section class="detail-section"><h3>司机信息</h3><el-table :data="selected.drivers"><el-table-column prop="name" label="司机姓名" /><el-table-column prop="phone" label="联系方式" /><el-table-column prop="identity" label="司机身份证（合成）" min-width="190" /></el-table><el-form-item label="客户密码"><el-input :model-value="selected.customerPassword" type="password" show-password readonly aria-label="已保存客户密码" /></el-form-item></section>
        </template>
        <el-tabs v-model="detailTab">
          <el-tab-pane label="轨迹记录" name="trajectory"><el-table :data="selected.trajectory" aria-label="运单轨迹记录"><el-table-column prop="event" label="节点事件" min-width="125" /><el-table-column prop="time" label="操作时间" width="170" /><el-table-column label="操作人" min-width="160"><template #default="{row}">{{ row.actorId || row.actor }}</template></el-table-column><el-table-column prop="role" label="参与方" width="110" /><el-table-column prop="remark" label="备注" min-width="160" /></el-table></el-tab-pane>
          <el-tab-pane label="异常管理" name="exceptions"><GroundWaybillExceptions ref="exceptionsPanel" :bill="selected" /></el-tab-pane>
          <el-tab-pane label="单据管理" name="documents"><GroundWaybillDocuments ref="documentsPanel" :bill="selected" /></el-tab-pane>
          <el-tab-pane label="应收付账单" name="costs"><el-alert title="自动计费和杂费入账规则待确认，以下仅展示已明确关联本运单的费用。" type="info" :closable="false" /><div class="cost-actions"><el-tooltip content="未覆盖：运单应付录入与财务账单联动"><span><el-button disabled>新增应付</el-button></span></el-tooltip></div><el-table :data="selectedCosts" aria-label="运单应收付账单" empty-text="暂无明确关联的应收付记录"><el-table-column v-for="[key,label] in [['direction','方向'],['feeItem','费用科目'],['settlementParty','结算对象'],['currency','币种'],['amount','金额'],['status','审批状态']]" :key="key" :prop="key" :label="label" min-width="130" /></el-table></el-tab-pane>
        </el-tabs>
        <el-alert v-if="selected.status === '已卸货'" class="waybill-notice" title="运输节点已完成。自动运输费、压车费与财务账单未实现，本次不生成虚构费用。" type="warning" :closable="false" />
      </template>
      <template #footer><el-button @click="closeDetail">关闭</el-button><el-button v-business-write="'groundWaybills'" v-if="selected && !terminal(selected)" type="primary" :disabled="!canManage" @click="manage(selected)">状态管理</el-button></template>
    </el-drawer>
    <el-dialog v-model="statusVisible" title="运单状态管理" width="min(540px, 94vw)" align-center :close-on-click-modal="false" :before-close="close">
      <p>{{ updating?.waybillNo }} · {{ updating?.plate }}</p>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="运单状态" required><el-select v-model="draft.status" aria-label="目标运单状态"><el-option v-for="value in GROUND_EDITABLE_STATUSES" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="操作时间" required><el-date-picker v-model="draft.time" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" aria-label="运单操作时间" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="draft.remark" type="textarea" aria-label="运单状态备注" /></el-form-item>
        <p class="waybill-help">客服可修正任意已定义运输节点，不强制顺序。已卸货后不再提供状态管理；取消调度涉及返空费，不在此处执行。</p>
        <p v-if="error" role="status" class="waybill-error">{{ error }}</p>
      </el-form>
      <template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button v-business-write="'groundWaybills'" type="primary" :disabled="!canManage || !!error" :loading="busy" @click="submit">保存状态</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.waybill-notice { margin:16px 0; }
.status-action { display:inline-flex; margin-left:12px; }
.linked-order { display:flex; flex-wrap:wrap; gap:12px; align-items:center; padding:12px; background:var(--primary-soft); margin-bottom:16px; }
.waybill-filters { display:flex; flex-wrap:wrap; align-items:end; gap:12px; margin-bottom:16px; }
.waybill-filters label { display:flex; flex-direction:column; gap:8px; width:155px; color:var(--muted); }
.waybill-filters label:first-child { width:250px; }
.waybill-filters :deep(.el-date-editor) { width:100%; }
.info-toggle { margin:16px 0; }
.waybill-help { color:var(--muted); font-size:12px; line-height:1.7; }
.waybill-error { color:var(--danger); }
.cost-actions { margin:12px 0; display:flex; justify-content:flex-end; }
</style>
