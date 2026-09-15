import { describe, expect, it } from 'vitest'
import {
  AIR_MASTER_FIELDS, createAirMasterDraft, createAirMasterSeed, deriveAirCatalog,
  getAirMasterPermission, validateAirMasterDraft,
} from '../src/domain/airMasterData.js'

const suppliers = [
  { id: 'PT-00027', name: '东方航空', type: '供应商', status: '已生效' },
  { id: 'PT-00028', name: '南方航空', type: '供应商', status: '已生效' },
  { id: 'PT-00029', name: '全日空', type: '供应商', status: '已生效' },
]
const clone = value => JSON.parse(JSON.stringify(value))

describe('GJ-004 空运主数据 seed 与草稿', () => {
  it('固定 seed 互不共享引用，并由现有航段生成有效航班，保留当前订舱路径', () => {
    const first = createAirMasterSeed(), second = createAirMasterSeed()
    expect(first).toEqual(second)
    first.airlines[0].supplierIds.push('different')
    expect(second.airlines[0].supplierIds).toEqual(['PT-00027'])
    const catalog = deriveAirCatalog(second)
    expect(catalog.ports).toHaveLength(8)
    expect(catalog.legs).toEqual(['PVG - CAN', 'SZX - CAN', 'NRT - PVG', 'CAN - NRT', 'NRT - LAX', 'NRT - FRA', 'NRT - AMS', 'NRT - SIN'])
    expect(catalog.flights.find(row => row.code === 'MU9001')).toMatchObject({ airline: '东方航空', origin: 'PVG', destination: 'CAN', firstLeg: 'PVG - CAN', takeoffTime: '20:00', cutoffTime: '16:00', palletCompany: 'MU 货站打板' })
  })

  it('全部 seed 记录在明确的合成供应商候选下通过字段及关联校验', () => {
    const master = createAirMasterSeed()
    for (const kind of ['airlines', 'ports', 'flights', 'pallets']) {
      for (const record of master[kind]) expect(validateAirMasterDraft(kind, record, master, suppliers, { existing: record })).toEqual({})
    }
  })

  it('字段 schema 覆盖四类对象，草稿除明示承运人外不设置业务默认值', () => {
    for (const kind of ['airlines', 'ports', 'flights', 'pallets']) expect(Object.keys(createAirMasterDraft(kind))).toEqual(AIR_MASTER_FIELDS[kind].map(field => field.key))
    expect(createAirMasterDraft('airlines').issuingCarrier).toBe('GUANGDONG GOLDJET INT’L LOGISTICS CO.,LTD')
    expect(createAirMasterDraft('flights').weekdays).toEqual([])
    expect(createAirMasterDraft('flights').arrivalDay).toBe('')
    expect(createAirMasterDraft('flights').cutoffDays).toBe('')
    expect(() => createAirMasterDraft('missing')).toThrow('未知')
  })
})

describe('GJ-004 航司', () => {
  it('航司代码选填但非空须二字，名称与代码唯一，排除当前记录', () => {
    const master = createAirMasterSeed(), existing = master.airlines[0]
    expect(validateAirMasterDraft('airlines', existing, master, suppliers, { existing })).toEqual({})
    const noCode = { ...existing, code: '', prefix: '123', name: '新演示航司' }
    expect(validateAirMasterDraft('airlines', noCode, master, suppliers)).toEqual({})
    expect(validateAirMasterDraft('airlines', { ...noCode, code: 'TOOLONG' }, master, suppliers)).toHaveProperty('code')
    expect(validateAirMasterDraft('airlines', { ...noCode, code: 'A' }, master, suppliers).code).toBe('航司代码须为两位大写字母或数字')
    expect(validateAirMasterDraft('airlines', { ...noCode, code: 'MU' }, master, suppliers)).toHaveProperty('code')
    expect(validateAirMasterDraft('airlines', { ...noCode, name: '东方航空' }, master, suppliers)).toHaveProperty('name')
    expect(validateAirMasterDraft('airlines', { ...noCode, name: '航' }, master, suppliers)).toHaveProperty('name')
  })

  it('提单前缀须三位数字，重复冲突只阻断该字段', () => {
    const master = createAirMasterSeed(), draft = { ...master.airlines[0], name: '新演示航司', code: 'AB' }
    expect(validateAirMasterDraft('airlines', draft, master, suppliers)).toEqual({ prefix: '提单前缀存在可重复与不可重复两种口径，重复前缀路径待确认' })
    expect(validateAirMasterDraft('airlines', { ...draft, prefix: '001' }, master, suppliers)).toEqual({})
    expect(validateAirMasterDraft('airlines', { ...draft, prefix: '1' }, master, suppliers)).toHaveProperty('prefix')
  })

  it('供应商关联使用生效档案 ID，可多选但不能重复、失效或选择客户', () => {
    const master = createAirMasterSeed(), existing = master.airlines[0]
    const validate = supplierIds => validateAirMasterDraft('airlines', { ...existing, supplierIds }, master, [...suppliers, { id: 'customer', type: '客户', status: '已生效' }, { id: 'disabled', type: '供应商', status: '已失效' }], { existing })
    expect(validate(['PT-00027', 'PT-00028'])).toEqual({})
    for (const values of [[], ['PT-00027', 'PT-00027'], ['customer'], ['disabled'], ['missing']]) expect(validate(values)).toHaveProperty('supplierIds')
  })
})

