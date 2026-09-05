<script setup>
import { computed, ref, watch } from 'vue'
import { EditPen } from '@element-plus/icons-vue'
import BillGenerationDialog from './BillGenerationDialog.vue'
import RefundRecoveryPanel from './RefundRecoveryPanel.vue'
import ConditionFilter from '../../shared/components/ConditionFilter.vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import DownloadButton from '../../shared/components/DownloadButton.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import { billAdjustmentLinkFixtures, billWriteoffFixtures, deductionDetailFixtures, receivableOrderFeeFixtures, refundDetailFixtures } from '../../data/fixtures/billDetail.js'
import { useDemoDataset } from '../data/useDemoDataset.js'

const props = defineProps({
  bill: { type: Object, required: true },
  isReceivable: { type: Boolean, required: true },
})
const emit = defineEmits(['action'])
const activeTab = ref(props.isReceivable ? 'rates' : 'info')
const feeView = ref('horizontal')
const feeAmountDimension = ref('settlement')
const feeBusinessNo = ref('')
const showUnboundFees = ref(false)
const previewVisible = ref(false)
const previewAction = ref('')
const rateEditorVisible = ref(false)
const editableRates = ref([])
const generationDialog = ref(null)

watch(() => [props.bill.billNo, props.isReceivable], () => {
  activeTab.value = props.isReceivable ? 'rates' : 'info'
  feeView.value = 'horizontal'
  feeAmountDimension.value = 'settlement'
  feeBusinessNo.value = ''
  showUnboundFees.value = false
})

