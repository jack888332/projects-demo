<script setup>
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import { CircleClose, Clock, CopyDocument, EditPen, Plus, Promotion, Tickets, View } from '@element-plus/icons-vue'
import ConditionFilter from '../../shared/components/ConditionFilter.vue'
import MetricGrid from '../../shared/components/MetricGrid.vue'
import HoverActionMenu from '../../shared/components/HoverActionMenu.vue'
import BillingConfigDetailDialog from '../components/BillingConfigDetailDialog.vue'
import ConfigVersionHistoryDialog from '../components/ConfigVersionHistoryDialog.vue'
import ConfigVersionCell from '../components/ConfigVersionCell.vue'
import ConfigReferenceDialog from '../components/ConfigReferenceDialog.vue'
import ConfigGenerationDialog from '../components/ConfigGenerationDialog.vue'
import ConfigSchemeOverview from '../components/ConfigSchemeOverview.vue'
import SegmentedControl from '../../shared/components/SegmentedControl.vue'
import StackedCell from '../../shared/components/StackedCell.vue'
import StatusTag from '../../shared/components/StatusTag.vue'
import ConfigVersionTag from '../../shared/components/ConfigVersionTag.vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import { useStagedQuery } from '../../shared/composables/useStagedQuery.js'
import { billingConfigFixtures, billingConfigSeedVersion, billingConfigVersionFixtures, billingCustomerConfigFixtures } from '../../data/fixtures/billingConfigs.js'
import { billingTaskFixtures, billingTaskSeedVersion } from '../../data/fixtures/billingTasks.js'
import { configReferenceStats, createConfigBatchTaskRows, createReceivableConfigNo, createRefundConfigNo, isConfigReferenceActive, numberReceivableSchemes } from '../../domain/configGeneration.js'
import { useDemoDataset } from '../data/useDemoDataset.js'

const activeSection = ref('AR')
const referenceType = ref('ALL')
const activeType = computed(() => activeSection.value === 'references' ? referenceType.value : activeSection.value)
const activeView = computed(() => activeSection.value === 'references' ? 'customers' : 'configs')
const detailVisible = ref(false)
const referenceVisible = ref(false)
const generationVisible = ref(false)
const selectionVisible = ref(false)
const versionHistoryVisible = ref(false)
const detailMode = ref('edit')
const selectedConfig = ref(null)
const targetConfig = ref(null)
const versionHistoryConfig = ref(null)
const selectedCustomer = ref(null)
const focusCustomerCode = ref('')
const generationCustomerCode = ref('')
const editorRef = ref(null)
const demoNow = '2026-08-27'
const initialQuery = { keyword:'', store:'', group:'', usageType:'', status:'' }
const { query, appliedQuery, applyQuery, resetQuery } = useStagedQuery(initialQuery)

const customerReferences = useDemoDataset('billingConfigReferencesV2', billingCustomerConfigFixtures, billingConfigSeedVersion)
const configs = useDemoDataset('billingConfigsUnified', billingConfigFixtures, billingConfigSeedVersion)
const configVersions = useDemoDataset('billingConfigVersionsUnified', billingConfigVersionFixtures, billingConfigSeedVersion)
const taskRecords = useDemoDataset('billingTasks', billingTaskFixtures, billingTaskSeedVersion)
const generationAudits = useDemoDataset('billingGenerationValidationAudits', [], 2026082701)
const referenceTypeOptions = [{ label:'全部', value:'ALL' }, { label:'应收账单配置', value:'AR' }, { label:'返款账单配置', value:'RF' }]
const referenceTypeLabels = { AR:'应收账单配置', RF:'返款账单配置' }
const usageTypes = [{ label:'共享配置', value:'SHARED' }, { label:'独享配置', value:'EXCLUSIVE' }, { label:'未引用配置', value:'UNUSED' }]
const periodLabels = { DAY_1:'1 自然天', DAY_7:'7 自然天', DAY_10:'10 自然天', DAY_15:'15 自然天', HALF_WEEK:'半周', WEEK:'周', HALF_MONTH:'半月', MONTH:'月' }
const periodLabel = value => periodLabels[value] || value || '--'
const settlementCurrency = scheme => { const value = scheme?.feeRules?.find(rule => rule.fallback)?.settlementCurrency; return value === 'SOURCE_CURRENCY' ? '随原始币种' : value || '--' }
const schemePeriodTypes = (snapshot) => {
  if (!snapshot) return '--'
  const periods = [
    snapshot.defaultScheme?.period,
    ...(snapshot.branches || []).filter(branch => branch.enabled !== false).map(branch => branch.period),
  ].filter(Boolean)
  return [...new Set(periods)].map(periodLabel).join('、') || '--'
}
const cloneSnapshot = snapshot => snapshot ? JSON.parse(JSON.stringify(snapshot)) : null
const matchesReferenceType = row => referenceType.value === 'ALL' || row.type === referenceType.value
const referenceTypeLabel = type => referenceTypeLabels[type] || type
const stores = computed(() => [...new Set(customerReferences.value
  .filter(row => matchesReferenceType(row) && isConfigReferenceActive(row, demoNow))
  .map(row => row.store)
  .filter(Boolean))])
