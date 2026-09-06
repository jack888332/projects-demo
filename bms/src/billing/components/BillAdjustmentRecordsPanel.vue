<script setup>
import { computed } from 'vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'

const props = defineProps({
  records: { type: Array, default: () => [] },
  negativeRecords: { type: Array, default: () => [] },
  assignedBillNo: { type: String, required: true },
})

const money = value => Number(value || 0).toLocaleString('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const amountText = (value, currency, signed = false) => {
  if (value === null || value === undefined) return '--'
  const prefix = signed && Number(value) > 0 ? '+' : ''
  return `${prefix}${money(value)} ${currency}`
}

const rows = computed(() => [
  ...props.records.map((row) => ({
    recordNo: row.no,
    recordType: row.type || '金额冲正',
    billTypeLabel: row.billTypeLabel || (row.billType === 'AR' ? '应收账单' : '返款账单'),
    adjustmentPeriodLabel: row.adjustmentPeriodLabel || '--',
    sourceBillNo: row.sourceBillNo || row.billNo || '--',
    sourcePeriod: row.sourcePeriod || '--',
    assignedBill: row.assignedBill || row.billNo || '--',
    recordStatus: row.status,
    objectNo: row.objectNo || '--',
    sourceText: [row.fee, row.reason].filter(Boolean).join('；') || '--',
    recordCurrency: row.beforeCurrency || row.afterCurrency || row.currency || '--',
    currency: row.afterCurrency || row.currency || row.beforeCurrency || '--',
    impactAmount: Number(row.afterDelta ?? row.delta ?? 0),
    recordAmount: Number(row.delta ?? row.afterDelta ?? 0),
    time: row.adjustedAt,
    operator: row.operator || '财务管理员',
  })),
  ...props.negativeRecords.map((row) => ({
    recordNo: row.recordNo,
    recordType: row.kind,
    billTypeLabel: '返款账单',
    adjustmentPeriodLabel: '--',
    sourceBillNo: row.sourceBillNo,
    sourcePeriod: row.sourcePeriod || '--',
    assignedBill: props.assignedBillNo,
    recordStatus: row.kind === '负数承接记录' ? '已结转' : '系统自动',
    objectNo: row.sourceOrder === '不挂业务订单' ? '--' : row.sourceOrder,
    sourceText: `${row.note}；来源账单 ${row.sourceBillNo}（${row.sourcePeriod}）`,
    currency: row.currency,
    recordCurrency: row.currency,
    impactAmount: null,
    recordAmount: row.amount,
    time: row.createdAt,
    operator: '系统自动',
  })),
])
</script>

<template>
  <DataTableFrame :total="rows.length" :page-size="20">
    <el-table :data="rows" border class="clean-table">
      <el-table-column prop="recordNo" label="记录编号" min-width="200" />
      <el-table-column prop="recordType" label="记录类型" min-width="150" />
      <el-table-column prop="billTypeLabel" label="账单类型" min-width="105" />
      <el-table-column prop="adjustmentPeriodLabel" label="冲正归属" min-width="170" />
      <el-table-column prop="sourceBillNo" label="原账单号" min-width="235" />
      <el-table-column prop="sourcePeriod" label="原账期" min-width="205" />
      <el-table-column prop="assignedBill" label="归属账单号" min-width="235" />
      <el-table-column prop="recordStatus" label="状态" min-width="100" />
      <el-table-column prop="objectNo" label="挂靠对象" min-width="190" />
      <el-table-column prop="currency" label="币种" min-width="90" />
      <el-table-column label="原币记录金额" min-width="155">
        <template #default="scope"><span :class="{ 'amount-negative': Number(scope.row.recordAmount) < 0 }">{{ amountText(scope.row.recordAmount, scope.row.recordCurrency) }}</span></template>
      </el-table-column>
      <el-table-column label="账单金额影响" min-width="160">
        <template #default="scope"><span :class="{ 'amount-negative': Number(scope.row.impactAmount) < 0 }">{{ amountText(scope.row.impactAmount, scope.row.currency, true) }}</span></template>
      </el-table-column>
      <el-table-column label="来源说明" min-width="300" show-overflow-tooltip><template #default="scope">{{ scope.row.sourceText }}</template></el-table-column>
      <el-table-column prop="time" label="时间" min-width="165" />
      <el-table-column prop="operator" label="操作人" min-width="120" />
    </el-table>
  </DataTableFrame>
</template>
