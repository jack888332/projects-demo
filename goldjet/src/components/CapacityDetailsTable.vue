<script setup>
import { computed, ref, watch } from 'vue'
const props = defineProps({ rows: { type: Array, default: () => [] }, master: { type: Object, required: true } })
const page = ref(1)
const visible = computed(() => props.rows.slice((page.value - 1) * 20, page.value * 20))
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
const pallet = id => props.master.pallets.find(row => row.id === id)
const value = item => item === '' || item == null ? '未填写' : item
watch(() => props.rows, () => { page.value = 1 })
</script>
<template>
  <div class="capacity-details">
    <el-table :data="visible" aria-label="周期日板型明细">
      <el-table-column label="周期日" min-width="90"><template #default="{row}">{{ weekdays[Number(row.weekday)] }}</template></el-table-column>
      <el-table-column label="板型" min-width="150"><template #default="{row}">{{ pallet(row.palletId)?.code || '主数据不可用' }}</template></el-table-column>
      <el-table-column label="板体积 (m³)" min-width="130" align="right"><template #default="{row}">{{ pallet(row.palletId)?.volume ?? '来源未返回' }}</template></el-table-column>
      <el-table-column label="基准载重 (kg)" min-width="140" align="right"><template #default="{row}">{{ value(row.baseline) }}</template></el-table-column>
      <el-table-column label="数量" min-width="100" align="right"><template #default="{row}">{{ value(row.quantity) }}</template></el-table-column>
    </el-table>
    <el-pagination v-model:current-page="page" layout="prev, pager, next" :total="rows.length" :page-size="20" />
  </div>
</template>
<style scoped>
.capacity-details { min-width: 0; padding: 12px 20px; }
.el-pagination { margin-top: 12px; }
</style>
