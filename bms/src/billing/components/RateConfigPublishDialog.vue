<script setup>
import dayjs from 'dayjs'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  config: { type: Object, default: null },
  nextVersion: { type: String, default: '' },
  references: { type: Array, default: () => [] },
  effectMode: { type: String, default: 'IMMEDIATE' },
  switchDate: { type: String, default: '' },
  reason: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'update:effectMode', 'update:switchDate', 'update:reason', 'confirm'])
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    class="module-dialog module-dialog-large"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header><div class="drawer-title"><span>确认发布新版本</span><small>{{ props.config?.no }}-{{ props.nextVersion }}</small></div></template>
    <div class="config-summary">
      <div><span>配置</span><strong>{{ props.config?.name || props.config?.no }}</strong></div>
      <div><span>当前版本</span><strong>{{ props.config?.currentVersion }}</strong></div>
      <div><span>当前引用客户</span><strong>{{ props.references.length }}</strong></div>
      <div><span>新版生效影响客户</span><strong>{{ props.references.length }}</strong></div>
    </div>
    <el-alert :title="`新版生效时，当前及届时仍引用此配置的客户将统一采用 ${props.config?.no}-${props.nextVersion}；已创建任务和已有账单保留历史版本快照。`" :type="props.references.length > 1 ? 'warning' : 'info'" :closable="false" show-icon />
    <el-form label-position="top" class="publish-form">
      <el-form-item label="发布生效方式"><el-radio-group :model-value="props.effectMode" @update:model-value="emit('update:effectMode', $event)"><el-radio-button value="IMMEDIATE">立即生效</el-radio-button><el-radio-button value="SCHEDULED">指定日期生效</el-radio-button></el-radio-group></el-form-item>
      <el-form-item label="指定生效日期" :required="props.effectMode === 'SCHEDULED'"><el-date-picker :model-value="props.switchDate" type="date" value-format="YYYY-MM-DD" :disabled="props.effectMode !== 'SCHEDULED'" :disabled-date="date => !dayjs(date).isAfter('2026-08-27', 'day')" @update:model-value="emit('update:switchDate', $event)" /></el-form-item>
    </el-form>
    <DataTableFrame class="dialog-table" :total="props.references.length" :page-size="10" :column-sort="false">
      <el-table :data="props.references" border row-key="id">
        <el-table-column prop="customerCode" label="客户编码" width="100" />
        <el-table-column prop="customerName" label="客户名称" min-width="170" />
        <el-table-column prop="memberCode" label="会员编码" min-width="120" show-overflow-tooltip />
        <el-table-column prop="store" label="所属店铺" min-width="140" show-overflow-tooltip />
        <el-table-column prop="group" label="所属客户组" min-width="140" show-overflow-tooltip />
        <el-table-column label="当前配置版本编号" min-width="190"><template #default="scope">{{ props.config?.no }}-{{ scope.row.configVersion }}</template></el-table-column>
        <el-table-column label="新版生效后" min-width="190"><template #default>{{ props.config?.no }}-{{ props.nextVersion }}</template></el-table-column>
      </el-table>
    </DataTableFrame>
    <el-form label-position="top" class="dialog-form"><el-form-item label="变更原因" :required="props.references.length > 1"><el-input :model-value="props.reason" placeholder="共享配置发布新版本时必填" @update:model-value="emit('update:reason', $event)" /></el-form-item></el-form>
    <template #footer><div class="dialog-footer"><el-button @click="emit('update:modelValue', false)">取消</el-button><el-button type="primary" @click="emit('confirm')">{{ props.effectMode === 'SCHEDULED' ? '发布并预约生效' : '发布并立即生效' }}</el-button></div></template>
  </el-dialog>
</template>

<style scoped>
.dialog-footer{display:flex;justify-content:flex-end;gap:8px}.config-summary{margin-bottom:12px;display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));border:1px solid var(--border);background:#f8fafb}.config-summary>div{min-height:64px;padding:12px;display:flex;flex-direction:column;gap:6px;border-right:1px solid var(--border)}.config-summary>div:last-child{border-right:0}.dialog-table,.dialog-form,.publish-form{margin-top:12px}.relation-text{white-space:normal;line-height:1.5}.dialog-form :deep(.el-form-item),.publish-form :deep(.el-form-item){margin-bottom:0}.publish-form{display:grid;grid-template-columns:1fr 220px;gap:16px}.publish-form :deep(.el-date-editor){width:100%}
@media(max-width:760px){.config-summary{grid-template-columns:1fr 1fr}}
</style>
