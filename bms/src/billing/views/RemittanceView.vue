<script setup>
import { computed, ref } from 'vue'
import { View } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import BillDetailPanel from '../components/BillDetailPanel.vue'
import ConditionFilter from '../../shared/components/ConditionFilter.vue'
import DownloadButton from '../../shared/components/DownloadButton.vue'
import MetricGrid from '../../shared/components/MetricGrid.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import TableActionColumn from '../../shared/components/TableActionColumn.vue'
import { useStagedQuery } from '../../shared/composables/useStagedQuery.js'
import { billingRepository } from '../../data/repositories/billingRepository.js'
import { billingRemittanceFixtures } from '../../data/fixtures/billingRemittances.js'
import { useDemoDataset } from '../data/useDemoDataset.js'

const billVisible = ref(false)
const linkedBill = ref(null)
const initialQuery = {
  keyword: '',
  recoveryStatus: '',
  refundStatus: '',
  reconciliationStatus: '',
}
const { query, appliedQuery, applyQuery } = useStagedQuery(initialQuery)
const packages = useDemoDataset('billingRemittances', billingRemittanceFixtures, 4)

const rows = computed(() => packages.value.filter((item) => {
  const text = `${item.tracking}${item.order}${item.customer}${item.shop}${item.billNo}`.toLowerCase()
  return (!appliedQuery.keyword || text.includes(appliedQuery.keyword.toLowerCase()))
    && (!appliedQuery.recoveryStatus || item.recoveryStatus === appliedQuery.recoveryStatus)
    && (!appliedQuery.refundStatus || item.refundStatus === appliedQuery.refundStatus)
    && (!appliedQuery.reconciliationStatus || item.reconciliationStatus === appliedQuery.reconciliationStatus)
}))

const summary = computed(() => [
  { label: 'COD 包裹', value: packages.value.length, tone: 'blue' },
  { label: '已回款', value: packages.value.filter((item) => item.recoveryStatus === '已回款').length, tone: 'green' },
  { label: '已返款', value: packages.value.filter((item) => item.refundStatus === '已返款').length, tone: 'amber' },
  { label: '待对账', value: packages.value.filter((item) => item.reconciliationStatus === '待对账').length, tone: 'violet' },
])

function formatMoney(value, currency) {
  if (value === null || value === undefined || value === '') return '--'
  return `${Number(value).toFixed(2)} ${currency || ''}`.trim()
}

async function openBill(row) {
  const refundAmount = row.finalRefundAmount ?? row.provisionalRefundAmount ?? row.refundableAmount
  linkedBill.value = await billingRepository.get(row.billNo) || {
    type: 'RF',
    billNo: row.billNo,
    status: row.refundStatus === '已返款' ? '已结清' : '待结清',
    closeStatus: '已收口',
    issued: true,
    customer: row.customer,
    customerNo: row.customer.split(' ')[0],
    memberCode: '-',
    shop: row.shop,
    country: '-',
    periodType: '周',
    periodStart: '2026/07/21',
    periodEnd: '2026/07/27',
    sentAt: '2026/07/28',
    refundMode: row.mode,
    currency: row.originalCurrency,
    original: row.originalAmount,
    deduction: Math.max(row.originalAmount - refundAmount, 0),
    amount: refundAmount,
    paid: row.finalRefundAmount ?? 0,
  }
  billVisible.value = true
}
</script>

