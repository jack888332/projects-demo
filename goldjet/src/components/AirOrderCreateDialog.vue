<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, unref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { AIR_PRODUCTS, AIR_SALES, AIR_PICKUP_REGIONS, createAirDraft, validateAirDraft, getAirCredit, getAirContacts } from '../domain/airOperations.js'
import { calculateChargeWeight } from '../domain/chargeWeight.js'
import { createAirChildDraft, getAirChildRestriction, validateAirChildDraft, validateAirChildPrices } from '../domain/airChildOrders.js'

const props = defineProps({ modelValue: Boolean, kind: { type: String, default: 'main' }, mode: { type: String, default: 'create' }, order: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue', 'created'])
const { state, airCatalog, airSession, airChildSession, createAirOrder, saveAirChildOrder } = usePrototypeData()
const draft = reactive(createAirDraft())
const initial = ref('')
const busy = ref(false)
const failure = ref('')
const isChild = computed(() => props.kind === 'child')
const priceOnly = computed(() => isChild.value && props.mode === 'edit' && props.order?.orderStatus === '子订单完成')
const readOnly = computed(() => props.mode === 'detail')
const dirty = computed(() => props.modelValue && !readOnly.value && JSON.stringify(draft) !== initial.value)
const restriction = computed(() => isChild.value ? getAirChildRestriction(props.mode === 'create' || props.mode === 'copy' ? null : props.order, unref(airChildSession) || {}, readOnly.value ? 'detail' : 'edit') : '')
const title = computed(() => isChild.value ? readOnly.value ? '子订单详情' : props.mode === 'edit' ? priceOnly.value ? '修改子订单报价' : '编辑暂存子订单' : props.mode === 'copy' ? '复制子订单' : '新建子订单' : '新建主订单')
const customer = computed(() => state.partners.find(p => p.name === draft.customer))
const customers = computed(() => state.partners.filter(p => p.type === '客户' && p.status === '已生效'))
const contacts = computed(() => getAirContacts(customer.value))
const errors = computed(() => readOnly.value ? {} : isChild.value ? priceOnly.value ? validateAirChildPrices(draft) : validateAirChildDraft(draft, state.partners, airCatalog.value) : validateAirDraft(draft, state.partners, airCatalog.value))
const credit = computed(() => getAirCredit(draft.customer, state.partners))
const chargeWeight = computed(() => calculateChargeWeight(draft.grossWeight, draft.volume))
function selectContact(name) {
  const contact = contacts.value.find(item => item.name === name)
  if (contact) Object.assign(draft, { contact: contact.name, phone: contact.phone, contactEmails: [...contact.emails] })
}
watch(() => [props.modelValue, props.order, props.mode], ([visible]) => {
  if (!visible) return
  for (const key of Object.keys(draft)) delete draft[key]
  Object.assign(draft, isChild.value ? createAirChildDraft(props.order || {}) : createAirDraft())
  failure.value = ''
  initial.value = JSON.stringify(draft)
}, { immediate: true })
let generation = 0
watch(() => [props.modelValue, props.order, props.mode, state.airChildren, unref(airChildSession)?.role, unref(airChildSession)?.name, airSession?.role, airSession?.name], (next, previous) => {
  generation += 1
  if (previous && props.modelValue && (next[3] !== previous[3] || next.slice(4).some((value, index) => value !== previous[index + 4]))) emit('update:modelValue', false)
}, { flush: 'sync' })

async function allowLeave() {
  if (busy.value) return false
  if (!dirty.value) return true
  const current = generation
  busy.value = true
  try { await ElMessageBox.confirm('离开页面将丢弃尚未提交的订单信息。', '放弃修改？', { confirmButtonText: '放弃输入', cancelButtonText: '继续编辑', type: 'warning' }); return current === generation }
  catch { return false }
  finally { busy.value = false }
}
onBeforeRouteLeave(allowLeave)
onBeforeRouteUpdate(async (to, from) => {
  if (!props.modelValue || readOnly.value) return true
  const target = to.query.order ? `detail:${to.query.order}` : to.query.action === 'create' ? 'create:' : ''
  const previousTarget = from.query.order ? `detail:${from.query.order}` : from.query.action === 'create' ? 'create:' : ''
  if (!target || target === previousTarget || target === `${props.mode}:${props.order?.id || ''}`) return true
  if (!await allowLeave()) return false
  emit('update:modelValue', false)
  return true
})
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

async function close(done) {
  if (busy.value) return
  const current = generation
  if (!await allowLeave() || current !== generation) return false
  emit('update:modelValue', false)
  if (typeof done === 'function') done()
  return true
}
async function submit(finalize = true) {
  if (busy.value || readOnly.value || restriction.value || Object.keys(errors.value).length) return
  busy.value = true
  failure.value = ''
  try {
    const payload = JSON.parse(JSON.stringify(draft))
    const order = isChild.value ? saveAirChildOrder({ ...payload, ...(props.mode === 'edit' ? { id: props.order.id } : {}) }, { submit: finalize === true }) : createAirOrder(payload)
    emit('update:modelValue', false)
    emit('created', order)
    ElMessage.success(isChild.value && finalize !== true ? '已保存子订单' : '已提交成功！')
  } catch (error) { failure.value = error.message; ElMessage.error(error.message) }
  finally { busy.value = false }
}
</script>

<template>
  <el-dialog :model-value="modelValue" :title="title" width="min(980px, 96vw)" class="air-create-dialog" align-center destroy-on-close :close-on-click-modal="false" :before-close="close" @update:model-value="emit('update:modelValue', $event)">
    <el-alert v-if="restriction && !readOnly" :title="restriction" type="info" :closable="false" />
    <el-alert v-if="failure" :title="failure" type="error" :closable="false" role="alert" />
    <el-alert v-if="priceOnly" title="已完成的独立子订单仅可修改运费卖价、后段卡车卖价和分泡。" type="info" :closable="false" />
    <el-form :model="draft" label-position="top" class="air-order-form" :disabled="readOnly || Boolean(restriction)" @submit.prevent="submit">
      <h3>客户信息</h3>
      <div class="air-form-grid">
        <el-form-item label="客户" required :error="errors.customer">
          <el-select v-model="draft.customer" :disabled="priceOnly" filterable placeholder="选择合作方档案中的客户" aria-label="客户">
            <el-option v-for="p in customers" :key="p.id" :label="p.name" :value="p.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="业务员" required :error="errors.owner"><el-select v-model="draft.owner" :disabled="priceOnly" aria-label="业务员" placeholder="请选择业务员"><el-option v-for="name in AIR_SALES" :key="name" :value="name" /></el-select></el-form-item>
        <el-form-item label="联系人" :error="errors.contact"><el-select v-model="draft.contact" :disabled="priceOnly" filterable allow-create default-first-option clearable placeholder="选择档案联系人，或直接录入" aria-label="联系人" @change="selectContact"><el-option v-for="item in contacts" :key="item.name" :label="item.name" :value="item.name" /></el-select></el-form-item>
        <el-form-item label="联系电话" :error="errors.phone"><el-input v-model="draft.phone" :readonly="priceOnly" maxlength="20" placeholder="8～20 个字符，选填" /></el-form-item>
        <el-form-item label="订单流转"><el-select v-model="draft.flowTo" :disabled="priceOnly" clearable placeholder="选填" aria-label="订单流转"><el-option v-for="name in ['空运出口部', '航晟物流部']" :key="name" :value="name" /></el-select></el-form-item>
      </div>
      <div class="air-email-section">
        <div class="air-email-heading"><span>联系人邮箱</span><el-button link type="primary" :disabled="priceOnly" @click="draft.contactEmails.push('')">+ 添加邮箱</el-button></div>
        <p v-if="!draft.contactEmails.length" class="air-form-hint">未填写邮箱；可从档案联系人带入或添加多个邮箱。</p>
        <div v-for="(_, index) in draft.contactEmails" :key="index" class="air-email-row">
          <el-form-item :label="`邮箱 ${index + 1}`" :error="errors[`contactEmails.${index}`]"><el-input v-model="draft.contactEmails[index]" :readonly="priceOnly" type="email" :aria-label="`联系人邮箱 ${index + 1}`" placeholder="name@example.com" /></el-form-item>
          <el-button text type="danger" :disabled="priceOnly" :aria-label="`删除联系人邮箱 ${index + 1}`" @click="draft.contactEmails.splice(index, 1)">删除</el-button>
        </div>
      </div>
      <el-alert v-if="draft.customer" class="air-credit" :type="credit.kind === 'blocked' ? 'error' : credit.kind === 'ready' ? 'success' : 'warning'" :closable="false" show-icon :title="credit.message || '客户授信额度充足'">
        <template v-if="customer && credit.partner">可用额度 {{ customer.availableCredit?.toLocaleString('zh-CN') ?? '待确认' }} / 授信额度 {{ customer.creditLimit?.toLocaleString('zh-CN') ?? '待确认' }}</template>
      </el-alert>
      <h3>货物信息</h3>
      <div class="air-form-grid">
        <el-form-item label="中文品名" :error="errors.goodsName"><el-input v-model="draft.goodsName" :readonly="priceOnly" maxlength="256" placeholder="多个品名用分号隔开" /></el-form-item>
        <el-form-item label="特殊货物"><el-select v-model="draft.specialCargo" :disabled="priceOnly" clearable placeholder="选填" aria-label="特殊货物"><el-option v-for="name in ['锂电池', '危险品', '鲜活']" :key="name" :value="name" /></el-select></el-form-item>
        <el-form-item label="件数（件）" required :error="errors.pieces"><el-input-number v-model="draft.pieces" :disabled="priceOnly" :min="1" :precision="0" controls-position="right" aria-label="件数（件）" /></el-form-item>
        <el-form-item label="重量（kg）" required :error="errors.grossWeight"><el-input-number v-model="draft.grossWeight" :disabled="priceOnly" :min="0.01" :precision="2" controls-position="right" aria-label="重量（kg）" /></el-form-item>
        <el-form-item label="体积（m³）" required :error="errors.volume"><el-input-number v-model="draft.volume" :disabled="priceOnly" :min="0.01" :precision="2" controls-position="right" aria-label="体积（m³）" /></el-form-item>
        <el-form-item label="预计提单计费重（kg）"><el-input :model-value="chargeWeight.toFixed(1)" readonly aria-label="预计提单计费重（kg）" /></el-form-item>
        <el-form-item label="长度（cm）" :error="errors.length"><el-input-number v-model="draft.length" :disabled="priceOnly" :min="0.01" :precision="2" controls-position="right" aria-label="长度（cm）" /></el-form-item>
        <el-form-item label="宽度（cm）" :error="errors.width"><el-input-number v-model="draft.width" :disabled="priceOnly" :min="0.01" :precision="2" controls-position="right" aria-label="宽度（cm）" /></el-form-item>
        <el-form-item label="高度（cm）" :error="errors.height"><el-input-number v-model="draft.height" :disabled="priceOnly" :min="0.01" :precision="2" controls-position="right" aria-label="高度（cm）" /></el-form-item>
        <el-form-item label="期望到货时间" :error="errors.expectedArrival"><el-date-picker v-model="draft.expectedArrival" :disabled="priceOnly" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" aria-label="期望到货时间" /></el-form-item>
      </div>
      <template v-if="isChild">
        <h3>收发货人与分单号</h3>
        <div class="air-form-grid"><el-form-item label="发货人" :error="errors.shipper"><el-input v-model="draft.shipper" :readonly="priceOnly" type="textarea" :rows="3" maxlength="500" aria-label="子订单发货人" /></el-form-item><el-form-item label="收货人" :error="errors.consignee"><el-input v-model="draft.consignee" :readonly="priceOnly" type="textarea" :rows="3" maxlength="500" aria-label="子订单收货人" /></el-form-item><el-form-item label="分单号" :error="errors.housebillNo"><el-input v-model="draft.housebillNo" :readonly="priceOnly" maxlength="12" placeholder="选填，暂存时生成演示编号" aria-label="子订单分单号" /></el-form-item></div>
        <el-form-item label="批次管理"><el-checkbox :model-value="draft.batchManagement" disabled>批次管理</el-checkbox><span class="air-form-hint">编号与累计发送边界待确认，本轮支持无批次子订单。</span></el-form-item>
      </template>
      <h3>空运信息与客户报价</h3>
      <div class="air-form-grid">
        <el-form-item label="始发港代码" required :error="errors.origin"><el-select v-model="draft.origin" :disabled="priceOnly" filterable aria-label="始发港代码"><el-option v-for="p in airCatalog.ports" :key="p.code" :label="`${p.code} · ${p.name}`" :value="p.code" /></el-select></el-form-item>
        <el-form-item label="目的港代码" required :error="errors.destination"><el-select v-model="draft.destination" :disabled="priceOnly" filterable aria-label="目的港代码"><el-option v-for="p in airCatalog.ports" :key="p.code" :label="`${p.code} · ${p.name}`" :value="p.code" /></el-select></el-form-item>
        <el-form-item label="航司产品" required :error="errors.product"><el-select v-model="draft.product" :disabled="priceOnly" placeholder="请选择航司产品" aria-label="航司产品"><el-option v-for="p in AIR_PRODUCTS" :key="p.id" :label="p.label" :value="p.id" /></el-select></el-form-item>
        <el-form-item label="预计出港日期"><el-date-picker v-model="draft.departureDate" :disabled="priceOnly" value-format="YYYY-MM-DD" placeholder="选填" aria-label="预计出港日期" /></el-form-item>
        <el-form-item label="运费卖价" required :error="errors.sellRate"><el-input-number v-model="draft.sellRate" :min="0" :max="100" :precision="2" controls-position="right" aria-label="运费卖价" /></el-form-item>
        <el-form-item label="后段卡车卖价" :error="errors.truckSellRate"><el-input-number v-model="draft.truckSellRate" :min="0" :max="100" :precision="2" controls-position="right" aria-label="后段卡车卖价" /></el-form-item>
        <el-form-item label="分泡" :error="errors.foamRatio"><el-select v-model="draft.foamRatio" clearable placeholder="选填" aria-label="分泡"><el-option v-for="n in 11" :key="n" :label="String((n - 1) / 10)" :value="(n - 1) / 10" /></el-select></el-form-item>
        <el-form-item label="订舱要求" :error="errors.bookingRequirement"><el-input v-model="draft.bookingRequirement" :readonly="priceOnly" maxlength="50" show-word-limit placeholder="不超过 50 个字符" /></el-form-item>
      </div>
      <el-form-item label="Minimum（最低总价）"><el-input model-value="待确认：最低总价的输入与计算口径未明确" readonly /></el-form-item>
      <h3>服务选择</h3>
      <div aria-label="服务选择"><el-checkbox v-if="!isChild" v-model="draft.services.booking" disabled>订舱（必选）</el-checkbox><span v-else class="air-form-hint">订舱在合成主订单时生成。</span><el-checkbox v-model="draft.services.warehouse" :disabled="priceOnly">仓储</el-checkbox><el-checkbox v-model="draft.services.pickup" :disabled="priceOnly">提货</el-checkbox></div>
      <el-form-item v-if="draft.services.warehouse" label="仓储操作"><el-checkbox-group v-model="draft.warehouseOperations" :disabled="priceOnly"><el-checkbox v-for="s in ['全部', '打托', '拆托', '加重', '分拣', '改标签']" :key="s" :value="s">{{ s }}</el-checkbox></el-checkbox-group></el-form-item>
      <div v-if="draft.services.pickup" class="air-form-grid">
        <el-form-item label="提货供应商" required :error="errors['pickup.supplier']"><el-input v-model="draft.pickup.supplier" :readonly="priceOnly" /></el-form-item>
        <el-form-item label="提货时间" required :error="errors['pickup.time']"><el-date-picker v-model="draft.pickup.time" :disabled="priceOnly" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" aria-label="提货时间" /></el-form-item>
        <el-form-item label="提货点省 / 市 / 区" required :error="errors['pickup.region']"><el-cascader v-model="draft.pickup.region" :disabled="priceOnly" :options="AIR_PICKUP_REGIONS" filterable clearable placeholder="请选择省 / 市 / 区" aria-label="提货点省市区" /></el-form-item>
        <el-form-item label="提货点详细地址" required :error="errors['pickup.address']"><el-input v-model="draft.pickup.address" :readonly="priceOnly" placeholder="街道、门牌或仓库名称" /></el-form-item>
        <el-form-item label="提货联系人" required :error="errors['pickup.contact']"><el-input v-model="draft.pickup.contact" :readonly="priceOnly" maxlength="4" /></el-form-item>
        <el-form-item label="提货电话" required :error="errors['pickup.phone']"><el-input v-model="draft.pickup.phone" :readonly="priceOnly" /></el-form-item>
        <el-form-item label="到货点" required :error="errors['pickup.arrivalAddress']"><el-input v-model="draft.pickup.arrivalAddress" :readonly="priceOnly" /></el-form-item>
        <el-form-item label="到货联系人" required :error="errors['pickup.arrivalContact']"><el-input v-model="draft.pickup.arrivalContact" :readonly="priceOnly" maxlength="60" /></el-form-item>
        <el-form-item label="到货电话"><el-input v-model="draft.pickup.arrivalPhone" :readonly="priceOnly" /></el-form-item>
        <el-form-item label="特种车"><el-select v-model="draft.pickup.vehicleType" :disabled="priceOnly" clearable aria-label="特种车"><el-option v-for="s in ['监管车', '非监管车', '气垫车', '平板车']" :key="s" :value="s" /></el-select></el-form-item>
        <el-form-item label="提货备注"><el-input v-model="draft.pickup.remark" :readonly="priceOnly" type="textarea" maxlength="256" /></el-form-item>
      </div>
      <p class="air-form-hint">{{ isChild ? '暂存不生成服务；提交仅生成已选的提货、仓储服务。' : '提交后生成所选服务单据。' }}客户档案、航司产品、航班与授信金额均为可恢复的合成演示数据；地址候选为演示样本，外部服务不实际发送。</p>
      <el-table v-if="isChild && order?.serviceRecords?.length" :data="order.serviceRecords" aria-label="子订单服务单据"><el-table-column prop="id" label="服务单号" min-width="200" /><el-table-column prop="name" label="服务" width="100" /><el-table-column prop="status" label="状态" min-width="120" /></el-table>
      <p v-if="Object.keys(errors).length" class="air-form-error" role="status">请完成标红的必填项或修正输入后提交。</p>
    </el-form>
    <template #footer><el-button :disabled="busy" @click="close">{{ readOnly ? '关闭' : '取消' }}</el-button><template v-if="!readOnly"><el-button v-if="isChild" :type="priceOnly ? 'primary' : 'default'" :loading="busy" :disabled="Boolean(restriction) || Object.keys(errors).length > 0" @click="submit(false)">{{ priceOnly ? '保存报价' : '暂存' }}</el-button><el-button v-if="!priceOnly" type="primary" :loading="busy" :disabled="Boolean(restriction) || Object.keys(errors).length > 0" @click="submit(true)">提交</el-button></template></template>
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