const money = (value) => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const statusClass = computed(() => props.bill.status === '已结清' ? 'success' : props.bill.status === '待结清' ? 'running' : 'warning')
const arCurrencyBuckets = computed(() => {
  const rows = [{ currency: props.bill.currency, state: '待收款', due: props.bill.amount, settled: props.bill.paid, pending: props.bill.amount - props.bill.paid }]
  if (props.bill.secondCurrency) rows.push({ currency: props.bill.secondCurrency, state: '已核销', due: props.bill.secondAmount, settled: 0, pending: props.bill.secondAmount })
  return rows
})
const arRates = computed(() => [
  { settlement: props.bill.currency, target: 'TWD', direction: `${props.bill.currency} → TWD`, rate: '1.000000' },
  ...(props.bill.secondCurrency ? [{ settlement: props.bill.secondCurrency, target: 'CNY', direction: `CNY → ${props.bill.secondCurrency}`, rate: '1.000000' }] : []),
])
const arFeeSummary = computed(() => [
  { fee: '基础运费', currency: props.bill.currency, amount: props.bill.amount, written: props.bill.paid, pending: props.bill.amount - props.bill.paid },
  ...(props.bill.secondCurrency ? [{ fee: '往期账单冲正', currency: props.bill.secondCurrency, amount: props.bill.secondAmount, written: 0, pending: props.bill.secondAmount }] : []),
])
const arOrderFeeRows = useDemoDataset('billingReceivableOrderFees', receivableOrderFeeFixtures)
const filteredArOrderFeeRows = computed(() => arOrderFeeRows.value.filter((row) => !feeBusinessNo.value || row.businessNo.includes(feeBusinessNo.value.trim())))
const arVerticalFeeRows = computed(() => filteredArOrderFeeRows.value.flatMap((row) => [
  ['运费', row.freight], ['派送附加费', row.deliverySurcharge], ['仓储费', row.warehouseFee], ['操作费', row.operationFee],
].filter(([, amount]) => amount !== null).map(([fee, amount], index) => ({ feeNo: `FEE-${row.businessNo.slice(-8)}-${index + 1}`, businessNo: row.businessNo, lastMileNo: row.lastMileNo, fee, currency: 'CNY', amount }))))
const refundSummary = computed(() => {
  const bill = props.bill
  const sourceCurrency = bill.sourceCurrency || bill.currency
  const settlementCurrency = bill.settlementCurrency || bill.currency
  const baseCurrency = bill.baseCurrency || 'CNY'
  const codSurcharge = Number(bill.codSurcharge ?? 0)
  const payableRefund = Number(bill.payableRefund ?? bill.original ?? 0)
  const specifiedDeduction = Number(bill.specifiedDeduction ?? bill.deduction ?? 0)
  const provisionalRefund = Number(bill.provisionalRefund ?? (payableRefund - specifiedDeduction))
  const refundRate = Number(bill.refundRate ?? 1)
  const actualRefund = Number(bill.actualRefund ?? bill.amount ?? (provisionalRefund * refundRate))
  const returned = Number(bill.paid ?? 0)
  const baseRate = Number(bill.baseRate ?? (settlementCurrency === baseCurrency ? 1 : 4.2))
  const baseActual = Number(bill.baseRefundable ?? (actualRefund * baseRate))
  const baseReturned = Number(bill.baseReturned ?? (returned * baseRate))
  return {
    sourceCurrency,
    settlementCurrency,
    baseCurrency,
    codSurcharge,
    payableRefund,
    specifiedDeduction,
    provisionalRefund,
    refundRate,
    actualRefund,
    returned,
    pendingRefund: Math.max(actualRefund - returned, 0),
    baseRate,
    baseActual,
    baseReturned,
    basePending: Math.max(baseActual - baseReturned, 0),
    exchangeGainLoss: bill.exchangeGainLoss ?? 0,
    writeoffState: actualRefund > 0 && returned >= actualRefund ? '已核销' : returned > 0 ? '部分核销' : '待核销',
  }
})
const amountText = (value, currency) => value === null || value === undefined ? '--' : `${money(value)} ${currency}`
const rateText = (value) => value === null || value === undefined ? '--' : Number(value).toFixed(6)
const refundRates = computed(() => {
  const summary = refundSummary.value
  const rows = [{
    source: summary.sourceCurrency,
    target: summary.settlementCurrency,
    direction: `${summary.sourceCurrency} → ${summary.settlementCurrency}`,
    sourceName: '返款币种配置快照',
    rate: rateText(summary.refundRate),
    state: '已锁定',
  }]
  if (summary.settlementCurrency !== summary.baseCurrency) rows.push({
    source: summary.settlementCurrency,
    target: summary.baseCurrency,
    direction: `${summary.settlementCurrency} → ${summary.baseCurrency}`,
    sourceName: '财务本位币汇率快照',
    rate: rateText(summary.baseRate),
    state: '已锁定',
  })
  return rows
})
const refundDetailRows = useDemoDataset('billingRefundDetails', refundDetailFixtures, 2)
const deductionDetailRows = useDemoDataset('billingDeductionDetails', deductionDetailFixtures, 2)
const writeoffRows = useDemoDataset('billingWriteoffs', billWriteoffFixtures, 2)
const adjustmentRows = useDemoDataset('billingBillAdjustmentLinks', billAdjustmentLinkFixtures)
const refundDetails = computed(() => refundDetailRows.value.filter((row) => row.billNo === props.bill.billNo))
const deductionDetails = computed(() => deductionDetailRows.value.filter((row) => row.billNo === props.bill.billNo))
const writeoffs = computed(() => writeoffRows.value.filter((row) => row.billNo === props.bill.billNo))
const adjustments = computed(() => adjustmentRows.value.filter((row) => row.billNo === props.bill.billNo))
const relatedRecords = computed(() => [
  ...adjustments.value.map((row) => ({ adjustmentNo: row.no, adjustmentStatus: row.status, writeoffNo: '--', writeoffType: '调账', currency: row.currency, amount: row.delta, time: row.adjustedAt, operator: row.operator || '财务管理员' })),
  ...writeoffs.value.map((row) => ({ adjustmentNo: '--', adjustmentStatus: '--', writeoffNo: row.no, writeoffType: row.type, currency: row.currency, amount: row.amount, time: row.time, operator: row.operator })),
])

