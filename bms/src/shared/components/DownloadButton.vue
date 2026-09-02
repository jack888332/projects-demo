<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { Download } from '@element-plus/icons-vue'
import { downloadRows } from '../files/downloadRows.js'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  title: { type: String, default: '下载' },
  options: {
    type: Array,
    default: () => [{ label: 'CSV 文件', value: 'csv' }],
  },
  disabled: { type: Boolean, default: false },
  rows: { type: [Array, Object], default: () => [] },
  fileName: { type: String, default: 'BMS数据' },
  successMessage: { type: String, default: '下载完成' },
})

const emit = defineEmits(['download'])
const visible = ref(false)
const selected = ref('')
const choices = computed(() => props.options.filter((item) => !item.disabled))

watch(choices, (items) => {
  if (!items.some((item) => item.value === selected.value)) selected.value = items[0]?.value || ''
}, { immediate: true })

function finish(value) {
  const option = props.options.find((item) => item.value === value)
  const rows = Array.isArray(props.rows) ? props.rows : props.rows?.[value]
  downloadRows(rows, `${props.fileName}-${option?.label || value || '导出'}`)
  emit('download', value, option)
  if (props.successMessage) ElMessage.success(props.successMessage)
}

function open() {
  if (choices.value.length <= 1) {
    finish(choices.value[0]?.value)
    return
  }
  visible.value = true
}

function confirm() {
  if (!selected.value) return
  visible.value = false
  finish(selected.value)
}
</script>

<template>
  <el-button v-bind="$attrs" :icon="Download" :disabled="disabled || !choices.length" @click="open">导出</el-button>
  <el-dialog v-model="visible" :title="title" class="module-dialog module-dialog-small" align-center append-to-body destroy-on-close>
    <el-radio-group v-model="selected" class="download-methods">
      <el-radio v-for="option in options" :key="option.value" :value="option.value" :disabled="option.disabled" border>
        <span class="download-method-copy"><strong>{{ option.label }}</strong><small v-if="option.description">{{ option.description }}</small></span>
      </el-radio>
    </el-radio-group>
    <template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" :disabled="!selected" @click="confirm">下载</el-button></template>
  </el-dialog>
</template>

<style scoped>
.download-methods { width: 100%; display: grid; gap: var(--space-2); }
.download-methods :deep(.el-radio) { width: 100%; height: auto; min-height: 56px; margin: 0; padding: var(--space-2) var(--space-3); }
.download-method-copy { display: flex; flex-direction: column; gap: var(--space-1); white-space: normal; }
.download-method-copy strong { color: var(--ink); font-size: var(--content-font-size); font-weight: var(--font-weight-medium); }
.download-method-copy small { color: var(--muted); font-size: var(--secondary-font-size); }
</style>
