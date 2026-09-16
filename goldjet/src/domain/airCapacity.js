import { GROUND_DATE, GROUND_NOW } from './groundOperations.js'
import { WORKBENCH_PERSONAS } from './workbenchTasks.js'

export const CAPACITY_TODAY = GROUND_DATE
export const CAPACITY_NOW = GROUND_NOW
export const CAPACITY_BOARD_TYPES = ['临时板', '合同板']
export const CAPACITY_WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, index) => ({ value: index + 1, label }))
export const CAPACITY_OPERATORS = [...new Set([...WORKBENCH_PERSONAS.filter(row => row.scope === 'air' && row.role === 'operator').map(row => row.name), '赵航'])]
export const CAPACITY_HANDLERS = [...new Set([...WORKBENCH_PERSONAS.filter(row => row.scope === 'air' && row.role === 'handler').map(row => row.name), '陈琪'])]
export const CAPACITY_DELETE_REASON = '舱位产品删除权限及已有订舱、配板的关联处理待确认，暂不删除'

const clean = value => typeof value === 'string' ? value.trim() : value
const empty = value => value === null || value === undefined || value === ''
const scalar = value => typeof value === 'string' || typeof value === 'number'
const positiveInteger = value => scalar(value) && /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0
const numberValue = value => (typeof value === 'number' ? Number.isFinite(value) && value >= 0 : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value))) ? Number(value) : null
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const weekday = date => new Date(`${date}T00:00:00Z`).getUTCDay() || 7
const orderFlight = order => order.booking?.flight || order.flight || ''
const orderDate = order => order.booking?.departureDate || order.departureDate || ''
const isMainOrder = order => !order.parentOrderId && !order.masterOrderId && !order.isChild && order.orderType !== '分单'
const isBookedOrder = order => isMainOrder(order) && order.bookingStatus === '服务已完成' && typeof order.waybillNo === 'string' && Boolean(order.waybillNo.trim())

// Keep input decimal arithmetic without selecting a business rounding precision.
export function decimalTotal(terms) {
  const parts = terms.map(factors => factors.reduce((product, factor) => {
    const [mantissa, exponent = '0'] = String(factor).toLowerCase().split('e')
    const scale = (mantissa.split('.')[1]?.length || 0) - Number(exponent)
    return { value: product.value * BigInt(mantissa.replace('.', '')), scale: product.scale + scale }
  }, { value: 1n, scale: 0 }))
  const scale = Math.max(0, ...parts.map(part => part.scale))
  const coefficient = parts.reduce((sum, part) => sum + part.value * 10n ** BigInt(scale - part.scale), 0n)
  const negative = coefficient < 0n, digits = String(negative ? -coefficient : coefficient).padStart(scale + 1, '0')
  const value = Number(`${negative ? '-' : ''}${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits}`)
  return Number.isFinite(value) ? value : null
}

export function validCapacityDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function createCapacityDraft(session = {}) {
  return {
    flightId: '', boardType: '临时板', startDate: '', endDate: '', operator: session.name || '', handler: '',
    details: [{ weekday: '', palletId: '', baseline: '', quantity: '' }],
  }
}

export function normalizeCapacityDraft(payload) {
  const draft = createCapacityDraft()
  for (const key of ['flightId', 'boardType', 'startDate', 'endDate', 'operator', 'handler']) draft[key] = clean(payload?.[key] ?? '')
  draft.details = Array.isArray(payload?.details) ? payload.details.map(detail => isRecord(detail)
    ? Object.fromEntries(['weekday', 'palletId', 'baseline', 'quantity'].map(key => [key, clean(detail[key] ?? '')])) : detail) : payload?.details
  if (payload?.id !== undefined) draft.id = clean(payload.id)
  return draft
}

