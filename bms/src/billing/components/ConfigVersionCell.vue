<script setup>
import { computed } from 'vue'
import { pendingVersionLabel } from '../../domain/configVersions.js'
import ConfigVersionTag from '../../shared/components/ConfigVersionTag.vue'

const props = defineProps({
  currentVersion: { type:String, default:'--' },
  pendingVersion: { type:String, default:'' },
  pendingEffectiveAt: { type:String, default:'' },
})

const pendingLabel = computed(() => pendingVersionLabel(props.pendingVersion, props.pendingEffectiveAt))
</script>

<template>
  <div class="config-version-cell">
    <ConfigVersionTag :version="props.currentVersion" />
    <small v-if="pendingLabel" class="pending-version-note" :title="pendingLabel">{{ pendingLabel }}</small>
  </div>
</template>

<style scoped>
.config-version-cell{min-width:0;min-height:48px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:4px}.pending-version-note{max-width:100%;overflow:hidden;color:var(--muted);font-size:var(--table-secondary-font-size);font-weight:var(--font-weight-regular);line-height:18px;text-overflow:ellipsis;white-space:nowrap}
</style>
