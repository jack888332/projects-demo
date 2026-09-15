import { describe, expect, it } from 'vitest'
import {
  WAREHOUSE_QUOTE_CHARGE_METHODS, WAREHOUSE_QUOTE_CURRENCIES, WAREHOUSE_QUOTE_SUBJECTS,
  WAREHOUSE_QUOTE_SUBJECT_LABELS, WAREHOUSE_QUOTE_TODAY, WAREHOUSE_QUOTE_UNITS,
  createWarehouseQuoteDraft, createWarehouseQuoteSeed, deriveWarehouseQuoteStatus, filterWarehouseQuotes,
  getWarehouseQuoteAction, getWarehouseQuotePermissions, normalizeWarehouseQuoteDraft, validateWarehouseQuoteDraft,
} from '../src/domain/warehouseQuotes.js'

const partners = [
  { id: 'PT-00018', name: '启航跨境贸易', type: '客户', status: '有效' },
  { id: 'PT-00019', name: '云帆供应链', type: '客户', status: '有效' },
  { id: 'inactive', name: '演示未生效客户', type: '客户', status: '未生效' },
  { id: 'supplier', name: '演示供应商', type: '供应商', status: '已生效' },
]
const copy = value => JSON.parse(JSON.stringify(value))
const draft = (changes = {}) => {
  const row = createWarehouseQuoteSeed()[0]
  delete row.id
  return { ...row, ...changes }
}

