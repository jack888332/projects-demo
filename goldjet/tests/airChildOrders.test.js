import { beforeEach, describe, expect, it } from 'vitest'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { createAirChildDraft, getAirConsolidationContext, validateAirChildDraft } from '../src/domain/airChildOrders.js'
import { createAirChildOrderActions } from '../src/data/airChildOrderActions.js'
import { usePrototypeData } from '../src/data/usePrototypeData.js'

const clone = value => JSON.parse(JSON.stringify(value))
let state, session, actions
function draft(overrides = {}) {
  return { ...createAirChildDraft(), customer: '演示客户甲', owner: '周倩', goodsName: '演示零件', pieces: 3, grossWeight: 12, volume: 0.12,
    origin: 'PVG', destination: 'CAN', product: 'MU-GENERAL', sellRate: 28, foamRatio: 0.5, shipper: '合成发货人', consignee: '合成收货人', ...overrides }
}
const consolidation = { origin: 'PVG', destination: 'CAN', airline: '东方航空', product: 'MU-GENERAL', flowTo: '', bookingRequirement: '' }
beforeEach(() => {
  state = { airChildren: [], airOrders: [], airChildSequence: 0, airOrderSequence: 21, airOrderEventSequence: 0, messages: [],
    partners: [{ name: '演示客户甲', type: '客户', status: '已生效', availableCredit: 1000, creditLimit: 1000 }, { name: '演示客户乙', type: '客户', status: '已生效', availableCredit: 1000, creditLimit: 1000 }],
    airMaster: { ports: [{ code: 'PVG' }, { code: 'CAN' }], airlines: [{ name: '东方航空', code: 'MU' }] } }
  session = { role: 'service', name: '周倩' }
  actions = createAirChildOrderActions(state, () => session)
})

