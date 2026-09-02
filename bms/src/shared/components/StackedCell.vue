<script setup>
defineProps({
  primary: { type: [String, Number], default: '' },
  secondary: { type: [String, Number], default: '' },
})
</script>

<template>
  <div class="main-cell">
    <strong>{{ primary }}</strong>
    <small v-if="secondary !== ''">{{ secondary }}</small>
    <slot />
  </div>
</template>

<style scoped>
.main-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.main-cell strong,
.main-cell small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.main-cell strong { color: #303746; font-size: var(--table-font-size); font-weight: var(--font-weight-regular); }
.main-cell small { color: #8a919e; font-size: var(--table-secondary-font-size); font-weight: var(--font-weight-regular); }
</style>
