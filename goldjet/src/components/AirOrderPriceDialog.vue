<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { createAirPriceDraft, validateAirPrices } from '../domain/airOperations.js'
import { getAirPriceRestriction } from '../data/airOrderActions.js'

const props = defineProps({ modelValue: Boolean, orderId: String })
const emit = defineEmits(['update:modelValue', 'saved'])
const { state, airSession, saveAirOrderPrices } = usePrototypeData()
const order = computed(() => state.airOrders.find(row => row.id === props.orderId))
const draft = ref(createAirPriceDraft())
const initial = ref(''), failure = ref(''), busy = ref(false)
const restriction = computed(() => getAirPriceRestriction(order.value, airSession))
const errors = computed(() => validateAirPrices(draft.value))
const dirty = computed(() => props.modelValue && JSON.stringify(draft.value) !== initial.value)
let generation = 0
watch(() => [props.modelValue, order.value, airSession.role, airSession.name], () => {
  generation += 1
  draft.value = createAirPriceDraft(order.value); initial.value = JSON.stringify(draft.value); failure.value = ''
}, { immediate: true, flush: 'sync' })
async function allowLeave() {
  if (busy.value) return false
  if (!dirty.value) return true
  const current = generation
  busy.value = true
  try { await ElMessageBox.confirm('放弃尚未保存的客户报价修改？', '放弃修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return current === generation }
  catch { return false }
  finally { busy.value = false }
}
onBeforeRouteLeave(allowLeave)
onBeforeRouteUpdate(async (to, from) => {
  if (!props.modelValue || !((to.query.action === 'create' && to.query.action !== from.query.action) || (to.query.order && to.query.order !== props.orderId && to.query.order !== from.query.order))) return true
  if (!await allowLeave()) return false
  emit('update:modelValue', false)
  return true
})
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
async function close(done) {
  const source = order.value
  if (!await allowLeave() || source !== order.value) return false
  emit('update:modelValue', false)
  if (typeof done === 'function') done()
  return true
}
function save() {
  if (busy.value || restriction.value || Object.keys(errors.value).length) return false
  busy.value = true; failure.value = ''
  try {
    const result = saveAirOrderPrices(order.value.id, draft.value)
    initial.value = JSON.stringify(draft.value); emit('saved', result); emit('update:modelValue', false)
    ElMessage.success('客户报价已保存；变更通知已记录在本地消息中'); return true
  } catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="修改客户报价" width="min(560px, 94vw)" :before-close="close" :close-on-click-modal="false" @update:model-value="emit('update:modelValue', $event)">
    <p>{{ order?.orderNo }} · {{ order?.customer }}</p>
    <el-alert v-if="restriction || failure" :title="restriction || failure" :type="failure ? 'error' : 'info'" :closable="false" />
    <el-form :model="draft" label-position="top" @submit.prevent="save">
      <el-form-item label="运费卖价" required :error="errors.sellRate"><el-input-number v-model="draft.sellRate" :disabled="Boolean(restriction)" :min="0" :max="100" aria-label="运费卖价" /></el-form-item>
      <el-form-item label="后段卡车卖价" :error="errors.truckSellRate"><el-input-number v-model="draft.truckSellRate" :disabled="Boolean(restriction)" :min="0" :max="100" aria-label="后段卡车卖价" /></el-form-item>
      <el-form-item label="分泡" :error="errors.foamRatio"><el-select v-model="draft.foamRatio" clearable :disabled="Boolean(restriction)" aria-label="分泡"><el-option v-for="n in 11" :key="n" :label="String((n - 1) / 10)" :value="(n - 1) / 10" /></el-select></el-form-item>
    </el-form>
    <template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button v-business-write="'airOrders'" type="primary" :disabled="Boolean(restriction) || Object.keys(errors).length > 0" :loading="busy" @click="save">保存</el-button></template>
  </el-dialog>
</template>
