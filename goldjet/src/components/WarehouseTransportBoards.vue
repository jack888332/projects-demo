<script setup>
import { computed, reactive, ref } from 'vue'
import { Search, Refresh, View } from '@element-plus/icons-vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canReadModule } from '../data/accessControl.js'
import { warehouseTransportOrders, warehouseTransportBills, inDateRange } from '../domain/warehouseViews.js'
import { WAREHOUSE_DATE } from '../domain/warehouseOrders.js'
import { GROUND_VEHICLES as GROUND_VEHICLE_TYPES, GROUND_SPECIAL_TYPES } from '../domain/groundOperations.js'
const props = defineProps({ kind: { type: String, default: 'orders' } })
const { state } = usePrototypeData()
const defaults = () => ({ keyword:'', type:'', vehicleType:'', specialVehicle:'', status:'', tailLift:'', expected:[WAREHOUSE_DATE,WAREHOUSE_DATE], actual:[] })
const filters = reactive(defaults()), applied = ref(defaults()), detail = ref(null)
const orders = computed(() => canReadModule('groundDispatch') ? warehouseTransportOrders(state) : [])
const bills = computed(() => canReadModule('groundWaybills') && canReadModule('groundDispatch') ? warehouseTransportBills(state) : [])
const filteredBills = computed(() => bills.value.filter(row => (!applied.value.keyword || [row.inboundNo,row.waybillNo,row.plate].includes(applied.value.keyword.trim())) && ['type','vehicleType','specialVehicle','status','tailLift'].every(key => !applied.value[key] || row[key] === applied.value[key]) && inDateRange(row.expectedAt,applied.value.expected) && inDateRange(row.actualAt,applied.value.actual)))
const related = computed(() => bills.value.filter(row => row.orderId === detail.value?.id).sort((a,b) => (a.plannedAt || '\uffff').localeCompare(b.plannedAt || '\uffff')))
const columns = [['inboundNo','入仓号',190],['waybillNo','运单号',190],['type','类型',150],['status','运单状态',115],['plate','车牌号',135],['vehicleType','车型',125],['specialVehicle','特种车',115],['tailLift','尾板车',100],['contact','司机及联系方式',230],['pieces','件数（件）',100],['volume','体积（m³）',125],['weight','预计重量（kg）',145],['dimensions','预计尺寸',190],['latestLocation','最新位置',240],['expectedAt','预计到达时间',180],['actualAt','实际到达时间',170],['remark','备注',240]]
function query() { applied.value = JSON.parse(JSON.stringify(filters)) }
function reset() { Object.assign(filters,defaults()); query() }
</script>
<template>
  <section>
    <el-alert v-if="!canReadModule('groundDispatch') || kind === 'bills' && !canReadModule('groundWaybills')" title="无对应运输数据查看权限" type="warning" :closable="false" />
    <template v-if="kind === 'bills'">
      <form class="board-query" aria-label="仓库运输运单筛选" @submit.prevent="query">
        <label>入仓号 / 运单号 / 车牌号<el-input v-model="filters.keyword" clearable aria-label="运单看板精确查询" /></label>
        <label v-for="[key,label,options] in [['type','类型',['提货','卸货']],['vehicleType','车型',GROUND_VEHICLE_TYPES],['specialVehicle','特种车',GROUND_SPECIAL_TYPES],['status','运单状态',['待提货','提货中','到达提货点','已提货','到达卸货点','已卸货','已取消']],['tailLift','尾板车',['是','否']]]" :key="key">{{ label }}<el-select v-model="filters[key]" clearable :aria-label="'看板'+label"><el-option v-for="value in options" :key="value" :value="value" /></el-select></label>
        <label>预计到达日期<el-date-picker v-model="filters.expected" type="daterange" value-format="YYYY-MM-DD" aria-label="看板预计到达日期" /></label><label>实际到达日期<el-date-picker v-model="filters.actual" type="daterange" value-format="YYYY-MM-DD" aria-label="看板实际到达日期" /></label>
        <el-button native-type="submit" type="primary" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button>
      </form>
      <el-alert v-if="bills.some(row => !row.expectedAt)" title="存在未取得预计到达时间的运单；日期筛选不包含这些记录。" :closable="false" type="info"><el-button link type="primary" @click="filters.expected=[]; query()">清除预计日期</el-button></el-alert>
      <el-table :data="filteredBills" aria-label="仓库运输运单看板"><el-table-column v-for="[key,label,width] in columns" :key="key" :prop="key" :label="label" :min-width="width"><template #default="{row}"><el-tooltip v-if="key === 'expectedAt' && !row.expectedAt" :content="row.etaReason"><span>未取得</span></el-tooltip><span v-else>{{ row[key] }}</span></template></el-table-column></el-table>
    </template>
    <template v-else>
      <el-table :data="orders" aria-label="仓库运输订单看板">
        <el-table-column v-for="[key,label,width] in [['inboundNo','入仓号',190],['customer','客户',200],['type','类型',150],['dispatchStatus','订单状态',120],['pieces','件数（件）',100],['volume','体积（m³）',120],['weight','重量（kg）',120],['dimensions','尺寸',180],['plannedAt','计划到达时间',170]]" :key="key" :prop="key" :label="label" :min-width="width" />
        <el-table-column label="操作" width="120" fixed="right"><template #default="{row}"><el-button :icon="View" link type="primary" :disabled="!canReadModule('groundWaybills')" @click="detail=row">查看详情</el-button></template></el-table-column>
      </el-table>
      <el-dialog :model-value="Boolean(detail)" title="相关运输运单" width="min(1100px,96vw)" @update:model-value="value => { if (!value) detail=null }">
        <p>{{ detail?.inboundNo }}</p><el-table :data="related" aria-label="仓库订单相关运单"><el-table-column v-for="[key,label,width] in columns.filter(([key]) => ['waybillNo','vehicleType','plate','contact','pieces','volume','weight','dimensions','remark','status'].includes(key))" :key="key" :prop="key" :label="label" :min-width="width" /><el-table-column prop="plannedAt" label="预计到达时间" min-width="170" /></el-table>
      </el-dialog>
    </template>
  </section>
</template>
<style scoped>
.board-query { display:flex; flex-wrap:wrap; align-items:end; gap:12px; padding:8px 0 20px; }
.board-query label { display:grid; gap:6px; font-size:12px; width:190px; max-width:100%; }
.board-query label:has(.el-date-editor) { width:310px; } :deep(.el-date-editor) { max-width:100%; width:100%; box-sizing:border-box; }
</style>
