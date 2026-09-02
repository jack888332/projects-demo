<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import { useDemoDataset } from '../data/useDemoDataset.js'

const props = defineProps({
  bill: { type: Object, required: true },
  isReceivable: { type: Boolean, required: true },
})
const emit = defineEmits(['submit'])
const visible = ref(false)
const step = ref(0)
const form = reactive({ reason: '', dataCutoff: '2026-08-02 10:30:00', newConfig: 'CURRENT', switchAt: '2026-08-03 00:00:00' })

const candidateFeeRows = useDemoDataset('billingGenerationCandidateFees', [
  { id: 'GF-AR-001', billType: 'AR', selected: true, fee: '派送附加费', businessNo: 'PF607701342355197952', sourceAt: '2026-08-02 08:42', currency: 'CNY', amount: 18, reason: '期末补录' },
  { id: 'GF-AR-002', billType: 'AR', selected: true, fee: '仓储费', businessNo: 'PF607701343168892928', sourceAt: '2026-08-02 09:15', currency: 'CNY', amount: 22, reason: '延迟同步' },
  { id: 'GF-AR-003', billType: 'AR', selected: false, fee: '操作费', businessNo: 'PF607701344225857536', sourceAt: '2026-08-02 09:32', currency: 'CNY', amount: 18, reason: '待财务确认' },
  { id: 'GF-RF-001', billType: 'RF', selected: true, fee: '应返货款', businessNo: 'SO-260721-004326', sourceAt: '2026-08-02 08:56', currency: 'CNY', amount: 1260, reason: '新增签收包裹' },
  { id: 'GF-RF-002', billType: 'RF', selected: true, fee: '代收服务费', businessNo: 'SO-260721-004326', sourceAt: '2026-08-02 08:56', currency: 'CNY', amount: -42, reason: '随包裹归集' },
])
const replacementOptions = useDemoDataset('billingReplacementOptions', [
  { billType: 'AR', value: 'ARB-SCHEME-20260701-02-v11', label: 'V11 · 7天账期 · 新版费项币种规则', state: '待生效', effect: '2026-08-03 至长期' },
  { billType: 'AR', value: 'ARB-SCHEME-20260701-02-v12', label: 'V12 · 周账期 · 台湾线路分支', state: '已生效', effect: '2026-08-01 至长期' },
  { billType: 'RF', value: 'RFB-SCHEME-20260701-02-v5', label: 'V5 · 周账期 · 回款返款', state: '待生效', effect: '2026-08-03 至长期' },
  { billType: 'RF', value: 'RFB-SCHEME-20260701-02-v6', label: 'V6 · 半周账期 · 签收返款', state: '已生效', effect: '2026-08-01 至长期' },
])
const replacementPreviewRows = useDemoDataset('billingReplacementPreview', [
  { billType: 'AR', side: 'OLD', billNo: 'ARB-OG0370-20260707-81FF', group: '默认业务板块 / 台湾', config: 'V10', currency: 'CNY', amount: 3096.09, feeCount: 14, state: '待审核 · 已收口' },
  { billType: 'AR', side: 'NEW', billNo: '候选-01', group: '默认业务板块 / 台湾', config: 'V11', currency: 'CNY', amount: 2984.09, feeCount: 13, state: '候选账单' },
  { billType: 'AR', side: 'NEW', billNo: '候选-02', group: '增值业务板块 / 台湾', config: 'V11', currency: 'CNY', amount: 130, feeCount: 2, state: '候选账单' },
  { billType: 'RF', side: 'OLD', billNo: 'PCB-OG0370-20260721-0a19', group: '台湾 / 周账期', config: 'V4', currency: 'CNY', amount: 88620, feeCount: 2, state: '待审核 · 未收口' },
  { billType: 'RF', side: 'NEW', billNo: '候选-01', group: '台湾 / 周账期', config: 'V5', currency: 'CNY', amount: 87360, feeCount: 3, state: '候选账单' },
])

