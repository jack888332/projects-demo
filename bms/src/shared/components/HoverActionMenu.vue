<script setup>
defineProps({
  disabled: { type: Boolean, default: false },
})
</script>

<template>
  <el-dropdown
    trigger="click"
    placement="bottom-end"
    :show-timeout="0"
    :hide-timeout="0"
    :disabled="disabled"
    popper-class="row-action-popper"
  >
    <el-button class="row-more-button" link type="primary" title="更多操作" aria-label="更多操作">
      <span class="custom-more-icon" aria-hidden="true" />
    </el-button>
    <template #dropdown>
      <el-dropdown-menu><slot /></el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
