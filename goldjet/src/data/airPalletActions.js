import { CAPACITY_NOW, decimalTotal } from '../domain/airCapacity.js'
import {
  canEditAirAllocationNote, getPalletAllocatedRows, getPalletAllocationRestriction, getPalletOrderCargo,
  getPalletSplitRestriction, getPalletUnloadRestriction, getPalletWithdrawRestriction, getPalletWriteRestriction, validatePalletSplit,
} from '../domain/airPallets.js'

const clone = value => JSON.parse(JSON.stringify(value))
const keys = ['grossWeight', 'pieces', 'volume']

export function createAirPalletActions(state, getSession) {
  const reject = reason => { if (reason) throw new Error(reason) }
  const reserveIds = count => {
    let sequence = Number.isSafeInteger(state.palletSequence) && state.palletSequence >= 0 ? state.palletSequence : 0
    const ids = []
    while (ids.length < count) {
      if (sequence >= Number.MAX_SAFE_INTEGER) throw new Error('配板演示序号已用尽，请恢复演示数据')
      const id = `PAL-${String(++sequence).padStart(8, '0')}`
      if (!state.palletAllocations.some(row => row.id === id)) ids.push(id)
    }
    return { ids, sequence }
  }
  function allocateAirOrders(orderIds, flightKey) {
    reject(getPalletAllocationRestriction(state, getSession(), orderIds, flightKey))
    const { ids, sequence } = reserveIds(orderIds.length)
    const date = flightKey.slice(-10), flightId = flightKey.slice(0, -11), session = getSession()
    const day = new Date(`${date}T00:00:00Z`).getUTCDay() || 7
    const products = state.capacityProducts.filter(row => row.flightId === flightId && row[session.role] === session.name && row.startDate <= date && date <= row.endDate && row.details.some(detail => Number(detail.weekday) === day))
    const operators = [...new Set(products.map(row => row.operator))], handlers = [...new Set(products.map(row => row.handler))]
    const records = orderIds.map((orderId, index) => {
      const order = state.airOrders.find(row => row.id === orderId), cargo = getPalletOrderCargo(order, state)
      return {
        id: ids[index], orderId, flightKey, flightId, flight: order.booking?.flight || order.flight, date,
        operator: operators[0], handler: handlers.length === 1 ? handlers[0] : '', cargo: clone(cargo.cargo), cargoSource: cargo.cargoSource,
        parentAllocationId: '', remark: '', createdAt: CAPACITY_NOW, updatedAt: CAPACITY_NOW,
      }
    })
    state.palletAllocations.push(...records)
    state.palletSequence = sequence
    return records
  }
  function unloadAirAllocations(ids) {
    reject(getPalletUnloadRestriction(state, getSession(), ids))
    const selected = new Set(ids), removed = state.palletAllocations.filter(row => selected.has(row.id))
    state.palletAllocations = state.palletAllocations.filter(row => !selected.has(row.id))
    return removed
  }
  function splitAirAllocation(id, payload) {
    reject(getPalletSplitRestriction(state, getSession(), id))
    const row = state.palletAllocations.find(item => item.id === id), fields = validatePalletSplit(row, payload)
    if (Object.keys(fields).length) throw Object.assign(new Error(Object.values(fields)[0]), { fields })
    const { ids, sequence } = reserveIds(1)
    const cargo = Object.fromEntries(keys.map(key => [key, Number(payload[key])]))
    const remaining = Object.fromEntries(keys.map(key => [key, decimalTotal([[row.cargo[key]], [-cargo[key]]])]))
    if (keys.some(key => remaining[key] === null || remaining[key] <= 0)) throw new Error('分批结果超出当前演示数值范围')
    const child = { ...clone(row), id: ids[0], cargo, parentAllocationId: row.id, remark: '', createdAt: CAPACITY_NOW, updatedAt: CAPACITY_NOW }
    row.cargo = remaining
    row.updatedAt = CAPACITY_NOW
    state.palletAllocations.push(child)
    state.palletSequence = sequence
    return child
  }
  function withdrawAirSplit(childId) {
    reject(getPalletWithdrawRestriction(state, getSession(), childId))
    const child = state.palletAllocations.find(row => row.id === childId), parent = state.palletAllocations.find(row => row.id === child.parentAllocationId)
    const restored = Object.fromEntries(keys.map(key => [key, decimalTotal([[parent.cargo[key]], [child.cargo[key]]])]))
    if (keys.some(key => restored[key] === null)) throw new Error('分批恢复结果超出当前演示数值范围')
    parent.cargo = restored
    parent.updatedAt = CAPACITY_NOW
    state.palletAllocations = state.palletAllocations.filter(row => row.id !== childId)
    return parent
  }
  function saveAirAllocationNote(id, remark) {
    reject(getPalletWriteRestriction(getSession()))
    const row = state.palletAllocations.find(item => item.id === id)
    if (!row) throw new Error('配板记录不存在')
    if (!canEditAirAllocationNote(row, getSession()) || !getPalletAllocatedRows(state, getSession(), row.flightKey).some(item => item.id === id)) throw new Error('只能编辑本人绑定航线中本人配板记录的备注')
    if (typeof remark !== 'string') throw new Error('备注须为文本')
    row.remark = remark.trim()
    row.updatedAt = CAPACITY_NOW
    return row
  }
  function reallocateAirFlight(flightKey) {
    reject(getPalletWriteRestriction(getSession()))
    const rows = getPalletAllocatedRows(state, getSession(), flightKey)
    if (!rows.length) throw new Error('当前航班没有可重配的已配板记录')
    return unloadAirAllocations(rows.map(row => row.id))
  }
  return { allocateAirOrders, unloadAirAllocations, splitAirAllocation, withdrawAirSplit, saveAirAllocationNote, reallocateAirFlight }
}
