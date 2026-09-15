import { beforeEach, describe, expect, it } from 'vitest'
import { createWarehouseQuoteActions } from '../src/data/warehouseQuoteActions.js'
import { createWarehouseQuoteDraft, createWarehouseQuoteSeed, deriveWarehouseQuoteStatus } from '../src/domain/warehouseQuotes.js'

const copy = value => JSON.parse(JSON.stringify(value))
let state, session, actions
const draft = (changes = {}) => {
  const row = createWarehouseQuoteSeed()[0]
  delete row.id
  return { ...row, startDate: '2026-10-01', endDate: '2026-10-31', ...changes }
}

beforeEach(() => {
  state = {
    warehouseQuotes: createWarehouseQuoteSeed(), warehouseQuoteSequence: 4,
    partners: [{ id: 'PT-00018', type: '客户', status: '有效' }, { id: 'PT-00019', type: '客户', status: '有效' }],
  }
  session = { role: 'hangsheng', name: '演示客服' }
  actions = createWarehouseQuoteActions(state, () => session)
})

describe('GJ-006 仓库报价owner', () => {
  it('单条新增、编辑及删除闭环，ID与操作者由owner产生', () => {
    const created = actions.saveWarehouseQuote(draft({ updatedBy: 'FORGED', updatedAt: 'FORGED', injected: true }))
    expect(created.id).toBe('WQ-00000005')
    expect(created.id.length).toBeLessThanOrEqual(20)
    expect(created.updatedBy).toBe('演示客服')
    expect(created.updatedAt).toBe('2026-09-08 14:30')
    expect(created).not.toHaveProperty('injected')
    const edited = actions.saveWarehouseQuote({ ...copy(created), amount: '2.00', remark: '  调整  ' })
    expect(edited).toBe(created)
    expect(edited.amount).toBe('2.00')
    expect(edited.remark).toBe('调整')
    expect(actions.deleteWarehouseQuote(created.id)).toBe(1)
    expect(state.warehouseQuotes).toHaveLength(4)
    expect(state.warehouseQuoteSequence).toBe(5)
  })

  it('航晟客服及主管可维护，其他角色不能绕过保存、删除和状态操作', () => {
    for (const role of ['viewer', 'service', 'finance', 'admin', 'unknown']) {
      session.role = role
      const before = JSON.stringify(state)
      expect(() => actions.saveWarehouseQuote(draft())).toThrow('仅航晟')
      expect(() => actions.deleteWarehouseQuote(state.warehouseQuotes[0].id)).toThrow('仅航晟')
      expect(() => actions.setWarehouseQuoteActive(state.warehouseQuotes[0].id, false)).toThrow('仅航晟')
      expect(JSON.stringify(state)).toBe(before)
    }
    session.role = 'supervisor'
    expect(actions.saveWarehouseQuote(draft()).id).toBe('WQ-00000005')
    expect(actions.setWarehouseQuoteActive('WQ-00000001', false).manualDisabled).toBe(true)
    expect(actions.deleteWarehouseQuote('WQ-00000005')).toBe(1)
  })

  it('所有字段完整验证，失败不消耗ID不部分写入，并暴露字段错误', () => {
    const before = JSON.stringify(state)
    try {
      actions.saveWarehouseQuote(createWarehouseQuoteDraft())
      expect.unreachable('应拒绝空表单')
    } catch (error) {
      expect(error.fields).toHaveProperty('partnerId')
      expect(error.fields).toHaveProperty('endDate')
      expect(Object.keys(error.fields).length).toBe(8)
    }
    expect(JSON.stringify(state)).toBe(before)
    for (const payload of [null, [], 1, 'invalid']) expect(() => actions.saveWarehouseQuote(payload)).toThrow('报价格式')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('编辑客户信息被owner拒绝，未找到ID不能隐式新增', () => {
    const existing = state.warehouseQuotes[0]
    for (const changes of [{ partnerId: 'PT-00019' }, { taxRate: 9 }, { currency: 'USD' }, { id: 'FORGED' }]) {
      const before = JSON.stringify(state)
      expect(() => actions.saveWarehouseQuote({ ...copy(existing), ...changes })).toThrow()
      expect(JSON.stringify(state)).toBe(before)
    }
    expect(actions.saveWarehouseQuote({ ...copy(existing), taxRate: '6.00', amount: '1.20' }).amount).toBe('1.20')
  })

  it('人工失效及启用往返保持报价、日期及ID不变，不能重复状态操作', () => {
    const quote = state.warehouseQuotes[0]
    const fields = { id: quote.id, amount: quote.amount, startDate: quote.startDate, endDate: quote.endDate }
    expect(actions.setWarehouseQuoteActive(quote.id, false)).toBe(quote)
    expect(deriveWarehouseQuoteStatus(quote)).toBe('失效')
    expect(quote).toMatchObject(fields)
    expect(() => actions.setWarehouseQuoteActive(quote.id, false)).toThrow('无需重复')
    expect(actions.setWarehouseQuoteActive(quote.id, true)).toBe(quote)
    expect(deriveWarehouseQuoteStatus(quote)).toBe('生效')
    expect(quote).toMatchObject(fields)
    expect(() => actions.setWarehouseQuoteActive(quote.id, true)).toThrow('无需重复')
  })

  it('未来、逾期和截止当天不得提前或重新启用，失败无状态写入', () => {
    for (const id of ['WQ-00000002', 'WQ-00000003']) {
      const before = JSON.stringify(state)
      for (const active of [true, false]) expect(() => actions.setWarehouseQuoteActive(id, active)).toThrow()
      expect(JSON.stringify(state)).toBe(before)
    }
    state.warehouseQuotes[0].endDate = '2026-09-08'
    const before = JSON.stringify(state)
    expect(() => actions.setWarehouseQuoteActive('WQ-00000001', false)).toThrow('待确认')
    expect(() => actions.setWarehouseQuoteActive('missing', true)).toThrow('不存在')
    expect(() => actions.setWarehouseQuoteActive('WQ-00000001', 'false')).toThrow('请选择')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('保存不能注入或移除人工失效标记，编辑后仍需明确启用', () => {
    const created = actions.saveWarehouseQuote(draft({ manualDisabled: true }))
    expect(created.manualDisabled).toBe(false)
    const stopped = state.warehouseQuotes[3]
    const edited = actions.saveWarehouseQuote({ ...copy(stopped), manualDisabled: false, amount: 25 })
    expect(edited.manualDisabled).toBe(true)
    expect(deriveWarehouseQuoteStatus(edited)).toBe('失效')
    expect(actions.setWarehouseQuoteActive(edited.id, true).manualDisabled).toBe(false)
  })

  it('已停用报价仍参与重叠校验，同日相接待确认，删除后可新建', () => {
    const original = state.warehouseQuotes[0]
    actions.setWarehouseQuoteActive(original.id, false)
    const before = JSON.stringify(state)
    expect(() => actions.saveWarehouseQuote(draft({ startDate: '2026-09-10', endDate: '2026-09-20' }))).toThrow('人工停用报价，去重范围待确认')
    expect(() => actions.saveWarehouseQuote(draft({ startDate: '2026-09-30', endDate: '2026-10-31' }))).toThrow('待确认')
    expect(JSON.stringify(state)).toBe(before)
    actions.deleteWarehouseQuote(original.id)
    expect(actions.saveWarehouseQuote(draft({ startDate: '2026-09-10', endDate: '2026-09-20' })).id).toBe('WQ-00000005')
  })

  it('保存白名单断开输入引用，并避让既有ID，缺失删除不改数据', () => {
    state.warehouseQuoteSequence = 0
    const input = draft(), created = actions.saveWarehouseQuote(input)
    expect(created.id).toBe('WQ-00000005')
    input.amount = 999
    expect(created.amount).toBe(0.35)
    const before = JSON.stringify(state)
    expect(() => actions.deleteWarehouseQuote('missing')).toThrow('不存在')
    expect(JSON.stringify(state)).toBe(before)
  })
})
