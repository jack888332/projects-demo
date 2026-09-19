<script setup>
defineProps({ entries: { type: Array, required: true } })
</script>
<template><div class="cost-facts"><dl><div v-for="([label,value],index) in entries" :key="index"><dt>{{label}}</dt><dd>{{value??'—'}}</dd></div></dl></div></template>
<style scoped>
.cost-facts{container-type:inline-size;margin:18px 0 20px;min-width:0}dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:0;border-top:1px solid var(--border);border-left:1px solid var(--border)}dl>div{display:grid;grid-template-columns:100px minmax(0,1fr);border-right:1px solid var(--border);border-bottom:1px solid var(--border);min-width:0}dt,dd{padding:10px 12px;line-height:1.5;margin:0;overflow-wrap:anywhere;min-width:0}dt{background:#f5f7fa;color:#586272;font-weight:500}dd{background:#fff;color:var(--ink)}@container(max-width:900px){dl{grid-template-columns:repeat(2,minmax(0,1fr))}}@container(max-width:600px){dl{grid-template-columns:minmax(0,1fr)}dl>div{grid-template-columns:108px minmax(0,1fr)}}
</style>
