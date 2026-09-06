<script setup>
import { computed, ref, watch } from 'vue'
import BillGenerationDialog from './BillGenerationDialog.vue'
import BillAdjustmentRecordsPanel from './BillAdjustmentRecordsPanel.vue'
import BillRateTables from './BillRateTables.vue'
import DeductionFeeLabel from './DeductionFeeLabel.vue'
import RefundRecoveryPanel from './RefundRecoveryPanel.vue'
import RefundOrderRowsPanel from './RefundOrderRowsPanel.vue'
import ConditionFilter from '../../shared/components/ConditionFilter.vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import DownloadButton from '../../shared/components/DownloadButton.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import { billWriteoffFixtures, deductionDetailFixtures, receivableOrderFeeFixtures, refundDetailFixtures, refundNegativeCarryFixtures, refundRecoveryFixtures } from '../../data/fixtures/billDetail.js'
import { billingAdjustmentFixtures, billingAdjustmentSeedVersion } from '../../data/fixtures/billingAdjustments.js'
import { useDemoDataset } from '../data/useDemoDataset.js'
import { adjustmentImpactByCurrency } from '../data/adjustmentRecords.js'
import { deductionFeeDisplayName, isZeroFeeAmount } from '../data/feeDisplayLabels.js'

const props = defineProps({
  bill: { type: Object, required: true },
  isReceivable: { type: Boolean, required: true },
})
const emit = defineEmits(['action'])
const activeTab = ref(props.isReceivable ? 'rates' : 'info')
const feeView = ref('horizontal')
const feeAmountDimension = ref('settlement')
const refundSummaryDimension = ref('settlement')
const feeBusinessNo = ref('')
const showUnboundFees = ref(false)
const previewVisible = ref(false)
const previewAction = ref('')
const generationDialog = ref(null)

watch(() => [props.bill.billNo, props.isReceivable], () => {
  activeTab.value = props.isReceivable ? 'rates' : 'info'
  feeView.value = 'horizontal'
  feeAmountDimension.value = 'settlement'
  refundSummaryDimension.value = 'settlement'
  feeBusinessNo.value = ''
  showUnboundFees.value = false
})

const money = (value) => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const feeAmountText = (value, currency = 'CNY') => value === null || value === undefined || isZeroFeeAmount(value) ? '--' : `${money(value)} ${currency}`
const signedAmountText = (value, currency) => value === null || value === undefined
  ? '--'
  : `${Number(value) > 0 ? '+' : ''}${money(value)} ${currency}`
