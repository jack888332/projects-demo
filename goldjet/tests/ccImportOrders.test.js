import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  ccAttachmentEligibility, ccConvertEligibility, ccDeclarationEligibility, ccImportPermissions,
  ccWaybillChangeEligibility, createCcReceiptCsv, duplicateReceivers, filterCcImportOrders, missingAttachments,
  requiredAttachments,
} from '../src/domain/ccImportOrders.js'

const data = usePrototypeData()
const order = id => data.state.ccImportOrders.find(row => row.id === id)

describe('GJ-CUS-07 CC进口订单与申报（附件加工切片）', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('customsService') })

  it('筛选与附件规则：快件类型、舱单/附件/快件状态与所需附件', () => {
    const rows = data.state.ccImportOrders
    expect(rows).toHaveLength(5)
    expect(filterCcImportOrders(rows, { orderNo: 'CC-IN-260908-001' })).toHaveLength(1)
    expect(filterCcImportOrders(rows, { waybillNo: '781-90005003\n781-90005004' })).toHaveLength(2)
    expect(filterCcImportOrders(rows, { expressType: 'A' }).map(row => row.orderNo)).toEqual(['CC-IN-260908-004'])
    expect(filterCcImportOrders(rows, { expressStatus: '放行' }).map(row => row.orderNo)).toEqual(['CC-IN-260908-005'])
    expect(requiredAttachments('B').map(item => item.label)).toEqual(['身份证', '身份认证', '小票', '面单'])
    expect(requiredAttachments('C').map(item => item.label)).toEqual(['发票', '委托书', '面单'])
    expect(missingAttachments(order('CCI-260908-004'))).toEqual([])
    expect(missingAttachments(order('CCI-260908-003')).map(item => item.label)).toEqual(['身份证', '身份认证', '小票'])
  })

  it('附件加工资格：同提单、快件类型匹配与 B/A-C 分类', () => {
    const bOrders = [order('CCI-260908-003')]
    expect(ccAttachmentEligibility(bOrders, 'idcard')).toMatchObject({ ok: true })
    expect(ccAttachmentEligibility(bOrders, 'invoice')).toMatchObject({ ok: false, reason: '请选择A类或C类快件！' })
    const aOrders = [order('CCI-260908-004')]
    expect(ccAttachmentEligibility(aOrders, 'invoice')).toMatchObject({ ok: true })
    expect(ccAttachmentEligibility(aOrders, 'face')).toMatchObject({ ok: true })
    expect(ccAttachmentEligibility([order('CCI-260908-003'), order('CCI-260908-004')], 'face')).toMatchObject({ ok: false, reason: '请选择相同总运/提单号的订单！' })
    expect(ccImportPermissions('viewer')).toMatchObject({ attach: false })
  })

  it('附件加工、附件申报与快件申报：缺附件阻断与整组申报', () => {
    const target = order('CCI-260908-003')
    expect(ccDeclarationEligibility(target, 'attachments')).toMatchObject({ ok: false, reason: expect.stringContaining('请完成附件加工') })
    data.processCcAttachments([target.id], 'idcard')
    data.processCcAttachments([target.id], 'identity')
    data.processCcAttachments([target.id], 'receipt')
    expect(target.attachmentStatus).toBe('已完成')
    expect(target.attachments.map(row => row.type)).toEqual(['face', 'idcard', 'identity', 'receipt'])
    const declared = data.declareCcImportOrders([target.id], 'attachments')
    expect(declared.changed).toHaveLength(1)
    expect(target.receipts.at(-1).type).toBe('attachments')
    data.declareCcImportOrders([target.id], 'express')
    expect(target.expressStatus).toBe('海关入库')
    const aOrder = order('CCI-260908-004')
    data.declareCcImportOrders([aOrder.id], 'express')
    expect(aOrder.expressStatus).toBe('海关入库')
  })

  it('提单录入自动舱单与快件申报、更改提单号与转BC', () => {
    const target = order('CCI-260908-002')
    data.bindCcImportOrders([target.id], { waybillNo: '781-90005002' })
    data.enterCcImportWaybills([target.id], { departurePort: 'CAN', grossWeight: '11' })
    expect(target).toMatchObject({ waybillEntered: true, manifestStatus: '海关入库', channel: '' })
    expect(target.expressStatus).toBe('待报关')
    expect(target.logs.at(-1).action).toBe('自动快件申报等待附件')
    expect(ccWaybillChangeEligibility(target)).toMatchObject({ ok: true })
    data.changeCcWaybillNo([target.id], '781-90005002X')
    expect(target.waybillNo).toBe('781-90005002X')
    const convertTarget = order('CCI-260908-003')
    expect(ccConvertEligibility(convertTarget)).toMatchObject({ ok: true })
    const result = data.convertCcToBc([convertTarget.id])
    expect(result.converted[0]).toMatchObject({ conversion: '作废', shipped: false, estimatedTax: null })
    expect(data.state.bcImportOrders.some(row => row.conversion === '作废')).toBe(true)
  })

  it('作废报关单、发起退运、收件人重复校验与回执 CSV', () => {
    const released = order('CCI-260908-005')
    expect(ccDeclarationEligibility(released, 'void')).toMatchObject({ ok: true })
    data.voidCcDeclaration([released.id])
    expect(released.voidStatus).toBe('已作废')
    data.startCcReturn([released.id])
    expect(released.returnResult).toBe('退运中')
    const draft = order('CCI-260908-003')
    expect(ccDeclarationEligibility(draft, 'void')).toMatchObject({ ok: false })
    expect(duplicateReceivers(data.state.ccImportOrders, { ...draft, waybillNo: 'X', buyer: '订购人寅' })).toEqual([])
    const csv = createCcReceiptCsv([released], 'manifest')
    expect(csv).toContain('舱单')
    expect(csv).toContain('781-90005005')
  })

  it('岗位边界与重置：其他角色只读、超级管理员只读、种子恢复', () => {
    data.selectWorkbenchPersona('operator')
    expect(() => data.processCcAttachments(['CCI-260908-003'], 'idcard')).toThrow()
    data.selectWorkbenchPersona('superAdmin')
    expect(() => data.declareCcImportOrders(['CCI-260908-004'], 'express')).toThrow()
    data.reset()
    expect(data.state.ccImportOrders).toHaveLength(5)
    expect(order('CCI-260908-005')).toMatchObject({ expressStatus: '放行', expressType: 'C' })
  })

  it.each(['components/CcImportOrdersPanel.vue', 'views/BcImportCustomsView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
