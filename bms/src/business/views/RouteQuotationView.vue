<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus, Warning } from '@element-plus/icons-vue'
import ConditionFilter from '../../shared/components/ConditionFilter.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import TableActionColumn from '../../shared/components/TableActionColumn.vue'
import { useDemoDataset } from '../../data/useDemoDataset.js'
import { createBaseQuote, createPriceRule, createRule, routeQuoteFixtures } from '../../data/fixtures/routeQuotes.js'
import { routeQuoteOptions } from '../../data/fixtures/routeQuoteOptions.js'
import RouteQuoteListPanel from '../components/RouteQuoteListPanel.vue'
import RouteQuoteRichTextEditor from '../components/RouteQuoteRichTextEditor.vue'

const {
  currencies, shops, warehouses, destinations, carriers, quoteGroups, quoteTypes,
  businessTypes, cargoTypes, transportModes, recommendTags, routeStrategies,
  billingModes, calculationModes, feeRoundingModes, carryModes, forbiddenCategories,
  weightFormulaBillingModes, ruleTypes, priceTypes, feeNatureTypes,
  lowerBoundaryOperators, upperBoundaryOperators,
} = routeQuoteOptions

const quotes = useDemoDataset('routeQuotes', routeQuoteFixtures, 3)
const selectedQuoteIds = ref([])
const detailVisible = ref(false)
const detailMode = ref('create')
const historyVisible = ref(false)
const historyQuote = ref(null)
const query = reactive({
  name: '', shop: '', warehouse: '', transport: '', cargoType: '', status: '',
  destination: '', quoteType: '', carrier: '', recommendTag: '', group: '',
  businessType: '', linkedScheme: '',
})
const appliedQuery = reactive({ ...query })
const detailDraft = ref(createBaseQuote())

const multiSelectValues = (quote, pluralField, singularField) => quote[pluralField]?.length
  ? quote[pluralField]
  : quote[singularField] ? [quote[singularField]] : []
const carrierValues = (quote) => multiSelectValues(quote, 'carriers', 'carrier')
const carrierSummary = (quote) => carrierValues(quote).join(' / ') || '--'
const currentVersion = computed(() => detailDraft.value.version || 1)
const selectedCount = computed(() => selectedQuoteIds.value.length)
const isCodFeeQuote = computed(() => detailDraft.value.quoteType === '代收货款手续费报价')
const forbiddenCategoryOptions = computed(() => forbiddenCategories.map((item) => ({ label: item, value: item })))
const enabledDateRange = computed({
  get: () => detailDraft.value.startDate && detailDraft.value.endDate
    ? [detailDraft.value.startDate, detailDraft.value.endDate]
    : [],
  set: (value) => {
    [detailDraft.value.startDate, detailDraft.value.endDate] = value || ['', '']
  },
})
const usesWeightFormula = computed(() => weightFormulaBillingModes.includes(detailDraft.value.billingMode))
const availableCalculationModes = computed(() => (
  detailDraft.value.billingMode === '按数量（个）'
    ? ['订单个数', '包裹个数']
    : ['多包裹合并算费', '多包裹单独算费']
))

const filteredQuotes = computed(() => quotes.value.filter((quote) => {
  const text = appliedQuery.name.trim().toLowerCase()
  const matchesName = !text || [quote.name, carrierSummary(quote), quote.productDescription]
    .some((value) => String(value).toLowerCase().includes(text))
  const matches = [
    !appliedQuery.shop || quote.shop === appliedQuery.shop,
    !appliedQuery.warehouse || multiSelectValues(quote, 'warehouses', 'warehouse').includes(appliedQuery.warehouse),
    !appliedQuery.transport || quote.transportModes.includes(appliedQuery.transport),
    !appliedQuery.cargoType || quote.cargoTypes.includes(appliedQuery.cargoType),
    !appliedQuery.status || quote.status === appliedQuery.status,
    !appliedQuery.destination || multiSelectValues(quote, 'destinations', 'destination').includes(appliedQuery.destination),
    !appliedQuery.quoteType || quote.quoteType === appliedQuery.quoteType,
    !appliedQuery.carrier || carrierValues(quote).includes(appliedQuery.carrier),
    !appliedQuery.recommendTag || quote.recommendTags.includes(appliedQuery.recommendTag),
    !appliedQuery.group || multiSelectValues(quote, 'groups', 'group').includes(appliedQuery.group),
    !appliedQuery.businessType || quote.businessTypes.includes(appliedQuery.businessType),
    !appliedQuery.linkedScheme || appliedQuery.linkedScheme === '否',
  ]
  return matchesName && matches.every(Boolean)
}))

