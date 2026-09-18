<script setup>
import { computed } from 'vue'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { visibleTrackingEvents } from '../domain/airTracking.js'

const props = defineProps({ events: { type: Array, required: true }, label: { type: String, required: true }, expanded: Boolean })
defineEmits(['update:expanded'])
const visible = computed(() => visibleTrackingEvents(props.events, props.expanded))
</script>

<template>
  <div class="tracking-timeline" :aria-label="label">
    <p v-if="!events.length" class="timeline-empty">暂无轨迹记录</p>
    <ol v-else>
      <li v-for="event in visible" :key="event.id" :class="{ abnormal: event.abnormal }">
        <time>{{ event.time }}</time>
        <div class="timeline-content"><div class="timeline-heading"><strong>{{ event.service }}</strong><span>{{ event.status }}</span></div><p>{{ event.content }}</p></div>
      </li>
    </ol>
    <el-button v-if="events.length > 2" link type="primary" :icon="expanded ? ArrowUp : ArrowDown" :aria-expanded="expanded" @click="$emit('update:expanded', !expanded)">{{ expanded ? '收起轨迹' : `展开全部（${events.length}）` }}</el-button>
  </div>
</template>

<style scoped>
.tracking-timeline { min-width: 0; }
ol { list-style: none; padding: 0; margin: 16px 0 4px; }
li { display: grid; grid-template-columns: 148px minmax(0, 1fr); gap: 24px; min-height: 66px; }
time { color: var(--muted); font-variant-numeric: tabular-nums; }
.timeline-content { border-left: 1px solid var(--border); padding: 0 0 18px 22px; position: relative; min-width: 0; }
.timeline-content::before { content: ''; position: absolute; left: -4px; top: 5px; width: 7px; height: 7px; background: var(--muted); border-radius: 50%; }
li:last-child .timeline-content { border-color: transparent; }
.timeline-heading { display: flex; flex-wrap: wrap; gap: 8px 16px; }
p { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.abnormal, .abnormal time { color: var(--danger); }
.abnormal .timeline-content::before { background: var(--danger); }
.timeline-empty { padding: 12px 0; color: var(--muted); }
@container tracking (max-width: 560px) {
  li { grid-template-columns: minmax(0, 1fr); gap: 5px; padding-left: 12px; }
  time { padding-left: 22px; }
}
</style>
