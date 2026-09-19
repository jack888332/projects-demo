<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDraftNavigation } from '../utils/useDraftNavigation.js'
import { FINANCE_BASIC_ACCOUNTS } from '../domain/financeBasicAccess.js'
import { Back, Plus, Check, Promotion } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import RecordQueryTable from '../components/RecordQueryTable.vue'
import OrderCostFacts from '../components/finance/OrderCostFacts.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canReadModule, workbenchSession, accessState } from '../data/accessControl.js'
import { WRITEOFF_COLUMNS, WRITEOFF_LINES, WRITEOFF_PENDING, WRITEOFF_STATES, writeoffSources, writeoffPreview, writeoffCalculation } from '../domain/writeoffs.js'
const { state } = usePrototypeData(), route = useRoute(), router = useRouter()
const kind = computed(()=>route.query.kind==='payment'?'payment':'receipt'), label=computed(()=>kind.value==='receipt'?'收款':'付款'), tab=computed(()=>['pending','details'].includes(route.query.tab)?route.query.tab:'list')
const draft=ref(null), selected=ref(null), readable=computed(()=>canReadModule('writeoffs'))
const sourceRows=computed(()=>!readable.value?[]:tab.value==='pending'?writeoffSources(state,kind.value):state.writeoffs.rows.filter(row=>row.kind===kind.value).flatMap(row=>tab.value==='details'?row.lines.map((line,index)=>({...row,...line,id:`${row.id}:${index}`,writeoffId:row.id})):row).toSorted((a,b)=>b.id.localeCompare(a.id)))
const rows=computed(()=>sourceRows.value.filter(row=>workbenchSession.personaId==='superAdmin'||(row.companyId&&row.companyId===FINANCE_BASIC_ACCOUNTS[workbenchSession.personaId]?.companyId)))
const columns=computed(()=>tab.value==='pending'?WRITEOFF_PENDING:tab.value==='details'?[...WRITEOFF_COLUMNS.slice(0,3),...WRITEOFF_LINES,...WRITEOFF_COLUMNS.slice(7,15)]:WRITEOFF_COLUMNS)
const filters=computed(()=>tab.value==='pending'?[
  ['applicationNo','申请批次号'],['orderNo','订单号'],['billNo','提单号'],['settlementParty','结算单位'],['currency','申请币种','select',['CNY','USD','HKD']],['requestedBank','收款银行'],['requestedAccount','收款账户'],['requestedAccountNo','收款银行账号'],['min','可核销金额从','min',null,'availableAmount'],['max','可核销金额至','max',null,'availableAmount'],['applicant','申请人'],['businessDate','业务日期','range'],['applicationDate','申请日期','range'],
]:[['writeoffNo','核销号'],['status','状态','select',WRITEOFF_STATES],['settlementParty','结算单位'],['actualCurrency',`${label.value}币种`,'select',['CNY','USD','HKD']],['accountNo','银行账号'],['actualDate',`${label.value}日期`,'range'],['currency','原币币种','select',['CNY','USD','HKD']],['operator','核销人'],['date','核销日期','range'],...(tab.value==='details'?[['applicationNo','申请批次号'],['orderNo','订单号'],['billNo','提单号'],['bankName','银行名称'],['accountName','账户名称']]:[])])
const accounts=computed(()=>state.financeBasics.bankAccounts.filter(row=>row.status==='已生效'&&row.companyId===draft.value?.companyId))
const calculation=computed(()=>draft.value?writeoffCalculation(draft.value,state.financeBasics.rates,accounts.value):{})
const value=v=>v==null?'待确认':typeof v==='number'?v.toLocaleString('zh-CN',{maximumFractionDigits:8}):v
async function leave(){if(!draft.value)return true;try{await ElMessageBox.confirm('放弃尚未保存的核销录入？','放弃修改',{confirmButtonText:'确认',cancelButtonText:'取消'});draft.value=null;return true}catch{return false}}
useDraftNavigation(()=>!!draft.value,leave,()=>{selected.value=null})
async function navigate(nextTab=tab.value,nextKind=kind.value){if(!await leave())return;selected.value=null;router.push({path:'/finance/writeoffs',query:{kind:nextKind,tab:nextTab}})}
function create(lines){try{draft.value=writeoffPreview(lines)}catch(error){ElMessage.error(error.message)}}
watch(()=>[workbenchSession.personaId,accessState.revision,state.writeoffs],()=>{draft.value=null;selected.value=null})
</script>

