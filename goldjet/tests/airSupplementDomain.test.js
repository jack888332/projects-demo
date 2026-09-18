import { describe, expect, it } from 'vitest'
import {
  AIR_CLEARANCE_ATTACHMENT_MAX_SIZE, cloneAirSupplementValue, createAirSupplementDraft, createHouseBillDraft,
  getAirHouseBillTotals, normalizeAirSupplementDraft, normalizeHouseBillDraft, stringifyAirSupplementValue,
  validateAirClearanceAttachments, validateAirSupplement, validateHouseBillDraft,
} from '../src/domain/airOrderSupplement.js'
import { createAirOrderSupplementActions } from '../src/data/airOrderSupplementActions.js'

const catalog = { ports: [{ code: 'PVG' }, { code: 'LAX' }], airlines: [{ name: '演示航司', iataCode: '123', issuingCarrier: 'DEMO AIR' }] }
const makeOrder = () => ({
  id: 'MAIN-1', orderNo: 'DEMO-MAIN', creator: '演示客服', owner: '业务员', customer: '演示客户',
  origin: 'PVG', destination: 'LAX', orderStatus: '待补录', bookingStatus: '服务已完成',
  pieces: 3, grossWeight: 4.5, volume: 0.3, waybillNo: '781-00000011',
  booking: { airline: '演示航司', flight: 'DEMO01', departureDate: '2026-09-10', routeType: '直航' },
  services: [{ type: 'booking', status: '服务已完成', id: 'BOOKING-1' }],
})
const billFields = { englishGoodsName: 'DEMO GOODS', shipper: 'DEMO SHIPPER', consignee: 'DEMO CONSIGNEE' }
const supplement = order => ({ ...createAirSupplementDraft(order, catalog), ...billFields })
const house = (order, values = {}) => ({ ...createHouseBillDraft(order), ...billFields, pieces: 3, grossWeight: 4.5, volume: 0.3,
  services: { pickup: false, warehouse: false, customs: false, clearance: false }, ...values })
const file = (name = 'clearance.pdf', contents = 'DEMO MATERIAL') => new File([contents], name, { type: 'application/pdf', lastModified: 100 })
function owner() {
  const order = makeOrder()
  const state = { airOrders: [order], airChildren: [], airChildSequence: 0, airOrderEventSequence: 0, airMaster: catalog }
  const session = { role: 'service', name: '演示客服' }
  return { order, state, session, actions: createAirOrderSupplementActions(state, () => session) }
}