function openPreview(action) { previewAction.value = action; previewVisible.value = true }
function confirmPreview() { previewVisible.value = false; emit('action', previewAction.value) }
function openRateEditor() { editableRates.value = arRates.value.map((row) => ({ ...row })); rateEditorVisible.value = true }
function saveRates() { rateEditorVisible.value = false; emit('action', '保存账单特调汇率') }
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
          <dl><div><dt>应收金额</dt><dd>{{ money(bucket.due) }}</dd></div><div><dt>实收金额</dt><dd>{{ money(bucket.settled) }}</dd></div><div><dt>待收金额</dt><dd>{{ money(bucket.pending) }}</dd></div></dl>
          <el-button type="primary" plain :disabled="Boolean(bill.processingState)" @click="emit('action', `${bucket.currency}费用核销`)">费用核销</el-button>
        </article>
      </div>
    </section>

    <section v-else class="refund-money-grid refund-chain-grid">
      <article class="refund-money-panel">
        <div class="money-panel-heading"><h3>返款金额链路</h3></div>
        <div class="currency-bucket-head"><strong>{{ refundSummary.sourceCurrency }} → {{ refundSummary.settlementCurrency }}</strong></div>
        <dl class="money-metrics"><div><dt>到付附加费总额</dt><dd>{{ amountText(refundSummary.codSurcharge, refundSummary.sourceCurrency) }}</dd></div><div><dt>应付返款（即代收货款）</dt><dd>{{ amountText(refundSummary.payableRefund, refundSummary.sourceCurrency) }}</dd></div><div><dt>返款账单指定扣减费项</dt><dd>{{ amountText(refundSummary.specifiedDeduction, refundSummary.sourceCurrency) }}</dd></div><div><dt>实付返款（准）</dt><dd>{{ amountText(refundSummary.provisionalRefund, refundSummary.sourceCurrency) }}</dd></div><div><dt>返款汇率</dt><dd>{{ rateText(refundSummary.refundRate) }}</dd></div><div><dt>实付返款</dt><dd>{{ amountText(refundSummary.actualRefund, refundSummary.settlementCurrency) }}</dd></div></dl>
      </article>
    </section>

    <section v-if="!isReceivable" class="refund-money-grid">
      <article class="refund-money-panel">
        <div class="money-panel-heading"><h3>货款结算币种汇总</h3></div>
        <div class="currency-bucket-head"><strong>{{ refundSummary.settlementCurrency }}</strong><StatusTag :label="refundSummary.writeoffState" :tone="refundSummary.writeoffState === '已核销' ? 'success' : 'warning'" /></div>
        <dl class="money-metrics"><div><dt>实付返款</dt><dd>{{ amountText(refundSummary.actualRefund, refundSummary.settlementCurrency) }}</dd></div><div><dt>已返金额</dt><dd>{{ amountText(refundSummary.returned, refundSummary.settlementCurrency) }}</dd></div><div><dt>待返金额</dt><dd>{{ amountText(refundSummary.pendingRefund, refundSummary.settlementCurrency) }}</dd></div></dl>
        <el-button type="primary" :disabled="Boolean(bill.processingState)" @click="emit('action', `${refundSummary.settlementCurrency}货款核销`)">核销</el-button>
      </article>
      <article class="refund-money-panel">
        <div class="money-panel-heading"><h3>财务本位币汇总</h3></div>
        <div class="currency-bucket-head"><strong>{{ refundSummary.baseCurrency }}</strong></div>
        <dl class="money-metrics"><div><dt>实付返款</dt><dd>{{ amountText(refundSummary.baseActual, refundSummary.baseCurrency) }}</dd></div><div><dt>已返金额</dt><dd>{{ amountText(refundSummary.baseReturned, refundSummary.baseCurrency) }}</dd></div><div><dt>待返金额</dt><dd>{{ amountText(refundSummary.basePending, refundSummary.baseCurrency) }}</dd></div><div><dt>汇兑损益金额</dt><dd>{{ amountText(refundSummary.exchangeGainLoss, refundSummary.baseCurrency) }}</dd></div></dl>
      </article>
    </section>

    <el-tabs v-if="isReceivable" v-model="activeTab" class="bill-detail-tabs">
      <el-tab-pane label="账单汇率" name="rates">
       <div class="bill-detail-table-block"><h4>费项结算币种折算</h4>
