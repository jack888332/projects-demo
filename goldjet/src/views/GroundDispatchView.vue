<script setup>
import { computed, ref } from 'vue'
import { Location, Select, Van } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import FilterBar from '../components/FilterBar.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'

const { state, dispatchGroundOrders } = usePrototypeData()
const keyword = ref('')
const status = ref('未调度')
const selectedIds = ref([])
const dispatchVisible = ref(false)
const selectedSupplier = ref('申捷车队')
const suppliers = [
  { name: '申捷车队', score: 4.8, basePrice: 1680, priceByVehicle: { '4.2 米厢式车': 980, '7.6 米厢式车': 1680, '9.6 米厢式车': 2360 } },
  { name: '远通运输', score: 4.6, basePrice: 1750, priceByVehicle: { '4.2 米厢式车': 1020, '7.6 米厢式车': 1750, '9.6 米厢式车': 2280 } },
  { name: '安航车队', score: 4.5, basePrice: 1720, priceByVehicle: { '4.2 米厢式车': 960, '7.6 米厢式车': 1720, '9.6 米厢式车': 2410 } },
]

const rows = computed(() => state.groundOrders.filter((item) => {
  const matchKeyword = !keyword.value || `${item.orderNo}${item.customer}${item.pickup}${item.delivery}`.toLowerCase().includes(keyword.value.toLowerCase())
  return matchKeyword && (!status.value || item.dispatchStatus === status.value)
}))
const selectedOrders = computed(() => state.groundOrders.filter((item) => selectedIds.value.includes(item.id)))
const supplierQuotes = computed(() => suppliers.map((supplier) => ({
  ...supplier,
  total: selectedOrders.value.reduce((sum, order) => sum + (supplier.priceByVehicle[order.vehicleType] || supplier.basePrice), 0),
})).sort((a, b) => a.total - b.total))

function onSelectionChange(items) { selectedIds.value = items.map((item) => item.id) }
function openDispatch(row) { if (row) selectedIds.value = [row.id]; if (!selectedIds.value.length) return ElMessage.warning('请先选择未调度订单'); selectedSupplier.value = supplierQuotes.value[0]?.name || '申捷车队'; dispatchVisible.value = true }
function confirmDispatch() {
  const supplier = suppliers.find((item) => item.name === selectedSupplier.value)
  const affected = dispatchGroundOrders(selectedIds.value, supplier)
  dispatchVisible.value = false
  selectedIds.value = []
  ElMessage.success(`已生成 ${affected.length} 张运输运单`)
}
function resetFilters() { keyword.value = ''; status.value = '未调度' }
</script>

<template>
  <div class="module-view">
    <PageHeader title="用车调度" description="按车型、供应商与提卸货点处理未调度订单">
      <template #actions><el-button type="primary" :icon="Van" :disabled="!selectedIds.length" @click="openDispatch()">批量调度</el-button></template>
    </PageHeader>
    <FilterBar v-model="keyword" placeholder="用车单号、客户或地址" @reset="resetFilters">
      <el-select v-model="status" clearable placeholder="调度状态" class="filter-select"><el-option label="未调度" value="未调度" /><el-option label="已调度" value="已调度" /></el-select>
    </FilterBar>

    <DataTableFrame :rows="rows" :page-size="50" :page-sizes="[20, 50, 100]" selectable :selected-count="selectedIds.length">
      <template #actions><el-button :icon="Select" :disabled="!selectedIds.length" @click="openDispatch()">调度所选</el-button></template>
      <template #default="{ rows: pageRows }">
        <el-table :data="pageRows" row-key="id" stripe @selection-change="onSelectionChange">
          <el-table-column type="selection" width="48" :selectable="(row) => row.dispatchStatus === '未调度'" />
          <el-table-column prop="orderNo" label="用车单号" width="180" fixed="left" />
          <el-table-column prop="customer" label="客户" min-width="145" />
          <el-table-column prop="vehicleType" label="车型" width="125" />
          <el-table-column prop="pickup" label="提货点" min-width="150" />
          <el-table-column prop="delivery" label="卸货点" min-width="145" />
          <el-table-column prop="weight" label="重量 kg" width="92" align="right" />
          <el-table-column prop="requiredAt" label="要求用车时间" width="150" />
          <el-table-column label="调度状态" width="96"><template #default="{ row }"><StatusTag :label="row.dispatchStatus" /></template></el-table-column>
          <el-table-column prop="supplier" label="承运供应商" min-width="120"><template #default="{ row }">{{ row.supplier || '待选择' }}</template></el-table-column>
          <el-table-column prop="waybillNo" label="运单号" width="135"><template #default="{ row }">{{ row.waybillNo || '未生成' }}</template></el-table-column>
          <el-table-column label="操作" width="84" fixed="right"><template #default="{ row }"><el-button link type="primary" :disabled="row.dispatchStatus !== '未调度'" @click="openDispatch(row)">调度</el-button></template></el-table-column>
        </el-table>
      </template>
    </DataTableFrame>

    <el-dialog v-model="dispatchVisible" title="确认调度" width="820" align-center>
      <div class="dialog-summary"><span>订单</span><strong>{{ selectedOrders.length }} 单</strong><span>预计重量</span><strong>{{ selectedOrders.reduce((sum, item) => sum + item.weight, 0).toLocaleString() }} kg</strong></div>
      <h3 class="dialog-section-title">供应商报价</h3>
      <el-radio-group v-model="selectedSupplier" class="supplier-options">
        <el-radio v-for="(supplier, index) in supplierQuotes" :key="supplier.name" :value="supplier.name" border>
          <span><strong>{{ supplier.name }}</strong><small>服务评分 {{ supplier.score }}</small></span>
          <b>¥ {{ supplier.total.toLocaleString() }}</b>
          <em v-if="index === 0">最低成本</em>
        </el-radio>
      </el-radio-group>
      <div class="route-preview"><el-icon><Location /></el-icon><span>{{ selectedOrders.map((item) => `${item.pickup} → ${item.delivery}`).join('；') }}</span></div>
      <template #footer><el-button @click="dispatchVisible = false">取消</el-button><el-button type="primary" @click="confirmDispatch">确认并生成运单</el-button></template>
    </el-dialog>
  </div>
</template>
