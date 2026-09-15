import { describe, expect, it } from 'vitest'
import {
  TRANSPORT_QUOTE_CURRENCIES, TRANSPORT_QUOTE_TODAY, TRANSPORT_QUOTE_VEHICLES,
  createTransportQuoteDraft, createTransportQuoteSeed, filterTransportQuotes,
  getTransportQuoteStatus, normalizeTransportQuoteDraft, validateTransportQuoteDraft,
} from '../src/domain/transportQuotes.js'

const partners = [
  { id: 'PT-00031', name: '申捷车队', type: '供应商', status: '已生效' },
  { id: 'PT-00018', name: '启航跨境贸易', type: '客户', status: '已生效' },
  { id: 'inactive', name: '失效演示供应商', type: '供应商', status: '已失效' },
]
const copy = value => JSON.parse(JSON.stringify(value))
const draft = (kind = 'supplier', changes = {}) => {
  const row = createTransportQuoteSeed().find(value => value.kind === kind)
  delete row.id
  return { ...row, ...changes }
}

describe('GJ-005 报价字段与候选', () => {
  it('草稿保留全部字段且仅起始日期具有明示默认值', () => {
    const row = createTransportQuoteDraft('supplier')
    expect(row.startDate).toBe(TRANSPORT_QUOTE_TODAY)
    expect(row.chargeMode).toBe('')
    expect(row.transportType).toBe('')
    expect(row.taxRate).toBe('')
    expect(row.pickup).toEqual({ province: '', city: '', district: '', address: '' })
    for (const field of ['transitHours', 'waitingFee', 'startPrice', 'returnRate', 'transportType']) expect(row).toHaveProperty(field)
    expect(() => createTransportQuoteDraft('unknown')).toThrow('未知')
  })

  it('报价车型不猜测调度映射，币种采用字典六项而不是JYP拼写', () => {
    expect(TRANSPORT_QUOTE_VEHICLES).toContain('3T')
    expect(TRANSPORT_QUOTE_VEHICLES).not.toContain('3T/4.2')
    expect(TRANSPORT_QUOTE_CURRENCIES).toEqual(['USD', 'HKD', 'CNY', 'GBP', 'EUR', 'AUD'])
    expect(validateTransportQuoteDraft(draft('supplier', { vehicleType: '3T/4.2', currency: 'JYP' }), [], partners)).toMatchObject({ vehicleType: expect.any(String), currency: expect.any(String) })
  })

  it('两类seed确定、互不共享，并通过同一校验', () => {
    const first = createTransportQuoteSeed(), second = createTransportQuoteSeed()
    expect(first).toEqual(second)
    for (const row of first) {
      expect(validateTransportQuoteDraft(row, first, partners, { existing: row })).toEqual({})
      expect(getTransportQuoteStatus(row)).toBe('有效')
    }
    first[0].pickup.city = 'changed'
    expect(second[0].pickup.city).toBe('上海市')
    expect(first[1].pickup.city).toBe('上海市')
  })

  it('合作方类型、生效状态、省市区联动必须有效', () => {
    for (const partnerId of ['', 'PT-00018', 'inactive', 'missing']) expect(validateTransportQuoteDraft(draft('supplier', { partnerId }), [], partners)).toHaveProperty('partnerId')
    expect(validateTransportQuoteDraft(draft('customer'), [], partners)).toEqual({})
    const row = draft('supplier', { pickup: { province: '江苏省', city: '上海市', district: '浦东新区', address: '' } })
    expect(validateTransportQuoteDraft(row, [], partners)).toHaveProperty('pickup.city')
    expect(validateTransportQuoteDraft(row, [], partners)).toHaveProperty('pickup.district')
    expect(validateTransportQuoteDraft(draft('supplier', { delivery: { province: '江苏省', city: '苏州市', district: '', address: '' } }), [], partners)).toEqual({})
  })

  it('比例允许零和100但拒绝超界、额外小数及非数值', () => {
    for (const field of ['taxRate', 'returnRate']) {
      for (const value of [0, 100, '0.01', '99.99']) expect(validateTransportQuoteDraft(draft('supplier', { [field]: value }), [], partners)).toEqual({})
      for (const value of ['', -1, 101, '1.001', 'NaN', true, [1]]) expect(validateTransportQuoteDraft(draft('supplier', { [field]: value }), [], partners)).toHaveProperty(field)
    }
  })

  it('两类固定收费只填运输费，单价收费必须有单价和单位，不能同时填写', () => {
    for (const kind of ['supplier', 'customer']) {
      expect(validateTransportQuoteDraft(draft(kind), [], partners)).toEqual({})
      expect(validateTransportQuoteDraft(draft(kind, { transportFee: 0 }), [], partners)).toEqual({})
      expect(validateTransportQuoteDraft(draft(kind, { unit: 'kg' }), [], partners)).toHaveProperty('chargeMode')
      expect(validateTransportQuoteDraft(draft(kind, { chargeMode: 'unit', unitPrice: '1.25', unit: 'kg', transportFee: '' }), [], partners)).toEqual({})
      expect(validateTransportQuoteDraft(draft(kind, { chargeMode: 'unit', unitPrice: 2, unit: 'kg' }), [], partners)).toHaveProperty('chargeMode')
      expect(validateTransportQuoteDraft(draft(kind, { chargeMode: 'unit', unitPrice: '', unit: '', transportFee: '' }), [], partners)).toMatchObject({ unitPrice: expect.any(String), unit: expect.any(String) })
    }
  })

  it('金额精度、真实日期、备注上限和可选枚举校验', () => {
    for (const field of ['transportFee', 'unitPrice', 'startPrice']) expect(validateTransportQuoteDraft(draft('supplier', { [field]: '2.001' }), [], partners)).toHaveProperty(field)
    for (const [field, value] of [['startDate', '2026-02-30'], ['endDate', '2026-08-31'], ['remark', '字'.repeat(201)], ['regulated', '未知'], ['tailLift', true], ['transportType', '未知'], ['specialVehicle', '未知'], ['transitHours', -1], ['waitingFee', 'abc']]) {
      expect(validateTransportQuoteDraft(draft('supplier', { [field]: value }), [], partners)).toHaveProperty(field)
    }
    expect(validateTransportQuoteDraft(draft('supplier', { startDate: '2026-09-08', endDate: '2026-09-08' }), [], partners)).toEqual({})
  })

  it('编辑锁定合作方、税率、币种和特种车，路线及报价可编辑', () => {
    const existing = createTransportQuoteSeed()[0]
    for (const [field, value] of [['partnerId', 'missing'], ['taxRate', 7], ['currency', 'USD'], ['specialVehicle', '冷藏车']]) {
      expect(validateTransportQuoteDraft({ ...copy(existing), [field]: value }, [existing], partners, { existing })).toHaveProperty(field, expect.stringContaining('不可修改'))
    }
    expect(validateTransportQuoteDraft({ ...copy(existing), taxRate: '6.00', transportFee: 1000, transitHours: 4 }, [existing], partners, { existing })).toEqual({})
  })

  it('标准供应商重叠报价拒绝；客户、详细地址、往返及相接日期边界明确待确认', () => {
    const existing = createTransportQuoteSeed()[0]
    expect(validateTransportQuoteDraft(draft(), [existing], partners)).toHaveProperty('endDate', '已存在报价，请勿重复添加')
    for (const changes of [
      { transportType: '往返' },
      { pickup: { ...existing.pickup, address: '另一演示地点' } },
      { startDate: '2026-09-30', endDate: '2026-10-31' },
    ]) expect(validateTransportQuoteDraft(draft('supplier', changes), [existing], partners)).toHaveProperty('endDate', expect.stringContaining('待确认'))
    expect(validateTransportQuoteDraft(draft('customer'), createTransportQuoteSeed(), partners)).toHaveProperty('endDate', expect.stringContaining('待确认'))
    expect(validateTransportQuoteDraft(draft('supplier', { startDate: '2026-10-01', endDate: '2026-10-31' }), [existing], partners)).toEqual({})
  })

  it('规范化只保留字段契约、清理空白并建立独立地址', () => {
    const input = draft('supplier', { remark: '  演示  ', pickup: { province: ' 上海市 ', city: '上海市', district: '', address: '', extra: 'ignored' }, injected: 'ignored' })
    const output = normalizeTransportQuoteDraft('supplier', input)
    expect(output.remark).toBe('演示')
    expect(output.pickup.province).toBe('上海市')
    expect(output).not.toHaveProperty('injected')
    expect(output.pickup).not.toHaveProperty('extra')
    output.pickup.city = 'changed'
    expect(input.pickup.city).toBe('上海市')
  })
})

