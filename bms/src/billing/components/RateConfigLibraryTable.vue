<script setup>
import { CircleClose, Clock, EditPen, Promotion } from '@element-plus/icons-vue'
import HoverActionMenu from '../../shared/components/HoverActionMenu.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import StackedCell from '../../shared/components/StackedCell.vue'
import ConfigVersionCell from './ConfigVersionCell.vue'

const props = defineProps({ rows: { type:Array, default:() => [] } })
const emit = defineEmits(['edit', 'assign', 'viewHistory', 'cancelPending'])
</script>

<template>
  <el-table :data="props.rows" class="clean-table rate-table" border height="100%" row-key="id">
    <el-table-column label="配置编号" min-width="230"><template #default="scope"><StackedCell :primary="scope.row.no" :secondary="scope.row.name || '--'" /></template></el-table-column>
    <el-table-column label="配置版本" width="190"><template #default="scope"><ConfigVersionCell :current-version="scope.row.currentVersion" :pending-version="scope.row.pendingVersion" :pending-effective-at="scope.row.pendingEffectiveAt" /></template></el-table-column>
    <el-table-column label="配置标签" width="135"><template #default="scope"><StatusTag :label="scope.row.referenceLabel" :tone="scope.row.referenceTone" /></template></el-table-column>
    <el-table-column prop="referenceCount" label="命中客户" width="115" />
    <el-table-column label="特调汇率" min-width="210"><template #default="scope"><div class="rule-summary" :title="scope.row.ruleSummary"><div v-for="(line, index) in (scope.row.ratePreviewLines || ['--'])" :key="index">{{ line }}</div></div></template></el-table-column>
    <el-table-column label="调整规则" min-width="170"><template #default="scope"><div class="rule-summary"><div v-for="(line, index) in (scope.row.adjustRuleLines || ['--'])" :key="index">{{ line }}</div></div></template></el-table-column>
    <el-table-column label="状态" width="82"><template #default="scope"><StatusTag :label="scope.row.status" /></template></el-table-column>
    <TableActionColumn><template #default="scope"><div class="row-action-cell"><el-button class="table-detail-button" link type="primary" :icon="EditPen" title="编辑并发布新版本" aria-label="编辑并发布新版本" :disabled="Boolean(scope.row.pendingVersion)" @click="emit('edit', scope.row)" /><HoverActionMenu><el-dropdown-item :icon="Clock" @click="emit('viewHistory', scope.row)">查看版本记录</el-dropdown-item><el-dropdown-item v-if="scope.row.pendingVersion" class="danger-action" :icon="CircleClose" @click="emit('cancelPending', scope.row)">取消待生效版本</el-dropdown-item><el-dropdown-item :icon="Promotion" @click="emit('assign', scope.row, scope.row.currentVersion)">分配配置</el-dropdown-item></HoverActionMenu></div></template></TableActionColumn>
  </el-table>
</template>

<style scoped>
.rule-summary{display:block;line-height:1.5}
.rule-summary>div{min-width:0}
</style>
