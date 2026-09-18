<script setup>
import { computed } from 'vue'
import { FINANCE_CURRENCIES } from '../domain/financeBasics.js'
const props=defineProps({modelValue:String,label:String,target:Boolean,disabled:Boolean})
const emit=defineEmits(['update:modelValue'])
const options=computed(()=>FINANCE_CURRENCIES.filter(row=>!props.target||['CNY','HKD'].includes(row.code)))
</script>
<template><el-select :model-value="modelValue" :aria-label="label" :disabled="disabled" filterable clearable @update:model-value="emit('update:modelValue',$event)"><el-option v-for="row in options" :key="row.code" :value="row.code" :label="row.code+' '+row.name"><span class="currency-code">{{row.code}}</span><span>{{row.name}}</span></el-option></el-select></template>
<style scoped>.currency-code{display:inline-block;width:72px}.el-select{width:100%}</style>
