<script setup>
import { computed, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, EditPen, Plus, Download } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import StatusTag from '../components/StatusTag.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import AirHouseBillDialog from '../components/AirHouseBillDialog.vue'
import AirServiceFields from '../components/AirServiceFields.vue'
import AirServiceEditDialog from '../components/AirServiceEditDialog.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { cloneAirSupplementValue, stringifyAirSupplementValue, createAirSupplementDraft, normalizeAirSupplementDraft, validateAirSupplement, getAirSupplementRestriction, getAirOrderCodeRestriction, getAirHouseBillTotals } from '../domain/airOrderSupplement.js'
import { getAirServiceEditRestriction } from '../domain/airServiceEditing.js'

const route = useRoute()
const router = useRouter()
const { state, airChildSession, airCatalog, airDeclarations, declarationSession, saveAirSupplement, saveAirOrderCode, cancelAirHouseBill, moveAirHouseBill, importAirHouseBills } = usePrototypeData()
const session = computed(() => unref(airChildSession))
const order = computed(() => state.airOrders.find(row => row.id === route.params.orderId && (!['service', 'hangsheng'].includes(session.value.role) || row.creator === session.value.name)))
const draft = ref(null)
const initial = ref('')
const busy = ref(false)
const failure = ref('')
const childVisible = ref(false)
const childId = ref('')
const childDirty = ref(false)
const serviceVisible = ref(false)
const serviceId = ref('')
const serviceDirty = ref(false)
const selectedService = computed(() => order.value?.services?.find(row => row.id === serviceId.value) || null)
const importVisible = ref(false)
const importIds = ref([])
const party = ref('')
const partyText = ref('')
const partyInitial = ref('')
let contextVersion = 0
const children = computed(() => (state.airChildren || []).filter(row => row.parentId === order.value?.id))
const activeChildren = computed(() => children.value.filter(row => !row.deleted && row.orderStatus !== '已取消'))
const selectedChild = computed(() => children.value.find(row => row.id === childId.value) || null)
const customsRequestId = computed(() => typeof route.query.customs === 'string' ? route.query.customs : '')
const customsChildId = computed(() => typeof route.query.child === 'string' ? route.query.child : '')
const inspectingCustomsSource = computed(() => route.query.inspect === 'service')
const legacyCustomsSource = computed(() => {
  if (!customsRequestId.value || !customsChildId.value) return null
  const matches = (unref(airDeclarations) || []).filter(row => row.id === customsRequestId.value && row.childId === customsChildId.value)
  return matches.length === 1 ? matches[0] : null
})
const sourceDeclaration = computed(() => {
  if (legacyCustomsSource.value || !inspectingCustomsSource.value || !order.value || session.value.role !== 'viewer' || unref(declarationSession)?.role !== 'customsService') return null
  return (unref(airDeclarations) || []).find(row => row.id === customsRequestId.value && row.orderId === order.value.id
    && (row.childId || '') === customsChildId.value) || null
})
const customsDeclaration = computed(() => {
  if (legacyCustomsSource.value || inspectingCustomsSource.value || !order.value || !customsRequestId.value || !['service', 'supervisor'].includes(session.value.role)) return null
  return (unref(airDeclarations) || []).find(row => row.id === customsRequestId.value && row.orderId === order.value.id
    && (row.childId || '') === customsChildId.value && row.creator === session.value.name
    && row.materialRequests?.some(request => request.recipient === session.value.name)) || null
})
const customsRequests = computed(() => (customsDeclaration.value?.materialRequests || []).filter(request => request.recipient === session.value.name))
const customsContext = computed(() => customsDeclaration.value ? { serviceId: customsDeclaration.value.id, requests: customsRequests.value } : null)
const customsLinkError = computed(() => !customsRequestId.value || customsDeclaration.value || sourceDeclaration.value ? ''
  : inspectingCustomsSource.value ? '报关服务来源不匹配或当前角色无权查看。' : '报关材料通知不存在、来源不匹配或当前角色无权查看。')