export function validateCapacityDraft(draft, state = {}, { existing = null } = {}) {
  if (!isRecord(draft)) return { product: '舱位产品格式不正确' }
  const errors = {}, master = state.airMaster || {}
  const flight = (master.flights || []).find(row => row.id === draft.flightId)
  if (!flight) errors.flightId = '请选择航班主数据中的航班'
  else if (!(master.airlines || []).some(row => row.code === flight.airlineCode)) errors.flightId = '该航班关联的航司主数据不存在'
  if (!CAPACITY_BOARD_TYPES.includes(draft.boardType)) errors.boardType = '请选择临时板或合同板'
  if (existing && draft.flightId !== existing.flightId) errors.flightId = '编辑时不可修改航班'
  if (existing && draft.boardType !== existing.boardType) errors.boardType = '编辑时不可修改板类型'
  if (!CAPACITY_OPERATORS.includes(draft.operator)) errors.operator = '请选择航线运营人员'
  if (!CAPACITY_HANDLERS.includes(draft.handler)) errors.handler = '请选择航线操作人员'
  if (!validCapacityDate(draft.startDate)) errors.startDate = '请输入有效开始日期，格式为 YYYY-MM-DD'
  if (!validCapacityDate(draft.endDate)) errors.endDate = '请输入有效结束日期，格式为 YYYY-MM-DD'
  else if (validCapacityDate(draft.startDate) && draft.startDate > draft.endDate) errors.endDate = '结束日期不能早于开始日期'
  else if (draft.startDate === draft.endDate) errors.endDate = '有效期限起止同日的适用边界待确认，暂不保存'
  if (!Array.isArray(draft.details) || !draft.details.length) errors.details = '请至少添加一条板型明细'
  else {
    const seen = new Set()
    draft.details.forEach((detail, index) => {
      const field = key => `details.${index}.${key}`
      if (!isRecord(detail)) { errors[field('weekday')] = '板型明细格式不正确'; return }
      if (!positiveInteger(detail.weekday) || Number(detail.weekday) > 7) errors[field('weekday')] = '请选择周一至周日'
      const pallet = (master.pallets || []).find(row => row.id === detail.palletId)
      if (!pallet) errors[field('palletId')] = '请选择板型主数据中的板型'
      else if (flight && pallet.airlineCode !== flight.airlineCode) errors[field('palletId')] = '板型须属于所选航班的航司'
      for (const key of ['baseline', 'quantity']) if (!empty(detail[key]) && !positiveInteger(detail[key])) errors[field(key)] = `${key === 'baseline' ? '基准载重' : '数量'}须为正整数，或留空`
      if (!errors[field('weekday')] && !errors[field('palletId')]) {
        const key = `${Number(detail.weekday)}:${detail.palletId}`
        if (seen.has(key)) errors[field('palletId')] = '数据重复，请重新录入'
        seen.add(key)
      }
    })
  }
  if (!errors.startDate && !errors.endDate) {
    const matches = (state.capacityProducts || []).filter(row => row.id !== existing?.id && row.flightId === draft.flightId && row.boardType === draft.boardType && validCapacityDate(row.startDate) && validCapacityDate(row.endDate))
    if (matches.some(row => row.startDate < draft.endDate && draft.startDate < row.endDate)) errors.endDate = '数据重复，请重新录入'
    else if (matches.some(row => row.startDate === draft.endDate || row.endDate === draft.startDate)) errors.endDate = '有效期限在同日相接，日期重叠边界待确认，暂不保存'
  }
  return errors
}

export function getCapacityProductView(row, master = {}) {
  const flight = (master.flights || []).find(item => item.id === row.flightId)
  const airline = (master.airlines || []).find(item => item.code === flight?.airlineCode)
  return {
    ...row, flight: flight?.code || '', airlineCode: flight?.airlineCode || '', airline: airline?.name || '',
    origin: flight?.origin || '', destination: flight?.destination || '',
    details: (row.details || []).map(detail => {
      const pallet = (master.pallets || []).find(item => item.id === detail.palletId && item.airlineCode === flight?.airlineCode)
      return { ...detail, pallet: pallet?.code || '', volume: numberValue(pallet?.volume) }
    }),
  }
}

