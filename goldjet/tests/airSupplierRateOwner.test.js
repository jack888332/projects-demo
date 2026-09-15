import { beforeEach, describe, expect, it } from 'vitest'
import { createAirSupplierRateActions } from '../src/data/airSupplierRateActions.js'
import {
  AIR_RATE_NOW, createAirSupplierRateDraft, createAirSupplierRateSeed, createFinanceCostItemSeed,
  deriveAirSupplierRateStatus, filterAirSupplierRates,
} from '../src/domain/airSupplierRates.js'

const copy = value => JSON.parse(JSON.stringify(value))
let state, session, actions
const draft = (changes = {}) => ({
  ...createAirSupplierRateDraft(), partnerId: 'PT-00028', serviceType: '订舱', feeItemId: 'FC-0001',
  billingUnit: '提单计费重(kg)', chargeMethod: '常规方式', unitPrice: '18.50', currency: 'CNY',
  startDate: '2026-09-01', endDate: '2026-09-30', ...changes,
})

beforeEach(() => {
  state = {
    airSupplierRates: createAirSupplierRateSeed(), airSupplierRateSequence: 6, financeCostItems: createFinanceCostItemSeed(),
    partners: [{ id: 'PT-00027', type: '供应商', status: '有效' }, { id: 'PT-00028', type: '供应商', status: '有效' }, { id: 'PT-00018', type: '客户', status: '有效' }],
  }
  session = { role: 'supervisor', name: '演示客服主管' }
  actions = createAirSupplierRateActions(state, () => session)
})

