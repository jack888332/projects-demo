<script setup>
import { computed, reactive, ref } from 'vue'
import { DocumentCopy, Plus, Promotion } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import FilterBar from '../components/FilterBar.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { resolveAirTransition } from '../domain/workflows.js'
import { calculateChargeWeight } from '../domain/chargeWeight.js'

const { state, createAirOrder } = usePrototypeData()
const keyword = ref('')
const status = ref('')
const createVisible = ref(false)
const detailVisible = ref(false)
const selected = ref(null)
const formRef = ref(null)
const form = reactive({ customer: '', owner: '周倩', businessType: '空运出口', origin: 'PVG', destination: '', grossWeight: 0, volume: 0, pieces: 1, bookingRequirement: '' })
const rules = {
  customer: [{ required: true, message: '请选择客户', trigger: 'change' }],
  destination: [{ required: true, message: '请输入目的港', trigger: 'blur' }],
  grossWeight: [{ type: 'number', min: 0.1, message: '毛重必须大于 0', trigger: 'change' }],
  pieces: [{ type: 'number', min: 1, message: '件数至少为 1', trigger: 'change' }],
}

const filteredRows = computed(() => state.airOrders.filter((item) => {
  const matchKeyword = !keyword.value || `${item.orderNo}${item.customer}${item.route}${item.owner}`.toLowerCase().includes(keyword.value.toLowerCase())
  const matchStatus = !status.value || item.orderStatus === status.value || item.bookingStatus === status.value
  return matchKeyword && matchStatus
}))
const previewChargeWeight = computed(() => calculateChargeWeight(form.grossWeight, form.volume))
const selectedTransition = computed(() => selected.value ? resolveAirTransition(selected.value) : null)

function resetFilters() { keyword.value = ''; status.value = '' }
function openDetail(row) { selected.value = row; detailVisible.value = true }
function openCreate() { createVisible.value = true }
async function submitCreate() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  const order = createAirOrder({ ...form, route: `${form.origin.toUpperCase()} - ${form.destination.toUpperCase()}` })
  createVisible.value = false
  selected.value = order
  detailVisible.value = true
  ElMessage.success(`订单 ${order.orderNo} 已保存为草稿`)
}
function advanceOrder() {
  const transition = selectedTransition.value
  if (!selected.value || !transition) return
  selected.value.orderStatus = transition.nextOrderStatus
  selected.value.bookingStatus = transition.nextBookingStatus
  ElMessage.success(`${transition.label}完成`)
}
function splitOrder() {
  selected.value.childCount += 1
  ElMessage.success(`已拆分为 ${selected.value.childCount} 个子订单`)
}
function mergeOrder() {
  selected.value.childCount = 1
  ElMessage.success('子订单已合并')
}
</script>

