import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { createAirDraft, createBookingDraft } from '../src/domain/airOperations.js'
import { createAirSupplementDraft } from '../src/domain/airOrderSupplement.js'
import { deriveWorkbenchTasks, getWorkbenchSummary } from '../src/domain/workbenchTasks.js'
import { deriveCapacityRows } from '../src/domain/airCapacity.js'

const data = usePrototypeData()
const copy = value => JSON.parse(JSON.stringify(value))
const completeDraft = order => ({ ...createAirSupplementDraft(order, data.state.airMaster),
  englishGoodsName: 'SYNTHETIC ELECTRONIC PARTS', shipper: 'DEMO SHIPPER', consignee: 'DEMO CONSIGNEE',
})
beforeEach(() => data.reset())

describe('GJ-009 主订单到补录的共享 owner 集成', () => {
  it('建单、确认航班、完成订舱、补录使用同一订单，完成客服待办', () => {
    const order = data.createAirOrder({ ...createAirDraft(), customer: '启航跨境贸易', owner: '周倩',
      origin: 'PVG', destination: 'LAX', product: 'MU-GENERAL', pieces: 100, grossWeight: 3000, volume: 30,
      sellRate: 28, foamRatio: 0.5, departureDate: '2026-09-10' })
    data.selectWorkbenchPersona('operator')
    data.saveAirBooking(order.id, createBookingDraft(data.state.airOrders.find(row => row.id === 'AIR-260908-001')))
    data.selectWorkbenchPersona('handler')
    data.saveAirBooking(order.id, createBookingDraft(order))
    data.selectWorkbenchPersona('service')
    const tasks = deriveWorkbenchTasks(data.state, 'service')
    expect(tasks.find(task => task.orderId === order.id)).toMatchObject({
      completed: false, blockedReason: '', target: { path: `/fulfillment/air-orders/${order.id}/supplement` },
    })
    const before = getWorkbenchSummary(tasks)
    const initialServices = copy(order.services)
    const booking = copy(order.booking)
    data.saveAirSupplement(order.id, completeDraft(order))
    expect(order.orderStatus).toBe('待出提单')
    expect(order.supplementedAt).toBeTruthy()
    expect(order.supplement.englishGoodsName).toBe('SYNTHETIC ELECTRONIC PARTS')
    expect(order.booking).toEqual(booking)
    for (const service of initialServices) expect(order.services).toContainEqual(service)
    expect(order.services.some(service => service.type === 'preallocation')).toBe(false)
    expect(getWorkbenchSummary(deriveWorkbenchTasks(data.state, 'service'))).toMatchObject({ pending: before.pending - 1, completed: before.completed + 1 })
  })

  it('已配订单补录不改订舱航班及货物，配板关系与实时容量保持', () => {
    data.selectWorkbenchPersona('operator')
    const order = data.state.airOrders[0]
    data.allocateAirOrders([order.id], 'FLIGHT-MU9001:2026-09-10')
    const allocations = copy(data.state.palletAllocations)
    const range = { startDate: '2026-09-10', endDate: '2026-09-10' }
    const capacity = deriveCapacityRows(data.state, range)[0].bookedVolume
    data.selectWorkbenchPersona('service')
    data.saveAirSupplement(order.id, completeDraft(order))
    expect(data.state.palletAllocations).toEqual(allocations)
    expect(deriveCapacityRows(data.state, range)[0].bookedVolume).toBe(capacity)
    expect(order).toMatchObject({ flight: 'MU9001', departureDate: '2026-09-10', pieces: 42, grossWeight: 186.5, volume: 1.28, bookingStatus: '服务已完成' })
  })

  it('失败不更改任务、序号、服务或业务数据，恢复演示清空新状态', () => {
    const order = data.state.airOrders[0]
    const before = JSON.stringify(data.state)
    expect(() => data.saveAirSupplement(order.id, { ...completeDraft(order), englishGoodsName: '' })).toThrow()
    expect(JSON.stringify(data.state)).toBe(before)
    data.saveAirSupplement(order.id, completeDraft(order))
    data.reset()
    expect(data.state.airOrders[0].orderStatus).toBe('待补录')
    expect(data.state.airOrders[0].supplement).toBeUndefined()
    expect(data.state.airChildren).toEqual([])
    expect(data.state.airChildSequence).toBe(0)
    expect(data.state.airOrderEventSequence).toBe(0)
    expect(deriveWorkbenchTasks(data.state, 'service').find(task => task.orderId === order.id).completed).toBe(false)
  })

  it('亏损通过但服务状态未闭合的订单不能借补录跳过订舱', () => {
    const order = data.state.airOrders.find(row => row.approval)
    data.selectWorkbenchPersona('director')
    data.approveAirBooking(order.id)
    data.selectWorkbenchPersona('service')
    expect(deriveWorkbenchTasks(data.state, 'service').find(task => task.orderId === order.id).blockedReason).toBeTruthy()
    const before = JSON.stringify(data.state)
    expect(() => data.saveAirSupplement(order.id, completeDraft(order))).toThrow()
    expect(JSON.stringify(data.state)).toBe(before)
  })
})
