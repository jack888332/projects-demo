<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Back, Document } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import RecordQueryTable from '../components/RecordQueryTable.vue'
import OrderCostFacts from '../components/finance/OrderCostFacts.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { WORKBENCH_PERSONAS } from '../domain/workbenchTasks.js'
import { canReadTarget, accessState } from '../data/accessControl.js'
import { businessNotifications, scheduledNotificationPreview } from '../domain/businessNotifications.js'
const {state,workbenchSession}=usePrototypeData()
const persona=computed(()=>WORKBENCH_PERSONAS.find(row=>row.id===workbenchSession.personaId))
const router=useRouter(),tab=ref('events'),selected=ref(null),date=ref('2026-09-08'),time=ref('18:00'),applied=ref('2026-09-08 18:00')
const messages=computed(()=>tab.value==='events'?businessNotifications(state,persona.value):scheduledNotificationPreview(state,applied.value,persona.value))
const columns=[['type','消息类型',175],['content','消息内容',400],['recipient','接收对象',180],['channel','渠道',190],['createdAt','发生时间',180],['status','投递状态',180]]
watch(()=>[workbenchSession.personaId,accessState.revision,state.messages,tab.value],()=>{selected.value=null})
</script>
<template><div class="module-view"><PageHeader title="消息通知"><template #actions><el-button v-if="selected" :icon="Back" @click="selected=null">返回列表</el-button></template></PageHeader><el-alert title="仅本地模拟，未发送至短信、企业微信或邮件系统。" type="info" :closable="false"/>
  <template v-if="!selected"><el-tabs v-model="tab"><el-tab-pane label="业务通知" name="events"/><el-tab-pane label="定时提醒预览" name="scheduled"/></el-tabs>
    <el-form v-if="tab==='scheduled'" label-position="top" class="notice-clock"><el-form-item label="演示日期"><el-date-picker v-model="date" value-format="YYYY-MM-DD" aria-label="通知演示日期"/></el-form-item><el-form-item label="检查时点"><el-radio-group v-model="time" aria-label="通知检查时点"><el-radio-button value="09:00"/><el-radio-button value="18:00"/></el-radio-group></el-form-item><el-button :icon="Search" :disabled="!date" @click="applied=`${date} ${time}`">检查提醒</el-button></el-form>
    <el-alert v-if="tab==='scheduled'" title="审批工作日阈值、赶单重复提醒和过期车辆通知范围待确认（217）。当前预览未调度订单、合作方待审批及未来30天车辆到期提醒。" type="warning" :closable="false"/>
    <RecordQueryTable :key="`${tab}:${workbenchSession.personaId}:${accessState.revision}`" :rows="messages" :columns="columns" :filters="[['content','消息内容'],['type','消息类型'],['recipient','接收对象'],['channel','渠道']]" name="消息通知" :page-size="10" :exportable="false" detail @detail="selected=$event"/>
  </template><template v-else><OrderCostFacts :entries="columns.map(([key,label])=>[label,selected[key]])"/><section v-if="selected.cc"><h2>抄送</h2><p>{{selected.cc}}</p></section><section><h2>完整内容</h2><pre>{{selected.body||selected.content}}</pre></section><el-button :icon="Document" :disabled="!canReadTarget(selected.related)" @click="router.push(selected.related)">查看关联单据</el-button><p v-if="!canReadTarget(selected.related)">当前岗位无关联单据访问权限。</p></template>
</div></template>
<style scoped>.el-alert{margin:12px 0}.notice-clock{display:flex;flex-wrap:wrap;align-items:center;gap:16px}.notice-clock .el-date-editor{max-width:100%}h2{font-size:15px}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8}section{padding:16px 0;border-top:1px solid var(--border)}</style>
