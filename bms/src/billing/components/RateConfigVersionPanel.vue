<script setup>
import { computed } from 'vue'
import { View } from '@element-plus/icons-vue'
import StatusTag from '../../shared/components/StatusTag.vue'

const props = defineProps({ versions: { type:Array, default:() => [] } })
const emit = defineEmits(['view'])
const sortedVersions = computed(() => [...props.versions].sort((left, right) => Number(right.version?.slice(1)) - Number(left.version?.slice(1))))
const effectiveAt = version => version.versionStatus === '已取消' ? '未生效' : version.effectiveAt || '未记录'
</script>

<template>
  <div class="version-panel">
    <header><strong>全部版本</strong><span>共 {{ sortedVersions.length }} 个已发布版本</span></header>
    <div class="version-row version-head"><span>配置版本编号</span><span>版本状态</span><span>发布时间</span><span>生效时间</span><span>变更原因</span><span>规则数</span><span>规则摘要 / 当前默认汇率预览</span><span>操作</span></div>
    <div v-for="version in sortedVersions" :key="version.version" class="version-row">
      <strong>{{ version.configVersionNo || version.version }}</strong>
      <StatusTag :label="version.versionStatus || '历史'" />
      <span>{{ version.publishedAt || '未记录' }}</span>
      <span>{{ effectiveAt(version) }}</span>
      <span class="version-reason" :title="version.changeReason || '未记录'">{{ version.changeReason || '未记录' }}</span>
      <span>{{ version.ruleCount }}</span>
      <span class="rule-summary" :title="version.ruleSummary">{{ version.ruleSummary }}</span>
      <div class="version-actions"><el-button link type="primary" :icon="View" @click="emit('view', version)">查看详情</el-button></div>
    </div>
  </div>
</template>

<style scoped>
.version-panel{overflow-x:auto;border:1px solid var(--border);background:#fff}.version-panel>header{height:44px;padding:0 12px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border);background:#f7f8fa}.version-panel>header span{color:#727e90;font-size:var(--font-size-sm)}.version-row{min-width:1120px;min-height:44px;display:grid;grid-template-columns:190px 80px 125px 105px 150px 60px minmax(230px,1fr) 92px;align-items:center;gap:10px;padding:6px 12px;border-bottom:1px solid var(--border);font-size:13px}.version-row:last-child{border-bottom:0}.version-head{background:#fbfcfd;font-weight:600}.rule-summary,.version-reason{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.version-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px}
</style>
