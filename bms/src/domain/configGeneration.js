import dayjs from 'dayjs'
import { customerRelationSummary } from './customerRelations.js'

const periodFromCycle = (cycle = '') => {
  if (cycle.includes('半周')) return 'HALF_WEEK'
  if (cycle.includes('半月')) return 'HALF_MONTH'
  if (cycle.includes('月')) return 'MONTH'
  if (cycle.includes('10')) return 'DAY_10'
  if (cycle.includes('15')) return 'DAY_15'
  if (cycle.includes('7')) return 'DAY_7'
  if (cycle.includes('1')) return 'DAY_1'
  return 'WEEK'
}

const rollingDays = period => Number(period?.replace('DAY_', '')) || 0

export function createBillingConfigNo(prefix, createdAt = dayjs(), existingNos = []) {
  let timestamp = dayjs(createdAt)
  if (!timestamp.isValid()) throw new Error('账单配置创建时间无效')
  const used = new Set(existingNos)
  let configNo = `${prefix}-${timestamp.format('YYYYMMDDHHmmssSSS')}`
  while (used.has(configNo)) {
    timestamp = timestamp.add(1, 'millisecond')
    configNo = `${prefix}-${timestamp.format('YYYYMMDDHHmmssSSS')}`
  }
  return configNo
}

export function createReceivableConfigNo(createdAt = dayjs(), existingNos = []) {
  return createBillingConfigNo('ARB-SCHEME', createdAt, existingNos)
}

export function createRefundConfigNo(createdAt = dayjs(), existingNos = []) {
  return createBillingConfigNo('RFB-SCHEME', createdAt, existingNos)
}

export function numberReceivableSchemes(snapshot, configNo) {
  if (!snapshot) return snapshot
  const branchSequence = (scheme, index) => Number(String(scheme?.schemeKey || '').match(/(?:^|-)BRANCH-(\d+)$/)?.[1]) || index + 1
  const branches = (snapshot.branches || []).map((scheme, index) => ({ ...scheme, schemeKey:`${configNo}-BRANCH-${branchSequence(scheme, index)}` }))
  return {
    ...snapshot,
    branchKeyCeiling:Math.max(Number(snapshot.branchKeyCeiling) || 0, ...branches.map((scheme, index) => branchSequence(scheme, index))),
    defaultScheme:{ ...snapshot.defaultScheme, schemeKey:configNo },
    branches,
  }
}

function intersectEffectPeriods(schemePeriod, referencePeriod) {
  const starts = [schemePeriod?.[0], referencePeriod?.[0]].filter(Boolean).map(value => dayjs(value).startOf('day'))
  const ends = [schemePeriod?.[1], referencePeriod?.[1]]
    .filter(value => value && value !== '长期')
    .map(value => dayjs(value).endOf('day'))
  const start = starts.reduce((latest, value) => (!latest || value.isAfter(latest) ? value : latest), null)
  const end = ends.reduce((earliest, value) => (!earliest || value.isBefore(earliest) ? value : earliest), null)
  return [start?.format('YYYY-MM-DD'), end?.format('YYYY-MM-DD') || '长期']
}

function latestHalfWeekPeriod(cutoffDate, startDays) {
  const configuredDays = [...new Set((startDays?.length === 2 ? startDays : ['1', '5']).map(Number))]
  const candidateStarts = []
  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = cutoffDate.subtract(offset, 'day')
    const weekday = candidate.day() || 7
    if (configuredDays.includes(weekday)) candidateStarts.push(candidate)
  }
  for (const start of candidateStarts) {
    let nextStart = null
    for (let offset = 1; offset <= 7; offset += 1) {
      const candidate = start.add(offset, 'day')
      const weekday = candidate.day() || 7
      if (configuredDays.includes(weekday)) { nextStart = candidate; break }
    }
    const end = nextStart?.subtract(1, 'day')
    if (end?.isBefore(cutoffDate, 'day')) return { start, end }
  }
  return null
}

function latestClosedPeriod(period, effectPeriod, cutoff, startDays = []) {
  const cutoffDate = dayjs(cutoff).startOf('day')
  const effectStart = dayjs(effectPeriod?.[0]).startOf('day')
  const effectEnd = effectPeriod?.[1] && effectPeriod[1] !== '长期' ? dayjs(effectPeriod[1]).endOf('day') : null
  if (!effectStart.isValid() || !cutoffDate.isValid() || !cutoffDate.isAfter(effectStart)) return null

  let start
  let end
  if (period === 'MONTH') {
    end = cutoffDate.startOf('month').subtract(1, 'day')
    start = end.startOf('month')
  } else if (period === 'HALF_MONTH') {
    if (cutoffDate.date() > 15) {
      start = cutoffDate.startOf('month')
      end = start.date(15)
    } else {
      end = cutoffDate.startOf('month').subtract(1, 'day')
      start = end.startOf('month').date(16)
    }
  } else if (period === 'WEEK') {
    const currentMonday = cutoffDate.subtract((cutoffDate.day() + 6) % 7, 'day')
    end = currentMonday.subtract(1, 'day')
    start = end.subtract(6, 'day')
  } else if (period === 'HALF_WEEK') {
    const halfWeek = latestHalfWeekPeriod(cutoffDate, startDays)
    if (!halfWeek) return null
    ;({ start, end } = halfWeek)
  } else {
    const days = rollingDays(period)
    const completed = days ? Math.floor(cutoffDate.diff(effectStart, 'day') / days) : 0
    if (completed < 1) return null
    start = effectStart.add((completed - 1) * days, 'day')
    end = start.add(days - 1, 'day')
  }

  if (end.isBefore(effectStart, 'day')) return null
  if (start.isBefore(effectStart, 'day')) start = effectStart
  if (effectEnd && start.isAfter(effectEnd, 'day')) return null
  if (effectEnd && end.isAfter(effectEnd, 'day')) end = effectEnd
  return { start: start.format('YYYY-MM-DD'), end: end.format('YYYY-MM-DD') }
}