<template>
  <div class="module-page">
    <section class="condition-query-panel">
      <div class="condition-filter-bar">
        <ConditionFilter
          v-model="query.keyword"
          label="关键词"
          type="text"
          search-placeholder="尾程运单号 / 订单 / 客户 / 返款账单"
        />
        <ConditionFilter
          v-model="query.recoveryStatus"
          label="回款状态"
          :options="['已回款', '待回款', '不回款']"
        />
        <ConditionFilter
          v-model="query.refundStatus"
          label="返款状态"
          :options="['已返款', '待返款', '不返款']"
        />
        <ConditionFilter
          v-model="query.reconciliationStatus"
          label="对账状态"
          :options="['已对账', '待对账', '无需对账']"
        />
        <div class="condition-filter-actions">
          <el-button type="primary" @click="applyQuery">查询</el-button>
        </div>
      </div>
    </section>

    <MetricGrid :items="summary" />

    <section class="module-panel filter-table-panel">
      <DataTableFrame :total="rows.length" :selected-count="0" :page-size="10">
        <template #actions>
          <DownloadButton
            title="导出"
            file-name="回款返款明细"
            :rows="rows"
            :options="[
              { label: '回款明细', value: 'remittance', description: '导出当前筛选范围内的回款与返款明细' },
            ]"
          />
        </template>

        <el-table :data="rows" class="clean-table" row-key="tracking" border>
          <el-table-column prop="tracking" label="尾程运单号" width="160" fixed />
          <el-table-column prop="order" label="所属内部订单" width="155" />
          <el-table-column prop="customer" label="客户" min-width="170" show-overflow-tooltip />
          <el-table-column prop="shop" label="所属店铺" width="120" show-overflow-tooltip />
          <el-table-column prop="signStatus" label="签收状态" width="95" />
          <el-table-column prop="signedAt" label="签收时间" width="155" />
          <el-table-column label="货款原始金额" width="135">
            <template #default="scope">{{ formatMoney(scope.row.originalAmount, scope.row.originalCurrency) }}</template>
          </el-table-column>
          <el-table-column prop="carrier" label="尾程派送商" width="130" />
          <el-table-column label="回款状态" width="90">
            <template #default="scope"><StatusTag :label="scope.row.recoveryStatus" /></template>
          </el-table-column>
          <el-table-column label="返款状态" width="90">
            <template #default="scope"><StatusTag :label="scope.row.refundStatus" /></template>
          </el-table-column>
          <el-table-column label="对账状态" width="90">
            <template #default="scope"><StatusTag :label="scope.row.reconciliationStatus" /></template>
          </el-table-column>
          <el-table-column prop="recoveredAt" label="回款时间" width="150" />
          <el-table-column prop="recoveryCurrency" label="回款币种" width="90" />
          <el-table-column label="回款金额" width="120">
            <template #default="scope">{{ formatMoney(scope.row.recoveryAmount, scope.row.recoveryCurrency) }}</template>
          </el-table-column>
          <el-table-column prop="method" label="回款方式" width="100" />
          <el-table-column prop="serialNo" label="回款流水号" width="160" />
          <el-table-column prop="recoveryRate" label="回款汇率" width="100" />
          <el-table-column label="实收回款金额" width="135">
            <template #default="scope">{{ formatMoney(scope.row.actualRecoveredAmount, scope.row.recoveryCurrency) }}</template>
          </el-table-column>
          <el-table-column prop="refundedAt" label="返款时间" width="150" />
          <el-table-column prop="mode" label="返款模式" width="100" />
          <el-table-column label="关联返款账单" width="220">
            <template #default="scope">
              <el-link
                v-if="scope.row.billNo !== '-'"
                type="primary"
                :underline="false"
                @click.stop="openBill(scope.row)"
              >
                {{ scope.row.billNo }}
              </el-link>
              <span v-else>--</span>
            </template>
          </el-table-column>
          <el-table-column label="应付返款金额" width="135">
            <template #default="scope">{{ formatMoney(scope.row.refundableAmount, scope.row.originalCurrency) }}</template>
          </el-table-column>
          <el-table-column label="实付返款（准）" width="140">
            <template #default="scope">{{ formatMoney(scope.row.provisionalRefundAmount, scope.row.originalCurrency) }}</template>
          </el-table-column>
          <el-table-column prop="refundRate" label="返款汇率" width="105" />
          <el-table-column label="实付返款" width="140">
            <template #default="scope">{{ formatMoney(scope.row.finalRefundAmount, scope.row.originalCurrency) }}</template>
          </el-table-column>
          <TableActionColumn compact>
            <template #default="scope">
              <el-button
                class="table-detail-button"
                link
                type="primary"
                :icon="View"
                title="详情"
                aria-label="详情"
                :disabled="scope.row.billNo === '-'"
                @click="openBill(scope.row)"
              />
            </template>
          </TableActionColumn>
        </el-table>
      </DataTableFrame>
    </section>

    <el-dialog
      v-model="billVisible"
      title="关联返款账单详情"
      class="module-dialog module-dialog-wide"
      align-center
      append-to-body
      destroy-on-close
    >
      <BillDetailPanel
        v-if="linkedBill"
        :bill="linkedBill"
        :is-receivable="false"
        @action="(name) => ElMessage.success(`${name}已提交`)"
      />
    </el-dialog>
  </div>
</template>
