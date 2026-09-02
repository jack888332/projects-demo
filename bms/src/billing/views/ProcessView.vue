<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import { Check, Delete, Download, EditPen, Minus, Plus, RefreshRight, Setting, Upload, View } from '@element-plus/icons-vue'
import MetricGrid from '../../shared/components/MetricGrid.vue'
import DownloadButton from '../../shared/components/DownloadButton.vue'
import HoverActionMenu from '../../shared/components/HoverActionMenu.vue'
import ConditionFilter from '../../shared/components/ConditionFilter.vue'
import StackedCell from '../../shared/components/StackedCell.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import ExportTaskDialogs from '../components/ExportTaskDialogs.vue'
import { useStagedQuery } from '../../shared/composables/useStagedQuery.js'
import { useDemoDataset } from '../data/useDemoDataset.js'
import { downloadRows } from '../../shared/files/downloadRows.js'
import { billingProcessFixtures } from '../../data/fixtures/billingProcess.js'

const props = defineProps({
  mode: { type: String, required: true },
  embedded: { type: Boolean, default: false },
})
const baseTab = ref('fees')
const initialQuery = { keyword: '', status: '', type: '', purpose: '', format: '', creator: '', dateRange: [] }
const { query, appliedQuery, applyQuery, resetQuery } = useStagedQuery(initialQuery)
const detailVisible = ref(false)
const selectedAudit = ref(null)
const exportDetailVisible = ref(false)
const exportConfigVisible = ref(false)
const selectedExport = ref(null)
const migrationScopes = ref(['订单扩展', '费用明细'])
const migration = reactive({ sourceShop: '深圳集运店', sourceUser: 'U-700127', sourceMember: 'M-700127', sourceCustomer: 'OG4155', timeField: '订单创建时间', dateRange: ['2026-07-30', '2026-07-31'], orderNos: 'SO-260731-004188, SO-260731-004221', targetShop: '测试集运店', targetUser: 'TEST-U-001', targetMember: 'TEST-M-001', targetCustomer: 'OG1001', warehouse: '测试一号仓', customerName: '迁移演示客户', shopName: '迁移演示店铺', testSourceTag: 'PROD_MIGRATION_20260802', suffix: '-MIG', batchSize: 500 })
const migrationPreviewReady = ref(false)
const migrationDone = ref(false)
const financeReportReady = ref(false)
const systemReportReady = ref(false)
const comparisonReady = ref(false)
const comparisonTimeField = ref('出库时间')

watch(() => props.mode, resetQuery)

const feeRows = useDemoDataset('billingFeeItems', billingProcessFixtures.fees)
const sceneRows = useDemoDataset('billingScenes', billingProcessFixtures.scenes)
const sourceRows = useDemoDataset('billingSources', billingProcessFixtures.sources)
const templateRows = useDemoDataset('billingCurrencyTemplates', billingProcessFixtures.templates)
const exportRows = useDemoDataset('billingExports', billingProcessFixtures.exports, 4)
const exportItems = useDemoDataset('billingExportItems', billingProcessFixtures.exportItems, 2)
const auditRows = useDemoDataset('billingAudits', billingProcessFixtures.audits, 4)
const compareRows = useDemoDataset('billingComparisons', billingProcessFixtures.comparisons, 3)
const migrationPreviewStats = useDemoDataset('billingMigrationPreviewStats', billingProcessFixtures.migrationPreviewStats)
const migrationResultStats = useDemoDataset('billingMigrationResultStats', billingProcessFixtures.migrationResultStats)
const migrationResultRows = useDemoDataset('billingMigrationResults', billingProcessFixtures.migrationResults, 2)

