<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { AIR_PICKUP_REGIONS } from '../domain/airOperations.js'
import {
  INTEGRATED_BUSINESS_TYPES, INTEGRATED_DEPARTMENTS, INTEGRATED_MODES, INTEGRATED_ORG,
  INTEGRATED_SERVICE_TYPES, INTEGRATED_TRANSPORT_MODES, INTEGRATED_PORTS, INTEGRATED_AIRLINES,
  INTEGRATED_WAREHOUSES, INTEGRATED_STATIONS, INTEGRATED_PRECLEARANCE_SUPPLIERS, INTEGRATED_INTERNAL_SUPPLIERS,
  cargoColumns, createCargoRow, createHouseDraft, createIntegratedOrderDraft, createServiceRecord,
  defaultSupplier, deriveServiceSummary, isPerHouseCategory, servicePlan, validateIntegratedOrderDraft,
} from '../domain/integratedOrders.js'

const emit = defineEmits(['saved'])
const { state, orderSession, saveIntegratedOrder, submitIntegratedOrder } = usePrototypeData()
const visible = ref(false), editingId = ref(''), draft = ref(createIntegratedOrderDraft()), initial = ref(''), busy = ref(false)
const checked = reactive({})
const errors = computed(() => validateIntegratedOrderDraft(draft.value, { submit: false }))
const plan = computed(() => servicePlan(draft.value))
const houses = computed(() => draft.value.houses)
const customers = computed(() => state.partners.filter(partner => partner.type === '客户' && partner.status !== '失效'))
const columns = computed(() => cargoColumns(draft.value))
const canEdit = computed(() => orderSession.value.role !== 'viewer' && orderSession.value.role !== 'superAdmin')

