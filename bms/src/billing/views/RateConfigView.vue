<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import { Delete, EditPen, Plus, RefreshRight } from '@element-plus/icons-vue'
import ConditionFilter from '../../shared/components/ConditionFilter.vue'
import HoverActionMenu from '../../shared/components/HoverActionMenu.vue'
import DataTableFrame from '../../shared/components/DataTableFrame.vue'
import BaseRateDialog from '../components/BaseRateDialog.vue'
import RateConfigAssignmentDialog from '../components/RateConfigAssignmentDialog.vue'
import RateConfigEditorDialog from '../components/RateConfigEditorDialog.vue'
import RateConfigLibraryTable from '../components/RateConfigLibraryTable.vue'
import RateConfigPublishDialog from '../components/RateConfigPublishDialog.vue'
import ConfigVersionHistoryDialog from '../components/ConfigVersionHistoryDialog.vue'
import RateCustomerReferenceTable from '../components/RateCustomerReferenceTable.vue'
import RateSnapshotDialog from '../components/RateSnapshotDialog.vue'
import { useStagedQuery } from '../../shared/composables/useStagedQuery.js'
import { billingBaseRateFixtures, billingRateConfigFixtures, billingRateFixtures } from '../../data/fixtures/billingRates.js'
import {
  activeRateReferenceFor,
  activeRateReferencesForConfig,
  calculateRateConfigRules,
  rateCurrencyPairKey,
  rateRulesFor,
  switchRateReference,
  validateRateConfigRules,
} from '../../domain/rateConfig.js'
import { customerRelationSummary, matchCustomerRelations, validateCustomerIdentity } from '../../domain/customerRelations.js'
import { useDemoDataset } from '../data/useDemoDataset.js'

const AS_OF_DATE = '2026-08-27'
const baseRates = useDemoDataset('billingBaseRates', billingBaseRateFixtures)
const referenceRows = useDemoDataset('billingRateCustomerReferences', billingRateFixtures, 2026090101)
const rateConfigs = useDemoDataset('billingRateConfigs', billingRateConfigFixtures, 2026083101)
const activeView = ref('configs')
const baseRateDialogVisible = ref(false)
const baseRateDraft = ref(null)
const baseRateEditing = ref(null)
const editorVisible = ref(false)
const snapshotVisible = ref(false)
const publishingVisible = ref(false)
const assignmentVisible = ref(false)
const versionHistoryVisible = ref(false)
const editingId = ref(null)
const selectedConfig = ref(null)
const draft = ref(null)
const viewingReference = ref(null)
const viewingConfig = ref(null)
const viewingVersionCode = ref('')
const versionHistoryConfig = ref(null)
const forkCustomer = ref(null)
const forkSwitchDate = ref(AS_OF_DATE)
const forkReason = ref('')
const publishEffectMode = ref('IMMEDIATE')
const publishSwitchDate = ref('')
const publishReason = ref('')
const assignmentCodes = ref([])
const assignmentDate = ref(AS_OF_DATE)
const assignmentReason = ref('')
const assignmentStore = ref([])
const assignmentGroup = ref([])
const assignmentVersion = ref('')
const pendingNewConfig = ref(null)
const initialQuery = { keyword:'', store:'', group:'', shareType:'', status:'' }
const { query, appliedQuery, applyQuery, resetQuery } = useStagedQuery(initialQuery)
const shareTypes = [{ label:'未引用配置', value:'UNREFERENCED' }, { label:'独享配置', value:'EXCLUSIVE' }, { label:'共享配置', value:'SHARED' }]
const currencyPairs = [{ label:'USD -> CNY', value:'USD -> CNY' }, { label:'GBP -> CNY', value:'GBP -> CNY' }, { label:'CAD -> CNY', value:'CAD -> CNY' }, { label:'CNY -> USD', value:'CNY -> USD' }]

