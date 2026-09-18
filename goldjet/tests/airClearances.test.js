import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { createAirSupplementDraft, createHouseBillDraft } from '../src/domain/airOrderSupplement.js'
import { createAirClearanceActions } from '../src/data/airClearanceActions.js'
import { canManageAirClearances, deriveAirClearances, filterAirClearances } from '../src/domain/airClearances.js'
import { getWorkbenchQuickLinks } from '../src/domain/workbenchTasks.js'

const data = usePrototypeData()
beforeEach(() => data.reset())

function sendClearance() {
  const order = data.state.airOrders[0]
  const draft = createAirSupplementDraft(order, data.state.airMaster)
  Object.assign(draft, { englishGoodsName: 'DEMO PARTS', shipper: 'DEMO SHIPPER', consignee: 'DEMO RECEIVER' })
  draft.groundServices.clearance = true
  Object.assign(draft.clearance, { contact: 'DEMO CONTACT', phone: '000-00000001', deliveryAddress: 'DEMO ADDRESS', remark: 'CLEARANCE NOTE',
    attachments: [new File(['original bytes'], 'materials.pdf', { type: 'application/pdf', lastModified: 100 })] })
  data.saveAirSupplement(order.id, draft)
  return { order, service: order.services.find(row => row.type === 'clearance') }
}

