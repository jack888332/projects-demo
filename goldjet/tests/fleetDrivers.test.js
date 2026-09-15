import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { inflateSync } from 'node:zlib'
import {
  DRIVER_ATTACHMENT_LIMIT, DRIVER_EMPLOYMENT_TYPES, createDriverDraft, createDriverSampleAttachment,
  validateDriverDraft, validateDriverAttachment, deriveDriverTaskSummary, filterDrivers, driverExpiryState,
} from '../src/domain/fleetOperations.js'

const data = usePrototypeData()
const valid = (changes = {}) => ({
  ...createDriverDraft(), name: '新增演示司机', gender: '女', identityNo: '000000000000000099', phone: '00000001099',
  idCardFront: createDriverSampleAttachment('idCardFront'), idCardBack: createDriverSampleAttachment('idCardBack'),
  licenseImage: createDriverSampleAttachment('licenseImage'), licenseClasses: ['C1'],
  licenseExpiry: '2028-01-01', qualificationExpiry: '2028-01-01', employmentType: '货物运输', joinDate: '2026-09-08', ...changes,
})

beforeEach(() => data.reset())

describe('GJ-017 owner：司机管理', () => {
  it('司机列表数据可筛选，详情任务摘要来自同一运输运单 owner', () => {
    const driver = data.state.fleetDrivers.find(item => item.name === '演示司机甲')
    const summary = deriveDriverTaskSummary(driver, data.state)
    expect(summary.running.map(item => item.waybillNo)).toContain('D20126090800001')
    expect(summary.history).toHaveLength(0)
  })

  it('只读客服不能新增，主管新增后可修改状态', () => {
    data.selectWorkbenchPersona('hangsheng')
    expect(() => data.saveDriver(valid())).toThrow('仅航晟主管或管理员')
    data.selectWorkbenchPersona('groundSupervisor')
    const driver = data.saveDriver(valid())
    expect(driver.id).toBe('DRV-0004')
    const edited = data.saveDriver({ ...driver, status: '休假', remark: '演示更新' }, { id: driver.id })
    expect(edited.status).toBe('休假')
    expect(edited.updatedBy).toBe('陈楠')
  })

  it('重复证件或必填资料缺失时原子拒绝写入', () => {
    data.selectWorkbenchPersona('groundSupervisor')
    const before = JSON.stringify(data.state.fleetDrivers)
    expect(() => data.saveDriver(valid({ identityNo: '000000000000000001' }))).toThrow('已存在')
    expect(() => data.saveDriver(valid({ phone: '' }))).toThrow('联系方式')
    expect(JSON.stringify(data.state.fleetDrivers)).toBe(before)
    expect(validateDriverDraft(valid({ licenseClasses: [] }), data.state.fleetDrivers).licenseClasses).toBeTruthy()
  })

  it('只有已有正常司机才阻止相同证件，编辑自身不产生重复', () => {
    const normal = data.state.fleetDrivers[0]
    expect(validateDriverDraft(normal, data.state.fleetDrivers, { existingId: normal.id })).toEqual({})
    for (const status of ['休假', '已离职']) {
      const existing = { ...normal, status }
      expect(validateDriverDraft(valid({ identityNo: existing.identityNo }), [existing]).identityNo).toBeUndefined()
    }
  })

  it('严格检查候选项、长度和日期，不擅自增加其他从业类别', () => {
    const errors = validateDriverDraft(valid({
      name: '名'.repeat(51), gender: '未知', identityNo: 'A'.repeat(18), phone: '000-00001099',
      licenseClasses: ['C1', 'Z'], qualificationNo: 'X'.repeat(21), employmentType: '其他',
      licenseExpiry: '2026-02-30', qualificationExpiry: 'not-a-date', joinDate: '2026-9-8', status: '停用',
    }))
    for (const field of ['name', 'gender', 'identityNo', 'phone', 'licenseClasses', 'qualificationNo', 'employmentType', 'licenseExpiry', 'qualificationExpiry', 'joinDate', 'status']) expect(errors[field]).toBeTruthy()
    expect(DRIVER_EMPLOYMENT_TYPES).not.toContain('其他')
    expect(validateDriverDraft(valid({ qualificationExpiry: '' })).qualificationExpiry).toContain('待确认')
    expect(validateDriverDraft(valid({ licenseExpiry: '2028-02-29' })).licenseExpiry).toBeUndefined()
  })

  it.each(['000000000000000', '00000000000000009X', '00000000000000009x'])('接受证件基本位数与末位格式 %s', identityNo => {
    expect(validateDriverDraft(valid({ identityNo })).identityNo).toBeUndefined()
  })

  it.each(['1'.repeat(16), '1'.repeat(17), 'X' + '1'.repeat(17)])('拒绝错误证件格式 %s', identityNo => {
    expect(validateDriverDraft(valid({ identityNo })).identityNo).toBeTruthy()
  })

  it.each(['0', '-1', '1.5', '1e3', '01', '9'.repeat(21)])('拒绝非正整数或超长驾驶分数 %s', drivingScore => {
    expect(validateDriverDraft(valid({ drivingScore })).drivingScore).toBeTruthy()
  })

  it('保存20位分数时保留字符串精度，草稿与保存记录不共享附件引用', () => {
    data.selectWorkbenchPersona('groundSupervisor')
    const payload = valid({ drivingScore: '99999999999999999999', ownerOverride: 'ignored' })
    const saved = data.saveDriver(payload)
    expect(saved.drivingScore).toBe('99999999999999999999')
    expect(saved.ownerOverride).toBeUndefined()
    payload.licenseImage.name = 'changed.png'
    expect(saved.licenseImage.name).not.toBe('changed.png')
  })

  it('车辆候选未接入时保留现有关系，拒绝任意新增和修改分配', () => {
    data.selectWorkbenchPersona('groundSupervisor')
    const before = JSON.stringify(data.state.fleetDrivers)
    expect(() => data.saveDriver(valid({ vehicle: '任意车牌' }))).toThrow('车辆档案候选未接入')
    const existing = data.state.fleetDrivers[0]
    expect(() => data.saveDriver({ ...existing, vehicle: '' }, { id: existing.id })).toThrow('车辆档案候选未接入')
    expect(JSON.stringify(data.state.fleetDrivers)).toBe(before)
    expect(data.saveDriver({ ...existing, remark: '保留原车辆' }, { id: existing.id }).vehicle).toBe('沪A·DEMO1')
  })

  it('精确查询姓名或手机号，正常与休假按同一优先级拼音排序', () => {
    const base = data.state.fleetDrivers[0]
    const rows = [
      { ...base, id: 'A', name: '赵演示', status: '正常' },
      { ...base, id: 'B', name: '安演示', status: '已离职' },
      { ...base, id: 'C', name: '陈演示', status: '休假' },
    ]
    expect(filterDrivers(rows).map(row => row.id)).toEqual(['C', 'A', 'B'])
    expect(rows[0].id).toBe('A')
    expect(filterDrivers(rows, { keyword: '赵' })).toHaveLength(0)
    expect(filterDrivers(rows, { keyword: ' 赵演示 ' }).map(row => row.id)).toEqual(['A'])
    expect(filterDrivers(rows, { keyword: base.phone })).toHaveLength(3)
    expect(filterDrivers(rows, { keyword: base.identityNo })).toHaveLength(0)
    expect(filterDrivers(rows, { status: '休假', licenseClass: 'C1', employmentType: '货物运输' }).map(row => row.id)).toEqual(['C'])
  })

  it('证件到期预警使用同一演示日期和完整日历月', () => {
    expect(driverExpiryState('2026-10-08')).toBe('expiring')
    expect(driverExpiryState('2026-10-09')).toBe('')
    expect(driverExpiryState('2026-09-07')).toBe('expired')
    expect(driverExpiryState('2026-02-28', '2026-01-31')).toBe('expiring')
    expect(driverExpiryState('2026-03-01', '2026-01-31')).toBe('')
    expect(driverExpiryState('bad-date')).toBe('')
  })

  it('任务分组遵循明确状态，未确认的完成和应收指标不伪造为0', () => {
    const driver = data.state.fleetDrivers[0]
    const bills = ['待提货', '已卸货', '已完成', '已取消'].map((status, id) => ({ id, status, drivers: [{ name: driver.name }] }))
    const summary = deriveDriverTaskSummary(driver, { groundWaybills: bills })
    expect(summary.running.map(row => row.status)).toEqual(['待提货'])
    expect(summary.history.map(row => row.status)).toEqual(['已卸货', '已完成'])
    for (const metric of ['completed', 'year', 'month', 'week', 'amount']) expect(summary[metric]).toBeNull()
    expect(summary.statisticsReason).toContain('待确认')
  })
})

