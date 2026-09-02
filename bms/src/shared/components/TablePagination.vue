<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  total: { type: Number, default: 0 },
  currentPage: { type: Number, default: 1 },
  pageSize: { type: Number, default: 20 },
  pageSizes: { type: Array, default: () => [10, 20, 50, 100] },
  sticky: { type: Boolean, default: true },
})
const emit = defineEmits(['update:pageSize', 'update:currentPage'])
const anchor = ref(null)
const docked = ref(false)
const dockStyle = ref({})
let frameId = 0

function syncDock() {
  cancelAnimationFrame(frameId)
  if (!props.sticky) {
    docked.value = false
    dockStyle.value = {}
    return
  }
  frameId = requestAnimationFrame(() => {
    const element = anchor.value
    const frame = element?.closest('.data-table-frame') || element?.parentElement
    if (!element || !frame) return
    const anchorRect = element.getBoundingClientRect()
    const frameRect = frame.getBoundingClientRect()
    const barHeight = 56
    const shouldDock = frameRect.top < window.innerHeight - barHeight
      && frameRect.bottom > 0
      && anchorRect.top > window.innerHeight - barHeight
    docked.value = shouldDock
    dockStyle.value = shouldDock
      ? { left: `${frameRect.left}px`, width: `${frameRect.width}px` }
      : {}
  })
}

const currentPageModel = computed({
  get: () => props.currentPage,
  set: value => emit('update:currentPage', value),
})
const pageSizeModel = computed({
  get: () => props.pageSize,
  set: value => emit('update:pageSize', value),
})

onMounted(() => {
  if (props.sticky) {
    window.addEventListener('scroll', syncDock, { passive: true })
    window.addEventListener('resize', syncDock)
  }
  nextTick(syncDock)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frameId)
  if (props.sticky) {
    window.removeEventListener('scroll', syncDock)
    window.removeEventListener('resize', syncDock)
  }
})

</script>

<template>
  <div ref="anchor" class="table-pagination">
    <div class="table-pagination-inner" :class="{ 'is-docked': docked }" :style="dockStyle">
      <div class="table-pagination-left">
        <el-pagination
          class="table-pagination-pager"
          v-model:current-page="currentPageModel"
          layout="prev, pager, next"
          :total="total"
          :page-size="pageSize"
        />
      </div>
      <el-select
        class="table-pagination-size"
        v-model="pageSizeModel"
      >
        <el-option
          v-for="size in pageSizes"
          :key="size"
          :label="`${size} 行/页`"
          :value="size"
        />
      </el-select>
    </div>
  </div>
</template>
