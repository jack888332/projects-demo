import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  createTrunkDraft, filterTrunkServices, trunkPermissions, validateTrunkBooking,
} from '../src/domain/trunkServices.js'

const data = usePrototypeData()
const service = id => data.state.trunkServices.find(row => row.id === id)

describe('GJ-ORD-07 空运-干线服务', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('service') })

  it('委外与我司列表筛选、字段边界和空值保留', () => {
    const outsourced = filterTrunkServices(data.state.trunkServices, {}, '委外空运')
    expect(outsourced).toHaveLength(2)
    expect(filterTrunkServices(data.state.trunkServices, { serviceNo: 'TV26090800001' }, '委外空运')).toHaveLength(1)
    const own = filterTrunkServices(data.state.trunkServices, { origin: 'PVG', airline: 'NH 全日空' }, '我司空运')
    expect(own.map(row => row.id)).toEqual(['TS-260906-004'])
    expect(filterTrunkServices(data.state.trunkServices, { foamRatio: '0.5' }, '我司空运').map(row => row.id)).toEqual(['TS-260908-003'])
    expect(filterTrunkServices(data.state.trunkServices, { specialCargo: '鲜活' }, '我司空运').map(row => row.id)).toEqual(['TS-260906-004'])
    expect(filterTrunkServices(data.state.trunkServices, { flightNo: 'NH9003' }, '我司空运')).toHaveLength(1)
    expect(filterTrunkServices(data.state.trunkServices, { departureRange: ['2026-09-08', '2026-09-08'] }, '我司空运').map(row => row.id)).toEqual(['TS-260906-004'])
  })

  it('订舱必填、数值与航班明细校验', () => {
    const draft = { ...createTrunkDraft('委外空运'), supplier: '东方航空', waybillNo: '781-90008888', airline: 'MU 东方航空', flight: 'MU9001', actualDeparture: '2026-09-09', cost: '24.00', guidePrice: '28.00', foamRatio: '0.5' }
    expect(validateTrunkBooking(draft, { submit: true })).toMatchObject({ flights: expect.any(String) })
    draft.flights = [{ departDate: '2026-09-09', flight: 'MU9001', takeoffTime: '20:00', arrivalTime: '08:00' }]
    expect(validateTrunkBooking(draft, { submit: true })).toEqual({})
    expect(validateTrunkBooking({ ...draft, cost: '0' }, { submit: true })).toHaveProperty('cost')
    expect(validateTrunkBooking({ ...draft, internalSettlementFoam: '1.20' }, { submit: true })).toHaveProperty('internalSettlementFoam')
    expect(validateTrunkBooking({ ...draft, routeRemark: 'x'.repeat(257) }, { submit: true })).toHaveProperty('routeRemark')
    expect(validateTrunkBooking({ ...draft, airline: '' }, { submit: true })).toHaveProperty('airline')
  })

  it('订舱、执行信息编辑、干线到达完成与仅待接单取消', () => {
    const target = service('TS-260908-001')
    data.bookTrunkService(target.id, {
      supplier: '南方航空', waybillNo: '781-90002104', airline: 'CZ 南方航空', flight: 'CZ9002', actualDeparture: '2026-09-11',
      cost: '22.50', guidePrice: '27.00', foamRatio: '0.5', internalSettlementFoam: '0.3', routeRemark: '', palletCompany: 'CZ 航晟打板',
      flights: [{ departDate: '2026-09-11', flight: 'CZ9002', takeoffTime: '18:30', arrivalTime: '22:40' }],
    })
    expect(target).toMatchObject({ status: '进行中', node: '已订舱', supplier: '南方航空' })
    expect(target.acceptedAt).toBeTruthy()
    expect(() => data.bookTrunkService(target.id, {})).toThrow('仅待接单')
    data.saveTrunkExecution(target.id, { routeRemark: '改晚班', flight: 'CZ9003' })
    expect(target).toMatchObject({ routeRemark: '改晚班', flight: 'CZ9003' })
    data.completeTrunkService(target.id)
    expect(target).toMatchObject({ status: '已完成', node: '干线到达' })
    expect(target.completedAt).toBeTruthy()
    const waiting = service('TS-260908-001')
    expect(waiting.status).toBe('已完成')
    const cancelTarget = service('TS-260908-002')
    expect(() => data.cancelTrunkService(cancelTarget.id)).toThrow('待接单')
    expect(cancelTarget.status).toBe('进行中')
  })

  it('岗位与超级管理员边界；重置恢复种子', () => {
    data.selectWorkbenchPersona('operator')
    expect(trunkPermissions('viewer').book).toBe(false)
    expect(() => data.bookTrunkService('TS-260908-001', {})).toThrow()
    data.selectWorkbenchPersona('superAdmin')
    expect(() => data.bookTrunkService('TS-260908-001', {})).toThrow()
    data.reset()
    expect(data.state.trunkServices).toHaveLength(4)
    expect(service('TS-260908-001')).toMatchObject({ status: '待接单', supplier: '' })
  })

  it.each(['views/TrunkServicesView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
