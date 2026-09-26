import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  bcExportPermissions, createBcExportBatchNo, declarationEligibility, deletionEligibility,
  exceptionEligibility, filterBcExportOrders, parseBcImportRows,
} from '../src/domain/bcExportOrders.js'

const data = usePrototypeData()
const order = id => data.state.bcExportOrders.find(row => row.id === id)

describe('GJ-CUS-04 BC出口关务（订单与申报切片）', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('customsService') })

  it('列表筛选：多值精确、状态、异常结果、批次与时间', () => {
    const rows = data.state.bcExportOrders
    expect(filterBcExportOrders(rows, { orderNo: 'BCO2609080001' })).toHaveLength(1)
    expect(filterBcExportOrders(rows, { orderNo: 'BCO2609080001\nBCO2609080002' })).toHaveLength(2)
    expect(filterBcExportOrders(rows, { listStatus: '海关退单' }).map(row => row.orderNo)).toEqual(['BCO2609080007'])
    expect(filterBcExportOrders(rows, { exceptionResult: '无' })).toHaveLength(7)
    expect(filterBcExportOrders(rows, { batchNo: '202609080001' })).toHaveLength(6)
    expect(filterBcExportOrders(rows, { merchantName: 'DEMO 商家丙' })).toHaveLength(2)
    expect(createBcExportBatchNo(3, '2026-09-08 14:30')).toBe('202609080003')
  })

  it('申报资格：平台订单、状态门槛与清单/总运单前置', () => {
    expect(declarationEligibility(order('BCO-260908-001'), 'order')).toMatchObject({ ok: false, reason: expect.stringContaining('平台订单') })
    expect(declarationEligibility(order('BCO-260908-002'), 'order')).toMatchObject({ ok: true })
    expect(declarationEligibility(order('BCO-260908-003'), 'list')).toMatchObject({ ok: false, reason: expect.stringContaining('总运单号') })
    expect(declarationEligibility(order('BCO-260908-004'), 'list')).toMatchObject({ ok: true })
    expect(declarationEligibility(order('BCO-260908-005'), 'cancelList')).toMatchObject({ ok: true })
    expect(declarationEligibility(order('BCO-260908-005'), 'waybillDoc')).toMatchObject({ ok: true })
    expect(declarationEligibility(order('BCO-260908-006'), 'summary')).toMatchObject({ ok: true })
    expect(declarationEligibility(order('BCO-260908-006'), 'departure')).toMatchObject({ ok: true })
    expect(deletionEligibility(order('BCO-260908-002'), 'deleteOrder')).toMatchObject({ ok: false })
    expect(deletionEligibility(order('BCO-260908-005'), 'deleteOrder')).toMatchObject({ ok: true })
    expect(exceptionEligibility(order('BCO-260908-007'), 'discard')).toMatchObject({ ok: true })
    expect(exceptionEligibility(order('BCO-260908-004'), 'discard')).toMatchObject({ ok: false })
    expect(bcExportPermissions('viewer')).toMatchObject({ declare: false })
  })

  it('批量申报：三单→清单→总运单→运抵→离境→汇总，逐条过滤与回执', () => {
    const three = ['BCO-260908-002']
    const orderResult = data.declareBcExportOrders(three, 'order', { channel: '单一窗口' })
    expect(orderResult.sent).toHaveLength(1)
    expect(order('BCO-260908-002')).toMatchObject({ orderStatus: '海关入库', channel: '单一窗口' })
    const mixed = data.declareBcExportOrders(['BCO-260908-002', 'BCO-260908-003'], 'pay')
    expect(mixed.skipped.map(row => row.orderNo)).toEqual(['BCO2609080003'])
    data.declareBcExportOrders(three, 'waybill')
    expect(order('BCO-260908-002')).toMatchObject({ payStatus: '海关入库', waybillStatus: '海关入库' })
    data.enterBcWaybillNo(three, '781-90003999')
    expect(order('BCO-260908-002').waybillNo).toBe('781-90003999')
    data.declareBcExportOrders(three, 'list', { businessType: '普通清单' })
    expect(order('BCO-260908-002')).toMatchObject({ listStatus: '海关入库' })
    expect(order('BCO-260908-002').receipts.at(-1)).toMatchObject({ type: '清单申报', status: '海关入库' })
    // 总运单申报要求总运单状态已为海关审结/入库 → 先经总运单录入后再申报的场景由 BCO-005 覆盖
    data.declareBcExportOrders(['BCO-260908-005'], 'waybillDoc')
    expect(order('BCO-260908-005').waybillDocStatus).toBe('海关入库')
    data.declareBcExportOrders(['BCO-260908-005'], 'arrival')
    expect(order('BCO-260908-005').arrivalStatus).toBe('海关入库')
    data.declareBcExportOrders(['BCO-260908-005'], 'departure')
    expect(order('BCO-260908-005').departureStatus).toBe('海关入库')
    data.declareBcExportOrders(['BCO-260908-006'], 'summary')
    expect(order('BCO-260908-006').summaryStatus).toBe('海关审结')
    expect(() => data.declareBcExportOrders(['BCO-260908-001'], 'order')).toThrow('没有可')
  })

  it('删除申报与异常处理：状态回退、退场、弃货、A 编号与总运单修改', () => {
    const deleted = data.deleteBcDeclarations(['BCO-260908-005', 'BCO-260908-002'], 'deleteOrder')
    expect(deleted.changed.map(row => row.orderNo)).toEqual(['BCO2609080005'])
    expect(deleted.skipped.map(row => row.orderNo)).toEqual(['BCO2609080002'])
    expect(order('BCO-260908-005').orderStatus).toBe('待报关')
    expect(order('BCO-260908-005').receipts.at(-1).type).toContain('删除')
    data.recordBcException(['BCO-260908-007'], 'returnScene', { reason: '退货申请', fileName: '退货申请表' })
    expect(order('BCO-260908-007').exceptionResult).toBe('退单退场')
    expect(order('BCO-260908-007').returnAttachments[0].name).toContain('退货申请表')
    data.recordBcException(['BCO-260908-007'], 'discard', { reason: '涉及侵权' })
    expect(order('BCO-260908-007').exceptionResult).toBe('弃货')
    const before = data.state.bcExportOrders.length
    const copies = data.recordBcException(['BCO-260908-007'], 'batchNewOrders', {})
    expect(copies.changed[0].orderNo).toBe('BCO2609080007A')
    expect(copies.changed[0].listStatus).toBe('待报关')
    expect(data.state.bcExportOrders).toHaveLength(before + 1)
    data.recordBcException(['BCO-260908-004'], 'modifyWaybill', { waybillNo: '781-90003990' })
    expect(order('BCO-260908-004').waybillNo).toBe('781-90003990')
    const { changed, skipped } = data.recordBcException([copies.changed[0].id], 'deleteOrders', {})
    expect(changed).toEqual([])
    expect(skipped.map(row => row.orderNo)).toEqual([copies.changed[0].orderNo])
  })

  it('导入：模板解析、重复与必填过滤、失败下载与历史记录', () => {
    expect(parseBcImportRows('BCO2609080201,PLT-1,商家甲,EXP-1,PKG-1,100,南沙海关,9710', []).orders).toHaveLength(1)
    expect(parseBcImportRows('BCO2609080201,PLT-1,,EXP-1,PKG-1,100', []).problems[0].reason).toContain('必填')
    expect(parseBcImportRows('BCO2609080201,PLT-1,商家甲\nBCO2609080201,PLT-2,商家甲', []).problems[0].reason).toContain('重复')
    expect(parseBcImportRows('BCO2609080001,PLT-1,商家甲', ['BCO2609080001']).problems[0].reason).toContain('系统已存在')
    const result = data.importBcExportOrders({ mode: '9610', rowsText: 'BCO2609080301,PLT-3,商家乙,EXP-3,PKG-3,500,南沙海关,9610\nBCO2609080301,PLT-4,商家乙' })
    expect(result.created).toHaveLength(1)
    expect(result.created[0]).toMatchObject({ supervisionMode: '9610', orderStatus: '待报关', merchantName: '商家乙' })
    expect(result.problems).toHaveLength(1)
    expect(result.history).toMatchObject({ mode: '9610', total: 2, success: 1, failed: 1 })
    expect(result.failureCsv).toContain('失败原因')
    expect(data.state.bcExportImportHistory[0].batchNo).toBe(result.history.batchNo)
    data.selectWorkbenchPersona('operator')
    expect(() => data.importBcExportOrders({ mode: '9710', rowsText: 'X,商家' })).toThrow()
    data.reset()
    expect(data.state.bcExportOrders).toHaveLength(7)
    expect(data.state.bcExportImportHistory).toHaveLength(2)
  })

  it.each(['views/BcExportCustomsView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