const statusClass = computed(() => props.bill.status === '已结清' ? 'success' : props.bill.status === '待结清' ? 'running' : 'warning')
const adjustmentRows = useDemoDataset('billingAdjustments', billingAdjustmentFixtures, billingAdjustmentSeedVersion)
const linkedAmountReversals = computed(() => adjustmentRows.value.filter((row) => (
  row.billType === (props.isReceivable ? 'AR' : 'RF')
  && (row.assignedBill || row.billNo) === props.bill.billNo
)))
const adjustmentImpacts = computed(() => new Map(
  adjustmentImpactByCurrency(adjustmentRows.value, props.bill.billNo).map(item => [item.currency, item]),
))
function reversalAmount(currency, period) {
  const impact = adjustmentImpacts.value.get(currency)
  return period === 'CURRENT' ? impact?.current ?? null : impact?.prior ?? null
}
const arCurrencyBuckets = computed(() => {
  const rows = [{ currency: props.bill.currency, state: '待收款', due: props.bill.amount, settled: props.bill.paid }]
  if (props.bill.secondCurrency) rows.push({ currency: props.bill.secondCurrency, state: '已核销', due: props.bill.secondAmount, settled: props.bill.secondPaid || 0 })
  return rows.map((row) => ({
    ...row,
    currentAdjustment: reversalAmount(row.currency, 'CURRENT'),
    previousAdjustment: reversalAmount(row.currency, 'PRIOR'),
    pending: Number(row.due || 0) - Number(row.settled || 0),
  }))
})
const arRates = computed(() => [
  { settlement: props.bill.currency, target: 'TWD', direction: `${props.bill.currency} → TWD`, rate: '1.000000' },
  ...(props.bill.secondCurrency ? [{ settlement: props.bill.secondCurrency, target: 'CNY', direction: `CNY → ${props.bill.secondCurrency}`, rate: '1.000000' }] : []),
])
const arFeeSummary = computed(() => arCurrencyBuckets.value.map((bucket) => {
  const current = Number(bucket.currentAdjustment || 0)
  const previous = Number(bucket.previousAdjustment || 0)
  const baseAmount = Number(bucket.due || 0) - current - previous
  return {
    fee: '费项合计（冲正前）',
    currency: bucket.currency,
    amount: baseAmount,
    written: bucket.settled,
    pending: Number(bucket.pending || 0) - current - previous,
  }
}))
const arOrderFeeRows = useDemoDataset('billingReceivableOrderFees', receivableOrderFeeFixtures, 2)
const filteredArOrderFeeRows = computed(() => arOrderFeeRows.value.filter((row) => !feeBusinessNo.value || row.businessNo.includes(feeBusinessNo.value.trim())))
const arFeeColumns = [
  { key: 'freight', label: '运费', minWidth: 170 },
  { key: 'deliverySurcharge', label: '派送附加费', minWidth: 170 },
  { key: 'warehouseFee', label: '仓储费', minWidth: 150 },
  { key: 'operationFee', label: '操作费', minWidth: 150 },
  { key: 'marketingDiscount', label: deductionFeeDisplayName('满减活动优惠金额'), minWidth: 260, deduction: true },
  { key: 'couponDiscount', label: deductionFeeDisplayName('优惠券优惠金额'), minWidth: 260, deduction: true },
  { key: 'integralDiscount', label: deductionFeeDisplayName('积分优惠金额'), minWidth: 235, deduction: true },
  { key: 'claimFee', label: deductionFeeDisplayName('理赔费'), minWidth: 170, deduction: true },
]
const arVerticalFeeRows = computed(() => filteredArOrderFeeRows.value.flatMap((row) => arFeeColumns
  .map(column => ({ column, amount: row[column.key] }))
  .filter(({ amount }) => amount !== null && amount !== undefined)
  .map(({ column, amount }, index) => ({ feeNo: `FEE-${row.businessNo.slice(-8)}-${index + 1}`, businessNo: row.businessNo, lastMileNo: row.lastMileNo, fee: column.label, isDeduction: column.deduction, currency: 'CNY', amount }))))