function cloneQuote(quote) {
  return JSON.parse(JSON.stringify(quote))
}

function normalizeMultiSelectFields(quote) {
  quote.groups = multiSelectValues(quote, 'groups', 'group')
  quote.warehouses = multiSelectValues(quote, 'warehouses', 'warehouse')
  quote.destinations = multiSelectValues(quote, 'destinations', 'destination')
  quote.carriers = carrierValues(quote)
  return quote
}

function applyQuery() {
  Object.assign(appliedQuery, query)
  selectedQuoteIds.value = []
}

function resetQuery() {
  Object.keys(query).forEach((key) => {
    query[key] = typeof query[key] === 'boolean' ? false : ''
  })
  applyQuery()
}

function openCreate() {
  detailMode.value = 'create'
  detailDraft.value = createBaseQuote({
    rules: [createRule(1, 5000, 0)],
    carriers: [],
    productDescription: '中国台湾代收货款固定手续费',
  })
  detailVisible.value = true
}

function handleQuoteTypeChange(value) {
  if (value === '代收货款手续费报价') {
    detailDraft.value.billingMode = '按代收货款金额分档'
    detailDraft.value.calculationMode = '多包裹单独算费'
    detailDraft.value.feeRoundingType = '实际费用'
    detailDraft.value.feeRounding = '无舍入'
    detailDraft.value.carryMode = '无进位'
    detailDraft.value.minPrice = ''
    detailDraft.value.carrier = ''
    detailDraft.value.carriers = []
    if (!detailDraft.value.rules.length) detailDraft.value.rules = [createRule(1, 5000, 0)]
    return
  }
  if (detailDraft.value.billingMode === '按代收货款金额分档') {
    detailDraft.value.billingMode = billingModes[0]
    detailDraft.value.calculationMode = '多包裹合并算费'
    detailDraft.value.feeRoundingType = '实际费用'
    detailDraft.value.feeRounding = feeRoundingModes[0]
    detailDraft.value.carryMode = carryModes[0]
    detailDraft.value.routeStrategy = routeStrategies[0]
  }
  if (!detailDraft.value.priceRules.length) detailDraft.value.priceRules = [createPriceRule(0, 5, 0)]
}

function handleBillingModeChange(value) {
  const allowed = value === '按数量（个）'
    ? ['订单个数', '包裹个数']
    : ['多包裹合并算费', '多包裹单独算费']
  if (!allowed.includes(detailDraft.value.calculationMode)) {
    detailDraft.value.calculationMode = allowed[0]
  }
}

function openEdit(quote) {
  detailMode.value = 'edit'
  detailDraft.value = normalizeMultiSelectFields(cloneQuote(quote))
  detailVisible.value = true
}

function openCopy(quote) {
  detailMode.value = 'copy'
  detailDraft.value = normalizeMultiSelectFields(createBaseQuote({
    ...cloneQuote(quote),
    id: '',
    name: `${quote.name}-副本`,
    status: '停用',
    version: 1,
    createdAt: '2026-08-16 10:05',
    updatedAt: '2026-08-16 10:05',
  }))
  detailVisible.value = true
}

function closeDetail() {
  detailVisible.value = false
}

function addRule() {
  const previous = detailDraft.value.rules.at(-1)
  const lower = previous ? Number(previous.upper) + 1 : 1
  detailDraft.value.rules.push(createRule(lower, lower + 4999, 0))
}