const money = (value) => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const billType = computed(() => props.isReceivable ? 'AR' : 'RF')
const currentConfigLabel = computed(() => props.bill.configNo || `${props.isReceivable ? 'ARB' : 'RFB'}-SCHEME`)
const currentConfigVersion = computed(() => props.bill.configVersion || (props.isReceivable ? 'V10' : 'V4'))
const currentResultVersion = computed(() => props.bill.resultVersion || 'RV-20260801-0018')
const candidateFees = computed(() => candidateFeeRows.value.filter((row) => row.billType === billType.value))
const selectedCandidateFees = computed(() => candidateFees.value.filter((row) => row.selected))
const candidateAmount = computed(() => selectedCandidateFees.value.reduce((sum, row) => sum + row.amount, 0))
const generationConfigOptions = computed(() => [
  { value: 'CURRENT', label: `${currentConfigVersion.value} · 沿用当前账单配置`, state: '当前账单配置', effect: '保持现有口径' },
  ...replacementOptions.value.filter((row) => row.billType === billType.value),
])
const selectedReplacementOption = computed(() => generationConfigOptions.value.find((row) => row.value === form.newConfig))
const mayReplaceExistingBills = computed(() => form.newConfig !== 'CURRENT')
const replacementOldRows = computed(() => replacementPreviewRows.value.filter((row) => row.billType === billType.value && row.side === 'OLD').map((row) => ({
  ...row,
  billNo: props.bill.billNo,
  group: props.isReceivable ? `${props.bill.sector} / ${props.bill.country}` : `${props.bill.country} / ${props.bill.periodType}账期`,
  config: currentConfigVersion.value,
  currency: props.bill.currency,
  amount: Number(props.bill.amount || 0),
})))
const replacementNewRows = computed(() => {
  const rows = replacementPreviewRows.value.filter((row) => row.billType === billType.value && row.side === 'NEW')
  const oldAmount = Number(props.bill.amount || 0)
  return rows.map((row, index) => ({
    ...row,
    config: selectedReplacementOption.value?.label.match(/^V\d+/)?.[0] || row.config,
    currency: props.bill.currency,
    amount: props.isReceivable ? (index === 0 ? Number((oldAmount * 0.96).toFixed(2)) : Number((oldAmount * 0.04 + 18).toFixed(2))) : Number(Math.max(oldAmount - 1260, 0).toFixed(2)),
  }))
})
const replacementOldAmount = computed(() => replacementOldRows.value.reduce((sum, row) => sum + row.amount, 0))
const replacementNewAmount = computed(() => replacementNewRows.value.reduce((sum, row) => sum + row.amount, 0))

function open() {
  step.value = 0
  form.reason = ''
  form.dataCutoff = '2026-08-02 10:30:00'
  form.switchAt = '2026-08-03 00:00:00'
  form.newConfig = 'CURRENT'
  visible.value = true
}
function nextStep() {
  if (step.value === 0 && !form.reason.trim()) return ElMessage.warning('请填写本次生成原因')
  if (step.value === 0 && !form.newConfig) return ElMessage.warning('请选择本次采用的账单配置')
  if (!mayReplaceExistingBills.value && step.value === 1 && !selectedCandidateFees.value.length) return ElMessage.warning('至少选择一条待归集费项')
  step.value += 1
}
function submit() {
  visible.value = false
  emit('submit')
}

defineExpose({ open })
</script>