<template>
  <div class="module-view">
    <PageHeader title="空运订单" description="主订单、子订单、订舱要求与补料状态">
      <template #actions><el-button type="primary" :icon="Plus" @click="openCreate">新建订单</el-button></template>
    </PageHeader>

    <FilterBar v-model="keyword" placeholder="订单号、客户、航线或业务员" @reset="resetFilters">
      <el-select v-model="status" clearable placeholder="订单或订舱状态" class="filter-select">
        <el-option v-for="value in ['草稿', '待确认', '待审核', '待补录', '运输中']" :key="value" :label="value" :value="value" />
      </el-select>
    </FilterBar>

    <DataTableFrame :rows="filteredRows" :page-size="10">
      <template #actions><el-button :icon="DocumentCopy" @click="ElMessage.info('当前筛选结果已进入导出队列')">导出</el-button></template>
      <template #default="{ rows }">
        <el-table :data="rows" row-key="id" stripe @row-dblclick="openDetail">
          <el-table-column prop="orderNo" label="订单号" width="178" fixed="left">
            <template #default="{ row }"><button class="link-button" @click="openDetail(row)">{{ row.orderNo }}</button></template>
          </el-table-column>
          <el-table-column prop="customer" label="客户" min-width="150" />
          <el-table-column prop="businessType" label="业务类型" width="108" />
          <el-table-column prop="route" label="航线" width="118" />
          <el-table-column prop="pieces" label="件数" width="72" align="right" />
          <el-table-column prop="grossWeight" label="毛重 kg" width="96" align="right" />
          <el-table-column prop="chargeWeight" label="计费重 kg" width="110" align="right" />
          <el-table-column label="订单状态" width="102"><template #default="{ row }"><StatusTag :label="row.orderStatus" /></template></el-table-column>
          <el-table-column label="订舱状态" width="102"><template #default="{ row }"><StatusTag :label="row.bookingStatus" /></template></el-table-column>
          <el-table-column prop="owner" label="业务员" width="88" />
          <el-table-column label="操作" width="84" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">详情</el-button></template></el-table-column>
        </el-table>
      </template>
    </DataTableFrame>

    <el-dialog v-model="createVisible" title="新建空运订单" width="760" align-center destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="form-grid">
        <el-form-item label="客户" prop="customer"><el-select v-model="form.customer" filterable><el-option v-for="value in ['启航跨境贸易', '云帆供应链', '远洲电子商务', '华越国际商贸']" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="业务员"><el-select v-model="form.owner"><el-option v-for="value in ['周倩', '陈楠', '李明', '王晴']" :key="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="业务类型"><el-segmented v-model="form.businessType" :options="['空运出口', '空运进口']" /></el-form-item>
        <el-form-item label="始发港"><el-input v-model="form.origin" maxlength="3" /></el-form-item>
        <el-form-item label="目的港" prop="destination"><el-input v-model="form.destination" maxlength="3" placeholder="例如 LAX" /></el-form-item>
        <el-form-item label="件数" prop="pieces"><el-input-number v-model="form.pieces" :min="1" controls-position="right" /></el-form-item>
        <el-form-item label="毛重 kg" prop="grossWeight"><el-input-number v-model="form.grossWeight" :min="0" :precision="1" controls-position="right" /></el-form-item>
        <el-form-item label="体积 m³"><el-input-number v-model="form.volume" :min="0" :precision="3" controls-position="right" /></el-form-item>
        <el-form-item label="计费重 kg"><el-input :model-value="previewChargeWeight.toFixed(1)" readonly><template #suffix>自动计算</template></el-input></el-form-item>
        <el-form-item label="订舱要求" class="span-2"><el-input v-model="form.bookingRequirement" type="textarea" :rows="3" maxlength="200" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" @click="submitCreate">保存草稿</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="空运订单详情" size="min(720px, 94vw)">
      <template v-if="selected">
        <div class="detail-hero">
          <div><small>{{ selected.businessType }}</small><h2>{{ selected.orderNo }}</h2><span>{{ selected.customer }} · {{ selected.route }}</span></div>
          <div><StatusTag :label="selected.orderStatus" /><StatusTag :label="selected.bookingStatus" /></div>
        </div>
        <div class="detail-section">
          <h3>货物与订舱</h3>
          <dl class="detail-grid">
            <div><dt>件数</dt><dd>{{ selected.pieces }} 件</dd></div><div><dt>毛重</dt><dd>{{ selected.grossWeight }} kg</dd></div>
            <div><dt>体积</dt><dd>{{ selected.volume }} m³</dd></div><div><dt>计费重</dt><dd>{{ selected.chargeWeight }} kg</dd></div>
            <div><dt>航司与航班</dt><dd>{{ selected.supplier || '待订舱' }} {{ selected.flight }}</dd></div><div><dt>出港日期</dt><dd>{{ selected.departureDate || '待确认' }}</dd></div>
            <div class="span-2"><dt>订舱要求</dt><dd>{{ selected.bookingRequirement || '无补充要求' }}</dd></div>
          </dl>
        </div>
        <div class="detail-section">
          <h3>订单结构</h3>
          <div class="structure-row"><span>当前包含 <strong>{{ selected.childCount }}</strong> 个子订单</span><div><el-button @click="splitOrder">拆分子订单</el-button><el-button :disabled="selected.childCount === 1" @click="mergeOrder">合并子订单</el-button></div></div>
        </div>
        <div class="drawer-actions"><el-button v-if="selectedTransition" type="primary" :icon="Promotion" @click="advanceOrder">{{ selectedTransition.label }}</el-button><span v-else>当前节点暂无待执行动作</span></div>
      </template>
    </el-drawer>
  </div>
</template>
