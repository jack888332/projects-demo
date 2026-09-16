import { decimalTotal, deriveCapacityRows, validCapacityDate } from './airCapacity.js'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = value => typeof value === 'string' ? value.trim() : ''
const numeric = value => (typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()))) && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null
const positive = value => numeric(value) !== null && Number(value) > 0
const flightOf = order => order.booking?.flight || order.flight || ''
const dateOf = order => order.booking?.departureDate || order.departureDate || ''
const mainOrder = order => !order.parentOrderId && !order.masterOrderId && !order.isChild && order.orderType !== '分单'
const keys = ['grossWeight', 'pieces', 'volume']
const dimensionsOf = order => order.packagingType === '托盘货' && positive(order.length) && positive(order.width) && positive(order.height) ? `${order.length} × ${order.width} × ${order.height}` : ''
const dimensionReasonOf = order => !order.packagingType && [order.length, order.width, order.height].some(positive) ? '订单托盘货类型尚未接入，尺寸展示条件待确认' : ''

export function getPalletWriteRestriction(session = {}) {
  return ['operator', 'handler'].includes(session.role) ? '' : '仅本人负责航线的航线部人员可执行配板操作'
}

function ownsProduct(product, session) {
  return ['operator', 'handler'].includes(session.role) && product[session.role] === session.name
}

function matchingProducts(state, session, flight, date) {
  const flightRow = (state.airMaster?.flights || []).find(row => row.code === flight)
  const day = new Date(`${date}T00:00:00Z`).getUTCDay() || 7
  return (state.capacityProducts || []).filter(product => product.flightId === flightRow?.id && ownsProduct(product, session)
    && product.startDate <= date && date <= product.endDate && product.details.some(detail => Number(detail.weekday) === day))
}

function ownedOrder(state, session, order) {
  return matchingProducts(state, session, flightOf(order), dateOf(order)).length > 0
}

function readCargo(source) {
  return Object.fromEntries(keys.map(key => [key, numeric(source?.[key])]))
}

const completeCargo = cargo => record(cargo) && keys.every(key => positive(cargo[key])) && Number.isSafeInteger(cargo.pieces)

export function getPalletOrderCargo(order, state = {}) {
  const warehousePresent = Object.hasOwn(order, 'warehouseVolume') || Boolean(order.warehouseEnteredAt)
  const warehouse = (record(order.warehouse) ? order.warehouse : (state.warehouseOrders || []).find(row => row.airOrderId === order.id || row.sourceOrderId === order.id))
    || (warehousePresent ? { volume: order.warehouseVolume } : undefined)
  const cargoSources = { expected: readCargo(order), warehouse: readCargo(warehouse), waybill: readCargo(order.waybill) }
  const sources = { expected: order, warehouse, waybill: order.waybill }, labels = { expected: '预计', warehouse: '入仓', waybill: '提单' }
  if ([order.warehouse, order.waybill].some(source => source !== null && source !== undefined && !record(source))) return { cargo: null, cargoSource: '', cargoSources, reason: '入仓或提单毛件体的数据格式不正确，暂不能配板' }
  if (warehousePresent && !completeCargo(cargoSources.warehouse)) return { cargo: null, cargoSource: '', cargoSources, reason: '已存在入仓体积或入仓记录，但入仓毛件体不完整，补齐或确认取值口径前暂不能配板' }
  if (Object.hasOwn(order, 'warehouseVolume') && numeric(order.warehouseVolume) !== cargoSources.warehouse.volume) return { cargo: null, cargoSource: '', cargoSources, reason: '入仓体积与仓库毛件体的体积不一致，确认取值口径前暂不能配板' }
  for (const [name, source] of Object.entries(sources)) {
    const supplied = source && keys.some(key => source[key] !== null && source[key] !== undefined && !(typeof source[key] === 'string' && !source[key].trim()))
    if (supplied && !completeCargo(cargoSources[name])) return { cargo: null, cargoSource: '', cargoSources, reason: `${labels[name]}毛件体已返回部分或无效数据，补齐或确认取值口径前暂不能配板` }
  }
  const complete = Object.entries(cargoSources).filter(([, cargo]) => completeCargo(cargo))
  if (!complete.length) return { cargo: null, cargoSource: '', cargoSources, reason: '预计、入仓或提单毛件体均未形成完整有效的一组，暂不能配板' }
  const first = complete[0][1]
  if (complete.some(([, cargo]) => keys.some(key => cargo[key] !== first[key]))) return { cargo: null, cargoSource: '', cargoSources, reason: '预计、入仓或提单毛件体存在不同的完整取值，配板取值口径待确认' }
  return { cargo: { ...first }, cargoSource: complete.map(([name]) => labels[name]).join('、'), cargoSources, reason: '' }
}