describe('GJ-013 清关派送与上游指令', () => {
  it('主单下分单保存再补录，清关指令归属分单并保留材料，不继承父单提单量', async () => {
    const order = data.state.airOrders[0], draft = createHouseBillDraft(order)
    Object.assign(draft, { housebillNo: 'DEMO00000013', englishGoodsName: 'DEMO HOUSE GOODS', shipper: 'DEMO SHIPPER', consignee: 'DEMO RECEIVER',
      destination: order.destination, pieces: order.pieces, grossWeight: order.grossWeight, volume: order.volume })
    draft.services.customs = false; draft.services.clearance = true
    draft.clearance.attachments = [new File(['house material'], 'house.pdf')]
    const child = data.saveAirHouseBill(order.id, '', draft)
    const supplement = createAirSupplementDraft(order, data.state.airMaster)
    Object.assign(supplement, { orderType: '主单', englishGoodsName: 'DEMO PARTS', shipper: 'DEMO SHIPPER', consignee: 'DEMO RECEIVER' })
    data.saveAirSupplement(order.id, supplement)
    const [row] = data.airClearances.value
    expect(row.childId).toBe(child.id); expect(row.housebillNo).toBe('DEMO00000013')
    expect(order.services.some(service => service.type === 'clearance')).toBe(false)
    expect(row.waybillCargo.pieces).toBeNull()
    data.selectWorkbenchPersona('overseasService')
    const [file] = data.getAirClearanceFiles([{ serviceId: row.id, materialId: row.materials[0].id }])
    expect(await file.blob.text()).toBe('house material')
    data.acceptAirClearance(row.id)
    expect(child.serviceRecords[0].acceptance.actor).toBe('海外演示客服')
  })
  it('补录产生同一服务、保留材料原字节，不创建第二份可写订单', async () => {
    const { order, service } = sendClearance()
    expect(data.airClearances.value).toHaveLength(1)
    const row = data.airClearances.value[0]
    expect(row).toMatchObject({ id: service.id, orderId: order.id, remark: 'CLEARANCE NOTE', creator: order.creator })
    expect(row.details.attachments[0]).toBe(service.details.attachments[0])
    data.selectWorkbenchPersona('overseasService')
    const [file] = data.getAirClearanceFiles([{ serviceId: row.id, materialId: row.materials[0].id }])
    expect(await file.blob.text()).toBe('original bytes')
    expect(file.name).toBe('materials.pdf')
    expect(data.airSession.role).toBe('viewer')
    expect(getWorkbenchQuickLinks('overseasService')[0].target.path).toBe('/fulfillment/clearance')
  })
  it('接单只追加一次当前用户与时间，不覆盖业务状态或允许重复/越权调用', () => {
    const { order, service } = sendClearance()
    expect(() => data.acceptAirClearance(service.id)).toThrow('海外部客服')
    const session = { role: 'overseasService', name: '演示接单人' }
    const actions = createAirClearanceActions(data.state, () => session, () => '2026-09-18 10:20:30')
    const initialStatus = order.orderStatus
    expect(actions.acceptAirClearance(service.id)).toEqual({ actor: '演示接单人', time: '2026-09-18 10:20:30' })
    expect(service.status).toBe('待服务'); expect(order.orderStatus).toBe(initialStatus)
    expect(() => actions.acceptAirClearance(service.id)).toThrow('已记录接单')
    expect(service.acceptance.actor).toBe('演示接单人')
    session.role = 'viewer'
    expect(() => actions.acceptAirClearance(service.id)).toThrow('海外部客服')
  })
  it.each(['服务已取消', '异常结束', '服务已完成'])('%s不误作新接单，仍可读取历史原文件', status => {
    const { service } = sendClearance(); service.status = status
    data.selectWorkbenchPersona('overseasService')
    expect(() => data.acceptAirClearance(service.id)).toThrow('活动指令')
    expect(data.getAirClearanceFiles([{ serviceId: service.id, materialId: data.airClearances.value[0].materials[0].id }])).toHaveLength(1)
  })
  it('订单取消、来源丢失或重复标识不产生接单写入', () => {
    const { order, service } = sendClearance()
    data.selectWorkbenchPersona('overseasService'); order.orderStatus = '已取消'
    expect(() => data.acceptAirClearance(service.id)).toThrow('来源订单')
    order.orderStatus = '待出提单'; order.services.push({ ...service })
    expect(() => data.acceptAirClearance(service.id)).toThrow('不唯一')
    expect(service.acceptance).toBeUndefined()
    expect(() => data.acceptAirClearance('missing')).toThrow('不存在')
  })
  it('分单独立展示，不把主单实际货物复制到分单；移单与孤立关系保持服务可识别', () => {
    const { order } = sendClearance()
    order.warehouse = { pieces: 20, grossWeight: 80, volume: 1 }
    order.waybill = { pieces: 18, grossWeight: 75, volume: 0.9 }
    data.state.airChildren.push({ id: 'CHILD-13', parentId: order.id, orderNo: 'CHILD-13', housebillNo: 'HAWB13',
      customer: order.customer, creator: '分单客服', createdAt: '2026-09-10 10:00', destination: 'LAX', orderStatus: '子订单完成',
      pieces: 99, serviceRecords: [{ id: 'CHILD-SERVICE', type: 'clearance', status: '待服务', details: { attachments: [] } }] })
    let [child, main] = data.airClearances.value
    expect(child.id).toBe('CHILD-SERVICE'); expect(main.warehouseCargo.pieces).toBe(20)
    expect(child.warehouseCargo.pieces).toBeNull(); expect(child.waybillCargo.pieces).toBeNull()
    expect(child.orderStatus).toBe('子订单完成')
    data.state.airChildren[0].parentId = ''
    child = data.airClearances.value[0]
    expect(child.orderId).toBe(''); expect(child.acceptanceBlockReason).toContain('未关联')
  })
  it('8项筛选组合、大小写模糊和日期边界正确；未知状态不隐式映射', () => {
    sendClearance()
    const row = data.airClearances.value[0]
    const filters = { number: row.orderNo.toLowerCase(), customer: '跨境', origin: row.origin, destination: row.destination,
      created: [row.createdAt.slice(0, 10), row.createdAt.slice(0, 10)], departure: [row.departureDate, row.departureDate],
      orderStatus: row.orderStatus, serviceStatus: row.serviceStatus }
    expect(filterAirClearances([row], filters)).toHaveLength(1)
    expect(filterAirClearances([row], { ...filters, number: row.waybillNo })).toHaveLength(1)
    for (const key of ['origin', 'destination', 'orderStatus', 'serviceStatus', 'customer', 'number']) expect(filterAirClearances([row], { ...filters, [key]: 'missing' })).toEqual([])
    expect(filterAirClearances([row], { created: ['2099-01-01', '2099-02-01'] })).toEqual([])
    expect(filterAirClearances([row], { departure: [null, '2020-01-01'] })).toEqual([])
  })
  it('全批验证失败不返回部分下载；角色、重复材料、缺内容与过期目标均受保护', () => {
    const { service } = sendClearance(), row = data.airClearances.value[0]
    const valid = { serviceId: row.id, materialId: row.materials[0].id }
    expect(() => data.getAirClearanceFiles([valid])).toThrow('海外部客服')
    data.selectWorkbenchPersona('overseasService')
    expect(() => data.getAirClearanceFiles([valid, valid])).toThrow('重复')
    expect(() => data.getAirClearanceFiles([valid, { ...valid, materialId: 'missing' }])).toThrow('不存在')
    service.details.attachments = [{ name: 'empty.pdf' }]
    expect(() => data.getAirClearanceFiles([valid])).toThrow('文件内容')
    expect(canManageAirClearances({ role: 'overseasService', name: '' })).toBe(false)
    data.reset(); expect(data.airClearances.value).toEqual([])
    expect(deriveAirClearances()).toEqual([])
  })
})