const customerDirectory = computed(() => {
  const unique = new Map()
  referenceRows.value.forEach((row) => {
    if (unique.has(row.customerCode)) return
    const relation = customerRelationSummary(row)
    const identityValidation = validateCustomerIdentity(row)
    unique.set(row.customerCode, {
      customerCode:row.customerCode,
      customerName:row.customerName,
      memberCode:relation.memberCode,
      store:relation.store,
      group:relation.group,
      relations:relation.relations,
      identityIssues:identityValidation.issues,
    })
  })
  return [...unique.values()]
})
const stores = computed(() => [...new Set(customerDirectory.value.map(row => row.store).filter(Boolean))])
const groups = computed(() => [...new Set(customerDirectory.value
  .filter(row => !query.store || row.store === query.store)
  .map(row => row.group)
  .filter(Boolean))])
const assignmentGroups = computed(() => [...new Set(customerDirectory.value
  .filter(row => !assignmentStore.value.length || assignmentStore.value.includes(row.store))
  .map(row => row.group)
  .filter(Boolean))])

watch(activeView, resetQuery)
watch(() => query.store, () => { if (query.group && !groups.value.includes(query.group)) query.group = '' })
watch(assignmentStore, () => { assignmentGroup.value = assignmentGroup.value.filter(group => assignmentGroups.value.includes(group)) })
watch(assignmentVisible, (open) => {
  if (!open && pendingNewConfig.value && !rateConfigs.value.includes(pendingNewConfig.value)) {
    pendingNewConfig.value = null
    selectedConfig.value = null
  }
})

const formatDirection = direction => direction?.replace('->', '→') || '--'
const formatRate = (rate) => { if (rate === null || rate === undefined || rate === '--') return '--'; const value = Number(rate); return Number.isNaN(value) ? '--' : value.toFixed(6) }
const baseRateNow = '2026-08-27 17:12'
function openAddBaseRate() {
  baseRateEditing.value = null
  baseRateDraft.value = { pair:'USD / CNY', direction:'USD -> CNY', rate:null, source:'手动添加', sourceAt:baseRateNow, status:'待确认', current:'否' }
  baseRateDialogVisible.value = true
}
function openEditBaseRate(row) {
  baseRateEditing.value = row
  baseRateDraft.value = {
    pair:row.pair || 'USD / CNY',
    direction:row.direction || 'USD -> CNY',
    rate:Number(row.rate),
    source:row.source || '手动添加',
    sourceAt:row.sourceAt || baseRateNow,
    status:row.status || '待确认',
    current:row.current || '否',
  }
  baseRateDialogVisible.value = true
}
function saveBaseRate() {
  const draft = baseRateDraft.value
  if (!draft?.pair || !draft.direction) return ElMessage.warning('请选择货币对和汇兑方向')
  const rate = Number(draft.rate)
  if (!(rate > 0)) return ElMessage.warning('基准汇率必须大于 0')
  const record = { ...draft, rate, sourceAt:baseRateNow }
  const target = baseRateEditing.value
  if (target) Object.assign(target, record)
  else baseRates.value.unshift(record)
  if (record.current === '是') {
    const pairKey = rateCurrencyPairKey(record.direction)
    baseRates.value.forEach((row) => {
      if (row !== (target || record) && rateCurrencyPairKey(row.direction) === pairKey) row.current = '否'
    })
  }
  baseRateDialogVisible.value = false
  baseRateEditing.value = null
  ElMessage.success('基准汇率已保存，特调预览已动态重算')
}
const configById = id => rateConfigs.value.find(config => config.id === id)
const versionOf = (config, version) => config?.versions?.find(item => item.version === version)
const currentVersionOf = config => versionOf(config, config?.currentVersion) || config?.versions?.[0]
const activeReferenceFor = (customerCode, date = AS_OF_DATE) => activeRateReferenceFor(referenceRows.value, customerCode, date)
const currentReferences = config => activeRateReferencesForConfig(referenceRows.value, config?.id, AS_OF_DATE)
const referenceCount = config => currentReferences(config).length
const shareTypeOf = config => { const count = referenceCount(config); return count === 0 ? 'UNREFERENCED' : count === 1 ? 'EXCLUSIVE' : 'SHARED' }
const referenceLabel = config => {
  const count = referenceCount(config)
  return count === 0 ? '未引用配置' : count === 1 ? '独享配置' : '共享配置'
}
const referenceTone = config => { const count = referenceCount(config); return count === 0 ? 'warning' : count === 1 ? 'success' : 'info' }
const ruleSummary = rules => rules.length ? rules.map(rule => `${formatDirection(rule.direction)} ${formatRate(rule.result)}`).join('；') : '--'
const ratePreviewLines = rules => rules.length ? rules.map(rule => `${formatDirection(rule.direction)} ${formatRate(rule.result)}`) : ['--']
const adjustRuleLines = rules => rules.length ? rules.map(rule => rule.method === '固定汇率值'
  ? rule.method
  : `${rule.method} · ${rule.adjustDirection} ${rule.adjustValue}`) : ['--']
