<script setup>
import { ref } from 'vue'
import { validateAirClearanceAttachments } from '../domain/airOrderSupplement.js'

const props = defineProps({ modelValue: { type: Array, default: () => [] }, readonly: Boolean, error: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])
const input = ref(null)
const failure = ref('')
function selectFiles(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (props.readonly || !files.length) return false
  const next = [...props.modelValue, ...files]
  failure.value = validateAirClearanceAttachments(next, { required: false })
  if (failure.value) return false
  emit('update:modelValue', next)
  return true
}
function remove(index) {
  if (props.readonly) return false
  emit('update:modelValue', props.modelValue.filter((_, position) => position !== index))
  failure.value = ''
  return true
}
function fileSize(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB` }
</script>

<template>
  <el-form-item label="清关派送材料" required :error="failure || error" class="clearance-files">
    <div class="attachment-content">
      <template v-if="!readonly"><input ref="input" class="attachment-input" type="file" multiple accept=".rar,.zip,.docx,.doc,.xls,.xlsx,.pdf,.jpg" aria-label="选择清关派送材料" @change="selectFiles" /><el-button @click="input?.click()">选择材料</el-button></template>
      <p class="attachment-hint">支持 RAR、ZIP、Word、Excel、PDF、JPG，单个不超过 20 MB。保存前可移除并重新选择。</p>
      <ul v-if="modelValue.length" class="attachment-list" aria-label="已选清关派送材料"><li v-for="(file, index) in modelValue" :key="`${file.name}:${file.size}:${file.lastModified}`"><span class="attachment-name">{{ file.name }}</span><span class="attachment-size">{{ fileSize(file.size) }}</span><el-button v-if="!readonly" link type="danger" :aria-label="`移除材料${file.name}`" @click="remove(index)">移除</el-button></li></ul>
      <span v-else-if="readonly" class="attachment-hint">未填写</span>
    </div>
  </el-form-item>
</template>

<style scoped>
.attachment-content { min-width: 0; width: 100%; }
.attachment-input { display: none; }
.attachment-hint { color: var(--muted); font-size: 12px; line-height: 1.7; margin: 8px 0; }
.attachment-list { list-style: none; margin: 12px 0 0; padding: 0; }
.attachment-list li { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 7px 0; border-bottom: 1px solid var(--border); }
.attachment-name { flex: 1; min-width: min(150px, 100%); overflow-wrap: anywhere; }
.attachment-size { color: var(--muted); white-space: nowrap; }
</style>
