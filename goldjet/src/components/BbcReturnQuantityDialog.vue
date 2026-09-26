<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { bbcReturnRows } from '../domain/reverseOrders.js'
import { validateReturnQuantities } from '../domain/bbcCustomerOrders.js'

const emit = defineEmits(['created'])
const { bbcSession, createBbcReturnOrder } = usePrototypeData()
const visible = ref(false), order = ref(null), kind = ref('consumer'), busy = ref(false)
const rows = ref([]), remark = ref(''), services = ref([])
const title = computed(() => kind.value === 'consumer' ? '安排客退' : '安排消退')
const category = computed(() => kind.value === 'consumer' ? 'BBC客退' : 'BBC消退')
const serviceOptions = computed(() => kind.value === 'consumer' ? [['transport', '运输服务'], ['warehouse', '仓储服务']] : [['transport', '运输服务'], ['warehouse', '仓储服务'], ['customs', '关务服务']])
const errors = computed(() => validateReturnQuantities(rows.value.map(row => ({ id: row.id, quantity: row.selectedQuantity, originalQuantity: row.originalQuantity }))))
const selectedCount = computed(() => rows.value.filter(row => Number(row.selectedQuantity) > 0).length)

function open(targetOrder, targetKind = 'consumer') {
  order.value = targetOrder
  kind.value = targetKind
  rows.value = bbcReturnRows(targetOrder, targetKind).map(row => ({ ...row, selectedQuantity: row.originalQuantity }))
  services.value = serviceOptions.value.map(([key, label]) => ({ key, label, selected: ['warehouse'].includes(key), status: '待接单', generated: false, id: '' }))
  remark.value = ''
  visible.value = true
}
function submit(mode) {
  if (busy.value || Object.keys(errors.value).length) return
  if (!selectedCount.value) { ElMessage.warning('一订单全部商品均为 0 时该订单不参与本次退货，请至少选择一件商品'); return }
  busy.value = true
  try {
    const created = createBbcReturnOrder({
      bbcOrderId: order.value.id, kind: kind.value, rows: rows.value,
      payload: { remark: remark.value, services: services.value },
      submit: mode === 'submit',
    })
    visible.value = false
    ElMessage.success(mode === 'submit' ? '已提交并按服务配置生成大订单' : '已保存，可稍后补充并提交')
    emit('created', created)
  } catch (error) { ElMessage.error(error.message) } finally { busy.value = false }
}
defineExpose({ open })
</script>

<template>
  <el-dialog v-model="visible" :title="`${title} · ${order?.orderNo || ''}`" width="min(900px, 96vw)" align-center destroy-on-close :close-on-click-modal="false">
    <el-alert type="info" :closable="false" title="每行退货数量默认为原始数量，允许录入 0 到原始数量之间的整数；0 表示该商品不参与本次退货。累计上限与既往已退数量的关系待确认。" />
    <el-table :data="rows" size="small" class="return-rows">
      <el-table-column type="index" label="序号" width="60" />
      <el-table-column prop="productId" label="备案商品ID" width="130" />
      <el-table-column prop="name" label="商品名称" min-width="150" />
      <el-table-column prop="barcode" label="商品条码" width="140" />
      <el-table-column prop="hsCode" label="备案HS号" width="120" />
      <el-table-column prop="originalQuantity" label="原始数量" width="90" />
      <el-table-column prop="unit" label="单位" width="70" />
      <el-table-column label="客退/消退数量" width="140"><template #default="{ row }"><el-input-number v-model="row.selectedQuantity" :min="0" :max="row.originalQuantity" :step="1" size="small" :aria-label="'退货数量-' + row.id" /></template></el-table-column>
      <el-table-column prop="previousQuantity" label="既往已退" width="90" />
    </el-table>
    <el-form label-position="top" class="return-form">
      <el-form-item label="本次参与退货的订单"><span>{{ selectedCount ? `${order?.orderNo}（${selectedCount} 件商品）` : '全部商品为 0，本订单不参与本次退货' }}</span></el-form-item>
      <el-form-item label="服务配置"><el-checkbox v-for="service in services" :key="service.key" v-model="service.selected">{{ service.label }}</el-checkbox></el-form-item>
      <el-form-item label="备注"><el-input v-model="remark" type="textarea" maxlength="100" show-word-limit /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button v-business-write="'reverseOrders'" :disabled="busy || !selectedCount || Object.keys(errors).length > 0" @click="submit('save')">保存</el-button>
      <el-button v-business-write="'reverseOrders'" type="primary" :disabled="busy || !selectedCount || Object.keys(errors).length > 0" @click="submit('submit')">确定并提交</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.return-rows { margin-bottom: 14px; }
.return-form :deep(.el-checkbox) { margin-right: 18px; }
</style>
