<script setup>
import { useRoute } from 'vue-router'
import CostCenterView from '../CostCenterView.vue'
const route = useRoute()
</script>
<template><CostCenterView initial-view="billDetail" :selected-bill-id="String(route.params.id || '')" /></template>
