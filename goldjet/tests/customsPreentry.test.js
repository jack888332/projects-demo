import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  CUSTOMS_GOODS_IMPORT_HEADERS, buildCustomsPreentryPreviews, calculateCustomsGoodsTotal,
  createCustomsGoodsRow, createCustomsPreentryDraft, customsGoodsCsvTemplate, parseCustomsGoodsCsv,
  renumberCustomsGoods, validateCustomsPreentry,
} from '../src/domain/customsPreentry.js'

const data = usePrototypeData()
const customsService = () => data.state.customsServiceOrders.find(row => row.id === 'CS-260908-014')

describe('GJ-CUS-03 进口整合申报预录（028 §5.1.1、§5.1.3）', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('customsService') })

  it('合成演示草稿默认值、产品行计算与提交必填反馈', () => {
    const draft = createCustomsPreentryDraft(customsService())
    expect(draft).toMatchObject({ typeLabel: '进口整合申报', importExportFlag: '进口', basic: { declarationCustoms: '5141', tradeMode: 'FOB', declarationType: '通关无纸化' } })
    expect(draft.goods).toHaveLength(1)
    expect(calculateCustomsGoodsTotal({ quantity: '3', unitPrice: '10.2500' })).toBe('30.7500')
    expect(validateCustomsPreentry(draft)).toEqual({})
    expect(validateCustomsPreentry({ ...draft, basic: { ...draft.basic, domesticName: '' } }, { submit: true })).toHaveProperty('basic.domesticName')
    expect(validateCustomsPreentry({ ...draft, goods: [] }, { submit: false })).toEqual({})
    expect(validateCustomsPreentry({ ...draft, goods: [] }, { submit: true })).toHaveProperty('goods')
    const cAndF = { ...draft, basic: { ...draft.basic, tradeMode: 'C&F', freightValue: '10' } }
    expect(validateCustomsPreentry(cAndF, { submit: true })).toHaveProperty('freightValue')
  })

  it('CSV模板字段精确匹配，重复单位列按原顺序解析，失败不产出替换结果', () => {
    const template = customsGoodsCsvTemplate().replace(/^\ufeff/, '').trim()
    expect(template.split(',').map(value => value.replaceAll('"', ''))).toEqual(CUSTOMS_GOODS_IMPORT_HEADERS)
    const row = createCustomsGoodsRow(1)
    const cells = CUSTOMS_GOODS_IMPORT_HEADERS.map((_, index) => {
      const key = [
        'itemNo', 'productCode', 'inspectionName', 'productName', 'specModel', 'quantity', 'unit', 'unitPrice', 'totalPrice', 'currency',
        'legalQty1', 'legalUnit1', 'processingVersion', 'productNo', 'finalDestination', 'legalQty2', 'legalUnit2', 'originCountry',
        'originRegion', 'domesticDestination', 'exemptionMode', 'inspectionSpec', 'cargoAttribute', 'purpose',
      ][index]
      return row[key] || ''
    })
    const validCsv = `${CUSTOMS_GOODS_IMPORT_HEADERS.join(',')}\n${cells.join(',')}`
    const imported = parseCustomsGoodsCsv(validCsv)
    expect(imported.ok).toBe(true)
    expect(imported.rows[0]).toMatchObject({ productCode: row.productCode, productName: row.productName, legalUnit1: row.legalUnit1, legalUnit2: row.legalUnit2, itemNo: '1' })
    const badHeader = parseCustomsGoodsCsv(`商品编号,商品名称\nX,Y`)
    expect(badHeader).toMatchObject({ ok: false, rows: [] })
    const badRows = parseCustomsGoodsCsv(`${CUSTOMS_GOODS_IMPORT_HEADERS.join(',')}\n${cells.slice(0, -1).join(',')}`)
    expect(badRows).toMatchObject({ ok: false, rows: [] })
    expect(renumberCustomsGoods([{ ...row, id: 'a' }, { ...row, id: 'b' }]).map(item => item.itemNo)).toEqual(['1', '2'])
  })

  it('保存草稿保持新增状态；提交原子创建服务关联并转待复审', () => {
    const service = customsService()
    const draft = createCustomsPreentryDraft(service)
    const saved = data.saveCustomsPreentry(service.id, '', draft, { submit: false })
    expect(saved).toMatchObject({ status: '新增', typeLabel: '进口整合申报', serviceId: service.id })
    expect(saved.preentry).toEqual(draft)
    expect(service.declarationIds).toContain(saved.id)
    expect(service.logs.at(-1)?.action).not.toBe('保存预录')
    const edited = { ...saved.preentry, basic: { ...saved.preentry.basic, remarks: '修改后的演示备注' } }
    data.saveCustomsPreentry(service.id, saved.id, edited, { submit: false })
    expect(saved.preentry.basic.remarks).toBe('修改后的演示备注')
    data.saveCustomsPreentry(service.id, saved.id, edited, { submit: true })
    expect(saved.status).toBe('待复审')
    expect(saved.goods[0].totalPrice).toBe(calculateCustomsGoodsTotal(saved.goods[0]))
    expect(service.logs.at(-1)).toMatchObject({ action: '提交审核' })
    expect(() => data.saveCustomsPreentry(service.id, saved.id, edited, { submit: false })).toThrow('新增状态')
  })

  it('保存允许不完整草稿，提交校验失败不写入或占用编号', () => {
    const service = customsService()
    const blank = createCustomsPreentryDraft(service)
    blank.basic.domesticName = ''
    const beforeCount = data.state.customsDeclarations.length
    const saved = data.saveCustomsPreentry(service.id, '', blank, { submit: false })
    expect(saved.status).toBe('新增')
    const another = createCustomsPreentryDraft(service)
    another.basic.declarantName = ''
    const count = data.state.customsDeclarations.length
    expect(() => data.saveCustomsPreentry(service.id, '', another, { submit: true })).toThrow('请填写企业名称')
    expect(data.state.customsDeclarations).toHaveLength(count)
    expect(data.state.customsDeclarations.length).toBe(beforeCount + 1)
  })

  it('预览映射：导出已定义字段，CUSTOMS-B008疑似字段显式待确认', () => {
    const preview = buildCustomsPreentryPreviews(createCustomsPreentryDraft(customsService()))
    expect(preview).toHaveProperty('报关单')
    expect(preview).toHaveProperty('发票')
    expect(preview).toHaveProperty('装箱单')
    expect(preview).toHaveProperty('合同')
    expect(preview.报关单.find(row => row.label === '征免性质')).toMatchObject({ value: '', status: expect.stringContaining('CUSTOMS-B008') })
    expect(preview.合同.find(row => row.label === '买方')).toMatchObject({ status: expect.stringContaining('CUSTOMS-B008') })
  })

  it.each(['views/CustomsDeclarationPreentryView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
