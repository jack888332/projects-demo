<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onBeforeRouteLeave } from 'vue-router'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { AIR_PRODUCTS, AIR_SALES, AIR_PICKUP_REGIONS, createAirDraft, validateAirDraft, getAirCredit, getAirContacts } from '../domain/airOperations.js'
import { calculateChargeWeight } from '../domain/chargeWeight.js'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue', 'created'])
const { state, airCatalog, createAirOrder } = usePrototypeData()
const draft = reactive(createAirDraft())
const initial = ref('')
const busy = ref(false)
const customer = computed(() => state.partners.find(p => p.name === draft.customer))
const customers = computed(() => state.partners.filter(p => p.type === '客户' && p.status === '已生效'))
const contacts = computed(() => getAirContacts(customer.value))
const errors = computed(() => validateAirDraft(draft, state.partners, airCatalog.value))
const credit = computed(() => getAirCredit(draft.customer, state.partners))
const chargeWeight = computed(() => calculateChargeWeight(draft.grossWeight, draft.volume))
function selectContact(name) {
  const contact = contacts.value.find(item => item.name === name)
  if (contact) Object.assign(draft, { contact: contact.name, phone: contact.phone, contactEmails: [...contact.emails] })
}
watch(() => props.modelValue, visible => {
  if (!visible) return
  Object.assign(draft, createAirDraft())
  initial.value = JSON.stringify(draft)
}, { immediate: true })

onBeforeRouteLeave(async () => {
  if (!props.modelValue || JSON.stringify(draft) === initial.value) return true
  try { await ElMessageBox.confirm('离开页面将丢弃尚未提交的主订单信息。', '放弃新建主订单？', { confirmButtonText: '放弃输入', cancelButtonText: '继续编辑', type: 'warning' }); return true }
  catch { return false }
})

