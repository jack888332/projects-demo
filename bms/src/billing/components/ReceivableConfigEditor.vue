<script setup>
import { computed, reactive } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { Plus, UploadFilled } from '@element-plus/icons-vue'
import FeeCurrencyRules from './FeeCurrencyRules.vue'

const props = defineProps({ config: { type: Object, required: true } })

const currencies = ['CNY', 'TWD', 'HKD', 'USD', 'JPY', 'VND']
const periods = [
  { label: '1 自然天', value: 'DAY_1' }, { label: '7 自然天', value: 'DAY_7' },
  { label: '10 自然天', value: 'DAY_10' }, { label: '15 自然天', value: 'DAY_15' },
  { label: '周', value: 'WEEK' }, { label: '半月', value: 'HALF_MONTH' }, { label: '月', value: 'MONTH' },
]
const nodes = [{ label: '出库时间', value: 'WEIGHT_OUTBOUND' }, { label: '订单完结', value: 'ORDER_COMPLETED' }]
const businessTypes = [{ label: '同行订单', value: 'PEER' }, { label: '集运订单', value: 'CONSOLIDATION' }, { label: '电商订单', value: 'ECOMMERCE' }]
const countries = [{ label: '中国台湾', value: 'TW' }, { label: '日本', value: 'JP' }, { label: '美国', value: 'US' }, { label: '越南', value: 'VN' }, { label: '马来西亚', value: 'MY' }]
const warehouses = [{ label: '深圳集运仓', value: 'SZ' }, { label: '东莞集运仓', value: 'DG' }, { label: '义乌集运仓', value: 'YW' }]
const feeItems = [{ label: '运输费', value: 'FREIGHT' }, { label: '超材费', value: 'OVERSIZE_FEE' }, { label: '重出费', value: 'REISSUE_FEE' }, { label: '代收货款手续费', value: 'COD_SERVICE_FEE' }]
const templates = [{ label: '中国台湾 / 默认费项币种模板', value: 'TW_DEFAULT' }, { label: '日本 / 默认费项币种模板', value: 'JP_DEFAULT' }]
const creditRatings = ['A', 'B', 'C', 'D']
const creditTerms = [{ label: '0 天', value: 0 }, { label: '3 天', value: 3 }, { label: '5 天', value: 5 }, { label: '7 天', value: 7 }, { label: '15 天', value: 15 }, { label: '30 天', value: 30 }]
const overdueOptions = [{ label: '0%', value: 0 }, { label: '0.03%/天', value: 0.0003 }, { label: '0.05%/天', value: 0.0005 }, { label: '0.1%/天', value: 0.001 }]

const clone = value => JSON.parse(JSON.stringify(value))
const periodFromCycle = (cycle = '') => {
  if (cycle.includes('半月')) return 'HALF_MONTH'
  if (cycle.includes('月')) return 'MONTH'
  if (cycle.includes('10')) return 'DAY_10'
  if (cycle.includes('15')) return 'DAY_15'
  if (cycle.includes('7')) return 'DAY_7'
  if (cycle.includes('1')) return 'DAY_1'
  return 'WEEK'
}
let schemeSeed = 1
const schemeBaseNo = computed(() => (!props.config.no || props.config.no === '新配置') ? 'ARB-SCHEME-发布时生成' : props.config.no)
const existingBranchNumbers = (props.config.schemeSnapshot?.branches || [])
  .map(scheme => Number(String(scheme.schemeKey || '').match(/(?:^|-)BRANCH-(\d+)$/)?.[1]) || 0)