function schemesFor(config) {
  if (config.type !== 'AR') {
    const refundSnapshot = config.refundSnapshot || {}
    return [{
      schemeKey: 'REFUND',
      schemeName: '返款配置',
      schemeType: '不适用',
      period: refundSnapshot.billingPeriodType || periodFromCycle(config.cycle),
      startDays: refundSnapshot.startDays || [],
      effectPeriod: refundSnapshot.effectPeriod || [config.effectStart, config.effectEnd],
    }]
  }

  const snapshot = config.schemeSnapshot
  if (!snapshot) return []
  const defaultScheme = { ...snapshot.defaultScheme, schemeKey:snapshot.defaultScheme?.schemeKey || config.no, schemeName:'默认方案', schemeType:'默认方案' }
  const branches = snapshot.branches
    .filter(scheme => scheme.enabled !== false)
    .map((scheme, index) => ({ ...scheme, schemeKey:scheme.schemeKey || `${config.no}-BRANCH-${index + 1}`, schemeName:`分支方案 ${index + 1}`, schemeType:'分支方案' }))
  return [defaultScheme, ...branches]
}

export function isConfigReferenceActive(reference, at = '2026-08-27') {
  if (!reference?.configId || reference.status !== '启用') return false
  const date = dayjs(at).startOf('day')
  const start = dayjs(reference.effectStart).startOf('day')
  if (!date.isValid() || !start.isValid() || date.isBefore(start, 'day')) return false
  if (!reference.effectEnd || reference.effectEnd === '长期') return true
  const end = dayjs(reference.effectEnd).endOf('day')
  return end.isValid() && !date.isAfter(end, 'day')
}

export function configReferenceStats(config, references, at = '2026-08-27') {
  if (!config) return { total:0, exact:0, usageType:'UNUSED', label:'未引用配置' }
  const active = references.filter(reference => reference.configId === config.id && isConfigReferenceActive(reference, at))
  const total = new Set(active.map(reference => reference.customerCode)).size
  const exact = total
  if (total === 0) return { total, exact, usageType:'UNUSED', label:'未引用配置' }
  if (total === 1) return { total, exact, usageType:'EXCLUSIVE', label:'独享配置' }
  return { total, exact, usageType:'SHARED', label:'共享配置' }
}

export function taskOverlapsReferenceStart(task, { customerCode, billType, effectiveAt }) {
  if (task.deletedAt || !['PENDING', 'RUNNING', 'FAILED'].includes(task.status) || task.customerNo !== customerCode || task.billType !== billType) return false
  const switchDate = dayjs(effectiveAt).startOf('day')
  const taskEnd = dayjs(task.periodEnd).endOf('day')
  return switchDate.isValid() && taskEnd.isValid() && !taskEnd.isBefore(switchDate, 'day')
}