function hasProductReference(product, state) {
  const flight = (state.airMaster?.flights || []).find(row => row.id === product.flightId)
  return (state.airOrders || []).some(order => isMainOrder(order) && orderFlight(order) === flight?.code
    && orderDate(order) >= product.startDate && orderDate(order) <= product.endDate
    && product.details.some(detail => Number(detail.weekday) === weekday(orderDate(order))))
    || (state.palletAllocations || []).some(row => row.capacityProductId === product.id || (row.flightId === product.flightId && row.date >= product.startDate && row.date <= product.endDate))
}

export function getCapacityEditRestriction(product, state, session = {}) {
  if (session.role !== 'operator') return '仅航线运营可维护舱位产品'
  if (!product) return '舱位产品不存在'
  if (product.operator !== session.name) return '航线运营编辑他人绑定产品的权限范围待确认，暂不编辑'
  if (hasProductReference(product, state)) return '该产品已关联订舱或配板，修改容量、期限或人员对已有业务的影响待确认，暂不编辑'
  return ''
}

export function canEditCapacityNote(product, session = {}) {
  return Boolean(product && session.role === 'operator' && product.operator === session.name)
}

function relatedStage(order, state, stage) {
  const direct = order[stage]
  if (isRecord(direct)) return direct
  const collection = stage === 'warehouse' ? state.warehouseOrders : state.stationOrders
  return (collection || []).find(row => row.airOrderId === order.id || row.sourceOrderId === order.id)
}

export function getCapacityOrderVolume(order, state = {}) {
  for (const [stage, label] of [['station', '入货站'], ['warehouse', '入仓']]) {
    const record = relatedStage(order, state, stage), key = `${stage}Volume`
    const entered = record && (record.enteredAt || record.receivedAt || record.inboundAt || numberValue(record.volume) !== null)
    if (entered || Object.hasOwn(order, key) || order[`${stage}EnteredAt`]) {
      const value = numberValue(record ? record.volume : order[key])
      return { volume: value, source: label, reason: value === null ? `${order.orderNo || order.id}已${label}，${label}体积尚未接入或未填写` : '' }
    }
  }
  const value = numberValue(order.volume)
  return { volume: value, source: '预计', reason: value === null ? `${order.orderNo || order.id}客户提供的体积未填写` : '' }
}

const QUERY_LIMIT_REASON = '当前演示查询结果过多，请缩小出港日期范围'

function capacityDateCandidates(state, { startDate, endDate }) {
  const candidates = new Map(), master = state.airMaster || {}
  const put = (flight, date) => {
    candidates.set(`${flight.id}:${date}`, { flight, date })
    if (candidates.size > 20000) throw new Error(QUERY_LIMIT_REASON)
  }
  for (const product of state.capacityProducts || []) {
    const flight = (master.flights || []).find(row => row.id === product.flightId)
    if (!flight || !validCapacityDate(product.startDate) || !validCapacityDate(product.endDate)) continue
    const first = product.startDate > startDate ? product.startDate : startDate, last = product.endDate < endDate ? product.endDate : endDate
    if (first > last) continue
    const firstTimestamp = new Date(`${first}T00:00:00Z`).getTime(), lastTimestamp = new Date(`${last}T00:00:00Z`).getTime()
    for (const day of new Set((product.details || []).map(row => Number(row.weekday)).filter(day => day >= 1 && day <= 7))) {
      for (let timestamp = firstTimestamp + ((day - weekday(first) + 7) % 7) * 86400000; timestamp <= lastTimestamp; timestamp += 7 * 86400000) put(flight, new Date(timestamp).toISOString().slice(0, 10))
    }
  }
  for (const order of state.airOrders || []) {
    const date = orderDate(order), code = orderFlight(order)
    if (!isBookedOrder(order) || !code || !validCapacityDate(date) || date < startDate || date > endDate) continue
    const flight = (master.flights || []).find(row => row.code === code) || { id: `ORDER-FLIGHT:${code}`, code, airlineCode: '', origin: '', destination: '', takeoffTime: '', arrivalTime: '', cutoffTime: '' }
    put(flight, date)
  }
  return [...candidates.values()]
}

