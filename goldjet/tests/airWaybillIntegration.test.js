import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { createAirDraft, createBookingDraft } from '../src/domain/airOperations.js'
import { createAirSupplementDraft, createHouseBillDraft } from '../src/domain/airOrderSupplement.js'
import { createAirWaybillDraft, getAirWaybillRows } from '../src/domain/airWaybills.js'
import { getPalletOrderCargo } from '../src/domain/airPallets.js'

const data = usePrototypeData(), copy = value => JSON.parse(JSON.stringify(value))
beforeEach(() => data.reset())

function prepare({ houses = false } = {}) {
  const order = data.createAirOrder({ ...createAirDraft(), customer: '启航跨境贸易', owner: '周倩', origin: 'PVG', destination: 'LAX', product: 'MU-GENERAL', pieces: 30, grossWeight: 300, volume: 3, sellRate: 28 })
  data.selectWorkbenchPersona('operator')
  data.saveAirBooking(order.id, createBookingDraft(data.state.airOrders.find(row => row.id === 'AIR-260908-001')))
  data.selectWorkbenchPersona('handler')
  data.saveAirBooking(order.id, createBookingDraft(order))
  data.selectWorkbenchPersona('service')
  const children = houses ? [1, 2].map(multiplier => data.saveAirHouseBill(order.id, '', {
    ...createHouseBillDraft(order), englishGoodsName: `DEMO HOUSE ${multiplier}`, shipper: `DEMO HOUSE SHIPPER ${multiplier}`, consignee: `DEMO HOUSE CONSIGNEE ${multiplier}`,
    pieces: 10 * multiplier, grossWeight: 100 * multiplier, volume: multiplier, destination: 'LAX', services: { pickup: false, warehouse: false, customs: false, clearance: false },
  })) : []
  data.saveAirSupplement(order.id, { ...createAirSupplementDraft(order, data.state.airMaster), orderType: houses ? '主单' : '直单',
    englishGoodsName: 'DEMO MAIN GOODS', shipper: 'DEMO MAIN SHIPPER', consignee: 'DEMO MAIN CONSIGNEE' })
  return { order, children }
}

