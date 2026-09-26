import { INTEGRATED_DATE } from '../domain/integratedOrders.js'
import {
  calculateHouseChargeWeight, createBillFields, createContainerRow, createEcommerceFields,
  createGeneralWaybillDraft, createHouseBillDraft, houseBillPermissions,
  validateGeneralWaybillDraft, validateHouseBillDraft, waybillPermissions,
} from '../domain/generalWaybills.js'

const clone = value => JSON.parse(JSON.stringify(value))
const text = value => String(value ?? '').trim()

export function createGeneralWaybillActions(state, getSession) {
  const now = () => new Date(Date.UTC(2026, 8, 8, 14, 30, ++state.integratedOrderEventSequence)).toISOString().slice(0, 19).replace('T', ' ')
  const session = () => getSession()
  const find = id => {
    const waybill = state.generalWaybills.find(row => row.id === id)
    if (!waybill) throw new Error('未找到总运单')
    return waybill
  }
  function saveGeneralWaybill(payload, id = '') {
    const existing = id ? find(id) : null
    if (existing ? !waybillPermissions(existing, session().role).edit : !waybillPermissions(null, session().role).create) throw new Error('当前角色或状态不允许维护总运单')
    const draft = normalize(payload)
    const errors = validateGeneralWaybillDraft(draft, { submit: true })
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    const time = now()
    if (!existing) {
      const serial = ++state.generalWaybillSequence
      const waybill = {
        ...draft, id: `WB-${INTEGRATED_DATE.replaceAll('-', '').slice(2)}-${String(serial).padStart(3, '0')}`,
        status: '有效', createdBy: session().name, createdAt: time,
      }
      state.generalWaybills.unshift(waybill)
      if (waybill.sourceOrderId) {
        const order = state.integratedOrders.find(row => row.id === waybill.sourceOrderId)
        if (order) {
          order.waybillNo = waybill.waybillNo
          order.waybillId = waybill.id
          order.history ||= []
          order.history.push({ id: `${order.id}-H${order.history.length + 1}`, event: '总运单补录', content: `补录总运单 ${waybill.waybillNo}`, actor: session().name, time })
        }
      }
      return waybill
    }
    Object.assign(existing, draft, { id: existing.id, status: existing.status, createdBy: existing.createdBy, createdAt: existing.createdAt, houses: existing.houses })
    return existing
  }
  function voidGeneralWaybill(id) {
    const waybill = find(id)
    if (!waybillPermissions(waybill, session().role).void) throw new Error('当前角色或状态不允许作废总运单')
    waybill.status = '已作废'
    waybill.voidedBy = session().name
    waybill.voidedAt = now()
    // 总运单自身的下游作废条件未明确，只标记本单无效，不级联改写订单或分单。
    return waybill
  }
  function saveGeneralHouse(waybillId, payload, houseId = '') {
    const waybill = find(waybillId)
    const existing = houseId ? waybill.houses.find(row => row.id === houseId) : null
    const permission = houseBillPermissions(waybill, existing, session().role)
    if (existing ? !permission.edit : !permission.create) throw new Error('当前角色、申报类型或状态不允许维护分单')
    const draft = createHouseBillDraft(payload)
    const errors = validateHouseBillDraft(draft)
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    if (existing) {
      Object.assign(existing, draft, { id: existing.id, status: existing.status, voidedBy: existing.voidedBy, voidedAt: existing.voidedAt })
      return existing
    }
    const serial = ++state.generalHouseSequence
    const house = {
      ...draft, id: `HB-${INTEGRATED_DATE.replaceAll('-', '').slice(2)}-${String(serial).padStart(3, '0')}`,
      houseNo: draft.houseNo || `GJ${INTEGRATED_DATE.slice(2, 7).replace('-', '')}${String(serial).padStart(5, '0')}`,
      status: '有效', inbound: null, billMeasured: null,
    }
    waybill.houses.push(house)
    return house
  }
  function voidGeneralHouse(waybillId, houseId) {
    const waybill = find(waybillId)
    const house = waybill.houses.find(row => row.id === houseId)
    if (!house || !houseBillPermissions(waybill, house, session().role).void) throw new Error('当前角色或状态不允许作废分单')
    house.status = '已作废'
    house.voidedBy = session().name
    house.voidedAt = now()
    return house
  }
  function addWaybillContainer(waybillId, payload) {
    const waybill = find(waybillId)
    if (!waybillPermissions(waybill, session().role).edit) throw new Error('当前角色或状态不允许维护集装箱')
    const row = { ...createContainerRow(), ...payload, serial: waybill.containers.length + 1 }
    waybill.containers.push(row)
    return row
  }
  function removeWaybillContainers(waybillId, serials) {
    const waybill = find(waybillId)
    if (!waybillPermissions(waybill, session().role).edit) throw new Error('当前角色或状态不允许维护集装箱')
    if (!Array.isArray(serials) || !serials.length) throw new Error('请勾选至少一条记录')
    waybill.containers = waybill.containers.filter(row => !serials.includes(row.serial)).map((row, index) => ({ ...row, serial: index + 1 }))
    return waybill.containers
  }
  function addEcommerceAttachment(waybillId, file) {
    const waybill = find(waybillId)
    if (!waybillPermissions(waybill, session().role).edit) throw new Error('当前角色或状态不允许维护附件')
    if (!file || !text(file.name)) throw new Error('请选择附件文件')
    const attachment = { id: `ATT-WB-${waybill.id}-${waybill.ecommerce.attachments.length + 1}`, name: file.name, size: Number(file.size) || 0, uploadedAt: now(), dataUrl: file.dataUrl || '' }
    waybill.ecommerce.attachments.push(attachment)
    return attachment
  }
  function normalize(payload) {
    const draft = clone(payload || {})
    draft.billFields = { ...createBillFields(), ...(draft.billFields || {}) }
    // 普货的提单号即总运单号，列表与订单回写共用同一值。
    if (draft.declarationType === '普货') draft.waybillNo = text(draft.billFields.waybillNo)
    draft.ecommerce = { ...createEcommerceFields(), ...(draft.ecommerce || {}), attachments: draft.ecommerce?.attachments || [] }
    draft.containers = (draft.containers || []).map((row, index) => ({ ...createContainerRow(), ...row, serial: index + 1 }))
    draft.houses = (draft.houses || []).map(house => ({ ...createHouseBillDraft(house), chargeWeight: calculateHouseChargeWeight(house) }))
    draft.declarationType = text(draft.declarationType)
    return draft
  }
  return {
    saveGeneralWaybill, voidGeneralWaybill, saveGeneralHouse, voidGeneralHouse,
    addWaybillContainer, removeWaybillContainers, addEcommerceAttachment,
  }
}
