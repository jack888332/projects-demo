<script setup>
import { ElMessage } from 'element-plus'
import { PARTNER_SAMPLE_ATTACHMENT } from '../domain/partnerPresentation.js'
const props = defineProps({ files: { type: Array, required: true }, readonly: Boolean, error: String })
function attach() {
  if (props.files.some(file => file.id === PARTNER_SAMPLE_ATTACHMENT.id)) return ElMessage.info('演示资料已附加')
  props.files.push({ ...PARTNER_SAMPLE_ATTACHMENT, size: new TextEncoder().encode(PARTNER_SAMPLE_ATTACHMENT.content).length })
}
function download(file) {
  if (typeof file.content !== 'string') return ElMessage.warning('这份历史资料没有可下载的本地内容')
  const url = URL.createObjectURL(new Blob([file.content], { type: file.type || 'text/plain' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>
<template>
  <section class="partner-attachments">
    <h3>附件</h3>
    <p>仅使用预置合成文本演示附件关联与下载。真实上传的类型、数量及重名处理规则待明确，不接收真实营业或身份资料。</p>
    <el-button v-if="!readonly" @click="attach">附加演示营业资料</el-button>
    <p v-if="error" role="alert" class="attachment-error">{{ error }}</p>
    <ul><li v-for="(file,index) in files" :key="file.id"><span>{{ file.name }} · {{ file.size ?? 0 }} 字节</span><el-button link type="primary" @click="download(file)">下载</el-button><el-button v-if="!readonly" link type="danger" @click="files.splice(index,1)">移除</el-button></li></ul>
  </section>
</template>
<style scoped>
.partner-attachments { margin:24px 0; }
h3 { font-size:16px; }
p { color:var(--muted); font-size:13px; line-height:1.6; }
ul { list-style:none; padding:0; }
li { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin:12px 0; }
.attachment-error { color:var(--danger); }
</style>
