<script setup>
import { computed } from 'vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import { refundRecoveryFixtures } from '../../data/fixtures/billDetail.js'
import { useDemoDataset } from '../data/useDemoDataset.js'

const props = defineProps({
  billNo: { type: String, required: true },
  baseCurrency: { type: String, default: 'CNY' },
})

const recoveryRows = useDemoDataset('billingRefundRecoveries', refundRecoveryFixtures, 2)
const recoveries = computed(() => recoveryRows.value.filter((row) => row.billNo === props.billNo))
const money = (value) => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const amountText = (value, currency) => value === null || value === undefined ? '--' : `${money(value)} ${currency}`
const rateText = (value) => value === null || value === undefined || value === '-' ? '--' : Number(value).toFixed(6)

const summary = computed(() => {
  const grouped = new Map()
  recoveries.value.forEach((row) => {
    if (!grouped.has(row.order)) grouped.set(row.order, { order: row.order, recovered: 0, pending: 0, exchangeGainLoss: null })
    const group = grouped.get(row.order)
    if (row.recoveryStatus === '已回款') group.recovered += 1
    else if (row.recoveryStatus === '待回款') group.pending += 1
    if (row.exchangeGainLoss !== null && row.exchangeGainLoss !== undefined) group.exchangeGainLoss = (group.exchangeGainLoss ?? 0) + Number(row.exchangeGainLoss)
  })
  return Array.from(grouped.values())
})
</script>

<template>
  <div class="recovery-panel">
    <DataTableFrame v-if="summary.length" :toolbar="false" :pagination="false">
      <el-table :data="summary" border class="clean-table compact-summary-table">
        <el-table-column prop="order" label="业务订单号" />
        <el-table-column label="回款包裹"><template #default="scope">{{ scope.row.recovered }} 已回 / {{ scope.row.pending }} 待回</template></el-table-column>
        <el-table-column label="汇兑损益金额"><template #default="scope">{{ scope.row.exchangeGainLoss === null || scope.row.exchangeGainLoss === undefined ? '--' : amountText(scope.row.exchangeGainLoss, baseCurrency) }}</template></el-table-column>
      </el-table>
    </DataTableFrame>
    <DataTableFrame :total="recoveries.length" :page-size="20" :auto-content-width="true" :auto-width-rows="recoveries">
      <el-table :data="recoveries" border class="clean-table">
        <el-table-column prop="waybill" label="尾程运单号" width="150" />
        <el-table-column prop="order" label="业务订单号" width="165" />
        <el-table-column prop="signStatus" label="签收状态" width="110" />
        <el-table-column prop="signedAt" label="签收时间" width="145" />
        <el-table-column prop="recoveredAt" label="回款时间" width="145" />
        <el-table-column label="回款币种" width="100"><template #default="scope">{{ scope.row.recoveryCurrency === '-' ? '--' : scope.row.recoveryCurrency }}</template></el-table-column>
        <el-table-column label="回款金额" min-width="130"><template #default="scope">{{ amountText(scope.row.recoveryAmount, scope.row.recoveryCurrency) }}</template></el-table-column>
        <el-table-column label="回款方式" width="100"><template #default="scope">{{ scope.row.method === '-' ? '--' : scope.row.method }}</template></el-table-column>
        <el-table-column prop="serialNo" label="回款流水号" width="160" />
        <el-table-column label="回款汇率" width="120"><template #default="scope">{{ rateText(scope.row.recoveryRate) }}</template></el-table-column>
        <el-table-column label="实收回款金额" min-width="145"><template #default="scope">{{ scope.row.actualRecoveredAmount === null || scope.row.actualRecoveredAmount === undefined ? '--' : amountText(scope.row.actualRecoveredAmount, scope.row.recoveryCurrency) }}</template></el-table-column>
        <el-table-column label="回款状态" width="110"><template #default="scope"><StatusTag :label="scope.row.recoveryStatus" /></template></el-table-column>
      </el-table>
    </DataTableFrame>
  </div>
</template>
