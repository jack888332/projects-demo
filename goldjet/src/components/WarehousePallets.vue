<script setup>
import { computed, reactive, ref } from 'vue'
import { Search, Refresh } from '@element-plus/icons-vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canReadModule } from '../data/accessControl.js'
import { warehousePallets, WAREHOUSE_STATUSES, PALLET_COLUMNS, WAREHOUSE_DATE } from '../domain/warehouseOrders.js'
import { inDateRange } from '../domain/warehouseViews.js'
const props = defineProps({ orderId: { type: String, default: '' } })
defineEmits(['open-order'])
const { state } = usePrototypeData()
const defaults = () => ({ customer: '', status: '', inboundNo: '', palletNo: '', inboundDates: [WAREHOUSE_DATE, WAREHOUSE_DATE], outboundDates: [WAREHOUSE_DATE, WAREHOUSE_DATE] })
const pending = reactive(defaults()), applied = ref(null)
const all = computed(() => canReadModule('warehouseOrders') ? warehousePallets(state).filter(row => !props.orderId || row.orderId === props.orderId) : [])
const rows = computed(() => all.value.filter(row => !applied.value || ((!applied.value.customer || row.customer === applied.value.customer) && (!applied.value.status || row.status === applied.value.status) && (!applied.value.inboundNo || row.inboundNo === applied.value.inboundNo.trim()) && (!applied.value.palletNo || row.number === applied.value.palletNo.trim()) && inDateRange(row.inboundAt, applied.value.inboundDates) && inDateRange(row.outboundAt, applied.value.outboundDates))))
function reset() { Object.assign(pending, defaults()); applied.value = null }
function query() { applied.value = JSON.parse(JSON.stringify(pending)) }
</script>
<template>
  <section>
    <form v-if="!orderId" class="warehouse-query" aria-label="托盘筛选" @submit.prevent="query">
      <label>客户<el-select v-model="pending.customer" clearable aria-label="托盘客户"><el-option v-for="value in [...new Set(all.map(row => row.customer))]" :key="value" :value="value" /></el-select></label>
      <label>状态<el-select v-model="pending.status" clearable aria-label="托盘状态"><el-option v-for="value in WAREHOUSE_STATUSES" :key="value" :value="value" /></el-select></label>
      <label>入仓号<el-input v-model="pending.inboundNo" clearable aria-label="托盘入仓号" /></label><label>托盘号<el-input v-model="pending.palletNo" clearable aria-label="托盘号筛选" /></label>
      <label>入库日期<el-date-picker v-model="pending.inboundDates" type="daterange" value-format="YYYY-MM-DD" /></label><label>出库日期<el-date-picker v-model="pending.outboundDates" type="daterange" value-format="YYYY-MM-DD" /></label>
      <el-button native-type="submit" :icon="Search" type="primary">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button>
    </form>
    <el-table :data="rows" aria-label="仓库托盘列表"><el-table-column v-if="!orderId" prop="inboundNo" label="入仓号" min-width="190" /><el-table-column v-if="!orderId" prop="customer" label="客户" min-width="200" />
      <el-table-column v-for="[key,label,width] in PALLET_COLUMNS" :key="key" :prop="key" :label="label" :min-width="width" />
      <el-table-column v-for="[key,label] in [['inImages','入库照片'],['outImages','出库照片']]" :key="key" :label="label" min-width="150"><template #default="{row}"><el-image v-for="image in row[key]" :key="image.id || image.name" :src="image.dataUrl" :alt="label" :preview-src-list="row[key].map(value => value.dataUrl)" preview-teleported class="pallet-photo" /></template></el-table-column>
      <el-table-column v-if="!orderId" label="详情" width="80" fixed="right"><template #default="{row}"><el-button link type="primary" @click="$emit('open-order',row)">查看</el-button></template></el-table-column>
    </el-table>
  </section>
</template>
<style scoped>
.warehouse-query { display:flex; flex-wrap:wrap; align-items:end; gap:12px; padding:8px 0 20px; }
.warehouse-query label { display:grid; gap:6px; font-size:12px; width:200px; max-width:100%; }
.warehouse-query label:has(.el-date-editor) { width:310px; }
:deep(.el-date-editor) { max-width:100%; width:100%; box-sizing:border-box; }
.pallet-photo { width:48px; height:48px; margin:4px; }
</style>
