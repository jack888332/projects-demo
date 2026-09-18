import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { accessState } from '../src/data/accessControl.js'
import { warehouseDraft, warehouseRows, warehouseSelectedSummary, warehouseHistory, WAREHOUSE_STATUSES } from '../src/domain/warehouseOrders.js'
const data = usePrototypeData()
const draft = () => ({ ...warehouseDraft(), customer: '启航跨境贸易', businessType: '出口空运', customerOrderNo: 'WH-TEST', expectedPieces: '20', expectedWeight: '100.20', expectedVolume: '1.20' })
beforeEach(() => data.reset())
describe('chapter020 warehouse order ownership', () => {
  it('replaces old tally statuses and excludes final states from pending', () => {
    expect(data.state.warehouseOrders.every(row => WAREHOUSE_STATUSES.includes(row.status))).toBe(true)
    expect(data.dashboard.value.warehousePending).toBe(4)
    expect(data.state.airOrders[0].services.find(row => row.type === 'warehouse').status).toBe('服务中')
  })
  it('creates from air entry, preserves fields and rejects duplicate customer numbers atomically', () => {
    const row = data.saveWarehouseOrder(draft())
    expect(row.inboundNo).toBe('WH0012609080041')
    expect(row.customer).toBe('高捷物流-空运部')
    expect(row.status).toBe('待入库')
    expect(data.state.groundServiceRegistry.inbounds.at(-1).warehouseId).toBe(row.id)
    const count = data.state.warehouseOrders.length
    expect(() => data.saveWarehouseOrder(draft())).toThrow('客户订单号已存在')
    expect(data.state.warehouseOrders).toHaveLength(count)
  })
  it('validates optional values without turning blanks into zero', () => {
    expect(() => data.saveWarehouseOrder({ ...draft(), phone: '12', expectedPieces: '0' })).toThrow()
    const row = data.saveWarehouseOrder(draft())
    expect(row.volume).toBe('')
    expect(warehouseSelectedSummary([row])).toEqual({ count: 1, expectedPieces: 20, expectedWeight: 100.2, expectedVolume: 1.2 })
  })
  it('enforces business and configured permissions, including readonly admin', () => {
    for (const persona of ['warehouseService', 'superAdmin', 'driver']) {
      data.selectWorkbenchPersona(persona)
      expect(() => data.saveWarehouseOrder(draft())).toThrow()
    }
    data.selectWorkbenchPersona('hangsheng')
    expect(data.saveWarehouseOrder(draft()).customer).toBe('启航跨境贸易')
    accessState.policies.hangsheng = { warehouseOrders: { write: false } }
    expect(() => data.saveWarehouseOrder({ ...draft(), customerOrderNo: 'NEW' })).toThrow()
  })
  it('locks customer after inbound and rejects terminal edit', () => {
    data.selectWorkbenchPersona('warehouseService')
    const row = data.state.warehouseOrders[0]
    expect(() => data.saveWarehouseOrder({ ...warehouseDraft(row), customer: '另一个客户' }, row.id)).toThrow('客户不可修改')
    data.saveWarehouseOrder({ ...warehouseDraft(row), remark: '更新备注' }, row.id)
    expect(row.remark).toBe('更新备注')
    const final = data.state.warehouseOrders.find(row => row.status === '已出库')
    expect(() => data.saveWarehouseOrder(warehouseDraft(final), final.id)).toThrow()
  })
  it('projects document scans without another record owner', () => {
    data.state.groundServiceRecords.push({ id: 'DOC', operation: 'document', warehouseId: 'WH-260908-006', updatedAt: '2026-09-08 14:00', history: [{ time: '2026-09-08 14:00', remark: '备注', actorId: 'ACCOUNT' }] })
    expect(warehouseRows(data.state).find(row => row.id === 'WH-260908-006').documentAt).toBe('2026-09-08 14:00')
    expect(warehouseHistory(data.state, data.state.warehouseOrders[0]).at(-1).actor).toBe('ACCOUNT')
  })
  it('connects explicit upstream intake to WMS receipt and air service without inventing outbound completion', () => {
    data.selectWorkbenchPersona('warehouseService')
    const air = data.state.airOrders[1]
    const row = data.receiveWarehouseUpstream(air.id,'IN-EXPLICIT-020')
    expect(() => data.receiveWarehouseUpstream(air.id,'IN-EXPLICIT-020')).toThrow('入仓号已存在')
    data.simulateWarehouseReceipt(row.id,{kind:'inbound',palletNo:'PALLET-NEW-020',pieces:10,weight:20.5,volume:1.5})
    expect(row.status).toBe('已入库'); expect(row.grossWeight).toBe(20.5)
    expect(air.services.find(row => row.type === 'warehouse').status).toBe('服务中')
    expect(() => data.simulateWarehouseReceipt(row.id,{kind:'cancel'})).toThrow()
    expect(() => data.simulateWarehouseReceipt(row.id,{kind:'outboundInstruction',pieces:11})).toThrow()
    data.simulateWarehouseReceipt(row.id,{kind:'outboundInstruction',pieces:5,weight:10})
    expect(row.status).toBe('待出库')
    const before = JSON.stringify(row)
    expect(() => data.simulateWarehouseReceipt(row.id,{kind:'outbound'})).toThrow('036')
    expect(JSON.stringify(row)).toBe(before)
  })
  it('preserves expected services and records actual actor/time; final state refuses edits', () => {
    data.selectWorkbenchPersona('warehouseService')
    const row = data.state.warehouseOrders[0]
    data.saveWarehouseServices(row.id,{palletize:'3',weightTo:'200.50'})
    expect(row.palletize).toBe(2); expect(row.services.palletize.actual).toBe('3')
    expect(row.services.palletize.actor).toBe('DEMO-warehouseService')
    expect(() => data.saveWarehouseServices(data.state.warehouseOrders.find(row => row.status === '已出库').id,{palletize:4})).toThrow()
  })
  it('keeps ambiguous manual cargo, reweigh and invalid service writes atomic', () => {
    const row = data.saveWarehouseOrder({...draft(), pieces:'10',grossWeight:'20',volume:'1'})
    data.selectWorkbenchPersona('warehouseService')
    const before = JSON.stringify(row)
    expect(() => data.simulateWarehouseReceipt(row.id,{kind:'inbound',palletNo:'MANUAL-CARGO',pieces:10,weight:20,volume:1})).toThrow('164')
    expect(JSON.stringify(row)).toBe(before)
    const received = data.state.warehouseOrders.find(row => row.status === '已入库'), saved = JSON.stringify(received)
    expect(() => data.simulateWarehouseReceipt(received.id,{kind:'reweigh',palletNo:received.pallets[0].number,pieces:2,weight:3,volume:1})).toThrow('164')
    expect(() => data.saveWarehouseServices(received.id,{palletize:'9007199254740992'})).toThrow()
    expect(() => data.saveWarehouseServices(received.id,{weightTo:'Infinity'})).toThrow()
    expect(JSON.stringify(received)).toBe(saved)
  })
  it('cancels only waiting inbound, without assigning inventory or a completed timestamp', () => {
    data.selectWorkbenchPersona('warehouseService')
    const row = data.state.warehouseOrders.find(row => row.status === '待入库')
    data.simulateWarehouseReceipt(row.id,{kind:'cancel'})
    expect(row.status).toBe('已取消'); expect(row.pallets).toEqual([]); expect(row.completedAt).toBe('')
    expect(row.history.at(-1).event).toBe('上游取消')
    expect(() => data.saveWarehouseServices(row.id,{palletize:'1'})).toThrow()
  })
})
