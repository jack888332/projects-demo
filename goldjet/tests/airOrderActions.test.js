import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { createAirDraft, createAirPriceDraft, createBookingDraft } from '../src/domain/airOperations.js'
import { createAirSupplementDraft } from '../src/domain/airOrderSupplement.js'

const data = usePrototypeData()
const valid = () => ({ ...createAirDraft(), customer: '启航跨境贸易', owner: '周倩', origin: 'PVG', destination: 'LAX', product: 'MU-GENERAL', pieces: 10, grossWeight: 100, volume: 1, sellRate: 28, foamRatio: 0.5 })
beforeEach(() => data.reset())

describe('GJ-009 报价与空运事件消息', () => {
  it('主订单三个报价字段独立保存，保留订舱/货物/配板，通知对应运营和操作', () => {
    const order = data.state.airOrders[0]
    const booking = JSON.stringify(order.booking), services = JSON.stringify(order.services)
    data.saveAirOrderPrices(order.id, { sellRate: 31, truckSellRate: 0, foamRatio: 0, pieces: 500, bookingStatus: '待服务' })
    expect(order).toMatchObject({ sellRate: 31, truckSellRate: 0, foamRatio: 0, pieces: 42, bookingStatus: '服务已完成' })
    expect(JSON.stringify(order.booking)).toBe(booking)
    expect(JSON.stringify(order.services)).toBe(services)
    expect(data.state.messages.map(row => row.recipient)).toEqual(['李明', '王晴'])
    for (const message of data.state.messages) {
      expect(message.content).toContain('31')
      expect(message.content).toContain('分泡')
      expect(message.related.query.order).toBe(order.id)
      expect(message.status).toBe('本地模拟')
    }
  })
  it('补录完成后仍能改报价，空后段与分泡不变成零，重复保存无新通知', () => {
    const order = data.state.airOrders[0]
    data.saveAirSupplement(order.id, { ...createAirSupplementDraft(order, data.state.airMaster), englishGoodsName: 'DEMO PARTS', shipper: 'DEMO SHIPPER', consignee: 'DEMO CONSIGNEE' })
    data.saveAirOrderPrices(order.id, { sellRate: 29, truckSellRate: '', foamRatio: '' })
    expect(order.orderStatus).toBe('待出提单')
    expect(order.truckSellRate).toBeUndefined()
    expect(order.foamRatio).toBeUndefined()
    const before = JSON.stringify(data.state)
    data.saveAirOrderPrices(order.id, createAirPriceDraft(order))
    expect(JSON.stringify(data.state)).toBe(before)
  })
  it.each([{ sellRate: '' }, { sellRate: 101 }, { sellRate: true }, { truckSellRate: -1 }, { foamRatio: 0.15 }, { foamRatio: false }])('无效报价原子拒绝 %j', invalid => {
    const order = data.state.airOrders[0], before = JSON.stringify(data.state)
    expect(() => data.saveAirOrderPrices(order.id, { ...createAirPriceDraft(order), ...invalid })).toThrow()
    expect(JSON.stringify(data.state)).toBe(before)
  })
  it('非本人、航线角色、审批中与合成报价均不越权写入', () => {
    expect(() => data.saveAirOrderPrices(data.state.airOrders[1].id, { sellRate: 30 })).toThrow('本人')
    data.selectWorkbenchPersona('operator')
    expect(() => data.saveAirOrderPrices(data.state.airOrders[0].id, { sellRate: 30 })).toThrow('客服')
    data.selectWorkbenchPersona('service')
    expect(() => data.saveAirOrderPrices(data.state.airOrders[3].id, { sellRate: 30 })).toThrow('当前演示')
    data.state.airOrders[0].orderType = '合成主订单'
    expect(() => data.saveAirOrderPrices(data.state.airOrders[0].id, { sellRate: 30 })).toThrow('子订单')
  })
  it('建单、确认航班、完成订舱按事件只通知各自处理人并提供真实入口', () => {
    const order = data.createAirOrder(valid())
    expect(data.state.messages.at(-1)).toMatchObject({ type: '订单待订舱', recipient: '李明', related: { path: '/fulfillment/booking', query: { order: order.id } } })
    data.selectWorkbenchPersona('operator')
    data.saveAirBooking(order.id, createBookingDraft(data.state.airOrders.find(row => row.id === 'AIR-260908-001')))
    expect(data.state.messages.at(-1)).toMatchObject({ type: '航程待补充', recipient: '王晴' })
    data.selectWorkbenchPersona('handler')
    data.saveAirBooking(order.id, createBookingDraft(order))
    expect(data.state.messages.at(-1)).toMatchObject({ type: '订单待补录', recipient: '周倩', related: { path: `/fulfillment/air-orders/${order.id}/supplement` } })
    expect(data.state.messages).toHaveLength(3)
  })
})
