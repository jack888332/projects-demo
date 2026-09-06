<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import { Check, Delete, EditPen, UploadFilled, View } from '@element-plus/icons-vue'
import ConditionFilter from '../../shared/components/ConditionFilter.vue'
import HoverActionMenu from '../../shared/components/HoverActionMenu.vue'
import ImportDialog from '../../shared/components/ImportDialog.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import { useStagedQuery } from '../../shared/composables/useStagedQuery.js'
import { billingAdjustmentFixtures, billingAdjustmentSeedVersion } from '../../data/fixtures/billingAdjustments.js'
import { adjustmentPeriodOptions, billTypeOptions } from '../data/adjustmentRecords.js'
import { useDemoDataset } from '../data/useDemoDataset.js'

const initialQuery = { keyword: '', billType: '', adjustmentPeriod: '', objectType: '', status: '' }
const { query, appliedQuery, applyQuery, resetQuery } = useStagedQuery(initialQuery)
const selectedRows = ref([])
const importVisible = ref(false)
const detailVisible = ref(false)
const selectedRecord = ref(null)
const records = useDemoDataset('billingAdjustments', billingAdjustmentFixtures, billingAdjustmentSeedVersion)
const rows = computed(() => records.value.filter((item) => {
  const text = JSON.stringify(item).toLowerCase()
  return (!appliedQuery.keyword || text.includes(appliedQuery.keyword.toLowerCase()))
    && (!appliedQuery.billType || item.billType === appliedQuery.billType)
    && (!appliedQuery.adjustmentPeriod || item.adjustmentPeriod === appliedQuery.adjustmentPeriod)
    && (!appliedQuery.objectType || item.object === appliedQuery.objectType)
    && (!appliedQuery.status || item.status === appliedQuery.status)
}))
const onlyPendingSelected = computed(() => selectedRows.value.length > 0 && selectedRows.value.every((item) => item.status === '待审核'))
function markReviewed(row, approved, reason = '-') {
  row.status = approved ? '审核通过' : '审核驳回'
  row.reviewer = '财务管理员'
  row.reviewedAt = '2026-09-07 10:36'
  row.adjustedAt = '2026/09/07 10:36'
  row.operator = '财务管理员'
  row.rejectReason = reason
}
async function review(row, approved = true) {
  let reason = '-'
  if (approved) await ElMessageBox.confirm(`确认通过金额冲正记录 ${row.no}？审核通过后，金额冲正才会计入归属账单。`, '金额冲正记录审核', { type: 'warning' })
  else {
    const result = await ElMessageBox.prompt('请输入驳回原因', `驳回金额冲正记录 ${row.no}`, { inputValidator: (value) => Boolean(value) || '驳回原因不能为空' })
    reason = result.value
  }
  markReviewed(row, approved, reason)
  ElMessage.success(`金额冲正记录已${approved ? '通过' : '驳回'}`)
}
function batchReview() {
  selectedRows.value.forEach((row) => markReviewed(row, true))
  ElMessage.success(`已审核通过 ${selectedRows.value.length} 条金额冲正记录，冲正金额将计入对应归属账单`)
}
function batchRemove() { selectedRows.value.forEach((row) => records.value.splice(records.value.indexOf(row), 1)); selectedRows.value = []; ElMessage.success('待审核金额冲正记录已移除') }
function openDetail(row) { selectedRecord.value = row; detailVisible.value = true }
function removeRecord(row) { records.value.splice(records.value.indexOf(row), 1); ElMessage.success('金额冲正记录已移除') }
function resubmit(row) { row.status = '待审核'; row.rejectReason = '-'; row.reviewer = '-'; row.reviewedAt = '-'; row.adjustedAt = '-'; row.operator = row.registrant; ElMessage.success('金额冲正记录已重新提交审核') }
function finishImport(file) { ElMessage.success(`${file.name} 已导入并进入待审核队列`) }
</script>

