<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, UserFilled, Van, Location, Grid } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { isSuperAdmin, canWriteModule } from '../data/accessControl.js'
import { driverTasks, driverStatus, driverIdentifier, driverTerminalTime, driverCargo, driverExpected, driverWindow, driverAccount, DRIVER_DEMO } from '../domain/driverTasks.js'
import DriverTaskOperations from '../components/DriverTaskOperations.vue'
import { driverConfig } from '../data/driverConfig.js'
import QRCode from 'qrcode'
const data = usePrototypeData(), route = useRoute(), router = useRouter()
const login = reactive({ phone: '', code: '', remember: true })
const loading = ref(true), busy = ref(false), error = ref(''), clock = ref(Date.now())
const history = computed(() => route.query.tab === 'history')
const status = computed(() => route.query.status || '全部')
const preview = computed(isSuperAdmin)
const permitted = computed(() => preview.value || data.workbenchSession.personaId === 'driver')
const ready = computed(() => preview.value || Boolean(data.driverSession.phone))
const rows = computed(() => driverTasks(data.state.groundWaybills, data.driverSession.phone, history.value, status.value, preview.value))
const selected = computed(() => rows.value.find(bill => bill.id === route.query.bill))
const pane = computed(() => route.query.pane || 'detail')
const operations = ref()
const accountVisible = ref(false), infoTitle = ref(''), infoContent = ref(''), infoVisible = ref(false), helpVisible = ref(false), qrVisible = ref(false), qrImage = ref(''), qrValue = ref(''), mapAddress = ref(''), mapVisible = ref(false)
const account = computed(() => driverAccount(data.state.groundWaybills,data.driverSession.phone))
const mapUrl = computed(() => `https://www.amap.com/search?query=${encodeURIComponent(mapAddress.value)}`)
const remaining = computed(() => data.driverChallenge.sentAt === null ? 0 : Math.max(0, Math.ceil((60000 - (clock.value - data.driverChallenge.sentAt)) / 1000)))
const timer = setInterval(() => { clock.value = Date.now() }, 500)
onMounted(async () => { try { if (!preview.value && permitted.value) await data.enterDriver() } catch { error.value = '无法读取记住的登录信息，请重新登录' } finally { loading.value = false } })
onBeforeUnmount(() => { clearInterval(timer); data.leaveDriver() })
function navigate(query) { router.push({ path: route.path, query }) }
async function upload(bill) { await router.push({path:route.path,query:{...route.query,bill:bill.id,pane:'documents'}}); await nextTick(); operations.value?.openDocument() }
function completed(result) { if (['已卸货','已取消'].includes(result.status)) navigate({...route.query,tab:'history',status:'全部'}) }
function info(title,content) { infoTitle.value=title; infoContent.value=content; infoVisible.value=true }
async function showAccount() { if (!operations.value || await operations.value.allowDiscard()) accountVisible.value=true }
async function logout() {
  try {
    await ElMessageBox.confirm('退出后需重新验证手机号。','退出登录',{confirmButtonText:'退出登录',cancelButtonText:'取消'})
    await data.logoutDriver(); accountVisible.value=false; login.phone=''; login.code=''; login.remember=true; navigate({})
  } catch(cause) { if (cause instanceof Error) ElMessage.error('未能清除登录记录，请重试退出') }
}
async function showQr() {
  const value=driverIdentifier(selected.value).value
  if (!value) { ElMessage.warning('入仓号为空，不能生成二维码'); return }
  try { qrImage.value=await QRCode.toDataURL(value,{width:280,margin:2,errorCorrectionLevel:'M'}); qrValue.value=value; qrVisible.value=true } catch { ElMessage.error('二维码生成失败，请重试') }
}
function showMap(point) { mapAddress.value=address(point); mapVisible.value=true }
async function sendCode() {
  error.value = ''
  try {
    const result = await ElMessageBox.prompt('请输入 GJ18（本地图形校验模拟）', '图形校验', { confirmButtonText: '校验并获取', cancelButtonText: '取消', inputValidator: value => Boolean(value) || '请输入图形字符' })
    data.sendDriverCode(login.phone.trim(), result.value)
    clock.value = Date.now()
    ElMessage.success(`本地模拟验证码：${DRIVER_DEMO.code}，未发送短信`)
  } catch (cause) { if (cause instanceof Error) error.value = cause.message }
}
async function submitLogin(method = 'sms') {
  busy.value = true; error.value = ''
  try {
    if (method === 'wechat') await ElMessageBox.confirm(`模拟微信授权使用绑定手机号 ${DRIVER_DEMO.phone}，不连接微信。`, '微信授权（模拟）', { confirmButtonText: '授权登录', cancelButtonText: '拒绝' })
    const done = await data.loginDriver({ ...login, phone: method === 'wechat' ? DRIVER_DEMO.phone : login.phone.trim(), method })
    if (done) navigate({})
  } catch (cause) { if (cause instanceof Error) error.value = cause.message }
  finally { busy.value = false }
}
const address = point => [point.province, point.city === point.province ? '' : point.city, point.district, point.address].filter(Boolean).join('')
</script>
<template>
  <section class="driver-app" v-loading="loading">
    <header class="driver-header"><div><span class="driver-kicker">司机端</span><h1>高捷物流</h1></div><el-tag v-if="preview" type="info">超级管理员 · 只读</el-tag><el-button v-else-if="ready" :icon="UserFilled" circle aria-label="我的账户" title="我的账户" @click="showAccount" /><el-icon v-else :size="26"><Van /></el-icon></header>
    <el-empty v-if="!permitted" description="请切换司机角色登录，或使用超级管理员预览" />
    <form v-else-if="!ready" class="driver-login" @submit.prevent="submitLogin()">
      <h2>司机登录</h2>
      <el-form label-position="top"><el-form-item label="手机号"><el-input v-model="login.phone" aria-label="手机号" maxlength="11" inputmode="numeric" autocomplete="tel" /></el-form-item>
        <el-form-item label="验证码"><div class="driver-code"><el-input v-model="login.code" aria-label="验证码" inputmode="numeric" autocomplete="one-time-code" /><el-button :disabled="remaining > 0 || busy" @click="sendCode">{{ remaining ? `${remaining}秒后重发` : '获取验证码' }}</el-button></div></el-form-item>
      </el-form>
      <el-checkbox v-model="login.remember">保持登录状态</el-checkbox>
      <p v-if="error" class="driver-error" role="alert">{{ error }}</p>
      <el-button native-type="submit" type="primary" size="large" :loading="busy">登录</el-button>
      <el-button size="large" :disabled="busy" @click="submitLogin('wechat')">微信快捷登录（模拟）</el-button>
      <nav class="driver-support" aria-label="登录帮助"><el-button link @click="helpVisible=true">帮助</el-button><el-button link @click="info('隐私说明',driverConfig.privacy)">隐私</el-button><el-button link @click="info('条款说明',driverConfig.terms)">条款</el-button></nav>
    </form>
    <template v-else>
      <template v-if="!selected">
        <el-radio-group :model-value="history ? 'history' : 'current'" aria-label="任务视图" @change="value => navigate({tab:value})"><el-radio-button value="current">当前任务</el-radio-button><el-radio-button value="history">历史任务</el-radio-button></el-radio-group>
        <div class="driver-list-tools"><span>{{ history ? '历史' : '当前' }}任务 · {{ rows.length }}</span><el-select v-if="history" :model-value="status" aria-label="历史任务状态" @change="value => navigate({tab:'history',status:value})"><el-option v-for="value in ['全部','已卸货','已取消']" :key="value" :value="value" /></el-select></div>
        <div class="driver-task-list">
          <article v-for="bill in rows" :key="bill.id" class="driver-task">
            <div class="driver-task-head"><strong>{{ bill.waybillNo }}</strong><el-tag>{{ driverStatus(bill) }}</el-tag></div>
            <el-tag v-if="bill.exceptionStatus" :type="bill.exceptionStatus === '异常中' ? 'danger' : 'info'">{{ bill.exceptionStatus }}</el-tag>
            <p class="driver-muted">{{ driverIdentifier(bill).label }}：{{ driverIdentifier(bill).value }}</p>
            <p class="driver-cargo">{{ bill.expectedWeight ?? '未提供' }} kg · {{ bill.expectedPieces ?? '未提供' }} 件 · {{ bill.expectedVolume ?? '未提供' }} m³</p>
            <dl class="driver-points"><template v-for="kind in ['pickup','delivery']" :key="kind"><div v-for="(point,index) in bill[`${kind}Points`]" :key="index"><dt>{{ kind === 'pickup' ? '提' : '卸' }}{{ index+1 }}</dt><dd>{{ address(point) }}</dd></div></template></dl>
            <p class="driver-muted">{{ history ? (driverStatus(bill) === '已卸货' ? '卸货时间' : '取消时间') : driverExpected(bill).label }}：{{ history ? driverTerminalTime(bill) : driverExpected(bill).value }}</p>
            <el-button @click="navigate({...route.query,bill:bill.id})">查看详情</el-button>
            <el-button v-if="!preview && canWriteModule('driver') && driverWindow(bill,'document',data.state.driverClockMs).allowed" @click="upload(bill)">{{ history ? '补传单据' : '单据上传' }}</el-button>
          </article>
        </div>
        <el-empty v-if="!rows.length" description="暂无符合条件的任务" />
      </template>
      <template v-else>
        <div class="driver-detail-heading"><el-button :icon="ArrowLeft" @click="navigate({tab:history ? 'history' : 'current',status})">返回任务</el-button><el-tag>{{ driverStatus(selected) }}</el-tag></div>
        <h2>{{ selected.waybillNo }}</h2>
        <el-tabs :model-value="pane" @tab-change="value=>navigate({...route.query,pane:value})"><el-tab-pane label="详情" name="detail" /><el-tab-pane label="轨迹" name="trajectory" /><el-tab-pane label="单据" name="documents" /><el-tab-pane label="异常" name="exceptions" /></el-tabs>
        <template v-if="pane === 'detail'">
        <el-button :icon="Grid" :disabled="!driverIdentifier(selected).value" @click="showQr">生成二维码</el-button>
        <dl class="driver-fields"><div v-for="item in [{label:'入仓号',value:driverIdentifier(selected).value},{label:'运单号',value:selected.waybillNo},{label:'运单状态',value:driverStatus(selected)},{label:'车牌号',value:selected.plate},{label:'车型',value:selected.vehicleType},{label:'共计提货车辆（辆）',value:data.state.groundWaybills.filter(bill => bill.orderId === selected.orderId && driverStatus(bill) !== '已取消').length},...driverCargo(selected),{label:'特定提货时间',value:selected.pickupTime},{label:'期望送达时间',value:selected.deliveryTime}]" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl>
        <section v-for="kind in ['pickup','delivery']" :key="kind" class="driver-section"><h3>{{ kind === 'pickup' ? '提货地点' : '送货地点' }}</h3><div v-for="(point,index) in selected[`${kind}Points`]" :key="index" class="driver-stop"><strong>{{ index+1 }}. {{ address(point) }}</strong><p>{{ point.contact }} {{ point.phone }}</p><el-button v-if="!history" :icon="Location" @click="showMap(point)">查看地图</el-button></div></section>
        </template>
        <DriverTaskOperations ref="operations" :bill="selected" :pane="pane" @completed="completed" />
      </template>
    </template>
  </section>
  <el-dialog v-model="accountVisible" title="我的账户" width="min(460px, calc(100vw - 24px))" append-to-body>
    <div class="driver-account-avatar"><el-avatar :size="64" :icon="data.driverSession.method === 'wechat' ? UserFilled : Van" /><span>{{ data.driverSession.method === 'wechat' ? '微信头像（模拟）' : '司机头像（演示）' }}</span></div>
    <dl class="driver-account-fields"><dt>姓名</dt><dd>{{ account.name }}</dd><dt>手机号码</dt><dd>{{ data.driverSession.phone }}</dd><dt>公司</dt><dd>{{ account.company }}</dd></dl>
    <p v-if="account.pending" class="driver-muted">关联运单的账户资料不一致，最新记录口径待确认（155）。</p>
    <nav class="driver-account-links"><el-button @click="info('关于我们',driverConfig.about)">关于我们</el-button><el-button @click="helpVisible=true">帮助中心</el-button><el-button @click="info('隐私说明',driverConfig.privacy)">隐私说明</el-button><el-button @click="info('条款说明',driverConfig.terms)">条款说明</el-button><el-button @click="info('联系我们',driverConfig.contact)">联系我们</el-button></nav>
    <template #footer><el-button type="danger" @click="logout">退出登录</el-button></template>
  </el-dialog>
  <el-dialog v-model="helpVisible" title="帮助中心" width="min(460px, calc(100vw - 24px))" append-to-body><div class="driver-account-links"><el-button v-for="item in driverConfig.help" :key="item.title" @click="info(item.title,item.content)">{{ item.title }}</el-button></div></el-dialog>
  <el-dialog v-model="infoVisible" :title="infoTitle" width="min(460px, calc(100vw - 24px))" append-to-body><p>{{ infoContent }}</p></el-dialog>
  <el-dialog v-model="qrVisible" title="入仓二维码" width="min(360px, calc(100vw - 24px))" append-to-body><div class="driver-qr"><img :src="qrImage" alt="入仓号二维码" width="280" height="280" /><p>{{ qrValue }}</p></div></el-dialog>
  <el-dialog v-model="mapVisible" title="高德地图目的地" width="min(460px, calc(100vw - 24px))" append-to-body><p>{{ mapAddress }}</p><p class="driver-muted">浏览器地图替代入口，未验证手机高德APP唤醒。</p><template #footer><el-button @click="mapVisible=false">关闭</el-button><el-link :href="mapUrl" target="_blank" rel="noopener noreferrer" type="primary">打开高德地图</el-link></template></el-dialog>