describe('GJ-011 订舱→补录→提单→本地发送的中央owner集成', () => {
  it('直单保留预计货量，打单员手填实测暂存并提交后可发送，重置清除新状态', async () => {
    const { order } = prepare(), expected = { pieces: order.pieces, grossWeight: order.grossWeight, volume: order.volume }, booking = copy(order.booking)
    expect(order.orderStatus).toBe('待出提单')
    expect(getAirWaybillRows(data.state).some(row => row.id === order.id)).toBe(true)
    data.selectWorkbenchPersona('waybillClerk')
    const draft = createAirWaybillDraft(order, null, data.state.airMaster)
    expect(draft.pieces).toBeUndefined()
    expect(draft.shipper.printText).toBe('DEMO MAIN SHIPPER')
    data.saveAirWaybill(order.id, '', { ...draft, pieces: 31, grossWeight: 305, volume: 3.1, rate: 20 })
    expect(order).toMatchObject({ ...expected, orderStatus: '待出提单', waybill: { pieces: 31, grossWeight: 305, volume: 3.1, chargeWeight: 517 } })
    expect(order.booking).toEqual(booking)
    data.saveAirWaybill(order.id, '', createAirWaybillDraft(order, null, data.state.airMaster), { submit: true })
    expect(order.orderStatus).toBe('已出提单')
    const sending = data.sendAirWaybills([{ orderId: order.id, childId: '' }])
    expect(order.waybillTransmission.status).toBe('发送中')
    await sending
    expect(order.waybillTransmission).toMatchObject({ status: '成功', descriptionCode: '', succeededAtMs: data.state.airWaybillClockMs })
    data.saveAirWaybillContact({ alias: 'DEMO CONTACT', printText: 'DEMO SHIPPER' })
    data.reset()
    expect(data.state.airOrders.some(row => row.id === order.id)).toBe(false)
    expect(data.state.airWaybillContacts).toEqual([])
    expect(data.state.airWaybillContactSequence).toBe(0)
    expect(data.state.airWaybillClockMs).toBe(Date.UTC(2026, 8, 8, 14, 30))
  })

  it('主分单共用中央状态；分单提交令主单出单，整票按顺序发送并防重', async () => {
    const { order, children } = prepare({ houses: true })
    const services = copy(order.services), childCargo = children.map(child => ({ pieces: child.pieces, grossWeight: child.grossWeight, volume: child.volume }))
    expect(children.every(child => child.orderStatus === '子订单完成')).toBe(true)
    const main = createAirWaybillDraft(order, null, data.state.airMaster)
    data.saveAirWaybill(order.id, '', { ...main, pieces: 30, grossWeight: 303, volume: 3.1 })
    for (const [index, child] of children.entries()) {
      const draft = createAirWaybillDraft(order, child, data.state.airMaster)
      expect(draft.grossWeight).toBeUndefined()
      expect(draft.shipper.printText).toBe(`DEMO HOUSE SHIPPER ${index + 1}`)
      data.saveAirWaybill(order.id, child.id, { ...draft, pieces: 10 * (index + 1), grossWeight: 101 * (index + 1), volume: index === 0 ? 1 : 2.1 })
    }
    data.saveAirWaybill(order.id, children[0].id, createAirWaybillDraft(order, children[0], data.state.airMaster), { submit: true })
    expect(order.orderStatus).toBe('已出提单')
    expect(order.services).toEqual(services)
    expect(children.map(child => ({ pieces: child.pieces, grossWeight: child.grossWeight, volume: child.volume }))).toEqual(childCargo)
    const rows = getAirWaybillRows(data.state)
    expect(rows.find(row => row.id === order.id)).toMatchObject({ childCount: 2, childCargo: { pieces: 30, grossWeight: 303, volume: 3.1 } })
    const selections = [{ orderId: order.id, childId: '' }, ...children.map(child => ({ orderId: order.id, childId: child.id }))]
    await data.sendAirWaybills(selections)
    expect([order, ...children].map(entity => entity.waybillTransmission.status)).toEqual(['成功', '成功', '成功'])
    const sent = [order, ...children].map(entity => copy(entity.waybillTransmission))
    await expect(data.sendAirWaybills(selections)).rejects.toThrow('2 分钟内')
    expect([order, ...children].map(entity => copy(entity.waybillTransmission))).toEqual(sent)
    data.advanceAirWaybillClock()
    await data.sendAirWaybills(selections)
    expect([order, ...children].every(entity => entity.waybillTransmission.succeededAtMs === data.state.airWaybillClockMs)).toBe(true)
  })

  it('已有配板禁止改变主分单提单毛件体，其他资料可暂存；卸下后变更供现有消费者读取', () => {
    const { order, children } = prepare({ houses: true })
    data.selectWorkbenchPersona('operator')
    const [allocation] = data.allocateAirOrders([order.id], 'FLIGHT-MU9001:2026-09-10')
    data.selectWorkbenchPersona('waybillClerk')
    const before = copy(data.state)
    const draft = createAirWaybillDraft(order, null, data.state.airMaster)
    expect(() => data.saveAirWaybill(order.id, '', { ...draft, pieces: 31, grossWeight: 301, volume: 3.1 })).toThrow('已有配板')
    expect(() => data.saveAirWaybill(order.id, children[0].id, { ...createAirWaybillDraft(order, children[0], data.state.airMaster), pieces: 11 })).toThrow('已有配板')
    expect(copy(data.state)).toEqual(before)
    data.saveAirWaybill(order.id, '', { ...draft, englishGoodsName: 'SAFE TEXT EDIT' })
    expect(data.state.palletAllocations).toHaveLength(1)
    data.selectWorkbenchPersona('operator')
    data.unloadAirAllocations([allocation.id])
    data.selectWorkbenchPersona('waybillClerk')
    data.saveAirWaybill(order.id, '', { ...createAirWaybillDraft(order, null, data.state.airMaster), pieces: 31, grossWeight: 301, volume: 3.1 })
    expect(getPalletOrderCargo(order, data.state)).toMatchObject({ cargo: null, reason: '预计、入仓或提单毛件体存在不同的完整取值，配板取值口径待确认' })
  })
})
