<script setup>
import { Edit, Plus, Upload, View } from '@element-plus/icons-vue'
import ConditionFilter from '../shared/components/ConditionFilter.vue'
import DownloadButton from '../shared/components/DownloadButton.vue'
import HoverActionMenu from '../shared/components/HoverActionMenu.vue'
import MetricGrid from '../shared/components/MetricGrid.vue'
import SegmentedControl from '../shared/components/SegmentedControl.vue'
import StackedCell from '../shared/components/StackedCell.vue'
import StatusTag from '../shared/components/StatusTag.vue'
import DataTableFrame from '../shared/components/DataTableFrame.vue'
import { useCostCenterState } from './composables/useCostCenterState.js'

const option = (value) => ({ label: value, value })

const props = defineProps({
  initialView: { type: String, default: 'overview' },
  selectedBillId: { type: String, default: '' },
})
const {
  sampleFiles, suppliers, bills, costs, pools, fees, allocationRules,
  query, applyQuery, resetQuery, ruleType, feeBoard, selectedRecord, detailVisible,
  editorVisible, editorType, editorDraft, importStep, selectedFile, billDetailTab,
  money, supplierOptions, boardOptions, statusOptions, selectedBill, selectedBillCosts,
  filteredSuppliers, filteredBills, filteredPools, filteredRules, filteredFees,
  overviewKpis, billKpis, filteredProfitRows,
  navigate, showDetail, openEditor, saveEditor, toggleStatus, settleBill, chooseFile, finishImport,
} = useCostCenterState(props)
</script>