</template>
<style scoped>
.driver-app { max-width:1000px; margin:0 auto; color:var(--ink); padding-bottom:24px; }
.driver-header { display:flex; justify-content:space-between; align-items:center; padding:0 0 20px; gap:12px; border-bottom:1px solid var(--border); margin-bottom:20px; }
.driver-kicker,.driver-muted { color:var(--muted); font-size:13px; }
h1 { font-size:24px; margin:4px 0 0; } h2 { font-size:19px; margin:20px 0; overflow-wrap:anywhere; } h3 { font-size:16px; margin:0 0 16px; }
.driver-login { max-width:400px; margin:28px auto; display:flex; flex-direction:column; gap:12px; }
.driver-login > .el-button { margin:0; }.driver-code { display:flex; gap:8px; width:100%; }.driver-code .el-input { min-width:0; }
.driver-error { color:var(--danger); margin:0; }.driver-task-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr)); gap:16px; }
.driver-task { border:1px solid var(--border); border-radius:6px; background:var(--panel); padding:18px; min-width:0; overflow-wrap:anywhere; }
.driver-task-head,.driver-list-tools,.driver-detail-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.driver-task-head { flex-wrap:wrap; }.driver-list-tools { margin:18px 0; }.driver-list-tools .el-select { width:140px; }
.driver-points { margin:16px 0; }.driver-points > div { display:flex; gap:12px; margin:12px 0; }.driver-points dt { color:var(--primary); flex:0 0 25px; }.driver-points dd { margin:0; line-height:1.6; }
.driver-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); margin:0; gap:0 28px; }.driver-fields > div { display:grid; grid-template-columns:155px minmax(0,1fr); border-bottom:1px solid var(--border); padding:13px 0; gap:8px; }.driver-fields dt { color:var(--muted); }.driver-fields dd { margin:0; min-height:20px; overflow-wrap:anywhere; }
.driver-section { padding:24px 0; border-bottom:1px solid var(--border); }.driver-stop + .driver-stop { margin-top:20px; }.driver-stop p { color:var(--muted); margin:8px 0; }
.driver-support { display:flex; justify-content:center; margin-top:12px; }.driver-account-fields { display:grid; grid-template-columns:80px minmax(0,1fr); gap:16px; }.driver-account-fields dd { margin:0; min-height:20px; overflow-wrap:anywhere; }.driver-account-fields dt { color:var(--muted); }.driver-account-avatar { display:flex; align-items:center; gap:16px; margin:0 0 24px; }.driver-account-avatar span { font-size:13px; color:var(--muted); }.driver-account-links { display:flex; flex-direction:column; gap:12px; }.driver-account-links .el-button { margin:0; white-space:normal; min-height:40px; height:auto; }.driver-qr { text-align:center; overflow-wrap:anywhere; }.driver-qr img { width:100%; max-width:280px; height:auto; aspect-ratio:1; }
@media(max-width:700px) { .driver-fields { grid-template-columns:minmax(0,1fr); }.driver-header { padding-bottom:16px; }.driver-task { padding:16px; }.driver-app :deep(.el-button) { min-height:40px; }.driver-fields > div { grid-template-columns:150px minmax(0,1fr); } }
</style>
