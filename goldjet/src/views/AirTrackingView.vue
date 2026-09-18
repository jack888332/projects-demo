<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Search, Refresh, DocumentAdd } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import AirTrackingTimeline from '../components/AirTrackingTimeline.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canQueryAirTracking, queryAirTracking, TRACKING_ORDER_FIELDS, TRACKING_CONTACT_FIELDS, TRACKING_TRANSPORT_FIELDS } from '../domain/airTracking.js'

const route = useRoute()
const { state, airSession, loadAirTrackingExamples } = usePrototypeData()
const allowed = computed(() => canQueryAirTracking(airSession))
const filters = reactive({ number: '', extra: '' }), applied = ref(''), failure = ref('')
const result = computed(() => queryAirTracking(state, airSession, applied.value))
const selectedWaybill = ref(''), expandedGroups = reactive({}), transportExpanded = ref(false)
const transport = computed(() => result.value.transports?.find(row => row.id === selectedWaybill.value) || result.value.transports?.[0])
const activeWaybill = computed({ get: () => transport.value?.id || '', set: value => { selectedWaybill.value = value; transportExpanded.value = false } })
const blank = value => value === null || value === undefined ? '' : value

function clearExpansion() {
  Object.keys(expandedGroups).forEach(key => delete expandedGroups[key])
  selectedWaybill.value = ''; transportExpanded.value = false
}
function query() {
  if (!allowed.value) return false
  clearExpansion(); failure.value = ''
  applied.value = filters.number.trim()
  if (!applied.value) { failure.value = '请输入主订单号或提单号'; return false }
  return true
}
function resetQuery() {
  filters.number = ''; filters.extra = ''; applied.value = ''; failure.value = ''; clearExpansion()
}
function loadExamples() {
  if (!allowed.value) return false
  try { const order = loadAirTrackingExamples(); filters.number = order.orderNo; return query() }
  catch (error) { failure.value = error.message; return false }
}
function followLink() {
  if (!allowed.value || typeof route.query.number !== 'string') return
  filters.number = route.query.number; query()
}
watch(() => route.query.number, followLink, { immediate: true })
watch(() => [airSession.role, airSession.name, state.airOrders], resetQuery, { flush: 'sync' })
watch(() => transport.value?.id, () => { transportExpanded.value = false })
</script>

