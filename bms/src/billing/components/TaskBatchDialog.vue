<script setup>
import { computed } from 'vue'
import { RefreshRight, View } from '@element-plus/icons-vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import StackedCell from '../../shared/components/StackedCell.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import ConfigVersionTag from '../../shared/components/ConfigVersionTag.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  batchNo: { type: String, default: '' },
  tasks: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'detail', 'retry'])

const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})
const rows = computed(() => props.tasks.filter(task => task.batchNo === props.batchNo))
const batch = computed(() => rows.value[0] || null)
const statusMeta = {
  PENDING: { label:'待执行', tone:'info' },
  RUNNING: { label:'执行中', tone:'running' },
  SUCCESS: { label:'执行成功', tone:'success' },
  FAILED: { label:'执行失败', tone:'danger' },
}
const configSourceMeta = {
  CONFIG: '客户配置',
  SYSTEM: '系统配置',
}
const status = row => statusMeta[row.status] || statusMeta.PENDING
const activeRows = computed(() => rows.value.filter(row => !row.deletedAt))
const deletedCount = computed(() => rows.value.length - activeRows.value.length)
const count = value => activeRows.value.filter(row => row.status === value).length

function openDetail(row) {
  visible.value = false
  emit('detail', row)
}
</script>

<template>
  <el-dialog v-model="visible" class="module-dialog module-dialog-large" align-center append-to-body destroy-on-close>
    <template #header>
      <div class="drawer-title"><span>生成批次详情</span><small>{{ batchNo }}</small></div>
    </template>

    <div class="batch-summary">
      <div><span>冻结客户</span><strong>{{ batch?.batchCustomerCount || 0 }}</strong></div>
      <div><span>初始创建任务</span><strong>{{ batch?.batchTaskCount || rows.length }}</strong></div>
      <div><span>有效 / 已删除</span><strong>{{ activeRows.length }} / {{ deletedCount }}</strong></div>
      <div><span>成功 / 失败</span><strong>{{ count('SUCCESS') }} / {{ count('FAILED') }}</strong></div>
      <div><span>校验跳过范围</span><strong>{{ batch?.batchSkippedCount || 0 }}</strong></div>
    </div>
    <el-alert title="批次只记录发起范围和汇总结果，不参与执行；重试、删除和查看结果均作用于单条客户任务。" type="info" :closable="false" show-icon />
    <div v-if="batch?.batchSkipSummary" class="batch-skip-summary">{{ batch.batchSkipSummary }}</div>

    <DataTableFrame class="batch-task-table" :total="rows.length" :page-size="10" :column-sort="false">
      <el-table :data="rows" border row-key="taskNo">
        <el-table-column prop="taskNo" label="任务编号" width="180" />
        <el-table-column label="状态" width="98"><template #default="scope"><StatusTag :label="scope.row.deletedAt ? '已删除' : status(scope.row).label" :tone="scope.row.deletedAt ? 'neutral' : status(scope.row).tone" /></template></el-table-column>
        <el-table-column label="客户" min-width="210"><template #default="scope"><StackedCell :primary="scope.row.customerName" :secondary="`${scope.row.customerNo} · ${scope.row.customerReferenceNo}`" /></template></el-table-column>
        <el-table-column label="客户 / 会员归属快照" min-width="230"><template #default="scope"><StackedCell :primary="scope.row.shop" :secondary="`${scope.row.customerGroup} · ${scope.row.memberCode}`" /></template></el-table-column>
        <el-table-column label="配置编号" min-width="175"><template #default="scope"><StackedCell :primary="scope.row.configNo" :secondary="configSourceMeta[scope.row.configSource] || scope.row.configSource" /></template></el-table-column>
        <el-table-column label="配置版本" width="100"><template #default="scope"><ConfigVersionTag :version="scope.row.configVersion" /></template></el-table-column>
        <el-table-column label="方案名称 / 编号" min-width="220"><template #default="scope"><StackedCell :primary="scope.row.schemeName" :secondary="`${scope.row.schemeKey} · ${scope.row.schemeType}`" /></template></el-table-column>
        <el-table-column prop="period" label="实际账期" width="190" />
        <TableActionColumn>
          <template #default="scope">
            <div class="row-action-cell">
              <el-button class="table-detail-button" link type="primary" :icon="View" title="任务详情" aria-label="任务详情" @click="openDetail(scope.row)" />
              <el-button v-if="!scope.row.deletedAt && scope.row.status === 'FAILED'" link type="primary" :icon="RefreshRight" title="重新执行" aria-label="重新执行" @click="emit('retry', scope.row)" />
            </div>
          </template>
        </TableActionColumn>
      </el-table>
    </DataTableFrame>
  </el-dialog>
</template>

<style scoped>
.batch-summary{margin-bottom:var(--space-3);display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));border:1px solid var(--border);background:#f8fafb}.batch-summary>div{min-height:64px;padding:var(--space-3);display:flex;flex-direction:column;gap:6px;border-right:1px solid var(--border)}.batch-summary>div:last-child{border-right:0}.batch-summary span{color:#7d8797;font-size:var(--font-size-sm)}.batch-summary strong{color:#2e3b51}.batch-skip-summary{margin-top:var(--space-2);color:#7d8797;font-size:var(--font-size-sm)}.batch-task-table{margin-top:var(--space-3)}@media(max-width:760px){.batch-summary{grid-template-columns:1fr 1fr}}
</style>
