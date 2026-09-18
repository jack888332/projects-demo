import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { createPartnerActions } from '../src/data/partnerActions.js'
import { createPartnerDraft } from '../src/domain/partnerOperations.js'
import { PARTNER_SAMPLE_ATTACHMENT } from '../src/domain/partnerPresentation.js'
import { createAirDraft, getAirCredit } from '../src/domain/airOperations.js'

const data = usePrototypeData()
const clone = value => JSON.parse(JSON.stringify(value))
const validPartner = (changes = {}) => ({
  ...createPartnerDraft('客户'), relationship: '境内机构', creditCode: 'DEMO90000000000001',
  name: '逐篇联动演示客户', shortName: '联动客户', category: '外部单位',
  address: { country: '中国', province: '上海市', city: '上海市', district: '浦东新区', detail: '合成客户地址' },
  longTerm: true, businessExpiry: '', taxRate: 6, sales: '周倩', signedContract: '是', paymentDays: '30',
  attachments: [{ ...PARTNER_SAMPLE_ATTACHMENT }], ...changes,
})
const validAir = customer => ({
  ...createAirDraft(), customer, owner: '周倩', origin: 'PVG', destination: 'LAX', product: 'MU-GENERAL',
  pieces: 12, grossWeight: 80, volume: 0.5, sellRate: 28, departureDate: '2026-09-10',
})
function createActivePartner() {
  data.selectWorkbenchPersona('business')
  const partner = data.savePartner(validPartner(), { submit: true })
  data.selectWorkbenchPersona('finance')
  data.reviewPartner(partner.id, { approved: true, remark: '合成资料审核通过' })
  return partner
}
function approveCredit(partner, amount = 1000) {
  data.selectWorkbenchPersona('businessSupervisor')
  const application = data.submitPartnerCredit(partner.id, { amount, attachments: [] })
  data.selectWorkbenchPersona('finance')
  data.reviewPartnerCredit(application.id, { approved: true, amount, remark: '合成授信批复' })
  return application
}

beforeEach(() => data.reset())

