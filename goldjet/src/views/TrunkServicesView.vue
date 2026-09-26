<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  TRUNK_AIRLINES, TRUNK_FOAM_RATIOS, TRUNK_SPECIAL_CARGO, TRUNK_SUPPLIERS,
  createTrunkDraft, filterTrunkServices, trunkPermissions, validateTrunkBooking,
} from '../domain/trunkServices.js'

const {
  state, orderSession, bookTrunkService, saveTrunkExecution, completeTrunkService, cancelTrunkService,
} = usePrototypeData()
const permission = computed(() => trunkPermissions(orderSession.value.role))
const tab = ref('委外空运')
const defaults = (mode) => mode === '委外空运'
  ? { waybillNo: '', platformOrderNo: '', serviceNo: '', customer: '', businessType: '' }
  : { waybillNo: '', orderNo: '', serviceNo: '', origin: '', destination: '', foamRatio: '全部', salesperson: '', departureRange: [], createdRange: [], flightNo: '', specialCargo: '全部', airline: '' }
const filters = reactive(defaults('委外空运'))
const applied = ref(defaults('委外空运'))
const rows = computed(() => filterTrunkServices(state.trunkServices, applied.value, tab.value))
function switchTab(value) { tab.value = value; Object.assign(filters, defaults(value)); applied.value = defaults(value); detailVisible.value = false }
function query() { applied.value = JSON.parse(JSON.stringify(filters)) }
function resetQuery() { Object.assign(filters, defaults(tab.value)) }

const editorVisible = ref(false), editingId = ref(''), draft = reactive(createTrunkDraft()), draftErrors = ref({})
function openBooking(service) {
  Object.assign(draft, createTrunkDraft(service.mode), JSON.parse(JSON.stringify(service)), { flights: JSON.parse(JSON.stringify(service.flights?.length ? service.flights : createTrunkDraft(service.mode).flights)) })
  editingId.value = service.id
  draftErrors.value = {}
  editorVisible.value = true
}
function addFlight() { draft.flights.push({ departDate: '', flight: '', takeoffTime: '', arrivalTime: '' }) }
function removeFlight(index) { draft.flights.splice(index, 1) }
function submitBooking(mode) {
  const errors = validateTrunkBooking(draft, { submit: mode === 'book' })
  draftErrors.value = errors
  if (Object.keys(errors).length) { ElMessage.error(Object.values(errors)[0]); return }
  try {
    if (mode === 'book') bookTrunkService(editingId.value, JSON.parse(JSON.stringify(draft)))
    else saveTrunkExecution(editingId.value, JSON.parse(JSON.stringify(draft)))
    editorVisible.value = false
    ElMessage.success(mode === 'book' ? '订舱完成，服务进行中、节点已订舱' : '执行信息已保存')
  } catch (error) { if (error.fields) draftErrors.value = error.fields; ElMessage.error(error.message) }
}
const detailVisible = ref(false), detailId = ref('')
const detail = computed(() => state.trunkServices.find(row => row.id === detailId.value))
function openDetail(service) { detailId.value = service.id; detailVisible.value = true }
function complete(service) {
  try { completeTrunkService(service.id); ElMessage.success('已记录干线到达并完成服务') } catch (error) { ElMessage.error(error.message) }
}
async function cancel(service) {
  try { await ElMessageBox.confirm('原型仅开放待接单取消；取消与终止的计费影响由第036篇完整定义。', '取消干线服务', { confirmButtonText: '取消服务', cancelButtonText: '返回', type: 'warning' }) } catch { return }
  try { cancelTrunkService(service.id); ElMessage.success('干线服务已取消') } catch (error) { ElMessage.error(error.message) }
}
watch(() => [orderSession.value.role, orderSession.value.name], () => { editorVisible.value = false; detailVisible.value = false })
</script>