const filtered = computed(() => {
  const map = { fees: feeRows.value, scenes: sceneRows.value, sources: sourceRows.value, templates: templateRows.value }
  const source = props.mode === 'base' ? map[baseTab.value] : props.mode === 'exports' ? exportRows.value : props.mode === 'audit' ? auditRows.value : compareRows.value
  const activeQuery = props.mode === 'base' ? query : appliedQuery
  const [rangeStart, rangeEnd] = activeQuery.dateRange || []
  const dateKey = (item) => (item.createdAt || item.time || '').slice(0, 10)
  const boundary = (value) => value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value || '').slice(0, 10)
  return source.filter((item) => {
    const text = JSON.stringify(item).toLowerCase()
    const itemDate = dateKey(item)
    return (!activeQuery.keyword || text.includes(activeQuery.keyword.toLowerCase()))
      && (!activeQuery.status || item.status === activeQuery.status)
      && (!activeQuery.type || item.module === activeQuery.type || item.billType === activeQuery.type)
      && (!activeQuery.purpose || item.purpose === activeQuery.purpose)
      && (!activeQuery.format || item.format === activeQuery.format)
      && (!activeQuery.creator || item.creator === activeQuery.creator)
      && (!rangeStart || itemDate >= boundary(rangeStart))
      && (!rangeEnd || itemDate <= boundary(rangeEnd))
  })
})

const comparisonTimeProp = computed(() => comparisonTimeField.value === '出库时间' ? 'shippedAt' : 'closedAt')
const comparisonFeeNames = computed(() => {
  const names = new Set(compareRows.value.flatMap(row => [
    ...Object.keys(row.financeAmounts || {}),
    ...Object.keys(row.systemAmounts || {}),
  ]))
  const priority = ['运费', '派送费']
  return [...priority.filter(name => names.has(name)), ...[...names].filter(name => !priority.includes(name)).sort((a, b) => a.localeCompare(b, 'zh-CN'))]
})

function openAudit(row) { selectedAudit.value = row; detailVisible.value = true }
function openExport(row) { selectedExport.value = row; exportDetailVisible.value = true }
async function editFee(row) {
  const { value } = await ElMessageBox.prompt('请输入费项名称', '编辑费项', { inputValue: row.name, inputPattern: /\S+/, inputErrorMessage: '费项名称不能为空' })
  row.name = value.trim()
  ElMessage.success('费项已更新')
}
async function toggleFee(row) {
  const nextStatus = row.status === '启用' ? '停用' : '启用'
  await ElMessageBox.confirm(`确认${nextStatus}费项 ${row.code}？`, `${nextStatus}费项`, { type: nextStatus === '停用' ? 'warning' : 'info' })
  row.status = nextStatus
  ElMessage.success(`费项已${nextStatus}`)
}
async function editTemplate(row) {
  const { value } = await ElMessageBox.prompt('请输入费项币种映射', '编辑结算币种模板', { inputValue: row.mapping, inputType: 'textarea', inputPattern: /\S+/, inputErrorMessage: '费项币种映射不能为空' })
  row.mapping = value.trim()
  row.operator = '财务管理员'
  row.updatedAt = '2026-08-28 14:30'
  ElMessage.success('结算币种模板已更新')
}
function createExportTask() {
  const sequence = exportRows.value.reduce((max, item) => Math.max(max, Number(item.no.split('-').pop()) || 0), 0) + 1
  exportRows.value.unshift({ no: `EXP-20260828-${String(sequence).padStart(4, '0')}`, billType: '应收账单', purpose: '导出给内部', format: '合并式', scope: '当前筛选结果', fileType: '表格文件', bills: filtered.value.length, processed: 0, success: 0, failed: 0, status: '待执行', progress: 0, creator: '财务管理员', createdAt: '2026-08-28 14:30', finishedAt: '--', expiresAt: '--' })
  ElMessage.success('导出任务已创建，任务列表已更新')
}
function downloadExport(row) {
  const items = exportItems.value.filter((item) => item.taskNo === row.no)
  downloadRows(items.length ? items : [row], row.no)
  ElMessage.success('导出文件已下载')
}
function retryExport(row) {
  row.status = '待执行'
  row.processed = 0
  row.success = 0
  row.failed = 0
  row.progress = 0
  row.finishedAt = '--'
  row.expiresAt = '--'
  ElMessage.success('失败项已重新进入执行队列')
}
async function cancelExport(row) {
  await ElMessageBox.confirm(`确认取消导出任务 ${row.no}？`, '取消导出任务', { type: 'warning' })
  row.status = '已取消'
  row.finishedAt = '2026-08-28 14:30'
  ElMessage.success('导出任务已取消')
}
async function deleteExport(row) {
  await ElMessageBox.confirm(`确认删除导出任务 ${row.no}？`, '删除导出任务', { type: 'warning' })
  exportRows.value.splice(exportRows.value.indexOf(row), 1)
  ElMessage.success('导出任务已删除')
}
function downloadComparison() {
  downloadRows(filtered.value, '账单报表比对结果')
  ElMessage.success('比对结果已下载')
}
function handleExportConfigSaved() { ElMessage.success('对账报表配置已保存') }
async function runMigration() { await ElMessageBox.confirm(`确认向测试环境同步订单主表及 ${migrationScopes.value.join('、')}，并重置同步数据的 BMS 标记？`, '执行数据迁移', { type: 'warning' }); migrationDone.value = true; ElMessage.success('数据迁移完成，1 条费用明细失败，其余数据已写入') }
function previewMigration() { migrationPreviewReady.value = true; migrationDone.value = false; ElMessage.success('预览已生成，尚未写入数据或重置 BMS 标记') }
function runComparison() { comparisonReady.value = true; ElMessage.success('比对结果已生成，仅并排展示两侧原始金额') }
function uploadFinanceReport() { financeReportReady.value = true; comparisonReady.value = false }
function uploadSystemReport() { systemReportReady.value = true; comparisonReady.value = false }
function formatComparisonAmount(value, currency) { return value === null || value === undefined ? '--' : `${Number(value).toFixed(3)} ${currency}` }
</script>

