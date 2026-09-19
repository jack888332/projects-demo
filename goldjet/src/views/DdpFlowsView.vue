<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Right } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import RecordQueryTable from '../components/RecordQueryTable.vue'
import OrderCostFacts from '../components/finance/OrderCostFacts.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canReadModule, canReadTarget, workbenchSession } from '../data/accessControl.js'
import { DDP_STAGES, ddpDocuments, manifestDecision } from '../domain/ddpFlows.js'
const { state } = usePrototypeData(), router = useRouter()
const allowed = computed(() => canReadModule('ddpFlows'))
const orders = computed(() => allowed.value ? state.airOrders.filter(row => !row.deleted) : [])
const orderId = ref('AIR-260908-001'), warehouseId = ref(''), declared = ref(''), inbound = ref(''), conditions = ref('unknown')
const warehouses = computed(() => allowed.value ? state.warehouseOrders.filter(row => row.airOrderId === orderId.value) : [])
const warehouse = computed(() => warehouses.value.find(row => row.id === warehouseId.value))
const documents = computed(() => allowed.value ? ddpDocuments(state, orderId.value) : [])
const decision = computed(() => manifestDecision(inbound.value, declared.value, conditions.value))
const external = computed(() => [
  ['入仓重量(kg)', warehouse.value?.grossWeight ?? '未提供'], ['报关重量(kg)', '未接收报关重量'], ['密度', '阈值与单位待确认（222）'],
  ['预配反馈', '未接收回执'], ['海关放行', '未接收放行结果'],
  ['出仓单', warehouse.value?.outboundInstruction ? `${warehouse.value.outboundInstruction.pieces}件；${warehouse.value.outboundInstruction.transmission}` : '未发送'],
  ['WMS出仓结果', warehouse.value?.outboundAt ? `${warehouse.value.status}；${warehouse.value.outboundAt}` : '未接收'],
  ['入区登记', '未发送'], ['入区回执', '未接收'],
])
const transit = computed(() => allowed.value ? state.groundOrders.filter(row => row.airOrderId === orderId.value && row.orderType === '中转订单').flatMap(order => state.groundWaybills.filter(bill => bill.orderId === order.id).map(bill => ({ id: bill.id, number: order.orderNo, supplier: bill.supplier, drivers: bill.drivers.map(row => row.name).join('；'), phones: bill.drivers.map(row => row.phone).join('；'), status: bill.status }))) : [])
watch(warehouses, rows => { warehouseId.value = rows[0]?.id || '' }, { immediate: true })
watch(warehouse, row => { inbound.value = row?.grossWeight ?? ''; declared.value = ''; conditions.value = 'unknown' }, { immediate: true })
watch(() => workbenchSession.personaId, () => { declared.value = ''; conditions.value = 'unknown' })
</script>