<DataTableFrame :total="arRates.length" :page-size="20"><template #actions><el-button :icon="EditPen" :disabled="!['待审核'].includes(bill.status)" @click="openRateEditor">编辑特调汇率</el-button></template><el-table :data="arRates" border class="clean-table"><el-table-column prop="settlement" label="费项结算币种" /><el-table-column prop="target" label="财务本位币种" /><el-table-column prop="direction" label="汇兑方向" /><el-table-column prop="rate" label="锁定汇率" /></el-table></DataTableFrame></div>
        <div class="bill-detail-table-block"><h4>费项原始币种折算</h4>
<DataTableFrame :total="arRates.length" :page-size="20"><el-table :data="arRates" border class="clean-table"><el-table-column prop="settlement" label="费项结算币种" /><el-table-column prop="target" label="费项原始币种" /><el-table-column prop="direction" label="汇兑方向" /><el-table-column prop="rate" label="锁定汇率" /></el-table></DataTableFrame></div>
      </el-tab-pane>
      <el-tab-pane label="费用汇总" name="summary">
<DataTableFrame :total="arFeeSummary.length" :page-size="20"><el-table :data="arFeeSummary" border class="clean-table"><el-table-column prop="fee" label="费项" /><el-table-column prop="currency" label="结算币种" /><el-table-column label="应收金额"><template #default="scope">{{ money(scope.row.amount) }}</template></el-table-column><el-table-column label="已核销金额"><template #default="scope">{{ money(scope.row.written) }}</template></el-table-column><el-table-column label="待核销金额"><template #default="scope">{{ money(scope.row.pending) }}</template></el-table-column></el-table></DataTableFrame></el-tab-pane>
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
            <el-table-column label="运费" min-width="170"><template #default="scope">{{ scope.row.freight === null ? '--' : `${money(scope.row.freight)} CNY` }}</template></el-table-column>
            <el-table-column label="派送附加费" min-width="170"><template #default="scope">{{ scope.row.deliverySurcharge === null ? '--' : `${money(scope.row.deliverySurcharge)} CNY` }}</template></el-table-column>
            <el-table-column label="仓储费" min-width="150"><template #default="scope">{{ scope.row.warehouseFee === null ? '--' : `${money(scope.row.warehouseFee)} CNY` }}</template></el-table-column>
            <el-table-column label="操作费" min-width="150"><template #default="scope">{{ scope.row.operationFee === null ? '--' : `${money(scope.row.operationFee)} CNY` }}</template></el-table-column>
          </el-table>
<el-table v-else :data="arVerticalFeeRows" border class="clean-table fee-vertical-table">
            <el-table-column prop="feeNo" label="费用编号" width="190" /><el-table-column prop="businessNo" label="业务单号" width="220" /><el-table-column prop="lastMileNo" label="尾程运单号" width="180" /><el-table-column prop="fee" label="费项" /><el-table-column prop="currency" label="币种" width="90" /><el-table-column label="结算金额"><template #default="scope">{{ money(scope.row.amount) }} {{ scope.row.currency }}</template></el-table-column>
          </el-table>
          </DataTableFrame>
        </div>
      </el-tab-pane>
     <el-tab-pane label="调账记录" name="adjustments">
<DataTableFrame :total="adjustments.length" :page-size="20"><el-table :data="adjustments" border class="clean-table"><el-table-column prop="no" label="调账单号" width="180" /><el-table-column prop="status" label="审核状态" /><el-table-column prop="fee" label="费项" /><el-table-column prop="objectNo" label="挂靠对象编号" width="220" /><el-table-column prop="currency" label="币种" /><el-table-column label="金额变幅"><template #default="scope">{{ money(scope.row.delta) }}</template></el-table-column><el-table-column prop="adjustedAt" label="调账时间" width="155" /></el-table></DataTableFrame></el-tab-pane>
      <el-tab-pane label="核销记录" name="writeoffs">
