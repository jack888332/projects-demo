<script setup>
import { computed, ref } from 'vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canReadModule } from '../data/accessControl.js'
import { warehousePermissions } from '../domain/warehouseOrders.js'
import { warehouseMonthly } from '../domain/warehouseViews.js'
const { state,workbenchSession } = usePrototypeData(), month = ref('')
const allowed = computed(() => canReadModule('warehouseOrders') && warehousePermissions(workbenchSession.personaId).report)
const rows = computed(() => allowed.value ? warehouseMonthly(state).filter(row => !month.value || row.month === month.value) : [])
const money = value => Number(value).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})
</script>
<template>
  <section>
    <el-alert v-if="!allowed" title="仅仓库主管可查看仓库月度报表；超级管理员可只读查看。" type="warning" :closable="false" />
    <template v-else><label class="month-query">月份<el-date-picker v-model="month" type="month" value-format="YYYY-MM" aria-label="仓库报表月份" clearable /></label>
      <el-table :data="rows" aria-label="航晟仓库月度报表"><el-table-column prop="month" label="月份" width="120" /><el-table-column label="总入库订单数" min-width="160"><template #default="{row}">{{ row.unresolvedInbound ? '跨月入库归属待确认' : row.inbound }}</template></el-table-column><el-table-column prop="outbound" label="总出库订单数" min-width="150" /><el-table-column label="中转出库订单数" min-width="170"><template #default="{row}">{{ row.transferOutbound === null ? '中转标识待确认' : row.transferOutbound }}</template></el-table-column>
        <el-table-column v-for="[key,label] in [['receivable','总应收'],['payable','总应付'],['profit','预计盈利']]" :key="key" :label="label" min-width="170"><template #default="{row}"><template v-if="canReadModule('costs')"><div v-for="amount in row.amounts" :key="amount.currency">{{ amount.currency }} {{ money(amount[key]) }}</div><span v-if="!row.amounts.length">暂无已确认审批金额</span></template><span v-else>无费用查看权限</span></template></el-table-column>
      </el-table>
    </template>
  </section>
</template>
<style scoped>.month-query { display:flex; gap:12px; align-items:center; margin:10px 0 24px; max-width:100%; } :deep(.el-date-editor) { max-width:100%; }</style>
