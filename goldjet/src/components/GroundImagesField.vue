<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { Upload, Delete, Camera } from '@element-plus/icons-vue'
import { groundImagesError } from '../domain/groundWaybills.js'
const props = defineProps({ modelValue: { type: Array, default: () => [] }, readonly: Boolean, label: { type: String, default: '附件图片' }, maxImages: { type: Number, default: 9 }, camera: Boolean, limitExclusive: Boolean, validate: {type:Function,default:groundImagesError} })
const emit = defineEmits(['update:modelValue', 'busy'])
const input = ref(), cameraInput = ref(), busy = ref(false), failure = ref('')
let disposed = false
onBeforeUnmount(() => { disposed = true })
async function select(event) {
  const files = [...event.target.files]; event.target.value = ''
  if (props.readonly || busy.value || !files.length) return
  failure.value = ''
  if (props.modelValue.length + files.length > props.maxImages) { failure.value = `最多上传${props.maxImages}张图片`; return }
  busy.value = true; emit('busy', true)
  try {
    const next = [...props.modelValue]
    for (const file of files) {
      if (!/\.(jpg|png|bmp)$/i.test(file.name) || file.size > 6 * 1024 * 1024 || !file.size) throw new Error('请选择不超过6MB的JPG、PNG或BMP图片')
      if (props.limitExclusive && file.size >= 6 * 1024 * 1024) throw new Error('单张图片须小于6MB')
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败，请重试')); reader.readAsDataURL(file) })
      const image = { name: file.name, type: file.type, size: file.size, dataUrl }
      const error = props.validate([...next, image], props.maxImages); if (error) throw new Error(error)
      await new Promise((resolve, reject) => { const element = new Image(); element.onload = resolve; element.onerror = () => reject(new Error('图片内容无法读取，请重新选择')); element.src = dataUrl })
      next.push(image)
    }
    if (!disposed && !props.readonly) emit('update:modelValue', next)
  } catch (error) { if (!disposed) failure.value = error.message }
  finally { if (!disposed) { busy.value = false; emit('busy', false) } }
}
</script>
<template>
  <div class="ground-images">
    <div v-for="(image,index) in modelValue" :key="index" class="ground-image">
      <el-image :src="image.dataUrl" :alt="image.name" :preview-src-list="modelValue.map(row => row.dataUrl)" :initial-index="index" preview-teleported fit="contain" :aria-label="`预览${image.name}`" />
      <span :title="image.name">{{ image.name }}</span>
      <el-button v-if="!readonly" :icon="Delete" link type="danger" :disabled="busy" :aria-label="`删除图片${index+1}`" @click="emit('update:modelValue',modelValue.filter((_,i) => i !== index))">删除</el-button>
    </div>
    <template v-if="!readonly"><input ref="input" type="file" multiple accept=".jpg,.png,.bmp" :aria-label="label" @change="select" /><el-button :icon="Upload" :loading="busy" :disabled="modelValue.length >= maxImages" @click="input.click()">上传图片</el-button><small>{{ modelValue.length }}/{{ maxImages }} · JPG / PNG / BMP · {{limitExclusive?'单张<6MB':'单张≤6MB'}}</small></template>
    <template v-if="camera && !readonly"><input ref="cameraInput" type="file" accept="image/jpeg,image/png,image/bmp" capture="environment" aria-label="拍摄图片" @change="select" /><el-button :icon="Camera" :disabled="busy || modelValue.length >= maxImages" @click="cameraInput.click()">拍照</el-button></template>
    <p v-if="failure" role="alert">{{ failure }}</p>
  </div>
</template>
<style scoped>
.ground-images { display:flex; gap:10px; align-items:center; flex-wrap:wrap; width:100%; min-width:0; }
.ground-images input { display:none; }
.ground-image { display:flex; flex-direction:column; align-items:start; width:110px; min-width:0; }
.ground-image :deep(.el-image) { width:110px; height:75px; border:1px solid var(--line); border-radius:4px; cursor:zoom-in; }
.ground-image > span { width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
small { color:var(--muted); font-size:12px; }
p { width:100%; color:var(--danger); margin:0; font-size:12px; }
</style>
