import { describe, expect, it } from 'vitest'
import { createAirDraft } from '../src/domain/airOperations.js'
import { cloneAirSupplementValue, stringifyAirSupplementValue } from '../src/domain/airOrderSupplement.js'
import { createAirServiceEditDraft, getAirServiceEditRestriction } from '../src/domain/airServiceEditing.js'
import { createAirServiceActions } from '../src/data/airServiceActions.js'

function fixture(type = 'transfer') {
  const session = { role: 'service', name: '演示客服' }
  const service = { id: `MAIN-${type}`, type, name: type, status: '待服务', createdAt: '2026-09-08 09:00', details: {} }
  const order = { id: 'MAIN', creator: '演示客服', orderStatus: '待出提单', customer: '演示客户',
    origin: 'PVG', destination: 'LAX', pieces: 30, grossWeight: 100, volume: 0.5, goodsName: '中文货物',
    waybillNo: '781-00000011', services: [service], warehouseOperations: ['分拣'],
    supplement: { englishGoodsName: 'DEMO GOODS' },
    booking: { flight: 'DEMO01', routeType: '直航', departureDate: '2026-09-10', cutoffTime: '16:00' },
    pickup: { ...createAirDraft().pickup, region: ['上海市', '上海市', '浦东新区'], time: '2026-09-10 09:00', address: '演示地址', contact: '张三', phone: '000-00000000' },
  }
  const state = { airOrders: [order], airChildren: [], airOrderEventSequence: 0 }
  return { order, service, state, session, actions: createAirServiceActions(state, () => session) }
}