const calculatedRulesOf = version => calculateRateConfigRules(version || {}, baseRates.value)
const snapshotRulesOf = version => rateRulesFor(version).map(rule => ({ ...rule, adjustValue:Number(rule.adjustValue) }))
function enrichReference(row) {
  const config = configById(row?.configId)
  const version = versionOf(config, row?.configVersion)
  const rules = calculatedRulesOf(version)
  const relations = customerRelationSummary(row)
  return {
    ...row,
    config,
    configName:config ? (config.name || config.no) : '未配置',
    configRemark:config?.name || '--',
    configNo:config?.no || '--',
    configVersion:row?.configVersion || '--',
    referenceLabel:config ? referenceLabel(config) : '未配置',
    referenceTone:config ? referenceTone(config) : 'warning',
    memberCode:relations.memberCode || '--',
    store:relations.store || '--',
    group:relations.group || '--',
    rules,
    ruleCount:rules.length || '--',
    ruleSummary:ruleSummary(rules),
    ratePreviewLines:ratePreviewLines(rules),
    adjustRuleLines:adjustRuleLines(rules),
  }
}
const versionStatusOf = (config, version) => version?.version === config?.currentVersion ? '生效' : version?.version === config?.pendingVersion ? '待生效' : version?.versionStatus || '历史'
const viewingVersion = computed(() => {
  const version = versionOf(viewingConfig.value, viewingVersionCode.value)
  return version ? { ...version, versionStatus:versionStatusOf(viewingConfig.value, version) } : null
})
const viewingRules = computed(() => calculatedRulesOf(viewingVersion.value))
const customerRows = computed(() => customerDirectory.value
  .map(customer => {
    const reference = activeReferenceFor(customer.customerCode)
    if (!reference) return null
    return enrichReference({ ...reference, ...customer })
  })
  .filter(Boolean))
const filteredReferences = computed(() => customerRows.value.filter(row => (!appliedQuery.keyword || `${row.customerCode}${row.customerName}${row.configNo}${row.configName}`.includes(appliedQuery.keyword)) && matchCustomerRelations(row, { stores:appliedQuery.store, groups:appliedQuery.group }).matches))
const filteredConfigs = computed(() => rateConfigs.value.filter(config => (!appliedQuery.keyword || `${config.no}${config.name}`.includes(appliedQuery.keyword)) && (!appliedQuery.shareType || shareTypeOf(config) === appliedQuery.shareType) && (!appliedQuery.status || config.status === appliedQuery.status)))
const displayConfigs = computed(() => filteredConfigs.value.map((config) => {
  const displayVersions = config.versions.map((version) => {
    const rules = calculatedRulesOf(version)
    return { ...version, configVersionNo:`${config.no}-${version.version}`, rules, ruleCount:rules.length, ruleSummary:ruleSummary(rules), versionStatus:versionStatusOf(config, version) }
  })
  const current = displayVersions.find(version => version.version === config.currentVersion) || displayVersions[0]
  return { ...config, referenceLabel:referenceLabel(config), referenceTone:referenceTone(config), referenceCount:referenceCount(config), ruleCount:current?.ruleCount || 0, ruleSummary:current?.ruleSummary || '--', ratePreviewLines:ratePreviewLines(current?.rules || []), adjustRuleLines:adjustRuleLines(current?.rules || []), displayVersions }
}))
const affectedReferences = computed(() => selectedConfig.value
  ? currentReferences(selectedConfig.value).map(enrichReference)
  : [])
