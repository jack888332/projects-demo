<script setup>
import {computed,ref,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {Back} from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import RecordQueryTable from '../components/RecordQueryTable.vue'
import {usePrototypeData} from '../data/usePrototypeData.js'
import {canReadModule,workbenchSession} from '../data/accessControl.js'
import {STATEMENT_TEMPLATES,templateProjection} from '../domain/statementTemplates.js'
import {WORKBENCH_PERSONAS} from '../domain/workbenchTasks.js'
const {state}=usePrototypeData(),route=useRoute(),router=useRouter(),templateId=ref('hangsheng-general'),statementId=ref(route.query.statement||'')
const statements=computed(()=>canReadModule('statementTemplates')?state.reconciliation.statements.filter(row=>row.statementDirection==='应收'&&['新建','已确认'].includes(row.status)):[])
const selected=computed(()=>statements.value.find(row=>row.id===statementId.value)),template=computed(()=>STATEMENT_TEMPLATES.find(row=>row.id===templateId.value)),projection=computed(()=>templateProjection(state,selected.value,template.value,WORKBENCH_PERSONAS.find(row=>row.id===workbenchSession.personaId)?.name))
watch(()=>workbenchSession.personaId,()=>{statementId.value=''});watch(()=>route.query.statement,id=>{statementId.value=id||''})
</script>
<template><div class="module-view"><PageHeader title="客户对账单模板"><template #actions><el-button :icon="Back" @click="router.push('/finance/reconciliation')">对账管理</el-button></template></PageHeader><el-alert title="公司模板匹配、行归集和未给定字段来源待确认（196、216）。以下为逐条源费用预览，不自动选用模板或发送邮件。" type="warning" :closable="false"/>
  <el-form label-position="top" class="template-selectors"><el-form-item label="应收对账单"><el-select v-model="statementId" filterable clearable aria-label="模板应收对账单"><el-option v-for="row in statements" :key="row.id" :value="row.id" :label="`${row.statementNo} ${row.settlementParty}`"/></el-select></el-form-item><el-form-item label="模板"><el-select v-model="templateId" filterable aria-label="对账单模板"><el-option v-for="item in STATEMENT_TEMPLATES" :key="item.id" :value="item.id" :label="item.name"/></el-select></el-form-item></el-form>
  <h2>{{template.name}}</h2><RecordQueryTable :key="`${statementId}:${templateId}`" :rows="projection.rows" :columns="projection.columns" :name="`${template.name}-字段预览`"><template #cell="{row,field}">{{row[field]??'来源待确认'}}</template></RecordQueryTable>
</div></template>
<style scoped>.template-selectors{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px;margin-top:20px}h2{font-size:16px;margin:8px 0 18px}</style>
