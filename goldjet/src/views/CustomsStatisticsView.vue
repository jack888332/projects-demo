<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import PageHeader from '../components/PageHeader.vue'
import DataTableFrame from '../components/DataTableFrame.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  CUSTOMS_BUSINESS_TYPES, NANSHA_TYPES, customsDepartmentClerks, customsStatisticsPermissions,
  departmentSummary, filterDeclarations, memberSummary, nanshaStatistics,
} from '../domain/customsStatistics.js'

echarts.use([BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, AriaComponent, CanvasRenderer])

const { state, declarationSession } = usePrototypeData()
const permission = computed(() => customsStatisticsPermissions(declarationSession.value.role))
const tabs = ['报关数据查询', '部门工作汇总', '成员工作量统计', '南沙业务统计']
const tab = ref('报关数据查询')
function switchTab(value) { tab.value = value; nextTick(renderCharts) }

// ---- 报关数据查询 ----
const declDefaults = () => ({ declarationNo: '', waybillNo: '', importExportFlag: '', declarationCustoms: '', domesticConsignor: '', declarationUnit: '', cleared: '', declarationRange: [] })
const declFilters = reactive(declDefaults())
const declApplied = ref(declDefaults())
const declarationRows = computed(() => filterDeclarations(state.customsDeclarations.filter(row => row.status === '已申报' && (row.businessType === '普货进口' || row.businessType === '普货出口')), declApplied.value))
function queryDeclarations() { declApplied.value = JSON.parse(JSON.stringify(declFilters)) }
function resetDeclarations() { Object.assign(declFilters, declDefaults()) }
const declDetailId = ref(''), declDetailVisible = ref(false)
const declDetail = computed(() => state.customsDeclarations.find(row => row.id === declDetailId.value))
const declDetailService = computed(() => state.customsServiceOrders.find(row => row.id === declDetail.value?.serviceId))
function openDeclaration(row) { declDetailId.value = row.id; declDetailVisible.value = true }
function printDeclarations() { window.print() }

