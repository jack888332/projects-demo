<script setup>
import { computed } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { getAirRateMethodRestriction } from '../domain/airSupplierRates.js'

const props = defineProps({ context: { type: Object, default: null } })
const emit = defineEmits(['close'])
const titles = { '梯度报价': '区间价格设置', '航晟运输报价': '航晟运输报价', '首加续报价': '首加续报价' }
const schemas = {
  '梯度报价': [
    { key: 'startValue', label: '起始值', source: true }, { key: 'endValue', label: '结束值', source: true },
    { key: 'chargeMethod', label: '计费方式' }, { key: 'billingUnit', label: '计费单位' },
    { key: 'unitPrice', label: '单价' }, { key: 'minimumPrice', label: '最低价格' }, { key: 'description', label: '说明', source: true },
  ],
  '航晟运输报价': [
    { key: 'pickup', label: '提货点', source: true }, { key: 'delivery', label: '卸货点', source: true },
    { key: 'vehicleType', label: '车型', source: true }, { key: 'regulated', label: '监管车', source: true },
    { key: 'specialVehicle', label: '特种车', source: true }, { key: 'tailLift', label: '尾板车', source: true },
    { key: 'unitPrice', label: '单价' }, { key: 'minimumPrice', label: '最低价格' },
  ],
  '首加续报价': [
    { key: 'startValue', label: '起始值', source: true }, { key: 'additionalValue', label: '续值', source: true },
    { key: 'billingUnit', label: '计费单位', source: true }, { key: 'unitPrice', label: '含税单价' },
    { key: 'description', label: '说明', source: true },
  ],
}
const fields = computed(() => schemas[props.context?.method] || [])
const rows = computed(() => props.context?.rows || [])
const reason = computed(() => getAirRateMethodRestriction(props.context?.method))
function value(row, field) {
  const result = field.key === 'billingUnit' && props.context?.method === '首加续报价' ? props.context.billingUnit : row[field.key]
  if (result === '' || result == null) return field.source ? '来源待确认' : '未配置'
  return String(result)
}
</script>

<template>
  <el-dialog :model-value="!!context" :title="titles[context?.method] || '计费方式详情'" width="min(960px, 96vw)" align-center :close-on-click-modal="false" @close="emit('close')" destroy-on-close>
    <div v-if="context" class="method-body">
      <el-alert :title="reason" type="warning" :closable="false" show-icon />
      <el-descriptions :column="1" border class="method-context"><el-descriptions-item label="供应商">{{ context.partnerName || '未选择' }}</el-descriptions-item><el-descriptions-item label="成本类型">{{ context.feeItemName || '未选择' }}</el-descriptions-item></el-descriptions>
      <el-table :data="rows" :aria-label="titles[context.method] + '明细'" stripe>
        <el-table-column v-for="field in fields" :key="field.key" :label="field.label" :min-width="field.key === 'billingUnit' ? 190 : 130"><template #default="{ row }">{{ value(row, field) }}</template></el-table-column>
        <template #empty><el-empty description="尚未取得报价配置来源" :image-size="64" /></template>
      </el-table>
      <el-form v-if="!context.readonly && !rows.length" label-position="top" class="method-fields">
        <el-form-item v-for="field in fields" :key="field.key" :label="field.label">
          <el-input :model-value="value({}, field)" :readonly="field.source" :disabled="!field.source" :aria-label="field.label" />
        </el-form-item>
      </el-form>
    </div>
    <template #footer><div class="method-footer"><el-tooltip v-if="!context?.readonly" :content="reason"><span><el-button :icon="Plus" disabled>新增</el-button></span></el-tooltip><el-button @click="emit('close')">关闭</el-button><el-tooltip v-if="!context?.readonly" :content="reason"><span><el-button type="primary" disabled>提交</el-button></span></el-tooltip></div></template>
  </el-dialog>
</template>

<style scoped>
.method-body { max-height: 64vh; overflow: auto; padding-right: 4px; }
.method-context { margin-block: 16px; }
.method-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; margin-top: 16px; }
.method-fields > * { min-width: 0; }
.method-footer { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.method-footer .el-button { margin: 0; }
@media (max-width: 600px) { .method-fields { grid-template-columns: minmax(0, 1fr); } }
</style>
