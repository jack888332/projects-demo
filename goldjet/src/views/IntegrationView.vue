<script setup>
import { computed, ref } from 'vue'
import { RefreshRight, Warning } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import FilterBar from '../components/FilterBar.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'

const { state, retryIntegration } = usePrototypeData()
const keyword = ref('')
const status = ref('')
const rows = computed(() => state.integrations.filter((item) => (!keyword.value || `${item.businessNo}${item.system}${item.action}`.toLowerCase().includes(keyword.value.toLowerCase())) && (!status.value || item.status === status.value)))
function retry(row) { const result = retryIntegration(row.id); if (result) ElMessage.success(`${row.businessNo} 已重试成功`) }
function resetFilters() { keyword.value = ''; status.value = '' }
</script>

<template><div class="module-view">
  <PageHeader title="航司与外部系统对接" description="航司、WMS 与消息渠道的业务协同结果" />
  <div class="risk-banner"><el-icon><Warning /></el-icon><span><strong>外部连接风险</strong> WMS 连接超时来源于一期讨论纪要，仅作为协同风险展示；浏览器原型不代表真实系统已完成重试。</span></div>
  <FilterBar v-model="keyword" placeholder="业务单号、外部系统或动作" @reset="resetFilters"><el-select v-model="status" clearable placeholder="推送状态" class="filter-select"><el-option label="成功" value="成功" /><el-option label="失败" value="失败" /></el-select></FilterBar>
  <DataTableFrame :rows="rows" :page-size="10"><template #default="{ rows: pageRows }"><el-table :data="pageRows" row-key="id" stripe>
    <el-table-column prop="businessNo" label="业务单号" width="185" fixed="left" /><el-table-column prop="system" label="外部系统" width="135" /><el-table-column prop="action" label="协同动作" min-width="150" />
    <el-table-column label="状态" width="90"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column><el-table-column prop="attempts" label="尝试次数" width="88" align="right" />
    <el-table-column prop="lastAt" label="最近处理时间" width="150" /><el-table-column prop="result" label="处理结果" min-width="190" />
    <el-table-column label="操作" width="92" fixed="right"><template #default="{ row }"><el-button link type="primary" :icon="RefreshRight" :disabled="row.status !== '失败'" @click="retry(row)">重试</el-button></template></el-table-column>
  </el-table></template></DataTableFrame>
</div></template>
