<script setup>
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import { ElTable as ElementTable, ElTableColumn as ElementTableColumn } from 'element-plus'
import {
  Delete, DocumentChecked, Refresh, RefreshRight, View,
} from '@element-plus/icons-vue'
import ProcessView from './ProcessView.vue'
import TaskBatchDialog from '../components/TaskBatchDialog.vue'
import ConditionFilter from '../../shared/components/ConditionFilter.vue'
import DownloadButton from '../../shared/components/DownloadButton.vue'
import HoverActionMenu from '../../shared/components/HoverActionMenu.vue'
import MetricGrid from '../../shared/components/MetricGrid.vue'
import StackedCell from '../../shared/components/StackedCell.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import ConfigVersionTag from '../../shared/components/ConfigVersionTag.vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import { useStagedQuery } from '../../shared/composables/useStagedQuery.js'
import { billingTaskFixtures, billingTaskSeedVersion, sourceScansByTaskId } from '../../data/fixtures/billingTasks.js'
import { useDemoDataset } from '../data/useDemoDataset.js'

const props = defineProps({
  initialTaskTab: { type: String, default: 'list' },
})

const taskPageTab = ref(props.initialTaskTab)
const taskViewMode = ref('detail')
const detailVisible = ref(false)
const batchVisible = ref(false)
const detailTab = ref('overview')
const selectedTask = ref(null)
const selectedBatchNo = ref('')

const initialTaskQuery = {
  batchNo: '',
  taskNo: '',
  configNo: '',
  configVersion: '',
  customerText: '',
  taskType: '',
  status: '',
  generationMode: '',
  triggerType: '',
  schemeType: '',
  shop: '',
  customerGroup: '',
  period: [],
}
const { query: taskQuery, appliedQuery: appliedTaskQuery, applyQuery: applyTaskQuery, resetQuery: resetTaskQuery } = useStagedQuery(initialTaskQuery)

const statusMeta = {
  PENDING: { label: '待执行', className: 'info' },
  RUNNING: { label: '执行中', className: 'running' },
  SUCCESS: { label: '执行成功', className: 'success' },
  FAILED: { label: '执行失败', className: 'danger' },
}

const taskTypeMeta = {
  FEE_POOL: '费项入池',
  BILL_GENERATE: '账单生成',
  BILL_RECALCULATE: '账单重算',
}

const generationModeMeta = {
  PENDING: '待判定',
  FIRST: '首次生成',
  SUPPLEMENT: '补充生成',
  REPLACE: '替换生成',
}

const triggerMeta = {
  SCHEDULED: '定时',
  MANUAL: '手动',
}

const configSourceMeta = {
  CONFIG: '客户配置',
  SYSTEM: '系统配置',
}

const taskRecords = useDemoDataset('billingTasks', billingTaskFixtures, billingTaskSeedVersion)
const canFilterGenerationMode = computed(() => !taskQuery.taskType || taskQuery.taskType === 'BILL_GENERATE')
const selectedSourceScans = computed(() => sourceScansByTaskId[selectedTask.value?.id] || [])

const filteredTasks = computed(() => taskRecords.value.filter((item) => {
  const customerText = `${item.customerName}${item.customerNo}${item.memberCode}`.toLowerCase()
  const periodMatched = !appliedTaskQuery.period?.length
    || (dayjs(item.periodStart).isAfter(dayjs(appliedTaskQuery.period[0]).subtract(1, 'day'))
      && dayjs(item.periodEnd).isBefore(dayjs(appliedTaskQuery.period[1]).add(1, 'day')))
  return !item.deletedAt
    && (!appliedTaskQuery.batchNo || item.batchNo.toLowerCase().includes(appliedTaskQuery.batchNo.toLowerCase()))
    && (!appliedTaskQuery.taskNo || item.taskNo.toLowerCase().includes(appliedTaskQuery.taskNo.toLowerCase()))
    && (!appliedTaskQuery.configNo || item.configNo.toLowerCase().includes(appliedTaskQuery.configNo.toLowerCase()))
    && (!appliedTaskQuery.configVersion || item.configVersion === appliedTaskQuery.configVersion)
    && (!appliedTaskQuery.customerText || customerText.includes(appliedTaskQuery.customerText.toLowerCase()))
    && (!appliedTaskQuery.taskType || item.taskType === appliedTaskQuery.taskType)
    && (!appliedTaskQuery.status || item.status === appliedTaskQuery.status)
    && (!appliedTaskQuery.generationMode || item.generationMode === appliedTaskQuery.generationMode)
    && (!appliedTaskQuery.triggerType || item.triggerType === appliedTaskQuery.triggerType)
    && (!appliedTaskQuery.schemeType || item.schemeType === appliedTaskQuery.schemeType)
    && (!appliedTaskQuery.shop || item.shop === appliedTaskQuery.shop)
    && (!appliedTaskQuery.customerGroup || item.customerGroup === appliedTaskQuery.customerGroup)
    && periodMatched
}))

