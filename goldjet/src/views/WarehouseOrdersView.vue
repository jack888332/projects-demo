<script setup>
import { computed, ref } from 'vue'
import { CircleCheck, Goods } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import FilterBar from '../components/FilterBar.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { WAREHOUSE_ACTIONS, WAREHOUSE_FLOW } from '../domain/workflows.js'

const { state, advanceWarehouseOrder } = usePrototypeData()
const keyword = ref('')
const status = ref('')
const rows = computed(() => state.warehouseOrders.filter((item) => {
  const match = !keyword.value || `${item.serviceNo}${item.customer}${item.warehouse}`.toLowerCase().includes(keyword.value.toLowerCase())
  return match && (!status.value || item.status === status.value)
}))
function advance(row) { const result = advanceWarehouseOrder(row.id); if (result) ElMessage.success(`${row.serviceNo} 已进入${result.status}`) }
function resetFilters() { keyword.value = ''; status.value = '' }
</script>

<template>
  <div class="module-view">
    <PageHeader title="仓库订单" description="备货与集货订单的收货、理货、客户确认和上架进度" />
    <div class="status-flow" aria-label="仓储状态流">
      <template v-for="(item, index) in WAREHOUSE_FLOW" :key="item">
        <span>{{ item }}</span><i v-if="index < WAREHOUSE_FLOW.length - 1">›</i>
      </template>
    </div>
    <FilterBar v-model="keyword" placeholder="服务单号、客户或仓库" @reset="resetFilters">
      <el-select v-model="status" clearable placeholder="作业状态" class="filter-select"><el-option v-for="value in WAREHOUSE_FLOW" :key="value" :value="value" /></el-select>
    </FilterBar>
    <DataTableFrame :rows="rows" :page-size="10">
      <template #actions><el-button :icon="Goods" @click="ElMessage.info('理货模板已生成')">导出理货模板</el-button></template>
      <template #default="{ rows: pageRows }">
        <el-table :data="pageRows" row-key="id" stripe>
          <el-table-column prop="serviceNo" label="仓储服务单" width="188" fixed="left" />
          <el-table-column prop="customer" label="客户" min-width="145" />
          <el-table-column prop="warehouse" label="仓库" min-width="130" />
          <el-table-column prop="inboundType" label="入库类型" width="105" />
          <el-table-column prop="forecastQty" label="预报数量" width="90" align="right" />
          <el-table-column prop="actualQty" label="实收数量" width="90" align="right" />
          <el-table-column label="理货结果" width="170"><template #default="{ row }"><span class="tally-result">良 {{ row.goodQty }} · 残 {{ row.damagedQty }} · 异 {{ row.abnormalQty }}</span></template></el-table-column>
          <el-table-column label="状态" width="100"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
          <el-table-column prop="updatedAt" label="更新时间" width="145" />
          <el-table-column label="当前操作" width="132" fixed="right"><template #default="{ row }"><el-button v-if="WAREHOUSE_ACTIONS[row.status]" link type="primary" :icon="CircleCheck" @click="advance(row)">{{ WAREHOUSE_ACTIONS[row.status] }}</el-button><span v-else>作业完成</span></template></el-table-column>
        </el-table>
      </template>
    </DataTableFrame>
  </div>
</template>
