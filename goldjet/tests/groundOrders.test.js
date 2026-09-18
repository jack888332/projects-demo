import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { createGroundOrderDraft, createGroundPoint, groundCustomers, groundOrderPermissions, validateGroundOrderDraft, potentialGroundOrders, groundMonthlyRows } from '../src/domain/groundOrders.js'
import { createDispatchDraft } from '../src/domain/groundOperations.js'

const data = usePrototypeData()
const valid = () => ({ ...createGroundOrderDraft(), orderNo: 'MANUAL-015', customerPartnerId: 'PT-00018', customer: '启航跨境贸易', businessType: '陆运',
  pickupPoints: [{ ...createGroundPoint(), province: '上海市', city: '上海市', district: '浦东新区', address: '演示提货地址' }],
  deliveryPoints: [{ ...createGroundPoint(), province: '江苏省', city: '苏州市', district: '昆山市', address: '演示送货地址' }],
  customerContacts: [{ name: '合成联系人', phone: '00000000155', email: 'ground15@example.invalid' }], pieces: '11', weight: '101.25', volume: '2.5' })
const dispatch = () => ({ ...createDispatchDraft(), vehicleType: '3T/4.2', supplier: '安航车队', plate: '沪A·TEST15' })
beforeEach(() => { data.reset(); data.selectWorkbenchPersona('hangsheng') })

