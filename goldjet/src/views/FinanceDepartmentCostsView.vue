<script setup>
import {computed,ref,onMounted,onBeforeUnmount} from 'vue'
import {onBeforeRouteLeave} from 'vue-router'
import {Plus,Delete,Search,Refresh,Upload,Download} from '@element-plus/icons-vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import {usePrototypeData} from '../data/usePrototypeData.js'
import {useFinanceContext} from '../data/financeBasicContext.js'
import {canWriteModule,isSuperAdmin,workbenchSession} from '../data/accessControl.js'
import {FINANCE_BASIC_ACCOUNTS} from '../domain/financeBasicAccess.js'
import {financeMappingRows} from '../domain/financeBasics.js'
const {state,deleteFinanceMapping}=usePrototypeData(),writable=computed(()=>canWriteModule('departmentCosts')),account=computed(()=>FINANCE_BASIC_ACCOUNTS[workbenchSession.personaId])
const captureContext=useFinanceContext(state)
const fields=[['departmentName','部门名称'],['level1Name','一级成本项目'],['level2Name','二级成本项目'],['detailName','明细成本项目']]
const empty=()=>Object.fromEntries(fields.map(([key])=>[key,''])),pending=ref(empty()),applied=ref(empty())
const rows=computed(()=>financeMappingRows(state,account.value,isSuperAdmin()).filter(row=>fields.every(([key])=>!applied.value[key]||row[key]?.includes(applied.value[key]))))
const departments=computed(()=>state.financeBasics.departments.filter(row=>account.value?.departmentIds?.includes(row.id)))
const options=level=>state.financeCostItems.filter(row=>row.level===level&&row.status==='已生效')
const open=ref(false),draft=ref({}),dirty=computed(()=>open.value&&Object.values(draft.value).some(Boolean))
function create(){draft.value={departmentId:'',level1Id:'',level2Id:'',detailId:''};open.value=true}
async function leave(){if(!dirty.value)return true;const current=captureContext();try{await ElMessageBox.confirm('放弃尚未保存的部门成本关系？','放弃修改',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑'});return current()}catch{return false}}
async function close(done){if(await leave()){open.value=false;if(typeof done==='function')done()}}
async function remove(row){const current=captureContext(state.financeBasics.departmentMappings.find(item=>item.id===row.id));try{await ElMessageBox.confirm(`删除${row.departmentName}与${row.detailName}的关联？`,'删除部门成本关系',{confirmButtonText:'确认删除',cancelButtonText:'取消',type:'warning'});if(!current())return;deleteFinanceMapping(row.id);ElMessage.success('部门成本关系已删除')}catch(error){if(error instanceof Error)ElMessage.error(error.message)}}
onBeforeRouteLeave(leave)
const unload=e=>{if(dirty.value){e.preventDefault();e.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',unload));onBeforeUnmount(()=>window.removeEventListener('beforeunload',unload))
</script>
<template><div class="module-view">
  <PageHeader title="部门成本项目维护"><template #actions><el-button v-if="writable" :icon="Plus" type="primary" @click="create">新增部门成本</el-button></template></PageHeader>
  <el-form class="mapping-query" label-position="top" @submit.prevent="applied={...pending}"><el-form-item v-for="[key,label] in fields" :key="key" :label="label"><el-input v-model="pending[key]" clearable :aria-label="'查询'+label"/></el-form-item><div><el-button :icon="Search" type="primary" native-type="submit">查询</el-button><el-button :icon="Refresh" @click="pending=empty();applied=empty()">重置</el-button></div></el-form>
  <el-alert title="批量导入及模板待确认：手工新增与导入的字段、唯一键不一致（180）。" type="warning" :closable="false"/>
  <DataTableFrame :rows="rows"><template #actions><el-button :icon="Download" disabled>模板下载 · 待确认</el-button><el-button v-if="writable" :icon="Upload" disabled>批量导入 · 待确认</el-button></template><template #default="{rows:pageRows}"><el-table :data="pageRows" aria-label="部门成本列表"><el-table-column v-for="[key,label,width] in [['departmentCode','部门编码',110],['departmentName','部门名称',170],['level1Name','一级成本项目',160],['level2Name','二级成本项目',160],['detailName','明细成本项目',160],['createdBy','创建人',170],['createdAt','创建日期',180]]" :key="key" :prop="key" :label="label" :min-width="width"/><el-table-column v-if="writable" label="操作" width="100" fixed="right"><template #default="{row}"><el-button link type="danger" :icon="Delete" @click="remove(row)">删除</el-button></template></el-table-column></el-table></template></DataTableFrame>
  <el-dialog v-model="open" title="新增部门成本项目" width="min(620px,96vw)" :close-on-click-modal="false" :before-close="close"><el-alert title="成本层级来源、唯一键和新增后的列表结果待确认（179、180），暂不保存。" type="warning" :closable="false"/><el-form label-position="top"><el-form-item label="部门编码" required><el-select v-model="draft.departmentId" filterable aria-label="部门编码"><el-option v-for="row in departments" :key="row.id" :value="row.id" :label="row.code+' '+row.name"><span class="option-code">{{row.code}}</span><span>{{row.name}}</span></el-option></el-select></el-form-item><el-form-item v-for="[key,label,level] in [['level1Id','一级成本项目',1],['level2Id','二级成本项目',2],['detailId','明细成本项目',3]]" :key="key" :label="label" required><el-select v-model="draft[key]" filterable :aria-label="label"><el-option v-for="row in options(level)" :key="row.id" :value="row.id" :label="row.code+' '+row.name"/></el-select></el-form-item></el-form><template #footer><el-button @click="close">取消</el-button><el-button type="primary" disabled>确认保存 · 待确认</el-button></template></el-dialog>
</div></template>
<style scoped>.mapping-query{display:flex;flex-wrap:wrap;gap:16px;align-items:end;margin:16px 0}.mapping-query .el-form-item{width:210px;margin:0}.el-alert{margin-bottom:16px}.option-code{display:inline-block;width:90px}:deep(.table-toolbar){flex-wrap:wrap;gap:12px}:deep(.table-toolbar>div:first-child){white-space:nowrap;flex-shrink:0}:deep(.table-actions){display:flex;flex-wrap:wrap;gap:8px}:deep(.table-actions .el-button+.el-button){margin-left:0}@media(max-width:600px){.mapping-query .el-form-item{width:100%}}</style>