let branchKeySeed = Math.max(Number(props.config.schemeSnapshot?.branchKeyCeiling) || 0, ...existingBranchNumbers)
const nextBranchKey = () => `${schemeBaseNo.value}-BRANCH-${++branchKeySeed}`
const createScheme = (snapshot = {}, fallbackKey = '') => {
  const sourceCurrency = snapshot.sourceCurrency || props.config.currency || 'CNY'
  return {
    id: schemeSeed++, folded: false,
    schemeKey: snapshot.schemeKey || fallbackKey,
    enabled: snapshot.enabled !== false,
    businessTypes: [...(snapshot.businessTypes || [])],
    targetCountries: [...(snapshot.targetCountries || [])],
    warehouses: [...(snapshot.warehouses || [])],
    sourceCurrency,
    feeRules: snapshot.feeRules?.length
      ? clone(snapshot.feeRules)
      : [{ feeCode: 'FALLBACK', fallback: true, settlementCurrency: 'SOURCE_CURRENCY' }],
    template: '',
    node: snapshot.node || 'WEIGHT_OUTBOUND',
    period: snapshot.period || periodFromCycle(props.config.cycle),
    sendAfterDays: snapshot.sendAfterDays ?? (Number.parseInt(props.config.sentRule) || 3),
    effectPeriod: [...(snapshot.effectPeriod || [props.config.effectStart || '2026-08-01', props.config.effectEnd === '长期' ? '2027-07-31' : props.config.effectEnd || '2027-07-31'])],
  }
}
const defaultScheme = createScheme({ ...props.config.schemeSnapshot?.defaultScheme, schemeKey:schemeBaseNo.value }, schemeBaseNo.value)
const savedTerms = props.config.schemeSnapshot?.terms || {}
const form = reactive({
  defaultScheme,
  branches: (props.config.schemeSnapshot?.branches || []).map((snapshot, index) => {
    const sequence = Number(String(snapshot.schemeKey || '').match(/(?:^|-)BRANCH-(\d+)$/)?.[1]) || index + 1
    return createScheme({ ...snapshot, schemeKey:`${schemeBaseNo.value}-BRANCH-${sequence}` }, `${schemeBaseNo.value}-BRANCH-${sequence}`)
  }),
  creditRating:savedTerms.creditRating || 'A', creditTerm:savedTerms.creditTerm ?? 7, overdueFee:savedTerms.overdueFee ?? 0, advanceLimit:savedTerms.advanceLimit || '500000',
  contractNo:savedTerms.contractNo || 'HT-SCHEME-2026', contractFiles:clone(savedTerms.contractFiles || []),
})
const allFolded = computed(() => form.branches.length > 0 && form.branches.every(item => item.folded))
const previewNo = computed(() => {
  if (!props.config.no || props.config.no === '新配置') return '发布时自动生成'
  return props.config.no
})

