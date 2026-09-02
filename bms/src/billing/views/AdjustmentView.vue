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
import { useDemoDataset } from '../data/useDemoDataset.js'

const initialQuery = { keyword: '', status: '', type: '' }
const { query, appliedQuery, applyQuery, resetQuery } = useStagedQuery(initialQuery)
const selectedRows = ref([])
const importVisible = ref(false)
const detailVisible = ref(false)
const selectedRecord = ref(null)
const records = useDemoDataset('billingAdjustments', [
  { no: 'ADJ-9f7c-1842', submittedAt: '2026-08-02 09:42', type: '应收调账', status: '待审核', party: 'OceanGate Logistics', billNo: 'ARB-OG4155-20260701-f802', fee: '基础运费', object: '业务订单', order: 'SO-260731-004188', firstTracking: 'CN260731004188', tracking: 'YT682941503GB', reason: '重量复核差异', beforeCurrency: 'GBP', delta: -12.6, afterAmount: 114.2, assignedBill: 'ARB-OG4155-20260701-f802', afterCurrency: 'CNY', rate: 9.4628, afterDelta: -119.23, afterConvertedAmount: 1080.63, voucher: '重量复核单.pdf', registrant: '谭清辉', reviewer: '-', reviewedAt: '-', rejectReason: '-' },
  { no: 'ADJ-c412-9071', submittedAt: '2026-08-02 08:15', type: '返款调账', status: '审核通过', party: 'TopKing Supply', billNo: 'RFB-OG9012-20260721-a11f', fee: '代收服务费', object: '尾程包裹', order: 'SO-260731-004221', firstTracking: 'CN260731004221', tracking: '1Z999AA10123456784', reason: '服务费率更正', beforeCurrency: 'USD', delta: 3.2, afterAmount: 9.4, assignedBill: 'RFB-OG9012-20260721-a11f', afterCurrency: 'CNY', rate: 7.1846, afterDelta: 22.99, afterConvertedAmount: 67.53, voucher: '客户确认邮件.eml', registrant: '郑雅雯', reviewer: '陈嘉明', reviewedAt: '2026-08-02 08:52', rejectReason: '-' },
  { no: 'ADJ-5de8-6320', submittedAt: '2026-08-01 16:38', type: '成本金额冲正', status: '审核驳回', party: 'FastLine UK', billNo: 'CB-FLU-202607-0041', fee: '尾程派送费', object: '尾程包裹', order: 'SO-260729-003605', firstTracking: 'CN260729003605', tracking: 'RM84720193GB', reason: '供应商重复收费', beforeCurrency: 'GBP', delta: -18.4, afterAmount: 0, assignedBill: 'CB-FLU-202607-0041', afterCurrency: 'CNY', rate: 9.4628, afterDelta: -174.12, afterConvertedAmount: 0, voucher: '供应商账单截图.png', registrant: '谭清辉', reviewer: '陈嘉明', reviewedAt: '2026-08-01 17:08', rejectReason: '凭证未显示供应商账单编号' },
  { no: 'ADJ-a91e-2485', submittedAt: '2026-08-01 14:22', type: '成本核销冲正', status: '待审核', party: 'Ocean Carrier Ltd.', billNo: 'CB-OCL-202607-0018', fee: '海运费', object: '成本结清记录', order: 'SO-260701-001821', firstTracking: 'CN260701001821', tracking: '-', reason: '结清币种登记错误', beforeCurrency: 'USD', delta: 680, afterAmount: 680, assignedBill: 'CB-OCL-202607-0018', afterCurrency: 'CNY', rate: 7.1846, afterDelta: 4885.53, afterConvertedAmount: 4885.53, voucher: '银行水单.pdf', registrant: '谭清辉', reviewer: '-', reviewedAt: '-', rejectReason: '-' },
], 3)
const rows = computed(() => records.value.filter((item) => {
  const text = JSON.stringify(item).toLowerCase(); return (!appliedQuery.keyword || text.includes(appliedQuery.keyword.toLowerCase())) && (!appliedQuery.status || item.status === appliedQuery.status) && (!appliedQuery.type || item.object === appliedQuery.type)
}))
const onlyPendingSelected = computed(() => selectedRows.value.length > 0 && selectedRows.value.every((item) => item.status === '待审核'))
async function review(row, approved = true) { let reason = '-'; if (approved) await ElMessageBox.confirm(`确认通过调账记录 ${row.no}？`, '调账审核', { type: 'warning' }); else { const result = await ElMessageBox.prompt('请输入驳回原因', `驳回 ${row.no}`, { inputValidator: (value) => Boolean(value) || '驳回原因不能为空' }); reason = result.value } row.status = approved ? '审核通过' : '审核驳回'; row.reviewer = '财务管理员'; row.reviewedAt = '2026-08-02 10:36'; row.rejectReason = reason; ElMessage.success(`调账记录已${approved ? '通过' : '驳回'}`) }
function batchReview() { selectedRows.value.forEach((row) => { row.status = '审核通过' }); ElMessage.success(`已审核通过 ${selectedRows.value.length} 条记录`) }
function batchRemove() { selectedRows.value.forEach((row) => records.value.splice(records.value.indexOf(row), 1)); selectedRows.value = []; ElMessage.success('待审核调账记录已移除') }
function openDetail(row) { selectedRecord.value = row; detailVisible.value = true }
function removeRecord(row) { records.value.splice(records.value.indexOf(row), 1); ElMessage.success('调账记录已移除') }
function resubmit(row) { row.status = '待审核'; row.rejectReason = '-'; row.reviewer = '-'; row.reviewedAt = '-'; ElMessage.success('调账记录已重新提交审核') }
function finishImport(file) { ElMessage.success(`${file.name} 已导入并进入待审核队列`) }
</script>

