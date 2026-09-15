import { describe, expect, it } from 'vitest'
import {
  AIR_RATE_CURRENCIES, AIR_RATE_METHODS, AIR_RATE_SERVICES, AIR_RATE_TODAY, AIR_RATE_UNIT_CONFLICTS, AIR_RATE_UNITS,
  createAirSupplierRateDraft, createAirSupplierRateSeed, createFinanceCostItemSeed, deriveAirSupplierRateStatus,
  filterAirSupplierRates, getAirRateMethodRestriction, getAirSupplierRateAction, getAirSupplierRatePermissions,
  normalizeAirSupplierRateDraft, validateAirSupplierRateDraft,
} from '../src/domain/airSupplierRates.js'

const context = () => ({
  partners: [{ id: 'PT-00027', name: '东方航空', type: '供应商', status: '有效' }, { id: 'PT-00028', name: '南方航空', type: '供应商', status: '失效' }, { id: 'PT-00018', name: '启航贸易', type: '客户', status: '有效' }],
  financeCostItems: createFinanceCostItemSeed(), airSupplierRates: [],
})
const draft = (changes = {}) => ({
  ...createAirSupplierRateDraft(), partnerId: 'PT-00027', serviceType: '订舱', feeItemId: 'FC-0001',
  billingUnit: '提单计费重(kg)', chargeMethod: '常规方式', unitPrice: '12.50', currency: 'CNY',
  startDate: '2026-09-01', endDate: '2026-09-30', ...changes,
})
const existing = (changes = {}) => ({ ...draft(), id: 'ASR-existing', status: '已生效', ...changes })

