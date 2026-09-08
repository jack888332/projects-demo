<script setup>
import { Search, Refresh } from '@element-plus/icons-vue'

defineProps({ modelValue: { type: String, default: '' }, placeholder: { type: String, default: '输入编号或客户' } })
const emit = defineEmits(['update:modelValue', 'reset'])
</script>

<template>
  <div class="filter-bar">
    <el-input
      class="keyword-filter"
      :model-value="modelValue"
      :placeholder="placeholder"
      clearable
      :prefix-icon="Search"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <slot />
    <el-button :icon="Refresh" @click="emit('reset')">重置</el-button>
  </div>
</template>
