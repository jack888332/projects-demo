<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import BillDetailPanel from '../components/BillDetailPanel.vue'
import { billingBillFixtures, billingBillSeedVersion } from '../../data/fixtures/billingBills.js'
import { useDemoDataset } from '../data/useDemoDataset.js'
import { BILLING_PATHS } from '../../domain/constants.js'

const props = defineProps({
  billType: { type: String, required: true },
  billNo: { type: String, required: true },
})

const router = useRouter()
const bills = useDemoDataset('billingBills', billingBillFixtures, billingBillSeedVersion)
const isReceivable = computed(() => props.billType === 'AR')
const parentPath = computed(() => isReceivable.value ? BILLING_PATHS.receivable : BILLING_PATHS.refund)
const bill = computed(() => bills.value.find((item) => item.type === props.billType && item.billNo === props.billNo))

async function handleBillAction(name) {
  if (!bill.value) return
  if (name === '创建账单生成任务') {
    bill.value.processingState = '账单生成待处理'
    bill.value.activeTask = 'BMS-20260802-00082'
  } else if (name === '审核通过') {
    if (bill.value.closeStatus !== '已收口') return ElMessage.warning('账期未收口，不能审核通过')
    bill.value.status = '待结清'
    bill.value.issued = true
    bill.value.notice = '已通知'
    bill.value.sentAt = bill.value.sentAt === '-' ? '2026/08/02' : bill.value.sentAt
  } else if (name === '提前收口并审核') {
    bill.value.closeStatus = '已收口'
    bill.value.status = '待结清'
    bill.value.issued = true
    bill.value.notice = '已通知'
    bill.value.sentAt = bill.value.sentAt === '-' ? '2026/08/02' : bill.value.sentAt
  } else if (name === '退回待审核') {
    bill.value.status = '待审核'
  }
  ElMessage.success(`${name}已提交`)
}
</script>

<template>
  <div class="module-page bill-detail-page">
    <BillDetailPanel v-if="bill" :bill="bill" :is-receivable="isReceivable" @action="handleBillAction" />
    <el-empty v-else description="账单不存在或已被移除">
      <el-button type="primary" @click="router.push(parentPath)">返回账单列表</el-button>
    </el-empty>
  </div>
</template>
