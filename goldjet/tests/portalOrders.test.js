import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  createRequirementDraft, parseImportRows, portalPermissions, smallOrderEligibility, validateRequirementDraft,
} from '../src/domain/portalOrders.js'

const data = usePrototypeData()
const small = id => data.state.portalSmallOrders.find(row => row.id === id)
const requirement = id => data.state.portalRequirements.find(row => row.id === id)

describe('GJ-ORD-06 客户门户订单管理', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('service') })

  it('导入解析：同单合并、公共信息一致、必填与数量校验', () => {
    const { orders, problems } = parseImportRows([
      'BC2609080009,合成商品甲,2,88.5,拼多多,联盛优品海外专营店,SKU-DEMO-101',
      'BC2609080009,合成商品乙,1,10,拼多多,联盛优品海外专营店,',
      'BC2609080010,合成商品丙,1,20,抖音,,',
    ].join('\n'))
    expect(problems).toEqual([])
    expect(orders).toHaveLength(2)
    expect(orders[0].goods).toHaveLength(2)
    const bad = parseImportRows('BC2609080011,合成商品丁,0,20\n,,,,\nBC2609080012,合成商品戊,1,-5')
    expect(bad.problems).toHaveLength(3)
    expect(parseImportRows('X1,甲,1,10,拼多多,A\nX1,乙,1,10,抖音,A').problems[0].reason).toContain('公共信息')
  })

  it('订单池标记、取消恢复与集货备货转换', () => {
    const pool = data.state.portalPoolOrders[0]
    data.markPoolOrders([pool.id], '集货')
    const moved = small(pool.id)
    expect(moved).toMatchObject({ mode: '集货', warehouseStatus: '待出库' })
    expect(data.state.portalPoolOrders.some(row => row.id === pool.id)).toBe(false)
    data.updatePalletNo([moved.id], 'PALLET-DEMO-09')
    expect(moved.palletNo).toBe('PALLET-DEMO-09')
    expect(() => data.updatePalletNo([small('SO-BC-003').id], 'X')).toThrow('集货')
    data.convertToStock([moved.id])
    expect(moved).toMatchObject({ mode: '备货', warehouseStatus: '待下发' })
    data.convertToPickup([moved.id])
    expect(moved.mode).toBe('集货')
    const other = data.state.portalPoolOrders[0]
    data.cancelPoolOrders([other.id])
    expect(other.customerCancelled).toBe(true)
    data.restorePoolOrders([other.id])
    expect(other.customerCancelled).toBe(false)
  })

  it('提交入库形成需求草稿，保存提交后创建运营平台待接单记录', () => {
    const order = small('SO-BC-002')
    const draft = data.submitInbound([order.id])
    expect(draft).toMatchObject({ status: '未提交', mode: '集货' })
    expect(order.requirementId).toBe(draft.id)
    draft.packagePieces = '1'; draft.packageUnit = '托'; draft.packageWeight = '10'; draft.packageVolume = '0.5'
    draft.goodsTitle = '合成日化货物'
    const saved = data.savePortalRequirement({ ...draft })
    expect(saved.orderNo).toMatch(/^PR260908\d{5}$/)
    const result = data.submitPortalRequirement(saved.id)
    expect(result.requirement.status).toBe('待接单')
    expect(result.order).toMatchObject({ source: '客户门户需求', status: '待接单', businessType: 'BC', businessMode: '集货' })
    expect(data.state.integratedOrders[0].id).toBe(result.order.id)
    expect(result.requirement.integratedOrderId).toBe(result.order.id)
  })

  it('需求校验：集货小订单、备货商品、BBC 必填与干线港口', () => {
    const collect = createRequirementDraft('BC', '集货')
    expect(validateRequirementDraft(collect)).toHaveProperty('smallOrderIds')
    const stock = { ...createRequirementDraft('BC', '备货'), goodsTitle: '备货', goods: [] }
    expect(validateRequirementDraft(stock, { submit: true })).toHaveProperty('goods')
    const bbc = createRequirementDraft('BBC', '一线进境')
    const bbcErrors = validateRequirementDraft(bbc, { submit: true })
    expect(bbcErrors).toMatchObject({ finalDestinationCountry: expect.any(String), overseasShipperCode: expect.any(String) })
    const trunk = { ...createRequirementDraft('BC', '集货'), goodsTitle: '集货', smallOrderIds: ['SO-BC-001'] }
    trunk.services = trunk.services.map(service => service.key === 'trunk' ? { ...service, selected: true, fields: { originPort: 'CAN', destinationPort: 'CAN', expectedArrival: '2026-09-10 08:00' } } : service)
    expect(validateRequirementDraft(trunk, { submit: true })).toHaveProperty('trunkDestination')
  })

  it('绑定解绑、删除取消恢复与岗位边界', () => {
    const order = small('SO-BC-002')
    data.bindRequirement([order.id], 'REQ-260908-001')
    expect(order.requirementId).toBe('REQ-260908-001')
    data.unbindRequirement([order.id])
    expect(order.requirementId).toBe('')
    expect(() => data.unbindRequirement([order.id])).toThrow('没有可解绑')
    data.cancelSmallOrders([order.id])
    expect(order.customerCancelled).toBe(true)
    data.restoreSmallOrders([order.id])
    expect(order.customerCancelled).toBe(false)
    const bound = small('SO-BC-001')
    expect(() => data.deleteSmallOrders([bound.id])).toThrow('已提交需求')
    data.deleteSmallOrders([order.id])
    expect(small(order.id)).toBeUndefined()
    data.selectWorkbenchPersona('operator')
    expect(() => data.markPoolOrders([data.state.portalPoolOrders[0].id], '集货')).toThrow()
    const target = small('SO-BC-003')
    expect(portalPermissions('viewer').smallOrder).toBe(false)
    expect(() => data.dispatchStockOrders([target.id])).toThrow()
    data.selectWorkbenchPersona('superAdmin')
    expect(() => data.cancelPortalRequirement('REQ-260908-001')).toThrow()
  })

  it('备货下发锁库、缺货阻断与取消释放', () => {
    const order = small('SO-BC-003')
    const stock = data.state.portalStock.find(row => row.warehouse === order.warehouse && row.barcode === '6900000000103')
    expect(stock.good).toBe(120)
    const result = data.dispatchStockOrders([order.id])
    expect(result.dispatched).toEqual(['BC2609080003'])
    expect(order).toMatchObject({ warehouseStatus: '待拣货', stockStatus: '已锁库' })
    expect(stock.good).toBe(117)
    const ccOrder = small('SO-CC-002')
    ccOrder.goods[0].quantity = 999
    const shortage = data.dispatchStockOrders([ccOrder.id])
    expect(shortage.dispatched).toEqual([])
    expect(shortage.shortage[0].orderNo).toBe('CC2609080002')
    data.cancelStockOrders([order.id])
    expect(order.warehouseStatus).toBe('已取消')
    expect(stock.good).toBe(120)
  })

  it('小订单导入：整份失败、缺备案入池与成功导入', () => {
    const failure = data.importSmallOrders({ mode: '集货', rowsText: 'BC2609080001,重复商品,1,10', warehouse: '' })
    expect(failure.ok).toBe(false)
    expect(failure.problems[0].reason).toContain('重复')
    expect(data.state.portalSmallOrders).toHaveLength(6)
    const poolResult = data.importSmallOrders({ mode: '备货', rowsText: 'BC2609080090,未备案商品,1,10,,,', warehouse: '南沙保税仓 WH002' })
    expect(poolResult.ok).toBe(true)
    expect(poolResult.poolCount).toBe(1)
    expect(data.state.portalPoolOrders.some(row => row.orderNo === 'BC2609080090')).toBe(true)
    const ok = data.importSmallOrders({ mode: '集货', rowsText: 'CC2609080091,合成商品,2,50,,,SKU-DEMO-201', palletNo: 'PALLET-IMP-01', warehouse: '' })
    expect(ok.ok).toBe(true)
    expect(ok.poolCount).toBe(0)
    const imported = data.state.portalSmallOrders.find(row => row.orderNo === 'CC2609080091')
    expect(imported).toMatchObject({ mode: '集货', palletNo: 'PALLET-IMP-01', warehouseStatus: '待出库' })
    expect(imported.goods[0]).toMatchObject({ quantity: 2, unitPrice: 50, productId: 'SKU-DEMO-201' })
  })

  it('报告确认：破损转正品、异常处理方式、短溢与驳回', () => {
    const report = data.state.portalReports.find(row => row.id === 'RPT-260908-02')
    const batch = report.batches[0]
    expect(() => data.confirmTallyReport(report.id, batch.id)).toThrow('处理方式')
    data.convertDamagedDetail(report.id, batch.id, batch.details[0].id)
    expect(batch.details[0]).toMatchObject({ goodQty: 2, defectQty: 0, handling: '包装破损转正品' })
    data.confirmTallyReport(report.id, batch.id)
    expect(batch).toMatchObject({ confirmStatus: '已确认' })
    expect(report.status).toBe('已完成')
    const rejected = data.state.portalReports.find(row => row.id === 'RPT-260908-03')
    data.setShortageHandling(rejected.id, rejected.batches[0].id, rejected.batches[0].details[0].id, '退回多余商品', 'reject')
    expect(rejected.batches[0].details[0].shortageResult).toBe('已驳回')
    data.rejectTallyReport(rejected.id, rejected.batches[0].id)
    expect(rejected.status).toBe('已驳回')
    const receipt = data.state.portalReports.find(row => row.id === 'RPT-260908-01')
    expect(() => data.confirmReceiptReport(receipt.id, receipt.batches[0].id)).toThrow('自动确认')
    receipt.batches[0].result = '异常'
    data.confirmReceiptReport(receipt.id, receipt.batches[0].id)
    expect(receipt.batches[0].confirmResult).toBe('已确认')
    expect(() => data.setShortageHandling(report.id, batch.id, batch.details[0].id, 'x', 'confirm')).toThrow('仅短溢')
  })

  it('重置恢复门户种子与需求单编辑保护', () => {
    const draft = data.submitInbound([small('SO-BC-002').id])
    data.savePortalRequirement({ ...draft, packagePieces: '1', packageUnit: '托', packageWeight: '1', packageVolume: '0.1', goodsTitle: '货物' })
    data.savePortalRequirement({ ...draft, remark: '草稿修改' }, draft.id)
    expect(requirement(draft.id).remark).toBe('草稿修改')
    const result = data.submitPortalRequirement(draft.id)
    expect(result.requirement.status).toBe('待接单')
    expect(() => data.submitPortalRequirement('REQ-260908-001')).toThrow('当前状态不能提交')
    data.reset()
    expect(data.state.portalSmallOrders).toHaveLength(6)
    expect(data.state.portalPoolOrders).toHaveLength(2)
    expect(data.state.portalRequirements).toHaveLength(2)
    expect(requirement('REQ-260908-001').status).toBe('进行中')
    expect(smallOrderEligibility(small('SO-BC-003')).dispatch).toBe(true)
  })

  it.each(['views/PortalOrdersView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
