import { describe, expect, it } from 'vitest'
import {
  activeRateReferenceFor,
  activeRateReferencesForConfig,
  calculateRateConfigResult,
  calculateRateConfigRules,
  previousCalendarDay,
  rateRulesFor,
  switchRateReference,
  validateRateConfigRules,
} from '../src/domain/rateConfig.js'

const customer = {
  customerCode:'OG0271',
  customerName:'渣渣辉3号',
  memberCode:'M-001',
  store:'星际货运(中转)',
  group:'台湾大客户组',
  relations:[{ store:'星际货运(中转)', group:'台湾大客户组', memberCode:'M-001' }],
}

const reference = (overrides = {}) => ({
  id:'RR-001',
  ...customer,
  configId:'RC-001',
  configVersion:'V1',
  effectiveFrom:'2026-06-01',
  effectiveTo:'长期',
  ...overrides,
})

describe('rate configuration references', () => {
  it('ends the old reference on T-1 and creates a new exact-version reference on T', () => {
    const old = reference()
    const result = switchRateReference([old], {
      customer,
      configId:'RC-001',
      configVersion:'V2',
      effectiveFrom:'2026-09-01',
      changeReason:'升级版本',
      referenceId:'RR-002',
    })

    expect(old.effectiveTo).toBe('长期')
    expect(result.references).toEqual([
      expect.objectContaining({ id:'RR-001', configVersion:'V1', effectiveTo:'2026-08-31' }),
      expect.objectContaining({ id:'RR-002', configVersion:'V2', effectiveFrom:'2026-09-01', effectiveTo:'长期' }),
    ])
    expect(result.created).toMatchObject({ memberCode:'M-001', store:'星际货运(中转)', group:'台湾大客户组' })
    expect(result.created).not.toHaveProperty('status')
    expect(result.created.relations).toEqual(customer.relations)
  })

  it('uses calendar subtraction without UTC date drift', () => {
    expect(previousCalendarDay('2026-03-01')).toBe('2026-02-28')
    expect(previousCalendarDay('2028-03-01')).toBe('2028-02-29')
    expect(previousCalendarDay('2027-01-01')).toBe('2026-12-31')
  })

  it('does not count future references in the current sharing label', () => {
    const references = [
      reference(),
      reference({ id:'RR-002', customerCode:'OG0370', effectiveFrom:'2026-09-01' }),
      reference({ id:'RR-003', customerCode:'OG0412', effectiveTo:'2026-08-26' }),
      reference({ id:'RR-004', effectiveFrom:'2026-08-01' }),
    ]

    expect(activeRateReferencesForConfig(references, 'RC-001', '2026-08-27')).toHaveLength(1)
    expect(activeRateReferencesForConfig([reference({ effectiveTo:'2026-08-27' })], 'RC-001', '2026-08-27 23:59:59')).toHaveLength(1)
    expect(activeRateReferenceFor(references, 'OG0370', '2026-08-27')).toBeUndefined()
    expect(activeRateReferencesForConfig(references, 'RC-001', '2026-09-01')).toHaveLength(2)
  })
})

describe('rate configuration calculation', () => {
  const baseRates = [{ direction:'USD -> CNY', status:'生效', rate:7 }]

  it('calculates a positive result from a confirmed base rate', () => {
    const result = calculateRateConfigResult({
      direction:'USD -> CNY', method:'百分比缩放', adjustDirection:'上浮', adjustValue:2,
    }, baseRates)
    expect(result).toMatchObject({ valid:true, base:7, source:'BASE_RATE' })
    expect(result.result).toBeCloseTo(7.14, 8)
  })

  it('previews 1 while preserving the store-rate and 1 fallback chain when no base rate is available', () => {
    expect(calculateRateConfigResult({
      direction:'CNY -> USD', method:'固定汇率差', adjustDirection:'下浮', adjustValue:0.1,
    }, baseRates)).toMatchObject({ valid:true, base:null, result:1, source:'FALLBACK_CHAIN' })
  })

  it('rejects any configured result that is not greater than zero', () => {
    expect(calculateRateConfigResult({
      direction:'USD -> CNY', method:'固定汇率差', adjustDirection:'下浮', adjustValue:8,
    }, baseRates)).toMatchObject({ valid:false, result:null, source:'INVALID' })
    expect(calculateRateConfigResult({
      direction:'USD -> CNY', method:'固定汇率值', adjustDirection:'直接指定', adjustValue:0,
    }, baseRates)).toMatchObject({ valid:false, result:null, source:'INVALID' })
  })

  it('supports legacy single-rule snapshots and calculates every rule without mutating snapshots', () => {
    const legacy = { direction:'USD -> CNY', method:'百分比缩放', adjustDirection:'上浮', adjustValue:2, result:99 }
    expect(rateRulesFor(legacy)).toEqual([{ direction:'USD -> CNY', method:'百分比缩放', adjustDirection:'上浮', adjustValue:2 }])

    const version = { rules:[
      { direction:'USD -> CNY', method:'百分比缩放', adjustDirection:'上浮', adjustValue:2 },
      { direction:'GBP -> CNY', method:'固定汇率值', adjustDirection:'直接指定', adjustValue:9.6 },
    ] }
    const calculated = calculateRateConfigRules(version, baseRates)
    expect(calculated[0]).toMatchObject({ direction:'USD -> CNY', source:'BASE_RATE' })
    expect(calculated[0].result).toBeCloseTo(7.14, 8)
    expect(calculated[1]).toMatchObject({ direction:'GBP -> CNY', result:9.6, source:'FIXED_VALUE' })
    expect(version.rules[0]).not.toHaveProperty('result')
  })

  it('rejects duplicate directions in one exact version', () => {
    const version = { rules:[
      { direction:'USD -> CNY', method:'百分比缩放', adjustDirection:'上浮', adjustValue:1 },
      { direction:'CNY -> USD', method:'固定汇率差', adjustDirection:'下浮', adjustValue:0.1 },
    ] }
    expect(validateRateConfigRules(version, baseRates)).toMatchObject({ valid:false, message:'同一准确版本内同一货币对只能配置一条规则' })
  })

  it('dynamically falls through after a base rate is removed', () => {
    const version = { rules:[{ direction:'USD -> CNY', method:'固定汇率差', adjustDirection:'上浮', adjustValue:0.1 }] }
    expect(calculateRateConfigRules(version, baseRates)[0]).toMatchObject({ result:7.1, source:'BASE_RATE' })
    expect(calculateRateConfigRules(version, [])[0]).toMatchObject({ base:null, result:1, source:'FALLBACK_CHAIN' })
    expect(version.rules[0]).not.toHaveProperty('result')
  })
})