const refundSummary = computed(() => {
  const bill = props.bill
  const sourceCurrency = bill.sourceCurrency || bill.currency
  const settlementCurrency = bill.settlementCurrency || bill.currency
  const baseCurrency = bill.baseCurrency || 'CNY'
  const payableRefund = Number(bill.payableRefund ?? 0)
  const specifiedDeduction = Number(bill.specifiedDeduction ?? bill.deduction ?? 0)
  const provisionalRefund = Number(bill.provisionalRefund ?? (payableRefund - specifiedDeduction))
  const refundRate = Number(bill.refundRate ?? 1)
  const actualRefund = Number(bill.actualRefund ?? bill.amount ?? (provisionalRefund * refundRate))
  const returned = Number(bill.paid ?? 0)
  const baseRate = Number(bill.baseRate ?? (settlementCurrency === baseCurrency ? 1 : 4.2))
  const settlementPayable = payableRefund * refundRate
  const settlementDeduction = specifiedDeduction * refundRate
  const baseActual = Number(bill.baseRefundable ?? (actualRefund * baseRate))
  const baseReturned = Number(bill.baseReturned ?? (returned * baseRate))
  const basePayable = settlementPayable * baseRate
  const baseDeduction = settlementDeduction * baseRate
  const settlementBuckets = Array.isArray(bill.refundCurrencyBuckets) && bill.refundCurrencyBuckets.length
    ? bill.refundCurrencyBuckets.map((bucket) => ({
        sourceCurrency: bucket.sourceCurrency || sourceCurrency,
        currency: bucket.currency,
        refundRate: Number(bucket.refundRate ?? 1),
        baseRate: Number(bucket.baseRate ?? (bucket.currency === baseCurrency ? 1 : 0)),
        payable: Number(bucket.payable ?? 0),
        deduction: Number(bucket.deduction ?? 0),
        actual: Number(bucket.actual ?? 0),
        paid: Number(bucket.paid ?? 0),
        pending: Number(bucket.pending ?? Math.max(Number(bucket.actual ?? 0) - Number(bucket.paid ?? 0), 0)),
        currentAdjustment: reversalAmount(bucket.currency, 'CURRENT'),
        previousAdjustment: reversalAmount(bucket.currency, 'PRIOR'),
      }))
    : [{
        sourceCurrency,
        currency: settlementCurrency,
        refundRate,
        baseRate,
        payable: settlementPayable,
        deduction: settlementDeduction,
        actual: actualRefund,
        paid: returned,
        pending: Math.max(actualRefund - returned, 0),
        currentAdjustment: reversalAmount(settlementCurrency, 'CURRENT'),
        previousAdjustment: reversalAmount(settlementCurrency, 'PRIOR'),
      }]
  const baseBucket = settlementBuckets.reduce((total, bucket) => ({
    currency: baseCurrency,
    payable: total.payable + bucket.payable * bucket.baseRate,
    deduction: total.deduction + bucket.deduction * bucket.baseRate,
    actual: total.actual + bucket.actual * bucket.baseRate,
    paid: total.paid + bucket.paid * bucket.baseRate,
    pending: total.pending + bucket.pending * bucket.baseRate,
    currentAdjustment: bucket.currentAdjustment === null
      ? total.currentAdjustment
      : Number(total.currentAdjustment || 0) + bucket.currentAdjustment * bucket.baseRate,
    previousAdjustment: bucket.previousAdjustment === null
      ? total.previousAdjustment
      : Number(total.previousAdjustment || 0) + bucket.previousAdjustment * bucket.baseRate,
  }), { currency: baseCurrency, payable: 0, deduction: 0, actual: 0, paid: 0, pending: 0, currentAdjustment: null, previousAdjustment: null })
  return {
    sourceCurrency,
    settlementCurrency,
    baseCurrency,
    payableRefund,
    specifiedDeduction,
    provisionalRefund,
    refundRate,
    settlementPayable,
    settlementDeduction,
    actualRefund,
    returned,
    pendingRefund: Math.max(actualRefund - returned, 0),
    baseRate,
    basePayable,
    baseDeduction,
    baseActual,
    baseReturned,
    basePending: Math.max(baseActual - baseReturned, 0),
    settlementBuckets,
    baseBucket,
    exchangeGainLoss: bill.exchangeGainLoss ?? 0,
  }
})
const amountText = (value, currency) => value === null || value === undefined ? '--' : `${money(value)} ${currency}`
const rateText = (value) => value === null || value === undefined ? '--' : Number(value).toFixed(6)
const refundSummaryOptions = [
  { label: '返款结算币', value: 'settlement' },
  { label: '财务本位币', value: 'base' },
]
const selectedRefundSummaries = computed(() => {
  const summary = refundSummary.value
  return refundSummaryDimension.value === 'base' ? [summary.baseBucket] : summary.settlementBuckets
})
const refundSettlementRates = computed(() => {
  const summary = refundSummary.value
  const rows = summary.settlementBuckets.map(bucket => ({
    settlement: bucket.currency,
    target: summary.baseCurrency,
    direction: `${bucket.currency} → ${summary.baseCurrency}`,
    rate: rateText(bucket.baseRate),
  }))
  return rows.filter((row, index) => rows.findIndex(candidate => candidate.direction === row.direction && candidate.rate === row.rate) === index)
})
const refundOriginalRates = computed(() => {
  const rows = refundSummary.value.settlementBuckets.map(bucket => ({
    settlement: bucket.currency,
    target: bucket.sourceCurrency,
    direction: `${bucket.sourceCurrency} → ${bucket.currency}`,
    rate: rateText(bucket.refundRate),
  }))
  return rows.filter((row, index) => rows.findIndex(candidate => candidate.direction === row.direction && candidate.rate === row.rate) === index)
})
const refundDetailRows = useDemoDataset('billingRefundDetails', refundDetailFixtures, 6)
const deductionDetailRows = useDemoDataset('billingDeductionDetails', deductionDetailFixtures, 5)
const writeoffRows = useDemoDataset('billingWriteoffs', billWriteoffFixtures, 2)
const recoveryRows = useDemoDataset('billingRefundRecoveries', refundRecoveryFixtures, 5)
const negativeCarryRows = useDemoDataset('billingRefundNegativeCarries', refundNegativeCarryFixtures, 2)
const refundDetails = computed(() => refundDetailRows.value.filter((row) => row.billNo === props.bill.billNo))
const deductionDetails = computed(() => deductionDetailRows.value.filter((row) => row.billNo === props.bill.billNo))
const writeoffs = computed(() => writeoffRows.value.filter((row) => row.billNo === props.bill.billNo))
const adjustments = computed(() => linkedAmountReversals.value)
const recoveries = computed(() => recoveryRows.value.filter((row) => row.billNo === props.bill.billNo))
const negativeCarryRecords = computed(() => negativeCarryRows.value.filter((row) => row.billNo === props.bill.billNo))
function openPreview(action) { previewAction.value = action; previewVisible.value = true }
function confirmPreview() { previewVisible.value = false; emit('action', previewAction.value) }
function openGeneration() { generationDialog.value?.open() }
</script>

