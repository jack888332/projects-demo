import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  bbcAmountSummary, bbcOrderEligibility, bbcReturnDeadline, canApplyBbcReturn, canArrangeBbcCancelReturn,
  canArrangeBbcConsumerReturn, declarationStateFor, filterBbcOrders, isBbcTab, validateReturnQuantities,
} from '../src/domain/bbcCustomerOrders.js'

const data = usePrototypeData()
const order = () => data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080001')

describe('GJ-ORD-04 BBC客户订单管理', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('service') })

  it('页签、金额公式与查询过滤', () => {
    const orders = data.state.bbcCustomerOrders
    expect(orders.filter(row => isBbcTab(row, '已发货')).map(row => row.orderNo)).toEqual(['BBC2609080001', 'BBC2609080005', 'BBC2609080006'])
    expect(isBbcTab(orders[3], '未发货')).toBe(true)
    expect(orders.filter(row => isBbcTab(row, '客退订单')).map(row => row.orderNo)).toEqual(['BBC2609080005'])
    expect(orders.filter(row => isBbcTab(row, '消退订单')).map(row => row.orderNo)).toEqual(['BBC2609080006'])
    expect(bbcAmountSummary(order())).toMatchObject({ goodsTotal: '328.50', payable: '328.50', estimatedTax: '42.70', customsTax: '30.20' })
    expect(filterBbcOrders(orders, { orderNo: 'BBC2609080002' }).map(row => row.orderNo)).toEqual(['BBC2609080002'])
    expect(filterBbcOrders(orders, { warehouseStatus: '库存不足' }).map(row => row.orderNo)).toEqual(['BBC2609080003'])
    expect(filterBbcOrders(orders, { expressNo: 'DEMO-BBC-EX-01' })).toHaveLength(1)
  })

  it('三单自动申报：预售与库存不足跳过，满足后下发 WMS', () => {
    const pending = data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080002')
    expect(declarationStateFor(pending)).toMatchObject({ ok: true })
    // 先只申报订单：清单未满足前不下发
    const result = data.declareBbcOrders([pending.id], ['order'])
    expect(result.declared).toHaveLength(1)
    expect(pending.orderStatus).toBe('海关入库')
    expect(pending.warehouseStatus).toBe('待下发')
    // 补申报运单后，订单与运单均海关入库触发清单申报并下发
    data.declareBbcOrders([pending.id], ['waybill'])
    expect(pending.manifestStatus).toBe('放行')
    expect(pending.warehouseStatus).toBe('已下发')
    const shortage = data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080003')
    expect(declarationStateFor(shortage)).toMatchObject({ ok: false })
    expect(data.declareBbcOrders([shortage.id], ['order']).skipped[0].reason).toContain('库存不足')
    // 退单订单可重新申报
    const rejected = data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080004')
    expect(data.declareBbcOrders([rejected.id], ['order']).declared).toHaveLength(1)
    expect(rejected.orderStatus).toBe('海关入库')
  })

  it('取消、恢复、作废与修改资格；下快递保留原号失效', () => {
    const pending = data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080002')
    data.cancelBbcOrder(pending.id)
    expect(pending).toMatchObject({ orderStatus: '已取消', warehouseStatus: '订单已取消', waybillStatus: '待报关', manifestStatus: '待报关' })
    expect(pending.cancelStatus).toContain('未验证成功')
    data.restoreBbcOrder(pending.id)
    expect(pending).toMatchObject({ orderStatus: '待报关', warehouseStatus: '待下发' })
    const shipped = order()
    expect(bbcOrderEligibility(shipped).cancel).toBe(false)
    expect(() => data.cancelBbcOrder(shipped.id)).toThrow('不能取消')
    data.voidBbcOrder(pending.id)
    expect(pending.orderStatus).toBe('已作废')
    expect(() => data.restoreBbcOrder(pending.id)).toThrow('不能恢复')
    const modifyTarget = data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080001')
    expect(() => data.modifyBbcOrder(modifyTarget.id, { remark: 'x' })).toThrow('仅待报关或已取消订单可修改')
    const draft = data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080003')
    data.modifyBbcOrder(draft.id, { remark: '修改备注', buyer: '新订购人' })
    expect(draft).toMatchObject({ remark: '修改备注', buyer: '新订购人' })
    const withExpress = data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080004')
    data.fetchBbcExpress(withExpress.id, '顺丰速运')
    expect(withExpress.expressHistory[0]).toMatchObject({ no: 'DEMO-BBC-EX-04', company: '圆通速递' })
    expect(withExpress.expressNo).toMatch(/^DEMO-BBC-EX-N\d{2}$/)
    expect(withExpress.expressCompany).toBe('顺丰速运')
    const noExpress = data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080003')
    data.fetchBbcExpress(noExpress.id, '中通快递')
    expect(noExpress.expressNo).toMatch(/^DEMO-BBC-EX-N\d{2}$/)
  })

  it('退回期限、可申请判定与退货数量规则', () => {
    expect(bbcReturnDeadline('2026-09-06')).toBe('2026-10-06')
    const returned = data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080004')
    expect(canApplyBbcReturn(returned, '2026-09-08')).toMatchObject({ ok: true })
    expect(canApplyBbcReturn(returned, '2026-10-07')).toMatchObject({ ok: false })
    expect(canApplyBbcReturn({ ...returned, customerCancelled: false })).toMatchObject({ ok: false })
    expect(canArrangeBbcConsumerReturn(returned)).toMatchObject({ ok: true })
    expect(canArrangeBbcCancelReturn(returned)).toMatchObject({ ok: false })
    const cancelReady = data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080006')
    expect(canArrangeBbcCancelReturn(cancelReady)).toMatchObject({ ok: true })
    expect(validateReturnQuantities([
      { id: 'a', quantity: 0, originalQuantity: 2 },
      { id: 'b', quantity: 3, originalQuantity: 2 },
      { id: 'c', quantity: 1.5, originalQuantity: 2 },
    ])).toHaveProperty('b')
    expect(validateReturnQuantities([{ id: 'a', quantity: 2, originalQuantity: 2 }])).toEqual({})
  })

  it('岗位与超级管理员边界；reset 恢复种子', () => {
    data.selectWorkbenchPersona('operator')
    expect(() => data.declareBbcOrders(['BBC2609080002'], ['order'])).toThrow()
    data.selectWorkbenchPersona('superAdmin')
    expect(() => data.cancelBbcOrder('BBC2609080002')).toThrow()
    data.reset()
    expect(data.state.bbcCustomerOrders).toHaveLength(6)
    expect(data.state.bbcCustomerOrders.find(row => row.id === 'BBC2609080002').orderStatus).toBe('待报关')
  })

  it.each(['views/BbcOrdersView.vue', 'components/BbcReturnQuantityDialog.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
