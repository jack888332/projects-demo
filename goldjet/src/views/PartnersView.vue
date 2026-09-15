<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import PartnerRecordFields from '../components/PartnerRecordFields.vue'
import PartnerAttachments from '../components/PartnerAttachments.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { createPartnerDraft, normalizePartner, getPartnerLockedFields, getPartnerPermissions, validatePartnerDraft, validateCreditAmount, getPartnerCreditHistory } from '../domain/partnerOperations.js'
import { partnerAddress, partnerTerm } from '../domain/partnerPresentation.js'

const route = useRoute(), router = useRouter()
const data = usePrototypeData()
const { state, partnerSession, savePartner, submitPartner, reviewPartner, setPartnerActive, deletePartner, submitPartnerCredit, reviewPartnerCredit, deletePartnerCredit } = data
const copy = value => JSON.parse(JSON.stringify(value))
const type = ref('客户')
const defaults = () => ({ code:'', codeFrom:'', codeTo:'', name:'', expiry:'', signedContract:'', creditFrom:'', creditTo:'', paymentDays:'', taxRate:'', status:'', department:'', updatedBy:'', dates:[], creditApproval:'' })
const pending = reactive(defaults()), filters = reactive(defaults())
const search = () => Object.assign(filters, copy(pending))
function resetFilters() { Object.assign(pending, defaults()); search() }
const mode = computed(() => String(route.query.mode || 'list'))
const selected = computed(() => state.partners.find(item => item.id === route.query.partner))
const draft = reactive(createPartnerDraft('客户'))
const initial = ref(''), submitted = ref(false), errorMessage = ref('')
const approvalRemark = ref(''), logsVisible = ref(false), busy = ref(false)
const permissions = partner => getPartnerPermissions(partner, partnerSession.value.role)
const editing = computed(() => ['create', 'edit'].includes(mode.value))
const locked = computed(() => mode.value === 'edit' ? getPartnerLockedFields(selected.value) : [])
const fieldErrors = computed(() => submitted.value ? validatePartnerDraft(draft, state.partners, { existing:mode.value === 'edit' ? selected.value : null, organizationNames:state.organizationNames, department:selected.value?.department || partnerSession.value.department }) : {})
const rows = computed(() => state.partners.filter(partner => {
  const f = filters, includes = (value, query) => !query || String(value || '').toLowerCase().includes(query.toLowerCase())
  const dates = f.dates || [], date = (type.value === '客户' ? partner.createdAt : partner.updatedAt)?.slice(0,10) || ''
  const needsCredit = state.creditApplications.some(row => row.partnerId === partner.id && row.status === '已提交')
  return partner.status !== '已删除' && partner.type === type.value
    && includes(partner.name,f.name) && includes(partner.updatedBy,f.updatedBy)
    && (type.value !== '供应商' || includes(partner.code,f.code))
    && (type.value !== '客户' || (!f.codeFrom || partner.code >= f.codeFrom) && (!f.codeTo || partner.code <= f.codeTo))
    && (!f.status || partner.status === f.status) && (!f.department || partner.department === f.department)
    && (!f.signedContract || partner.signedContract === f.signedContract)
    && (f.taxRate === '' || f.taxRate == null || Number(partner.taxRate) === Number(f.taxRate))
    && (f.paymentDays === '' || String(partner.paymentDays) === String(f.paymentDays))
    && (f.creditFrom === '' || Number(partner.creditLimit) >= Number(f.creditFrom))
    && (f.creditTo === '' || Number(partner.creditLimit) <= Number(f.creditTo))
    && (!f.creditApproval || needsCredit === (f.creditApproval === '是'))
    && (!f.expiry || (f.expiry === '已到期' ? !partner.longTerm && partner.businessExpiry && partner.businessExpiry < '2026-09-08' : partner.longTerm || partner.businessExpiry > '2026-09-08'))
    && (!dates.length || date >= dates[0] && date <= dates[1])
}).sort((a,b) => a.code.localeCompare(b.code)))
const applications = computed(() => state.creditApplications.filter(row => row.partnerId === selected.value?.id && row.status !== '已删除').slice().reverse())
const creditDraft = reactive({ amount:null, attachments:[] })
const creditInitial = ref('')
const editingCreditId = ref('')
const creditReviewId = ref('')
const creditReview = computed(() => state.creditApplications.find(row => row.id === creditReviewId.value))
const approvedAmount = ref(null)
const creditError = computed(() => Object.values(validateCreditAmount(creditDraft.amount, selected.value?.creditLimit || 0))[0] || '')
const history = computed(() => getPartnerCreditHistory(selected.value,state.creditApplications))