<template>
  <div class="module-page">
    <template v-if="mode === 'base'">
      <el-tabs v-model="baseTab" class="module-tabs"><el-tab-pane label="客户侧费项" name="fees" /><el-tab-pane label="按业务场景配置" name="scenes" /><el-tab-pane label="数据源规则" name="sources" /><el-tab-pane label="费项结算币种模板" name="templates" /></el-tabs>
      <section class="module-panel filter-table-panel"><div class="module-toolbar"><div class="condition-filter-bar"><ConditionFilter v-model="query.keyword" label="关键词" type="text" search-placeholder="编码 / 名称 / 场景 / 数据源" /></div></div>
<DataTableFrame :total="filtered.length" :page-size="20">
<el-table v-if="baseTab === 'fees'" :data="filtered" class="clean-table"><el-table-column prop="code" label="费项编码" width="150" /><el-table-column prop="name" label="费项名称" /><el-table-column prop="type" label="费用类型" /><el-table-column prop="scenes" label="场景标签" min-width="160" /><el-table-column prop="object" label="挂靠对象" /><el-table-column prop="sources" label="适用订单来源" /><el-table-column prop="status" label="状态" /><el-table-column prop="references" label="被引用场景数" /><el-table-column prop="integrity" label="配置完整性" /><TableActionColumn compact><template #default="scope"><HoverActionMenu><el-dropdown-item :icon="EditPen" @click="editFee(scope.row)">编辑</el-dropdown-item><el-dropdown-item @click="toggleFee(scope.row)">{{ scope.row.status === '启用' ? '停用' : '启用' }}</el-dropdown-item></HoverActionMenu></template></TableActionColumn></el-table>
<el-table v-else-if="baseTab === 'scenes'" :data="filtered" class="clean-table"><el-table-column prop="scene" label="业务场景" /><el-table-column prop="fee" label="费项名称" /><el-table-column prop="dataset" label="来源数据集" /><el-table-column prop="table" label="取值表" width="180" /><el-table-column prop="amountField" label="金额字段" /><el-table-column prop="currencyField" label="币种字段" /><el-table-column prop="timing" label="归集时间" /><el-table-column prop="priority" label="优先级" /><el-table-column prop="status" label="状态" /><el-table-column prop="integrity" label="配置完整性" /></el-table>
<el-table v-else-if="baseTab === 'sources'" :data="filtered" class="clean-table"><el-table-column prop="code" label="数据集编码" /><el-table-column prop="name" label="名称" /><el-table-column prop="system" label="来源系统" /><el-table-column prop="database" label="来源库" /><el-table-column prop="table" label="主表" width="180" /><el-table-column prop="relation" label="关联关系" /><el-table-column prop="nodes" label="支持节点" /><el-table-column prop="timing" label="归集时间" /><el-table-column prop="window" label="查询窗口" /><el-table-column prop="pageSize" label="分页条数" /><el-table-column prop="status" label="状态" /><el-table-column prop="references" label="引用规则数" /></el-table>
<el-table v-else :data="filtered" class="clean-table"><el-table-column prop="no" label="模板编号" /><el-table-column prop="name" label="模板名称" /><el-table-column prop="default" label="默认结算币种" /><el-table-column prop="mapping" label="费项币种映射" min-width="320" /><el-table-column prop="status" label="状态" /><el-table-column prop="operator" label="操作人" /><el-table-column prop="updatedAt" label="操作时间" /><TableActionColumn compact><template #default="scope"><HoverActionMenu><el-dropdown-item :icon="EditPen" @click="editTemplate(scope.row)">编辑</el-dropdown-item></HoverActionMenu></template></TableActionColumn></el-table>
</DataTableFrame>
      </section>
    </template>

    <template v-else-if="mode === 'exports'">
      <section class="module-panel filter-table-panel"><div class="module-toolbar"><div class="condition-filter-bar"><ConditionFilter v-model="query.keyword" label="任务编号" type="text" /><ConditionFilter v-model="query.type" label="账单类型" :options="['应收账单','返款账单']" /><ConditionFilter v-model="query.purpose" label="导出用途" :options="['导出给客户','导出给内部']" /><ConditionFilter v-model="query.format" label="内部格式" :options="['拆分式','合并式']" /><ConditionFilter v-model="query.status" label="任务状态" :options="['待执行','导出中','导出成功','部分成功','导出失败','已取消']" /><ConditionFilter v-model="query.creator" label="创建人" :options="['谭清辉','郑雅雯']" /><ConditionFilter v-model="query.dateRange" label="创建时间" type="date-range" /><div class="condition-filter-actions"><el-button type="primary" @click="applyQuery">查询</el-button><el-button @click="resetQuery">重置</el-button></div></div></div>
        <DataTableFrame :total="filtered.length" :page-size="20">
          <template #actions><el-button :icon="Setting" @click="exportConfigVisible = true">对账报表配置</el-button><el-button type="primary" :icon="Plus" @click="createExportTask">导出</el-button></template>
          <el-table :data="filtered" class="clean-table"><el-table-column prop="no" label="任务编号" width="185" fixed /><el-table-column prop="billType" label="账单类型" /><el-table-column prop="purpose" label="导出用途" /><el-table-column label="导出范围" width="190"><template #default="scope">{{ scope.row.scope || '列表勾选' }}</template></el-table-column><el-table-column prop="format" label="内部导出格式" width="120" /><el-table-column prop="fileType" label="结果文件类型" /><el-table-column prop="bills" label="账单数量" /><el-table-column prop="success" label="成功数量" /><el-table-column prop="failed" label="失败数量" /><el-table-column label="任务状态"><template #default="scope"><StatusTag :label="scope.row.status" /></template></el-table-column><el-table-column label="导出进度" width="190"><template #default="scope"><StackedCell :primary="`${scope.row.processed} / ${scope.row.bills}`"><el-progress :percentage="scope.row.progress" :stroke-width="7" /></StackedCell></template></el-table-column><el-table-column prop="creator" label="创建人" /><el-table-column prop="createdAt" label="创建时间" width="155" /><el-table-column prop="finishedAt" label="完成时间" width="155" /><el-table-column prop="expiresAt" label="文件失效时间" width="155" /><TableActionColumn><template #default="scope"><div class="row-action-cell"><el-button class="table-detail-button" link type="primary" :icon="View" title="详情" aria-label="详情" @click="openExport(scope.row)" /><HoverActionMenu v-if="scope.row.failed || ['导出成功','部分成功','待执行','导出失败','已取消'].includes(scope.row.status)"><el-dropdown-item v-if="['导出成功','部分成功'].includes(scope.row.status)" :icon="Download" @click="downloadExport(scope.row)">下载</el-dropdown-item><el-dropdown-item v-if="scope.row.failed" :icon="RefreshRight" @click="retryExport(scope.row)">重试失败项</el-dropdown-item><el-dropdown-item v-if="scope.row.status === '待执行'" class="danger-action" @click="cancelExport(scope.row)">取消</el-dropdown-item><el-dropdown-item v-if="['导出成功','部分成功','导出失败','已取消'].includes(scope.row.status)" class="danger-action" :icon="Delete" @click="deleteExport(scope.row)">删除</el-dropdown-item></HoverActionMenu></div></template></TableActionColumn></el-table>
        </DataTableFrame>
      </section>
      <ExportTaskDialogs v-model:detail-visible="exportDetailVisible" v-model:config-visible="exportConfigVisible" :task="selectedExport" :items="exportItems" @saved="handleExportConfigSaved" />
    </template>

    <template v-else-if="mode === 'audit'">
      <section class="module-panel filter-table-panel"><div class="module-toolbar"><div class="condition-filter-bar"><ConditionFilter v-model="query.keyword" label="关键词" type="text" search-placeholder="对象编号 / 关联编号 / 操作人" /><ConditionFilter v-model="query.type" label="业务模块" :options="['账单配置','应收账单','调账中心','汇率配置']" /><ConditionFilter v-model="query.dateRange" label="操作时间" type="date-range" /><div class="condition-filter-actions"><el-button type="primary" @click="applyQuery">查询</el-button></div></div></div>
