import { beforeEach, describe, expect, it } from 'vitest'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { createVehicleDraft, filterVehicles, validateVehicleDraft, vehicleDraft, vehicleDrivers, vehicleStatus, vehicleTasks } from '../src/domain/fleetVehicles.js'
const data = usePrototypeData()
const valid = (extra = {}) => ({ ...createVehicleDraft(), plate: '沪C·DEMO17', model: '4.2车', payload: '4500', regulated: '否', registrationDate: '2026-09-01', inspectionDate: '2027-09-01', vehicleType: '轻型厢型货车', ...extra })
beforeEach(() => { data.reset(); data.selectWorkbenchPersona('hangsheng') })
describe('GJ-017 车辆档案与当前分配', () => {
  it('新增与编辑保持唯一 owner，分配双向投影且不改写历史任务', () => {
    const history = JSON.stringify(data.state.groundWaybills)
    const driver = data.state.fleetDrivers[0], old = data.state.fleetVehicles[0]
    const vehicle = data.saveVehicle(valid({ driverIds: [driver.id] }))
    expect(vehicle.id).toBe('VEH-0003')
    expect(driver.vehicle).toBe(vehicle.plate)
    expect(vehicleDrivers(vehicle, data.state)).toEqual([driver])
    expect(vehicleDrivers(old, data.state)).toHaveLength(0)
    data.saveDriver({ ...driver, vehicle: old.plate }, { id: driver.id })
    expect(vehicleDrivers(vehicle, data.state)).toHaveLength(0)
    expect(vehicleDrivers(old, data.state)).toEqual([driver])
    expect(JSON.stringify(data.state.groundWaybills)).toBe(history)
  })
  it('重复、离职司机、无效日期及无权限写入均原子拒绝', () => {
    const before = JSON.stringify(data.state)
    expect(() => data.saveVehicle(valid({ plate: '沪A·DEMO1' }))).toThrow('已存在')
    expect(() => data.saveVehicle(valid({ driverIds: ['DRV-0003'] }))).toThrow('未离职')
    expect(() => data.saveVehicle(valid({ inspectionDate: '2026-02-30' }))).toThrow('有效日期')
    expect(() => data.saveVehicle(valid({ regulated: '' }))).toThrow('空值')
    expect(JSON.stringify(data.state)).toBe(before)
    data.selectWorkbenchPersona('groundTransportSupervisor')
    expect(() => data.saveVehicle(valid())).toThrow('仅航晟')
  })
  it('任意篡改状态和元数据不被保存，草稿附件为独立副本', () => {
    const current = data.state.fleetVehicles[0], draft = vehicleDraft(current, data.state)
    draft.registrationImage.name = '新草稿.png'
    expect(current.registrationImage.name).not.toBe(draft.registrationImage.name)
    const saved = data.saveVehicle({ ...draft, status: '运输中', updatedBy: '伪造' }, { id: current.id })
    expect(saved.status).toBeUndefined()
    expect(saved.updatedBy).toBe('陈楠')
    draft.registrationImage.name = '未保存.png'
    expect(saved.registrationImage.name).toBe('新草稿.png')
  })
  it('全部终态或无任务为空闲，异常中的已卸货任务仍属历史', () => {
    const vehicle = data.state.fleetVehicles[0]
    expect(vehicleStatus(vehicle, data.state)).toBe('运输中')
    const bill = data.state.groundWaybills.find(row => row.plate === vehicle.plate)
    bill.status = '异常中'; bill.fulfillmentStatus = '已卸货'
    expect(vehicleStatus(vehicle, data.state)).toBe('空闲中')
    expect(vehicleTasks(vehicle, data.state).history).toContain(bill)
    bill.status = '已完成'
    expect(vehicleTasks(vehicle, data.state).running).toHaveLength(0)
    expect(vehicleStatus(data.saveVehicle(valid()), data.state)).toBe('空闲中')
  })
  it('已有任务时禁止关联身份变化，但可以维护其他车辆资料', () => {
    const vehicle = data.state.fleetVehicles[0], driver = data.state.fleetDrivers[0]
    expect(() => data.saveVehicle({ ...vehicleDraft(vehicle, data.state), plate: '新车牌' }, { id: vehicle.id })).toThrow('历史处理')
    expect(() => data.saveDriver({ ...driver, name: '改名' }, { id: driver.id })).toThrow('历史处理')
    expect(() => data.saveDriver({ ...driver, status: '已离职' }, { id: driver.id })).toThrow('离职处理')
    expect(data.saveVehicle({ ...vehicleDraft(vehicle, data.state), insurer: '另一个合成公司' }, { id: vehicle.id }).insurer).toBe('另一个合成公司')
  })
  it('按车牌、司机及年/月/日查询，校验数值与可选图片', () => {
    expect(filterVehicles(data.state, { keyword: '演示司机甲', registrationDate: '2023', inspectionDate: '2026-10' })).toHaveLength(1)
    expect(filterVehicles(data.state, { inspectionDate: '2026-10-05' })).toHaveLength(1)
    expect(filterVehicles(data.state, { model: '20尺柜' })).toHaveLength(0)
    const errors = validateVehicleDraft(valid({ payload: '-2', age: '0', mileage: '0.001', registrationImage: { name: '假的.png' }, dimensions: '500*200*200' }), data.state)
    for (const key of ['payload', 'age', 'mileage', 'registrationImage', 'dimensions']) expect(errors[key]).toBeTruthy()
  })
  it.each(['FleetVehiclesView', 'FleetManagementView'])('编译 %s 的模板和脚本', name => {
    const filename = `src/views/${name}.vue`, { descriptor, errors } = parse(readFileSync(filename, 'utf8'))
    expect(errors).toEqual([])
    const script = compileScript(descriptor, { id: name })
    expect(compileTemplate({ source: descriptor.template.content, filename, id: name, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
