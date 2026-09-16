import { beforeEach, describe, expect, it } from 'vitest'
import {
  createAirDraft, createBookingDraft, getAirCredit, getBookingDecision,
  getBookingPermission, validateAirDraft, validateBookingDraft, getAirContacts,
} from '../src/domain/airOperations.js'
import { usePrototypeData } from '../src/data/usePrototypeData.js'

const data = usePrototypeData()

function validAir(overrides = {}) {
  return { ...createAirDraft(), customer: '启航跨境贸易', owner: '周倩', origin: 'PVG', destination: 'LAX', product: 'MU-GENERAL', pieces: 42, grossWeight: 186.5, volume: 1.28, sellRate: 28, departureDate: '2026-09-10', ...overrides }
}

function validBooking(order, overrides = {}) {
  return {
    ...createBookingDraft(order), airline: '东方航空', flight: 'MU9001', departureDate: '2026-09-10',
    firstDestination: 'CAN', firstLeg: 'PVG - CAN', takeoffTime: '20:00', cutoffTime: '16:00',
    airCost: 24, guidePrice: 28, waybillType: '自营', secondDestination: 'NRT',
    secondLeg: 'CAN - NRT', thirdLeg: 'NRT - LAX', routeType: '国内中转', ...overrides,
  }
}

beforeEach(() => data.reset())

