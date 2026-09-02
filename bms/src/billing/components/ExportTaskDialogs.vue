<script setup>
import { computed, reactive, watch } from 'vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'

const props = defineProps({
  detailVisible: { type: Boolean, default: false },
  configVisible: { type: Boolean, default: false },
  task: { type: Object, default: null },
  items: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:detailVisible', 'update:configVisible', 'saved'])
const taskItems = computed(() => props.items.filter((item) => item.taskNo === props.task?.no))
const savedConfig = reactive({ receivableNotice: true, refundNotice: true, qrCode: 'wechat-pay-og4155.png', account: '招商银行深圳分行 7559 **** 1842' })
const draft = reactive({ ...savedConfig })

watch(() => props.configVisible, (visible) => {
  if (visible) Object.assign(draft, savedConfig)
})

function saveConfig() {
  Object.assign(savedConfig, draft)
  emit('update:configVisible', false)
  emit('saved', { ...savedConfig })
}
</script>

<template>
  <el-dialog :model-value="detailVisible" title="导出任务详情" class="module-dialog module-dialog-large" align-center append-to-body destroy-on-close @update:model-value="emit('update:detailVisible', $event)">
    <template v-if="task">
      <dl class="detail-grid"><div><dt>任务编号</dt><dd>{{ task.no }}</dd></div><div><dt>任务状态</dt><dd>{{ task.status }}</dd></div><div><dt>账单类型 / 用途</dt><dd>{{ task.billType }} / {{ task.purpose }}</dd></div><div><dt>导出范围</dt><dd>{{ task.scope || '列表勾选' }}</dd></div><div><dt>内部导出格式</dt><dd>{{ task.format }}</dd></div><div><dt>处理进度</dt><dd>{{ task.processed }} / {{ task.bills }}（{{ task.progress }}%）</dd></div></dl>
    <DataTableFrame :total="taskItems.length" :page-size="20" :sticky-toolbar="false" :sticky-pagination="false"><el-table :data="taskItems" border class="clean-table"><el-table-column prop="billNo" label="账单编号" width="230" /><el-table-column prop="result" label="导出结果" width="100" /><el-table-column prop="output" label="Sheet / 文件" width="180" /><el-table-column prop="reason" label="失败原因" min-width="220" /></el-table></DataTableFrame>
    </template>
  </el-dialog>

  <el-dialog :model-value="configVisible" title="客户对账报表导出配置" class="module-dialog" align-center append-to-body destroy-on-close @update:model-value="emit('update:configVisible', $event)">
    <el-form label-width="140px"><el-form-item label="应收客户通知"><el-switch v-model="draft.receivableNotice" active-text="启用" /></el-form-item><el-form-item label="返款客户通知"><el-switch v-model="draft.refundNotice" active-text="启用" /></el-form-item><el-form-item label="收款二维码"><el-input v-model="draft.qrCode" /></el-form-item><el-form-item label="收款账户"><el-input v-model="draft.account" /></el-form-item></el-form>
    <template #footer><el-button @click="emit('update:configVisible', false)">取消</el-button><el-button type="primary" @click="saveConfig">保存</el-button></template>
  </el-dialog>
</template>