describe('GJ-006 仓库报价字段与权限', () => {
  it('草稿保留十个字段，仅生效日期按演示时钟默认当天', () => {
    expect(createWarehouseQuoteDraft()).toEqual({
      partnerId: '', taxRate: '', currency: '', subject: '', amount: '', unit: '', chargeMethod: '',
      startDate: WAREHOUSE_QUOTE_TODAY, endDate: '', remark: '',
    })
    expect(WAREHOUSE_QUOTE_CURRENCIES).toEqual(['USD', 'HKD', 'CNY', 'GBP', 'EUR', 'AUD'])
    expect(WAREHOUSE_QUOTE_SUBJECTS).toEqual(['卸载操作费', '卸载最低费', '仓储费', '免租期', '打托费', '拆托费', '加重费', '分拣费', '改标签'])
    expect(WAREHOUSE_QUOTE_SUBJECT_LABELS['仓储费']).toBe('仓储费（KG/天）')
    expect(WAREHOUSE_QUOTE_UNITS).toEqual(['千克', '个', '托', '次'])
    expect(WAREHOUSE_QUOTE_CHARGE_METHODS).toEqual(['常规', '其他'])
  })

  it('四种seed确定、独立且通过同一校验', () => {
    const first = createWarehouseQuoteSeed(), second = createWarehouseQuoteSeed()
    expect(first).toEqual(second)
    expect(first.map(row => deriveWarehouseQuoteStatus(row))).toEqual(['生效', '待生效', '失效', '失效'])
    for (const row of first) expect(validateWarehouseQuoteDraft(row, first, partners, { existing: row })).toEqual({})
    first[0].remark = 'changed'
    expect(second[0].remark).toBe('')
  })

  it('所有客户可选，不把未约定的档案状态限制加到本篇', () => {
    for (const partnerId of ['PT-00018', 'PT-00019', 'inactive']) expect(validateWarehouseQuoteDraft(draft({ partnerId }), [], partners)).toEqual({})
    for (const partnerId of ['', 'supplier', 'missing']) expect(validateWarehouseQuoteDraft(draft({ partnerId }), [], partners)).toHaveProperty('partnerId')
  })

  it('航晟客服及主管可维护，管理员不自动取得本篇授权', () => {
    for (const role of ['hangsheng', 'supervisor']) expect(getWarehouseQuotePermissions(role)).toEqual({ create: true, edit: true, delete: true, toggle: true, reason: '' })
    for (const role of ['viewer', 'finance', 'service', 'admin', 'unknown', undefined]) expect(getWarehouseQuotePermissions(role)).toMatchObject({ create: false, edit: false, delete: false, toggle: false, reason: expect.any(String) })
  })

  it('必填及候选校验覆盖九个必填字段，备注可空', () => {
    const errors = validateWarehouseQuoteDraft({ ...createWarehouseQuoteDraft(), startDate: '' }, [], partners)
    expect(Object.keys(errors).sort()).toEqual(['partnerId', 'taxRate', 'currency', 'subject', 'amount', 'unit', 'chargeMethod', 'startDate', 'endDate'].sort())
    for (const field of ['currency', 'subject', 'unit', 'chargeMethod']) expect(validateWarehouseQuoteDraft(draft({ [field]: 'unknown' }), [], partners)).toHaveProperty(field)
    expect(validateWarehouseQuoteDraft(null, [], partners)).toHaveProperty('quote')
    expect(validateWarehouseQuoteDraft([], [], partners)).toHaveProperty('quote')
  })

  it('税率边界和小数精度准确，金额不增加尚未声明的上下界', () => {
    for (const value of [0, 100, '0.01', '99.99']) expect(validateWarehouseQuoteDraft(draft({ taxRate: value }), [], partners)).toEqual({})
    for (const value of ['', -1, 101, '1.001', 'NaN', '1e1', true, [1]]) expect(validateWarehouseQuoteDraft(draft({ taxRate: value }), [], partners)).toHaveProperty('taxRate')
    for (const value of [0, '-12.30', 99999.99]) expect(validateWarehouseQuoteDraft(draft({ amount: value }), [], partners)).toEqual({})
    for (const value of ['', '1.001', '1e3', true, [1], Infinity]) expect(validateWarehouseQuoteDraft(draft({ amount: value }), [], partners)).toHaveProperty('amount')
  })

  it('日期必须真实且有序，备注200字符，免租期新增待确认', () => {
    for (const [field, value] of [['startDate', '2026-02-30'], ['endDate', '2026-13-01'], ['endDate', '2026-08-31'], ['remark', '字'.repeat(201)], ['remark', {}]]) {
      expect(validateWarehouseQuoteDraft(draft({ [field]: value }), [], partners)).toHaveProperty(field)
    }
    expect(validateWarehouseQuoteDraft(draft({ remark: '字'.repeat(200) }), [], partners)).toEqual({})
    expect(validateWarehouseQuoteDraft(draft({ startDate: '2026-09-08', endDate: '2026-09-08' }), [], partners)).toHaveProperty('endDate', expect.stringContaining('待确认'))
    expect(validateWarehouseQuoteDraft(draft({ subject: '免租期' }), [], partners)).toHaveProperty('subject', expect.stringContaining('待确认'))
    const uncertain = { ...createWarehouseQuoteSeed()[0], subject: '免租期' }
    expect(validateWarehouseQuoteDraft({ ...uncertain, amount: 10 }, [uncertain], partners, { existing: uncertain })).toHaveProperty('subject', expect.stringContaining('待确认'))
  })

  it('编辑锁定客户、税率、币种，且只排除自身做期间去重', () => {
    const existing = createWarehouseQuoteSeed()[0]
    for (const [field, value] of [['partnerId', 'PT-00019'], ['taxRate', 7], ['currency', 'USD']]) {
      expect(validateWarehouseQuoteDraft({ ...copy(existing), [field]: value }, [existing], partners, { existing })).toHaveProperty(field, expect.stringContaining('不可修改'))
    }
    expect(validateWarehouseQuoteDraft({ ...copy(existing), taxRate: '6.00', amount: '1.20', unit: '次', chargeMethod: '其他', remark: '修改' }, [existing], partners, { existing })).toEqual({})
  })

  it('同客户同科目严格重叠拒绝，同日相接仅阻断待确认，不忽略失效记录', () => {
    const existing = { ...createWarehouseQuoteSeed()[0], manualDisabled: true }
    expect(validateWarehouseQuoteDraft(draft(), [{ ...existing, manualDisabled: false }], partners)).toHaveProperty('endDate', '已存在报价，请勿重复添加')
    expect(validateWarehouseQuoteDraft(draft(), [existing], partners)).toHaveProperty('endDate', expect.stringContaining('人工停用报价，去重范围待确认'))
    for (const dates of [{ startDate: '2026-09-30', endDate: '2026-10-31' }, { startDate: '2026-08-01', endDate: '2026-09-01' }]) {
      expect(validateWarehouseQuoteDraft(draft(dates), [existing], partners)).toHaveProperty('endDate', expect.stringContaining('待确认'))
    }
    for (const changes of [{ startDate: '2026-10-01', endDate: '2026-10-31' }, { partnerId: 'PT-00019' }, { subject: '打托费' }]) {
      expect(validateWarehouseQuoteDraft(draft(changes), [existing], partners)).toEqual({})
    }
    const expired = { ...existing, manualDisabled: false, startDate: '2026-08-01', endDate: '2026-08-31' }
    expect(validateWarehouseQuoteDraft(draft({ startDate: '2026-08-02', endDate: '2026-08-20' }), [expired], partners)).toHaveProperty('endDate', '已存在报价，请勿重复添加')
  })

  it('规范化只保留十字段及ID，不写入调用方伪造的状态或更新时间', () => {
    const output = normalizeWarehouseQuoteDraft({ ...draft(), remark: '  演示  ', manualDisabled: true, updatedBy: 'FORGED', injected: 'ignored' })
    expect(output.remark).toBe('演示')
    for (const field of ['manualDisabled', 'updatedBy', 'injected']) expect(output).not.toHaveProperty(field)
    expect(Object.keys(output)).toHaveLength(10)
  })
})

