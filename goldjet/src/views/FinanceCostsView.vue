<script setup>
import { computed, reactive, ref } from 'vue'
import { Check, Close, Plus } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import FilterBar from '../components/FilterBar.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'

const { state, addCost, reviewCost } = usePrototypeData()
const keyword = ref('')
const status = ref('')
const createVisible = ref(false)
const rejectVisible = ref(false)
const selected = ref(null)
const rejectReason = ref('')
const form = reactive({ orderNo: '', feeItem: '', direction: '应收', settlementParty: '', currency: 'CNY', amount: 0, applicant: '周倩' })
const rows = computed(() => state.costs.filter((item) => {
  const match = !keyword.value || `${item.orderNo}${item.feeItem}${item.settlementParty}`.toLowerCase().includes(keyword.value.toLowerCase())
  return match && (!status.value || item.status === status.value)
}))
const totals = computed(() => ({ receivable: state.costs.filter((item) => item.direction === '应收').reduce((sum, item) => sum + item.amount, 0), payable: state.costs.filter((item) => item.direction === '应付').reduce((sum, item) => sum + item.amount, 0) }))
function submitCost() { if (!form.orderNo || !form.feeItem || !form.settlementParty || form.amount <= 0) return ElMessage.error('请完整填写费用信息'); addCost({ ...form }); createVisible.value = false; ElMessage.success('费用已保存并进入待审批') }
function approve(row) { reviewCost(row.id, true); ElMessage.success('费用审批通过') }
function openReject(row) { selected.value = row; rejectReason.value = ''; rejectVisible.value = true }
function confirmReject() { if (!rejectReason.value.trim()) return ElMessage.error('请填写拒绝原因'); reviewCost(selected.value.id, false, rejectReason.value.trim()); rejectVisible.value = false; ElMessage.success('已拒绝，申请人可修改后重新提交或作废') }
function resetFilters() { keyword.value = ''; status.value = '' }
</script>

<template>
  <div class="module-view">
    <PageHeader title="订单成本" description="业务订单的应收、应付费用维护与审批">
      <template #actions><el-button type="primary" :icon="Plus" @click="createVisible = true">新增费用</el-button></template>
    </PageHeader>
    <div class="inline-metrics"><div><span>应收合计</span><strong>¥ {{ totals.receivable.toLocaleString() }}</strong></div><div><span>应付合计</span><strong>¥ {{ totals.payable.toLocaleString() }}</strong></div><div><span>预计毛利</span><strong>¥ {{ (totals.receivable - totals.payable).toLocaleString() }}</strong></div></div>
    <FilterBar v-model="keyword" placeholder="订单号、费用项目或结算单位" @reset="resetFilters">
      <el-select v-model="status" clearable placeholder="审批状态" class="filter-select"><el-option v-for="value in ['待审批', '审批通过', '审批拒绝']" :key="value" :value="value" /></el-select>
    </FilterBar>
    <DataTableFrame :rows="rows" :page-size="10">
      <template #default="{ rows: pageRows }">
        <el-table :data="pageRows" row-key="id" stripe>
          <el-table-column prop="orderNo" label="业务订单号" width="185" fixed="left" />
          <el-table-column prop="feeItem" label="费用项目" min-width="135" />
          <el-table-column prop="direction" label="收付方向" width="92" />
          <el-table-column prop="settlementParty" label="结算单位" min-width="145" />
          <el-table-column label="金额" width="130" align="right"><template #default="{ row }"><strong class="amount-cell">{{ row.currency }} {{ row.amount.toLocaleString() }}</strong></template></el-table-column>
          <el-table-column label="审批状态" width="105"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
          <el-table-column prop="applicant" label="申请人" width="86" />
          <el-table-column prop="rejectReason" label="拒绝原因" min-width="140"><template #default="{ row }">{{ row.rejectReason || '—' }}</template></el-table-column>
          <el-table-column prop="updatedAt" label="更新时间" width="145" />
          <el-table-column label="审批操作" width="142" fixed="right"><template #default="{ row }"><template v-if="row.status === '待审批'"><el-button link type="success" :icon="Check" @click="approve(row)">通过</el-button><el-button link type="danger" :icon="Close" @click="openReject(row)">拒绝</el-button></template><span v-else>已处理</span></template></el-table-column>
        </el-table>
      </template>
    </DataTableFrame>

    <el-dialog v-model="createVisible" title="新增订单费用" width="680" align-center>
      <el-form :model="form" label-position="top" class="form-grid">
        <el-form-item label="业务订单号"><el-select v-model="form.orderNo" filterable><el-option v-for="order in [...state.airOrders, ...state.groundOrders]" :key="order.id" :label="order.orderNo" :value="order.orderNo" /></el-select></el-form-item>
        <el-form-item label="费用项目"><el-input v-model="form.feeItem" placeholder="例如 空运费" /></el-form-item>
        <el-form-item label="收付方向"><el-segmented v-model="form.direction" :options="['应收', '应付']" /></el-form-item>
        <el-form-item label="结算单位"><el-input v-model="form.settlementParty" /></el-form-item>
        <el-form-item label="币种"><el-select v-model="form.currency"><el-option v-for="value in ['CNY', 'USD', 'EUR']" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="金额"><el-input-number v-model="form.amount" :min="0" :precision="2" controls-position="right" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" @click="submitCost">保存并提交审批</el-button></template>
    </el-dialog>
    <el-dialog v-model="rejectVisible" title="拒绝费用审批" width="520" align-center><el-input v-model="rejectReason" type="textarea" :rows="4" maxlength="100" show-word-limit placeholder="说明申请人需要补充或修正的内容" /><template #footer><el-button @click="rejectVisible = false">取消</el-button><el-button type="danger" @click="confirmReject">确认拒绝</el-button></template></el-dialog>
  </div>
</template>