const nextPublishVersion = computed(() => {
  const max = Math.max(0, ...(selectedConfig.value?.versions || []).map(item => Number(item.version.replace('V', '')) || 0))
  return `V${max + 1}`
})
async function cancelPendingVersion(config) {
  if (!config?.pendingVersion) return
  try { await ElMessageBox.confirm(`确认取消 ${config.no}-${config.pendingVersion} 在 ${config.pendingEffectiveAt} 的生效安排？该版本号将保留且不能复用。`, '取消待生效版本', { type:'warning' }) } catch { return }
  const snapshot = versionOf(config, config.pendingVersion)
  if (snapshot) Object.assign(snapshot, { versionStatus:'已取消', cancelledAt:'2026-08-27 17:00', cancelReason:'财务取消待生效安排' })
  config.pendingVersion = ''
  config.pendingEffectiveAt = ''
  ElMessage.success('待生效安排已取消，版本快照已保留')
}
const assignmentCustomerRows = computed(() => customerDirectory.value.map((customer) => {
  const reference = activeReferenceFor(customer.customerCode, assignmentDate.value || AS_OF_DATE)
  return enrichReference({ ...(reference || { id:`EMPTY-${customer.customerCode}` }), ...customer })
}))
const assignmentRows = computed(() => assignmentCustomerRows.value.map((row) => {
  const matched = matchCustomerRelations(row, { stores:assignmentStore.value, groups:assignmentGroup.value })
  return { ...row, matches:matched.matches }
}).filter(row => row.matches))
const selectedAssignmentChanges = computed(() => assignmentCustomerRows.value.filter(row => assignmentCodes.value.includes(row.customerCode) && !isAlreadyExact(row)))
const replacementCount = computed(() => selectedAssignmentChanges.value.filter(row => row.configId && row.configId !== selectedConfig.value?.id).length)

