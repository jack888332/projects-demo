<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import StackedCell from '../../shared/components/StackedCell.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import { buildConfigGenerationScopes } from '../../domain/configGeneration.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  config: { type: Object, default: null },
  references: { type: Array, default: () => [] },
  tasks: { type: Array, default: () => [] },
  focusCustomerCode: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'confirm'])

const tableRef = ref(null)
const selectedRows = ref([])
const form = reactive({ cutoff: '2026-08-27 16:45:00', reason: '', schemes: [], periods: [], scheme: '', period: '' })
const referenceAt = '2026-08-27 16:45:00'
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const preview = computed(() => buildConfigGenerationScopes({ config:props.config, references:props.references, tasks:props.tasks, cutoff:form.cutoff, referenceAt, customerCode:props.focusCustomerCode }))
const singleCustomer = computed(() => Boolean(props.focusCustomerCode))
const singleCustomerName = computed(() => preview.value.rows[0]?.customerName || props.references.find(reference => reference.customerCode === props.focusCustomerCode)?.customerName || '')
const schemeOptions = computed(() => {
  const seen = new Set()
  const options = []
  preview.value.rows.forEach((row) => {
    if (seen.has(row.schemeKey)) return
    seen.add(row.schemeKey)
    options.push({ value: row.schemeKey, label: row.schemeName, secondary: row.schemeKey })
  })
  return options
})
const periodOptions = computed(() => {
  const seen = new Set()
  const options = []
  preview.value.rows.forEach((row) => {
    if (row.periodStart === '-' || row.periodEnd === '-') return
    const value = `${row.periodStart}/${row.periodEnd}`
    if (seen.has(value)) return
    seen.add(value)
    options.push({ value, label: `${row.periodStart} 至 ${row.periodEnd}` })
  })
  return options
})
const visibleRows = computed(() => {
  if (singleCustomer.value) {
    return preview.value.rows.filter(row =>
      (!form.scheme || row.schemeKey === form.scheme)
      && (!form.period || `${row.periodStart}/${row.periodEnd}` === form.period))
  }
  const schemes = form.schemes.length ? new Set(form.schemes) : null
  const periods = form.periods.length ? new Set(form.periods) : null
  return preview.value.rows.filter(row => (!schemes || schemes.has(row.schemeKey)) && (!periods || periods.has(`${row.periodStart}/${row.periodEnd}`)))
})
const blockedCount = computed(() => visibleRows.value.filter(row => row.blocked).length)
const selectedCustomerCount = computed(() => new Set(selectedRows.value.map(row => row.customerCode)).size)
const schemeCount = computed(() => new Set(visibleRows.value.map(row => row.schemeKey)).size)
const unselectedCount = computed(() => visibleRows.value.filter(row => !row.blocked).length - selectedRows.value.length)
const skippedCount = computed(() => blockedCount.value + unselectedCount.value)
const previewSignature = computed(() => preview.value.rows.map(row => `${row.id}:${row.blocked}`).join('|'))

async function selectEligibleRows() {
  selectedRows.value = []
  await nextTick()
  tableRef.value?.clearSelection()
  visibleRows.value.filter(row => !row.blocked).forEach(row => tableRef.value?.toggleRowSelection(row, true))
}

watch(() => props.modelValue, async (open) => {
  if (!open) return
  form.cutoff = '2026-08-27 16:45:00'
  form.reason = ''
  form.schemes = []
  form.periods = []
  const preferred = preview.value.rows.find(row => row.periodStart !== '-')
  form.scheme = preferred?.schemeKey || schemeOptions.value[0]?.value || ''
  form.period = preferred ? `${preferred.periodStart}/${preferred.periodEnd}` : (periodOptions.value[0]?.value || '')
  await selectEligibleRows()
})
watch(previewSignature, () => { if (props.modelValue) selectEligibleRows() })
watch(() => [form.schemes, form.periods], () => { if (props.modelValue) selectEligibleRows() }, { deep: true })

function confirm() {
  if (singleCustomer.value) {
    if (!form.scheme) return ElMessage.warning('请选择方案')
    if (!form.period) return ElMessage.warning('请选择账期')
    const scopes = visibleRows.value.filter(row => !row.blocked)
    emit('confirm', {
      mode: 'SINGLE',
      customerCode: props.focusCustomerCode,
      customerName: singleCustomerName.value,
      scopes,
      skippedCount: blockedCount.value,
      frozenCustomerCount: new Set(scopes.map(row => row.customerCode)).size,
      candidateCustomerCount: preview.value.referenceCustomerCount,
      blockedCount: blockedCount.value,
      unselectedCount: 0,
      cutoff: form.cutoff,
      reason: form.reason.trim(),
    })
    visible.value = false
    return
  }
  if (!form.cutoff) return ElMessage.warning('请选择数据截止点')
  emit('confirm', { mode: 'BATCH', scopes:selectedRows.value, skippedCount:blockedCount.value, frozenCustomerCount:selectedCustomerCount.value, candidateCustomerCount:preview.value.referenceCustomerCount, blockedCount:blockedCount.value, unselectedCount:unselectedCount.value, cutoff:form.cutoff, reason:form.reason.trim() })
  visible.value = false
}
</script>

