<script setup>
import { computed } from 'vue'
import BillingConfigVersionPanel from './BillingConfigVersionPanel.vue'
import RateConfigVersionPanel from './RateConfigVersionPanel.vue'
import { historicalVersionCount } from '../../domain/configVersions.js'

const props = defineProps({
  modelValue: { type:Boolean, default:false },
  config: { type:Object, default:null },
  versions: { type:Array, default:() => [] },
  kind: { type:String, default:'billing' },
})
const emit = defineEmits(['update:modelValue', 'view'])
const currentVersion = computed(() => props.config?.version || props.config?.currentVersion || '--')
const pendingVersion = computed(() => props.config?.pendingVersion || '--')
const historyCount = computed(() => historicalVersionCount(props.versions))
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    class="module-dialog module-dialog-wide version-history-dialog"
    align-center
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="drawer-title">
        <span>配置版本记录</span>
        <small>{{ props.config?.name ? `${props.config.name} · ` : '' }}{{ props.config?.no }}</small>
      </div>
    </template>
    <div class="version-history-summary">
      <div><span>当前生效版本</span><strong>{{ currentVersion }}</strong></div>
      <div><span>待生效版本</span><strong>{{ pendingVersion }}</strong></div>
      <div><span>历史版本数量</span><strong>{{ historyCount }}</strong></div>
      <div><span>全部已发布版本</span><strong>{{ props.versions.length }}</strong></div>
    </div>
    <RateConfigVersionPanel v-if="props.kind === 'rate'" :versions="props.versions" @view="emit('view', $event)" />
    <BillingConfigVersionPanel v-else :versions="props.versions" @view="emit('view', $event)" />
    <template #footer><el-button @click="emit('update:modelValue', false)">关闭</el-button></template>
  </el-dialog>
</template>

<style scoped>
.version-history-summary{margin-bottom:12px;display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));border:1px solid var(--border);background:#f8fafb}.version-history-summary>div{min-height:64px;padding:12px;display:flex;flex-direction:column;gap:6px;border-right:1px solid var(--border)}.version-history-summary>div:last-child{border-right:0}.version-history-summary span{color:#727e90;font-size:var(--font-size-sm)}.version-history-summary strong{color:#26354d;font-size:18px}@media(max-width:760px){.version-history-summary{grid-template-columns:1fr 1fr}.version-history-summary>div:nth-child(2){border-right:0}.version-history-summary>div:nth-child(-n+2){border-bottom:1px solid var(--border)}}
</style>
