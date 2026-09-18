<script setup>
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { potentialGroundOrders } from '../domain/groundOrders.js'
import DataTableFrame from './DataTableFrame.vue'
const props = defineProps({ order: Object, dispatch: Boolean })
defineEmits(['open'])
const { state } = usePrototypeData()
const rows = computed(() => potentialGroundOrders(props.order, state.groundOrders, { dispatch: props.dispatch }))
async function copyPlate(plate) {
  try { await navigator.clipboard.writeText(plate); ElMessage.success('已复制车牌号') } catch { ElMessage.error('复制失败，请手动复制车牌号') }
}
</script>
<template>
  <DataTableFrame :rows="rows" :page-size="dispatch ? 10 : 50" :page-sizes="dispatch ? [10,20,50] : [50,100]">
    <template #default="{rows:pageRows}"><el-table :data="pageRows" aria-label="潜在关联订单">
      <el-table-column prop="orderNo" label="订单号" min-width="180" /><el-table-column prop="customer" label="委托方" min-width="140" /><el-table-column prop="dispatchStatus" label="订单状态" width="110" /><el-table-column prop="pickupTime" label="提货时间" min-width="150" /><el-table-column prop="pickup" label="提货点" min-width="200" />
      <el-table-column label="车牌号" min-width="130"><template #default="{row}"><div v-for="bill in state.groundWaybills.filter(b => b.orderId === row.id && b.status !== '已取消')" :key="bill.id"><el-button v-if="dispatch" link type="primary" @click="copyPlate(bill.plate)">{{ bill.plate }}</el-button><span v-else>{{ bill.plate }}</span></div></template></el-table-column>
      <el-table-column label="操作" width="100"><template #default="{row}"><el-button link type="primary" @click="$emit('open',row)">查看详情</el-button></template></el-table-column>
    </el-table></template>
  </DataTableFrame>
</template>