describe('GJ-007 空运供应商价格字段', () => {
  it('保留本篇八类服务、四种方式和明确计费单位；件重比冲突不混入可保存候选', () => {
    expect(AIR_RATE_SERVICES).toHaveLength(8)
    expect(AIR_RATE_METHODS).toEqual(['常规方式', '航晟运输报价', '梯度报价', '首加续报价'])
    expect(AIR_RATE_UNITS).toHaveLength(5)
    expect(AIR_RATE_CURRENCIES).toEqual(['USD', 'HKD', 'CNY', 'GBP', 'EUR', 'AUD'])
    for (const billingUnit of AIR_RATE_UNIT_CONFLICTS) {
      expect(AIR_RATE_UNITS).not.toContain(billingUnit)
      expect(validateAirSupplierRateDraft(draft({ billingUnit }), context()).billingUnit).toContain('口径冲突')
    }
  })

  it('新增只给税率默认0，其余维护字段与日期均无预设', () => {
    const row = createAirSupplierRateDraft()
    expect(row.taxRate).toBe(0)
    expect(row.details).toEqual([])
    for (const key of ['partnerId', 'serviceType', 'feeItemId', 'billingUnit', 'chargeMethod', 'unitPrice', 'currency', 'startDate', 'endDate', 'contractNo']) expect(row[key]).toBe('')
    expect(row).not.toHaveProperty('status')
    expect(row).not.toHaveProperty('creator')
    expect(row).not.toHaveProperty('updatedAt')
  })

  it('仅客服主管允许创建、编辑和启停，不借用管理员或航晟角色', () => {
    expect(getAirSupplierRatePermissions('supervisor')).toMatchObject({ create: true, edit: true, toggle: true, reason: '' })
    for (const role of ['service', 'hangsheng', 'finance', 'admin', 'viewer', '', undefined]) expect(getAirSupplierRatePermissions(role)).toMatchObject({ create: false, edit: false, toggle: false })
  })

  it('常规完整报价通过；供应商档案没有额外施加有效状态限定', () => {
    expect(validateAirSupplierRateDraft(draft(), context())).toEqual({})
    expect(validateAirSupplierRateDraft(draft({ partnerId: 'PT-00028' }), context())).toEqual({})
    const state = context()
    state.financeCostItems[0].status = '失效'
    expect(validateAirSupplierRateDraft(draft(), state)).toEqual({})
    expect(validateAirSupplierRateDraft(draft({ partnerId: 'PT-00018' }), state).partnerId).toContain('供应商档案')
    expect(validateAirSupplierRateDraft(draft({ feeItemId: 'missing' }), state).feeItemId).toContain('结算中心')
  })

  it('空输入逐字段报错，未知枚举不能绕过候选', () => {
    expect(Object.keys(validateAirSupplierRateDraft(createAirSupplierRateDraft(), context()))).toHaveLength(8)
    for (const key of ['serviceType', 'billingUnit', 'chargeMethod', 'currency']) expect(validateAirSupplierRateDraft(draft({ [key]: '伪造' }), context())).toHaveProperty(key)
    for (const value of [null, [], true, 'wrong']) expect(validateAirSupplierRateDraft(value, context())).toHaveProperty('rate')
  })

  it('单价至多两位小数、税率整数，不擅自增添其他章节的数值范围', () => {
    for (const unitPrice of ['1.234', '', true, [], {}, Infinity, '1e3', 'NaN']) expect(validateAirSupplierRateDraft(draft({ unitPrice }), context())).toHaveProperty('unitPrice')
    for (const taxRate of ['1.5', '1.0', '', true, [], {}, Infinity]) expect(validateAirSupplierRateDraft(draft({ taxRate }), context())).toHaveProperty('taxRate')
    for (const unitPrice of [0, -2.15, '1.20']) expect(validateAirSupplierRateDraft(draft({ unitPrice }), context())).toEqual({})
    for (const taxRate of [-1, 0, 101]) expect(validateAirSupplierRateDraft(draft({ taxRate }), context())).toEqual({})
  })

  it('合同选填且最多20字符；不允许非文本值', () => {
    expect(validateAirSupplierRateDraft(draft({ contractNo: 'A'.repeat(20) }), context())).toEqual({})
    for (const contractNo of ['A'.repeat(21), 1, {}]) expect(validateAirSupplierRateDraft(draft({ contractNo }), context())).toHaveProperty('contractNo')
  })

  it('日期采用真实日历校验，倒置、同日以及截止当天分别阻断', () => {
    for (const startDate of ['2026-2-1', '2026-02-30', 'invalid', 1]) expect(validateAirSupplierRateDraft(draft({ startDate }), context())).toHaveProperty('startDate')
    expect(validateAirSupplierRateDraft(draft({ endDate: '2026-08-31' }), context()).endDate).toContain('不能早于')
    expect(validateAirSupplierRateDraft(draft({ endDate: '2026-09-01' }), context()).endDate).toContain('同日')
    expect(validateAirSupplierRateDraft(draft({ endDate: AIR_RATE_TODAY }), context()).endDate).toContain('截止当日')
    expect(validateAirSupplierRateDraft(draft({ startDate: AIR_RATE_TODAY }), context())).toEqual({})
  })

  it('未来生效的新增不编造第三状态，日期字段仍可保存', () => {
    expect(validateAirSupplierRateDraft(draft({ startDate: '2026-10-01', endDate: '2026-10-31' }), context())).toEqual({})
    expect(deriveAirSupplierRateStatus(existing({ startDate: '2026-10-01', endDate: '2026-10-31' }))).toBe('已生效')
  })

  it('复杂方式单价留空且只读来源、计算规则未明确时不能提交', () => {
    for (const chargeMethod of AIR_RATE_METHODS.slice(1)) {
      const result = normalizeAirSupplierRateDraft(draft({ chargeMethod, unitPrice: '99', details: [{ injected: 'unconfirmed' }] }))
      expect(result.unitPrice).toBe('')
      expect(result.details).toEqual([])
      expect(validateAirSupplierRateDraft(result, context()).details).toBe(getAirRateMethodRestriction(chargeMethod))
      expect(validateAirSupplierRateDraft(result, context())).not.toHaveProperty('unitPrice')
    }
    expect(getAirRateMethodRestriction('常规方式')).toBe('')
  })

  it('归一化只收维护字段、去首尾空格，不接收系统字段或任何复杂详情写入', () => {
    const input = draft({ id: ' ASR-test ', partnerId: ' PT-00027 ', contractNo: ' CT-007 ', status: '失效', creator: 'forged', updatedAt: 'forged', updateSequence: 999, injected: true, details: [{ unitPrice: 20 }] })
    const result = normalizeAirSupplierRateDraft(input)
    expect(result).toMatchObject({ id: 'ASR-test', partnerId: 'PT-00027', contractNo: 'CT-007', details: [] })
    for (const key of ['status', 'creator', 'updatedAt', 'updateSequence', 'injected']) expect(result).not.toHaveProperty(key)
  })
})

