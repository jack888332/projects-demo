import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  bcServiceEligibility, bcServicePermissions, bcServiceStatistics, calculateBcCostTotal, createBcCostRow,
  filterBcServices, validateBcAttachment, validateBcCostRows,
} from '../src/domain/bcExportServices.js'

const data = usePrototypeData()
const service = id => data.state.customsServiceOrders.find(row => row.id === id)

describe('GJ-CUS-05 BC出口服务单受理与详情', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('customsService') })

  it('筛选与统计：多值精确、服务项、状态、上游取消与统计窗口', () => {
    const rows = data.state.customsServiceOrders.filter(row => row.businessType === 'BC出口')
    expect(rows).toHaveLength(3)
    expect(filterBcServices(rows, { serviceNo: 'CS26090800016' })).toHaveLength(1)
    expect(filterBcServices(rows, { serviceNo: 'CS26090800016\nCS26090800017' })).toHaveLength(2)
    expect(filterBcServices(rows, { serviceItem: '离境单申报' })).toHaveLength(1)
    expect(filterBcServices(rows, { status: '进行中' }).map(row => row.id)).toEqual(['CS-260908-017'])
    expect(filterBcServices(rows, { upstreamCancelled: 'true' }).map(row => row.id)).toEqual(['CS-260908-017'])
    expect(filterBcServices(rows, { handler: '报关演示客服' }).map(row => row.id)).toEqual(['CS-260908-017'])
    expect(bcServiceStatistics(rows)).toMatchObject({ 总计数量: 3, 待接单: 1, 进行中: 1, 已完成: 1, 已终止: 0, 已取消: 0 })
  })

  it('受理资格：接单、流转、终止、取消与结束', () => {
    expect(bcServiceEligibility(service('CS-260908-016'), 'accept')).toMatchObject({ ok: true })
    expect(bcServiceEligibility(service('CS-260908-017'), 'accept')).toMatchObject({ ok: false, reason: '所选订单已被接单' })
    expect(bcServiceEligibility(service('CS-260908-017'), 'transfer')).toMatchObject({ ok: true })
    expect(bcServiceEligibility(service('CS-260908-016'), 'terminate')).toMatchObject({ ok: false, reason: '没有可终止的服务单' })
    expect(bcServiceEligibility(service('CS-260908-017'), 'cancel')).toMatchObject({ ok: true })
    expect(bcServiceEligibility(service('CS-260908-005'), 'finish')).toMatchObject({ ok: false, reason: '没有可结束的服务单' })
    expect(bcServicePermissions('viewer')).toMatchObject({ accept: false, terminate: false })
  })

  it('接单、流转、终止、取消与结束的服务单状态与记录', () => {
    const waiting = service('CS-260908-016')
    data.acceptBcExportServices([waiting.id])
    expect(waiting).toMatchObject({ status: '进行中', handler: '报关演示客服' })
    expect(() => data.acceptBcExportServices([waiting.id])).toThrow('已被接单')
    data.transferBcExportServices([waiting.id], { mode: 'department' })
    expect(waiting).toMatchObject({ status: '待接单', handler: '' })
    expect(() => data.transferBcExportServices([waiting.id], { mode: 'person', target: '王快' })).toThrow('CUSTOMS-B018')
    data.acceptBcExportServices([waiting.id])
    data.finishBcExportServices([waiting.id])
    expect(waiting.status).toBe('已完成')
    expect(waiting.serviceRecords.at(-1)).toMatchObject({ event: '结束服务', result: '成功' })
    // 取消要求上游取消服务=是（017）
    data.reset(); data.selectWorkbenchPersona('customsService')
    const running = service('CS-260908-017')
    expect(() => data.cancelBcExportServices([running.id])).not.toThrow()
    expect(running.status).toBe('已取消')
    // 终止独立验证
    data.reset(); data.selectWorkbenchPersona('customsService')
    const terminated = service('CS-260908-017')
    data.terminateBcExportServices([terminated.id])
    expect(terminated.status).toBe('已终止')
    expect(terminated.serviceRecords.at(-1)).toMatchObject({ event: '终止服务', result: '成功' })
    expect(() => data.cancelBcExportServices([terminated.id])).toThrow('没有可取消的服务单')
  })

  it('附件：格式与大小校验、上传下载删除与操作记录', () => {
    const target = service('CS-260908-016')
    expect(validateBcAttachment({ name: 'x.exe', size: 10 })).toHaveProperty('name')
    expect(validateBcAttachment({ name: 'x.pdf', size: 6 * 1024 * 1024 })).toHaveProperty('size')
    expect(validateBcAttachment({ name: 'x.pdf', size: 1024 })).toEqual({})
    const attachment = data.uploadBcServiceAttachment(target.id, { name: '报关资料.pdf', size: 1024, dataUrl: 'data:application/pdf;base64,AA==' })
    expect(target.attachments.at(-1)).toMatchObject({ name: '报关资料.pdf', uploader: '报关演示客服' })
    expect(target.serviceRecords.at(-1).event).toBe('上传附件')
    data.deleteBcServiceAttachment(target.id, attachment.id)
    expect(target.attachments.some(row => row.id === attachment.id)).toBe(false)
  })

  it('应收应付：行合计、校验、汇总与委外标记', () => {
    const target = service('CS-260908-017')
    expect(calculateBcCostTotal({ quantity: '2', unitPrice: '35.50' })).toBe('71.00')
    expect(validateBcCostRows([createBcCostRow()])).toHaveProperty('0.settlementParty')
    const saved = data.saveBcServiceCosts(target.id, [
      { id: 'C1', settlementParty: '启航跨境贸易', status: '未结算', costItem: '报关服务费', attribute: '应收', quantity: '2', unit: '票', currency: 'CNY', unitPrice: '300.00', collect: '否' },
      { id: 'C2', settlementParty: '申捷车队', status: '未结算', costItem: '查验服务费', attribute: '应付', quantity: '1', unit: '票', currency: 'CNY', unitPrice: '120.00', collect: '否' },
    ])
    expect(saved.map(row => row.total)).toEqual(['600.00', '120.00'])
    expect(target.costs).toHaveLength(2)
    data.appointBcOutsourced(target.id, '申捷车队')
    expect(target).toMatchObject({ outsourced: true, outsourcedSupplier: '申捷车队' })
    expect(target.serviceRecords.at(-1).event).toBe('委外服务')
    data.selectWorkbenchPersona('operator')
    expect(() => data.saveBcServiceCosts(target.id, saved)).toThrow()
    data.reset()
    expect(data.state.customsServiceOrders.filter(row => row.businessType === 'BC出口')).toHaveLength(3)
  })

  it.each(['components/BcExportServicesPanel.vue', 'views/BcExportCustomsView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
