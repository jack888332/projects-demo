<script setup>
import { computed, ref, watch } from 'vue'
import { Download, Search, Refresh, View } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import DataTableFrame from './DataTableFrame.vue'
import { displayValue, fieldValue, filterRecords } from '../domain/recordQuery.js'
import { downloadRecords } from '../utils/recordDownloads.js'
const props = defineProps({ rows: { type: Array, required: true }, columns: { type: Array, required: true }, filters: { type: Array, default: () => [] }, defaults: { type: Object, default: () => ({}) }, name: { type: String, required: true }, pageSize: {type:Number,default:50}, detail: Boolean, exportable: { type: Boolean, default: true }, selectionOnly: Boolean, selectable: Boolean })
const emit = defineEmits(['detail', 'selection', 'query'])
const pending = ref({ ...props.defaults }), applied = ref({ ...props.defaults }), selection = ref([]), revision = ref(0)
const rows = computed(() => filterRecords(props.rows, applied.value, props.filters))
function query(reset = false) {
  if (reset) pending.value = { ...props.defaults }
  for (const [key,,type] of props.filters) if (['min', 'max'].includes(type) && pending.value[key] && !Number.isFinite(Number(pending.value[key]))) return ElMessage.error('请输入有效金额范围')
  applied.value = JSON.parse(JSON.stringify(pending.value)); selection.value = []; revision.value++; emit('query', rows.value); emit('selection', [])
}
function exportRows(selected) {
  const records = selected ? selection.value : rows.value
  if (!records.length) return ElMessage.warning('没有可导出的记录')
  downloadRecords(`${props.name}.csv`, records, props.columns)
}
watch(() => props.rows, () => { selection.value = []; emit('selection', []) })
defineExpose({ rows })
</script>

<template>
  <section class="record-query-table">
    <el-form v-if="filters.length" label-position="top" class="record-filters" @submit.prevent="query()">
      <el-form-item v-for="[key,label,type='text',options] in filters" :key="key" :label="label" :class="{wide:type==='range'}">
        <el-select v-if="type==='select'" v-model="pending[key]" clearable filterable :aria-label="`查询${label}`"><el-option v-for="option in options" :key="option" :label="option" :value="option"/></el-select>
        <el-date-picker v-else-if="type==='range'" v-model="pending[key]" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" :aria-label="`查询${label}`"/>
        <el-input v-else v-model="pending[key]" clearable :aria-label="`查询${label}`" @keyup.enter="query()"/>
      </el-form-item>
      <div class="filter-commands"><el-button :icon="Search" type="primary" @click="query()">查询</el-button><el-button :icon="Refresh" @click="query(true)">重置</el-button></div>
    </el-form>
    <DataTableFrame :key="revision" :rows="rows" :page-size="pageSize" :page-sizes="[pageSize]" :selectable="selectable||selectionOnly" :selected-count="selection.length">
      <template #actions><slot name="actions" :rows="rows" :selection="selection"/><el-button v-if="exportable" :icon="Download" :disabled="selectionOnly?!selection.length:!rows.length" @click="exportRows(selectionOnly)">{{selectionOnly?'导出勾选':'导出查询结果'}}</el-button></template>
      <template #default="{rows:pageRows}"><el-table :data="pageRows" row-key="id" :aria-label="name" @selection-change="selection=$event;emit('selection',$event)">
        <el-table-column v-if="selectable||selectionOnly" type="selection" width="48"/>
        <el-table-column v-for="[key,label,width=160] in columns" :key="key" :label="label" :min-width="width"><template #default="{row}"><slot name="cell" :row="row" :field="key">{{displayValue(fieldValue(row,key))}}</slot></template></el-table-column>
        <el-table-column v-if="detail" label="操作" width="90" fixed="right"><template #default="{row}"><el-button link type="primary" :icon="View" @click="emit('detail',row)">查看</el-button></template></el-table-column>
      </el-table></template>
    </DataTableFrame>
  </section>
</template>

<style scoped>
.record-query-table{min-width:0}.record-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:0 16px;margin:16px 0}.record-filters .wide{grid-column:span 2}.record-filters :deep(.el-date-editor){width:100%;max-width:100%;min-width:0}.filter-commands{display:flex;align-items:end;padding-bottom:18px;gap:8px}.filter-commands .el-button{margin:0}.record-query-table :deep(.table-scroll>.el-table){min-width:0}@media(max-width:540px){.record-filters .wide{grid-column:auto}.record-filters{grid-template-columns:1fr}}
</style>
