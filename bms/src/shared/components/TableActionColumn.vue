<template>
  <el-table-column
    label="操作"
    :width="52"
    :min-width="52"
    fixed="right"
    :resizable="false"
    class-name="table-operation-column"
    label-class-name="table-operation-column"
  >
    <template #default="scope">
      <div class="table-operation-content">
        <slot v-bind="scope" />
      </div>
    </template>
  </el-table-column>
</template>

<script setup>
defineOptions({ inheritAttrs: false })

defineProps({
  compact: { type: Boolean, default: false },
  width: { type: [Number, String], default: 0 },
})
</script>
