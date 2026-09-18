<script setup>
import {computed,ref} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {Plus,Search,Refresh,View,Delete,Back} from '@element-plus/icons-vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import StationOrderEditor from '../components/StationOrderEditor.vue'
import StationQuotes from '../components/StationQuotes.vue'
import StationPapers from '../components/StationPapers.vue'
import StationPlans from '../components/StationPlans.vue'
import {usePrototypeData} from '../data/usePrototypeData.js'
import {canReadModule,canWriteModule,getModuleAccess} from '../data/accessControl.js'
import {STATION_ORDER_COLUMNS,STATION_ORDER_FIELDS,stationRights,stationOrderRows,stationOrderCosts,stationDeleteReason} from '../domain/stationPallet.js'
const {state,workbenchSession,deleteStationOrder,receiveStationOrder}=usePrototypeData(),route=useRoute(),router=useRouter(),editor=ref()
const intake=ref(false),messageId=ref(''),intakeError=ref(''),incoming=computed(()=>state.stationInboundMessages.find(row=>row.id===messageId.value))
function receive(){try{const row=receiveStationOrder(messageId.value);intake.value=false;messageId.value='';intakeError.value='';open(row);ElMessage.success('已接收本地模拟消息，未连接外部系统')}catch(error){intakeError.value=error.message}}
const tab=computed(()=>String(route.query.tab||(rights.value.orders?'orders':rights.value.plans?'plans':'papers')))
const rights=computed(()=>stationRights(workbenchSession.personaId)),writable=computed(()=>rights.value.manage&&canWriteModule('stationPallet'))
const all=computed(()=>rights.value.orders&&canReadModule('stationPallet')?stationOrderRows(state):[])
const empty=()=>({customer:'',orderNo:'',waybillNo:'',flight:'',station:''}),pending=ref(empty()),applied=ref(empty())
const rows=computed(()=>all.value.filter(row=>Object.entries(applied.value).every(([key,value])=>!value||String(row[key]||'').includes(value))))
const selected=computed(()=>all.value.find(row=>row.id===route.query.order)),detailTab=ref('history')
const costsReadable=computed(()=>rights.value.orders&&canReadModule('stationPallet')&&getModuleAccess('costs').data)
const costs=computed(()=>selected.value&&costsReadable.value?stationOrderCosts(state,selected.value.id):[])
function open(row){detailTab.value='history';router.push({query:{order:row.id}})}
async function remove(row){try{await ElMessageBox.confirm(`删除本地打板订单 ${row.orderNo}？`,'删除打板订单',{confirmButtonText:'删除订单',cancelButtonText:'取消',type:'warning'});deleteStationOrder(row.id);ElMessage.success('订单已删除')}catch(error){if(error instanceof Error)ElMessage.error(error.message)}}
</script>
<template>
  <div class="module-view station-view">
    <PageHeader title="货站打板"><template #actions><el-button v-if="selected" :icon="Back" @click="router.push({query:{}})">返回列表</el-button><template v-else-if="writable&&tab==='orders'"><el-button @click="intake=true;intakeError=''">模拟接收上游订单</el-button><el-button :icon="Plus" type="primary" @click="editor.open()">创建打板订单</el-button></template></template></PageHeader>
    <el-tabs :model-value="tab" @tab-change="value=>router.push({query:{tab:value}})"><el-tab-pane v-if="rights.orders" label="打板订单" name="orders"/><el-tab-pane v-if="rights.orders" label="打板报价" name="quotes"/><el-tab-pane v-if="rights.plans" label="打板计划" name="plans"/><el-tab-pane v-if="rights.papers" label="板纸回执" name="papers"/></el-tabs>
    <StationPapers v-if="tab==='papers'&&rights.papers"/>
    <StationPlans v-else-if="tab==='plans'&&rights.plans"/>
    <el-alert v-else-if="!rights.orders" title="当前角色无打板订单查看资格，可进入已授权的计划或板纸页签。" type="warning" :closable="false" />
    <StationQuotes v-else-if="tab==='quotes'"/>
    <template v-else-if="!selected">
      <el-form class="station-query" label-position="top" @submit.prevent="applied={...pending}"><el-form-item v-for="[key,label] in [['customer','客户'],['orderNo','订单号'],['waybillNo','提单号'],['flight','航班号'],['station','货站']]" :key="key" :label="label"><el-input v-model="pending[key]" clearable :aria-label="'打板查询'+label" /></el-form-item><div class="query-actions"><el-button :icon="Search" type="primary" native-type="submit">查询</el-button><el-button :icon="Refresh" @click="pending=empty();applied=empty()">重置</el-button></div></el-form>
      <DataTableFrame :rows="rows" :page-size="10" :page-sizes="[10,20,50]"><template #default="{rows:pageRows}"><el-table :data="pageRows" aria-label="打板订单列表" row-key="id">
        <el-table-column v-for="[key,label,width] in STATION_ORDER_COLUMNS" :key="key" :prop="key" :label="label" :min-width="width" />
        <el-table-column prop="createdAt" label="创建时间" min-width="170" /><el-table-column label="操作" width="195" fixed="right"><template #default="{row}"><el-button :icon="View" link type="primary" @click="open(row)">详情</el-button><el-tooltip content="状态集合与迁移口径待确认（120）"><el-button v-if="writable" link disabled>状态</el-button></el-tooltip><el-tooltip v-if="writable&&row.source==='local'" :content="stationDeleteReason(row)||'删除本地订单'"><span><el-button :icon="Delete" link type="danger" :disabled="Boolean(stationDeleteReason(row))" @click="remove(row)">删除</el-button></span></el-tooltip></template></el-table-column>
      </el-table></template></DataTableFrame>
    </template>
    <template v-else>
      <div class="station-heading"><h2>{{selected.orderNo}}</h2><StatusTag :label="selected.statusLabel" /></div>
      <el-button v-if="state.stationPapers.some(row=>row.orderIds.includes(selected.id))" @click="router.push({query:{tab:'papers',paper:state.stationPapers.find(row=>row.orderIds.includes(selected.id)).id}})">关联板纸</el-button>
      <el-alert v-if="!selected.status" title="初始状态待确认（GJ-PRD-120）；当前不推进状态或自动生成费用。" type="warning" :closable="false" />
      <dl class="station-detail"><div v-for="[key,label] in STATION_ORDER_FIELDS" :key="key"><dt>{{label}}</dt><dd>{{key==='partnerId'?selected.customer:selected[key]}}</dd></div><div><dt>提单号</dt><dd>{{selected.waybillNo}}</dd></div><div><dt>货量来源</dt><dd>{{selected.cargoSource}}</dd></div><div><dt>来源</dt><dd>{{selected.source==='local'?'外部客户手工建单':'内部上游'}}</dd></div></dl>
      <el-tabs v-model="detailTab"><el-tab-pane label="操作记录" name="history" /><el-tab-pane label="应收付账单" name="costs" /></el-tabs>
      <el-table v-if="detailTab==='history'" :data="selected.history" aria-label="打板操作记录"><el-table-column prop="event" label="事件" min-width="170"/><el-table-column prop="remark" label="备注" min-width="250"/><el-table-column prop="actor" label="操作人" min-width="175"/><el-table-column prop="time" label="时间" min-width="175"/></el-table>
      <template v-else><el-alert title="计费重量、完成状态与报价选用时点待确认，仅展示已有明确关联的费用。" type="warning" :closable="false"/><el-table :data="costs" :empty-text="costsReadable?'暂无已生成费用':'无费用查看权限'" aria-label="打板应收付账单"><el-table-column v-for="[key,label] in [['feeItem','费用科目'],['direction','方向'],['settlementParty','结算对象'],['currency','币种'],['amount','金额'],['status','审批状态'],['source','费用来源']]" :key="key" :prop="key" :label="label" min-width="135" /></el-table></template>
    </template>
    <StationOrderEditor ref="editor" @saved="open" />
    <el-dialog v-model="intake" title="接收上游打板订单（本地模拟）" width="min(720px,96vw)" :close-on-click-modal="false"><el-alert v-if="intakeError" :title="intakeError" type="error" :closable="false"/><el-select v-model="messageId" aria-label="上游打板消息"><el-option v-for="row in state.stationInboundMessages" :key="row.id" :value="row.id" :label="row.sourceOrderNo"/></el-select><dl v-if="incoming" class="station-detail"><div v-for="[key,label] in [['customer','客户'],['waybillNo','提单号'],['flight','航班号'],['station','货站'],['pieces','数量（件）'],['weight','重量（kg）'],['volume','体积（m³）']]" :key="key"><dt>{{label}}</dt><dd>{{incoming[key]}}</dd></div></dl><template #footer><el-button @click="intake=false">取消</el-button><el-button type="primary" :disabled="!writable||!incoming" @click="receive">接收本地消息</el-button></template></el-dialog>
  </div>
</template>
<style scoped>
.station-query{display:flex;flex-wrap:wrap;gap:14px;align-items:end;margin:16px 0}.station-query .el-form-item{width:185px;margin:0}.query-actions{display:flex;gap:8px}.station-heading{display:flex;align-items:center;gap:16px;flex-wrap:wrap}h2{font-size:20px;overflow-wrap:anywhere}.station-detail{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin:22px 0}dt{color:var(--muted);font-size:12px}dd{margin:6px 0 0;min-height:20px;overflow-wrap:anywhere}@media(max-width:700px){.station-detail{grid-template-columns:minmax(0,1fr)}.station-query .el-form-item{width:100%}}
</style>
