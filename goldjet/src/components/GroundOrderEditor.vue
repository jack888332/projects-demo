<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { AIR_PICKUP_REGIONS } from '../domain/airOperations.js'
import { GROUND_SPECIAL_TYPES } from '../domain/groundOperations.js'
import { GROUND_BUSINESS_TYPES, GROUND_CARGO_FIELDS, createGroundOrderDraft, createGroundPoint, createGroundContact, groundCustomers, groundContactChoices, groundOrderPermissions, validateGroundOrderDraft } from '../domain/groundOrders.js'

const emit = defineEmits(['saved'])
const { state, groundSession, saveGroundOrder } = usePrototypeData()
const visible = ref(false), editingId = ref(''), draft = ref(createGroundOrderDraft()), initial = ref(''), busy = ref(false)
const precise = reactive({ pickup: false, delivery: false })
const existing = computed(() => state.groundOrders.find(row => row.id === editingId.value))
const customers = computed(() => groundCustomers(state))
const permissions = computed(() => groundOrderPermissions(existing.value, groundSession.role))
const remarkOnly = computed(() => Boolean(editingId.value) && !permissions.value.fullEdit)
const contacts = computed(() => groundContactChoices(state.partners.find(row => row.id === draft.value.customerPartnerId)))
const errors = computed(() => {
  const result = validateGroundOrderDraft(draft.value, customers.value, { remarkOnly: remarkOnly.value })
  if (existing.value) draft.value.pickupPoints.forEach((point, index) => {
    if (point.regulated === createGroundOrderDraft(existing.value).pickupPoints[index]?.regulated) delete result[`pickupPoints.${index}.regulated`]
  })
  if (!remarkOnly.value) for (const kind of ['pickup', 'delivery']) if (precise[kind] && draft.value[kind + 'Time']?.length !== 16) result[kind + 'Time'] = '请选择具体日期和时间'
  return result
})
function open(order) {
  const access = groundOrderPermissions(order, groundSession.role)
  if (order ? !access.edit : !access.create) return
  editingId.value = order?.id || ''; draft.value = createGroundOrderDraft(order)
  for (const kind of ['pickup', 'delivery']) precise[kind] = draft.value[kind + 'Time'].length > 10
  initial.value = JSON.stringify(draft.value); visible.value = true
}
async function allowDiscard() {
  if (!visible.value || initial.value === JSON.stringify(draft.value)) return true
  try { await ElMessageBox.confirm('尚有未保存的订单信息，确认放弃？', '放弃修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true } catch { return false }
}
async function close(done) { if (busy.value || !await allowDiscard()) return; visible.value = false; if (typeof done === 'function') done() }
async function chooseCustomer(id) {
  if (draft.value.customerContacts.some(row => row.name || row.phone || row.email)) {
    try { await ElMessageBox.confirm('更换委托方将清空当前联系人，是否继续？', '更换委托方', { confirmButtonText: '更换', cancelButtonText: '取消' }) } catch { return }
  }
  const partner = customers.value.find(row => row.id === id)
  draft.value.customerPartnerId = id; draft.value.customer = partner?.name || ''; draft.value.customerContacts = []
}
function changeRegion(point, value) { [point.province, point.city, point.district] = value || ['', '', ''] }
function submit() {
  if (busy.value || Object.keys(errors.value).length) return
  busy.value = true
  try {
    const order = saveGroundOrder(draft.value, editingId.value)
    visible.value = false; ElMessage.success(editingId.value ? '已保存成功！' : '已提交成功！'); emit('saved', order)
  } catch (error) { ElMessage.error(error.message) } finally { busy.value = false }
}
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(async () => { if (!await allowDiscard()) return false; visible.value = false; return true })
watch(() => [groundSession.role, groundSession.name, state.groundOrders], () => { visible.value = false }, { flush: 'sync' })
defineExpose({ open, allowDiscard })
</script>

<template>
  <el-dialog v-model="visible" :title="editingId ? '修改运输订单' : '新建运输订单'" width="min(1080px, 96vw)" align-center destroy-on-close :close-on-click-modal="false" :before-close="close">
    <el-alert v-if="remarkOnly" title="已调度或异常中的手工订单仅可修改备注。" type="info" :closable="false" />
    <el-form label-position="top" @submit.prevent="submit">
      <fieldset :disabled="remarkOnly" class="order-fields">
        <h3>委托方信息</h3>
        <div class="order-grid">
          <el-form-item label="单号" required :error="errors.orderNo"><el-input v-model="draft.orderNo" :disabled="remarkOnly" aria-label="用车单号" /></el-form-item>
          <el-form-item label="委托方" required :error="errors.customer"><el-select :model-value="draft.customerPartnerId" :disabled="remarkOnly" filterable aria-label="用车委托方" @change="chooseCustomer"><el-option v-for="partner in customers" :key="partner.id" :label="partner.name" :value="partner.id" /></el-select></el-form-item>
          <el-form-item label="业务类型" required :error="errors.businessType"><el-select v-model="draft.businessType" :disabled="remarkOnly" aria-label="用车业务类型"><el-option v-for="value in GROUND_BUSINESS_TYPES" :key="value" :value="value" /></el-select></el-form-item>
        </div>
        <div class="section-heading"><h4>委托方联系人</h4><el-button :icon="Plus" :disabled="remarkOnly || !draft.customerPartnerId" @click="draft.customerContacts.push(createGroundContact())">联系人</el-button></div>
        <div v-for="(contact,index) in draft.customerContacts" :key="index" class="contact-row">
          <el-form-item label="姓名" :error="errors['customerContacts.'+index+'.name']"><el-autocomplete v-model="contact.name" :disabled="remarkOnly" :aria-label="'委托方联系人'+(index+1)+'姓名'" :fetch-suggestions="(query, callback) => callback(contacts.filter(row => row.name.includes(query)).map(row => ({value:row.name,record:row})))" @select="item => Object.assign(contact,item.record)" /></el-form-item>
          <el-form-item label="联系电话" :error="errors['customerContacts.'+index+'.phone']"><el-input v-model="contact.phone" :disabled="remarkOnly" maxlength="20" :aria-label="'委托方联系人'+(index+1)+'电话'" /></el-form-item>
          <el-form-item label="邮箱地址" :error="errors['customerContacts.'+index+'.email']"><el-input v-model="contact.email" :disabled="remarkOnly" maxlength="50" :aria-label="'委托方联系人'+(index+1)+'邮箱'" /></el-form-item>
          <el-tooltip content="移除此联系人"><el-button :icon="Delete" :disabled="remarkOnly" :aria-label="'移除联系人'+(index+1)" @click="draft.customerContacts.splice(index,1)" /></el-tooltip>
        </div>
        <h3>货物信息</h3>
        <div class="order-grid"><el-form-item v-for="[key,label] in GROUND_CARGO_FIELDS" :key="key" :label="label" :error="errors[key]"><el-input v-model="draft[key]" :disabled="remarkOnly" maxlength="10" :aria-label="'订单'+label" /></el-form-item></div>
        <section v-for="[kind,label] in [['pickup','提货'],['delivery','送货']]" :key="kind" class="point-section">
          <div class="section-heading"><h3>{{ label }}信息</h3><el-button :icon="Plus" :disabled="remarkOnly" @click="draft[kind+'Points'].push(createGroundPoint(draft[kind+'Points'][0]))">{{ label }}地点</el-button></div>
          <el-form-item :label="'期望'+label+'时间'" required :error="errors[kind+'Time']">
            <div class="time-row"><el-date-picker v-model="draft[kind+'Time']" :disabled="remarkOnly" :type="precise[kind] ? 'datetime' : 'date'" :value-format="precise[kind] ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'" :format="precise[kind] ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'" :aria-label="'期望'+label+'时间'" /><el-checkbox v-model="precise[kind]" :disabled="remarkOnly" @change="value => { if (!value) draft[kind+'Time'] = draft[kind+'Time']?.slice(0,10) || '' }">指定时分</el-checkbox></div>
          </el-form-item>
          <div v-for="(point,index) in draft[kind+'Points']" :key="index" class="point-row">
            <div class="section-heading"><h4>{{ label }}点 {{ index+1 }}</h4><el-tooltip v-if="index" content="移除此地点"><el-button :icon="Delete" :disabled="remarkOnly" :aria-label="'移除'+label+'点'+(index+1)" @click="draft[kind+'Points'].splice(index,1)" /></el-tooltip></div>
            <div class="order-grid">
              <el-form-item :label="label+'点'+(index+1)+'省市区'" required :error="errors[kind+'Points.'+index+'.province'] || errors[kind+'Points.'+index+'.city'] || errors[kind+'Points.'+index+'.district']"><el-cascader :model-value="[point.province,point.city,point.district].filter(Boolean)" :options="AIR_PICKUP_REGIONS" :disabled="remarkOnly" filterable clearable @update:model-value="value => changeRegion(point,value)" /></el-form-item>
              <el-form-item label="详细地址" required :error="errors[kind+'Points.'+index+'.address']"><el-input v-model="point.address" :disabled="remarkOnly" maxlength="200" :aria-label="label+'点'+(index+1)+'详细地址'" /></el-form-item>
              <el-form-item label="联系人" :error="errors[kind+'Points.'+index+'.contact']"><el-input v-model="point.contact" :disabled="remarkOnly" maxlength="50" :aria-label="label+'点'+(index+1)+'联系人'" /></el-form-item>
              <el-form-item label="联系电话" :error="errors[kind+'Points.'+index+'.phone']"><el-input v-model="point.phone" :disabled="remarkOnly" maxlength="20" :aria-label="label+'点'+(index+1)+'联系电话'" /></el-form-item>
              <template v-if="kind === 'pickup'">
                <el-form-item label="监管类型"><el-input :model-value="point.regulated" disabled placeholder="选项待确认" /></el-form-item>
                <el-form-item label="特种车"><el-select v-model="point.specialVehicle" :disabled="remarkOnly" clearable :aria-label="'提货点'+(index+1)+'特种车'"><el-option v-for="value in GROUND_SPECIAL_TYPES" :key="value" :value="value" /></el-select></el-form-item>
                <el-form-item label="是否尾板车"><el-select v-model="point.tailLift" :disabled="remarkOnly" clearable :aria-label="'提货点'+(index+1)+'尾板车'"><el-option v-for="value in ['是','否']" :key="value" :value="value" /></el-select></el-form-item>
              </template>
            </div>
          </div>
        </section>
      </fieldset>
      <el-form-item label="备注" :error="errors.remark"><el-input v-model="draft.remark" type="textarea" :rows="3" maxlength="800" show-word-limit aria-label="订单备注" /></el-form-item>
    </el-form>
    <template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button v-business-write="'groundDispatch'" type="primary" :loading="busy" :disabled="Object.keys(errors).length > 0" @click="submit">{{ editingId ? '保存订单' : '提交订单' }}</el-button></template>
  </el-dialog>
</template>

<style scoped>
.order-fields { border:0; padding:0; margin:0; min-width:0; }
h3 { font-size:16px; margin:20px 0 16px; } h4 { font-size:14px; margin:0; }
.order-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0 16px; }
.section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:12px 0; }
.section-heading h3 { margin:0; }
.point-section { border-top:1px solid var(--border); margin:20px 0; padding-top:4px; }
.point-row + .point-row { border-top:1px dashed var(--border); padding-top:12px; }
.contact-row { display:grid; grid-template-columns:1fr 1fr 1.4fr 34px; gap:12px; align-items:center; }
.time-row { display:flex; gap:16px; flex-wrap:wrap; max-width:100%; }
:deep(.el-select), :deep(.el-cascader), :deep(.el-autocomplete) { width:100%; }
@media (max-width:700px) { .order-grid,.contact-row { grid-template-columns:minmax(0,1fr); } .contact-row { border-bottom:1px solid var(--border); padding-bottom:12px; } }
</style>
