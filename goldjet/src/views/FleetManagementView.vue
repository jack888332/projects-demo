<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FleetView from './FleetView.vue'
import FleetVehiclesView from './FleetVehiclesView.vue'
import FleetRecordsView from './FleetRecordsView.vue'
import { canViewFleetRecords } from '../domain/fleetRecords.js'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canMaintainFleet } from '../domain/fleetVehicles.js'
const route = useRoute(), router = useRouter()
const { groundSession } = usePrototypeData()
const tabs = [{ key: 'drivers', label: '司机管理' }, { key: 'vehicles', label: '车辆管理' }, { key: 'incidents', label: '违章事故' }, { key: 'repairs', label: '维修记录' }, { key: 'fuel', label: '油耗记录' }]
const active = computed(() => tabs.some(tab => tab.key === route.query.tab) ? route.query.tab : 'drivers')
function changeTab(tab) { router.push({ path: '/fulfillment/fleet', query: { tab: tab.paneName } }) }
</script>
<template>
  <div class="fleet-management">
    <template v-if="groundSession.readAll || canMaintainFleet(groundSession.role)">
      <el-tabs :model-value="active" aria-label="车队管理模块" @tab-click="changeTab"><el-tab-pane v-for="tab in tabs.filter(tab => groundSession.readAll || ['drivers', 'vehicles'].includes(tab.key) || canViewFleetRecords(groundSession.role, tab.key))" :key="tab.key" :name="tab.key" :label="tab.label" /></el-tabs>
      <FleetView v-if="active === 'drivers'" /><FleetVehiclesView v-else-if="active === 'vehicles'" /><FleetRecordsView v-else :key="active" :kind="active" />
    </template>
    <el-empty v-else description="当前角色无车队档案访问权限" />
  </div>
</template>
<style scoped>.fleet-management { min-width:0; } .fleet-management > :deep(.el-tabs) { margin-bottom:12px; }</style>