<template>
  <div class="module-page">
    <section class="module-panel filter-table-panel">
      <div class="module-toolbar">
        <div class="condition-filter-bar">
          <ConditionFilter v-model="query.keyword" label="关键词" type="text" search-placeholder="金额冲正记录编号 / 账单 / 客户 / 订单 / 运单" />
          <ConditionFilter v-model="query.billType" label="账单类型" :options="billTypeOptions" />
          <ConditionFilter v-model="query.adjustmentPeriod" label="冲正归属" :options="adjustmentPeriodOptions" />
          <ConditionFilter v-model="query.objectType" label="挂靠对象" :options="['业务订单','首程运单','尾程包裹','成本结清记录']" />
          <ConditionFilter v-model="query.status" label="审核状态" :options="['待审核','审核通过','审核驳回']" />
          <div class="condition-filter-actions"><el-button type="primary" @click="applyQuery">查询</el-button><el-button @click="resetQuery">重置</el-button></div>
        </div>
      </div>
      <DataTableFrame :total="rows.length" :selected-count="selectedRows.length" selection-summary :page-size="10">
        <template #actions><el-button type="primary" :icon="Check" :disabled="!onlyPendingSelected" @click="batchReview">审核通过</el-button><el-button :icon="Delete" :disabled="!onlyPendingSelected" @click="batchRemove">移除</el-button><el-button :icon="UploadFilled" @click="importVisible = true">导入</el-button></template>
        <el-table :data="rows" class="clean-table" row-key="no" border @selection-change="selectedRows = $event">
          <el-table-column type="selection" width="44" fixed />
          <el-table-column prop="no" label="金额冲正记录编号" width="205" fixed />
          <el-table-column prop="submittedAt" label="批次提交时间" width="155" />
          <el-table-column label="审核状态" width="95"><template #default="scope"><StatusTag :label="scope.row.status" /></template></el-table-column>
          <el-table-column prop="billTypeLabel" label="账单类型" width="100" />
          <el-table-column prop="adjustmentPeriodLabel" label="冲正归属" width="170" />
          <el-table-column prop="party" label="客户 / 供应商" width="165" />
          <el-table-column prop="sourceBillNo" label="原账单号" width="220" />
          <el-table-column prop="sourcePeriod" label="原账期" width="205" />
          <el-table-column prop="fee" label="冲正费项" width="130" />
          <el-table-column prop="object" label="费项挂靠对象" width="125" />
          <el-table-column prop="order" label="业务订单号" width="165" />
          <el-table-column prop="firstTracking" label="首程运单号" width="155" />
          <el-table-column prop="tracking" label="尾程运单号" width="155" />
          <el-table-column prop="reason" label="冲正理由" min-width="180" />
          <el-table-column prop="beforeCurrency" label="冲正前币种" width="105" />
          <el-table-column prop="delta" label="原币金额变幅" width="115" align="right" />
          <el-table-column prop="afterAmount" label="原币冲正后金额" width="130" align="right" />
          <el-table-column prop="assignedBill" label="归属账单号" width="220" />
          <el-table-column prop="afterCurrency" label="冲正后币种" width="105" />
          <el-table-column prop="rate" label="锁定汇率" width="90" />
          <el-table-column prop="afterDelta" label="账单金额影响" width="130" align="right" />
          <el-table-column prop="afterConvertedAmount" label="冲正后金额" width="130" align="right" />
          <el-table-column prop="voucher" label="凭证" width="160" />
          <el-table-column prop="registrant" label="登记人" width="85" />
          <el-table-column prop="reviewer" label="审核人" width="85" />
          <TableActionColumn><template #default="scope"><div class="row-action-cell"><el-button class="table-detail-button" link type="primary" :icon="View" title="详情" aria-label="详情" @click="openDetail(scope.row)" /><HoverActionMenu v-if="['待审核','审核驳回'].includes(scope.row.status)"><template v-if="scope.row.status==='待审核'"><el-dropdown-item :icon="EditPen" @click="openDetail(scope.row)">修改</el-dropdown-item><el-dropdown-item :icon="Check" @click="review(scope.row,true)">审核通过</el-dropdown-item><el-dropdown-item @click="review(scope.row,false)">审核驳回</el-dropdown-item><el-dropdown-item class="danger-action" :icon="Delete" @click="removeRecord(scope.row)">移除</el-dropdown-item></template><el-dropdown-item v-else :icon="EditPen" @click="resubmit(scope.row)">修改并重新提交</el-dropdown-item></HoverActionMenu></div></template></TableActionColumn>
        </el-table>
      </DataTableFrame>
    </section>
    <ImportDialog v-model="importVisible" title="导入金额冲正记录" template-name="金额冲正记录导入模板.xlsx" @submit="finishImport" />
    <el-dialog v-model="detailVisible" title="金额冲正记录详情" class="module-dialog module-dialog-large" align-center append-to-body destroy-on-close>
      <template v-if="selectedRecord">
        <dl class="detail-grid">
          <div><dt>金额冲正记录编号</dt><dd>{{ selectedRecord.no }}</dd></div>
          <div><dt>审核状态</dt><dd>{{ selectedRecord.status }}</dd></div>
          <div><dt>账单类型</dt><dd>{{ selectedRecord.billTypeLabel }}</dd></div>
          <div><dt>冲正归属</dt><dd>{{ selectedRecord.adjustmentPeriodLabel }}</dd></div>
          <div><dt>原账单</dt><dd>{{ selectedRecord.sourceBillNo }}</dd></div>
          <div><dt>原账期</dt><dd>{{ selectedRecord.sourcePeriod }}</dd></div>
          <div><dt>归属账单</dt><dd>{{ selectedRecord.assignedBill }}</dd></div>
          <div><dt>客户 / 供应商</dt><dd>{{ selectedRecord.party }}</dd></div>
          <div><dt>业务订单</dt><dd>{{ selectedRecord.order }}</dd></div>
          <div><dt>首程 / 尾程</dt><dd>{{ selectedRecord.firstTracking }} / {{ selectedRecord.tracking }}</dd></div>
          <div><dt>原币金额变幅</dt><dd>{{ selectedRecord.delta }} {{ selectedRecord.beforeCurrency }}</dd></div>
          <div><dt>账单金额影响</dt><dd>{{ selectedRecord.afterDelta }} {{ selectedRecord.afterCurrency }}</dd></div>
          <div><dt>凭证</dt><dd>{{ selectedRecord.voucher }}</dd></div>
          <div><dt>登记人</dt><dd>{{ selectedRecord.registrant }}</dd></div>
          <div><dt>审核人 / 时间</dt><dd>{{ selectedRecord.reviewer }} / {{ selectedRecord.reviewedAt }}</dd></div>
          <div><dt>驳回原因</dt><dd>{{ selectedRecord.rejectReason }}</dd></div>
          <div class="span-2"><dt>冲正理由</dt><dd>{{ selectedRecord.reason }}</dd></div>
        </dl>
      </template>
    </el-dialog>
  </div>
</template>
