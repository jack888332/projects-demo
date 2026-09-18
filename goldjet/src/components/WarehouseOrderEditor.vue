<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { canWriteModule, accessState } from '../data/accessControl.js'
import { WAREHOUSE_FIELDS, WAREHOUSE_BUSINESS_TYPES, warehouseDraft, warehouseErrors, warehouseCustomers, warehousePermissions } from '../domain/warehouseOrders.js'
const emit = defineEmits(['saved'])
const { state, workbenchSession, saveWarehouseOrder } = usePrototypeData()
const visible = ref(false), draft = ref(warehouseDraft()), editingId = ref(''), initial = ref(''), busy = ref(false)
const existing = computed(() => state.warehouseOrders.find(row => row.id === editingId.value))
const customers = computed(() => warehouseCustomers(state, workbenchSession.personaId))
const allowed = computed(() => canWriteModule('warehouseOrders') && (editingId.value || canWriteModule('airOrders')) && warehousePermissions(workbenchSession.personaId, existing.value)[editingId.value ? 'edit' : 'create'])
const errors = computed(() => warehouseErrors(draft.value, state.warehouseOrders, customers.value, existing.value))
const dirty = computed(() => visible.value && JSON.stringify(draft.value) !== initial.value)
const groups = [...new Set(WAREHOUSE_FIELDS.map(field => field[3]))]
function open(row) { editingId.value = row?.id || ''; draft.value = { ...warehouseDraft(row), ...(row ? {waybillNo:row.waybillNo || ''} : {}) }; initial.value = JSON.stringify(draft.value); visible.value = true }
async function allowDiscard() {
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('尚有未保存的仓库订单信息，确认放弃？', '放弃修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true } catch { return false }
}
async function close(done) { if (busy.value || !await allowDiscard()) return; visible.value = false; if (typeof done === 'function') done() }
function submit() {
  if (busy.value || !allowed.value || Object.keys(errors.value).length) return
  busy.value = true
  try { const row = saveWarehouseOrder(draft.value, editingId.value); visible.value = false; ElMessage.success('仓库订单已保存'); emit('saved', row) } catch (error) { ElMessage.error(error.message) } finally { busy.value = false }
}
onBeforeRouteLeave(allowDiscard)
onBeforeRouteUpdate(async () => { if (!await allowDiscard()) return false; visible.value = false })
const beforeUnload = event => { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
watch(() => [workbenchSession.personaId, accessState.revision, state.warehouseOrders], () => { visible.value = false }, { flush: 'sync' })
defineExpose({ open, allowDiscard })
</script>

<template>
  <el-dialog v-model="visible" :title="editingId ? '编辑仓库订单' : '创建仓库订单'" width="min(1040px, 96vw)" :close-on-click-modal="false" :before-close="close" destroy-on-close>
    <el-alert v-if="editingId" :title="'入仓号：'+existing?.inboundNo" :closable="false" type="info" />
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item v-if="editingId" label="提单号"><el-input v-model="draft.waybillNo" aria-label="仓单提单号" /></el-form-item>
      <section v-for="group in groups" :key="group" class="warehouse-field-section">
        <h3>{{ group }}</h3><div class="warehouse-field-grid">
          <el-form-item v-for="[key,label,type,,max] in WAREHOUSE_FIELDS.filter(field => field[3] === group)" :key="key" :label="label" :required="['customer','businessType'].includes(key)" :error="errors[key]">
            <el-select v-if="type === 'customer'" v-model="draft[key]" filterable :disabled="existing && existing.status !== '待入库'" :aria-label="label"><el-option v-if="existing && !customers.some(row => row.name === draft.customer)" :value="draft.customer" /><el-option v-for="row in customers" :key="row.id" :value="row.name" /></el-select>
            <el-select v-else-if="['business','yesno','documents'].includes(type)" v-model="draft[key]" clearable :aria-label="label"><el-option v-for="value in type === 'business' ? WAREHOUSE_BUSINESS_TYPES : type === 'yesno' ? ['是','否'] : ['有','无']" :key="value" :value="value" /></el-select>
            <el-input v-else v-model="draft[key]" :readonly="Boolean(existing?.pallets?.length) && ['pieces','grossWeight','volume'].includes(key)" :type="type === 'textarea' ? 'textarea' : 'text'" :inputmode="type === 'integer' ? 'numeric' : ['decimal','dimension'].includes(type) ? 'decimal' : 'text'" :maxlength="max || (['integer','decimal','dimension'].includes(type) ? 10 : undefined)" :aria-label="label" />
          </el-form-item>
        </div>
      </section>
    </el-form>
    <template #footer><el-button @click="close">取消</el-button><el-button type="primary" :disabled="!allowed || Object.keys(errors).length > 0" :loading="busy" @click="submit">{{ editingId ? '保存订单' : '提交订单' }}</el-button></template>
  </el-dialog>
</template>

<style scoped>
.warehouse-field-section + .warehouse-field-section { border-top:1px solid var(--border); margin-top:12px; }
h3 { font-size:15px; margin:18px 0; }
.warehouse-field-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:4px 18px; }
.el-select { width:100%; }
@media(max-width:700px) { .warehouse-field-grid { grid-template-columns:minmax(0,1fr); } }
</style>
