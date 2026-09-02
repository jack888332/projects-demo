<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { Download, UploadFilled } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '导入' },
  templateName: { type: String, default: '导入模板.xlsx' },
  confirmLabel: { type: String, default: '导入' },
  accept: { type: String, default: '.xlsx,.xls,.csv' },
})

const emit = defineEmits(['update:modelValue', 'submit', 'download-template'])
const files = ref([])

function close() {
  emit('update:modelValue', false)
}

function reset() {
  files.value = []
}

function downloadTemplate() {
  emit('download-template')
  ElMessage.success(`${props.templateName} 已下载`)
}

function submit() {
  const file = files.value[0]
  if (!file) return
  emit('submit', file.raw || file)
  close()
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    class="module-dialog"
    align-center
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @closed="reset"
  >
    <div class="import-dialog-fields">
      <div class="import-dialog-row">
        <div><strong>导入模板</strong><span>{{ templateName }}</span></div>
        <el-button :icon="Download" @click="downloadTemplate">下载</el-button>
      </div>
      <div class="import-dialog-row import-file-row">
        <div><strong>导入文件</strong><span>{{ files[0]?.name || '未选择文件' }}</span></div>
        <el-upload v-model:file-list="files" :accept="accept" :auto-upload="false" :limit="1" :show-file-list="false">
          <el-button :icon="UploadFilled">选择文件</el-button>
        </el-upload>
      </div>
    </div>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :disabled="!files.length" @click="submit">{{ confirmLabel }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.import-dialog-fields { border-top: 1px solid var(--border); }
.import-dialog-row { min-height: 72px; padding: 0 var(--space-2); display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); border-bottom: 1px solid var(--border); }
.import-dialog-row > div:first-child { min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.import-dialog-row strong { color: var(--ink); font-size: var(--content-font-size); }
.import-dialog-row span { overflow-wrap: anywhere; color: var(--muted); font-size: var(--secondary-font-size); }
.import-file-row :deep(.el-upload-list) { margin: var(--space-2) 0 0; }
:global(:root[data-ui-layout="narrow"]) .import-dialog-row { padding: var(--space-3) 0; align-items: stretch; flex-direction: column; }
</style>
