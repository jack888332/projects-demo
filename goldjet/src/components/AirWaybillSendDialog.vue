<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { getAirWaybillChildren, getAirWaybillSendRestriction, getDescriptionCodeConfig } from '../domain/airWaybills.js'

const props = defineProps({ modelValue: Boolean, selection: { type: Array, default: () => [] } })
const emit = defineEmits(['update:modelValue', 'sent'])
const { state, airSession, sendAirWaybills, advanceAirWaybillClock } = usePrototypeData()
const codes = reactive({}), outcome = ref('success'), failure = ref(''), results = ref([]), busy = ref(false)
const initial = ref(''), targets = ref([])
let generation = 0
const allowed = computed(() => ['service', 'waybillClerk'].includes(airSession.role))
const orders = computed(() => [...new Set(targets.value.map(item => item.orderId))].map(id => state.airOrders.find(row => row.id === id)).filter(Boolean))
const codeRows = computed(() => orders.value.map(order => ({ order, config: getDescriptionCodeConfig(order.waybillNo) })).filter(row => row.config.visible))
const restriction = computed(() => !allowed.value ? '仅空运客服或打单员可发送运单' : getAirWaybillSendRestriction(state, targets.value, codes, state.airWaybillClockMs))
const dirty = computed(() => props.modelValue && !results.value.length && initial.value !== JSON.stringify({ codes, outcome: outcome.value }))
const clockText = computed(() => new Date(state.airWaybillClockMs).toISOString().slice(0, 19).replace('T', ' '))
function entity(item) {
  const order = state.airOrders.find(row => row.id === item.orderId)
  return item.childId ? getAirWaybillChildren(state, item.orderId).find(row => row.id === item.childId) : order
}
function number(item) { const value = entity(item); return item.childId ? value?.housebillNo || value?.orderNo || item.childId : value?.waybillNo || item.orderId }
function status(item) { return entity(item)?.waybillTransmission?.status || '待发送' }
watch(() => props.modelValue, visible => {
  if (!visible) return
  generation += 1; failure.value = ''; results.value = []; outcome.value = 'success'
  targets.value = props.selection.map(item => ({ orderId: item.orderId, childId: item.childId || '' }))
  for (const key of Object.keys(codes)) delete codes[key]
  for (const order of orders.value) codes[order.id] = getDescriptionCodeConfig(order.waybillNo).defaultValue
  initial.value = JSON.stringify({ codes, outcome: outcome.value })
}, { immediate: true })
watch(() => [state.airOrders, state.airChildren, airSession.role, airSession.name], () => {
  generation += 1; failure.value = ''; results.value = []; emit('update:modelValue', false)
}, { flush: 'sync' })
async function canClose() {
  if (busy.value) return false
  if (!dirty.value) return true
  const token = generation
  try { await ElMessageBox.confirm('放弃尚未发送的代码选择？', '取消本次发送', { confirmButtonText: '放弃选择', cancelButtonText: '继续填写' }); return token === generation }
  catch { return false }
}
async function close(done) {
  if (!await canClose()) return false
  emit('update:modelValue', false); if (typeof done === 'function') done(); return true
}
onBeforeRouteLeave(canClose)
onBeforeRouteUpdate(async () => {
  if (!props.modelValue) return true
  if (!await canClose()) return false
  emit('update:modelValue', false); return true
})
function beforeUnload(event) { if (dirty.value || busy.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
async function send() {
  if (busy.value || restriction.value) return
  busy.value = true; failure.value = ''; results.value = []
  const token = generation
  try {
    const result = await sendAirWaybills(targets.value, { ...codes }, { outcome: outcome.value })
    if (token !== generation) return
    results.value = result; initial.value = JSON.stringify({ codes, outcome: outcome.value }); emit('sent', result)
  } catch (error) { if (token === generation) failure.value = error.message }
  finally { busy.value = false }
}
function advance() { if (!busy.value) advanceAirWaybillClock() }
</script>

<template>
  <el-dialog :model-value="modelValue" title="批量发送运单" width="min(820px, 96vw)" :before-close="close" :close-on-click-modal="false" :close-on-press-escape="!busy" @update:model-value="emit('update:modelValue', $event)">
    <div class="waybill-send-content">
      <p>本次 {{ orders.length }} 票、{{ targets.length }} 份运单。先发送主单，主单成功后才发送对应分单。</p>
      <el-alert title="本地模拟发送，不连接翌飞或 CCSP。状态和回执只保存在当前演示中。" type="info" :closable="false" />
      <el-table :data="targets" aria-label="本次发送运单" max-height="240">
        <el-table-column label="类型" width="75"><template #default="{ row }">{{ row.childId ? '分单' : '主单' }}</template></el-table-column>
        <el-table-column label="提单号 / 分单号" min-width="180"><template #default="{ row }">{{ number(row) }}</template></el-table-column>
        <el-table-column label="发送状态" width="120"><template #default="{ row }"><span :class="{ 'send-error': status(row) === '异常中' }">{{ status(row) }}</span></template></el-table-column>
        <el-table-column label="回执" min-width="220"><template #default="{ row }">{{ entity(row)?.waybillTransmission?.error || (status(row) === '成功' ? '本地模拟接收成功' : '尚无回执') }}</template></el-table-column>
      </el-table>
      <el-form v-if="codeRows.length" label-position="top" aria-label="运单发送代码" @submit.prevent="send">
        <el-form-item v-for="{ order, config } in codeRows" :key="order.id" :label="`${order.waybillNo} · DescriptionCode`" :required="config.required" :error="config.required && !codes[order.id] ? '请选择运单发送代码' : ''">
          <el-select v-model="codes[order.id]" filterable :clearable="!config.required" :disabled="busy || !allowed" :aria-label="`${order.waybillNo}发送代码`"><el-option v-for="option in config.options" :key="option" :value="option" /></el-select>
          <span class="send-hint">{{ codes[order.id] === '中性提单999' ? '接收模块：国际主单—中性运单制单；中性提单的手工录入内容待明确' : codes[order.id] ? '接收模块：国际电子运单' : '本次不填发送代码' }}</span>
        </el-form-item>
      </el-form>
      <details class="send-simulation">
        <summary>演示回执与时间</summary>
        <label>本次模拟回执<el-select v-model="outcome" :disabled="busy" aria-label="本次模拟回执"><el-option label="全部成功" value="success" /><el-option label="主单异常，分单不发送" value="master-error" /><el-option label="分单异常" value="child-error" /></el-select></label>
        <p>演示时间：{{ clockText }}</p><el-button :disabled="busy" @click="advance">演示时间前进 121 秒</el-button>
      </details>
      <el-alert v-if="failure || restriction" :title="failure || restriction" :type="failure ? 'error' : 'warning'" :closable="false" role="alert" />
      <div v-if="results.length" class="send-results" role="status" aria-live="polite">
        <h3>本次发送结果</h3>
        <ul><li v-for="row in results" :key="`${row.orderId}:${row.childId}`">{{ number(row) }}：{{ row.skipped ? '未发送' : row.status }}<span v-if="row.error"> · {{ row.error }}</span></li></ul>
      </div>
      <p v-if="busy" role="status" aria-live="polite">正在等待本地模拟回执，请稍候。</p>
    </div>
    <template #footer><el-button :disabled="busy" @click="close">{{ results.length ? '关闭' : '取消' }}</el-button><el-button v-business-write="'airwayBills'" type="primary" :loading="busy" :disabled="Boolean(restriction)" @click="send">{{ results.length ? '再次模拟发送' : '确认模拟发送' }}</el-button></template>
  </el-dialog>
</template>

<style scoped>
.waybill-send-content { display: grid; gap: 16px; min-width: 0; max-height: 65dvh; overflow-y: auto; }
.waybill-send-content p { margin: 0; line-height: 1.6; }
.waybill-send-content :deep(.el-select) { width: 100%; }
.send-hint { display: block; color: var(--muted); font-size: 12px; margin-top: 6px; }
.send-error { color: #b42318; }
.send-simulation { padding: 12px; background: var(--surface-alt, #f6f8fb); border-radius: 6px; }
.send-simulation summary { cursor: pointer; font-weight: 600; }
.send-simulation label { display: grid; gap: 6px; margin: 12px 0; }
.send-simulation p { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
.send-results h3 { font-size: 14px; margin: 0 0 8px; }.send-results ul { margin: 0; padding-left: 20px; line-height: 1.8; overflow-wrap: anywhere; }
</style>
