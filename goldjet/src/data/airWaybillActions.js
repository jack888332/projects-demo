import {
  createAirWaybillContact, createAirWaybillDraft, getAirWaybillChildren, getAirWaybillRestriction,
  getAirWaybillSendRestriction, getAirWaybillTotals, getDescriptionCodeConfig,
  normalizeAirWaybillDraft, validateAirWaybillDraft,
} from '../domain/airWaybills.js'

const fixedNow = () => Date.UTC(2026, 8, 8, 14, 30)
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
const localTime = time => new Date(time).toISOString().slice(0, 19).replace('T', ' ')
const localReceiver = async (_payload, { kind, outcome }) => {
  await new Promise(resolve => setTimeout(resolve, 250))
  return outcome === `${kind}-error`
    ? { ok: false, error: `本地演示回执：${kind === 'master' ? '主' : '分'}运单资料被模拟接收端拒绝` }
    : { ok: true }
}

export function createAirWaybillActions(state, getSession, getNow = fixedNow, { receiver = localReceiver } = {}) {
  const pending = new Set()
  const requireRole = () => {
    if (!['service', 'waybillClerk'].includes(getSession().role)) throw new Error('仅空运客服或打单员可维护提单')
  }
  const check = errors => { if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors }) }
  function resolve(orderId, childId = '') {
    const order = state.airOrders.find(row => row.id === orderId)
    if (!order) throw new Error('订单不存在')
    const child = childId ? getAirWaybillChildren(state, orderId).find(row => row.id === childId) : null
    if (childId && !child) throw new Error('分单不存在或不属于当前主单')
    return { order, child, entity: child || order }
  }
  function saveAirWaybill(orderId, childId, payload, { submit = false } = {}) {
    const { order, child, entity } = resolve(orderId, childId)
    const restriction = getAirWaybillRestriction(order, getSession(), { submit, entity })
    if (restriction) throw new Error(restriction)
    const draft = normalizeAirWaybillDraft(payload, order, child, state.airMaster)
    check(validateAirWaybillDraft(draft, state.airMaster))
    const cargoValue = value => value === undefined || value === null || value === '' ? null : Number(value)
    if ((state.palletAllocations || []).some(row => row.orderId === orderId)
      && ['pieces', 'grossWeight', 'volume'].some(key => cargoValue(entity.waybill?.[key]) !== cargoValue(draft[key]))) {
      throw new Error('该订单已有配板，提单毛件体变更后的分配处理待确认；请先撤回分批并卸下配板')
    }
    const totals = getAirWaybillTotals(draft), timestamp = localTime(getNow())
    entity.waybillDocument = { ...copy(draft), savedAt: timestamp, savedBy: getSession().name }
    entity.waybill = { ...(entity.waybill || {}), pieces: draft.pieces, grossWeight: draft.grossWeight, volume: draft.volume, chargeWeight: totals.chargeWeight }
    entity.updatedAt = timestamp
    if (submit) {
      order.orderStatus = '已出提单'
      order.waybillIssuedAt = timestamp
      order.waybillIssuedBy = getSession().name
    }
    return entity
  }
  function saveAirWaybillNote(orderId, note) {
    requireRole()
    const { order } = resolve(orderId)
    if (typeof note !== 'string' || note.length > 256) throw new Error('提单备注最多 256 个字符')
    order.waybillNote = note
    return order
  }
  function saveAirWaybillContact(payload) {
    requireRole()
    const contact = createAirWaybillContact(payload)
    contact.alias = contact.alias.trim()
    if (!contact.alias) throw new Error('保存常用联系人前请填写别称')
    if ((state.airWaybillContacts || []).some(row => row.alias === contact.alias)) throw new Error('常用联系人别称已存在')
    const sequence = (state.airWaybillContactSequence || 0) + 1
    const row = { ...contact, id: `AWCONTACT-${String(sequence).padStart(6, '0')}` }
    state.airWaybillContacts ||= []
    state.airWaybillContacts.push(row)
    state.airWaybillContactSequence = sequence
    return row
  }
  function deleteAirWaybillContact(id) {
    requireRole()
    const index = (state.airWaybillContacts || []).findIndex(row => row.id === id)
    if (index < 0) throw new Error('常用联系人不存在')
    state.airWaybillContacts.splice(index, 1)
  }

  async function sendAirWaybills(selections, codes = {}, { outcome = 'success' } = {}) {
    requireRole()
    if (!['success', 'master-error', 'child-error'].includes(outcome)) throw new Error('未知本地演示回执')
    const now = getNow(), restriction = getAirWaybillSendRestriction(state, selections, codes, now)
    if (restriction) throw new Error(restriction)
    const targets = selections.map(selection => ({ ...selection, ...resolve(selection.orderId, selection.childId) }))
      .sort((left, right) => Number(Boolean(left.childId)) - Number(Boolean(right.childId)))
    if (targets.some(target => pending.has(target.entity))) throw new Error('所选运单正在发送，请等待本地模拟回执')
    const actor = { ...getSession() }, orders = state.airOrders, children = state.airChildren
    const current = target => state.airOrders === orders && state.airChildren === children
      && getSession().role === actor.role && getSession().name === actor.name
      && state.airOrders.includes(target.order)
      && (!target.child || state.airChildren.includes(target.child))
    const results = []
    targets.forEach(target => pending.add(target.entity))
    try { for (const target of targets) {
      if (!current(target)) throw new Error('演示角色或数据已变化，本次发送已停止')
      if (target.child && target.order.waybillTransmission?.status !== '成功') {
        results.push({ orderId: target.orderId, childId: target.childId, skipped: true, error: '主运单未成功，未发送该分运单' })
        continue
      }
      const previous = target.entity.waybillTransmission
      const descriptionCode = codes[target.orderId] ?? getDescriptionCodeConfig(target.order.waybillNo).defaultValue
      target.entity.waybillTransmission = { ...copy(previous), status: '发送中', error: '', sentAt: localTime(now), descriptionCode, simulation: '本地演示回执，未发送真实接口' }
      const transmission = target.entity.waybillTransmission
      const payload = { ...createAirWaybillDraft(target.order, target.child, state.airMaster), destination: target.child?.destination || target.order.destination || '', descriptionCode }
      let response
      try { response = await receiver(copy(payload), { kind: target.child ? 'child' : 'master', outcome, orderId: target.orderId, childId: target.childId || '' }) }
      catch (error) { response = { ok: false, error: error instanceof Error ? error.message : '本地模拟接收端未返回有效回执' } }
      if (!current(target)) {
        if (state.airOrders.includes(target.order) && (!target.child || state.airChildren.includes(target.child)) && target.entity.waybillTransmission === transmission) {
          if (previous === undefined) delete target.entity.waybillTransmission
          else target.entity.waybillTransmission = previous
        }
        throw new Error('演示角色或数据已变化，已忽略过期回执')
      }
      const success = response?.ok === true
      Object.assign(transmission, { status: success ? '成功' : '异常中', error: success ? '' : textError(response?.error),
        ...(success ? { succeededAtMs: getNow() } : {}),
      })
      results.push({ orderId: target.orderId, childId: target.childId || '', status: transmission.status, error: transmission.error })
    } } finally { targets.forEach(target => pending.delete(target.entity)) }
    return results
  }
  return { saveAirWaybill, saveAirWaybillNote, saveAirWaybillContact, deleteAirWaybillContact, sendAirWaybills }
}

function textError(value) {
  return typeof value === 'string' && value ? value : '本地模拟接收端返回异常'
}