<DataTableFrame :total="writeoffs.length" :page-size="20"><el-table :data="writeoffs" border class="clean-table"><el-table-column prop="no" label="核销编号" /><el-table-column prop="type" label="核销类型" /><el-table-column prop="currency" label="币种" /><el-table-column label="核销金额"><template #default="scope">{{ money(scope.row.amount) }}</template></el-table-column><el-table-column prop="time" label="核销时间" /><el-table-column prop="operator" label="操作人" /></el-table></DataTableFrame></el-tab-pane>
    </el-tabs>

    <el-tabs v-else v-model="activeTab" class="bill-detail-tabs">
      <el-tab-pane label="账单概况" name="info"><dl class="bill-info-grid"><div><dt>账单编号</dt><dd>{{ bill.billNo }}</dd></div><div><dt>账单状态</dt><dd>{{ bill.status }}</dd></div><div><dt>账期收口状态</dt><dd>{{ bill.closeStatus }}</dd></div><div><dt>客户</dt><dd>{{ bill.customer }}</dd></div><div><dt>会员编码</dt><dd>{{ bill.memberCode || bill.customerNo }}</dd></div><div><dt>所属店铺快照</dt><dd>{{ bill.shopCode ? `${bill.shopCode} / ${bill.shop}` : bill.shop }}</dd></div><div><dt>目的国</dt><dd>{{ bill.country }}</dd></div><div><dt>账期类型</dt><dd>{{ bill.periodType }}</dd></div><div><dt>实际账期起止日</dt><dd>{{ bill.periodStart }} ~ {{ bill.periodEnd }}</dd></div><div><dt>截断账期标记</dt><dd>{{ bill.truncatedPeriod || '否' }}</dd></div><div><dt>数据截止点</dt><dd>{{ bill.dataCutoffAt || `${bill.periodEnd} 23:59:59` }}</dd></div></dl></el-tab-pane>
      <el-tab-pane label="账单汇率" name="rates">
<DataTableFrame :total="refundRates.length" :page-size="20"><el-table :data="refundRates" border class="clean-table"><el-table-column prop="source" label="左侧币种" /><el-table-column prop="target" label="右侧币种" /><el-table-column prop="direction" label="汇兑方向" /><el-table-column prop="sourceName" label="汇率来源" min-width="170" /><el-table-column prop="rate" label="锁定汇率" /><el-table-column prop="state" label="汇率状态" /></el-table></DataTableFrame></el-tab-pane>
      <el-tab-pane label="包裹返款明细" name="refunds">
<DataTableFrame :total="refundDetails.length" :page-size="20" :auto-content-width="true" :auto-width-rows="refundDetails"><el-table :data="refundDetails" border class="clean-table"><el-table-column prop="waybill" label="尾程运单号" width="160" /><el-table-column prop="order" label="业务订单号" width="170" /><el-table-column prop="signedAt" label="签收时间" width="155" /><el-table-column label="来源金额与币种" min-width="160"><template #default="scope">{{ amountText(scope.row.sourceAmount, scope.row.sourceCurrency) }}</template></el-table-column><el-table-column label="到付附加费" min-width="145"><template #default="scope">{{ amountText(scope.row.codSurcharge, scope.row.sourceCurrency) }}</template></el-table-column><el-table-column label="应付返款" min-width="145"><template #default="scope">{{ amountText(scope.row.payableRefund, scope.row.sourceCurrency) }}</template></el-table-column><el-table-column label="指定扣减金额" min-width="155"><template #default="scope">{{ amountText(scope.row.specifiedDeduction, scope.row.sourceCurrency) }}</template></el-table-column><el-table-column label="实付返款（准）" min-width="160"><template #default="scope">{{ amountText(scope.row.provisionalRefund, scope.row.sourceCurrency) }}</template></el-table-column><el-table-column label="返款汇率" min-width="120"><template #default="scope">{{ rateText(scope.row.refundRate) }}</template></el-table-column><el-table-column label="实付返款" min-width="145"><template #default="scope">{{ amountText(scope.row.actualRefund, scope.row.settlementCurrency) }}</template></el-table-column><el-table-column label="已返金额" min-width="145"><template #default="scope">{{ amountText(scope.row.returned, scope.row.settlementCurrency) }}</template></el-table-column><el-table-column label="待返金额" min-width="145"><template #default="scope">{{ amountText(scope.row.pending, scope.row.settlementCurrency) }}</template></el-table-column><el-table-column prop="state" label="核销状态" min-width="110" /></el-table></DataTableFrame></el-tab-pane>
      <el-tab-pane label="回款记录与汇兑损益" name="recoveries">
        <RefundRecoveryPanel :bill-no="bill.billNo" :base-currency="refundSummary.baseCurrency" />
      </el-tab-pane>
      <el-tab-pane label="指定扣减费项" name="deductions">