describe('主订单创建：第009篇 1.3.2、1.3.3', () => {
  it('预计日期不冒充已确认日期，新增联系人仅在有效提交后同步档案', () => {
    const partner = data.state.partners.find(p => p.name === '启航跨境贸易')
    const original = JSON.stringify(partner)
    const draft = validAir({ contact:'演示联系人', phone:'000-00001111', contactEmails:['demo@example.invalid'] })
    expect(() => data.createAirOrder({...draft,pieces:0})).toThrow()
    expect(JSON.stringify(partner)).toBe(original)
    const order = data.createAirOrder(draft)
    expect(order.departureDate).toBe('')
    expect(order.expectedDepartureDate).toBe('2026-09-10')
    expect(partner.businessContacts.at(-1)).toEqual({name:'演示联系人',phone:'000-00001111',emails:['demo@example.invalid']})
  })
  it('默认勾选订舱和仓储，提货默认不勾选', () => {
    const draft = createAirDraft()
    expect(draft.services).toEqual({ booking: true, warehouse: true, pickup: false })
    expect(draft.product).toBe('')
    expect(draft.departureDate).toBe('')
    expect(draft.foamRatio).toBeUndefined()
  })

  it('主订单提交生成本地服务记录并进入待订舱，不生成其他模块记录', () => {
    const otherCounts = [data.state.groundOrders.length, data.state.warehouseOrders.length]
    const order = data.createAirOrder(validAir({ orderStatus: '已出提单', id: 'FORGED', chargeWeight: -1 }))
    expect(order.id).toBe('AIR-260908-026')
    expect(order.orderStatus).toBe('待订舱')
    expect(order.bookingStatus).toBe('待服务')
    expect(order.chargeWeight).toBe(213.5)
    expect(order.creator).toBe('周倩')
    expect(order.services.map((service) => [service.type, service.status])).toEqual([['booking', '待服务'], ['warehouse', '待服务']])
    expect([data.state.groundOrders.length, data.state.warehouseOrders.length]).toEqual(otherCounts)
    data.reset()
    expect(data.createAirOrder(validAir()).id).toBe(order.id)
  })

  it('仓储允许取消，提交前不产生服务记录', () => {
    const length = data.state.airOrders.length
    const draft = validAir({ services: { booking: true, warehouse: false, pickup: false } })
    expect(validateAirDraft(draft, data.state.partners)).toEqual({})
    expect(data.state.airOrders).toHaveLength(length)
    expect(data.createAirOrder(draft).services).toHaveLength(1)
  })

  it('限制客户类别和状态；额度负数阻止，零额度的跨篇冲突明确阻断', () => {
    expect(validateAirDraft(validAir({ customer: '东方航空' }), data.state.partners)).toHaveProperty('customer')
    expect(validateAirDraft(validAir({ customer: '旧版演示客户' }), data.state.partners)).toHaveProperty('customer')
    expect(validateAirDraft(validAir({ customer: '远洲电子商务' }), data.state.partners)).toHaveProperty('customer')
    expect(getAirCredit('云帆供应链', data.state.partners).kind).toBe('warning')
    expect(getAirCredit('华越国际商贸', data.state.partners).kind).toBe('unconfirmed')
    expect(validateAirDraft(validAir({ customer: '华越国际商贸', sellRate: 0 }), data.state.partners)).toHaveProperty('customer')
  })

  it('20% 边界不警告，授信资料缺失需确认', () => {
    const partner = { name: '客户', type: '客户', status: '有效', creditLimit: 100, availableCredit: 20 }
    expect(getAirCredit('客户', [partner]).kind).toBe('ready')
    expect(getAirCredit('客户', [{ ...partner, availableCredit: undefined }]).kind).toBe('unconfirmed')
  })

  it('校验件重体、精度、必填服务及提货字段且失败不修改任何数据', () => {
    const before = JSON.stringify(data.state.airOrders)
    const errors = validateAirDraft(validAir({ pieces: 1.5, volume: 1.286, grossWeight: -1, services: { booking: false, pickup: true }, pickup: {} }), data.state.partners)
    expect(errors).toHaveProperty('pieces')
    expect(errors).toHaveProperty('volume')
    expect(errors).toHaveProperty('grossWeight')
    expect(errors).toHaveProperty('services')
    expect(errors['pickup.time']).toBeTruthy()
    expect(() => data.createAirOrder(validAir({ product: '' }))).toThrow()
    expect(JSON.stringify(data.state.airOrders)).toBe(before)
  })

  it('非客服角色不可绕过界面创建主订单', () => {
    data.airSession.role = 'operator'
    expect(() => data.createAirOrder(validAir())).toThrow('当前角色不能创建主订单')
  })

  it('档案联系人候选保留姓名、电话与多个邮箱，草稿不修改档案', () => {
    const partner = { businessContacts: [{ name: '演示联系人', phone: '000-00000001', emails: ['one@example.com', 'two@example.com'] }] }
    const contacts = getAirContacts(partner)
    expect(contacts[0]).toEqual(partner.businessContacts[0])
    contacts[0].emails.push('draft@example.com')
    expect(partner.businessContacts[0].emails).toHaveLength(2)
    expect(getAirContacts({ contact: '旧档联系人', phone: '000-00000002' })).toEqual([{ name: '旧档联系人', phone: '000-00000002', emails: [] }])
  })

  it('补齐的联系、尺寸、仓储及提货字段由同一订单保存', () => {
    const draft = validAir({
      contact: '陈一', phone: '000-00000001', contactEmails: ['one@example.com', 'two@example.com'],
      flowTo: '航晟物流部', length: 80, width: 60.25, height: 50, expectedArrival: '2026-09-11 16:30',
      truckSellRate: 0, warehouseOperations: ['打托', '分拣'],
      services: { booking: true, warehouse: true, pickup: true },
      pickup: { ...createAirDraft().pickup, region: ['上海市', '上海市', '浦东新区'], address: '演示路 100 号', contact: '陈一', phone: '000-00000001', time: '2026-09-10 10:00', remark: '按预约时间到场' },
    })
    expect(validateAirDraft(draft, data.state.partners)).toEqual({})
    const order = data.createAirOrder(draft)
    for (const key of ['contactEmails', 'flowTo', 'length', 'width', 'height', 'expectedArrival', 'truckSellRate', 'warehouseOperations', 'pickup']) expect(order[key]).toEqual(draft[key])
  })

  it('邮箱错误与缺少提货省市区不得提交，未勾选提货不阻断', () => {
    expect(validateAirDraft(validAir({ contactEmails: ['not-an-email'] }), data.state.partners)).toHaveProperty('contactEmails.0')
    const draft = validAir({ services: { booking: true, warehouse: true, pickup: true } })
    expect(validateAirDraft(draft, data.state.partners)).toHaveProperty('pickup.region')
    expect(validateAirDraft(validAir(), data.state.partners)).not.toHaveProperty('pickup.region')
  })
})

