<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createAirWaybillContact } from '../domain/airWaybills.js'

const props = defineProps({
  visible: Boolean,
  modelValue: { type: [Object, String], default: null },
  contacts: { type: Array, default: () => [] },
  readOnly: Boolean,
  contextKey: { type: String, default: '' },
  title: { type: String, default: '联系人信息' },
  displayLabel: { type: String, default: '提单信息展示区' },
})
const emit = defineEmits(['update:visible', 'dirty', 'save', 'deleteContact'])
const fields = [
  { key: 'name', label: '名称', wide: true },
  { key: 'address', label: '地址', wide: true },
  { key: 'phone', label: '电话' },
  { key: 'postcode', label: '邮编' },
  { key: 'country', label: '国家' },
  { key: 'countryCode', label: '国家代码' },
  { key: 'province', label: '省份' },
  { key: 'city', label: '城市' },
  { key: 'alias', label: '别称', wide: true },
]
const draft = ref(createAirWaybillContact())
const initial = ref('')
const saveAsCommonContact = ref(false)
const aliasQuery = ref('')
const failure = ref('')
const busy = ref(false)
let generation = 0
let operation = 0
const snapshot = () => JSON.stringify({ contact: draft.value, saveAsCommonContact: saveAsCommonContact.value })
const dirty = computed(() => props.visible && snapshot() !== initial.value)
const filteredContacts = computed(() => {
  const query = aliasQuery.value.trim().toLocaleLowerCase()
  return props.contacts.filter(contact => String(contact.alias || '').toLocaleLowerCase().includes(query))
})

function hydrate() {
  draft.value = createAirWaybillContact(props.modelValue || {})
  saveAsCommonContact.value = false
  initial.value = snapshot()
  aliasQuery.value = ''
  failure.value = ''
}
watch(() => [props.visible, props.contextKey], () => {
  generation += 1
  operation += 1
  busy.value = false
  if (props.visible) hydrate()
}, { immediate: true, flush: 'sync' })
watch(() => props.readOnly, () => {
  generation += 1
  operation += 1
  busy.value = false
}, { flush: 'sync' })
watch(() => props.modelValue, () => {
  if (props.visible && !dirty.value && !busy.value) hydrate()
})
watch(dirty, value => emit('dirty', Boolean(value)), { immediate: true })

async function allowLeave() {
  if (!props.visible) return true
  if (busy.value) return false
  if (!dirty.value) return true
  const version = generation
  const pending = ++operation
  busy.value = true
  try {
    await ElMessageBox.confirm('尚未保存的联系人修改将被丢弃。', '放弃联系人修改？', {
      confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning',
    })
    return version === generation && props.visible
  } catch { return false }
  finally { if (pending === operation) busy.value = false }
}
async function requestClose(done) {
  const version = generation
  if (!await allowLeave() || version !== generation) return false
  emit('update:visible', false)
  if (typeof done === 'function') done()
  return true
}
function clear() {
  if (!props.visible || props.readOnly || busy.value) return false
  draft.value = createAirWaybillContact()
  saveAsCommonContact.value = false
  failure.value = ''
  return true
}
function useContact(contact) {
  if (!props.visible || props.readOnly || busy.value || !props.contacts.some(row => row.id === contact.id)) return false
  draft.value = createAirWaybillContact(contact)
  saveAsCommonContact.value = false
  failure.value = ''
  return true
}

// The parent persists through the shared owner and calls complete({ ok, message }).
function dispatch(event, payload, onSuccess) {
  const version = generation
  const pending = ++operation
  busy.value = true
  failure.value = ''
  return new Promise(resolve => {
    let completed = false
    function complete(result) {
      if (completed) return
      completed = true
      if (version !== generation || pending !== operation || !props.visible || props.readOnly) { resolve(false); return }
      busy.value = false
      if (!result?.ok) {
        failure.value = result?.message || '操作未完成，请重试。'
        resolve(false)
        return
      }
      onSuccess()
      resolve(true)
    }
    try { emit(event, payload, complete) }
    catch (error) { complete({ ok: false, message: error.message }) }
  })
}
function save() {
  if (!props.visible || props.readOnly || busy.value) return Promise.resolve(false)
  const payload = { contact: createAirWaybillContact(draft.value), saveAsCommonContact: saveAsCommonContact.value, contextKey: props.contextKey }
  return dispatch('save', payload, () => {
    initial.value = snapshot()
    emit('update:visible', false)
  })
}
async function deleteContact(contact) {
  if (!props.visible || props.readOnly || busy.value || !props.contacts.some(row => row.id === contact.id)) return false
  const version = generation
  const pending = ++operation
  busy.value = true
  try {
    await ElMessageBox.confirm(`删除常用联系人“${contact.alias || contact.name || '未命名联系人'}”？已带入提单的内容不受影响。`, '删除常用联系人', {
      confirmButtonText: '删除联系人', cancelButtonText: '取消', type: 'warning',
    })
    if (version !== generation || props.readOnly || !props.visible || !props.contacts.some(row => row.id === contact.id)) return false
    return await dispatch('deleteContact', contact.id, () => ElMessage.success('常用联系人已删除'))
  } catch { return false }
  finally { if (pending === operation) busy.value = false }
}
function beforeUnload(event) {
  if (dirty.value) { event.preventDefault(); event.returnValue = '' }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => {
  generation += 1
  operation += 1
  window.removeEventListener('beforeunload', beforeUnload)
})
defineExpose({ allowLeave, requestClose, dirty })
</script>