const taskGroups = computed(() => {
  const groups = new Map()
  filteredTasks.value.forEach((task) => {
    const groupKey = `${task.customerNo}|${task.periodStart}|${task.periodEnd}`
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        customerName: task.customerName,
        customerNo: task.customerNo,
        periodStart: task.periodStart,
        periodEnd: task.periodEnd,
        tasks: [],
      })
    }
    groups.get(groupKey).tasks.push(task)
  })
  return [...groups.values()].map((group) => {
    const counts = { RUNNING: 0, FAILED: 0, PENDING: 0, SUCCESS: 0, DELETED: 0 }
    group.tasks.forEach((task) => {
      if (task.deletedAt) counts.DELETED += 1
      else counts[task.status] = (counts[task.status] || 0) + 1
    })
    const statusParts = []
    ;['RUNNING', 'FAILED', 'PENDING', 'SUCCESS', 'DELETED'].forEach((key) => {
      if (!counts[key]) return
      const label = key === 'DELETED' ? '已删除' : (statusMeta[key]?.label || key)
      statusParts.push(`${counts[key]} ${label}`)
    })
    return {
      ...group,
      schemeCount: new Set(group.tasks.map(task => task.schemeKey)).size,
      batches: [...new Set(group.tasks.map(task => task.batchNo).filter(no => no && no !== '-'))],
      statusSummary: statusParts.join(' · ') || '--',
    }
  }).sort((left, right) => String(right.periodEnd).localeCompare(String(left.periodEnd)) || String(left.customerNo).localeCompare(String(right.customerNo)))
})

const taskSummary = computed(() => {
  const rows = filteredTasks.value
  return [
    { key: '', label: '任务总数', value: rows.length, tone: 'blue' },
    { key: 'PENDING', label: '待执行任务', value: rows.filter((item) => item.status === 'PENDING').length, tone: 'slate' },
    { key: 'RUNNING', label: '执行中任务', value: rows.filter((item) => item.status === 'RUNNING').length, tone: 'violet' },
    { key: 'SUCCESS', label: '执行成功任务', value: rows.filter((item) => item.status === 'SUCCESS').length, tone: 'green' },
    { key: 'FAILED', label: '执行失败任务', value: rows.filter((item) => item.status === 'FAILED').length, tone: 'red' },
  ]
})

const snapshotJson = computed(() => JSON.stringify({
  executionSnapshot: {
    batchNo: selectedTask.value?.batchNo,
    scopeKey: selectedTask.value?.scopeKey,
    lockKey: selectedTask.value?.lockKey,
    dataCutoff: selectedTask.value?.dataCutoff,
    taskType: selectedTask.value?.taskType,
    generationMode: selectedTask.value?.generationMode || 'N/A',
    targetBills: selectedTask.value?.originalBills,
    recalculateScope: selectedTask.value?.recalculateScope || 'N/A',
    sourceScanMethods: selectedSourceScans.value.map((item) => `${item.dataset}: ${item.method}`),
  },
  businessSnapshotReferences: {
    configSource: selectedTask.value?.configSource,
    billConfig: `${selectedTask.value?.configNo}@${selectedTask.value?.configVersion}`,
    configScheme: `${selectedTask.value?.schemeKey} / ${selectedTask.value?.schemeName}`,
    configSchemeType: selectedTask.value?.schemeType,
    customerConfigReference: selectedTask.value?.customerReferenceNo,
    sourceRule: 'DSR-OFP-AR@V5',
    feeRule: 'FR-AR-CUSTOMER@V9',
    exchangeRate: 'FX-CUSTOMER@20260802',
  },
}, null, 2))

function display(meta, value) {
  return value ? (meta[value] || value) : '--'
}

function taskStatus(row) {
  if (row.deletedAt) return { label:'已删除', className:'neutral' }
  return statusMeta[row.status] || statusMeta.PENDING
}