<template>
  <el-dialog v-model="visible" class="module-dialog module-dialog-large config-generation-dialog" align-center append-to-body destroy-on-close :close-on-click-modal="false">
    <template #header><div class="drawer-title"><span>{{ singleCustomer ? '生成账单' : '批量生成账单' }}</span><small v-if="singleCustomer">{{ singleCustomerName }}（{{ focusCustomerCode }}） · {{ config?.no }}-{{ config?.version }}</small><small v-else>{{ config?.name ? `${config.name} · ` : '' }}{{ config?.no }}-{{ config?.version }}</small></div></template>
    <template v-if="!singleCustomer">
      <div class="generation-summary">
        <div><span>当前配置引用客户</span><strong>{{ preview.referenceCustomerCount }}</strong></div>
        <div><span>涉及方案</span><strong>{{ schemeCount }}</strong></div>
        <div><span>已选客户 / 任务</span><strong>{{ selectedCustomerCount }} / {{ selectedRows.length }}</strong></div>
        <div><span>未创建范围</span><strong :class="{ warning:skippedCount }">{{ skippedCount }}</strong></div>
      </div>
      <el-alert title="本次按配置当前生效版本展开引用客户，并在任务创建时冻结配置编号和准确版本；任务按客户、账单类型、方案编号和实际账期独立创建。" type="info" :closable="false" show-icon />
    </template>
    <el-form label-position="top" class="generation-form">
      <el-form-item label="方案">
        <el-select v-if="singleCustomer" v-model="form.scheme" clearable placeholder="请选择方案"><el-option v-for="item in schemeOptions" :key="item.value" :label="item.label" :value="item.value"><span>{{ item.label }}</span><small class="option-meta">{{ item.secondary }}</small></el-option></el-select>
        <el-select v-else v-model="form.schemes" multiple collapse-tags collapse-tags-tooltip clearable placeholder="全部方案"><el-option v-for="item in schemeOptions" :key="item.value" :label="item.label" :value="item.value"><span>{{ item.label }}</span><small class="option-meta">{{ item.secondary }}</small></el-option></el-select>
      </el-form-item>
      <el-form-item label="账期">
        <el-select v-if="singleCustomer" v-model="form.period" clearable placeholder="请选择账期"><el-option v-for="item in periodOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        <el-select v-else v-model="form.periods" multiple collapse-tags collapse-tags-tooltip clearable placeholder="全部账期"><el-option v-for="item in periodOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        <small v-if="singleCustomer && !periodOptions.length" class="form-hint">当前配置版本尚无已结束账期，暂无可生成任务</small>
      </el-form-item>
      <template v-if="!singleCustomer">
        <el-form-item label="数据截止点" required><el-date-picker v-model="form.cutoff" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" format="YYYY-MM-DD HH:mm:ss" :editable="false" /></el-form-item>
        <el-form-item label="发起原因"><el-input v-model="form.reason" maxlength="100" show-word-limit placeholder="选填，将写入批次审计" /></el-form-item>
      </template>
    </el-form>
    <DataTableFrame v-if="!singleCustomer" class="generation-table" :total="visibleRows.length" :selected-count="selectedRows.length" selection-summary :page-size="10" :column-sort="false">
      <el-table ref="tableRef" :data="visibleRows" border row-key="id" @selection-change="selectedRows = $event">
        <el-table-column type="selection" width="44" :selectable="row => !row.blocked" />
        <el-table-column label="客户" min-width="180"><template #default="scope"><StackedCell :primary="scope.row.customerName" :secondary="scope.row.customerCode" /></template></el-table-column>
        <el-table-column prop="memberCode" label="会员编码快照" min-width="145" show-overflow-tooltip />
        <el-table-column prop="store" label="所属店铺快照" min-width="155" show-overflow-tooltip />
        <el-table-column prop="group" label="所属客户组快照" min-width="155" show-overflow-tooltip />
        <el-table-column label="方案名称 / 编号" min-width="220"><template #default="scope"><StackedCell :primary="scope.row.schemeName" :secondary="scope.row.schemeKey" /></template></el-table-column>
        <el-table-column label="实际账期" width="190"><template #default="scope">{{ scope.row.periodStart === '-' ? '--' : `${scope.row.periodStart} 至 ${scope.row.periodEnd}` }}</template></el-table-column>
        <el-table-column label="创建校验" min-width="190"><template #default="scope"><div class="validation-cell"><StatusTag :label="scope.row.blocked ? '跳过' : '可创建'" :tone="scope.row.blocked ? 'warning' : 'success'" /><small v-if="scope.row.reason">{{ scope.row.reason }}</small></div></template></el-table-column>
      </el-table>
    </DataTableFrame>
    <template #footer><div class="config-drawer-footer"><el-button @click="visible = false">取消</el-button><el-button type="primary" @click="confirm">确认</el-button></div></template>
  </el-dialog>
</template>

<style scoped>
.generation-summary{margin-bottom:var(--space-3);display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));border:1px solid var(--border);background:#f8fafb}.generation-summary>div{min-height:64px;padding:var(--space-3);display:flex;flex-direction:column;gap:6px;border-right:1px solid var(--border)}.generation-summary>div:last-child{border-right:0}.generation-summary span{color:#7d8797;font-size:var(--font-size-sm)}.generation-summary strong{color:#2e3b51}.generation-summary strong.warning{color:var(--warning)}.generation-form{margin-top:var(--space-3);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.generation-form :deep(.el-form-item){margin-bottom:0}.generation-form :deep(.el-select),.generation-form :deep(.el-date-editor){width:100%}.option-meta{margin-left:var(--space-3);color:#7b8798;font-size:var(--font-size-sm)}.form-hint{color:#c2590e;font-size:var(--font-size-sm);line-height:1.5}.generation-table{margin-top:var(--space-3)}.validation-cell{display:flex;align-items:center;gap:8px}.validation-cell small{min-width:0;color:#7d8797}.config-drawer-footer{display:flex;justify-content:flex-end;gap:8px}.config-generation-dialog :deep(.el-alert){border-radius:2px}@media(max-width:760px){.generation-summary{grid-template-columns:1fr 1fr}.generation-form{grid-template-columns:1fr}.validation-cell{align-items:flex-start;flex-direction:column}}
</style>
