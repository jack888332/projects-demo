<script setup>
import {computed,ref,onMounted,onBeforeUnmount} from 'vue'
import {onBeforeRouteLeave} from 'vue-router'
import {Plus,Edit,Search,Refresh,VideoPlay,VideoPause} from '@element-plus/icons-vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import {usePrototypeData} from '../data/usePrototypeData.js'
import {useFinanceContext} from '../data/financeBasicContext.js'
import {canWriteModule} from '../data/accessControl.js'
import {costItemErrors} from '../domain/financeBasics.js'
const {state,saveFinanceCostItem,setFinanceCostStatus}=usePrototypeData(),writable=computed(()=>canWriteModule('costItems'))
const captureContext=useFinanceContext(state)
const empty=()=>({name:'',status:''}),pending=ref(empty()),applied=ref(empty())
const rows=computed(()=>state.financeCostItems.filter(row=>(!applied.value.name||row.name.includes(applied.value.name))&&(!applied.value.status||row.status===applied.value.status)).toSorted((a,b)=>a.code.localeCompare(b.code)))
const open=ref(false),id=ref(''),draft=ref({code:'',name:''}),initial=ref(''),failure=ref('')
const errors=computed(()=>costItemErrors(draft.value.name,state,id.value)),dirty=computed(()=>open.value&&initial.value!==JSON.stringify(draft.value))
function edit(row){id.value=row?.id||'';draft.value={code:row?.code||'',name:row?.name||''};initial.value=JSON.stringify(draft.value);failure.value='';open.value=true}
async function leave(){if(!dirty.value)return true;const current=captureContext();try{await ElMessageBox.confirm('放弃尚未保存的成本项目？','放弃修改',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑'});return current()}catch{return false}}
async function close(done){if(await leave()){open.value=false;if(typeof done==='function')done()}}
function save(){try{saveFinanceCostItem(id.value,draft.value);open.value=false;ElMessage.success('保存成功')}catch(error){failure.value=error.message}}
async function toggle(row){const current=captureContext(row),status=row.status==='已生效'?'已停用':'已生效',verb=status==='已停用'?'停用':'启用';try{await ElMessageBox.confirm(`${verb}成本项目“${row.name}”？`,`${verb}确认`,{confirmButtonText:`确认${verb}`,cancelButtonText:'取消'});if(!current())return;setFinanceCostStatus(row.id,status);ElMessage.success(`成本项目${status}`)}catch(error){if(error instanceof Error)ElMessage.error(error.message)}}
onBeforeRouteLeave(leave)
const unload=e=>{if(dirty.value){e.preventDefault();e.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',unload));onBeforeUnmount(()=>window.removeEventListener('beforeunload',unload))
</script>
<template><div class="module-view">
  <PageHeader title="成本项目维护"><template #actions><el-button v-if="writable" :icon="Plus" type="primary" @click="edit()">新增成本项目</el-button></template></PageHeader>
  <el-form class="cost-query" label-position="top" @submit.prevent="applied={...pending}"><el-form-item label="成本项目"><el-input v-model="pending.name" clearable aria-label="查询成本项目"/></el-form-item><el-form-item label="状态"><el-select v-model="pending.status" clearable aria-label="查询成本状态"><el-option v-for="value in ['已生效','已停用']" :key="value" :value="value" :label="value"/></el-select></el-form-item><div><el-button type="primary" :icon="Search" native-type="submit">查询</el-button><el-button :icon="Refresh" @click="pending=empty();applied=empty()">重置</el-button></div></el-form>
  <DataTableFrame :rows="rows"><template #default="{rows:pageRows}"><el-table :data="pageRows" aria-label="成本项目列表"><el-table-column v-for="[key,label,width] in [['code','成本代码',110],['name','成本项目',220],['updatedBy','更新人',180],['updatedAt','更新时间',180],['status','状态',110]]" :key="key" :prop="key" :label="label" :min-width="width"/><el-table-column v-if="writable" label="操作" width="175" fixed="right"><template #default="{row}"><el-button link type="primary" :icon="Edit" @click="edit(row)">编辑</el-button><el-button link :type="row.status==='已生效'?'danger':'primary'" :icon="row.status==='已生效'?VideoPause:VideoPlay" @click="toggle(row)">{{row.status==='已生效'?'停用':'启用'}}</el-button></template></el-table-column></el-table></template></DataTableFrame>
  <el-dialog v-model="open" :title="id?'编辑成本项目':'新增成本项目'" width="min(520px,96vw)" :close-on-click-modal="false" :before-close="close"><el-alert v-if="!id" title="新增初始状态待确认（178），暂不保存。" type="warning" :closable="false"/><el-alert v-if="failure" :title="failure" type="error" :closable="false"/><el-form label-position="top" @submit.prevent="save"><el-form-item label="成本代码"><el-input :model-value="draft.code" readonly placeholder="保存后生成 F + 3位流水" aria-label="成本代码"/></el-form-item><el-form-item label="成本项目" required :error="errors.name"><el-input v-model="draft.name" maxlength="30" show-word-limit aria-label="成本项目名称"/></el-form-item></el-form><template #footer><el-button @click="close">取消</el-button><el-button type="primary" :disabled="!writable||!id||Object.keys(errors).length>0" @click="save">确认保存</el-button></template></el-dialog>
</div></template>
<style scoped>.cost-query{display:flex;flex-wrap:wrap;gap:16px;align-items:end;margin:16px 0}.cost-query .el-form-item{width:240px;margin:0}.el-alert{margin-bottom:16px}@media(max-width:600px){.cost-query .el-form-item{width:100%}}</style>