function go(nextMode='list', partner) {
  router.push({ path:'/foundation/partners', query:{ type:type.value, ...(nextMode !== 'list' ? {mode:nextMode} : {}), ...(partner ? {partner:partner.id} : {}) } })
}
async function allowDiscard() {
  const dirty = editing.value && JSON.stringify(draft) !== initial.value || mode.value === 'credit' && JSON.stringify(creditDraft) !== creditInitial.value
  if (!dirty) return true
  try { await ElMessageBox.confirm('尚未保存的资料将丢弃。','离开当前编辑？',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑',type:'warning'}); return true } catch { return false }
}
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(allowDiscard)
watch(() => [route.query.mode, route.query.partner, route.query.type, route.query.application], () => {
  if (['客户','供应商'].includes(route.query.type)) type.value = route.query.type
  submitted.value = false; errorMessage.value = ''; approvalRemark.value = ''; creditReviewId.value = ''; editingCreditId.value = ''
  const value = mode.value === 'create' ? createPartnerDraft(type.value) : selected.value ? normalizePartner(copy(selected.value)) : createPartnerDraft(type.value)
  for (const key of Object.keys(draft)) delete draft[key]
  Object.assign(draft,value); initial.value = JSON.stringify(draft)
  Object.assign(creditDraft,{amount:null,attachments:[]}); creditInitial.value = JSON.stringify(creditDraft)
  if (route.query.application) {
    creditReviewId.value = String(route.query.application)
    approvedAmount.value = creditReview.value?.amount ?? null
  }
}, { immediate:true })
watch(() => partnerSession.value.role, () => { initial.value = JSON.stringify(draft); creditInitial.value = JSON.stringify(creditDraft); go() })

async function confirmAction(title, message, action) {
  try {
    await ElMessageBox.confirm(message,title,{confirmButtonText:'确认'+title,cancelButtonText:'取消',type:'warning'})
    busy.value = true; action(); ElMessage.success(title+'成功')
  } catch(error) { if(error instanceof Error) { errorMessage.value=error.message; ElMessage.error(error.message) } }
  finally { busy.value=false }
}
async function save(submit) {
  submitted.value=true; errorMessage.value=''
  if (Object.keys(fieldErrors.value).length) { errorMessage.value='请修正下方字段后再保存'; return }
  await confirmAction(submit ? '提交审批' : '保存档案', '确认'+(submit ? '保存并提交' : '保存')+' '+draft.type+'「'+draft.name+'」？', () => {
    const record=savePartner(copy(draft),{submit}); initial.value=JSON.stringify(draft); go('detail',record)
  })
}
function rowAction(record,action) {
  if (['edit','detail','approve','credit'].includes(action)) { go(action,record); return }
  const labels={submit:'提交审批',deactivate:'失效',activate:'启用',delete:'删除'}
  confirmAction(labels[action], '确认对 '+record.code+' · '+record.name+' 执行'+labels[action]+'？仅影响本地演示数据。', () => {
    if(action==='submit') submitPartner(record.id)
    if(action==='deactivate' || action==='activate') setPartnerActive(record.id,action==='activate')
    if(action==='delete') deletePartner(record.id)
  })
}
function approve() { confirmAction('审批通过','确认通过 '+selected.value.name+' 的申请并使其生效？',() => {reviewPartner(selected.value.id,{approved:true,remark:approvalRemark.value}); go('detail',selected.value)}) }
function matchCreditCode() {
  if(mode.value !== 'create' || !draft.creditCode) return
  const match=state.partners.filter(p => p.creditCode === draft.creditCode && p.status !== '已删除').sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0]
  if(!match) return
  if(draft.type === '供应商') { errorMessage.value='匹配到已有档案，但供应商匹配字段是否允许修改存在冲突；当前匹配复制路径待确认，可查看已有档案。'; return }
  const identity={type:draft.type,department:draft.department,creditCode:draft.creditCode}
  Object.assign(draft,normalizePartner(copy(match)),identity,{id:'',code:'',status:'新建'})
  draft.banks.forEach(row=>delete row.id); draft.contacts.forEach(row=>delete row.id)
  ElMessage.info('已带出最近一条合作方资料；保存时仍校验本组织客户是否重复')
}
function submitCredit() {
  if(creditError.value) return ElMessage.warning(creditError.value)
  confirmAction('提交额度申请','本次申请 '+Number(creditDraft.amount).toFixed(2)+'，预计总额度 '+(Number(selected.value.creditLimit || 0)+Number(creditDraft.amount)).toFixed(2)+'。',()=>{
    submitPartnerCredit(selected.value.id,copy(creditDraft),{applicationId:editingCreditId.value || undefined}); creditInitial.value=JSON.stringify(creditDraft); go('detail',selected.value)
  })
}
function editRejectedCredit(application) { editingCreditId.value=application.id; Object.assign(creditDraft,{amount:application.amount,attachments:copy(application.attachments)}); creditInitial.value=JSON.stringify(creditDraft); ElMessage.info('已载入上方额度申请表，请修改后重新提交') }
function deleteRejectedCredit(application) { confirmAction('删除额度申请','确认删除 '+application.id+'？不会改变已生效额度。',()=>deletePartnerCredit(application.id)) }
function reviewCredit(approved) {
  confirmAction(approved?'额度审批通过':'额度审批拒绝',approved?'批复额度 '+Number(approvedAmount.value).toFixed(2)+'，审批后同步客户授信。':'拒绝该额度申请，不改变现有额度。',()=>{
    reviewPartnerCredit(creditReview.value.id,{approved,amount:approvedAmount.value,remark:approvalRemark.value}); creditReviewId.value=''
  })
}
async function closeCredit(done) {
  if(creditReview.value && (approvalRemark.value || approvedAmount.value !== creditReview.value.amount)) {
    try { await ElMessageBox.confirm('尚未提交的批复额度和意见将丢弃。','关闭额度审批？',{confirmButtonText:'放弃修改',cancelButtonText:'继续审批'}); } catch { return }
  }
  creditReviewId.value=''; if(typeof done==='function') done()
}
</script>

<template>
  <div class="module-view partners-view">
    <PageHeader :title="mode === 'list' ? '合作方档案' : (mode === 'credit' ? '客户授信额度' : mode === 'create' ? '新增'+type : mode === 'edit' ? '编辑'+type : mode === 'approve' ? '审批'+type : type+'详情')" :description="'当前角色：'+partnerSession.label+' · '+partnerSession.name">
      <template #actions><el-button v-if="mode !== 'list'" @click="go()">返回列表</el-button><el-button v-else type="primary" :disabled="!permissions(null).create" @click="go('create')">新增{{ type }}</el-button></template>
    </PageHeader>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" show-icon class="partner-notice" />
    <template v-if="mode === 'list'">
      <el-tabs :model-value="type" @tab-change="value => { type=value; resetFilters(); go() }"><el-tab-pane label="我的客户" name="客户" /><el-tab-pane label="我的供应商" name="供应商" /></el-tabs>
      <form class="partner-filters" @submit.prevent="search">
        <label v-if="type === '供应商'">供应商编码<el-input v-model="pending.code" clearable /></label>
        <template v-else><label>客户编码从<el-input v-model="pending.codeFrom" clearable /></label><label>客户编码至<el-input v-model="pending.codeTo" clearable /></label></template>
        <label>{{ type }}名称<el-input v-model="pending.name" clearable /></label>
        <label>营业期限<el-select v-model="pending.expiry" clearable placeholder="全部"><el-option v-for="value in ['已到期','未到期']" :key="value" :value="value" /></el-select></label>
        <label>是否已签合同<el-select v-model="pending.signedContract" clearable placeholder="全部"><el-option v-for="value in ['是','否']" :key="value" :value="value" /></el-select></label>
        <template v-if="type === '客户'"><label>授信额度从<el-input v-model="pending.creditFrom" clearable /></label><label>授信额度至<el-input v-model="pending.creditTo" clearable /></label><label>额度审批<el-select v-model="pending.creditApproval" clearable placeholder="全部"><el-option value="是" /><el-option value="否" /></el-select></label></template>
        <label>账期（天）<el-input v-model="pending.paymentDays" clearable /></label>
        <label>税率（%）<el-select v-model="pending.taxRate" clearable placeholder="全部"><el-option v-for="value in [0,1,3,6,9,11]" :key="value" :value="value" :label="String(value)" /></el-select></label>
        <label>状态<el-select v-model="pending.status" clearable placeholder="全部"><el-option v-for="value in ['新建','已提交','已生效','已失效']" :key="value" :value="value" /></el-select></label>
        <label>创建部门<el-select v-model="pending.department" clearable placeholder="全部"><el-option v-for="value in state.partnerDepartments" :key="value" :value="value" /></el-select></label>
        <label>更新人<el-input v-model="pending.updatedBy" clearable /></label>
        <label class="partner-date">{{ type === '客户' ? '创建' : '更新' }}日期<el-date-picker v-model="pending.dates" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" /></label>
        <el-button type="primary" native-type="submit">查询</el-button><el-button @click="resetFilters">重置</el-button>
      </form>
      <DataTableFrame :rows="rows" :page-size="10" :page-sizes="[10]"><template #default="{rows:pageRows}">
        <el-table :data="pageRows" row-key="id" stripe aria-label="合作方档案列表">
          <el-table-column prop="code" :label="type+'编码'" width="120" fixed="left"><template #default="{row}"><el-button link type="primary" @click="go('detail',row)">{{ row.code }}</el-button></template></el-table-column>
          <el-table-column prop="name" :label="type+'名称'" min-width="190" />
          <el-table-column prop="creditCode" label="统一社会信用码" width="200" />
          <el-table-column label="公司地址" min-width="220"><template #default="{row}">{{ partnerAddress(row) }}</template></el-table-column>
          <el-table-column label="营业期限" width="120"><template #default="{row}">{{ partnerTerm(row) }}</template></el-table-column>
          <el-table-column prop="signedContract" label="是否已签合同" width="120" />
          <el-table-column v-if="type === '客户'" prop="creditLimit" label="授信额度" width="130" align="right" />
          <el-table-column prop="paymentDays" label="账期（天）" width="100" /><el-table-column prop="taxRate" label="税率（%）" width="100" />
          <el-table-column label="状态" width="110"><template #default="{row}"><StatusTag :label="row.status" /></template></el-table-column>
          <el-table-column prop="department" label="创建部门" min-width="145" /><el-table-column prop="updatedBy" label="更新人" width="120" /><el-table-column prop="updatedAt" label="更新日期" width="170" />
          <el-table-column label="操作" width="255" fixed="right"><template #default="{row}">
            <el-button link type="primary" @click="go('detail',row)">查看</el-button>
            <el-button v-if="permissions(row).edit" link type="primary" @click="rowAction(row,'edit')">编辑</el-button>
            <el-button v-if="permissions(row).submit" link type="primary" @click="rowAction(row,'submit')">提交</el-button>
            <el-button v-if="permissions(row).approve" link type="primary" @click="go('approve',row)">审批</el-button>
            <el-button v-if="permissions(row).requestCredit" link type="primary" @click="go('credit',row)">额度申请</el-button>
            <el-button v-if="row.type==='客户' && partnerSession.role==='finance'" link type="primary" @click="go('credit',row)">额度审批</el-button>
            <el-dropdown trigger="click" @command="action=>rowAction(row,action)"><el-button link type="primary">更多</el-button><template #dropdown><el-dropdown-menu>
              <el-dropdown-item command="deactivate" :disabled="!permissions(row).deactivate">失效</el-dropdown-item><el-dropdown-item command="activate" :disabled="!permissions(row).activate">启用</el-dropdown-item><el-dropdown-item command="delete" :disabled="!permissions(row).delete">删除</el-dropdown-item>
            </el-dropdown-menu></template></el-dropdown>
          </template></el-table-column>
        </el-table>
      </template></DataTableFrame>
    </template>
    <template v-else-if="mode === 'create' || selected">
      <div v-if="selected" class="partner-object"><strong>{{ selected.code }} · {{ selected.name }}</strong><StatusTag :label="selected.status" /><el-button @click="logsVisible=true">操作记录</el-button></div>
      <template v-if="mode !== 'credit'">
        <el-form label-position="top" @submit.prevent="save(false)">
          <PartnerRecordFields :model="draft" :readonly="!editing" :locked="locked" :errors="fieldErrors" @credit-code-change="matchCreditCode" />
          <PartnerAttachments :files="draft.attachments" :readonly="!editing" :error="fieldErrors.attachments" />
          <el-form-item v-if="mode==='approve'" label="审批备注"><el-input v-model="approvalRemark" type="textarea" maxlength="256" /></el-form-item>
        </el-form>
        <el-alert v-if="mode==='approve'" title="拒绝后的主状态在第003篇存在两种口径：新建＋审批拒绝、财务审批拒绝。此分支待确认，不模拟拒绝成功。" type="warning" :closable="false" class="partner-notice" />
        <div class="partner-actions">
          <el-button @click="go()">返回列表</el-button>
          <template v-if="editing"><el-button :disabled="busy" @click="save(false)">保存</el-button><el-button v-if="mode==='create' || permissions(selected).submit" type="primary" :disabled="busy" @click="save(true)">保存并提交审批</el-button></template>
          <el-button v-if="mode==='approve'" type="primary" :disabled="!permissions(selected).approve || busy" @click="approve">审批通过</el-button>
          <el-button v-if="mode==='detail' && permissions(selected).requestCredit" type="primary" @click="go('credit',selected)">额度申请</el-button>
        </div>
      </template>
      <template v-else>
        <el-descriptions title="客户信息" :column="2" border><el-descriptions-item label="境内外关系">{{ selected.relationship }}</el-descriptions-item><el-descriptions-item label="统一社会信用码">{{ selected.creditCode }}</el-descriptions-item><el-descriptions-item label="中文名称">{{ selected.name }}</el-descriptions-item><el-descriptions-item label="简称">{{ selected.shortName }}</el-descriptions-item><el-descriptions-item label="公司地址">{{ partnerAddress(selected) }}</el-descriptions-item><el-descriptions-item label="营业期限">{{ partnerTerm(selected) }}</el-descriptions-item><el-descriptions-item label="账期（天）">{{ selected.paymentDays }}</el-descriptions-item><el-descriptions-item label="原授信额度">{{ selected.creditLimit }}</el-descriptions-item></el-descriptions>
        <el-form v-if="permissions(selected).requestCredit" label-position="top" class="credit-form">
          <h3>{{ editingCreditId ? "重新提交额度申请 · "+editingCreditId : "新增额度申请" }}</h3><div class="credit-grid"><el-form-item label="本次申请额度" required :error="creditError"><el-input-number v-model="creditDraft.amount" :precision="2" :controls="false" aria-label="本次申请额度" /></el-form-item><el-form-item label="预计总额度"><strong>{{ creditDraft.amount == null ? '待填写' : (Number(selected.creditLimit || 0)+Number(creditDraft.amount)).toFixed(2) }}</strong></el-form-item></div>
          <PartnerAttachments :files="creditDraft.attachments" /><el-button type="primary" :disabled="!!creditError || busy" @click="submitCredit">提交额度申请</el-button>
        </el-form>
        <h3>额度申请记录</h3><DataTableFrame :rows="applications" :page-size="10" :page-sizes="[10]"><template #default="{rows:pageRows}"><el-table :data="pageRows" aria-label="额度申请记录"><el-table-column prop="id" label="申请编号" min-width="155" /><el-table-column prop="status" label="状态" min-width="135" /><el-table-column prop="amount" label="本次申请额度" width="135" align="right" /><el-table-column prop="creator" label="申请人" width="120" /><el-table-column prop="createdAt" label="申请日期" width="170" /><el-table-column prop="approvedAmount" label="本次批复额度" width="135" align="right" /><el-table-column label="操作" width="180"><template #default="{row}"><el-button v-if="row.status==='已提交' && partnerSession.role==='finance'" link type="primary" @click="creditReviewId=row.id; approvedAmount=row.amount; approvalRemark=''">审批</el-button><template v-if="row.status==='财务审批拒绝' && row.creator===partnerSession.name && partnerSession.role==='businessSupervisor'"><el-button link type="primary" @click="editRejectedCredit(row)">修改重提</el-button><el-button link type="danger" @click="deleteRejectedCredit(row)">删除</el-button></template></template></el-table-column></el-table></template></DataTableFrame>
        <h3>历史额度（已审批通过）</h3><DataTableFrame :rows="history" :page-size="10" :page-sizes="[10]"><template #default="{rows:pageRows}"><el-table :data="pageRows" aria-label="历史额度">
          <el-table-column v-for="[key,label] in [['department','额度申请部门'],['originalAmount','原授信额度'],['amount','申请额度'],['creator','申请人'],['createdAt','申请日期'],['approvedAmount','批复额度'],['approvedBy','批复人'],['approvedAt','批复日期'],['decision','批复意见'],['remark','备注']]" :key="key" :prop="key" :label="label" :min-width="key.endsWith('At') ? 170 : 135" />
        </el-table></template></DataTableFrame>
      </template>
    </template>
    <el-empty v-else description="该合作方不存在，请返回列表重新选择" />
    <el-dialog v-model="logsVisible" title="操作记录" width="min(850px,96vw)" align-center><el-table :data="selected?.history?.slice().reverse() || []"><el-table-column prop="actor" label="操作人" width="125" /><el-table-column prop="time" label="操作日期" width="175" /><el-table-column prop="action" label="动作" width="110" /><el-table-column prop="remark" label="备注" min-width="220" /></el-table></el-dialog>
    <el-dialog :model-value="!!creditReviewId" title="客户额度审批" width="min(760px,96vw)" :close-on-click-modal="false" :before-close="closeCredit">
      <template v-if="creditReview"><p>{{ selected?.name }} · {{ creditReview.id }}</p><el-descriptions :column="2"><el-descriptions-item label="原授信额度">{{ selected?.creditLimit }}</el-descriptions-item><el-descriptions-item label="本次申请额度">{{ creditReview.amount }}</el-descriptions-item><el-descriptions-item label="预计总额度">{{ Number(selected?.creditLimit || 0)+creditReview.amount }}</el-descriptions-item><el-descriptions-item label="实际总额度">{{ Number(selected?.creditLimit || 0)+Number(approvedAmount || 0) }}</el-descriptions-item></el-descriptions>
      <el-form label-position="top"><el-form-item label="本次批复额度" required><el-input-number v-model="approvedAmount" :precision="2" :controls="false" /></el-form-item><el-form-item label="备注"><el-input v-model="approvalRemark" type="textarea" maxlength="240" /></el-form-item></el-form><PartnerAttachments :files="creditReview.attachments" readonly /></template>
      <template #footer><el-button @click="closeCredit">取消</el-button><el-button :disabled="busy || partnerSession.role!=='finance' || creditReview?.status!=='已提交'" type="danger" @click="reviewCredit(false)">审批拒绝</el-button><el-button :disabled="busy || partnerSession.role!=='finance' || creditReview?.status!=='已提交'" type="primary" @click="reviewCredit(true)">审批通过</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.partner-notice { margin-bottom:16px; }
.partner-filters { display:flex; flex-wrap:wrap; align-items:end; gap:12px; margin-bottom:20px; }
.partner-filters label { width:180px; display:flex; flex-direction:column; gap:8px; color:var(--muted); }
.partner-filters .partner-date { width:320px; }
.partner-filters :deep(.el-date-editor) { width:100%; }
.partner-object { display:flex; flex-wrap:wrap; align-items:center; gap:16px; margin-bottom:24px; }
.partner-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:12px; padding:16px 0; border-top:1px solid var(--border); }
.credit-form { margin:24px 0; }
.credit-grid { display:flex; flex-wrap:wrap; gap:24px; }
h3 { font-size:16px; margin-top:24px; }
</style>
