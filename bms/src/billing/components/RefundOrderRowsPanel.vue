<script setup>
import { computed, ref } from 'vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import DeductionFeeLabel from './DeductionFeeLabel.vue'
import { deductionFeeDisplayName, isZeroFeeAmount } from '../data/feeDisplayLabels.js'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  deductions: { type: Array, default: () => [] },
  baseCurrency: { type: String, default: 'CNY' },
  baseRate: { type: Number, default: 1 },
})

const amountDimension = ref('settlement')
const money = (value) => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const amountText = (value, currency) => value === null || value === undefined ? '--' : `${money(value)} ${currency}`

function sourceAmountText(value, row) {
  if (value === null || value === undefined) return '--'
  const refundRate = Number(row.refundRate)
  const baseRate = Number(row.baseRate ?? props.baseRate)
  if (amountDimension.value === 'original') return amountText(value, row.sourceCurrency)
  if (!Number.isFinite(refundRate)) return '--'
  const settlementAmount = Number(value) * refundRate
  return amountDimension.value === 'base'
    ? amountText(settlementAmount * baseRate, props.baseCurrency)
    : amountText(settlementAmount, row.settlementCurrency)
}
function settlementAmountText(value, row) {
  if (value === null || value === undefined) return '--'
  const refundRate = Number(row.refundRate)
  const baseRate = Number(row.baseRate ?? props.baseRate)
  if (amountDimension.value === 'settlement') return amountText(value, row.settlementCurrency)
  if (amountDimension.value === 'base') return amountText(Number(value) * baseRate, props.baseCurrency)
  return refundRate ? amountText(Number(value) / refundRate, row.sourceCurrency) : '--'
}

function deductionsForOrder(order) {
  return props.deductions.filter((row) => row.order === order)
}
const deductionFeeColumns = computed(() => {
  const seen = new Set()
  return props.deductions.reduce((columns, item) => {
    const key = item.feeCode || item.fee
    if (!seen.has(key)) {
      seen.add(key)
      columns.push({ key, label: deductionFeeDisplayName(item.fee) })
    }
    return columns
  }, [])
})
function deductionAmountForOrder(order, feeKey) {
  return deductionsForOrder(order)
    .filter(item => (item.feeCode || item.fee) === feeKey)
    .reduce((total, item) => total + Number(item.deductionAmount || 0), 0)
}
function deductionAmountText(order, feeKey, row) {
  const amount = deductionAmountForOrder(order, feeKey)
  return isZeroFeeAmount(amount) ? '--' : sourceAmountText(amount, row)
}
function isNegativeRow(row) {
  return Number(row.provisionalRefund) < 0
}
</script>

<template>
  <div class="fee-detail-viewbar refund-amount-viewbar">
    <span class="fee-dimension-label">金额币种</span>
    <el-select v-model="amountDimension" class="fee-amount-dimension" aria-label="金额币种">
      <el-option label="返款结算币种金额" value="settlement" />
      <el-option label="返款原始币种金额" value="original" />
      <el-option label="财务本位币金额" value="base" />
    </el-select>
  </div>
  <DataTableFrame :total="rows.length" :page-size="20" :auto-content-width="true" :auto-width-rows="rows">
    <el-table :data="rows" row-key="order" border class="clean-table">
      <el-table-column prop="order" label="业务订单号" width="170" />
      <el-table-column label="应付返款" min-width="160"><template #default="scope">{{ sourceAmountText(scope.row.payableRefund, scope.row) }}</template></el-table-column>
      <el-table-column
        v-for="feeColumn in deductionFeeColumns"
        :key="feeColumn.key"
        min-width="190"
      >
        <template #header><DeductionFeeLabel :name="feeColumn.label" /></template>
        <template #default="scope">{{ deductionAmountText(scope.row.order, feeColumn.key, scope.row) }}</template>
      </el-table-column>
      <el-table-column label="实付返款（准）" min-width="160"><template #default="scope"><span :class="{ 'amount-negative': isNegativeRow(scope.row) }">{{ sourceAmountText(scope.row.provisionalRefund, scope.row) }}</span></template></el-table-column>
      <el-table-column label="实付返款" min-width="145"><template #default="scope">{{ isNegativeRow(scope.row) ? '--' : settlementAmountText(scope.row.actualRefund, scope.row) }}</template></el-table-column>
    </el-table>
  </DataTableFrame>
</template>

<style scoped>
.refund-amount-viewbar { margin-bottom: 10px; }
</style>
