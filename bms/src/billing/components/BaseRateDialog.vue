<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  draft: { type: Object, default: null },
  editing: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'save'])

const pairOptions = ['USD / CNY', 'GBP / CNY', 'CAD / CNY', 'AUD / CNY']
const foreignOf = pair => String(pair || '').split(' / ')[0] || 'USD'
const directionOptions = computed(() => {
  const foreign = foreignOf(props.draft?.pair)
  return [
    { label: `${foreign} -> CNY`, value: `${foreign} -> CNY` },
    { label: `CNY -> ${foreign}`, value: `CNY -> ${foreign}` },
  ]
})
function update(field, value) { if (props.draft) props.draft[field] = value }
function updatePair(pair) {
  if (!props.draft) return
  props.draft.pair = pair
  const foreign = foreignOf(pair)
  if (![`${foreign} -> CNY`, `CNY -> ${foreign}`].includes(props.draft.direction)) {
    props.draft.direction = `${foreign} -> CNY`
  }
}
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    class="module-dialog"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="drawer-title"><span>{{ props.editing ? '编辑基准汇率' : '添加基准汇率' }}</span><small>{{ props.draft?.direction || '--' }}</small></div>
    </template>
    <el-form v-if="props.draft" label-position="top" class="form-grid">
      <el-form-item label="货币对" required>
        <el-select :model-value="props.draft.pair" style="width:100%" @update:model-value="updatePair"><el-option v-for="item in pairOptions" :key="item" :label="item" :value="item" /></el-select>
      </el-form-item>
      <el-form-item label="汇兑方向" required>
        <el-select :model-value="props.draft.direction" style="width:100%" @update:model-value="update('direction', $event)"><el-option v-for="item in directionOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
      </el-form-item>
      <el-form-item label="基准汇率" required>
        <el-input-number :model-value="props.draft.rate" :min="0" :precision="6" :controls="false" style="width:100%" @update:model-value="update('rate', $event)" />
      </el-form-item>
      <el-form-item label="汇率来源">
        <el-select :model-value="props.draft.source" style="width:100%" @update:model-value="update('source', $event)"><el-option label="手动添加" value="手动添加" /><el-option label="手动导入" value="手动导入" /></el-select>
      </el-form-item>
      <el-form-item label="来源时间">
        <el-input :model-value="props.draft.sourceAt || '--'" disabled />
      </el-form-item>
      <el-form-item label="确认状态">
        <el-select :model-value="props.draft.status" style="width:100%" @update:model-value="update('status', $event)"><el-option label="待确认" value="待确认" /><el-option label="生效" value="生效" /><el-option label="停用" value="停用" /></el-select>
      </el-form-item>
      <el-form-item label="当前生效">
        <el-radio-group :model-value="props.draft.current" @update:model-value="update('current', $event)"><el-radio value="是">是</el-radio><el-radio value="否">否</el-radio></el-radio-group>
      </el-form-item>
    </el-form>
    <el-alert title="只有确认状态为生效的汇率才能作为客户特调汇率的兜底来源；同一货币对同一汇兑方向只允许一条当前生效记录。" type="info" :closable="false" show-icon />
    <template #footer>
      <div class="dialog-footer"><el-button @click="emit('update:modelValue', false)">取消</el-button><el-button type="primary" @click="emit('save')">{{ props.editing ? '保存修改' : '添加' }}</el-button></div>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-grid :deep(.el-form-item){margin-bottom:var(--space-3)}
.el-alert{margin-top:4px}
.dialog-footer{display:flex;justify-content:flex-end;gap:8px}
</style>
