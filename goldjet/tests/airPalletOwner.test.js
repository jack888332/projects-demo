import { beforeEach, describe, expect, it } from 'vitest'
import { createAirMasterSeed } from '../src/domain/airMasterData.js'
import { createCapacitySeed } from '../src/domain/airCapacity.js'
import { getPalletCandidates, getPalletFlightRows } from '../src/domain/airPallets.js'
import { createAirPalletActions } from '../src/data/airPalletActions.js'

const clone = value => JSON.parse(JSON.stringify(value))
const flightKey = 'FLIGHT-MU9001:2026-09-10', range = { startDate: '2026-09-10', endDate: '2026-09-10' }
const order = (changes = {}) => ({ id: 'AIR-1', orderNo: 'GJ-AIR-1', customer: '演示客户', flight: 'MU9001', departureDate: '2026-09-10', bookingStatus: '服务已完成', waybillNo: '781-90000010', grossWeight: 100, pieces: 10, volume: 25, ...changes })
const split = (changes = {}) => ({ grossWeight: 40, pieces: 4, volume: 10, flight: 'MU9001', date: '2026-09-10', confirmedInsufficient: true, ...changes })
let state, session, actions
beforeEach(() => {
  state = { airMaster: createAirMasterSeed(), capacityProducts: createCapacitySeed(), airOrders: [order()], palletAllocations: [], palletSequence: 0 }
  session = { name: '李明', role: 'operator' }
  actions = createAirPalletActions(state, () => session)
})

