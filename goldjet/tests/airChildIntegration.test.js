import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { createAirChildDraft } from '../src/domain/airChildOrders.js'
import { createBookingDraft } from '../src/domain/airOperations.js'
import { createAirSupplementDraft } from '../src/domain/airOrderSupplement.js'
import { createAirMasterDraft } from '../src/domain/airMasterData.js'
import { createPartnerDraft } from '../src/domain/partnerOperations.js'
import { PARTNER_SAMPLE_ATTACHMENT } from '../src/domain/partnerPresentation.js'

const data = usePrototypeData()
const copy = value => JSON.parse(JSON.stringify(value))
const childDraft = (changes = {}) => ({
  ...createAirChildDraft(), customer: '启航跨境贸易', owner: '周倩', goodsName: '合成演示零件',
  origin: 'PVG', destination: 'LAX', product: 'MU-GENERAL', pieces: 3, grossWeight: 12,
  volume: 0.12, sellRate: 28, foamRatio: 0.5, ...changes,
})

function createUnreferencedCustomer() {
  data.selectWorkbenchPersona('business')
  const customer = data.savePartner({
    ...createPartnerDraft('客户'), relationship: '境内机构', creditCode: 'DEMO90000000000009',
    name: '独立子单引用演示客户', shortName: '子单客户', category: '外部单位',
    address: { country: '中国', province: '上海市', city: '上海市', district: '浦东新区', detail: '合成客户地址' },
    longTerm: true, taxRate: 6, sales: '周倩', signedContract: '是', paymentDays: '30',
    attachments: [{ ...PARTNER_SAMPLE_ATTACHMENT }],
  }, { submit: true })
  data.selectWorkbenchPersona('finance')
  data.reviewPartner(customer.id, { approved: true })
  data.selectWorkbenchPersona('businessSupervisor')
  const application = data.submitPartnerCredit(customer.id, { amount: 1000, attachments: [] })
  data.selectWorkbenchPersona('finance')
  data.reviewPartnerCredit(application.id, { approved: true, amount: 1000 })
  return customer
}

beforeEach(() => data.reset())

describe('GJ-009 独立子单的共享 owner 集成', () => {
  it('航晟子单→合单→运营确认→操作完成→创建人补录保持同一主单与来源服务', () => {
    data.selectWorkbenchPersona('hangsheng')
    const first = data.saveAirChildOrder(childDraft())
    data.submitAirChildOrder(first.id)
    const second = data.saveAirChildOrder(childDraft({ pieces: 7, grossWeight: 100, volume: 0.1, sellRate: 50, foamRatio: 0 }), { submit: true })
    const parent = data.createAirConsolidatedOrder([first.id, second.id], {
      origin: 'PVG', destination: 'LAX', airline: '东方航空', product: 'MU-GENERAL', flowTo: '', bookingRequirement: '',
    })
    const sources = copy(data.state.airChildren)
    expect(parent).toMatchObject({ creator: '陈楠', orderType: '合成主订单', orderStatus: '待订舱', pieces: 10, grossWeight: 112, volume: 0.22 })
    expect(parent.services.map(row => row.type)).toEqual(['booking'])
    expect(sources.every(row => row.parentId === parent.id && row.orderStatus === '子订单完成')).toBe(true)
    expect(sources.map(row => row.serviceRecords.map(service => service.type))).toEqual([['warehouse'], ['warehouse']])

    data.selectWorkbenchPersona('operator')
    data.saveAirBooking(parent.id, createBookingDraft(data.state.airOrders.find(row => row.id === 'AIR-260908-001')))
    expect(parent).toMatchObject({ orderStatus: '待订舱', bookingStatus: '服务中', flight: 'MU9001' })
    data.selectWorkbenchPersona('handler')
    data.saveAirBooking(parent.id, createBookingDraft(parent))
    expect(parent).toMatchObject({ orderStatus: '待补录', bookingStatus: '服务已完成' })
    const booking = copy(parent.booking)
    const bookingService = copy(parent.services[0])

    data.selectWorkbenchPersona('hangsheng')
    expect(data.airChildSession.value).toMatchObject({ role: 'hangsheng', name: '陈楠' })
    expect(data.saveAirSupplement(parent.id, {
      ...createAirSupplementDraft(parent, data.state.airMaster), englishGoodsName: 'DEMO PARTS',
      shipper: 'DEMO SHIPPER', consignee: 'DEMO CONSIGNEE',
    })).toBe(parent)
    expect(parent.orderStatus).toBe('待出提单')
    expect(parent.booking).toEqual(booking)
    expect(parent.services).toContainEqual(bookingService)
    expect(parent.services.map(row => [row.type, row.status])).toEqual([
      ['booking', '服务已完成'], ['transfer', '待服务'], ['security', '待服务'],
    ])
    expect(data.state.airChildren).toEqual(sources)
    expect(data.state.airOrders.filter(row => row.id === parent.id)).toEqual([parent])
    expect(data.state.messages.map(row => [row.type, row.recipient])).toEqual([
      ['待订舱', '李明'], ['航程待补充', '王晴'], ['订单待补录', '陈楠'],
    ])
    expect(data.state.messages.at(-1).related.path).toBe(`/fulfillment/air-orders/${parent.id}/supplement`)
  })

  it.each([false, true])('仅被子单引用的客户和港口不能删除，子单移除后解除引用（提交=%s）', submit => {
    const customer = createUnreferencedCustomer()
    data.selectWorkbenchPersona('masterAdmin')
    const port = data.saveAirMaster('ports', {
      ...createAirMasterDraft('ports'), code: 'DEM', name: '子单引用演示机场', englishName: 'Child Demo Airport',
      country: 'China', countryCode: 'CN', city: 'Shanghai', cityCode: 'SHA', continent: '亚洲',
    })
    data.selectWorkbenchPersona('service')
    const child = data.saveAirChildOrder(childDraft({ customer: customer.name, origin: port.code,
      services: { booking: false, warehouse: false, pickup: false },
    }), { submit })
    expect(data.state.airOrders.some(row => row.customer === customer.name || row.origin === port.code)).toBe(false)
    expect(child.serviceRecords).toEqual([])

    data.selectWorkbenchPersona('masterAdmin')
    const beforePortDelete = JSON.stringify(data.state)
    expect(() => data.deleteAirMaster('ports', [port.id])).toThrow('子订单或分单')
    expect(JSON.stringify(data.state)).toBe(beforePortDelete)
    data.selectWorkbenchPersona('finance')
    data.setPartnerActive(customer.id, false)
    const beforeCustomerDelete = JSON.stringify(data.state)
    expect(() => data.deletePartner(customer.id)).toThrow('存在订单或结算明细')
    expect(JSON.stringify(data.state)).toBe(beforeCustomerDelete)

    data.selectWorkbenchPersona('service')
    data.deleteAirChildOrder(child.id)
    expect(data.state.airChildren.some(row => row.id === child.id && !row.deleted)).toBe(false)
    data.selectWorkbenchPersona('masterAdmin')
    expect(data.deleteAirMaster('ports', [port.id])).toBe(1)
    data.selectWorkbenchPersona('finance')
    expect(data.deletePartner(customer.id).status).toBe('已删除')
  })
})
