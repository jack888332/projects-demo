<script setup>
import {computed,ref,onMounted,onBeforeUnmount} from 'vue'
import {onBeforeRouteLeave} from 'vue-router'
import {Plus,Edit,Search,Refresh,VideoPlay,VideoPause} from '@element-plus/icons-vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import FinanceCurrencySelect from '../components/FinanceCurrencySelect.vue'
import {usePrototypeData} from '../data/usePrototypeData.js'
import {useFinanceContext} from '../data/financeBasicContext.js'
import {canWriteModule,isSuperAdmin,workbenchSession} from '../data/accessControl.js'
import {FINANCE_BASIC_ACCOUNTS} from '../domain/financeBasicAccess.js'
import {BANK_FIELDS,bankAccountDraft,bankAccountErrors,bankAccountRows} from '../domain/financeBasics.js'
const {state,saveBankAccount,setBankAccountStatus}=usePrototypeData(),writable=computed(()=>canWriteModule('bankAccounts')),account=computed(()=>FINANCE_BASIC_ACCOUNTS[workbenchSession.personaId])
const captureContext=useFinanceContext(state)
const filters=[['bankName','开户行名称'],['accountName','账户名称'],['accountNo','银行账号'],['currency','币种代码'],['updatedBy','更新人'],['status','状态']]
const empty=()=>Object.fromEntries(filters.map(([key])=>[key,''])),pending=ref(empty()),applied=ref(empty())
const rows=computed(()=>bankAccountRows(state,account.value,isSuperAdmin()).filter(row=>filters.every(([key])=>!applied.value[key]||(['currency','status'].includes(key)?row[key]===applied.value[key]:row[key].includes(applied.value[key])))))
const open=ref(false),id=ref(''),draft=ref(bankAccountDraft()),initial=ref(''),failure=ref('')
const errors=computed(()=>bankAccountErrors(draft.value,state,account.value,id.value)),dirty=computed(()=>open.value&&initial.value!==JSON.stringify(draft.value))
function edit(row){id.value=row?.id||'';draft.value=bankAccountDraft(row);initial.value=JSON.stringify(draft.value);failure.value='';open.value=true}
async function leave(){if(!dirty.value)return true;const current=captureContext();try{await ElMessageBox.confirm('放弃尚未保存的银行账户？','放弃修改',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑'});return current()}catch{return false}}
async function close(done){if(await leave()){open.value=false;if(typeof done==='function')done()}}
function save(){try{saveBankAccount(id.value,draft.value);open.value=false;ElMessage.success('银行账户已保存')}catch(error){failure.value=error.message}}
async function toggle(row){const current=captureContext(row),status=row.status==='已生效'?'已停用':'已生效',verb=status==='已停用'?'停用':'启用';try{await ElMessageBox.confirm(`${verb}账户“${row.accountName}”（${row.accountNo}）？`,`${verb}银行账户`,{confirmButtonText:`确认${verb}`,cancelButtonText:'取消'});if(!current())return;setBankAccountStatus(row.id,status);ElMessage.success(`银行账户${status}`)}catch(error){if(error instanceof Error)ElMessage.error(error.message)}}
onBeforeRouteLeave(leave)
const unload=e=>{if(dirty.value){e.preventDefault();e.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',unload));onBeforeUnmount(()=>window.removeEventListener('beforeunload',unload))
</script>
<template><div class="module-view">
  <PageHeader title="银行账户管理"><template #actions><el-button v-if="writable" :icon="Plus" type="primary" @click="edit()">新增银行账户</el-button></template></PageHeader>
  <el-form class="bank-query" label-position="top" @submit.prevent="applied={...pending}"><el-form-item v-for="[key,label] in filters" :key="key" :label="label"><FinanceCurrencySelect v-if="key==='currency'" v-model="pending.currency" label="查询币种代码"/><el-select v-else-if="key==='status'" v-model="pending.status" clearable aria-label="查询银行账户状态"><el-option v-for="value in ['已生效','已停用']" :key="value" :value="value" :label="value"/></el-select><el-input v-else v-model="pending[key]" clearable :aria-label="'查询'+label"/></el-form-item><div><el-button :icon="Search" type="primary" native-type="submit">查询</el-button><el-button :icon="Refresh" @click="pending=empty();applied=empty()">重置</el-button></div></el-form>
  <DataTableFrame :rows="rows"><template #default="{rows:pageRows}"><el-table :data="pageRows" aria-label="银行账户列表"><el-table-column v-if="isSuperAdmin()" prop="companyId" label="所属公司" width="140"/><el-table-column v-for="[key,label,width] in [['bankName','开户行名称',180],['accountName','账户名称',220],['accountNo','银行账号',190],['basic','是否基本户',110],['currency','币种代码',110],['updatedBy','更新人',180],['updatedAt','更新时间',180],['status','状态',110]]" :key="key" :prop="key" :label="label" :min-width="width"/><el-table-column v-if="writable" label="操作" width="175" fixed="right"><template #default="{row}"><el-button link type="primary" :icon="Edit" @click="edit(row)">编辑</el-button><el-tooltip :disabled="row.basic!=='Y'" content="基本户不能停用，请先调整基本户"><span><el-button link :disabled="row.basic==='Y'" :icon="row.status==='已生效'?VideoPause:VideoPlay" :type="row.status==='已生效'?'danger':'primary'" @click="toggle(row)">{{row.status==='已生效'?'停用':'启用'}}</el-button></span></el-tooltip></template></el-table-column></el-table></template></DataTableFrame>
  <el-dialog v-model="open" :title="id?'编辑银行账户':'新增银行账户'" width="min(680px,96vw)" :close-on-click-modal="false" :before-close="close"><el-alert v-if="failure" :title="failure" type="error" :closable="false"/><el-form label-position="top" @submit.prevent="save"><div class="bank-grid"><el-form-item v-for="field in BANK_FIELDS" :key="field.key" :label="field.label" required :error="errors[field.key]"><FinanceCurrencySelect v-if="field.key==='currency'" v-model="draft.currency" label="银行账户币种"/><el-radio-group v-else-if="field.key==='basic'" v-model="draft.basic" aria-label="是否基本户"><el-radio value="Y">Y</el-radio><el-radio value="N">N</el-radio></el-radio-group><el-input v-else v-model="draft[field.key]" :maxlength="field.max" :inputmode="field.key==='accountNo'?'numeric':undefined" :aria-label="'维护'+field.label"/></el-form-item></div></el-form><template #footer><el-button @click="close">取消</el-button><el-button type="primary" :disabled="!writable||Object.keys(errors).length>0" @click="save">保存银行账户</el-button></template></el-dialog>
</div></template>
<style scoped>.bank-query{display:flex;gap:16px;flex-wrap:wrap;align-items:end;margin:16px 0}.bank-query .el-form-item{width:210px;margin:0}.bank-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 18px}.el-alert{margin-bottom:16px}@media(max-width:600px){.bank-grid{grid-template-columns:minmax(0,1fr)}.bank-query .el-form-item{width:100%}}</style>
