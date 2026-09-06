<script setup>
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import { Download, RefreshRight, View } from '@element-plus/icons-vue'
import ConditionFilter from '../../shared/components/ConditionFilter.vue'
import HoverActionMenu from '../../shared/components/HoverActionMenu.vue'
import MetricGrid from '../../shared/components/MetricGrid.vue'
import SegmentedControl from '../../shared/components/SegmentedControl.vue'
import StackedCell from '../../shared/components/StackedCell.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import ConfigVersionTag from '../../shared/components/ConfigVersionTag.vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import { useStagedQuery } from '../../shared/composables/useStagedQuery.js'
import { createBillListSchema } from '../schemas/billListSchema.js'
import { billingBillFixtures, billingBillSeedVersion } from '../../data/fixtures/billingBills.js'
import { useDemoDataset } from '../data/useDemoDataset.js'
import { BILLING_PATHS } from '../../domain/constants.js'

const props = defineProps({ billType: { type: String, required: true } })
const router = useRouter()
const isReceivable = computed(() => props.billType === 'AR')
const title = computed(() => isReceivable.value ? '应收账单' : '返款账单')
const pageSchema = computed(() => createBillListSchema(isReceivable.value))
const initialQuery = {
  billNo: '', customer: '', shop: '', group: '', batchNo: '', taskNo: '', configNo: '', configVersion: '',
  configSource: '', customerReferenceNo: '', schemeText: '', schemeType: '', country: '', periodType: '', period: [],
}
const { query, appliedQuery, applyQuery, resetQuery: resetStagedQuery } = useStagedQuery(initialQuery)
const activeStatus = ref('待审核')
const selectedRows = ref([])
const exportVisible = ref(false)
const exportPurpose = ref('CUSTOMER')
const exportFormat = ref('SPLIT')
const exportFormatOptions = [
  { label: '拆分式', value: 'SPLIT' },
  { label: '合并式', value: 'MERGED' },
]
const expectedSheetCount = computed(() => exportPurpose.value === 'INTERNAL' && exportFormat.value === 'MERGED' ? 1 : scopeBillCount.value)

const configSourceMeta = {
  CONFIG: '客户配置',
  SYSTEM: '系统配置',
}

const bills = useDemoDataset('billingBills', billingBillFixtures, billingBillSeedVersion)

const statuses = computed(() => isReceivable.value
  ? ['待审核', '待结清', '逾期未结清', '已结清', '已作废', '全部']
  : ['待审核', '待结清', '已结清', '已作废', '全部'])
const typeBills = computed(() => bills.value.filter((item) => item.type === props.billType))
const filteredBills = computed(() => typeBills.value.filter((item) => {
  const statusMatch = activeStatus.value === '全部'
    || (activeStatus.value === '逾期未结清' ? item.status === '待结清' && item.overdueDays > 0 : item.status === activeStatus.value)
  const periodMatched = !appliedQuery.period?.length
    || (dayjs(item.periodStart).isAfter(dayjs(appliedQuery.period[0]).subtract(1, 'day'))
      && dayjs(item.periodEnd).isBefore(dayjs(appliedQuery.period[1]).add(1, 'day')))
  return statusMatch && (!appliedQuery.billNo || item.billNo.includes(appliedQuery.billNo))
    && (!appliedQuery.customer || `${item.customer}${item.customerNo}`.includes(appliedQuery.customer))
    && (!appliedQuery.shop || item.shop.includes(appliedQuery.shop))
    && (!appliedQuery.group || item.group === appliedQuery.group)
    && (!appliedQuery.batchNo || item.batchNo.includes(appliedQuery.batchNo))
    && (!appliedQuery.taskNo || item.taskNo === appliedQuery.taskNo)
    && (!appliedQuery.configNo || item.configNo === appliedQuery.configNo)
    && (!appliedQuery.configVersion || item.configVersion === appliedQuery.configVersion)
    && (!appliedQuery.configSource || item.configSource === appliedQuery.configSource)
    && (!appliedQuery.customerReferenceNo || item.customerReferenceNo.includes(appliedQuery.customerReferenceNo))
    && (!appliedQuery.schemeText || `${item.schemeName}${item.schemeKey}`.toLowerCase().includes(appliedQuery.schemeText.toLowerCase()))
    && (!appliedQuery.schemeType || item.schemeType === appliedQuery.schemeType)
    && (!appliedQuery.country || item.country === appliedQuery.country)
    && (!appliedQuery.periodType || item.periodType === appliedQuery.periodType)
    && periodMatched
}))
const hasBatchScope = computed(() => Boolean(
  appliedQuery.batchNo || appliedQuery.taskNo || appliedQuery.configNo || appliedQuery.configVersion
  || appliedQuery.configSource || appliedQuery.customerReferenceNo || appliedQuery.schemeText || appliedQuery.schemeType,
))
const batchScopeText = computed(() => {
  if (appliedQuery.batchNo) return `生成批次编号 / ${appliedQuery.batchNo}`
  if (appliedQuery.taskNo) return `任务编号 / ${appliedQuery.taskNo}`
  if (appliedQuery.configNo) return `配置编号 / ${appliedQuery.configNo}`
  if (appliedQuery.configVersion) return `准确版本 / ${appliedQuery.configVersion}`
  if (appliedQuery.configSource) return `配置来源 / ${configSourceMeta[appliedQuery.configSource] || appliedQuery.configSource}`
  if (appliedQuery.customerReferenceNo) return `客户配置引用 / ${appliedQuery.customerReferenceNo}`
  if (appliedQuery.schemeText) return `方案名称/标识 / ${appliedQuery.schemeText}`
  if (appliedQuery.schemeType) return `方案类型 / ${appliedQuery.schemeType}`
  return ''
})
const scopeBillCount = computed(() => hasBatchScope.value ? filteredBills.value.length : selectedRows.value.length)
const countStatus = (status) => status === '逾期未结清'
  ? typeBills.value.filter((item) => item.status === '待结清' && item.overdueDays > 0).length
  : typeBills.value.filter((item) => item.status === status).length
