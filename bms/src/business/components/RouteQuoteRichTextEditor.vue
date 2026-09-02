<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const editor = ref(null)

function syncValue() {
  emit('update:modelValue', editor.value?.innerHTML || '')
}

function applyCommand(command) {
  editor.value?.focus()
  document.execCommand(command)
  syncValue()
}

onMounted(() => {
  if (editor.value) editor.value.innerHTML = props.modelValue
})

watch(() => props.modelValue, async (value) => {
  await nextTick()
  if (editor.value && editor.value !== document.activeElement && editor.value.innerHTML !== value) {
    editor.value.innerHTML = value
  }
})
</script>

<template>
  <div class="route-quote-rich-editor">
    <div class="route-quote-rich-editor__toolbar" role="toolbar" aria-label="产品描述编辑工具">
      <el-tooltip content="加粗" placement="top"><el-button text aria-label="加粗" @mousedown.prevent="applyCommand('bold')"><strong>B</strong></el-button></el-tooltip>
      <el-tooltip content="斜体" placement="top"><el-button text aria-label="斜体" @mousedown.prevent="applyCommand('italic')"><em>I</em></el-button></el-tooltip>
      <el-tooltip content="下划线" placement="top"><el-button text aria-label="下划线" @mousedown.prevent="applyCommand('underline')"><u>U</u></el-button></el-tooltip>
      <el-tooltip content="无序列表" placement="top"><el-button text aria-label="无序列表" @mousedown.prevent="applyCommand('insertUnorderedList')">List</el-button></el-tooltip>
      <el-tooltip content="清除格式" placement="top"><el-button text aria-label="清除格式" @mousedown.prevent="applyCommand('removeFormat')">Tx</el-button></el-tooltip>
    </div>
    <div
      ref="editor"
      class="route-quote-rich-editor__content"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      data-placeholder="请输入产品描述"
      @input="syncValue"
      @blur="syncValue"
    />
  </div>
</template>

<style scoped>
.route-quote-rich-editor { width: 100%; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; background: #fff; }
.route-quote-rich-editor:focus-within { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px var(--el-color-primary-light-7); }
.route-quote-rich-editor__toolbar { display: flex; align-items: center; min-height: 34px; padding: 0 6px; border-bottom: 1px solid var(--border); background: #f8fafc; }
.route-quote-rich-editor__toolbar :deep(.el-button) { min-width: 28px; height: 28px; padding: 0 6px; color: var(--text); }
.route-quote-rich-editor__content { min-height: 92px; padding: 8px 11px; outline: 0; color: var(--text); line-height: 1.6; white-space: pre-wrap; }
.route-quote-rich-editor__content:empty::before { content: attr(data-placeholder); color: var(--muted); }
</style>
