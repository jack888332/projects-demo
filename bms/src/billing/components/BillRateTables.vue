<script setup>
import { ref } from 'vue'
import { EditPen } from '@element-plus/icons-vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'

const props = defineProps({
  subject: { type: String, required: true },
  settlementRates: { type: Array, required: true },
  originalRates: { type: Array, required: true },
  canEdit: { type: Boolean, default: false },
})
const emit = defineEmits(['save'])
const editorVisible = ref(false)
const editableRates = ref([])

function openEditor() {
  editableRates.value = props.settlementRates.map(row => ({ ...row, rate: Number(row.rate) }))
  editorVisible.value = true
}

function saveRates() {
  editorVisible.value = false
  emit('save', editableRates.value.map(row => ({ ...row, rate: Number(row.rate).toFixed(6) })))
}
</script>

<template>
  <div class="bill-rate-tables">
    <div class="bill-detail-table-block">
      <h4>{{ subject }}结算币种折算</h4>
      <DataTableFrame :total="settlementRates.length" :page-size="20">
        <template #actions>
          <el-button :icon="EditPen" :disabled="!canEdit" @click="openEditor">编辑特调汇率</el-button>
        </template>
        <el-table :data="settlementRates" border class="clean-table">
          <el-table-column prop="settlement" :label="`${subject}结算币种`" />
          <el-table-column prop="target" label="财务本位币种" />
          <el-table-column prop="direction" label="汇兑方向" />
          <el-table-column prop="rate" label="锁定汇率" />
        </el-table>
      </DataTableFrame>
    </div>

    <div class="bill-detail-table-block">
      <h4>{{ subject }}原始币种折算</h4>
      <DataTableFrame :total="originalRates.length" :page-size="20">
        <el-table :data="originalRates" border class="clean-table">
          <el-table-column prop="settlement" :label="`${subject}结算币种`" />
          <el-table-column prop="target" :label="`${subject}原始币种`" />
          <el-table-column prop="direction" label="汇兑方向" />
          <el-table-column prop="rate" label="锁定汇率" />
        </el-table>
      </DataTableFrame>
    </div>

    <el-dialog v-model="editorVisible" title="编辑账单特调汇率" class="module-dialog" align-center append-to-body destroy-on-close>
      <el-alert title="仅修改当前待审核账单的锁定汇率，不回写汇率配置。" type="info" :closable="false" />
      <DataTableFrame class="rate-editor-table" :total="editableRates.length" :page-size="20" :sticky-toolbar="false" :sticky-pagination="false">
        <el-table :data="editableRates" border class="clean-table">
          <el-table-column prop="settlement" :label="`${subject}结算币种`" />
          <el-table-column prop="target" label="财务本位币种" />
          <el-table-column prop="direction" label="汇兑方向" />
          <el-table-column label="锁定汇率">
            <template #default="scope">
              <el-input-number v-model="scope.row.rate" :precision="6" :step="0.000001" :min="0.000001" controls-position="right" />
            </template>
          </el-table-column>
        </el-table>
      </DataTableFrame>
      <template #footer>
        <el-button @click="editorVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRates">保存特调汇率</el-button>
      </template>
    </el-dialog>
  </div>
</template>
