<script setup>
import { useRouter } from 'vue-router'
import DataTableFrame from './DataTableFrame.vue'
import { canReadTarget } from '../data/accessControl.js'
defineProps({ messages:{type:Array,default:()=>[]} })
const router=useRouter()
</script>
<template>
  <DataTableFrame :rows="messages" :page-size="10" :page-sizes="[10]">
    <template #default="{rows}"><el-table :data="rows" row-key="id" aria-label="消息通知" empty-text="当前角色暂无已接入的业务消息">
      <el-table-column prop="type" label="消息类型" width="160" />
      <el-table-column prop="content" label="消息内容" min-width="260" />
      <el-table-column prop="channel" label="渠道" width="160" />
      <el-table-column prop="createdAt" label="发生时间" width="175" />
      <el-table-column label="操作" width="95"><template #default="{row}"><el-button link type="primary" :disabled="!canReadTarget(row.related)" @click="router.push(row.related)">查看单据</el-button></template></el-table-column>
    </el-table></template>
  </DataTableFrame>
</template>
