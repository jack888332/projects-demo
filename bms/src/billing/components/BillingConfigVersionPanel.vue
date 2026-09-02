<script setup>
import { View } from '@element-plus/icons-vue'
import StatusTag from '../../shared/components/StatusTag.vue'

const props = defineProps({
  versions: { type:Array, default:() => [] },
})
const emit = defineEmits(['view'])
const publishedAt = version => version.publishedAt || version.updatedAt || '未记录'
const effectiveAt = version => version.versionStatus === '已取消' ? '未生效' : version.effectiveAt || version.effectStart || '未记录'
</script>

<template>
  <section class="billing-version-panel" aria-label="全部配置版本">
    <header><strong>全部版本</strong><span>共 {{ props.versions.length }} 个已发布版本</span></header>
    <div class="billing-version-row billing-version-head"><span>版本</span><span>版本状态</span><span>发布时间</span><span>生效时间</span><span>变更原因</span><span>操作</span></div>
    <div v-for="version in props.versions" :key="version.snapshotId || version.version" class="billing-version-row">
      <strong>{{ version.version }}</strong>
      <StatusTag :label="version.versionStatus" />
      <span>{{ publishedAt(version) }}</span>
      <span>{{ effectiveAt(version) }}</span>
      <span class="version-reason" :title="version.changeReason || '未记录'">{{ version.changeReason || '未记录' }}</span>
      <div class="billing-version-actions">
        <el-button link type="primary" :icon="View" @click="emit('view', version)">查看详情</el-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.billing-version-panel{border:1px solid var(--border);background:#fff}.billing-version-panel>header{height:44px;padding:0 12px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border);background:#f7f8fa}.billing-version-panel>header span{color:#727e90;font-size:var(--font-size-sm)}.billing-version-row{min-height:46px;display:grid;grid-template-columns:80px 90px 150px 150px minmax(180px,1fr) 110px;align-items:center;gap:12px;padding:6px 12px;border-bottom:1px solid var(--border);font-size:13px}.billing-version-row:last-child{border-bottom:0}.billing-version-head{min-height:40px;background:#fbfcfd;font-weight:600}.version-reason{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.billing-version-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px}@media(max-width:900px){.billing-version-panel{overflow-x:auto}.billing-version-row{min-width:820px}}
</style>
