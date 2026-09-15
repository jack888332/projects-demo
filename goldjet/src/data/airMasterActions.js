import { AIR_MASTER_FIELDS, getAirMasterPermission, validateAirMasterDraft } from '../domain/airMasterData.js'
import { AIR_PRODUCTS } from '../domain/airOperations.js'

const clone = value => JSON.parse(JSON.stringify(value))
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const legOf = row => `${row.origin} - ${row.destination}`
const bookingLegs = booking => ['firstLeg', 'secondLeg', 'thirdLeg'].map(key => booking?.[key]).filter(Boolean)
const normalizeDraft = (kind, payload) => Object.fromEntries(AIR_MASTER_FIELDS[kind].map(field => {
  const value = payload[field.key]
  return [field.key, typeof value === 'string' ? value.trim() : clone(value ?? (field.type === 'multiselect' ? [] : ''))]
}))

// Records in use remain stable until the PRD defines how downstream references migrate.
export function getAirMasterReferences(state, kind, row) {
  const master = state.airMaster
  const refs = []
  const add = (label, found) => { if (found) refs.push(label) }
  if (kind === 'airlines') {
    add('航班计划', master.flights.some(item => item.airlineCode === row.code))
    add('板型', master.pallets.some(item => item.airlineCode === row.code))
    add('航司产品', AIR_PRODUCTS.some(item => item.airline === row.name))
    add('空运订单或订舱', state.airOrders.some(item => item.supplier === row.name || item.booking?.airline === row.name))
  }
  if (kind === 'ports') {
    add('航班计划', master.flights.some(item => item.origin === row.code || item.destination === row.code))
    add('空运订单或订舱', state.airOrders.some(item =>
      [item.origin, item.destination, item.booking?.firstDestination, item.booking?.secondDestination].includes(row.code)
      || bookingLegs(item.booking).some(leg => leg.split(' - ').includes(row.code))))
  }
  if (kind === 'flights') {
    add('订舱航班', state.airOrders.some(item => item.flight === row.code || item.booking?.flight === row.code))
    const isOnlyLeg = !master.flights.some(item => item.id !== row.id && legOf(item) === legOf(row))
    add('订舱航段', isOnlyLeg && state.airOrders.some(item => bookingLegs(item.booking).includes(legOf(row))))
  }
  return refs
}

export function validateAirMasterSave(kind, payload, state, { existing = null } = {}) {
  if (!Object.hasOwn(AIR_MASTER_FIELDS, kind)) return { kind: '未知空运主数据类别' }
  const draft = normalizeDraft(kind, payload)
  const errors = validateAirMasterDraft(kind, draft, state.airMaster, state.partners, { existing })
  if (existing) {
    const references = getAirMasterReferences(state, kind, existing)
    const identityFields = kind === 'airlines' ? ['code', 'name'] : kind === 'flights' ? ['code', 'airlineCode', 'origin', 'destination'] : ['code']
    if (references.length) for (const field of identityFields) {
      if (!same(draft[field], existing[field])) errors[field] = `已被${references.join('、')}引用；引用迁移规则待确认，暂不能修改此字段`
    }
  }
  return errors
}

export function createAirMasterActions(state, getSession) {
  const requireKind = kind => {
    if (!Object.hasOwn(AIR_MASTER_FIELDS, kind)) throw new Error('未知空运主数据类别')
  }
  const requireAction = (kind, action) => {
    requireKind(kind)
    const permission = getAirMasterPermission(kind, getSession().role)
    if (!permission[action]) throw new Error(permission.reason || '当前角色没有此项空运主数据维护权限')
  }
  function saveAirMaster(kind, payload) {
    requireKind(kind)
    const existing = payload.id ? state.airMaster[kind].find(row => row.id === payload.id) : null
    if (payload.id && !existing) throw new Error('主数据记录不存在，请刷新后重试')
    requireAction(kind, existing ? 'edit' : 'create')
    const draft = normalizeDraft(kind, payload)
    const errors = validateAirMasterSave(kind, draft, state, { existing })
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    // All validation is complete before changing records or consuming a deterministic identifier.
    if (existing) {
      Object.assign(existing, draft)
      return existing
    }
    const id = `MASTER-${kind.toUpperCase()}-${String(state.airMasterSequence + 1).padStart(5, '0')}`
    state.airMaster[kind].push({ ...draft, id })
    state.airMasterSequence += 1
    return state.airMaster[kind].at(-1)
  }
  function deleteAirMaster(kind, ids) {
    requireAction(kind, 'delete')
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('请选择不重复的主数据记录')
    const records = ids.map(id => state.airMaster[kind].find(row => row.id === id))
    if (records.some(row => !row)) throw new Error('主数据记录不存在，请刷新后重试')
    for (const row of records) {
      const references = getAirMasterReferences(state, kind, row)
      if (references.length) throw new Error(`${row.code || row.name} 已被${references.join('、')}引用；删除后的引用处理规则待确认，暂不能删除`)
    }
    // A batch can remove the last pair of interchangeable flight legs; check the complete result too.
    if (kind === 'flights') {
      const remainingLegs = new Set(state.airMaster.flights.filter(row => !ids.includes(row.id)).map(legOf))
      const removedLegs = new Set(records.map(legOf))
      if (state.airOrders.some(order => bookingLegs(order.booking).some(leg => removedLegs.has(leg) && !remainingLegs.has(leg)))) {
        throw new Error('选中航班共同提供已被订舱引用的航段；删除后的引用处理规则待确认，暂不能删除')
      }
    }
    state.airMaster[kind] = state.airMaster[kind].filter(row => !ids.includes(row.id))
    return records.length
  }
  return { saveAirMaster, deleteAirMaster }
}
