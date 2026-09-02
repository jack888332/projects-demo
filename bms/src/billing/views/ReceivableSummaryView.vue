<script setup>
import { computed, ref } from 'vue'
import { View } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import ConditionFilter from '../../shared/components/ConditionFilter.vue'
import DownloadButton from '../../shared/components/DownloadButton.vue'
import MetricGrid from '../../shared/components/MetricGrid.vue'
import StackedCell from '../../shared/components/StackedCell.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import { useLinkedQueryAreas } from '../../shared/composables/useLinkedQueryAreas.js'
import { useStagedQuery } from '../../shared/composables/useStagedQuery.js'
import { useDemoDataset } from '../data/useDemoDataset.js'
import { billingBaseRateFixtures } from '../../data/fixtures/billingRates.js'

const detailVisible = ref(false)
const selectedSummary = ref(null)
const now = new Date()
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const initialShopQuery = {
  shop: '',
  period: { mode: 'month', value: [currentMonth, currentMonth] },
}
const {
  query: shopQuery,
  appliedQuery: appliedShopQuery,
  applyQuery: applyShopQuery,
  resetQuery: resetShopQuery,
} = useStagedQuery(initialShopQuery)
const initialQuery = {
  customerNo: '',
  currency: '',
  overdue: '',
}
const { query, appliedQuery, applyQuery, resetQuery } = useStagedQuery(initialQuery)
const linkedQuery = useLinkedQueryAreas({
  defaultArea: 'shop',
  submitMode: 'all',
  buttonPlacement: 'fixed',
  areas: {
    shop: { apply: applyShopQuery, reset: resetShopQuery },
    customer: { apply: applyQuery, reset: resetQuery },
  },
})

const records = useDemoDataset('receivableSummaryRecords', [
  { id: 'SZ-OG4155-CNY', shop: '深圳集运店', shopCode: 'SZ-CONSOL', customer: 'OceanGate Logistics', customerNo: 'OG4155', memberCode: 'M-700127', currency: 'CNY', receivable: 228640.82, received: 171800.00, outstanding: 56840.82, overdue: 21240.50, pendingReview: 12420.00, billCount: 8, outstandingBills: 3, oldestDue: '2026-07-18', lastBillAt: '2026-08-01' },
  { id: 'SZ-OG3088-CNY', shop: '深圳集运店', shopCode: 'SZ-CONSOL', customer: 'FastLine UK', customerNo: 'OG3088', memberCode: 'M-308801', currency: 'CNY', receivable: 100000.00, received: 70000.00, outstanding: 30000.00, overdue: 10000.00, pendingReview: 6000.00, billCount: 4, outstandingBills: 1, oldestDue: '2026-07-20', lastBillAt: '2026-07-31' },
  { id: 'YW-OG9012-CNY', shop: '义乌集运店', shopCode: 'YW-CONSOL', customer: 'TopKing Supply', customerNo: 'OG9012', memberCode: 'M-701006', currency: 'CNY', receivable: 126420.36, received: 95000.00, outstanding: 31420.36, overdue: 0, pendingReview: 8660.00, billCount: 5, outstandingBills: 2, oldestDue: '2026-08-12', lastBillAt: '2026-08-02' },
  { id: 'YW-OG6026-CNY', shop: '义乌集运店', shopCode: 'YW-CONSOL', customer: 'EastBridge Commerce', customerNo: 'OG6026', memberCode: 'M-602601', currency: 'CNY', receivable: 60000.00, received: 40000.00, outstanding: 20000.00, overdue: 0, pendingReview: 4000.00, billCount: 3, outstandingBills: 1, oldestDue: '2026-08-18', lastBillAt: '2026-08-01' },
  { id: 'GZ-OG2388-CNY', shop: '广州同行店', shopCode: 'GZ-PEER', customer: 'Hualei Express', customerNo: 'OG2388', memberCode: 'M-238801', currency: 'CNY', receivable: 145320.18, received: 119500.00, outstanding: 25820.18, overdue: 6820.18, pendingReview: 0, billCount: 6, outstandingBills: 2, oldestDue: '2026-07-28', lastBillAt: '2026-07-31' },
  { id: 'SH-OG6018-CNY', shop: '上海集运店', shopCode: 'SH-CONSOL', customer: 'Sunrise Parcel', customerNo: 'OG6018', memberCode: 'M-480221', currency: 'CNY', receivable: 93680.44, received: 93680.44, outstanding: 0, overdue: 0, pendingReview: 8400.00, billCount: 5, outstandingBills: 0, oldestDue: '-', lastBillAt: '2026-07-30' },
  { id: 'SH-OG2048-USD', shop: '上海集运店', shopCode: 'SH-CONSOL', customer: 'NorthWind Cargo', customerNo: 'OG2048', memberCode: 'M-703880', currency: 'USD', receivable: 24680.75, received: 12200.00, outstanding: 12480.75, overdue: 3980.25, pendingReview: 2100.00, billCount: 7, outstandingBills: 3, oldestDue: '2026-07-25', lastBillAt: '2026-08-01' },
  { id: 'SZ-OG4155-USD', shop: '深圳集运店', shopCode: 'SZ-CONSOL', customer: 'OceanGate Logistics', customerNo: 'OG4155', memberCode: 'M-700127', currency: 'USD', receivable: 19640.00, received: 15400.00, outstanding: 4240.00, overdue: 0, pendingReview: 0, billCount: 3, outstandingBills: 1, oldestDue: '2026-08-15', lastBillAt: '2026-07-29' },
], 2)
const baseRates = useDemoDataset('billingBaseRates', billingBaseRateFixtures)