function removeRule(index) {
  if (detailDraft.value.rules.length === 1) {
    ElMessage.warning('至少保留一条金额区间')
    return
  }
  detailDraft.value.rules.splice(index, 1)
}

function formatCodRule(rule) {
  const lower = Math.max(0, Number(rule.lower) - 1).toLocaleString('zh-CN')
  const upper = Number(rule.upper).toLocaleString('zh-CN')
  return `${lower} < 代收货款金额 <= ${upper}，一口价`
}

function addPriceRule() {
  const previous = detailDraft.value.priceRules.at(-1)
  const lower = previous ? Number(previous.upper) : 0
  detailDraft.value.priceRules.push(createPriceRule(lower, lower + 5, 0))
}

function removePriceRule(index) {
  if (detailDraft.value.priceRules.length === 1) {
    ElMessage.warning('至少保留一条价格区间')
    return
  }
  detailDraft.value.priceRules.splice(index, 1)
}

function validateQuote() {
  const quote = detailDraft.value
  const selectedCarriers = carrierValues(quote)
  if (!quote.name.trim() || !quote.shop || !quote.groups.length || !quote.destinations.length || !selectedCarriers.length) {
    ElMessage.warning('请补充报价名称、店铺、报价分组、目的地和尾程派送商')
    return false
  }
  if (!quote.businessTypes.length || !quote.cargoTypes.length || !quote.transportModes.length || !quote.warehouses.length) {
    ElMessage.warning('请补充业务类型、货物类型、运输方式和适用仓库')
    return false
  }
  if (!quote.permanent && (!quote.startDate || !quote.endDate || quote.startDate > quote.endDate)) {
    ElMessage.warning('非永久启用的报价必须填写有效的启用时间')
    return false
  }
  if (!isCodFeeQuote.value) return true
  const rules = [...quote.rules].sort((left, right) => Number(left.lower) - Number(right.lower))
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index]
    if (Number(rule.lower) < 1 || Number(rule.upper) < Number(rule.lower) || Number(rule.fee) < 0) {
      ElMessage.warning('代收货款金额区间或固定手续费无效')
      return false
    }
    if (index > 0 && Number(rule.lower) !== Number(rules[index - 1].upper) + 1) {
      ElMessage.warning('代收货款金额区间必须连续，且不能重叠')
      return false
    }
  }
  return true
}

function saveDetail() {
  if (!validateQuote()) return
  const quote = cloneQuote(detailDraft.value)
  quote.groups = [...multiSelectValues(quote, 'groups', 'group')]
  quote.warehouses = [...multiSelectValues(quote, 'warehouses', 'warehouse')]
  quote.destinations = [...multiSelectValues(quote, 'destinations', 'destination')]
  quote.carriers = [...carrierValues(quote)]
  quote.group = quote.groups[0] || ''
  quote.warehouse = quote.warehouses[0] || ''
  quote.destination = quote.destinations[0] || ''
  quote.carrier = quote.carriers[0] || ''
  quote.rules = [...quote.rules]
    .sort((left, right) => Number(left.lower) - Number(right.lower))
    .map((rule) => ({ lower: Number(rule.lower), upper: Number(rule.upper), fee: Number(rule.fee) }))
  quote.updatedAt = '2026-08-16 10:05'
  quote.updatedBy = '财务管理员'
  if (!quote.id) {
    quote.id = `cod-${Date.now()}`
    quote.createdAt = quote.updatedAt
    quote.createdBy = quote.updatedBy
    quotes.value.unshift(quote)
  } else {
    quote.version += 1
    const index = quotes.value.findIndex((item) => item.id === quote.id)
    quotes.value.splice(index, 1, quote)
  }
  detailVisible.value = false
  ElMessage.success(detailMode.value === 'edit' ? '报价已保存' : '报价已新增')
}

function openHistory(quote) {
  historyQuote.value = quote
  historyVisible.value = true
}

function historyRows(quote) {
  if (!quote) return []
  return [
    { version: `V${quote.version}`, time: quote.updatedAt, operator: quote.updatedBy, change: '当前报价配置', current: true },
    { version: `V${Math.max(1, quote.version - 1)}`, time: quote.createdAt, operator: quote.createdBy, change: '首次保存报价', current: false },
  ]
}

