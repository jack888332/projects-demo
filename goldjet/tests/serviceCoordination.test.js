import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  buildPreallocationMaterials, collectServiceLogs, deriveCoordinationRows, derivePreallocationRows,
  filterCoordinationRows, preallocationPermissions,
} from '../src/domain/serviceCoordination.js'

const data = usePrototypeData()

describe('GJ-ORD-03 服务协同管理', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('service') })

  it('只纳入出口空运订单，按阈值分类紧急并紧急优先排序', () => {
    const rows = deriveCoordinationRows(data.state, { thresholdHours: 48 })
    expect(rows).toHaveLength(data.state.airOrders.length)
    const urgent = rows.filter(row => row.urgent === '紧急')
    expect(urgent.map(row => row.orderNo)).toEqual(['GJ-AIR-260906-011', 'GJ-AIR-260907-018'])
    expect(rows[0].orderNo).toBe('GJ-AIR-260906-011')
    const narrow = deriveCoordinationRows(data.state, { thresholdHours: 1 })
    expect(narrow.every(row => row.urgent === '正常')).toBe(true)
  })

  it('八项服务汇总：预配待发送、打板已完成、无来源显示无服务', () => {
    const row = deriveCoordinationRows(data.state, { thresholdHours: 48 }).find(item => item.orderId === 'AIR-260908-001')
    expect(row.services.preallocation).toBe('待服务')
    expect(row.services.pallet).toBe('已完成')
    expect(row.services.warehouse).toBe('服务中')
    expect(row.services.handover).toBe('')
    expect(row.services.customs).toBe('')
    const completed = deriveCoordinationRows(data.state, { thresholdHours: 48 }).find(item => item.orderId === 'AIR-260906-011')
    expect(completed.services.preallocation).toBe('已完成')
  })

  it('组合查询与服务状态筛选，仅按已应用条件生效', () => {
    const rows = deriveCoordinationRows(data.state, { thresholdHours: 48 })
    expect(filterCoordinationRows(rows, { urgent: '紧急' }).map(row => row.orderNo)).toEqual(['GJ-AIR-260906-011', 'GJ-AIR-260907-018'])
    expect(filterCoordinationRows(rows, { service_preallocation: '已完成' }).map(row => row.orderNo)).toEqual(['GJ-AIR-260906-011'])
    expect(filterCoordinationRows(rows, { waybillNo: '781-9000' }).length).toBe(3)
    expect(filterCoordinationRows(rows, { orderStatus: '待订舱' }).length).toBe(3)
  })

  it('操作日志汇总服务历史与预配记录；申报资料按主分单区分', () => {
    const order = data.state.airOrders.find(row => row.id === 'AIR-260908-001')
    const logs = collectServiceLogs(data.state, order)
    expect(logs.some(row => row.serviceName === '预配')).toBe(true)
    const record = data.state.preallocationRecords.find(row => row.orderId === 'AIR-260908-001')
    const mainMaterials = buildPreallocationMaterials(data.state, record, '')
    expect(mainMaterials).toContainEqual(['舱单传输人', '5141761575765广东高捷航运物流有限公司'])
    expect(mainMaterials.find(([label]) => label === '分单号')?.[1]).toBe('')
    const houseMaterials = buildPreallocationMaterials(data.state, record, '01')
    expect(houseMaterials.find(([label]) => label === '分单号')?.[1]).toBe('01')
    expect(houseMaterials.find(([label]) => label === '总件数')?.[1]).toBe(20)
  })

  it('预配发送本地模拟、回执与完成时间；取消/终止保留费用提示', () => {
    const record = data.state.preallocationRecords.find(row => row.id === 'PRE-260908-001')
    data.sendPreallocation(record.id, { main: true, houseNos: ['01'] })
    expect(record.main).toMatchObject({ sendStatus: '已发送', customsStatus: '接收申报' })
    expect(record.houses.find(row => row.childNo === '02').sendStatus).toBe('待发送')
    expect(record.status).toBe('进行中')
    data.sendPreallocation(record.id, { main: false, houseNos: ['02'] })
    expect(record.status).toBe('已完成')
    expect(record.serviceCompletedAt).toBeTruthy()
    expect(() => data.sendPreallocation(record.id, { main: true })).toThrow('进行中')
    const pending = data.state.preallocationRecords.find(row => row.id === 'PRE-260908-002')
    data.cancelPreallocation(pending.id)
    expect(pending.status).toBe('已取消')
    const running = data.state.preallocationRecords.find(row => row.id === 'PRE-260908-003')
    data.terminatePreallocation(running.id)
    expect(running.status).toBe('已终止')
    expect(data.state.costs.filter(cost => cost.preallocationId)).toHaveLength(0)
  })

  it('阈值保存校验与岗位边界；列表投影保持只读字段', () => {
    expect(() => data.savePreallocationThreshold(0)).toThrow('1～168')
    expect(data.savePreallocationThreshold(72)).toBe(72)
    expect(data.state.preallocationThresholdHours).toBe(72)
    data.selectWorkbenchPersona('operator')
    expect(preallocationPermissions('viewer').send).toBe(false)
    expect(() => data.sendPreallocation('PRE-260908-002', { main: true })).toThrow()
    data.selectWorkbenchPersona('superAdmin')
    expect(() => data.savePreallocationThreshold(24)).toThrow()
    data.selectWorkbenchPersona('service')
    const rows = derivePreallocationRows(data.state)
    expect(rows).toHaveLength(4)
    expect(rows.find(row => row.id === 'PRE-260906-004').serviceCompletedAt).toBe('2026-09-06 11:20')
  })

  it.each(['views/ServiceCoordinationView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
