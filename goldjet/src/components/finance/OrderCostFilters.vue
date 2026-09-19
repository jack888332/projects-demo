<script setup>
import { ref, computed, watch } from 'vue'
import { Search, Refresh, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import FinanceCurrencySelect from '../FinanceCurrencySelect.vue'
import { COST_STATES, cloneCost } from '../../domain/orderCosts.js'
const props = defineProps({ mode: String })
const emit = defineEmits(['query'])
const pending = ref({}), expanded = ref(false)
const common = [['orderNo','订单号'],['billNo','提单号'],['customer','客户'],['orderCreator','订单创建人'],['businessDate','业务日期','date']]
const modes = {
  orders: [...common,['businessType','业务类型']], summary: common,
  approvals: [...common,['submittedAt','提交日期','date']],
  details: [...common,['settlementParty','结算单位'],['status','状态','status'],['feeItem','成本项目'],['direction','成本属性','direction'],['currency','币种','currency'],['createdBy','成本创建人'],['createdAt','成本创建日期','date'],['businessApprovedAt','业务审批日期','date'],['financeApprovedAt','财务审批日期','date']],
  adjustments: [...common,['childNo','(子)单号'],['adjustmentNo','调整单号'],['settlementParty','结算单位'],['feeItem','成本项目'],['direction','成本属性','direction'],['currency','币种','currency'],['status','状态','status'],['createdBy','创建人'],['createdAt','创建日期','date']],
  sources: [...common,['childNo','(子)单号'],['settlementParty','结算单位'],['feeItem','成本项目'],['direction','成本属性','direction'],['currency','币种','currency'],['createdBy','成本创建人'],['createdAt','成本创建日期','date']],
}
const fields = computed(() => modes[props.mode] || common)
function reset() { pending.value = {}; emit('query', {}) }
watch(() => props.mode, () => { expanded.value = false; reset() })
</script>
<template>
  <el-form class="cost-filter" label-position="top" @submit.prevent="emit('query',cloneCost(pending))">
    <div class="filter-grid">
      <el-form-item v-for="([key,label,type],index) in fields" v-show="expanded || index<4" :key="key" :label="label">
        <el-date-picker v-if="type==='date'" v-model="pending[key]" type="daterange" value-format="YYYY-MM-DD" start-placeholder="起始日期" end-placeholder="截止日期" :aria-label="'查询'+label"/>
        <FinanceCurrencySelect v-else-if="type==='currency'" v-model="pending[key]" :label="'查询'+label"/>
        <el-select v-else-if="type==='status'||type==='direction'" v-model="pending[key]" clearable :aria-label="'查询'+label"><el-option v-for="option in type==='status'?COST_STATES:['应收','应付']" :key="option" :value="option"/></el-select>
        <el-input v-else v-model="pending[key]" clearable :aria-label="'查询'+label"/>
      </el-form-item>
    </div>
    <div class="filter-actions"><el-button type="primary" :icon="Search" native-type="submit">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button><el-button link :icon="expanded?ArrowUp:ArrowDown" @click="expanded=!expanded">{{expanded?'收起':'更多条件'}}</el-button></div>
  </el-form>
</template>
<style scoped>
.cost-filter{container-type:inline-size;margin:16px 0 20px}.filter-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0 16px}.filter-grid .el-form-item{min-width:0}.filter-grid :deep(.el-date-editor){width:100%;min-width:0}.filter-actions{display:flex;flex-wrap:wrap;gap:8px}.filter-actions .el-button{margin:0}@container(max-width:880px){.filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@container(max-width:500px){.filter-grid{grid-template-columns:minmax(0,1fr)}}
</style>
