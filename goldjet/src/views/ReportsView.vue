<script setup>
import {computed} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import RecordQueryTable from '../components/RecordQueryTable.vue'
import {usePrototypeData} from '../data/usePrototypeData.js'
import {workbenchSession,canReadModule} from '../data/accessControl.js'
import {visibleReports,reportRows} from '../domain/reports.js'
const {state}=usePrototypeData(),route=useRoute(),router=useRouter()
const reports=computed(()=>canReadModule('reports')?visibleReports(workbenchSession.personaId):[]),selected=computed(()=>reports.value.find(row=>row.id===route.query.report)||(!route.query.report?reports.value[0]:null))
const rows=computed(()=>selected.value?reportRows(state,selected.value.id):[]),sample=computed(()=>selected.value?.manual||['ground-supplier','driver-usage'].includes(selected.value?.id))
function navigate(id){router.push({path:'/foundation/reports',query:{report:id}})}
</script>
<template><div class="module-view"><PageHeader title="报表管理"/><el-form label-position="top"><el-form-item label="报表"><el-select :model-value="selected?.id" filterable aria-label="报表类型" @change="navigate"><el-option-group v-for="group in [...new Set(reports.map(row=>row.group))]" :key="group" :label="group"><el-option v-for="report in reports.filter(row=>row.group===group)" :key="report.id" :value="report.id" :label="report.name"/></el-option-group></el-select></el-form-item></el-form>
  <el-empty v-if="!selected" description="当前岗位未获该报表访问授权"/>
  <template v-else><h2>{{selected.name}}</h2><el-alert :title="sample?'固定合成样表，非审批生成结果。审批、账龄分桶及利润口径待确认（218、219）。':'当前源记录核对预览，未生成历史月报快照。生成时点、金额及缺失指标规则待确认（218）。'" type="warning" :closable="false"/><el-alert v-if="selected.group==='空运经营'" title="三项空运报表的访问角色未归集；目前仅超级管理员可查看。航司月份归属未明确，当前按建单月核对，不作为正式月报（218）。" type="info" :closable="false"/>
    <el-empty v-if="!selected.fields.length" description="PRD仅列出报表入口，未定义字段与统计口径（219）"/>
    <RecordQueryTable v-else :key="`${selected.id}:${workbenchSession.personaId}`" :rows="rows" :columns="selected.fields.map(field=>[field,field,Math.max(145,field.length*16)])" :filters="selected.filters.map(field=>[field,field,'select',[...new Set(rows.map(row=>row[field]).filter(Boolean))].sort().reverse()])" :name="selected.name" :exportable="false"><template #actions><el-button v-if="selected.manual" disabled title="审批人、申请状态、统计口径及范围未明确">提交报表生成申请</el-button><el-button disabled title="报表导出授权与正式格式待确认（104）">导出报表</el-button></template><template #cell="{row,field}">{{row[field]??'口径待确认'}}</template></RecordQueryTable>
  </template>
</div></template>
<style scoped>.el-form{max-width:540px}h2{font-size:16px;margin:20px 0}.el-alert{margin:12px 0}</style>
