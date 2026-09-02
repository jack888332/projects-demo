<script setup>
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ArrowDown, Delete, Plus, QuestionFilled } from '@element-plus/icons-vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import HoverActionMenu from '../../shared/components/HoverActionMenu.vue'

const props = defineProps({ config: { type: Object, required: true } })
const weekdays = [{ label: '周一', value: '1' }, { label: '周二', value: '2' }, { label: '周三', value: '3' }, { label: '周四', value: '4' }, { label: '周五', value: '5' }, { label: '周六', value: '6' }, { label: '周日', value: '7' }]
const sourceCurrencies = [{ label: '美元', value: 'USD' }, { label: '日元', value: 'JPY' }, { label: '台币', value: 'TWD' }]
const settlementCurrencies = [{ label: '人民币', value: 'CNY' }, ...sourceCurrencies]
const deductFees = [{ label: '代收货款手续费', value: 'COD_SERVICE_FEE' }, { label: '超材费', value: 'OVERSIZE_FEE' }, { label: '重出费', value: 'REISSUE_FEE' }, { label: '其他应收费项', value: 'OTHER_RECEIVABLE_FEE' }]
const createRule = (fallback = true) => ({ fallback, sourceCurrency: '', settlementCurrency: fallback ? 'CNY' : '', accountName: '', accountNo: '', accountEditorOpen: false })
const snapshot = props.config.refundSnapshot || {}
const refundModeFromLabel = value => value === '签收返款' ? 'SIGNED' : 'RECEIVED'
const form = reactive({
  enabled: snapshot.enabled ?? props.config.status !== '停用', refundMode: snapshot.refundMode || refundModeFromLabel(props.config.mode), billingPeriodType: snapshot.billingPeriodType || (props.config.cycle?.includes('半周') ? 'HALF_WEEK' : 'WEEK'),
  startDays: [...(snapshot.startDays || (props.config.cycle?.includes('半周') ? ['2', '5'] : []))], sendAfterDays: snapshot.sendAfterDays ?? (Number.parseInt(props.config.sentRule) || 2),
  requiredFees: [...(snapshot.requiredFees || ['FEE0024'])], directDeductFees: [...(snapshot.directDeductFees || ['COD_SERVICE_FEE', 'OVERSIZE_FEE', 'REISSUE_FEE'])],
  currencyRules: snapshot.currencyRules?.length ? snapshot.currencyRules.map(row => ({ ...row, accountEditorOpen:false })) : [createRule()], negativePolicy: snapshot.negativePolicy || 'NEXT_REFUND_BILL', effectPeriod: [...(snapshot.effectPeriod || [props.config.effectStart || '2026-08-01', props.config.effectEnd === '长期' ? '2027-07-31' : props.config.effectEnd || '2027-07-31'])],
})
const previewNo = computed(() => props.config.no && props.config.no !== '新配置' ? props.config.no : '保存后自动生成')
const fallbackLabel = computed(() => form.currencyRules.length === 1 ? '全部' : '其他')
watch(() => form.billingPeriodType, value => { if (value !== 'HALF_WEEK') form.startDays = [] })

function addRule() { form.currencyRules.splice(form.currencyRules.length - 1, 0, createRule(false)) }
function removeRule(index) { if (!form.currencyRules[index].fallback) form.currencyRules.splice(index, 1) }
function syncSettlementCurrency(row, value) { row.settlementCurrency = value || '' }
function settlementCurrencyValue(row) { return row.settlementCurrency || (row.fallback ? 'CNY' : '') }
function updateSettlementCurrency(row, value) { row.settlementCurrency = value || (row.fallback ? 'CNY' : '') }
function accountDisplay(row) { return [row.accountName, row.accountNo].filter(Boolean).join(' / ') }
function hasAccount(row) { return Boolean(row.accountName || row.accountNo) }
function halfWeekValid() {
  const values = form.startDays.map(Number).sort((a, b) => a - b)
  if (values.length !== 2) return false
  const interval = values[1] - values[0]
  return interval >= 3 && 7 - interval >= 3
}
function validate() {
  if (!form.refundMode) return warn('请选择返款模式')
  if (!['WEEK', 'HALF_WEEK'].includes(form.billingPeriodType)) return warn('返款账单配置仅支持周、半周账期')
  if (form.billingPeriodType === 'HALF_WEEK' && form.startDays.length !== 2) return warn('半周账期必须选择两个账期起始日')
  if (form.billingPeriodType === 'HALF_WEEK' && !halfWeekValid()) return warn('半周账期选择的两个起始日间隔必须大于两天')
  if (form.sendAfterDays < 0) return warn('账单发出时间不能小于 0')
  if (!form.effectPeriod?.[0]) return warn('请选择条款生效开始日期')
  const used = new Set()
  for (let i = 0; i < form.currencyRules.length; i += 1) {
    const row = form.currencyRules[i]
    if (!row.fallback && !row.sourceCurrency) return warn(`币种账户矩阵第${i + 1}行请选择货款原始币种`)
    if (!row.fallback && used.has(row.sourceCurrency)) return warn(`币种账户矩阵第${i + 1}行原始币种重复`)
    if (!row.settlementCurrency || row.settlementCurrency === 'SOURCE_CURRENCY') return warn(`币种账户矩阵第${i + 1}行请选择明确的货款结算币种`)
    if (!row.fallback) used.add(row.sourceCurrency)
  }
  return true
}
function getRefundSnapshot() {
  return {
    enabled:form.enabled,
    refundMode:form.refundMode,
    billingPeriodType:form.billingPeriodType,
    startDays:[...form.startDays],
    sendAfterDays:form.sendAfterDays,
    requiredFees:[...form.requiredFees],
    directDeductFees:[...form.directDeductFees],
    currencyRules:form.currencyRules.map(({ accountEditorOpen: _accountEditorOpen, ...row }) => ({ ...row })),
    negativePolicy:form.negativePolicy,
    effectPeriod:[...form.effectPeriod],
  }
}
function warn(message) { ElMessage.warning(message); return false }
defineExpose({ validate, getRefundSnapshot })
</script>

