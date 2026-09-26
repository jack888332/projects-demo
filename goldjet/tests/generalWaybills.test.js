import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  calculateHouseChargeWeight, createGeneralWaybillDraft, createHouseBillDraft,
  createWaybillDraftFromOrder, waybillPermissions, validateGeneralWaybillDraft, validateHouseBillDraft,
} from '../src/domain/generalWaybills.js'

const data = usePrototypeData()
const house = (overrides = {}) => createHouseBillDraft({ originPort: 'PVG', firstDestination: 'LAX', chineseName: '合成演示货物', expectedPieces: '10', expectedWeight: '20', expectedVolume: '0.5', ...overrides })
const waybill = (overrides = {}) => ({
  ...createGeneralWaybillDraft(),
  declarationType: '普货', importExportFlag: '进口', transportTool: '飞机',
  originPort: 'PVG', destinationPort: 'LAX', eta: '2026-09-10 08:00', etd: '2026-09-09 20:00',
  chineseName: '合成演示货物', expectedPieces: '10', expectedWeight: '20', expectedVolume: '0.5',
  billFields: { ...createGeneralWaybillDraft().billFields, waybillNo: '999-90009990', importExportFlag: '进口', shipper: '启航跨境贸易', consignee: 'DEMO CONSIGNEE' },
  ...overrides,
})

describe('GJ-ORD-02 综合总运单与分单资料', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('service') })

  it('订单补录带入申报类型、工具映射与货物首行', () => {
    const bcOrder = data.state.integratedOrders.find(row => row.businessType === 'BC')
    const bcDraft = createWaybillDraftFromOrder(bcOrder)
    expect(bcDraft).toMatchObject({ declarationType: '跨境电商', importExportFlag: '出口', transportTool: '飞机', originPort: 'CAN', destinationPort: 'NRT' })
    const airOrder = data.state.integratedOrders.find(row => row.id === 'G26090800001')
    const draft = createWaybillDraftFromOrder(airOrder)
    expect(draft).toMatchObject({ declarationType: '普货', importExportFlag: '进口', transportTool: '飞机', chineseName: '合成演示货物甲', sourceOrderId: 'G26090800001' })
    expect(draft.houses[0]).toMatchObject({ houseNo: 'GJ260900001', originPort: 'PVG', firstDestination: 'LAX', expectedPieces: 42 })
  })

  it('计费重取 max(毛重, 体积×166.66) 保留两位', () => {
    expect(calculateHouseChargeWeight(house())).toBe('83.33')
    expect(calculateHouseChargeWeight(house({ expectedVolume: '1.28' }))).toBe('213.32')
    expect(calculateHouseChargeWeight(house({ expectedWeight: '', expectedVolume: '' }))).toBe('')
  })

  it('普货与跨境电商必填边界，分单校验精度', () => {
    expect(validateGeneralWaybillDraft(waybill(), { submit: true })).toEqual({})
    expect(validateGeneralWaybillDraft(waybill({ originPort: '' }), { submit: true })).toHaveProperty('originPort')
    expect(validateGeneralWaybillDraft(waybill({ declarationType: '跨境电商' }), { submit: true })).toHaveProperty('waybillNo')
    const ecommerce = { ...createGeneralWaybillDraft(), declarationType: '跨境电商', importExportFlag: '进口', transportTool: '飞机', waybillNo: '999-90008888', supervisedPlaceCode: 'GZBS01', portCode: 'CAN', chineseName: '演示品名' }
    expect(validateGeneralWaybillDraft(ecommerce, { submit: true })).toEqual({})
    expect(validateHouseBillDraft(house({ expectedWeight: '1.234' }))).toHaveProperty('expectedWeight')
    expect(validateHouseBillDraft(house({ expectedPieces: '1.5' }))).toHaveProperty('expectedPieces')
    expect(validateHouseBillDraft(house({ firstDestination: '' }))).toHaveProperty('firstDestination')
  })

  it('保存生成总运单并回写订单，作废保留标识；分单新建、编辑、作废', () => {
    const order = data.state.integratedOrders.find(row => row.id === 'O26090800004')
    const draft = waybill({ sourceOrderId: order.id, billFields: { ...waybill().billFields, waybillNo: '999-90007777' } })
    const saved = data.saveGeneralWaybill(draft)
    expect(saved.id).toMatch(/^WB-260908-\d{3}$/)
    expect(order.waybillNo).toBe('999-90007777')
    expect(order.history.at(-1).event).toBe('总运单补录')
    data.voidGeneralWaybill(saved.id)
    expect(saved).toMatchObject({ status: '已作废', voidedBy: '周倩' })
    const seed = data.state.generalWaybills.find(row => row.id === 'WB-260908-001')
    data.saveGeneralWaybill({ ...waybill(), billFields: { ...createGeneralWaybillDraft().billFields, waybillNo: '999-90008801', importExportFlag: '进口', shipper: '启航跨境贸易', consignee: 'DEMO CONSIGNEE' }, attributeChanged: true }, seed.id)
    expect(seed.houses).toHaveLength(2)
    expect(data.state.generalWaybills.filter(row => row.waybillNo === '999-90008801')).toHaveLength(1)
    const created = data.saveGeneralHouse(seed.id, house({ houseNo: '' }))
    expect(created.houseNo).toMatch(/^GJ2609\d{5}$/)
    data.saveGeneralHouse(seed.id, { ...house({ houseNo: created.houseNo }), expectedPieces: '12' }, created.id)
    expect(created.expectedPieces).toBe('12')
    data.voidGeneralHouse(seed.id, created.id)
    expect(created).toMatchObject({ status: '已作废', voidedBy: '周倩' })
    // 相关订单不存在时不回写，也不产生第二份总运单
    expect(data.state.generalWaybills.filter(row => row.waybillNo === '999-90007777')).toHaveLength(1)
  })

  it('岗位只读与超级管理员边界；集装箱与附件按已明确分支维护', () => {
    const seed = data.state.generalWaybills.find(row => row.id === 'WB-260908-002')
    expect(waybillPermissions(seed, 'viewer')).toMatchObject({ create: false, edit: false })
    data.selectWorkbenchPersona('operator')
    expect(() => data.saveGeneralWaybill(waybill())).toThrow()
    data.selectWorkbenchPersona('superAdmin')
    expect(() => data.voidGeneralWaybill(seed.id)).toThrow()
    data.selectWorkbenchPersona('service')
    const row = data.addWaybillContainer('WB-260908-001', { containerNo: 'DEMO-CTN-09', containerSpec: '1x40HQ' })
    expect(row.serial).toBe(2)
    data.removeWaybillContainers('WB-260908-001', [row.serial])
    expect(data.state.generalWaybills.find(item => item.id === 'WB-260908-001').containers).toHaveLength(1)
    const attachment = data.addEcommerceAttachment(seed.id, { name: '演示附件.pdf', size: 1024, dataUrl: 'data:application/pdf;base64,AA==' })
    expect(seed.ecommerce.attachments.some(item => item.id === attachment.id)).toBe(true)
  })

  it.each(['views/GeneralWaybillsView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
