import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import { useStagedQuery } from '../../shared/composables/useStagedQuery.js'
import { formatAmount, matchesKeyword, normalizeCostBoard, numericAmount } from '../../domain/costLogic.js'
import { useCostTable } from '../useCostTable.js'

export function useCostCenterState(props) {
  const router = useRouter()
  const sampleFiles = useCostTable('sampleFiles')
  const suppliers = useCostTable('suppliers')
  const bills = useCostTable('bills')
  const costs = useCostTable('costs')
  const pools = useCostTable('pools')
  const fees = useCostTable('fees')
  const allocationRules = useCostTable('allocationRules')

  const initialQuery = { keyword: '', supplier: '', board: '', status: '', type: '', period: [] }
  const { query, appliedQuery, applyQuery, resetQuery } = useStagedQuery(initialQuery)
  const ruleType = ref('base')
  const feeBoard = ref('')
  const selectedRecord = ref(null)
  const detailVisible = ref(false)
  const editorVisible = ref(false)
  const editorType = ref('')
  const editorDraft = reactive({})
  const importStep = ref(1)
  const selectedFile = ref('')
  const billDetailTab = ref('costs')

  const money = (value, currency) => `${formatAmount(value)} ${currency || ''}`.trim()
  const option = (value) => ({ label: value, value })
  const uniqueOptions = (rows, field) => [...new Set(rows.value.map((row) => row[field]).filter(Boolean))].map(option)
  const supplierOptions = computed(() => uniqueOptions(suppliers, 'name'))
  const boardOptions = computed(() => [...new Set([
    ...suppliers.value.flatMap((row) => row.boards || []).map((value) => value.endsWith('成本') ? value : `${value}成本`),
    ...fees.value.map((row) => row.board),
  ])].map(option))
  const statusOptions = computed(() => [...new Set([
    ...suppliers.value.map((row) => row.state), ...bills.value.map((row) => row.state),
    ...pools.value.map((row) => row.status), ...fees.value.map((row) => row.status),
  ])].filter(Boolean).map(option))
  const selectedBill = computed(() => bills.value.find((row) => row.id === props.selectedBillId) || bills.value[0] || {})
  const selectedBillCosts = computed(() => costs.value.filter((row) => row.bill === selectedBill.value.id))

  function contains(row, fields = []) {
    return matchesKeyword(row, appliedQuery.keyword, fields)
  }
  function matchesCommon(row) {
    const board = normalizeCostBoard(row.board)
    return (!appliedQuery.supplier || row.supplier === appliedQuery.supplier || row.name === appliedQuery.supplier)
      && (!appliedQuery.board || board === appliedQuery.board)
      && (!appliedQuery.status || row.status === appliedQuery.status || row.state === appliedQuery.status)
  }
  const filteredSuppliers = computed(() => suppliers.value.filter((row) => contains(row, ['code', 'name']) && matchesCommon(row)))
  const filteredBills = computed(() => bills.value.filter((row) => contains(row, ['id', 'supplier', 'file']) && matchesCommon(row)))
  const filteredPools = computed(() => pools.value.filter((row) => contains(row, ['id', 'bill', 'supplier', 'fee']) && matchesCommon(row)))
  const filteredRules = computed(() => allocationRules.value.filter((row) => {
    const wantedType = ruleType.value === 'base' ? row.supplier === '全部供应商' : row.supplier !== '全部供应商'
    return wantedType && contains(row, ['id', 'fee', 'scope', 'supplier']) && matchesCommon(row)
  }))
  const filteredFees = computed(() => fees.value.filter((row) => (!feeBoard.value || row.board === feeBoard.value)
    && contains(row, ['code', 'name', 'definition']) && matchesCommon(row)))

  const overviewKpis = computed(() => {
    const byCurrency = (currency) => bills.value.filter((row) => row.currency === currency).reduce((sum, row) => sum + numericAmount(row.amount), 0)
    return [
      { label: '供应商', value: `${suppliers.value.length} 家`, tone: 'blue' },
      { label: '成本账单', value: `${bills.value.length} 份`, tone: 'green' },
      { label: '待结清金额', value: `${formatAmount(byCurrency('CNY') / 1000, 1)} 千 CNY`, tone: 'amber' },
      { label: '待处理分摊集', value: `${pools.value.filter((row) => !['已分摊', '不分摊'].includes(row.status)).length} 个`, tone: 'red' },
    ]
  })
  const billKpis = computed(() => [
    { label: '成本明细', value: `${selectedBill.value.rows || 0} 笔`, tone: 'blue' },
    { label: '账单金额', value: money(numericAmount(selectedBill.value.amount), selectedBill.value.currency), tone: 'amber' },
    { label: '已结清金额', value: money(numericAmount(selectedBill.value.settled), selectedBill.value.currency), tone: 'green' },
  ])

  const profitRows = [
    { order: 'SO-OG0370-61428', customer: 'JYK-深圳立杰海快', route: '台湾海快', revenue: 8620, direct: 5183, indirect: 882, profit: 2555, rate: '29.64%', status: '成本已齐' },
    { order: 'SO-SZT-A-2606881', customer: '环球虾皮', route: '台湾空运', revenue: 6280, direct: 3916, indirect: 614, profit: 1750, rate: '27.87%', status: '成本已齐' },
    { order: 'SO-OG0347-62018', customer: '测试客户1', route: '台湾海快', revenue: 4960, direct: 3082, indirect: 1034, profit: 844, rate: '17.02%', status: '成本未齐' },
    { order: 'SO-ZMB-2606152', customer: 'ZMB', route: '台湾海快', revenue: 12800, direct: 7960, indirect: 2284, profit: 2556, rate: '19.97%', status: '成本未齐' },
  ]
  const filteredProfitRows = computed(() => profitRows.filter((row) => (
    matchesKeyword(row, appliedQuery.keyword, ['order', 'customer'])
    && (!appliedQuery.type || row.route === appliedQuery.type)
    && (!appliedQuery.status || row.status === appliedQuery.status)
  )))

  function navigate(path) { router.push(path) }
  function showDetail(row) { selectedRecord.value = row; detailVisible.value = true }
  function openEditor(type, row = {}) {
    editorType.value = type
    Object.keys(editorDraft).forEach((key) => delete editorDraft[key])
    Object.assign(editorDraft, JSON.parse(JSON.stringify(row)))
    editorVisible.value = true
  }
  function saveEditor() {
    const registry = { supplier: [suppliers, 'code', 'SUP-NEW'], rule: [allocationRules, 'id', 'RULE-NEW'], fee: [fees, 'code', 'COST-NEW'] }
    const [rows, key, prefix] = registry[editorType.value] || []
    if (!rows) return
    if (!editorDraft[key]) editorDraft[key] = `${prefix}-${Date.now().toString().slice(-5)}`
    const index = rows.value.findIndex((row) => row[key] === editorDraft[key])
    const saved = JSON.parse(JSON.stringify(editorDraft))
    if (index >= 0) rows.value[index] = saved
    else rows.value.unshift(saved)
    editorVisible.value = false
    ElMessage.success('已保存到原型数据库')
  }
  async function toggleStatus(row, field = 'status') {
    const next = row[field] === '启用' ? '停用' : '启用'
    await ElMessageBox.confirm(`确认将状态改为“${next}”？`, '状态确认', { type: 'warning' })
    row[field] = next
    ElMessage.success(`已${next}`)
  }
  function settleBill(row) {
    row.settled = row.amount
    row.state = '已结清'
    ElMessage.success('账单已登记结清')
  }
  function chooseFile(file) { selectedFile.value = file.id; importStep.value = 2 }
  function finishImport() {
    const file = sampleFiles.value.find((row) => row.id === selectedFile.value)
    if (!file) return
    const source = bills.value.find((row) => row.supplier === file.supplier && row.board === file.board) || bills.value[0]
    const id = `APB-${file.supplier}-${Date.now().toString().slice(-8)}`
    bills.value.unshift({ ...JSON.parse(JSON.stringify(source || {})), id, supplier: file.supplier, board: file.board, file: file.name, created: new Date().toISOString().slice(0, 10), state: '待结清', settled: '0.000' })
    ElMessage.success('供应商账单已生成')
    navigate('/cost/bills')
  }

  return {
    sampleFiles, suppliers, bills, costs, pools, fees, allocationRules,
    query, applyQuery, resetQuery, ruleType, feeBoard, selectedRecord, detailVisible,
    editorVisible, editorType, editorDraft, importStep, selectedFile, billDetailTab,
    money, supplierOptions, boardOptions, statusOptions, selectedBill, selectedBillCosts,
    filteredSuppliers, filteredBills, filteredPools, filteredRules, filteredFees,
    overviewKpis, billKpis, filteredProfitRows,
    navigate, showDetail, openEditor, saveEditor, toggleStatus, settleBill, chooseFile, finishImport,
  }
}
