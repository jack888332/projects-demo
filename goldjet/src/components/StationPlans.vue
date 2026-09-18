<script setup>
import {computed,ref} from 'vue'
import {useRouter} from 'vue-router'
import {Download,View} from '@element-plus/icons-vue'
import DataTableFrame from './DataTableFrame.vue'
import {usePrototypeData} from '../data/usePrototypeData.js'
import {canReadModule} from '../data/accessControl.js'
import {stationPlans} from '../domain/stationPapers.js'
const {state,workbenchSession,airSession}=usePrototypeData(),router=useRouter(),selectedKey=ref('')
const rows=computed(()=>stationPlans(state,workbenchSession.personaId,airSession)),selected=computed(()=>rows.value.find(row=>row.key===selectedKey.value))
</script>
<template>
  <section>
    <div class="plan-toolbar"><el-button v-if="canReadModule('pallet')&&['operator','handler','superAdmin'].includes(workbenchSession.personaId)" @click="router.push('/fulfillment/pallet')">配板管理</el-button><el-tooltip content="待补打板字段、板位组织和Excel模板待确认（175）"><span><el-button :icon="Download" disabled>导出打板计划 Excel</el-button></span></el-tooltip></div>
    <DataTableFrame :rows="rows" :page-size="10"><template #default="{rows:pageRows}"><el-table :data="pageRows" aria-label="已配板航班计划"><el-table-column prop="flight" label="航班号" min-width="130"/><el-table-column prop="date" label="出港日期" min-width="140"/><el-table-column prop="totalPieces" label="已配件数" min-width="130"/><el-table-column prop="totalWeight" label="已配重量（kg）" min-width="150"/><el-table-column prop="totalVolume" label="已配体积（m³）" min-width="150"/><el-table-column label="操作" width="110"><template #default="{row}"><el-button :icon="View" link type="primary" @click="selectedKey=row.key">查看</el-button></template></el-table-column></el-table></template></DataTableFrame>
    <template v-if="selected"><h2>{{selected.flight}} · {{selected.date}} 配板明细</h2><el-table :data="selected.rows" aria-label="打板计划配板明细"><el-table-column prop="orderNo" label="主订单号" min-width="195"/><el-table-column prop="waybillNo" label="提单号" min-width="165"/><el-table-column prop="customer" label="客户" min-width="200"/><el-table-column prop="cargo.pieces" label="件数" width="100"/><el-table-column prop="cargo.grossWeight" label="重量（kg）" min-width="120"/><el-table-column prop="cargo.volume" label="体积（m³）" min-width="130"/><el-table-column label="分批来源" min-width="160"><template #default="{row}">{{row.parentAllocationId||'未分批'}}</template></el-table-column><el-table-column prop="remark" label="备注" min-width="180"/></el-table></template>
  </section>
</template>
<style scoped>.plan-toolbar{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:10px;margin:16px 0}h2{font-size:18px;margin:24px 0 16px;overflow-wrap:anywhere}</style>
