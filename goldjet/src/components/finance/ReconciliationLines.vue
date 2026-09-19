<script setup>
import { computed } from 'vue'
import { STATEMENT_LINE_COLUMNS, STATEMENT_DETAIL_COLUMNS } from '../../domain/reconciliation.js'
import { money } from '../../domain/orderCosts.js'
const props = defineProps({ rows: Array, selectable: Boolean, details: Boolean, sourceLink: Boolean })
defineEmits(['selection', 'source', 'statement'])
const columns = computed(() => props.details ? STATEMENT_DETAIL_COLUMNS : STATEMENT_LINE_COLUMNS)
function display(row, key) {
  if (['createdAt','statementDate','businessDate'].includes(key)) return row[key]?.slice(0,10) || '未记录'
  if (['unitPrice','originalAmount'].includes(key)) return money(row[key])
  return row[key] ?? '未记录'
}
</script>
<template>
  <el-table :data="rows" row-key="id" aria-label="对账明细" @selection-change="$emit('selection',$event)">
    <el-table-column v-if="selectable" type="selection" width="48"/>
    <el-table-column v-for="[key,label,width] in columns" :key="key" :label="label" :min-width="width" :align="['quantity','unitPrice','originalAmount','taxRate'].includes(key)?'right':'left'">
      <template #default="{row}"><el-button v-if="key==='statementNo'" link type="primary" @click="$emit('statement',row.statementId)">{{row.statementNo}}</el-button><el-button v-else-if="key==='orderNo'&&sourceLink" link type="primary" @click="$emit('source',row)">{{row.orderNo}}</el-button><template v-else>{{display(row,key)}}</template></template>
    </el-table-column>
  </el-table>
</template>