function keyOf(category, item) { return `${category}:${item}` }
function recordsOf(category, item) { return draft.value.services.filter(record => record.category === category && record.item === item) }
function itemLabel(category, item) {
  const group = plan.value.find(row => row.key === category)
  return group?.items.find(row => row.key === item)?.label || item
}
function syncChecked() {
  for (const group of plan.value) for (const item of group.items) checked[keyOf(group.key, item.key)] = recordsOf(group.key, item.key).length > 0
}
function open(order) {
  editingId.value = order?.id || ''
  draft.value = createIntegratedOrderDraft(order || undefined)
  if (!order) {
    draft.value.serviceClerk = orderSession.value.name
    draft.value.salesperson = orderSession.value.name
    draft.value.customerPartnerId = ''
  }
  // 订单来源把未保存的分单键固定下来，避免每次打开重新生成。
  draft.value.houses.forEach((house, index) => { house.key ||= `HOUSE-${index + 1}-${Date.now()}` })
  for (const group of plan.value) for (const item of group.items) checked[keyOf(group.key, item.key)] = recordsOf(group.key, item.key).length > 0
  initial.value = JSON.stringify(draft.value); visible.value = true
}
function toggleItem(category, item, value) {
  checked[keyOf(category, item)] = value
  if (value) addService(category, item, true)
  else draft.value.services = draft.value.services.filter(record => !(record.category === category && record.item === item))
}
function addService(category, item, silent = false) {
  const action = plan.value.find(group => group.key === category)?.items.find(row => row.key === item) || { key: item }
  const record = createServiceRecord(category, item, isPerHouseCategory(category) ? (houses.value[0]?.key || '') : '')
  record.department = action.department || ''
  record.supplier = defaultSupplier(category, item)
  record.id = `${category}-${item}-${Date.now()}-${draft.value.services.length}`
  if (category === 'customs') record.fields.customsType = '代理报关'
  draft.value.services.push(record)
  if (!silent) checked[keyOf(category, item)] = true
}
function removeService(record) {
  const same = recordsOf(record.category, record.item)
  if (same.length <= 1) { ElMessage.warning('该服务项至少保留一条记录；不需要该服务时取消勾选服务项。'); return }
  draft.value.services.splice(draft.value.services.indexOf(record), 1)
}
function addHouse() {
  const house = createHouseDraft()
  house.key = `HOUSE-${draft.value.houses.length + 1}-${Date.now()}`
  draft.value.houses.push(house)
}
async function removeHouse(index) {
  const house = draft.value.houses[index]
  try {
    await ElMessageBox.confirm('删除分单将同时删除该分单下的货物与服务配置。', '删除分单', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  draft.value.houses.splice(index, 1)
  draft.value.services = draft.value.services.filter(record => record.houseKey !== house.key)
  if (!draft.value.houses.length) addHouse()
}
function addCargo(house) { house.cargo.push(createCargoRow(draft.value.businessType, draft.value.businessMode)) }
function removeCargo(house, index) { house.cargo.splice(index, 1) }
function chooseCustomer(id) {
  const partner = customers.value.find(row => row.id === id)
  draft.value.customerPartnerId = id
  draft.value.customer = partner?.name || ''
  draft.value.contactName = partner?.contact || draft.value.contactName
  draft.value.contactPhone = partner?.phone || draft.value.contactPhone
  draft.value.contactEmail = draft.value.contactEmail || ''
}
function changeRegion(record, value) {
  record.fields.pickupProvince = value?.[0] || ''
  record.fields.pickupCity = value?.[1] || ''
}
function changeDeliveryRegion(record, value) {
  record.fields.deliveryProvince = value?.[0] || ''
  record.fields.deliveryCity = value?.[1] || ''
}
async function attachFile(event) {
  const files = [...(event.target.files || [])]
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) { ElMessage.error('单个附件不能超过 20M'); continue }
    const dataUrl = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.readAsDataURL(file) })
    draft.value.attachments.push({ id: `ATT-DRAFT-${Date.now()}-${draft.value.attachments.length}`, type: '服务资料', name: file.name, size: file.size, uploader: orderSession.value.name, uploadedAt: '待保存', visibility: [], dataUrl })
  }
  event.target.value = ''
}
function removeAttachment(attachment) { draft.value.attachments = draft.value.attachments.filter(row => row.id !== attachment.id) }
function downloadAttachment(attachment) {
  if (!attachment.dataUrl) { ElMessage.warning('该演示附件没有可下载的原文件'); return }
  const link = document.createElement('a')
  link.href = attachment.dataUrl; link.download = attachment.name; link.click()
}
async function allowDiscard() {
  if (!visible.value || initial.value === JSON.stringify(draft.value)) return true
  try { await ElMessageBox.confirm('订单信息尚未保存，确认放弃？', '放弃修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true } catch { return false }
}
async function close(done) { if (busy.value || !await allowDiscard()) return; visible.value = false; if (typeof done === 'function') done() }
async function submit(mode) {
  if (busy.value) return
  if (mode === 'submit') {
    const submitErrors = validateIntegratedOrderDraft(draft.value, { submit: true })
    if (Object.keys(submitErrors).length) { ElMessage.error(Object.values(submitErrors)[0]); return }
  }
  busy.value = true
  try {
    const order = saveIntegratedOrder(JSON.parse(JSON.stringify(draft.value)), editingId.value)
    if (mode === 'submit') submitIntegratedOrder(order.id)
    visible.value = false
    ElMessage.success(mode === 'submit' ? '订单已提交！' : editingId.value ? '已保存成功！' : '已保存为未提交订单')
    emit('saved', order)
  } catch (error) { ElMessage.error(error.message) } finally { busy.value = false }
}
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(async () => { if (!await allowDiscard()) return false; visible.value = false; return true })
watch(() => [orderSession.value.role, orderSession.value.name], () => { visible.value = false }, { flush: 'sync' })
watch(() => draft.value.businessType, type => {
  if (!(INTEGRATED_MODES[type] || []).includes(draft.value.businessMode)) draft.value.businessMode = INTEGRATED_MODES[type]?.[0] || ''
  draft.value.houses.forEach(house => { house.cargo = house.cargo.map(() => createCargoRow(type, draft.value.businessMode)) })
  draft.value.services = draft.value.services.filter(record => {
    const group = servicePlan(draft.value).find(row => row.key === record.category)
    return group?.items.some(item => item.key === record.item)
  })
  syncChecked()
})
watch(() => draft.value.businessMode, () => { syncChecked() })
defineExpose({ open, allowDiscard })
</script>

<template>
  <el-dialog v-model="visible" :title="editingId ? '编辑综合订单' : '新建综合订单'" width="min(1180px, 96vw)" align-center destroy-on-close :close-on-click-modal="false" :before-close="close">
    <el-alert v-if="!canEdit" title="当前角色只读，请从顶部切换为空运客服、客服主管或业务员。" type="warning" :closable="false" />
    <el-form label-position="top" @submit.prevent>
      <fieldset :disabled="!canEdit" class="order-fields">
        <h3>基本信息</h3>
        <div class="order-grid">
          <el-form-item label="业务类型" required :error="errors.businessType"><el-select v-model="draft.businessType" aria-label="业务类型"><el-option v-for="value in INTEGRATED_BUSINESS_TYPES" :key="value" :value="value" /></el-select></el-form-item>
          <el-form-item label="业务模式" required :error="errors.businessMode"><el-select v-model="draft.businessMode" aria-label="业务模式"><el-option v-for="value in INTEGRATED_MODES[draft.businessType] || []" :key="value" :value="value" /></el-select></el-form-item>
          <el-form-item label="财务组织" required :error="errors.financeOrg"><el-select v-model="draft.financeOrg" aria-label="财务组织"><el-option v-for="value in INTEGRATED_ORG" :key="value" :value="value" /></el-select></el-form-item>
          <el-form-item label="所属部门" required :error="errors.department"><el-select v-model="draft.department" aria-label="所属部门"><el-option v-for="value in INTEGRATED_DEPARTMENTS" :key="value" :value="value" /></el-select></el-form-item>
          <el-form-item label="客服（当前账号）"><el-input :model-value="draft.serviceClerk" readonly aria-label="客服" /></el-form-item>
          <el-form-item label="业务员" required :error="errors.salesperson"><el-input v-model="draft.salesperson" maxlength="50" aria-label="业务员" /></el-form-item>
          <el-form-item label="是否流转" :error="errors.transfer"><el-switch v-model="draft.transfer" />
            <template v-if="draft.transfer"><el-select v-model="draft.transferOrg" placeholder="流转组织" class="inline-select" aria-label="流转组织"><el-option v-for="value in INTEGRATED_ORG" :key="value" :value="value" /></el-select>
              <el-select v-model="draft.transferDepartment" placeholder="流转部门" class="inline-select" aria-label="流转部门"><el-option v-for="value in INTEGRATED_DEPARTMENTS" :key="value" :value="value" /></el-select></template>
          </el-form-item>
          <el-form-item v-if="draft.transfer" label="原业务员"><el-input v-model="draft.originalSalesperson" maxlength="50" aria-label="原业务员" /></el-form-item>
        </div>
        <el-form-item label="备注"><el-input v-model="draft.remark" type="textarea" maxlength="500" show-word-limit aria-label="订单备注" /></el-form-item>
        <h3>客户信息</h3>
        <div class="order-grid">
          <el-form-item label="客户名称" required :error="errors.customer"><el-select :model-value="draft.customerPartnerId" filterable aria-label="客户名称" @change="chooseCustomer"><el-option v-for="partner in customers" :key="partner.id" :label="partner.name" :value="partner.id" /></el-select></el-form-item>
          <el-form-item label="联系人姓名" required :error="errors.contactName"><el-input v-model="draft.contactName" maxlength="50" /></el-form-item>
          <el-form-item label="联系人电话" required :error="errors.contactPhone"><el-input v-model="draft.contactPhone" maxlength="20" /></el-form-item>
          <el-form-item label="联系人邮箱" required :error="errors.contactEmail"><el-input v-model="draft.contactEmail" maxlength="50" /></el-form-item>
        </div>
        <el-form-item label="客户备注" :error="errors.customerRemark"><el-input v-model="draft.customerRemark" type="textarea" maxlength="500" show-word-limit /></el-form-item>
        <h3>总运单信息</h3>
        <div class="order-grid">
          <el-form-item label="运输方式"><el-select v-model="draft.transportMode" clearable aria-label="运输方式"><el-option v-for="value in INTEGRATED_TRANSPORT_MODES" :key="value" :value="value" /></el-select></el-form-item>
          <el-form-item label="始发港" :error="errors.originPort"><el-select v-model="draft.originPort" filterable clearable><el-option v-for="value in INTEGRATED_PORTS" :key="value" :value="value" /></el-select></el-form-item>
          <el-form-item label="目的港" :error="errors.destinationPort"><el-select v-model="draft.destinationPort" filterable clearable><el-option v-for="value in INTEGRATED_PORTS" :key="value" :value="value" /></el-select></el-form-item>
          <el-form-item label="总运单号"><el-input v-model="draft.waybillNo" maxlength="100" aria-label="总运单号" /></el-form-item>
        </div>
        <el-alert type="info" :closable="false" title="总运单号为空时可在订单详情发起总运单信息补录；补录后的号码会回写本订单。" />
        <h3>客户分单与货物明细</h3>
        <div class="house-tabs">
          <el-button v-for="(house, index) in houses" :key="house.key" size="small" @click="house._open = !house._open">{{ house.houseNo || (index === 0 ? '主单（未填分单号）' : `分单 ${index + 1}`) }}</el-button>
          <el-button v-if="canEdit" size="small" :icon="Plus" @click="addHouse">添加分单</el-button>
        </div>
        <section v-for="(house, index) in houses" :key="house.key" class="house-section">
          <div class="section-heading"><h4>分单 {{ index + 1 }}</h4><el-button v-if="canEdit && houses.length > 1" link type="danger" @click="removeHouse(index)">删除分单</el-button></div>
          <el-form-item label="客户分单号"><el-input v-model="house.houseNo" maxlength="50" placeholder="可录入客户提供号码；为空时提交按合成编号生成" aria-label="客户分单号" /></el-form-item>
          <el-table :data="house.cargo" size="small" :empty-text="'暂无货物，请添加'">
            <el-table-column type="index" label="序号" width="60" />
            <el-table-column v-for="[key, label] in columns" :key="key" :label="label" :min-width="120"><template #default="{ row }"><el-input v-model="row[key]" :aria-label="label" /></template></el-table-column>
            <el-table-column v-if="canEdit" label="操作" width="80" fixed="right"><template #default="{ $index }"><el-button link type="danger" @click="removeCargo(house, $index)">删除</el-button></template></el-table-column>
          </el-table>
          <el-button v-if="canEdit" size="small" :icon="Plus" @click="addCargo(house)">添加货物</el-button>
        </section>
        <h3>服务配置</h3>
        <p class="help">勾选服务项后自动保留一条服务记录；同服务项可添加多条记录，记录按分单分别生成。</p>
        <section v-for="group in plan" :key="group.key" class="service-group">
          <h4>{{ group.label }}</h4>
          <div v-for="item in group.items" :key="item.key" class="service-item">
            <el-checkbox :model-value="checked[keyOf(group.key, item.key)]" :disabled="!canEdit" @change="value => toggleItem(group.key, item.key, value)">{{ item.label }}</el-checkbox>
            <template v-if="checked[keyOf(group.key, item.key)]">
              <el-table :data="recordsOf(group.key, item.key)" size="small">
                <el-table-column v-if="isPerHouseCategory(group.key)" label="分单" width="150"><template #default="{ row }"><el-select v-model="row.houseKey" size="small" aria-label="服务分单"><el-option v-for="(house, index) in houses" :key="house.key" :label="house.houseNo || (index === 0 ? '主单' : `分单${index + 1}`)" :value="house.key" /></el-select></template></el-table-column>
                <el-table-column label="服务类型" width="130"><template #default="{ row }"><el-select v-model="row.serviceType" size="small" aria-label="服务类型"><el-option v-for="value in INTEGRATED_SERVICE_TYPES" :key="value" :value="value" /></el-select></template></el-table-column>
                <el-table-column label="供应商" width="170"><template #default="{ row }"><el-select v-model="row.supplier" size="small" filterable clearable aria-label="供应商"><el-option v-for="value in [...INTEGRATED_INTERNAL_SUPPLIERS, ...INTEGRATED_PRECLEARANCE_SUPPLIERS]" :key="value" :value="value" /></el-select></template></el-table-column>
                <el-table-column label="部门" width="150"><template #default="{ row }"><el-select v-model="row.department" size="small" aria-label="部门"><el-option v-for="value in INTEGRATED_DEPARTMENTS" :key="value" :value="value" /></el-select></template></el-table-column>
                <el-table-column v-if="group.key === 'trunk' && item.key === 'booking' && draft.transportMode !== '海运'" label="航司代码" width="160"><template #default="{ row }"><el-select v-model="row.fields.airlineCode" size="small" clearable aria-label="航司代码"><el-option v-for="value in INTEGRATED_AIRLINES" :key="value" :value="value" /></el-select></template></el-table-column>
                <el-table-column v-if="group.key === 'trunk' && item.key === 'booking'" label="预计进港日期" width="170"><template #default="{ row }"><el-date-picker v-model="row.fields.expectedArrivalDate" size="small" value-format="YYYY-MM-DD" aria-label="预计进港日期" /></template></el-table-column>
                <template v-if="group.key === 'warehouse'">
                  <el-table-column label="选择仓库" width="190"><template #default="{ row }"><el-select v-model="row.fields.warehouseName" size="small" aria-label="选择仓库"><el-option v-for="value in INTEGRATED_WAREHOUSES" :key="value" :value="value" /></el-select></template></el-table-column>
                  <el-table-column label="预计入仓时间" width="180"><template #default="{ row }"><el-date-picker v-model="row.fields.expectedInboundTime" size="small" type="datetime" value-format="YYYY-MM-DD HH:mm" aria-label="预计入仓时间" /></template></el-table-column>
                </template>
                <template v-if="group.key === 'customs'">
                  <el-table-column label="报关类型" width="130"><template #default="{ row }"><el-select v-model="row.fields.customsType" size="small" aria-label="报关类型"><el-option v-for="value in ['代理报关', '自理报关']" :key="value" :value="value" /></el-select></template></el-table-column>
                  <el-table-column label="是否转关/转仓" width="140"><template #default="{ row }"><el-switch v-model="row.fields.transfer" /></template></el-table-column>
                </template>
                <template v-if="group.key === 'customs' && /调拨/.test(draft.businessMode)">
                  <el-table-column label="出区仓库" width="150"><template #default="{ row }"><el-input v-model="row.fields.outWarehouse" size="small" /></template></el-table-column>
                  <el-table-column label="转出账册" width="150"><template #default="{ row }"><el-input v-model="row.fields.outLedger" size="small" /></template></el-table-column>
                  <el-table-column label="进区仓库" width="150"><template #default="{ row }"><el-input v-model="row.fields.inWarehouse" size="small" /></template></el-table-column>
                  <el-table-column label="转入账册" width="150"><template #default="{ row }"><el-input v-model="row.fields.inLedger" size="small" /></template></el-table-column>
                </template>
                <template v-if="group.key === 'transport'">
                  <el-table-column label="提货省市区" width="200"><template #default="{ row }"><el-cascader :model-value="[row.fields.pickupProvince, row.fields.pickupCity].filter(Boolean)" :options="AIR_PICKUP_REGIONS" size="small" filterable clearable @update:model-value="value => changeRegion(row, value)" /></template></el-table-column>
                  <el-table-column label="提货详细地址" width="180"><template #default="{ row }"><el-input v-model="row.fields.pickupAddress" size="small" /></template></el-table-column>
                  <el-table-column label="提货时间" width="175"><template #default="{ row }"><el-date-picker v-model="row.fields.pickupTime" size="small" type="datetime" value-format="YYYY-MM-DD HH:mm" /></template></el-table-column>
                  <el-table-column label="提货联系人" width="130"><template #default="{ row }"><el-input v-model="row.fields.pickupContact" size="small" /></template></el-table-column>
                  <el-table-column label="提货电话" width="140"><template #default="{ row }"><el-input v-model="row.fields.pickupPhone" size="small" /></template></el-table-column>
                  <el-table-column label="送货省市区" width="200"><template #default="{ row }"><el-cascader :model-value="[row.fields.deliveryProvince, row.fields.deliveryCity].filter(Boolean)" :options="AIR_PICKUP_REGIONS" size="small" filterable clearable @update:model-value="value => changeDeliveryRegion(row, value)" /></template></el-table-column>
                  <el-table-column label="送货详细地址" width="180"><template #default="{ row }"><el-input v-model="row.fields.deliveryAddress" size="small" /></template></el-table-column>
                  <el-table-column label="送货时间" width="175"><template #default="{ row }"><el-date-picker v-model="row.fields.deliveryTime" size="small" type="datetime" value-format="YYYY-MM-DD HH:mm" /></template></el-table-column>
                  <el-table-column label="送货联系人" width="130"><template #default="{ row }"><el-input v-model="row.fields.deliveryContact" size="small" /></template></el-table-column>
                  <el-table-column label="送货电话" width="140"><template #default="{ row }"><el-input v-model="row.fields.deliveryPhone" size="small" /></template></el-table-column>
                </template>
                <el-table-column v-if="group.key === 'ground' && item.key === 'preclearance'" label="预配供应商" width="200"><template #default="{ row }"><el-select v-model="row.fields.supplier" size="small" aria-label="预配供应商"><el-option v-for="value in INTEGRATED_PRECLEARANCE_SUPPLIERS" :key="value" :value="value" /></el-select></template></el-table-column>
                <el-table-column v-if="group.key === 'ground' && item.key === 'securityCheck'" label="货站" width="170"><template #default="{ row }"><el-select v-model="row.fields.station" size="small" aria-label="货站"><el-option v-for="value in INTEGRATED_STATIONS" :key="value" :value="value" /></el-select></template></el-table-column>
                <el-table-column v-if="group.key === 'valueAdded' && item.key === 'otherValue'" label="服务内容" width="160"><template #default="{ row }"><el-input v-model="row.fields.goodsName" size="small" /></template></el-table-column>
                <el-table-column label="备注" min-width="150"><template #default="{ row }"><el-input v-model="row.remark" size="small" maxlength="256" /></template></el-table-column>
                <el-table-column v-if="canEdit" label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="danger" @click="removeService(row)">删除</el-button></template></el-table-column>
              </el-table>
              <el-button v-if="canEdit" size="small" :icon="Plus" @click="addService(group.key, item.key)">添加记录</el-button>
            </template>
          </div>
        </section>
        <h3>附件</h3>
        <el-table :data="draft.attachments" size="small" empty-text="暂无附件">
          <el-table-column prop="type" label="附件类型" width="130" />
          <el-table-column label="名称" min-width="220"><template #default="{ row }"><el-button link type="primary" @click="downloadAttachment(row)">{{ row.name }}</el-button></template></el-table-column>
          <el-table-column prop="size" label="大小（字节）" width="120" />
          <el-table-column prop="uploader" label="上传人" width="110" />
          <el-table-column prop="uploadedAt" label="上传时间" width="170" />
          <el-table-column label="服务类目可见性" min-width="260"><template #default="{ row }"><el-select v-model="row.visibility" multiple size="small" placeholder="不向服务类型公开"><el-option v-for="group in plan" :key="group.key" :label="group.label" :value="group.key" /></el-select></template></el-table-column>
          <el-table-column v-if="canEdit" label="操作" width="90"><template #default="{ row }"><el-button link type="danger" @click="removeAttachment(row)">删除</el-button></template></el-table-column>
        </el-table>
        <label v-if="canEdit" class="upload-line">上传附件（单个≤20M）<input type="file" multiple @change="attachFile" /></label>
      </fieldset>
    </el-form>
    <template #footer>
      <el-button :disabled="busy" @click="close">取消</el-button>
      <el-button v-business-write="'integratedOrders'" :disabled="busy || !canEdit" @click="submit('save')">保存</el-button>
      <el-button v-business-write="'integratedOrders'" type="primary" :disabled="busy || !canEdit" @click="submit('submit')">提交订单</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.order-fields { border:0; padding:0; margin:0; min-width:0; }
h3 { font-size:16px; margin:20px 0 14px; } h4 { font-size:14px; margin:12px 0 8px; }
.order-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0 16px; }
.help { font-size:12px; color:var(--muted); line-height:1.7; }
.section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.house-tabs { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
.house-section { border:1px solid var(--border); border-radius:6px; padding:12px 14px; margin-bottom:14px; background:#fafbfd; }
.service-group { border-top:1px dashed var(--border); padding-top:8px; }
.service-item { margin-bottom:12px; }
.service-item .el-table { margin:8px 0; }
.inline-select { width:150px; margin-left:8px; }
.upload-line { display:block; margin:10px 0; color:var(--muted); font-size:13px; }
.upload-line input { margin-left:12px; }
:deep(.el-select), :deep(.el-cascader), :deep(.el-date-editor) { width:100%; }
@media (max-width:700px) { .order-grid { grid-template-columns:minmax(0,1fr); } }
</style>
