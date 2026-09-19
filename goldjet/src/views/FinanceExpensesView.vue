<script setup>
import {computed,ref,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {useDraftNavigation} from '../utils/useDraftNavigation.js'
import {Back,Money,Connection,Download} from '@element-plus/icons-vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import RecordQueryTable from '../components/RecordQueryTable.vue'
import OrderCostFacts from '../components/finance/OrderCostFacts.vue'
import {usePrototypeData} from '../data/usePrototypeData.js'
import {canReadModule,workbenchSession,accessState} from '../data/accessControl.js'
import {expenseColumns,EXPENSE_LIST,EXPENSE_GROUPS,expenseOffsetDraft,expenseOffsetCheck} from '../domain/reimbursements.js'
import {displayValue} from '../domain/recordQuery.js'
import {downloadRecords} from '../utils/recordDownloads.js'
import {FINANCE_BASIC_ACCOUNTS} from '../domain/financeBasicAccess.js'
const {state}=usePrototypeData(),route=useRoute(),router=useRouter(),selected=ref(null),draft=ref(null),mode=ref(''),accountId=ref(''),date=ref(''),amount=ref('')
const tab=computed(()=>['payment','offset'].includes(route.query.tab)?route.query.tab:'documents'),readable=computed(()=>canReadModule('reimbursements'))
const rows=computed(()=>!readable.value?[]:(tab.value==='documents'?state.expenses.documents:state.expenses.records.filter(row=>row.kind===tab.value)).filter(row=>workbenchSession.personaId==='superAdmin'||row.organizationId===FINANCE_BASIC_ACCOUNTS[workbenchSession.personaId]?.organizationId).toSorted((a,b)=>b.单据编号.localeCompare(a.单据编号)))
const columns=computed(()=>tab.value==='documents'?EXPENSE_LIST:expenseColumns(`单据编号、单据类型、状态、承担部门、往来单位类型、往来单位、本次${tab.value==='payment'?'付款':'核销'}金额、币种、${tab.value==='payment'?'更新人、更新日期':'核销人、核销日期'}、同步金蝶状态、金蝶返回消息`))
const filters=computed(()=>[['单据编号','单据编号'],['单据类型','单据类型'],['承担组织','费用承担组织','select',['合成公司甲','合成公司乙']],['承担部门','费用承担部门','select',['合成空运部门','合成异公司部门']],['往来单位','往来单位'],['min','申请金额从','min',null,tab.value==='documents'?'申请金额':`本次${tab.value==='payment'?'付款':'核销'}金额`],['max','申请金额至','max',null,tab.value==='documents'?'申请金额':`本次${tab.value==='payment'?'付款':'核销'}金额`],['同步金蝶状态','同步金蝶状态','select',['导入成功','导入失败']],...(tab.value==='documents'?[['申请人','申请人'],['申请日期','申请日期','range'],['付款状态','付款状态','select',['未付款','部分付款','已付款']],['单据状态','单据状态','select',['未结清','已结清']],['事由','事由']]:[['状态','状态','select',['新建','已打回','已提交']],['往来单位类型','往来单位类型','select',['员工','其他往来单位']],['币种','币种','select',['CNY','USD','HKD']],[tab.value==='payment'?'更新人':'核销人',tab.value==='payment'?'更新人':'核销人'],[tab.value==='payment'?'更新日期':'核销日期',tab.value==='payment'?'更新日期':'核销日期','range']])])
const offset=computed(()=>draft.value&&mode.value==='offset'?expenseOffsetCheck(draft.value):null)
const accounts=computed(()=>state.financeBasics.bankAccounts.filter(row=>row.status==='已生效'&&row.companyId==='FIN-DEMO-A'))
const account=computed(()=>accounts.value.find(row=>row.id===accountId.value))
const detailColumns=expenseColumns('单据编号、单据类型、承担组织、承担部门、往来单位、申请人、申请日期、申请金额、可核销金额、本次核销金额')
async function leave(){if(!draft.value)return true;try{await ElMessageBox.confirm('放弃尚未保存的报销录入？','放弃修改',{confirmButtonText:'确认',cancelButtonText:'取消'});draft.value=null;return true}catch{return false}}
useDraftNavigation(()=>!!draft.value,leave,()=>{selected.value=null})
async function navigate(next=tab.value){if(!await leave())return;selected.value=null;router.push({path:'/finance/reimbursements',query:{tab:next}})}
function start(records,next){try{if(next==='offset')draft.value=expenseOffsetDraft(records);else {if(records.length!==1||records[0].单据状态!=='未结清'||!['未付款','部分付款'].includes(records[0].付款状态))throw new Error('付款只能选择一条未结清且未付款或部分付款的单据');draft.value=JSON.parse(JSON.stringify(records))}mode.value=next;accountId.value='';date.value='';amount.value=''}catch(error){ElMessage.error(error.message)}}
watch(()=>[workbenchSession.personaId,accessState.revision,state.expenses],()=>{selected.value=null;draft.value=null})
</script>

<template>
  <div class="module-view expense-view"><PageHeader :title="draft?mode==='offset'?'报销核销录入预览':'报销付款录入预览':selected?`${selected.单据类型}明细`:'费用报销'"><template #actions><el-button v-if="draft||selected" :icon="Back" @click="navigate()">返回列表</el-button></template></PageHeader>
    <el-empty v-if="!readable" description="当前岗位未获报销查看授权"/>
    <template v-else><el-alert title="钉钉及金蝶数据为隔离的合成样本；付款、核销的状态与余额规则待确认（107、211～213）。" type="warning" :closable="false"/>
      <template v-if="!selected&&!draft"><el-tabs :model-value="tab" @update:model-value="navigate($event)"><el-tab-pane label="报销列表" name="documents"/><el-tab-pane label="报销付款" name="payment"/><el-tab-pane label="报销核销" name="offset"/></el-tabs>
        <RecordQueryTable :key="`${tab}:${workbenchSession.personaId}:${accessState.revision}`" :rows="rows" :columns="columns" :filters="filters" :defaults="tab==='documents'?{单据状态:'未结清'}:{}" name="报销记录" :page-size="10" selectable detail @detail="selected=$event">
          <template #actions="{selection}"><template v-if="tab==='documents'"><el-button :icon="Money" :disabled="selection.length!==1" @click="start(selection,'payment')">付款录入</el-button><el-button :icon="Connection" :disabled="!selection.length" @click="start(selection,'offset')">核销录入</el-button><el-button disabled title="接口幂等与重推权限待确认（213）">重推金蝶</el-button></template><el-button :icon="Download" :disabled="!selection.length" @click="downloadRecords('报销勾选记录.csv',selection,columns)">导出勾选</el-button></template>
        </RecordQueryTable>
      </template>
      <template v-else-if="draft"><OrderCostFacts :entries="[['往来单位',draft[0].往来单位],['费用承担组织',draft[0].承担组织],['币种',draft[0].币种],['状态','尚未保存']]"/>
        <template v-if="mode==='offset'"><section v-for="type in Object.keys(EXPENSE_GROUPS)" :key="type"><h2>{{type}}</h2><RecordQueryTable :rows="draft.filter(row=>row.单据类型===type)" :columns="detailColumns" :name="`${type}冲抵明细`" :page-size="10" :exportable="false"><template #cell="{row,field}"><el-input v-if="field==='本次核销金额'" v-model="row.本次核销金额" :aria-label="`本次核销金额 ${row.单据编号}`"/><template v-else>{{displayValue(row[field])}}</template></template></RecordQueryTable></section><OrderCostFacts :entries="Object.entries(offset.totals).map(([key,total])=>[`${key}核销金额`,total])"/><el-alert :title="offset.error||'借支核销金额等于报销核销金额加退款核销金额'" :type="offset.error?'error':'success'" :closable="false"/></template>
        <template v-else><section><h2>付款信息</h2><el-form class="expense-form" label-position="top"><el-form-item label="银行账号" required><el-select v-model="accountId" aria-label="报销付款银行账号"><el-option v-for="bank in accounts" :key="bank.id" :value="bank.id" :label="`${bank.accountNo} ${bank.bankName}`"/></el-select></el-form-item><el-form-item label="付款日期" required><el-date-picker v-model="date" value-format="YYYY-MM-DD" aria-label="报销付款日期"/></el-form-item><el-form-item label="实际付款金额" required><el-input v-model="amount" aria-label="报销实际付款金额"/></el-form-item></el-form><OrderCostFacts :entries="[['银行名称',account?.bankName||'未选择'],['账号名称',account?.accountName||'未选择'],['付款币种',account?.currency||'未选择']]"/></section><RecordQueryTable :rows="draft" :columns="expenseColumns('单据编号、单据类型、承担组织、承担部门、往来单位、申请人、申请日期、申请金额、可付款金额、本次付款金额')" name="报销付款源明细" :exportable="false"><template #cell="{row,field}"><el-input v-if="field==='本次付款金额'" v-model="row[field]" :aria-label="`本次付款金额 ${row.单据编号}`"/><template v-else>{{field==='可付款金额'?'待确认（212）':displayValue(row[field])}}</template></template></RecordQueryTable></template>
        <div class="commands"><el-button disabled>保存（余额占用待确认）</el-button><el-button disabled>保存并提交</el-button><el-button :icon="Back" @click="navigate()">返回列表</el-button></div>
      </template>
      <template v-else-if="selected.kind"><OrderCostFacts :entries="expenseColumns(`单据编号、单据类型、费用承担组织、费用承担部门、往来单位类型、往来单位、本次${selected.kind==='payment'?'付款':'核销'}金额、币种、申请人、更新日期、核销人、核销日期、状态`).map(([key,title])=>[title,displayValue(selected[key])])"/><section v-if="selected.kind==='payment'"><h2>付款信息</h2><OrderCostFacts :entries="expenseColumns('银行账号、银行名称、账号名称、付款日期、付款币种、实际付款金额').map(([key,title])=>[title,displayValue(selected[key])])"/></section><section><h2>来源明细</h2><RecordQueryTable :rows="selected.lines" :columns="selected.kind==='payment'?expenseColumns('单据编号、单据类型、承担组织、承担部门、往来单位、申请人、申请日期、申请金额、可付款金额、本次付款金额'):detailColumns" name="报销来源明细" :page-size="10" :exportable="false"/></section><section><h2>操作记录</h2><RecordQueryTable :rows="selected.history" :columns="expenseColumns('事件、备注、操作人、操作时间')" name="报销操作记录" :exportable="false"/></section><div class="commands"><el-button disabled>编辑</el-button><el-button disabled>{{selected.状态==='已提交'?'打回':'提交'}}</el-button><el-button disabled>删除</el-button></div></template>
      <template v-else><section v-for="[title,fields,key] in EXPENSE_GROUPS[selected.单据类型]" :key="title"><h2>{{title}}</h2><RecordQueryTable v-if="['lines','assets'].includes(key)" :rows="selected[key]||[]" :columns="expenseColumns(fields)" :name="title" :page-size="10" :exportable="false"/><OrderCostFacts v-else :entries="expenseColumns(fields).map(([field,label])=>[label,displayValue((key?selected[key]:selected)?.[field])])"/></section></template>
    </template>
  </div>
</template>

<style scoped>
.expense-view{min-width:0}.el-alert{margin-block:12px}section{border-top:1px solid var(--border);padding:20px 0;min-width:0}h2{font-size:15px;margin:0 0 16px}.expense-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px}.expense-form :deep(.el-date-editor){width:100%;max-width:100%}.commands{display:flex;flex-wrap:wrap;gap:10px;padding:16px 0}.commands .el-button{margin:0}
</style>
