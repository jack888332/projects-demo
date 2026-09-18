<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { Lightning, Picture, Refresh, Check } from '@element-plus/icons-vue'
import QRCode from 'qrcode'
const props = defineProps({ samples: { type: Array, default: () => [] } })
const emit = defineEmits(['recognized', 'manual', 'cancel'])
const code = ref(props.samples[0] || ''), qr = ref(''), flash = ref(false), remaining = ref(10), error = ref(''), album = ref(), busy = ref(false)
let timer, generation = 0, disposed = false
function restart() { clearInterval(timer); remaining.value = 10; timer = setInterval(() => { if (--remaining.value <= 0) { clearInterval(timer); emit('manual', true) } }, 1000) }
function recognized(value) { clearInterval(timer); emit('recognized', value) }
watch(code, async value => { const token = ++generation; const image = value ? await QRCode.toDataURL(value, { width: 224, margin: 2 }) : ''; if (!disposed && generation === token) qr.value = image }, { immediate: true })
onMounted(restart)
onBeforeUnmount(() => { disposed = true; generation++; clearInterval(timer) })
async function readAlbum(event) {
  const file = event.target.files[0]; event.target.value = ''
  if (!file) return
  clearInterval(timer); busy.value = true; error.value = ''
  let bitmap
  try {
    if (!globalThis.BarcodeDetector) throw new Error('unsupported')
    bitmap = await createImageBitmap(file)
    const codes = await new BarcodeDetector().detect(bitmap)
    if (!codes[0]?.rawValue) throw new Error('unrecognized')
    if (!disposed) recognized(codes[0].rawValue)
  } catch { if (!disposed) error.value = '无法识别，请重新选择！' }
  finally { bitmap?.close(); if (!disposed) busy.value = false }
}
</script>
<template>
  <section class="scanner" aria-label="单号扫描">
    <div :class="['scan-window', { flash }]">
      <img v-if="qr" :src="qr" width="224" height="224" alt="合成单号二维码" />
      <span v-else>等待单号</span>
    </div>
    <p role="status">扫码模拟 · {{ remaining > 0 ? `${remaining}秒` : '等待识别' }}</p>
    <div class="scan-tools"><el-button :icon="Lightning" :aria-pressed="flash" :type="flash ? 'warning' : 'default'" @click="flash = !flash">闪光灯（模拟）</el-button><el-button :icon="Picture" :loading="busy" @click="album.click()">相册</el-button><el-button :icon="Refresh" circle title="重新扫描" aria-label="重新扫描" @click="restart" /></div>
    <input ref="album" type="file" accept="image/*" aria-label="相册识别图片" hidden @change="readAlbum" />
    <el-select v-model="code" filterable allow-create default-first-option aria-label="模拟识别单号"><el-option v-for="value in samples" :key="value" :value="value" /></el-select>
    <p v-if="error" class="scan-error" role="alert">{{ error }}</p>
    <div class="scan-tools"><el-button :icon="Check" :disabled="!code || busy" type="primary" @click="recognized(code)">模拟识别</el-button><el-button @click="emit('manual', false)">无法识别</el-button><el-button @click="emit('cancel')">返回</el-button></div>
  </section>
</template>
<style scoped>
.scanner { max-width:480px; margin:0 auto; display:flex; flex-direction:column; gap:16px; }.scan-window { min-height:276px; display:flex; align-items:center; justify-content:center; background:#263338; border-radius:6px; }.scan-window.flash { background:#647174; }.scan-window img { width:224px; height:224px; object-fit:contain; }.scan-window span { color:white; }.scan-tools { display:flex; flex-wrap:wrap; gap:8px; }.scan-tools .el-button { margin:0; min-height:40px; }p { margin:0; color:var(--muted); }.scan-error { color:var(--danger); }
</style>
