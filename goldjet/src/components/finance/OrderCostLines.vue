<script setup>
import { computed, ref } from 'vue'
import { Edit, Delete, View } from '@element-plus/icons-vue'
import StatusTag from '../StatusTag.vue'
import { COST_COLUMNS, COST_IDENTITY_COLUMNS, COST_AUDIT_COLUMNS, COST_EDITABLE, money } from '../../domain/orderCosts.js'
const props = defineProps({ rows: Array, identity: Boolean, audit: Boolean, editable: Boolean, selectable: Boolean, selectRow: Function, approval: Boolean, remarks: Object, compact: Boolean })
const emit = defineEmits(['select','edit','delete','view'])
const expanded = ref(false)
const columns = computed(() => [...(props.identity?COST_IDENTITY_COLUMNS:[]),...COST_COLUMNS,...(props.audit?COST_AUDIT_COLUMNS:[])])
const shown = computed(() => props.compact && !expanded.value ? props.rows.slice(0,5) : props.rows)
const moneyKeys = ['originalAmount','amount','unitPrice','premium','referencePrice']
</script>
<template>
  <div class="cost-line-table">
    <el-table :data="shown" row-key="id" border @selection-change="emit('select',$event)" aria-label="成本明细表">
      <el-table-column v-if="selectable" type="selection" width="48" fixed="left" :selectable="selectRow"/>
      <el-table-column prop="lineNo" label="序号" width="64"/>
      <el-table-column v-for="[key,label,width] in columns" :key="key" :prop="key" :label="label" :min-width="width">
        <template #default="{row}"><StatusTag v-if="key==='status'" :label="row.status"/><el-input v-else-if="key==='approvalRemark'&&approval&&selectRow?.(row)" v-model="remarks[row.id]" :aria-label="'行'+row.lineNo+'审批备注'"/><span v-else :class="{premium:key==='premium'&&row.premium>3}">{{ moneyKeys.includes(key)?money(row[key]):row[key] ?? '—' }}</span></template>
      </el-table-column>
      <el-table-column label="附件" width="90"><template #default="{row}"><el-button link type="primary" @click="emit('view',row)">{{ row.attachments?.length || 0 }} 份</el-button></template></el-table-column>
      <el-table-column label="操作" :width="editable?220:85" fixed="right"><template #default="{row}"><el-button :icon="View" link type="primary" @click="emit('view',row)">查看</el-button><template v-if="editable&&COST_EDITABLE.includes(row.status)"><el-button :icon="Edit" link type="primary" @click="emit('edit',row)">编辑</el-button><el-button :icon="Delete" link type="danger" @click="emit('delete',row)">删除</el-button></template></template></el-table-column>
    </el-table>
    <el-button v-if="compact&&rows.length>5" link type="primary" @click="expanded=!expanded">{{expanded?'收起':`展开全部 ${rows.length} 行`}}</el-button>
  </div>
</template>
<style scoped>
.cost-line-table{min-width:0;max-width:100%}.premium{color:#b54708;font-weight:600}.cost-line-table>.el-button{margin-top:10px}
</style>
