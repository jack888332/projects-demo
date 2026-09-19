<script setup>
import { computed } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import BusinessMessages from '../components/BusinessMessages.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { WORKBENCH_PERSONAS } from '../domain/workbenchTasks.js'
import { canReadTarget, isSuperAdmin } from '../data/accessControl.js'
const {state,workbenchSession}=usePrototypeData()
const persona=computed(()=>WORKBENCH_PERSONAS.find(row=>row.id===workbenchSession.personaId))
const messages=computed(()=>[
  ...state.messages.filter(row=>(isSuperAdmin() || row.recipient===persona.value.name || row.recipientRole===persona.value.role) && (!row.related || canReadTarget(row.related))),
  ...state.orderCostBook.notices.filter(row=>isSuperAdmin()||row.recipient===persona.value.id||(['service','business'].includes(persona.value.id)&&row.recipient===persona.value.name)).map(row=>({id:row.id,type:row.event,content:row.event+' · '+row.rowId,channel:row.channel,createdAt:row.time,related:{path:'/finance/costs',query:row.adjustmentId&&!['supervisor','financeAccountant'].includes(persona.value.id)?{tab:'adjustments',adjustment:row.adjustmentId}:{tab:['supervisor','financeAccountant'].includes(persona.value.id)?'approvals':'orders',order:row.orderId,...(row.adjustmentId?{adjustment:row.adjustmentId}:{})}}})).filter(row=>canReadTarget(row.related)),
].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)))
</script>
<template><div class="module-view"><PageHeader title="消息通知" description="合作方、授信、空运建单、订舱、报关材料及报价修改通知；均为本地模拟，没有发送至企业微信或邮件系统" /><BusinessMessages :messages="messages" /></div></template>
