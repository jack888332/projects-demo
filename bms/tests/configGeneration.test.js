import { describe, expect, it } from 'vitest'
import { buildConfigGenerationScopes, configReferenceStats, createConfigBatchTaskRows, createReceivableConfigNo, numberReceivableSchemes, taskOverlapsReferenceStart } from '../src/domain/configGeneration.js'

const config = {
  id: 'AR-CFG-001', type: 'AR', no: 'ARB-SCHEME-20260801101800123', version: 'V2',
  effectStart: '2026-08-01', effectEnd: '长期',
  schemeSnapshot: {
    defaultScheme: { schemeKey:'ARB-SCHEME-20260801101800123', period:'MONTH', effectPeriod:['2026-08-01', '2027-07-31'] },
    branches: [{ schemeKey:'ARB-SCHEME-20260801101800123-BRANCH-1', enabled:true, period:'HALF_MONTH', effectPeriod:['2026-08-01', '2027-07-31'] }],
  },
}

const reference = (overrides = {}) => ({
  id: 'AR-R-001', configId: 'AR-CFG-001', configNo: 'ARB-SCHEME-20260801101800123', version: 'V2', status:'启用',
  customerCode: 'OG0271', customerName: '客户一', memberCode: 'M-001', store: '店铺一', group: '客户组一',
  referenceNo: 'AR-REF-001', effectStart: '2026-08-01', effectEnd: '长期', ...overrides,
})

