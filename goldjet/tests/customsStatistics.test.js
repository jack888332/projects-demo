import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  customsDepartmentClerks, customsStatisticsPermissions, departmentSummary, filterDeclarations, memberSummary, nanshaStatistics,
} from '../src/domain/customsStatistics.js'

const data = usePrototypeData()

describe('GJ-CUS-01 关务查询与统计', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('customsService') })

  it('报关数据查询：精确单号、模糊海关/收发货人、结关与日期', () => {
    const rows = data.state.customsDeclarations.filter(row => row.status === '已申报' && (row.businessType === '普货进口' || row.businessType === '普货出口'))
    expect(rows).toHaveLength(4)
    expect(filterDeclarations(rows, { declarationNo: '514120260900001' })).toHaveLength(1)
    expect(filterDeclarations(rows, { declarationCustoms: '南沙' })).toHaveLength(1)
    expect(filterDeclarations(rows, { domesticConsignor: '云帆' })).toHaveLength(1)
    expect(filterDeclarations(rows, { cleared: 'false' })).toHaveLength(2)
    expect(filterDeclarations(rows, { importExportFlag: '出口' })).toHaveLength(2)
    expect(filterDeclarations(rows, { declarationRange: ['2026-09-04', '2026-09-06'] })).toHaveLength(3)
  })

  it('部门汇总：去重票数/提单/分单、分币种金额与运输方式分布', () => {
    const result = departmentSummary(data.state, { range: ['2026-09-01', '2026-09-30'], businessType: '普货进口' })
    expect(result).toMatchObject({ tickets: 2, totalWaybills: 2, houseBills: 1, totalWeight: 1180 })
    expect(result.amounts).toEqual([{ currency: 'CNY', amount: 12500 }, { currency: 'USD', amount: 3200 }])
    expect(result.transport).toEqual({ 空运: 1, 海运: 1, 陆运: 0 })
    expect(result.completion).toMatchObject({ completed: 2, unfinished: 2, ratio: 0.5 })
    const zero = departmentSummary(data.state, { range: ['2026-05-01', '2026-05-31'], businessType: '普货进口' })
    expect(zero.completion).toMatchObject({ ratio: null })
    expect(zero.completion.note).toContain('分母为零')
  })

  it('成员工作量：普货报关类型、出错票数与零分母、跨模式包裹与提单', () => {
    const general = memberSummary(data.state, { range: ['2026-09-01', '2026-09-30'], businessType: '普货进口' })
    expect(general.variant).toBe('general')
    const zhang = general.rows.find(row => row.clerk === '张关')
    expect(zhang).toMatchObject({ 单证报关: 0, 代理报关: 2, 单证报关Rate: null, 代理报关Rate: 0.5, sends: 2, amends: 1, inspections: 1, deletes: 0 })
    expect(general.zeroDenominator).toBe(true)
    const cross = memberSummary(data.state, { range: ['2026-09-01', '2026-09-30'], businessType: 'BC出口' })
    expect(cross.variant).toBe('crossBorder')
    expect(cross.rows).toEqual([{ clerk: '王快', parcels: 120, totalWaybills: 3 }])
    const cc = memberSummary(data.state, { range: ['2026-09-01', '2026-09-30'], businessType: 'CC进口' })
    expect(cc.rows[0]).toMatchObject({ clerk: '钱物', parcels: 45, totalWaybills: 1 })
    expect(customsDepartmentClerks(data.state, '普货出口')).toEqual(['张关', '李务'])
  })

  it('南沙统计：类型计数、月度序列、快递车辆核放单与占比', () => {
    const all = nanshaStatistics(data.state, { fromMonth: '2026-01', toMonth: '2026-09', businessType: '全部' })
    expect(all.type).toBe('全部')
    expect(all.composition).toEqual([
      { type: '一线进区', value: 2, ratio: 0.2 },
      { type: '二线调拨', value: 1, ratio: 0.1 },
      { type: '包裹出区', value: 2, ratio: 0.2 },
      { type: '快递车辆', value: 4, ratio: 0.4 },
      { type: '物料', value: 1, ratio: 0.1 },
    ])
    expect(all.total).toBe(10)
    const monthly = nanshaStatistics(data.state, { fromMonth: '2026-07', toMonth: '2026-09', businessType: '一线进区' })
    expect(monthly.rows).toEqual([
      { month: '2026-07', count: 0, inspections: 0, total: 0 },
      { month: '2026-08', count: 1, inspections: 0, total: 1 },
      { month: '2026-09', count: 1, inspections: 0, total: 1 },
    ])
    const vehicles = nanshaStatistics(data.state, { fromMonth: '2026-07', toMonth: '2026-09', businessType: '快递车辆' })
    expect(vehicles.rows.find(row => row.month === '2026-09')).toEqual({ month: '2026-09', count: 4, inspections: 2, total: 6 })
    expect(vehicles.total).toBe(6)
    const empty = nanshaStatistics(data.state, { fromMonth: '2026-05', toMonth: '2026-05', businessType: '全部' })
    expect(empty.composition.every(row => row.ratio === null)).toBe(true)
    expect(empty.ratioNote).toContain('合计为零')
  })

  it('权限与重置恢复种子', () => {
    expect(customsStatisticsPermissions('customsService')).toMatchObject({ query: true, stats: true })
    expect(customsStatisticsPermissions('viewer')).toMatchObject({ query: false, stats: false })
    data.selectWorkbenchPersona('operator')
    expect(customsStatisticsPermissions('viewer').stats).toBe(false)
    data.reset()
    expect(data.state.customsDeclarations).toHaveLength(14)
    expect(data.state.customsServiceOrders).toHaveLength(20)
    expect(nanshaStatistics(data.state, { fromMonth: '2026-09', toMonth: '2026-09', businessType: '包裹出区' }).total).toBe(2)
  })

  it.each(['views/CustomsStatisticsView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
