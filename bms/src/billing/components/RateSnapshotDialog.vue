<script setup>
import { CopyDocument } from '@element-plus/icons-vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import StackedCell from '../../shared/components/StackedCell.vue'
import StatusTag from '../../shared/components/StatusTag.vue'

const props = defineProps({
  modelValue: { type:Boolean, default:false },
  reference: { type:Object, default:null },
  config: { type:Object, default:null },
  version: { type:Object, default:null },
  rules: { type:Array, default:() => [] },
})
const emit = defineEmits(['update:modelValue', 'fork'])
const formatDirection = direction => direction?.replace('->', '→') || '--'
const formatRate = (rate) => {
  if (rate === null || rate === undefined || rate === '--') return '--'
  const value = Number(rate)
  return Number.isNaN(value) ? '--' : value.toFixed(6)
}
</script>

<template>
  <el-dialog :model-value="props.modelValue" class="module-dialog module-dialog-large" align-center append-to-body destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <template #header><div class="drawer-title"><span>{{ props.reference?.customerCode ? '客户当前配置版本' : '配置版本快照' }}</span><small>{{ props.config?.no || props.reference?.configNo }}-{{ props.version?.version || props.reference?.configVersion }}</small></div></template>
    <el-alert title="版本仅固化规则集合；基准汇率和默认汇率按当前生效基准表动态预览，不会改写已发布规则。" type="info" :closable="false" show-icon />
    <el-descriptions v-if="props.version" class="snapshot-descriptions" :column="2" border>
      <el-descriptions-item v-if="props.reference?.customerCode" label="客户">{{ props.reference.customerName }}（{{ props.reference.customerCode }}）</el-descriptions-item>
      <el-descriptions-item v-if="props.reference?.customerCode" label="生效期间">{{ props.reference.effectiveFrom }} 至 {{ props.reference.effectiveTo }}</el-descriptions-item>
      <el-descriptions-item label="配置">{{ props.config?.name || props.config?.no || props.reference?.configName || props.reference?.configNo }}</el-descriptions-item>
      <el-descriptions-item label="配置版本编号">{{ props.config?.no || props.reference?.configNo }}-{{ props.version.version || props.reference?.configVersion }}</el-descriptions-item>
      <el-descriptions-item label="版本状态"><StatusTag :label="props.version.versionStatus || '历史'" /></el-descriptions-item>
      <el-descriptions-item label="发布时间">{{ props.version.publishedAt || '未记录' }}</el-descriptions-item>
      <el-descriptions-item label="生效时间">{{ props.version.versionStatus === '已取消' ? '未生效' : props.version.effectiveAt || '未记录' }}</el-descriptions-item>
      <el-descriptions-item label="规则数量">{{ props.rules.length }}</el-descriptions-item>
      <el-descriptions-item label="变更原因" :span="2">{{ props.version.changeReason || '未记录' }}</el-descriptions-item>
      <el-descriptions-item v-if="props.version.versionStatus === '已取消'" label="取消时间">{{ props.version.cancelledAt || '未记录' }}</el-descriptions-item>
      <el-descriptions-item v-if="props.version.versionStatus === '已取消'" label="取消原因">{{ props.version.cancelReason || '未记录' }}</el-descriptions-item>
    </el-descriptions>
    <DataTableFrame class="rule-table" :total="props.rules.length" :page-size="10" :column-sort="false">
      <el-table :data="props.rules" border>
        <el-table-column label="货币对" width="135"><template #default="scope"><strong>{{ formatDirection(scope.row.direction) }}</strong></template></el-table-column>
        <el-table-column label="调整规则" min-width="210"><template #default="scope"><StackedCell :primary="scope.row.method" :secondary="scope.row.method === '固定汇率值' ? '' : `${scope.row.adjustDirection} ${scope.row.adjustValue}`" /></template></el-table-column>
        <el-table-column label="当前基准" width="125"><template #default="scope">{{ formatRate(scope.row.base) }}</template></el-table-column>
        <el-table-column label="默认汇率预览" min-width="180"><template #default="scope"><StackedCell :primary="formatRate(scope.row.result)" :secondary="scope.row.source === 'FALLBACK_CHAIN' ? '当前基准为空，按 1 展示' : scope.row.source === 'FIXED_VALUE' ? '固定值' : '当前基准汇率派生'" /></template></el-table-column>
      </el-table>
    </DataTableFrame>
    <template #footer><div class="dialog-footer"><el-button @click="emit('update:modelValue', false)">关闭</el-button><el-button v-if="props.reference?.customerCode" type="primary" :icon="CopyDocument" :disabled="!props.version" @click="emit('fork')">另存为新配置</el-button></div></template>
  </el-dialog>
</template>

<style scoped>
.dialog-footer{display:flex;justify-content:flex-end;gap:8px}.snapshot-descriptions,.rule-table{margin-top:12px}
</style>