describe('GJ-009 待服务的独立修改与本地重发', () => {
  it('修改中转后保留服务身份状态，完整记录每次重发且使用本单只读信息', () => {
    const ctx = fixture(), draft = createAirServiceEditDraft(ctx.order, ctx.service)
    Object.assign(draft.transfer, { pickupPoint: '演示仓库 B', deliveryPoint: '演示货站 C', pieces: 999, waybillNo: 'FORGED', flight: 'WRONG' })
    ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, draft)
    expect(ctx.service).toMatchObject({ id: 'MAIN-transfer', status: '待服务', createdAt: '2026-09-08 09:00', resendCount: 1 })
    expect(ctx.service.details).toMatchObject({ pickupPoint: '演示仓库 B', deliveryPoint: '演示货站 C', pieces: 30, waybillNo: '781-00000011', flight: 'DEMO01', customsMode: '预报关' })
    expect(ctx.service.transmissions[0]).toMatchObject({ sender: '演示客服', kind: '重新发送', simulation: '本地重发记录，未发送外部系统', details: ctx.service.details })
    expect(ctx.order.supplement.transfer).toEqual(ctx.service.details)
    draft.transfer.pickupPoint = '演示仓库 D'
    ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, draft)
    expect(ctx.service.resendCount).toBe(2)
    expect(ctx.service.transmissions[0].details.pickupPoint).toBe('演示仓库 B')
    expect(ctx.service.transmissions[1].details.pickupPoint).toBe('演示仓库 D')
    expect(ctx.order.orderStatus).toBe('待出提单')
  })

  it('货站安检维护到货日期，品名始终取本次订单已保存补录内容', () => {
    const ctx = fixture('security'), draft = createAirServiceEditDraft(ctx.order, ctx.service)
    expect(draft.security.goodsName).toBe('DEMO GOODS')
    Object.assign(draft.security, { arrivalDate: '2026-09-11', goodsName: 'WRONG', customer: '其他客户' })
    ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, draft)
    expect(ctx.service.details).toMatchObject({ arrivalDate: '2026-09-11', goodsName: 'DEMO GOODS', customer: '演示客户' })
  })

  it('提货沿用原始服务值和省市区校验，保存同步订单服务输入', () => {
    const ctx = fixture('pickup'), draft = createAirServiceEditDraft(ctx.order, ctx.service)
    draft.pickup.address = '新提货地址'
    draft.pickup.region = []
    const before = stringifyAirSupplementValue(ctx.state)
    expect(() => ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, draft)).toThrow('省、市、区')
    expect(stringifyAirSupplementValue(ctx.state)).toBe(before)
    draft.pickup.region = ['上海市', '上海市', '浦东新区']
    ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, draft)
    expect(ctx.order.pickup.address).toBe('新提货地址')
    expect(ctx.service.details.address).toBe('新提货地址')
  })

  it('仓储修改使用同一操作候选，非法值不写入', () => {
    const ctx = fixture('warehouse'), draft = createAirServiceEditDraft(ctx.order, ctx.service)
    expect(draft.warehouseOperations).toEqual(['分拣'])
    draft.warehouseOperations = ['打托', '拆托']
    ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, draft)
    expect(ctx.service.details).toEqual({ operations: ['打托', '拆托'] })
    expect(ctx.order.warehouseOperations).toEqual(['打托', '拆托'])
    const before = stringifyAirSupplementValue(ctx.state)
    draft.warehouseOperations = ['未定义']
    expect(() => ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, draft)).toThrow('已定义')
    expect(stringifyAirSupplementValue(ctx.state)).toBe(before)
  })

  it('清关派送需要实际合规材料，重发记录保持可读取字节', async () => {
    const ctx = fixture('clearance'), draft = createAirServiceEditDraft(ctx.order, ctx.service)
    expect(() => ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, draft)).toThrow('上传')
    draft.clearance.attachments = [new File(['DEMO CLEARANCE'], 'material.pdf')]
    draft.clearance.deliveryAddress = '演示派送地址'
    ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, draft)
    expect(await ctx.service.transmissions[0].details.attachments[0].text()).toBe('DEMO CLEARANCE')
    expect(ctx.order.supplement.clearance.deliveryAddress).toBe('演示派送地址')
  })

  it.each(['服务中', '服务已完成', '服务已取消', '异常结束'])('%s不能通过动作绕过界面修改', status => {
    const ctx = fixture(), draft = createAirServiceEditDraft(ctx.order, ctx.service)
    ctx.service.status = status
    const before = stringifyAirSupplementValue(ctx.state)
    expect(() => ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, draft)).toThrow('仅待服务')
    expect(stringifyAirSupplementValue(ctx.state)).toBe(before)
  })

  it.each(['booking', 'customs', 'preallocation'])('%s保持专属流程或待确认边界', type => {
    const ctx = fixture(type), before = stringifyAirSupplementValue(ctx.state)
    expect(() => ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, {})).toThrow()
    expect(stringifyAirSupplementValue(ctx.state)).toBe(before)
  })

  it('分单服务使用分单件重体和主单航班，维护服务不解锁来源分单信息', () => {
    const ctx = fixture('security')
    ctx.order.orderType = '合成主订单'
    ctx.order.services = []
    const child = { id: 'CHILD', parentId: ctx.order.id, creator: ctx.session.name, orderStatus: '子订单完成',
      pieces: 12, grossWeight: 40, volume: 0.2, englishGoodsName: 'CHILD GOODS', housebillNo: 'DEMO00000001', serviceRecords: [ctx.service] }
    ctx.state.airChildren.push(child)
    const draft = createAirServiceEditDraft(ctx.order, ctx.service, child)
    Object.assign(draft.security, { arrivalDate: '2026-09-11', pieces: 999 })
    ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, draft, child.id)
    expect(ctx.service.details).toMatchObject({ pieces: 12, grossWeight: 40, volume: 0.2, goodsName: 'CHILD GOODS', housebillNo: 'DEMO00000001', flight: 'DEMO01' })
    expect(child).toMatchObject({ orderStatus: '子订单完成', pieces: 12, englishGoodsName: 'CHILD GOODS' })
  })

  it('分单必须归属当前主单；本人角色、主管和合成航晟权限分开', () => {
    const ctx = fixture(), child = { id: 'CHILD', parentId: 'OTHER', creator: ctx.session.name, serviceRecords: [ctx.service] }
    ctx.state.airChildren.push(child)
    expect(() => ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, {}, child.id)).toThrow('不属于')
    child.parentId = ctx.order.id
    child.creator = '其他客服'
    expect(getAirServiceEditRestriction(ctx.order, ctx.service, ctx.session, child)).toContain('本人')
    ctx.session.role = 'supervisor'
    expect(getAirServiceEditRestriction(ctx.order, ctx.service, ctx.session, child)).toBe('')
    ctx.session.role = 'hangsheng'
    child.creator = ctx.session.name
    expect(getAirServiceEditRestriction(ctx.order, ctx.service, ctx.session, child)).toBeTruthy()
    ctx.order.orderType = '合成主订单'
    expect(getAirServiceEditRestriction(ctx.order, ctx.service, ctx.session, child)).toBe('')
  })

  it('会话更换和序号用尽时均原子拒绝，不留下重发记录', () => {
    const ctx = fixture(), draft = createAirServiceEditDraft(ctx.order, ctx.service)
    ctx.session.name = '其他客服'
    const before = cloneAirSupplementValue(ctx.state)
    expect(() => ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, draft)).toThrow('本人')
    expect(ctx.state).toEqual(before)
    ctx.session.name = ctx.order.creator
    ctx.state.airOrderEventSequence = Number.MAX_SAFE_INTEGER
    const exhausted = cloneAirSupplementValue(ctx.state)
    expect(() => ctx.actions.saveAirServiceDetails(ctx.order.id, ctx.service.id, draft)).toThrow('序号已用尽')
    expect(ctx.state).toEqual(exhausted)
  })
})
