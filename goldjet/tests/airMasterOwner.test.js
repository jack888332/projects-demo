import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { createAirMasterActions, getAirMasterReferences, validateAirMasterSave } from '../src/data/airMasterActions.js'
import { createAirMasterDraft, validateAirMasterDraft } from '../src/domain/airMasterData.js'
import { createAirDraft, createBookingDraft, validateAirDraft, validateBookingDraft } from '../src/domain/airOperations.js'

const data = usePrototypeData()
const copy = value => JSON.parse(JSON.stringify(value))
const portDraft = (changes = {}) => ({
  ...createAirMasterDraft('ports'), code: 'DEM', name: '新增演示机场', englishName: 'New Demo Airport',
  country: 'China', countryCode: 'CN', city: 'Shanghai', cityCode: 'SHA', continent: '亚洲', ...changes,
})
const flightDraft = (changes = {}) => ({
  ...createAirMasterDraft('flights'), code: 'MU9910', airlineCode: 'MU', origin: 'PVG', destination: 'CAN',
  station: 'ST-MU', weekdays: [1, 2, 4], takeoffTime: '16:00', arrivalTime: '18:00', cutoffTime: '10:00',
  cutoffDays: -1, model: 'A330-DEMO', aircraftType: '货机', ...changes,
})
const airlineDraft = (changes = {}) => ({
  ...createAirMasterDraft('airlines'), code: 'Q1', name: '新增演示航空', supplierIds: ['PT-00028'], prefix: '999', ...changes,
})
const airDraft = (changes = {}) => ({
  ...createAirDraft(), customer: '启航跨境贸易', owner: '周倩', origin: 'PVG', destination: 'LAX',
  product: 'MU-GENERAL', pieces: 10, grossWeight: 80, volume: 0.5, sellRate: 28, ...changes,
})
const bookingDraft = (order, flight) => ({
  ...createBookingDraft(order), airline: flight.airline, flight: flight.code, departureDate: '2026-09-10',
  firstDestination: flight.destination, firstLeg: flight.firstLeg, takeoffTime: flight.takeoffTime,
  cutoffTime: flight.cutoffTime, airCost: 24, guidePrice: 28, waybillType: '自营',
  secondDestination: 'NRT', secondLeg: 'CAN - NRT', thirdLeg: 'NRT - LAX', routeType: '国内中转',
})

beforeEach(() => data.reset())

