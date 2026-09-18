<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { groundMonthlyRows } from '../domain/groundOrders.js'
const router = useRouter(), { state, groundSession } = usePrototypeData()
const month = ref('')
const allowed = computed(() => groundSession.readAll || groundSession.role === 'transportSupervisor')
const all = computed(() => allowed.value ? groundMonthlyRows(state.groundOrders) : [])
const rows = computed(() => all.value.filter(row => !month.value || row.month === month.value))
watch(() => [groundSession.role, groundSession.name], () => { month.value = '' })
const columns = [['dispatchCount','调度订单数'],['transportCount','完成运输订单数'],['transferCount','完成中转订单数'],['totalCount','完成总订单数'],['receivable','总应收'],['payable','总应付'],['profit','预计盈利']]
</script>
<template>
  <div class="module-view">
    <PageHeader title="航晟陆运月报" description="航晟物流"><template #actions><el-button @click="router.push('/fulfillment/ground-dispatch')">返回订单</el-button></template></PageHeader>
    <el-alert v-if="!allowed" title="当前角色无权查看陆运月报。查看角色：航晟物流陆运主管。" type="warning" :closable="false" />
    <template v-else>
      <form class="monthly-filter" @submit.prevent><label>月份<el-select v-model="month" clearable placeholder="全部月份" aria-label="陆运月报月份"><el-option v-for="row in all" :key="row.month" :value="row.month" /></el-select></label><el-button @click="month=''">重置</el-button></form>
      <el-alert title="调度归月、币种及主管审批金额口径待确认，相关指标暂不计算。" type="info" :closable="false" />
      <el-alert v-if="all.some(row => row.missingCompletionTime)" title="存在缺少完成时间的订单，完成数量暂不能准确归月。" type="warning" :closable="false" />
      <el-alert v-if="all.some(row => row.pendingStatus)" title="存在异常汇总状态待确认的订单，完成数量暂不计算。" type="warning" :closable="false" />
      <el-table :data="rows" aria-label="陆运月报" stripe empty-text="暂无订单月份"><el-table-column prop="month" label="月份" width="120" fixed="left" /><el-table-column v-for="[key,label] in columns" :key="key" :label="label" min-width="150" align="right"><template #default="{row}"><span :class="{pending:row[key]===null}">{{ row[key] === null ? '待确认' : row[key] }}</span></template></el-table-column></el-table>
    </template>
  </div>
</template>
<style scoped>
.monthly-filter { display:flex; gap:12px; align-items:end; margin-bottom:20px; }
.monthly-filter label { display:grid; gap:8px; width:200px; }
.el-alert { margin-bottom:16px; }
.pending { color:var(--muted); font-size:13px; }
</style>
