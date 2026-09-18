<script setup>
import { computed, ref } from 'vue'
import { Download } from '@element-plus/icons-vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canReadModule } from '../data/accessControl.js'
import { warehouseReturns, warehouseReturnExport, warehouseCsv } from '../domain/warehouseViews.js'
const { state } = usePrototypeData(), selected = ref([])
const rows = computed(() => canReadModule('warehouseOrders') ? warehouseReturns(state) : [])
const packages = computed(() => [...new Map(selected.value.flatMap(row => row.children || [row]).map(row => [row.id,row])).values()])
function download() {
  if (!canReadModule('warehouseOrders') || !packages.value.length || !state.warehouseReturnAddress) return
  const data = warehouseReturnExport(packages.value,state.warehouseReturnAddress)
  const url = URL.createObjectURL(new Blob([warehouseCsv(data.columns,data.rows)],{type:'text/csv;charset=utf-8'}))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = '退签单.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000)
}
</script>
<template>
  <section>
    <div class="return-toolbar"><span>已选 {{ packages.length }} 个包裹</span><el-button v-if="packages.length" :icon="Download" :disabled="!state.warehouseReturnAddress" @click="download">退签单导出</el-button></div>
    <el-table :data="rows" row-key="id" default-expand-all :tree-props="{children:'children',checkStrictly:false}" aria-label="仓库退货列表" @selection-change="selected = $event">
      <el-table-column type="selection" width="45" />
      <el-table-column label="提单号 / 包裹条码" min-width="230"><template #default="{row}">{{ row.children ? row.number : row.code }}</template></el-table-column>
      <el-table-column v-for="[key,label,width] in [['customer','客户名称',170],['returnedAt','最后退货时间',170],['actor','最新扫描人员',190],['collectorName','提货人姓名',125],['collectorPhone','提货人联系方式',170],['collectorPlate','提货人车牌号',150],['total','条码数量',100],['inCount','退货入库数',110],['outCount','退货出库数',110],['inboundAt','入库时间',170],['outboundAt','出库时间',170]]" :key="key" :prop="key" :label="label" :min-width="width" />
    </el-table>
  </section>
</template>
<style scoped>.return-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:12px 0 20px; }</style>