<template>
  <div class="config-editor refund-editor">
    <section class="rule-card">
      <header class="rule-head"><strong>COD包裹货款代收条款</strong><el-switch v-model="form.enabled" /></header>
      <div class="config-no-bar"><span>配置版本编号</span><b>{{ config.no === '新配置' ? `${previewNo}-V1` : `${previewNo}-${config.publishVersion || config.version}` }}</b><small>{{ config.no === '新配置' ? '首次发布生成配置编号和 V1' : '发布后形成新版本，配置编号保持不变' }}</small></div>
      <div class="setting-row"><div class="setting-meta"><b>返款模式 <i>*</i></b></div><el-select v-model="form.refundMode"><el-option label="回款返款" value="RECEIVED" /><el-option label="签收返款" value="SIGNED" /></el-select></div>
      <div class="setting-row"><div class="setting-meta"><b>账期类型 <i>*</i></b></div><el-select v-model="form.billingPeriodType"><el-option label="周" value="WEEK" /><el-option label="半周" value="HALF_WEEK" /></el-select></div>
      <div class="setting-row"><div class="setting-meta"><b>账期起始日 <i v-if="form.billingPeriodType==='HALF_WEEK'">*</i></b><small>半周账期需选择每周两个起始日，两个独立账期均不得少于 3 天</small></div><el-select v-model="form.startDays" multiple :multiple-limit="2" :disabled="form.billingPeriodType!=='HALF_WEEK'" :placeholder="form.billingPeriodType==='HALF_WEEK'?'请选择两个起始日':'仅半周账期需要配置'"><el-option v-for="item in weekdays" :key="item.value" :label="item.label" :value="item.value" /></el-select></div>
      <div class="setting-row"><div class="setting-meta"><b>账单发出时间是账期结束后第...天 <i>*</i></b><small>预计在该天完成账单复核，旨在错峰复核账单</small></div><el-input-number v-model="form.sendAfterDays" :min="0" controls-position="right" /></div>
      <div class="setting-row"><div class="setting-meta"><b>返款账单必要归集金额</b><small>这些费项不在应收账单中出现</small></div><el-select v-model="form.requiredFees" multiple disabled><el-option label="代收货款" value="FEE0024" /></el-select></div>
      <div class="setting-row"><div class="setting-meta"><b class="deduct-title">在<el-tooltip placement="left"><template #content><div class="refund-tip"><strong>准返款说明</strong><p>实收回款 = 到付金额 × 回款汇率</p><p>准返款 = 到付金额 × 返款汇率</p><p>准返款币种跟随实收回款；两者与到付金额非同币种时才会产生两类汇率。</p></div></template><span>准返款 <el-icon><QuestionFilled /></el-icon></span></el-tooltip>中直接扣减的应收费项</b><small>这些费用只在返款账单中核销，但仍会在应收账单呈现</small></div><el-select v-model="form.directDeductFees" multiple filterable clearable collapse-tags placeholder="请输入费项名称搜索"><el-option v-for="item in deductFees" :key="item.value" :label="item.label" :value="item.value" /></el-select></div>
      <div class="setting-row matrix-row"><div class="setting-meta"><b>货款结算币种 <i>*</i></b><small>一份账单支持多个货款结算币种</small></div><div class="matrix-wrap"><DataTableFrame :total="form.currencyRules.length" :page-size="10" :column-sort="false" :column-data-sort="false"><template #actions><el-button :icon="Plus" @click="addRule">添加</el-button></template><el-table :data="form.currencyRules" border><el-table-column label="货款原始币种" min-width="150"><template #default="{row}"><el-input v-if="row.fallback" :model-value="fallbackLabel" disabled /><el-select v-else v-model="row.sourceCurrency" placeholder="请选择" @change="syncSettlementCurrency(row, $event)"><el-option v-for="item in sourceCurrencies" :key="item.value" :label="item.label" :value="item.value" /></el-select></template></el-table-column><el-table-column label="货款结算币种" min-width="150"><template #default="{row}"><el-select :model-value="settlementCurrencyValue(row)" :disabled="!row.fallback && !row.sourceCurrency" placeholder="请选择" @update:model-value="updateSettlementCurrency(row, $event)"><el-option v-for="item in settlementCurrencies" :key="item.value" :label="item.label" :value="item.value" /></el-select></template></el-table-column><el-table-column label="客户收款账户" min-width="240" :show-overflow-tooltip="false"><template #default="{row}"><el-popover v-model:visible="row.accountEditorOpen" placement="bottom-start" :width="320" trigger="click" :show-after="0" :hide-after="0" transition="" popper-class="account-editor-popper"><template #reference><div class="account-select"><span class="account-select__value" :class="{ 'is-placeholder': !hasAccount(row) }">{{ accountDisplay(row) || '请填入' }}</span><el-icon class="account-select__arrow"><ArrowDown /></el-icon></div></template><div class="account-editor"><el-input v-model="row.accountName" placeholder="账户名称" clearable autofocus @keyup.enter="row.accountEditorOpen = false" /><el-input v-model="row.accountNo" placeholder="收款账号" clearable @keyup.enter="row.accountEditorOpen = false" /></div></el-popover></template></el-table-column><TableActionColumn compact><template #default="{row,$index}"><HoverActionMenu v-if="!row.fallback"><el-dropdown-item class="danger-action" :icon="Delete" @click="removeRule($index)">删除</el-dropdown-item></HoverActionMenu></template></TableActionColumn></el-table></DataTableFrame></div></div>
      <div class="setting-row"><div class="setting-meta"><b>当已返货款金额为负数时的应对措施</b><small>即应返货款不足以扣减应收费项时的处理方式</small></div><el-select v-model="form.negativePolicy"><el-option label="负数金额计入下期返款账单" value="NEXT_REFUND_BILL" /><el-option label="负数金额反向计入本期应收账单" value="CURRENT_AR_BILL" /></el-select></div>
      <div class="setting-row"><div class="setting-meta"><b>条款生效周期 <i>*</i></b></div><el-date-picker v-model="form.effectPeriod" type="daterange" value-format="YYYY-MM-DD" range-separator="~" start-placeholder="开始日期" end-placeholder="结束日期" /></div>
    </section>
  </div>