<template>
  <div class="module-view tracking-view">
    <PageHeader title="在途跟踪"><template #actions><el-button v-if="allowed" :icon="DocumentAdd" @click="loadExamples">载入在途合成示例</el-button></template></PageHeader>
    <el-alert v-if="!allowed" title="当前角色无权查看在途轨迹。查询角色：空运客服。" type="info" :closable="false" />
    <template v-else>
      <form class="tracking-query" aria-label="在途跟踪查询" @submit.prevent="query">
        <label>订单号 / 提单号 <span class="required">*</span><el-input v-model="filters.number" clearable aria-label="在途订单号或提单号" :aria-invalid="Boolean(failure)" aria-describedby="tracking-query-error" /></label>
        <label>查询输入项<el-input v-model="filters.extra" disabled placeholder="查询含义待确认" aria-label="在途附加查询输入项" /></label>
        <div class="tracking-query-actions"><el-button type="primary" native-type="submit" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="resetQuery">重置</el-button></div>
      </form>
      <p v-if="failure" id="tracking-query-error" class="tracking-error" role="alert">{{ failure }}</p>
      <div v-if="result.kind !== 'ready'" class="tracking-empty" role="status">
        <p v-if="result.kind === 'idle'">尚未查询</p>
        <p v-else-if="result.kind === 'not-found'">未找到可查看的订单</p>
        <p v-else-if="result.kind === 'ambiguous'">匹配到多个主订单，关联关系待核实，暂不展示轨迹</p>
      </div>
      <template v-else>
        <section class="tracking-section" aria-labelledby="tracking-order-title">
          <div class="tracking-section-heading"><h2 id="tracking-order-title">订单与货物信息</h2><RouterLink :to="{ path: '/fulfillment/air-orders', query: { order: result.order.id } }">主订单详情</RouterLink></div>
          <dl class="tracking-fields"><div v-for="[key, label] in TRACKING_ORDER_FIELDS" :key="key"><dt>{{ label }}</dt><dd :data-field="key">{{ blank(result.order[key]) }}</dd></div></dl>
        </section>
        <section v-for="group in result.groups" :key="group.id" class="tracking-section" :aria-label="group.label">
          <h2>{{ group.label }}</h2>
          <ul class="tracking-nodes" aria-label="服务节点状态"><li v-for="node in group.nodes" :key="node.id" :class="{ abnormal: node.abnormal }"><span v-if="node.shape" :class="['tracking-node', node.shape]" aria-hidden="true"></span><strong>{{ node.name }}</strong><span>{{ node.status }}</span></li></ul>
          <AirTrackingTimeline v-model:expanded="expandedGroups[group.id]" :events="group.events" :label="`${group.label}记录`" />
        </section>
        <section class="tracking-section" aria-labelledby="tracking-transport-title">
          <h2 id="tracking-transport-title">运输与交单信息</h2>
          <el-tabs v-if="result.transports.length" v-model="activeWaybill" aria-label="运输运单页签"><el-tab-pane v-for="waybill in result.transports" :key="waybill.id" :name="waybill.id" :label="waybill.waybillNo" /></el-tabs>
          <dl class="tracking-fields"><div v-for="[key, label] in TRACKING_TRANSPORT_FIELDS" :key="key"><dt>{{ label }}</dt><dd :data-transport-field="key">{{ blank(transport?.[key]) }}</dd></div></dl>
          <AirTrackingTimeline v-if="transport" v-model:expanded="transportExpanded" :events="transport.events" label="运输轨迹记录" />
          <p v-else class="tracking-muted">暂无关联运输运单</p>
        </section>
        <section class="tracking-section" aria-labelledby="tracking-contacts-title">
          <h2 id="tracking-contacts-title">航班与服务联系人</h2>
          <dl class="tracking-fields"><div v-for="[key, label] in TRACKING_CONTACT_FIELDS" :key="key"><dt>{{ label }}</dt><dd :data-contact-field="key">{{ blank(result.contacts[key]) }}</dd></div></dl>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.tracking-view { container-type: inline-size; container-name: tracking; min-width: 0; }
.tracking-query { display: flex; flex-wrap: wrap; gap: 16px; padding-bottom: 20px; align-items: end; }
.tracking-query label { display: block; flex: 1 1 240px; max-width: 380px; min-width: 0; line-height: 28px; }
.tracking-query-actions { display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 0; }
.tracking-query-actions .el-button { margin-left: 0; }
.required, .tracking-error, .abnormal { color: var(--danger); }
.tracking-section { padding: 20px 0; border-top: 1px solid var(--border); }
h2 { margin: 0 0 16px; font-size: 16px; font-weight: 600; }
.tracking-section-heading { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; flex-wrap: wrap; }
.tracking-section-heading a { color: var(--primary); }
.tracking-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px 24px; margin: 0; }
.tracking-fields > div { min-width: 0; }
dt { color: var(--muted); font-size: 13px; margin-bottom: 6px; }
dd { margin: 0; min-height: 20px; overflow-wrap: anywhere; white-space: pre-wrap; font-variant-numeric: tabular-nums; }
.tracking-nodes { display: flex; flex-wrap: wrap; list-style: none; margin: 0 0 24px; padding: 0; gap: 12px 24px; }
.tracking-nodes li { display: flex; gap: 8px; align-items: center; min-height: 24px; flex-wrap: wrap; }
.tracking-nodes li > span:last-child { font-size: 13px; }
.tracking-node { width: 10px; height: 10px; flex: 0 0 10px; border: 2px solid var(--success); border-radius: 50%; }
.tracking-node.solid { background: var(--primary); border-color: var(--primary); }
.tracking-node.square { border-color: var(--muted); border-radius: 0; }
.tracking-empty { min-height: 180px; padding: 60px 16px; text-align: center; border-top: 1px solid var(--border); color: var(--muted); }
.tracking-muted { color: var(--muted); margin: 20px 0 0; }
@container tracking (max-width: 760px) { .tracking-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container tracking (max-width: 440px) { .tracking-fields { grid-template-columns: minmax(0, 1fr); } .tracking-query label { max-width: none; flex-basis: 100%; } }
</style>
