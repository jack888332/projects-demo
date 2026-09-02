<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, default: '' },
  tone: { type: String, default: '' },
})

const toneByStatus = {
  成功: 'success', 执行成功: 'success', 导出成功: 'success', 已回款: 'success', 已返款: 'success', 已对账: 'success', 已结清: 'success', 已收口: 'success', 生效: 'success', 启用: 'success', 审核通过: 'success',
  待执行: 'info', 待确认: 'warning', 待审核: 'warning', 待生效: 'warning', 待回款: 'warning', 待返款: 'warning', 待对账: 'warning', 未收口: 'warning', 部分成功: 'warning',
  执行中: 'running', 导出中: 'running', 待结清: 'running',
  失败: 'danger', 执行失败: 'danger', 导出失败: 'danger', 审核驳回: 'danger', 通知失败: 'danger',
  停用: 'neutral', 已作废: 'neutral', 已取消: 'neutral', 不回款: 'neutral', 不返款: 'neutral', 无需对账: 'neutral',
}

const resolvedTone = computed(() => props.tone || toneByStatus[props.label] || 'neutral')
</script>

<template>
  <span :class="['status-tag', resolvedTone]"><slot>{{ label }}</slot></span>
</template>
