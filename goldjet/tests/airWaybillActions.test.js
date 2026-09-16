import { beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { createAirWaybillActions } from '../src/data/airWaybillActions.js'
import { createAirWaybillDraft } from '../src/domain/airWaybills.js'
import { createAirMasterSeed } from '../src/domain/airMasterData.js'

let state, session, now, owner
const selection = [{ orderId: 'AIR-1', childId: '' }, { orderId: 'AIR-1', childId: 'CHILD-1' }]
const copy = value => JSON.parse(JSON.stringify(value))
const draftFor = child => createAirWaybillDraft(state.airOrders[0], child ? state.airChildren[0] : null, state.airMaster)
beforeEach(() => {
  state = reactive({ airMaster: createAirMasterSeed(), airWaybillContacts: [], airWaybillContactSequence: 0,
    airOrders: [{ id: 'AIR-1', orderNo: 'GJ-AIR-1', waybillNo: '784-12345678', origin: 'PVG', destination: 'LAX', orderStatus: '待出提单',
      booking: { airline: '东方航空', flight: 'MU9001' }, supplement: { shipper: 'MAIN', consignee: 'CONSIGNEE' },
      pieces: 20, grossWeight: 100, volume: 1, warehouse: { pieces: 21, grossWeight: 101, volume: 1.1 }, waybill: { pieces: 22, grossWeight: 102, volume: 1.2 },
    }],
    airChildren: [{ id: 'CHILD-1', parentId: 'AIR-1', housebillNo: 'HOUSE-DEMO', destination: 'LAX', orderStatus: '子订单完成', shipper: 'HOUSE',
      pieces: 20, grossWeight: 100, volume: 1, waybill: { pieces: 22, grossWeight: 102, volume: 1.2 },
    }],
  })
  session = { role: 'service', name: '周倩' }
  now = Date.UTC(2026, 8, 8, 14, 30)
  owner = createAirWaybillActions(state, () => session, () => now, { receiver: async () => ({ ok: true }) })
})

describe('第011篇提单编辑owner', () => {
  it('暂存独立提单数据，预计/入仓/订舱不被覆盖；主单提交只前进主订单', () => {
    const original = copy(state.airOrders[0])
    owner.saveAirWaybill('AIR-1', '', { ...draftFor(), pieces: 25, grossWeight: 110, volume: 1.5, rate: 2 })
    expect(state.airOrders[0]).toMatchObject({ orderStatus: '待出提单', pieces: original.pieces, grossWeight: original.grossWeight, volume: original.volume,
      warehouse: original.warehouse, booking: original.booking, waybill: { pieces: 25, grossWeight: 110, volume: 1.5, chargeWeight: 250 } })
    owner.saveAirWaybill('AIR-1', '', draftFor(), { submit: true })
    expect(state.airOrders[0].orderStatus).toBe('已出提单')
    expect(state.airChildren[0].orderStatus).toBe('子订单完成')
  })
  it('分单提交推进所属主订单，保留子订单业务状态且回写分单独立提单货量', () => {
    owner.saveAirWaybill('AIR-1', 'CHILD-1', { ...draftFor(true), grossWeight: 105 }, { submit: true })
    expect(state.airOrders[0]).toMatchObject({ orderStatus: '已出提单', waybill: { grossWeight: 102 } })
    expect(state.airChildren[0]).toMatchObject({ orderStatus: '子订单完成', grossWeight: 100, waybill: { grossWeight: 105 } })
  })
  it('越权、跨主单和错误输入均在写入前拒绝；readonly元数据不按payload覆盖', () => {
    const before = copy(state)
    expect(() => owner.saveAirWaybill('AIR-1', 'OTHER', draftFor())).toThrow('不属于')
    expect(() => owner.saveAirWaybill('AIR-1', '', { ...draftFor(), origin: '', grossWeight: -1 })).toThrow()
    expect(copy(state)).toEqual(before)
    session.role = 'supervisor'
    expect(() => owner.saveAirWaybill('AIR-1', '', draftFor())).toThrow('仅空运客服或打单员')
    session.role = 'waybillClerk'
    owner.saveAirWaybill('AIR-1', '', { ...draftFor(), waybillNo: 'FAKE', airlineName: 'FAKE' })
    expect(state.airOrders[0].waybillDocument).toMatchObject({ waybillNo: '784-12345678', airlineName: '东方航空' })
  })
  it('日期清空归一为空；主单判级及分单唛头不接受readonly字段覆盖', () => {
    owner.saveAirWaybill('AIR-1', '', { ...draftFor(), issueDate: null, weightCode: 'FAKE' })
    expect(state.airOrders[0].waybillDocument).toMatchObject({ issueDate: '', weightCode: '' })
    state.airChildren[0].marks = 'SOURCE MARKS'
    owner.saveAirWaybill('AIR-1', 'CHILD-1', { ...draftFor(true), marks: 'FORGED MARKS' })
    expect(createAirWaybillDraft(state.airOrders[0], state.airChildren[0], state.airMaster).marks).toBe('SOURCE MARKS')
  })
  it('常用联系人别称唯一，可删除，不改变已存提单；备注遵守256字限制', () => {
    const contact = owner.saveAirWaybillContact({ alias: ' Demo ', printText: 'SYNTHETIC SHIPPER', postcode: '000000' })
    expect(contact.alias).toBe('Demo')
    expect(() => owner.saveAirWaybillContact({ alias: 'Demo' })).toThrow('已存在')
    owner.saveAirWaybill('AIR-1', '', { ...draftFor(), shipper: contact })
    owner.deleteAirWaybillContact(contact.id)
    expect(state.airWaybillContacts).toHaveLength(0)
    expect(state.airOrders[0].waybillDocument.shipper.printText).toBe('SYNTHETIC SHIPPER')
    expect(() => owner.saveAirWaybillNote('AIR-1', '备'.repeat(257))).toThrow('256')
    owner.saveAirWaybillNote('AIR-1', '仅本地备注')
    expect(state.airOrders[0].waybillNote).toBe('仅本地备注')
  })
})

describe('第011篇翌飞本地模拟owner', () => {
  it('顺序始终主单后分单，并使用共享DescriptionCode与响应式状态', async () => {
    const calls = []
    let resume
    owner = createAirWaybillActions(state, () => session, () => now, { receiver: (payload, context) => {
      calls.push({ payload, context })
      return calls.length === 1 ? new Promise(resolve => { resume = resolve }) : Promise.resolve({ ok: true })
    } })
    const sending = owner.sendAirWaybills([...selection].reverse(), { 'AIR-1': 'EAW' })
    expect(state.airOrders[0].waybillTransmission.status).toBe('发送中')
    expect(state.airChildren[0].waybillTransmission).toBeUndefined()
    await expect(owner.sendAirWaybills(selection)).rejects.toThrow('正在发送')
    resume({ ok: true })
    await sending
    expect(calls.map(call => call.context.kind)).toEqual(['master', 'child'])
    expect(calls[0].payload).toMatchObject({ descriptionCode: 'EAW', origin: 'PVG', destination: 'LAX', pieces: 22, grossWeight: 102 })
    expect(state.airOrders[0].waybillTransmission.status).toBe('成功')
    expect(state.airChildren[0].waybillTransmission.status).toBe('成功')
  })
  it('主单失败保留模拟异常消息，分单不发送，异常重试待确认', async () => {
    const calls = []
    owner = createAirWaybillActions(state, () => session, () => now, { receiver: async (_, context) => { calls.push(context.kind); return { ok: false, error: '合成接收端：资料缺失' } } })
    const result = await owner.sendAirWaybills(selection)
    expect(calls).toEqual(['master'])
    expect(state.airOrders[0].waybillTransmission).toMatchObject({ status: '异常中', error: '合成接收端：资料缺失' })
    expect(state.airChildren[0].waybillTransmission).toBeUndefined()
    expect(result[1]).toMatchObject({ skipped: true })
    await expect(owner.sendAirWaybills(selection)).rejects.toThrow('重发规则待确认')
  })
  it('未成功主单不能单发分单，2分钟整票防重失败不污染既有状态', async () => {
    await expect(owner.sendAirWaybills([selection[1]])).rejects.toThrow('先成功发送主运单')
    await owner.sendAirWaybills(selection)
    const before = copy(state)
    await expect(owner.sendAirWaybills(selection)).rejects.toThrow('2 分钟内')
    expect(copy(state)).toEqual(before)
    now += 121000
    await owner.sendAirWaybills(selection)
    expect(state.airOrders[0].waybillTransmission.succeededAtMs).toBe(now)
  })
  it('角色改变时忽略回执并恢复本地发送前状态，不把发送中永久遗留', async () => {
    let resume
    owner = createAirWaybillActions(state, () => session, () => now, { receiver: () => new Promise(resolve => { resume = resolve }) })
    const result = owner.sendAirWaybills([selection[0]])
    session = { role: 'waybillClerk', name: '打单员' }
    resume({ ok: true })
    await expect(result).rejects.toThrow('忽略过期回执')
    expect(state.airOrders[0].waybillTransmission).toBeUndefined()
  })
  it('重置后不写入新的订单集合', async () => {
    let resume
    owner = createAirWaybillActions(state, () => session, () => now, { receiver: () => new Promise(resolve => { resume = resolve }) })
    const restored = copy(state.airOrders), result = owner.sendAirWaybills([selection[0]])
    state.airOrders = restored
    resume({ ok: true })
    await expect(result).rejects.toThrow('忽略过期回执')
    expect(state.airOrders[0].waybillTransmission).toBeUndefined()
  })
})
