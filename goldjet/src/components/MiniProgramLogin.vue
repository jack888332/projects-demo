<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { DRIVER_DEMO } from '../domain/driverTasks.js'
import { groundAccount } from '../domain/groundService.js'
defineProps({ title: { type: String, default: '地面服务登录' } })
const emit = defineEmits(['logged-in'])
const data = usePrototypeData(), login = reactive({ phone: '', code: '', remember: true })
const busy = ref(false), error = ref(''), clock = ref(Date.now())
const remaining = computed(() => data.driverChallenge.sentAt === null ? 0 : Math.max(0, Math.ceil((60000 - (clock.value - data.driverChallenge.sentAt)) / 1000)))
const timer = setInterval(() => { clock.value = Date.now() }, 500)
onBeforeUnmount(() => clearInterval(timer))
async function sendCode() {
  error.value = ''
  try {
    const result = await ElMessageBox.prompt(`请输入 ${DRIVER_DEMO.challenge}（本地图形校验模拟）`, '图形校验', { confirmButtonText: '校验并获取', cancelButtonText: '取消', inputValidator: value => Boolean(value) || '请输入图形字符' })
    data.sendDriverCode(login.phone.trim(), result.value); clock.value = Date.now()
    ElMessage.success(`本地模拟验证码：${DRIVER_DEMO.code}，未发送短信`)
  } catch (cause) { if (cause instanceof Error) error.value = cause.message }
}
async function submitLogin(method = 'sms') {
  busy.value = true; error.value = ''
  try {
    const phone = method === 'wechat' ? groundAccount(data.workbenchSession.personaId)?.phone : login.phone.trim()
    if (method === 'wechat') await ElMessageBox.confirm(`模拟微信授权使用绑定手机号 ${phone}，不连接微信。`, '微信授权（模拟）', { confirmButtonText: '授权登录', cancelButtonText: '拒绝' })
    if (await data.loginDriver({ ...login, phone, method })) emit('logged-in')
  } catch (cause) { if (cause instanceof Error) error.value = cause.message }
  finally { busy.value = false }
}
</script>
<template>
  <form class="mini-login" @submit.prevent="submitLogin()">
    <h2>{{ title }}</h2>
    <el-form label-position="top"><el-form-item label="手机号"><el-input v-model="login.phone" aria-label="手机号" maxlength="11" inputmode="numeric" autocomplete="tel" /></el-form-item>
      <el-form-item label="验证码"><div class="code"><el-input v-model="login.code" aria-label="验证码" inputmode="numeric" autocomplete="one-time-code" /><el-button :disabled="remaining > 0 || busy" @click="sendCode">{{ remaining ? `${remaining}秒后重发` : '获取验证码' }}</el-button></div></el-form-item>
    </el-form>
    <el-checkbox v-model="login.remember">保持登录状态</el-checkbox>
    <p v-if="error" role="alert">{{ error }}</p>
    <el-button native-type="submit" type="primary" size="large" :loading="busy">登录</el-button>
    <el-button size="large" :disabled="busy" @click="submitLogin('wechat')">微信快捷登录（模拟）</el-button>
    <slot />
  </form>
</template>
<style scoped>
.mini-login { max-width:400px; margin:28px auto; display:flex; flex-direction:column; gap:12px; }.mini-login > .el-button { margin:0; }h2 { font-size:19px; margin:0 0 12px; }.code { display:flex; gap:8px; width:100%; }.code .el-input { min-width:0; }p { color:var(--danger); margin:0; }
</style>