describe('GJ-007 空运供应商价格owner', () => {
  it('常规新增保存、编辑与启停闭环，创建时按用户确认默认已生效', () => {
    const created = actions.saveAirSupplierRate(draft())
    expect(created.id).toBe('ASR-00000007')
    expect(created.status).toBe('已生效')
    expect(created.creator).toBe(session.name)
    expect(created.updatedAt).toBe(AIR_RATE_NOW)
    const edited = actions.saveAirSupplierRate({ ...copy(created), unitPrice: '20.00', contractNo: ' CT-007 ' })
    expect(edited).toBe(created)
    expect(edited).toMatchObject({ unitPrice: '20.00', contractNo: 'CT-007', status: '已生效', updateSequence: 8 })
    expect(actions.setAirSupplierRateActive(created.id, false)).toBe(created)
    expect(created.status).toBe('失效')
    expect(actions.setAirSupplierRateActive(created.id, true)).toBe(created)
    expect(created.status).toBe('已生效')
    expect(state.airSupplierRateSequence).toBe(10)
    expect(actions).not.toHaveProperty('deleteAirSupplierRate')
  })

  it('保存及启停均在owner校验客服主管权限，不允许其他角色绕过按钮', () => {
    for (const role of ['viewer', 'service', 'hangsheng', 'finance', 'admin', 'unknown']) {
      session.role = role
      const before = JSON.stringify(state)
      expect(() => actions.saveAirSupplierRate(draft())).toThrow('仅客服主管')
      expect(() => actions.setAirSupplierRateActive('ASR-00000001', false)).toThrow('仅客服主管')
      expect(JSON.stringify(state)).toBe(before)
    }
  })

  it('失败暴露逐字段错误，既不消耗序号也不部分写入', () => {
    const before = JSON.stringify(state)
    try {
      actions.saveAirSupplierRate(createAirSupplierRateDraft())
      expect.unreachable('应拒绝空报价')
    } catch (error) {
      expect(error.fields).toHaveProperty('partnerId')
      expect(error.fields).toHaveProperty('endDate')
      expect(Object.keys(error.fields)).toHaveLength(8)
    }
    for (const value of [null, [], 'invalid', true, 1]) expect(() => actions.saveAirSupplierRate(value)).toThrow('格式不正确')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('系统状态、创建人和更新时间不可伪造，编辑保留创建人和失效标记', () => {
    const created = actions.saveAirSupplierRate(draft({ status: '失效', creator: 'FORGED', updatedAt: 'FORGED', updateSequence: 999, injected: true }))
    expect(created).toMatchObject({ status: '已生效', creator: '演示客服主管', updatedAt: AIR_RATE_NOW, updateSequence: 7 })
    expect(created).not.toHaveProperty('injected')
    actions.setAirSupplierRateActive(created.id, false)
    session.name = '另一演示主管'
    const edited = actions.saveAirSupplierRate({ ...copy(created), status: '已生效', creator: 'FORGED', unitPrice: 30 })
    expect(edited).toMatchObject({ status: '失效', creator: '演示客服主管', updatedBy: '另一演示主管' })
  })

  it('本篇全部维护字段可编辑，不继承仓库报价的供应商、税率与币种锁定', () => {
    const row = state.airSupplierRates[0]
    const edited = actions.saveAirSupplierRate({ ...copy(row), partnerId: 'PT-00028', serviceType: '预配发送', feeItemId: 'FC-0005', billingUnit: '分单数(个)', taxRate: 9, currency: 'USD' })
    expect(edited).toMatchObject({ partnerId: 'PT-00028', taxRate: 9, currency: 'USD', serviceType: '预配发送' })
  })

  it('重叠新增被所有状态拒绝，未知ID不能隐式创建', () => {
    for (const status of ['已生效', '失效']) {
      state.airSupplierRates[0].status = status
      const before = JSON.stringify(state)
      expect(() => actions.saveAirSupplierRate(draft({ partnerId: 'PT-00027' }))).toThrow('不允许新增')
      expect(() => actions.saveAirSupplierRate(draft({ id: 'missing' }))).toThrow('不存在')
      expect(JSON.stringify(state)).toBe(before)
    }
  })

  it('启用前重新校验已生效重叠，失败不改变记录；另一失效规则不影响明确启用校验', () => {
    const target = state.airSupplierRates[1]
    const other = { ...copy(target), id: 'ASR-other', status: '已生效' }
    state.airSupplierRates.push(other)
    const before = JSON.stringify(state)
    expect(() => actions.setAirSupplierRateActive(target.id, true)).toThrow('生效且有效期重叠')
    expect(JSON.stringify(state)).toBe(before)
    other.status = '失效'
    expect(actions.setAirSupplierRateActive(target.id, true).status).toBe('已生效')
  })

  it('未来报价保存状态已生效但不提前定义启停语义，超期与截止当天同样阻断', () => {
    const future = actions.saveAirSupplierRate(draft({ startDate: '2026-10-01', endDate: '2026-10-31' }))
    expect(future.status).toBe('已生效')
    for (const id of [future.id, 'ASR-00000003']) {
      const before = JSON.stringify(state)
      for (const active of [true, false]) expect(() => actions.setAirSupplierRateActive(id, active)).toThrow('待确认')
      expect(JSON.stringify(state)).toBe(before)
    }
    state.airSupplierRates[0].endDate = '2026-09-08'
    const before = JSON.stringify(state)
    expect(() => actions.setAirSupplierRateActive('ASR-00000001', false)).toThrow('截止当日')
    expect(() => actions.setAirSupplierRateActive('missing', true)).toThrow('不存在')
    expect(() => actions.setAirSupplierRateActive('ASR-00000001', 'false')).toThrow('请选择')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('过期记录不可编辑保存或借延长期间恢复', () => {
    const expired = state.airSupplierRates[2]
    const before = JSON.stringify(state)
    expect(deriveAirSupplierRateStatus(expired)).toBe('失效')
    expect(() => actions.saveAirSupplierRate({ ...copy(expired), unitPrice: 20 })).toThrow('早于当前日期')
    expect(() => actions.saveAirSupplierRate({ ...copy(expired), endDate: '2026-10-31' })).toThrow('状态口径待确认')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('复杂方式不会通过详情注入保存或启用，但可失效旧的已生效记录', () => {
    for (const row of state.airSupplierRates.slice(3)) {
      const before = JSON.stringify(state)
      expect(() => actions.saveAirSupplierRate({ ...copy(row), details: [{ start: 0, end: 100, unitPrice: 15 }] })).toThrow('待确认')
      expect(() => actions.setAirSupplierRateActive(row.id, true)).toThrow('待确认')
      expect(JSON.stringify(state)).toBe(before)
      row.status = '已生效'
      expect(actions.setAirSupplierRateActive(row.id, false).status).toBe('失效')
    }
  })

  it('同分钟每次成功修改仍可稳定排到首位，不依赖真实时钟或随机值', () => {
    const first = actions.saveAirSupplierRate(draft())
    const second = actions.saveAirSupplierRate(draft({ serviceType: '仓储', feeItemId: 'FC-0004' }))
    expect(filterAirSupplierRates(state.airSupplierRates)[0]).toBe(second)
    actions.saveAirSupplierRate({ ...copy(first), unitPrice: 10 })
    expect(first.updatedAt).toBe(second.updatedAt)
    expect(filterAirSupplierRates(state.airSupplierRates)[0]).toBe(first)
    actions.setAirSupplierRateActive(second.id, false)
    expect(filterAirSupplierRates(state.airSupplierRates)[0]).toBe(second)
  })

  it('独立输入与确定性序号，序号落后仍避让既有ID并保持更新序', () => {
    state.airSupplierRateSequence = 0
    const input = draft(), created = actions.saveAirSupplierRate(input)
    expect(created.id).toBe('ASR-00000007')
    input.unitPrice = 999
    expect(created.unitPrice).toBe('18.50')
    expect(created.updateSequence).toBe(7)
    expect(() => actions.setAirSupplierRateActive(created.id, true)).toThrow('无需重复')
    actions.setAirSupplierRateActive(created.id, false)
    expect(() => actions.setAirSupplierRateActive(created.id, false)).toThrow('无需重复')
  })
})