const groups = computed(() => [...new Set(customerReferences.value
  .filter(row => matchesReferenceType(row) && isConfigReferenceActive(row, demoNow) && (!query.store || row.store === query.store))
  .map(row => row.group)
  .filter(Boolean))])
const statsFor = config => configReferenceStats(config, customerReferences.value, demoNow)
const activeReferencesFor = config => customerReferences.value.filter(row => row.configId === config.id && isConfigReferenceActive(row, demoNow))
const nextVersionFor = (config) => {
  if (config.no === '新配置') return 'V1'
  const max = Math.max(0, ...configVersions.value.filter(row => row.configId === config.id).map(row => Number(row.version?.slice(1)) || 0), Number(config.version?.slice(1)) || 0)
  return `V${max + 1}`
}
const versionRowsFor = (config) => {
  const snapshots = configVersions.value.filter(row => row.configId === config.id)
  if (!snapshots.some(row => row.version === config.version)) snapshots.push({ ...config, configId:config.id, snapshotId:`${config.id}@${config.version}` })
  return snapshots
    .sort((left, right) => Number(right.version.slice(1)) - Number(left.version.slice(1)))
    .map(snapshot => {
      const isCurrent = snapshot.version === config.version
      const isPending = snapshot.version === config.pendingVersion
      return {
        ...snapshot,
        isCurrent,
        versionStatus:isCurrent ? '生效' : isPending ? '待生效' : snapshot.versionStatus || '历史',
        publishedAt:snapshot.publishedAt || snapshot.updatedAt,
      }
    })
}
const currentPublishedAt = config => {
  const currentVersion = configVersions.value.find(row => row.configId === config.id && row.version === config.version)
  return currentVersion?.publishedAt || currentVersion?.updatedAt || config.publishedAt || config.updatedAt || '--'
}
const configRowsWithStats = computed(() => {
  const type = activeView.value === 'customers' ? selectedCustomer.value?.type || referenceType.value : activeType.value
  return configs.value.filter(row => row.type === type).map(row => ({ ...row, referenceStats:statsFor(row) }))
})
const currentReferences = computed(() => {
  const rows = customerReferences.value.filter(matchesReferenceType)
  const grouped = new Map()
  rows.forEach((row) => {
    const key = `${row.type}:${row.customerCode}`
    const values = grouped.get(key) || []
    values.push(row)
    grouped.set(key, values)
  })
  return [...grouped.values()].map((values) => {
    const active = values.filter(row => isConfigReferenceActive(row, demoNow)).sort((a, b) => b.effectStart.localeCompare(a.effectStart))[0]
    return active || null
  }).filter(Boolean)
})
const customerRows = computed(() => currentReferences.value.filter(row =>
  (!appliedQuery.keyword || `${row.customerCode}${row.customerName}${row.memberCode}${row.configNo}${row.configName}`.includes(appliedQuery.keyword))
  && (!appliedQuery.store || row.store === appliedQuery.store)
  && (!appliedQuery.group || row.group === appliedQuery.group)))
const configRows = computed(() => configRowsWithStats.value.filter(row =>
  (!appliedQuery.keyword || `${row.no}${row.name}`.includes(appliedQuery.keyword))
  && (!appliedQuery.usageType || row.referenceStats.usageType === appliedQuery.usageType)
  && (!appliedQuery.status || row.status === appliedQuery.status)))