describe('GJ-005 状态与筛选', () => {
  it('只为无歧义日期给确定状态，未来与起止等日保留待确认', () => {
    const row = draft()
    expect(getTransportQuoteStatus(row, '2026-09-08')).toBe('有效')
    expect(getTransportQuoteStatus(row, '2026-10-01')).toBe('失效')
    for (const day of ['2026-08-31', '2026-09-01', '2026-09-30', 'invalid']) expect(getTransportQuoteStatus(row, day)).toBe('口径待确认')
  })

  it('供应商模糊搜索名称，客户精准搜索报价ID，筛选使用各自合作方类型', () => {
    const rows = createTransportQuoteSeed()
    expect(filterTransportQuotes(rows, { kind: 'supplier', keyword: '申捷' }, partners).map(row => row.kind)).toEqual(['supplier'])
    expect(filterTransportQuotes(rows, { kind: 'supplier', keyword: '启航' }, partners)).toEqual([])
    expect(filterTransportQuotes(rows, { kind: 'customer', keyword: rows[1].id }, partners)).toHaveLength(1)
    expect(filterTransportQuotes(rows, { kind: 'customer', keyword: rows[1].id.slice(0, 5) }, partners)).toEqual([])
    expect(filterTransportQuotes(rows, { kind: 'customer', keyword: '启航' }, partners)).toEqual([])
  })

  it('所有已列筛选维度可组合，查询和排序不改变输入', () => {
    const rows = createTransportQuoteSeed(), snapshot = JSON.stringify(rows)
    const filters = { kind: 'supplier', partnerId: 'PT-00031', vehicleType: '3T', pickup: ['上海市', '上海市'], delivery: ['江苏省', '苏州市'], status: '有效', regulated: '否', tailLift: '否', transportType: '单程', currency: 'CNY', chargeMode: 'fixed' }
    expect(filterTransportQuotes(rows, filters, partners)).toHaveLength(1)
    for (const key of ['partnerId', 'vehicleType', 'status', 'regulated', 'tailLift', 'transportType', 'specialVehicle', 'currency', 'chargeMode']) expect(filterTransportQuotes(rows, { ...filters, [key]: 'missing' }, partners)).toEqual([])
    expect(filterTransportQuotes(rows, { pickup: ['江苏省'] }, partners)).toEqual([])
    expect(JSON.stringify(rows)).toBe(snapshot)
  })

  it('同合作方有效报价在失效报价前，合作方按中文排序', () => {
    const rows = createTransportQuoteSeed()
    rows.unshift({ ...copy(rows[0]), id: 'old', startDate: '2026-08-01', endDate: '2026-08-31' })
    const supplier = filterTransportQuotes(rows, { kind: 'supplier' }, partners)
    expect(supplier.map(row => getTransportQuoteStatus(row))).toEqual(['有效', '失效'])
  })
})