describe('GJ-003 owner：档案—审批—授信—空运下单', () => {
  it('已被客户开票资料引用的档案不能删除', () => {
    data.selectWorkbenchPersona('business')
    const partner = data.savePartner(validPartner())
    data.state.financeBasics.invoiceProfiles.push({ id: 'INV-PROFILE-TEST', partnerId: partner.id, status: '已生效' })
    expect(() => data.deletePartner(partner.id)).toThrow('开票资料引用')
    expect(partner.status).toBe('新建')
  })
  it('从业务保存、提交到财务通过与额度批复，空运消费同一客户结果', () => {
    data.selectWorkbenchPersona('business')
    const payload = validPartner({ status: '已生效', creditLimit: 999999, availableCredit: 999999, code: 'FORGED' })
    const partner = data.savePartner(payload)
    expect(partner.code).toBe('C00041')
    expect(partner.status).toBe('新建')
    expect(partner.creditLimit).toBe(0)
    expect(partner.availableCredit).toBe(0)
    payload.name = '外部草稿改名'
    expect(partner.name).toBe('逐篇联动演示客户')
    data.submitPartner(partner.id)
    expect(partner.status).toBe('已提交')
    expect(partner.approvals.at(-1)).toMatchObject({ status: '已提交', creator: '周倩' })
    expect(data.state.messages.at(-1)).toMatchObject({ recipientRole: 'finance', status: '本地模拟' })
    expect(data.state.messages.at(-1).related.query.partner).toBe(partner.id)
    data.selectWorkbenchPersona('finance')
    data.reviewPartner(partner.id, { approved: true })
    expect(partner.status).toBe('已生效')
    expect(partner.approvals.at(-1).status).toBe('审批通过')
    expect(getAirCredit(partner.name, data.state.partners).kind).toBe('unconfirmed')
    data.selectWorkbenchPersona('businessSupervisor')
    const application = data.submitPartnerCredit(partner.id, { amount: 10000, attachments: [] })
    expect(application.status).toBe('已提交')
    expect(partner.creditLimit).toBe(0)
    data.selectWorkbenchPersona('finance')
    data.reviewPartnerCredit(application.id, { approved: true, amount: 8000, remark: '批复少于申请额' })
    expect(application).toMatchObject({ status: '已生效', amount: 10000, approvedAmount: 8000 })
    expect(partner).toMatchObject({ creditLimit: 8000, availableCredit: 8000 })
    data.selectWorkbenchPersona('service')
    const order = data.createAirOrder(validAir(partner.name))
    expect(order.customer).toBe(partner.name)
    expect(order.orderStatus).toBe('待订舱')
    expect(data.state.airOrders[0].id).toBe(order.id)
  })

  it('档案失效立即排除下单资格；重新启用恢复同一档案', () => {
    const partner = createActivePartner()
    approveCredit(partner)
    data.setPartnerActive(partner.id, false)
    expect(partner.status).toBe('已失效')
    expect(getAirCredit(partner.name, data.state.partners).kind).toBe('blocked')
    data.selectWorkbenchPersona('service')
    const count = data.state.airOrders.length
    expect(() => data.createAirOrder(validAir(partner.name))).toThrow()
    expect(data.state.airOrders).toHaveLength(count)
    data.selectWorkbenchPersona('finance')
    data.setPartnerActive(partner.id, true)
    expect(getAirCredit(partner.name, data.state.partners).kind).toBe('ready')
  })

  it('订单引用阻止删除，即使财务已使档案失效', () => {
    const partner = createActivePartner()
    approveCredit(partner)
    data.selectWorkbenchPersona('service')
    data.createAirOrder(validAir(partner.name))
    data.selectWorkbenchPersona('finance')
    data.setPartnerActive(partner.id, false)
    const before = JSON.stringify(data.state)
    expect(() => data.deletePartner(partner.id)).toThrow('存在订单或结算明细')
    expect(JSON.stringify(data.state)).toBe(before)
  })

  it('结算引用单独阻止删除，无业务的新建档案可删除', () => {
    data.selectWorkbenchPersona('business')
    const supplier = data.savePartner(validPartner({ type: '供应商', name: '仅有结算行演示供应商' }), { submit: true })
    data.selectWorkbenchPersona('finance')
    data.reviewPartner(supplier.id, { approved: true })
    data.state.costs.push({ id: 'COST-PARTNER-TEST', settlementParty: supplier.name })
    data.setPartnerActive(supplier.id, false)
    expect(() => data.deletePartner(supplier.id)).toThrow('存在订单或结算明细')
    data.selectWorkbenchPersona('business')
    const partner = data.savePartner(validPartner())
    data.deletePartner(partner.id)
    expect(partner.status).toBe('已删除')
    expect(() => data.submitPartner(partner.id)).toThrow('合作方不存在')
  })
  it('打板订单及报价保护其引用客户，拒绝删除不产生副作用', () => {
    const partner = createActivePartner()
    data.setPartnerActive(partner.id, false)
    data.state.stationOrders.push({id:'STATION-REF',partnerId:partner.id})
    const before = JSON.stringify(data.state)
    expect(() => data.deletePartner(partner.id)).toThrow('存在打板订单')
    expect(JSON.stringify(data.state)).toBe(before)
    data.state.stationOrders.pop()
    data.state.stationQuotes.push({id:'QUOTE-REF',partnerId:partner.id})
    expect(() => data.deletePartner(partner.id)).toThrow('打板报价引用')
    expect(partner.status).toBe('已失效')
  })
})