<DataTableFrame :total="filtered.length" :page-size="20"><template #actions><DownloadButton v-if="!embedded" :rows="filtered" file-name="内部审计" success-message="审计结果已下载" /></template><el-table :data="filtered" class="clean-table"><el-table-column prop="module" label="业务模块" /><el-table-column prop="objectType" label="对象类型" /><el-table-column prop="objectNo" label="对象编号" width="220" /><el-table-column prop="action" label="操作类型" /><el-table-column prop="operator" label="操作人" /><el-table-column prop="time" label="操作时间" width="160" /><el-table-column prop="reason" label="操作原因" min-width="190" /><el-table-column label="执行结果"><template #default="scope"><StatusTag :label="scope.row.result" /></template></el-table-column><el-table-column prop="relation" label="关联编号" width="205" /><TableActionColumn compact><template #default="scope"><el-button class="table-detail-button" link type="primary" :icon="View" title="详情" aria-label="详情" @click="openAudit(scope.row)" /></template></TableActionColumn></el-table></DataTableFrame>
      </section>
      <el-dialog v-model="detailVisible" class="module-dialog" align-center append-to-body destroy-on-close><template #header><div class="drawer-title"><span>审计详情</span><small>{{ selectedAudit?.objectNo }}</small></div></template><template v-if="selectedAudit"><dl class="detail-grid"><div><dt>业务模块</dt><dd>{{ selectedAudit.module }}</dd></div><div><dt>操作类型</dt><dd>{{ selectedAudit.action }}</dd></div><div><dt>操作人</dt><dd>{{ selectedAudit.operator }}</dd></div><div><dt>操作时间</dt><dd>{{ selectedAudit.time }}</dd></div><div><dt>执行结果</dt><dd>{{ selectedAudit.result }}</dd></div><div><dt>关联编号</dt><dd>{{ selectedAudit.relation }}</dd></div><div class="span-2"><dt>操作原因</dt><dd>{{ selectedAudit.reason }}</dd></div></dl><MetricGrid class="inline" :columns="3" :items="[{ label: 'CNY 影响金额', value: selectedAudit.impactCny, tone: 'blue' }, { label: 'USD 影响金额', value: selectedAudit.impactUsd, tone: 'violet' }, { label: '关联对象数', value: selectedAudit.objectCount, tone: 'green' }]" /><div class="snapshot-compare"><div><h4>前值快照</h4><pre>{{ selectedAudit.before }}</pre></div><div><h4>后值快照</h4><pre>{{ selectedAudit.after }}</pre></div></div></template></el-dialog>
    </template>

    <template v-else-if="mode === 'compare'">
      <div class="compare-source-bar">
        <div class="compare-report-card">
          <div class="compare-report-copy"><span>财务侧报表</span><strong>{{ financeReportReady ? '财务对账明细_20260802.xlsx' : '尚未上传' }}</strong></div>
          <el-button :icon="Upload" @click="uploadFinanceReport">上传</el-button>
        </div>
        <div class="compare-report-card">
          <div class="compare-report-copy"><span>系统侧报表</span><strong>{{ systemReportReady ? '应收账单对账报表_20260802.xlsx' : '尚未上传' }}</strong></div>
          <el-button :icon="Upload" @click="uploadSystemReport">上传</el-button>
        </div>
        <div class="compare-time-option">
          <span>履约时间</span>
          <el-select v-model="comparisonTimeField"><el-option label="出库时间" value="出库时间" /><el-option label="结单时间" value="结单时间" /></el-select>
        </div>
      </div>
      <section class="module-panel">
        <el-alert v-if="comparisonReady" title="结果仅按同名费项字段展示两侧原始金额，不校验币种、不换算金额，也不判定一致或差异。" type="info" :closable="false" />
        <DataTableFrame
          :total="(comparisonReady ? filtered : []).length"
          :page-size="20"
          auto-content-width
          :auto-width-rows="comparisonReady ? filtered : []"
        >
          <template #actions>
            <el-button type="primary" :icon="RefreshRight" :disabled="!financeReportReady || !systemReportReady" @click="runComparison">开始比对</el-button>
            <el-button :icon="Download" :disabled="!comparisonReady" @click="downloadComparison">导出</el-button>
          </template>
        <el-table :data="comparisonReady ? filtered : []" class="clean-table">
          <el-table-column prop="order" label="业务订单号" fixed />
          <el-table-column :prop="comparisonTimeProp" :label="comparisonTimeField" />
          <el-table-column label="财务侧报表" align="center">
            <template #default="scope">
              <el-icon
                class="comparison-presence-icon"
                :class="{ 'is-present': scope.row.finance }"
                :aria-label="scope.row.finance ? '已包含' : '未包含'"
                :title="scope.row.finance ? '已包含' : '未包含'"
              >
                <Check v-if="scope.row.finance" />
                <Minus v-else />
              </el-icon>
            </template>
          </el-table-column>
          <el-table-column label="系统侧报表" align="center">
            <template #default="scope">
              <el-icon
                class="comparison-presence-icon"
                :class="{ 'is-present': scope.row.system }"
                :aria-label="scope.row.system ? '已包含' : '未包含'"
                :title="scope.row.system ? '已包含' : '未包含'"
              >
                <Check v-if="scope.row.system" />
                <Minus v-else />
              </el-icon>
            </template>
          </el-table-column>
          <el-table-column prop="financeFees" label="财务侧费项数" />
          <el-table-column prop="systemFees" label="系统侧费项数" />
          <template v-for="fee in comparisonFeeNames" :key="fee">
            <el-table-column :label="`${fee}（财务侧）`" :auto-width-key="row => formatComparisonAmount(row.financeAmounts?.[fee], row.currency)" align="right">
              <template #default="scope">{{ formatComparisonAmount(scope.row.financeAmounts?.[fee], scope.row.currency) }}</template>
            </el-table-column>
            <el-table-column :label="`${fee}（系统侧）`" :auto-width-key="row => formatComparisonAmount(row.systemAmounts?.[fee], row.currency)" align="right">
              <template #default="scope">{{ formatComparisonAmount(scope.row.systemAmounts?.[fee], scope.row.currency) }}</template>
            </el-table-column>
          </template>
        </el-table>
        </DataTableFrame>
      </section>
    </template>

    <template v-else>
      <div class="environment-banner"><strong>测试环境</strong><span>预览不写入数据；执行仅写入目标测试客户，并重置同步数据的 BMS 计费 / 付款标记。</span><div class="table-reference-actions"><el-button :icon="View" :disabled="!migrationScopes.length" @click="previewMigration">预览</el-button><el-button type="primary" :icon="RefreshRight" :disabled="!migrationPreviewReady" @click="runMigration">执行同步</el-button></div></div>
      <section class="module-panel migration-panel">
        <h3>来源数据筛选</h3>
        <el-form label-position="top"><div class="form-grid"><el-form-item label="来源店铺"><el-input v-model="migration.sourceShop" /></el-form-item><el-form-item label="来源用户"><el-input v-model="migration.sourceUser" /></el-form-item><el-form-item label="来源会员"><el-input v-model="migration.sourceMember" /></el-form-item><el-form-item label="来源客户"><el-input v-model="migration.sourceCustomer" /></el-form-item><el-form-item label="订单时间字段"><el-select v-model="migration.timeField"><el-option label="订单创建时间" value="订单创建时间" /><el-option label="出库时间" value="出库时间" /><el-option label="订单完结时间" value="订单完结时间" /></el-select></el-form-item><el-form-item label="订单时间范围"><el-date-picker v-model="migration.dateRange" type="daterange" value-format="YYYY-MM-DD" /></el-form-item><el-form-item label="业务订单号" class="span-2"><el-input v-model="migration.orderNos" type="textarea" :rows="2" /></el-form-item></div></el-form>
        <h3>目标数据映射</h3>
        <el-form label-position="top"><div class="form-grid"><el-form-item label="目标店铺"><el-input v-model="migration.targetShop" /></el-form-item><el-form-item label="目标用户"><el-input v-model="migration.targetUser" /></el-form-item><el-form-item label="目标会员"><el-input v-model="migration.targetMember" /></el-form-item><el-form-item label="目标客户"><el-input v-model="migration.targetCustomer" /></el-form-item><el-form-item label="目标仓库"><el-input v-model="migration.warehouse" /></el-form-item><el-form-item label="客户名称"><el-input v-model="migration.customerName" /></el-form-item><el-form-item label="店铺名称"><el-input v-model="migration.shopName" /></el-form-item><el-form-item label="测试来源标记"><el-input v-model="migration.testSourceTag" /></el-form-item><el-form-item label="编号后缀"><el-input v-model="migration.suffix" /></el-form-item></div></el-form>
        <h3>同步范围与批次</h3>
        <el-checkbox-group v-model="migrationScopes"><el-checkbox-button v-for="s in ['订单扩展','附加费','包裹费','费用明细','理赔单']" :key="s" :value="s" /></el-checkbox-group><el-input-number v-model="migration.batchSize" :min="100" :max="2000" :step="100" controls-position="right" style="margin-left:var(--space-4)" />
        <template v-if="migrationPreviewReady"><h3>同步预览</h3><MetricGrid class="inline" :items="migrationPreviewStats" /><el-alert title="预览未写入目标环境，也未重置任何 BMS 标记。" type="info" :closable="false" /></template>
       <template v-if="migrationDone"><h3>同步结果</h3><MetricGrid class="inline" :items="migrationResultStats" /><dl class="detail-grid"><div><dt>来源筛选</dt><dd>{{ migration.sourceCustomer }} · {{ migration.orderNos }}</dd></div><div><dt>目标客户</dt><dd>{{ migration.targetCustomer }} · {{ migration.targetShop }}</dd></div><div class="span-2"><dt>同步后订单号</dt><dd>SO-260731-004188-MIG、SO-260731-004221-MIG</dd></div></dl>
<DataTableFrame :total="migrationResultRows.length" :page-size="20"><el-table :data="migrationResultRows" border><el-table-column prop="object" label="迁移对象" /><el-table-column prop="result" label="结果" /><el-table-column prop="reason" label="失败原因" /></el-table></DataTableFrame></template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.comparison-presence-icon {
  display: inline-flex;
  width: 18px;
  height: 18px;
  font-size: 16px;
  color: var(--el-text-color-placeholder);
}

.comparison-presence-icon.is-present {
  color: var(--el-color-success);
}
</style>
