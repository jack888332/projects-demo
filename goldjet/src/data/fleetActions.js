import { normalizeDriver, validateDriverDraft } from '../domain/fleetOperations.js'
import { GROUND_NOW } from '../domain/groundOperations.js'

export function createFleetActions(state, getSession) {
  const canEdit = () => ['supervisor', 'admin'].includes(getSession()?.role)
  function saveDriver(payload, { id = '' } = {}) {
    if (!canEdit()) throw new Error('仅航晟主管或管理员可新增、修改司机信息')
    const current = id ? state.fleetDrivers.find(item => item.id === id) : null
    if (id && !current) throw new Error('司机记录不存在')
    const draft = normalizeDriver(payload)
    if (!id && draft.status !== '正常') throw new Error('新增司机状态为正常')
    const errors = validateDriverDraft(draft, state.fleetDrivers, { existingId: id })
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
  return { saveDriver }
}