describe('独立子订单主路径', () => {
  it('复用基础字段，不要求英文补录；暂存不创建服务，提交只创建所选服务', () => {
    const row = actions.saveAirChildOrder(draft())
    expect(row.orderStatus).toBe('子订单暂存')
    expect(row.services.booking).toBe(false)
    expect(row.serviceRecords).toEqual([])
    expect(row.englishGoodsName).toBeUndefined()
    expect(state.airOrders).toEqual([])
    actions.submitAirChildOrder(row.id)
    expect(row.orderStatus).toBe('子订单完成')
    expect(row.serviceRecords.map(item => item.type)).toEqual(['warehouse'])
    expect(row.serviceRecords[0].status).toBe('待服务')
    expect(() => actions.submitAirChildOrder(row.id)).toThrow('暂存')
    expect(row.serviceRecords).toHaveLength(1)
  })
  it('完成子单只修改报价，保留来源与服务，并发送本地变更通知', () => {
    const row = actions.saveAirChildOrder(draft(), { submit: true })
    const original = clone(row.serviceRecords)
    actions.saveAirChildOrder({ ...row, customer: '演示客户乙', pieces: 999, sellRate: 32, foamRatio: 0.3 })
    expect(row.customer).toBe('演示客户甲')
    expect(row.pieces).toBe(3)
    expect(row.sellRate).toBe(32)
    expect(row.serviceRecords).toEqual(original)
    expect(state.messages.map(message => message.recipient)).toEqual(['李明', '王晴'])
    expect(state.messages[0].related.path).toBe('/fulfillment/air-children')
    expect(state.messages[0].content).toContain('28 → 32')
  })
  it('同客户合成创建唯一待订舱主单，来源行和既有服务保持不变', () => {
    const left = actions.saveAirChildOrder(draft({ truckSellRate: 2 }), { submit: true })
    const right = actions.saveAirChildOrder(draft({ owner: '陈楠', pieces: 7, grossWeight: 100, volume: 0.1, sellRate: 50, truckSellRate: 4, foamRatio: 0 }), { submit: true })
    const records = clone(left.serviceRecords)
    const parent = actions.createAirConsolidatedOrder([left.id, right.id], consolidation)
    expect(parent).toMatchObject({ orderType: '合成主订单', orderStatus: '待订舱', bookingStatus: '待服务', pieces: 10, grossWeight: 112, volume: 0.22 })
    expect(parent.services.map(item => item.type)).toEqual(['booking'])
    expect(parent.sourceOwners).toEqual(['周倩', '陈楠'])
    expect(left.parentId).toBe(parent.id)
    expect(right.parentId).toBe(parent.id)
    expect(left.serviceRecords).toEqual(records)
    expect(state.messages.at(-1)).toMatchObject({ recipient: '李明', type: '待订舱' })
    const weight = (0.12 * 166.66 - 12) * 0.5 + 12
    expect(parent.sellRate).toBeCloseTo((28 * weight + 50 * 100) / (weight + 100), 12)
    const charge = 0.12 * 166.66
    expect(parent.truckSellRate).toBeCloseTo((2 * charge + 4 * 100) / (charge + 100), 12)
    expect(() => actions.saveAirChildOrder({ ...left, sellRate: 99 })).toThrow('归属主订单')
    expect(() => actions.createAirConsolidatedOrder([left.id], consolidation)).toThrow('归属主订单')
    expect(state.airOrders).toHaveLength(1)
  })
  it('合成范围失败保持所有对象和服务原子不变', () => {
    const left = actions.saveAirChildOrder(draft(), { submit: true })
    const right = actions.saveAirChildOrder(draft({ customer: '演示客户乙' }), { submit: true })
    const before = clone(state)
    expect(() => actions.createAirConsolidatedOrder([left.id, right.id], consolidation)).toThrow('跨客户')
    expect(state).toEqual(before)
    expect(() => actions.createAirConsolidatedOrder([left.id, left.id], consolidation)).toThrow('重复')
    expect(state).toEqual(before)
    expect(() => actions.createAirConsolidatedOrder([left.id], { ...consolidation, product: 'CZ-GENERAL' })).toThrow()
    expect(state).toEqual(before)
  })
  it('未填分泡或混合卡车价格只阻断相应合成，不阻断独立子单创建', () => {
    const left = actions.saveAirChildOrder(draft({ foamRatio: undefined }), { submit: true })
    expect(left.orderStatus).toBe('子订单完成')
    expect(getAirConsolidationContext([left]).reasons.join('')).toContain('分泡')
    actions.saveAirChildOrder({ ...left, foamRatio: 0.5 })
    expect(getAirConsolidationContext([left]).reasons).toEqual([])
    const right = actions.saveAirChildOrder(draft({ truckSellRate: 2 }), { submit: true })
    expect(getAirConsolidationContext([left, right]).reasons.join('')).toContain('部分子订单')
  })
  it('暂存删除、无服务完成标记删除；已有服务的记录不能直接丢弃', () => {
    const waiting = actions.saveAirChildOrder(draft())
    actions.deleteAirChildOrder(waiting.id)
    expect(state.airChildren).toEqual([])
    const empty = actions.saveAirChildOrder(draft({ services: { booking: false, warehouse: false, pickup: false } }), { submit: true })
    actions.deleteAirChildOrder(empty.id)
    expect(empty.deleted).toBe(true)
    expect(state.airChildren).toContain(empty)
    const serving = actions.saveAirChildOrder(draft(), { submit: true })
    expect(() => actions.deleteAirChildOrder(serving.id)).toThrow('已有服务')
    expect(serving.serviceRecords).toHaveLength(1)
  })
  it('owner重查当前身份并允许航晟客服创建，不能用旧草稿跨身份写入', () => {
    const row = actions.saveAirChildOrder(draft())
    session = { role: 'operator', name: '李明' }
    expect(() => actions.submitAirChildOrder(row.id)).toThrow('仅空运客服')
    session = { role: 'service', name: '其他客服' }
    expect(() => actions.saveAirChildOrder({ ...row, sellRate: 30 })).toThrow('本人')
    session = { role: 'hangsheng', name: '陈楠' }
    const own = actions.saveAirChildOrder(draft(), { submit: true })
    expect(own.creator).toBe('陈楠')
  })
  it('提货地区和格式在owner中校验，批次只阻断未定义分支', () => {
    const input = draft({ services: { warehouse: false, pickup: true } })
    expect(validateAirChildDraft(input, state.partners, state.airMaster)['pickup.region']).toBeTruthy()
    expect(() => actions.saveAirChildOrder(input)).toThrow()
    expect(state.airChildren).toEqual([])
    expect(() => actions.saveAirChildOrder(draft({ batchManagement: true }))).toThrow('批次')
    expect(state.airChildren).toEqual([])
  })
})

describe('原型集成', () => {
  it('central owner 可恢复，并以同一 airChildren 承接合成来源', () => {
    const data = usePrototypeData()
    data.reset()
    data.selectWorkbenchPersona('hangsheng')
    const customer = data.state.partners.find(row => row.type === '客户' && row.status === '已生效' && row.availableCredit > 0)
    const child = data.saveAirChildOrder(draft({ customer: customer.name }), { submit: true })
    expect(child.creator).toBe('陈楠')
    const parent = data.createAirConsolidatedOrder([child.id], consolidation)
    expect(data.state.airChildren.find(row => row.id === child.id).parentId).toBe(parent.id)
    expect(data.state.airOrders.find(row => row.id === parent.id)).toBe(parent)
    data.reset()
    expect(data.state.airChildren).toEqual([])
  })
  it.each(['components/AirOrderCreateDialog.vue', 'views/AirChildOrdersView.vue'])('%s 的脚本和模板可编译', file => {
    const content = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
    const parsed = parse(content, { filename: file })
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