const rows = computed(() => activeView.value === 'customers' ? customerRows.value : configRows.value)
const uniqueCustomerCount = list => new Set(list.map(row => row.customerCode)).size
const summary = computed(() => activeView.value === 'customers' ? [
  { label:'引用客户', value:uniqueCustomerCount(customerRows.value), tone:'green' },
  { label:'涉及配置', value:new Set(customerRows.value.map(row => row.configId)).size, tone:'blue' },
  { label:'共享配置客户', value:uniqueCustomerCount(customerRows.value.filter(row => referenceUsage(row).usageType === 'SHARED')), tone:'amber' },
  { label:'独享配置客户', value:uniqueCustomerCount(customerRows.value.filter(row => referenceUsage(row).usageType === 'EXCLUSIVE')), tone:'violet' },
] : [
  { label:'配置总数', value:configRows.value.length, tone:'green' },
  { label:'共享配置', value:configRows.value.filter(row => row.referenceStats.usageType === 'SHARED').length, tone:'blue' },
  { label:'独享配置', value:configRows.value.filter(row => row.referenceStats.usageType === 'EXCLUSIVE').length, tone:'amber' },
  { label:'未引用配置', value:configRows.value.filter(row => row.referenceStats.usageType === 'UNUSED').length, tone:'red' },
])

function resetFilters() {
  resetQuery()
  if (activeView.value === 'customers') referenceType.value = 'ALL'
}
watch(activeSection, () => {
  resetQuery()
  if (activeSection.value === 'references') referenceType.value = 'ALL'
})
watch(referenceType, () => { if (activeSection.value === 'references') resetQuery() })
watch(() => query.store, () => { if (query.group && !groups.value.includes(query.group)) query.group = '' })

const usageTone = type => type === 'SHARED' ? 'info' : type === 'EXCLUSIVE' ? 'success' : 'warning'
function referenceUsage(row) { const config = configs.value.find(item => item.id === row.configId); return config ? statsFor(config) : { usageType:'UNUSED', label:'未配置' } }
const editingReferences = computed(() => selectedConfig.value
  ? customerReferences.value.filter(row => row.configId === selectedConfig.value.id && isConfigReferenceActive(row, demoNow))
  : [])
const editingImpactText = computed(() => editingReferences.value
  .map(row => `${row.customerName}（${row.customerCode}，${row.configNo}-${row.version}）`)
  .join('、'))
function openDetail(config, mode = 'edit') {
  if (mode === 'edit' && config.status === '停用' && config.no !== '新配置') return ElMessage.warning('停用配置不能发布后续版本')
  if (mode === 'edit' && config.pendingVersion) return ElMessage.warning(`已有待生效版本 ${config.no}-${config.pendingVersion}，请先取消原待生效安排`)
  detailMode.value = mode
  selectedConfig.value = {
    ...config,
    schemeSnapshot:cloneSnapshot(config.schemeSnapshot),
    refundSnapshot:cloneSnapshot(config.refundSnapshot),
    isNew:config.no === '新配置',
    publishVersion:nextVersionFor(config),
    publishEffectMode:'IMMEDIATE',
    publishEffectDate:'',
  }
  detailVisible.value = true
}
function openVersionHistory(config) {
  versionHistoryConfig.value = config
  versionHistoryVisible.value = true
}
function viewVersionFromHistory(version) {
  versionHistoryVisible.value = false
  openDetail(version, 'view')
}
function newConfig() {
  openDetail({ id:`${activeType.value}-CFG-${Date.now()}`, type:activeType.value, no:'新配置', name:'', version:'V1', currency:'CNY', cycle:activeType.value === 'AR' ? '月' : '周', sentRule:'账期结束后 1 天', mode:'回款返款', effectStart:'2026-08-27', effectEnd:'长期', operator:'财务管理员', updatedAt:'2026-08-27 10:30', changeReason:'首次发布', status:'启用', forkCustomerCode:'' })
}
function configFromReference(reference) {
  const current = configs.value.find(item => item.id === reference.configId)
  if (!current) return null
  const archived = configVersions.value.find(item => item.configId === reference.configId && item.version === reference.version)
  return {
    ...current,
    ...archived,
    name:reference.configName ?? archived?.name ?? current.name ?? '',
    version:reference.version,
    currency:reference.currency,
    cycle:reference.cycle,
    sentRule:reference.sentRule,
    mode:reference.mode,
    schemeSnapshot:cloneSnapshot(archived?.schemeSnapshot || reference.schemeSnapshot),
    refundSnapshot:cloneSnapshot(archived?.refundSnapshot || reference.refundSnapshot),
    effectStart:archived?.effectStart || reference.effectStart,
    effectEnd:archived?.effectEnd || reference.effectEnd,
    changeReason:`客户引用记录 ${reference.referenceNo}`,
  }
}
function viewConfig(reference) { const snapshot = configFromReference(reference); if (snapshot) openDetail(snapshot, 'view') }
function forkForCustomer(reference) {
  const snapshot = configFromReference(reference)
  if (!snapshot) return
  openDetail({ ...snapshot, id:`${snapshot.type}-CFG-${Date.now()}`, no:'新配置', name:snapshot.name ? `${snapshot.name}-${reference.customerName}` : '', version:'V1', status:'启用', changeReason:`为 ${reference.customerCode} 另存独立配置`, forkCustomerCode:reference.customerCode, isNew:true })
}
function manageReferences(config, customerCode = '') { if (config.status === '停用') return ElMessage.warning('停用配置不能建立新的客户引用'); targetConfig.value = config; focusCustomerCode.value = customerCode; referenceVisible.value = true }
async function cancelPendingVersion(config) {
  if (!config.pendingVersion) return
  try { await ElMessageBox.confirm(`确认取消 ${config.no}-${config.pendingVersion} 在 ${config.pendingEffectiveAt} 的生效安排？该版本号将保留且不能复用。`, '取消待生效版本', { type:'warning' }) } catch { return }
  const snapshot = configVersions.value.find(row => row.configId === config.id && row.version === config.pendingVersion)
  if (snapshot) Object.assign(snapshot, { versionStatus:'已取消', cancelledAt:'2026-08-27 10:50', cancelReason:'财务取消待生效安排' })
  config.pendingVersion = ''
  config.pendingEffectiveAt = ''
  ElMessage.success('待生效安排已取消，版本快照已保留')
}
function chooseForCustomer(reference) { selectedCustomer.value = reference; selectionVisible.value = true }
function selectConfig(config) { if (config.status === '停用') return ElMessage.warning('请选择启用配置'); selectionVisible.value = false; manageReferences(config, selectedCustomer.value?.customerCode || '') }

