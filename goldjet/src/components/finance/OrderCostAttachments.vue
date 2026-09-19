<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { Upload, Download, Delete, View } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { costFileError } from '../../domain/orderCosts.js'
const props = defineProps({ modelValue: { type: Array, default: () => [] }, readonly: Boolean,
  validateFile: { type: Function, default: costFileError },
  accept: { type: String, default: '.txt,.csv,.png,.jpg,.jpeg,.webp,.gif' },
  inputLabel: { type: String, default: '选择成本附件' },
  duplicateMessage: { type: String, default: '同名附件的替换/并存规则待确认（190），请重新选择' },
})
const emit = defineEmits(['update:modelValue', 'busy'])
const input = ref(), preview = ref(null), loading = ref(false)
let alive = true
onBeforeUnmount(() => { alive = false })
async function upload(event) {
  const files = [...event.target.files]; event.target.value = ''
  if (props.readonly || loading.value) return
  const invalid = files.map(props.validateFile).find(Boolean)
  if (invalid) return ElMessage.error(invalid)
  const names = [...props.modelValue, ...files].map(file => file.name)
  if (new Set(names).size !== names.length) return ElMessage.error(props.duplicateMessage)
  loading.value = true; emit('busy', true)
  try {
    const additions = await Promise.all(files.map(file => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('附件读取失败，请重新选择'))
      reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result })
      reader.readAsDataURL(file)
    })))
    if (alive && !props.readonly) emit('update:modelValue', [...props.modelValue, ...additions])
  } catch (error) { ElMessage.error(error.message) }
  finally { loading.value = false; if (alive) emit('busy', false) }
}
function download(file) {
  const anchor = document.createElement('a'); anchor.href = file.dataUrl; anchor.download = file.name; anchor.click()
}
function view(file) {
  preview.value = { ...file, text: file.type.startsWith('text/') ? new TextDecoder().decode(Uint8Array.from(atob(file.dataUrl.split(',')[1]), char => char.charCodeAt(0))) : '' }
}
</script>
<template>
  <div class="cost-files">
    <input ref="input" class="file-picker" type="file" multiple :accept="accept" :aria-label="inputLabel" :disabled="readonly || loading" @change="upload">
    <el-button v-if="!readonly" :icon="Upload" :loading="loading" @click="input.click()">上传附件</el-button>
    <span v-if="!modelValue.length" class="empty">暂无附件</span>
    <div v-for="(file, index) in modelValue" :key="index" class="file-row">
      <span>{{ file.name }} · {{ Math.ceil(file.size / 1024) }} KB</span>
      <el-button v-if="file.type.startsWith('text/') || file.type.startsWith('image/')" :icon="View" text aria-label="查看附件" title="查看附件" @click="view(file)"/>
      <el-button :icon="Download" text aria-label="下载附件" title="下载附件" @click="download(file)"/>
      <el-button v-if="!readonly" :icon="Delete" text type="danger" aria-label="移除附件" title="移除附件" @click="emit('update:modelValue', modelValue.filter((_, i) => i !== index))"/>
    </div>
    <el-dialog :model-value="!!preview" :title="preview?.name" width="min(860px,95vw)" append-to-body @close="preview=null">
      <template v-if="preview"><img v-if="preview.type.startsWith('image/')" :src="preview.dataUrl" :alt="preview.name"><pre v-else>{{ preview.text }}</pre></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.cost-files{min-width:0}.file-picker{display:none}.empty{color:var(--muted);margin-inline:12px}.file-row{display:flex;align-items:center;gap:6px;margin-block:8px}.file-row>span{overflow-wrap:anywhere;flex:1;min-width:0}.file-row .el-button+.el-button{margin-left:0}img{display:block;max-width:100%;max-height:65vh;margin:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}
</style>
