import {
  CAPACITY_NOW, canEditCapacityNote, getCapacityEditRestriction, normalizeCapacityDraft, validateCapacityDraft,
} from '../domain/airCapacity.js'

const clone = value => JSON.parse(JSON.stringify(value))

export function createCapacityActions(state, getSession) {
  const requireOperator = () => {
    if (getSession().role !== 'operator') throw new Error('仅航线运营可维护舱位产品')
  }
  const findProduct = id => {
    const product = state.capacityProducts.find(row => row.id === id)
    if (!product) throw new Error('舱位产品不存在')
    return product
  }
  const nextSequence = () => {
    const current = Math.max(
      Number.isSafeInteger(state.capacitySequence) && state.capacitySequence >= 0 ? state.capacitySequence : 0,
      ...state.capacityProducts.map(row => Number.isSafeInteger(row.updateSequence) && row.updateSequence >= 0 ? row.updateSequence : 0),
    )
    if (current >= Number.MAX_SAFE_INTEGER) throw new Error('演示序号已用尽，请恢复演示数据')
    return current + 1
  }
  function saveCapacityProduct(payload) {
    requireOperator()
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('舱位产品格式不正确')
    const draft = normalizeCapacityDraft(payload)
    if (draft.id !== undefined && (typeof draft.id !== 'string' || !draft.id)) throw new Error('舱位产品标识不正确')
    const existing = draft.id ? findProduct(draft.id) : null
    if (existing) {
      const reason = getCapacityEditRestriction(existing, state, getSession())
      if (reason) throw new Error(reason)
    }
    const fields = validateCapacityDraft(draft, state, { existing })
    if (Object.keys(fields).length) throw Object.assign(new Error(Object.values(fields)[0]), { fields })
    let sequence = nextSequence()
    if (!existing) {
      while (state.capacityProducts.some(row => row.id === `CAP-${String(sequence).padStart(8, '0')}`)) {
        if (sequence >= Number.MAX_SAFE_INTEGER) throw new Error('演示序号已用尽，请恢复演示数据')
        sequence += 1
      }
      draft.id = `CAP-${String(sequence).padStart(8, '0')}`
    }
    const record = {
      ...clone(draft), creator: existing?.creator || getSession().name, createdAt: existing?.createdAt || CAPACITY_NOW,
      remark: existing?.remark || '', updatedAt: CAPACITY_NOW, updatedBy: getSession().name, updateSequence: sequence,
    }
    if (existing) Object.assign(existing, record)
    else state.capacityProducts.push(record)
    state.capacitySequence = sequence
    return existing || record
  }
  function saveCapacityNote(id, remark) {
    requireOperator()
    const product = findProduct(id)
    if (!canEditCapacityNote(product, getSession())) throw new Error('仅当前绑定的航线运营可编辑该产品备注')
    if (typeof remark !== 'string') throw new Error('备注须为文本')
    const sequence = nextSequence()
    product.remark = remark.trim()
    product.updatedAt = CAPACITY_NOW
    product.updatedBy = getSession().name
    product.updateSequence = sequence
    state.capacitySequence = sequence
    return product
  }
  return { saveCapacityProduct, saveCapacityNote }
}