<template>
  <div class="bill-detail-reference">
    <section class="bill-detail-overview">
      <div class="bill-detail-identity">
        <div class="bill-detail-title-line">
          <strong>{{ bill.billNo }}</strong>
          <StatusTag :label="bill.status" :tone="statusClass" />
          <StatusTag v-if="bill.processingState" :label="bill.processingState" tone="running" />
        </div>
        <div class="bill-detail-meta">
          <span class="period-chip">{{ bill.periodType }} <i></i> {{ bill.periodStart }} ~ {{ bill.periodEnd }}</span>
          <span>{{ bill.customer }}</span><i></i><span>{{ bill.memberCode || bill.customerNo }}</span><i></i><span>{{ bill.shop }}</span><template v-if="isReceivable"><i></i><span>{{ bill.sector }}</span></template><i></i><span>{{ bill.country }}</span>
          <i></i><span>账期收口：{{ bill.closeStatus }}</span>
        </div>
      </div>
      <div class="bill-detail-actions">
        <template v-if="isReceivable">
          <el-button v-if="bill.status === '待审核' && bill.closeStatus === '已收口' && !bill.processingState" @click="emit('action', '审核通过')">审核通过</el-button>
          <el-button v-if="bill.status === '待审核' && !bill.processingState" @click="openGeneration">账单生成</el-button>
          <el-button v-if="!['已结清','已作废'].includes(bill.status) && !bill.processingState" @click="openPreview('账单重算')">账单重算</el-button>
          <DownloadButton type="primary" plain title="下载账单" :file-name="bill.billNo" :rows="{ bill: [bill], 'fee-detail': filteredArOrderFeeRows }" :options="[{ label: '账单文件', value: 'bill', description: '下载账单基本信息和金额汇总' }, { label: '费项明细', value: 'fee-detail', description: '下载账单费项明细' }]" />
        </template>
        <template v-else>
          <el-button v-if="bill.status === '待审核' && bill.closeStatus === '已收口' && !bill.processingState" @click="emit('action', '审核通过')">审核通过</el-button>
          <el-button v-if="bill.status === '待审核' && bill.closeStatus === '未收口' && !bill.processingState" @click="emit('action', '提前收口并审核')">提前收口并审核</el-button>
          <el-button v-if="bill.status === '待结清' && !bill.processingState" @click="emit('action', '退回待审核')">退回待审核</el-button>
          <el-button v-if="bill.status === '待审核' && !bill.processingState" @click="openGeneration">账单生成</el-button>
          <el-button v-if="!['已结清','已作废'].includes(bill.status) && !bill.processingState" @click="openPreview('账单重算')">账单重算</el-button>
          <el-button v-if="bill.status === '待结清' && !bill.processingState" @click="emit('action', '登记返款')">登记返款</el-button>
          <el-button @click="emit('action', '打开调账中心')">调账中心</el-button>
          <DownloadButton type="primary" plain title="导出明细" :file-name="bill.billNo" :rows="{ 'refund-detail': refundDetails }" :options="[{ label: '返款账单明细', value: 'refund-detail', description: '导出当前返款账单及关联明细' }]" />
        </template>
      </div>
    </section>

    <section v-if="isReceivable" class="bill-money-section">
      <h3>费项结算币种金额</h3>
      <div class="currency-bucket-grid">
        <article v-for="bucket in arCurrencyBuckets" :key="bucket.currency" class="currency-bucket">
          <div class="currency-bucket-head"><strong>{{ bucket.currency }}</strong><StatusTag :label="bucket.state" :tone="bucket.state === '已核销' ? 'success' : 'neutral'" /></div>
          <dl>
            <div><dt>应收金额</dt><dd>{{ amountText(bucket.due, bucket.currency) }}</dd></div>
            <div><dt>本期账单金额冲正</dt><dd>{{ signedAmountText(bucket.currentAdjustment, bucket.currency) }}</dd></div>
            <div><dt>往期账单金额冲正</dt><dd>{{ signedAmountText(bucket.previousAdjustment, bucket.currency) }}</dd></div>
            <div><dt>已收金额</dt><dd>{{ amountText(bucket.settled, bucket.currency) }}</dd></div>
            <div><dt>待收金额</dt><dd>{{ amountText(bucket.pending, bucket.currency) }}</dd></div>
          </dl>
          <el-button type="primary" plain :disabled="Boolean(bill.processingState)" @click="emit('action', `${bucket.currency}费用核销`)">费用核销</el-button>
        </article>
      </div>
    </section>

    <section v-else class="refund-money-grid refund-summary-grid">
      <div class="condition-filter-bar refund-summary-switch">
        <ConditionFilter
          v-model="refundSummaryDimension"
          label="汇总金额币种"
          :options="refundSummaryOptions"
          :clearable="false"
          :popover-width="240"
        />
      </div>
      <article v-for="bucket in selectedRefundSummaries" :key="bucket.currency" class="refund-money-panel">
        <div class="currency-bucket-head refund-bucket-head">
          <div class="refund-bucket-identity">
            <strong>{{ bucket.currency }}</strong>
          </div>
          <el-button
            v-if="refundSummaryDimension === 'settlement'"
            type="primary"
            :disabled="Boolean(bill.processingState)"
            @click="emit('action', `${bucket.currency}返款核销`)"
          >核销</el-button>
        </div>
        <dl class="money-metrics">
          <div><dt>应付返款</dt><dd>{{ amountText(bucket.payable, bucket.currency) }}</dd></div>
          <div><dt>扣减费项</dt><dd>{{ amountText(bucket.deduction, bucket.currency) }}</dd></div>
          <div><dt>本期账单金额冲正</dt><dd>{{ signedAmountText(bucket.currentAdjustment, bucket.currency) }}</dd></div>
          <div><dt>往期账单金额冲正</dt><dd>{{ signedAmountText(bucket.previousAdjustment, bucket.currency) }}</dd></div>
          <div><dt>实付返款</dt><dd>{{ amountText(bucket.actual, bucket.currency) }}</dd></div>
          <div><dt>已付返款</dt><dd>{{ amountText(bucket.paid, bucket.currency) }}</dd></div>
          <div><dt>待付返款</dt><dd>{{ amountText(bucket.pending, bucket.currency) }}</dd></div>
        </dl>
      </article>
    </section>

    <el-tabs v-if="isReceivable" v-model="activeTab" class="bill-detail-tabs">
      <el-tab-pane label="账单汇率" name="rates">
        <BillRateTables
          subject="费项"
          :settlement-rates="arRates"
          :original-rates="arRates"
          :can-edit="bill.status === '待审核'"
          @save="emit('action', '保存账单特调汇率')"
        />
      </el-tab-pane>
      <el-tab-pane label="费用汇总" name="summary">
