<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import FilterBar from '../components/FilterBar.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'

const { state } = usePrototypeData()
const router = useRouter()
const keyword = ref('')
const status = ref('')
const rows = computed(() => state.airOrders.flatMap(order => [
  { entity: order, childId: '' }, ...(state.airChildren || []).filter(child => child.parentId === order.id && !child.deleted && child.orderStatus !== '已取消').map(entity => ({ entity, childId: entity.id })),
]).filter(({ entity }) => entity.waybillTransmission).map(({ entity, childId }) => {
  const order = childId ? state.airOrders.find(row => row.id === entity.parentId) : entity
  const transmission = entity.waybillTransmission
  return { id: entity.id, orderId: order.id, childId, businessNo: childId ? entity.housebillNo : order.waybillNo,
    system: '翌飞 / CCSP（本地模拟）', action: childId ? '分运单发送' : '主运单发送', status: transmission.status,
    lastAt: transmission.sentAt, code: transmission.descriptionCode || '无',
    result: transmission.error || (transmission.status === '成功' ? '本地模拟接收成功' : '等待本地模拟回执') }
}).filter(item => (!keyword.value || `${item.businessNo}${item.system}${item.action}`.toLowerCase().includes(keyword.value.toLowerCase())) && (!status.value || item.status === status.value)))
function resetFilters() { keyword.value = ''; status.value = '' }
</script>

<template><div class="module-view">
  <PageHeader title="航司与外部系统对接" description="提单主分运单的本地模拟发送结果"><template #actions><el-button type="primary" @click="router.push('/fulfillment/airway-bills')">进入提单发送</el-button></template></PageHeader>
  <el-alert title="此处展示本地模拟回执，未连接翌飞或 CCSP。WMS 与其他消息渠道暂未覆盖。" type="info" :closable="false" />
  <FilterBar v-model="keyword" placeholder="业务单号、外部系统或动作" @reset="resetFilters"><el-select v-model="status" clearable placeholder="推送状态" class="filter-select"><el-option v-for="item in ['发送中', '成功', '异常中']" :key="item" :value="item" /></el-select></FilterBar>
  <DataTableFrame :rows="rows" :page-size="10"><template #default="{ rows: pageRows }"><el-table :data="pageRows" row-key="id" stripe>
    <el-table-column prop="businessNo" label="业务单号" width="185" fixed="left" /><el-table-column prop="system" label="外部系统" width="135" /><el-table-column prop="action" label="协同动作" min-width="150" />
    <el-table-column label="状态" width="90"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column><el-table-column prop="code" label="DescriptionCode" width="155" />
    <el-table-column prop="lastAt" label="最近处理时间" width="150" /><el-table-column prop="result" label="处理结果" min-width="190" />
    <el-table-column label="操作" width="92" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="router.push({ path: `/fulfillment/airway-bills/${row.orderId}`, query: row.childId ? { child: row.childId } : {} })">查看提单</el-button></template></el-table-column>
  </el-table></template></DataTableFrame>
</div></template>