</template>

<style scoped>
.config-editor{padding:0 var(--space-1) var(--space-6);color:#303746}.rule-card{border:1px solid #dfe4ec;background:#fff}.rule-head{height:54px;padding:0 var(--space-4);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e7eaf0;background:#f8f9fb}.rule-head strong{font-size: var(--font-size-lg)}.config-no-bar{min-height:42px;padding:var(--space-2) var(--space-4);display:flex;align-items:center;gap:14px;background:#fff8e8;border-bottom:1px solid #f0dfb6}.config-no-bar span,.config-no-bar small{color:#767e8d}.config-no-bar b{color:#25334b}.setting-row{min-height:70px;margin:0 var(--space-4);display:grid;grid-template-columns:320px minmax(300px,400px);gap:22px;align-items:center;border-bottom:1px solid #edf0f4}.setting-meta{display:flex;flex-direction:column;gap:5px}.setting-meta b{font-size: var(--section-title-font-size);font-weight: var(--font-weight-semibold)}.setting-meta small{font-size: var(--font-size-sm);color:#8992a1;line-height: var(--line-height-base)}.setting-meta i{color:#e34d59;font-style:normal}.setting-row>.el-select,.setting-row>.el-date-editor,.setting-row>.el-input-number{width:400px}.matrix-row{grid-template-columns:320px minmax(0,1fr);align-items:start;padding:var(--space-4) 0}.matrix-wrap{min-width:0}.account-select{width:100%;height:var(--action-button-height);padding:0 11px;display:flex;align-items:center;gap:var(--space-2);overflow:hidden;border:1px solid var(--el-border-color);border-radius:var(--action-button-radius);background:#fff;cursor:pointer;transition:border-color .15s}.account-select:hover{border-color:var(--el-border-color-hover)}.account-select__value{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account-select__value.is-placeholder{color:var(--el-text-color-placeholder)}.account-select__arrow{flex:0 0 auto;color:var(--el-text-color-placeholder)}.account-editor{display:grid;gap:var(--space-2)}.deduct-title :deep(span){color:var(--primary)}.refund-tip{width:260px;line-height: var(--line-height-base)}.refund-tip p{margin:var(--space-2) 0}
@media(max-width:760px){.config-editor{padding:0}.config-no-bar{align-items:flex-start;flex-direction:column;gap:4px}.setting-row{grid-template-columns:1fr;gap:8px;margin:0 var(--space-3);padding:var(--space-3) 0;align-items:start}.setting-row>.el-select,.setting-row>.el-date-editor,.setting-row>.el-input-number{width:100%}.matrix-row{grid-template-columns:1fr}.rule-head{padding:0 var(--space-3)}}
</style>
