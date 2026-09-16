<script setup>
import { computed } from 'vue'
import { AIR_PICKUP_REGIONS } from '../domain/airOperations.js'
import { AIR_WAREHOUSE_OPERATIONS } from '../domain/airOrderSupplement.js'
import AirClearanceAttachments from './AirClearanceAttachments.vue'

const props = defineProps({ kind: { type: String, required: true }, model: { type: Object, required: true }, readModel: { type: Object, default: null }, readonly: Boolean, errors: { type: Object, default: () => ({}) }, prefix: { type: String, default: '' } })
const source = computed(() => props.readModel || props.model)
const schemas = {
  pickup: [
    { key: 'supplier', label: '提货供应商', required: true }, { key: 'time', label: '提货时间', datetime: true, required: true },
    { key: 'region', label: '提货点省 / 市 / 区', region: true, required: true }, { key: 'address', label: '提货点详细地址', required: true },
    { key: 'contact', label: '提货联系人', required: true, max: 4 }, { key: 'phone', label: '提货电话', required: true },
    { key: 'arrivalAddress', label: '到货点', required: true }, { key: 'arrivalContact', label: '到货联系人', required: true, max: 60 },
    { key: 'arrivalPhone', label: '到货电话' }, { key: 'vehicleType', label: '特种车', options: ['监管车', '非监管车', '气垫车', '平板车'] }, { key: 'remark', label: '提货备注', textarea: true, max: 256 },
  ],
  transfer: [
    { key: 'warehouseArea', label: '库区' }, { key: 'documentStatus', label: '单证情况' }, { key: 'customsMode', label: '预报关 / 非预报关', readonly: true },
    { key: 'waybillNo', label: '提单号', readonly: true }, { key: 'flight', label: '头程航班', readonly: true },
    { key: 'pieces', label: '中转件数（件）', readonly: true }, { key: 'grossWeight', label: '中转重量（kg）', readonly: true }, { key: 'volume', label: '中转体积（m³）', readonly: true },
    { key: 'pickupPoint', label: '提货点' }, { key: 'deliveryPoint', label: '卸货点' },
  ],
  customs: [
    { key: 'choice', label: '报关选择', options: ['我司报关', '客自报关'] }, { key: 'documentType', label: '单证类型', options: ['代理出口报关', '单证报关', 'B2C报关'] },
    { key: 'phone', label: '报关员电话' }, { key: 'pieces', label: '中转件数（件）', readonly: true }, { key: 'grossWeight', label: '中转重量（kg）', readonly: true }, { key: 'volume', label: '中转体积（m³）', readonly: true },
    { key: 'goodsName', label: '品名', readonly: true }, { key: 'remark', label: '报关备注', textarea: true },
  ],
  security: [
    { key: 'customsMode', label: '预报关 / 非预报关', readonly: true }, { key: 'pieces', label: '预报件数（件）', readonly: true }, { key: 'grossWeight', label: '预报重量（kg）', readonly: true }, { key: 'volume', label: '预报体积（m³）', readonly: true },
    { key: 'customer', label: '客户名称', readonly: true }, { key: 'waybillNo', label: '提单号', readonly: true }, { key: 'origin', label: '始发地', readonly: true }, { key: 'destination', label: '目的地', readonly: true },
    { key: 'flight', label: '头程航班', readonly: true }, { key: 'cutoffTime', label: '截单时间', readonly: true }, { key: 'housebillNo', label: '分单号', readonly: true }, { key: 'goodsName', label: '分单品名', readonly: true }, { key: 'arrivalDate', label: '到货日期', date: true },
  ],
  clearance: [
    { key: 'waybillNo', label: '提单号', readonly: true }, { key: 'pieces', label: '提单件数（件）', readonly: true }, { key: 'grossWeight', label: '提单毛重（kg）', readonly: true }, { key: 'volume', label: '提单体积（m³）', readonly: true },
    { key: 'departureDate', label: '头程出港日期', readonly: true }, { key: 'secondDepartureDate', label: '二程出港日期', date: true }, { key: 'expectedArrival', label: '预计到达时间', datetime: true },
    { key: 'deliveryAddress', label: '派送地址' }, { key: 'phone', label: '派送电话' }, { key: 'contact', label: '派送联系人' }, { key: 'remark', label: '清关派送备注', textarea: true },
  ],
}
const fields = computed(() => schemas[props.kind] || [])
function display(value) { return value === '' || value === undefined || value === null || (Array.isArray(value) && !value.length) ? '未填写' : Array.isArray(value) ? value.join('、') : value }
</script>

<template>
  <div class="air-service-fields">
    <el-form-item v-if="kind === 'warehouse'" label="仓储操作" :error="errors.warehouseOperations" class="service-wide"><el-checkbox-group v-model="model.warehouseOperations" :disabled="readonly"><el-checkbox v-for="name in AIR_WAREHOUSE_OPERATIONS" :key="name" :value="name">{{ name }}</el-checkbox></el-checkbox-group></el-form-item>
    <el-form-item v-for="field in fields" :key="field.key" :label="field.label" :required="field.required" :error="errors[`${kind}.${field.key}`]" :class="{ 'service-wide': field.textarea }">
      <el-input v-if="field.readonly" :model-value="display(source[kind]?.[field.key])" readonly :aria-label="`${prefix}${field.label}`" />
      <el-cascader v-else-if="field.region" v-model="model[kind][field.key]" :options="AIR_PICKUP_REGIONS" filterable clearable :disabled="readonly" placeholder="请选择省 / 市 / 区" :aria-label="`${prefix}提货点省市区`" />
      <el-select v-else-if="field.options" v-model="model[kind][field.key]" clearable :disabled="readonly" :aria-label="`${prefix}${field.label}`"><el-option v-for="value in field.options" :key="value" :value="value" /></el-select>
      <el-date-picker v-else-if="field.date || field.datetime" v-model="model[kind][field.key]" :type="field.datetime ? 'datetime' : 'date'" :value-format="field.datetime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'" :format="field.datetime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'" :disabled="readonly" :aria-label="`${prefix}${field.label}`" />
      <el-input v-else v-model="model[kind][field.key]" :type="field.textarea ? 'textarea' : 'text'" :maxlength="field.max" :readonly="readonly" :aria-label="`${prefix}${field.label}`" />
    </el-form-item>
    <el-form-item v-if="kind === 'customs'" label="报关附件" class="service-wide"><el-input model-value="附件范围与接收规则待确认" disabled :aria-label="`${prefix}报关附件`" /></el-form-item>
    <AirClearanceAttachments v-if="kind === 'clearance'" v-model="model.clearance.attachments" :readonly="readonly" :error="errors['clearance.attachments']" class="service-wide" />
  </div>
</template>

<style scoped>
.air-service-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr)); gap: 0 20px; }
.air-service-fields > * { min-width: 0; }
.service-wide { grid-column: 1 / -1; }
.air-service-fields :deep(.el-select), .air-service-fields :deep(.el-date-editor), .air-service-fields :deep(.el-cascader) { width: 100%; }
</style>