describe('GJ-008 配板 owner', () => {
  it('配板到可见汇总，再卸下回到待配板，不改主订单实际毛件体', () => {
    const original = JSON.stringify(state.airOrders), created = actions.allocateAirOrders(['AIR-1'], flightKey)[0]
    expect(created).toMatchObject({ id: 'PAL-00000001', orderId: 'AIR-1', operator: '李明', handler: '王晴', cargo: { grossWeight: 100, pieces: 10, volume: 25 } })
    expect(getPalletCandidates(state, session)).toEqual([])
    expect(getPalletFlightRows(state, session, range)[0].allocatedVolume).toBe(25)
    expect(actions.unloadAirAllocations([created.id])).toEqual([created])
    expect(getPalletCandidates(state, session)).toHaveLength(1)
    expect(getPalletFlightRows(state, session, range)[0].allocatedVolume).toBe(0)
    expect(JSON.stringify(state.airOrders)).toBe(original)
  })

  it('批量配板全校验后写入，失败不消耗序号或部分分配', () => {
    state.airOrders.push(order({ id: 'AIR-2', bookingStatus: '服务中' }))
    const before = JSON.stringify(state)
    expect(() => actions.allocateAirOrders(['AIR-1', 'AIR-2'], flightKey)).toThrow('尚未完成')
    expect(JSON.stringify(state)).toBe(before)
    state.airOrders[1].bookingStatus = '服务已完成'
    const created = actions.allocateAirOrders(['AIR-1', 'AIR-2'], flightKey)
    expect(created.map(row => row.id)).toEqual(['PAL-00000001', 'PAL-00000002'])
  })

  it('不合格、重复、跨日和不同来源冲突均由owner拒绝', () => {
    const before = JSON.stringify(state)
    expect(() => actions.allocateAirOrders(['AIR-1', 'AIR-1'], flightKey)).toThrow('重复')
    expect(() => actions.allocateAirOrders(['missing'], flightKey)).toThrow('不存在')
    expect(() => actions.allocateAirOrders(['AIR-1'], 'FLIGHT-MU9001:2026-09-11')).toThrow('跨出港日期')
    expect(JSON.stringify(state)).toBe(before)
    state.airOrders[0].warehouse = { grossWeight: 101, pieces: 10, volume: 25 }
    expect(() => actions.allocateAirOrders(['AIR-1'], flightKey)).toThrow('取值口径待确认')
    expect(state.palletAllocations).toEqual([])
  })

  it('分批独立内部ID、同订单号提单来源、原实际值不变，父子量守恒', () => {
    const original = JSON.stringify(state.airOrders), parent = actions.allocateAirOrders(['AIR-1'], flightKey)[0]
    const child = actions.splitAirAllocation(parent.id, split({ id: 'FORGED', orderId: 'FORGED', operator: 'FORGED', remark: 'FORGED' }))
    expect(child).toMatchObject({ id: 'PAL-00000002', orderId: 'AIR-1', parentAllocationId: parent.id, operator: '李明', remark: '', flightKey, cargo: { grossWeight: 40, pieces: 4, volume: 10 } })
    expect(parent.cargo).toEqual({ grossWeight: 60, pieces: 6, volume: 15 })
    expect(getPalletFlightRows(state, session, range)[0]).toMatchObject({ allocatedVolume: 25, allocatedGrossWeight: 100, allocatedPieces: 10 })
    expect(JSON.stringify(state.airOrders)).toBe(original)
  })

  it('撤回只移除生成的子配板并恢复原分配，之后可以重配', () => {
    const parent = actions.allocateAirOrders(['AIR-1'], flightKey)[0], child = actions.splitAirAllocation(parent.id, split())
    expect(actions.withdrawAirSplit(child.id)).toBe(parent)
    expect(parent.cargo).toEqual({ grossWeight: 100, pieces: 10, volume: 25 })
    expect(state.palletAllocations).toEqual([parent])
    expect(actions.reallocateAirFlight(flightKey)).toEqual([parent])
    expect(state.palletAllocations).toEqual([])
    expect(getPalletCandidates(state, session)).toHaveLength(1)
  })

  it('未确认经验判断、无超量、非法拆量和变更航班都不写入', () => {
    const parent = actions.allocateAirOrders(['AIR-1'], flightKey)[0], before = JSON.stringify(state)
    expect(() => actions.splitAirAllocation(parent.id, split({ confirmedInsufficient: false }))).toThrow('一批运不完')
    expect(() => actions.splitAirAllocation(parent.id, split({ pieces: 10 }))).toThrow('小于原')
    expect(() => actions.splitAirAllocation(parent.id, split({ grossWeight: 0 }))).toThrow('正数')
    expect(() => actions.splitAirAllocation(parent.id, split({ date: '2026-09-11' }))).toThrow('待确认')
    expect(JSON.stringify(state)).toBe(before)
    parent.cargo.volume = 20
    expect(() => actions.splitAirAllocation(parent.id, split())).toThrow('未超过')
  })

  it('有分批时父子均不可再次分批、单独卸下或批量重配', () => {
    const parent = actions.allocateAirOrders(['AIR-1'], flightKey)[0], child = actions.splitAirAllocation(parent.id, split()), before = JSON.stringify(state)
    for (const row of [parent, child]) {
      expect(() => actions.splitAirAllocation(row.id, split())).toThrow('单次分批')
      expect(() => actions.unloadAirAllocations([row.id])).toThrow('先撤回')
    }
    expect(() => actions.reallocateAirFlight(flightKey)).toThrow('先撤回')
    expect(() => actions.withdrawAirSplit(parent.id)).toThrow('分批生成')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('批量卸下全量校验且不能混入不属于本人的记录', () => {
    const first = actions.allocateAirOrders(['AIR-1'], flightKey)[0]
    state.palletAllocations.push({ ...clone(first), id: 'PAL-OTHER', flightKey: 'FLIGHT-NH9003:2026-09-10', flightId: 'FLIGHT-NH9003' })
    const before = JSON.stringify(state)
    expect(() => actions.unloadAirAllocations([first.id, 'PAL-OTHER'])).toThrow('本人绑定航线')
    expect(() => actions.unloadAirAllocations([first.id, first.id])).toThrow('重复')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('业务员和其他非航线部角色无法绕过所有写入口', () => {
    const parent = actions.allocateAirOrders(['AIR-1'], flightKey)[0], child = actions.splitAirAllocation(parent.id, split())
    for (const role of ['business', 'service', 'director', 'admin', 'viewer']) {
      session.role = role
      const before = JSON.stringify(state)
      for (const invoke of [() => actions.allocateAirOrders(['AIR-1'], flightKey), () => actions.unloadAirAllocations([parent.id]), () => actions.splitAirAllocation(parent.id, split()), () => actions.withdrawAirSplit(child.id), () => actions.saveAirAllocationNote(parent.id, '备注'), () => actions.reallocateAirFlight(flightKey)]) expect(invoke).toThrow()
      expect(JSON.stringify(state)).toBe(before)
    }
  })

  it('备注仅本人分配记录，产品转派后原操作者不可继续维护', () => {
    const parent = actions.allocateAirOrders(['AIR-1'], flightKey)[0]
    actions.saveAirAllocationNote(parent.id, '  重点关注  ')
    expect(parent.remark).toBe('重点关注')
    expect(() => actions.saveAirAllocationNote(parent.id, {})).toThrow('须为文本')
    state.capacityProducts[0].operator = '赵航'
    const before = JSON.stringify(state)
    expect(() => actions.saveAirAllocationNote(parent.id, '越权')).toThrow('本人配板记录')
    session.name = '赵航'
    expect(() => actions.saveAirAllocationNote(parent.id, '新运营')).toThrow('本人配板记录')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('航线操作可维护本人航线的配板流程，运营和操作记录来自产品且备注仅运营', () => {
    session = { name: '王晴', role: 'handler' }
    const parent = actions.allocateAirOrders(['AIR-1'], flightKey)[0]
    expect(parent).toMatchObject({ operator: '李明', handler: '王晴' })
    expect(() => actions.saveAirAllocationNote(parent.id, '操作员备注')).toThrow('本人配板记录')
    const child = actions.splitAirAllocation(parent.id, split())
    expect(child).toMatchObject({ operator: '李明', handler: '王晴' })
    actions.withdrawAirSplit(child.id)
    actions.reallocateAirFlight(flightKey)
    expect(state.palletAllocations).toEqual([])
    const next = actions.allocateAirOrders(['AIR-1'], flightKey)[0]
    actions.unloadAirAllocations([next.id])
    session = { name: '陈琪', role: 'handler' }
    expect(() => actions.allocateAirOrders(['AIR-1'], flightKey)).toThrow('本人绑定')
  })

  it('预计完整但仓库只有部分体积数据时配板原子拒绝', () => {
    state.airOrders[0].warehouse = { volume: 26 }
    const before = JSON.stringify(state)
    expect(() => actions.allocateAirOrders(['AIR-1'], flightKey)).toThrow('部分或无效')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('跨产品运营归属不唯一时整批拒绝，不写空运营或消耗序号', () => {
    state.capacityProducts.push({ ...clone(state.capacityProducts[0]), id: 'CAP-2', boardType: '合同板', operator: '赵航' })
    session = { name: '王晴', role: 'handler' }
    const before = JSON.stringify(state)
    expect(() => actions.allocateAirOrders(['AIR-1'], flightKey)).toThrow('运营归属不唯一')
    expect(JSON.stringify(state)).toBe(before)
    state.capacityProducts[1].operator = '李明'
    const row = actions.allocateAirOrders(['AIR-1'], flightKey)[0]
    expect(row).toMatchObject({ operator: '李明', handler: '王晴' })
  })

  it('仓库标量体积或入仓时间证据不齐时配板原子拒绝', () => {
    for (const values of [{ warehouseVolume: 26 }, { warehouseEnteredAt: '2026-09-08 12:00' }]) {
      state.airOrders = [order(values)]
      const before = JSON.stringify(state)
      expect(() => actions.allocateAirOrders(['AIR-1'], flightKey)).toThrow('入仓毛件体不完整')
      expect(JSON.stringify(state)).toBe(before)
    }
  })

  it('十进制拆分和撤回守恒，没有浮点尾数', () => {
    state.airMaster.pallets[0].volume = 0.01
    state.airOrders[0].volume = 0.3
    const parent = actions.allocateAirOrders(['AIR-1'], flightKey)[0], child = actions.splitAirAllocation(parent.id, split({ volume: 0.1 }))
    expect(parent.cargo.volume).toBe(0.2)
    actions.withdrawAirSplit(child.id)
    expect(parent.cargo.volume).toBe(0.3)
  })

  it('安全ID碰撞不覆盖旧记录，序号用尽时整批失败', () => {
    state.palletAllocations = [{ id: 'PAL-00000001', orderId: 'old-order', flightKey }]
    expect(actions.allocateAirOrders(['AIR-1'], flightKey)[0].id).toBe('PAL-00000002')
    state.palletSequence = Number.MAX_SAFE_INTEGER
    state.airOrders.push(order({ id: 'AIR-2' }))
    const before = JSON.stringify(state)
    expect(() => actions.allocateAirOrders(['AIR-2'], flightKey)).toThrow('序号已用尽')
    expect(JSON.stringify(state)).toBe(before)
  })
})