const summary = computed(() => isReceivable.value ? [
  { label: '账单总数', value: typeBills.value.length, tone: 'blue' },
  { label: '待审核账单', value: countStatus('待审核'), tone: 'amber' },
  { label: '待结清', value: countStatus('待结清'), tone: 'violet' },
  { label: '逾期未结清', value: countStatus('逾期未结清'), tone: 'red' },
] : [
  { label: '账单总数', value: typeBills.value.length, tone: 'blue' },
  { label: '待审核账单', value: countStatus('待审核'), tone: 'amber' },
  { label: '待结清', value: countStatus('待结清'), tone: 'violet' },
  { label: '已结清', value: countStatus('已结清'), tone: 'green' },
])

function money(value) { return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function refundListAmount(row) {
  const currency = row.settlementCurrency || row.currency || 'CNY'
  const actual = Number(row.actualRefund ?? row.amount ?? 0)
  const returned = Number(row.paid ?? row.returned ?? 0)
  return { currency, actual, returned, pending: Math.max(actual - returned, 0) }
}
function refundListBuckets(row) {
  if (Array.isArray(row.refundCurrencyBuckets) && row.refundCurrencyBuckets.length) {
    return row.refundCurrencyBuckets.map(bucket => ({
      currency: bucket.currency,
      payable: Number(bucket.payable ?? 0),
      deduction: Number(bucket.deduction ?? 0),
      actual: Number(bucket.actual ?? 0),
      paid: Number(bucket.paid ?? 0),
      pending: Number(bucket.pending ?? Math.max(Number(bucket.actual ?? 0) - Number(bucket.paid ?? 0), 0)),
    }))
  }
  const amount = refundListAmount(row)
  const refundRate = Number(row.refundRate ?? 1)
  return [{
    currency: amount.currency,
    payable: Number(row.payableRefund ?? row.original ?? 0) * refundRate,
    deduction: Number(row.specifiedDeduction ?? row.deduction ?? 0) * refundRate,
    actual: amount.actual,
    paid: amount.returned,
    pending: amount.pending,
  }]
}
function resetQuery() { resetStagedQuery(); activeStatus.value = '待审核' }
function openDetail(row) {
  const parentPath = isReceivable.value ? BILLING_PATHS.receivable : BILLING_PATHS.refund
  router.push(`${parentPath}/${encodeURIComponent(row.billNo)}`)
}
async function recalculateBill(row) {
  await ElMessageBox.confirm(`确认重新计算账单 ${row.billNo}？`, '账单重算', { type: 'warning' })
  row.processingState = '等待重算'
  row.taskNo = `BMS-RECALC-${dayjs().format('YYYYMMDDHHmmss')}`
  selectedRows.value = selectedRows.value.filter((item) => item.billNo !== row.billNo)
  ElMessage.success('已创建重算任务，处理状态已更新')
}
function openExport() {
  exportPurpose.value = isReceivable.value ? 'CUSTOMER' : 'CUSTOMER'
  exportFormat.value = 'SPLIT'
  exportVisible.value = true
}
function confirmExport() {
  exportVisible.value = false
  const formatText = exportPurpose.value === 'INTERNAL' ? `，采用${exportFormat.value === 'SPLIT' ? '拆分式' : '合并式'}` : ''
  const scopeText = hasBatchScope.value ? `（${batchScopeText.value}，共 ${scopeBillCount.value} 个客户账单批量下载）` : ''
  ElMessage.success(`已创建 ${scopeBillCount.value} 个账单的下载任务${formatText}${scopeText}`)
}
</script>

<template>
  <div class="module-page live-reference-page">
    <section class="condition-query-panel">
      <div class="condition-filter-bar">
        <ConditionFilter
          v-for="filter in pageSchema.filters"
          :key="filter.key"
          v-model="query[filter.key]"
          :label="filter.label"
          :type="filter.type"
          :options="filter.options"
        />
        <div class="condition-filter-actions"><el-button type="primary" @click="applyQuery">查询</el-button><el-button @click="resetQuery">重置</el-button></div>
      </div>
    </section>

    <MetricGrid class="reference-kpis" :items="summary" />

    <SegmentedControl v-model="activeStatus" :options="statuses" aria-label="账单状态" />

    <section class="module-panel">
      <DataTableFrame :total="filteredBills.length" :selected-count="selectedRows.length" selection-summary>
      <template #actions><el-button :icon="Download" :disabled="!hasBatchScope && !selectedRows.length" @click="openExport">{{ hasBatchScope ? '批量下载' : '导出' }}</el-button></template>
      <el-table :data="filteredBills" class="clean-table" row-key="billNo" border @selection-change="selectedRows = $event">
        <el-table-column type="selection" width="44" fixed />
        <el-table-column prop="billNo" label="账单编号" width="205" fixed />
        <el-table-column label="账单状态" width="100"><template #default="scope"><StatusTag :label="scope.row.status" /></template></el-table-column>
        <el-table-column prop="closeStatus" label="账期收口" width="90"><template #default="scope"><StatusTag :label="scope.row.closeStatus" /></template></el-table-column>
        <el-table-column prop="processingState" label="处理状态" width="125"><template #default="scope">{{ scope.row.processingState || '--' }}</template></el-table-column>
        <el-table-column v-if="!isReceivable" prop="refundMode" label="返款模式" width="100" />
        <el-table-column :label="isReceivable ? '费项结算币种金额' : '返款结算币金额'" :width="isReceivable ? 250 : 620"><template #default="scope"><div v-if="isReceivable" class="amount-lines"><span>应收 <b>{{ money(scope.row.amount) }} {{ scope.row.currency }}</b></span><span>已核销 {{ money(scope.row.paid) }} {{ scope.row.currency }}</span><span>未核销 <b>{{ money(scope.row.amount - scope.row.paid) }} {{ scope.row.currency }}</b></span></div><div v-else class="refund-list-buckets"><div v-for="bucket in refundListBuckets(scope.row)" :key="bucket.currency" class="amount-lines refund-list-bucket"><strong>{{ bucket.currency }}</strong><span>应付返款 <b>{{ money(bucket.payable) }}</b></span><span>扣减费项 {{ money(bucket.deduction) }}</span><span>实付返款 <b>{{ money(bucket.actual) }}</b></span><span>已付返款 {{ money(bucket.paid) }}</span><span>待付返款 <b>{{ money(bucket.pending) }}</b></span></div></div></template></el-table-column>
        <el-table-column prop="periodType" label="账期类型" width="90" /><el-table-column prop="periodStart" label="账期起始日" width="112" /><el-table-column prop="periodEnd" label="账期结束日" width="112" />
        <el-table-column v-if="isReceivable" prop="sector" label="业务板块" width="125" /><el-table-column prop="country" :label="isReceivable ? '运抵国' : '目的国'" width="100" /><el-table-column prop="customer" label="客户名称" width="160" show-overflow-tooltip /><el-table-column prop="shop" label="所属店铺" width="155" show-overflow-tooltip /><el-table-column prop="group" label="所属客户组" width="130" show-overflow-tooltip /><el-table-column prop="batchNo" label="生成批次编号" width="210" show-overflow-tooltip /><el-table-column prop="taskNo" label="任务编号" width="200" show-overflow-tooltip />
        <el-table-column label="配置编号" min-width="210"><template #default="scope"><StackedCell :primary="scope.row.configNo" :secondary="configSourceMeta[scope.row.configSource] || scope.row.configSource" /></template></el-table-column>
        <el-table-column label="配置版本" width="100"><template #default="scope"><ConfigVersionTag :version="scope.row.configVersion" /></template></el-table-column>
        <el-table-column prop="customerReferenceNo" label="客户配置引用" width="190" show-overflow-tooltip />
        <el-table-column label="方案名称 / 编号" min-width="220"><template #default="scope"><StackedCell :primary="scope.row.schemeName" :secondary="`${scope.row.schemeKey} · ${scope.row.schemeType}`" /></template></el-table-column>
        <el-table-column prop="sentAt" label="账单发出日" width="112" />
        <el-table-column v-if="isReceivable" prop="dueAt" label="信用期结束日" width="120" /><el-table-column v-if="isReceivable" prop="overdueDays" label="逾期天数" width="90" /><el-table-column prop="notice" label="通知状态" width="95" />
        <TableActionColumn><template #default="scope"><div class="row-action-cell"><el-button class="table-detail-button" link type="primary" :icon="View" title="详情" aria-label="详情" @click="openDetail(scope.row)" /><HoverActionMenu v-if="!['已结清','已作废'].includes(scope.row.status) && !scope.row.processingState"><el-dropdown-item :icon="RefreshRight" @click="recalculateBill(scope.row)">账单重算</el-dropdown-item></HoverActionMenu></div></template></TableActionColumn>
      </el-table>
      </DataTableFrame>
    </section>

    <el-dialog v-model="exportVisible" title="下载账单" class="module-dialog" align-center append-to-body destroy-on-close>
      <el-form label-width="110px">
        <el-form-item label="账单类型"><strong>{{ title }}</strong></el-form-item>
        <el-form-item v-if="hasBatchScope" label="导出范围"><strong>{{ batchScopeText }}</strong></el-form-item>
        <el-form-item label="账单数量"><strong>{{ scopeBillCount }} 个{{ hasBatchScope ? '客户账单' : '' }}</strong></el-form-item>
        <el-form-item label="导出用途"><el-radio-group v-model="exportPurpose" :disabled="!isReceivable"><el-radio value="CUSTOMER">导出给客户</el-radio><el-radio v-if="isReceivable" value="INTERNAL">导出给内部</el-radio></el-radio-group></el-form-item>
        <el-form-item v-if="isReceivable && exportPurpose === 'INTERNAL'" label="内部导出格式">
          <SegmentedControl v-model="exportFormat" :options="exportFormatOptions" aria-label="内部导出格式" />
        </el-form-item>
        <el-form-item v-if="isReceivable && exportPurpose === 'INTERNAL'" label="预计 Sheet"><strong>{{ expectedSheetCount }} 个</strong></el-form-item>
        <el-alert v-if="isReceivable && exportPurpose === 'INTERNAL' && exportFormat === 'SPLIT'" title="每张账单生成一个 Sheet；账单基本信息写入表头首个单元格的批注。" type="info" :closable="false" />
        <el-alert v-else-if="isReceivable && exportPurpose === 'INTERNAL'" title="全部账单明细进入同一个 Sheet；账单区块使用交替底色，区块首行首格附账单基本信息批注。" type="info" :closable="false" />
        <el-alert v-else :title="hasBatchScope ? '当前筛选结果中的各客户账单分别生成对账文件，并打包为一个压缩包下载。' : '客户导出按客户拆分文件，并使用当前生效的客户导出配置。'" type="info" :closable="false" />
        <el-text v-if="isReceivable && exportPurpose === 'INTERNAL'" type="info" size="small">费项列固定优先展示运费、派送费，其余费项按费项索引顺序排列。</el-text>
      </el-form>
      <template #footer><el-button @click="exportVisible=false">取消</el-button><el-button type="primary" @click="confirmExport">{{ hasBatchScope ? '批量下载' : '下载' }}</el-button></template>
    </el-dialog>
  </div>
</template>
