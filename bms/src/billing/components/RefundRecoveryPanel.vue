<script setup>
import { computed } from 'vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import { refundDetailFixtures, refundRecoveryFixtures } from '../../data/fixtures/billDetail.js'
import { useDemoDataset } from '../data/useDemoDataset.js'

const props = defineProps({
  billNo: { type: String, required: true },
  baseCurrency: { type: String, default: 'CNY' },
})

const recoveryRows = useDemoDataset('billingRefundRecoveries', refundRecoveryFixtures, 5)
const detailRows = useDemoDataset('billingRefundDetails', refundDetailFixtures, 5)
const recoveries = computed(() => recoveryRows.value.filter((row) => row.billNo === props.billNo))
const orderDetails = computed(() => detailRows.value.filter((row) => row.billNo === props.billNo))
const money = (value) => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const amountText = (value, currency) => value === null || value === undefined ? '--' : `${money(value)} ${currency}`
const rateText = (value) => value === null || value === undefined || value === '-' ? '--' : Number(value).toFixed(6)
const signTone = (signStatus) => ['已妥投', '出柜'].includes(signStatus) ? 'success' : 'danger'
const recoveryTone = (status) => ({ '已回款': 'success', '待回款': 'warning', '异常不回款': 'neutral' })[status] || 'neutral'

const exchangeText = (order) => {
  const detail = orderDetails.value.find((row) => row.order === order)
  if (!detail) return '--'
  if (Number(detail.provisionalRefund) < 0) return '负数订单不计算汇兑损益'
  if (detail.exchangeGainLoss === null || detail.exchangeGainLoss === undefined) return '缺少回款汇率或必要换算汇率'
  if (detail.exchangeGainLoss === 0 && detail.sourceCurrency === detail.settlementCurrency) return '未导入回款汇率：标准化回款汇率按同币种 1 处理，返款同币种，汇兑损益为 0'
  const recovered = recoveries.value.find((row) => row.order === order && row.recoveryRate !== '-' && row.recoveryRate !== null && row.recoveryRate !== undefined)
  const baseRate = Number(detail.baseRate ?? (detail.settlementCurrency === props.baseCurrency ? 1 : NaN))
  const normalizedRefundRate = Number(detail.refundRate) * baseRate
  if (recovered && Number.isFinite(normalizedRefundRate) && Number(recovered.recoveryRate) !== normalizedRefundRate) {
    return `按回款汇率 ${rateText(recovered.recoveryRate)} 与标准化返款汇率 ${rateText(normalizedRefundRate)}（${detail.sourceCurrency} → ${props.baseCurrency}）折算差额`
  }
  if (recovered && Number.isFinite(normalizedRefundRate)) return `回款汇率与标准化返款汇率均为 ${rateText(normalizedRefundRate)}（${detail.sourceCurrency} → ${props.baseCurrency}），汇兑损益为 0`
  if (recovered) return '缺少返款结算币到财务本位币的必要换算汇率'
  return '缺少回款汇率或必要换算汇率'
}

const summary = computed(() => {
  const grouped = new Map()
  recoveries.value.forEach((row) => {
    if (!grouped.has(row.order)) grouped.set(row.order, { order: row.order, recovered: 0, pending: 0, abnormal: 0 })
    const group = grouped.get(row.order)
    if (row.recoveryStatus === '已回款') group.recovered += 1
    else if (row.recoveryStatus === '待回款') group.pending += 1
    else if (row.recoveryStatus === '异常不回款') group.abnormal += 1
  })
  return Array.from(grouped.values()).map((group) => {
    const detail = orderDetails.value.find((row) => row.order === group.order)
    return {
      ...group,
      exchangeGainLoss: detail && detail.exchangeGainLoss !== null && detail.exchangeGainLoss !== undefined ? Number(detail.exchangeGainLoss) : null,
      exchangeText: exchangeText(group.order),
    }
  })
})
</script>

<template>
  <div class="recovery-panel">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="回款记录仅用于财务跟踪与汇兑损益核对，不参与返款结算、核销或结清判断。"
    />
    <template v-if="recoveries.length">
      <section class="recovery-section">
        <h4>包裹回款数据</h4>
        <DataTableFrame :total="recoveries.length" :page-size="20" :auto-content-width="true" :auto-width-rows="recoveries">
          <el-table :data="recoveries" border class="clean-table">
            <el-table-column prop="waybill" label="尾程运单号" width="150" />
            <el-table-column prop="order" label="业务订单号" width="165" />
            <el-table-column label="签收状态" width="110"><template #default="scope"><StatusTag :label="scope.row.signStatus" :tone="signTone(scope.row.signStatus)" /></template></el-table-column>
            <el-table-column prop="signedAt" label="签收时间" width="145" />
            <el-table-column prop="recoveredAt" label="回款时间" width="145" />
            <el-table-column label="回款币种" width="100"><template #default="scope">{{ scope.row.recoveryCurrency === '-' ? '--' : scope.row.recoveryCurrency }}</template></el-table-column>
            <el-table-column label="回款金额" min-width="130"><template #default="scope">{{ amountText(scope.row.recoveryAmount, scope.row.recoveryCurrency) }}</template></el-table-column>
            <el-table-column label="回款方式" width="100"><template #default="scope">{{ scope.row.method === '-' ? '--' : scope.row.method }}</template></el-table-column>
            <el-table-column label="回款流水号" width="160"><template #default="scope">{{ scope.row.serialNo === '-' ? '--' : scope.row.serialNo }}</template></el-table-column>
            <el-table-column label="回款汇率" width="120"><template #default="scope">{{ rateText(scope.row.recoveryRate) }}</template></el-table-column>
            <el-table-column label="实收回款金额" min-width="145"><template #default="scope">{{ amountText(scope.row.actualRecoveredAmount, scope.row.recoveryCurrency) }}</template></el-table-column>
            <el-table-column label="回款状态" width="110"><template #default="scope"><StatusTag :label="scope.row.recoveryStatus" :tone="recoveryTone(scope.row.recoveryStatus)" /></template></el-table-column>
          </el-table>
        </DataTableFrame>
      </section>
      <section class="recovery-section">
        <h4>订单汇兑损益汇总</h4>
        <DataTableFrame :toolbar="false" :pagination="false" :auto-content-width="true" :auto-width-rows="summary">
          <el-table :data="summary" border class="clean-table compact-summary-table">
            <el-table-column prop="order" label="业务订单号" width="180" />
            <el-table-column label="回款包裹" min-width="220"><template #default="scope"><span class="recovery-status-line"><StatusTag label="已回款" tone="success" /> {{ scope.row.recovered }}　<StatusTag label="待回款" tone="warning" /> {{ scope.row.pending }}　<StatusTag label="异常不回款" tone="neutral" /> {{ scope.row.abnormal }}</span></template></el-table-column>
            <el-table-column label="汇兑损益金额" min-width="150"><template #default="scope">{{ scope.row.exchangeGainLoss === null ? '--' : amountText(scope.row.exchangeGainLoss, baseCurrency) }}</template></el-table-column>
            <el-table-column label="说明" min-width="360"><template #default="scope">{{ scope.row.exchangeText }}</template></el-table-column>
          </el-table>
        </DataTableFrame>
      </section>
    </template>
    <el-empty v-else description="本期账单暂无包裹回款记录" />
  </div>
</template>

<style scoped>
.recovery-panel > .el-alert { margin-bottom: 14px; }
.recovery-section + .recovery-section { margin-top: 18px; }
.recovery-section h4 {
  margin: 0 0 10px;
  color: #34415a;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}
</style>
