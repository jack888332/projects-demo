<script setup>
import { computed, reactive, ref } from 'vue'
import { Plus, RefreshLeft, Remove } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import FilterBar from '../components/FilterBar.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'

const { state, addPartner, togglePartner } = usePrototypeData()
const keyword = ref('')
const type = ref('')
const status = ref('')
const createVisible = ref(false)
const form = reactive({ name: '', type: '客户', owner: '', contact: '', phone: '' })
const rows = computed(() => state.partners.filter((item) => {
  const match = !keyword.value || `${item.code}${item.name}${item.contact}`.toLowerCase().includes(keyword.value.toLowerCase())
  return match && (!type.value || item.type === type.value) && (!status.value || item.status === status.value)
}))
function submit() { if (!form.name || !form.owner || !form.contact) return ElMessage.error('请填写合作方名称、归属部门和联系人'); const item = addPartner({ ...form }); createVisible.value = false; ElMessage.success(`合作方 ${item.name} 已保存`) }
function toggle(row) { togglePartner(row.id); ElMessage.success(row.status === '有效' ? '合作方已恢复有效' : '合作方已失效') }
function resetFilters() { keyword.value = ''; type.value = ''; status.value = '' }
</script>

<template>
  <div class="module-view">
    <PageHeader title="合作方档案" description="客户、供应商及其业务归属与生效状态">
      <template #actions><el-button type="primary" :icon="Plus" @click="createVisible = true">新增合作方</el-button></template>
    </PageHeader>
    <FilterBar v-model="keyword" placeholder="编码、合作方名称或联系人" @reset="resetFilters">
      <el-select v-model="type" clearable placeholder="合作方类型" class="filter-select"><el-option label="客户" value="客户" /><el-option label="供应商" value="供应商" /></el-select>
      <el-select v-model="status" clearable placeholder="生效状态" class="filter-select"><el-option label="有效" value="有效" /><el-option label="失效" value="失效" /></el-select>
    </FilterBar>
    <DataTableFrame :rows="rows" :page-size="10">
      <template #default="{ rows: pageRows }"><el-table :data="pageRows" row-key="id" stripe>
        <el-table-column prop="code" label="合作方编码" width="130" fixed="left" /><el-table-column prop="name" label="合作方名称" min-width="170" />
        <el-table-column prop="type" label="类型" width="90" /><el-table-column prop="owner" label="归属部门" min-width="130" />
        <el-table-column prop="contact" label="联系人" min-width="120" /><el-table-column prop="phone" label="联系电话" width="145" />
        <el-table-column label="状态" width="90"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
        <el-table-column prop="updatedAt" label="更新日期" width="110" />
        <el-table-column label="操作" width="98" fixed="right"><template #default="{ row }"><el-button link :type="row.status === '有效' ? 'danger' : 'primary'" :icon="row.status === '有效' ? Remove : RefreshLeft" @click="toggle(row)">{{ row.status === '有效' ? '失效' : '恢复' }}</el-button></template></el-table-column>
      </el-table></template>
    </DataTableFrame>
    <el-dialog v-model="createVisible" title="新增合作方" width="620" align-center>
      <el-form :model="form" label-position="top" class="form-grid">
        <el-form-item label="合作方类型"><el-segmented v-model="form.type" :options="['客户', '供应商']" /></el-form-item>
        <el-form-item label="合作方名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="归属部门"><el-input v-model="form.owner" /></el-form-item><el-form-item label="联系人"><el-input v-model="form.contact" /></el-form-item>
        <el-form-item label="联系电话" class="span-2"><el-input v-model="form.phone" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" @click="submit">保存合作方</el-button></template>
    </el-dialog>
  </div>
</template>