// ---- 通用导出 ----
function exportCsv(filename, header, lines) {
  if (!lines.length) { ElMessage.warning('当前查询结果为空，没有可导出的数据'); return }
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = '\ufeff' + [header, ...lines].map(line => line.map(escape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href)
}

// ---- 部门工作汇总 ----
const monthStart = '2026-09-01', monthEnd = '2026-09-30'
const deptQuery = reactive({ range: [monthStart, monthEnd], businessType: '普货进口' })
const deptApplied = ref({ range: [monthStart, monthEnd], businessType: '普货进口' })
const deptResult = computed(() => departmentSummary(state, deptApplied.value))
function queryDept() { deptApplied.value = JSON.parse(JSON.stringify(deptQuery)); nextTick(renderCharts) }
function exportDept() {
  const result = deptResult.value
  exportCsv('部门工作汇总.csv', ['业务类型', '票数', '总提单数', '分单数', '总重量（kg）', '金额', '空运', '海运', '陆运', '已完成服务单', '未完成服务单', '完成率'], [
    [result.businessType, result.tickets, result.totalWaybills, result.houseBills, result.totalWeight, result.amounts.map(row => `${row.currency} ${row.amount}`).join('；'), result.transport.空运, result.transport.海运, result.transport.陆运, result.completion.completed, result.completion.unfinished, result.completion.ratio ?? '待确认'],
  ])
}

// ---- 成员工作量统计 ----
const memberQuery = reactive({ range: [monthStart, monthEnd], businessType: '普货进口', clerk: '' })
const memberApplied = ref({ range: [monthStart, monthEnd], businessType: '普货进口', clerk: '' })
const memberResult = computed(() => memberSummary(state, memberApplied.value))
const clerkOptions = computed(() => customsDepartmentClerks(state, memberQuery.businessType))
function queryMembers() { memberApplied.value = JSON.parse(JSON.stringify(memberQuery)) }
function exportMembers() {
  const { rows, variant } = memberResult.value
  if (variant === 'crossBorder') exportCsv('成员工作量统计.csv', ['报关员', '包裹数', '总提单数'], rows.map(row => [row.clerk, row.parcels, row.totalWaybills]))
  else exportCsv('成员工作量统计.csv', ['报关员', '单证报关', '单证出错票数', '单证出错率', '代理报关', '代理出错票数', '代理出错率', '发送票数', '删单', '改单', '删单退运', '查验', '落装', '改配'], rows.map(row => [row.clerk, row.单证报关, row.单证报关Error, row.单证报关Rate ?? '待确认', row.代理报关, row.代理报关Error, row.代理报关Rate ?? '待确认', row.sends, row.deletes, row.amends, row.deletedReturns, row.inspections, row.loads, row.reconfigure]))
}

// ---- 南沙业务统计 ----
const nanshaQuery = reactive({ fromMonth: '2026-01', toMonth: '2026-09', businessType: '全部' })
const nanshaApplied = ref({ fromMonth: '2026-01', toMonth: '2026-09', businessType: '全部' })
const nanshaResult = computed(() => nanshaStatistics(state, nanshaApplied.value))
function queryNansha() { nanshaApplied.value = JSON.parse(JSON.stringify(nanshaQuery)); nextTick(renderCharts) }
function exportNansha() {
  const result = nanshaResult.value
  if (result.type === '全部') exportCsv('南沙业务统计.csv', ['业务类型', '数量', '占比'], result.composition.map(row => [row.type, row.value, row.ratio ?? '待确认']))
  else exportCsv('南沙业务统计.csv', ['月份', result.type, '查验', '合计'], result.rows.map(row => [row.month, row.count, row.inspections, row.total]))
}

// ---- 图表 ----
const transportChart = ref(null), completionChart = ref(null), compositionChart = ref(null)
let transportInstance, completionInstance, compositionInstance
function renderCharts() {
  if (tab.value === '部门工作汇总' && permission.value.stats) {
    if (!transportInstance && transportChart.value) { transportInstance = echarts.init(transportChart.value); window.addEventListener('resize', () => transportInstance?.resize()) }
    transportInstance?.setOption({ animation: false, aria: { enabled: true }, grid: { left: 60, right: 20, top: 30, bottom: 40 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: ['空运', '海运', '陆运'] }, yAxis: { type: 'value', name: '服务单' }, series: [{ type: 'bar', barMaxWidth: 42, data: [deptResult.value.transport.空运, deptResult.value.transport.海运, deptResult.value.transport.陆运], itemStyle: { color: '#258b91' } }] }, { notMerge: true })
    if (!completionInstance && completionChart.value) { completionInstance = echarts.init(completionChart.value); window.addEventListener('resize', () => completionInstance?.resize()) }
    completionInstance?.setOption({ animation: false, aria: { enabled: true }, tooltip: { trigger: 'item' }, legend: { bottom: 0 }, series: [{ type: 'pie', radius: ['45%', '70%'], label: { formatter: '{b}：{c}' }, data: [{ name: '已完成', value: deptResult.value.completion.completed, itemStyle: { color: '#258b91' } }, { name: '未完成', value: deptResult.value.completion.unfinished, itemStyle: { color: '#bd8a25' } }] }] }, { notMerge: true })
  }
  if (tab.value === '南沙业务统计' && permission.value.stats && nanshaResult.value.type === '全部') {
    if (!compositionInstance && compositionChart.value) { compositionInstance = echarts.init(compositionChart.value); window.addEventListener('resize', () => compositionInstance?.resize()) }
    compositionInstance?.setOption({ animation: false, aria: { enabled: true }, tooltip: { trigger: 'item' }, legend: { bottom: 0 }, series: [{ type: 'pie', radius: '65%', label: { formatter: '{b}：{c}' }, data: nanshaResult.value.composition.map(row => ({ name: row.type, value: row.value })) }] }, { notMerge: true })
  }
}
onMounted(renderCharts)
onBeforeUnmount(() => {
  transportInstance?.dispose(); completionInstance?.dispose(); compositionInstance?.dispose()
  transportInstance = completionInstance = compositionInstance = null
})
watch(() => [deptResult.value, nanshaResult.value, permission.value.stats], () => nextTick(renderCharts), { deep: true })
watch(() => declarationSession.value.role, () => { declDetailVisible.value = false })
</script>

<template>
  <div class="module-view">
    <PageHeader title="关务查询与统计" description="报关数据查询 · 部门工作汇总 · 成员工作量 · 南沙业务统计">
      <template #actions>
        <el-button v-if="tab === '报关数据查询'" @click="exportCsv('报关数据查询.csv', ['报关单号', '服务单号', '境内收发货人', '信用代码', '监管方式', '运输方式', '运输工具名称', '提运单号', '进出口标志', '申报地海关', '申报单位', '申报日期', '是否结关'], declarationRows.map(row => [row.declarationNo, state.customsServiceOrders.find(service => service.id === row.serviceId)?.serviceNo, row.domesticConsignor, row.creditCode, row.supervisionMode, row.transportMode, row.conveyanceName, row.waybillNo, row.importExportFlag, row.declarationCustoms, row.declarationUnit, row.declarationDate, row.cleared ? '是' : '否']))">导出</el-button>
        <el-button v-if="tab === '报关数据查询'" @click="printDeclarations">打印</el-button>
        <el-button v-if="tab === '部门工作汇总'" @click="exportDept">导出数据</el-button>
        <el-button v-if="tab === '成员工作量统计'" @click="exportMembers">导出数据</el-button>
        <el-button v-if="tab === '南沙业务统计'" @click="exportNansha">导出数据</el-button>
      </template>
    </PageHeader>
    <el-alert v-if="!permission.query" type="warning" :closable="false" title="当前角色不能查看关务查询与统计，请切换为报关行客服或超级管理员（演示角色中暂无关务部总监）。" />
    <template v-else>
      <el-alert class="customs-notice" title="查询与统计只提供既有业务对象的只读投影；日期归期、跨币种换算、零分母与取消/终止归属按 CUSTOMS-B042/B043 保留待确认，统计页按服务完成时间、报关单按申报日期归期，不将原币金额直接相加。" type="info" :closable="false" />
      <el-tabs :model-value="tab" @update:model-value="switchTab"><el-tab-pane v-for="value in tabs" :key="value" :label="value" :name="value" /></el-tabs>

      <template v-if="tab === '报关数据查询'">
        <form class="customs-filters" aria-label="报关数据查询" @submit.prevent="queryDeclarations">
          <label>报关单号<el-input v-model="declFilters.declarationNo" clearable /></label>
          <label>提运单号<el-input v-model="declFilters.waybillNo" clearable /></label>
          <label>进出口标志<el-select v-model="declFilters.importExportFlag" clearable placeholder="全部"><el-option label="进口" value="进口" /><el-option label="出口" value="出口" /></el-select></label>
          <label>申报地海关<el-input v-model="declFilters.declarationCustoms" clearable /></label>
          <label>境内收发货人<el-input v-model="declFilters.domesticConsignor" clearable /></label>
          <label>申报单位<el-input v-model="declFilters.declarationUnit" clearable /></label>
          <label>是否结关<el-select v-model="declFilters.cleared" clearable placeholder="全部"><el-option label="是" value="true" /><el-option label="否" value="false" /></el-select></label>
          <label>申报日期<el-date-picker v-model="declFilters.declarationRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
          <el-button type="primary" native-type="submit">查询</el-button>
          <el-button @click="resetDeclarations">重置</el-button>
        </form>
        <DataTableFrame :rows="declarationRows" :page-size="50" :page-sizes="[20, 50, 100]">
          <template #default="{ rows: pageRows }">
            <el-table :data="pageRows" stripe row-key="id" aria-label="报关数据查询列表">
              <el-table-column label="报关单号" width="170" fixed="left"><template #default="{ row }"><button class="link-button" @click="openDeclaration(row)">{{ row.declarationNo }}</button></template></el-table-column>
              <el-table-column label="服务单号" width="160"><template #default="{ row }">{{ state.customsServiceOrders.find(service => service.id === row.serviceId)?.serviceNo }}</template></el-table-column>
              <el-table-column prop="domesticConsignor" label="境内收发货人" min-width="150" />
              <el-table-column prop="creditCode" label="18位社会信用代码" width="180" />
              <el-table-column prop="supervisionMode" label="监管方式" width="100" />
              <el-table-column prop="transportMode" label="运输方式" width="90" />
              <el-table-column prop="conveyanceName" label="运输工具名称" width="120" />
              <el-table-column prop="waybillNo" label="提运单号" width="140" />
              <el-table-column prop="importExportFlag" label="进出口标志" width="95" />
              <el-table-column prop="declarationCustoms" label="申报地海关" min-width="150" />
              <el-table-column prop="declarationUnit" label="申报单位" min-width="170" />
              <el-table-column prop="declarationDate" label="申报日期" width="110" />
              <el-table-column label="是否结关" width="90"><template #default="{ row }"><StatusTag :label="row.cleared ? '已完成' : '待确认'" /><span class="customs-extra">{{ row.cleared ? '是' : '否' }}</span></template></el-table-column>
            </el-table>
          </template>
        </DataTableFrame>
      </template>

      <template v-else-if="tab === '部门工作汇总'">
        <el-alert v-if="!permission.stats" type="warning" :closable="false" title="关务统计按 PRD 仅关务部总监查看；演示角色暂无总监，暂向报关行客服开放并记录边界。" />
        <template v-else>
          <form class="customs-filters" aria-label="部门汇总筛选" @submit.prevent="queryDept">
            <label>日期<el-date-picker v-model="deptQuery.range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
            <label>业务类型（必填）<el-select v-model="deptQuery.businessType"><el-option v-for="value in CUSTOMS_BUSINESS_TYPES" :key="value" :value="value" /></el-select></label>
            <el-button type="primary" native-type="submit">查询</el-button>
          </form>
          <div class="summary-cards">
            <div><small>票数</small><strong>{{ deptResult.tickets }}</strong></div>
            <div><small>总提单数</small><strong>{{ deptResult.totalWaybills }}</strong></div>
            <div><small>分单数</small><strong>{{ deptResult.houseBills }}</strong></div>
            <div><small>总重量（kg）</small><strong>{{ deptResult.totalWeight }}</strong></div>
            <div><small>金额（按币种分列）</small><strong>{{ deptResult.amounts.map(row => `${row.currency} ${row.amount}`).join('；') || '—' }}</strong></div>
            <div><small>完成率</small><strong>{{ deptResult.completion.ratio === null ? '待确认' : `${(deptResult.completion.ratio * 100).toFixed(1)}%` }}</strong><span class="customs-extra">已完成 {{ deptResult.completion.completed }} / 未完成 {{ deptResult.completion.unfinished }}</span></div>
          </div>
          <div class="chart-grid">
            <section><h4>运输方式分布</h4><div ref="transportChart" class="customs-chart" role="img" aria-label="运输方式柱状图" /></section>
            <section><h4>服务单完成情况</h4><div ref="completionChart" class="customs-chart" role="img" aria-label="完成情况环形图" /></section>
          </div>
        </template>
      </template>

      <template v-else-if="tab === '成员工作量统计'">
        <el-alert v-if="!permission.stats" type="warning" :closable="false" title="关务统计按 PRD 仅关务部总监查看；演示角色暂无总监，暂向报关行客服开放并记录边界。" />
        <template v-else>
          <form class="customs-filters" aria-label="成员工作量筛选" @submit.prevent="queryMembers">
            <label>日期<el-date-picker v-model="memberQuery.range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" /></label>
            <label>业务类型（必填）<el-select v-model="memberQuery.businessType" @change="memberQuery.clerk = ''"><el-option v-for="value in CUSTOMS_BUSINESS_TYPES" :key="value" :value="value" /></el-select></label>
            <label>报关员<el-select v-model="memberQuery.clerk" clearable filterable placeholder="全部"><el-option v-for="value in clerkOptions" :key="value" :value="value" /></el-select></label>
            <el-button type="primary" native-type="submit">查询</el-button>
          </form>
          <el-table v-if="memberResult.variant === 'crossBorder'" :data="memberResult.rows" stripe size="small" aria-label="成员工作量统计">
            <el-table-column prop="clerk" label="报关员" width="120" />
            <el-table-column prop="parcels" label="包裹数" width="110" />
            <el-table-column prop="totalWaybills" label="总提单数" width="110" />
          </el-table>
          <el-table v-else :data="memberResult.rows" stripe size="small" aria-label="成员工作量统计">
            <el-table-column prop="clerk" label="报关员" width="110" fixed="left" />
            <el-table-column prop="单证报关" label="单证报关" width="95" />
            <el-table-column label="单证出错票数" width="110"><template #default="{ row }">{{ row.单证报关Error }}</template></el-table-column>
            <el-table-column label="单证出错率" width="105"><template #default="{ row }">{{ row.单证报关Rate === null ? '待确认' : `${(row.单证报关Rate * 100).toFixed(1)}%` }}</template></el-table-column>
            <el-table-column prop="代理报关" label="代理报关" width="95" />
            <el-table-column label="代理出错票数" width="110"><template #default="{ row }">{{ row.代理报关Error }}</template></el-table-column>
            <el-table-column label="代理出错率" width="105"><template #default="{ row }">{{ row.代理报关Rate === null ? '待确认' : `${(row.代理报关Rate * 100).toFixed(1)}%` }}</template></el-table-column>
            <el-table-column prop="sends" label="发送票数" width="95" />
            <el-table-column prop="deletes" label="删单" width="75" />
            <el-table-column prop="amends" label="改单" width="75" />
            <el-table-column prop="deletedReturns" label="删单退运" width="95" />
            <el-table-column prop="inspections" label="查验" width="75" />
            <el-table-column prop="loads" label="落装" width="75" />
            <el-table-column prop="reconfigure" label="改配" width="75" />
          </el-table>
          <p v-if="memberResult.zeroDenominator" class="customs-extra">存在出错率分母为零的报关员，按待确认显示，不归零也不补造。</p>
        </template>
      </template>

      <template v-else>
        <el-alert v-if="!permission.stats" type="warning" :closable="false" title="关务统计按 PRD 仅关务部总监查看；演示角色暂无总监，暂向报关行客服开放并记录边界。" />
        <template v-else>
          <form class="customs-filters" aria-label="南沙业务筛选" @submit.prevent="queryNansha">
            <label>年月<el-date-picker v-model="nanshaQuery.fromMonth" type="month" value-format="YYYY-MM" placeholder="开始月" /></label>
            <label>至<el-date-picker v-model="nanshaQuery.toMonth" type="month" value-format="YYYY-MM" placeholder="结束月" /></label>
            <label>业务类型（必填）<el-select v-model="nanshaQuery.businessType"><el-option v-for="value in NANSHA_TYPES" :key="value" :value="value" /></el-select></label>
            <el-button type="primary" native-type="submit">查询</el-button>
          </form>
          <template v-if="nanshaResult.type === '全部'">
            <el-table :data="nanshaResult.composition" size="small" stripe aria-label="南沙业务构成">
              <el-table-column prop="type" label="业务类型" width="140" />
              <el-table-column prop="value" label="数量" width="110" />
              <el-table-column label="占比" width="110"><template #default="{ row }">{{ row.ratio === null ? '待确认' : `${(row.ratio * 100).toFixed(1)}%` }}</template></el-table-column>
            </el-table>
            <p class="customs-extra">合计：{{ nanshaResult.total }}；{{ nanshaResult.ratioNote }}</p>
            <div ref="compositionChart" class="customs-chart" role="img" aria-label="南沙业务构成饼图" />
          </template>
          <el-table v-else :data="nanshaResult.rows" size="small" stripe aria-label="南沙业务月度统计">
            <el-table-column prop="month" label="月份" width="110" />
            <el-table-column prop="count" :label="nanshaResult.type" width="120" />
            <el-table-column prop="inspections" label="查验" width="95" />
            <el-table-column prop="total" label="合计" width="95" />
          </el-table>
          <p v-if="nanshaResult.type !== '全部'" class="customs-extra">合计：{{ nanshaResult.total }}；业务票数与查验工作量相加的口径见 CUSTOMS-B042，保留待确认。</p>
        </template>
      </template>
    </template>

    <el-dialog v-model="declDetailVisible" title="报关单详情（只读）" width="min(860px, 96vw)" align-center>
      <template v-if="declDetail">
        <dl class="detail-grid">
          <div v-for="[label, value] in [['报关单号', declDetail.declarationNo], ['服务单号', declDetailService?.serviceNo], ['业务类型', declDetail.businessType], ['境内收发货人', declDetail.domesticConsignor], ['社会信用代码', declDetail.creditCode], ['监管方式', declDetail.supervisionMode], ['运输方式', declDetail.transportMode], ['运输工具名称', declDetail.conveyanceName], ['提运单号', declDetail.waybillNo], ['进出口标志', declDetail.importExportFlag], ['申报地海关', declDetail.declarationCustoms], ['申报单位', declDetail.declarationUnit], ['申报日期', declDetail.declarationDate], ['是否结关', declDetail.cleared ? '是' : '否'], ['报关类型', declDetail.customsType], ['总毛重（kg）', declDetail.grossWeight], ['总价', `${declDetail.currency} ${declDetail.totalValue}`], ['订单号', declDetail.orderNo], ['分单号', declDetail.houseNo], ['报关员', declDetail.clerk], ['操作记录', Object.entries(declDetail.events || {}).map(([key, actor]) => `${({ sent: '发送单一窗口', amended: '改单', deleted: '删单', inspected: '安排查验', deletedReturn: '删单退运', loaded: '落装', reconfigured: '改配' })[key] || key}（${actor}）`).join('；') || '无']]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
        </dl>
        <el-alert type="info" :closable="false" title="详情与普货关务服务单中的报关单详情一致，仅查看，不提供操作。" />
      </template>
      <template #footer><el-button @click="declDetailVisible = false">返回</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.customs-notice { margin-bottom: 14px; }
.customs-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 16px; }
.customs-filters label { display: flex; flex-direction: column; gap: 8px; width: 185px; color: var(--muted); }
.customs-filters :deep(.el-date-editor) { width: 100%; }
.summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
.summary-cards > div { border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; background: #fafbfd; }
.summary-cards small { display: block; color: var(--muted); font-size: 12px; }
.summary-cards strong { display: block; margin-top: 6px; font-size: 18px; }
.chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); gap: 18px; }
.chart-grid h4 { margin: 0 0 8px; }
.customs-chart { height: 300px; width: 100%; }
.customs-extra { margin-left: 6px; color: var(--muted); font-size: 12px; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 8px 18px; margin: 0; }
.detail-grid dt { color: var(--muted); font-size: 12px; }
.detail-grid dd { margin: 2px 0 10px; }
</style>