<template>
  <el-dialog v-model="visible" title="账单生成" class="generation-dialog module-dialog module-dialog-large" align-center append-to-body destroy-on-close :close-on-click-modal="false">
    <el-steps :active="step" finish-status="success" align-center class="generation-steps">
      <el-step title="设置生成条件" />
      <el-step title="核对判定依据" />
      <el-step title="创建任务" />
    </el-steps>

    <section v-if="step === 0" class="generation-step-panel">
      <div class="generation-mode-banner">
        <div><strong>系统执行时判定生成方式</strong><span>财务只需确认配置和数据范围；系统取得执行权后再判定首次生成、补充生成或替换生成。</span></div>
        <StatusTag label="实际方式待判定" tone="running" />
      </div>
      <dl class="generation-context-grid">
        <div><dt>目标账单</dt><dd>{{ bill.billNo }}</dd></div><div><dt>客户 / 账单类型</dt><dd>{{ bill.customer }} / {{ isReceivable ? '应收账单' : '返款账单' }}</dd></div>
        <div><dt>实际账期</dt><dd>{{ bill.periodStart }} 至 {{ bill.periodEnd }}</dd></div><div><dt>当前收口状态</dt><dd>{{ bill.closeStatus }}</dd></div>
        <div><dt>原配置</dt><dd>{{ currentConfigLabel }} · {{ currentConfigVersion }}</dd></div><div><dt>当前结果版本</dt><dd>{{ currentResultVersion }}</dd></div>
      </dl>
      <div v-if="mayReplaceExistingBills" class="generation-checks">
        <div><span class="check-mark">✓</span><strong>账单状态为待审核</strong><small>符合替换条件</small></div>
        <div><span class="check-mark">✓</span><strong>账单尚未发出</strong><small>发出时间为空</small></div>
        <div><span class="check-mark">✓</span><strong>不存在资金事实</strong><small>无核销、回款或返款</small></div>
        <div><span class="check-mark">✓</span><strong>范围未被其它任务占用</strong><small>允许创建替换批次</small></div>
      </div>
      <el-form label-position="top" class="generation-form-grid">
        <el-form-item label="本次采用的账单配置"><el-select v-model="form.newConfig"><el-option v-for="item in generationConfigOptions" :key="item.value" :label="item.label" :value="item.value"><span>{{ item.label }}</span><small class="option-meta">{{ item.state }} · {{ item.effect }}</small></el-option></el-select></el-form-item>
        <el-form-item v-if="mayReplaceExistingBills" label="配置切换时点 T"><el-date-picker v-model="form.switchAt" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" /></el-form-item>
        <el-form-item label="数据截止点"><el-date-picker v-model="form.dataCutoff" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" /></el-form-item>
        <el-form-item label="生成原因" :class="{ 'span-2': !mayReplaceExistingBills }"><el-input v-model="form.reason" type="textarea" :rows="2" placeholder="说明本次生成账单的原因" /></el-form-item>
      </el-form>
    </section>

    <section v-else-if="step === 1 && !mayReplaceExistingBills" class="generation-step-panel">
      <el-alert title="系统执行时将根据是否已有可沿用的待审核账单，判定为首次生成或补充生成。" type="info" :closable="false" />
      <div class="generation-summary-row"><div><span>待选择费项</span><strong>{{ candidateFees.length }}</strong></div><div><span>已选择</span><strong>{{ selectedCandidateFees.length }}</strong></div><div><span>预计金额变化</span><strong>{{ money(candidateAmount) }} {{ bill.currency }}</strong></div><div><span>结果处理</span><strong>新增结果版本</strong></div></div>
      <DataTableFrame :total="candidateFees.length" :page-size="20" :sticky-toolbar="false" :sticky-pagination="false"><el-table :data="candidateFees" border class="clean-table generation-table">
        <el-table-column label="纳入" width="64" align="center"><template #default="scope"><el-checkbox v-model="scope.row.selected" /></template></el-table-column>
        <el-table-column prop="fee" label="费项" width="150" /><el-table-column prop="businessNo" label="业务单号" min-width="220" /><el-table-column prop="sourceAt" label="进入费项池时间" width="160" /><el-table-column prop="reason" label="待补充原因" width="130" /><el-table-column prop="currency" label="币种" width="80" /><el-table-column label="金额" align="right" width="130"><template #default="scope">{{ money(scope.row.amount) }}</template></el-table-column>
      </el-table></DataTableFrame>
    </section>

    <section v-else-if="step === 1" class="generation-step-panel">
      <el-alert title="新版配置可能改变账单范围或分组。系统执行时若不能沿用原账单，将判定为替换生成；候选账单在任务成功前不可见。" type="warning" :closable="false" />
      <div class="replacement-config-line"><span>原配置：<strong>{{ currentConfigVersion }}</strong></span><span>新版配置：<strong>{{ selectedReplacementOption?.label }}</strong></span><span>切换时点：<strong>{{ form.switchAt }}</strong></span></div>
      <div class="replacement-columns">
        <div><h4>待替换账单集合</h4><DataTableFrame :total="replacementOldRows.length" :page-size="20" :sticky-toolbar="false" :sticky-pagination="false"><el-table :data="replacementOldRows" border class="clean-table"><el-table-column prop="billNo" label="原账单" min-width="210" /><el-table-column prop="group" label="分组范围" min-width="170" /><el-table-column prop="config" label="配置" width="80" /><el-table-column prop="feeCount" label="费项" width="70" /><el-table-column label="金额" width="130"><template #default="scope">{{ money(scope.row.amount) }} {{ scope.row.currency }}</template></el-table-column></el-table></DataTableFrame></div>
        <div><h4>候选新账单集合</h4><DataTableFrame :total="replacementNewRows.length" :page-size="20" :sticky-toolbar="false" :sticky-pagination="false"><el-table :data="replacementNewRows" border class="clean-table"><el-table-column prop="billNo" label="候选账单" min-width="120" /><el-table-column prop="group" label="新版拆单结果" min-width="170" /><el-table-column prop="config" label="配置" width="80" /><el-table-column prop="feeCount" label="费项" width="70" /><el-table-column label="金额" width="130"><template #default="scope">{{ money(scope.row.amount) }} {{ scope.row.currency }}</template></el-table-column></el-table></DataTableFrame></div>
      </div>
      <div class="generation-summary-row replacement-summary"><div><span>原账单数量</span><strong>{{ replacementOldRows.length }}</strong></div><div><span>候选账单数量</span><strong>{{ replacementNewRows.length }}</strong></div><div><span>原账单金额</span><strong>{{ money(replacementOldAmount) }}</strong></div><div><span>候选金额</span><strong>{{ money(replacementNewAmount) }}</strong></div><div><span>金额变化</span><strong>{{ money(replacementNewAmount - replacementOldAmount) }}</strong></div></div>
    </section>

    <section v-else class="generation-step-panel generation-confirm-panel">
      <div class="confirm-icon">✓</div><h3>任务信息已准备完成</h3>
      <p>提交后创建账单生成任务。账单生成方式将在任务取得执行权、检查现有账单和配置影响后确定。</p>
      <dl class="generation-context-grid confirm-grid"><div><dt>任务类型</dt><dd>账单生成</dd></div><div><dt>账单生成方式</dt><dd>待判定</dd></div><div><dt>数据截止点</dt><dd>{{ form.dataCutoff }}</dd></div><div><dt>操作原因</dt><dd>{{ form.reason }}</dd></div></dl>
      <el-alert v-if="mayReplaceExistingBills" title="若系统判定为替换生成，原账单将在候选账单集合整体成功后才作废并切换。" type="warning" :closable="false" />
    </section>

    <template #footer><el-button @click="visible = false">取消</el-button><el-button v-if="step > 0" @click="step--">上一步</el-button><el-button v-if="step < 2" type="primary" @click="nextStep">下一步</el-button><el-button v-else type="primary" @click="submit">创建任务</el-button></template>
  </el-dialog>