describe('GJ-004 空港', () => {
  it('三字代码、中英文名唯一，国家城市和对应代码必须来自同一代码表', () => {
    const master = createAirMasterSeed(), existing = master.ports[0]
    const validate = changes => validateAirMasterDraft('ports', { ...existing, ...changes }, master, suppliers, { existing })
    expect(validate({})).toEqual({})
    expect(validate({ code: 'PP' }).code).toBe('空港代码须为三位大写字母')
    expect(validate({ code: 'CAN' })).toHaveProperty('code')
    expect(validate({ name: master.ports[1].name })).toHaveProperty('name')
    expect(validate({ englishName: master.ports[1].englishName })).toHaveProperty('englishName')
    expect(validate({ countryCode: 'JP' })).toHaveProperty('countryCode')
    expect(validate({ city: 'Tokyo', cityCode: 'TYO' })).toHaveProperty('city')
    expect(validate({ cityCode: 'WRONG' })).toHaveProperty('cityCode')
    expect(validate({ country: 'Unknown' })).toHaveProperty('country')
    expect(validate({ continent: '未知洲' })).toHaveProperty('continent')
    expect(validate({ country: 'Japan', countryCode: 'JP', city: 'Tokyo', cityCode: 'TYO' })).toEqual({})
  })
})

describe('GJ-004 航班', () => {
  it('关联货站、航司、始发目的港，班期必须来自周一至周日且不重复', () => {
    const master = createAirMasterSeed(), existing = master.flights[0]
    const validate = changes => validateAirMasterDraft('flights', { ...existing, ...changes }, master, suppliers, { existing })
    expect(validate({})).toEqual({})
    for (const field of ['station', 'airlineCode', 'origin', 'destination']) expect(validate({ [field]: 'missing' })).toHaveProperty(field)
    for (const weekdays of [[], [0], [8], [1, 1], '1+3']) expect(validate({ weekdays })).toHaveProperty('weekdays')
    expect(validate({ weekdays: [1, 2, 3, 4, 5, 6, 7] })).toEqual({})
    expect(validate({ aircraftType: '未知类型' })).toHaveProperty('aircraftType')
  })

  it('时刻 HH:MM，截单天数支持任何非正整数而非仅限制 -1/0', () => {
    const master = createAirMasterSeed(), existing = master.flights[0]
    const validate = changes => validateAirMasterDraft('flights', { ...existing, ...changes }, master, suppliers, { existing })
    expect(validate({ cutoffDays: -3, takeoffTime: '00:00', arrivalTime: '23:59' })).toEqual({})
    for (const cutoffDays of [1, -0.5, '', 'abc']) expect(validate({ cutoffDays })).toHaveProperty('cutoffDays')
    for (const field of ['takeoffTime', 'arrivalTime', 'cutoffTime']) {
      for (const value of ['24:00', '12:60', '9:30', '2026-09-08']) expect(validate({ [field]: value })).toHaveProperty(field)
    }
  })

  it('到达时间含义冲突不阻断其他航班字段，非空写入待确认', () => {
    const master = createAirMasterSeed(), existing = master.flights[0]
    expect(validateAirMasterDraft('flights', { ...existing, arrivalDay: 1 }, master, suppliers, { existing })).toHaveProperty('arrivalDay')
    const historical = { ...existing, arrivalDay: 0 }
    expect(validateAirMasterDraft('flights', { ...historical, takeoffTime: '09:00' }, master, suppliers, { existing: historical })).toEqual({})
    expect(validateAirMasterDraft('flights', { ...historical, arrivalDay: '' }, master, suppliers, { existing: historical })).toHaveProperty('arrivalDay')
  })
})