describe('GJ-015 手工建单到运单的共享写入', () => {
  it('默认今天、完整字段、空值和日期精度校验', () => {
    expect(createGroundOrderDraft()).toMatchObject({ pickupTime: '2026-09-08', deliveryTime: '2026-09-08', businessType: '' })
    expect(validateGroundOrderDraft(valid(), groundCustomers(data.state))).toEqual({})
    expect(validateGroundOrderDraft({ ...valid(), pickupTime: '2026-02-30' }, groundCustomers(data.state))).toHaveProperty('pickupTime')
    expect(validateGroundOrderDraft({ ...valid(), deliveryTime: '2026-09-08 16:30' }, groundCustomers(data.state))).toEqual({})
    expect(validateGroundOrderDraft({ ...valid(), customerPartnerId: 'PT-00022' }, groundCustomers(data.state))).toHaveProperty('customer')
    expect(validateGroundOrderDraft({ ...valid(), customerContacts: [{ name: '甲', phone: '1', email: 'bad' }] }, groundCustomers(data.state))).toMatchObject({ 'customerContacts.0.name': expect.any(String), 'customerContacts.0.phone': expect.any(String), 'customerContacts.0.email': expect.any(String) })
  })
  it('多地址必须同省市，失败不写数据、不占流水、不追加联系人', () => {
    const draft = valid(); draft.pickupPoints.push({ ...draft.pickupPoints[0], city: '其他城市' })
    const before = JSON.stringify(data.state)
    expect(() => data.saveGroundOrder(draft)).toThrow('省、市')
    expect(JSON.stringify(data.state)).toBe(before)
    draft.pickupPoints[1].city = '上海市'
    const order = data.saveGroundOrder(draft)
    expect(order.id).toBe('T10126090800001'); expect(order.pickupPoints).toHaveLength(2)
    expect(data.state.partners[0].businessContacts.at(-1)).toMatchObject({ name: '合成联系人', emails: ['ground15@example.invalid'] })
    expect(order.history[0]).toMatchObject({ event: '订单创建', actor: 'DEMO-hangsheng' })
  })
  it('手工货量保留小数；未知监管类型拒绝，不把文本变成NaN运单', () => {
    const draft = valid(); draft.weight = '待称重'
    const order = data.saveGroundOrder(draft)
    expect(order.weight).toBe('待称重')
    expect(() => data.dispatchGroundOrders([order.id], [dispatch()])).toThrow('数值规则待确认')
    expect(data.state.groundWaybills).toHaveLength(1)
    draft.pickupPoints[0].regulated = '未知'
    expect(() => data.saveGroundOrder(draft)).toThrow('监管类型')
  })
  it('编辑留前后值，成功后调度生成同一owner运单；调度后只接受备注', () => {
    const order = data.saveGroundOrder(valid()), partner = data.state.partners[0]
    data.saveGroundOrder({ ...createGroundOrderDraft(order), remark: '修改前备注' }, order.id)
    expect(partner.businessContacts).toHaveLength(1)
    expect(order.history[1].changes).toContainEqual({ field: '备注', before: '', after: '修改前备注' })
    const [bill] = data.dispatchGroundOrders([order.id], [dispatch()])
    expect(bill).toMatchObject({ orderId: order.id, orderNo: 'MANUAL-015', expectedWeight: 101.25 })
    expect(order.history.at(-1).event).toBe('完成调度')
    expect(order.dispatchMails).toHaveLength(1)
    expect(order.dispatchMails[0]).toMatchObject({ subject: '《单号：MANUAL-015》的调度安排', to: ['ground15@example.invalid'], status: '本地模拟，未发送' })
    data.saveGroundOrder({ ...createGroundOrderDraft(order), customer: '伪造', weight: 999, remark: '调度后备注' }, order.id)
    expect(order).toMatchObject({ customer: '启航跨境贸易', weight: '101.25', remark: '调度后备注' })
    data.modifyGroundDispatch(bill.id, { ...dispatch(), plate: '沪B·TEST15' })
    expect(data.state.groundWaybills.filter(row => row.orderId === order.id)).toHaveLength(1)
    expect(data.state.groundWaybills.find(row => row.id === bill.id).plate).toBe('沪B·TEST15')
    expect(order.history.at(-1).event).toBe('修改调度'); expect(data.state.costs).toHaveLength(4)
    expect(order.dispatchMails).toHaveLength(2); expect(order.dispatchMails[1].body).toContain('原车牌号：沪A·TEST15')
    data.updateGroundWaybillStatus(bill.id, { status: '已卸货', time: '2026-09-08 18:30' })
    expect(order.dispatchStatus).toBe('已完成'); expect(order.completedAt).toBeTruthy()
    expect(() => data.modifyGroundDispatch(bill.id, dispatch())).toThrow('资格')
  })
  it('权限、上游单、已关闭保护及关闭不记费', () => {
    data.selectWorkbenchPersona('groundSupervisor'); expect(() => data.saveGroundOrder(valid())).toThrow('不允许')
    data.selectWorkbenchPersona('hangsheng'); const order = data.saveGroundOrder(valid())
    order.source = '空运系统API'; expect(groundOrderPermissions(order, 'hangsheng').edit).toBe(false)
    expect(() => data.saveGroundOrder(valid(), order.id)).toThrow('不允许')
    order.source = '航晟手工创建'; data.closeGroundOrder(order.id)
    expect(order.dispatchStatus).toBe('已关闭'); expect(data.state.costs).toHaveLength(4)
    expect(() => data.saveGroundOrder(valid(), order.id)).toThrow('不允许')
    expect(() => data.dispatchGroundOrders([order.id], [dispatch()])).toThrow('待调度')
  })
  it('潜在订单排除自己、已取消车牌由显示端排除，详情与调度排序分别定义', () => {
    const [first, second, third] = data.state.groundOrders
    expect(potentialGroundOrders(first, data.state.groundOrders).map(row => row.id)).toEqual([second.id, third.id])
    expect(potentialGroundOrders(first, data.state.groundOrders, { dispatch: true }).map(row => row.id)).toEqual([second.id, third.id])
  })
  it('已存在手工单可修改，reset清理新单与联系人', () => {
    const order = data.state.groundOrders[0]
    data.saveGroundOrder({ ...createGroundOrderDraft(order), remark: '原有单修改' }, order.id)
    expect(order.remark).toBe('原有单修改')
    data.saveGroundOrder(valid()); data.reset()
    expect(data.state.groundOrders).toHaveLength(4); expect(data.state.groundOrderSequence).toBe(0)
  })
  it('月报按完成状态变更月归集，未知调度与金额不补零，缺完成时间不猜更新时间', () => {
    const orders = [
      { createdAt:'2026-07-01', dispatchStatus:'已完成', completedAt:'2026-08-31 23:59', orderType:'' },
      { createdAt:'2026-08-01', dispatchStatus:'已完成', completedAt:'2026-09-01 00:00', orderType:'中转订单' },
      { createdAt:'2026-09-01', dispatchStatus:'已调度', updatedAt:'2026-09-08' },
    ]
    expect(groundMonthlyRows(orders)).toMatchObject([
      {month:'2026-09',transportCount:0,transferCount:1,totalCount:1,dispatchCount:null,receivable:null,payable:null,profit:null},
      {month:'2026-08',transportCount:1,transferCount:0,totalCount:1},
      {month:'2026-07',totalCount:0},
    ])
    orders[0].completedAt = ''
    expect(groundMonthlyRows(orders)[0]).toMatchObject({totalCount:null,missingCompletionTime:true})
  })
  it.each(['views/GroundDispatchView.vue', 'components/GroundOrderEditor.vue', 'components/GroundRelatedOrders.vue', 'views/GroundMonthlyView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
