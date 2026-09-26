import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { bcServiceEligibility, bcServiceStatistics, filterBcServices } from '../src/domain/bcExportServices.js'

const data = usePrototypeData()
const service = id => data.state.customsServiceOrders.find(row => row.id === id)

describe('GJ-CUS-08 BC进口关务服务单（030 §7）', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('customsService') })

  it('种子与统计：BC进口服务单进入列表、状态统计与筛选', () => {
    const rows = data.state.customsServiceOrders.filter(row => ['BC进口', 'CC进口'].includes(row.businessType))
    expect(rows).toHaveLength(4)
    expect(rows.map(row => row.id).sort()).toEqual(['CS-260905-007', 'CS-260906-006', 'CS-260908-018', 'CS-260908-019'].sort())
    expect(filterBcServices(rows, { serviceNo: 'CS26090800019' })).toHaveLength(1)
    expect(filterBcServices(rows, { status: '待接单' }).map(row => row.id)).toEqual(['CS-260908-018'])
    expect(filterBcServices(rows, { upstreamCancelled: 'true' }).map(row => row.id)).toEqual(['CS-260908-019'])
    expect(bcServiceStatistics(rows)).toMatchObject({ 总计数量: 2, 待接单: 1, 进行中: 1, 已完成: 0, 已终止: 0, 已取消: 0 })
  })

  it('接单、流转、终止、取消、完成服务与详情字段', () => {
    const waiting = service('CS-260908-018')
    expect(bcServiceEligibility(waiting, 'accept')).toMatchObject({ ok: true })
    data.acceptBcExportServices([waiting.id])
    expect(waiting).toMatchObject({ status: '进行中', handler: '报关演示客服', department: '进口快件部' })
    data.transferBcExportServices([waiting.id], { mode: 'department' })
    expect(waiting.status).toBe('待接单')
    data.acceptBcExportServices([waiting.id])
    data.finishBcExportServices([waiting.id])
    expect(waiting.status).toBe('已完成')
    const running = service('CS-260908-019')
    data.terminateBcExportServices([running.id])
    expect(running.status).toBe('已终止')
    expect(running.serviceRecords.at(-1)).toMatchObject({ event: '终止服务', result: '成功' })
    expect(running.attachments).toHaveLength(1)
    expect(running.costs[0]).toMatchObject({ costItem: '清关服务费', total: '420.00' })
  })

  it('面板可复用：同一组件按 businessTypes 过滤，进口页标签可编译', () => {
    const source = readFileSync(new URL('../src/components/BcExportServicesPanel.vue', import.meta.url), 'utf8')
    expect(source).toContain('businessTypes')
    expect(source).toContain('v-business-write="moduleKey"')
    const view = readFileSync(new URL('../src/views/BcImportCustomsView.vue', import.meta.url), 'utf8')
    expect(view).toContain('BcExportServicesPanel')
    expect(view).toContain("business-types")
    expect(view).toContain('进口关务服务单')
  })

  it.each(['views/BcImportCustomsView.vue', 'components/BcExportServicesPanel.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