function refreshDraftRules() { if (draft.value) draft.value.rules = calculatedRulesOf(draft.value) }
function updateDraftRule({ index, field, value }) {
  const rule = draft.value?.rules?.[index]
  if (!rule) return
  rule[field] = value
  if (field === 'method') rule.adjustDirection = value === '固定汇率值' ? '直接指定' : '上浮'
  refreshDraftRules()
}
function addDraftRule() {
  const used = new Set((draft.value?.rules || []).map(rule => rateCurrencyPairKey(rule.direction)))
  if (used.size >= currencyPairs.length) return ElMessage.warning('可配置的货币对规则已全部添加')
  const direction = currencyPairs.find(pair => !used.has(rateCurrencyPairKey(pair.value)))?.value
  if (!direction) return ElMessage.warning('可配置的货币对规则已全部添加')
  draft.value.rules.push({ direction, method:'百分比缩放', adjustDirection:'上浮', adjustValue:1 })
  refreshDraftRules()
}
function removeDraftRule(index) { if (draft.value?.rules?.length > 1) draft.value.rules.splice(index, 1) }
function openNew() {
  editingId.value = null
  forkCustomer.value = null
  draft.value = {
    name:'',
    no:'新配置',
    rules:[{ direction:'USD -> CNY', method:'百分比缩放', adjustDirection:'上浮', adjustValue:1.5 }],
  }
  refreshDraftRules()
  editorVisible.value = true
}
function openEdit(config) {
  if (config.pendingVersion) return ElMessage.warning(`已有待生效版本 ${config.no}-${config.pendingVersion}，请先取消原待生效安排`)
  const version = currentVersionOf(config)
  forkCustomer.value = null
  editingId.value = config.id
  draft.value = { id:config.id, no:config.no, name:config.name, currentVersion:config.currentVersion, rules:rateRulesFor(version) }
  refreshDraftRules()
  editorVisible.value = true
}
function viewConfig(row) {
  if (!row.config) return
  viewingReference.value = row
  viewingConfig.value = row.config
  viewingVersionCode.value = row.configVersion
  snapshotVisible.value = true
}
function viewConfigVersion(config, version) {
  viewingReference.value = null
  viewingConfig.value = config
  viewingVersionCode.value = version.version
  snapshotVisible.value = true
}
function openVersionHistory(config) {
  versionHistoryConfig.value = config
  versionHistoryVisible.value = true
}
function viewVersionFromHistory(version) {
  const config = versionHistoryConfig.value
  versionHistoryVisible.value = false
  if (config) viewConfigVersion(config, version)
}
function openForkFromReference(row = viewingReference.value) {
  const version = versionOf(row?.config, row?.configVersion)
  if (!row?.config || !version) return ElMessage.warning('未找到客户当前配置版本快照')
  editingId.value = null
  forkCustomer.value = row
  forkSwitchDate.value = AS_OF_DATE
  forkReason.value = ''
  draft.value = {
    name:row.config.name ? `${row.config.name}-客户副本` : '',
    no:'新配置',
    rules:rateRulesFor(version),
  }
  refreshDraftRules()
  snapshotVisible.value = false
  editorVisible.value = true
}
function validateDraft() {
  const validation = validateRateConfigRules(draft.value, baseRates.value)
  if (!validation.valid) return ElMessage.warning(validation.message)
  return true
}
function saveRate() {
  if (!validateDraft()) return
  if (!editingId.value) {
    if (forkCustomer.value && !forkSwitchDate.value) return ElMessage.warning('请选择切换日期')
    if (forkCustomer.value && forkSwitchDate.value < AS_OF_DATE) return ElMessage.warning('切换日期不能早于当前日期')
    if (forkCustomer.value && !forkReason.value.trim()) return ElMessage.warning('另存为新配置并切换客户时必须填写变更原因')
    const sequence = Math.max(0, ...rateConfigs.value.map(item => Number(item.id.replace('RC-', '')) || 0)) + 1
    const id = `RC-${String(sequence).padStart(3, '0')}`
    const no = `RATE-CONFIG-20260827-${String(sequence).padStart(2, '0')}`
    const version = {
      version:'V1',
      rules:snapshotRulesOf(draft.value),
      publishedAt:'2026-08-27 16:50',
      versionStatus:'生效',
      effectiveAt:AS_OF_DATE,
    }
    if (forkCustomer.value) {
      let nextReferences = referenceRows.value
      const referenceSequence = Math.max(0, ...referenceRows.value.map(row => Number(row.id.replace('RR-', '')) || 0)) + 1
      try {
        nextReferences = switchRateReference(referenceRows.value, {
          customer:forkCustomer.value,
          configId:id,
          configVersion:'V1',
          effectiveFrom:forkSwitchDate.value,
          changeReason:forkReason.value.trim(),
          referenceId:`RR-${String(referenceSequence).padStart(3, '0')}`,
        }).references
      } catch (error) {
        return ElMessage.warning(error.message)
      }
      rateConfigs.value.unshift({
        id,
        no,
        name:draft.value.name?.trim() || '',
        currentVersion:'V1',
        status:'启用',
        updatedAt:'2026-08-27 16:50',
        versions:[version],
      })
      referenceRows.value.splice(0, referenceRows.value.length, ...nextReferences)
      editorVisible.value = false
      ElMessage.success(`已另存为 ${no}-V1，仅切换 ${forkCustomer.value.customerName}`)
      forkCustomer.value = null
      return
    }
    pendingNewConfig.value = {
      id,
      no,
      name:draft.value.name?.trim() || '',
      currentVersion:'V1',
      status:'启用',
      updatedAt:'2026-08-27 16:50',
      versions:[version],
    }
    selectedConfig.value = pendingNewConfig.value
    assignmentVersion.value = 'V1'
    assignmentCodes.value = []
    assignmentDate.value = AS_OF_DATE
    assignmentReason.value = ''
    assignmentStore.value = []
    assignmentGroup.value = []
    editorVisible.value = false
    assignmentVisible.value = true
    return
  }
  selectedConfig.value = configById(editingId.value)
  publishEffectMode.value = 'IMMEDIATE'
  publishSwitchDate.value = ''
  publishReason.value = ''
  editorVisible.value = false
  publishingVisible.value = true
}
function confirmPublish() {
  const config = selectedConfig.value
  if (!config) return
  if (publishEffectMode.value === 'SCHEDULED' && !publishSwitchDate.value) return ElMessage.warning('请选择指定生效日期')
  if (publishEffectMode.value === 'SCHEDULED' && publishSwitchDate.value <= AS_OF_DATE) return ElMessage.warning('指定生效日期必须晚于当前日期')
  if (referenceCount(config) > 1 && !publishReason.value.trim()) return ElMessage.warning('共享配置发布新版本必须填写变更原因')
  if (config.pendingVersion) return ElMessage.warning('当前配置已有待生效版本，请先取消原待生效安排')
  const snapshot = {
    version:nextPublishVersion.value,
    rules:snapshotRulesOf(draft.value),
    publishedAt:'2026-08-27 16:55',
    changeReason:publishReason.value.trim(),
    versionStatus:publishEffectMode.value === 'SCHEDULED' ? '待生效' : '生效',
    effectiveAt:publishEffectMode.value === 'SCHEDULED' ? publishSwitchDate.value : AS_OF_DATE,
  }
  config.name = draft.value.name?.trim() || ''
  config.updatedAt = snapshot.publishedAt
  config.versions.unshift(snapshot)
  if (publishEffectMode.value === 'SCHEDULED') {
    config.pendingVersion = snapshot.version
    config.pendingEffectiveAt = publishSwitchDate.value
  } else {
    config.currentVersion = snapshot.version
    currentReferences(config).forEach(row => { row.configVersion = snapshot.version })
  }
  publishingVisible.value = false
  if (publishEffectMode.value === 'SCHEDULED') return ElMessage.success(`${config.no}-${snapshot.version} 已发布，将于 ${publishSwitchDate.value} 统一生效`)
  ElMessage.success(`${config.no}-${snapshot.version} 已发布并生效，${referenceCount(config)} 个引用客户已统一采用新版`)
}
function openAssignment(config, version = config?.currentVersion) {
  if (!config || config.status !== '启用') return ElMessage.warning('仅启用配置可以分配客户')
  if (!versionOf(config, version)) return ElMessage.warning('未找到目标配置版本')
  selectedConfig.value = config
  assignmentVersion.value = config.currentVersion
  assignmentCodes.value = []
  assignmentDate.value = AS_OF_DATE
  assignmentReason.value = ''
  assignmentStore.value = []
  assignmentGroup.value = []
  assignmentVisible.value = true
}
function isAlreadyExact(row) { return row.configId === selectedConfig.value?.id }
function toggleAssignment(customerCode, checked) { assignmentCodes.value = checked ? [...new Set([...assignmentCodes.value, customerCode])] : assignmentCodes.value.filter(code => code !== customerCode) }
function confirmAssignment() {
  if (!selectedAssignmentChanges.value.length) return ElMessage.warning('请至少选择一个需要切换配置的客户')
  if (!assignmentDate.value) return ElMessage.warning('请选择切换日期')
  if (assignmentDate.value < AS_OF_DATE) return ElMessage.warning('切换日期不能早于当前日期')
  if (replacementCount.value && !assignmentReason.value.trim()) return ElMessage.warning('替换客户现有配置必须填写变更原因')
  const config = selectedConfig.value
  const targetVersion = assignmentVersion.value
  if (!config || config.status !== '启用' || !versionOf(config, targetVersion)) return ElMessage.warning('目标配置版本已不可用，请重新选择')
  const changes = [...selectedAssignmentChanges.value]
  let sequence = Math.max(0, ...referenceRows.value.map(row => Number(row.id.replace('RR-', '')) || 0)) + 1
  let nextReferences = referenceRows.value
  const failures = []
  let switchedCount = 0
  changes.forEach((customer) => {
    try {
      const switched = switchRateReference(nextReferences, {
        customer,
        configId:config.id,
        configVersion:targetVersion,
        effectiveFrom:assignmentDate.value,
        changeReason:assignmentReason.value.trim(),
        referenceId:`RR-${String(sequence).padStart(3, '0')}`,
      })
      nextReferences = switched.references
      if (switched.changed) {
        sequence += 1
        switchedCount += 1
      }
    } catch (error) {
      failures.push(`${customer.customerName}：${error.message}`)
    }
  })
  referenceRows.value.splice(0, referenceRows.value.length, ...nextReferences)
  assignmentVisible.value = false
  if (failures.length) return ElMessage.warning(`${switchedCount} 个客户切换成功，${failures.length} 个失败`)
  ElMessage.success(`已为 ${switchedCount} 个客户建立 ${config.no}-${targetVersion} 配置引用`)
}
function confirmNewConfig() {
  const config = pendingNewConfig.value
  if (!config) return
  if (!selectedAssignmentChanges.value.length) return ElMessage.warning('请至少选择一个需要建立引用的客户')
  if (!assignmentDate.value) return ElMessage.warning('请选择切换日期')
  if (assignmentDate.value < AS_OF_DATE) return ElMessage.warning('切换日期不能早于当前日期')
  if (replacementCount.value && !assignmentReason.value.trim()) return ElMessage.warning('替换客户现有配置必须填写变更原因')
  const targetVersion = 'V1'
  let nextReferences = referenceRows.value
  let sequence = Math.max(0, ...referenceRows.value.map(row => Number(row.id.replace('RR-', '')) || 0)) + 1
  const failures = []
  let switchedCount = 0
  selectedAssignmentChanges.value.forEach((customer) => {
    try {
      const switched = switchRateReference(nextReferences, {
        customer,
        configId:config.id,
        configVersion:targetVersion,
        effectiveFrom:assignmentDate.value,
        changeReason:assignmentReason.value.trim(),
        referenceId:`RR-${String(sequence).padStart(3, '0')}`,
      })
      nextReferences = switched.references
      if (switched.changed) {
        sequence += 1
        switchedCount += 1
      }
    } catch (error) {
      failures.push(`${customer.customerName}：${error.message}`)
    }
  })
  rateConfigs.value.unshift(config)
  if (nextReferences !== referenceRows.value) referenceRows.value.splice(0, referenceRows.value.length, ...nextReferences)
  pendingNewConfig.value = null
  selectedConfig.value = null
  assignmentVisible.value = false
  if (failures.length) return ElMessage.warning(`${config.no}-V1 已创建；${switchedCount} 个客户引用成功，${failures.length} 个失败`)
  ElMessage.success(`${config.no}-V1 已创建，已为 ${switchedCount} 个客户建立配置引用`)
}
function skipNewConfig() {
  const config = pendingNewConfig.value
  if (!config) return
  rateConfigs.value.unshift(config)
  pendingNewConfig.value = null
  selectedConfig.value = null
  assignmentVisible.value = false
  ElMessage.success(`${config.no}-V1 已创建，当前为未引用配置`)
}
function handleAssignmentConfirm() {
  if (pendingNewConfig.value) confirmNewConfig()
  else confirmAssignment()
}
async function removeBaseRate(row) {
  await ElMessageBox.confirm(`确认删除 ${formatDirection(row.direction)} 的基准汇率？`, '删除基准汇率', { type:'warning' })
  baseRates.value.splice(baseRates.value.indexOf(row), 1)
  ElMessage.success('基准汇率已删除')
}
</script>

