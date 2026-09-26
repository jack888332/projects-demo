import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  airReturnEligibility, bbcReturnRows, bcccReturnEligibility, createReverseDraft, reversePermissions,
  validateReturnSupplyRows, validateValueAddedComplete, valueAddedEligibility,
} from '../src/domain/reverseOrders.js'

const data = usePrototypeData()
const reverse = id => data.state.reverseOrders.find(row => row.id === id)
const value = id => data.state.valueAddedServices.find(row => row.id === id)

describe('GJ-ORD-05 逆向订单与增值服务', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('service') })

  it('空运与 BC/CC 退运资格', () => {
    expect(airReturnEligibility(data.state.airOrders.find(row => row.id === 'AIR-260908-001'))).toMatchObject({ ok: true })
    expect(airReturnEligibility(data.state.airOrders.find(row => row.id === 'AIR-260908-002'))).toMatchObject({ ok: false })
    expect(airReturnEligibility(null)).toMatchObject({ ok: false })
    const cancelled = data.state.portalSmallOrders.find(row => row.id === 'SO-BC-004')
    expect(bcccReturnEligibility([cancelled])).toMatchObject({ ok: true })
    expect(bcccReturnEligibility([data.state.portalSmallOrders.find(row => row.id === 'SO-BC-001')])).toMatchObject({ ok: false })
    expect(bcccReturnEligibility([{ ...cancelled, mode: '备货' }, { ...cancelled, id: 'x', mode: '集货' }]).message).toContain('业务模式')
    expect(bcccReturnEligibility([cancelled, { ...cancelled, id: 'x', businessType: 'CC' }]).message).toContain('BC 与 CC')
    expect(reversePermissions('viewer').createReturn).toBe(false)
    expect(reversePermissions('superAdmin').handleValueAdded).toBe(false)
  })

  it('空运退运建单继承原订单并提交生成服务单', () => {
    const source = data.state.airOrders.find(row => row.id === 'AIR-260908-001')
    const created = data.createAirReturnOrder({ orderId: source.id, payload: { expectedPieces: 5, remark: '删单退运' }, submit: false })
    expect(created).toMatchObject({ category: '空运退运', businessType: '出口退运', status: '未提交', sourceOrderId: source.id })
    expect(created.orderNo).toMatch(/^VR260908\d{5}$/)
    expect(created.goods[0].quantity).toBe(5)
    expect(created.services.filter(service => service.selected).every(service => !service.generated)).toBe(true)
    data.submitReverseOrder(created.id)
    expect(created.status).toBe('进行中')
    expect(created.services.filter(service => service.generated)).toHaveLength(2)
    expect(created.services.find(service => service.generated).id).toMatch(/^SV2609\d{2}\d{5}$/)
    expect(() => data.createAirReturnOrder({ orderId: 'AIR-260908-002' })).toThrow('不支持发起退运')
  })

  it('BC/CC 退运提交后小订单退运结果为退运中', () => {
    const cancelled = data.state.portalSmallOrders.find(row => row.id === 'SO-BC-004')
    const created = data.createBcccReturnOrder({ smallOrderIds: [cancelled.id], payload: { remark: '拦截失败退运' }, submit: true })
    expect(created).toMatchObject({ category: 'BC/CC退运', businessType: 'BC进口退运', status: '进行中', customerCancelled: true })
    expect(cancelled.returnResult).toBe('退运中')
    expect(created.goods).toHaveLength(1)
  })

  it('BBC 客退/消退数量规则、结果回写与退货申请期限', () => {
    const consumerOrder = data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080004')
    const rows = bbcReturnRows(consumerOrder, 'consumer')
    expect(rows[0]).toMatchObject({ originalQuantity: 1, quantity: 1 })
    expect(() => data.createBbcReturnOrder({ bbcOrderId: consumerOrder.id, kind: 'consumer', rows: [{ ...rows[0], selectedQuantity: 1 }], submit: true })).not.toThrow()
    expect(consumerOrder.consumerReturnResult).toBe('进行中')
    expect(consumerOrder.goods[0].consumerReturnQty).toBe(1)
    expect(() => data.createBbcReturnOrder({ bbcOrderId: consumerOrder.id, kind: 'consumer', rows: [{ ...rows[0], selectedQuantity: 2 }] })).toThrow('数量')
    const notReady = data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080001')
    expect(() => data.createBbcReturnOrder({ bbcOrderId: notReady.id, kind: 'cancel', rows: bbcReturnRows(notReady, 'cancel') })).toThrow('需完成退货申请')
    data.applyBbcReturn(consumerOrder.id)
    expect(consumerOrder.returnStatus).toBe('海关入库')
    expect(() => data.applyBbcReturn(consumerOrder.id)).toThrow('重复发送')
    const cancelReady = data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080006')
    const cancelRows = bbcReturnRows(cancelReady, 'cancel')
    data.createBbcReturnOrder({ bbcOrderId: cancelReady.id, kind: 'cancel', rows: cancelRows, submit: true })
    expect(cancelReady.cancelReturnResult).toBe('进行中')
    expect(() => data.applyBbcReturn(cancelReady.id)).toThrow('重复发送')
  })

  it('退供库存校验、预占与取消释放矩阵', () => {
    const stock = data.state.portalStock.find(row => row.warehouse === '南沙保税仓 WH002' && row.barcode === '6900000000103')
    const rows = [{ barcode: '6900000000103', goodQty: 20, defectQty: 2 }]
    expect(validateReturnSupplyRows(rows, { warehouse: '南沙保税仓 WH002', stock: data.state.portalStock })).toEqual({})
    expect(validateReturnSupplyRows([{ barcode: '6900000000103', goodQty: 0, defectQty: 0 }], { warehouse: '南沙保税仓 WH002', stock: data.state.portalStock })).toHaveProperty('0.quantity')
    expect(() => data.createStockReturn({ entrance: 'portal-bccc', businessType: 'BC进口退供', warehouse: '南沙保税仓 WH002', rows: [{ barcode: '6900000000103', goodQty: 999, defectQty: 0 }] })).toThrow('库存不足')
    const created = data.createStockReturn({ entrance: 'portal-bccc', businessType: 'BC进口退供', warehouse: '南沙保税仓 WH002', rows, payload: {}, submit: true })
    expect(created).toMatchObject({ category: '退供', status: '待接单' })
    expect(stock).toMatchObject({ good: 100, defective: 4 })
    data.cancelStockReturn(created.id)
    expect(created.status).toBe('已取消')
    expect(stock).toMatchObject({ good: 120, defective: 6 })
    // 运营端 BBC 退运：下游仓储待接单时才释放
    const bbcRow = { barcode: '6900000000103', goodQty: 5, defectQty: 0 }
    const ops = data.createStockReturn({ entrance: 'ops-bbc', businessType: 'BBC进口', warehouse: '南沙保税仓 WH002', rows: [bbcRow], payload: {}, submit: true })
    ops.services = [{ key: 'warehouse', label: '仓储服务', selected: true, status: '待接单', generated: true, id: 'SV-DEMO' }]
    ops.status = '进行中'
    data.cancelStockReturn(ops.id)
    expect(stock.good).toBe(120)
    expect(ops.services[0].status).toBe('已取消')
  })

  it('增值服务接单、流转、保存、完成与终止取消', () => {
    const waiting = value('S11126090800011')
    expect(valueAddedEligibility(waiting, 'service').accept).toBe(true)
    data.acceptValueAdded([waiting.id])
    expect(waiting).toMatchObject({ status: '进行中', handler: '周倩', handlerRole: 'service' })
    data.saveValueAdded(waiting.id, { result: '处理中' })
    expect(waiting.result).toBe('处理中')
    expect(waiting.status).toBe('进行中')
    expect(validateValueAddedComplete({ ...waiting, finishAt: '', handler: '', startAt: '' })).toHaveProperty('handler')
    data.completeValueAdded(waiting.id)
    expect(waiting.status).toBe('已完成')
    expect(waiting.finishAt).toBeTruthy()
    // 流转：仓库人员接单后转给部门所有人
    data.selectWorkbenchPersona('warehouseService')
    const running = value('S11126090800012')
    expect(valueAddedEligibility(running, 'warehouseService').transfer).toBe(true)
    data.transferValueAdded([running.id], { mode: 'department' })
    expect(running).toMatchObject({ status: '待接单', handler: '' })
    data.acceptValueAdded([running.id])
    data.transferValueAdded([running.id], { mode: 'person', target: '仓库演示主管' })
    expect(running.handler).toBe('仓库演示主管')
    expect(running.status).toBe('进行中')
    const terminateTarget = value('S11126090800013')
    expect(terminateTarget.status).toBe('已完成')
    expect(valueAddedEligibility(terminateTarget, 'warehouseService').terminate).toBe(false)
    const cancelWaiting = value('S11126090800011')
    expect(valueAddedEligibility(cancelWaiting, 'service').cancel).toBe(false)
    data.selectWorkbenchPersona('service')
    expect(() => data.transferValueAdded([value('S11126090800012').id], { mode: 'department' })).toThrow('本人接单')
  })

  it('岗位与超级管理员只读；逆向订单草稿编辑保护', () => {
    data.selectWorkbenchPersona('operator')
    expect(() => data.createAirReturnOrder({ orderId: 'AIR-260908-001' })).toThrow()
    expect(() => data.acceptValueAdded(['S11126090800011'])).toThrow()
    data.selectWorkbenchPersona('service')
    const draft = createReverseDraft('BBC客退', { id: '', orderNo: '' })
    expect(draft.services.length).toBeGreaterThan(0)
    const created = data.createAirReturnOrder({ orderId: 'AIR-260908-001', payload: {}, submit: false })
    data.saveReverseOrder(created.id, { ...created, remark: '草稿修改' })
    expect(created.remark).toBe('草稿修改')
    data.deleteReverseOrder(created.id)
    expect(reverse(created.id)).toBeUndefined()
    data.selectWorkbenchPersona('superAdmin')
    expect(() => data.cancelReverseOrder('VR-260908-001')).toThrow()
    data.reset()
    expect(data.state.reverseOrders).toHaveLength(5)
  })

  it.each(['views/ReverseOrdersView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
