<script setup>
import { computed, ref, unref, watch } from 'vue'
import { EditPen } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePrototypeData } from '../data/usePrototypeData.js'
import AirServiceFields from './AirServiceFields.vue'
import AirServiceEditDialog from './AirServiceEditDialog.vue'
import StatusTag from './StatusTag.vue'
import { AIR_FREIGHT_TERMS, AIR_HOUSE_CURRENCIES, cloneAirSupplementValue, stringifyAirSupplementValue, createHouseBillDraft, normalizeHouseBillDraft, validateHouseBillDraft, getHouseBillEditRestriction } from '../domain/airOrderSupplement.js'
import { getAirServiceEditRestriction } from '../domain/airServiceEditing.js'

const props = defineProps({ modelValue: Boolean, order: { type: Object, required: true }, child: { type: Object, default: null }, customsContext: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue', 'saved', 'dirty'])
const { airChildSession, airCatalog, saveAirHouseBill } = usePrototypeData()
const session = computed(() => unref(airChildSession))
const draft = ref(createHouseBillDraft(props.order))
const initial = ref('')
const busy = ref(false)
const failure = ref('')
const party = ref('')
const partyText = ref('')
const partyInitial = ref('')
const serviceVisible = ref(false)
const serviceId = ref('')
const serviceDirty = ref(false)
const selectedService = computed(() => props.child?.serviceRecords?.find(row => row.id === serviceId.value) || null)
const restriction = computed(() => getHouseBillEditRestriction(props.order, props.child, session.value))
const errors = computed(() => restriction.value ? {} : validateHouseBillDraft(draft.value, airCatalog.value))
const serviceReadModel = computed(() => normalizeHouseBillDraft(draft.value, props.child ? { ...props.order, ...props.child, booking: props.order.booking, waybillNo: props.order.waybillNo } : props.order))
const dirty = computed(() => props.modelValue && (stringifyAirSupplementValue(draft.value) !== initial.value || serviceDirty.value || (party.value && partyText.value !== partyInitial.value)))
let contextVersion = 0
const partyError = computed(() => !partyText.value.trim() ? '必填' : partyText.value.trim().length > 500 ? '最多 500 个字符' : '')
const cargoFields = [{ key: 'pieces', label: '预计件数（件）', precision: 0 }, { key: 'grossWeight', label: '预计毛重（kg）', precision: 2 }, { key: 'volume', label: '预计体积（m³）', precision: 2 }]
const serviceSections = [{ key: 'pickup', title: '提货信息' }, { key: 'warehouse', title: '仓储操作' }, { key: 'customs', title: '关务信息' }, { key: 'clearance', title: '清关派送信息' }]
watch(() => props.modelValue, visible => {
  contextVersion += 1
  if (!visible) return
  draft.value = createHouseBillDraft(props.child || props.order)
  initial.value = stringifyAirSupplementValue(draft.value)
  failure.value = ''; party.value = ''; serviceVisible.value = false; serviceDirty.value = false
}, { immediate: true })
watch(dirty, value => emit('dirty', Boolean(value)), { immediate: true })
watch(() => `${session.value.role}:${session.value.name}`, () => { contextVersion += 1; party.value = ''; serviceVisible.value = false; emit('update:modelValue', false) })
watch(serviceVisible, visible => { if (!visible) serviceDirty.value = false })
function serviceRestriction(service) { return getAirServiceEditRestriction(props.order, service, session.value, props.child) }
function openService(service) {
  if (busy.value || serviceRestriction(service) || !props.child?.serviceRecords?.includes(service)) return false
  serviceId.value = service.id; serviceVisible.value = true; serviceDirty.value = false; return true
}
function serviceSaved() {
  if (!restriction.value) return
  draft.value = createHouseBillDraft(props.child || props.order)
  initial.value = stringifyAirSupplementValue(draft.value)
}
function openParty(key) {
  if (restriction.value || !['shipper', 'consignee'].includes(key)) return false
  party.value = key; partyText.value = draft.value[key] || ''; partyInitial.value = partyText.value
}
async function closeParty(done) {
  const version = contextVersion, key = party.value
  if (partyText.value !== partyInitial.value) {
    try { await ElMessageBox.confirm('尚未保存收发货人内容，是否放弃本次修改？', '放弃修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }) }
    catch { return false }
  }
  if (version !== contextVersion || key !== party.value) return false
  party.value = ''
  if (typeof done === 'function') done()
  return true
}
function saveParty() {
  if (restriction.value || partyError.value || !['shipper', 'consignee'].includes(party.value)) return false
  draft.value[party.value] = partyText.value.trim(); party.value = ''; return true
}
async function close(done) {
  if (busy.value) return false
  const version = contextVersion
  busy.value = true
  try {
  if (dirty.value) {
    try { await ElMessageBox.confirm('关闭将丢弃尚未保存的分单内容。', '放弃分单修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }) }
    catch { return false }
  }
  if (version !== contextVersion) return false
  party.value = ''
  emit('update:modelValue', false)
  if (typeof done === 'function') done()
  return true
  } finally { busy.value = false }
}
function save() {
  if (busy.value || restriction.value || Object.keys(errors.value).length) return false
  busy.value = true; failure.value = ''
  try {
    const saved = saveAirHouseBill(props.order.id, props.child?.id || null, cloneAirSupplementValue(draft.value))
    initial.value = stringifyAirSupplementValue(draft.value)
    emit('update:modelValue', false); emit('saved', saved)
    ElMessage.success('分单已保存'); return true
  } catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
</script>

<template>
  <el-dialog :model-value="modelValue" :title="child ? '分单详情' : '新增分单'" width="min(960px, 96vw)" class="house-bill-dialog" align-center destroy-on-close :close-on-click-modal="false" :before-close="close" @update:model-value="emit('update:modelValue', $event)">
    <div class="house-context"><strong>{{ child?.orderNo || '新分单' }}</strong><span>{{ order.customer }}</span><el-tag v-if="child" size="small">{{ child.orderStatus }}</el-tag></div>
    <el-alert v-if="restriction" :title="restriction" type="info" :closable="false" />
    <el-alert v-if="failure" :title="failure" type="error" :closable="false" role="alert" />
    <section v-if="customsContext?.requests?.length" class="house-services" aria-label="分单报关材料补齐通知">
      <h3>报关材料补齐通知 · {{ customsContext.serviceId }}</h3>
      <el-alert title="材料更新与保存规则待确认。查看或保存其他分单信息不会完成报关材料待办。" type="warning" :closable="false" />
      <el-table :data="customsContext.requests" row-key="id" aria-label="分单报关材料通知"><el-table-column prop="materialName" label="材料名称" min-width="140" /><el-table-column prop="content" label="通知内容" min-width="250" /><el-table-column prop="createdAt" label="接收时间" min-width="170" /><el-table-column label="处理状态" width="100"><template #default><el-tag type="warning">未完成</el-tag></template></el-table-column></el-table>
    </section>
    <el-form :model="draft" label-position="top" class="house-form" :disabled="Boolean(restriction)" @submit.prevent="save">
      <h3>提单资料</h3>
      <div class="house-grid">
        <el-form-item label="分单号" :error="errors.housebillNo"><el-input v-model="draft.housebillNo" maxlength="12" placeholder="选填，暂存时生成" aria-label="分单号" /></el-form-item>
        <el-form-item label="英文品名" required :error="errors.englishGoodsName"><el-input v-model="draft.englishGoodsName" maxlength="256" aria-label="分单英文品名" /></el-form-item>
        <el-form-item label="唛头" :error="errors.marks"><el-input v-model="draft.marks" maxlength="256" aria-label="分单唛头" /></el-form-item>
        <el-form-item label="海关申报价值" :error="errors.customsDeclaredValue"><el-input v-model="draft.customsDeclaredValue" aria-label="分单海关申报价值" /></el-form-item>
        <el-form-item v-for="item in [{ key: 'shipper', label: '发货人' }, { key: 'consignee', label: '收货人' }]" :key="item.key" :label="item.label" required :error="errors[item.key]" class="house-wide">
          <div class="party-field"><el-input :model-value="draft[item.key]" readonly type="textarea" :rows="2" :aria-label="`分单${item.label}`" /><el-button v-business-write="'airOrders'" :icon="EditPen" :aria-label="`编辑分单${item.label}`" @click="openParty(item.key)">编辑</el-button></div>
        </el-form-item>
      </div>
      <h3>预计货物</h3>
      <div class="house-grid"><el-form-item v-for="field in cargoFields" :key="field.key" :label="field.label" required :error="errors[field.key]"><el-input-number v-model="draft[field.key]" :precision="field.precision" :min="field.precision ? 0.01 : 1" controls-position="right" :aria-label="`分单${field.label}`" /></el-form-item></div>
      <h3>计费与目的港</h3>
      <div class="house-grid">
        <el-form-item label="币种" :error="errors.currency"><el-select v-model="draft.currency" clearable aria-label="分单币种" placeholder="选填"><el-option v-for="value in AIR_HOUSE_CURRENCIES" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="运费条款" required :error="errors.freightTerms"><el-select v-model="draft.freightTerms" aria-label="分单运费条款"><el-option v-for="value in AIR_FREIGHT_TERMS" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="杂费预付到付" required :error="errors.otherCharges"><el-input :model-value="draft.otherCharges" readonly aria-label="分单杂费预付到付" /><span class="field-note">其他选项待确认</span></el-form-item>
        <el-form-item label="付费方式" required :error="errors.paymentMethod"><el-input :model-value="draft.paymentMethod" readonly aria-label="分单付费方式" /><span class="field-note">其他选项待确认</span></el-form-item>
        <el-form-item label="费率（公布运价）" :error="errors.rate"><el-input-number v-model="draft.rate" :min="1" :max="100" controls-position="right" aria-label="分单费率" /></el-form-item>
        <el-form-item label="目的港" :error="errors.destination"><el-select v-model="draft.destination" filterable clearable aria-label="分单目的港" placeholder="选填"><el-option v-for="port in airCatalog.ports" :key="port.code" :label="`${port.code} · ${port.name}`" :value="port.code" /></el-select></el-form-item>
        <el-form-item label="仓库操作要求" :error="errors.warehouseInstruction" class="house-wide"><el-input v-model="draft.warehouseInstruction" type="textarea" maxlength="256" :rows="2" aria-label="仓库操作要求" /></el-form-item>
      </div>
      <h3>服务选择</h3>
      <div class="service-options"><el-checkbox v-model="draft.services.pickup">提货</el-checkbox><el-checkbox v-model="draft.services.warehouse">仓储</el-checkbox><el-checkbox v-model="draft.services.customs">关务</el-checkbox><el-checkbox v-model="draft.services.clearance">清关派送</el-checkbox></div>
      <template v-for="section in serviceSections" :key="section.key"><template v-if="draft.services[section.key]"><h4>{{ section.title }}</h4><AirServiceFields :kind="section.key" :model="draft" :read-model="serviceReadModel" :readonly="Boolean(restriction)" :errors="errors" prefix="分单" /></template></template>
      <div v-if="Object.keys(errors).length" class="form-errors" role="status"><span v-for="(error, key) in errors" :key="key">{{ error }}</span></div>
    </el-form>
    <section v-if="child?.serviceRecords?.length" class="house-services" aria-label="分单已生成服务"><h3>已生成服务</h3><el-table :data="child.serviceRecords" aria-label="分单服务单据"><el-table-column prop="id" label="服务单号" min-width="180" /><el-table-column prop="name" label="服务" min-width="100" /><el-table-column label="状态" min-width="120"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column><el-table-column label="操作" min-width="250"><template #default="{ row }"><el-button v-if="row.status === '待服务'" link type="primary" :disabled="Boolean(serviceRestriction(row))" @click="openService(row)">修改</el-button><span v-if="serviceRestriction(row)" class="field-note">{{ serviceRestriction(row) }}</span><span v-if="row.resendCount" class="field-note">已修改 {{ row.resendCount }} 次</span></template></el-table-column></el-table></section>
    <template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button v-business-write="'airOrders'" v-if="!restriction" type="primary" :loading="busy" :disabled="Object.keys(errors).length > 0" @click="save">保存分单</el-button></template>
    <el-dialog :model-value="Boolean(party)" :title="party === 'shipper' ? '编辑分单发货人' : '编辑分单收货人'" width="min(580px, 94vw)" align-center append-to-body :close-on-click-modal="false" :before-close="closeParty">
      <el-form label-position="top"><el-form-item :label="party === 'shipper' ? '发货人' : '收货人'" required :error="partyError"><el-input v-model="partyText" type="textarea" :rows="8" maxlength="500" show-word-limit :aria-label="party === 'shipper' ? '分单发货人编辑内容' : '分单收货人编辑内容'" /></el-form-item></el-form>
      <template #footer><el-button @click="closeParty">取消</el-button><el-button v-business-write="'airOrders'" type="primary" :disabled="Boolean(partyError) || Boolean(restriction)" @click="saveParty">确定</el-button></template>
    </el-dialog>
    <AirServiceEditDialog v-model="serviceVisible" :order="order" :service="selectedService" :child="child" @dirty="serviceDirty = $event" @saved="serviceSaved" />
  </el-dialog>
</template>

<style scoped>
.house-context { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
.house-form h3 { margin: 24px 0 16px; border-bottom: 1px solid var(--border); padding-bottom: 10px; font-size: 15px; }
.house-form h4 { margin: 18px 0 14px; font-size: 14px; }
.house-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr)); gap: 0 20px; }
.house-grid > * { min-width: 0; }
.house-wide { grid-column: 1 / -1; }
.house-grid :deep(.el-select), .house-grid :deep(.el-date-editor), .house-grid :deep(.el-input-number), .house-grid :deep(.el-cascader) { width: 100%; }
.party-field { display: flex; gap: 10px; align-items: start; width: 100%; }
.party-field :deep(.el-textarea) { min-width: 0; flex: 1; }
.service-options { margin: 0 0 18px; display: flex; flex-wrap: wrap; gap: 8px; }
.field-note { color: var(--muted); font-size: 12px; }
.form-errors { display: grid; gap: 4px; color: var(--danger); line-height: 1.6; }
.house-services { margin-top: 24px; }
.house-services h3 { font-size: 15px; }
</style>
