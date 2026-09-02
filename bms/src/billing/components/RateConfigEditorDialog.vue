<script setup>
import { Delete, Plus } from '@element-plus/icons-vue'
import { rateCurrencyPairKey } from '../../domain/rateConfig.js'

const props = defineProps({
  modelValue: { type:Boolean, default:false },
  draft: { type:Object, default:null },
  editingId: { type:String, default:null },
  forkCustomer: { type:Object, default:null },
  forkSwitchDate: { type:String, default:'' },
  forkReason: { type:String, default:'' },
  currencyPairs: { type:Array, default:() => [] },
  referenceCount: { type:Number, default:0 },
  nextVersion: { type:String, default:'' },
})
const emit = defineEmits(['update:modelValue', 'update:forkSwitchDate', 'update:forkReason', 'updateRule', 'addRule', 'removeRule', 'save'])

const formatRate = (rate) => {
  if (rate === null || rate === undefined || rate === '--') return '--'
  const value = Number(rate)
  return Number.isNaN(value) ? '--' : value.toFixed(6)
}
function updateName(value) { if (props.draft) props.draft.name = value }
function updateRule(index, field, value) { emit('updateRule', { index, field, value }) }
function directionUsed(direction, index) { return props.draft?.rules?.some((rule, ruleIndex) => ruleIndex !== index && rateCurrencyPairKey(rule.direction) === rateCurrencyPairKey(direction)) }
</script>

<template>
  <el-dialog :model-value="props.modelValue" class="module-dialog module-dialog-large" align-center append-to-body destroy-on-close :close-on-click-modal="false" @update:model-value="emit('update:modelValue', $event)">
    <template #header><div class="drawer-title"><span>{{ props.editingId ? '编辑并发布新版本' : props.forkCustomer ? '另存为新配置' : '新建特调汇率配置' }}</span><small>{{ props.editingId ? `${props.draft?.no}-${props.nextVersion}` : props.draft?.no }}</small></div></template>
    <el-form v-if="props.draft" label-position="top"><el-form-item label="配置备注"><el-input :model-value="props.draft.name" placeholder="选填；未填写时展示配置编号" @update:model-value="updateName" /></el-form-item></el-form>
    <div class="rule-toolbar"><strong>货币对规则（{{ props.draft?.rules?.length || 0 }}）</strong><el-button :icon="Plus" @click="emit('addRule')">新增规则</el-button></div>
    <div class="rule-table">
      <div class="rule-row rule-head"><span>货币对 / 汇兑方向</span><span>调整方式</span><span>调整方向</span><span>调整值</span><span>当前基准</span><span>默认汇率预览</span><span>操作</span></div>
      <div v-for="(rule, index) in props.draft?.rules || []" :key="index" class="rule-row">
        <el-select :model-value="rule.direction" @update:model-value="updateRule(index, 'direction', $event)"><el-option v-for="item in props.currencyPairs" :key="item.value" :label="item.label" :value="item.value" :disabled="directionUsed(item.value, index)" /></el-select>
        <el-select :model-value="rule.method" @update:model-value="updateRule(index, 'method', $event)"><el-option label="百分比缩放" value="百分比缩放" /><el-option label="固定汇率差" value="固定汇率差" /><el-option label="固定汇率值" value="固定汇率值" /></el-select>
        <span v-if="rule.method === '固定汇率值'">--</span><el-select v-else :model-value="rule.adjustDirection" @update:model-value="updateRule(index, 'adjustDirection', $event)"><el-option label="上浮" value="上浮" /><el-option label="下浮" value="下浮" /></el-select>
        <el-input :model-value="rule.adjustValue" @update:model-value="updateRule(index, 'adjustValue', $event)" />
        <span class="rate-value">{{ formatRate(rule.base) }}</span>
        <div><strong class="rate-value">{{ formatRate(rule.result) }}</strong></div>
        <el-button link type="danger" :icon="Delete" title="删除规则" aria-label="删除规则" :disabled="props.draft.rules.length <= 1" @click="emit('removeRule', index)" />
      </div>
    </div>
    <template v-if="props.forkCustomer">
      <el-form label-position="top" class="fork-form">
        <el-form-item label="仅切换客户"><el-input :model-value="`${props.forkCustomer.customerName}（${props.forkCustomer.customerCode}）`" disabled /></el-form-item>
        <el-form-item label="切换日期" required><el-date-picker :model-value="props.forkSwitchDate" type="date" value-format="YYYY-MM-DD" @update:model-value="emit('update:forkSwitchDate', $event)" /></el-form-item>
        <el-form-item label="变更原因" required><el-input :model-value="props.forkReason" placeholder="请说明该客户需要独立配置的原因" @update:model-value="emit('update:forkReason', $event)" /></el-form-item>
      </el-form>
      <el-alert title="新配置从该客户当前配置的生效版本复制；提交后只切换该客户，原配置和其他客户不变。" type="info" :closable="false" show-icon />
    </template>
    <el-alert v-if="props.editingId" :title="`当前有 ${props.referenceCount} 个客户引用该配置；新版生效时全部引用客户将统一采用新版，编辑过程不保存草稿。`" :type="props.referenceCount > 1 ? 'warning' : 'info'" :closable="false" show-icon />
    <el-alert v-if="!props.editingId && !props.forkCustomer" title="下一步指定适用客户，可按店铺和客户组筛选；跳过该步骤将创建未引用配置。" type="info" :closable="false" show-icon />
    <template #footer><div class="dialog-footer"><el-button @click="emit('update:modelValue', false)">取消</el-button><el-button type="primary" @click="emit('save')">{{ props.editingId ? '下一步：确认发布' : props.forkCustomer ? '创建并切换该客户' : '下一步：指定适用客户' }}</el-button></div></template>
  </el-dialog>
</template>

<style scoped>
.rule-toolbar{height:44px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}.rule-table{border:1px solid var(--border);border-top:0;overflow-x:auto}.rule-row{min-width:850px;min-height:56px;display:grid;grid-template-columns:160px 135px 110px 88px 105px 125px 48px;gap:8px;align-items:center;padding:8px;border-bottom:1px solid var(--border)}.rule-row:last-child{border-bottom:0}.rule-head{min-height:40px;background:#f7f8fa;font-weight:600}.rule-row small{display:block;margin-top:2px;color:var(--warning);font-size:12px}.fork-form{display:grid;grid-template-columns:1fr 180px 1fr;gap:16px;margin-top:12px}.fork-form :deep(.el-form-item){margin-bottom:0}.fork-form :deep(.el-date-editor){width:100%}.el-alert{margin-top:12px}.dialog-footer{display:flex;justify-content:flex-end;gap:8px}@media(max-width:760px){.fork-form{grid-template-columns:1fr}}
</style>
