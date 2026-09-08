<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, View } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import FilterBar from '../components/FilterBar.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { moduleCatalog } from '../domain/catalog.js'
import { usePrototypeData } from '../data/usePrototypeData.js'

const route = useRoute()
const { ensureGenericRows, addGenericRow } = usePrototypeData()
const moduleKey = computed(() => route.meta.moduleKey)
const module = computed(() => moduleCatalog[moduleKey.value])
const sourceRows = computed(() => ensureGenericRows(moduleKey.value, module.value.label))
const keyword = ref('')
const status = ref('')
const createVisible = ref(false)
const detailVisible = ref(false)
const selected = ref(null)
const form = reactive({ subject: '', customer: '', owner: '周倩' })
const descriptions = {
  airCapacity: '舱位产品维护与实时舱位查询', airSupplierRates: '空运供应商价格的查询与维护', booking: '订舱业务单据的接单、提交与审核', pallet: '货物配板与板位结果', airwayBills: '主单、分单及提单发送', declarations: '报关单信息与申报结果', tracking: '运输节点与在途轨迹', clearance: '清关、派送与异常处理',
  groundWaybills: '运输运单、轨迹、单据和异常', fleet: '车队、车辆与司机资源', driver: '司机接单和运输节点任务', groundService: '地面服务小程序任务', stationPallet: '货站与打板订单作业', reconciliation: '应收应付对账单与审批', paymentRequests: '收款、付款申请和审批', writeoffs: '收付款核销与打回', reimbursements: '费用报销申请与审批', invoices: '销项发票申请、补录和查询', financeWorkspace: '财务与结算待办的统一入口', customerQuotes: '客户收费与供应商报价', warehouseQuotes: '仓库服务报价', airMasterData: '机场、航司、航班与费用基础资料', messages: '业务消息模板和推送记录', reports: '一期业务报表查询', bigscreen: '运营大屏指标', ddpFlows: 'DDP 十二段业务流程导航',
}
const rows = computed(() => sourceRows.value.filter((item) => (!keyword.value || `${item.businessNo}${item.subject}${item.customer}`.toLowerCase().includes(keyword.value.toLowerCase())) && (!status.value || item.status === status.value)))
watch(moduleKey, () => { keyword.value = ''; status.value = ''; selected.value = null; detailVisible.value = false })
function openDetail(row) { selected.value = row; detailVisible.value = true }
function submit() { if (!form.subject || !form.customer) return ElMessage.error('请填写业务主题和客户'); const row = addGenericRow(moduleKey.value, module.value.label, { ...form }); createVisible.value = false; openDetail(row); ElMessage.success(`${module.value.label}记录已创建`) }
</script>

<template><div class="module-view">
  <PageHeader :title="module.label" :description="descriptions[moduleKey] || `${module.label}业务记录`"><template #actions><el-button type="primary" :icon="Plus" @click="createVisible = true">新建记录</el-button></template></PageHeader>
  <FilterBar v-model="keyword" placeholder="业务编号、主题或客户" @reset="keyword = ''; status = ''"><el-select v-model="status" clearable placeholder="处理状态" class="filter-select"><el-option v-for="value in ['待处理', '处理中', '待确认', '已完成']" :key="value" :value="value" /></el-select></FilterBar>
  <DataTableFrame :rows="rows" :page-size="10"><template #default="{ rows: pageRows }"><el-table :data="pageRows" row-key="id" stripe>
    <el-table-column prop="businessNo" label="业务编号" width="160" fixed="left" /><el-table-column prop="subject" label="业务主题" min-width="190" /><el-table-column prop="customer" label="客户或合作方" min-width="155" /><el-table-column prop="owner" label="负责人" width="90" />
    <el-table-column label="状态" width="95"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column><el-table-column prop="updatedAt" label="更新时间" width="145" />
    <el-table-column label="操作" width="88" fixed="right"><template #default="{ row }"><el-button link type="primary" :icon="View" @click="openDetail(row)">查看</el-button></template></el-table-column>
  </el-table></template></DataTableFrame>
  <el-dialog v-model="createVisible" :title="`新建${module.label}记录`" width="580" align-center><el-form :model="form" label-position="top"><el-form-item label="业务主题"><el-input v-model="form.subject" /></el-form-item><el-form-item label="客户或合作方"><el-input v-model="form.customer" /></el-form-item><el-form-item label="负责人"><el-select v-model="form.owner"><el-option v-for="value in ['周倩','陈楠','李明','王晴']" :key="value" :value="value" /></el-select></el-form-item></el-form><template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" @click="submit">保存</el-button></template></el-dialog>
  <el-drawer v-model="detailVisible" :title="`${module.label}详情`" size="min(620px, 94vw)"><template v-if="selected"><div class="detail-hero"><div><small>{{ module.label }}</small><h2>{{ selected.businessNo }}</h2><span>{{ selected.subject }}</span></div><StatusTag :label="selected.status" /></div><dl class="detail-grid detail-section"><div><dt>客户或合作方</dt><dd>{{ selected.customer }}</dd></div><div><dt>负责人</dt><dd>{{ selected.owner }}</dd></div><div><dt>更新时间</dt><dd>{{ selected.updatedAt }}</dd></div><div><dt>处理状态</dt><dd>{{ selected.status }}</dd></div></dl><div class="drawer-actions"><el-button type="primary" @click="selected.status = '已完成'; ElMessage.success('记录已完成')">标记完成</el-button></div></template></el-drawer>
</div></template>
