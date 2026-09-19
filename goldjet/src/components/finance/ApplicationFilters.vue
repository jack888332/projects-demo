<script setup>
import { computed, ref } from 'vue'
import { Search, Refresh, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import FinanceCurrencySelect from '../FinanceCurrencySelect.vue'
import { APPLICATION_STATES, PAYMENT_STATES } from '../../domain/financeApplications.js'
import { cloneCost } from '../../domain/orderCosts.js'
const props = defineProps({ mode: String, kind: String })
const emit = defineEmits(['query'])
const defaults = () => props.mode === 'pending' ? { currency: 'CNY' } : props.mode === 'invoices' ? { status: '财务审批通过' } : {}
const pending = ref(defaults()), expanded = ref(false), error = ref('')
const fields = computed(() => props.mode === 'pending' ? [
  ['orderNo', '订单号'], ['childNo', '(子)单号'], ['customer', '客户'], ['settlementParty', '结算单位'], ['billNo', '提单号'], ['feeItem', '成本项目'], ['currency', '币种', 'currency'],
  ...(props.kind === 'payment' ? [['orderCreator', '订单创建人'], ['businessDate', '业务日期', 'date']] : []),
] : [
  ['applicationNo', '申请批次号'], ['settlementParty', '结算单位'], ['currency', '币种', 'currency'], ['status', '状态', 'status'],
  ['period', '应收应付周期', 'period'], ['minAmount', '申请金额从', 'amount'], ['maxAmount', '申请金额至', 'amount'], ['createdBy', '创建人'], ['createdAt', '创建日期', 'date'],
])
function submit() {
  error.value = ''
  for (const key of ['minAmount', 'maxAmount']) if (pending.value[key] !== '' && pending.value[key] != null && !/^-?\d+(\.\d+)?$/.test(pending.value[key])) error.value = '申请金额范围须为有效数值'
  if (pending.value.minAmount !== '' && pending.value.minAmount != null && pending.value.maxAmount !== '' && pending.value.maxAmount != null && Number(pending.value.minAmount) > Number(pending.value.maxAmount)) error.value = '起始金额不能大于截止金额'
  if (props.kind === 'payment' && props.mode === 'pending' && !pending.value.businessDate?.length) error.value = '请选择业务日期；默认范围待确认（207）'
  if (!error.value) emit('query', cloneCost(pending.value))
}
function reset() { pending.value = defaults(); error.value = ''; emit('query', cloneCost(pending.value)) }
</script>
<template>
  <el-form class="application-filters" label-position="top" @submit.prevent="submit">
    <div class="filter-grid">
      <el-form-item v-for="([key,label,type],index) in fields" v-show="expanded||index<4" :key="key" :label="label" :required="key==='businessDate'">
        <FinanceCurrencySelect v-if="type==='currency'" v-model="pending[key]" :label="'查询'+label"/>
        <el-date-picker v-else-if="type==='date'" v-model="pending[key]" type="daterange" value-format="YYYY-MM-DD" start-placeholder="起始日期" end-placeholder="截止日期" :aria-label="'查询'+label"/>
        <el-select v-else-if="type==='status'" v-model="pending[key]" :disabled="mode==='invoices'" clearable :aria-label="'查询'+label"><el-option v-for="value in kind==='receipt'?APPLICATION_STATES:PAYMENT_STATES" :key="value" :value="value"/></el-select>
        <el-input v-else v-model="pending[key]" clearable :disabled="type==='period'" :placeholder="type==='period'?'周期来源待确认（195）':''" :aria-label="'查询'+label" :inputmode="type==='amount'?'decimal':undefined"/>
      </el-form-item>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false"/>
    <div class="filter-actions"><el-button type="primary" :icon="Search" native-type="submit">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button><el-button link :icon="expanded?ArrowUp:ArrowDown" @click="expanded=!expanded">{{expanded?'收起':'更多条件'}}</el-button></div>
  </el-form>
</template>
<style scoped>
.application-filters{container-type:inline-size;margin:16px 0 20px}.filter-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0 16px}.filter-grid .el-form-item{min-width:0}.filter-grid :deep(.el-date-editor){width:100%;min-width:0}.filter-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.filter-actions .el-button{margin:0}@container(max-width:880px){.filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@container(max-width:500px){.filter-grid{grid-template-columns:minmax(0,1fr)}}
</style>