export function buildConfigGenerationScopes({ config, references, tasks, cutoff, referenceAt = '2026-08-27 16:45:00', customerCode = '' }) {
  if (!config) return { rows:[], referenceCustomerCount:0 }
  const configReferences = references.filter(reference => reference.configId === config.id && isConfigReferenceActive(reference, referenceAt) && (!customerCode || reference.customerCode === customerCode))
  const exactByCustomer = new Map()
  configReferences
    .sort((left, right) => String(left.effectStart).localeCompare(String(right.effectStart)))
    .forEach(reference => exactByCustomer.set(reference.customerCode, { ...reference, configNo:config.no, version:config.version, currency:config.currency, cycle:config.cycle, sentRule:config.sentRule, schemeSnapshot:config.schemeSnapshot, refundSnapshot:config.refundSnapshot, mode:config.mode }))
  const exactReferences = [...exactByCustomer.values()]
  const rows = exactReferences.flatMap(reference => schemesFor(config).map((scheme) => {
    const effectivePeriod = intersectEffectPeriods(scheme.effectPeriod, [reference.effectStart, reference.effectEnd])
    const period = latestClosedPeriod(scheme.period, effectivePeriod, cutoff, scheme.startDays)
    const periodKey = period ? `${period.start}/${period.end}` : '-'
    const lockPrefix = `${reference.customerCode}|${config.type}|${scheme.schemeKey}|${periodKey}`
    const lockKey = `${lockPrefix}|BILL_GENERATE`
    const scopeKey = `${reference.customerCode}|${config.type}|${scheme.schemeKey}|${periodKey}|${config.no}@${config.version}`
    const conflict = period && tasks.find((task) => {
      const lockTaskType = task.taskType || task.lockKey?.split('|').at(-1)
      return !task.deletedAt && ['PENDING','RUNNING','FAILED'].includes(task.status)
        && ['BILL_GENERATE', 'BILL_RECALCULATE'].includes(lockTaskType)
        && (task.lockKey?.startsWith(`${lockPrefix}|`) || (!task.lockKey && task.customerNo === reference.customerCode && task.billType === config.type && task.periodStart === period.start && task.periodEnd === period.end && task.schemeKey === scheme.schemeKey))
    })
    const reason = !period ? '当前生效版本尚无已结束账期' : conflict ? `同范围任务未结束：${conflict.taskNo}` : ''
    const relationSummary = customerRelationSummary(reference)
    return {
      id: `${reference.id}-${scheme.schemeKey}-${periodKey}`,
      customerId: reference.id,
      customerCode: reference.customerCode,
      customerName: reference.customerName,
      memberCode: relationSummary.memberCode,
      store: relationSummary.store,
      group: relationSummary.group,
      customerReferenceNo: reference.referenceNo,
      billType: config.type,
      schemeKey: scheme.schemeKey,
      schemeName: scheme.schemeName,
      schemeType: scheme.schemeType,
      periodStart: period?.start || '-',
      periodEnd: period?.end || '-',
      scopeKey,
      lockKey,
      blocked: Boolean(reason),
      reason,
    }
  }))

  return {
    rows,
    referenceCustomerCount: exactReferences.length,
  }
}

const nextSequence = (values, prefix) => values.reduce((max, value) => {
  if (!value?.startsWith(prefix)) return max
  return Math.max(max, Number(value.slice(prefix.length)) || 0)
}, 0) + 1

export function createConfigBatchTaskRows({ config, scopes, skippedCount, frozenCustomerCount, cutoff, existingTasks }) {
  const dateKey = dayjs(cutoff).format('YYYYMMDD')
  const batchPrefix = `BMSB-${dateKey}-`
  const taskPrefix = `BMS-${dateKey}-`
  const batchSequence = nextSequence(existingTasks.map(task => task.batchNo), batchPrefix)
  const firstTaskSequence = nextSequence(existingTasks.map(task => task.taskNo), taskPrefix)
  const batchNo = `${batchPrefix}${String(batchSequence).padStart(5, '0')}`
  const firstId = existingTasks.reduce((max, task) => Math.max(max, Number(task.id) || 0), 0) + 1
  const customerCount = frozenCustomerCount ?? new Set(scopes.map(scope => scope.customerCode)).size

  const rows = scopes.map((scope, index) => ({
    id: firstId + index,
    batchNo,
    batchCustomerCount: customerCount,
    batchTaskCount: scopes.length,
    batchSkippedCount: skippedCount,
    batchSkipSummary: skippedCount ? `${skippedCount} 个范围未通过创建校验` : '',
    taskNo: `${taskPrefix}${String(firstTaskSequence + index).padStart(5, '0')}`,
    status: 'PENDING',
    taskType: 'BILL_GENERATE',
    generationMode: 'PENDING',
    triggerType: 'MANUAL',
    billType: config.type,
    configSource: 'CONFIG',
    configNo: config.no,
    configVersion: config.version,
    schemeKey: scope.schemeKey,
    schemeName: scope.schemeName,
    schemeType: scope.schemeType,
    customerReferenceNo: scope.customerReferenceNo,
    customerName: scope.customerName,
    customerNo: scope.customerCode,
    memberCode: scope.memberCode,
    shop: scope.store,
    customerGroup: scope.group,
    sourceShopSnapshots:[],
    periodStart: scope.periodStart,
    periodEnd: scope.periodEnd,
    period: `${scope.periodStart} 至 ${scope.periodEnd}`,
    dataCutoff: cutoff,
    createdAt: cutoff,
    startedAt: '-',
    finishedAt: '-',
    duration: '0秒',
    operator: '财务管理员',
    failedStage: '',
    error: '',
    advice: '',
    sourceCount: 0,
    pooledFeeCount: 0,
    billCount: 0,
    netChange: 0,
    resultConclusion: '等待执行',
    resultVersion: '--',
    originalBills: [],
    newBills: [],
    scopeKey: scope.scopeKey,
    lockKey: scope.lockKey,
    sourceSql: 'SELECT ... FROM sale_order_fee_detail WHERE customer_no = :customerNo AND fee_created_at <= :dataCutoff;',
    recalculateScope: '',
    closeResult: '待判定',
    deletedAt: '',
    deletedBy: '',
  }))

  return { batchNo, rows }
}
