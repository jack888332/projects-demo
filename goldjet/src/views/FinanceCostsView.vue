<script setup>
import { computed, ref, watch, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Back, Check, Delete, Download, Refresh, Close, Edit, View } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import OrderCostFilters from '../components/finance/OrderCostFilters.vue'
import OrderCostFields from '../components/finance/OrderCostFields.vue'
import OrderCostLines from '../components/finance/OrderCostLines.vue'
import OrderCostAttachments from '../components/finance/OrderCostAttachments.vue'
import OrderCostFacts from '../components/finance/OrderCostFacts.vue'
import { WORKBENCH_PERSONAS } from '../domain/workbenchTasks.js'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canWriteModule, canReadModule, accessState } from '../data/accessControl.js'
import { captureOrderCostContext } from '../data/orderCostActions.js'
import { COST_ENTRY_ROLES, COST_EDIT_ROLES, COST_APPROVAL_STAGES } from '../domain/orderCostAccess.js'
import { COST_EDITABLE, COST_COLUMNS, COST_IDENTITY_COLUMNS, COST_AUDIT_COLUMNS, costDraft, costOrders, costRows, costTotals, costErrors, cloneCost, money, matchesCostQuery, fxWarnings, costCsv } from '../domain/orderCosts.js'

const data = usePrototypeData(), { state, workbenchSession } = data
const route = useRoute(), router = useRouter()
const tabs = [{id:'orders',label:'订单成本'},{id:'approvals',label:'成本审批'},{id:'adjustments',label:'调整单'},{id:'summary',label:'汇总查询'},{id:'details',label:'明细查询'}]
const tab = computed(() => tabs.some(row=>row.id===route.query.tab) ? route.query.tab : 'orders')
const order = computed(() => costOrders(state).find(row=>row.id===route.query.order))
const adjustment = computed(() => state.orderCostBook.adjustments.find(row=>row.id===route.query.adjustment&&(!route.query.order||row.orderId===order.value?.id)&&!row.deleted))
const canEnter = computed(() => canWriteModule('costs') && COST_ENTRY_ROLES.includes(workbenchSession.personaId))
const canEdit = computed(() => canWriteModule('costs') && COST_EDIT_ROLES.includes(workbenchSession.personaId))
const approvalStage = computed(() => canWriteModule('costs') ? COST_APPROVAL_STAGES[workbenchSession.personaId] : '')
const query = ref({}), choosingSource = ref(false), selection = ref([]), arSelection = ref([]), apSelection = ref([])
const selected = computed(() => [...arSelection.value,...apSelection.value])
const directionFilter = ref(''), childDimension = ref('全部'), rowRemarks = ref({}), orderRemark = ref('')
const drafts = ref([]), editDraft = ref(null), editId = ref(''), adjustmentDraft = ref(null), adjustmentId = ref(''), sourceId = ref(''), adjustmentSource = ref(null)
const viewed = ref(null), failure = ref(''), attempted = ref(false), initial = ref(''), uploading = ref(false), issues = ref(false)
let draftSequence = 0, alive = true, unchanged = () => true
const capture = row => captureOrderCostContext(state,row,()=>alive)
const dialogDirty = computed(() => (editDraft.value||adjustmentDraft.value) && JSON.stringify(editDraft.value||adjustmentDraft.value)!==initial.value)
const dirty = computed(() => drafts.value.length>0 || dialogDirty.value || (tab.value==='approvals'&&(orderRemark.value!==(order.value?.approvalRemark||'')||Object.keys(rowRemarks.value).length>0)))
const mode = computed(() => choosingSource.value?'sources':tab.value)
const allRows = computed(() => costRows(state))
const costLines = computed(() => allRows.value.filter(row=>row.orderId===order.value?.id))
const receivableLines = computed(() => costLines.value.filter(row=>row.direction==='应收'))
const payableLines = computed(() => costLines.value.filter(row=>row.direction==='应付'))
const detailLines = computed(() => (route.query.adjustment?(adjustment.value?[{...order.value,...adjustment.value}]:[]):costLines.value)
  .filter(row=>approvalStage.value?row.status===approvalStage.value:['已提交','业务审批通过'].includes(row.status))
  .filter(row=>(!directionFilter.value||row.direction===directionFilter.value)&&(childDimension.value==='全部'||row.childNo===childDimension.value))
  .sort((a,b)=>['应收','应付'].indexOf(a.direction)-['应收','应付'].indexOf(b.direction)||a.childNo.localeCompare(b.childNo)))