<template>
  <div class="module-view writeoffs-view"><PageHeader :title="draft?`${label}核销录入预览`:selected?`${label}核销详情`:'收付款核销'"><template #actions><el-button v-if="draft||selected" :icon="Back" @click="navigate()">返回列表</el-button></template></PageHeader>
    <el-empty v-if="!readable" description="当前岗位未获核销查看授权"/>
    <template v-else>
      <el-alert title="核销生效、余额占用和额度回退规则待确认（039、105、106、209）；当前不写入核销或客户额度。" type="warning" :closable="false"/>
      <template v-if="!draft&&!selected">
        <el-radio-group :model-value="kind" aria-label="核销方向" @update:model-value="navigate('list',$event)"><el-radio-button value="receipt">收款核销</el-radio-button><el-radio-button value="payment">付款核销</el-radio-button></el-radio-group>
        <el-tabs :model-value="tab" @update:model-value="navigate($event)"><el-tab-pane :label="`${label}核销列表`" name="list"/><el-tab-pane :label="`待${label}核销`" name="pending"/><el-tab-pane :label="`${label}核销明细`" name="details"/></el-tabs>
        <el-alert v-if="tab==='pending'" title="仅展示非展示样本且财务审批通过的申请；可核销余额尚不能确定（209）。" type="info" :closable="false"/>
        <RecordQueryTable :key="`${kind}:${tab}:${workbenchSession.personaId}:${accessState.revision}`" :rows="rows" :columns="columns" :filters="filters" :defaults="tab==='pending'?{currency:'CNY'}:{}" :name="`${label}核销${tab==='pending'?'来源':tab==='details'?'明细':'列表'}`" :detail="tab!=='pending'" :selectable="tab==='pending'" :selection-only="tab==='pending'" @detail="selected=state.writeoffs.rows.find(item=>item.id===($event.writeoffId||$event.id))">
          <template #actions="{rows:filtered,selection}"><template v-if="tab==='pending'"><el-button :icon="Plus" :disabled="!selection.length" @click="create(selection)">按勾选录入</el-button><el-button :icon="Plus" :disabled="!filtered.length" @click="create(filtered)">按查询条件录入</el-button></template></template>
        </RecordQueryTable>
      </template>
      <template v-else-if="draft">
        <OrderCostFacts :entries="[['结算单位',draft.party],['原币币种',draft.currency],['核销号','保存后生成'],['状态','尚未保存']]"/>
        <section><h2>核销基本信息</h2><el-form label-position="top" class="writeoff-form"><el-form-item :label="`是否代${label.slice(0,1)}`"><el-checkbox v-model="draft.agency" @change="draft.agencyCompany=''">是</el-checkbox></el-form-item><el-form-item :label="`${label}单位`"><el-select v-model="draft.agencyCompany" :disabled="!draft.agency" :aria-label="`${label}单位`"><el-option label="合成公司甲" value="FIN-DEMO-A"/><el-option label="合成公司乙" value="FIN-DEMO-B"/></el-select></el-form-item></el-form></section>
        <section><h2>实际{{label}}信息</h2><el-form label-position="top" class="writeoff-form"><el-form-item :label="`${label}银行账号`"><el-select v-model="draft.accountId" clearable :aria-label="`${label}银行账号`"><el-option v-for="account in accounts" :key="account.id" :value="account.id" :label="`${account.accountNo} ${account.bankName} ${account.currency}`"/></el-select></el-form-item><el-form-item :label="`${label}日期`"><el-date-picker v-model="draft.actualDate" value-format="YYYY-MM-DD" :aria-label="`${label}日期`"/></el-form-item><el-form-item :label="`实际${label}金额`"><el-input v-model="draft.actualAmount" :aria-label="`实际${label}金额`"/></el-form-item></el-form>
        <OrderCostFacts :entries="[['银行',calculation.account?.bankName||'未选择'],['账户',calculation.account?.accountName||'未选择'],[`${label}币种`,calculation.account?.currency||'未选择'],['即期汇率',value(calculation.spotRate)],[`${label}金额(本位币)`,value(calculation.actualLocal)],['核销金额(本位币)',value(calculation.localAmount)],['长短款',value(calculation.difference)]]"/></section>
        <section><h2>核销明细</h2><el-alert title="业务汇率与源约定汇率的对应关系、金额边界及舍入待确认（210）；试算不产生核销结果。" type="warning" :closable="false"/><RecordQueryTable :rows="draft.lines" :columns="WRITEOFF_LINES" name="录入核销明细" :exportable="false"><template #cell="{row,field}"><el-input v-if="field==='writeoffAmount'" v-model="row.writeoffAmount" :aria-label="`本次核销金额 ${row.id}`"/><template v-else>{{value(row[field])}}</template></template></RecordQueryTable></section>
        <section v-if="calculation.purchase"><h2>购汇明细</h2><OrderCostFacts :entries="[['购汇银行',calculation.purchase.bank],['购汇银行账户',calculation.purchase.account],['购汇银行账号',calculation.purchase.number],['购汇金额',value(calculation.purchase.amount)],['购汇币种',calculation.purchase.currency]]"/></section>
        <div class="commands"><el-button :icon="Check" disabled>保存核销</el-button><el-button :icon="Promotion" disabled>保存并提交</el-button><el-button :icon="Back" @click="navigate()">返回列表</el-button></div>
      </template>
      <template v-else><el-alert title="独立展示样本，不占用申请余额、不恢复客户额度，也未同步金蝶。" type="info" :closable="false"/><OrderCostFacts :entries="WRITEOFF_COLUMNS.map(([key,title])=>[title,value(selected[key])])"/><section><h2>实际{{label}}信息</h2><OrderCostFacts :entries="[['实际金额',selected.actualAmount],['即期汇率',selected.spotRate],['本位币金额',selected.actualLocal],['是否代收付',selected.agency?'是':'否'],[`${label}单位`,selected.company]]"/></section><section><h2>核销明细</h2><RecordQueryTable :rows="selected.lines" :columns="WRITEOFF_LINES" name="核销记录明细" :exportable="false"/></section><section><h2>购汇明细</h2><el-empty description="收付款币种与原币币种相同，无购汇明细"/></section><div class="commands"><el-button v-if="selected.status==='已提交'" disabled>打回（权限和额度规则待确认）</el-button><template v-else><el-button disabled>编辑</el-button><el-button disabled>提交</el-button><el-button disabled>删除</el-button></template></div></template>
    </template>
  </div>
</template>

<style scoped>
.writeoffs-view{min-width:0}.el-alert{margin:12px 0}.el-radio-group{margin-top:12px}section{padding:16px 0;border-top:1px solid var(--border);min-width:0}h2{font-size:15px;margin:0 0 16px}.writeoff-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:16px}.writeoff-form :deep(.el-date-editor){width:100%;max-width:100%}.commands{display:flex;flex-wrap:wrap;gap:10px;padding:20px 0}.commands .el-button{margin:0}
</style>
