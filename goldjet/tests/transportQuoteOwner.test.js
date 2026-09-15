import { beforeEach, describe, expect, it } from 'vitest'
import { createTransportQuoteActions, validateTransportQuoteBatch } from '../src/data/transportQuoteActions.js'
import { createTransportQuoteDraft, createTransportQuoteSeed } from '../src/domain/transportQuotes.js'

const copy = value => JSON.parse(JSON.stringify(value))
let state, session, actions
const draft = (kind = 'supplier', changes = {}) => {
  const row = createTransportQuoteSeed().find(value => value.kind === kind)
  delete row.id
  return { ...row, startDate: '2026-10-01', endDate: '2026-10-31', ...changes }
}

beforeEach(() => {
  state = {
    transportQuotes: createTransportQuoteSeed(), transportQuoteSequence: 2,
    partners: [{ id: 'PT-00031', type: '供应商', status: '已生效' }, { id: 'PT-00018', type: '客户', status: '已生效' }],
  }
  session = { role: 'hangsheng', name: '演示客服' }
  actions = createTransportQuoteActions(state, () => session)
})

describe('GJ-005 手工报价owner', () => {
  it('供应商与客户新增、编辑、删除闭环，操作者和ID来自owner', () => {
    for (const kind of ['supplier', 'customer']) {
      const [created] = actions.saveTransportQuotes(kind, [draft(kind, { updatedBy: 'FORGED', updatedAt: 'FORGED' })])
      expect(created.id.length).toBeLessThanOrEqual(20)
      expect(created.updatedBy).toBe('演示客服')
      expect(created.updatedAt).toBe('2026-09-08 14:30')
      const [edited] = actions.saveTransportQuotes(kind, [{ ...copy(created), transportFee: 1500 }])
      expect(edited).toBe(created)
      expect(edited.transportFee).toBe(1500)
      expect(actions.deleteTransportQuotes(kind, [created.id])).toBe(1)
    }
    expect(state.transportQuotes).toHaveLength(2)
    expect(state.transportQuoteSequence).toBe(4)
  })

  it('创建多行后一次写入、规范化且不共享输入引用', () => {
    const rows = [draft(), draft('supplier', { vehicleType: '5T', remark: '  合成  ' })]
    const saved = actions.saveTransportQuotes('supplier', rows)
    expect(saved).toHaveLength(2)
    expect(saved[0].id).not.toBe(saved[1].id)
    expect(saved[1].remark).toBe('合成')
    rows[0].pickup.city = 'changed'
    expect(saved[0].pickup.city).toBe('上海市')
  })

  it('角色限制保护保存及删除；客服、主管、管理员授权一致', () => {
    for (const role of ['viewer', 'service', 'finance', 'unknown']) {
      session.role = role
      const before = JSON.stringify(state)
      expect(() => actions.saveTransportQuotes('supplier', [draft()])).toThrow('仅航晟')
      expect(() => actions.deleteTransportQuotes('supplier', [state.transportQuotes[0].id])).toThrow('仅航晟')
      expect(JSON.stringify(state)).toBe(before)
    }
    for (const [index, role] of ['hangsheng', 'supervisor', 'admin'].entries()) {
      session.role = role
      expect(actions.saveTransportQuotes('supplier', [draft('supplier', { vehicleType: ['3T', '5T', '8T'][index] })])).toHaveLength(1)
    }
  })

  it('保留的空行必须校验，不静默过滤；所有错误行可定位', () => {
    const rows = [draft(), createTransportQuoteDraft('supplier'), { ...draft(), taxRate: 101, vehicleType: '8T' }]
    const errors = validateTransportQuoteBatch('supplier', rows, state)
    expect(errors.map(row => row.index)).toEqual([1, 2])
    expect(errors[0].fields).toHaveProperty('partnerId')
    expect(errors[1].fields).toHaveProperty('taxRate')
    const before = JSON.stringify(state)
    try {
      actions.saveTransportQuotes('supplier', rows)
      expect.unreachable('应拒绝所有行')
    } catch (error) {
      expect(error.rowErrors).toEqual(errors)
      expect(error.rowIndex).toBe(1)
    }
    expect(JSON.stringify(state)).toBe(before)
  })

  it('批内重复双方定位，客户边界说明待确认，失败不消耗编号', () => {
    for (const kind of ['supplier', 'customer']) {
      const before = JSON.stringify(state)
      const rows = [draft(kind), draft(kind)]
      const errors = validateTransportQuoteBatch(kind, rows, state)
      expect(errors.map(row => row.index)).toEqual([0, 1])
      expect(errors.every(row => row.fields.endDate)).toBe(true)
      if (kind === 'customer') expect(errors[0].fields.endDate).toContain('待确认')
      expect(() => actions.saveTransportQuotes(kind, rows)).toThrow()
      expect(JSON.stringify(state)).toBe(before)
    }
  })

  it('编辑只读字段、假ID及跨类别ID不能绕过owner', () => {
    const existing = state.transportQuotes[0]
    for (const changes of [
      { partnerId: 'PT-00018' }, { taxRate: 9 }, { currency: 'USD' }, { specialVehicle: '冷藏车' },
      { id: 'FORGED' }, { id: state.transportQuotes[1].id }, { kind: 'customer' },
    ]) {
      const before = JSON.stringify(state)
      expect(() => actions.saveTransportQuotes('supplier', [{ ...copy(existing), ...changes }])).toThrow()
      expect(JSON.stringify(state)).toBe(before)
    }
  })

  it('批量编辑使用最终集合查重，不把原有自身记录误作重复', () => {
    const [second] = actions.saveTransportQuotes('supplier', [draft('supplier', { vehicleType: '5T', startDate: '2026-09-01', endDate: '2026-09-30' })])
    const first = state.transportQuotes[0]
    const rows = [{ ...copy(first), vehicleType: '5T' }, { ...copy(second), vehicleType: '3T' }]
    expect(validateTransportQuoteBatch('supplier', rows, state)).toEqual([])
    expect(actions.saveTransportQuotes('supplier', rows).map(row => row.vehicleType)).toEqual(['5T', '3T'])
  })

  it('批量删除必须全部存在且同类，不部分删除、不允许重复ID', () => {
    const id = state.transportQuotes[0].id, before = JSON.stringify(state)
    for (const ids of [[], [id, id], [id, 'missing'], [id, state.transportQuotes[1].id]]) {
      expect(() => actions.deleteTransportQuotes('supplier', ids)).toThrow()
      expect(JSON.stringify(state)).toBe(before)
    }
  })

  it('未知类别、空批次、无效行、重复编辑ID不写入', () => {
    const before = JSON.stringify(state)
    expect(() => actions.saveTransportQuotes('unknown', [draft()])).toThrow('未知')
    for (const rows of [[], [null], [state.transportQuotes[0], state.transportQuotes[0]]]) expect(() => actions.saveTransportQuotes('supplier', rows)).toThrow()
    expect(JSON.stringify(state)).toBe(before)
  })
})
