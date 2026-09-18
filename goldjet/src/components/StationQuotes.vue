<script setup>
import {computed,ref,onMounted,onBeforeUnmount} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {Plus,Search,Refresh,Edit,Delete,View} from '@element-plus/icons-vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import DataTableFrame from './DataTableFrame.vue'
import {usePrototypeData} from '../data/usePrototypeData.js'
import {canWriteModule} from '../data/accessControl.js'
import {stationRights} from '../domain/stationPallet.js'
import {STATION_CURRENCIES,STATION_CHARGE_METHODS,STATION_QUOTE_COLUMNS,stationQuoteDraft,stationQuoteRows,stationQuoteErrors,stationQuoteCustomers} from '../domain/stationQuotes.js'
const {state,workbenchSession,saveStationQuote,deleteStationQuote}=usePrototypeData()
const writable=computed(()=>stationRights(workbenchSession.personaId).manage&&canWriteModule('stationPallet'))
const pending=ref({partnerId:'',subject:''}),applied=ref({...pending.value}),customers=computed(()=>stationQuoteCustomers(state))
const rows=computed(()=>stationQuoteRows(state).filter(row=>(!applied.value.partnerId||row.partnerId===applied.value.partnerId)&&(!applied.value.subject||row.subject===applied.value.subject)))
const visible=ref(false),editingId=ref(''),readonly=ref(false),draft=ref(stationQuoteDraft()),initial=ref(''),failure=ref('')
const existing=computed(()=>state.stationQuotes.find(row=>row.id===editingId.value)),errors=computed(()=>stationQuoteErrors(draft.value,state,existing.value)),dirty=computed(()=>visible.value&&!readonly.value&&JSON.stringify(draft.value)!==initial.value)
function open(row,view=false){editingId.value=row?.id||'';readonly.value=view;draft.value=stationQuoteDraft(row);initial.value=JSON.stringify(draft.value);failure.value='';visible.value=true}
async function leave(){if(!dirty.value)return true;try{await ElMessageBox.confirm('放弃尚未保存的打板报价？','放弃修改',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑'});return true}catch{return false}}
async function close(done){if(!await leave())return;visible.value=false;if(typeof done==='function')done()}
function save(){try{saveStationQuote(draft.value,editingId.value);visible.value=false;ElMessage.success('打板报价已保存')}catch(error){failure.value=error.message}}
async function remove(row){try{await ElMessageBox.confirm(`删除${row.customer}的打板费报价？`,'删除报价',{confirmButtonText:'删除报价',cancelButtonText:'取消',type:'warning'});deleteStationQuote(row.id);ElMessage.success('报价已删除')}catch(error){if(error instanceof Error)ElMessage.error(error.message)}}
onBeforeRouteLeave(leave);onBeforeRouteUpdate(async()=>{if(!await leave())return false;visible.value=false})
const unload=event=>{if(dirty.value){event.preventDefault();event.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',unload));onBeforeUnmount(()=>window.removeEventListener('beforeunload',unload))
</script>
<template>
  <section>
    <el-form class="quote-query" label-position="top" @submit.prevent="applied={...pending}"><el-form-item label="客户"><el-select v-model="pending.partnerId" clearable filterable aria-label="报价查询客户"><el-option v-for="row in customers" :key="row.id" :value="row.id" :label="row.name"/></el-select></el-form-item><el-form-item label="报价科目"><el-select v-model="pending.subject" clearable aria-label="报价查询科目"><el-option value="打板费"/></el-select></el-form-item><div><el-button :icon="Search" type="primary" native-type="submit">查询</el-button><el-button :icon="Refresh" @click="pending={partnerId:'',subject:''};applied={...pending}">重置</el-button></div></el-form>
    <DataTableFrame :rows="rows" :page-size="10" :page-sizes="[10,20,50]"><template #actions><el-button v-if="writable" :icon="Plus" type="primary" @click="open()">新增打板报价</el-button></template><template #default="{rows:pageRows}"><el-table :data="pageRows" aria-label="打板报价列表"><el-table-column v-for="[key,label] in STATION_QUOTE_COLUMNS" :key="key" :prop="key" :label="label" :min-width="key==='customer'?200:key.includes('Date')||key==='updatedAt'?165:130"/><el-table-column label="操作" width="240" fixed="right"><template #default="{row}"><el-button :icon="View" link @click="open(row,true)">详情</el-button><el-button v-if="writable" :icon="Edit" link type="primary" @click="open(row)">修改</el-button><el-button v-if="writable" :icon="Delete" link type="danger" @click="remove(row)">删除</el-button></template></el-table-column></el-table></template></DataTableFrame>
    <el-dialog v-model="visible" :title="readonly?'打板报价详情':editingId?'修改打板报价':'新增打板报价'" width="min(760px,96vw)" :before-close="close" :close-on-click-modal="false" destroy-on-close>
      <el-alert v-if="failure" :title="failure" type="error" :closable="false"/>
      <el-alert v-if="editingId&&!readonly" title="客户、税率、币种的修改继承规则待确认（173），暂保留原值。" type="info" :closable="false"/>
      <el-form label-position="top" :disabled="readonly" @submit.prevent="save"><div class="quote-fields">
        <el-form-item label="客户" required :error="errors.partnerId"><el-select v-model="draft.partnerId" filterable :disabled="Boolean(editingId)" aria-label="报价客户"><el-option v-for="row in customers" :key="row.id" :value="row.id" :label="row.name"/></el-select></el-form-item>
        <el-form-item label="税率（%）" required :error="errors.taxRate"><el-select v-model="draft.taxRate" :disabled="Boolean(editingId)" aria-label="报价税率"><el-option v-for="value in state.stationTaxRates" :key="value" :value="value" :label="String(value)"/></el-select></el-form-item>
        <el-form-item label="币种" required :error="errors.currency"><el-select v-model="draft.currency" :disabled="Boolean(editingId)" aria-label="报价币种"><el-option v-for="value in STATION_CURRENCIES" :key="value" :value="value"/></el-select></el-form-item>
        <el-form-item label="报价科目" required><el-select v-model="draft.subject" aria-label="报价科目"><el-option value="打板费"/></el-select></el-form-item>
        <el-form-item label="报价金额" required :error="errors.amount"><el-input v-model="draft.amount" inputmode="decimal" aria-label="报价金额"/></el-form-item>
        <el-form-item label="单位" required><el-select v-model="draft.unit" aria-label="报价单位"><el-option value="kg"/></el-select></el-form-item>
        <el-form-item label="计费方式" required :error="errors.chargeMethod"><el-select v-model="draft.chargeMethod" aria-label="报价计费方式"><el-option v-for="value in STATION_CHARGE_METHODS" :key="value" :value="value"/></el-select></el-form-item>
        <el-form-item label="生效日期" required :error="errors.startDate"><el-date-picker v-model="draft.startDate" type="date" value-format="YYYY-MM-DD" aria-label="报价生效日期"/></el-form-item>
        <el-form-item label="截止日期" required :error="errors.endDate"><el-date-picker v-model="draft.endDate" type="date" value-format="YYYY-MM-DD" aria-label="报价截止日期"/></el-form-item>
        <el-form-item label="备注" :error="errors.remark"><el-input v-model="draft.remark" type="textarea" maxlength="500" aria-label="报价备注"/></el-form-item>
      </div></el-form>
      <template #footer><el-button @click="close">{{readonly?'关闭':'取消'}}</el-button><el-button v-if="!readonly" type="primary" :disabled="!writable||Object.keys(errors).length>0" @click="save">保存报价</el-button></template>
    </el-dialog>
  </section>
</template>
<style scoped>.quote-query{display:flex;flex-wrap:wrap;align-items:end;gap:16px;margin:16px 0}.quote-query .el-form-item{width:230px;margin:0}.quote-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 18px;margin-top:16px}.el-select,:deep(.el-date-editor){width:100%}@media(max-width:700px){.quote-fields{grid-template-columns:minmax(0,1fr)}.quote-query .el-form-item{width:100%}}</style>