describe('GJ-017 证件文件', () => {
  it('合成附件包含可解码的PNG图像而不是文件名占位', () => {
    const sample = createDriverSampleAttachment()
    expect(validateDriverAttachment(sample)).toBe('')
    const png = Buffer.from(sample.dataUrl.split(',')[1], 'base64')
    expect(png.length).toBe(sample.size)
    expect(png.readUInt32BE(16)).toBe(220)
    expect(png.readUInt32BE(20)).toBe(100)
    const chunks = []
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset)
      if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length))
      offset += length + 12
    }
    expect(inflateSync(Buffer.concat(chunks)).length).toBe((220 * 4 + 1) * 100)
  })

  it('拒绝空文件、超限、错误格式、伪造后缀、缺失内容和不符的文件大小', () => {
    const sample = createDriverSampleAttachment()
    const invalid = [
      'filename.png', { ...sample, size: 0 }, { ...sample, size: DRIVER_ATTACHMENT_LIMIT + 1 },
      { ...sample, name: 'demo.gif', type: 'image/gif' }, { ...sample, name: 'demo.jpg', type: 'image/jpeg' },
      { ...sample, dataUrl: '' }, { ...sample, size: sample.size + 1 },
      { ...sample, dataUrl: 'data:image/png;base64,VEVYVA==', size: 4 },
    ]
    for (const file of invalid) expect(validateDriverAttachment(file)).not.toBe('')
  })

  it('三项必填证件不能用文件名绕过，选填资质证同样校验', () => {
    const errors = validateDriverDraft(valid({ idCardFront: 'front.png', idCardBack: null, licenseImage: null, qualificationImage: 'qualification.png' }))
    for (const key of ['idCardFront', 'idCardBack', 'licenseImage', 'qualificationImage']) expect(errors[key]).toBeTruthy()
  })
})