<template>
  <div class="module-page cost-center-vue">
    <template v-if="initialView === 'overview'">
      <MetricGrid :items="overviewKpis" />
      <section class="module-panel">
        <div class="cost-section-head"><h2>五大成本板块</h2><span>按财务本位币人民币折算</span></div>
        <DataTableFrame :total="boardOptions.length" :page-size="10">
          <template #actions><DownloadButton title="下载成本数据" file-name="成本中心" :rows="{ summary: boardOptions.map(({ value }) => ({ board: value, bills: bills.filter(row => row.board === value).length, details: costs.filter(row => `${row.board}成本` === value).reduce((sum, row) => sum + row.detailCount, 0), pool: pools.filter(row => row.board === value).length })), 'bill-detail': bills }" :options="[{ label: '成本汇总表', value: 'summary', description: '下载五大成本板块汇总' }, { label: '供应商账单明细', value: 'bill-detail', description: '下载供应商账单与成本明细' }]" /></template>
          <el-table class="clean-table" :data="boardOptions.map(({ value }) => ({ board: value, bills: bills.filter(row => row.board === value).length, details: costs.filter(row => `${row.board}成本` === value).reduce((sum, row) => sum + row.detailCount, 0), pool: pools.filter(row => row.board === value).length }))" border>
            <el-table-column prop="board" label="成本板块" min-width="180" />
            <el-table-column prop="bills" label="成本账单" min-width="140" />
            <el-table-column prop="details" label="成本明细" min-width="140" />
            <el-table-column prop="pool" label="待处理分摊集" min-width="160" />
          </el-table>
        </DataTableFrame>
      </section>
      <section class="module-panel cost-block-gap">
        <div class="cost-section-head"><h2>最近供应商账单</h2><el-button @click="navigate('/cost/bills')">查看全部账单</el-button></div>
        <DataTableFrame :total="bills.slice(0, 5).length" :page-size="10">
          <el-table class="clean-table" :data="bills.slice(0, 5)" border>
            <el-table-column label="成本账单编号" min-width="250"><template #default="{ row }"><el-button link type="primary" @click="navigate(`/cost/bills/${encodeURIComponent(row.id)}`)">{{ row.id }}</el-button></template></el-table-column>
            <el-table-column prop="supplier" label="供应商" min-width="140" />
            <el-table-column prop="board" label="成本板块" min-width="140" />
            <el-table-column prop="period" label="实际成本账期" min-width="220" />
            <el-table-column label="账单金额" min-width="170"><template #default="{ row }">{{ row.amount }} {{ row.currency }}</template></el-table-column>
            <el-table-column label="状态" width="110"><template #default="{ row }"><StatusTag :label="row.state" /></template></el-table-column>
          </el-table>
        </DataTableFrame>
      </section>
    </template>

    <template v-else-if="initialView === 'suppliers'">
      <section class="module-panel filter-table-panel">
        <div class="module-toolbar">
          <div class="condition-filter-bar">
            <ConditionFilter v-model="query.keyword" label="供应商" type="text" search-placeholder="输入供应商编码或名称" />
            <ConditionFilter v-model="query.board" label="成本板块" :options="boardOptions" />
            <ConditionFilter v-model="query.status" label="状态" :options="statusOptions" />
            <div class="condition-filter-actions"><el-button type="primary" @click="applyQuery">查询</el-button></div>
          </div>
        </div>
        <DataTableFrame :total="filteredSuppliers.length" :selected-count="0">
          <template #actions><el-button type="primary" :icon="Plus" @click="openEditor('supplier', { boards: [], periodConfigs: [], currency: 'CNY', state: '启用' })">新增供应商</el-button></template>
          <el-table class="clean-table" :data="filteredSuppliers" border>
          <el-table-column prop="code" label="供应商编码" min-width="150" />
          <el-table-column label="供应商名称" min-width="170"><template #default="{ row }"><StackedCell :primary="row.name" :secondary="row.currency" /></template></el-table-column>
          <el-table-column label="适用成本板块" min-width="190"><template #default="{ row }">{{ row.boards.join('、') }}</template></el-table-column>
          <el-table-column label="板块账期配置" min-width="260"><template #default="{ row }"><span v-for="item in row.periodConfigs" :key="item.board" class="line-item">{{ item.board }}：{{ item.cycle }}</span></template></el-table-column>
          <el-table-column label="状态" width="100"><template #default="{ row }"><StatusTag :label="row.state" /></template></el-table-column>
          <el-table-column prop="updated" label="最近更新时间" width="140" />
          <TableActionColumn><template #default="{ row }"><div class="row-action-cell"><el-button class="table-detail-button" link type="primary" :icon="View" title="详情" @click="showDetail(row)" /><HoverActionMenu><el-dropdown-item @click="openEditor('supplier', row)">编辑档案</el-dropdown-item><el-dropdown-item @click="toggleStatus(row, 'state')">{{ row.state === '启用' ? '停用' : '启用' }}</el-dropdown-item></HoverActionMenu></div></template></TableActionColumn>
          </el-table>
        </DataTableFrame>
      </section>
    </template>

    <template v-else-if="initialView === 'bills'">
      <section class="condition-query-panel">
        <div class="condition-filter-bar">
          <ConditionFilter v-model="query.keyword" label="账单" type="text" search-placeholder="输入账单编号或文件名" />
          <ConditionFilter v-model="query.supplier" label="供应商" :options="supplierOptions" />
          <ConditionFilter v-model="query.board" label="成本板块" :options="boardOptions" />
          <ConditionFilter v-model="query.status" label="状态" :options="statusOptions" />
          <ConditionFilter v-model="query.period" label="账期范围" type="date-range" />
          <div class="condition-filter-actions"><el-button type="primary" @click="applyQuery">查询</el-button></div>
        </div>
      </section>
      <MetricGrid :items="[{ label: '成本账单', value: `${bills.length} 份`, tone: 'blue' }, { label: '待结清账单', value: `${bills.filter(row => row.state === '待结清').length} 份`, tone: 'amber' }, { label: '成本明细', value: `${bills.reduce((sum, row) => sum + row.rows, 0).toLocaleString()} 笔`, tone: 'green' }]" :columns="3" />
      <section class="module-panel filter-table-panel">
        <DataTableFrame :total="filteredBills.length" :selected-count="0">
          <template #actions><el-button type="primary" :icon="Upload" @click="navigate('/cost/bills/import')">导入</el-button></template>
          <el-table class="clean-table" :data="filteredBills" border>
          <el-table-column label="成本账单编号" min-width="245"><template #default="{ row }"><StackedCell :primary="row.id" :secondary="row.file" /></template></el-table-column>
          <el-table-column prop="supplier" label="供应商" min-width="130" />
          <el-table-column prop="board" label="成本板块" min-width="130" />
          <el-table-column prop="period" label="实际成本账期" min-width="215" />
          <el-table-column label="账单金额" min-width="165"><template #default="{ row }">{{ row.amount }} {{ row.currency }}</template></el-table-column>
          <el-table-column label="已结清金额" min-width="155"><template #default="{ row }">{{ row.settled }} {{ row.currency }}</template></el-table-column>
          <el-table-column prop="rows" label="成本明细" width="105" />
          <el-table-column label="状态" width="105"><template #default="{ row }"><StatusTag :label="row.state" /></template></el-table-column>
          <TableActionColumn><template #default="{ row }"><div class="row-action-cell"><el-button class="table-detail-button" link type="primary" :icon="View" title="详情" @click="navigate(`/cost/bills/${encodeURIComponent(row.id)}`)" /><HoverActionMenu><el-dropdown-item @click="settleBill(row)">登记结清</el-dropdown-item><el-dropdown-item @click="showDetail(row)">查看原始文件</el-dropdown-item></HoverActionMenu></div></template></TableActionColumn>
          </el-table>
        </DataTableFrame>
      </section>
    </template>

    <template v-else-if="initialView === 'billDetail'">
      <div class="detail-hero">
        <div><strong>{{ selectedBill.id }}</strong><small>{{ selectedBill.supplier }} · {{ selectedBill.board }} · {{ selectedBill.period }}</small></div>
        <StatusTag :label="selectedBill.state" />
      </div>
      <MetricGrid :items="billKpis" :columns="3" />
      <SegmentedControl v-model="billDetailTab" :options="[{ label: '成本明细', value: 'costs' }, { label: '账单信息', value: 'info' }]" />
      <section v-if="billDetailTab === 'costs'" class="module-panel">
        <DataTableFrame :total="selectedBillCosts.length" :page-size="10">
          <el-table class="clean-table" :data="selectedBillCosts" border>
            <el-table-column prop="raw" label="供应商原始费项" min-width="180" />
            <el-table-column prop="fee" label="标准成本费项" min-width="150" />
            <el-table-column prop="keyType" label="关联键类型" min-width="130" />
            <el-table-column prop="key" label="关联键" min-width="220" />
            <el-table-column label="金额" min-width="150"><template #default="{ row }">{{ row.amount }} {{ row.currency }}</template></el-table-column>
            <el-table-column prop="type" label="成本类型" min-width="120" />
            <el-table-column prop="target" label="归属对象" min-width="190" />
            <el-table-column label="状态" width="110"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column>
          </el-table>
        </DataTableFrame>
      </section>
      <dl v-else class="bill-info-grid">
        <div><dt>供应商</dt><dd>{{ selectedBill.supplier }}</dd></div><div><dt>成本板块</dt><dd>{{ selectedBill.board }}</dd></div>
        <div><dt>原始文件</dt><dd>{{ selectedBill.file }}</dd></div><div><dt>生成日期</dt><dd>{{ selectedBill.created }}</dd></div>
        <div><dt>直接成本</dt><dd>{{ selectedBill.direct }} 笔</dd></div><div><dt>间接成本</dt><dd>{{ selectedBill.indirect }} 笔</dd></div>
        <div><dt>未识别明细</dt><dd>{{ selectedBill.unresolved }} 笔</dd></div><div><dt>结算币种</dt><dd>{{ selectedBill.currency }}</dd></div>
      </dl>
    </template>

    <template v-else-if="initialView === 'billImport'">
      <section class="module-panel import-workbench">
        <div class="import-workbench-head"><el-steps :active="importStep - 1" finish-status="success" align-center><el-step title="选择样本文件" /><el-step title="确认识别范围" /><el-step title="预览并生成" /></el-steps><div v-if="importStep > 1" class="import-action-bar"><el-button @click="importStep--">上一步</el-button><el-button v-if="importStep === 2" type="primary" @click="importStep = 3">确认并预览</el-button><el-button v-else type="primary" @click="finishImport">生成成本账单</el-button></div></div>
        <div v-if="importStep === 1" class="sample-grid"><button v-for="file in sampleFiles" :key="file.id" type="button" @click="chooseFile(file)"><strong>{{ file.name }}</strong><span>{{ file.supplier }} · {{ file.board }}</span><small>{{ file.sheets }} 个工作表 · {{ file.size }}</small></button></div>
        <div v-else-if="importStep === 2" class="import-confirm"><el-result icon="info" title="识别范围已就绪" sub-title="将按供应商、成本板块、账期和费项映射生成账单" /></div>
        <div v-else class="import-preview"><DataTableFrame :total="costs.slice(0, 8).length" :page-size="10"><el-table class="clean-table" :data="costs.slice(0, 8)" border><el-table-column prop="raw" label="原始费项" /><el-table-column prop="fee" label="标准成本费项" /><el-table-column prop="key" label="关联键" min-width="220" /><el-table-column prop="amount" label="金额" /></el-table></DataTableFrame></div>
      </section>
    </template>

    <template v-else-if="initialView === 'pool'">
      <section class="condition-query-panel"><div class="condition-filter-bar"><ConditionFilter v-model="query.keyword" label="分摊集" type="text" /><ConditionFilter v-model="query.supplier" label="供应商" :options="supplierOptions" /><ConditionFilter v-model="query.board" label="成本板块" :options="boardOptions" /><ConditionFilter v-model="query.status" label="状态" :options="statusOptions" /><div class="condition-filter-actions"><el-button type="primary" @click="applyQuery">查询</el-button></div></div></section>
      <MetricGrid :items="[{ label: '分摊集', value: `${pools.length} 个`, tone: 'blue' }, { label: '待分摊', value: `${pools.filter(row => row.status === '待分摊').length} 个`, tone: 'amber' }, { label: '待人工确认', value: `${pools.filter(row => row.status === '待人工确认').length} 个`, tone: 'red' }]" :columns="3" />
      <section class="module-panel filter-table-panel">
        <DataTableFrame :total="filteredPools.length"><el-table class="clean-table" :data="filteredPools" border><el-table-column label="分摊集编号" min-width="210"><template #default="{ row }"><StackedCell :primary="row.id" :secondary="row.bill" /></template></el-table-column><el-table-column prop="supplier" label="供应商" min-width="120" /><el-table-column prop="board" label="成本板块" min-width="130" /><el-table-column prop="fee" label="标准成本费项" min-width="140" /><el-table-column prop="scope" label="候选业务订单范围" min-width="260" /><el-table-column prop="factor" label="分摊因子" min-width="140" /><el-table-column prop="amount" label="金额" min-width="150" /><el-table-column label="状态" width="120"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column><TableActionColumn><template #default="{ row }"><div class="row-action-cell"><el-button class="table-detail-button" link type="primary" :icon="View" title="详情" @click="showDetail(row)" /><HoverActionMenu><el-dropdown-item @click="row.status = '已分摊'">执行分摊</el-dropdown-item><el-dropdown-item @click="row.status = '不分摊'">标记不分摊</el-dropdown-item></HoverActionMenu></div></template></TableActionColumn></el-table></DataTableFrame>
      </section>
    </template>

    <template v-else-if="initialView === 'rules'">
      <SegmentedControl v-model="ruleType" :options="[{ label: '基础分摊规则', value: 'base' }, { label: '供应商特调分摊规则', value: 'supplier' }]" />
      <section class="module-panel filter-table-panel"><div class="module-toolbar"><div class="condition-filter-bar"><ConditionFilter v-model="query.keyword" label="规则" type="text" /><ConditionFilter v-model="query.board" label="成本板块" :options="boardOptions" /><ConditionFilter v-if="ruleType === 'supplier'" v-model="query.supplier" label="供应商" :options="supplierOptions" /><ConditionFilter v-model="query.status" label="状态" :options="statusOptions" /><div class="condition-filter-actions"><el-button type="primary" @click="applyQuery">查询</el-button></div></div></div>
        <DataTableFrame :total="filteredRules.length" :selected-count="0"><template #actions><el-button type="primary" :icon="Plus" @click="openEditor('rule', { supplier: ruleType === 'base' ? '全部供应商' : '', status: '启用' })">新增规则</el-button></template><el-table class="clean-table" :data="filteredRules" border><el-table-column prop="id" label="规则编号" min-width="180" /><el-table-column prop="board" label="成本板块" min-width="130" /><el-table-column prop="fee" label="标准成本费项" min-width="140" /><el-table-column v-if="ruleType === 'supplier'" prop="supplier" label="供应商" min-width="120" /><el-table-column prop="scope" label="候选业务订单范围" min-width="280" /><el-table-column label="优先 / 兜底因子" min-width="190"><template #default="{ row }"><StackedCell :primary="row.factor" :secondary="`兜底：${row.fallback}`" /></template></el-table-column><el-table-column prop="effective" label="生效期间" min-width="140" /><el-table-column label="状态" width="100"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column><TableActionColumn><template #default="{ row }"><div class="row-action-cell"><el-button class="table-detail-button" link type="primary" :icon="View" title="详情" @click="showDetail(row)" /><HoverActionMenu><el-dropdown-item @click="openEditor('rule', row)">编辑</el-dropdown-item><el-dropdown-item @click="toggleStatus(row)">{{ row.status === '启用' ? '停用' : '启用' }}</el-dropdown-item></HoverActionMenu></div></template></TableActionColumn></el-table></DataTableFrame>
      </section>
    </template>

    <template v-else-if="initialView === 'profit'">
      <section class="condition-query-panel"><div class="condition-filter-bar"><ConditionFilter v-model="query.keyword" label="业务订单" type="text" /><ConditionFilter v-model="query.type" label="集运线路" :options="['台湾海快', '台湾空运'].map(option)" /><ConditionFilter v-model="query.status" label="成本完整性" :options="['成本已齐', '成本未齐'].map(option)" /><ConditionFilter v-model="query.period" label="账期" type="date-range" /><div class="condition-filter-actions"><el-button type="primary" @click="applyQuery">查询</el-button></div></div></section>
      <MetricGrid :items="[{ label: '已确认客户侧收入', value: '3.86 百万 CNY', tone: 'blue' }, { label: '直接成本', value: '2.31 百万 CNY', tone: 'green' }, { label: '间接成本', value: '0.72 百万 CNY', tone: 'amber' }, { label: '总实际利润', value: '0.63 百万 CNY', tone: 'violet' }]" />
      <section class="module-panel filter-table-panel">
        <DataTableFrame :total="filteredProfitRows.length"><el-table class="clean-table" :data="filteredProfitRows" border><el-table-column prop="order" label="业务订单号" min-width="190" /><el-table-column prop="customer" label="客户" min-width="170" /><el-table-column prop="route" label="集运线路" min-width="120" /><el-table-column v-for="field in ['revenue', 'direct', 'indirect', 'profit']" :key="field" :prop="field" :label="({ revenue: '客户侧收入', direct: '直接成本', indirect: '间接成本', profit: '利润' })[field]" min-width="130"><template #default="{ row }">{{ money(row[field], 'CNY') }}</template></el-table-column><el-table-column prop="rate" label="利润率" width="100" /><el-table-column label="成本完整性" width="120"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column></el-table></DataTableFrame>
      </section>
    </template>

    <template v-else-if="initialView === 'fees'">
      <SegmentedControl v-model="feeBoard" :options="[{ label: '全部', value: '' }, ...boardOptions]" />
      <section class="module-panel filter-table-panel"><div class="module-toolbar"><div class="condition-filter-bar"><ConditionFilter v-model="query.keyword" label="成本费项" type="text" search-placeholder="输入费项编码或名称" /><ConditionFilter v-model="query.status" label="状态" :options="statusOptions" /><div class="condition-filter-actions"><el-button type="primary" @click="applyQuery">查询</el-button></div></div></div>
        <DataTableFrame :total="filteredFees.length" :selected-count="0"><template #actions><el-button type="primary" :icon="Plus" @click="openEditor('fee', { board: '派送成本', rules: 0, references: 0, status: '启用' })">新增标准成本费项</el-button></template><el-table class="clean-table" :data="filteredFees" border><el-table-column prop="code" label="成本费项编码" min-width="170" /><el-table-column prop="name" label="标准成本费项" min-width="150" /><el-table-column prop="board" label="成本板块" min-width="130" /><el-table-column prop="definition" label="定义" min-width="280" /><el-table-column prop="rules" label="分摊规则" width="100" /><el-table-column prop="references" label="引用数" width="90" /><el-table-column label="状态" width="100"><template #default="{ row }"><StatusTag :label="row.status" /></template></el-table-column><TableActionColumn><template #default="{ row }"><div class="row-action-cell"><el-button class="table-detail-button" link type="primary" :icon="View" title="详情" @click="showDetail(row)" /><HoverActionMenu><el-dropdown-item @click="openEditor('fee', row)">编辑</el-dropdown-item><el-dropdown-item @click="toggleStatus(row)">{{ row.status === '启用' ? '停用' : '启用' }}</el-dropdown-item></HoverActionMenu></div></template></TableActionColumn></el-table></DataTableFrame>
      </section>
    </template>

    <el-dialog v-model="detailVisible" title="详情" class="module-dialog module-dialog-large" align-center append-to-body destroy-on-close>
      <el-descriptions v-if="selectedRecord" :column="2" border><el-descriptions-item v-for="(value, key) in selectedRecord" :key="key" :label="key">{{ Array.isArray(value) ? value.join('、') : typeof value === 'object' ? JSON.stringify(value) : value }}</el-descriptions-item></el-descriptions>
      <template #footer><el-button @click="detailVisible = false">关闭</el-button></template>
    </el-dialog>

    <el-dialog v-model="editorVisible" :title="editorDraft.code || editorDraft.id ? '编辑' : '新增'" class="module-dialog" align-center append-to-body destroy-on-close>
      <el-form label-position="top" class="form-grid">
        <template v-if="editorType === 'supplier'"><el-form-item label="供应商编码"><el-input v-model="editorDraft.code" /></el-form-item><el-form-item label="供应商名称"><el-input v-model="editorDraft.name" /></el-form-item><el-form-item label="默认币种"><el-select v-model="editorDraft.currency"><el-option v-for="item in ['CNY','TWD','USD']" :key="item" :value="item" /></el-select></el-form-item><el-form-item label="状态"><el-select v-model="editorDraft.state"><el-option value="启用" /><el-option value="停用" /></el-select></el-form-item></template>
        <template v-else-if="editorType === 'rule'"><el-form-item label="规则编号"><el-input v-model="editorDraft.id" /></el-form-item><el-form-item label="成本板块"><el-select v-model="editorDraft.board"><el-option v-for="item in boardOptions" :key="item.value" :value="item.value" /></el-select></el-form-item><el-form-item label="标准成本费项"><el-input v-model="editorDraft.fee" /></el-form-item><el-form-item label="供应商"><el-input v-model="editorDraft.supplier" /></el-form-item><el-form-item label="候选业务订单范围" class="span-2"><el-input v-model="editorDraft.scope" /></el-form-item><el-form-item label="优先因子"><el-input v-model="editorDraft.factor" /></el-form-item><el-form-item label="兜底因子"><el-input v-model="editorDraft.fallback" /></el-form-item></template>
        <template v-else><el-form-item label="成本费项编码"><el-input v-model="editorDraft.code" /></el-form-item><el-form-item label="标准成本费项"><el-input v-model="editorDraft.name" /></el-form-item><el-form-item label="成本板块"><el-select v-model="editorDraft.board"><el-option v-for="item in boardOptions" :key="item.value" :value="item.value" /></el-select></el-form-item><el-form-item label="状态"><el-select v-model="editorDraft.status"><el-option value="启用" /><el-option value="停用" /></el-select></el-form-item><el-form-item label="定义" class="span-2"><el-input v-model="editorDraft.definition" type="textarea" /></el-form-item></template>
      </el-form>
      <template #footer><el-button @click="editorVisible = false">取消</el-button><el-button type="primary" :icon="Edit" @click="saveEditor">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cost-center-vue { display: flex; flex-direction: column; gap: var(--space-3); }