<template>
  <div class="module-page">
    <section class="module-panel filter-table-panel">
      <div class="module-toolbar"><div class="condition-filter-bar"><ConditionFilter v-model="query.keyword" label="关键词" type="text" search-placeholder="调账单号 / 账单 / 客户 / 订单 / 运单" /><ConditionFilter v-model="query.type" label="挂靠对象" :options="['业务订单','首程运单','尾程包裹','成本结清记录']" /><ConditionFilter v-model="query.status" label="审核状态" :options="['待审核','审核通过','审核驳回']" /><div class="condition-filter-actions"><el-button type="primary" @click="applyQuery">查询</el-button></div></div></div>
      <DataTableFrame :total="rows.length" :selected-count="selectedRows.length" selection-summary :page-size="10">
        <template #actions><el-button type="primary" :icon="Check" :disabled="!onlyPendingSelected" @click="batchReview">审核通过</el-button><el-button :icon="Delete" :disabled="!onlyPendingSelected" @click="batchRemove">移除</el-button><el-button :icon="UploadFilled" @click="importVisible = true">导入</el-button></template>
        <el-table :data="rows" class="clean-table" row-key="no" border @selection-change="selectedRows = $event"><el-table-column type="selection" width="44" fixed /><el-table-column prop="no" label="调账单号" width="145" fixed /><el-table-column prop="submittedAt" label="批次提交时间" width="155" /><el-table-column label="审核状态" width="95"><template #default="scope"><StatusTag :label="scope.row.status" /></template></el-table-column><el-table-column prop="party" label="客户名称" width="165" /><el-table-column prop="billNo" label="触发账单号" width="205" /><el-table-column prop="fee" label="冲正费项" width="110" /><el-table-column prop="object" label="费项挂靠对象" width="115" /><el-table-column prop="order" label="业务订单号" width="155" /><el-table-column prop="firstTracking" label="首程运单号" width="145" /><el-table-column prop="tracking" label="尾程运单号" width="145" /><el-table-column prop="reason" label="冲正理由" min-width="160" /><el-table-column prop="beforeCurrency" label="冲正前币种" width="105" /><el-table-column prop="delta" label="原币金额变幅" width="115" align="right" /><el-table-column prop="afterAmount" label="原币冲正后金额" width="130" align="right" /><el-table-column prop="assignedBill" label="归属账单号" width="205" /><el-table-column prop="afterCurrency" label="冲正后币种" width="105" /><el-table-column prop="rate" label="锁定汇率" width="90" /><el-table-column prop="afterDelta" label="冲正后币种变幅" width="130" align="right" /><el-table-column prop="afterConvertedAmount" label="冲正后币种金额" width="130" align="right" /><el-table-column prop="voucher" label="凭证" width="150" /><el-table-column prop="registrant" label="登记人" width="85" /><el-table-column prop="reviewer" label="审核人" width="85" /><TableActionColumn><template #default="scope"><div class="row-action-cell"><el-button class="table-detail-button" link type="primary" :icon="View" title="详情" aria-label="详情" @click="openDetail(scope.row)" /><HoverActionMenu v-if="['待审核','审核驳回'].includes(scope.row.status)"><template v-if="scope.row.status==='待审核'"><el-dropdown-item :icon="EditPen" @click="openDetail(scope.row)">修改</el-dropdown-item><el-dropdown-item :icon="Check" @click="review(scope.row,true)">审核通过</el-dropdown-item><el-dropdown-item @click="review(scope.row,false)">审核驳回</el-dropdown-item><el-dropdown-item class="danger-action" :icon="Delete" @click="removeRecord(scope.row)">移除</el-dropdown-item></template><el-dropdown-item v-else :icon="EditPen" @click="resubmit(scope.row)">修改并重新提交</el-dropdown-item></HoverActionMenu></div></template></TableActionColumn></el-table>
      </DataTableFrame>
    </section>
    <ImportDialog v-model="importVisible" title="导入调账记录" template-name="调账记录导入模板.xlsx" @submit="finishImport" />
    <el-dialog v-model="detailVisible" title="调账记录详情" class="module-dialog module-dialog-large" align-center append-to-body destroy-on-close><template v-if="selectedRecord"><dl class="detail-grid"><div><dt>调账单号</dt><dd>{{ selectedRecord.no }}</dd></div><div><dt>审核状态</dt><dd>{{ selectedRecord.status }}</dd></div><div><dt>触发账单</dt><dd>{{ selectedRecord.billNo }}</dd></div><div><dt>客户</dt><dd>{{ selectedRecord.party }}</dd></div><div><dt>业务订单</dt><dd>{{ selectedRecord.order }}</dd></div><div><dt>首程 / 尾程</dt><dd>{{ selectedRecord.firstTracking }} / {{ selectedRecord.tracking }}</dd></div><div><dt>原币金额变幅</dt><dd>{{ selectedRecord.delta }} {{ selectedRecord.beforeCurrency }}</dd></div><div><dt>折算金额变幅</dt><dd>{{ selectedRecord.afterDelta }} {{ selectedRecord.afterCurrency }}</dd></div><div><dt>凭证</dt><dd>{{ selectedRecord.voucher }}</dd></div><div><dt>登记人</dt><dd>{{ selectedRecord.registrant }}</dd></div><div><dt>审核人 / 时间</dt><dd>{{ selectedRecord.reviewer }} / {{ selectedRecord.reviewedAt }}</dd></div><div><dt>驳回原因</dt><dd>{{ selectedRecord.rejectReason }}</dd></div><div class="span-2"><dt>冲正理由</dt><dd>{{ selectedRecord.reason }}</dd></div></dl></template></el-dialog>
  </div>
</template>
