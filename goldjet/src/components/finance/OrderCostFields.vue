<script setup>
import { computed } from 'vue'
import FinanceCurrencySelect from '../FinanceCurrencySelect.vue'
import OrderCostAttachments from './OrderCostAttachments.vue'
import { costItems, costParties, lookupCostRate, costAmounts, costErrors, costReference, money, ADJUSTMENT_TYPES } from '../../domain/orderCosts.js'
const props = defineProps({ draft: { type: Object, required: true }, order: Object, state: Object, adjustment: Boolean, existing: Boolean, readonly: Boolean, showErrors: Boolean })
const emit = defineEmits(['busy'])
const amounts = computed(() => costAmounts(props.draft))
const errors = computed(() => props.showErrors ? costErrors(props.state, props.order, props.draft, { adjustment: props.adjustment, existing: props.existing }) : {})
const reference = computed(() => costReference(props.state, props.order?.id, props.draft.feeItemId))
function currencyChanged(value) {
  const rate = lookupCostRate(props.state, value, (props.draft.createdAt || props.state.orderCostBook.today).slice(0, 10))
  Object.assign(props.draft, { currency: value, spotRate: rate.rate, agreedRate: rate.rate, rateId: rate.id })
}
</script>
<template>
  <el-form label-position="top" class="cost-fields" :disabled="readonly" @submit.prevent>
    <el-alert v-if="!adjustment&&!existing&&draft.direction==='应付'" title="结算单位类型待确认（186），新增应付暂不保存。" type="warning" :closable="false"/>
    <div class="field-grid">
      <el-form-item v-if="!adjustment" label="(子)单号" required :error="errors.childNo"><el-select v-model="draft.childNo" filterable aria-label="(子)单号"><el-option v-for="number in [order.orderNo, ...order.childNumbers]" :key="number" :value="number" :label="number"/></el-select></el-form-item>
      <el-form-item v-else label="(子)单号"><el-input :model-value="draft.adjustmentNo || '保存后生成调整单号'" readonly aria-label="调整单子单号"/></el-form-item>
      <el-form-item label="成本属性" required :error="errors.direction"><el-select v-if="adjustment" v-model="draft.direction" aria-label="成本属性" @change="draft.partyId='' "><el-option v-for="direction in ['应收','应付']" :key="direction" :value="direction"/></el-select><el-input v-else :model-value="draft.direction" readonly aria-label="成本属性"/></el-form-item>
      <el-form-item label="结算单位" required :error="errors.partyId"><el-select v-model="draft.partyId" filterable aria-label="结算单位"><el-option v-for="party in costParties(state, order, draft.direction)" :key="party.id" :value="party.id" :label="party.name"/></el-select></el-form-item>
      <el-form-item label="成本项目" required :error="errors.feeItemId"><el-select v-model="draft.feeItemId" filterable aria-label="成本项目"><el-option v-for="item in costItems(state, order, adjustment)" :key="item.id" :value="item.id" :label="item.code+' '+item.name"/></el-select></el-form-item>
      <el-form-item label="数量" required :error="errors.quantity"><el-input v-model="draft.quantity" inputmode="decimal" aria-label="数量"/></el-form-item>
      <el-form-item label="计费单位" required :error="errors.unit"><el-input v-model="draft.unit" aria-label="计费单位"/></el-form-item>
      <el-form-item label="币种" required :error="errors.currency"><FinanceCurrencySelect :model-value="draft.currency" label="币种" @update:model-value="currencyChanged"/></el-form-item>
      <el-form-item label="税率(%)" required :error="errors.taxRate"><el-input v-model="draft.taxRate" inputmode="decimal" aria-label="税率(%)" placeholder="请明确填写税率"/></el-form-item>
      <el-form-item label="含税单价(原币)" required :error="errors.unitPrice"><el-input v-model="draft.unitPrice" inputmode="decimal" aria-label="含税单价(原币)"/></el-form-item>
      <el-form-item v-if="draft.direction==='应收' && !adjustment" label="单价参考值(人民币)"><el-button link type="primary" :disabled="reference===null || draft.currency!=='CNY'" :title="draft.currency!=='CNY'?'非人民币带入规则待确认（191）':'带入含税单价'" @click="draft.unitPrice=String(reference)">{{ money(reference) }}</el-button></el-form-item>
      <el-form-item label="总金额(原币)"><el-input :model-value="money(amounts.originalAmount)" readonly/></el-form-item>
      <el-form-item label="即期汇率" :error="errors.spotRate"><el-input :model-value="draft.spotRate || '无可用汇率'" readonly/></el-form-item>
      <el-form-item label="约定汇率" required :error="errors.agreedRate"><el-input v-model="draft.agreedRate" inputmode="decimal" aria-label="约定汇率"/></el-form-item>
      <el-form-item label="约定汇率超即期汇率(%)"><strong :class="{premium:amounts.premium>3}">{{ money(amounts.premium) }}</strong></el-form-item>
      <el-form-item label="人民币金额"><strong>{{ money(amounts.amount) }}</strong></el-form-item>
      <template v-if="adjustment">
        <el-form-item label="调账责任人" :required="!existing" :error="errors.responsibleId"><el-select v-model="draft.responsibleId" filterable clearable aria-label="调账责任人"><el-option v-for="user in state.orderCostBook.users.filter(user=>user.companyId===order.companyId)" :key="user.id" :value="user.id" :label="user.name"/></el-select></el-form-item>
        <el-form-item label="调账种类" :error="errors.adjustmentType"><el-select v-model="draft.adjustmentType" clearable aria-label="调账种类"><el-option v-for="type in ADJUSTMENT_TYPES" :key="type.value" :value="type.value" :label="type.label" :disabled="['10','11'].includes(type.value)"/></el-select></el-form-item>
        <el-form-item label="调账原因" class="full" :error="errors.adjustmentReason"><el-input v-model="draft.adjustmentReason" type="textarea" :rows="2" maxlength="200" show-word-limit aria-label="调账原因"/></el-form-item>
      </template>
      <el-form-item v-else label="备注" class="full" :error="errors.remark"><el-input v-model="draft.remark" type="textarea" :rows="2" maxlength="200" show-word-limit aria-label="成本备注"/></el-form-item>
    </div>
    <el-form-item label="附件" :required="adjustment && Number(draft.adjustmentType)>=9" :error="errors.attachments"><OrderCostAttachments v-model="draft.attachments" :readonly="readonly || (adjustment && existing)" @busy="emit('busy',$event)"/></el-form-item>
    <el-alert v-if="errors.amount" :title="errors.amount" type="error" :closable="false"/>
  </el-form>
</template>
<style scoped>
.cost-fields{container-type:inline-size}.field-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0 18px}.full{grid-column:1/-1}.el-select{width:100%}.premium{color:#b54708}strong{font-size:15px;font-weight:600;overflow-wrap:anywhere}.el-form-item{min-width:0}@container(max-width:820px){.field-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@container(max-width:480px){.field-grid{grid-template-columns:minmax(0,1fr)}}
</style>