describe('GJ-007 期间、状态和查询', () => {
  it('新增三元组相同且期间重叠时，所有既有状态都阻断', () => {
    for (const status of ['已生效', '失效']) {
      const state = { ...context(), airSupplierRates: [existing({ status })] }
      expect(validateAirSupplierRateDraft(draft({ startDate: '2026-09-05', endDate: '2026-09-20' }), state).endDate).toContain('不允许新增')
      for (const changes of [{ partnerId: 'PT-00028' }, { serviceType: '仓储' }, { feeItemId: 'FC-0002' }, { startDate: '2026-10-01', endDate: '2026-10-31' }]) expect(validateAirSupplierRateDraft(draft(changes), state)).toEqual({})
    }
  })

  it('编辑排除自身，生效重叠拒绝，涉及失效的编辑去重口径单独标待确认', () => {
    const row = existing()
    const state = { ...context(), airSupplierRates: [row] }
    expect(validateAirSupplierRateDraft(draft({ unitPrice: 20 }), state, { existing: row })).toEqual({})
    state.airSupplierRates.push(existing({ id: 'another' }))
    expect(validateAirSupplierRateDraft(draft(), state, { existing: row }).endDate).toContain('生效且有效期重叠')
    state.airSupplierRates[1].status = '失效'
    expect(validateAirSupplierRateDraft(draft(), state, { existing: row }).endDate).toContain('待确认')
    row.status = '失效'
    state.airSupplierRates[1].status = '已生效'
    expect(validateAirSupplierRateDraft(draft(), state, { existing: row }).endDate).toContain('待确认')
  })

  it('启用去重只检查已生效的同三元组，并阻断同日相接边界', () => {
    const row = existing({ status: '失效' })
    const other = existing({ id: 'another', status: '失效' })
    const state = { ...context(), airSupplierRates: [row, other] }
    expect(validateAirSupplierRateDraft(row, state, { existing: row, activating: true })).toEqual({})
    other.status = '已生效'
    expect(validateAirSupplierRateDraft(row, state, { existing: row, activating: true }).endDate).toContain('生效且有效期重叠')
    other.startDate = row.endDate
    other.endDate = '2026-10-31'
    expect(validateAirSupplierRateDraft(row, state, { existing: row, activating: true }).endDate).toContain('同日相接')
  })

  it('截止日期早于当前日期的编辑不允许保存，也不通过顺延日期绕过', () => {
    const row = existing({ startDate: '2026-08-01', endDate: '2026-08-31' })
    const state = { ...context(), airSupplierRates: [row] }
    expect(validateAirSupplierRateDraft(row, state, { existing: row }).endDate).toContain('早于当前日期')
    expect(validateAirSupplierRateDraft({ ...row, endDate: '2026-10-31' }, state, { existing: row }).endDate).toContain('状态口径待确认')
  })

  it('已生效、人工失效与超期派生状态不修改原记录', () => {
    const row = existing()
    expect(deriveAirSupplierRateStatus(row)).toBe('已生效')
    expect(deriveAirSupplierRateStatus(row, '2026-10-01')).toBe('失效')
    expect(row.status).toBe('已生效')
    expect(deriveAirSupplierRateStatus({ ...row, status: '失效' })).toBe('失效')
    expect(deriveAirSupplierRateStatus({ ...row, endDate: AIR_RATE_TODAY })).toBe('已生效')
    expect(deriveAirSupplierRateStatus({ ...row, status: 'invented' })).toBe('')
  })

  it('本期报价可以失效及启用，重复动作无效', () => {
    expect(getAirSupplierRateAction(existing(), 'disable')).toEqual({ allowed: true, reason: '' })
    expect(getAirSupplierRateAction(existing(), 'enable').reason).toContain('无需重复')
    expect(getAirSupplierRateAction(existing({ status: '失效' }), 'enable')).toEqual({ allowed: true, reason: '' })
    expect(getAirSupplierRateAction(existing({ status: '失效' }), 'disable').reason).toContain('无需重复')
  })

  it('过去、未来、截止当天、同日及坏日期的状态操作均局部阻断', () => {
    for (const changes of [
      { startDate: '2026-08-01', endDate: '2026-08-31' }, { startDate: '2026-10-01', endDate: '2026-10-31' },
      { endDate: AIR_RATE_TODAY }, { startDate: AIR_RATE_TODAY, endDate: AIR_RATE_TODAY }, { endDate: 'invalid' },
    ]) for (const action of ['enable', 'disable']) expect(getAirSupplierRateAction(existing(changes), action).allowed).toBe(false)
    expect(getAirSupplierRateAction(null, 'enable').reason).toContain('不存在')
    expect(getAirSupplierRateAction(existing(), 'delete').reason).toContain('未知')
  })

  it('复杂方式不能启用，但已生效旧记录允许失效', () => {
    for (const chargeMethod of AIR_RATE_METHODS.slice(1)) {
      expect(getAirSupplierRateAction(existing({ chargeMethod, status: '失效' }), 'enable').reason).toBe(getAirRateMethodRestriction(chargeMethod))
      expect(getAirSupplierRateAction(existing({ chargeMethod }), 'disable').allowed).toBe(true)
    }
  })

  it('名称模糊查询不扩为ID匹配，其余三项按候选精确匹配，并按更新时间倒序', () => {
    const rows = createAirSupplierRateSeed(), state = context()
    expect(filterAirSupplierRates(rows, {}, state).map(row => row.id)).toEqual(rows.map(row => row.id).reverse())
    expect(filterAirSupplierRates(rows, { supplier: ' 东方 ' }, state)).toHaveLength(6)
    expect(filterAirSupplierRates(rows, { supplier: 'PT-00027' }, state)).toHaveLength(0)
    expect(filterAirSupplierRates(rows, { feeItem: '运费' }, state).map(row => row.id)).toEqual(['ASR-00000001'])
    expect(filterAirSupplierRates(rows, { status: '失效' }, state)).toHaveLength(5)
    expect(filterAirSupplierRates(rows, { serviceType: '报关', billingUnit: '分单数(个)' }, state).map(row => row.id)).toEqual(['ASR-00000002'])
    rows[0].updatedAt = '2026-09-08 14:30'
    expect(filterAirSupplierRates(rows, {}, state)[0]).toBe(rows[0])
    expect(rows[0].id).toBe('ASR-00000001')
  })

  it('合成费用项与报价独立恢复，复杂详情没有虚构区间值', () => {
    const first = createFinanceCostItemSeed(), second = createFinanceCostItemSeed()
    first[0].name = 'changed'
    expect(second[0].name).toBe('运费成本')
    expect(second[0]).toMatchObject({ code: 'F001', status: '已生效' })
    expect(second.map(row => row.name)).toContain('提单费')
    for (const row of createAirSupplierRateSeed().slice(3)) {
      expect(row.status).toBe('失效')
      expect(row.details).toEqual([])
      expect(row.unitPrice).toBe('')
    }
  })
})