function formatAmount(value) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function handleTaskTypeChange(value) {
  if (value !== 'BILL_GENERATE') {
    taskQuery.generationMode = ''
  }
}

function resetFilters() {
  resetTaskQuery()
}

function refreshTasks() {
  ElMessage.success('任务状态已刷新')
}

function openDetail(row, tab = 'overview') {
  selectedTask.value = row
  detailTab.value = tab
  detailVisible.value = true
}

function openBatch(batchNo) {
  if (!batchNo || ['-', '--'].includes(batchNo)) return
  detailVisible.value = false
  selectedBatchNo.value = batchNo
  batchVisible.value = true
}

async function rerunTask(row) {
  if (row.deletedAt || row.taskType === 'FEE_POOL' || row.status !== 'FAILED') return
  await ElMessageBox.confirm(
    '任务将沿用原执行快照、处理范围和数据截止点继续处理。确认重新执行？',
    '重新执行任务',
    { confirmButtonText: '确认重新执行', cancelButtonText: '取消', type: 'warning' },
  )
  row.status = 'PENDING'
  row.finishedAt = '--'
  row.duration = '0秒'
  row.resultConclusion = '等待从失败检查点恢复'
  ElMessage.success('任务已回到待执行队列，任务编号和执行快照保持不变')
}