describe('GJ-009 补录、分单业务边界', () => {
  it('清关指令的提单货量不借用预计货量，新分单也不继承主提单总量', () => {
    const order = makeOrder()
    expect(createAirSupplementDraft(order).clearance.pieces).toBe('')
    order.waybill = { pieces: 8, grossWeight: 20, volume: 0.5 }
    expect(createAirSupplementDraft(order).clearance).toMatchObject(order.waybill)
    expect(createHouseBillDraft(order).clearance.pieces).toBe('')
    expect(normalizeHouseBillDraft(house(order), order).clearance.pieces).toBe('')
    const child = { ...order, isChild: true, housebillNo: 'HAWB001', waybill: { pieces: 2, grossWeight: 5, volume: 0.1 } }
    expect(normalizeHouseBillDraft(house(child), child).clearance).toMatchObject(child.waybill)
  })
  it('新建与读取空数值分单保持未填，必填毛件体不靠控件最小值变为有效', () => {
    const keys = ['pieces', 'grossWeight', 'volume', 'rate']
    const draft = createHouseBillDraft(makeOrder())
    for (const key of keys) expect(draft[key]).toBeUndefined()
    const errors = validateHouseBillDraft(draft, catalog)
    for (const key of ['pieces', 'grossWeight', 'volume']) expect(errors[key]).toBeTruthy()
    expect(errors.rate).toBeUndefined()
    for (const emptyValue of ['', null, undefined, '  ']) {
      const values = Object.fromEntries(keys.map(key => [key, emptyValue]))
      const existing = createHouseBillDraft({ isChild: true, ...values })
      const normalized = normalizeHouseBillDraft({ ...house(makeOrder()), ...values }, makeOrder())
      for (const key of keys) {
        expect(existing[key]).toBeUndefined()
        expect(normalized[key]).toBeUndefined()
      }
    }
    const zero = normalizeHouseBillDraft({ ...house(makeOrder()), pieces: 0, grossWeight: 0, volume: 0, rate: 0 }, makeOrder())
    for (const key of keys) {
      expect(zero[key]).toBe(0)
      expect(validateHouseBillDraft(zero, catalog)[key]).toBeTruthy()
    }
  })

  it('服务只读字段使用本次品名和父订单资料，忽略伪造输入', () => {
    const order = makeOrder(), payload = supplement(order)
    payload.security = { ...payload.security, goodsName: 'FORGED', waybillNo: 'WRONG' }
    const draft = normalizeAirSupplementDraft(payload, order, catalog)
    expect(draft.security).toMatchObject({ goodsName: 'DEMO GOODS', waybillNo: order.waybillNo, customsMode: '预报关' })
    expect(draft.iataCode).toBe('123')
    const child = normalizeHouseBillDraft(house(order, { housebillNo: 'DEMO00000001' }), order)
    expect(child.security).toMatchObject({ housebillNo: 'DEMO00000001', goodsName: 'DEMO GOODS', flight: 'DEMO01' })
  })

  it('类型切换仅形成适用服务的提交投影，不改用户原草稿', () => {
    const order = makeOrder(), payload = supplement(order)
    Object.assign(payload, { orderType: '主单' })
    Object.assign(payload.groundServices, { customs: true, clearance: true })
    const draft = normalizeAirSupplementDraft(payload, order, catalog)
    expect(draft.groundServices).toMatchObject({ customs: false, clearance: false, security: true })
    expect(payload.groundServices).toMatchObject({ customs: true, clearance: true })
  })

  it('未知杂费和付费方式不因运费条款包含到付就被接受', () => {
    const draft = house(makeOrder(), { freightTerms: 'FREIGHT COLLECT', otherCharges: 'FREIGHT COLLECT', paymentMethod: 'CC' })
    expect(validateHouseBillDraft(draft, catalog)).toMatchObject({ otherCharges: expect.any(String), paymentMethod: expect.any(String) })
    expect(validateHouseBillDraft(draft, catalog).freightTerms).toBeUndefined()
  })

  it('主分单准确比较全部预计毛件体，不以浮点和或件数相同放行', () => {
    const order = makeOrder(), draft = { ...supplement(order), orderType: '主单' }
    const children = [house(order, { id: 'C1', orderStatus: '子订单暂存', pieces: 1, grossWeight: 1.1, volume: 0.1 }),
      house(order, { id: 'C2', orderStatus: '子订单暂存', pieces: 2, grossWeight: 3.4, volume: 0.2 })]
    expect(getAirHouseBillTotals(children)).toEqual({ pieces: 3, grossWeight: 4.5, volume: 0.3 })
    expect(validateAirSupplement(draft, order, children, catalog)).toEqual({})
    children[1].grossWeight = 3.5
    expect(validateAirSupplement(draft, order, children, catalog)['children.grossWeight']).toBeTruthy()
    children[1].warehouseVolume = 0.2
    expect(validateAirSupplement(draft, order, children, catalog).children).toContain('实测数据')
  })

  it('预配发送锁定类型；明确取消原服务后可以再切换', () => {
    const order = { ...makeOrder(), preallocationSentAt: '2026-09-08 12:00', services: [{ type: 'preallocation', status: '服务中' }] }
    const draft = { ...supplement(order), orderType: '主单' }
    expect(validateAirSupplement(draft, order).orderType).toBeTruthy()
    order.services[0].status = '服务已取消'
    expect(validateAirSupplement(draft, order).orderType).toBeUndefined()
  })

  it('关务可暂存选择；材料发送条件未确认时不能提交服务', () => {
    const ctx = owner(), draft = house(ctx.order)
    draft.services.customs = true
    const child = ctx.actions.saveAirHouseBill(ctx.order.id, '', draft)
    expect(child.serviceRecords).toEqual([])
    const before = stringifyAirSupplementValue(ctx.state)
    expect(() => ctx.actions.saveAirSupplement(ctx.order.id, { ...supplement(ctx.order), orderType: '主单' })).toThrow('发送条件待确认')
    expect(stringifyAirSupplementValue(ctx.state)).toBe(before)
    expect(validateAirSupplement({ ...supplement(ctx.order), groundServices: { customs: true } }, ctx.order, [], catalog)['customs.attachments']).toContain('待确认')
  })

  it('选择提货须提供完整省市区和已有主订单提货约束', () => {
    const draft = house(makeOrder())
    draft.services.pickup = true
    expect(validateHouseBillDraft(draft, catalog)['pickup.region']).toBeTruthy()
    Object.assign(draft.pickup, { region: ['上海市', '上海市', '浦东新区'], address: '演示地址', time: '2026-09-10 10:00', contact: '张三', phone: '000-00000000' })
    expect(validateHouseBillDraft(draft, catalog)).toEqual({})
  })
})

