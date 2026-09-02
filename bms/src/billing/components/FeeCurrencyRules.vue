<script setup>
import { Delete, DocumentCopy, Plus } from '@element-plus/icons-vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import HoverActionMenu from '../../shared/components/HoverActionMenu.vue'

const props = defineProps({
  scheme: { type: Object, required: true },
  currencies: { type: Array, required: true },
  feeItems: { type: Array, required: true },
  templates: { type: Array, required: true },
})

const sourceCurrency = () => props.scheme.sourceCurrency || props.scheme.currency || props.currencies[0] || 'CNY'
const createFallbackRule = (settlementCurrency = 'SOURCE_CURRENCY') => ({
  feeCode: 'FALLBACK',
  fallback: true,
  settlementCurrency,
})

function normalizeRules() {
  const rules = Array.isArray(props.scheme.feeRules) ? props.scheme.feeRules : []
  const fallback = rules.find((rule) => rule.fallback) || createFallbackRule()
  fallback.feeCode = 'FALLBACK'
  fallback.fallback = true
  fallback.settlementCurrency ||= fallback.mode === 'FIXED' ? fallback.currency : 'SOURCE_CURRENCY'
  const explicitRules = rules.filter((rule) => !rule.fallback).map((rule) => ({
    ...rule,
    fallback: false,
    settlementCurrency: rule.settlementCurrency || (rule.mode === 'FIXED' ? rule.currency : sourceCurrency()),
  }))
  props.scheme.feeRules = [...explicitRules, fallback]
}

normalizeRules()

const addRule = () => props.scheme.feeRules.splice(0, 0, {
  feeCode: '',
  fallback: false,
  settlementCurrency: sourceCurrency(),
})
const feeLabel = (row) => row.fallback ? (props.scheme.feeRules.length === 1 ? '全部' : '其他') : ''
const feeDisabled = (feeCode, row) => props.scheme.feeRules.some((item) => item !== row && !item.fallback && item.feeCode === feeCode)

function applyTemplate(value) {
  if (!value) return
  const fallback = props.scheme.feeRules.find((rule) => rule.fallback) || createFallbackRule()
  props.scheme.feeRules = [
    { feeCode: 'FREIGHT', fallback: false, settlementCurrency: sourceCurrency() },
    { feeCode: 'COD_SERVICE_FEE', fallback: false, settlementCurrency: value.startsWith('TW') ? 'TWD' : 'JPY' },
    fallback,
  ]
}
</script>

<template>
  <div class="setting-row matrix-row">
    <div class="setting-meta"><b>费项结算币种</b><small>末行规则用于承接未明确配置的费项</small></div>
    <div class="matrix-wrap">
      <DataTableFrame :total="scheme.feeRules.length" :page-size="10" :sticky-toolbar="false" :column-sort="false" :column-data-sort="false">
        <template #actions>
          <el-dropdown trigger="click" placement="bottom-end" @command="applyTemplate">
            <el-button :icon="DocumentCopy" :disabled="!templates.length">引用模版</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="item in templates" :key="item.value" :command="item.value">{{ item.label }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button :icon="Plus" @click="addRule">添加</el-button>
        </template>
        <el-table :data="scheme.feeRules" border>
          <el-table-column label="费项" min-width="180">
            <template #default="{row}">
              <el-input v-if="row.fallback" :model-value="feeLabel(row)" disabled />
              <el-select v-else v-model="row.feeCode" filterable placeholder="请选择费项">
                <el-option v-for="item in feeItems" :key="item.value" :label="item.label" :value="item.value" :disabled="feeDisabled(item.value, row)" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="结算币种" min-width="180">
            <template #default="{row}">
              <el-select v-model="row.settlementCurrency">
                <el-option v-if="row.fallback" label="随原始币种" value="SOURCE_CURRENCY" />
                <el-option v-for="item in currencies" :key="item" :label="item" :value="item" />
              </el-select>
            </template>
          </el-table-column>
          <TableActionColumn compact>
            <template #default="{row,$index}">
              <HoverActionMenu v-if="!row.fallback"><el-dropdown-item class="danger-action" :icon="Delete" @click="scheme.feeRules.splice($index, 1)">删除</el-dropdown-item></HoverActionMenu>
            </template>
          </TableActionColumn>
        </el-table>
      </DataTableFrame>
    </div>
  </div>
</template>

<style scoped>
.setting-row.matrix-row{grid-template-columns:280px minmax(0,1fr);align-items:start;padding:var(--space-4) 0}.setting-meta{display:flex;flex-direction:column;gap:5px}.setting-meta b{font-size: var(--section-title-font-size);font-weight: var(--font-weight-semibold)}.setting-meta small{font-size: var(--font-size-sm);color:#8992a1;line-height: var(--line-height-base)}.matrix-wrap{min-width:0}
@media(max-width:760px){.setting-row.matrix-row{grid-template-columns:1fr}}
</style>