<template>
  <el-dialog :model-value="visible" :title="title" width="min(1000px, 96vw)" align-center append-to-body :before-close="requestClose" :close-on-click-modal="false" destroy-on-close>
    <el-alert v-if="readOnly" title="当前联系人信息仅可查看。" type="info" :closable="false" />
    <el-alert v-if="failure" :title="failure" type="error" :closable="false" role="alert" />
    <div class="waybill-contact-layout">
      <el-form class="waybill-contact-form" label-position="top" :model="draft" @submit.prevent="save">
        <div class="waybill-contact-fields">
          <el-form-item v-for="field in fields" :key="field.key" :label="field.label" :class="{ 'contact-field-wide': field.wide }">
            <el-input v-model="draft[field.key]" :aria-label="field.label" :readonly="readOnly || busy" :type="field.key === 'address' ? 'textarea' : 'text'" :rows="2" />
          </el-form-item>
          <el-form-item :label="displayLabel" class="contact-field-wide">
            <el-input v-model="draft.printText" type="textarea" :rows="5" :aria-label="displayLabel" :readonly="readOnly || busy" />
          </el-form-item>
        </div>
        <el-checkbox v-model="saveAsCommonContact" :disabled="readOnly || busy || !String(draft.alias || '').trim()">保存为常用联系人</el-checkbox>
        <p v-if="!readOnly && !String(draft.alias || '').trim()" class="contact-hint">填写别称后可保存为常用联系人。</p>
      </el-form>
      <section class="waybill-common-contacts" aria-label="常用联系人">
        <h3>常用联系人</h3>
        <el-input v-model="aliasQuery" clearable aria-label="按别称搜索常用联系人" placeholder="按别称搜索" />
        <el-table :data="filteredContacts" max-height="430" empty-text="暂无匹配的常用联系人" class="contact-table">
          <el-table-column prop="alias" label="别称" min-width="100" show-overflow-tooltip />
          <el-table-column prop="name" label="名称" min-width="130" show-overflow-tooltip />
          <el-table-column label="操作" width="112" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" :disabled="readOnly || busy" :aria-label="`使用联系人${row.alias || row.name}`" @click="useContact(row)">使用</el-button>
              <el-button v-business-write="'airwayBills'" link type="danger" :disabled="readOnly || busy" :aria-label="`删除联系人${row.alias || row.name}`" @click="deleteContact(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </div>
    <template #footer>
      <div class="waybill-contact-footer">
        <el-button v-if="!readOnly" :disabled="busy" @click="clear">清空</el-button>
        <div class="contact-primary-actions">
          <el-button :disabled="busy" @click="requestClose">{{ readOnly ? '关闭' : '取消' }}</el-button>
          <el-button v-business-write="'airwayBills'" v-if="!readOnly" type="primary" :loading="busy" @click="save">保存</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.waybill-contact-layout { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 24px; max-height: 65vh; overflow-y: auto; padding: 4px 4px 4px 0; }
.waybill-contact-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.contact-field-wide { grid-column: 1 / -1; }
.waybill-common-contacts { min-width: 0; }
.waybill-common-contacts h3 { margin: 0 0 16px; }
.contact-table { margin-top: 12px; width: 100%; }
.contact-hint { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
.waybill-contact-footer { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.contact-primary-actions { display: flex; gap: 12px; margin-left: auto; }
.contact-primary-actions :deep(.el-button + .el-button) { margin-left: 0; }
@media (max-width: 760px) { .waybill-contact-layout { grid-template-columns: minmax(0, 1fr); gap: 20px; } }
@media (max-width: 420px) { .waybill-contact-fields { grid-template-columns: minmax(0, 1fr); } }
</style>
