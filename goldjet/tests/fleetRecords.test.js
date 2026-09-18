import { beforeEach, describe, expect, it } from 'vitest'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { canViewFleetRecords, fleetRecordDraft, fleetRecordRows, fleetRecordCell, repairAmounts, validateFleetRecord } from '../src/domain/fleetRecords.js'
import { deriveDriverTaskSummary } from '../src/domain/fleetOperations.js'

const data = usePrototypeData()
beforeEach(() => { data.reset(); data.selectWorkbenchPersona('groundSupervisor') })
describe('GJ-017 车队台账确定投影与未决写入保护', () => {
  it('权限独立于车辆档案权限，客服不能读取维修油耗台账', () => {
    for (const role of ['hangsheng', 'supervisor', 'admin']) expect(canViewFleetRecords(role, 'incidents')).toBe(true)
    for (const role of ['hangsheng', 'admin', 'transportSupervisor', 'viewer']) for (const kind of ['repairs', 'fuel']) expect(canViewFleetRecords(role, kind)).toBe(false)
    expect(canViewFleetRecords('supervisor', 'repairs')).toBe(true)
    data.selectWorkbenchPersona('hangsheng')
    expect(() => data.saveFleetRecord('repairs', data.state.fleetRepairs[0])).toThrow('无此台账')
  })
  it('车辆与司机详情从唯一台账读取关联，按条件组合查询', () => {
    expect(fleetRecordRows('incidents', data.state, { vehicleId: 'VEH-0001', driverId: 'DRV-0001', type: '违章', date: '2026-09-02', updatedDate: '2026-09-08' })).toHaveLength(1)
    expect(fleetRecordRows('incidents', data.state, { type: '事故' })).toHaveLength(0)
    const record = data.state.fleetIncidents[0]
    expect(fleetRecordCell('incidents', record, 'plate', data.state)).toBe('沪A·DEMO1')
    expect(fleetRecordCell('incidents', record, 'driver', data.state)).toBe('演示司机甲')
    expect(fleetRecordCell('incidents', record, 'location', data.state)).toContain('浦东新区')
    expect(fleetRecordRows('fuel', data.state, { keyword: '演示经手' })).toHaveLength(1)
    expect(fleetRecordRows('fuel', data.state, { keyword: '0000000000000000017' })).toHaveLength(1)
  })
  it.each([['incidents', 'fleetIncidents'], ['repairs', 'fleetRepairs'], ['fuel', 'fleetFuel']])('%s 必填输入完整后仍因明确未决规则拒绝写入', (kind, key) => {
    const record = data.state[key][0], draft = fleetRecordDraft(kind, record)
    expect(validateFleetRecord(kind, draft, data.state)).toEqual({})
    const before = JSON.stringify(data.state)
    expect(() => data.saveFleetRecord(kind, draft)).toThrow('待确认')
    expect(() => data.saveFleetRecord(kind, draft, { id: record.id })).toThrow('待确认')
    expect(() => data.deleteFleetRecord(kind, record.id)).toThrow('删除权限')
    expect(JSON.stringify(data.state)).toBe(before)
  })
  it('既有记录编辑草稿不回写对象或维修科目，伪造字段不进入草稿', () => {
    const record = data.state.fleetRepairs[0], draft = fleetRecordDraft('repairs', { ...record, updatedBy: '伪造', total: '0' })
    draft.items[0].price = '999'
    expect(record.items[0].price).toBe('350.00')
    expect(draft.updatedBy).toBeUndefined()
    expect(draft.total).toBeUndefined()
  })
  it('真实省市区、未离职司机、日期及数字格式逐项校验', () => {
    const incident = fleetRecordDraft('incidents', data.state.fleetIncidents[0])
    Object.assign(incident, { date: '2026-02-30', region: ['上海市', '广州市', '浦东新区'], driverId: 'DRV-0003', penalty: '1.234', vehicleId: 'missing', address: '' })
    const errors = validateFleetRecord('incidents', incident, data.state)
    for (const key of ['date', 'region', 'driverId', 'penalty', 'vehicleId', 'address']) expect(errors[key]).toBeTruthy()
    const fuel = fleetRecordDraft('fuel', data.state.fleetFuel[0])
    expect(validateFleetRecord('fuel', { ...fuel, cardNo: '123', liters: '' }, data.state)).toMatchObject({ cardNo: expect.any(String), liters: expect.any(String) })
    const repair = fleetRecordDraft('repairs', data.state.fleetRepairs[0])
    expect(validateFleetRecord('repairs', { ...repair, items: [] }, data.state).items).toBeTruthy()
  })
  it('维修按十进制精确乘法求和，舍入不明确时不擅自给结果', () => {
    expect(repairAmounts([{ quantity: '2.00', price: '350.00' }, { quantity: '0.20', price: '0.50' }])).toEqual({ amounts: ['700.00', '0.10'], total: '700.10' })
    expect(repairAmounts([{ quantity: '0.11', price: '0.15' }])).toEqual({ amounts: [null], total: null })
    expect(repairAmounts([{ quantity: '9007199254740993', price: '2' }]).total).toBe('18014398509481986.00')
    expect(repairAmounts([{ quantity: '1e3', price: '2' }]).total).toBeNull()
  })
  it('油耗派生值不从合成输入推测，金额零不误显示为空', () => {
    const fuel = data.state.fleetFuel[0], incident = data.state.fleetIncidents[0]
    for (const key of ['distance', 'travelDistance', 'consumption', 'balance']) expect(fleetRecordCell('fuel', fuel, key, data.state)).toBe('口径待确认')
    expect(fleetRecordCell('incidents', incident, 'insuranceClaim', data.state)).toBe('0.00')
  })
  it('卸货后上报异常不会让司机历史任务重新成为进行中', () => {
    const bill = data.state.groundWaybills[0]
    bill.status = '异常中'; bill.fulfillmentStatus = '已卸货'
    const summary = deriveDriverTaskSummary(data.state.fleetDrivers[0], data.state)
    expect(summary.running).not.toContain(bill)
    expect(summary.history).toContain(bill)
  })
  it('同名司机不能冒领带证件的任务；无证件且同名不唯一时明确提示', () => {
    const original = data.state.fleetDrivers[0], bill = data.state.groundWaybills[0]
    const duplicateName = { ...original, id: 'DRV-0099', identityNo: '000000000000000099' }
    data.state.fleetDrivers.push(duplicateName)
    expect(deriveDriverTaskSummary(duplicateName, data.state).running).toHaveLength(0)
    expect(deriveDriverTaskSummary(original, data.state).running).toContain(bill)
    bill.drivers[0].identity = ''
    expect(deriveDriverTaskSummary(original, data.state).running).toHaveLength(0)
    expect(deriveDriverTaskSummary(original, data.state).associationReason).toContain('无法唯一关联')
  })
  it.each(['views/FleetRecordsView', 'components/FleetRecordTable'])('编译 %s 模板及脚本', name => {
    const filename = `src/${name}.vue`, { descriptor, errors } = parse(readFileSync(filename, 'utf8'))
    expect(errors).toEqual([])
    const script = compileScript(descriptor, { id: name })
    expect(compileTemplate({ source: descriptor.template.content, filename, id: name, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
