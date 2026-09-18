import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { warehouseReturns, warehouseReturnExport, warehouseCsv, warehouseTransportOrders, warehouseTransportBills, warehouseMonthly, inDateRange } from '../src/domain/warehouseViews.js'
import { warehousePallets } from '../src/domain/warehouseOrders.js'
const data = usePrototypeData()
beforeEach(() => { data.reset(); data.selectWorkbenchPersona('superAdmin'); data.loadDemoOverview() })
describe('warehouse shared read models', () => {
  it('loads overview idempotently without copying return ownership', () => {
    const count = data.state.groundServiceRecords.length
    data.loadDemoOverview(); expect(data.state.groundServiceRecords).toHaveLength(count)
    const row = warehouseReturns(data.state)[0]
    expect([row.total,row.inCount,row.outCount]).toEqual([2,2,1])
    expect(row.inboundAt).toBeUndefined()
    expect(row.children[0].collectorName).toBe('演示提货人')
    data.state.groundServiceRecords.find(row => row.operation === 'returnOut').collectorName = '更新提货人'
    expect(warehouseReturns(data.state)[0].children[0].collectorName).toBe('更新提货人')
  })
  it('exports prescribed fields with blank customer, selected package and neutralized formulas', () => {
    const row = warehouseReturns(data.state)[0].children[0]
    const file = warehouseReturnExport([row],'演示地址')
    expect(file.rows[0][0]).toBe(''); expect(file.rows).toHaveLength(1)
    expect(file.rows[0][6]).toBe('WH-RETURN-020-A')
    expect(warehouseCsv(['A'],[['=SUM(1,2)'],['a"b\nc']])).toBe('\uFEFF"A"\r\n"\'=SUM(1,2)"\r\n"a""b\nc"')
  })
  it('reads transit and warehouse-address orders, preserving dual-match ambiguity and source status', () => {
    const orders = warehouseTransportOrders(data.state)
    expect(orders[0].plannedAt).toBe('2026-09-08 14:30')
    expect(orders.some(row => row.id === 'DEMO-TRANSFER-016')).toBe(true)
    const order = data.state.groundOrders.find(row => row.id === 'DEMO-WH-TRANSPORT-020')
    order.deliveryPoints[0].address = '航晟仓库另一门'; order.dispatchStatus = '未调度'
    const next = warehouseTransportOrders(data.state).find(row => row.id === order.id)
    expect(next.type).toBe('双端匹配待确认'); expect(next.dispatchStatus).toBe('未调度')
  })
  it('uses driver events for location and actual arrival, never dispatcher events', () => {
    let row = warehouseTransportBills(data.state).find(row => row.orderId === 'DEMO-WH-TRANSPORT-020')
    expect(row.expectedAt).toBe('2026-09-08 14:30'); expect(row.actualAt).toBe('2026-09-08 14:28')
    const bill = data.state.groundWaybills.find(row => row.orderId === 'DEMO-WH-TRANSPORT-020')
    bill.trajectory = bill.trajectory.map(row => ({...row,role:'航晟客服'}))
    row = warehouseTransportBills(data.state).find(row => row.id === bill.id)
    expect(row.actualAt).toBe(''); expect(row.latestLocation).toBe('')
  })
  it('counts completed orders, does not infer transit from transfer, and separates approved currencies', () => {
    let month = warehouseMonthly(data.state)[0]
    expect(month.outbound).toBe(1); expect(month.transferOutbound).toBeNull()
    expect(month.amounts).toEqual([{currency:'CNY',receivable:300,payable:80,profit:220}])
    data.state.costs.push({warehouseOrderId:'WH-260906-031',amount:10000,currency:'CNY',direction:'应收',status:'待审批'})
    data.state.costs.push({warehouseOrderId:'WH-260906-031',amount:10,currency:'USD',direction:'应收',businessApprovedAt:'2026-09-08 14:00'})
    month = warehouseMonthly(data.state)[0]
    expect(month.amounts).toHaveLength(2); expect(month.amounts[0].receivable).toBe(300)
  })
  it('dates filter actual values, with absence distinct from zero and inclusive day ranges', () => {
    expect(inDateRange('',[])).toBe(true); expect(inDateRange('', ['2026-09-08','2026-09-08'])).toBe(false)
    expect(inDateRange('2026-09-08 23:59',['2026-09-08','2026-09-08'])).toBe(true)
    expect(warehousePallets(data.state)[0].outPieces).toBe(0)
  })
})
