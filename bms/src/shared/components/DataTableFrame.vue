<script setup>
import { computed, provide, ref, watch } from 'vue'
import TablePagination from './TablePagination.vue'
import TableFieldSortButton from './TableFieldSortButton.vue'
import { clampPage, normalizedPageSize } from './tablePagination.js'
import { TABLE_AUTO_WIDTH_CONFIG } from './tableSizing.js'

const props = defineProps({
  total: { type: Number, default: 0 },
  selectedCount: { type: Number, default: null },
  pageSize: { type: Number, default: 20 },
  pageSizes: { type: Array, default: () => [10, 20, 50, 100] },
  toolbar: { type: Boolean, default: true },
  showToolbar: { type: Boolean, default: true },
  selectionSummary: { type: Boolean, default: false },
  pagination: { type: Boolean, default: true },
  showPagination: { type: Boolean, default: true },
  stickyToolbar: { type: Boolean, default: true },
  stickyPagination: { type: Boolean, default: true },
  columnSort: { type: Boolean, default: true },
  columnDataSort: { type: Boolean, default: true },
  autoContentWidth: { type: Boolean, default: TABLE_AUTO_WIDTH_CONFIG.enabled },
  autoWidthRows: { type: Array, default: () => [] },
  autoWidthMax: { type: Number, default: TABLE_AUTO_WIDTH_CONFIG.maxWidth },
  autoWidthSampleSize: { type: Number, default: TABLE_AUTO_WIDTH_CONFIG.sampleSize },
  summary: { type: String, default: '' },
})

const emit = defineEmits(['update:pageSize', 'update:currentPage', 'column-order-change'])
const frameRef = ref(null)
const currentPage = ref(1)
const currentPageSize = ref(normalizedPageSize(props.pageSize))

provide('prototypeTableColumnDataSort', computed(() => props.columnDataSort))
provide('prototypeTablePagination', computed(() => ({
  enabled: props.pagination && props.showPagination,
  currentPage: currentPage.value,
  pageSize: currentPageSize.value,
  reset: () => updateCurrentPage(1),
})))
provide('prototypeTableAutoWidth', computed(() => ({
  enabled: props.autoContentWidth,
  rows: props.autoWidthRows,
  maxWidth: props.autoWidthMax,
  sampleSize: props.autoWidthSampleSize,
})))

function updateCurrentPage(value) {
  const next = clampPage(value, props.total, currentPageSize.value)
  currentPage.value = next
  emit('update:currentPage', next)
}

function updatePageSize(value) {
  currentPageSize.value = normalizedPageSize(value)
  emit('update:pageSize', currentPageSize.value)
  updateCurrentPage(1)
}

watch(() => props.pageSize, value => {
  currentPageSize.value = normalizedPageSize(value)
  currentPage.value = clampPage(currentPage.value, props.total, currentPageSize.value)
})

watch(() => props.total, value => {
  currentPage.value = clampPage(currentPage.value, value, currentPageSize.value)
})
</script>

<template>
  <div ref="frameRef" class="data-table-frame">
    <div
      v-if="toolbar && showToolbar"
      class="table-reference-toolbar"
      :class="{ 'is-static': !stickyToolbar }"
    >
      <div class="table-reference-leading">
        <slot name="toolbar-leading">
          <span v-if="summary">{{ summary }}</span>
          <span v-else-if="selectionSummary" class="table-reference-summary">
            <span>共 {{ total }} 行</span>
            <span class="table-reference-summary-divider">|</span>
            <span>已选 {{ selectedCount ?? 0 }} 行</span>
          </span>
          <span v-else>共 {{ total }} 行</span>
        </slot>
      </div>
      <div v-if="$slots.actions || columnSort" class="table-reference-actions">
        <slot name="actions" />
        <TableFieldSortButton
          v-if="columnSort"
          :table-root="frameRef"
          @change="emit('column-order-change', $event)"
        />
      </div>
    </div>
    <slot />
    <TablePagination
      v-if="pagination && showPagination"
      :total="total"
      :current-page="currentPage"
      :page-size="currentPageSize"
      :page-sizes="pageSizes"
      :sticky="stickyPagination"
      @update:page-size="updatePageSize"
      @update:current-page="updateCurrentPage"
    />
  </div>
</template>
