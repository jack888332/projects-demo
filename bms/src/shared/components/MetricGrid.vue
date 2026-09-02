<script setup>
const props = defineProps({
  items: { type: Array, default: () => [] },
  columns: { type: Number, default: 4 },
})
</script>

<template>
  <div class="module-kpis" :style="{ '--metric-columns': columns }">
    <div
      v-for="item in items"
      :key="item.key ?? item.label"
      :class="['module-kpi', item.tone || 'slate']"
    >
      <span>{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
    </div>
  </div>
</template>