<DataTableFrame :total="deductionDetails.length" :page-size="20" :auto-content-width="true" :auto-width-rows="deductionDetails"><el-table :data="deductionDetails" border class="clean-table"><el-table-column prop="feeNo" label="费用编号" width="205" /><el-table-column prop="fee" label="费项名称" min-width="150" /><el-table-column prop="order" label="业务订单号" width="170" /><el-table-column prop="waybill" label="尾程运单号" width="160" /><el-table-column label="原始币种及金额" min-width="160"><template #default="scope">{{ amountText(scope.row.originalAmount, scope.row.originalCurrency) }}</template></el-table-column><el-table-column label="换算汇率" min-width="120"><template #default="scope">{{ rateText(scope.row.conversionRate) }}</template></el-table-column><el-table-column label="货款原始币种及扣减金额" min-width="210"><template #default="scope">{{ amountText(scope.row.deductionAmount, scope.row.sourceCurrency) }}</template></el-table-column><el-table-column prop="state" label="处理状态" min-width="140" /></el-table></DataTableFrame></el-tab-pane>
      <el-tab-pane label="关联调账与核销记录" name="related-records">
<DataTableFrame :total="relatedRecords.length" :page-size="20"><el-table :data="relatedRecords" border class="clean-table"><el-table-column prop="adjustmentNo" label="调账编号" min-width="190" /><el-table-column prop="adjustmentStatus" label="调账状态" min-width="110" /><el-table-column prop="writeoffNo" label="核销编号" min-width="190" /><el-table-column prop="writeoffType" label="核销类型" min-width="120" /><el-table-column prop="currency" label="币种" min-width="90" /><el-table-column label="金额" min-width="120"><template #default="scope">{{ money(scope.row.amount) }}</template></el-table-column><el-table-column prop="time" label="时间" min-width="165" /><el-table-column prop="operator" label="操作人" min-width="120" /></el-table></DataTableFrame></el-tab-pane>
    </el-tabs>

    <BillGenerationDialog ref="generationDialog" :bill="bill" :is-receivable="isReceivable" @submit="emit('action', '创建账单生成任务')" />

    <el-dialog v-model="previewVisible" :title="`${previewAction}预览`" class="module-dialog" align-center append-to-body destroy-on-close>
      <dl class="bill-info-grid"><div><dt>账单编号</dt><dd>{{ bill.billNo }}</dd></div><div><dt>客户</dt><dd>{{ bill.customer }}</dd></div><div><dt>当前账单状态</dt><dd>{{ bill.status }}</dd></div><div><dt>当前收口状态</dt><dd>{{ bill.closeStatus }}</dd></div><div><dt>影响范围</dt><dd>当前账单及其账期内已归属费项</dd></div><div><dt>处理结果</dt><dd>创建账单重算任务</dd></div></dl>
      <template #footer><el-button @click="previewVisible=false">取消</el-button><el-button type="primary" @click="confirmPreview">确认执行</el-button></template>
    </el-dialog>

    <el-dialog v-model="rateEditorVisible" title="编辑账单特调汇率" class="module-dialog" align-center append-to-body destroy-on-close>
      <el-alert title="仅修改当前待审核账单的锁定汇率，不回写汇率配置。" type="info" :closable="false" />
<DataTableFrame class="rate-editor-table" :total="editableRates.length" :page-size="20" :sticky-toolbar="false" :sticky-pagination="false"><el-table :data="editableRates" border class="clean-table"><el-table-column prop="settlement" label="费项结算币种" /><el-table-column prop="target" label="财务本位币种" /><el-table-column prop="direction" label="汇兑方向" /><el-table-column label="锁定汇率"><template #default="scope"><el-input-number v-model="scope.row.rate" :precision="6" :step="0.000001" :min="0.000001" controls-position="right" /></template></el-table-column></el-table></DataTableFrame>
      <template #footer><el-button @click="rateEditorVisible=false">取消</el-button><el-button type="primary" @click="saveRates">保存特调汇率</el-button></template>
    </el-dialog>
  </div>
</template>