.cost-center-vue > .condition-query-panel { margin-bottom: 0; }
.cost-center-vue :deep(.module-kpis), .cost-center-vue :deep(.module-segmented) { margin-bottom: 0; }
.cost-section-head { min-height: 50px; padding: 0 var(--space-4); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); }
.cost-section-head h2 { margin: 0; font-size: var(--section-title-font-size); }.cost-section-head span { color: var(--muted); font-size: var(--secondary-font-size); }
.cost-block-gap { margin-top: var(--space-1); }.line-item { display: block; line-height: 1.7; }
.import-workbench { padding: var(--space-6); }.import-workbench-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-4); }.import-action-bar { display: flex; justify-content: flex-end; gap: var(--space-2); }.sample-grid { margin-top: var(--space-6); display: grid; grid-template-columns: repeat(3, minmax(220px, 1fr)); gap: var(--space-3); }
.sample-grid button { min-height: 112px; padding: var(--space-4); display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); border: 1px solid var(--border); border-radius: 7px; color: var(--ink); background: #fff; text-align: left; cursor: pointer; }
.sample-grid button:hover { border-color: var(--primary); background: var(--primary-soft); }.sample-grid span, .sample-grid small { color: var(--muted); }
.import-confirm { min-height: 400px; }.import-preview { margin-top: var(--space-6); }
@media (max-width: 900px) { .sample-grid { grid-template-columns: 1fr; } }
</style>
