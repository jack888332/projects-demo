import { normalizeDriver, validateDriverDraft } from '../domain/fleetOperations.js'
import { GROUND_NOW } from '../domain/groundOperations.js'
import { canMaintainFleet, createVehicleDraft, validateVehicleDraft, vehicleDrivers } from '../domain/fleetVehicles.js'
import { canViewFleetRecords, FLEET_RECORD_KINDS, fleetRecordDraft, validateFleetRecord } from '../domain/fleetRecords.js'

export function createFleetActions(state, getSession) {
  const canEdit = () => canMaintainFleet(getSession()?.role)
  function saveDriver(payload, { id = '' } = {}) {
    if (!canEdit()) throw new Error('仅航晟客服、主管或管理员可新增、修改司机信息')
    const current = id ? state.fleetDrivers.find(item => item.id === id) : null
    if (id && !current) throw new Error('司机记录不存在')
    const draft = normalizeDriver(payload)
    if (!id && draft.status !== '正常') throw new Error('新增司机状态为正常')
    const errors = validateDriverDraft(draft, state.fleetDrivers, { existingId: id, vehicles: state.fleetVehicles, waybills: state.groundWaybills })
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    if (id) {
      Object.assign(current, draft, { id, updatedAt: GROUND_NOW, updatedBy: getSession().name })
      return current
    }
    const serial = Math.max(0, ...state.fleetDrivers.map(driver => Number(/^DRV-(\d+)$/.exec(driver.id)?.[1] || 0))) + 1
    const next = { ...draft, id: `DRV-${String(serial).padStart(4, '0')}`, updatedAt: GROUND_NOW, updatedBy: getSession().name }
    state.fleetDrivers.unshift(next)
    return next
  }
  function saveVehicle(payload, { id = '' } = {}) {
    if (!canEdit()) throw new Error('仅航晟客服、主管或管理员可维护车辆档案')
    const current = state.fleetVehicles.find(row => row.id === id)
    if (id && !current) throw new Error('车辆档案不存在')
    const draft = createVehicleDraft()
    for (const key of Object.keys(draft)) if (payload[key] !== undefined) draft[key] = typeof payload[key] === 'string' ? payload[key].trim() : JSON.parse(JSON.stringify(payload[key]))
    const errors = validateVehicleDraft(draft, state, id)
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    const previousDrivers = vehicleDrivers(current, state)
    const { driverIds, ...fields } = draft
    const serial = Math.max(0, ...state.fleetVehicles.map(row => Number(row.id.replace('VEH-', '')) || 0)) + 1
    const saved = current || { id: `VEH-${String(serial).padStart(4, '0')}` }
    Object.assign(saved, fields, { updatedAt: GROUND_NOW, updatedBy: getSession().name })
    if (!current) state.fleetVehicles.unshift(saved)
    // Current assignments have one owner: driver.vehicle. Vehicle projections derive the inverse.
    for (const driver of state.fleetDrivers) {
      if (!driverIds.includes(driver.id) && !previousDrivers.includes(driver)) continue
      const vehicle = driverIds.includes(driver.id) ? saved.plate : ''
      if (driver.vehicle !== vehicle) Object.assign(driver, { vehicle, updatedAt: GROUND_NOW, updatedBy: getSession().name })
    }
    return saved
  }
  function saveFleetRecord(kind, payload, { id = '' } = {}) {
    if (!FLEET_RECORD_KINDS[kind] || !canViewFleetRecords(getSession()?.role, kind)) throw new Error('当前角色无此台账维护权限')
    const records = state[FLEET_RECORD_KINDS[kind].stateKey]
    if (id && !records.some(row => row.id === id)) throw new Error('台账记录不存在')
    const draft = fleetRecordDraft(kind, payload), errors = validateFleetRecord(kind, draft, state)
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    throw new Error(FLEET_RECORD_KINDS[kind].blocker)
  }
  function deleteFleetRecord() { throw new Error('台账删除权限及关联处理待确认（147）') }
  return { saveDriver, saveVehicle, saveFleetRecord, deleteFleetRecord }
}