describe('订舱权限和状态：第010篇 1.3.3', () => {
  it('客服提交 → 运营确认航班 → 操作订舱完成，原订单回显待补录', () => {
    const order = data.createAirOrder(validAir())
    expect(getBookingPermission(order, 'service').action).toBeNull()
    expect(getBookingPermission(order, 'handler').action).toBeNull()
    data.airSession.role = 'operator'
    expect(getBookingPermission(order, 'operator').action).toBe('confirm')
    data.saveAirBooking(order.id, validBooking(order))
    expect(order.orderStatus).toBe('待订舱')
    expect(order.bookingStatus).toBe('服务中')
    expect(order.flight).toBe('MU9001')
    expect(order.waybillNo).toBeTruthy()
    data.airSession.role = 'handler'
    expect(getBookingPermission(order, 'handler')).toMatchObject({ journey: false, supplement: false, action: 'complete' })
    data.saveAirBooking(order.id, createBookingDraft(order))
    expect(order.orderStatus).toBe('待补录')
    expect(order.bookingStatus).toBe('服务已完成')
    expect(order.services.find((service) => service.type === 'booking').status).toBe('服务已完成')
  })

  it('航晟客服可从待服务完成订舱', () => {
    const order = data.createAirOrder(validAir())
    data.selectWorkbenchPersona('hangsheng')
    expect(data.airSession.role).toBe('viewer')
    expect(data.bookingSession.value.role).toBe('hangsheng')
    data.saveAirBooking(order.id, validBooking(order))
    expect(order.orderStatus).toBe('待补录')
    expect(order.bookingStatus).toBe('服务已完成')
  })

  it('只读字段在 data owner 拒绝修改，失败不部分保存', () => {
    const order = data.state.airOrders.find((item) => item.bookingStatus === '服务中')
    data.airSession.role = 'handler'
    const before = JSON.stringify(order)
    expect(() => data.saveAirBooking(order.id, { ...createBookingDraft(order), airCost: 1, remark: '不可部分落盘' })).toThrow('不允许修改 airCost')
    expect(JSON.stringify(order)).toBe(before)
  })

  it('订舱后不可修改提单属性；改出港日期使服务重新进入服务中', () => {
    const order = data.state.airOrders[0]
    data.airSession.role = 'operator'
    expect(() => data.saveAirBooking(order.id, { ...createBookingDraft(order), waybillType: '非自营' })).toThrow('不允许修改 waybillType')
    data.saveAirBooking(order.id, { ...createBookingDraft(order), departureDate: '2026-09-11' })
    expect(order.orderStatus).toBe('待补录')
    expect(order.bookingStatus).toBe('服务中')
  })

  it('已出提单不可修改，调用参数不能冒充角色', () => {
    expect(getBookingPermission({ orderStatus: '已出提单', bookingStatus: '服务已完成' }, 'operator').action).toBeNull()
    const order = data.state.airOrders[0]
    expect(() => data.saveAirBooking(order.id, createBookingDraft(order), { role: 'operator' })).toThrow('演示角色已变化')
  })

  it('必填及基础数据校验；直航不擅自放宽二程目的地和三程航段', () => {
    const order = data.state.airOrders[0]
    expect(validateBookingDraft(validBooking(order))).toEqual({})
    const errors = validateBookingDraft(validBooking(order, { routeType: '直航', secondDestination: '', thirdLeg: '', airCost: 0, takeoffTime: '25:00', airline: '其他航司' }))
    expect(errors).toHaveProperty('secondDestination')
    expect(errors).toHaveProperty('thirdLeg')
    expect(errors).toHaveProperty('airCost')
    expect(errors).toHaveProperty('takeoffTime')
    expect(errors).toHaveProperty('flight')
    data.airSession.role = 'operator'
    const before = JSON.stringify(order)
    expect(() => data.saveAirBooking(order.id, { ...createBookingDraft(order), airCost: -1 })).toThrow()
    expect(JSON.stringify(order)).toBe(before)
  })

  it('订舱折扣号、Handling Information 和备注遵守字典长度约束', () => {
    const order = data.state.airOrders[0]
    expect(validateBookingDraft(validBooking(order, { discountNo: 'A'.repeat(30), handlingInfo: 'H'.repeat(256), remark: '备'.repeat(256) }))).toEqual({})
    const errors = validateBookingDraft(validBooking(order, { discountNo: 'A'.repeat(31), handlingInfo: 'H'.repeat(257), remark: '备'.repeat(257) }))
    expect(errors).toHaveProperty('discountNo')
    expect(errors).toHaveProperty('handlingInfo')
    expect(errors).toHaveProperty('remark')
  })
})