export function getPalletOrderRestriction(order) {
  if (!order) return '空运订单不存在'
  if (!mainOrder(order)) return '配板以主订单为对象，分单不能重复配板'
  if (order.bookingStatus !== '服务已完成') return '订舱服务尚未完成'
  if (!text(order.waybillNo)) return '尚未绑定提单号'
  if (!text(flightOf(order))) return '尚未绑定航班号'
  if (!validCapacityDate(dateOf(order))) return '尚未绑定有效出港日期'
  return ''
}

export function getPalletCandidates(state = {}, session = {}) {
  return (state.airOrders || []).filter(order => mainOrder(order) && ['operator', 'handler'].includes(session.role)
    && (ownedOrder(state, session, order) || order.assignees?.[session.role] === session.name)
    && !(state.palletAllocations || []).some(row => row.orderId === order.id)).map(order => {
    const cargo = getPalletOrderCargo(order, state), reason = getPalletOrderRestriction(order) || cargo.reason
      || (!ownedOrder(state, session, order) ? '当前出港日期未维护本人绑定的舱位产品' : '')
    return {
      id: order.id, orderId: order.id, orderNo: order.orderNo || order.id, customer: order.customer || '', waybillNo: order.waybillNo || '',
      flight: flightOf(order), date: dateOf(order), ...cargo, eligible: !reason, reason, dimensions: dimensionsOf(order), dimensionReason: dimensionReasonOf(order), specialCargo: order.specialCargo || '',
    }
  })
}

function parseFlightKey(key) {
  if (typeof key !== 'string') return null
  const date = key.slice(-10), flightId = key.slice(0, -11)
  return validCapacityDate(date) && key.at(-11) === ':' && flightId ? { flightId, date } : null
}

function resolveFlight(state, session, flightKey) {
  const parsed = parseFlightKey(flightKey)
  if (!parsed) return null
  return deriveCapacityRows(state, { startDate: parsed.date, endDate: parsed.date }).find(row => row.key === flightKey && row.products.some(product => ownsProduct(product, session))) || null
}

export function canEditAirAllocationNote(allocation, session = {}) {
  return Boolean(allocation && session.role === 'operator' && allocation.operator === session.name)
}

export function getPalletAllocatedRows(state = {}, session = {}, flightKey) {
  const flight = resolveFlight(state, session, flightKey)
  if (!flight) return []
  return (state.palletAllocations || []).filter(row => row.flightKey === flightKey).map(row => {
    const order = (state.airOrders || []).find(item => item.id === row.orderId)
    const { cargoSources } = order ? getPalletOrderCargo(order, state) : { cargoSources: { expected: readCargo(), warehouse: readCargo(), waybill: readCargo() } }
    return {
      ...row, orderNo: order?.orderNo || row.orderId, customer: order?.customer || '', waybillNo: order?.waybillNo || '',
      cargoSources, isSplit: Boolean(row.parentAllocationId), hasSplit: (state.palletAllocations || []).some(item => item.parentAllocationId === row.id),
      specialCargo: order?.specialCargo || '',
      dimensions: order ? dimensionsOf(order) : '',
      dimensionReason: order ? dimensionReasonOf(order) : '',
    }
  })
}