function persistConfig(next) {
  const existing = configs.value.find(item => item.id === next.id)
  if (next.no === '新配置') next.no = next.type === 'AR' ? createReceivableConfigNo(dayjs(), configs.value.map(row => row.no)) : createRefundConfigNo(dayjs(), configs.value.map(row => row.no))
  if (next.type === 'AR') next.schemeSnapshot = numberReceivableSchemes(next.schemeSnapshot, next.no)
  const { forkCustomerCode = '', isNew: _isNew, publishVersion, publishEffectMode, publishEffectDate, ...persistable } = next
  const version = existing ? publishVersion : 'V1'
  const versionSnapshot = { ...persistable, version, versionStatus:publishEffectMode === 'SCHEDULED' ? '待生效' : '生效', effectiveAt:publishEffectMode === 'SCHEDULED' ? publishEffectDate : demoNow, updatedAt:'2026-08-27 10:45', operator:'财务管理员' }
  configVersions.value.unshift({ ...versionSnapshot, configId:next.id, snapshotId:`${next.id}@${version}` })
  let saved
  if (existing && publishEffectMode === 'SCHEDULED') {
    saved = { ...existing, name:persistable.name, pendingVersion:version, pendingEffectiveAt:publishEffectDate, updatedAt:'2026-08-27 10:45', operator:'财务管理员' }
    configs.value.splice(configs.value.indexOf(existing), 1, saved)
  } else {
    saved = { ...versionSnapshot, pendingVersion:'', pendingEffectiveAt:'' }
    if (existing) configs.value.splice(configs.value.indexOf(existing), 1, saved)
    else configs.value.unshift(saved)
    customerReferences.value
      .filter(row => row.configId === saved.id && isConfigReferenceActive(row, demoNow))
      .forEach(row => Object.assign(row, { configName:saved.name, configNo:saved.no, version:saved.version, currency:saved.currency, cycle:saved.cycle, sentRule:saved.sentRule, schemeSnapshot:cloneSnapshot(saved.schemeSnapshot), refundSnapshot:cloneSnapshot(saved.refundSnapshot), mode:saved.mode, updatedAt:'2026-08-27 10:45', changeReason:`${saved.no}-${saved.version} 统一生效` }))
  }
  return saved
}

