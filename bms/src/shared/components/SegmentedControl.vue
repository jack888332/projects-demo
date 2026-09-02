<script setup>
defineProps({
  modelValue: { type: [String, Number], required: true },
  options: { type: Array, default: () => [] },
  ariaLabel: { type: String, default: '视图切换' },
})

const emit = defineEmits(['update:modelValue'])
const optionValue = (option) => typeof option === 'object' ? option.value : option
const optionLabel = (option) => typeof option === 'object' ? option.label : option
</script>

<template>
  <div class="module-segmented" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="option in options"
      :key="optionValue(option)"
      type="button"
      role="tab"
      :class="{ active: modelValue === optionValue(option) }"
      :aria-selected="modelValue === optionValue(option)"
      @click="emit('update:modelValue', optionValue(option))"
    >
      {{ optionLabel(option) }}
    </button>
  </div>
</template>