describe('GJ-004 owner：主数据维护—共享候选—建单订舱', () => {
  it('初始主数据全部遵守同一校验，航司供应商绑定生效档案', () => {
    for (const kind of ['airlines', 'ports', 'flights', 'pallets']) for (const row of data.state.airMaster[kind]) {
      expect(validateAirMasterDraft(kind, row, data.state.airMaster, data.state.partners, { existing: row })).toEqual({})
    }
    expect(data.state.partners.find(row => row.id === 'PT-00028')).toMatchObject({ code: 'S00028', status: '已生效' })
    expect(data.state.partners.find(row => row.id === 'PT-00029')).toMatchObject({ code: 'S00029', status: '已生效' })
  })

  it('新增空港与航班立即进入共享候选，建单后可使用新航班确认订舱', () => {
    data.selectWorkbenchPersona('masterAdmin')
    const port = data.saveAirMaster('ports', portDraft())
    const payload = flightDraft({ origin: port.code })
    const flight = data.saveAirMaster('flights', payload)
    payload.origin = 'FORGED'
    expect(flight.origin).toBe('DEM')
    expect(data.airCatalog.value.ports).toContainEqual({ code: 'DEM', name: '新增演示机场' })
    expect(data.airCatalog.value.legs).toContain('DEM - CAN')
    const projected = data.airCatalog.value.flights.find(row => row.code === flight.code)
    expect(projected).toMatchObject({ airline: '东方航空', takeoffTime: '16:00', cutoffTime: '10:00' })
    data.selectWorkbenchPersona('service')
    const draft = airDraft({ origin: 'DEM' })
    expect(validateAirDraft(draft, data.state.partners, data.airCatalog.value)).toEqual({})
    const order = data.createAirOrder(draft)
    data.selectWorkbenchPersona('operator')
    const booking = bookingDraft(order, projected)
    expect(validateBookingDraft(booking, data.airCatalog.value)).toEqual({})
    data.saveAirBooking(order.id, booking)
    expect(order).toMatchObject({ origin: 'DEM', bookingStatus: '服务中', flight: flight.code })
    expect(order.booking.firstLeg).toBe('DEM - CAN')
  })

  it('明确的角色权限在 owner 生效，不由页面按钮独自保护', () => {
    const snapshot = JSON.stringify(data.state.airMaster)
    expect(() => data.saveAirMaster('ports', portDraft())).toThrow('维护权限')
    data.selectWorkbenchPersona('masterRoute')
    expect(data.airMasterSession.value.role).toBe('routeStaff')
    expect(data.airSession.role).toBe('viewer')
    data.selectWorkbenchPersona('masterFinance')
    expect(() => data.saveAirMaster('ports', portDraft())).toThrow('仅维护航司')
    expect(JSON.stringify(data.state.airMaster)).toBe(snapshot)
    const airline = data.saveAirMaster('airlines', airlineDraft())
    expect(data.deleteAirMaster('airlines', [airline.id])).toBe(1)
    const denied = createAirMasterActions(data.state, () => ({ role: 'unknown' }))
    expect(() => denied.saveAirMaster('ports', portDraft())).toThrow('维护权限')
  })

  it('航线专员可从新增航司经编辑到删除，权限摘要缺项不阻断详细授权', () => {
    data.selectWorkbenchPersona('masterRoute')
    const airline = data.saveAirMaster('airlines', airlineDraft())
    expect(airline).toMatchObject({ code: 'Q1', name: '新增演示航空' })
    data.saveAirMaster('airlines', { ...copy(airline), accountNo: 'DEMO-001' })
    expect(airline.accountNo).toBe('DEMO-001')
    expect(data.deleteAirMaster('airlines', [airline.id])).toBe(1)
  })

  it('界面预校验与 owner 保存共用字段、引用校验及输入规范化，不修改数据', () => {
    data.selectWorkbenchPersona('masterRoute')
    const existing = data.state.airMaster.airlines[0]
    const before = JSON.stringify(data.state.airMaster)
    const payload = { ...copy(existing), name: '不可迁移的演示航司', prefix: 'bad' }
    const errors = validateAirMasterSave('airlines', payload, data.state, { existing })
    expect(errors).toHaveProperty('name', expect.stringContaining('引用'))
    expect(errors).toHaveProperty('prefix', '提单前缀须为 3 位数字')
    try {
      data.saveAirMaster('airlines', payload)
      expect.unreachable('应拒绝保存')
    } catch (error) {
      expect(error.fields).toEqual(errors)
    }
    expect(validateAirMasterSave('airlines', { ...copy(existing), name: ` ${existing.name} ` }, data.state, { existing })).toEqual({})
    expect(validateAirMasterSave('unknown', {}, data.state)).toEqual({ kind: '未知空运主数据类别' })
    expect(JSON.stringify(data.state.airMaster)).toBe(before)
  })

  it('已引用的航司、空港、航班不能改身份或删除，但时刻等非引用字段可维护', () => {
    data.selectWorkbenchPersona('masterRoute')
    for (const [kind, id, changes] of [
      ['airlines', 'AIRLINE-MU', { name: '改名演示航司' }],
      ['ports', 'PORT-PVG', { code: 'NEW' }],
      ['flights', 'FLIGHT-MU9001', { code: 'MU9999' }],
      ['flights', 'FLIGHT-MU9001', { origin: 'SZX' }],
    ]) {
      const row = data.state.airMaster[kind].find(item => item.id === id)
      const before = JSON.stringify(data.state.airMaster)
      expect(getAirMasterReferences(data.state, kind, row).length).toBeGreaterThan(0)
      expect(() => data.saveAirMaster(kind, { ...copy(row), ...changes })).toThrow('引用')
      expect(() => data.deleteAirMaster(kind, [id])).toThrow('引用')
      expect(JSON.stringify(data.state.airMaster)).toBe(before)
    }
    const row = data.state.airMaster.flights.find(item => item.id === 'FLIGHT-MU9001')
    data.saveAirMaster('flights', { ...copy(row), takeoffTime: '21:00' })
    expect(data.airCatalog.value.flights.find(item => item.code === row.code).takeoffTime).toBe('21:00')
    expect(data.state.airOrders[0].booking.takeoffTime).toBe('20:00')
  })

  it('输入无效、重复主键和未知记录不修改数据或消耗编号', () => {
    data.selectWorkbenchPersona('masterAdmin')
    const snapshot = JSON.stringify(data.state.airMaster)
    expect(() => data.saveAirMaster('ports', portDraft({ code: 'PVG' }))).toThrow()
    expect(() => data.saveAirMaster('flights', flightDraft({ airlineCode: 'UNKNOWN' }))).toThrow()
    expect(() => data.saveAirMaster('ports', { ...portDraft(), id: 'FORGED' })).toThrow('不存在')
    expect(() => data.saveAirMaster('unknown', {})).toThrow('未知')
    expect(JSON.stringify(data.state.airMaster)).toBe(snapshot)
    expect(data.state.airMasterSequence).toBe(0)
    const port = data.saveAirMaster('ports', { ...portDraft(), createdAt: 'FORGED' })
    expect(port.id).toBe('MASTER-PORTS-00001')
    expect(port.createdAt).toBeUndefined()
  })

  it('批量删除先验证全部记录；包含引用对象时不部分删除', () => {
    data.selectWorkbenchPersona('masterRoute')
    const port = data.saveAirMaster('ports', portDraft())
    const snapshot = JSON.stringify(data.state.airMaster)
    expect(() => data.deleteAirMaster('ports', [port.id, 'PORT-PVG'])).toThrow('引用')
    expect(() => data.deleteAirMaster('ports', [port.id, 'FORGED'])).toThrow('不存在')
    expect(() => data.deleteAirMaster('ports', [port.id, port.id])).toThrow('不重复')
    expect(JSON.stringify(data.state.airMaster)).toBe(snapshot)
    expect(data.deleteAirMaster('ports', [port.id])).toBe(1)
    expect(data.airCatalog.value.ports.some(row => row.code === port.code)).toBe(false)
    data.selectWorkbenchPersona('service')
    expect(() => data.createAirOrder(airDraft({ origin: port.code }))).toThrow('港口')
  })

  it('批量删除重复航段的全部航班也不能破坏已保存订舱航段', () => {
    data.selectWorkbenchPersona('masterRoute')
    const old = data.state.airMaster.flights.find(row => row.origin === 'NRT' && row.destination === 'LAX')
    const extra = data.saveAirMaster('flights', flightDraft({ code: 'MU9911', origin: 'NRT', destination: 'LAX' }))
    const snapshot = JSON.stringify(data.state.airMaster)
    expect(() => data.deleteAirMaster('flights', [old.id, extra.id])).toThrow('航段')
    expect(JSON.stringify(data.state.airMaster)).toBe(snapshot)
    expect(data.deleteAirMaster('flights', [extra.id])).toBe(1)
  })

  it('删除未引用航班后旧草稿不能绕过实时校验，失败保留原订舱', () => {
    data.selectWorkbenchPersona('masterAdmin')
    const flight = data.saveAirMaster('flights', flightDraft())
    data.selectWorkbenchPersona('service')
    const order = data.createAirOrder(airDraft())
    const draft = bookingDraft(order, data.airCatalog.value.flights.find(row => row.code === flight.code))
    data.selectWorkbenchPersona('masterRoute')
    data.deleteAirMaster('flights', [flight.id])
    data.selectWorkbenchPersona('operator')
    const before = JSON.stringify(order)
    expect(() => data.saveAirBooking(order.id, draft)).toThrow('头程航班')
    expect(JSON.stringify(order)).toBe(before)
  })

  it('重置从确定 seed 恢复主数据、编号和只读会话', () => {
    const initial = JSON.stringify(data.state.airMaster)
    data.selectWorkbenchPersona('masterAdmin')
    const first = data.saveAirMaster('ports', portDraft())
    data.reset()
    expect(JSON.stringify(data.state.airMaster)).toBe(initial)
    expect(data.airMasterSession.value.role).toBe('viewer')
    data.selectWorkbenchPersona('masterAdmin')
    expect(data.saveAirMaster('ports', portDraft()).id).toBe(first.id)
  })
})