<template>
  <div class="module-view">
    <PageHeader title="空运干线服务" description="委外空运 · 我司空运 查询、订舱与执行信息" />
    <el-alert class="trunk-notice" title="服务入口、执行状态与中止结果按第036篇共用规则；本页聚焦空运特有列表与订舱字段。提交订舱不等于独立订舱对象审核通过，实际接口未接入。" type="info" :closable="false" />
    <el-tabs :model-value="tab" @update:model-value="switchTab">
      <el-tab-pane label="委外空运" name="委外空运" />
      <el-tab-pane label="我司空运" name="我司空运" />
    </el-tabs>
    <form class="trunk-filters" aria-label="干线服务筛选" @submit.prevent="query">
      <label>总运单号<el-input v-model="filters.waybillNo" clearable /></label>
      <label v-if="tab === '委外空运'">平台订单号<el-input v-model="filters.platformOrderNo" clearable /></label>
      <label v-else>订单号<el-input v-model="filters.orderNo" clearable /></label>
      <label>服务单号<el-input v-model="filters.serviceNo" clearable /></label>
      <label>客户<el-input v-model="filters.customer" clearable /></label>
      <template v-if="tab === '委外空运'">
        <label>业务类型<el-select v-model="filters.businessType" clearable placeholder="全部"><el-option label="出口空运" value="出口空运" /></el-select></label>
      </template>
      <template v-else>
        <label>启运港<el-select v-model="filters.origin" clearable filterable placeholder="全部"><el-option v-for="value in ['PVG', 'CAN', 'SZX', 'LAX', 'SIN']" :key="value" :value="value" /></el-select></label>
        <label>目的港<el-select v-model="filters.destination" clearable filterable placeholder="全部"><el-option v-for="value in ['PVG', 'CAN', 'SZX', 'LAX', 'SIN']" :key="value" :value="value" /></el-select></label>
        <label>分泡比例<el-select v-model="filters.foamRatio" placeholder="全部"><el-option v-for="value in TRUNK_FOAM_RATIOS" :key="value" :value="value" /></el-select></label>
        <label>业务员<el-select v-model="filters.salesperson" clearable placeholder="全部"><el-option v-for="value in ['周倩', '陈楠', '李明', '王晴']" :key="value" :value="value" /></el-select></label>
        <label>出港日期<el-date-picker v-model="filters.departureRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
        <label>建单日期<el-date-picker v-model="filters.createdRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
        <label>航班号<el-input v-model="filters.flightNo" clearable /></label>
        <label>特殊货物<el-select v-model="filters.specialCargo" placeholder="全部"><el-option v-for="value in TRUNK_SPECIAL_CARGO" :key="value" :value="value" /></el-select></label>
        <label>航司<el-select v-model="filters.airline" clearable placeholder="全部"><el-option v-for="value in TRUNK_AIRLINES" :key="value" :value="value" /></el-select></label>
      </template>
      <el-button type="primary" native-type="submit">查询</el-button>
      <el-button @click="resetQuery">重置</el-button>
    </form>
    <DataTableFrame :rows="rows" :page-size="50" :page-sizes="[20, 50]">
      <template #default="{ rows: pageRows }">
        <el-table :data="pageRows" stripe row-key="id" aria-label="空运干线服务列表">
          <el-table-column label="服务单号" width="160" fixed="left"><template #default="{ row }"><button class="link-button" @click="openDetail(row)">{{ row.serviceNo }}</button></template></el-table-column>
          <el-table-column prop="orderNo" label="订单号" width="185" />
          <el-table-column prop="waybillNo" label="总运单号" width="140" />
          <el-table-column v-if="tab === '我司空运'" prop="childNo" label="分单号" width="90" />
          <el-table-column prop="businessType" label="业务类型" width="95" />
          <el-table-column prop="airline" label="航司" width="120" />
          <el-table-column prop="customer" label="客户" min-width="130" />
          <el-table-column prop="supplier" label="供应商" width="110" />
          <el-table-column label="建单时间" width="150"><template #default="{ row }">{{ (row.createdAt || '').slice(0, 16) }}</template></el-table-column>
          <el-table-column label="接单时间" width="150"><template #default="{ row }">{{ (row.acceptedAt || '').slice(0, 16) }}</template></el-table-column>
          <el-table-column label="完成时间" width="150"><template #default="{ row }">{{ (row.completedAt || '').slice(0, 16) }}</template></el-table-column>
          <el-table-column label="状态" width="95"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
          <el-table-column prop="node" label="服务节点" width="100" />
          <el-table-column label="货物" min-width="150"><template #default="{ row }">{{ row.cargo.pieces }} 件 / {{ row.cargo.weight }} kg / {{ row.cargo.volume }} m³</template></el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button v-business-write="'trunkServices'" v-if="row.status === '待接单' && permission.book" link type="primary" @click="openBooking(row)">订舱</el-button>
              <el-button v-business-write="'trunkServices'" v-if="row.status === '进行中' && permission.execute" link type="primary" @click="openBooking(row)">编辑执行信息</el-button>
              <el-button link type="primary" @click="openDetail(row)">查看</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </DataTableFrame>

    <el-dialog v-model="editorVisible" :title="draft.status === '待接单' ? '委外/我司空运订舱' : '编辑执行信息'" width="min(1000px, 96vw)" align-center destroy-on-close>
      <el-alert type="info" :closable="false" title="上游带入的基本、联系人与货物资料只读；总运单号、航司、航班号、实际出港时间必填且可录入，实际出港时间精确到日期。" />
      <h4>基本信息</h4>
      <el-form label-position="top">
      <div class="trunk-grid">
        <el-form-item label="服务单号"><el-input :model-value="draft.serviceNo" readonly /></el-form-item>
        <el-form-item label="客户"><el-input :model-value="draft.customer" readonly /></el-form-item>
        <el-form-item label="业务类型"><el-input :model-value="draft.businessType" readonly /></el-form-item>
        <el-form-item label="货物"><el-input :model-value="`${draft.cargo.pieces} 件 / ${draft.cargo.weight} kg / ${draft.cargo.volume} m³`" readonly /></el-form-item>
      </div>
      <h4>{{ tab === '委外空运' ? '委外订舱信息' : '我司订舱信息' }}</h4>
      <div class="trunk-grid">
        <el-form-item label="供应商" required :error="draftErrors.supplier"><el-select v-model="draft.supplier" filterable><el-option v-for="value in TRUNK_SUPPLIERS" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="总运单号" required :error="draftErrors.waybillNo"><el-input v-model="draft.waybillNo" maxlength="100" /></el-form-item>
        <el-form-item label="航司" required :error="draftErrors.airline"><el-select v-model="draft.airline" filterable><el-option v-for="value in TRUNK_AIRLINES" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="航班号" required :error="draftErrors.flight"><el-input v-model="draft.flight" maxlength="50" /></el-form-item>
        <el-form-item label="实际出港时间" required :error="draftErrors.actualDeparture"><el-date-picker v-model="draft.actualDeparture" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item v-if="tab === '我司空运'" label="启运港"><el-input v-model="draft.origin" /></el-form-item>
        <el-form-item v-if="tab === '我司空运'" label="目的港"><el-input v-model="draft.destination" /></el-form-item>
        <el-form-item label="成本（元/kg）" :error="draftErrors.cost"><el-input v-model="draft.cost" /></el-form-item>
        <el-form-item label="指导价（元/kg）" :error="draftErrors.guidePrice"><el-input v-model="draft.guidePrice" /></el-form-item>
        <el-form-item label="成本分泡" :error="draftErrors.foamRatio"><el-input v-model="draft.foamRatio" placeholder="0 至 1，保留一位小数" /></el-form-item>
        <el-form-item label="内部结算分泡" :error="draftErrors.internalSettlementFoam"><el-input v-model="draft.internalSettlementFoam" /></el-form-item>
        <el-form-item label="打板公司"><el-input v-model="draft.palletCompany" /></el-form-item>
        <el-form-item label="航线备注（≤256字）" :error="draftErrors.routeRemark"><el-input v-model="draft.routeRemark" /></el-form-item>
      </div>
      </el-form>
      <h4>航班明细</h4>
      <el-table :data="draft.flights" size="small" :empty-text="draftErrors.flights || '请添加航班明细'">
        <el-table-column label="航班日期" width="170"><template #default="{ row }"><el-date-picker v-model="row.departDate" value-format="YYYY-MM-DD" /></template></el-table-column>
        <el-table-column label="航班号" width="150"><template #default="{ row }"><el-input v-model="row.flight" /></template></el-table-column>
        <el-table-column label="起飞时间" width="130"><template #default="{ row }"><el-input v-model="row.takeoffTime" placeholder="HH:mm" /></template></el-table-column>
        <el-table-column label="到达时间" width="130"><template #default="{ row }"><el-input v-model="row.arrivalTime" placeholder="HH:mm" /></template></el-table-column>
        <el-table-column label="操作" width="80"><template #default="{ $index }"><el-button link type="danger" :disabled="draft.flights.length <= 1" @click="removeFlight($index)">删除</el-button></template></el-table-column>
      </el-table>
      <el-button size="small" @click="addFlight">添加航班</el-button>
      <template #footer>
        <el-button @click="editorVisible = false">取消</el-button>
        <el-button v-business-write="'trunkServices'" type="primary" @click="submitBooking(draft.status === '待接单' ? 'book' : 'execute')">{{ draft.status === '待接单' ? '提交订舱' : '保存执行信息' }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="空运干线服务详情" size="min(860px, 96vw)">
      <template v-if="detail">
        <div class="detail-hero"><div><small>服务单号</small><h2>{{ detail.serviceNo }}</h2><span>{{ detail.mode }} · {{ detail.customer }}</span></div><StatusTag :label="detail.status" /></div>
        <section class="detail-section"><h3>服务信息</h3><dl class="detail-grid">
          <div v-for="[label, value] in [['订单号', detail.orderNo], ['总运单号', detail.waybillNo], ['平台订单号', detail.platformOrderNo], ['业务类型', detail.businessType], ['供应商', detail.supplier], ['航司', detail.airline], ['航班号', detail.flight], ['实际出港时间', detail.actualDeparture], ['启运港', detail.origin], ['目的港', detail.destination], ['分泡比例', detail.foamRatio], ['业务员', detail.salesperson], ['出港日期', detail.departureDate], ['特殊货物', detail.specialCargo], ['提单属性', detail.waybillAttribute], ['成本/指导价', `${detail.cost || '—'} / ${detail.guidePrice || '—'}`], ['内部结算分泡', detail.internalSettlementFoam], ['航线备注', detail.routeRemark], ['打板公司', detail.palletCompany], ['建单时间', detail.createdAt], ['接单时间', detail.acceptedAt], ['完成时间', detail.completedAt], ['服务节点', detail.node]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
        </dl></section>
        <section class="detail-section"><h3>货物与航班</h3>
          <p class="help">{{ detail.cargo.pieces }} 件 / {{ detail.cargo.weight }} kg / {{ detail.cargo.volume }} m³ {{ detail.cargo.size }} {{ detail.cargo.description }}</p>
          <el-table :data="detail.flights" size="small" empty-text="无航班明细"><el-table-column prop="departDate" label="航班日期" width="120" /><el-table-column prop="flight" label="航班号" width="110" /><el-table-column prop="takeoffTime" label="起飞时间" width="110" /><el-table-column prop="arrivalTime" label="到达时间" width="110" /></el-table>
        </section>
        <section class="detail-section"><h3>操作历史</h3><el-table :data="detail.history || []" size="small" empty-text="暂无记录"><el-table-column prop="event" label="操作" width="110" /><el-table-column prop="content" label="内容" min-width="240" /><el-table-column prop="actor" label="操作人" width="110" /><el-table-column prop="time" label="时间" width="150" /></el-table>
        </section>
      </template>
      <template #footer>
        <el-button v-if="detail?.status === '待接单'" v-business-write="'trunkServices'" :disabled="!permission.book" @click="openBooking(detail)">订舱</el-button>
        <el-button v-if="detail?.status === '进行中'" v-business-write="'trunkServices'" @click="openBooking(detail)">编辑执行信息</el-button>
        <el-button v-if="detail?.status === '进行中'" v-business-write="'trunkServices'" type="primary" @click="complete(detail)">干线到达并完成</el-button>
        <el-button v-if="detail?.status === '待接单'" v-business-write="'trunkServices'" type="danger" @click="cancel(detail)">取消服务</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.trunk-notice { margin-bottom: 14px; }
.trunk-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 16px; }
.trunk-filters label { display: flex; flex-direction: column; gap: 8px; width: 180px; color: var(--muted); }
.trunk-filters :deep(.el-date-editor) { width: 100%; }
.trunk-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 16px; }
.trunk-grid :deep(.el-input), .trunk-grid :deep(.el-select), .trunk-grid :deep(.el-date-editor) { width: 100%; }
h4 { margin: 14px 0 8px; }
.detail-hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.detail-hero h2 { margin: 4px 0; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 8px 18px; margin: 0; }
.detail-grid dt { color: var(--muted); font-size: 12px; }
.detail-grid dd { margin: 2px 0 10px; }
.help { font-size: 12px; color: var(--muted); line-height: 1.7; }
@media (max-width: 700px) { .trunk-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