<template>
  <div class="module-page rate-config-page">
    <div class="rate-config-grid">
      <section class="rate-panel base-rate-panel">
        <header class="rate-panel-head"><div><h2>基准汇率表</h2></div></header>
        <DataTableFrame class="rate-table-frame" :total="baseRates.length" :page-size="20" :column-sort="false">
          <template #actions><el-button :icon="RefreshRight" disabled>抓取</el-button><el-button type="primary" :icon="Plus" @click="openAddBaseRate">添加</el-button></template>
          <el-table :data="baseRates" class="clean-table rate-table" border height="100%">
            <el-table-column label="货币对" min-width="130"><template #default="scope"><strong>{{ formatDirection(scope.row.direction) }}</strong></template></el-table-column>
            <el-table-column label="汇率" width="112"><template #default="scope"><strong class="rate-value">{{ formatRate(scope.row.rate) }}</strong></template></el-table-column>
            <TableActionColumn compact><template #default="scope"><HoverActionMenu><el-dropdown-item :icon="EditPen" @click="openEditBaseRate(scope.row)">编辑</el-dropdown-item><el-dropdown-item class="danger-action" :icon="Delete" @click="removeBaseRate(scope.row)">删除</el-dropdown-item></HoverActionMenu></template></TableActionColumn>
          </el-table>
        </DataTableFrame>
      </section>

      <section class="rate-panel rate-panel-wide">
        <header class="rate-panel-head rate-panel-head-stack">
          <div><h2>客户特调汇率</h2></div>
          <el-tabs v-model="activeView" class="rate-source-tabs"><el-tab-pane label="配置清单" name="configs" /><el-tab-pane label="客户引用配置情况" name="references" /></el-tabs>
          <div class="rate-panel-filters">
            <ConditionFilter v-model="query.keyword" :label="activeView === 'references' ? '客户/配置' : '配置'" type="text" />
            <template v-if="activeView === 'references'">
              <ConditionFilter v-model="query.store" label="所属店铺" :options="stores" />
              <ConditionFilter v-model="query.group" label="所属客户组" :options="groups" />
            </template>
            <ConditionFilter v-else v-model="query.shareType" label="配置标签" :options="shareTypes" />
            <ConditionFilter v-if="activeView === 'configs'" v-model="query.status" label="状态" :options="['启用','停用']" />
            <div class="condition-filter-actions linked-query-actions"><el-button type="primary" @click="applyQuery">查询</el-button><el-button @click="resetQuery">重置</el-button></div>
          </div>
        </header>

        <DataTableFrame class="rate-table-frame" :total="activeView === 'references' ? filteredReferences.length : filteredConfigs.length" :page-size="20" :column-sort="false">
          <template #actions><el-button v-if="activeView === 'configs'" type="primary" :icon="Plus" @click="openNew">新建配置</el-button></template>
          <RateCustomerReferenceTable v-if="activeView === 'references'" :rows="filteredReferences" @view="viewConfig" />
          <RateConfigLibraryTable v-else :rows="displayConfigs" @edit="openEdit" @assign="openAssignment" @view-history="openVersionHistory" @cancel-pending="cancelPendingVersion" />
        </DataTableFrame>
      </section>
    </div>

    <BaseRateDialog v-model="baseRateDialogVisible" :draft="baseRateDraft" :editing="Boolean(baseRateEditing)" @save="saveBaseRate" />

    <RateSnapshotDialog
      v-model="snapshotVisible"
      :reference="viewingReference"
      :config="viewingConfig"
      :version="viewingVersion"
      :rules="viewingRules"
      @fork="openForkFromReference"
    />
    <ConfigVersionHistoryDialog
      v-model="versionHistoryVisible"
      kind="rate"
      :config="versionHistoryConfig"
      :versions="versionHistoryConfig?.displayVersions || []"
      @view="viewVersionFromHistory"
    />
    <RateConfigEditorDialog
      v-model="editorVisible"
      v-model:fork-switch-date="forkSwitchDate"
      v-model:fork-reason="forkReason"
      :draft="draft"
      :editing-id="editingId"
      :fork-customer="forkCustomer"
      :currency-pairs="currencyPairs"
      :reference-count="editingId ? referenceCount(configById(editingId)) : 0"
      :next-version="editingId ? nextPublishVersion : 'V1'"
      @update-rule="updateDraftRule"
      @add-rule="addDraftRule"
      @remove-rule="removeDraftRule"
      @save="saveRate"
    />
    <RateConfigPublishDialog
      v-model="publishingVisible"
      v-model:effect-mode="publishEffectMode"
      v-model:switch-date="publishSwitchDate"
      v-model:reason="publishReason"
      :config="selectedConfig"
      :next-version="nextPublishVersion"
      :references="affectedReferences"
      @confirm="confirmPublish"
    />
    <RateConfigAssignmentDialog
      v-model="assignmentVisible"
      v-model:store="assignmentStore"
      v-model:group="assignmentGroup"
      v-model:switch-date="assignmentDate"
      v-model:reason="assignmentReason"
      :config="selectedConfig"
      :target-version="assignmentVersion"
      :reference-count="referenceCount(selectedConfig)"
      :selected-count="selectedAssignmentChanges.length"
      :stores="stores"
      :groups="assignmentGroups"
      :rows="assignmentRows"
      :selected-codes="assignmentCodes"
      :replacement-count="replacementCount"
      :creating="Boolean(pendingNewConfig)"
      @toggle-assignment="toggleAssignment"
      @confirm="handleAssignmentConfirm"
      @skip="skipNewConfig"
    />
  </div>
</template>

<style scoped>
.rate-panel-head-stack{flex-wrap:wrap}.rate-source-tabs{width:100%;order:2}.rate-source-tabs :deep(.el-tabs__header){margin:0}.rate-panel-filters{min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px;order:3}@media(max-width:760px){.rate-panel-filters{width:100%}}
</style>