describe('亏损边界与待确认：第010篇 1.3.3 关联处理', () => {
  it('未允许亏损则成本超卖价阻止；相等可提交', () => {
    expect(getBookingDecision({ sellRate: 28, chargeWeight: 100 }, { airCost: 28, allowLoss: false }).kind).toBe('ready')
    expect(getBookingDecision({ sellRate: 28, chargeWeight: 100 }, { airCost: 30, allowLoss: false }).kind).toBe('blocked')
  })

  it('按公式包含 5,000 边界，超过时追加事业部副总经理', () => {
    expect(getBookingDecision({ sellRate: 0.3, chargeWeight: 100 }, { airCost: 50, allowLoss: true })).toMatchObject({ kind: 'approval', lossAmount: 5000 })
    expect(getBookingDecision({ sellRate: 0.3, chargeWeight: 100.5 }, { airCost: 50, allowLoss: true }).stages.map(stage => stage.role)).toEqual(['director', 'deputyGeneral'])
  })

  it('审核二次确认前不写入；确认后主单和订舱服务均待审核', () => {
    const order = data.createAirOrder(validAir())
    data.airSession.role = 'operator'
    const draft = validBooking(order, { airCost: 30, allowLoss: true })
    const before = JSON.stringify(order)
    expect(() => data.saveAirBooking(order.id, draft)).toThrow('需航线总监审核')
    expect(JSON.stringify(order)).toBe(before)
    data.saveAirBooking(order.id, draft, { confirmedApproval: true })
    expect(order.orderStatus).toBe('待审核')
    expect(order.bookingStatus).toBe('待审核')
    expect(order.services[0].status).toBe('待审核')
    expect(getBookingPermission(order, 'operator').action).toBeNull()
  })

  it('仅总监可同意；只更新明确的主单状态，不虚构服务审批后状态', () => {
    const order = data.state.airOrders.find((item) => item.orderStatus === '待审核')
    expect(() => data.approveAirBooking(order.id)).toThrow('仅航线总监')
    data.airSession.role = 'director'
    data.approveAirBooking(order.id)
    expect(order.orderStatus).toBe('待补录')
    expect(order.bookingStatus).toBe('待审核')
    expect(order.approval).toMatchObject({ status: '审核通过', serviceStatePending: true })
  })

  it('超范围亏损即使传入确认也拒绝写入', () => {
    const order = data.createAirOrder(validAir({ sellRate: 1, grossWeight: 400 }))
    data.airSession.role = 'operator'
    const before = JSON.stringify(order)
    expect(() => data.saveAirBooking(order.id, validBooking(order, { airCost: 99, allowLoss: true }), { confirmedApproval: true })).toThrow('超过 30,000')
    expect(JSON.stringify(order)).toBe(before)
  })
})
