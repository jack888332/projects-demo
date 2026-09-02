<script setup>
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import StackedCell from '../../shared/components/StackedCell.vue'
import StatusTag from '../../shared/components/StatusTag.vue'

const props = defineProps({
  modelValue: { type:Boolean, default:false }, config: { type:Object, default:null }, targetVersion: { type:String, default:'' }, referenceCount: { type:Number, default:0 }, selectedCount: { type:Number, default:0 },
  stores: { type:Array, default:() => [] }, groups: { type:Array, default:() => [] }, store: { type:Array, default:() => [] }, group: { type:Array, default:() => [] }, rows: { type:Array, default:() => [] }, selectedCodes: { type:Array, default:() => [] }, switchDate: { type:String, default:'' }, reason: { type:String, default:'' }, replacementCount: { type:Number, default:0 }, creating: { type:Boolean, default:false },
})
const emit = defineEmits(['update:modelValue', 'update:store', 'update:group', 'update:switchDate', 'update:reason', 'toggleAssignment', 'confirm', 'skip'])
const isAlreadyConfig = row => row.configId === props.config?.id
const resultLabel = row => row.identityIssues?.length ? '主数据异常' : isAlreadyConfig(row) ? '已引用当前配置' : row.configId ? '替换其它配置' : '新增引用'
const resultTone = row => row.identityIssues?.length ? 'danger' : isAlreadyConfig(row) ? 'neutral' : row.configId && row.configId !== props.config?.id ? 'warning' : 'success'
</script>

<template>
  <el-dialog :model-value="props.modelValue" class="module-dialog module-dialog-large" align-center append-to-body destroy-on-close :close-on-click-modal="false" @update:model-value="emit('update:modelValue', $event)">
    <template #header><div class="drawer-title"><span>{{ props.creating ? '指定适用客户' : '选择引用客户' }}</span><small>{{ props.config?.no }}-{{ props.targetVersion }}</small></div></template>
    <div class="config-summary"><div><span>配置</span><strong>{{ props.config?.name || `${props.config?.no}-${props.targetVersion}` }}</strong></div><div><span>当前生效版本</span><strong>{{ props.config?.no }}-{{ props.targetVersion }}</strong></div><div><span>配置当前有效引用</span><strong>{{ props.referenceCount }}</strong></div><div><span>{{ props.creating ? '本次选择客户' : '本次切换客户' }}</span><strong>{{ props.selectedCount }}</strong></div></div>
    <el-alert :title="props.creating ? '客户与会员为同一主体；可按所属店铺和客户组筛选，客户组选项仅显示所选店铺内的分组。跳过此步将创建未引用配置，后续可在配置清单分配客户。' : '客户与会员为同一主体；一个会员只有一个当前店铺，客户组选项仅显示所选店铺内的分组。'" type="info" :closable="false" show-icon />
    <div class="dialog-filters">
      <el-select :model-value="props.store" multiple collapse-tags clearable placeholder="所属店铺" @update:model-value="emit('update:store', $event)"><el-option v-for="item in props.stores" :key="item" :label="item" :value="item" /></el-select>
      <el-select :model-value="props.group" multiple collapse-tags clearable placeholder="所属客户组" @update:model-value="emit('update:group', $event)"><el-option v-for="item in props.groups" :key="item" :label="item" :value="item" /></el-select>
    </div>
    <DataTableFrame class="dialog-table" :total="props.rows.length" :page-size="10" :column-sort="false">
      <el-table :data="props.rows" border row-key="customerCode">
        <el-table-column label="选择" width="60"><template #default="scope"><el-checkbox :model-value="isAlreadyConfig(scope.row) || props.selectedCodes.includes(scope.row.customerCode)" :disabled="isAlreadyConfig(scope.row) || scope.row.identityIssues?.length > 0" :aria-label="`选择 ${scope.row.customerName}`" @change="emit('toggleAssignment', scope.row.customerCode, $event)" /></template></el-table-column>
        <el-table-column label="客户（会员）" min-width="175"><template #default="scope"><StackedCell :primary="scope.row.customerName" :secondary="scope.row.customerCode" /></template></el-table-column>
        <el-table-column prop="memberCode" label="会员编码" min-width="120" show-overflow-tooltip />
        <el-table-column prop="store" label="所属店铺" min-width="145" show-overflow-tooltip />
        <el-table-column prop="group" label="所属客户组" min-width="145" show-overflow-tooltip />
        <el-table-column label="当前配置" min-width="210"><template #default="scope"><StackedCell :primary="scope.row.configName || '--'" :secondary="scope.row.config ? `${scope.row.configNo}-${scope.row.configVersion}` : '--'" /></template></el-table-column>
        <el-table-column label="切换结果" min-width="135"><template #default="scope"><div class="result-cell"><StatusTag :label="resultLabel(scope.row)" :tone="resultTone(scope.row)" /><small v-if="scope.row.identityIssues?.length">{{ scope.row.identityIssues.join('；') }}</small></div></template></el-table-column>
      </el-table>
    </DataTableFrame>
    <el-form label-position="top" class="assignment-form"><el-form-item :label="props.creating ? '引用生效日期' : '切换日期'" required><el-date-picker :model-value="props.switchDate" type="date" value-format="YYYY-MM-DD" @update:model-value="emit('update:switchDate', $event)" /></el-form-item><el-form-item label="变更原因" :required="props.replacementCount > 0"><el-input :model-value="props.reason" placeholder="替换客户现有引用时必填" @update:model-value="emit('update:reason', $event)" /></el-form-item></el-form>
    <template #footer><div class="dialog-footer"><el-button @click="emit('update:modelValue', false)">取消</el-button><el-button v-if="props.creating" @click="emit('skip')">跳过此步</el-button><el-button type="primary" @click="emit('confirm')">{{ props.creating ? '确认创建' : '确认引用' }}</el-button></div></template>
  </el-dialog>
</template>

<style scoped>
.dialog-footer{display:flex;justify-content:flex-end;gap:8px}.config-summary{margin-bottom:12px;display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));border:1px solid var(--border);background:#f8fafb}.config-summary>div{min-height:64px;padding:12px;display:flex;flex-direction:column;gap:6px;border-right:1px solid var(--border)}.config-summary>div:last-child{border-right:0}.dialog-filters{display:flex;gap:8px;margin-top:12px}.dialog-filters .el-select{width:230px}.dialog-table,.assignment-form{margin-top:12px}.relation-text{display:block;white-space:normal;line-height:1.5}.assignment-form{display:grid;grid-template-columns:220px 1fr;gap:0 16px}.assignment-form :deep(.el-form-item){margin-bottom:0}.assignment-form :deep(.el-date-editor){width:100%}@media(max-width:760px){.assignment-form{grid-template-columns:1fr}.config-summary{grid-template-columns:1fr 1fr}.dialog-filters{flex-wrap:wrap}}
</style>