describe('GJ-004 板型与角色权限', () => {
  it('板型唯一、物理量为正数，尺寸顺序为长×高×宽，别称可空', () => {
    const master = createAirMasterSeed(), existing = master.pallets[0]
    const validate = changes => validateAirMasterDraft('pallets', { ...existing, ...changes }, master, suppliers, { existing })
    expect(validate({ alias: '' })).toEqual({})
    expect(validate({ dimensions: '3.18 x 1.53 x 2.44' })).toEqual({})
    for (const field of ['volume', 'maxWeight']) for (const value of ['', 0, -1, 'abc']) expect(validate({ [field]: value })).toHaveProperty(field)
    for (const dimensions of ['3×2', '3×0×2', '3x2x1x4', '3m×2m×1m']) expect(validate({ dimensions })).toHaveProperty('dimensions')
    expect(validateAirMasterDraft('pallets', existing, master, suppliers)).toHaveProperty('code')
  })

  it('航线专员按详细场景可新增航司，管理员未明确删除权限仍禁用', () => {
    expect(getAirMasterPermission('airlines', 'routeStaff')).toMatchObject({ create: true, edit: true, delete: true, reason: '' })
    expect(getAirMasterPermission('ports', 'routeStaff')).toMatchObject({ create: true, edit: true, delete: true })
    expect(getAirMasterPermission('airlines', 'financeStaff')).toMatchObject({ create: true, edit: true, delete: true })
    expect(getAirMasterPermission('flights', 'financeStaff')).toMatchObject({ create: false, edit: false, delete: false })
    expect(getAirMasterPermission('airlines', 'admin')).toMatchObject({ create: true, edit: true, delete: false })
    expect(getAirMasterPermission('pallets', 'admin')).toMatchObject({ create: true, edit: true, delete: false })
    expect(getAirMasterPermission('flights', 'viewer')).toMatchObject({ create: false, edit: false, delete: false })
    expect(getAirMasterPermission('missing', 'admin')).toMatchObject({ create: false, edit: false, delete: false })
  })
})

describe('GJ-004 对订单/订舱的纯派生目录', () => {
  it('目录读取当前主数据，更新航司/货站/航班后即时反映，不回退旧常量', () => {
    const master = createAirMasterSeed()
    master.airlines[0].name = '修改后的合成航司'
    master.flights[0].takeoffTime = '21:00'
    master.stations[0].palletCompany = '修改后的合成打板公司'
    const snapshot = JSON.stringify(master)
    const catalog = deriveAirCatalog(master)
    expect(catalog.flights[0]).toMatchObject({ airline: '修改后的合成航司', takeoffTime: '21:00', palletCompany: '修改后的合成打板公司' })
    catalog.ports[0].name = '不可影响主数据'
    expect(JSON.stringify(master)).toBe(snapshot)
    const altered = clone(master)
    altered.flights = altered.flights.filter(row => row.code !== 'MU9001')
    expect(deriveAirCatalog(altered).legs).not.toContain('PVG - CAN')
  })

  it('悬空航司或港口引用不生成可选航班，相同航段只保留一项', () => {
    const master = createAirMasterSeed()
    master.flights.push({ ...master.flights[0], code: 'MU9999' })
    expect(deriveAirCatalog(master).legs.filter(value => value === 'PVG - CAN')).toHaveLength(1)
    master.airlines = master.airlines.filter(row => row.code !== 'MU')
    expect(deriveAirCatalog(master).flights.some(row => row.code === 'MU9001')).toBe(false)
    master.ports = master.ports.filter(row => row.code !== 'NRT')
    expect(deriveAirCatalog(master).flights.some(row => row.origin === 'NRT' || row.destination === 'NRT')).toBe(false)
  })
})