const shopSettlementCurrency = 'CNY'
const shopConversionRates = computed(() => baseRates.value.reduce((rates, row) => {
  const [sourceCurrency, targetCurrency] = row.direction.split(' -> ')
  if (targetCurrency === shopSettlementCurrency && row.status === '生效' && row.current === '是') rates[sourceCurrency] = Number(row.rate)
  return rates
}, { CNY: 1 }))
const money = (value, currency = appliedQuery.currency) => `${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
const shopMoney = (value) => money(value, shopSettlementCurrency)
const toShopCurrency = (value, currency) => Number(value || 0) * (shopConversionRates.value[currency] || 1)
const shops = computed(() => [...new Set(records.value.map((row) => row.shop))])
const customers = computed(() => [...new Map(records.value.map((row) => [row.customerNo, {
  value: row.customerNo,
  label: row.customer,
  secondary: `${row.customerNo} / ${row.memberCode}`,
}])).values()])
const selectedCustomer = computed(() => customers.value.find((item) => item.value === appliedQuery.customerNo))

const matchesPeriodScope = (row) => {
  const { mode, value } = appliedShopQuery.period || {}
  if (!Array.isArray(value) || value.length !== 2) return true
  const [start, end] = value
  if (mode === 'date') return row.lastBillAt >= start && row.lastBillAt <= end
  const billMonth = row.lastBillAt.slice(0, 7)
  return billMonth >= start && billMonth <= end
}
const matchesShopScope = (row) => (!appliedShopQuery.shop || row.shop === appliedShopQuery.shop)
  && matchesPeriodScope(row)

const filteredRecords = computed(() => records.value.filter((row) => {
  const customerKeyword = appliedQuery.customerNo.trim().toLowerCase()
  const matchesCustomer = !customerKeyword
    || (selectedCustomer.value
      ? row.customerNo === appliedQuery.customerNo
      : `${row.customer}${row.customerNo}${row.memberCode}`.toLowerCase().includes(customerKeyword))
  return matchesShopScope(row)
    && matchesCustomer
    && (!appliedQuery.currency || row.currency === appliedQuery.currency)
    && (!appliedQuery.overdue || (appliedQuery.overdue === '逾期' ? row.overdue > 0 : row.outstanding > 0 && row.overdue === 0))
}))

const shopRecords = computed(() => records.value.filter(matchesShopScope))

const summaryStatus = (row) => row.overdue > 0 ? '有逾期' : row.outstanding > 0 ? '待回款' : '已收清'

const totals = computed(() => ({
  receivable: shopRecords.value.reduce((total, row) => total + toShopCurrency(row.receivable, row.currency), 0),
  received: shopRecords.value.reduce((total, row) => total + toShopCurrency(row.received, row.currency), 0),
  outstanding: shopRecords.value.reduce((total, row) => total + toShopCurrency(row.outstanding, row.currency), 0),
  overdue: shopRecords.value.reduce((total, row) => total + toShopCurrency(row.overdue, row.currency), 0),
}))
const kpis = computed(() => {
  return [
    { label: '应收金额', value: shopMoney(totals.value.receivable), tone: 'blue' },
    { label: '已收金额', value: shopMoney(totals.value.received), tone: 'green' },
    { label: '应收未收', value: shopMoney(totals.value.outstanding), tone: 'amber' },
    { label: '逾期未收', value: shopMoney(totals.value.overdue), tone: 'red' },
  ]
})

function openDetail(row) {
  selectedSummary.value = row
  detailVisible.value = true
}
function runQuery() {
  linkedQuery.submit()
  ElMessage.success(`查询完成，共 ${filteredRecords.value.length} 条`)
}
</script>

<template>
  <div class="module-page receivable-summary-page">
    <div class="summary-dimension-heading"><strong>店铺</strong></div>
    <section class="condition-query-panel summary-scope-row">
      <div class="condition-filter-bar">
        <ConditionFilter v-model="shopQuery.shop" label="所属店铺" :options="shops" @change="linkedQuery.touch('shop')" />
        <ConditionFilter v-model="shopQuery.period" label="账期范围" type="period-range" :popover-width="380" @change="linkedQuery.touch('shop')" />
        <div v-if="linkedQuery.isSubmitArea('shop')" class="condition-filter-actions linked-query-actions">
          <el-button type="primary" @click="runQuery">查询</el-button>
          <el-button @click="linkedQuery.reset()">重置</el-button>
        </div>
      </div>
    </section>
    <MetricGrid :items="kpis" />

    <div class="summary-dimension-heading customer-dimension-heading"><strong>客户</strong></div>

    <section class="condition-query-panel receivable-summary-query">
      <div class="condition-filter-bar">
        <ConditionFilter v-model="query.customerNo" label="客户" type="text" :options="customers" search-placeholder="搜索名称 / 客户编号 / 会员编码" :popover-width="360" @change="linkedQuery.touch('customer')" />
        <ConditionFilter v-model="query.currency" label="结算币种" :options="['CNY','USD']" @change="linkedQuery.touch('customer')" />
        <ConditionFilter v-model="query.overdue" label="未收状态" :options="['逾期','未逾期']" @change="linkedQuery.touch('customer')" />
        <div v-if="linkedQuery.isSubmitArea('customer')" class="condition-filter-actions linked-query-actions">
          <el-button type="primary" @click="runQuery">查询</el-button>
          <el-button @click="linkedQuery.reset()">重置</el-button>
        </div>
      </div>
    </section>

    <section class="module-panel summary-table-panel">
      <DataTableFrame :total="filteredRecords.length" :page-size="10">
      <template #actions><DownloadButton title="下载营收汇总" file-name="营收汇总" :rows="{ customer: filteredRecords, shop: shopRecords }" :options="[{ label: '客户汇总', value: 'customer', description: '按当前客户筛选结果下载' }, { label: '店铺汇总', value: 'shop', description: '按当前店铺范围下载' }]" /></template>
<el-table
        :data="filteredRecords"
        class="clean-table receivable-summary-table"
        row-key="id"
        border
      >
        <el-table-column label="客户" min-width="220" fixed><template #default="scope"><StackedCell :primary="scope.row.customer" :secondary="`${scope.row.customerNo} / ${scope.row.memberCode}`" /></template></el-table-column>
        <el-table-column prop="shop" label="所属店铺" min-width="130" />
        <el-table-column prop="currency" label="结算币种" width="92" />
        <el-table-column label="应收金额" min-width="132"><template #default="scope">{{ money(scope.row.receivable, scope.row.currency) }}</template></el-table-column>
        <el-table-column label="已收金额" min-width="132"><template #default="scope">{{ money(scope.row.received, scope.row.currency) }}</template></el-table-column>
        <el-table-column label="应收未收" min-width="132"><template #default="scope"><span class="outstanding-amount">{{ money(scope.row.outstanding, scope.row.currency) }}</span></template></el-table-column>
        <el-table-column label="逾期未收" min-width="132"><template #default="scope"><span :class="{ 'overdue-amount': scope.row.overdue > 0 }">{{ money(scope.row.overdue, scope.row.currency) }}</span></template></el-table-column>
        <el-table-column label="待审核金额" min-width="132"><template #default="scope">{{ money(scope.row.pendingReview, scope.row.currency) }}</template></el-table-column>
        <el-table-column prop="billCount" label="账单数" width="78" />
        <el-table-column prop="outstandingBills" label="未结账单" width="88" />
        <el-table-column prop="oldestDue" label="最早到期日" width="112" />
        <el-table-column label="状态" width="82"><template #default="scope"><StatusTag :label="summaryStatus(scope.row)" /></template></el-table-column>
        <TableActionColumn compact>
          <template #default="scope">
            <el-button class="table-detail-button" link type="primary" :icon="View" title="查看账单" aria-label="查看账单" @click="openDetail(scope.row)" />
          </template>
        </TableActionColumn>
      </el-table>
      </DataTableFrame>
    </section>

    <el-dialog v-model="detailVisible" title="客户应收账单" class="module-dialog module-dialog-large" align-center append-to-body destroy-on-close>
      <div v-if="selectedSummary" class="drawer-summary"><div><StatusTag :label="summaryStatus(selectedSummary)" /><span>{{ selectedSummary.customer }}</span></div><strong>{{ money(selectedSummary.outstanding, selectedSummary.currency) }}</strong></div>
      <dl v-if="selectedSummary" class="inline-detail-grid">
        <div><dt>客户编号</dt><dd>{{ selectedSummary.customerNo }}</dd></div><div><dt>会员编码</dt><dd>{{ selectedSummary.memberCode }}</dd></div><div><dt>所属店铺</dt><dd>{{ selectedSummary.shop }}</dd></div><div><dt>结算币种</dt><dd>{{ selectedSummary.currency }}</dd></div>
        <div><dt>应收金额</dt><dd>{{ money(selectedSummary.receivable, selectedSummary.currency) }}</dd></div><div><dt>已收金额</dt><dd>{{ money(selectedSummary.received, selectedSummary.currency) }}</dd></div><div><dt>未结账单</dt><dd>{{ selectedSummary.outstandingBills }}</dd></div><div><dt>最早到期日</dt><dd>{{ selectedSummary.oldestDue }}</dd></div>
      </dl>
      <DataTableFrame v-if="selectedSummary" :total="2" :page-size="10">
<el-table :data="[
        { no: `ARB-${selectedSummary.customerNo}-202607-a3f1`, period: '2026/07/21 - 2026/07/27', due: selectedSummary.oldestDue, amount: selectedSummary.outstanding * 0.62, status: selectedSummary.overdue > 0 ? '已逾期' : '待回款' },
        { no: `ARB-${selectedSummary.customerNo}-202608-f892`, period: '2026/07/28 - 2026/08/03', due: '2026-08-18', amount: selectedSummary.outstanding * 0.38, status: '待回款' },
      ]" border class="clean-table summary-bill-table">
        <el-table-column prop="no" label="应收账单编号" min-width="210" /><el-table-column prop="period" label="账期" min-width="180" /><el-table-column prop="due" label="到期日" width="115" /><el-table-column label="未收金额" min-width="140"><template #default="scope">{{ money(scope.row.amount, selectedSummary.currency) }}</template></el-table-column><el-table-column label="状态" width="90"><template #default="scope"><StatusTag :label="scope.row.status" /></template></el-table-column>
      </el-table>
      </DataTableFrame>
    </el-dialog>
  </div>
</template>

<style scoped>
.receivable-summary-page { --summary-vertical-gap: var(--space-3); display: flex; flex-direction: column; gap: var(--summary-vertical-gap); }
.receivable-summary-page > .condition-query-panel { margin-bottom: 0; }
.receivable-summary-page :deep(.module-kpis) { margin-bottom: 0; }
.summary-scope-row { margin: 0; padding: 0; display: flex; gap: var(--space-3); }
.summary-dimension-heading { min-height: 38px; display: flex; align-items: center; border-bottom: 1px solid var(--border); }
.customer-dimension-heading { margin-top: var(--space-2); }
.summary-dimension-heading strong { position: relative; height: 38px; padding-left: var(--space-3); display: inline-flex; align-items: center; color: var(--primary); font-size: var(--section-title-font-size); font-weight: var(--font-weight-semibold); }
.summary-dimension-heading strong::before { content: "◤"; position: absolute; left: 0; color: var(--primary); font-size: var(--font-size-body); line-height: 1; transform: translateY(-1px); }
.summary-table-panel { overflow: visible; }
.outstanding-amount { color: #9a611a; font-variant-numeric: tabular-nums; }
.overdue-amount { color: #b6424d; font-weight: var(--font-weight-semibold); }
.summary-bill-table { margin-top: var(--space-4); }
</style>