<DataTableFrame :total="arFeeSummary.length" :page-size="20"><el-table :data="arFeeSummary" border class="clean-table"><el-table-column prop="fee" label="费项" /><el-table-column prop="currency" label="结算币种" /><el-table-column label="应收金额"><template #default="scope">{{ scope.row.displayEmpty ? signedAmountText(scope.row.amount, scope.row.currency) : amountText(scope.row.amount, scope.row.currency) }}</template></el-table-column><el-table-column label="已收金额"><template #default="scope">{{ amountText(scope.row.written, scope.row.currency) }}</template></el-table-column><el-table-column label="待收金额"><template #default="scope">{{ amountText(scope.row.pending, scope.row.currency) }}</template></el-table-column></el-table></DataTableFrame></el-tab-pane>
      <el-tab-pane label="费用明细" name="details">
        <div class="fee-detail-workbench">
          <div class="fee-detail-viewbar">
            <div class="fee-view-switch"><button :class="{ active: feeView === 'horizontal' }" @click="feeView = 'horizontal'">费项横表视图</button><button :class="{ active: feeView === 'vertical' }" @click="feeView = 'vertical'">费项纵表视图</button></div>
            <span class="fee-dimension-label">金额币种</span>
            <el-select v-model="feeAmountDimension" class="fee-amount-dimension"><el-option label="费项结算币种金额" value="settlement" /><el-option label="费项原始币种金额" value="original" /><el-option label="财务本位币金额" value="base" /></el-select>
            <el-checkbox v-model="showUnboundFees">非业务订单下挂费项（0）</el-checkbox>
          </div>
          <section class="condition-query-panel"><div class="condition-filter-bar"><ConditionFilter v-model="feeBusinessNo" label="业务单号" type="text" /></div></section>
          <DataTableFrame
            :total="feeView === 'horizontal' ? filteredArOrderFeeRows.length : arVerticalFeeRows.length"
          >
            <template #actions><el-button type="primary" @click="emit('action', '补录费项')">补录费项</el-button></template>
