import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { createAirDraft, createBookingDraft } from '../src/domain/airOperations.js'
import { deriveCapacityRows, getCapacityEditRestriction } from '../src/domain/airCapacity.js'
import { getPalletCandidates, getPalletFlightRows } from '../src/domain/airPallets.js'

const data = usePrototypeData()
const key = 'FLIGHT-MU9001:2026-09-10'
const range = { startDate: '2026-09-10', endDate: '2026-09-10' }
const copy = value => JSON.parse(JSON.stringify(value))
beforeEach(() => data.reset())

describe('GJ-008 订舱、容量与配板的唯一 owner 集成', () => {
  it('创建订单、确认航班、完成订舱后进入配板，实时体积不重复计入', () => {
    const order = data.createAirOrder({ ...createAirDraft(), customer: '启航跨境贸易', owner: '周倩',
      origin: 'PVG', destination: 'LAX', product: 'MU-GENERAL', pieces: 100, grossWeight: 3000, volume: 30,
      sellRate: 28, foamRatio: 0.5, departureDate: '2026-09-10' })
    data.selectWorkbenchPersona('operator')
    expect(getPalletCandidates(data.state, data.capacitySession.value).find(row => row.id === order.id).eligible).toBe(false)
    const booking = { ...createBookingDraft(data.state.airOrders.find(row => row.id === 'AIR-260908-001')), departureDate: '2026-09-10' }
    data.saveAirBooking(order.id, booking)
    expect(order.bookingStatus).toBe('服务中')
    data.selectWorkbenchPersona('handler')
    data.saveAirBooking(order.id, createBookingDraft(order))
    expect(order.bookingStatus).toBe('服务已完成')
    data.selectWorkbenchPersona('operator')
    const before = copy(order), booked = deriveCapacityRows(data.state, range)[0].bookedVolume
    const [allocation] = data.allocateAirOrders([order.id], key)
    expect(allocation.cargo).toEqual({ grossWeight: 3000, pieces: 100, volume: 30 })
    expect(getPalletFlightRows(data.state, data.capacitySession.value, range)[0].allocatedVolume).toBe(30)
    expect(deriveCapacityRows(data.state, range)[0].bookedVolume).toBe(booked)
    const child = data.splitAirAllocation(allocation.id, { grossWeight: 1000, pieces: 20, volume: 8, flight: 'MU9001', date: '2026-09-10', confirmedInsufficient: true })
    expect(data.state.palletAllocations).toHaveLength(2)
    expect(deriveCapacityRows(data.state, range)[0].bookedVolume).toBe(booked)
    expect(copy(order)).toEqual(before)
    data.withdrawAirSplit(child.id)
    expect(allocation.cargo).toEqual({ grossWeight: 3000, pieces: 100, volume: 30 })
    data.reallocateAirFlight(key)
    expect(data.state.palletAllocations).toEqual([])
    expect(getPalletCandidates(data.state, data.capacitySession.value).find(row => row.id === order.id).eligible).toBe(true)
    expect(copy(order)).toEqual(before)
  })

  it.each([
    { departureDate: '2026-09-11' },
    { secondLeg: '' },
    { airCost: 29, allowLoss: true },
  ])('已有配板时阻断使订舱资格改变的修改：%j', changes => {
    data.selectWorkbenchPersona('operator')
    const order = data.state.airOrders[0]
    data.allocateAirOrders([order.id], key)
    const before = JSON.stringify(data.state)
    expect(() => data.saveAirBooking(order.id, { ...createBookingDraft(order), ...changes }, { confirmedApproval: true })).toThrow('已有配板')
    expect(JSON.stringify(data.state)).toBe(before)
  })

  it('不改变订舱资格的备注可保存；卸下后恢复既有订舱变更行为', () => {
    data.selectWorkbenchPersona('operator')
    const order = data.state.airOrders[0], [allocation] = data.allocateAirOrders([order.id], key)
    data.saveAirBooking(order.id, { ...createBookingDraft(order), remark: '订舱备注' })
    expect(order.booking.remark).toBe('订舱备注')
    expect(order.bookingStatus).toBe('服务已完成')
    data.unloadAirAllocations([allocation.id])
    data.saveAirBooking(order.id, { ...createBookingDraft(order), departureDate: '2026-09-11' })
    expect(order.bookingStatus).toBe('服务中')
    expect(deriveCapacityRows(data.state, range)[0].bookedVolume).toBe(0)
  })

  it('配板结果受舱位产品引用保护，恢复演示数据清空关系和序号', () => {
    data.selectWorkbenchPersona('operator')
    data.allocateAirOrders([data.state.airOrders[0].id], key)
    expect(getCapacityEditRestriction(data.state.capacityProducts[0], data.state, data.capacitySession.value)).toContain('已有业务的影响待确认')
    data.reset()
    expect(data.state.palletAllocations).toEqual([])
    expect(data.state.palletSequence).toBe(0)
    expect(data.capacitySession.value.role).toBe('viewer')
  })
})