async function deleteTask(row) {
  const canDelete = !row.deletedAt && row.taskType !== 'FEE_POOL' && ['PENDING', 'FAILED'].includes(row.status)
  if (!canDelete) return
  await ElMessageBox.confirm(
    `删除后任务将移出列表并释放占用范围。任务编号 ${row.taskNo} 的删除审计仍会保留。`,
    '删除任务',
    { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
  )
  row.deletedAt = '2026-08-27 17:05:00'
  row.deletedBy = '财务管理员'
  if (selectedTask.value?.id === row.id) detailVisible.value = false
  ElMessage.success('任务已删除，处理范围已释放')
}

function viewResult(row) {
  const bills = row.newBills.length ? row.newBills : row.originalBills
  if (!bills.length) {
    ElMessage.info(row.resultConclusion === '无需补充' ? '本次无需补充，未创建新结果版本' : '当前任务尚无关联账单结果')
    return
  }
  ElMessage.success(`打开关联结果：${bills.join('、')}`)
}

</script>

<template>
  <div class="billing-task-page">
        <el-tabs v-model="taskPageTab" class="task-page-tabs">
          <el-tab-pane label="任务列表" name="list">
        <section class="panel work-panel task-list-panel">
          <div class="filter-toolbar task-filter-toolbar">
            <div class="condition-filter-bar">
              <ConditionFilter v-model="taskQuery.batchNo" label="生成批次编号" type="text" />
              <ConditionFilter v-model="taskQuery.taskNo" label="任务编号" type="text" />
              <ConditionFilter v-model="taskQuery.configNo" label="配置编号" type="text" />
              <ConditionFilter v-model="taskQuery.configVersion" label="准确版本" type="text" />
              <ConditionFilter v-model="taskQuery.customerText" label="客户" type="text" search-placeholder="客户名称 / 编码 / 会员编码" />
              <ConditionFilter v-model="taskQuery.taskType" label="任务类型" :options="Object.entries(taskTypeMeta).map(([value, label]) => ({ value, label }))" @change="handleTaskTypeChange" />
              <ConditionFilter v-model="taskQuery.status" label="任务状态" :options="Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))" />
              <ConditionFilter v-model="taskQuery.generationMode" label="账单生成方式" :options="Object.entries(generationModeMeta).map(([value, label]) => ({ value, label }))" :disabled="!canFilterGenerationMode" />
              <ConditionFilter v-model="taskQuery.triggerType" label="触发方式" :options="Object.entries(triggerMeta).map(([value, label]) => ({ value, label }))" />
              <ConditionFilter v-model="taskQuery.schemeType" label="方案类型" :options="['默认方案','分支方案','不适用']" />
              <ConditionFilter v-model="taskQuery.shop" label="所属店铺" :options="['星际货运(中转)','台湾集运店','深圳集运店','义乌集运店','广州同行店','上海集运店']" />
              <ConditionFilter v-model="taskQuery.customerGroup" label="所属客户组" :options="['台湾大客户组','美国电商组','华东同行组','华南同行组']" />
              <ConditionFilter v-model="taskQuery.period" label="账期" type="date-range" />
              <div class="condition-filter-actions task-filter-actions">
                <el-button type="primary" @click="applyTaskQuery">查询</el-button>
                <el-button @click="resetFilters">重置</el-button>
              </div>
            </div>
          </div>

          <MetricGrid :items="taskSummary" :columns="5" />

          <DataTableFrame :total="taskViewMode === 'group' ? taskGroups.length : filteredTasks.length" :summary="taskViewMode === 'group' ? `共 ${taskGroups.length} 组任务` : ''" :selected-count="0" :page-size="10">
            <template #actions>
              <el-radio-group v-model="taskViewMode" class="task-view-switch" aria-label="任务视图">
                <el-radio-button value="detail">任务明细</el-radio-button>
                <el-radio-button value="group">客户 × 账期</el-radio-button>
              </el-radio-group>
              <el-button type="primary" :icon="Refresh" @click="refreshTasks">刷新状态</el-button><DownloadButton title="下载任务" file-name="账单生成任务" :rows="{ filtered: filteredTasks, all: taskRecords }" :options="[{ label: '当前筛选结果', value: 'filtered', description: '下载当前筛选条件下的任务列表' }, { label: '全部任务', value: 'all', description: '下载全部生成任务' }]" />
            </template>
            <el-table v-if="taskViewMode === 'detail'" :data="filteredTasks" class="clean-table" row-key="taskNo">
            <el-table-column label="生成批次编号" width="190" fixed>
              <template #default="scope"><el-button v-if="scope.row.batchNo !== '-'" link type="primary" @click="openBatch(scope.row.batchNo)">{{ scope.row.batchNo }}</el-button><span v-else>--</span></template>
            </el-table-column>
            <el-table-column prop="taskNo" label="任务编号" width="185" fixed />
            <el-table-column label="任务状态" width="98">
              <template #default="scope"><StatusTag :label="taskStatus(scope.row).label" :tone="taskStatus(scope.row).className" /></template>
            </el-table-column>
            <el-table-column prop="createdAt" label="任务创建时间" width="160" />
            <el-table-column prop="duration" label="执行耗时" width="90" />
            <el-table-column label="任务类型" width="100"><template #default="scope">{{ display(taskTypeMeta, scope.row.taskType) }}</template></el-table-column>
            <el-table-column label="账单生成方式" width="116"><template #default="scope">{{ display(generationModeMeta, scope.row.generationMode) }}</template></el-table-column>
            <el-table-column label="触发方式" width="112"><template #default="scope">{{ display(triggerMeta, scope.row.triggerType) }}</template></el-table-column>
            <el-table-column label="配置编号" min-width="185">
              <template #default="scope"><StackedCell :primary="scope.row.configNo" :secondary="configSourceMeta[scope.row.configSource] || scope.row.configSource" /></template>
            </el-table-column>
            <el-table-column label="配置版本" width="100"><template #default="scope"><ConfigVersionTag :version="scope.row.configVersion" /></template></el-table-column>
            <el-table-column label="方案名称 / 编号" min-width="220"><template #default="scope"><StackedCell :primary="scope.row.schemeName" :secondary="`${scope.row.schemeKey} · ${scope.row.schemeType}`" /></template></el-table-column>
            <el-table-column label="客户" min-width="190">
              <template #default="scope"><StackedCell :primary="scope.row.customerName" :secondary="`${scope.row.customerNo} / ${scope.row.memberCode}`" /></template>
            </el-table-column>
            <el-table-column prop="shop" label="所属店铺" width="150" show-overflow-tooltip />
            <el-table-column prop="customerGroup" label="所属客户组" width="150" show-overflow-tooltip />
            <el-table-column prop="period" label="账期" width="188" />
            <el-table-column prop="dataCutoff" label="数据截止点" width="160" />
            <TableActionColumn>
              <template #default="scope">
                <div class="row-action-cell">
                  <el-button class="table-detail-button" link type="primary" :icon="View" title="详情" aria-label="详情" @click="openDetail(scope.row)" />
                  <HoverActionMenu v-if="scope.row.taskType !== 'FEE_POOL'">
                    <el-dropdown-item v-if="scope.row.status === 'SUCCESS'" :icon="DocumentChecked" @click="viewResult(scope.row)">关联结果</el-dropdown-item>
                    <el-dropdown-item v-if="scope.row.status === 'FAILED'" :icon="RefreshRight" @click="rerunTask(scope.row)">重新执行</el-dropdown-item>
                    <el-dropdown-item v-if="['PENDING', 'FAILED'].includes(scope.row.status)" class="danger-action" :icon="Delete" @click="deleteTask(scope.row)">删除</el-dropdown-item>
                  </HoverActionMenu>
                </div>
              </template>
            </TableActionColumn>
            </el-table>
            <el-table v-else :data="taskGroups" class="clean-table task-group-table" row-key="groupKey">
              <el-table-column type="expand">
                <template #default="scope">
                  <div class="task-group-expand">
                    <ElementTable :data="scope.row.tasks" border row-key="taskNo">
                      <ElementTableColumn prop="taskNo" label="任务编号" width="180" />
                      <ElementTableColumn label="任务状态" width="100"><template #default="slot"><StatusTag :label="taskStatus(slot.row).label" :tone="taskStatus(slot.row).className" /></template></ElementTableColumn>
                      <ElementTableColumn label="任务类型" width="100"><template #default="slot">{{ display(taskTypeMeta, slot.row.taskType) }}</template></ElementTableColumn>
                      <ElementTableColumn label="账单生成方式" width="116"><template #default="slot">{{ display(generationModeMeta, slot.row.generationMode) }}</template></ElementTableColumn>
                      <ElementTableColumn label="方案名称 / 编号" min-width="220"><template #default="slot"><StackedCell :primary="slot.row.schemeName" :secondary="`${slot.row.schemeKey} · ${slot.row.schemeType}`" /></template></ElementTableColumn>
                      <ElementTableColumn label="配置编号 / 版本" min-width="210"><template #default="slot"><StackedCell :primary="slot.row.configNo" :secondary="`${configSourceMeta[slot.row.configSource] || slot.row.configSource} · ${slot.row.configVersion}`" /></template></ElementTableColumn>
                      <ElementTableColumn prop="dataCutoff" label="数据截止点" width="160" />
                      <ElementTableColumn label="操作" width="150">
                        <template #default="slot">
                          <div class="row-action-cell">
                            <el-button class="table-detail-button" link type="primary" :icon="View" title="详情" aria-label="详情" @click="openDetail(slot.row)" />
                            <HoverActionMenu v-if="slot.row.taskType !== 'FEE_POOL'">
                              <el-dropdown-item v-if="slot.row.status === 'SUCCESS'" :icon="DocumentChecked" @click="viewResult(slot.row)">关联结果</el-dropdown-item>
                              <el-dropdown-item v-if="slot.row.status === 'FAILED'" :icon="RefreshRight" @click="rerunTask(slot.row)">重新执行</el-dropdown-item>
                              <el-dropdown-item v-if="['PENDING', 'FAILED'].includes(slot.row.status)" class="danger-action" :icon="Delete" @click="deleteTask(slot.row)">删除</el-dropdown-item>
                            </HoverActionMenu>
                          </div>
                        </template>
                      </ElementTableColumn>
                    </ElementTable>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="客户" min-width="200" fixed>
                <template #default="scope"><StackedCell :primary="scope.row.customerName" :secondary="scope.row.customerNo" /></template>
              </el-table-column>
              <el-table-column label="账期" width="200"><template #default="scope">{{ scope.row.periodStart }} 至 {{ scope.row.periodEnd }}</template></el-table-column>
              <el-table-column label="方案数" width="90"><template #default="scope">{{ scope.row.schemeCount }}</template></el-table-column>
              <el-table-column label="任务数" width="90"><template #default="scope"><strong>{{ scope.row.tasks.length }}</strong></template></el-table-column>
              <el-table-column label="状态汇总" min-width="230"><template #default="scope"><span class="group-status-summary">{{ scope.row.statusSummary }}</span></template></el-table-column>
              <el-table-column label="生成批次" min-width="180">
                <template #default="scope">
                  <template v-for="batchNo in scope.row.batches" :key="batchNo">
                    <el-button link type="primary" @click="openBatch(batchNo)">{{ batchNo }}</el-button>
                  </template>
                  <span v-if="!scope.row.batches.length">--</span>
                </template>
              </el-table-column>
            </el-table>
          </DataTableFrame>
        </section>
          </el-tab-pane>
          <el-tab-pane label="基础配置" name="base">
            <ProcessView mode="base" embedded />
          </el-tab-pane>
        </el-tabs>

    <el-dialog v-model="detailVisible" class="module-dialog module-dialog-wide" align-center append-to-body destroy-on-close>
      <template #header>
        <div class="drawer-title"><span>任务详情</span><small>{{ selectedTask?.taskNo }}</small></div>
      </template>

      <template v-if="selectedTask">
        <div class="task-hero">
          <div class="task-identity">
            <span :class="['status-dot', taskStatus(selectedTask).className]" />
            <strong>{{ taskStatus(selectedTask).label }}</strong>
            <small>{{ display(taskTypeMeta, selectedTask.taskType) }} · {{ display(triggerMeta, selectedTask.triggerType) }}</small>
          </div>
          <div class="drawer-actions">
            <el-button v-if="!selectedTask.deletedAt && selectedTask.status === 'FAILED' && selectedTask.taskType !== 'FEE_POOL'" type="primary" :icon="RefreshRight" @click="rerunTask(selectedTask)">重新执行</el-button>
            <el-button v-if="!selectedTask.deletedAt && ['PENDING', 'FAILED'].includes(selectedTask.status) && selectedTask.taskType !== 'FEE_POOL'" :icon="Delete" @click="deleteTask(selectedTask)">删除</el-button>
          </div>
        </div>

        <el-tabs v-model="detailTab" class="drawer-tabs">
          <el-tab-pane label="任务概览" name="overview">
            <dl class="detail-grid">
              <div><dt>生成批次编号</dt><dd><el-button v-if="selectedTask.batchNo !== '-'" link type="primary" @click="openBatch(selectedTask.batchNo)">{{ selectedTask.batchNo }}</el-button><span v-else>--</span></dd></div>
              <div><dt>任务编号</dt><dd>{{ selectedTask.taskNo }}</dd></div>
              <div><dt>任务创建时间</dt><dd>{{ selectedTask.createdAt }}</dd></div>
              <div><dt>任务类型</dt><dd>{{ display(taskTypeMeta, selectedTask.taskType) }}</dd></div>
              <div><dt>触发方式</dt><dd>{{ display(triggerMeta, selectedTask.triggerType) }}</dd></div>
              <div><dt>账单生成方式</dt><dd>{{ display(generationModeMeta, selectedTask.generationMode) }}</dd></div>
              <div><dt>执行开始时间</dt><dd>{{ selectedTask.startedAt }}</dd></div>
              <div><dt>执行耗时</dt><dd>{{ selectedTask.duration }}</dd></div>
              <div v-if="selectedTask.deletedAt"><dt>删除审计</dt><dd>{{ selectedTask.deletedBy }} / {{ selectedTask.deletedAt }}</dd></div>
            </dl>
            <h4 class="section-title">业务范围</h4>
            <dl class="detail-grid">
              <div><dt>账单配置</dt><dd>{{ selectedTask.configNo }} · {{ selectedTask.configVersion }}</dd></div>
              <div><dt>配置来源</dt><dd>{{ configSourceMeta[selectedTask.configSource] || selectedTask.configSource }}</dd></div>
              <div><dt>方案名称 / 编号</dt><dd>{{ selectedTask.schemeName }} / {{ selectedTask.schemeKey }}</dd></div>
              <div><dt>方案类型</dt><dd>{{ selectedTask.schemeType }}</dd></div>
              <div><dt>客户配置引用</dt><dd>{{ selectedTask.customerReferenceNo }}</dd></div>
              <div><dt>客户</dt><dd>{{ selectedTask.customerName }} / {{ selectedTask.customerNo }}</dd></div>
              <div><dt>会员编码</dt><dd>{{ selectedTask.memberCode }}</dd></div>
              <div><dt>所属店铺快照</dt><dd>{{ selectedTask.shop }}</dd></div>
              <div><dt>所属客户组快照</dt><dd>{{ selectedTask.customerGroup }}</dd></div>
              <div><dt>实际命中来源订单所属店铺快照</dt><dd>{{ selectedTask.sourceShopSnapshots?.join('、') || (selectedTask.status === 'SUCCESS' ? '--' : '待执行') }}</dd></div>
              <div><dt>账期</dt><dd>{{ selectedTask.period }}</dd></div>
              <div><dt>数据截止点</dt><dd>{{ selectedTask.dataCutoff }}</dd></div>
            </dl>
          </el-tab-pane>

          <el-tab-pane label="执行快照" name="snapshot">
            <h4 class="section-title first-title">来源扫描记录</h4>
            <DataTableFrame v-if="selectedSourceScans.length" :total="selectedSourceScans.length" :page-size="10">
<el-table :data="selectedSourceScans" border class="source-scan-table">
              <el-table-column prop="dataset" label="来源数据集" min-width="130" fixed="left" />
              <el-table-column prop="method" label="扫描方式" width="86">
                <template #default="scope"><el-tag :type="scope.row.method === '全量' ? 'warning' : 'success'" effect="plain">{{ scope.row.method }}</el-tag></template>
              </el-table-column>
              <el-table-column prop="range" label="扫描范围" min-width="270" />
              <el-table-column prop="previousWatermark" label="上次成功水位" min-width="230" />
              <el-table-column prop="cutoff" label="本次数据截止点" min-width="170" />
              <el-table-column label="拉取 / 命中" width="110">
                <template #default="scope">{{ scope.row.pulled.toLocaleString() }} / {{ scope.row.matched.toLocaleString() }}</template>
              </el-table-column>
              <el-table-column prop="result" label="扫描结果" width="86" />
              <el-table-column prop="failure" label="失败原因" min-width="150" />
            </el-table>
            </DataTableFrame>
            <div v-else class="na-box">不适用：账单重算不读取来源数据，也不产生来源扫描记录。</div>
            <h4 class="section-title">任务执行快照</h4>
            <pre class="json-box">{{ snapshotJson }}</pre>
            <h4 class="section-title">来源查询语句（SQL）</h4>
            <pre v-if="selectedTask.sourceSql" class="json-box sql-box">{{ selectedTask.sourceSql }}</pre>
            <div v-else class="na-box">不适用：账单重算跳过来源数据筛选和费项入池。</div>
          </el-tab-pane>

          <el-tab-pane label="结果与错误" name="result">
            <div class="result-matrix">
              <div><span>来源数据</span><strong>{{ selectedTask.sourceCount.toLocaleString() }}</strong></div>
              <div><span>入池费项</span><strong>{{ selectedTask.pooledFeeCount.toLocaleString() }}</strong></div>
              <div><span>关联账单</span><strong>{{ selectedTask.billCount }}</strong></div>
              <div><span>结果结论</span><strong class="text-result">{{ selectedTask.resultConclusion }}</strong></div>
              <div><span>结果版本</span><strong class="text-result">{{ selectedTask.resultVersion }}</strong></div>
              <div><span>金额净变动（CNY）</span><strong :class="['amount-result', { negative: selectedTask.netChange < 0 }]">{{ formatAmount(selectedTask.netChange) }}</strong></div>
            </div>

            <template v-if="selectedTask.originalBills.length || selectedTask.newBills.length">
              <h4 class="section-title">账单结果关系</h4>
              <div class="bill-relations">
                <div><span>原账单清单</span><strong>{{ selectedTask.originalBills.join('、') || '--' }}</strong></div>
                <div><span>新账单清单</span><strong>{{ selectedTask.newBills.join('、') || '未生成新账单' }}</strong></div>
                <div><span>替换影响</span><strong>{{ selectedTask.generationMode === 'REPLACE' ? '原账单作废；费项归属迁移至新账单' : '--' }}</strong></div>
                <div><span>重算范围</span><strong>{{ selectedTask.recalculateScope || '当前任务账期及目标账单内费项' }}</strong></div>
              </div>
            </template>

            <h4 class="section-title">错误与处理建议</h4>
            <div :class="['error-box', selectedTask.error ? 'has-error' : '']">
              <strong>{{ selectedTask.error ? '任务执行失败' : '当前任务没有错误信息' }}</strong>
              <span v-if="selectedTask.error">{{ selectedTask.error }}</span>
              <span v-if="selectedTask.advice">处理建议：{{ selectedTask.advice }}</span>
            </div>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-dialog>
    <TaskBatchDialog v-model="batchVisible" :batch-no="selectedBatchNo" :tasks="taskRecords" @detail="openDetail" @retry="rerunTask" />
  </div>
</template>

<style scoped>
.task-view-switch{margin-right:var(--space-3)}
.task-group-table :deep(.el-table__expanded-cell){padding:var(--space-3) var(--space-5)}
.task-group-expand{background:#f8fafb;border:1px solid var(--border)}
.group-status-summary{color:#5a6476}
@media(max-width:760px){.task-view-switch{display:none}}
</style>