<el-table v-if="feeView === 'horizontal'" :data="filteredArOrderFeeRows" border class="clean-table fee-horizontal-table">
            <el-table-column prop="businessNo" label="业务单号" width="245" fixed />
            <el-table-column prop="lastMileNo" label="尾程运单号" width="215" />
            <el-table-column prop="firstMileNo" label="首程运单号" width="215" />
            <el-table-column v-for="column in arFeeColumns" :key="column.key" :min-width="column.minWidth">
              <template #header><DeductionFeeLabel v-if="column.deduction" :name="column.label" /><span v-else>{{ column.label }}</span></template>
              <template #default="scope">{{ feeAmountText(scope.row[column.key]) }}</template>
            </el-table-column>
          </el-table>
<el-table v-else :data="arVerticalFeeRows" border class="clean-table fee-vertical-table">
            <el-table-column prop="feeNo" label="费用编号" width="190" /><el-table-column prop="businessNo" label="业务单号" width="220" /><el-table-column prop="lastMileNo" label="尾程运单号" width="180" /><el-table-column label="费项" min-width="230"><template #default="scope"><DeductionFeeLabel v-if="scope.row.isDeduction" :name="scope.row.fee" /><span v-else>{{ scope.row.fee }}</span></template></el-table-column><el-table-column prop="currency" label="币种" width="90" /><el-table-column label="结算金额"><template #default="scope">{{ feeAmountText(scope.row.amount, scope.row.currency) }}</template></el-table-column>
          </el-table>
          </DataTableFrame>
        </div>
      </el-tab-pane>
     <el-tab-pane label="调整记录" name="adjustments">
       <BillAdjustmentRecordsPanel :records="adjustments" :assigned-bill-no="bill.billNo" />
     </el-tab-pane>
      <el-tab-pane label="核销记录" name="writeoffs">
