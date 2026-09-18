<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import StatusTag from '../components/StatusTag.vue'
import AirWaybillContactDialog from '../components/AirWaybillContactDialog.vue'
import AirWaybillSendDialog from '../components/AirWaybillSendDialog.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { createAirWaybillDraft, createAirWaybillDimension, createAirWaybillCharge, getAirWaybillChildren, getAirWaybillRows, getAirWaybillRestriction, getAirWaybillTotals, validateAirWaybillDraft, AIR_WAYBILL_CHARGE_CODES } from '../domain/airWaybills.js'

const route = useRoute(), router = useRouter()
const { state, airSession, saveAirWaybill, saveAirWaybillContact, deleteAirWaybillContact } = usePrototypeData()
const order = computed(() => state.airOrders.find(row => row.id === route.params.orderId))
const children = computed(() => getAirWaybillChildren(state, order.value?.id))
const childId = computed(() => typeof route.query.child === 'string' ? route.query.child : '')
const child = computed(() => children.value.find(row => row.id === childId.value) || null)
const entity = computed(() => childId.value ? child.value : order.value)
const draft = ref(null), baseline = ref(''), failure = ref(''), busy = ref(false)
const contactVisible = ref(false), contactKey = ref('shipper'), contactDirty = ref(false)
const sendVisible = ref(false), selection = ref([]), formatVisible = ref(false), formats = ref([]), outputAction = ref('预览')
let contextVersion = 0
const contextKey = computed(() => `${order.value?.id}:${childId.value}:${contactKey.value}:${airSession.role}:${airSession.name}:${contextVersion}`)
const restriction = computed(() => getAirWaybillRestriction(order.value, airSession, { entity: entity.value }))
const dirty = computed(() => Boolean(draft.value && JSON.stringify(draft.value) !== baseline.value) || contactDirty.value)
const errors = computed(() => draft.value ? validateAirWaybillDraft({ ...draft.value, issueDate: draft.value.issueDate || '' }, state.airMaster) : {})
const totals = computed(() => getAirWaybillTotals(draft.value || {}))
const summary = computed(() => getAirWaybillRows(state).find(row => row.id === order.value?.id))
const sending = computed(() => [order.value, ...children.value].some(row => row?.waybillTransmission?.status === '发送中'))
const editable = computed(() => !restriction.value && !busy.value && !sending.value)
const canSend = computed(() => ['service', 'waybillClerk'].includes(airSession.role) && !dirty.value && !busy.value && !sending.value)
const formatOptions = computed(() => outputAction.value === '托运书预览' ? ['托运书'] : child.value ? ['分单（有格式）', '分单（无格式）'] : ['提单（有格式）', '中性提单（有格式）', '中性提单（无格式）', '中性提单（TPE）', '中性提单（电池）', 'UPS提单（有格式）', 'UPS提单（无格式）', '舱单'])
const textSections = [
  { title: '制单机构', fields: [['companyName', '公司全称', true], ['airlineName', '航司', true], ['iataCode', 'IATA CODE', true], ['accountNo', 'Account No', true]] },
  { title: '航程信息', fields: [['originName', '始发地全称'], ['firstDestination', '头程目的地'], ['firstLeg', '头程航段'], ['secondDestination', '二程目的地'], ['secondLeg', '二程航段'], ['thirdDestination', '三程目的地'], ['thirdLeg', '三程航段'], ['destinationName', '目的地全称'], ['flight', '头程航班号']] },
  { title: '结算与申报', fields: [['accountingInformation', 'Accounting Information'], ['currency', '币值'], ['wtVal', 'WT/VAL'], ['other', 'Other'], ['transportValue', '运输价值'], ['customsDeclaredValue', '海关申报价值'], ['insuranceAmount', 'Amount of Insurance'], ['handlingInfo', 'Handling Information']] },
]
const cargoFields = computed(() => [{ key: 'pieces', label: child.value ? '分单件数（件）' : '提单件数（件）', precision: 0 }, { key: 'grossWeight', label: child.value ? '分单毛重（kg）' : '提单毛重（kg）' }, { key: 'volume', label: '体积（m³）' }, { key: 'rate', label: child.value ? '分单运价' : '提单运价' }])
function display(value, digits) { return value === undefined || value === null || value === '' ? '未填写' : typeof value === 'number' && digits !== undefined ? value.toFixed(digits) : value }
function hydrate() {
  contextVersion += 1
  draft.value = order.value && entity.value ? createAirWaybillDraft(order.value, child.value, state.airMaster) : null
  baseline.value = JSON.stringify(draft.value)
  failure.value = ''; contactVisible.value = false; contactDirty.value = false; sendVisible.value = false; formatVisible.value = false; selection.value = []
}
watch([order, childId, () => `${airSession.role}:${airSession.name}`], hydrate, { immediate: true })
watch(contactVisible, value => { if (!value) contactDirty.value = false })
async function allowLeave() {
  if (busy.value || sending.value) return false
  if (!dirty.value) return true
  const version = contextVersion
  busy.value = true
  try { await ElMessageBox.confirm('离开将丢弃当前提单尚未暂存的内容。', '保留本次修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return version === contextVersion }
  catch { return false }
  finally { busy.value = false }
}
onBeforeRouteLeave(allowLeave)
onBeforeRouteUpdate((to, from) => to.params.orderId !== from.params.orderId || to.query.child !== from.query.child ? allowLeave() : true)
function beforeUnload(event) { if (dirty.value || sending.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
function switchBill(id) { return router.push({ path: `/fulfillment/airway-bills/${order.value.id}`, query: id ? { child: id } : {} }) }
function save(submit = false) {
  if (!editable.value || Object.keys(errors.value).length || contactVisible.value) return false
  busy.value = true; failure.value = ''
  try {
    saveAirWaybill(order.value.id, childId.value, JSON.parse(JSON.stringify(draft.value)), { submit })
    draft.value = createAirWaybillDraft(order.value, child.value, state.airMaster); baseline.value = JSON.stringify(draft.value)
    ElMessage.success(submit ? '提单已提交，主订单已出提单' : '提单已暂存'); return true
  } catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
function openContact(key) { if (!editable.value) return; contactKey.value = key; contactVisible.value = true }
function saveContact(payload, complete) {
  if (!editable.value || payload.contextKey !== contextKey.value) return complete({ ok: false, message: '当前提单已变化，请重新打开联系人' })
  try {
    if (payload.saveAsCommonContact) saveAirWaybillContact(payload.contact)
    draft.value[contactKey.value] = { ...payload.contact }; contactDirty.value = false
    complete({ ok: true })
  } catch (error) { complete({ ok: false, message: error.message }) }
}
function removeContact(id, complete) {
  if (!editable.value) return complete({ ok: false, message: '当前角色或订单状态不能维护联系人' })
  try { deleteAirWaybillContact(id); complete({ ok: true }) } catch (error) { complete({ ok: false, message: error.message }) }
}
function toggle(id, selected) {
  if (id === 'whole') selection.value = selected ? [{ orderId: order.value.id, childId: '' }, ...children.value.map(row => ({ orderId: order.value.id, childId: row.id }))] : []
  else {
    selection.value = selection.value.filter(row => row.childId !== id)
    if (selected) selection.value.push({ orderId: order.value.id, childId: id })
  }
}
function isSelected(id) { return selection.value.some(row => row.childId === id) }
function openOutput(action) { outputAction.value = action; formats.value = action === '托运书预览' ? ['托运书'] : []; formatVisible.value = true }
</script>

<template>
  <div class="module-view waybill-edit">
    <PageHeader :title="childId ? '分提单编辑' : '主提单编辑'" :description="order ? `${order.orderNo} · ${order.customer}` : ''"><template #actions><el-button @click="router.push('/fulfillment/airway-bills')">返回提单列表</el-button></template></PageHeader>
    <el-empty v-if="!draft" description="订单或分单不存在" />
    <template v-else>
      <div class="context-bar"><StatusTag :label="order.orderStatus" /><span>{{ order.waybillNo || '未绑定提单号' }}</span><span>预计 {{ order.pieces }} 件 / {{ order.grossWeight }} kg / {{ order.volume }} m³</span><span>当前编辑 {{ child?.housebillNo || '主单' }}</span></div>
      <div class="bill-tabs" aria-label="主分单切换"><el-button :type="!childId ? 'primary' : 'default'" @click="switchBill('')">主单</el-button><el-button v-for="item in children" :key="item.id" :type="childId === item.id ? 'primary' : 'default'" @click="switchBill(item.id)">{{ item.housebillNo || item.orderNo }}</el-button></div>
      <el-alert v-if="restriction" :title="restriction" type="info" :closable="false" />
      <el-alert v-if="failure" :title="failure" type="error" :closable="false" role="alert" />
      <el-form :model="draft" label-position="top" @submit.prevent="save(false)">
        <section class="bill-section"><h2>提单标识与收发货人</h2><div class="bill-grid">
          <el-form-item label="提单号"><el-input :model-value="draft.waybillNo" readonly aria-label="提单号" /></el-form-item>
          <el-form-item label="提单号前三位"><el-input :model-value="draft.waybillPrefix" readonly aria-label="提单号前三位" /></el-form-item>
          <el-form-item label="提单号后八位"><el-input :model-value="draft.waybillSuffix" readonly placeholder="位数口径待确认" aria-label="提单号后八位" /></el-form-item>
          <el-form-item v-if="child" label="分单号"><el-input :model-value="draft.housebillNo" readonly aria-label="分单号" /></el-form-item>
          <el-form-item label="始发地" required :error="errors.origin"><el-select v-model="draft.origin" filterable :disabled="!editable" aria-label="始发地"><el-option v-for="port in state.airMaster.ports" :key="port.id" :value="port.code" :label="`${port.code} · ${port.name}`" /></el-select></el-form-item>
          <el-form-item v-for="party in [{ key: 'shipper', label: '发货人' }, { key: 'consignee', label: '收货人' }]" :key="party.key" :label="party.label" class="wide"><div class="contact-field"><el-input :model-value="draft[party.key].printText" readonly type="textarea" :rows="3" :aria-label="party.label" /><el-button v-business-write="'airwayBills'" :disabled="!editable" @click="openContact(party.key)">编辑{{ party.label }}</el-button></div></el-form-item>
        </div></section>
        <section v-for="section in textSections" :key="section.title" class="bill-section"><h2>{{ section.title }}</h2><div class="bill-grid"><el-form-item v-for="[key, label, readOnly] in section.fields" :key="key" :label="label" :error="errors[key]"><el-input v-model="draft[key]" :readonly="readOnly || !editable" :aria-label="label" :type="key === 'handlingInfo' ? 'textarea' : 'text'" /></el-form-item>
          <el-form-item v-if="section.title === '结算与申报' && !child" label="折扣号"><el-input v-model="draft.discountNo" :readonly="!editable" aria-label="折扣号" /></el-form-item>
          <el-form-item v-if="section.title === '结算与申报' && !child" label="运费条款"><el-select v-model="draft.freightTerms" :disabled="!editable" aria-label="运费条款"><el-option value="FREIGHT PREPAID" /><el-option value="FREIGHT COLLECT" /></el-select></el-form-item>
        </div></section>
        <section class="bill-section"><h2>提单货物与运价</h2><p class="field-note">填写货站实测毛件体，暂存后同步至本单提单数据。预计货物数据单独保留。</p><div class="bill-grid">
          <el-form-item v-for="field in cargoFields" :key="field.key" :label="field.label" :error="errors[field.key]"><el-input-number v-model="draft[field.key]" :precision="field.precision" :min="0" :controls="false" :disabled="!editable" :aria-label="field.label" /></el-form-item>
          <el-form-item label="Kg lb"><el-input v-model="draft.weightCode" :readonly="!child || !editable" :placeholder="child ? '' : 'M / Q / N 自动判级待确认'" aria-label="Kg lb" /></el-form-item>
          <el-form-item label="提单计费重（kg）"><el-input :model-value="display(totals.chargeWeight, 1)" readonly aria-label="提单计费重" /></el-form-item>
          <el-form-item label="计费总价"><el-input :model-value="display(totals.freightTotal, 2)" readonly aria-label="计费总价" /></el-form-item>
          <el-form-item label="英文品名" class="wide"><el-input v-model="draft.englishGoodsName" :readonly="!editable" type="textarea" :rows="2" aria-label="英文品名" /></el-form-item>
          <el-form-item v-if="child" label="唛头"><el-input :model-value="draft.marks" readonly aria-label="唛头" /></el-form-item>
          <el-form-item v-else label="主单签发日期" :error="errors.issueDate"><el-date-picker v-model="draft.issueDate" value-format="YYYY-MM-DD" :disabled="!editable" aria-label="主单签发日期" /></el-form-item>
        </div><p class="field-note">计费重 = 毛重与体积 × 166.66 的较大值，向上取至 0.5 kg；运价暂按人工填写值计算。M 最低收费与自动判级口径待确认。</p></section>
        <section class="bill-section"><div class="section-heading"><h2>体积明细</h2><el-button :disabled="!editable" @click="draft.dimensions.push(createAirWaybillDimension())">添加尺寸行</el-button></div><div class="table-wrap"><el-table :data="draft.dimensions" max-height="340" aria-label="体积明细"><el-table-column type="index" width="55" /><el-table-column v-for="[key, label] in [['length', '长（cm）'], ['width', '宽（cm）'], ['height', '高（cm）'], ['pieces', '件数']]" :key="key" :label="label" min-width="150"><template #default="{ row, $index }"><el-input-number v-model="row[key]" :min="0" :precision="key === 'pieces' ? 0 : undefined" :controls="false" :disabled="!editable" :aria-label="`尺寸第${$index + 1}行${label}`" /><span class="field-error">{{ errors[`dimensions.${$index}.${key}`] }}</span></template></el-table-column><el-table-column label="操作" width="85"><template #default="{ $index }"><el-button link type="danger" :disabled="!editable" :aria-label="`删除尺寸第${$index + 1}行`" @click="draft.dimensions.splice($index, 1)">删除</el-button></template></el-table-column></el-table></div><div class="totals"><span>总件数 {{ display(totals.dimensionPieces) }}</span><span>总体积 {{ display(totals.dimensionVolume, 2) }} m³</span></div></section>
        <section class="bill-section"><div class="section-heading"><h2>杂费明细</h2><el-button :disabled="!editable" @click="draft.charges.push(createAirWaybillCharge())">添加杂费</el-button></div><p v-if="!child" class="field-note">默认杂费项尚未配置，可手工添加。</p><div class="table-wrap"><el-table :data="draft.charges" aria-label="杂费明细" empty-text="尚无杂费"><el-table-column label="杂费代码" min-width="150"><template #default="{ row, $index }"><el-select v-model="row.code" :disabled="!editable" :aria-label="`杂费第${$index + 1}行代码`"><el-option v-for="code in AIR_WAYBILL_CHARGE_CODES" :key="code" :value="code" /></el-select><span class="field-error">{{ errors[`charges.${$index}.code`] }}</span></template></el-table-column><el-table-column v-for="[key, label] in [['unitPrice', '单价'], ['quantity', '计费数量']]" :key="key" :label="label" min-width="150"><template #default="{ row, $index }"><el-input-number v-model="row[key]" :min="0" :controls="false" :disabled="!editable" :aria-label="`杂费第${$index + 1}行${label}`" /></template></el-table-column><el-table-column label="小计" min-width="100"><template #default="{ $index }">{{ display(totals.chargeRows[$index]?.subtotal, 2) }}</template></el-table-column><el-table-column label="操作" width="85"><template #default="{ $index }"><el-button link type="danger" :disabled="!editable" @click="draft.charges.splice($index, 1)">删除</el-button></template></el-table-column></el-table></div><div class="totals"><span>杂费总和 {{ display(totals.chargesTotal, 2) }}</span><span>总价：合成口径待确认</span></div></section>
        <div v-if="Object.keys(errors).length" class="field-error" role="alert">{{ [...new Set(Object.values(errors))].join('；') }}</div>
        <div class="edit-actions"><span v-if="dirty" class="field-note">有未暂存的修改</span><el-button @click="openOutput('托运书预览')">托运书预览</el-button><el-button @click="openOutput('预览')">预览</el-button><el-button @click="openOutput('下载')">下载</el-button><el-button v-business-write="'airwayBills'" :disabled="!editable || Boolean(Object.keys(errors).length)" @click="save(false)">暂存</el-button><el-button v-business-write="'airwayBills'" type="primary" :disabled="!editable || Boolean(Object.keys(errors).length)" @click="save(true)">提交</el-button></div>
      </el-form>
      <section class="bill-section"><div class="section-heading"><h2>航司发送</h2><el-button v-business-write="'airwayBills'" type="primary" :disabled="!canSend || !selection.length" @click="sendVisible = true">批量发送运单</el-button></div><p v-if="dirty" class="field-note">请先暂存当前修改，再发送运单。</p>
        <el-checkbox :model-value="selection.length === children.length + 1" :indeterminate="selection.length > 0 && selection.length < children.length + 1" :disabled="sending" @change="toggle('whole', $event)">选择整票（主单及全部分单）</el-checkbox>
        <div class="table-wrap"><el-table :data="[order]" aria-label="主单发送信息"><el-table-column width="70"><template #default><el-checkbox :model-value="isSelected('')" :disabled="sending" aria-label="仅选择主单" @change="toggle('', $event)" /></template></el-table-column><el-table-column prop="waybillNo" label="提单号" min-width="150" /><el-table-column label="发送航司提单状态" min-width="180"><template #default="{ row }"><StatusTag :label="row.waybillTransmission?.status || '待发送'" /><p v-if="row.waybillTransmission?.error" class="field-error">{{ row.waybillTransmission.error }}</p></template></el-table-column><el-table-column prop="flight" label="头程航班" min-width="120" /><el-table-column v-for="[key, label] in [['pieces', '提单件数'], ['grossWeight', '提单重量 kg'], ['volume', '提单体积 m³']]" :key="key" :label="label" min-width="120"><template #default="{ row }">{{ display(row.waybill?.[key]) }}</template></el-table-column></el-table></div>
        <div class="totals"><span>分单 {{ children.length }} 票</span><span>总件数 {{ display(summary?.childCargo.pieces) }}</span><span>总重量 {{ display(summary?.childCargo.grossWeight) }} kg</span><span>总体积 {{ display(summary?.childCargo.volume) }} m³</span><span>分单总状态：{{ summary?.childSendStatus || summary?.childSendReason || '无分单' }}</span></div>
        <div class="table-wrap"><el-table :data="children" aria-label="分单发送明细" empty-text="本票无分单"><el-table-column width="70"><template #default="{ row }"><el-checkbox :model-value="isSelected(row.id)" :disabled="sending" :aria-label="`选择分单${row.housebillNo}`" @change="toggle(row.id, $event)" /></template></el-table-column><el-table-column prop="housebillNo" label="分单号" min-width="150" /><el-table-column label="发送航司分单子状态" min-width="180"><template #default="{ row }"><StatusTag :label="row.waybillTransmission?.status || '待发送'" /><p v-if="row.waybillTransmission?.error" class="field-error">{{ row.waybillTransmission.error }}</p></template></el-table-column><el-table-column v-for="[key, label] in [['pieces', '分单件数'], ['grossWeight', '分单重量 kg'], ['volume', '分单体积 m³']]" :key="key" :label="label" min-width="120"><template #default="{ row }">{{ display(row.waybill?.[key]) }}</template></el-table-column></el-table></div>
      </section>
      <AirWaybillContactDialog v-model:visible="contactVisible" :model-value="draft[contactKey]" :contacts="state.airWaybillContacts" :context-key="contextKey" :read-only="!editable" :display-label="child ? '分单信息展示区' : '提单信息展示区'" :title="contactKey === 'shipper' ? '发货人编辑' : '收货人编辑'" @dirty="contactDirty = $event" @save="saveContact" @delete-contact="removeContact" />
      <AirWaybillSendDialog v-model="sendVisible" :selection="selection" />
      <el-dialog v-model="formatVisible" :title="outputAction === '托运书预览' ? '托运书预览' : `${child ? '分单' : '提单'}格式选择`" width="min(620px, 94vw)"><el-checkbox-group v-model="formats" class="format-options"><el-checkbox v-for="format in formatOptions" :key="format" :value="format">{{ format }}</el-checkbox></el-checkbox-group><el-alert v-if="formats.length" title="尚无已完成配置的业务模板，暂不能生成所选文件。模板字段映射与输出规则待确认。" type="warning" :closable="false" /><template #footer><el-button @click="formatVisible = false">关闭</el-button><el-button @click="router.push('/fulfillment/airway-bill-templates')">查看模板管理</el-button><el-button type="primary" disabled>{{ outputAction }}</el-button></template></el-dialog>
    </template>
  </div>
</template>

<style scoped>
.waybill-edit { min-width: 0; }
.context-bar, .bill-tabs, .totals, .section-heading, .edit-actions { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
.context-bar, .bill-tabs { margin-bottom:16px; }
.bill-tabs :deep(.el-button + .el-button), .edit-actions :deep(.el-button + .el-button) { margin-left:0; }
.bill-section { margin:16px 0; padding:20px; background:white; border:1px solid var(--border); border-radius:12px; min-width:0; }
.bill-section h2 { margin:0 0 18px; font-size:17px; }
.bill-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0 20px; }
.wide { grid-column:span 2; }
.bill-grid :deep(.el-input-number), .bill-grid :deep(.el-date-editor) { width:100%; }
.contact-field { display:flex; gap:10px; width:100%; align-items:start; }
.table-wrap { overflow-x:auto; }
.table-wrap :deep(.el-input-number) { width:100%; }
.section-heading { justify-content:space-between; margin-bottom:12px; }
.section-heading h2 { margin:0; }
.field-note { color:var(--muted); font-size:13px; line-height:1.7; }
.field-error { color:var(--danger); font-size:12px; display:block; }
.totals { margin-top:16px; font-size:13px; }
.edit-actions { justify-content:flex-end; padding:16px 0; }
.format-options { display:flex; flex-direction:column; margin-bottom:20px; }
@media(max-width:1000px) { .bill-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:620px) { .bill-grid { grid-template-columns:minmax(0,1fr); } .wide { grid-column:auto; } .bill-section { padding:14px; } .contact-field { flex-direction:column; } }
</style>
