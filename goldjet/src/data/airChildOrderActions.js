import { AIR_CHILD_PRICE_FIELDS, createAirChildDraft, getAirChildRestriction, getAirConsolidationContext, normalizeAirChildDraft, validateAirChildDraft, validateAirChildPrices, validateAirConsolidation } from '../domain/airChildOrders.js'
import { createAirDraft, createAirPriceDraft, createBookingDraft } from '../domain/airOperations.js'
import { calculateChargeWeight } from '../domain/chargeWeight.js'
import { GROUND_NOW } from '../domain/groundOperations.js'
import { WORKBENCH_PRODUCT_ASSIGNEES } from '../domain/workbenchTasks.js'
import { createAirServiceRecords } from './airOrderSupplementActions.js'
import { appendAirNotification } from './airOrderActions.js'

const clone = value => JSON.parse(JSON.stringify(value))
const check = errors => { if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors }) }
const reject = message => { if (message) throw new Error(message) }

export function createAirChildOrderActions(state, getSession, getCatalog = () => state.airMaster) {
  const find = id => { const child = state.airChildren.find(row => row.id === id); if (!child) throw new Error('子订单不存在'); return child }
  const checkChild = (child, action) => reject(getAirChildRestriction(child, getSession(), action))
  const nextEvent = () => {
    const value = state.airOrderEventSequence || 0
    if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) throw new Error('演示序号不可用，请恢复演示数据')
    return value + 1
  }
  function saveAirChildOrder(payload, { submit = false } = {}) {
    const existing = payload.id ? find(payload.id) : null
    checkChild(existing, 'edit')
    if (existing?.orderStatus === '子订单完成') {
      check(validateAirChildPrices(payload))
      const previous = createAirPriceDraft(existing), prices = createAirPriceDraft(payload)
      if (AIR_CHILD_PRICE_FIELDS.every(key => previous[key] === prices[key])) return existing
      const recipients = existing.assignees || WORKBENCH_PRODUCT_ASSIGNEES[existing.product] || {}
      if (!recipients.operator || !recipients.handler) throw new Error('报价修改通知的航线运营与操作接收人待确认')
      Object.assign(existing, prices, { updatedAt: GROUND_NOW })
      const labels = { sellRate: '运费卖价', truckSellRate: '后段卡车卖价', foamRatio: '分泡' }
      const content = `子订单号：${existing.orderNo}，${AIR_CHILD_PRICE_FIELDS.map(key => `${labels[key]}：${previous[key] ?? '未填写'} → ${prices[key] ?? '未填写'}`).join('；')}。`
      for (const recipient of new Set([recipients.operator, recipients.handler])) appendAirNotification(state, existing, '子订单报价修改', recipient, content, { path: '/fulfillment/air-children', query: { order: existing.id } })
      return existing
    }
    const draft = normalizeAirChildDraft(payload)
    check(validateAirChildDraft(draft, state.partners, getCatalog()))
    if (draft.housebillNo && state.airChildren.some(row => row.id !== existing?.id && row.housebillNo?.toUpperCase() === draft.housebillNo.toUpperCase())) throw Object.assign(new Error('分单号已存在'), { fields: { housebillNo: '分单号已存在' } })
    let sequence = state.airChildSequence || 0, id = existing?.id, generated = ''
    if (!existing) do {
      if (!Number.isSafeInteger(sequence) || sequence >= 99999999) throw new Error('子订单演示序号已用尽，请恢复演示数据')
      sequence += 1
      id = `AIR-CHILD-${String(sequence).padStart(8, '0')}`
      generated = `DEMO${String(sequence).padStart(8, '0')}`
    } while (state.airChildren.some(row => row.id === id || (!draft.housebillNo && row.housebillNo?.toUpperCase() === generated)))
    const event = nextEvent()
    const records = submit ? createAirServiceRecords(id, draft.services, draft, event, existing?.serviceRecords || []) : []
    const child = {
      ...(existing || {}), ...clone(draft), id, orderNo: existing?.orderNo || id, sourceKind: 'standalone', isChild: true,
      parentId: '', customer: draft.customer, creator: existing?.creator || getSession().name,
      housebillNo: draft.housebillNo || existing?.housebillNo || generated,
      identifierSource: draft.housebillNo ? (existing?.housebillNo === draft.housebillNo ? existing.identifierSource : '客户提供') : existing?.identifierSource || '合成演示编号',
      pieces: Number(draft.pieces), grossWeight: Number(draft.grossWeight), volume: Number(draft.volume),
      chargeWeight: calculateChargeWeight(draft.grossWeight, draft.volume), cargoSource: '预计',
      orderStatus: submit ? '子订单完成' : '子订单暂存', bookingStatus: '',
      serviceRecords: [...(existing?.serviceRecords || []), ...records],
      assignees: { ...WORKBENCH_PRODUCT_ASSIGNEES[draft.product] },
      expectedDepartureDate: draft.departureDate, createDate: existing?.createDate || GROUND_NOW.slice(0, 10),
      createdAt: existing?.createdAt || GROUND_NOW, updatedAt: GROUND_NOW,
      ...(submit ? { completedAt: GROUND_NOW } : {}),
    }
    const partner = state.partners.find(row => row.name === draft.customer && row.type === '客户')
    const emails = [...new Set((draft.contactEmails || []).map(value => value.trim()).filter(Boolean))]
    if (partner && (draft.contact || draft.phone || emails.length)) {
      const contact = { name: draft.contact || '', phone: draft.phone || '', emails }
      partner.businessContacts ||= []
      if (!partner.businessContacts.some(row => JSON.stringify(row) === JSON.stringify(contact))) partner.businessContacts.push(contact)
    }
    if (existing) Object.assign(existing, child)
    else { state.airChildren.push(child); state.airChildSequence = sequence }
    state.airOrderEventSequence = event
    return existing || state.airChildren.find(row => row.id === id)
  }

  function submitAirChildOrder(id) {
    const child = find(id)
    checkChild(child, 'submit')
    return saveAirChildOrder({ ...createAirChildDraft(child), id }, { submit: true })
  }

  function deleteAirChildOrder(id) {
    const child = find(id)
    checkChild(child, 'delete')
    if (child.serviceRecords?.length) throw new Error('已有服务的子订单作废与费用处理待确认，暂不删除')
    if (child.orderStatus === '子订单暂存') state.airChildren = state.airChildren.filter(row => row.id !== id)
    else { child.deleted = true; child.updatedAt = GROUND_NOW }
    return child
  }

  function createAirConsolidatedOrder(ids, payload) {
    reject(getAirChildRestriction(null, getSession(), 'create'))
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('请选择互不重复的子订单')
    const children = ids.map(id => find(id))
    for (const child of children) checkChild(child, 'consolidate')
    const draft = Object.fromEntries(['origin', 'destination', 'flowTo', 'airline', 'product', 'bookingRequirement'].map(key => [key, typeof payload?.[key] === 'string' ? payload[key].trim() : '']))
    check(validateAirConsolidation(draft, children, getCatalog()))
    const context = getAirConsolidationContext(children)
    let sequence = state.airOrderSequence || 0, id
    do {
      if (!Number.isSafeInteger(sequence) || sequence >= Number.MAX_SAFE_INTEGER) throw new Error('订单演示序号不可用，请恢复演示数据')
      id = `AIR-260908-${String(++sequence).padStart(3, '0')}`
    } while (state.airOrders.some(row => row.id === id))
    const parent = {
      ...createAirDraft(), ...draft, id, orderNo: `GJ-${id}`, orderType: '合成主订单', businessType: '空运出口',
      customer: context.customers.join('、'), sourceCustomers: context.customers, owner: context.owners.join('、'), sourceOwners: context.owners,
      creator: getSession().name, childCount: children.length, childNo: String(children.length), sourceChildIds: [...ids],
      sourceKind: 'consolidated', pieces: context.pieces, grossWeight: context.grossWeight, volume: context.volume,
      goodsName: children.map(row => row.goodsName).filter(Boolean).join('；'),
      specialCargo: '', sourceSpecialCargo: [...new Set(children.map(row => row.specialCargo).filter(Boolean))],
      expectedArrival: '', sourceExpectedArrivals: children.map(row => ({ childId: row.id, value: row.expectedArrival || '' })),
      sellRate: context.sellRate, truckSellRate: context.truckSellRate ?? undefined, foamRatio: undefined, chargeWeight: context.chargeWeight,
      route: `${draft.origin} - ${draft.destination}`, orderStatus: '待订舱', bookingStatus: '待服务',
      supplier: '', flight: '', waybillNo: '', expectedDepartureDate: '', departureDate: '',
      booking: { ...createBookingDraft(), airline: draft.airline }, assignees: { ...WORKBENCH_PRODUCT_ASSIGNEES[draft.product] },
      services: [{ id: `${id}-BOOKING`, type: 'booking', name: '订舱', status: '待服务', createdAt: GROUND_NOW, simulation: '本地服务记录，未发送外部系统' }],
      createDate: GROUND_NOW.slice(0, 10), createdAt: GROUND_NOW, updatedAt: GROUND_NOW,
    }
    for (const child of children) { child.parentId = id; child.updatedAt = GROUND_NOW }
    state.airOrders.unshift(parent)
    state.airOrderSequence = sequence
    appendAirNotification(state, parent, '待订舱', parent.assignees.operator, `订单号：${parent.orderNo}待订舱，请尽快处理！`, { path: '/fulfillment/booking', query: { order: parent.id } })
    return state.airOrders.find(row => row.id === id)
  }

  return { saveAirChildOrder, submitAirChildOrder, deleteAirChildOrder, createAirConsolidatedOrder }
}
