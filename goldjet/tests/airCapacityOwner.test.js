import { beforeEach, describe, expect, it } from 'vitest'
import { createCapacityActions } from '../src/data/airCapacityActions.js'
import { createAirMasterSeed } from '../src/domain/airMasterData.js'
import { CAPACITY_NOW, createCapacityDraft, createCapacitySeed } from '../src/domain/airCapacity.js'

let state, session, actions
const copy = value => JSON.parse(JSON.stringify(value))
const draft = (changes = {}) => ({
  ...createCapacityDraft({ name: '李明' }), flightId: 'FLIGHT-MU9001', startDate: '2026-10-01', endDate: '2026-10-31', handler: '王晴',
  details: [{ weekday: 1, palletId: 'PALLET-DEMO-PMC', baseline: '', quantity: 2 }], ...changes,
})

beforeEach(() => {
  state = { airMaster: createAirMasterSeed(), capacityProducts: createCapacitySeed(), capacitySequence: 1, airOrders: [] }
  session = { name: '李明', role: 'operator' }
  actions = createCapacityActions(state, () => session)
})

describe('GJ-008 舱位产品 owner', () => {
  it('新增、编辑和备注由唯一owner原子写入并保持身份', () => {
    const created = actions.saveCapacityProduct(draft())
    expect(created).toMatchObject({ id: 'CAP-00000002', createdAt: CAPACITY_NOW, creator: '李明', remark: '', updateSequence: 2 })
    const edited = actions.saveCapacityProduct({ ...copy(created), handler: '陈琪', details: [{ weekday: 2, palletId: 'PALLET-DEMO-PMC', baseline: 1000, quantity: 3 }] })
    expect(edited).toBe(created)
    expect(edited.handler).toBe('陈琪')
    expect(edited.details[0].quantity).toBe(3)
    expect(actions.saveCapacityNote(created.id, '  预留两板  ')).toBe(created)
    expect(created.remark).toBe('预留两板')
    expect(state.capacitySequence).toBe(4)
    expect(actions).not.toHaveProperty('deleteCapacityProduct')
  })

  it('界面之外仍检查角色，操作和业务人员都不能写', () => {
    for (const role of ['handler', 'business', 'service', 'admin', 'supervisor', 'viewer']) {
      session.role = role
      const before = JSON.stringify(state)
      expect(() => actions.saveCapacityProduct(draft())).toThrow('仅航线运营')
      expect(() => actions.saveCapacityNote(state.capacityProducts[0].id, '备注')).toThrow('仅航线运营')
      expect(JSON.stringify(state)).toBe(before)
    }
  })

  it('全部字段校验前不落入任何写入，失败保留序号和原对象', () => {
    const before = JSON.stringify(state)
    try { actions.saveCapacityProduct(createCapacityDraft()) } catch (error) {
      expect(error.fields).toHaveProperty('flightId')
      expect(error.fields).toHaveProperty('details.0.weekday')
    }
    for (const value of [null, [], 'invalid', true, 1]) expect(() => actions.saveCapacityProduct(value)).toThrow('格式不正确')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('拒绝伪造ID和不存在对象，不把编辑请求降级为新增', () => {
    const before = JSON.stringify(state)
    expect(() => actions.saveCapacityProduct(draft({ id: 'CAP-missing' }))).toThrow('不存在')
    for (const id of ['', 5, null, {}]) expect(() => actions.saveCapacityProduct(draft({ id }))).toThrow('标识不正确')
    expect(() => actions.saveCapacityNote('missing', '备注')).toThrow('不存在')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('白名单拒绝系统字段和派生字段注入，创建时间及备注不会被表单覆盖', () => {
    const created = actions.saveCapacityProduct(draft({ creator: 'FORGED', createdAt: 'FORGED', remark: 'FORGED', airline: 'FORGED', volume: 999, injected: true }))
    expect(created).toMatchObject({ creator: '李明', createdAt: CAPACITY_NOW, remark: '' })
    for (const key of ['airline', 'volume', 'injected']) expect(created).not.toHaveProperty(key)
    actions.saveCapacityNote(created.id, '保留备注')
    actions.saveCapacityProduct({ ...copy(created), createdAt: 'FORGED', creator: 'FORGED', remark: 'FORGED' })
    expect(created).toMatchObject({ creator: '李明', createdAt: CAPACITY_NOW, remark: '保留备注' })
  })

  it('嵌套明细独立复制，修改输入对象不会污染已保存数据', () => {
    const input = draft(), created = actions.saveCapacityProduct(input)
    input.details[0].quantity = 999
    input.details.push({})
    expect(created.details).toEqual([{ weekday: 1, palletId: 'PALLET-DEMO-PMC', baseline: '', quantity: 2 }])
  })

  it('飞行航班和板类型编辑时锁定且原子拒绝', () => {
    const created = actions.saveCapacityProduct(draft()), before = JSON.stringify(state)
    expect(() => actions.saveCapacityProduct({ ...copy(created), flightId: 'FLIGHT-CZ9002' })).toThrow('不可修改航班')
    expect(() => actions.saveCapacityProduct({ ...copy(created), boardType: '合同板' })).toThrow('不可修改板类型')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('转派后原运营失去产品编辑和备注资格，新绑定运营可以继续', () => {
    const created = actions.saveCapacityProduct(draft())
    actions.saveCapacityProduct({ ...copy(created), operator: '赵航' })
    const before = JSON.stringify(state)
    expect(() => actions.saveCapacityProduct(copy(created))).toThrow('权限范围待确认')
    expect(() => actions.saveCapacityNote(created.id, '原运营备注')).toThrow('当前绑定')
    expect(JSON.stringify(state)).toBe(before)
    session.name = '赵航'
    actions.saveCapacityProduct({ ...copy(created), handler: '陈琪' })
    actions.saveCapacityNote(created.id, '新运营备注')
    expect(created).toMatchObject({ handler: '陈琪', remark: '新运营备注', creator: '李明' })
  })

  it('已有关联订舱阻断改容量期限和转派，单独备注仍按明确规则开放', () => {
    const product = state.capacityProducts[0]
    state.airOrders = [{ id: 'AIR-1', flight: 'MU9001', departureDate: '2026-09-10', bookingStatus: '服务已完成', waybillNo: '781-90000010', volume: 1.28 }]
    const before = JSON.stringify(state)
    expect(() => actions.saveCapacityProduct({ ...copy(product), operator: '赵航' })).toThrow('已有业务的影响待确认')
    expect(JSON.stringify(state)).toBe(before)
    actions.saveCapacityNote(product.id, '旺季容量备注')
    expect(product.remark).toBe('旺季容量备注')
  })

  it('已配板引用即使无订单也守护产品变更', () => {
    const product = state.capacityProducts[0]
    state.palletAllocations = [{ capacityProductId: product.id }]
    expect(() => actions.saveCapacityProduct(copy(product))).toThrow('已有业务的影响待确认')
  })

  it('过期产品正常保留历史且不擅增合同板一年强制校验', () => {
    const created = actions.saveCapacityProduct(draft({ boardType: '合同板', startDate: '2026-08-01', endDate: '2026-08-31' }))
    expect(created.boardType).toBe('合同板')
    expect(created.endDate).toBe('2026-08-31')
  })

  it('过时序号及碰撞不覆盖旧对象，不使用随机值或系统实时时钟', () => {
    state.capacitySequence = 0
    state.capacityProducts[0].updateSequence = 0
    const created = actions.saveCapacityProduct(draft())
    expect(created.id).toBe('CAP-00000002')
    expect(state.capacityProducts[0].id).toBe('CAP-00000001')
    expect(created.createdAt).toBe(CAPACITY_NOW)
  })

  it('序号超过安全范围或备注格式非法时保持原状态', () => {
    state.capacitySequence = Number.MAX_SAFE_INTEGER
    const before = JSON.stringify(state)
    expect(() => actions.saveCapacityProduct(draft())).toThrow('序号已用尽')
    expect(() => actions.saveCapacityNote(state.capacityProducts[0].id, '新备注')).toThrow('序号已用尽')
    expect(() => actions.saveCapacityNote(state.capacityProducts[0].id, {})).toThrow('须为文本')
    expect(JSON.stringify(state)).toBe(before)
  })
})