async function save() {
  const next = selectedConfig.value
  if (!editorRef.value?.validate()) return
  if (next.publishEffectMode === 'SCHEDULED' && !next.publishEffectDate) return ElMessage.warning('请选择指定生效日期')
  if (next.publishEffectMode === 'SCHEDULED' && !dayjs(next.publishEffectDate).isAfter(demoNow, 'day')) return ElMessage.warning('指定生效日期必须晚于当前日期')
  next.name = next.name?.trim() || ''
  if (next.type === 'AR') {
    const snapshot = editorRef.value?.getSchemeSnapshot?.()
    if (snapshot) Object.assign(next, { schemeSnapshot:snapshot, cycle:periodLabel(snapshot.defaultScheme.period), currency:settlementCurrency(snapshot.defaultScheme), sentRule:`账期结束后 ${snapshot.defaultScheme.sendAfterDays} 天` })
  } else {
    const snapshot = editorRef.value?.getRefundSnapshot?.()
    if (snapshot) {
      const fallbackCurrency = snapshot.currencyRules.find(rule => rule.fallback)?.settlementCurrency || '--'
      Object.assign(next, {
        refundSnapshot:snapshot,
        mode:snapshot.refundMode === 'SIGNED' ? '签收返款' : '回款返款',
        cycle:snapshot.billingPeriodType === 'HALF_WEEK' ? '半周' : '周',
        currency:fallbackCurrency,
        sentRule:`账期结束后 ${snapshot.sendAfterDays} 天`,
        effectStart:snapshot.effectPeriod[0],
        effectEnd:snapshot.effectPeriod[1] || '长期',
        status:snapshot.enabled ? '启用' : '停用',
      })
    }
  }
  if (next.isNew) {
    targetConfig.value = next
    focusCustomerCode.value = next.forkCustomerCode || ''
    detailVisible.value = false
    referenceVisible.value = true
    return
  }
  const existing = configs.value.find(item => item.id === next.id)
  const beforeStats = existing ? statsFor(existing) : { total:0, label:'未引用配置' }
  const effectiveText = next.publishEffectMode === 'SCHEDULED' ? `${next.publishEffectDate} 00:00 起` : '发布成功后立即'
  const message = existing
    ? `当前配置由 ${beforeStats.total} 个客户引用。${effectiveText}生效时，全部引用客户将统一采用 ${next.no}-${next.publishVersion}；已创建任务和已有账单继续使用历史版本。`
    : `首次发布将形成 ${next.publishVersion}，并于${effectiveText}生效；发布前的编辑内容不会另存为草稿。`
  try { await ElMessageBox.confirm(message, '确认发布配置版本', { type:beforeStats.total > 1 ? 'warning' : 'info' }) } catch { return }
  const saved = persistConfig(next)
  detailVisible.value = false
  if (next.publishEffectMode === 'SCHEDULED') ElMessage.success(`${next.no}-${saved.version} 已发布，将于 ${next.publishEffectDate} 统一生效`)
  else ElMessage.success(`${saved.no}-${saved.version} 已发布并生效，${beforeStats.total} 个引用客户已统一采用新版`)
}

function finishNewConfig(payload) {
  const next = targetConfig.value
  if (!next?.isNew) return
  const publishMode = next.publishEffectMode
  const publishDate = next.publishEffectDate
  const saved = persistConfig(next)
  if (!saved) return
  targetConfig.value = saved
  const customerCount = payload.customers?.length || 0
  if (customerCount) {
    assignReferences(payload, true)
    const scheduledText = publishMode === 'SCHEDULED' ? `，将于 ${publishDate} 统一生效` : '，发布后立即生效'
    ElMessage.success(`${saved.no}-${saved.version} 已发布${scheduledText}，已为 ${customerCount} 个客户建立配置引用`)
  } else {
    if (publishMode === 'SCHEDULED') ElMessage.success(`${saved.no}-${saved.version} 已发布，将于 ${publishDate} 统一生效；未指定适用客户，当前为未引用配置`)
    else ElMessage.success(`${saved.no}-${saved.version} 已发布并生效，当前为未引用配置`)
  }
  focusCustomerCode.value = ''
  referenceVisible.value = false
}
function skipNewConfig() {
  finishNewConfig({ customers: [] })
}
function handleReferenceConfirm(payload) {
  if (targetConfig.value?.isNew) finishNewConfig(payload)
  else assignReferences(payload)
}

