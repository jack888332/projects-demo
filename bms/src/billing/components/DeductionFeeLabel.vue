<script setup>
defineProps({
  name: { type: String, required: true },
})
</script>

<template>
  <span class="deduction-fee-label">
    <span>{{ name }}</span>
    <span class="deduction-fee-tag">扣减</span>
  </span>
</template>

<style scoped>
.deduction-fee-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.deduction-fee-tag {
  box-sizing: border-box;
  height: 20px;
  padding: 0 5px;
  border: 1px solid #e5484d;
  border-radius: 3px;
  background: #fff1f0;
  color: #c9363e;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}
</style>
