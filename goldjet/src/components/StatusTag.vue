<script setup>
import { computed } from 'vue'

const props = defineProps({ label: { type: String, default: '' } })
const tone = computed(() => {
  if (['成功', '有效', '已完成', '审核通过', '审批通过', '已卸货', '已调度', '运输中'].includes(props.label)) return 'success'
  if (['失败', '失效', '审批拒绝', '已取消', '异常'].includes(props.label)) return 'danger'
  if (['处理中', '待补录', '待上架', '部分上架', '部分理货', '部分收货'].includes(props.label)) return 'running'
  if (['待确认', '待审核', '待审批', '未调度', '待接单', '待收货', '待理货'].includes(props.label)) return 'warning'
  return 'neutral'
})
</script>

<template><span :class="['status-tag', tone]">{{ label }}</span></template>
