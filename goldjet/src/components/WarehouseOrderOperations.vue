<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Download } from '@element-plus/icons-vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canReadModule, canWriteModule, accessState } from '../data/accessControl.js'
import { warehousePermissions, WAREHOUSE_SERVICES } from '../domain/warehouseOrders.js'
import { warehouseCosts, warehouseCsv } from '../domain/warehouseViews.js'
const props = defineProps({ order: { type: Object, required: true }, panel: { type: String, default: 'services' } })
const { state, workbenchSession, saveWarehouseServices, simulateWarehouseReceipt } = usePrototypeData(), router = useRouter()
const editing = ref(false), draft = ref({}), initial = ref(''), failure = ref(''), simulated = ref(false)
const emptyReceipt = () => ({ kind: 'inbound', palletNo: '', pieces: null, weight: null, volume: null })
const receipt = ref(emptyReceipt())
const rights = computed(() => warehousePermissions(workbenchSession.personaId, props.order))
const services = computed(() => WAREHOUSE_SERVICES.map(([key,label,unit], index) => {
  const saved = props.order.services?.[key], actual = saved?.actual ?? '', expected = props.order[key]
  return { key,label,unit,index,expected,actual,actor: actual !== '' ? saved.actor : expected !== '' && expected != null ? props.order.expectedServiceActorId || '' : '',time: actual !== '' ? saved.time : '' }
}).sort((a,b) => Number(b.expected !== '' && b.expected != null || b.actual !== '') - Number(a.expected !== '' && a.expected != null || a.actual !== '') || a.index - b.index))
const costs = computed(() => canReadModule('costs') ? warehouseCosts(state,props.order) : [])
const costColumns = [['feeItem','费用科目'],['direction','方向'],['settlementParty','结算对象'],['currency','币种'],['amount','金额'],['status','审批状态'],['updatedAt','更新时间']]
const dirty = computed(() => editing.value && initial.value !== JSON.stringify(draft.value) || simulated.value && ['palletNo','pieces','weight','volume'].some(key => receipt.value[key] !== '' && receipt.value[key] != null))
function edit() { draft.value = Object.fromEntries(services.value.map(row => [row.key,row.actual])); initial.value = JSON.stringify(draft.value); editing.value = true; failure.value = '' }
async function allowDiscard() {
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('放弃尚未保存的服务数量或本地事件输入？','放弃修改',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑'}); return true } catch { return false }
}
async function cancel() { if (await allowDiscard()) editing.value = false }
async function toggleSimulation() {
  if (simulated.value && !await allowDiscard()) return
  simulated.value = !simulated.value; receipt.value = emptyReceipt(); failure.value = ''
}
function save() { try { saveWarehouseServices(props.order.id,draft.value); editing.value = false; ElMessage.success('实际服务数量已保存') } catch(error) { failure.value = error.message } }
async function applyReceipt() {
  failure.value = ''
  try {
    if (receipt.value.kind === 'cancel') await ElMessageBox.confirm(`模拟取消 ${props.order.inboundNo}？仅改变本地演示数据。`,'模拟上游取消',{confirmButtonText:'确认取消订单',cancelButtonText:'返回'})
    simulateWarehouseReceipt(props.order.id,receipt.value); ElMessage.success('本地事件已记录，未连接外部系统'); simulated.value = false; receipt.value = emptyReceipt()
  } catch(error) { if (error instanceof Error) failure.value = error.message }
}
function download() {
  if (!canReadModule('costs') || !costs.value.length) return
  const url = URL.createObjectURL(new Blob([warehouseCsv(costColumns.map(row => row[1]),costs.value.map(row => costColumns.map(([key]) => row[key])))],{type:'text/csv;charset=utf-8'}))
  const link = document.createElement('a'); link.href = url; link.download = `${props.order.inboundNo}-应收付账单.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000)
}
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(async () => { if (!await allowDiscard()) return false; editing.value = false; simulated.value = false; receipt.value = emptyReceipt() })
watch(() => [props.order.id, workbenchSession.personaId, accessState.revision], () => { editing.value = false; simulated.value = false; failure.value = '' })
const beforeUnload = event => { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload',beforeUnload)); onBeforeUnmount(() => window.removeEventListener('beforeunload',beforeUnload))
</script>
<template>
  <section>
    <el-alert v-if="failure" :title="failure" type="error" :closable="false" show-icon />
    <template v-if="panel === 'services'">
      <div class="operation-toolbar"><el-button v-if="rights.services && canWriteModule('warehouseOrders') && !editing" :icon="Edit" @click="edit">编辑服务</el-button><template v-if="editing"><el-button @click="cancel">取消</el-button><el-button type="primary" @click="save">保存服务</el-button></template></div>
      <el-table :data="services" aria-label="仓库服务明细"><el-table-column prop="label" label="服务类型" width="120" /><el-table-column prop="unit" label="单位" width="80" /><el-table-column prop="expected" label="期望服务数量" min-width="150" /><el-table-column label="实际服务数量" min-width="170"><template #default="{row}"><el-input v-if="editing" v-model="draft[row.key]" inputmode="decimal" :aria-label="row.label+'实际数量'" /><span v-else>{{ row.actual }}</span></template></el-table-column><el-table-column prop="actor" label="操作人" min-width="200" /><el-table-column prop="time" label="操作时间" min-width="165" /></el-table>
    </template>
    <template v-else-if="panel === 'costs'">
      <div class="operation-toolbar"><el-button :icon="Download" :disabled="!costs.length" @click="download">导出应收付账单</el-button><el-button v-if="canReadModule('costs')" @click="router.push('/finance/costs')">财务结算</el-button></div>
      <el-alert title="自动计费待确认：报价选用时点、计费方式及仓储天数尚未闭合；本页仅展示已有费用。" type="warning" :closable="false" />
      <el-table :data="costs" :empty-text="canReadModule('costs') ? '暂无已生成费用' : '无费用查看权限'" aria-label="仓单应收付账单"><el-table-column v-for="[key,label] in costColumns" :key="key" :prop="key" :label="label" min-width="145" /></el-table>
    </template>
    <template v-else>
      <div class="operation-toolbar"><el-button v-if="rights.simulate && canWriteModule('warehouseOrders')" @click="toggleSimulation">模拟上游 / WMS 事件</el-button></div>
      <el-alert v-if="order.status === '待出库'" title="WMS 出库结果的终态判定待确认（GJ-PRD-036）；库存和费用不会自动推进。" type="warning" :closable="false" />
      <section v-if="simulated" class="simulation-panel" aria-label="本地WMS模拟">
        <h3>本地事件模拟</h3><el-alert title="仅改变本地演示记录，不发送 WMS 或空运系统。" type="info" :closable="false" />
        <el-form label-position="top" novalidate @submit.prevent="applyReceipt"><div class="receipt-fields">
          <el-form-item label="事件"><el-select v-model="receipt.kind" aria-label="WMS模拟事件"><el-option label="实际入库" value="inbound" /><el-option label="托盘重新称重（规则待确认）" value="reweigh" disabled /><el-option label="接收出库指令" value="outboundInstruction" /><el-option label="WMS出库反馈" value="outbound" /><el-option label="上游取消" value="cancel" /></el-select></el-form-item>
          <el-form-item v-if="['inbound','reweigh'].includes(receipt.kind)" label="托盘号"><el-input v-model="receipt.palletNo" aria-label="WMS托盘号" /></el-form-item>
          <el-form-item v-if="['inbound','outboundInstruction','reweigh'].includes(receipt.kind)" label="本次件数"><el-input-number v-model="receipt.pieces" :min="1" :precision="0" :controls="false" aria-label="WMS本次件数" /></el-form-item>
          <el-form-item v-if="['inbound','outboundInstruction','reweigh'].includes(receipt.kind)" label="本次重量（kg）"><el-input-number v-model="receipt.weight" :min="0.01" :step="0.01" :precision="2" :controls="false" aria-label="WMS本次重量" /></el-form-item>
          <el-form-item v-if="['inbound','reweigh'].includes(receipt.kind)" label="本次体积（m³）"><el-input-number v-model="receipt.volume" :min="0.01" :step="0.01" :precision="2" :controls="false" aria-label="WMS本次体积" /></el-form-item>
        </div><el-button type="primary" native-type="submit">应用本地事件</el-button></el-form>
      </section>
    </template>
  </section>
</template>
<style scoped>
.operation-toolbar { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; margin:12px 0; }
.simulation-panel { margin:16px 0; border-top:1px solid var(--border); padding-top:12px; }
.receipt-fields { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin-top:16px; }
.el-input-number,.el-select { width:100%; } h3 { font-size:15px; }
@media(max-width:700px) { .receipt-fields { grid-template-columns:minmax(0,1fr); } }
</style>
