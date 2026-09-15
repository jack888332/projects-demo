<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Upload } from '@element-plus/icons-vue'
import { validateDriverAttachment } from '../domain/fleetOperations.js'
const props = defineProps({ modelValue: { type: Object, default: null }, label: { type: String, required: true }, readonly: Boolean })
const emit = defineEmits(['update:modelValue', 'busy'])
const input = ref(), preview = ref(false), loading = ref(false), failure = ref('')
async function selectFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || props.readonly || props.modelValue) return
  failure.value = ''
  if (file.size > 6 * 1024 * 1024 || !/\.(jpg|png|bmp)$/i.test(file.name)) {
    failure.value = '请选择不超过 6 MB 的 JPG、PNG 或 BMP 图片'
    return
  }
  loading.value = true
  emit('busy', true)
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('图片读取失败，请重新选择'))
      reader.readAsDataURL(file)
    })
    const attachment = { id: `${props.label}:${file.name}:${file.size}`, name: file.name, type: file.type, size: file.size, dataUrl }
    const error = validateDriverAttachment(attachment)
    if (error) throw new Error(error)
    await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = resolve
      image.onerror = () => reject(new Error('图片内容无法读取，请重新选择'))
      image.src = dataUrl
    })
    emit('update:modelValue', attachment)
  } catch (error) { failure.value = error.message }
  finally { loading.value = false; emit('busy', false) }
}
async function remove() {
  try {
    await ElMessageBox.confirm(`删除“${props.label}”已上传的图片？保存后将解除与此司机的关联。`, '删除证件图片', { confirmButtonText: '删除图片', cancelButtonText: '保留图片', type: 'warning' })
    emit('update:modelValue', null)
    failure.value = ''
  } catch { /* Keep the attachment when cancelled. */ }
}
function openPreview() {
  if (!props.modelValue?.dataUrl) return ElMessage.warning('图片内容不可用')
  preview.value = true
}
</script>
<template>
  <div class="certificate-field">
    <template v-if="modelValue">
      <button class="certificate-preview" type="button" :aria-label="`预览${label}`" @click="openPreview"><img :src="modelValue.dataUrl" :alt="label" /></button>
      <div class="certificate-meta"><span>{{ modelValue.name }}</span><small>{{ (modelValue.size / 1024).toFixed(1) }} KB</small></div>
      <el-button v-if="!readonly" :icon="Delete" link type="danger" :aria-label="`删除${label}`" @click="remove">删除</el-button>
    </template>
    <template v-else-if="!readonly">
      <input ref="input" class="file-input" type="file" :aria-label="`上传${label}`" accept=".jpg,.png,.bmp" @change="selectFile" />
      <el-button :icon="Upload" :loading="loading" :aria-label="`上传${label}`" @click="input.click()">上传图片</el-button><small>JPG / PNG / BMP，最大 6 MB</small>
    </template>
    <span v-else>未上传</span>
    <p v-if="failure" role="alert" class="file-error">{{ failure }}</p>
    <el-dialog v-model="preview" :title="label" width="min(680px, 94vw)" append-to-body><img v-if="modelValue" class="certificate-full" :src="modelValue.dataUrl" :alt="label" /></el-dialog>
  </div>
</template>
<style scoped>
.certificate-field { display:flex; flex-wrap:wrap; align-items:center; gap:10px; width:100%; min-width:0; }
.file-input { display:none; }
.certificate-preview { flex:none; width:104px; height:65px; padding:0; border:1px solid var(--line); background:white; border-radius:4px; cursor:zoom-in; }
.certificate-preview img { width:100%; height:100%; object-fit:contain; }
.certificate-meta { display:flex; flex:1; min-width:90px; flex-direction:column; overflow-wrap:anywhere; line-height:1.5; }
small { color:var(--muted); font-size:12px; }
.file-error { width:100%; margin:0; color:var(--danger); font-size:12px; }
.certificate-full { display:block; width:100%; max-height:70vh; object-fit:contain; }
</style>