describe('GJ-009 清关派送材料与原子提交', () => {
  it('格式和大小边界来自013，缺少材料仅阻止发送不阻止分单暂存', () => {
    expect(validateAirClearanceAttachments([])).toBeTruthy()
    expect(validateAirClearanceAttachments([], { required: false })).toBe('')
    expect(validateAirClearanceAttachments([file('MATERIAL.PDF')])).toBe('')
    expect(validateAirClearanceAttachments([file('material.exe')])).toContain('仅支持')
    const limit = new File([new Uint8Array(AIR_CLEARANCE_ATTACHMENT_MAX_SIZE)], 'limit.zip')
    expect(validateAirClearanceAttachments([limit])).toBe('')
    const over = new File([limit, 'x'], 'over.zip')
    expect(validateAirClearanceAttachments([over])).toContain('20 MB')
    const draft = house(makeOrder())
    draft.services.clearance = true
    expect(validateHouseBillDraft(draft, catalog)).toEqual({})
    expect(validateHouseBillDraft(draft, catalog, { submitting: true })['clearance.attachments']).toBeTruthy()
  })

  it('元数据不能冒充实际材料，重复材料须先解决', () => {
    expect(validateAirClearanceAttachments([{ name: 'missing.pdf', size: 5 }])).toContain('实际')
    const attachment = file()
    expect(validateAirClearanceAttachments([attachment, attachment])).toContain('重复')
  })

  it('草稿克隆保留文件字节，新选同元数据文件仍是未保存修改', async () => {
    const original = { attachments: [file()] }, cloned = cloneAirSupplementValue(original)
    expect(cloned).not.toBe(original)
    expect(cloned.attachments).not.toBe(original.attachments)
    expect(await cloned.attachments[0].text()).toBe('DEMO MATERIAL')
    expect(stringifyAirSupplementValue(cloned)).toBe(stringifyAirSupplementValue(original))
    cloned.attachments[0] = file()
    expect(stringifyAirSupplementValue(cloned)).not.toBe(stringifyAirSupplementValue(original))
  })

  it('主单补录生成本地清关服务并保存同一附件，绝不创建预配服务', async () => {
    const ctx = owner(), draft = supplement(ctx.order), attachment = file()
    draft.groundServices.clearance = true
    draft.clearance.attachments = [attachment]
    ctx.actions.saveAirSupplement(ctx.order.id, draft)
    expect(ctx.order.orderStatus).toBe('待出提单')
    const service = ctx.order.services.find(row => row.type === 'clearance')
    expect(service).toMatchObject({ status: '待服务', simulation: '本地服务记录，未发送外部系统' })
    expect(service.details.attachments[0]).toBe(attachment)
    expect(await service.details.attachments[0].text()).toBe('DEMO MATERIAL')
    expect(ctx.order.services.some(row => row.type === 'preallocation')).toBe(false)
    expect(() => ctx.actions.saveAirSupplement(ctx.order.id, draft)).toThrow('待补录')
    expect(ctx.order.services.filter(row => row.type === 'clearance')).toHaveLength(1)
  })

  it('分单暂存不发指令；主单提交后一次完成分单并引用最新父航班', () => {
    const ctx = owner(), draft = house(ctx.order)
    draft.services.clearance = true
    draft.clearance.attachments = [file()]
    const child = ctx.actions.saveAirHouseBill(ctx.order.id, '', draft)
    expect(child).toMatchObject({ orderStatus: '子订单暂存', housebillNo: 'DEMO00000001', identifierSource: '合成演示编号', serviceRecords: [] })
    ctx.order.booking.departureDate = '2026-09-11'
    ctx.actions.saveAirSupplement(ctx.order.id, { ...supplement(ctx.order), orderType: '主单' })
    expect(child.orderStatus).toBe('子订单完成')
    expect(child.serviceRecords).toHaveLength(1)
    expect(child.serviceRecords[0].details).toMatchObject({ departureDate: '2026-09-11', waybillNo: '781-00000011' })
  })

  it('已完成来源子订单保留原字段和服务，不被补录套用附属分单必填', () => {
    const ctx = owner()
    ctx.order.orderType = '合成主订单'
    const child = { id: 'STANDALONE-1', parentId: ctx.order.id, sourceKind: 'standalone', orderStatus: '子订单完成',
      pieces: 3, grossWeight: 4.5, volume: 0.3, goodsName: '中文品名', serviceRecords: [{ id: 'ORIGINAL', type: 'warehouse', status: '服务中' }] }
    ctx.state.airChildren.push(child)
    const before = stringifyAirSupplementValue(child)
    ctx.actions.saveAirSupplement(ctx.order.id, supplement(ctx.order))
    expect(ctx.order.orderStatus).toBe('待出提单')
    expect(stringifyAirSupplementValue(child)).toBe(before)
  })

  it('失效事件序号拒绝提交且不留下半成状态', () => {
    const ctx = owner()
    ctx.state.airOrderEventSequence = Number.MAX_SAFE_INTEGER
    const before = stringifyAirSupplementValue(ctx.state)
    expect(() => ctx.actions.saveAirSupplement(ctx.order.id, supplement(ctx.order))).toThrow('序号已用尽')
    expect(stringifyAirSupplementValue(ctx.state)).toBe(before)
  })

  it('不能借补录覆盖已经生成的服务内容', () => {
    const ctx = owner(), draft = normalizeAirSupplementDraft(supplement(ctx.order), ctx.order, catalog)
    ctx.order.services.push({ id: 'TRANSFER-OLD', type: 'transfer', status: '待服务', details: cloneAirSupplementValue(draft.transfer) })
    draft.transfer.pickupPoint = '新的提货点'
    const before = stringifyAirSupplementValue(ctx.state)
    expect(() => ctx.actions.saveAirSupplement(ctx.order.id, draft)).toThrow('独立服务修改')
    expect(stringifyAirSupplementValue(ctx.state)).toBe(before)
  })

  it('分单号冲突失败不会消费序号；演示编号避开现有标识', () => {
    const ctx = owner()
    const first = ctx.actions.saveAirHouseBill(ctx.order.id, '', house(ctx.order, { housebillNo: 'DEMO00000002' }))
    const before = stringifyAirSupplementValue(ctx.state)
    expect(() => ctx.actions.saveAirHouseBill(ctx.order.id, '', house(ctx.order, { housebillNo: 'demo00000002' }))).toThrow('已存在')
    expect(stringifyAirSupplementValue(ctx.state)).toBe(before)
    const second = ctx.actions.saveAirHouseBill(ctx.order.id, '', house(ctx.order))
    expect(second.housebillNo).toBe('DEMO00000003')
    expect(second.id).not.toBe(first.id)
  })

  it.each([{ role: 'service', name: '其他客服' }, { role: 'operator', name: '演示客服' }])('写入口再次校验权限：%j', session => {
    const ctx = owner()
    Object.assign(ctx.session, session)
    const before = stringifyAirSupplementValue(ctx.state)
    expect(() => ctx.actions.saveAirHouseBill(ctx.order.id, '', house(ctx.order))).toThrow()
    expect(() => ctx.actions.saveAirSupplement(ctx.order.id, supplement(ctx.order))).toThrow()
    expect(() => ctx.actions.saveAirOrderCode(ctx.order.id, 'EAW')).toThrow()
    expect(stringifyAirSupplementValue(ctx.state)).toBe(before)
  })

  it('移单保留字段和服务；批量引入失败不部分关联，取消暂存才移除', () => {
    const ctx = owner(), child = ctx.actions.saveAirHouseBill(ctx.order.id, '', house(ctx.order))
    const beforeMove = { ...child, parentId: '' }
    ctx.actions.moveAirHouseBill(ctx.order.id, child.id)
    expect(child).toEqual(beforeMove)
    const other = { ...cloneAirSupplementValue(child), id: 'OTHER', customer: '其他客户' }
    ctx.state.airChildren.push(other)
    const before = stringifyAirSupplementValue(ctx.state)
    expect(() => ctx.actions.importAirHouseBills(ctx.order.id, [child.id, other.id])).toThrow('同一客户')
    expect(stringifyAirSupplementValue(ctx.state)).toBe(before)
    ctx.actions.importAirHouseBills(ctx.order.id, [child.id])
    expect(child.parentId).toBe(ctx.order.id)
    ctx.actions.cancelAirHouseBill(ctx.order.id, child.id)
    expect(ctx.state.airChildren.some(row => row.id === child.id)).toBe(false)
  })
})