async function close(done) {
  if (busy.value) return
  if (JSON.stringify(draft) !== initial.value) {
    try { await ElMessageBox.confirm('已填写内容尚未提交，关闭后将丢弃本次输入。', '放弃新建主订单？', { confirmButtonText: '放弃输入', cancelButtonText: '继续编辑', type: 'warning' }) }
    catch { return }
  }
  emit('update:modelValue', false)
  if (typeof done === 'function') done()
}
async function submit() {
  if (busy.value || Object.keys(errors.value).length) return
  busy.value = true
  try {
    const order = createAirOrder(JSON.parse(JSON.stringify(draft)))
    emit('update:modelValue', false)
    emit('created', order)
    ElMessage.success('已提交成功！')
  } catch (error) { ElMessage.error(error.message) }
  finally { busy.value = false }
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="新建主订单" width="min(980px, 96vw)" class="air-create-dialog" align-center destroy-on-close :close-on-click-modal="false" :before-close="close" @update:model-value="emit('update:modelValue', $event)">
    <el-form :model="draft" label-position="top" class="air-order-form" @submit.prevent="submit">
      <h3>客户信息</h3>
      <div class="air-form-grid">
        <el-form-item label="客户" required :error="errors.customer">
          <el-select v-model="draft.customer" filterable placeholder="选择合作方档案中的客户" aria-label="客户">
            <el-option v-for="p in customers" :key="p.id" :label="p.name" :value="p.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="业务员" required :error="errors.owner"><el-select v-model="draft.owner" aria-label="业务员" placeholder="请选择业务员"><el-option v-for="name in AIR_SALES" :key="name" :value="name" /></el-select></el-form-item>
        <el-form-item label="联系人" :error="errors.contact"><el-select v-model="draft.contact" filterable allow-create default-first-option clearable placeholder="选择档案联系人，或直接录入" aria-label="联系人" @change="selectContact"><el-option v-for="item in contacts" :key="item.name" :label="item.name" :value="item.name" /></el-select></el-form-item>
        <el-form-item label="联系电话" :error="errors.phone"><el-input v-model="draft.phone" maxlength="20" placeholder="8～20 个字符，选填" /></el-form-item>
        <el-form-item label="订单流转"><el-select v-model="draft.flowTo" clearable placeholder="选填" aria-label="订单流转"><el-option v-for="name in ['空运出口部', '航晟物流部']" :key="name" :value="name" /></el-select></el-form-item>
      </div>
      <div class="air-email-section">
        <div class="air-email-heading"><span>联系人邮箱</span><el-button link type="primary" @click="draft.contactEmails.push('')">+ 添加邮箱</el-button></div>
        <p v-if="!draft.contactEmails.length" class="air-form-hint">未填写邮箱；可从档案联系人带入或添加多个邮箱。</p>
        <div v-for="(_, index) in draft.contactEmails" :key="index" class="air-email-row">
          <el-form-item :label="`邮箱 ${index + 1}`" :error="errors[`contactEmails.${index}`]"><el-input v-model="draft.contactEmails[index]" type="email" :aria-label="`联系人邮箱 ${index + 1}`" placeholder="name@example.com" /></el-form-item>
          <el-button text type="danger" :aria-label="`删除联系人邮箱 ${index + 1}`" @click="draft.contactEmails.splice(index, 1)">删除</el-button>
        </div>
      </div>
      <el-alert v-if="draft.customer" class="air-credit" :type="credit.kind === 'blocked' ? 'error' : credit.kind === 'ready' ? 'success' : 'warning'" :closable="false" show-icon :title="credit.message || '客户授信额度充足'">
        <template v-if="customer && credit.partner">可用额度 {{ customer.availableCredit?.toLocaleString('zh-CN') ?? '待确认' }} / 授信额度 {{ customer.creditLimit?.toLocaleString('zh-CN') ?? '待确认' }}</template>
      </el-alert>
      <h3>货物信息</h3>
      <div class="air-form-grid">
        <el-form-item label="中文品名" :error="errors.goodsName"><el-input v-model="draft.goodsName" maxlength="256" placeholder="多个品名用分号隔开" /></el-form-item>
        <el-form-item label="特殊货物"><el-select v-model="draft.specialCargo" clearable placeholder="选填" aria-label="特殊货物"><el-option v-for="name in ['锂电池', '危险品', '鲜活']" :key="name" :value="name" /></el-select></el-form-item>
        <el-form-item label="件数（件）" required :error="errors.pieces"><el-input-number v-model="draft.pieces" :min="1" :precision="0" controls-position="right" aria-label="件数（件）" /></el-form-item>
        <el-form-item label="重量（kg）" required :error="errors.grossWeight"><el-input-number v-model="draft.grossWeight" :min="0.01" :precision="2" controls-position="right" aria-label="重量（kg）" /></el-form-item>
        <el-form-item label="体积（m³）" required :error="errors.volume"><el-input-number v-model="draft.volume" :min="0.01" :precision="2" controls-position="right" aria-label="体积（m³）" /></el-form-item>
        <el-form-item label="预计提单计费重（kg）"><el-input :model-value="chargeWeight.toFixed(1)" readonly aria-label="预计提单计费重（kg）" /></el-form-item>
        <el-form-item label="长度（cm）" :error="errors.length"><el-input-number v-model="draft.length" :min="0.01" :precision="2" controls-position="right" aria-label="长度（cm）" /></el-form-item>
        <el-form-item label="宽度（cm）" :error="errors.width"><el-input-number v-model="draft.width" :min="0.01" :precision="2" controls-position="right" aria-label="宽度（cm）" /></el-form-item>
        <el-form-item label="高度（cm）" :error="errors.height"><el-input-number v-model="draft.height" :min="0.01" :precision="2" controls-position="right" aria-label="高度（cm）" /></el-form-item>
        <el-form-item label="期望到货时间" :error="errors.expectedArrival"><el-date-picker v-model="draft.expectedArrival" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" aria-label="期望到货时间" /></el-form-item>
      </div>
      <h3>空运信息与客户报价</h3>
      <div class="air-form-grid">
        <el-form-item label="始发港代码" required :error="errors.origin"><el-select v-model="draft.origin" filterable aria-label="始发港代码"><el-option v-for="p in airCatalog.ports" :key="p.code" :label="`${p.code} · ${p.name}`" :value="p.code" /></el-select></el-form-item>
        <el-form-item label="目的港代码" required :error="errors.destination"><el-select v-model="draft.destination" filterable aria-label="目的港代码"><el-option v-for="p in airCatalog.ports" :key="p.code" :label="`${p.code} · ${p.name}`" :value="p.code" /></el-select></el-form-item>
        <el-form-item label="航司产品" required :error="errors.product"><el-select v-model="draft.product" placeholder="请选择航司产品" aria-label="航司产品"><el-option v-for="p in AIR_PRODUCTS" :key="p.id" :label="p.label" :value="p.id" /></el-select></el-form-item>
        <el-form-item label="预计出港日期"><el-date-picker v-model="draft.departureDate" value-format="YYYY-MM-DD" placeholder="选填" aria-label="预计出港日期" /></el-form-item>
        <el-form-item label="运费卖价" required :error="errors.sellRate"><el-input-number v-model="draft.sellRate" :min="0" :max="100" :precision="2" controls-position="right" aria-label="运费卖价" /></el-form-item>
        <el-form-item label="后段卡车卖价" :error="errors.truckSellRate"><el-input-number v-model="draft.truckSellRate" :min="0" :max="100" :precision="2" controls-position="right" aria-label="后段卡车卖价" /></el-form-item>
        <el-form-item label="分泡" :error="errors.foamRatio"><el-select v-model="draft.foamRatio" clearable placeholder="选填" aria-label="分泡"><el-option v-for="n in 11" :key="n" :label="String((n - 1) / 10)" :value="(n - 1) / 10" /></el-select></el-form-item>
        <el-form-item label="订舱要求" :error="errors.bookingRequirement"><el-input v-model="draft.bookingRequirement" maxlength="50" show-word-limit placeholder="不超过 50 个字符" /></el-form-item>
      </div>
      <el-form-item label="Minimum（最低总价）"><el-input model-value="待确认：最低总价的输入与计算口径未明确" readonly /></el-form-item>
      <h3>服务选择</h3>
      <div aria-label="服务选择"><el-checkbox v-model="draft.services.booking" disabled>订舱（必选）</el-checkbox><el-checkbox v-model="draft.services.warehouse">仓储</el-checkbox><el-checkbox v-model="draft.services.pickup">提货</el-checkbox></div>
      <el-form-item v-if="draft.services.warehouse" label="仓储操作"><el-checkbox-group v-model="draft.warehouseOperations"><el-checkbox v-for="s in ['全部', '打托', '拆托', '加重', '分拣', '改标签']" :key="s" :value="s">{{ s }}</el-checkbox></el-checkbox-group></el-form-item>
      <div v-if="draft.services.pickup" class="air-form-grid">
        <el-form-item label="提货供应商" required :error="errors['pickup.supplier']"><el-input v-model="draft.pickup.supplier" /></el-form-item>
        <el-form-item label="提货时间" required :error="errors['pickup.time']"><el-date-picker v-model="draft.pickup.time" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" aria-label="提货时间" /></el-form-item>
        <el-form-item label="提货点省 / 市 / 区" required :error="errors['pickup.region']"><el-cascader v-model="draft.pickup.region" :options="AIR_PICKUP_REGIONS" filterable clearable placeholder="请选择省 / 市 / 区" aria-label="提货点省市区" /></el-form-item>
        <el-form-item label="提货点详细地址" required :error="errors['pickup.address']"><el-input v-model="draft.pickup.address" placeholder="街道、门牌或仓库名称" /></el-form-item>
        <el-form-item label="提货联系人" required :error="errors['pickup.contact']"><el-input v-model="draft.pickup.contact" maxlength="4" /></el-form-item>
        <el-form-item label="提货电话" required :error="errors['pickup.phone']"><el-input v-model="draft.pickup.phone" /></el-form-item>
        <el-form-item label="到货点" required :error="errors['pickup.arrivalAddress']"><el-input v-model="draft.pickup.arrivalAddress" /></el-form-item>
        <el-form-item label="到货联系人" required :error="errors['pickup.arrivalContact']"><el-input v-model="draft.pickup.arrivalContact" maxlength="60" /></el-form-item>
        <el-form-item label="到货电话"><el-input v-model="draft.pickup.arrivalPhone" /></el-form-item>
        <el-form-item label="特种车"><el-select v-model="draft.pickup.vehicleType" clearable aria-label="特种车"><el-option v-for="s in ['监管车', '非监管车', '气垫车', '平板车']" :key="s" :value="s" /></el-select></el-form-item>
        <el-form-item label="提货备注"><el-input v-model="draft.pickup.remark" type="textarea" maxlength="256" /></el-form-item>
      </div>
      <p class="air-form-hint">提交后生成所选服务单据。客户档案、航司产品、航班与授信金额均为可恢复的合成演示数据；地址候选为演示样本，外部服务不实际发送。</p>
      <p v-if="Object.keys(errors).length" class="air-form-error" role="status">请完成标红的必填项或修正输入后提交。</p>
    </el-form>
    <template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button type="primary" :loading="busy" :disabled="Object.keys(errors).length > 0" @click="submit">提交</el-button></template>
  </el-dialog>
</template>

<style scoped>
.air-order-form h3 { margin: 24px 0 16px; padding-bottom: 10px; border-bottom: 1px solid var(--border); font-size: 15px; color: var(--ink); }
.air-order-form h3:first-child { margin-top: 0; }
.air-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 0 20px; }
.air-form-grid :deep(.el-input-number), .air-form-grid :deep(.el-date-editor), .air-form-grid :deep(.el-select) { width: 100%; }
.air-form-grid :deep(.el-cascader) { width: 100%; }
.air-email-section { margin-bottom: 16px; }
.air-email-heading { display: flex; align-items: center; gap: 12px; }
.air-email-row { display: flex; align-items: center; gap: 12px; max-width: 560px; }
.air-email-row :deep(.el-form-item) { flex: 1; }
.air-credit { margin: 0 0 8px; }
.air-form-hint { color: var(--muted); line-height: 1.7; }
.air-form-error { color: var(--danger); }
</style>