function toggleAll() {
  const next = !allFolded.value
  form.branches.forEach(item => { item.folded = next })
}
function addBranch() { form.branches.push(createScheme({}, nextBranchKey())) }
function handleFile(file) { form.contractFiles = [{ name: file.name, url: '#' }] }
function overlaps(a, b, key) {
  if (!a[key].length || !b[key].length) return true
  return a[key].some(value => b[key].includes(value))
}
function hasConflict(scheme) {
  return form.branches.some(other => other.id !== scheme.id
    && overlaps(scheme, other, 'businessTypes')
    && overlaps(scheme, other, 'targetCountries')
    && overlaps(scheme, other, 'warehouses'))
}
function validateScheme(scheme, name, branch = false) {
  if (branch && (!scheme.businessTypes.length || !scheme.targetCountries.length)) return `${name}必须选择订单类型、目的国`
  if (!scheme.node) return `${name}请选择履约节点`
  if (!scheme.period) return `${name}请选择账期类型`
  if (!scheme.effectPeriod?.[0]) return `${name}请选择方案生效周期`
  if (!scheme.feeRules.length) return `${name}至少保留一条费项结算币种规则`
  const fallbackRules = scheme.feeRules.filter((rule) => rule.fallback)
  if (fallbackRules.length !== 1 || !scheme.feeRules.at(-1)?.fallback) return `${name}必须且只能保留一条末行兜底规则`
  const used = new Set()
  for (let i = 0; i < scheme.feeRules.length; i += 1) {
    const rule = scheme.feeRules[i]
    if (!rule.settlementCurrency) return `${name}第${i + 1}条费项结算币种规则必须选择结算币种`
    if (rule.fallback) continue
    if (!rule.feeCode) return `${name}第${i + 1}条费项结算币种规则必须选择明确费项`
    if (used.has(rule.feeCode)) return `${name}存在重复的费项结算币种规则`
    if (rule.settlementCurrency === 'SOURCE_CURRENCY') return `${name}第${i + 1}条非兜底规则必须选择明确币种`
    used.add(rule.feeCode)
  }
  return ''
}
function validate() {
  let error = validateScheme(form.defaultScheme, '默认方案')
  if (!error) form.branches.some((scheme, index) => ((error = validateScheme(scheme, `分支方案${index + 1}`, true)), Boolean(error)))
  if (!error && form.branches.some(hasConflict)) error = '分支方案限定情形存在交集，请先调整'
  if (!error && !form.contractNo) error = '请输入合同编号'
  if (error) { ElMessage.warning(error); return false }
  return true
}
function snapshotScheme(scheme, branch = false) {
  return {
    schemeKey: scheme.schemeKey,
    enabled: scheme.enabled,
    ...(branch ? {
      businessTypes: [...scheme.businessTypes],
      targetCountries: [...scheme.targetCountries],
      warehouses: [...scheme.warehouses],
    } : {}),
    sourceCurrency: scheme.sourceCurrency,
    feeRules: clone(scheme.feeRules),
    node: scheme.node,
    period: scheme.period,
    sendAfterDays: scheme.sendAfterDays,
    effectPeriod: [...scheme.effectPeriod],
  }
}
function getSchemeSnapshot() {
  return {
    branchKeyCeiling: branchKeySeed,
    defaultScheme: snapshotScheme(form.defaultScheme),
    branches: form.branches.map(scheme => snapshotScheme(scheme, true)),
    terms: {
      creditRating:form.creditRating,
      creditTerm:form.creditTerm,
      overdueFee:form.overdueFee,
      advanceLimit:form.advanceLimit,
      contractNo:form.contractNo,
      contractFiles:clone(form.contractFiles),
    },
  }
}
defineExpose({ validate, getSchemeSnapshot })
</script>