describe('reusable configuration generation', () => {
  it('numbers the default scheme from its creation timestamp and derives monotonic branch numbers', () => {
    const configNo = createReceivableConfigNo('2026-08-28 13:45:12.345')
    const numbered = numberReceivableSchemes({
      branchKeyCeiling:4,
      defaultScheme:{ schemeKey:'DEFAULT' },
      branches:[{ schemeKey:'BRANCH-2' }, { schemeKey:'ARB-OLD-BRANCH-5' }],
    }, configNo)

    expect(configNo).toBe('ARB-SCHEME-20260828134512345')
    expect(numbered.defaultScheme.schemeKey).toBe(configNo)
    expect(numbered.branches.map(row => row.schemeKey)).toEqual([`${configNo}-BRANCH-2`, `${configNo}-BRANCH-5`])
    expect(numbered.branchKeyCeiling).toBe(5)
    expect(createReceivableConfigNo('2026-08-28 13:45:12.345', [configNo])).toBe('ARB-SCHEME-20260828134512346')
  })

  it('derives unused, exclusive and shared labels from active references', () => {
    expect(configReferenceStats(config, [])).toMatchObject({ usageType:'UNUSED', total:0 })
    expect(configReferenceStats(config, [reference()])).toMatchObject({ usageType:'EXCLUSIVE', total:1, exact:1 })
    expect(configReferenceStats(config, [reference(), reference({ id:'AR-R-002', customerCode:'OG0347', version:'V1' })])).toMatchObject({ usageType:'SHARED', total:2, exact:2, label:'共享配置' })
    expect(configReferenceStats(config, [reference(), reference({ id:'AR-R-DUPLICATE' })])).toMatchObject({ usageType:'EXCLUSIVE', total:1, exact:1 })
  })

  it('does not let expired or future references change the current usage label', () => {
    const active = reference()
    const future = reference({ id:'AR-R-002', customerCode:'OG0347', effectStart:'2026-09-01' })
    const expired = reference({ id:'AR-R-003', customerCode:'OG0412', effectEnd:'2026-08-26' })

    expect(configReferenceStats(config, [active, future, expired], '2026-08-27')).toMatchObject({ usageType:'EXCLUSIVE', total:1 })
    expect(configReferenceStats(config, [future, expired], '2026-08-27')).toMatchObject({ usageType:'UNUSED', total:0 })
    expect(configReferenceStats(config, [active, future], '2026-09-01')).toMatchObject({ usageType:'SHARED', total:2 })
  })

  it('expands all current configuration references with the current version and scheme numbers', () => {
    const result = buildConfigGenerationScopes({
      config,
      references: [reference(), reference({ id:'AR-R-002', customerCode:'OG0347', version:'V1' })],
      tasks: [],
      cutoff: '2026-08-27 16:45:00',
    })

    expect(result.referenceCustomerCount).toBe(2)
    expect(result.rows.map(row => row.schemeKey)).toEqual([
      'ARB-SCHEME-20260801101800123', 'ARB-SCHEME-20260801101800123-BRANCH-1',
      'ARB-SCHEME-20260801101800123', 'ARB-SCHEME-20260801101800123-BRANCH-1',
    ])
    expect(result.rows.find(row => row.schemeKey === 'ARB-SCHEME-20260801101800123-BRANCH-1')).toMatchObject({
      customerCode: 'OG0271', periodStart: '2026-08-01', periodEnd: '2026-08-15', blocked: false,
    })
  })

  it('does not include a customer before its accurate-version reference becomes effective', () => {
    const result = buildConfigGenerationScopes({ config, references:[reference({ effectStart:'2026-09-01' })], tasks:[], cutoff:'2026-08-27 16:45:00' })
    expect(result).toMatchObject({ rows:[], referenceCustomerCount:0 })
  })

  it('uses confirmation time rather than an editable data cutoff to resolve references', () => {
    const result = buildConfigGenerationScopes({
      config,
      references:[reference({ effectStart:'2026-09-01' })],
      tasks:[],
      cutoff:'2026-09-30 23:59:59',
      referenceAt:'2026-08-27 16:45:00',
    })
    expect(result).toMatchObject({ rows:[], referenceCustomerCount:0 })
  })

  it('uses a version-independent business lock and ignores deleted failures', () => {
    const baseTask = {
      taskNo: 'BMS-OLD', status: 'FAILED', customerNo: 'OG0271', schemeKey: 'ARB-SCHEME-20260801101800123-BRANCH-1',
      periodStart: '2026-08-01', periodEnd: '2026-08-15',
      lockKey: 'OG0271|AR|ARB-SCHEME-20260801101800123-BRANCH-1|2026-08-01/2026-08-15|BILL_GENERATE',
    }
    const blocked = buildConfigGenerationScopes({ config, references:[reference()], tasks:[baseTask], cutoff:'2026-08-27 16:45:00' })
    const released = buildConfigGenerationScopes({ config, references:[reference()], tasks:[{ ...baseTask, deletedAt:'2026-08-27 17:05:00' }], cutoff:'2026-08-27 16:45:00' })

    expect(blocked.rows.find(row => row.schemeKey === 'ARB-SCHEME-20260801101800123-BRANCH-1').reason).toContain('BMS-OLD')
    expect(released.rows.find(row => row.schemeKey === 'ARB-SCHEME-20260801101800123-BRANCH-1').blocked).toBe(false)
  })

  it('blocks generation while a recalculation owns the same business range', () => {
    const recalculation = {
      taskNo:'BMS-RECALCULATE', taskType:'BILL_RECALCULATE', status:'RUNNING', customerNo:'OG0271', billType:'AR', schemeKey:'ARB-SCHEME-20260801101800123-BRANCH-1',
      periodStart:'2026-08-01', periodEnd:'2026-08-15',
      lockKey:'OG0271|AR|ARB-SCHEME-20260801101800123-BRANCH-1|2026-08-01/2026-08-15|BILL_RECALCULATE',
    }
    const result = buildConfigGenerationScopes({ config, references:[reference()], tasks:[recalculation], cutoff:'2026-08-27 16:45:00' })
    expect(result.rows.find(row => row.schemeKey === 'ARB-SCHEME-20260801101800123-BRANCH-1').reason).toContain('BMS-RECALCULATE')
  })

  it('blocks unfinished tasks anywhere in the new reference effective window', () => {
    const task = { status:'PENDING', customerNo:'OG0271', billType:'AR', periodStart:'2026-09-10', periodEnd:'2026-09-16', deletedAt:'' }
    expect(taskOverlapsReferenceStart(task, { customerCode:'OG0271', billType:'AR', effectiveAt:'2026-09-01' })).toBe(true)
    expect(taskOverlapsReferenceStart({ ...task, periodEnd:'2026-08-31' }, { customerCode:'OG0271', billType:'AR', effectiveAt:'2026-09-01' })).toBe(false)
  })

  it('creates one non-executing batch reference and flat customer tasks', () => {
    const preview = buildConfigGenerationScopes({ config, references:[reference()], tasks:[], cutoff:'2026-08-27 16:45:00' })
    const scopes = preview.rows.filter(row => !row.blocked)
    const result = createConfigBatchTaskRows({ config, scopes, skippedCount:1, frozenCustomerCount:1, cutoff:'2026-08-27 16:45:00', existingTasks:[] })

    expect(result.batchNo).toMatch(/^BMSB-20260827-/)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ batchNo:result.batchNo, customerNo:'OG0271', schemeKey:'ARB-SCHEME-20260801101800123-BRANCH-1', configVersion:'V2', configSource:'CONFIG', status:'PENDING' })
    expect(result.rows[0]).not.toHaveProperty('parentTaskNo')
  })

  it('uses configured half-week start days for refund periods', () => {
    const refundConfig = {
      id:'RF-CFG-001', type:'RF', no:'RFB-001', version:'V2', effectStart:'2026-08-01', effectEnd:'长期',
      refundSnapshot:{ billingPeriodType:'HALF_WEEK', startDays:['2', '5'], effectPeriod:['2026-08-01', '2027-07-31'] },
    }
    const result = buildConfigGenerationScopes({
      config:refundConfig,
      references:[reference({ id:'RF-R-001', configId:'RF-CFG-001', configNo:'RFB-001', version:'V2', type:'RF' })],
      tasks:[],
      cutoff:'2026-08-27 00:00:00',
    })

    expect(result.rows[0]).toMatchObject({ schemeKey:'REFUND', periodStart:'2026-08-21', periodEnd:'2026-08-24' })
  })
})
