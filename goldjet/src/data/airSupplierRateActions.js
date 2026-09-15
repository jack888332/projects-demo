import {
  AIR_RATE_NOW, getAirSupplierRateAction, getAirSupplierRatePermissions,
  normalizeAirSupplierRateDraft, validateAirSupplierRateDraft,
} from '../domain/airSupplierRates.js'

const clone = value => JSON.parse(JSON.stringify(value))

export function createAirSupplierRateActions(state, getSession) {
  const requirePermission = () => {
    const permissions = getAirSupplierRatePermissions(getSession().role)
    if (!permissions.edit) throw new Error(permissions.reason)
  }
  const findRate = id => {
    const row = state.airSupplierRates.find(rate => rate.id === id)
    if (!row) throw new Error('空运供应商价格规则不存在')
    return row
  }
  const nextSequence = () => Math.max(
    Number.isSafeInteger(state.airSupplierRateSequence) && state.airSupplierRateSequence >= 0 ? state.airSupplierRateSequence : 0,
    ...state.airSupplierRates.map(row => Number.isSafeInteger(row.updateSequence) && row.updateSequence >= 0 ? row.updateSequence : 0),
  ) + 1
  const validate = (draft, options) => {
    const fields = validateAirSupplierRateDraft(draft, state, options)
    if (Object.keys(fields).length) throw Object.assign(new Error(Object.values(fields)[0]), { fields })
  }
  function saveAirSupplierRate(payload) {
    requirePermission()
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Object.assign(new Error('价格规则格式不正确'), { fields: { rate: '价格规则格式不正确' } })
    const draft = normalizeAirSupplierRateDraft(payload)
    const existing = draft.id ? findRate(draft.id) : null
    validate(draft, { existing })
    let sequence = nextSequence()
    if (!existing) {
      draft.id = `ASR-${String(sequence).padStart(8, '0')}`
      while (state.airSupplierRates.some(row => row.id === draft.id)) {
        sequence += 1
        draft.id = `ASR-${String(sequence).padStart(8, '0')}`
      }
    }
    const record = {
      ...clone(draft), status: existing?.status || '已生效', creator: existing?.creator || getSession().name,
      updatedBy: getSession().name, updatedAt: AIR_RATE_NOW, updateSequence: sequence,
    }
    if (existing) Object.assign(existing, record)
    else state.airSupplierRates.push(record)
    state.airSupplierRateSequence = sequence
    return existing || record
  }
  function setAirSupplierRateActive(id, active) {
    requirePermission()
    if (typeof active !== 'boolean') throw new Error('请选择启用或失效操作')
    const row = findRate(id)
    const action = getAirSupplierRateAction(row, active ? 'enable' : 'disable')
    if (!action.allowed) throw new Error(action.reason)
    if (active) validate(row, { existing: row, activating: true })
    const sequence = nextSequence()
    row.status = active ? '已生效' : '失效'
    row.updatedBy = getSession().name
    row.updatedAt = AIR_RATE_NOW
    row.updateSequence = sequence
    state.airSupplierRateSequence = sequence
    return row
  }
  return { saveAirSupplierRate, setAirSupplierRateActive }
}