<template>
  <div class="module-view ddp-view">
    <PageHeader title="DDP 跨模块作业与结算"/>
    <el-empty v-if="!allowed" description="跨模块汇总权限待确认；超级管理员可查看演示链路"/>
    <template v-else>
      <el-alert title="本地演示。外部报送、海关回执和自动计费尚未闭环；未关联单据不表示环节已完成。" type="warning" :closable="false"/>
      <section><h2>业务环节</h2><ol class="stage-list"><li v-for="stage in DDP_STAGES" :key="stage.id"><span class="stage-number">{{stage.id}}</span><div><h3>{{stage.name}}</h3><p>{{stage.status}}</p></div><el-button link type="primary" :icon="Right" :disabled="!canReadTarget(stage.path)" @click="router.push(stage.path)">{{stage.title}}</el-button></li></ol></section>
      <section><h2>关联单据</h2><el-form label-position="top"><el-form-item label="空运订单"><el-select v-model="orderId" filterable aria-label="DDP空运订单"><el-option v-for="order in orders" :key="order.id" :value="order.id" :label="`${order.orderNo||order.id} · ${order.customer}`"/></el-select></el-form-item></el-form>
        <RecordQueryTable :rows="documents" :columns="[['stage','环节',140],['number','单号',210],['status','当前状态',150],['source','关联依据',270]]" name="DDP关联单据" :exportable="false" detail @detail="router.push($event.target)"/>
      </section>
      <section><h2>仓单外部交接</h2><el-form label-position="top"><el-form-item label="关联入仓号"><el-select v-model="warehouseId" aria-label="DDP入仓号"><el-option v-for="row in warehouses" :key="row.id" :value="row.id" :label="row.inboundNo"/></el-select></el-form-item></el-form><OrderCostFacts v-if="warehouse" :entries="external"/><el-empty v-else description="未关联仓单"/></section>
      <section><h2>预配发送条件试算</h2><el-form class="trial-form" label-position="top" @submit.prevent><el-form-item label="入仓重量(kg)"><el-input v-model="inbound" aria-label="试算入仓重量" inputmode="decimal"/></el-form-item><el-form-item label="报关重量(kg)"><el-input v-model="declared" aria-label="试算报关重量" inputmode="decimal"/></el-form-item><el-form-item label="密度等操作条件"><el-select v-model="conditions" aria-label="密度等操作条件"><el-option value="unknown" label="未确认"/><el-option value="yes" label="满足"/><el-option value="no" label="不满足"/></el-select></el-form-item></el-form>
        <OrderCostFacts :entries="[['重量误差',decision.error==null?'无法计算':`${Number(decision.error.toFixed(6))}%`],['计算公式','|入仓重量 − 报关重量| ÷ 报关重量']]"/>
        <el-alert :title="decision.message" :type="decision.code==='invalid'?'error':decision.code==='pending'?'warning':'info'" :closable="false"/><div class="commands"><el-button disabled title="发送资格、回执与重试规则待确认（080、222）">发送预配</el-button><el-button disabled title="海关放行尚无可验证回执（222）">通知WMS出仓</el-button></div>
      </section>
      <section><h2>中转用车输入</h2><RecordQueryTable :rows="transit" :columns="[['number','单号',220],['supplier','车行',180],['drivers','司机',160],['phones','联系方式',200],['status','运单状态',140]]" name="中转用车输入" :exportable="false"/><p class="pending-copy">扫描匹配、默认收费与重试规则待确认（141、142）。本页不提供手工中转调度。</p></section>
      <section class="finance-links"><h2>后续结算入口</h2><div class="commands"><el-button v-for="[label,path] in [['订单成本','/finance/costs'],['对账','/finance/reconciliation'],['收付款申请','/finance/payment-requests'],['核销','/finance/writeoffs'],['销项发票','/finance/invoices']]" :key="path" :icon="Right" :disabled="!canReadTarget(path)" @click="router.push(path)">{{label}}</el-button></div></section>
    </template>
  </div>
</template>

<style scoped>
.ddp-view{min-width:0}.ddp-view section{padding:24px 0;border-bottom:1px solid var(--border);min-width:0}h2{font-size:16px;margin:0 0 20px}h3{font-size:14px;margin:0 0 8px}.stage-list{list-style:none;padding:0;margin:0}.stage-list li{display:grid;grid-template-columns:28px minmax(0,1fr) 250px;gap:16px;align-items:center;padding:14px 0;border-bottom:1px solid var(--border)}.stage-list li:last-child{border-bottom:0}.stage-number{color:var(--muted);font-variant-numeric:tabular-nums}.stage-list p,.pending-copy{font-size:13px;color:var(--muted);line-height:1.7;margin:0}.stage-list .el-button{white-space:normal;height:auto;line-height:1.6;justify-self:end;text-align:right}.el-form{max-width:720px}.trial-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;max-width:none}.commands{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}.commands .el-button{margin:0}@media(max-width:650px){.stage-list li{grid-template-columns:24px minmax(0,1fr);gap:12px}.stage-list .el-button{grid-column:2;justify-self:start;text-align:left}.trial-form{grid-template-columns:1fr;gap:0}}
</style>