export function getPalletProfit(state, flight, allocations) {
  const unavailable = reason => ({ value: null, currency: '', reason })
  if (flight.airlineCode === 'CA') return unavailable('CA 不计算预计利润')
  if (['CZ', 'MH'].includes(flight.airlineCode)) return unavailable('合同罚金取值及币种口径尚未明确，预计利润暂不能计算')
  if (flight.airlineCode !== 'TK') return unavailable('该航司的预计利润规则待确认')
  if (!allocations.length) return unavailable('尚无已配板订单')
  const orders = [...new Set(allocations.map(row => row.orderId))].map(id => state.airOrders.find(order => order.id === id))
  const amounts = [], currencies = new Set()
  for (const order of orders) {
    if (!order) return unavailable('已配订单不存在，预计利润暂不能计算')
    const bill = order.waybill || {}, sell = numeric(order.sellRate), cost = numeric(order.booking?.airCost)
    const gross = numeric(bill.grossWeight), volumeWeight = numeric(bill.volumeWeight), charged = numeric(bill.chargeWeight), foam = numeric(order.foamRatio)
    if ([sell, cost, gross, numeric(bill.volume), volumeWeight, charged, foam].some(value => value === null) || foam > 1) return unavailable('提单体积、提单体积重、提单毛重、计费重、卖价、成本或分泡率未齐，预计利润暂不能计算')
    const sellCurrency = text(order.currency), costCurrency = text(order.booking?.currency)
    if (!sellCurrency || !costCurrency || sellCurrency !== costCurrency) return unavailable('预计利润的收入成本币种及换算口径待确认')
    currencies.add(sellCurrency)
    const amount = decimalTotal([[sell, volumeWeight, foam], [-sell, gross, foam], [sell, gross], [-cost, charged]])
    if (amount === null) return unavailable('预计利润结果超出当前演示数值范围')
    amounts.push([amount])
  }
  if (currencies.size !== 1) return unavailable('跨币种预计利润汇总口径待确认')
  return { value: decimalTotal(amounts), currency: [...currencies][0], reason: '' }
}

export function getPalletFlightRows(state = {}, session = {}, range = {}) {
  return deriveCapacityRows(state, range).filter(row => row.products.some(product => ownsProduct(product, session))).map(flight => {
    const allocated = (state.palletAllocations || []).filter(row => row.flightKey === flight.key)
    const sums = Object.fromEntries(keys.map(key => [key, allocated.every(row => completeCargo(row.cargo)) ? decimalTotal(allocated.map(row => [row.cargo[key]])) : null]))
    return { ...flight, allocatedVolume: sums.volume, allocatedGrossWeight: sums.grossWeight, allocatedPieces: sums.pieces, profit: getPalletProfit(state, flight, allocated) }
  })
}

export function getPalletAllocationRestriction(state, session, orderIds, flightKey) {
  const permission = getPalletWriteRestriction(session)
  if (permission) return permission
  if (!Array.isArray(orderIds) || !orderIds.length || orderIds.some(id => typeof id !== 'string')) return '请至少选择一条待配板订单'
  if (new Set(orderIds).size !== orderIds.length) return '不能重复选择同一订单'
  const target = resolveFlight(state, session, flightKey)
  if (!target) return '请选择本人绑定航线的有效目标航班'
  const operators = [...new Set(target.products.filter(product => ownsProduct(product, session)).map(product => text(product.operator)))]
  if (operators.length !== 1 || !operators[0]) return '目标航班多个舱位产品的航线运营归属不唯一，配板记录负责人待确认，暂不能配板'
  if (target.totalVolume === null || target.boardCount === null) return '目标航班的舱位容量尚未确定，暂不能配板'
  for (const id of orderIds) {
    const order = (state.airOrders || []).find(row => row.id === id), reason = getPalletOrderRestriction(order)
    if (reason) return reason
    if (!ownedOrder(state, session, order)) return '只能操作本人绑定航线的订单'
    if ((state.palletAllocations || []).some(row => row.orderId === id)) return '该订单已经配板，不能重复分配'
    if (flightOf(order) !== target.flight || dateOf(order) !== target.date) return '跨航班或跨出港日期配板的处理规则待确认，暂不能配板'
    const cargo = getPalletOrderCargo(order, state)
    if (cargo.reason) return cargo.reason
  }
  return ''
}

