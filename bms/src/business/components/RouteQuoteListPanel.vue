<script setup>
import {
  CopyDocument,
  Delete,
  Download,
  EditPen,
  Plus,
  VideoPause,
  VideoPlay,
} from '@element-plus/icons-vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import HoverActionMenu from '../../shared/components/HoverActionMenu.vue'
import StackedCell from '../../shared/components/StackedCell.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import TableActionColumn from '../../shared/components/TableActionColumn.vue'

defineProps({
  rows: { type: Array, default: () => [] },
  selectedCount: { type: Number, default: 0 },
})

defineEmits([
  'batch',
  'copy',
  'create-quote',
  'edit',
  'export',
  'history',
  'remove',
  'selection-change',
  'toggle-status',
])

const formatAmount = (value) => Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })
const carrierValues = (quote) => quote.quoteType === '代收货款手续费报价'
  ? (quote.carriers?.length ? quote.carriers : quote.carrier ? [quote.carrier] : [])
  : (quote.carriers?.length ? quote.carriers : quote.carrier ? [quote.carrier] : [])
const carrierSummary = (quote) => carrierValues(quote).join(' / ') || '--'
const listSummary = (values, fallback) => (values?.length ? values : fallback ? [fallback] : []).join('、') || '--'
const rangeSummary = (quote) => {
  if (!quote.rules.length) return '--'
  return `${formatAmount(quote.rules[0].lower)}-${formatAmount(quote.rules.at(-1).upper)} ${quote.currency}`
}
const feeSummary = (quote) => {
  if (!quote.rules.length) return '--'
  const values = quote.rules.map((rule) => Number(rule.fee))
  return `${formatAmount(Math.min(...values))}-${formatAmount(Math.max(...values))} ${quote.currency}`
}
</script>

<template>
  <section class="module-panel route-quote-list-panel">
    <DataTableFrame
      :total="rows.length"
      :selected-count="selectedCount"
      :auto-content-width="true"
      :auto-width-rows="rows"
      :auto-width-max="240"
      selection-summary
    >
      <template #actions>
        <el-button :icon="Download" @click="$emit('export')">导出</el-button>
        <el-button type="primary" :icon="Plus" @click="$emit('create-quote')">新增报价</el-button>
        <el-button :disabled="!selectedCount" @click="$emit('batch', '批量修改报价')">批量修改报价</el-button>
        <el-button :disabled="!selectedCount" @click="$emit('batch', '批量修改禁运规则')">批量修改禁运规则</el-button>
      </template>
      <el-table
        :data="rows"
        row-key="id"
        class="clean-table route-quote-table"
        border
        @selection-change="$emit('selection-change', $event)"
      >
        <el-table-column type="selection" width="46" fixed />
        <el-table-column type="index" label="序号" width="62" fixed />
        <el-table-column prop="shop" label="所属店铺" min-width="140" />
        <el-table-column label="报价名" min-width="245" show-overflow-tooltip>
          <template #default="scope"><StackedCell :primary="scope.row.name" :secondary="scope.row.quoteType" /></template>
        </el-table-column>
        <el-table-column label="所属仓库" min-width="140" show-overflow-tooltip><template #default="scope">{{ listSummary(scope.row.warehouses, scope.row.warehouse) }}</template></el-table-column>
        <el-table-column label="状态" width="88" align="center"><template #default="scope"><StatusTag :label="scope.row.status" /></template></el-table-column>
        <el-table-column label="业务类型" min-width="130"><template #default="scope">{{ scope.row.businessTypes.join('、') }}</template></el-table-column>
        <el-table-column prop="quoteType" label="报价类型" min-width="180" />
        <el-table-column label="报价分组" min-width="150"><template #default="scope">{{ listSummary(scope.row.groups, scope.row.group) }}</template></el-table-column>
        <el-table-column label="货物类型" min-width="125"><template #default="scope">{{ scope.row.cargoTypes.join('、') }}</template></el-table-column>
        <el-table-column label="运输方式" min-width="125"><template #default="scope">{{ scope.row.transportModes.join('、') }}</template></el-table-column>
        <el-table-column label="承运商" min-width="170"><template #default="scope">{{ carrierSummary(scope.row) }}</template></el-table-column>
        <el-table-column label="目的地" min-width="120"><template #default="scope">{{ listSummary(scope.row.destinations, scope.row.destination) }}</template></el-table-column>
        <el-table-column label="报价币种" width="110"><template #default="scope">{{ scope.row.quoteType === '代收货款手续费报价' ? scope.row.currency : '--' }}</template></el-table-column>
        <el-table-column label="金额区间" min-width="175"><template #default="scope">{{ rangeSummary(scope.row) }}</template></el-table-column>
        <el-table-column label="手续费区间" min-width="170"><template #default="scope">{{ feeSummary(scope.row) }}</template></el-table-column>
        <el-table-column prop="billingMode" label="计费模式" min-width="205" />
        <el-table-column prop="feeRounding" label="舍入模式" width="110" />
        <el-table-column prop="carryMode" label="进位模式" width="110" />
        <el-table-column prop="updatedBy" label="修改人" min-width="115" />
        <el-table-column prop="updatedAt" label="修改时间" min-width="160" />
        <el-table-column prop="createdBy" label="创建人" min-width="115" />
        <el-table-column prop="createdAt" label="创建时间" min-width="160" />
        <el-table-column prop="startDate" label="生效时间" width="125" />
        <el-table-column prop="endDate" label="到期时间" width="125" />
        <el-table-column label="永久启用" width="105" align="center"><template #default="scope">{{ scope.row.permanent ? '是' : '否' }}</template></el-table-column>
        <el-table-column prop="priority" label="优先级" width="90" align="center" />
        <TableActionColumn>
          <template #default="scope">
            <div class="row-action-cell">
              <el-button class="table-detail-button" link type="primary" :icon="EditPen" title="编辑报价" aria-label="编辑报价" @click="$emit('edit', scope.row)" />
              <HoverActionMenu>
                <el-dropdown-item :icon="EditPen" @click="$emit('edit', scope.row)">编辑</el-dropdown-item>
                <el-dropdown-item :icon="CopyDocument" @click="$emit('copy', scope.row)">复制新增</el-dropdown-item>
                <el-dropdown-item @click="$emit('history', scope.row)">历史版本</el-dropdown-item>
                <el-dropdown-item :icon="scope.row.status === '启用' ? VideoPause : VideoPlay" @click="$emit('toggle-status', scope.row)">{{ scope.row.status === '启用' ? '停用' : '启用' }}</el-dropdown-item>
                <el-dropdown-item class="danger-action" :icon="Delete" @click="$emit('remove', scope.row)">删除</el-dropdown-item>
              </HoverActionMenu>
            </div>
          </template>
        </TableActionColumn>
      </el-table>
    </DataTableFrame>
  </section>
</template>

<style scoped>
.route-quote-list-panel { overflow: visible; }
.route-quote-table .cell { white-space: nowrap; }
</style>
