<script setup>
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import BillingConfigSnapshotDetail from './BillingConfigSnapshotDetail.vue'
import ReceivableConfigEditor from './ReceivableConfigEditor.vue'
import RefundConfigEditor from './RefundConfigEditor.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  config: { type: Object, default: null },
  detailMode: { type: String, default: 'edit' },
  activeType: { type: String, default: 'AR' },
  referenceStats: { type: Object, default: () => ({ exact: 0, total: 0 }) },
  editingReferences: { type: Array, default: () => [] },
  editingImpactText: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'save'])
const editorRef = ref(null)
const displayVersionNo = computed(() => {
  if (!props.config) return '-'
  if (props.config.no === '新配置') return `发布后生成-${props.config.publishVersion || 'V1'}`
  return `${props.config.no}-${props.config.publishVersion || props.config.version}`
})

function updateConfig(field, value) {
  if (props.config) props.config[field] = value
}

defineExpose({
  validate: () => editorRef.value?.validate(),
  getSchemeSnapshot: () => editorRef.value?.getSchemeSnapshot?.(),
  getRefundSnapshot: () => editorRef.value?.getRefundSnapshot?.(),
})
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    class="module-dialog module-dialog-wide"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="drawer-title">
        <span>{{ props.detailMode === 'view' ? '查看配置版本快照' : props.config?.no === '新配置' ? '新建配置' : '编辑并发布新版本' }}</span>
        <small>{{ props.activeType === 'AR' ? '应收账单配置' : '返款账单配置' }}</small>
      </div>
    </template>

    <template v-if="props.config">
      <div class="scope-info-bar">
        <div><span>配置：</span><strong>{{ props.config.name || props.config.no }}</strong></div>
        <div><span>配置版本编号：</span><strong>{{ props.detailMode === 'view' ? `${props.config.no}-${props.config.version}` : displayVersionNo }}</strong></div>
        <div>
          <span>{{ props.detailMode === 'view' ? '当前配置引用：' : '当前引用客户：' }}</span>
          <strong>{{ props.referenceStats.total }}</strong>
        </div>
      </div>

      <template v-if="props.detailMode === 'view'">
        <section class="exact-version-view">
          <BillingConfigSnapshotDetail :config="props.config" />
        </section>
      </template>

      <template v-else>
        <el-alert
          v-if="props.editingReferences.length && props.config.no !== '新配置'"
          class="editing-impact"
          :title="`当前有效引用客户：${props.editingImpactText}`"
          :type="props.editingReferences.length > 1 ? 'warning' : 'info'"
          :closable="false"
          show-icon
        />
        <section class="config-version-panel">
          <el-form label-position="top" class="config-version-grid">
            <el-form-item label="配置备注"><el-input :model-value="props.config.name" placeholder="选填；未填写时展示配置编号" @update:model-value="updateConfig('name', $event)" /></el-form-item>
            <el-form-item label="发布生效方式">
              <el-radio-group :model-value="props.config.publishEffectMode" @update:model-value="updateConfig('publishEffectMode', $event)"><el-radio-button value="IMMEDIATE">立即生效</el-radio-button><el-radio-button value="SCHEDULED">指定日期生效</el-radio-button></el-radio-group>
            </el-form-item>
            <el-form-item label="指定生效日期" :required="props.config.publishEffectMode === 'SCHEDULED'"><el-date-picker :model-value="props.config.publishEffectDate" value-format="YYYY-MM-DD" type="date" :disabled="props.config.publishEffectMode !== 'SCHEDULED'" :disabled-date="date => !dayjs(date).isAfter('2026-08-27', 'day')" @update:model-value="updateConfig('publishEffectDate', $event)" /></el-form-item>
            <el-form-item label="变更原因"><el-input :model-value="props.config.changeReason" @update:model-value="updateConfig('changeReason', $event)" /></el-form-item>
          </el-form>
          <div class="config-version-meta">{{ props.config.no === '新配置' ? '编辑过程不保存草稿。下一步指定适用客户，可按店铺和客户组筛选；跳过该步骤将创建未引用配置，后续可在配置清单分配客户。' : '编辑过程不保存草稿。新版生效时，全部引用此配置的客户统一采用新版；已创建任务和已有账单继续使用其锁定的历史版本。' }}</div>
        </section>
        <ReceivableConfigEditor v-if="props.config.type === 'AR'" :key="props.config.id" ref="editorRef" :config="props.config" />
        <RefundConfigEditor v-else :key="props.config.id" ref="editorRef" :config="props.config" />
      </template>
    </template>

    <template #footer>
      <div class="config-drawer-footer">
        <el-button @click="emit('update:modelValue', false)">{{ props.detailMode === 'view' ? '关闭' : '取消' }}</el-button>
        <el-button v-if="props.detailMode !== 'view'" type="primary" @click="emit('save')">{{ props.config?.no === '新配置' ? '下一步：指定适用客户' : props.config?.publishEffectMode === 'SCHEDULED' ? '发布并预约生效' : '发布并立即生效' }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.scope-info-bar{min-height:48px;margin-bottom:var(--space-3);padding:0 var(--space-4);display:flex;align-items:center;gap:48px;border:1px solid #dfe4ec;background:#f7f9fb;color:#687386}.scope-info-bar div{display:flex;gap:4px}.scope-info-bar strong{color:#29364c}.editing-impact{margin-bottom:var(--space-3)}.editing-impact :deep(.el-alert__title){line-height:1.5}.exact-version-view,.config-version-panel{margin-bottom:var(--space-3);padding:var(--space-3) var(--space-4);border:1px solid #dfe4ec;background:#fff}.config-version-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.config-version-grid :deep(.el-form-item){margin-bottom:0}.config-version-grid :deep(.el-select),.config-version-grid :deep(.el-date-editor){width:100%}.config-version-meta{margin-top:var(--space-2);color:#7b8798;font-size:var(--font-size-sm)}.config-drawer-footer{display:flex;justify-content:flex-end;gap:8px;padding-right:var(--space-2)}
@media(max-width:760px){.scope-info-bar{align-items:flex-start;flex-direction:column;gap:6px;padding:var(--space-2) var(--space-3)}.config-version-grid{grid-template-columns:1fr}}
</style>
