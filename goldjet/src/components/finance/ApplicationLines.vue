<script setup>
import { APPLICATION_LINE_COLUMNS, requestedAmountError } from '../../domain/financeApplications.js'
import { money } from '../../domain/orderCosts.js'
defineProps({ rows: Array, selectable: Boolean, editable: Boolean, requested: Boolean, disabled: Boolean, errors: { type: Object, default: () => ({}) } })
const emit = defineEmits(['selection', 'amount'])
const moneyKeys = ['unitPrice', 'originalAmount', 'appliedAmount', 'availableAmount']
</script>
<template>
  <el-table :data="rows" row-key="id" aria-label="申请明细" @selection-change="emit('selection',$event)">
    <el-table-column v-if="selectable" type="selection" width="48"/>
    <el-table-column v-for="[key,label,width] in APPLICATION_LINE_COLUMNS" :key="key" :label="label" :min-width="width">
      <template #default="{row}">{{moneyKeys.includes(key)?money(row[key]):row[key]??'未提供'}}</template>
    </el-table-column>
    <el-table-column v-if="requested" label="本次申请金额(原币)" :width="editable?220:175" :fixed="editable?'right':false">
      <template #default="{row}">
        <template v-if="editable"><el-input :model-value="row.requestedAmount" :aria-label="'本次申请金额 '+row.sourceCostId" inputmode="decimal" :disabled="disabled" @update:model-value="emit('amount',row.id,$event)"/><p v-if="errors[row.id]||requestedAmountError(row)" class="amount-error" role="alert">{{errors[row.id]||requestedAmountError(row)}}</p></template>
        <template v-else>{{money(row.requestedAmount)}}</template>
      </template>
    </el-table-column>
  </el-table>
</template>
<style scoped>.amount-error{color:var(--el-color-danger);font-size:12px;line-height:1.5;margin:5px 0;white-space:normal}</style>