describe('GJ-003 owner：角色、原子校验与拒绝路径', () => {
  it('未经授权的角色不能保存、提交、审批、授信、启停或删除', () => {
    const partner = createActivePartner()
    data.selectWorkbenchPersona('businessSupervisor')
    const application = data.submitPartnerCredit(partner.id, { amount: 100 })
    const unknownActions = createPartnerActions(data.state, () => ({ role: 'unknown', name: '未授权演示角色', department: '华东业务部' }))
    const before = JSON.stringify(data.state)
    for (const action of [
      () => unknownActions.savePartner(validPartner()),
      () => unknownActions.savePartner(clone(partner)),
      () => unknownActions.submitPartner(partner.id),
      () => unknownActions.reviewPartner(partner.id, { approved: true }),
      () => unknownActions.submitPartnerCredit(partner.id, { amount: 100 }),
      () => unknownActions.reviewPartnerCredit(application.id, { approved: true, amount: 100 }),
      () => unknownActions.setPartnerActive(partner.id, false),
      () => unknownActions.deletePartner(partner.id),
    ]) expect(action).toThrow()
    expect(JSON.stringify(data.state)).toBe(before)
  })

  it('重复或缺少必填的保存均不增编号、消息、记录或改变源对象', () => {
    data.selectWorkbenchPersona('business')
    const partner = data.savePartner(validPartner())
    const before = JSON.stringify(data.state)
    const duplicate = validPartner()
    expect(() => data.savePartner(duplicate, { submit: true })).toThrow()
    expect(() => data.savePartner(validPartner({ name: '', creditCode: 'DEMO90000000000002' }), { submit: true })).toThrow()
    expect(() => data.savePartner({ ...clone(partner), sales: '改写只读销售' })).toThrow()
    expect(JSON.stringify(data.state)).toBe(before)
    expect(duplicate).toEqual(validPartner())
  })

  it('已提交不能编辑；有冲突的档案拒绝不制造新状态或消息', () => {
    data.selectWorkbenchPersona('business')
    const partner = data.savePartner(validPartner(), { submit: true })
    const before = JSON.stringify(data.state)
    expect(() => data.savePartner(clone(partner))).toThrow()
    expect(JSON.stringify(data.state)).toBe(before)
    data.selectWorkbenchPersona('finance')
    const reviewBefore = JSON.stringify(data.state)
    expect(() => data.reviewPartner(partner.id, { approved: false })).toThrow('两种口径')
    expect(JSON.stringify(data.state)).toBe(reviewBefore)
  })

  it('客户新增联系人可保存，既有联系人改写局部阻断且不丢失原值', () => {
    data.selectWorkbenchPersona('business')
    const partner = data.savePartner(validPartner({ contacts: [{ type: '操作联系人', name: '甲', phone: '00000000001', mobile: '00000000001', email: 'a@example.invalid' }] }))
    const edited = clone(partner)
    edited.contacts[0].name = '不允许改写'
    const before = JSON.stringify(data.state)
    expect(() => data.savePartner(edited)).toThrow()
    expect(JSON.stringify(data.state)).toBe(before)
    const appended = clone(partner)
    appended.contacts.push({ type: '财务联系人', name: '乙', phone: '00000000002', mobile: '00000000002', email: 'b@example.invalid' })
    data.savePartner(appended)
    expect(partner.contacts).toHaveLength(2)
    expect(new Set(partner.contacts.map(row => row.id)).size).toBe(2)
  })
})

