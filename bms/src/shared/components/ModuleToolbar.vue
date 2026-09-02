<script setup>
defineProps({
  resultText: { type: String, default: '' },
})
</script>

<template>
  <div class="module-toolbar">
    <div class="module-filters"><slot /></div>
    <div v-if="$slots.actions" class="module-toolbar-actions"><slot name="actions" /></div>
    <span v-else-if="resultText" class="module-result-count">{{ resultText }}</span>
  </div>
</template>