<DataTableFrame :total="writeoffs.length" :page-size="20"><el-table :data="writeoffs" border class="clean-table"><el-table-column prop="no" label="核销编号" /><el-table-column prop="type" label="核销类型" /><el-table-column prop="currency" label="币种" /><el-table-column label="核销金额"><template #default="scope">{{ money(scope.row.amount) }}</template></el-table-column><el-table-column prop="time" label="核销时间" /><el-table-column prop="operator" label="操作人" /></el-table></DataTableFrame></el-tab-pane>
    </el-tabs>

    <el-tabs v-else v-model="activeTab" class="bill-detail-tabs">
      <el-tab-pane label="账单概况" name="info"><dl class="bill-info-grid"><div><dt>账单编号</dt><dd>{{ bill.billNo }}</dd></div><div><dt>账单状态</dt><dd>{{ bill.status }}</dd></div><div><dt>账期收口状态</dt><dd>{{ bill.closeStatus }}</dd></div><div><dt>客户</dt><dd>{{ bill.customer }}</dd></div><div><dt>会员编码</dt><dd>{{ bill.memberCode || bill.customerNo }}</dd></div><div><dt>所属店铺快照</dt><dd>{{ bill.shopCode ? `${bill.shopCode} / ${bill.shop}` : bill.shop }}</dd></div><div><dt>目的国</dt><dd>{{ bill.country }}</dd></div><div><dt>账期类型</dt><dd>{{ bill.periodType }}</dd></div><div><dt>实际账期起止日</dt><dd>{{ bill.periodStart }} ~ {{ bill.periodEnd }}</dd></div><div><dt>截断账期标记</dt><dd>{{ bill.truncatedPeriod || '否' }}</dd></div><div><dt>数据截止点</dt><dd>{{ bill.dataCutoffAt || `${bill.periodEnd} 23:59:59` }}</dd></div></dl></el-tab-pane>
      <el-tab-pane label="账单汇率" name="rates">
        <BillRateTables
          subject="返款"
          :settlement-rates="refundSettlementRates"
          :original-rates="refundOriginalRates"
          :can-edit="bill.status === '待审核'"
          @save="emit('action', '保存账单特调汇率')"
        />
      </el-tab-pane>
      <el-tab-pane label="返款明细" name="refunds">
        <RefundOrderRowsPanel
          :rows="refundDetails"
          :deductions="deductionDetails"
          :base-currency="refundSummary.baseCurrency"
          :base-rate="refundSummary.baseRate"
        />
      </el-tab-pane>
      <el-tab-pane label="汇兑损益" name="recoveries">
        <RefundRecoveryPanel :bill-no="bill.billNo" :base-currency="refundSummary.baseCurrency" />
      </el-tab-pane>
      <el-tab-pane label="调整记录" name="adjustment-records">
        <BillAdjustmentRecordsPanel
          :records="adjustments"
          :negative-records="negativeCarryRecords"
          :assigned-bill-no="bill.billNo"
        />
      </el-tab-pane>
      <el-tab-pane label="核销记录" name="writeoff-records">
        <DataTableFrame :total="writeoffs.length" :page-size="20">
          <el-table :data="writeoffs" border class="clean-table">
            <el-table-column prop="no" label="核销编号" min-width="190" />
            <el-table-column prop="type" label="核销类型" min-width="130" />
            <el-table-column prop="currency" label="币种" min-width="90" />
            <el-table-column label="核销金额" min-width="150"><template #default="scope">{{ amountText(scope.row.amount, scope.row.currency) }}</template></el-table-column>
            <el-table-column prop="time" label="核销时间" min-width="165" />
            <el-table-column prop="operator" label="操作人" min-width="120" />
          </el-table>
        </DataTableFrame>
      </el-tab-pane>
    </el-tabs>

    <BillGenerationDialog ref="generationDialog" :bill="bill" :is-receivable="isReceivable" @submit="emit('action', '创建账单生成任务')" />

    <el-dialog v-model="previewVisible" :title="`${previewAction}预览`" class="module-dialog" align-center append-to-body destroy-on-close>
      <dl class="bill-info-grid"><div><dt>账单编号</dt><dd>{{ bill.billNo }}</dd></div><div><dt>客户</dt><dd>{{ bill.customer }}</dd></div><div><dt>当前账单状态</dt><dd>{{ bill.status }}</dd></div><div><dt>当前收口状态</dt><dd>{{ bill.closeStatus }}</dd></div><div><dt>影响范围</dt><dd>当前账单及其账期内已归属费项</dd></div><div><dt>处理结果</dt><dd>创建账单重算任务</dd></div></dl>
      <template #footer><el-button @click="previewVisible=false">取消</el-button><el-button type="primary" @click="confirmPreview">确认执行</el-button></template>
    </el-dialog>

  </div>
</template>

<style scoped>
.refund-negative-note {
  margin: 10px 0 2px;
  padding: 8px 10px;
  border-left: 3px solid #e6a23c;
  background: #fdf6ec;
  color: #7a5a24;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}
</style>
