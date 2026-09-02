<script setup>
import { ref } from 'vue'
import { Plus, Refresh } from '@element-plus/icons-vue'
import ConditionFilter from '../components/ConditionFilter.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import DownloadButton from '../components/DownloadButton.vue'
import MetricGrid from '../components/MetricGrid.vue'
import StatusTag from '../components/StatusTag.vue'

const filters = ref({ keyword: '', status: '', period: [] })
const selectedRows = ref([])
const rows = [
  { id: 'DEMO-001', name: '标准列表记录', status: '待审核', updatedAt: '2026-08-09 10:00' },
  { id: 'DEMO-002', name: '已完成记录', status: '已结清', updatedAt: '2026-08-09 09:30' },
]
const metrics = [
  { label: '记录总数', value: 2, tone: 'blue' },
  { label: '待处理', value: 1, tone: 'amber' },
  { label: '已完成', value: 1, tone: 'green' },
]
</script>

<template>
  <div class="module-page ui-gallery-page">
    <section class="gallery-section">
      <h2>条件筛选与按钮</h2>
      <div class="condition-filter-bar">
        <ConditionFilter v-model="filters.keyword" label="关键词" type="text" />
        <ConditionFilter v-model="filters.status" label="状态" :options="['待审核', '已结清']" />
        <ConditionFilter v-model="filters.period" label="日期范围" type="date-range" />
        <div class="condition-filter-actions"><el-button type="primary">查询</el-button><el-button>重置</el-button></div>
      </div>
      <div class="gallery-actions"><el-button :icon="Plus">新增</el-button><DownloadButton /><el-button :icon="Refresh">刷新</el-button></div>
    </section>

    <section class="gallery-section">
      <h2>统计卡片</h2>
      <MetricGrid :items="metrics" :columns="3" />
    </section>

    <section class="gallery-section">
      <h2>标准数据表</h2>
      <DataTableFrame :total="rows.length" :selected-count="selectedRows.length" selection-summary :page-size="10">
        <template #actions><el-button>批量操作</el-button></template>
        <el-table :data="rows" border class="clean-table" @selection-change="selectedRows = $event">
          <el-table-column type="selection" width="44" />
          <el-table-column prop="id" label="编号" width="150" />
          <el-table-column prop="name" label="名称" min-width="220" />
          <el-table-column label="状态" width="110"><template #default="scope"><StatusTag :label="scope.row.status" /></template></el-table-column>
          <el-table-column prop="updatedAt" label="更新时间" width="180" />
        </el-table>
      </DataTableFrame>
    </section>
  </div>
</template>

<style scoped>
.ui-gallery-page { display: grid; gap: var(--space-5); }
.gallery-section { display: grid; gap: var(--space-3); }
.gallery-section h2 { margin: 0; font-size: 16px; }
.gallery-actions { display: flex; gap: var(--space-2); }
</style>