export function getCapacityQueryRestriction(state = {}, { startDate, endDate } = {}) {
  if (!validCapacityDate(startDate) || !validCapacityDate(endDate) || startDate > endDate) return '请选择完整且顺序正确的出港日期范围'
  try { capacityDateCandidates(state, { startDate, endDate }); return '' } catch (error) { return error.message }
}

export function deriveCapacityRows(state = {}, { startDate, endDate } = {}) {
  if (!validCapacityDate(startDate) || !validCapacityDate(endDate) || startDate > endDate) return []
  const rows = [], master = state.airMaster || {}
  const products = (state.capacityProducts || []).map(row => getCapacityProductView(row, master))
  for (const { flight, date } of capacityDateCandidates(state, { startDate, endDate })) {
      const day = weekday(date)
      const active = products.filter(row => row.flightId === flight.id && row.startDate <= date && date <= row.endDate)
        .map(row => ({ ...row, details: row.details.filter(detail => Number(detail.weekday) === day) })).filter(row => row.details.length)
      const details = active.flatMap(row => row.details)
      const boardCount = details.length && details.every(row => positiveInteger(row.quantity)) ? decimalTotal(details.map(row => [row.quantity])) : null
      const totalVolume = boardCount !== null && details.every(row => row.volume !== null) ? decimalTotal(details.map(row => [row.quantity, row.volume])) : null
      const contracts = active.filter(row => row.boardType === '合同板').flatMap(row => row.details)
      const totalBaseline = active.length && contracts.every(row => positiveInteger(row.quantity) && positiveInteger(row.baseline)) ? decimalTotal(contracts.map(row => [row.quantity, row.baseline])) : null
      const bookedOrders = (state.airOrders || []).filter(order => isBookedOrder(order) && orderFlight(order) === flight.code && orderDate(order) === date)
      const volumes = bookedOrders.map(order => getCapacityOrderVolume(order, state))
      const bookedVolume = volumes.every(row => row.volume !== null) ? decimalTotal(volumes.map(row => [row.volume])) : null
      const airline = (master.airlines || []).find(row => row.code === flight.airlineCode)
      rows.push({
        key: `${flight.id}:${date}`, flightId: flight.id, flight: flight.code, airlineCode: flight.airlineCode, airline: airline?.name || '',
        origin: flight.origin, destination: flight.destination, date, takeoffTime: flight.takeoffTime, arrivalTime: flight.arrivalTime,
        cutoffTime: flight.cutoffTime, products: active, boardCount, totalVolume, totalBaseline, bookedOrders, bookedVolume,
        remainingVolume: totalVolume !== null && bookedVolume !== null ? decimalTotal([[totalVolume], [-bookedVolume]]) : null,
        capacityReason: !active.length ? '未维护匹配的舱位产品，舱位容量尚未确定' : boardCount === null ? '板型数量未填写，板数和舱位总体积暂不能计算' : totalVolume === null ? '板体积主数据缺失，舱位总体积暂不能计算' : '',
        volumeReason: volumes.filter(row => row.reason).map(row => row.reason).join('；'),
      })
  }
  return rows.sort((left, right) => left.date.localeCompare(right.date) || left.flight.localeCompare(right.flight))
}

export function createCapacitySeed() {
  return [{
    id: 'CAP-00000001', flightId: 'FLIGHT-MU9001', boardType: '临时板', startDate: '2026-09-01', endDate: '2026-09-30',
    operator: '李明', handler: '王晴', remark: '', creator: '李明', createdAt: '2026-09-08 09:00', updatedAt: '2026-09-08 09:00', updateSequence: 1,
    details: CAPACITY_WEEKDAYS.map(({ value }) => ({ weekday: value, palletId: 'PALLET-DEMO-PMC', baseline: '', quantity: 2 })),
  }]
}