function assignReferences(payload, silent = false) {
  payload.customers.forEach((candidate, index) => {
    const customerHistory = customerReferences.value.filter(row => row.type === candidate.type && row.customerCode === candidate.customerCode)
    const exactStart = customerHistory.find(row => row.configId && row.effectStart === payload.effectiveAt)
    const activeAtSwitch = customerHistory
      .filter(row => isConfigReferenceActive(row, payload.effectiveAt))
      .sort((a, b) => b.effectStart.localeCompare(a.effectStart))[0]
    const nextFuture = customerHistory
      .filter(row => row.configId && dayjs(row.effectStart).isAfter(payload.effectiveAt, 'day'))
      .sort((a, b) => a.effectStart.localeCompare(b.effectStart))[0]
    const nextEnd = nextFuture ? dayjs(nextFuture.effectStart).subtract(1, 'day').format('YYYY-MM-DD') : null

    if (!exactStart && activeAtSwitch && dayjs(activeAtSwitch.effectStart).isBefore(payload.effectiveAt, 'day')) {
      activeAtSwitch.effectEnd = dayjs(payload.effectiveAt).subtract(1, 'day').format('YYYY-MM-DD')
      activeAtSwitch.updatedAt = '2026-08-27 10:45'
      activeAtSwitch.changeReason = payload.reason || '切换配置，结束原配置引用'
    }

    if (exactStart) Object.assign(exactStart, {
      status:'已替换',
      updatedAt:'2026-08-27 10:45',
      changeReason:payload.reason || '同日起始的计划引用已被新引用替换',
    })

    const referenceValues = {
      referenceNo:`${candidate.type}-REF-${candidate.customerCode}-${Date.now()}-${index + 1}`,
      configId:targetConfig.value.id,
      configName:targetConfig.value.name,
      configNo:targetConfig.value.no,
      version:targetConfig.value.version,
      currency:targetConfig.value.currency,
      cycle:targetConfig.value.cycle,
      sentRule:targetConfig.value.sentRule,
      schemeSnapshot:cloneSnapshot(targetConfig.value.schemeSnapshot),
      refundSnapshot:cloneSnapshot(targetConfig.value.refundSnapshot),
      mode:targetConfig.value.mode,
      effectStart:payload.effectiveAt,
      effectEnd:nextEnd || '长期',
      status:'启用',
      operator:'财务管理员',
      updatedAt:'2026-08-27 10:45',
      changeReason:payload.reason || '建立配置引用',
    }
    customerReferences.value.push({
      ...candidate,
      id:`${candidate.type}-R-${candidate.customerCode}-${Date.now()}-${index + 1}`,
      ...referenceValues,
    })
  })
  focusCustomerCode.value = ''
  if (!silent) ElMessage.success(`已为 ${payload.customers.length} 个客户建立配置引用，原引用按生效日留存${payload.force ? '，强制替换已留痕' : ''}`)
}
function openGeneration(config, customerCode = '') { targetConfig.value = config; generationCustomerCode.value = customerCode; generationVisible.value = true }
function confirmGeneration(payload) {
  if (!payload.scopes.length) {
    const auditNo = `BMSV-${Date.now()}`
    generationAudits.value.unshift({ auditNo, configNo:targetConfig.value.no, configVersion:targetConfig.value.version, candidateCustomerCount:payload.candidateCustomerCount, blockedCount:payload.blockedCount, unselectedCount:payload.unselectedCount, cutoff:payload.cutoff, reason:payload.reason, createdAt:'2026-08-27 16:45:00', operator:'财务管理员' })
    return ElMessage.warning(payload.mode === 'SINGLE' ? `未生成账单任务；校验审计 ${auditNo} 已保存` : `未创建批次或任务；校验审计 ${auditNo} 已保存`)
  }
  const { batchNo, rows:createdTasks } = createConfigBatchTaskRows({ config:targetConfig.value, scopes:payload.scopes, skippedCount:payload.skippedCount, frozenCustomerCount:payload.frozenCustomerCount, cutoff:payload.cutoff, existingTasks:taskRecords.value })
  taskRecords.value.unshift(...createdTasks)
  if (payload.mode === 'SINGLE') ElMessage.success(`已为 ${payload.customerName}（${payload.customerCode}）生成 ${createdTasks.length} 条账单任务`)
  else ElMessage.success(`批次 ${batchNo} 已创建，生成 ${createdTasks.length} 条客户任务`)
}
function generate(reference) { const snapshot = configFromReference(reference); if (snapshot) openGeneration(snapshot, reference.customerCode) }
</script>

