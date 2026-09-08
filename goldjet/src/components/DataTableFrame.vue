<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  pageSize: { type: Number, default: 10 },
  pageSizes: { type: Array, default: () => [10, 20, 50] },
  selectedCount: { type: Number, default: 0 },
  selectable: { type: Boolean, default: false },
})

const page = ref(1)
const size = ref(props.pageSize)
const total = computed(() => props.rows.length)
const pageRows = computed(() => props.rows.slice((page.value - 1) * size.value, page.value * size.value))
watch(() => props.rows.length, () => { page.value = 1 })
watch(size, () => { page.value = 1 })
</script>

<template>
  <div class="data-table-frame">
    <div class="table-toolbar">
      <div>
        <span>共 {{ total }} 条</span>
        <template v-if="selectable"><span class="toolbar-separator">|</span><strong>已选 {{ selectedCount }} 条</strong></template>
      </div>
      <div class="table-actions"><slot name="actions" /></div>
    </div>
    <div class="table-scroll"><slot :rows="pageRows" /></div>
    <div class="table-pagination">
      <el-pagination v-model:current-page="page" layout="prev, pager, next" :total="total" :page-size="size" />
      <el-select v-model="size" class="page-size-select">
        <el-option v-for="value in pageSizes" :key="value" :label="`${value} 条/页`" :value="value" />
      </el-select>
    </div>
  </div>
</template>
