<script setup>
import { computed, ref, unref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AirServiceFields from './AirServiceFields.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { cloneAirSupplementValue, stringifyAirSupplementValue } from '../domain/airOrderSupplement.js'
import { createAirServiceEditDraft, getAirServiceEditRestriction, validateAirServiceEdit } from '../domain/airServiceEditing.js'

const props = defineProps({ modelValue: Boolean, order: { type: Object, required: true }, service: { type: Object, default: null }, child: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue', 'saved', 'dirty'])
const { airChildSession, saveAirServiceDetails } = usePrototypeData()
const session = computed(() => unref(airChildSession))
const draft = ref(null)
const initial = ref('')
const failure = ref('')
const busy = ref(false)
let contextVersion = 0
const restriction = computed(() => getAirServiceEditRestriction(props.order, props.service, session.value, props.child))
const errors = computed(() => draft.value ? validateAirServiceEdit(draft.value, props.order, props.service, props.child) : {})
const dirty = computed(() => props.modelValue && draft.value && stringifyAirSupplementValue(draft.value) !== initial.value)
watch(() => [props.modelValue, props.service, props.order, props.child], () => {
  contextVersion += 1
  if (!props.modelValue) return
  draft.value = createAirServiceEditDraft(props.order, props.service, props.child)
  initial.value = stringifyAirSupplementValue(draft.value)
  failure.value = ''
}, { immediate: true })
watch(() => `${session.value.role}:${session.value.name}`, () => { contextVersion += 1; emit('update:modelValue', false) })
watch(dirty, value => emit('dirty', Boolean(value)), { immediate: true })
async function close(done) {
  if (busy.value) return false
  const version = contextVersion
  busy.value = true
  try {
    if (dirty.value) await ElMessageBox.confirm('关闭将丢弃尚未保存的服务修改。', '放弃服务修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' })
    if (version !== contextVersion) return false
    emit('update:modelValue', false)
    if (typeof done === 'function') done()
    return true
  } catch { return false }
  finally { busy.value = false }
}
function save() {
  if (busy.value || restriction.value || !draft.value || Object.keys(errors.value).length) return false
  busy.value = true; failure.value = ''
  try {
    const saved = saveAirServiceDetails(props.order.id, props.service.id, cloneAirSupplementValue(draft.value), props.child?.id || '')
    initial.value = stringifyAirSupplementValue(draft.value)
    emit('update:modelValue', false); emit('saved', saved)
    ElMessage.success('服务信息已保存'); return true
  } catch (error) { failure.value = error.message; return false }
  finally { busy.value = false }
}
</script>

<template>
  <el-dialog :model-value="modelValue" :title="`修改${service?.name || '服务'}`" width="min(900px, 96vw)" align-center append-to-body :close-on-click-modal="false" :before-close="close" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <p class="service-context">{{ child?.orderNo || order.orderNo }} · {{ service?.id }} · {{ service?.status }}</p>
    <el-alert v-if="restriction" :title="restriction" type="info" :closable="false" />
    <el-alert v-if="failure" :title="failure" type="error" :closable="false" role="alert" />
    <el-form v-if="draft && service" label-position="top" :model="draft" @submit.prevent="save"><AirServiceFields :kind="service.type" :model="draft" :readonly="Boolean(restriction)" :errors="errors" prefix="服务修改" /><div v-if="!restriction && Object.keys(errors).length" class="service-errors" role="status"><span v-for="(error, key) in errors" :key="key">{{ error }}</span></div></el-form>
    <template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button v-if="!restriction" type="primary" :disabled="Object.keys(errors).length > 0" :loading="busy" @click="save">保存服务修改</el-button></template>
  </el-dialog>
</template>

<style scoped>
.service-context { margin: 0 0 18px; color: var(--muted); overflow-wrap: anywhere; }
.service-errors { display: grid; gap: 4px; line-height: 1.6; color: var(--danger); }
</style>