<template>
  <div class="module-page live-reference-page">
    <SegmentedControl v-model="activeSection" :options="[{ label:'应收账单配置', value:'AR' }, { label:'返款账单配置', value:'RF' }, { label:'客户引用配置情况', value:'references' }]" aria-label="账单配置区域" />
    <section class="condition-query-panel"><div class="condition-filter-bar">
      <ConditionFilter v-if="activeView === 'customers'" v-model="referenceType" label="配置类型" :options="referenceTypeOptions" :clearable="false" />
      <ConditionFilter v-model="query.keyword" :label="activeView === 'customers' ? '客户' : '配置'" type="text" />
      <template v-if="activeView === 'customers'"><ConditionFilter v-model="query.store" label="所属店铺" :options="stores" /><ConditionFilter v-model="query.group" label="所属客户组" :options="groups" /></template>
      <ConditionFilter v-else v-model="query.usageType" label="配置标签" :options="usageTypes" />
      <ConditionFilter v-if="activeView === 'configs'" v-model="query.status" label="状态" :options="['启用','停用']" />
      <div class="condition-filter-actions linked-query-actions"><el-button type="primary" @click="applyQuery">查询</el-button><el-button @click="resetFilters">重置</el-button></div>
    </div></section>
    <MetricGrid class="reference-kpis" :items="summary" :columns="summary.length" />
    <section class="module-panel">
      <DataTableFrame :total="rows.length" :selected-count="0">
        <template #actions><el-button v-if="activeView === 'configs'" type="primary" :icon="Plus" @click="newConfig">新建配置</el-button></template>
        <el-table v-if="activeView === 'customers'" :data="rows" border row-key="id" class="clean-table">
          <el-table-column label="客户（会员）" min-width="190"><template #default="scope"><StackedCell :primary="scope.row.customerName" :secondary="scope.row.customerCode" /></template></el-table-column>
          <el-table-column prop="memberCode" label="会员编码" min-width="125" show-overflow-tooltip />
          <el-table-column prop="store" label="所属店铺" min-width="150" show-overflow-tooltip />
          <el-table-column prop="group" label="所属客户组" min-width="150" show-overflow-tooltip />
          <el-table-column v-if="referenceType === 'ALL'" label="配置类型" width="135"><template #default="scope">{{ referenceTypeLabel(scope.row.type) }}</template></el-table-column>
          <el-table-column label="引用配置" min-width="250"><template #default="scope"><StackedCell :primary="scope.row.configNo && scope.row.configNo !== '-' ? scope.row.configNo : '未配置'" :secondary="scope.row.configName && scope.row.configName !== '未配置' ? scope.row.configName : '--'" :title="scope.row.configNo" /></template></el-table-column>
          <el-table-column label="配置版本" min-width="100"><template #default="scope"><ConfigVersionTag :version="scope.row.version" /></template></el-table-column>
          <el-table-column label="配置标签" width="125"><template #default="scope"><StatusTag :label="referenceUsage(scope.row).label" :tone="usageTone(referenceUsage(scope.row).usageType)" /></template></el-table-column>
          <el-table-column v-if="referenceType !== 'RF'" label="分支方案数量" width="125"><template #default="scope"><ConfigSchemeOverview v-if="scope.row.type === 'AR'" :snapshot="scope.row.schemeSnapshot" compact /><span v-else>--</span></template></el-table-column>
          <el-table-column label="账期类型" min-width="150"><template #default="scope">{{ scope.row.type === 'AR' ? schemePeriodTypes(scope.row.schemeSnapshot) : scope.row.cycle || '--' }}</template></el-table-column>
          <TableActionColumn><template #default="scope"><HoverActionMenu><el-dropdown-item :icon="View" @click="viewConfig(scope.row)">查看配置</el-dropdown-item><el-dropdown-item :icon="CopyDocument" @click="forkForCustomer(scope.row)">另存为新配置</el-dropdown-item><el-dropdown-item :icon="Promotion" @click="chooseForCustomer(scope.row)">更换配置</el-dropdown-item><el-dropdown-item :icon="Tickets" @click="generate(scope.row)">生成账单</el-dropdown-item></HoverActionMenu></template></TableActionColumn>
        </el-table>
        <el-table v-else :data="rows" border row-key="id" class="clean-table">
          <el-table-column label="配置编号" min-width="235"><template #default="scope"><StackedCell :primary="scope.row.no" :secondary="scope.row.name || '--'" /></template></el-table-column><el-table-column label="配置版本" width="190"><template #default="scope"><ConfigVersionCell :current-version="scope.row.version" :pending-version="scope.row.pendingVersion" :pending-effective-at="scope.row.pendingEffectiveAt" /></template></el-table-column>
          <el-table-column label="配置标签" width="145"><template #default="scope"><StatusTag :label="scope.row.referenceStats.label" :tone="usageTone(scope.row.referenceStats.usageType)" /></template></el-table-column>
          <el-table-column label="命中客户" width="115"><template #default="scope"><strong>{{ scope.row.referenceStats.total }}</strong></template></el-table-column>
          <el-table-column v-if="activeType === 'AR'" label="分支方案数量" width="125"><template #default="scope"><ConfigSchemeOverview :snapshot="scope.row.schemeSnapshot" compact /></template></el-table-column><template v-else><el-table-column prop="currency" label="默认结算币种" width="125" /><el-table-column prop="cycle" label="账期类型" width="110" /></template>
          <el-table-column label="发布时间" width="165"><template #default="scope">{{ currentPublishedAt(scope.row) }}</template></el-table-column><el-table-column label="状态" width="85"><template #default="scope"><StatusTag :label="scope.row.status" /></template></el-table-column>
          <TableActionColumn><template #default="scope"><HoverActionMenu><el-dropdown-item :icon="Clock" @click="openVersionHistory(scope.row)">查看版本记录</el-dropdown-item><el-dropdown-item :icon="EditPen" :disabled="scope.row.status === '停用' || Boolean(scope.row.pendingVersion)" @click="openDetail(scope.row)">编辑并发布新版本</el-dropdown-item><el-dropdown-item v-if="scope.row.pendingVersion" class="danger-action" :icon="CircleClose" @click="cancelPendingVersion(scope.row)">取消待生效版本</el-dropdown-item><el-dropdown-item :icon="Promotion" :disabled="scope.row.status === '停用'" @click="manageReferences(scope.row)">管理客户引用</el-dropdown-item><el-dropdown-item :icon="Tickets" @click="openGeneration(scope.row)">批量生成账单</el-dropdown-item></HoverActionMenu></template></TableActionColumn>
        </el-table>
      </DataTableFrame>
    </section>

    <BillingConfigDetailDialog
      v-model="detailVisible"
      ref="editorRef"
      :config="selectedConfig"
      :detail-mode="detailMode"
      :active-type="selectedConfig?.type || activeType"
      :reference-stats="selectedConfig ? statsFor(selectedConfig) : undefined"
      :editing-references="editingReferences"
      :editing-impact-text="editingImpactText"
      @save="save"
    />

    <ConfigVersionHistoryDialog
      v-model="versionHistoryVisible"
      :config="versionHistoryConfig"
      :versions="versionHistoryConfig ? versionRowsFor(versionHistoryConfig) : []"
      @view="viewVersionFromHistory"
    />

    <el-dialog v-model="selectionVisible" class="module-dialog module-dialog-standard" align-center append-to-body destroy-on-close>
      <template #header><div class="drawer-title"><span>选择配置</span><small>{{ selectedCustomer?.customerCode }} {{ selectedCustomer?.customerName }}</small></div></template>
      <DataTableFrame :total="configRowsWithStats.length" :selected-count="0" :page-size="10" :column-sort="false"><el-table :data="configRowsWithStats" border row-key="id"><el-table-column label="配置编号" min-width="230"><template #default="scope"><StackedCell :primary="scope.row.no" :secondary="scope.row.name || '--'" /></template></el-table-column><el-table-column label="配置版本" width="100"><template #default="scope"><ConfigVersionTag :version="scope.row.version" /></template></el-table-column><el-table-column label="配置标签" width="145"><template #default="scope"><StatusTag :label="scope.row.referenceStats.label" :tone="usageTone(scope.row.referenceStats.usageType)" /></template></el-table-column><TableActionColumn compact><template #default="scope"><el-button link type="primary" :disabled="scope.row.status === '停用'" @click="selectConfig(scope.row)">选择</el-button></template></TableActionColumn></el-table></DataTableFrame>
    </el-dialog>

    <ConfigReferenceDialog v-model="referenceVisible" :config="targetConfig" :customers="currentReferences" :reference-history="customerReferences" :tasks="taskRecords" :focus-customer-code="focusCustomerCode" :creating="Boolean(targetConfig?.isNew)" @confirm="handleReferenceConfirm" @skip="skipNewConfig" />
    <ConfigGenerationDialog v-model="generationVisible" :config="targetConfig" :references="customerReferences" :tasks="taskRecords" :focus-customer-code="generationCustomerCode" @confirm="confirmGeneration" />
  </div>
</template>
