import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  bcClearanceUpdate, bcConvertEligibility, bcDeclarationEligibility, bcDispatchEligibility, bcImportPermissions,
  createBcReceiptCsv, filterBcImportOrders,
} from '../src/domain/bcImportOrders.js'

const data = usePrototypeData()
const order = id => data.state.bcImportOrders.find(row => row.id === id)

describe('GJ-CUS-06 BC进口订单与申报（首切片）', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('customsService') })

  it('列表筛选：多值精确、状态、清关节点与日期', () => {
    const rows = data.state.bcImportOrders
    expect(rows).toHaveLength(10)
    expect(filterBcImportOrders(rows, { orderNo: 'BCO-IN-260908-001' })).toHaveLength(1)
    expect(filterBcImportOrders(rows, { orderNo: 'BCO-IN-260908-001\nBCO-IN-260908-002' })).toHaveLength(2)
    expect(filterBcImportOrders(rows, { listStatus: '海关退单' }).map(row => row.orderNo)).toEqual(['BCO-IN-260908-008'])
    expect(filterBcImportOrders(rows, { waybillNo: '781-90004006' })).toHaveLength(2)
    expect(filterBcImportOrders(rows, { pickedUp: '未提货', clearanceStarted: '未开始' }).length).toBeGreaterThan(0)
    expect(filterBcImportOrders(rows, { customerCancelled: 'true' })).toHaveLength(0)
  })

  it('下发仓库资格与执行：集货/缺货/预售阻断，现货有货下发', () => {
    expect(bcDispatchEligibility(order('BCI-260908-004'))).toMatchObject({ ok: false, reason: '仅备货订单可下发仓库' })
    expect(bcDispatchEligibility(order('BCI-260908-003'))).toMatchObject({ ok: false })
    expect(bcDispatchEligibility(order('BCI-260908-001'))).toMatchObject({ ok: true })
    expect(bcDispatchEligibility(order('BCI-260908-002'))).toMatchObject({ ok: true, note: expect.stringContaining('预售') })
    const result = data.dispatchBcImportOrders(['BCI-260908-001', 'BCI-260908-003'])
    expect(result.dispatched.map(row => row.orderNo)).toEqual(['BCO-IN-260908-001'])
    expect(order('BCI-260908-001')).toMatchObject({ warehouseStatus: '已下发', stockStatus: '已锁库' })
    expect(() => data.dispatchBcImportOrders(['BCI-260908-003'])).toThrow('没有可下发的订单')
  })

  it('绑定干线、提单录入与自动订单/运单申报；解绑回未发货', () => {
    data.bindBcImportOrders(['BCI-260908-005'], { waybillNo: '781-90004005', outboundNo: 'OUT-BCI-005' })
    expect(order('BCI-260908-005')).toMatchObject({ waybillNo: '781-90004005', bound: true, shipped: true })
    const entered = data.enterBcImportWaybills(['BCI-260908-005'], { departurePort: 'CAN', expectedDeparture: '2026-09-09', volume: '0.6', grossWeight: '15' })
    expect(entered.entered).toHaveLength(1)
    const target = order('BCI-260908-005')
    expect(target).toMatchObject({ waybillEntered: true, orderStatus: '海关入库', waybillStatus: '海关入库', channel: '广州电子口岸' })
    expect(target.waybillFields).toMatchObject({ waybillNo: '781-90004005', departurePort: 'CAN', pallets: 3 })
    expect(target.receipts.map(row => row.type).sort()).toEqual(['order', 'waybill'])
    // 解绑要求订单与提单均未申报
    expect(() => data.unbindBcImportOrders(['BCI-260908-005'])).toThrow('没有可解绑的订单')
  })

  it('申报：订单/运单/清单/撤销/退货与删除申报的状态迁移', () => {
    const [six, seven] = [order('BCI-260908-006'), order('BCI-260908-007')]
    expect(bcDeclarationEligibility(six, 'list')).toMatchObject({ ok: false, reason: '订单与运单状态须为海关入库' })
    data.declareBcImportOrders([six.id], 'order', { channel: '广州电子口岸' })
    data.declareBcImportOrders([six.id], 'waybill')
    expect(six).toMatchObject({ orderStatus: '海关入库', waybillStatus: '海关入库', channel: '广州电子口岸' })
    // 清单申报按相同总运单整组：先补 007 的订单与运单状态
    data.declareBcImportOrders([seven.id], 'order')
    data.declareBcImportOrders([seven.id], 'waybill')
    const listResult = data.declareBcImportOrders([six.id], 'list')
    expect(listResult.changed.map(row => row.orderNo).sort()).toEqual(['BCO-IN-260908-006', 'BCO-IN-260908-007'])
    expect(six.listStatus).toBe('海关入库')
    expect(seven.listStatus).toBe('海关入库')
    data.declareBcImportOrders([six.id], 'cancelList', { reason: '客户取消' })
    expect(six.cancelListStatus).toBe('海关入库')
    const release = order('BCI-260908-009')
    data.declareBcImportOrders([release.id], 'return', { reason: '客户退货' })
    expect(release).toMatchObject({ returnStatus: '海关审结', returnResult: '进行中' })
    const deletable = order('BCI-260908-010')
    data.declareBcImportOrders([deletable.id], 'deleteOrder')
    expect(deletable.orderStatus).toBe('待报关')
    data.declareBcImportOrders([deletable.id], 'deleteWaybill')
    expect(deletable.waybillStatus).toBe('待报关')
    data.declareBcImportOrders([deletable.id], 'deleteCancel')
    expect(deletable.cancelListStatus).toBe('待报关')
    expect(() => data.declareBcImportOrders([deletable.id], 'deleteCancel')).toThrow('没有可申报的订单')
  })

  it('转为 CC 订单：清单退单与备案校验、解绑与预估税金待确认', () => {
    const target = order('BCI-260908-008')
    expect(bcConvertEligibility(target, target.goods)).toMatchObject({ ok: true })
    const missing = { ...target, goods: [{ id: 'G-X', name: '未备案商品', productId: '' }] }
    expect(bcConvertEligibility(missing, missing.goods).reason).toContain('没有备案')
    const before = data.state.bcImportOrders.length
    const result = data.convertBcToCc([target.id])
    expect(result.converted).toHaveLength(1)
    expect(data.state.bcImportOrders).toHaveLength(before - 1)
    expect(data.state.ccImportOrders[0]).toMatchObject({ customer: '华越国际商贸', conversion: '作废', shipped: false, orderStatus: '待报关', estimatedTax: null })
  })

  it('补充清关信息顺序约束、同提单校验与客户取消过滤', () => {
    const target = order('BCI-260908-009')
    expect(bcClearanceUpdate(target, { clearanceStarted: '已开始' })).toMatchObject({ ok: false, reason: '未提货不能改开始清关状态' })
    const result = data.updateBcClearance([target.id], { pickedUp: '已提货', clearanceStarted: '已开始', clearanceDone: '已完成', clearedAt: '2026-09-08' })
    expect(result.changed).toHaveLength(1)
    expect(target.logistics).toMatchObject({ pickedUp: '已提货', clearanceStarted: '已开始', clearanceDone: '已完成' })
    expect(() => data.updateBcClearance(['BCI-260908-009', 'BCI-260908-010'], { pickedUp: '已提货' })).toThrow('相同提单号')
    expect(() => data.updateBcClearance([target.id], { clearanceDone: '未完成' })).not.toThrow()
  })

  it('回执 CSV 与岗位边界；重置恢复种子', () => {
    const csv = createBcReceiptCsv([order('BCI-260908-008')], 'list')
    expect(csv).toContain('海关退单')
    expect(csv).toContain('BCO-IN-260908-008')
    expect(bcImportPermissions('viewer')).toMatchObject({ operate: false, declare: false })
    data.selectWorkbenchPersona('operator')
    expect(() => data.dispatchBcImportOrders(['BCI-260908-001'])).toThrow()
    data.selectWorkbenchPersona('superAdmin')
    expect(() => data.declareBcImportOrders(['BCI-260908-006'], 'order')).toThrow()
    data.reset()
    expect(data.state.bcImportOrders).toHaveLength(10)
    expect(data.state.ccImportOrders).toHaveLength(5)
  })

  it.each(['views/BcImportCustomsView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