<template>
  <div class="config-editor">
    <section class="rule-card">
      <header class="rule-head">
        <div><strong>应收账单结算条款</strong><el-button link type="primary" @click="toggleAll">{{ allFolded ? '展开所有方案' : '折叠所有方案' }}</el-button></div>
        <el-switch :model-value="allFolded" @change="toggleAll" />
      </header>
      <div class="config-no-bar"><span>配置版本编号</span><el-tooltip content="页面合并展示配置编号和版本号，任务与账单快照仍分别记录。"><b>{{ config.no === '新配置' ? `${previewNo}-V1` : `${previewNo}-${config.publishVersion || config.version}` }}</b></el-tooltip><small>{{ config.no === '新配置' ? '首次发布生成配置编号和 V1' : '发布后形成新版本，配置编号保持不变' }}</small></div>

      <div class="scheme-section">
        <div class="scheme-title"><strong>默认方案</strong><small class="scheme-code">{{ form.defaultScheme.schemeKey }}</small><span>不包含限制条件，默认直接生效</span></div>
        <div class="scheme-body">
          <FeeCurrencyRules :scheme="form.defaultScheme" :currencies="currencies" :fee-items="feeItems" :templates="templates" />
          <div class="setting-row"><div class="setting-meta"><b>履约节点</b></div><el-select v-model="form.defaultScheme.node"><el-option v-for="item in nodes" :key="item.value" :label="item.label" :value="item.value" /></el-select></div>
          <div class="setting-row"><div class="setting-meta"><b>账期类型</b><small>同时作为账单生成周期</small></div><el-select v-model="form.defaultScheme.period"><el-option v-for="item in periods" :key="item.value" :label="item.label" :value="item.value" /></el-select></div>
          <div class="setting-row"><div class="setting-meta"><b>账单发出时间</b><small>账期结束后第 N 天</small></div><el-input-number v-model="form.defaultScheme.sendAfterDays" :min="0" controls-position="right" /></div>
          <div class="setting-row"><div class="setting-meta"><b>方案生效周期</b></div><el-date-picker v-model="form.defaultScheme.effectPeriod" type="daterange" value-format="YYYY-MM-DD" range-separator="~" start-placeholder="开始日期" end-placeholder="结束日期" /></div>
        </div>
      </div>

      <div v-for="(scheme,index) in form.branches" :key="scheme.id" :class="['scheme-section','branch-section',{conflict:hasConflict(scheme)}]">
        <div class="branch-head"><button type="button" class="fold-button" @click="scheme.folded=!scheme.folded">{{ scheme.folded ? '▶' : '▼' }}</button><strong>分支方案 ({{ index+1 }})</strong><small class="scheme-code">{{ scheme.schemeKey }}</small><span v-if="hasConflict(scheme)">与其他分支方案限定情形存在交集</span><el-button link type="danger" @click="form.branches.splice(index,1)">移除</el-button></div>
        <div v-show="!scheme.folded" class="scheme-body">
          <div class="scope-block"><h4>限定情形</h4><div class="setting-row"><div class="setting-meta"><b>订单类型 <i>*</i></b></div><el-select v-model="scheme.businessTypes" multiple collapse-tags><el-option v-for="item in businessTypes" :key="item.value" :label="item.label" :value="item.value" /></el-select></div><div class="setting-row"><div class="setting-meta"><b>目的国 <i>*</i></b></div><el-select v-model="scheme.targetCountries" multiple filterable collapse-tags><el-option v-for="item in countries" :key="item.value" :label="item.label" :value="item.value" /></el-select></div><div class="setting-row"><div class="setting-meta"><b>集运仓</b></div><el-select v-model="scheme.warehouses" multiple collapse-tags><el-option v-for="item in warehouses" :key="item.value" :label="item.label" :value="item.value" /></el-select></div></div>
          <FeeCurrencyRules :scheme="scheme" :currencies="currencies" :fee-items="feeItems" :templates="templates" />
          <div class="setting-row"><div class="setting-meta"><b>履约节点</b></div><el-select v-model="scheme.node"><el-option v-for="item in nodes" :key="item.value" :label="item.label" :value="item.value" /></el-select></div>
          <div class="setting-row"><div class="setting-meta"><b>账期类型</b></div><el-select v-model="scheme.period"><el-option v-for="item in periods" :key="item.value" :label="item.label" :value="item.value" /></el-select></div>
          <div class="setting-row"><div class="setting-meta"><b>账单发出时间</b><small>账期结束后第 N 天</small></div><el-input-number v-model="scheme.sendAfterDays" :min="0" /></div>
          <div class="setting-row"><div class="setting-meta"><b>方案生效周期</b></div><el-date-picker v-model="scheme.effectPeriod" type="daterange" value-format="YYYY-MM-DD" range-separator="~" /></div>
        </div>
      </div>

      <div class="add-branch"><el-button :icon="Plus" @click="addBranch">新增分支方案</el-button><span>以区分应收账单在不同情形下的生成规则</span></div>
      <div class="footer-terms">
        <div class="setting-row"><div class="setting-meta"><b>信用评级</b></div><el-select v-model="form.creditRating"><el-option v-for="item in creditRatings" :key="item" :label="item" :value="item" /></el-select></div>
        <div class="setting-row"><div class="setting-meta"><b>信用期限</b><small>超过期限未结清进入催收</small></div><el-select v-model="form.creditTerm"><el-option v-for="item in creditTerms" :key="item.value" :label="item.label" :value="item.value" /></el-select></div>
        <div class="setting-row"><div class="setting-meta"><b>逾期未结算滞纳金</b><small>按账单总额每日计取，默认 0%</small></div><el-select v-model="form.overdueFee"><el-option v-for="item in overdueOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></div>
        <div class="setting-row"><div class="setting-meta"><b>垫资额度上限</b></div><el-input v-model="form.advanceLimit" placeholder="请输入金额"><template #append>CNY</template></el-input></div>
        <div class="setting-row"><div class="setting-meta"><b>合同编号 <i>*</i></b></div><el-input v-model="form.contractNo" placeholder="请输入合同编号" /></div>
        <div class="setting-row"><div class="setting-meta"><b>合同文件</b></div><el-upload :auto-upload="false" :limit="1" :file-list="form.contractFiles" :on-change="handleFile" :on-remove="()=>form.contractFiles=[]"><el-button :icon="UploadFilled">上传合同文件</el-button></el-upload></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.config-editor{padding:0 var(--space-1) var(--space-6);color:#303746}.rule-card{border:1px solid #dfe4ec;background:#fff}.rule-head{height:54px;padding:0 var(--space-4);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e7eaf0;background:#f8f9fb}.rule-head>div{display:flex;align-items:center;gap:18px}.rule-head strong{font-size: var(--font-size-lg)}.config-no-bar{min-height:42px;padding:var(--space-2) var(--space-4);display:flex;align-items:center;gap:14px;background:#fff8e8;border-bottom:1px solid #f0dfb6}.config-no-bar span,.config-no-bar small{color:#767e8d}.config-no-bar b{color:#25334b}.scheme-section{border-bottom:1px solid #dfe4ec}.scheme-title,.branch-head{height:46px;padding:0 var(--space-4);display:flex;align-items:center;gap:14px;background:#f4f6f9}.scheme-title span,.add-branch span{font-size: var(--font-size-sm);color:#8a93a2}.scheme-code{color:#687386;font-size:var(--font-size-sm);font-weight:var(--font-weight-regular)}.scheme-body{padding:0 var(--space-4)}.setting-row{min-height:66px;display:grid;grid-template-columns:280px minmax(280px,400px);gap:22px;align-items:center;border-bottom:1px solid #edf0f4}.setting-meta{display:flex;flex-direction:column;gap:5px}.setting-meta b{font-size: var(--section-title-font-size);font-weight: var(--font-weight-semibold)}.setting-meta small{font-size: var(--font-size-sm);color:#8992a1;line-height: var(--line-height-base)}.setting-meta i{color:#e34d59;font-style:normal}.branch-head{border-left:3px solid var(--primary)}.branch-head .fold-button{border:0;background:transparent;color:#596579;cursor:pointer}.branch-head .el-button{margin-left:auto}.branch-head span{font-size: var(--font-size-sm);color:#c84751}.branch-section.conflict{box-shadow:inset 3px 0 #d94a55}.scope-block{margin:var(--space-3) 0;border:1px solid #e4e8ef;background:#fafbfc}.scope-block h4{margin:0;padding:var(--space-2) var(--space-3);border-bottom:1px solid #e4e8ef;font-size: var(--section-title-font-size)}.scope-block .setting-row{padding:0 var(--space-3);grid-template-columns:246px minmax(280px,400px)}.add-branch{padding:var(--space-4);display:flex;align-items:center;gap:14px;border-bottom:1px solid #e4e8ef}.footer-terms{padding:0 var(--space-4)}.footer-terms .setting-row:last-child{border-bottom:0}
@media(max-width:760px){.config-editor{padding:0}.rule-head{height:auto;min-height:54px}.config-no-bar{align-items:flex-start;flex-direction:column;gap:4px}.scheme-body,.footer-terms{padding:0 var(--space-3)}.setting-row,.scope-block .setting-row{grid-template-columns:1fr;gap:8px;padding:var(--space-3) 0;align-items:start}.setting-row>.el-select,.setting-row>.el-input,.setting-row>.el-date-editor,.setting-row>.el-input-number{width:100%!important}.branch-head{padding:0 var(--space-2)}.branch-head span{display:none}}
</style>
