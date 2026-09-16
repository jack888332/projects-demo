<script setup>
import { computed } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import BusinessMessages from '../components/BusinessMessages.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { WORKBENCH_PERSONAS } from '../domain/workbenchTasks.js'
const {state,workbenchSession}=usePrototypeData()
const persona=computed(()=>WORKBENCH_PERSONAS.find(row=>row.id===workbenchSession.personaId))
const messages=computed(()=>state.messages.filter(row=>row.recipient===persona.value.name || row.recipientRole===persona.value.role).slice().reverse())
</script>
<template><div class="module-view"><PageHeader title="消息通知" description="合作方、授信、空运建单、订舱、报关材料及报价修改通知；均为本地模拟，没有发送至企业微信或邮件系统" /><BusinessMessages :messages="messages" /></div></template>
