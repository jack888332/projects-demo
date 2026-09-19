<script setup>
import { computed, ref } from 'vue'
import { Search, Refresh, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import FinanceCurrencySelect from '../FinanceCurrencySelect.vue'
import { cloneCost } from '../../domain/orderCosts.js'
const props = defineProps({ mode: String, direction: String })
const emit = defineEmits(['query'])
const pending = ref({}), expanded = ref(false)
const fields = computed(() => props.mode === 'statements' ? [
  ['statementNo','对账单号'], ['settlementParty','结算单位'], ['period','应收应付周期'], ['createdBy','创建人'], ['createdAt','创建日期','date'], ['status','状态','status'],
] : props.mode === 'pending' ? [
  ['orderNo','订单号'], ['childNo','(子)单号'], ['customer','客户'], ['settlementParty','结算单位'], ['billNo','提单号'], ['feeItem','成本项目'],
  ['createdBy','成本创建人', props.direction === '应收' ? 'unresolved' : 'text'], ['currency','币种','currency'], ['orderCreator','订单创建人'], ['businessDate','业务日期','date'], ['createdAt','成本项创建日期','date'],
] : [
  ['orderNo','订单号'], ['statementNo','对账单号（精确）'], ['customer','客户'], ['settlementParty','结算单位'], ['billNo','提单号'],
  ...(props.direction === '应收' ? [['childNo','(子)单号'], ['feeItem','成本项目']] : [['feeItem','成本项目','unresolved'], ['statementDirection','对账单属性','unresolved']]),
  ['currency','币种','currency'], ['orderCreator','订单创建人'], ['businessDate','业务日期','date'], ['statementDate','对账单创建日期','date'],
])
function reset() { pending.value = {}; emit('query', {}) }
</script>
<template>
  <el-form class="statement-filter" label-position="top" @submit.prevent="emit('query',cloneCost(pending))">
    <div class="filter-grid">
      <el-form-item v-for="([key,label,type],index) in fields" v-show="expanded || index<4" :key="key" :label="label">
        <el-date-picker v-if="type==='date'" v-model="pending[key]" type="daterange" value-format="YYYY-MM-DD" start-placeholder="起始日期" end-placeholder="截止日期" :aria-label="'查询'+label"/>
        <FinanceCurrencySelect v-else-if="type==='currency'" v-model="pending[key]" :label="'查询'+label"/>
        <el-select v-else-if="type==='status'" v-model="pending[key]" clearable :aria-label="'查询'+label"><el-option v-for="status in ['新建','已确认']" :key="status" :value="status"/></el-select>
        <el-input v-else v-model="pending[key]" clearable :disabled="type==='unresolved'||key==='period'" :placeholder="type==='unresolved'?'查询字段映射待确认（199）':key==='period'?'周期来源待确认（195）':''" :aria-label="'查询'+label"/>
      </el-form-item>
    </div>
    <div class="filter-actions"><el-button type="primary" :icon="Search" native-type="submit">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button><el-button link :icon="expanded?ArrowUp:ArrowDown" @click="expanded=!expanded">{{expanded?'收起':'更多条件'}}</el-button></div>
  </el-form>
</template>
<style scoped>
.statement-filter{container-type:inline-size;margin:16px 0 20px}.filter-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0 16px}.filter-grid .el-form-item{min-width:0}.filter-grid :deep(.el-date-editor){width:100%;min-width:0}.filter-actions{display:flex;flex-wrap:wrap;gap:8px}.filter-actions .el-button{margin:0}@container(max-width:880px){.filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@container(max-width:500px){.filter-grid{grid-template-columns:minmax(0,1fr)}}
</style>