async function toggleStatus(quote) {
  const nextStatus = quote.status === '启用' ? '停用' : '启用'
  try {
    await ElMessageBox.confirm(`确认${nextStatus}${quote.name}？`, `${nextStatus}报价`, { type: 'warning' })
    quote.status = nextStatus
    quote.updatedAt = '2026-08-16 10:05'
    ElMessage.success(`报价已${nextStatus}`)
  } catch {
    // The user dismissed the confirmation dialog.
  }
}

async function removeQuote(quote) {
  try {
    await ElMessageBox.confirm(`确认删除${quote.name}？`, '删除报价', { type: 'warning' })
    quotes.value = quotes.value.filter((item) => item.id !== quote.id)
    selectedQuoteIds.value = selectedQuoteIds.value.filter((id) => id !== quote.id)
    ElMessage.success('报价已删除')
  } catch {
    // The user dismissed the confirmation dialog.
  }
}

function runBatchAction(label) {
  if (!selectedCount.value) return
  ElMessage.info(`${label}仅保留原有入口，演示数据不执行批量改写`)
}

function exportQuotes() {
  ElMessage.success(`已按当前查询条件生成 ${filteredQuotes.value.length} 条报价的导出任务`)
}

</script>

<template>
  <div class="route-quotation-page module-page">
    <template v-if="!detailVisible">
      <section class="condition-query-panel">
        <div class="condition-filter-bar">
          <ConditionFilter v-model="query.name" label="产品名称" type="text" search-placeholder="报价名称 / 尾程派送商" />
          <ConditionFilter v-model="query.shop" label="所属店铺" :options="shops" />
          <ConditionFilter v-model="query.warehouse" label="所属仓库" :options="warehouses" />
          <ConditionFilter v-model="query.transport" label="运输方式" :options="transportModes" />
          <ConditionFilter v-model="query.cargoType" label="货物类型" :options="cargoTypes" />
          <ConditionFilter v-model="query.status" label="是否启用" :options="['启用', '停用']" />
          <ConditionFilter v-model="query.destination" label="目的地" :options="destinations" />
          <ConditionFilter v-model="query.quoteType" label="报价类型" :options="quoteTypes" />
          <ConditionFilter v-model="query.carrier" label="承运商" :options="carriers" />
          <ConditionFilter v-model="query.recommendTag" label="推荐标签" :options="recommendTags" />
          <ConditionFilter v-model="query.group" label="报价分组" :options="quoteGroups" />
          <ConditionFilter v-model="query.businessType" label="业务类型" :options="businessTypes" />
          <ConditionFilter v-model="query.linkedScheme" label="是否关联方案" :options="['是', '否']" />
          <div class="condition-filter-actions">
            <el-button type="primary" @click="applyQuery">查询</el-button>
            <el-button @click="resetQuery">重置</el-button>
          </div>
        </div>
      </section>

      <RouteQuoteListPanel
        :rows="filteredQuotes"
        :selected-count="selectedCount"
        @selection-change="selectedQuoteIds = $event.map((row) => row.id)"
        @export="exportQuotes"
        @create-quote="openCreate"
        @batch="runBatchAction"
        @edit="openEdit"
        @copy="openCopy"
        @history="openHistory"
        @toggle-status="toggleStatus"
        @remove="removeQuote"
      />
    </template>

    <template v-else>
      <section class="route-quote-detail-panel module-panel">
        <div class="route-quote-detail-titlebar">
          <h1>基础信息</h1>
          <div>
            <span>当前版本: {{ currentVersion }}</span>
            <el-button v-if="detailMode === 'edit'" link type="primary" @click="openHistory(detailDraft)">历史修改记录</el-button>
          </div>
        </div>
        <el-form size="small" label-position="right" label-width="130px" class="route-quote-detail-form">
          <div class="route-quote-form-grid">
            <el-form-item label="所属店铺" required class="span-all"><el-select v-model="detailDraft.shop" clearable filterable><el-option v-for="item in shops" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="报价名称" required><el-input v-model="detailDraft.name" /></el-form-item>
            <el-form-item label="报价分组" required><el-select v-model="detailDraft.groups" multiple clearable collapse-tags collapse-tags-tooltip><el-option v-for="item in quoteGroups" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="业务类型" required><el-select v-model="detailDraft.businessTypes" multiple clearable collapse-tags collapse-tags-tooltip><el-option v-for="item in businessTypes" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="启用时间" required>
              <el-date-picker v-model="enabledDateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="-" start-placeholder="开始日期" end-placeholder="结束日期" />
            </el-form-item>
            <el-form-item label="报价类型" required><el-select v-model="detailDraft.quoteType" clearable @change="handleQuoteTypeChange"><el-option v-for="item in quoteTypes" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <div class="route-quote-switch-pair">
              <el-form-item label="永久启用" label-width="70px"><el-switch :model-value="detailDraft.permanent" @update:model-value="(value) => { detailDraft.permanent = value }" /></el-form-item>
              <el-form-item label="启用状态" label-width="70px"><el-switch :model-value="detailDraft.status === '启用'" @update:model-value="(value) => { detailDraft.status = value ? '启用' : '停用' }" /></el-form-item>
            </div>
            <el-form-item label="产品优先级"><el-input-number v-model="detailDraft.priority" :min="0" controls-position="right" /></el-form-item>
            <el-form-item label="展示优先级"><el-input-number v-model="detailDraft.displayPriority" :min="0" controls-position="right" /></el-form-item>
            <el-form-item label="时效"><el-input v-model="detailDraft.timeLimit" /></el-form-item>
            <el-form-item label="最低价格"><el-input v-if="isCodFeeQuote" model-value="" disabled /><el-input-number v-else v-model="detailDraft.minPrice" :min="0" :precision="2" controls-position="right" /></el-form-item>
            <el-form-item label="推荐标签"><el-select v-model="detailDraft.recommendTags" multiple clearable collapse-tags collapse-tags-tooltip><el-option v-for="item in recommendTags" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="产品描述" class="span-all"><RouteQuoteRichTextEditor v-model="detailDraft.productDescription" /></el-form-item>
            <el-form-item label="商品禁寄品类" class="span-2"><el-select-v2 v-model="detailDraft.forbiddenCategories" :options="forbiddenCategoryOptions" size="large" multiple filterable clearable placeholder="请搜索选中禁用的品类" /></el-form-item>
            <el-form-item label="商品禁寄描述" class="span-2"><el-input v-model="detailDraft.forbiddenDescription" type="textarea" :rows="2" /></el-form-item>
          </div>
        </el-form>
      </section>

      <section class="route-quote-detail-panel module-panel">
        <div class="route-quote-detail-titlebar"><h2>计费信息</h2></div>
        <el-form size="small" label-position="right" label-width="108px" class="route-quote-detail-form">
          <div class="route-quote-form-grid route-quote-form-grid-three">
            <el-form-item label="目的地国家/地区" required><el-select v-model="detailDraft.destinations" multiple collapse-tags collapse-tags-tooltip><el-option v-for="item in destinations" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="货物类型" required><el-select v-model="detailDraft.cargoTypes" multiple><el-option v-for="item in cargoTypes" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="运输方式" required><el-select v-model="detailDraft.transportModes" multiple><el-option v-for="item in transportModes" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="适用仓库" required><el-select v-model="detailDraft.warehouses" multiple collapse-tags collapse-tags-tooltip><el-option v-for="item in warehouses" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="渠道线路分配策略" required class="span-2"><el-select v-model="detailDraft.routeStrategy"><el-option v-for="item in routeStrategies" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item :label="isCodFeeQuote ? '尾程派送商' : '承运商'" required><el-select v-model="detailDraft.carriers" multiple collapse-tags collapse-tags-tooltip :placeholder="isCodFeeQuote ? '请选择尾程派送商' : '请选择承运商'"><el-option v-for="item in carriers" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="所属店铺" required><el-select v-model="detailDraft.shop"><el-option v-for="item in shops" :key="item" :label="item" :value="item" /></el-select></el-form-item>
          </div>
        </el-form>
      </section>

      <section class="route-quote-detail-panel module-panel">
        <div class="route-quote-detail-titlebar"><h2>计费公式</h2></div>
        <el-form size="small" label-position="right" label-width="108px" class="route-quote-detail-form">
          <div class="route-quote-form-grid route-quote-form-grid-three">
            <el-form-item label="计费模式" required><el-select v-if="isCodFeeQuote" model-value="按代收货款金额分档" disabled><el-option label="按代收货款金额分档" value="按代收货款金额分档" /></el-select><el-select v-else v-model="detailDraft.billingMode" @change="handleBillingModeChange"><el-option v-for="item in billingModes" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="计算方式" required><el-select v-if="isCodFeeQuote" model-value="多包裹单独算费" disabled><el-option label="多包裹单独算费" value="多包裹单独算费" /></el-select><el-select v-else v-model="detailDraft.calculationMode"><el-option v-for="item in availableCalculationModes" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="费用取整"><el-select v-if="isCodFeeQuote" model-value="实际费用" disabled><el-option label="实际费用" value="实际费用" /></el-select><el-select v-else v-model="detailDraft.feeRoundingType"><el-option label="实际费用" value="实际费用" /></el-select></el-form-item>
            <el-form-item label="舍入模式"><el-select v-if="isCodFeeQuote" model-value="无舍入" disabled><el-option label="无舍入" value="无舍入" /></el-select><el-select v-else v-model="detailDraft.feeRounding"><el-option v-for="item in feeRoundingModes" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="进位模式"><el-select v-if="isCodFeeQuote" model-value="无进位" disabled><el-option label="无进位" value="无进位" /></el-select><el-select v-else v-model="detailDraft.carryMode"><el-option v-for="item in carryModes" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="默认抛比"><el-input-number v-if="isCodFeeQuote || !usesWeightFormula" :model-value="null" disabled placeholder="不适用" /><el-input-number v-else v-model="detailDraft.defaultRatio" :min="1" :precision="0" controls-position="right" /></el-form-item>
            <el-form-item label="默认抛重公式"><el-input v-if="isCodFeeQuote" model-value="V/K" disabled /><el-input v-else-if="!usesWeightFormula" model-value="不适用" disabled /><el-input v-else v-model="detailDraft.defaultWeightFormula" /></el-form-item>
            <el-form-item v-if="isCodFeeQuote" label="报价币种" required><el-select v-model="detailDraft.currency"><el-option v-for="item in currencies" :key="item" :label="item" :value="item" /></el-select></el-form-item>
          </div>
        </el-form>
      </section>

      <section v-if="isCodFeeQuote" class="route-quote-detail-panel module-panel route-quote-rule-panel">
        <div class="route-quote-detail-titlebar">
          <h2>默认价格区间</h2>
        </div>
        <div class="route-quote-price-matrix-scroll">
          <table class="route-quote-price-matrix">
            <tbody>
              <tr>
                <th class="route-quote-price-matrix-label">默认价格区间</th>
                <th v-for="(rule, index) in detailDraft.rules" :key="`${rule.lower}-${rule.upper}-${index}`">
                  <el-popover trigger="click" placement="bottom-start" :width="380">
                    <template #reference>
                      <button type="button" class="route-quote-rule-trigger">{{ formatCodRule(rule) }} <span>⌄</span></button>
                    </template>
                    <div class="route-quote-rule-popover">
                      <label>规则类型<el-input model-value="代收货款金额" disabled /></label>
                      <label>金额下限（{{ detailDraft.currency }}）<el-input-number v-model="rule.lower" :min="1" :precision="0" controls-position="right" /></label>
                      <label>金额上限（{{ detailDraft.currency }}）<el-input-number v-model="rule.upper" :min="1" :precision="0" controls-position="right" /></label>
                      <label>价格类型<el-input model-value="一口价" disabled /></label>
                      <el-button link type="danger" :icon="Delete" @click="removeRule(index)">删除区间</el-button>
                    </div>
                  </el-popover>
                </th>
                <th class="route-quote-price-matrix-operation">操作</th>
              </tr>
              <tr>
                <td></td>
                <td v-for="(rule, index) in detailDraft.rules" :key="`fee-${rule.lower}-${rule.upper}-${index}`">
                  <div class="route-quote-price-cell">
                    <el-input-number v-model="rule.fee" :min="0" :precision="2" :controls="false" />
                    <span>{{ detailDraft.currency }}</span>
                  </div>
                </td>
                <td class="route-quote-price-matrix-operation">
                  <el-button :icon="Plus" title="新增区间" aria-label="新增区间" @click="addRule" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-else class="route-quote-detail-panel module-panel route-quote-rule-panel">
        <div class="route-quote-detail-titlebar">
          <h2>价格区间</h2>
          <el-button type="primary" :icon="Plus" @click="addPriceRule">新增区间</el-button>
        </div>
        <el-table :data="detailDraft.priceRules" class="clean-table route-quote-rule-table" border>
          <el-table-column type="index" label="序号" width="70" align="center" />
          <el-table-column label="规则类型" min-width="150"><template #default="scope"><el-select v-model="scope.row.ruleType"><el-option v-for="item in ruleTypes" :key="item" :label="item" :value="item" /></el-select></template></el-table-column>
          <el-table-column label="下限边界" min-width="140"><template #default="scope"><el-select v-model="scope.row.lowerOperator"><el-option v-for="item in lowerBoundaryOperators" :key="item" :label="item" :value="item" /></el-select></template></el-table-column>
          <el-table-column label="计量下限" min-width="220"><template #default="scope"><el-input-number v-model="scope.row.lower" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
          <el-table-column label="上限边界" min-width="140"><template #default="scope"><el-select v-model="scope.row.upperOperator"><el-option v-for="item in upperBoundaryOperators" :key="item" :label="item" :value="item" /></el-select></template></el-table-column>
          <el-table-column label="计量上限" min-width="220"><template #default="scope"><el-input-number v-model="scope.row.upper" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
          <el-table-column label="价格类型" min-width="140"><template #default="scope"><el-select v-model="scope.row.priceType"><el-option v-for="item in priceTypes" :key="item" :label="item" :value="item" /></el-select></template></el-table-column>
          <el-table-column :label="`单价（${detailDraft.priceCurrency}）`" min-width="220"><template #default="scope"><el-input-number v-model="scope.row.price" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
          <el-table-column label="费用性质" min-width="140"><template #default="scope"><el-select v-model="scope.row.feeNature"><el-option v-for="item in feeNatureTypes" :key="item" :label="item" :value="item" /></el-select></template></el-table-column>
          <TableActionColumn compact><template #default="scope"><el-button link type="danger" :icon="Delete" title="删除区间" aria-label="删除区间" @click="removePriceRule(scope.$index)" /></template></TableActionColumn>
        </el-table>
      </section>

      <footer class="route-quote-detail-footer">
        <el-button type="primary" @click="saveDetail">保存</el-button>
        <el-button @click="closeDetail">关闭</el-button>
      </footer>
    </template>

    <el-dialog v-model="historyVisible" title="历史修改记录" class="module-dialog module-dialog-large" align-center append-to-body destroy-on-close>
      <el-table :data="historyRows(historyQuote)" class="clean-table" border>
        <el-table-column prop="version" label="版本" width="100" />
        <el-table-column prop="time" label="变更时间" min-width="180" />
        <el-table-column prop="operator" label="操作人" min-width="130" />
        <el-table-column prop="change" label="变更摘要" min-width="240" />
        <el-table-column label="当前版本" width="100" align="center"><template #default="scope"><StatusTag v-if="scope.row.current" label="启用" /><span v-else>--</span></template></el-table-column>
      </el-table>
    </el-dialog>

  </div>
</template>

<style scoped src="../styles/route-quotation.css"></style>
