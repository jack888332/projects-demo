<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, nextTick, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ArrowLeft, ArrowRight, Camera, Check, Delete, Plus, UserFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { isSuperAdmin, canWriteModule, canReadModule, groundServicePermissions } from '../data/accessControl.js'
import { GROUND_SERVICE_OPERATIONS, groundOperation, groundAccount, groundServiceDraft, groundArrivalSummary } from '../domain/groundService.js'
import MiniProgramLogin from '../components/MiniProgramLogin.vue'
import GroundImagesField from '../components/GroundImagesField.vue'
import GroundServiceScanner from '../components/GroundServiceScanner.vue'

const data = usePrototypeData(), route = useRoute(), router = useRouter()
const preview = computed(isSuperAdmin), account = computed(() => groundAccount(data.workbenchSession.personaId))
const ready = computed(() => preview.value || Boolean(account.value && account.value.phone === data.driverSession.phone))
const permitted = computed(() => preview.value || Boolean(account.value))
const operations = computed(() => GROUND_SERVICE_OPERATIONS.filter(item => preview.value || groundServicePermissions(data.workbenchSession.personaId).includes(item.id)))
const config = computed(() => operations.value.find(item => item.id === route.query.operation))
const writable = computed(() => ready.value && !preview.value && canWriteModule('groundService'))
const rows = computed(() => ready.value ? operations.value.flatMap(item => data.getGroundServiceRecords(item.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [])
const records = computed(() => config.value ? rows.value.filter(row => row.operation === config.value.id) : rows.value)
const existing = computed(() => records.value.find(row => row.id === route.query.record))
const draft = reactive(groundServiceDraft()), baseline = ref(''), errors = ref({}), feedback = ref(''), loading = ref(true), uploading = ref(false), busy = ref(false), scanner = ref(false), editingRevision = ref(0)
const dirty = computed(() => baseline.value && JSON.stringify(draft) !== baseline.value)
const readonly = computed(() => !writable.value || Boolean(config.value?.batch && existing.value))
const form = ref(), accountVisible = ref(false)
const samples = computed(() => {
  const registry = data.state.groundServiceRegistry, op = config.value?.id
  if (config.value?.batch) return registry.consignments.find(row => row.number === draft.number)?.packages || registry.consignments[0].packages
  if (op === 'document') return registry.inbounds.map(row => row.number)
  if (op === 'outbound') return registry.pallets.map(row => row.number)
  if (op === 'arrival') return registry.arrivals.map(row => row.number)
  if (op === 'generalReturn') return data.state.airOrders.filter(row => !row.deleted && row.orderStatus !== '已作废').map(row => row.orderNo)
  return registry.consignments.map(row => row.number)
})
const arrival = computed(() => existing.value?.operation === 'arrival' ? groundArrivalSummary(data.state, existing.value.orderId) : null)
function hydrate() {
  const saved = existing.value
  Object.assign(draft, groundServiceDraft(), saved ? JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(groundServiceDraft()).map(key => [key, saved[key]])))) : {})
  baseline.value = JSON.stringify(draft); editingRevision.value = saved?.revision || 0; errors.value = {}; feedback.value = ''; scanner.value = Boolean(config.value && !config.value.batch && !saved && route.query.scan === '1')
}
watch(() => [route.query.operation, route.query.record, route.query.scan, ready.value], hydrate, { immediate: true })
onMounted(async () => { try { if (!preview.value && permitted.value) await data.enterDriver() } catch { feedback.value = '无法读取登录信息，请重新登录' } finally { loading.value = false } window.addEventListener('beforeunload', beforeUnload) })
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
async function allowLeave() {
  if (uploading.value || busy.value) return false
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('有未提交的单号、图片或包裹码，是否放弃？', '未保存的内容', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑' }); return true } catch { return false }
}
onBeforeRouteLeave(allowLeave)
onBeforeRouteUpdate(allowLeave)
function navigate(query = {}) { return router.push({ path: '/fulfillment/ground-service', query }) }
function openOperation(item) { navigate({ operation: item.id, ...(item.batch ? {} : { scan: '1' }) }) }
async function openRecord(row) { await navigate({ operation: row.operation, record: row.id }) }
async function received(number) {
  scanner.value = false; feedback.value = ''
  if (config.value.batch) {
    if (draft.packages.some(value => value.trim() === number.trim())) { feedback.value = '当前包裹码已扫描，请返回确认！'; return }
    const empty = draft.packages.findIndex(value => !value.trim())
    if (empty >= 0) draft.packages[empty] = number
    else draft.packages.push(number)
  } else {
    const saved = records.value.find(row => row.number === number.trim())
    if (saved) { await openRecord(saved); return }
    draft.number = number
  }
}
function manual(timedOut) { scanner.value = false; if (timedOut) feedback.value = '无法识别，请手动输入或重新尝试' }
async function lookup() {
  const record = records.value.find(row => row.number === draft.number.trim())
  if (record) await openRecord(record)
  else feedback.value = '该单号在当前操作项下暂无提交记录'
}
async function submit() {
  if (readonly.value || uploading.value || busy.value) return
  errors.value = {}; feedback.value = ''; busy.value = true
  try {
    const saved = data.submitGroundService(config.value.id, draft, existing.value?.id || '', editingRevision.value)
    baseline.value = JSON.stringify(draft)
    busy.value = false
    await navigate({ operation: saved.operation, record: saved.id })
    hydrate()
    ElMessage.success(`您的${config.value.label}已成功上报！`)
  } catch (cause) {
    errors.value = cause.fields || {}; feedback.value = cause.message
    await nextTick(); form.value?.querySelector('.is-error input, .is-error textarea')?.focus()
  } finally { busy.value = false }
}
async function logout() {
  if (!await allowLeave()) return
  try { await ElMessageBox.confirm('退出后需重新验证手机号。', '退出登录', { confirmButtonText: '退出登录', cancelButtonText: '取消' }); await data.logoutDriver(); accountVisible.value = false; baseline.value = ''; await navigate() } catch (cause) { if (cause instanceof Error) ElMessage.error('未能清除登录记录，请重试退出') }
}
</script>

<template>
  <section class="ground-service" v-loading="loading">
    <header class="service-heading"><div><span class="muted">航晟物流小程序</span><h1>地面服务</h1></div><el-tag v-if="preview" type="info">超级管理员 · 只读</el-tag><el-button v-else-if="ready" :icon="UserFilled" circle title="我的账户" aria-label="我的账户" @click="accountVisible = true" /></header>
    <el-empty v-if="!permitted" description="请切换地面仓库、地面货站或司机角色登录" />
    <MiniProgramLogin v-else-if="!ready" @logged-in="hydrate" />
    <template v-else>
      <nav v-if="data.workbenchSession.personaId === 'driver' && canReadModule('driver')" class="service-tabs" aria-label="小程序页签"><el-button @click="router.push('/fulfillment/driver?tab=current')">当前任务</el-button><el-button @click="router.push('/fulfillment/driver?tab=history')">历史任务</el-button><el-button type="primary" aria-current="page">地面服务</el-button></nav>
      <template v-if="!route.query.operation">
        <div class="operation-list"><button v-for="item in operations" :key="item.id" class="operation" @click="openOperation(item)"><span class="operation-icon"><el-icon :size="22"><Camera /></el-icon></span><span><strong>{{ item.label }}</strong><small>{{ item.number }} · {{ item.target }}</small></span><el-icon><ArrowRight /></el-icon></button></div>
        <el-empty v-if="!operations.length" description="当前账户未配置地面服务操作项" />
        <h2>操作记录</h2>
        <div class="record-list"><button v-for="row in records" :key="row.id" @click="openRecord(row)"><span><strong>{{ groundOperation(row.operation).label }}</strong><small>{{ row.number }}<template v-if="row.packages.length"> · {{ row.packages.length }}个包裹</template></small></span><span>{{ row.updatedAt }}</span></button></div><el-empty v-if="!records.length" description="暂无操作记录" :image-size="70" />
      </template>
      <el-result v-else-if="!config" icon="warning" title="无此操作权限"><template #extra><el-button @click="navigate()">返回操作列表</el-button></template></el-result>
      <template v-else>
        <div class="task-heading"><el-button :icon="ArrowLeft" @click="navigate()">返回</el-button><h2>{{ config.label }}{{ existing ? (config.batch ? '记录' : '修改') : '' }}</h2><el-tag v-if="existing" type="success">已提交</el-tag></div>
        <el-alert v-if="route.query.record && !existing" title="记录不存在或当前无权查看，请返回重新选择" type="warning" :closable="false" />
        <GroundServiceScanner v-else-if="scanner" :samples="samples" @recognized="received" @manual="manual" @cancel="scanner = false" />
        <div v-else ref="form" class="service-form">
          <el-alert v-if="feedback" :title="feedback" type="warning" :closable="false" class="feedback" role="alert" />
          <el-alert v-if="preview || !writable" title="只读查看，当前角色不可提交业务操作" type="info" :closable="false" class="feedback" />
          <el-form label-position="top" @submit.prevent="submit">
            <el-form-item :label="config.number" required :error="errors.number"><div class="number-input"><el-input v-model="draft.number" :aria-label="config.number" :readonly="readonly" :placeholder="config.batch ? '781-90000001' : ''" /><el-button v-if="!config.batch && !existing" @click="lookup">查询记录</el-button></div></el-form-item>
            <template v-if="config.id === 'returnOut'"><el-form-item label="提货人姓名" :error="errors.collectorName"><el-input v-model="draft.collectorName" aria-label="提货人姓名" :readonly="readonly" maxlength="40" /></el-form-item><el-form-item label="提货人联系方式" :error="errors.collectorPhone"><el-input v-model="draft.collectorPhone" aria-label="提货人联系方式" :readonly="readonly" inputmode="numeric" maxlength="20" /></el-form-item><el-form-item label="提货人车牌号" :error="errors.collectorPlate"><el-input v-model="draft.collectorPlate" aria-label="提货人车牌号" :readonly="readonly" maxlength="30" /></el-form-item></template>
            <el-form-item v-if="config.batch" label="包裹码" required :error="errors.packages"><div class="package-list"><div v-for="(code, index) in draft.packages" :key="index" :class="['package-row', { invalid: errors.invalidRows?.includes(index) }]"><span>{{ index + 1 }}</span><el-input v-model="draft.packages[index]" :aria-label="`包裹码${index + 1}`" :readonly="readonly" :aria-invalid="errors.invalidRows?.includes(index) || false" /><el-button v-if="!readonly" :icon="Delete" circle :aria-label="`删除包裹码${index + 1}`" title="删除包裹码" @click="draft.packages.splice(index, 1)" /></div><div v-if="!readonly" class="package-tools"><el-button :icon="Plus" @click="draft.packages.push('')">新增</el-button><el-button :icon="Camera" @click="scanner = true">扫一扫</el-button></div></div></el-form-item>
            <el-form-item label="单据照片" :required="config.imagesRequired" :error="errors.images"><GroundImagesField v-model="draft.images" :readonly="readonly" :max-images="15" camera label="单据照片" @busy="uploading = $event" /></el-form-item>
            <el-form-item label="备注" :error="errors.remark"><el-input v-model="draft.remark" type="textarea" :rows="3" maxlength="500" show-word-limit aria-label="备注" :readonly="readonly" /></el-form-item>
            <p v-if="errors.record" class="field-error" role="alert">{{ errors.record }}</p>
            <div class="submit-tools"><el-button v-if="!config.batch && !existing" :icon="Camera" @click="scanner = true">重新扫描</el-button><el-button v-if="!readonly" type="primary" :icon="Check" :loading="busy" :disabled="uploading" @click="submit">{{ existing ? '保存修改' : '提交' }}</el-button><el-button v-if="existing" @click="navigate({ operation: config.id })">继续办理</el-button></div>
          </el-form>
          <template v-if="existing"><div class="result-line"><el-tag type="success">已保存</el-tag><span>{{ existing.target }}回传：{{ existing.transmission }}</span></div><p v-if="arrival?.total" class="muted">本订单封条到达：{{ arrival.arrived }}/{{ arrival.total }}{{ arrival.arrived === arrival.total ? ' · 已生成空运本地通知' : ' · 全部到达后通知空运' }}</p><h3>操作记录</h3><ol class="history"><li v-for="(item,index) in existing.history" :key="index"><strong>{{ item.action }}</strong><span>{{ item.actorId }}</span><time>{{ item.time }}</time><small v-if="item.previousNumber && item.previousNumber !== item.number">{{ item.previousNumber }} → {{ item.number }}</small></li></ol></template>
        </div>
      </template>
    </template>
  </section>
  <el-dialog v-model="accountVisible" title="我的账户" width="min(420px, calc(100vw - 24px))"><dl v-if="account" class="account-fields"><dt>姓名</dt><dd>{{ account.name }}</dd><dt>账户ID</dt><dd>{{ account.id }}</dd><dt>手机号</dt><dd>{{ data.driverSession.phone }}</dd><dt>操作权限</dt><dd>{{ operations.map(item => item.label).join('、') || '未配置' }}</dd></dl><template #footer><el-button type="danger" @click="logout">退出登录</el-button></template></el-dialog>
</template>

<style scoped>
.ground-service { max-width:760px; margin:0 auto; padding-bottom:24px; min-width:0; }.service-heading { display:flex; gap:12px; justify-content:space-between; align-items:center; padding-bottom:20px; border-bottom:1px solid var(--border); margin-bottom:20px; }h1 { font-size:24px; margin:6px 0 0; }h2 { font-size:18px; margin:24px 0 16px; }h3 { font-size:16px; }.muted,small { color:var(--muted); font-size:13px; }.operation-list { display:flex; flex-direction:column; }.operation { display:grid; grid-template-columns:44px minmax(0,1fr) 20px; align-items:center; gap:16px; border:0; border-bottom:1px solid var(--border); background:transparent; padding:20px 4px; text-align:left; cursor:pointer; color:var(--ink); }.operation:hover { background:#eef5f8; }.operation strong { display:block; font-size:16px; margin-bottom:7px; }.operation-icon { width:44px; height:44px; display:grid; place-items:center; color:var(--primary); background:#eaf1f6; border-radius:6px; }.operation:nth-child(3n+2) .operation-icon { background:#e9f3ef; color:#317660; }.operation:nth-child(3n) .operation-icon { background:#f7f0df; color:#987025; }.record-list { display:flex; flex-direction:column; }.record-list button { display:flex; justify-content:space-between; gap:16px; text-align:left; border:0; border-bottom:1px solid var(--border); background:transparent; padding:16px 0; cursor:pointer; color:var(--ink); overflow-wrap:anywhere; }.record-list strong,.record-list small { display:block; margin-bottom:5px; }.record-list button > span:last-child { color:var(--muted); font-size:12px; white-space:nowrap; }.task-heading { display:flex; align-items:center; gap:12px; margin-bottom:24px; }.task-heading h2 { margin:0; flex:1; }.feedback { margin-bottom:20px; }.number-input { display:flex; width:100%; gap:8px; }.number-input .el-input { min-width:0; }.package-list { width:100%; display:flex; flex-direction:column; gap:12px; }.package-row { display:grid; grid-template-columns:20px minmax(0,1fr) 40px; gap:8px; align-items:center; }.package-row.invalid :deep(.el-input__wrapper) { box-shadow:0 0 0 1px var(--danger) inset; }.package-tools,.submit-tools,.service-tabs { display:flex; flex-wrap:wrap; gap:8px; }.submit-tools .el-button,.service-tabs .el-button { margin:0; }.service-tabs { margin-bottom:20px; }.field-error { color:var(--danger); }.history { padding:0; list-style:none; }.history li { display:flex; flex-wrap:wrap; gap:10px 20px; padding:14px 0; border-bottom:1px solid var(--border); font-size:13px; }.history small { width:100%; }.result-line { border-top:1px solid var(--border); padding-top:20px; margin-top:24px; display:flex; flex-wrap:wrap; gap:10px; font-size:13px; }.account-fields { display:grid; grid-template-columns:75px minmax(0,1fr); gap:14px; }.account-fields dd { margin:0; overflow-wrap:anywhere; }.account-fields dt { color:var(--muted); }.service-form :deep(.el-button) { min-height:40px; }.ground-service button:focus-visible { outline:2px solid var(--primary); outline-offset:3px; }
@media(max-width:700px) { .record-list button { flex-direction:column; gap:4px; }.task-heading { flex-wrap:wrap; }.operation { padding:17px 2px; }.service-form :deep(.el-input__wrapper) { min-height:40px; }.number-input { flex-wrap:wrap; }.number-input .el-input { flex-basis:100%; } }
</style>
