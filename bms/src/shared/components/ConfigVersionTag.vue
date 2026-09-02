<script setup>
import { computed } from 'vue'

const props = defineProps({
  version: { type: String, default: '' },
})

const displayVersion = computed(() => props.version?.trim() || '--')
const hasVersion = computed(() => displayVersion.value !== '--')
</script>

<template>
  <span v-if="hasVersion" class="config-version-tag">{{ displayVersion }}</span>
  <span v-else class="config-version-empty">--</span>
</template>

<style scoped>
.config-version-tag{min-height:24px;padding:1px 8px;display:inline-flex;align-items:center;white-space:nowrap;border:1px solid var(--primary-border);border-radius:3px;background:var(--primary-soft);color:var(--primary-strong);font-size:var(--font-size-xs);font-weight:var(--font-weight-regular);line-height:20px}.config-version-empty{color:var(--muted);font-weight:var(--font-weight-regular)}
</style>