describe('GJ-003 owner：额度申请为权威来源', () => {
  it('同一客户在其他部门建档生效后，立即展示已有的跨部门授信总额', () => {
    const first = data.state.partners.find(row => row.name === '启航跨境贸易')
    const otherDepartment = createPartnerActions(data.state, () => ({ role: 'business', name: '异部门演示业务', department: '华南业务部' }))
    const second = otherDepartment.savePartner(validPartner({ name: first.name, creditCode: first.creditCode }), { submit: true })
    data.selectWorkbenchPersona('finance')
    data.reviewPartner(second.id, { approved: true })
    expect(second.creditLimit).toBe(100000)
    expect(second.availableCredit).toBe(100000)
  })

  it('批复按申请记录重算总额，不读取被改坏的投影额度', () => {
    const partner = createActivePartner()
    approveCredit(partner, 100)
    partner.creditLimit = 999999
    partner.availableCredit = 999999
    data.selectWorkbenchPersona('businessSupervisor')
    const before = JSON.stringify(data.state)
    expect(() => data.submitPartnerCredit(partner.id, { amount: -100.01 })).toThrow()
    expect(JSON.stringify(data.state)).toBe(before)
    const application = data.submitPartnerCredit(partner.id, { amount: 50 })
    data.selectWorkbenchPersona('finance')
    data.reviewPartnerCredit(application.id, { approved: true, amount: 50 })
    expect(partner.creditLimit).toBe(150)
    expect(partner.availableCredit).toBe(150)
    expect(data.state.creditApplications.filter(row => row.partnerId === partner.id && row.status === '已生效').reduce((sum, row) => sum + row.approvedAmount, 0)).toBe(150)
  })

  it('批准扣减到零；低于总额度下限拒绝且不改变待审批申请', () => {
    const partner = createActivePartner()
    approveCredit(partner, 100)
    data.selectWorkbenchPersona('businessSupervisor')
    const application = data.submitPartnerCredit(partner.id, { amount: -100 })
    data.selectWorkbenchPersona('finance')
    const before = JSON.stringify(data.state)
    expect(() => data.reviewPartnerCredit(application.id, { approved: true, amount: -100.01 })).toThrow()
    expect(JSON.stringify(data.state)).toBe(before)
    data.reviewPartnerCredit(application.id, { approved: true, amount: -100 })
    expect(partner.creditLimit).toBe(0)
    expect(partner.availableCredit).toBe(0)
    expect(getAirCredit(partner.name, data.state.partners).kind).toBe('unconfirmed')
    const approvedBefore = JSON.stringify(data.state)
    expect(() => data.reviewPartnerCredit(application.id, { approved: true, amount: 1 })).toThrow()
    expect(JSON.stringify(data.state)).toBe(approvedBefore)
  })

  it('合并相同客户标识的跨部门已生效申请，并保留占用额度', () => {
    const first = data.state.partners.find(row => row.name === '启航跨境贸易')
    const otherDepartment = createPartnerActions(data.state, () => ({ role: 'business', name: '异部门演示业务', department: '华南业务部' }))
    const second = otherDepartment.savePartner(validPartner({ name: first.name, creditCode: first.creditCode }), { submit: true })
    data.selectWorkbenchPersona('finance')
    data.reviewPartner(second.id, { approved: true })
    data.selectWorkbenchPersona('businessSupervisor')
    const application = data.submitPartnerCredit(second.id, { amount: 250 })
    data.selectWorkbenchPersona('finance')
    data.reviewPartnerCredit(application.id, { approved: true, amount: 250 })
    expect(first.creditLimit).toBe(100250)
    expect(second.creditLimit).toBe(100250)
    expect(first.availableCredit).toBe(76250)
    expect(second.availableCredit).toBe(100250)
  })

  it('额度拒绝不增加授信，并保留申请与审批结果', () => {
    const partner = createActivePartner()
    data.selectWorkbenchPersona('businessSupervisor')
    const application = data.submitPartnerCredit(partner.id, { amount: 500 })
    data.selectWorkbenchPersona('finance')
    data.reviewPartnerCredit(application.id, { approved: false, remark: '合成演示拒绝' })
    expect(application).toMatchObject({ status: '财务审批拒绝', decision: '拒绝', approvedAmount: null, amount: 500 })
    expect(partner.creditLimit).toBe(0)
    expect(partner.availableCredit).toBe(0)
    expect(data.state.messages.at(-1).content).toContain('审批拒绝')
  })

  it('航司引用的供应商不能删除且失败无副作用', () => {
    data.selectWorkbenchPersona('finance')
    const partner = data.state.partners.find(row => row.id === 'PT-00028')
    data.setPartnerActive(partner.id, false)
    const before = JSON.stringify(data.state)
    expect(() => data.deletePartner(partner.id)).toThrow('航司主数据引用')
    expect(JSON.stringify(data.state)).toBe(before)
  })

  it('reset 恢复固定 seed、序号、会话和授信来源', () => {
    const before = JSON.stringify({ partners: data.state.partners, creditApplications: data.state.creditApplications })
    const partner = createActivePartner()
    approveCredit(partner)
    expect(data.state.messages.length).toBeGreaterThan(0)
    data.reset()
    expect(JSON.stringify({ partners: data.state.partners, creditApplications: data.state.creditApplications })).toBe(before)
    expect(data.state.messages).toEqual([])
    expect(data.state.partnerSequence).toBe(40)
    expect(data.state.partnerEventSequence).toBe(0)
    expect(data.workbenchSession.personaId).toBe('service')
    expect(data.partnerSession.value.role).toBe('viewer')
    data.selectWorkbenchPersona('business')
    expect(data.savePartner(validPartner()).code).toBe('C00041')
  })
})