const totals = computed(() => costTotals(route.query.adjustment?(adjustment.value?[adjustment.value]:[]):costLines.value))
const filteredRows = computed(() => {
  let rows
  if(choosingSource.value) rows=allRows.value.filter(row=>row.status==='财务审批通过').sort((a,b)=>b.orderNo.localeCompare(a.orderNo)||b.businessDate.localeCompare(a.businessDate))
  else if(tab.value==='adjustments') {
    const orders=new Map(costOrders(state).map(row=>[row.id,row]))
    rows=state.orderCostBook.adjustments.filter(row=>!row.deleted).map(row=>({...orders.get(row.orderId),...row})).sort((a,b)=>b.adjustmentNo.localeCompare(a.adjustmentNo))
  } else if(tab.value==='details') rows=[...allRows.value].sort((a,b)=>b.orderNo.localeCompare(a.orderNo)||(b.financeApprovedAt||'').localeCompare(a.financeApprovedAt||'')||(b.businessApprovedAt||'').localeCompare(a.businessApprovedAt||''))
  else if(tab.value==='approvals') rows=costOrders(state).flatMap(item=>{
    const pending=row=>approvalStage.value?row.status===approvalStage.value:['已提交','业务审批通过'].includes(row.status)
    const costs=allRows.value.filter(row=>row.orderId===item.id&&pending(row))
    const adjustments=state.orderCostBook.adjustments.filter(row=>row.orderId===item.id&&!row.deleted&&pending(row))
    return [...adjustments.map(row=>({...item,id:row.id,orderId:item.id,adjustmentId:row.id,documentNo:row.adjustmentNo,documentType:'调整单',submittedAt:row.submittedAt,...costTotals([row])})),...(costs.length?[{...item,orderId:item.id,documentNo:item.orderNo,documentType:'订单成本',submittedAt:costs.map(row=>row.submittedAt).sort()[0]}]:[])]
  }).sort((a,b)=>a.orderId===b.orderId?(Number(!!b.adjustmentId)-Number(!!a.adjustmentId)):(a.submittedAt||'').localeCompare(b.submittedAt||''))
  else rows=costOrders(state).sort((a,b)=>tab.value==='summary'?b.businessDate.localeCompare(a.businessDate):a.businessDate.localeCompare(b.businessDate))
  return rows.filter(row=>matchesCostQuery(row,query.value))
})
const editOrder = computed(() => editDraft.value?order.value:costOrders(state).find(row=>row.id===adjustmentSource.value?.orderId))
const formErrors = computed(() => editDraft.value?costErrors(state,editOrder.value,editDraft.value,{existing:true}):adjustmentDraft.value?costErrors(state,editOrder.value,adjustmentDraft.value,{adjustment:true,existing:!!adjustmentId.value}):{})
const canReview = row => !!approvalStage.value&&row.status===approvalStage.value
const canSubmit = row => canEnter.value&&COST_EDITABLE.includes(row.status)
const pagerKey = computed(() => `${tab.value}:${choosingSource.value}:${JSON.stringify(query.value)}`)