</template>

<style scoped>
.generation-steps { margin: 0 var(--space-6) var(--space-6); }
.generation-step-panel { min-height: 430px; }
.generation-mode-banner { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4); border-left: 3px solid var(--primary); background: var(--primary-soft); }
.generation-mode-banner div { display: flex; flex-direction: column; gap: 5px; }
.generation-mode-banner strong { color: #17233d; font-size: var(--font-size-lg); }
.generation-mode-banner span { color: #637089; }
.generation-context-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: var(--space-4) 0; border-top: 1px solid #e1e6ef; border-left: 1px solid #e1e6ef; }
.generation-context-grid div { min-height: 72px; padding: var(--space-3); border-right: 1px solid #e1e6ef; border-bottom: 1px solid #e1e6ef; }
.generation-context-grid dt { margin-bottom: var(--space-2); color: #7a8699; font-size: var(--font-size-sm); }
.generation-context-grid dd { margin: 0; color: #273247; font-weight: var(--font-weight-semibold); overflow-wrap: anywhere; }
.generation-checks { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: var(--space-4) 0; }
.generation-checks div { display: grid; grid-template-columns: 24px 1fr; gap: 2px 8px; padding: var(--space-3); border: 1px solid #dfe6ee; background: #fbfcfd; }
.generation-checks .check-mark { grid-row: 1 / 3; display: grid; place-items: center; width: 22px; height: 22px; background: #e8f7ef; color: #11875d; font-weight: var(--font-weight-bold); }
.generation-checks strong { font-size: var(--font-size-body); }
.generation-checks small { color: #7b8797; }
.generation-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.generation-form-grid :deep(.el-form-item.span-2) { grid-column: span 2; }
.generation-form-grid :deep(.el-date-editor) { width: 100%; }
.option-meta { float: right; margin-left: var(--space-4); color: #8a95a6; }
.generation-summary-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: var(--space-4) 0; border: 1px solid #dfe5ee; }
.generation-summary-row div { padding: var(--space-3) var(--space-4); border-right: 1px solid #dfe5ee; }
.generation-summary-row div:last-child { border-right: 0; }
.generation-summary-row span { display: block; margin-bottom: var(--space-2); color: #7c8798; font-size: var(--font-size-sm); }
.generation-summary-row strong { color: #17233d; font-size: var(--font-size-lg); }
.generation-table { margin-top: var(--space-3); }
.replacement-config-line { display: flex; gap: 28px; margin: var(--space-4) 0; padding: var(--space-3) var(--space-4); background: #f6f8fb; color: #657187; }
.replacement-config-line strong { color: #273247; }
.replacement-columns { display: grid; grid-template-columns: 1fr; gap: 14px; }
.replacement-columns h4 { margin: 0 0 var(--space-2); }
.replacement-summary { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.generation-confirm-panel { padding-top: var(--space-6); text-align: center; }
.confirm-icon { display: grid; place-items: center; width: 52px; height: 52px; margin: 0 auto var(--space-3); background: #e8f7ef; color: #14845e; font-size: var(--font-size-4xl); font-weight: var(--font-weight-bold); }
.generation-confirm-panel h3 { margin: 0 0 var(--space-2); font-size: var(--font-size-2xl); }
.generation-confirm-panel > p { margin: 0 auto var(--space-5); color: #69758a; }
.confirm-grid { text-align: left; }
.generation-confirm-panel :deep(.el-alert) { text-align: left; }
@media (max-width: 900px) {
  .generation-context-grid, .generation-checks { grid-template-columns: 1fr 1fr; }
  .generation-form-grid { grid-template-columns: 1fr; }
  .generation-form-grid :deep(.el-form-item.span-2) { grid-column: auto; }
  .replacement-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
