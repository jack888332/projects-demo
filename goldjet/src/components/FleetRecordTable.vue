<script setup>
import DataTableFrame from './DataTableFrame.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { FLEET_RECORD_COLUMNS, fleetRecordCell, repairAmounts } from '../domain/fleetRecords.js'
defineProps({ kind: { type: String, required: true }, rows: { type: Array, default: () => [] }, pageSize: { type: Number, default: 10 }, actions: Boolean })
const { state } = usePrototypeData()
</script>
<template>
  <DataTableFrame :rows="rows" :page-size="pageSize" :page-sizes="pageSize === 5 ? [5] : [10, 20, 50]"><template #default="{ rows: pageRows }"><el-table :data="pageRows" row-key="id" :aria-label="kind+'台账列表'">
    <el-table-column v-for="[key, label, width] in FLEET_RECORD_COLUMNS[kind]" :key="key" :label="label" :min-width="width" :fixed="key === 'plate' ? 'left' : false">
      <template #default="{ row }"><template v-if="key === 'items'"><p v-for="(item, index) in row.items" :key="index" class="repair-line">{{ item.subject }}：{{ item.quantity }} {{ item.unit }} × {{ item.price }} = {{ repairAmounts(row.items).amounts[index] ?? '舍入口径待确认' }}</p></template><template v-else>{{ fleetRecordCell(kind, row, key, state) }}</template></template>
    </el-table-column>
    <el-table-column prop="updatedBy" label="更新人" width="110" /><el-table-column prop="updatedAt" label="更新日期" width="180" />
    <el-table-column v-if="actions" label="操作" width="175" fixed="right"><template #default="{ row }"><slot name="actions" :row="row" /></template></el-table-column>
  </el-table></template></DataTableFrame>
</template>
<style scoped>.repair-line { margin:4px 0; white-space:normal; overflow-wrap:anywhere; }</style>