async function confirm(message,title='确认操作',snapshot) {
  const current=capture(snapshot)
  try{await ElMessageBox.confirm(message,title,{confirmButtonText:'确认',cancelButtonText:'取消',type:'warning'});return current()}catch{return false}
}
async function leave() {
  if(uploading.value){ElMessage.warning('附件正在读取，请稍后');return false}
  return !dirty.value || await confirm('放弃尚未保存的录入和审批备注？','放弃修改')
}
async function closeDialog(done) {
  if(uploading.value||(dialogDirty.value&&!await confirm('放弃当前未保存修改？','关闭编辑')))return
  editDraft.value=null;adjustmentDraft.value=null;attempted.value=false;failure.value=''
  if(typeof done==='function')done()
}
function resetTransient() {
  drafts.value=[];editDraft.value=null;adjustmentDraft.value=null;selection.value=[];arSelection.value=[];apSelection.value=[];query.value={};rowRemarks.value={};orderRemark.value=order.value?.approvalRemark||'';failure.value='';directionFilter.value='';childDimension.value='全部';viewed.value=null;uploading.value=false
  if(tab.value==='adjustments'&&adjustment.value)viewed.value={...costOrders(state).find(row=>row.id===adjustment.value.orderId),...adjustment.value}
}
watch(()=>[route.fullPath,workbenchSession.personaId,accessState.revision,state.orderCostBook],resetTransient,{immediate:true})
watch([directionFilter,childDimension],()=>{arSelection.value=[];apSelection.value=[]})
function navigate(nextTab,item) {
  const query={tab:nextTab}
  if(item){query.order=item.orderId||item.id;if(item.adjustmentId)query.adjustment=item.adjustmentId}
  router.push({path:'/finance/costs',query})
}
function switchTab(value){choosingSource.value=false;navigate(value)}
function addLine(direction){drafts.value.push({key:++draftSequence,row:costDraft(state,direction),attempted:false})}
function saveLine(item) {
  item.attempted=true;if(Object.keys(costErrors(state,order.value,item.row)).length)return
  try{data.saveOrderCost(order.value.id,'',item.row);drafts.value=drafts.value.filter(row=>row.key!==item.key);ElMessage.success('成本已保存为新建')}catch(error){failure.value=error.message}
}
async function discardLine(item){if(await confirm('删除尚未保存的成本行？','删除新增行'))drafts.value=drafts.value.filter(row=>row.key!==item.key)}
function openEdit(row) {
  editId.value=row.id;editDraft.value=costDraft(state,row.direction,row);initial.value=JSON.stringify(editDraft.value);attempted.value=false;failure.value='';unchanged=capture(state.costs.find(item=>item.id===row.id))
}
function saveEdit() {
  attempted.value=true;if(Object.keys(formErrors.value).length)return
  try{if(!unchanged())throw new Error('成本数据或权限已变化，请重新打开');data.saveOrderCost(order.value.id,editId.value,editDraft.value);editDraft.value=null;ElMessage.success('成本已保存')}catch(error){failure.value=error.message}
}
async function removeCost(row) {
  if(!await confirm(`删除成本行 ${row.lineNo}：${row.feeItem}？`,'删除成本',state.costs.find(item=>item.id===row.id)))return
  try{data.deleteOrderCost(row.id);ElMessage.success('成本行已删除')}catch(error){ElMessage.error(error.message)}
}
async function submitCosts(rows,isAdjustment=false) {
  if(!rows.length)return
  const warning=fxWarnings(rows).join('\n'),originals=rows.map(row=>isAdjustment?state.orderCostBook.adjustments.find(item=>item.id===row.id):state.costs.find(item=>item.id===row.id))
  if(!await confirm(`将选中的 ${rows.length} 条记录提交业务审批？${warning?'\n'+warning:''}`,'提交审批',originals))return
  try{data.submitOrderCosts(rows.map(row=>row.id),isAdjustment);arSelection.value=[];apSelection.value=[];selection.value=[];ElMessage.success('已提交业务审批')}catch(error){ElMessage.error(error.message)}
}
async function review(approved) {
  if(!selected.value.length)return
  const rows=selected.value.map(row=>adjustment.value?state.orderCostBook.adjustments.find(item=>item.id===row.id):state.costs.find(item=>item.id===row.id))
  if(!await confirm(`${approved?'通过':'拒绝'}选中的 ${rows.length} 条记录？`,'成本审批',rows))return
  try{data.reviewOrderCosts(rows.map(row=>row.id),approved,{adjustment:!!adjustment.value,rowRemarks:rowRemarks.value,orderRemark:orderRemark.value});arSelection.value=[];apSelection.value=[];rowRemarks.value={};ElMessage.success(approved?'审批通过':'审批拒绝')}catch(error){ElMessage.error(error.message)}
}
function startAdjustment(row) {
  if(!row)return
  sourceId.value=row.id;adjustmentId.value='';adjustmentSource.value=cloneCost(row)
  adjustmentDraft.value={...costDraft(state,row.direction,row),status:'新建',createdAt:'',childNo:'',responsibleId:'',adjustmentReason:'',adjustmentType:'',attachments:[],adjustmentNo:''}
  initial.value=JSON.stringify(adjustmentDraft.value);attempted.value=false;failure.value='';unchanged=capture(state.costs.find(item=>item.id===row.id))
}
function editAdjustment(row) {
  sourceId.value=row.sourceId;adjustmentId.value=row.id;adjustmentSource.value=cloneCost(row.sourceSnapshot);adjustmentDraft.value=cloneCost(row)
  initial.value=JSON.stringify(adjustmentDraft.value);attempted.value=false;failure.value='';unchanged=capture(state.orderCostBook.adjustments.find(item=>item.id===row.id))
}
async function saveAdjustment(submit) {
  attempted.value=true;if(Object.keys(formErrors.value).length)return
  if(submit&&!await confirm(`保存并提交调整单？${fxWarnings([adjustmentDraft.value]).join('\n')}`,'提交调整单'))return
  try{if(!unchanged())throw new Error('原始记录或权限已变化，请重新打开');data.saveCostAdjustment(sourceId.value,adjustmentId.value,adjustmentDraft.value,submit);adjustmentDraft.value=null;choosingSource.value=false;selection.value=[];ElMessage.success(submit?'调整单已提交':'调整单已保存')}catch(error){failure.value=error.message}
}
async function removeAdjustment(row) {
  if(!await confirm(`删除调整单 ${row.adjustmentNo}？`,'删除调整单',state.orderCostBook.adjustments.find(item=>item.id===row.id)))return
  try{data.deleteCostAdjustment(row.id);ElMessage.success('调整单已删除')}catch(error){ElMessage.error(error.message)}
}
function exportRows(selectedOnly) {
  const rows=selectedOnly?selection.value:filteredRows.value
  if(!rows.length)return ElMessage.warning('没有可导出的明细')
  const url=URL.createObjectURL(new Blob([costCsv(rows)],{type:'text/csv;charset=utf-8'})),anchor=document.createElement('a')
  anchor.href=url;anchor.download=`订单成本明细-${selectedOnly?'勾选':'查询'}-20260908.csv`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);ElMessage.success(`已导出 ${rows.length} 条明细`)
}
function prepareExamples(){try{data.loadOrderCostExamples();ElMessage.success('结算演示数据已就绪')}catch(error){ElMessage.error(error.message)}}
onBeforeRouteLeave(leave);onBeforeRouteUpdate(leave)
const unload=event=>{if(dirty.value){event.preventDefault();event.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',unload))
onBeforeUnmount(()=>{alive=false;window.removeEventListener('beforeunload',unload)})
</script>

<template>
  <div class="module-view order-cost-view">
    <PageHeader :title="order?(adjustment?'调整单审批':tab==='approvals'?'订单成本审批':tab==='summary'?'订单成本查询':'订单成本维护'):'订单成本管理'">
      <template #actions><el-button v-if="canReadModule('reconciliation')" :icon="Check" @click="router.push({path:'/finance/reconciliation',query:{tab:'pending'}})">进入对账</el-button><el-button v-if="order" :icon="Back" @click="navigate(tab)">返回列表</el-button><template v-else><el-button :icon="Refresh" @click="prepareExamples">准备结算演示数据</el-button><el-button :icon="View" @click="issues=!issues">待确认规则</el-button></template></template>
    </PageHeader>
    <el-alert v-if="issues" title="待确认：押金/税金属性、税率默认与结算单位范围、工作日历、调整单最终生效、重复种类及附件边界（185～192）。" type="warning" :closable="false"/>
    <el-alert v-if="failure&&!editDraft&&!adjustmentDraft" :title="failure" type="error" @close="failure=''"/>
    <el-alert v-if="route.query.order&&!order" title="订单不可用，可能尚未准备演示数据或缺少完成及主体信息。" type="warning" :closable="false"/>
    <el-alert v-if="route.query.adjustment&&!adjustment" title="调整单不存在、已删除或不属于当前订单，无法审批。" type="warning" :closable="false"/>
    <template v-if="!order">
      <el-tabs :model-value="tab" @update:model-value="switchTab"><el-tab-pane v-for="item in tabs" :key="item.id" :label="item.label" :name="item.id"/></el-tabs>
      <div v-if="choosingSource" class="section-heading"><h2>选择原始结算明细</h2><el-button :icon="Back" @click="choosingSource=false;selection=[];query={}">返回调整单</el-button></div>
      <OrderCostFilters :key="mode" :mode="mode" @query="query=$event;selection=[]"/>
      <DataTableFrame :key="pagerKey" :rows="filteredRows" :page-size="50" :page-sizes="[50]" :selected-count="selection.length" :selectable="tab==='details'||choosingSource">
        <template #actions><template v-if="tab==='adjustments'&&canEdit"><el-button v-if="!choosingSource" :icon="Plus" type="primary" @click="choosingSource=true;query={};selection=[]">新增调整单</el-button><el-button v-else :icon="Plus" type="primary" :disabled="selection.length!==1" title="一次选择一条原始结算明细；多行组单规则待确认" @click="startAdjustment(selection[0])">录入调整单</el-button></template><template v-if="tab==='details'"><el-button :icon="Download" :disabled="!selection.length" @click="exportRows(true)">导出勾选</el-button><el-button :icon="Download" :disabled="!filteredRows.length" @click="exportRows(false)">导出查询结果</el-button></template></template>
        <template #default="{rows:pageRows}">
          <OrderCostLines v-if="tab==='details'||choosingSource" :rows="pageRows" identity audit selectable @select="selection=$event" @view="viewed=$event"/>
          <el-table v-else-if="tab==='adjustments'" :data="pageRows" row-key="id" aria-label="调整单列表">
            <el-table-column prop="adjustmentNo" label="调整单号" min-width="205" fixed="left"/><el-table-column label="状态" min-width="150"><template #default="{row}"><StatusTag :label="row.status"/></template></el-table-column>
            <el-table-column v-for="[key,label,width] in [...COST_IDENTITY_COLUMNS,...COST_COLUMNS.filter(([key])=>!['status','approvalRemark'].includes(key))]" :key="key" :prop="key" :label="label" :min-width="width"/>
            <el-table-column prop="createdBy" label="创建人" min-width="140"/><el-table-column prop="createdAt" label="创建日期" min-width="180"/>
            <el-table-column label="操作" width="280" fixed="right"><template #default="{row}"><el-button link type="primary" :icon="View" @click="viewed=row">查看</el-button><template v-if="canEdit&&COST_EDITABLE.includes(row.status)"><el-button link type="primary" :icon="Edit" @click="editAdjustment(row)">编辑</el-button><el-button link type="primary" :icon="Check" @click="submitCosts([row],true)">提交</el-button><el-button link type="danger" :icon="Delete" @click="removeAdjustment(row)">删除</el-button></template></template></el-table-column>
          </el-table>
          <el-table v-else :data="pageRows" row-key="id" aria-label="订单成本列表">
            <el-table-column v-if="tab==='approvals'" prop="documentType" label="单据类型" width="120"/><el-table-column :prop="tab==='approvals'?'documentNo':'orderNo'" :label="tab==='approvals'?'待审批单号':'订单号'" min-width="205" fixed="left"/>
            <el-table-column v-if="tab==='orders'" prop="businessType" label="业务类型" min-width="150"/><el-table-column prop="customer" label="客户" min-width="170"/><el-table-column prop="creator" label="创建人" width="110"/><el-table-column prop="businessDate" label="业务日期" width="125"/>
            <el-table-column v-if="tab==='orders'" label="截止录入日期" min-width="160"><template #default>工作日历待确认</template></el-table-column><template v-else><el-table-column v-for="[key,label] in [['receivable','应收合计(CNY)'],['payable','应付合计(CNY)'],['profit','利润合计(CNY)']]" :key="key" :label="label" min-width="165"><template #default="{row}">{{money(row[key])}}</template></el-table-column></template>
            <el-table-column v-if="tab==='approvals'" prop="submittedAt" label="提交日期" min-width="185"/><el-table-column v-if="tab==='approvals'" label="审批期限" min-width="160"><template #default>工作日历待确认</template></el-table-column><el-table-column prop="billNo" label="提单号" min-width="160"/><el-table-column v-if="tab==='orders'" prop="approvalRemark" label="审批备注" min-width="220"/>
            <el-table-column label="操作" width="115" fixed="right"><template #default="{row}"><el-button link type="primary" @click="navigate(tab,row)">{{tab==='approvals'?(approvalStage?'审批':'查看'):tab==='orders'&&canEnter?'成本编辑':'查看'}}</el-button></template></el-table-column>
          </el-table>
        </template>
      </DataTableFrame>
    </template>
    <template v-else>
      <OrderCostFacts :entries="[...COST_IDENTITY_COLUMNS.map(([key,label])=>[label,order[key]]),['业务类型',order.businessType],...(adjustment?[['调整单号',adjustment.adjustmentNo]]:[])]"/>
      <div class="cost-totals"><div v-for="[key,label] in [['receivable','应收合计(CNY)'],['payable','应付合计(CNY)'],['profit','利润合计(CNY)']]" :key="key"><span>{{label}}</span><strong>{{money(totals[key])}}</strong></div></div>
      <template v-if="tab==='approvals'">
        <el-alert v-if="adjustment" title="调整单财务通过后的金额生效口径待确认（188）；原始结算行保持不变。" type="warning" :closable="false"/>
        <el-form label-position="top"><el-form-item label="整单审批备注"><el-input v-model="orderRemark" :readonly="!approvalStage" type="textarea" :rows="2" maxlength="200" show-word-limit aria-label="整单审批备注"/></el-form-item></el-form>
        <div class="approval-tools"><el-select v-model="directionFilter" clearable placeholder="全部成本属性" aria-label="审批成本属性"><el-option v-for="value in ['应收','应付']" :key="value" :value="value"/></el-select><el-select v-model="childDimension" aria-label="子单维度"><el-option value="全部" label="全部子单"/><el-option v-for="value in [...new Set((adjustment?[adjustment]:costLines).map(row=>row.childNo))]" :key="value" :value="value"/></el-select><span class="selection-count">已选 {{selected.length}} 条</span><el-button v-if="approvalStage" :icon="Check" type="primary" :disabled="!selected.length||(!!adjustment&&workbenchSession.personaId==='financeAccountant')" @click="review(true)">审批通过</el-button><el-button v-if="approvalStage" :icon="Close" :disabled="!selected.length" @click="review(false)">审批拒绝</el-button></div>
        <OrderCostLines :key="directionFilter+childDimension+approvalStage" :rows="detailLines" :selectable="!!approvalStage" :select-row="canReview" approval :remarks="rowRemarks" @select="arSelection=$event;apSelection=[]" @view="viewed=$event"/>
        <template v-if="adjustment"><h2>原始结算明细</h2><OrderCostLines :rows="[adjustment.sourceSnapshot]" @view="viewed=$event"/></template>
      </template>
      <template v-else>
        <div v-if="tab==='orders'&&canEnter" class="maintenance-actions"><span>已选 {{selected.length}} 条</span><el-button :icon="Check" type="primary" :disabled="!selected.length" @click="submitCosts(selected)">提交审批</el-button></div>
        <section v-for="direction in ['应收','应付']" :key="direction" class="cost-section"><div class="section-heading"><h2>{{direction}}成本</h2><el-button v-if="tab==='orders'&&canEnter" :icon="Plus" @click="addLine(direction)">{{'新增'+direction}}</el-button></div>
          <OrderCostLines :key="direction+workbenchSession.personaId" :rows="direction==='应收'?receivableLines:payableLines" compact :editable="tab==='orders'&&canEdit" :selectable="tab==='orders'&&canEnter" :select-row="canSubmit" @select="direction==='应收'?arSelection=$event:apSelection=$event" @edit="openEdit" @delete="removeCost" @view="viewed=$event"/>
          <div v-for="item in drafts.filter(item=>item.row.direction===direction)" :key="item.key" class="draft-line"><div class="section-heading"><h3>{{direction}}新增行 {{item.key}}</h3><el-button :icon="Delete" text type="danger" :aria-label="'删除新增行'+item.key" @click="discardLine(item)"/></div><OrderCostFields :draft="item.row" :order="order" :state="state" :show-errors="item.attempted" @busy="uploading=$event"/><div class="draft-actions"><el-button :icon="Check" type="primary" :disabled="uploading||!canEnter" @click="saveLine(item)">保存该行</el-button></div></div>
        </section>
      </template>
      <section v-if="state.orderCostBook.syncEvents.some(row=>row.orderId===order.id)" class="cost-section"><h2>金蝶同步记录</h2><el-table :data="state.orderCostBook.syncEvents.filter(row=>row.orderId===order.id)"><el-table-column prop="costId" label="成本行" min-width="180"/><el-table-column prop="documentType" label="目标单据"/><el-table-column prop="postingDate" label="记账日期"/><el-table-column prop="status" label="同步状态"/><el-table-column label="外部单号"><template #default>未连接金蝶</template></el-table-column></el-table></section>
      <section v-if="state.orderCostBook.notices.some(row=>row.orderId===order.id)" class="cost-section"><h2>通知记录</h2><el-table :data="state.orderCostBook.notices.filter(row=>row.orderId===order.id)"><el-table-column prop="event" label="事件" min-width="180"/><el-table-column label="接收岗位/人员" min-width="180"><template #default="{row}">{{WORKBENCH_PERSONAS.find(persona=>persona.id===row.recipient)?.label||row.recipient}}</template></el-table-column><el-table-column prop="time" label="时间" min-width="180"/><el-table-column prop="channel" label="渠道状态" min-width="260"/></el-table></section>
    </template>
    <el-dialog :model-value="!!editDraft||!!adjustmentDraft" :title="editDraft?'编辑订单成本':adjustmentId?'编辑调整单':'新增调整单'" width="min(1160px,96vw)" :close-on-click-modal="false" :before-close="closeDialog" destroy-on-close>
      <el-alert v-if="failure" :title="failure" type="error" :closable="false"/><template v-if="editOrder&&(editDraft||adjustmentDraft)"><OrderCostFacts :entries="[...COST_IDENTITY_COLUMNS.map(([key,label])=>[label,editOrder[key]]),['状态',(editDraft||adjustmentDraft).status||'新建']]"/>
        <OrderCostFields :key="editId+adjustmentId+sourceId" :draft="editDraft||adjustmentDraft" :order="editOrder" :state="state" :adjustment="!!adjustmentDraft" :existing="!!editDraft||!!adjustmentId" :show-errors="attempted" @busy="uploading=$event"/><template v-if="adjustmentDraft"><h3>原始结算明细</h3><OrderCostLines :rows="[adjustmentSource]" @view="viewed=$event"/></template>
      </template><template #footer><el-button @click="closeDialog">取消</el-button><el-button type="primary" :icon="Check" :disabled="uploading||!canEdit" @click="editDraft?saveEdit():saveAdjustment(false)">保存</el-button><el-button v-if="adjustmentDraft" type="primary" :disabled="uploading||!canEdit" @click="saveAdjustment(true)">保存并提交</el-button></template>
    </el-dialog>
    <el-dialog :model-value="!!viewed" title="结算明细" width="min(1040px,95vw)" append-to-body @close="viewed=null"><template v-if="viewed"><OrderCostFacts :entries="[...COST_IDENTITY_COLUMNS,...COST_COLUMNS,...COST_AUDIT_COLUMNS].map(([key,label])=>[label,viewed[key]])"/><OrderCostFacts v-if="viewed.adjustmentNo" :entries="[['调整单号',viewed.adjustmentNo],['责任人',state.orderCostBook.users.find(row=>row.id===viewed.responsibleId)?.name],['调账种类',viewed.adjustmentType],['调账原因',viewed.adjustmentReason]]"/><h3>附件</h3><OrderCostAttachments :model-value="viewed.attachments" readonly/><h3>操作记录</h3><el-table :data="viewed.history||[]"><el-table-column prop="action" label="操作"/><el-table-column prop="actor" label="操作人"/><el-table-column prop="time" label="时间" min-width="180"/><el-table-column prop="remark" label="审批备注"/></el-table><template v-if="viewed.sourceSnapshot"><h3>原始结算明细</h3><OrderCostLines :rows="[viewed.sourceSnapshot]" @view="viewed=$event"/></template></template></el-dialog>
  </div>
</template>
<style scoped>
.order-cost-view{min-width:0;container-type:inline-size}.order-summary{margin-top:16px}.cost-totals{display:flex;flex-wrap:wrap;gap:20px 48px;padding:20px 0;border-bottom:1px solid var(--border);margin-bottom:20px}.cost-totals>div{display:flex;flex-direction:column;gap:7px;min-width:170px}.cost-totals span{font-size:13px;color:var(--muted)}.cost-totals strong{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:18px 0 12px;flex-wrap:wrap}h2{font-size:16px;font-weight:600;margin:0}h3{font-size:14px;font-weight:600}.cost-section{padding:6px 0 20px;border-bottom:1px solid var(--border)}.draft-line{border-top:1px dashed var(--border);margin-top:20px;padding-top:4px}.draft-actions,.maintenance-actions{display:flex;justify-content:flex-end;align-items:center;gap:12px}.approval-tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0}.approval-tools .el-select{width:200px}.approval-tools .el-button{margin:0}.selection-count{color:var(--muted);font-size:13px}.el-alert{margin-block:12px}.el-descriptions{margin-bottom:20px}:deep(.el-descriptions__content){overflow-wrap:anywhere}:deep(.el-dialog__footer){display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}:deep(.el-dialog__footer .el-button){margin:0}@container(max-width:600px){.cost-totals{gap:16px}.cost-totals strong{font-size:18px}.approval-tools .el-select{width:100%}}
</style>