function allocatedRestriction(state, session, id) {
  const permission = getPalletWriteRestriction(session)
  if (permission) return permission
  const allocation = (state.palletAllocations || []).find(row => row.id === id)
  if (!allocation) return '配板记录不存在'
  if (!resolveFlight(state, session, allocation.flightKey)) return '只能操作本人绑定航线的配板记录'
  return ''
}

export function getPalletUnloadRestriction(state, session, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) return '请至少选择一条已配板记录'
  if (new Set(ids).size !== ids.length) return '不能重复选择同一配板记录'
  for (const id of ids) {
    const reason = allocatedRestriction(state, session, id)
    if (reason) return reason
    const row = state.palletAllocations.find(item => item.id === id)
    if (row.parentAllocationId || state.palletAllocations.some(item => item.parentAllocationId === id)) return '已分批记录须先撤回分批，才能卸下或重配'
  }
  return ''
}

export function getPalletSplitRestriction(state, session, id) {
  const permission = allocatedRestriction(state, session, id)
  if (permission) return permission
  const row = state.palletAllocations.find(item => item.id === id)
  if (row.parentAllocationId || state.palletAllocations.some(item => item.parentAllocationId === id)) return '仅支持原配板记录单次分批；再次分批须先撤回'
  if (!completeCargo(row.cargo)) return '配板毛件体不完整，暂不能分批'
  const flight = resolveFlight(state, session, row.flightKey)
  if (flight.totalVolume === null) return '舱位总体积尚未确定，暂不能判断分批条件'
  const all = state.palletAllocations.filter(item => item.flightKey === row.flightKey)
  const total = all.every(item => completeCargo(item.cargo)) ? decimalTotal(all.map(item => [item.cargo.volume])) : null
  if (total === null) return '已配板货物总体积尚未确定，暂不能分批'
  if (total <= flight.totalVolume) return '当前已配板货物总体积未超过舱位总体积，不符合已定义的分批条件'
  return ''
}

export function validatePalletSplit(row, payload) {
  if (!record(payload)) return { split: '分批数据格式不正确' }
  const errors = {}
  if (payload.confirmedInsufficient !== true) errors.confirmedInsufficient = '请确认本订单货物一批运不完'
  for (const key of keys) {
    if (!positive(payload[key]) || (key === 'pieces' && !Number.isSafeInteger(Number(payload[key])))) errors[key] = `${{ grossWeight: '拆出毛重', pieces: '拆出件数', volume: '拆出体积' }[key]}须为${key === 'pieces' ? '正整数' : '正数'}`
    else if (Number(payload[key]) >= row.cargo[key]) errors[key] = '拆出数量必须小于原配板记录的对应数量'
  }
  if (payload.flight !== row.flight || payload.date !== row.date) errors.flight = '跨航班或跨日期分批后的订舱、提单及舱位联动规则待确认，暂不提交'
  return errors
}

export function getPalletWithdrawRestriction(state, session, childId) {
  const permission = allocatedRestriction(state, session, childId)
  if (permission) return permission
  const child = state.palletAllocations.find(row => row.id === childId)
  if (!child.parentAllocationId) return '请选择分批生成的记录撤回'
  const parent = state.palletAllocations.find(row => row.id === child.parentAllocationId)
  if (!parent || parent.orderId !== child.orderId || parent.flightKey !== child.flightKey) return '分批来源或目标关系异常，暂不能撤回'
  if (!completeCargo(parent.cargo) || !completeCargo(child.cargo)) return '分批毛件体不完整，暂不能撤回'
  return ''
}