describe('GJ-006 仓库报价生命周期与查询', () => {
  it('起日当天生效、未来待生效、截止等日待确认、逾期失效', () => {
    const row = draft()
    for (const [day, status] of [['2026-08-31', '待生效'], ['2026-09-01', '生效'], ['2026-09-08', '生效'], ['2026-09-30', '口径待确认'], ['2026-10-01', '失效'], ['invalid', '口径待确认']]) expect(deriveWarehouseQuoteStatus(row, day)).toBe(status)
    expect(deriveWarehouseQuoteStatus(null)).toBe('口径待确认')
    expect(deriveWarehouseQuoteStatus(draft({ endDate: '2026-08-31' }))).toBe('口径待确认')
  })

  it('人工停用不修改日期，只有期间内被人工停用的报价可重新启用', () => {
    const live = draft(), disabled = draft({ manualDisabled: true })
    expect(deriveWarehouseQuoteStatus(disabled)).toBe('失效')
    expect(getWarehouseQuoteAction(live, 'disable')).toEqual({ allowed: true, reason: '' })
    expect(getWarehouseQuoteAction(disabled, 'enable')).toEqual({ allowed: true, reason: '' })
    expect(getWarehouseQuoteAction(live, 'enable').allowed).toBe(false)
    expect(getWarehouseQuoteAction(disabled, 'disable').allowed).toBe(false)
    for (const day of ['2026-08-31', '2026-09-30', '2026-10-01', 'invalid']) {
      expect(getWarehouseQuoteAction(live, 'disable', day).allowed).toBe(false)
      expect(getWarehouseQuoteAction(disabled, 'enable', day).allowed).toBe(false)
    }
    expect(getWarehouseQuoteAction(null, 'enable').allowed).toBe(false)
    expect(getWarehouseQuoteAction(live, 'unknown').allowed).toBe(false)
  })

  it('客户及科目精确组合查询，无条件全部，不实现未定义的模糊搜索', () => {
    const rows = createWarehouseQuoteSeed(), snapshot = JSON.stringify(rows)
    expect(filterWarehouseQuotes(rows, {}, partners)).toHaveLength(4)
    expect(filterWarehouseQuotes(rows, { partnerId: 'PT-00018' }, partners)).toHaveLength(2)
    expect(filterWarehouseQuotes(rows, { subject: '打托费' }, partners).map(row => row.id)).toEqual(['WQ-00000003'])
    expect(filterWarehouseQuotes(rows, { partnerId: 'PT-00018', subject: '打托费' }, partners)).toEqual([])
    expect(filterWarehouseQuotes(rows, { subject: '打托' }, partners)).toEqual([])
    expect(JSON.stringify(rows)).toBe(snapshot)
  })

  it('依客户首字拼音、科目首字拼音排序，不用客户余字覆盖科目排序', () => {
    const sameInitialPartners = [{ id: 'q1', name: '启航乙', type: '客户' }, { id: 'q2', name: '启航甲', type: '客户' }, { id: 'y', name: '云帆', type: '客户' }]
    const rows = [{ id: '1', partnerId: 'q1', subject: '打托费' }, { id: '2', partnerId: 'q2', subject: '卸载操作费' }, { id: '3', partnerId: 'y', subject: '仓储费' }]
    expect(filterWarehouseQuotes(rows, {}, sameInitialPartners).map(row => row.id)).toEqual(['1', '2', '3'])
  })
})
