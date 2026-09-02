import dayjs from 'dayjs'
import { customerRelationsFor } from './customerRelations.js'

const LONG_TERM = '长期'
const RATE_RULE_FIELDS = ['direction', 'method', 'adjustDirection', 'adjustValue']

export function rateCurrencyPairKey(direction = '') {
  const currencies = direction.split('->').map(value => value.trim()).filter(Boolean)
  return currencies.length === 2 ? currencies.sort().join('|') : direction
}

export function rateRulesFor(version = {}) {
  const source = Array.isArray(version?.rules) && version.rules.length
    ? version.rules
    : version?.direction ? [version] : []
  return source.map(rule => RATE_RULE_FIELDS.reduce((snapshot, field) => {
    snapshot[field] = rule?.[field]
    return snapshot
  }, {}))
}

export function isRateReferenceEffective(reference, at) {
  if (!reference?.configId) return false
  const date = dayjs(at).startOf('day')
  const start = dayjs(reference.effectiveFrom).startOf('day')
  if (!date.isValid() || !start.isValid() || date.isBefore(start, 'day')) return false
  if (!reference.effectiveTo || reference.effectiveTo === LONG_TERM) return true
  const end = dayjs(reference.effectiveTo).endOf('day')
  return end.isValid() && !date.isAfter(end, 'day')
}

export function activeRateReferenceFor(references, customerCode, at) {
  return references
    .filter(reference => reference.customerCode === customerCode && isRateReferenceEffective(reference, at))
    .sort((left, right) => (right.effectiveFrom || '').localeCompare(left.effectiveFrom || ''))[0]
}

export function activeRateReferencesForConfig(references, configId, at) {
  const activeByCustomer = new Map()
  references.forEach((reference) => {
    if (reference.configId !== configId || !isRateReferenceEffective(reference, at)) return
    const current = activeByCustomer.get(reference.customerCode)
    if (!current || (reference.effectiveFrom || '') > (current.effectiveFrom || '')) {
      activeByCustomer.set(reference.customerCode, reference)
    }
  })
  return [...activeByCustomer.values()]
}

export function previousCalendarDay(date) {
  return dayjs(date).subtract(1, 'day').format('YYYY-MM-DD')
}

export function switchRateReference(references, {
  customer,
  configId,
  configVersion,
  effectiveFrom,
  changeReason = '',
  referenceId,
}) {
  if (!customer?.customerCode) throw new Error('缺少客户编码')
  if (!configId || !configVersion) throw new Error('缺少目标配置或准确版本')
  const parsedEffectiveFrom = dayjs(effectiveFrom)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || !parsedEffectiveFrom.isValid() || parsedEffectiveFrom.format('YYYY-MM-DD') !== effectiveFrom) {
    throw new Error('切换日期无效')
  }

  const configuredReferences = references.filter(reference => (
    reference.customerCode === customer.customerCode
    && reference.configId
    && reference.effectiveFrom
  ))
  const exactStart = configuredReferences.find(reference => reference.effectiveFrom === effectiveFrom)
  if (exactStart) {
    if (exactStart.configId === configId && exactStart.configVersion === configVersion) {
      return { references:[...references], created:null, changed:false }
    }
    throw new Error(`${effectiveFrom} 已存在其它计划引用`)
  }

  const active = activeRateReferenceFor(references, customer.customerCode, effectiveFrom)
  if (active?.configId === configId && active?.configVersion === configVersion) {
    return { references:[...references], created:null, changed:false }
  }

  const next = configuredReferences
    .filter(reference => reference.effectiveFrom > effectiveFrom)
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))[0]
  const nextReferences = references.map((reference) => {
    if (reference !== active || !active?.effectiveFrom || active.effectiveFrom >= effectiveFrom) return reference
    return { ...reference, effectiveTo:previousCalendarDay(effectiveFrom) }
  })
  const relations = customerRelationsFor(customer)
  const created = {
    id:referenceId,
    customerCode:customer.customerCode,
    customerName:customer.customerName,
    memberCode:customer.memberCode || relations[0]?.memberCode || '',
    store:customer.store || relations[0]?.store || '',
    group:customer.group || relations[0]?.group || '',
    relations,
    configId,
    configVersion,
    effectiveFrom,
    effectiveTo:next ? previousCalendarDay(next.effectiveFrom) : LONG_TERM,
    changeReason,
  }
  return { references:[...nextReferences, created], created, changed:true }
}

export function calculateRateConfigResult(rule, baseRates) {
  const adjustValue = Number(rule?.adjustValue)
  if (!Number.isFinite(adjustValue) || adjustValue <= 0) {
    return { valid:false, base:null, result:null, source:'INVALID', message:'调整值必须大于 0' }
  }

  if (rule.method === '固定汇率值') {
    return { valid:true, base:null, result:adjustValue, source:'FIXED_VALUE', message:'' }
  }

  const baseRow = baseRates.find(item => (
    item.direction === rule.direction
    && item.status === '生效'
    && Number(item.rate) > 0
  ))
  if (!baseRow) {
    return {
      valid:true,
      base:null,
      result:1,
      source:'FALLBACK_CHAIN',
      message:'基准汇率未命中，配置页特调汇率按 1 展示；账单生成时继续按所属店铺汇率表、1 逐级兜底',
    }
  }

  const base = Number(baseRow.rate)
  const sign = rule.adjustDirection === '下浮' ? -1 : 1
  const result = rule.method === '百分比缩放'
    ? base * (1 + sign * adjustValue / 100)
    : base + sign * adjustValue
  if (!Number.isFinite(result) || result <= 0) {
    return { valid:false, base, result:null, source:'INVALID', message:'特调后默认汇率必须大于 0' }
  }
  return { valid:true, base, result, source:'BASE_RATE', message:'' }
}

export function calculateRateConfigRules(version, baseRates) {
  return rateRulesFor(version).map(rule => ({ ...rule, ...calculateRateConfigResult(rule, baseRates) }))
}

export function validateRateConfigRules(version, baseRates) {
  const rules = rateRulesFor(version)
  if (!rules.length) return { valid:false, message:'请至少添加一条货币对规则', rules:[] }
  const directions = rules.map(rule => rule.direction).filter(Boolean)
  if (directions.length !== rules.length) return { valid:false, message:'请选择每条规则的货币对和汇兑方向', rules:[] }
  const currencyPairs = directions.map(rateCurrencyPairKey)
  if (new Set(currencyPairs).size !== currencyPairs.length) return { valid:false, message:'同一准确版本内同一货币对只能配置一条规则', rules:[] }
  const calculated = calculateRateConfigRules({ rules }, baseRates)
  const invalid = calculated.find(rule => !rule.valid)
  return invalid
    ? { valid:false, message:`${invalid.direction}：${invalid.message}`, rules:calculated }
    : { valid:true, message:'', rules:calculated }
}
