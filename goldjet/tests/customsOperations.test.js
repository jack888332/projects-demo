import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  createDocumentNo, customsOperationPermissions, declarationEligibility, deriveCustomsStatus, filterCustomsOrders,
  serviceOrderPermissions, validateDeclarationReview, validateLetterResult, validateReviewResult,
} from '../src/domain/customsOperations.js'

const data = usePrototypeData()
const service = id => data.state.customsServiceOrders.find(row => row.id === id)
const declaration = id => data.state.customsDeclarations.find(row => row.id === id)

describe('GJ-CUS-02 普货关务作业（首个切片）', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('customsService') })

  it('列表筛选：批量单号、服务项多选、客户模糊、报关状态含无与日期', () => {
    const rows = data.state.customsServiceOrders.filter(row => row.businessType === '普货进口')
    const statusOf = row => deriveCustomsStatus(data.state, row)
    expect(filterCustomsOrders(rows, { serviceNo: 'CS26090800015' })).toHaveLength(1)
    expect(filterCustomsOrders(rows, { serviceNo: 'CS26090800015\nCS26090800014' })).toHaveLength(2)
    expect(filterCustomsOrders(rows, { customer: '远洲' })).toHaveLength(1)
    expect(filterCustomsOrders(rows, { serviceItems: ['查验'] }).map(row => row.id)).toEqual(['CS-260908-015'])
    expect(filterCustomsOrders(rows, { customsStatuses: ['无'] }, { statusOf }).map(row => row.id).sort()).toEqual(['CS-260903-011', 'CS-260908-015'].sort())
    expect(filterCustomsOrders(rows, { customsStatuses: ['结关'] }, { statusOf }).map(row => row.id)).toEqual(['CS-260908-001'])
    expect(filterCustomsOrders(rows, { customsStatuses: ['待申报'] }, { statusOf }).map(row => row.id)).toEqual(['CS-260908-014'])
    expect(filterCustomsOrders(rows, { range: ['2026-09-08', '2026-09-08'] }).map(row => row.id).sort()).toEqual(['CS-260908-014', 'CS-260908-015'].sort())
  })

  it('接单：仅待接单执行、其他自动过滤、无可接单时提示', () => {
    const waiting = service('CS-260908-015')
    const running = service('CS-260908-014')
    const result = data.acceptCustomsOrders([waiting.id, running.id])
    expect(result.map(row => row.id)).toEqual([waiting.id])
    expect(waiting).toMatchObject({ status: '进行中', handler: '报关演示客服' })
    expect(() => data.acceptCustomsOrders([waiting.id])).toThrow('所选订单已被接单')
    expect(serviceOrderPermissions(waiting, 'customsService', '报关演示客服').accept).toBe(false)
  })

  it('流转：仅本人接单的进行中订单，部门重置待接单、指定人无需接单', () => {
    const own = service('CS-260908-014')
    expect(serviceOrderPermissions(own, 'customsService', '报关演示客服').transfer).toBe(true)
    expect(serviceOrderPermissions(own, 'customsService', '其他报关员').transfer).toBe(false)
    data.transferCustomsOrders([own.id], { mode: 'department' })
    expect(own).toMatchObject({ status: '待接单', handler: '' })
    data.acceptCustomsOrders([own.id])
    data.transferCustomsOrders([own.id], { mode: 'person', target: '李务' })
    expect(own).toMatchObject({ status: '进行中', handler: '李务' })
    expect(() => data.transferCustomsOrders([own.id], { mode: 'department' })).toThrow('所选订单不能流转')
  })

  it('终止与取消：要求上游取消服务为是，且只作用于进行中', () => {
    const running = service('CS-260908-014')
    data.terminateCustomsOrders([running.id])
    expect(running.status).toBe('已终止')
    expect(() => data.cancelCustomsOrders([running.id])).toThrow('所选订单不能取消')
    const flaggedOut = service('CS-260907-004')
    data.cancelCustomsOrders([flaggedOut.id])
    expect(flaggedOut.status).toBe('已取消')
    const withoutFlag = service('CS-260908-002')
    expect(() => data.terminateCustomsOrders([withoutFlag.id])).toThrow('所选订单不能终止')
    running.upstreamCancelled = false
    expect(() => data.cancelCustomsOrders([running.id])).toThrow('上游取消服务须为是')
  })

  it('审核资料：不通过须原因、回执写入附件、邮件与接收人记录；通过不发送邮件', () => {
    const target = service('CS-260907-004')
    expect(validateReviewResult({ approved: false })).toHaveProperty('reason')
    expect(() => data.reviewCustomsMaterials(target.id, { approved: false })).toThrow('原因')
    data.reviewCustomsMaterials(target.id, { approved: false, reason: '发票金额与合同不一致', recipients: ['财务邮箱（演示）'] })
    expect(target.attachments[0].receipt).toContain('审核不通过')
    expect(target.emails.at(-1)).toMatchObject({ subject: target.orderNo, body: '发票金额与合同不一致', signName: '报关演示客服' })
    expect(target.emails.at(-1).to).toEqual(['客户邮箱（演示）', '财务邮箱（演示）'])
    const other = service('CS-260908-014')
    data.reviewCustomsMaterials(other.id, { approved: true })
    expect(other.attachments[0].receipt).toContain('审核通过')
    expect(other.emails || []).toHaveLength(0)
  })

  it('附件：上传重名追加序号、仅接单人可传、只能删除自己上传的附件', () => {
    const target = service('CS-260908-014')
    const first = data.uploadCustomsAttachment(target.id, { name: '演示装箱单.pdf', size: 10, dataUrl: 'data:application/pdf;base64,AA==' })
    const second = data.uploadCustomsAttachment(target.id, { name: '演示装箱单.pdf', size: 10 })
    expect(first.name).toBe('演示装箱单.pdf')
    expect(second.name).toBe('演示装箱单(1).pdf')
    expect(() => data.deleteCustomsAttachment(target.id, target.attachments[0].id)).toThrow('只能删除自己上传')
    data.deleteCustomsAttachment(target.id, second.id)
    expect(target.attachments.some(row => row.id === second.id)).toBe(false)
    const other = service('CS-260907-004')
    data.transferCustomsOrders([other.id], { mode: 'person', target: '李务' })
    expect(() => data.uploadCustomsAttachment(other.id, { name: 'x.pdf' })).toThrow('仅当前接单人')
  })

  it('单证制作生成四类单证；报关单新增→提交→复审→发送→复制→作废与状态管理', () => {
    const target = service('CS-260908-014')
    const created = data.generateCustomsDocuments(target.id, { waybillNo: '781-90001401' })
    expect(created.map(row => row.type)).toEqual(['报关单', '发票', '装箱单', '合同'])
    expect(created.every(row => row.source === '单证制作')).toBe(true)
    const declaration_ = data.createDeclaration(target.id)
    expect(declaration_.docNo).toBe(createDocumentNo(16))
    expect(declaration_).toMatchObject({ status: '新增', customsStatus: '待申报' })
    expect(declarationEligibility(declaration_).submit).toBe(true)
    data.submitDeclaration(declaration_.id)
    expect(declaration_.status).toBe('待复审')
    expect(validateDeclarationReview({ approved: false })).toHaveProperty('reason')
    expect(() => data.reviewDeclaration(declaration_.id, { approved: false })).toThrow('原因')
    data.reviewDeclaration(declaration_.id, { approved: true })
    expect(declaration_.status).toBe('复审通过')
    expect(() => data.sendDeclaration(declaration_.id, '')).toThrow('IC 卡')
    data.sendDeclaration(declaration_.id, 'IC-DEMO-001')
    expect(declaration_).toMatchObject({ status: '发送成功', customsStatus: '已申报' })
    expect(declaration_.customsNo).toMatch(/^51412609/)
    expect(declarationEligibility(declaration_).statusManage).toBe(true)
    data.copyDeclaration(declaration_.id)
    const copy = data.state.customsDeclarations[0]
    expect(copy).toMatchObject({ status: '新增', note: `复制自 ${declaration_.docNo}` })
    expect(copy.docNo).not.toBe(declaration_.docNo)
    expect(() => data.voidDeclaration(copy.id)).toThrow('无法被作废')
    expect(declaration('CD-013').status).toBe('待复审')
    data.voidDeclaration('CD-013')
    expect(declaration('CD-013').status).toBe('已作废')
    data.manageDeclarationCustomsStatus(declaration_.id, '审结')
    expect(declaration_.customsStatus).toBe('审结')
    expect(() => data.manageDeclarationCustomsStatus('CD-014', '审结')).toThrow('状态管理')
  })

  it('退单处理：仅退单状态、内容必填且不能重复；安排查验生成记录', () => {
    const letter = declaration('CD-004')
    expect(declarationEligibility(letter).letterRecord).toBe(true)
    expect(validateLetterResult('')).toHaveProperty('content')
    data.recordDeclarationLetter(letter.id, '退单', '已联系客户补件')
    expect(letter.letterRecord).toMatchObject({ kind: '退单', content: '已联系客户补件' })
    expect(() => data.recordDeclarationLetter(letter.id, '退单', '再次处理')).toThrow('重复')
    const target = service('CS-260908-014')
    const inspection = data.arrangeCustomsInspection(target.id, { inspector: '查验演示员甲', declarationNo: '51412609000100', waybillNo: '781-90001401' })
    expect(inspection).toMatchObject({ inspector: '查验演示员甲', declarationNo: '51412609000100' })
    expect(target.inspections).toHaveLength(1)
    expect(target.serviceRecords.at(-1).event).toBe('安排查验')
  })

  it('岗位边界：其他角色只读、超级管理员只读、重置恢复种子', () => {
    expect(customsOperationPermissions('viewer')).toMatchObject({ operate: false })
    data.selectWorkbenchPersona('operator')
    expect(() => data.acceptCustomsOrders(['CS-260908-015'])).toThrow()
    data.selectWorkbenchPersona('superAdmin')
    expect(() => data.acceptCustomsOrders(['CS-260908-015'])).toThrow()
    data.reset()
    expect(service('CS-260908-015').status).toBe('待接单')
    expect(data.state.customsDeclarations.filter(row => row.serviceId === 'CS-260908-014').map(row => row.status)).toEqual(['待复审', '复审通过'])
  })

  it.each(['views/CustomsOrdersView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