const childOrder = computed(() => order.value ? { ...order.value, ...draft.value, id: order.value.id } : null)
const restriction = computed(() => getAirSupplementRestriction(order.value, session.value))
const restrictionMessage = computed(() => order.value?.orderStatus === '待出提单' && restriction.value === '订单须处于待补录状态' ? '补录已提交。代码可单独保存；客户报价在主订单列表维护，待服务信息可在下方修改。' : restriction.value)
const houseManagementRestriction = computed(() => restriction.value || (order.value?.orderType === '合成主订单' ? '合成主订单的原子订单信息只读' : ''))
const effectiveDraft = computed(() => draft.value && order.value ? normalizeAirSupplementDraft(draft.value, order.value, state.airMaster) : null)
const errors = computed(() => effectiveDraft.value ? validateAirSupplement(effectiveDraft.value, order.value, children.value, airCatalog.value) : {})
const canEditCode = computed(() => !getAirOrderCodeRestriction(order.value, session.value))
const dirty = computed(() => Boolean(draft.value && stringifyAirSupplementValue(draft.value) !== initial.value) || childDirty.value || serviceDirty.value || Boolean(party.value && partyText.value !== partyInitial.value))
const hasHouseBills = computed(() => ['主单', '合成主订单'].includes(draft.value?.orderType))
const canSubmit = computed(() => !restriction.value && (!hasHouseBills.value || activeChildren.value.length > 0))
const importCandidates = computed(() => (state.airChildren || []).filter(row => !row.deleted && !row.parentId && row.customer === order.value?.customer && ['子订单暂存', '子订单完成'].includes(row.orderStatus) && (session.value.role === 'supervisor' || row.creator === session.value.name)))
const partyError = computed(() => !partyText.value.trim() ? '必填' : partyText.value.trim().length > 500 ? '最多 500 个字符' : '')
const cargoFields = [{ key: 'pieces', label: '预计件数', unit: '件' }, { key: 'grossWeight', label: '预计毛重', unit: 'kg' }, { key: 'volume', label: '预计体积', unit: 'm³' }]
const cargoTotals = computed(() => getAirHouseBillTotals(activeChildren.value))
const serviceOptions = [{ key: 'preallocation', label: '预配发送' }, { key: 'transfer', label: '中转' }, { key: 'security', label: '货站安检' }, { key: 'clearance', label: '清关派送' }, { key: 'customs', label: '关务' }]
const serviceSections = [{ key: 'transfer', title: '中转服务' }, { key: 'customs', title: '关务服务' }, { key: 'security', title: '货站安检' }, { key: 'clearance', title: '清关派送' }]
const visibleSections = computed(() => serviceSections.filter(section => draft.value?.groundServices?.[section.key] && (draft.value.orderType === '直单' || !['customs', 'clearance'].includes(section.key))))
const originalPickupFields = [['supplier', '供应商'], ['time', '提货时间'], ['address', '提货点'], ['contact', '提货联系人'], ['phone', '提货电话'], ['arrivalAddress', '到货点'], ['arrivalContact', '到货联系人'], ['arrivalPhone', '到货电话'], ['vehicleType', '特种车'], ['remark', '提货备注']]
function display(value) { return value === '' || value === undefined || value === null || (Array.isArray(value) && !value.length) ? '未填写' : Array.isArray(value) ? value.join('、') : value }
function hydrate() {
  contextVersion += 1
  draft.value = order.value ? createAirSupplementDraft(order.value, state.airMaster) : null
  initial.value = stringifyAirSupplementValue(draft.value)
  failure.value = ''; childVisible.value = false; childDirty.value = false; serviceVisible.value = false; serviceDirty.value = false; importVisible.value = false; importIds.value = []; party.value = ''
}
watch(order, hydrate, { immediate: true })
watch(() => `${session.value.role}:${session.value.name}`, hydrate)
watch(childVisible, visible => { if (!visible) childDirty.value = false })
watch(serviceVisible, visible => { if (!visible) serviceDirty.value = false })
function serviceRestriction(service) { return getAirServiceEditRestriction(order.value, service, session.value) }
function openService(service) {
  if (busy.value || serviceRestriction(service) || !order.value?.services?.includes(service)) return false
  serviceId.value = service.id; serviceVisible.value = true; serviceDirty.value = false; return true
}
function serviceSaved() {
  const kind = selectedService.value?.type
  if (!restriction.value || !kind || !draft.value?.[kind]) return
  const saved = createAirSupplementDraft(order.value, state.airMaster)[kind]
  if (!saved) return
  draft.value[kind] = saved
  const baseline = JSON.parse(initial.value)
  baseline[kind] = JSON.parse(stringifyAirSupplementValue(saved))
  initial.value = JSON.stringify(baseline)
}
function goBooking() { return router.push({ path: '/fulfillment/booking', query: { order: order.value.id } }) }
function openParty(key) { if (restriction.value || !['shipper', 'consignee'].includes(key)) return false; party.value = key; partyText.value = draft.value[key] || ''; partyInitial.value = partyText.value; return true }
async function closeParty(done) {
  const version = contextVersion, key = party.value
  if (partyText.value !== partyInitial.value) {
    try { await ElMessageBox.confirm('尚未保存收发货人内容，是否放弃本次修改？', '放弃修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }) }
    catch { return false }
  }
  if (version !== contextVersion || key !== party.value) return false
  party.value = ''; if (typeof done === 'function') done(); return true
}
function saveParty() {
  if (restriction.value || partyError.value || !['shipper', 'consignee'].includes(party.value)) return false
  draft.value[party.value] = partyText.value.trim(); party.value = ''; return true
}
async function allowLeave() {
  if (busy.value) return false
  if (!dirty.value) return true
  const version = contextVersion
  busy.value = true
  try { await ElMessageBox.confirm('离开将丢弃尚未提交的补录内容，已保存分单仍保留。', '离开订单补录？', { confirmButtonText: '放弃未保存内容', cancelButtonText: '继续编辑', type: 'warning' }); return version === contextVersion }
  catch { return false }
  finally { busy.value = false }
}
function back() { return router.push({ path: '/fulfillment/air-orders', query: order.value ? { order: order.value.id } : {} }) }
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onBeforeRouteLeave(allowLeave)
onBeforeRouteUpdate(async (to, from) => {
  if (to.params.orderId === from.params.orderId && to.query.customs === from.query.customs && to.query.child === from.query.child && to.query.inspect === from.query.inspect) return true
  if (!await allowLeave()) return false
  hydrate()
  return true
})
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
function openHouse(child = null) {
  if (busy.value || !order.value || (!child && houseManagementRestriction.value) || (child && !children.value.includes(child))) return false
  childId.value = child?.id || ''; childDirty.value = false; childVisible.value = true; return true
}
function openCustomsSource() {
  if ((!customsDeclaration.value && !sourceDeclaration.value) || busy.value) return false
  if (!customsChildId.value) return true
  if (childVisible.value) return selectedChild.value?.id === customsChildId.value
  const child = children.value.find(row => row.id === customsChildId.value && !row.deleted)
  return child ? openHouse(child) : false
}
function returnToCustoms() {
  const declaration = sourceDeclaration.value || customsDeclaration.value
  if (!declaration) return false
  return router.push({ path: '/fulfillment/declarations', query: { service: declaration.id } })
}
watch(() => [route.params.orderId, customsRequestId.value, customsChildId.value, inspectingCustomsSource.value], openCustomsSource, { immediate: true, flush: 'post' })
watch(legacyCustomsSource, value => { if (value) router.replace(value.target) }, { immediate: true, flush: 'post' })
function openImport() { if (busy.value || houseManagementRestriction.value) return false; importIds.value = []; importVisible.value = true; return true }
function selectImports(rows) { importIds.value = rows.map(row => row.id) }
function importSelected() {
  if (houseManagementRestriction.value || !importIds.value.length || busy.value) return false
  busy.value = true; failure.value = ''
  try { importAirHouseBills(order.value.id, [...importIds.value]); importVisible.value = false; ElMessage.success('已引入所选子订单'); return true }
  catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
async function childAction(action, child) {
  if (houseManagementRestriction.value || busy.value || !children.value.some(row => row.id === child.id)) return false
  const source = order.value, identity = `${session.value.role}:${session.value.name}`
  busy.value = true; failure.value = ''
  try {
    await ElMessageBox.confirm(action === 'move' ? `将 ${child.orderNo} 移至子订单列表？服务状态与信息保持不变。` : `取消分单 ${child.orderNo}？暂存分单将移除。`, action === 'move' ? '移单确认' : '取消分单', { confirmButtonText: action === 'move' ? '确认移单' : '取消分单', cancelButtonText: '保留分单', type: 'warning' })
    if (source !== order.value || identity !== `${session.value.role}:${session.value.name}` || houseManagementRestriction.value) return false
    if (action === 'move') moveAirHouseBill(source.id, child.id)
    else cancelAirHouseBill(source.id, child.id)
    ElMessage.success(action === 'move' ? '已移至子订单列表' : '分单已取消'); return true
  } catch (error) { if (error instanceof Error) failure.value = error.message; return false }
  finally { busy.value = false }
}
function submit() {
  if (busy.value || !canSubmit.value || Object.keys(errors.value).length) return false
  busy.value = true; failure.value = ''
  try {
    saveAirSupplement(order.value.id, cloneAirSupplementValue(effectiveDraft.value))
    initial.value = stringifyAirSupplementValue(draft.value); childDirty.value = false
    ElMessage.success('补录已完成，订单待出提单')
    busy.value = false; back(); return true
  } catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
function saveCode() {
  if (busy.value || !canEditCode.value || !['', 'EAP', 'EAW'].includes(draft.value?.code)) return false
  busy.value = true; failure.value = ''
  try {
    saveAirOrderCode(order.value.id, draft.value.code)
    const saved = JSON.parse(initial.value); saved.code = draft.value.code; initial.value = JSON.stringify(saved)
    ElMessage.success('代码已保存'); return true
  } catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
</script>

<template>
  <div class="module-view supplement-view">
    <PageHeader :title="legacyCustomsSource ? '分单报关来源' : '订单补录'" :description="order && !legacyCustomsSource ? `${order.orderNo} · ${order.customer}` : ''"><template v-if="!legacyCustomsSource" #actions><el-button v-if="['待出提单', '已出提单', '已交单'].includes(order?.orderStatus)" @click="router.push(`/fulfillment/airway-bills/${order.id}`)">进入提单</el-button><el-button :icon="ArrowLeft" @click="back">返回主订单</el-button></template></PageHeader>
    <el-alert v-if="legacyCustomsSource" title="正在转到分单报关来源" type="info" :closable="false"><el-button link type="primary" @click="router.replace(legacyCustomsSource.target)">查看分单报关来源</el-button></el-alert>
    <el-empty v-else-if="!order" description="订单不存在或当前角色无权查看" />
    <template v-else-if="draft">
      <div class="order-context"><StatusTag :label="order.orderStatus" /><span>{{ order.origin }} / {{ order.destination }}</span><span>{{ display(order.waybillNo) }}</span><span>{{ display(order.flight) }} · {{ display(order.departureDate) }}</span></div>
      <el-alert v-if="restriction" :title="restrictionMessage" type="info" :closable="false" />
      <el-alert v-if="failure" :title="failure" type="error" :closable="false" role="alert" />
      <section v-if="customsDeclaration" class="supplement-section customs-notices" aria-label="报关材料补齐通知">
        <div class="section-actions"><h2>报关材料补齐通知</h2><div><el-button v-if="customsChildId" :disabled="busy" @click="openCustomsSource">查看通知分单</el-button><el-button :disabled="busy" @click="returnToCustoms">返回报关单</el-button></div></div>
        <p class="field-note">服务单号：{{ customsDeclaration.id }}<template v-if="customsDeclaration.housebillNo"> · 分单号：{{ customsDeclaration.housebillNo }}</template></p>
        <el-alert title="材料更新与保存规则待确认，当前仅可查看通知。要求补齐的材料更新并保存后任务才完成。" type="warning" :closable="false" />
        <el-table :data="customsRequests" row-key="id" aria-label="当前报关服务材料通知"><el-table-column prop="materialName" label="材料名称" min-width="150" /><el-table-column prop="content" label="通知内容" min-width="280" /><el-table-column prop="createdAt" label="接收时间" min-width="170" /><el-table-column label="处理状态" width="105"><template #default><el-tag type="warning">未完成</el-tag></template></el-table-column></el-table>
      </section>
      <section v-else-if="sourceDeclaration" class="supplement-section" aria-label="报关服务来源">
        <div class="section-actions"><h2>报关服务来源 · {{ sourceDeclaration.id }}</h2><div><el-button v-if="customsChildId" :disabled="busy" @click="openCustomsSource">查看来源分单</el-button><el-button :disabled="busy" @click="returnToCustoms">返回报关单</el-button></div></div>
        <p class="field-note">来源资料只读；{{ customsChildId ? '分单号：' + display(sourceDeclaration.housebillNo) : '订单号：' + display(sourceDeclaration.orderNo) }}</p>
      </section>
      <el-alert v-else-if="customsLinkError" :title="customsLinkError" type="warning" :closable="false" />
      <el-form :model="draft" label-position="top" class="supplement-form" @submit.prevent="submit">
        <section class="supplement-section" aria-labelledby="supplement-info-title">
          <h2 id="supplement-info-title">提单信息</h2>
          <el-form-item label="订单类型" :error="errors.orderType"><el-radio-group v-if="draft.orderType !== '合成主订单'" v-model="draft.orderType" :disabled="Boolean(restriction)" aria-label="订单类型"><el-radio-button value="直单">直单</el-radio-button><el-radio-button value="主单">主单</el-radio-button></el-radio-group><el-tag v-else>合成主订单</el-tag></el-form-item>
          <div class="supplement-grid">
            <el-form-item label="英文品名" required :error="errors.englishGoodsName"><el-input v-model="draft.englishGoodsName" maxlength="256" :readonly="Boolean(restriction)" aria-label="英文品名" /></el-form-item>
            <el-form-item label="唛头" :error="errors.marks"><el-input v-model="draft.marks" maxlength="256" :readonly="Boolean(restriction)" aria-label="唛头" /></el-form-item>
            <el-form-item label="海关申报价值" :error="errors.customsDeclaredValue"><el-input v-model="draft.customsDeclaredValue" :readonly="Boolean(restriction)" aria-label="海关申报价值" /></el-form-item>
            <el-form-item label="签发日期" :error="errors.issueDate"><el-date-picker v-model="draft.issueDate" value-format="YYYY-MM-DD" :disabled="Boolean(restriction)" aria-label="签发日期" /></el-form-item>
            <el-form-item v-for="field in [{ key: 'purchaseNo', label: '采购单号' }, { key: 'salesNo', label: '销售单号' }, { key: 'invoiceNo', label: '发票号' }]" :key="field.key" :label="field.label" :error="errors[field.key]"><el-input v-model="draft[field.key]" maxlength="50" :readonly="Boolean(restriction)" :aria-label="field.label" /></el-form-item>
            <el-form-item label="代码" :error="errors.code"><div class="code-field"><el-select v-model="draft.code" clearable :disabled="!canEditCode" aria-label="代码"><el-option value="EAP" /><el-option value="EAW" /></el-select><el-button v-if="restriction && canEditCode" :disabled="busy || Boolean(errors.code)" @click="saveCode">保存代码</el-button></div></el-form-item>
            <el-form-item label="随机文件" :error="errors.accompanyingDocuments"><el-select v-model="draft.accompanyingDocuments" multiple disabled placeholder="选项字典待确认" aria-label="随机文件" /></el-form-item>
            <el-form-item label="IATA CODE"><el-input :model-value="draft.iataCode || '基础数据未填写'" readonly aria-label="IATA CODE" /></el-form-item>
            <el-form-item label="ISSUING CARRIER" class="supplement-wide"><el-input :model-value="draft.issuingCarrier || '基础数据未填写'" readonly aria-label="ISSUING CARRIER" /></el-form-item>
            <el-form-item v-for="field in [{ key: 'shipper', label: '发货人' }, { key: 'consignee', label: '收货人' }]" :key="field.key" :label="field.label" required :error="errors[field.key]" class="supplement-wide"><div class="party-field"><el-input :model-value="draft[field.key]" readonly type="textarea" :rows="2" :aria-label="field.label" /><el-button :icon="EditPen" :disabled="Boolean(restriction)" :aria-label="`编辑${field.label}`" @click="openParty(field.key)">编辑</el-button></div></el-form-item>
          </div>
        </section>
        <section class="supplement-section" aria-labelledby="supplement-cargo-title">
          <h2 id="supplement-cargo-title">货物信息</h2>
          <dl class="cargo-summary"><div v-for="field in cargoFields" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ order[field.key] }} <small>{{ field.unit }}</small></dd></div><div><dt>中文品名</dt><dd>{{ display(order.goodsName) }}</dd></div></dl>
          <template v-if="hasHouseBills">
            <div class="section-actions"><h3>分单</h3><div><el-button :icon="Download" :disabled="Boolean(houseManagementRestriction) || busy" @click="openImport">引入子订单</el-button><el-button :icon="Plus" :disabled="Boolean(houseManagementRestriction) || busy" @click="openHouse()">分单</el-button></div></div>
            <p v-if="houseManagementRestriction" class="field-note">{{ houseManagementRestriction }}</p>
            <div class="cargo-reconciliation" aria-label="主分单预计货物对账"><span v-for="field in cargoFields" :key="field.key" :class="{ mismatch: Number(order[field.key]) !== cargoTotals[field.key] }">{{ field.label }}：分单 {{ cargoTotals[field.key] === null ? '待补全' : cargoTotals[field.key] }} / 主单 {{ order[field.key] }} {{ field.unit }}</span></div>
            <DataTableFrame :rows="children" :page-size="10" :page-sizes="[10]"><template #default="{ rows }"><el-table :data="rows" row-key="id" aria-label="主单下的分单" empty-text="尚未生成分单">
              <el-table-column prop="orderNo" label="子订单号" min-width="195" /><el-table-column prop="housebillNo" label="分单号" min-width="150" /><el-table-column prop="englishGoodsName" label="英文品名" min-width="170" show-overflow-tooltip /><el-table-column prop="pieces" label="预计件数" width="100" align="right" /><el-table-column prop="grossWeight" label="预计毛重 kg" width="120" align="right" /><el-table-column prop="volume" label="预计体积 m³" width="120" align="right" /><el-table-column label="状态" width="125"><template #default="{ row }"><StatusTag :label="row.orderStatus" /></template></el-table-column>
              <el-table-column label="操作" fixed="right" width="200"><template #default="{ row }"><el-button link type="primary" @click="openHouse(row)">{{ row.orderStatus === '子订单暂存' && !houseManagementRestriction ? '编辑' : '详情' }}</el-button><el-button link type="primary" :disabled="Boolean(houseManagementRestriction) || row.orderStatus === '已取消' || busy" @click="childAction('move', row)">移单</el-button><el-button link type="danger" :disabled="Boolean(houseManagementRestriction) || row.orderStatus !== '子订单暂存' || busy" @click="childAction('cancel', row)">取消</el-button></template></el-table-column>
            </el-table></template></DataTableFrame>
          </template>
          <p v-else-if="activeChildren.length" class="field-error">仍有 {{ activeChildren.length }} 条分单，请先移单或取消后再提交直单。</p>
        </section>
        <section class="supplement-section" aria-labelledby="existing-service-title">
          <h2 id="existing-service-title">已生成服务</h2>
          <el-table :data="order.services || []" aria-label="已生成订单服务" empty-text="暂无服务单据"><el-table-column prop="id" label="服务单号" min-width="190" /><el-table-column prop="name" label="服务" min-width="105" /><el-table-column label="状态" min-width="125"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column><el-table-column label="操作" min-width="280"><template #default="{ row }"><el-button v-if="row.type === 'booking'" link type="primary" @click="goBooking">查看订舱</el-button><template v-else><el-button v-if="row.status === '待服务'" link type="primary" :disabled="Boolean(serviceRestriction(row)) || busy" @click="openService(row)">修改</el-button><span v-if="serviceRestriction(row)" class="field-note">{{ serviceRestriction(row) }}</span></template><span v-if="row.resendCount" class="service-revision">已修改 {{ row.resendCount }} 次</span></template></el-table-column></el-table>
          <el-collapse class="existing-service-details"><el-collapse-item v-if="order.services?.some(row => row.type === 'pickup')" title="提货服务信息" name="pickup"><dl class="readonly-grid"><div v-for="[key, label] in originalPickupFields" :key="key"><dt>{{ label }}</dt><dd>{{ display(order.pickup?.[key]) }}</dd></div><div><dt>提货地区</dt><dd>{{ display(order.pickup?.region) }}</dd></div></dl></el-collapse-item><el-collapse-item v-if="order.services?.some(row => row.type === 'warehouse')" title="仓储服务信息" name="warehouse"><dl class="readonly-grid"><div><dt>仓储操作</dt><dd>{{ display(order.warehouseOperations) }}</dd></div></dl></el-collapse-item></el-collapse>
        </section>
        <section class="supplement-section" aria-labelledby="ground-service-title">
          <h2 id="ground-service-title">补录服务</h2>
          <div class="service-options"><template v-for="option in serviceOptions" :key="option.key"><el-checkbox v-if="draft.orderType === '直单' || !['customs', 'clearance'].includes(option.key)" v-model="draft.groundServices[option.key]" :disabled="Boolean(restriction)">{{ option.label }}</el-checkbox></template></div>
          <p v-if="hasHouseBills" class="field-note">关务、清关派送由各分单维护。</p>
          <div v-if="draft.groundServices.preallocation" class="preallocation-action"><el-button disabled>发送预配</el-button><span>服务生成时点与预定区间规则待确认</span></div>
          <div v-for="section in visibleSections" :key="section.key" class="service-section">
            <h3>{{ section.title }}</h3><AirServiceFields :kind="section.key" :model="draft" :read-model="effectiveDraft" :readonly="Boolean(restriction)" :errors="errors" :prefix="section.title" />
          </div>
        </section>
        <div v-if="Object.keys(errors).length && !restriction" class="form-errors" role="status"><span v-for="(error, key) in errors" :key="key">{{ error }}</span></div>
        <div class="supplement-actions"><el-button :disabled="busy" @click="back">取消</el-button><el-button v-if="canSubmit" type="primary" :loading="busy" :disabled="Object.keys(errors).length > 0" @click="submit">提交补录</el-button><el-button v-else-if="!houseManagementRestriction && hasHouseBills" type="primary" :icon="Plus" @click="openHouse()">分单</el-button></div>
      </el-form>
      <AirHouseBillDialog v-if="childOrder" v-model="childVisible" :order="childOrder" :child="selectedChild" :customs-context="selectedChild?.id === customsChildId ? customsContext : null" @dirty="childDirty = $event" />
      <AirServiceEditDialog v-model="serviceVisible" :order="order" :service="selectedService" @dirty="serviceDirty = $event" @saved="serviceSaved" />
      <el-dialog v-model="importVisible" title="引入同客户子订单" width="min(950px, 96vw)" align-center destroy-on-close :close-on-click-modal="false"><div class="import-context">{{ order.customer }}</div><DataTableFrame :rows="importCandidates" :page-size="10" :page-sizes="[10]" selectable :selected-count="importIds.length"><template #default="{ rows }"><el-table :data="rows" row-key="id" aria-label="可引入子订单" empty-text="无可引入的同客户子订单" @selection-change="selectImports"><el-table-column type="selection" width="45" reserve-selection /><el-table-column prop="orderNo" label="子订单号" min-width="190" /><el-table-column prop="housebillNo" label="分单号" min-width="150" /><el-table-column prop="pieces" label="预计件数" width="105" /><el-table-column prop="grossWeight" label="预计毛重 kg" width="125" /><el-table-column prop="volume" label="预计体积 m³" width="125" /><el-table-column prop="orderStatus" label="状态" min-width="125" /></el-table></template></DataTableFrame><template #footer><el-button :disabled="busy" @click="importVisible = false">取消</el-button><el-button type="primary" :disabled="!importIds.length || Boolean(houseManagementRestriction)" :loading="busy" @click="importSelected">引入所选</el-button></template></el-dialog>
      <el-dialog :model-value="Boolean(party)" :title="party === 'shipper' ? '编辑发货人' : '编辑收货人'" width="min(600px, 94vw)" align-center :close-on-click-modal="false" :before-close="closeParty"><el-form label-position="top"><el-form-item :label="party === 'shipper' ? '发货人' : '收货人'" required :error="partyError"><el-input v-model="partyText" type="textarea" :rows="8" maxlength="500" show-word-limit :aria-label="party === 'shipper' ? '发货人编辑内容' : '收货人编辑内容'" /></el-form-item></el-form><template #footer><el-button @click="closeParty">取消</el-button><el-button type="primary" :disabled="Boolean(partyError) || Boolean(restriction)" @click="saveParty">确定</el-button></template></el-dialog>
    </template>
  </div>
</template>

<style scoped>
.supplement-view { min-width: 0; }
.order-context { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 20px; color: var(--muted); }
.supplement-section { padding: 22px 0 10px; border-bottom: 1px solid var(--border); }
.supplement-section h2 { font-size: 16px; margin: 0 0 18px; }
.supplement-section h3 { font-size: 14px; margin: 18px 0 16px; }
.supplement-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(235px, 100%), 1fr)); gap: 0 22px; }
.supplement-grid > * { min-width: 0; }
.supplement-grid :deep(.el-select), .supplement-grid :deep(.el-date-editor) { width: 100%; }
.supplement-wide { grid-column: 1 / -1; }
.party-field { display: flex; width: 100%; align-items: start; gap: 10px; }
.party-field :deep(.el-textarea) { min-width: 0; flex: 1; }
.code-field { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; }
.code-field :deep(.el-select) { min-width: 0; flex: 1; }
.cargo-summary, .readonly-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 16px 22px; margin: 0 0 18px; }
.cargo-summary dt, .readonly-grid dt { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
.cargo-summary dd, .readonly-grid dd { margin: 0; overflow-wrap: anywhere; }
.cargo-summary dd { font-size: 17px; }
.cargo-summary small { font-size: 12px; color: var(--muted); }
.section-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.section-actions > div { display: flex; flex-wrap: wrap; gap: 8px; }
.section-actions :deep(.el-button + .el-button) { margin-left: 0; }
.cargo-reconciliation { display: flex; flex-wrap: wrap; gap: 12px 24px; margin-bottom: 16px; color: #287452; }
.cargo-reconciliation .mismatch, .field-error, .form-errors { color: var(--danger); }
.service-options { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.service-section { border-top: 1px solid var(--border); margin-top: 20px; }
.existing-service-details { margin: 16px 0; }
.preallocation-action { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 12px 0; color: var(--muted); }
.field-note { color: var(--muted); margin: 8px 0; }
.supplement-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 20px 0 12px; flex-wrap: wrap; }
.supplement-actions :deep(.el-button + .el-button) { margin-left: 0; }
.form-errors { display: grid; gap: 5px; margin: 18px 0 0; line-height: 1.6; }
.import-context { margin-bottom: 16px; font-weight: 600; }
.service-revision { margin-inline-start: 10px; color: var(--muted); font-size: 12px; }
</style>
