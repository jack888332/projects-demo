import { createGroundOrderDraft, groundOrderPermissions, groundCustomers, validateGroundOrderDraft, groundPointLabel, groundOrderChanges } from '../domain/groundOrders.js'
import { GROUND_DATE, createDispatchDraft, validateDispatchDraft, calculateGroundAllocation, getGroundQuotes } from '../domain/groundOperations.js'

const clone = value => JSON.parse(JSON.stringify(value))
export function createGroundOrderActions(state, getSession) {
  const now = () => new Date(Date.UTC(2026, 8, 8, 14, 30, ++state.groundOrderEventSequence)).toISOString().slice(0, 19).replace('T', ' ')
  const find = id => { const row = state.groundOrders.find(order => order.id === id); if (!row) throw new Error('运输订单不存在'); return row }
  function recordGroundOrder(order, event, content, time = now(), changes = []) {
    order.history ||= []
    order.history.push({ id: `${order.id}-H${order.history.length + 1}`, event, content, changes: clone(changes), actor: getSession().accountId || getSession().role, time })
    order.updatedAt = time
  }
  function recordGroundDispatchMail(order, oldPlate = '') {
    const recipients = [...new Set((order.customerContacts ? order.customerContacts.map(row => row.email) : String(order.customerEmail || '').split('；')).filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))]
    if (!recipients.length) return
    const bills = state.groundWaybills.filter(bill => bill.orderId === order.id && bill.status !== '已取消')
    const present = value => value !== '' && value != null
    const rows = fields => fields.filter(([,value]) => present(value)).map(([label,value]) => `${label}：${value}`).join('\n')
    const vehicles = bills.map(bill => rows([
      ['车牌号',bill.plate], ['司机',bill.drivers.map(driver => rows([['姓名',driver.name],['联系电话',driver.phone],['身份证',driver.identity]])).filter(Boolean).join('；')],
      ...[['vehicleType','车型'],['companyAddress','公司地址'],['customsNo','海关编号'],['vehicleWeight','车自重'],['containerNo','柜号'],['frameWeight','架重'],['containerWeight','柜重'],['customerPassword','客户密码']].map(([key,label]) => [label,bill[key]]),
    ])).join('\n\n')
    const cargo = rows([['件数',order.pieces],['重量',order.weight],['体积',order.volume],['长度',order.length],['宽度',order.width],['高度',order.height],['提货点',order.pickup],['卸货点',order.delivery]])
    order.dispatchMails ||= []
    order.dispatchMails.push({ id: `${order.id}-MAIL${order.dispatchMails.length + 1}`, time: order.updatedAt,
      subject: `《单号：${order.orderNo}》的调度${oldPlate ? '调整' : '安排'}`, to: recipients, cc: ['hangsheng-service@example.invalid'],
      status: '本地模拟，未发送', body: [oldPlate ? `原车牌号：${oldPlate}\n变更后车牌号：${bills.map(bill => bill.plate).join('；')}` : '', `车辆数：${bills.length}`, vehicles, cargo].filter(Boolean).join('\n\n') })
  }
  function saveGroundOrder(payload, id = '') {
    const existing = id ? find(id) : null, permissions = groundOrderPermissions(existing, getSession().role)
    if (existing ? !permissions.edit : !permissions.create) throw new Error('当前角色、来源或状态不允许编辑订单')
    const remarkOnly = existing && !permissions.fullEdit
    const draft = remarkOnly ? { ...createGroundOrderDraft(existing), remark: payload.remark } : createGroundOrderDraft(payload)
    for (const key of Object.keys(draft)) if (key !== 'remark' && typeof draft[key] === 'string') draft[key] = draft[key].trim()
    for (const row of [...draft.customerContacts, ...draft.pickupPoints, ...draft.deliveryPoints]) {
      for (const key of Object.keys(row)) if (typeof row[key] === 'string') row[key] = row[key].trim()
    }
    const customers = groundCustomers(state)
    const errors = validateGroundOrderDraft(draft, customers, { remarkOnly })
    // Existing regulatory values remain readable, but undefined manual choices cannot be introduced.
    if (existing) draft.pickupPoints.forEach((point, index) => {
      if (point.regulated === createGroundOrderDraft(existing).pickupPoints[index]?.regulated) delete errors[`pickupPoints.${index}.regulated`]
    })
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    if (remarkOnly) {
      const before = existing.remark
      existing.remark = draft.remark
      recordGroundOrder(existing, '订单修改', '保存订单备注', now(), before !== draft.remark ? [{ field: '备注', before, after: draft.remark }] : [])
      return existing
    }
    const before = existing ? createGroundOrderDraft(existing) : null
    const time = now(), serial = existing ? null : ++state.groundOrderSequence
    const systemOrderNo = `T101${GROUND_DATE.slice(2).replaceAll('-', '')}${String(serial).padStart(5, '0')}`
    const order = existing || { id: systemOrderNo, systemOrderNo, source: '航晟手工创建', orderType: '', childNo: '', batchNo: '', dispatchStatus: '未调度', createdAt: time, createDate: GROUND_DATE, history: [] }
    Object.assign(order, clone(draft))
    order.customerOrderNo = draft.orderNo
    order.customerContact = draft.customerContacts.map(row => row.name).filter(Boolean).join('；')
    order.customerPhone = draft.customerContacts.map(row => row.phone).filter(Boolean).join('；')
    order.customerEmail = draft.customerContacts.map(row => row.email).filter(Boolean).join('；')
    for (const kind of ['pickup', 'delivery']) order[kind] = draft[kind + 'Points'].map(groundPointLabel).join('；')
    order.requiredAt = draft.pickupTime
    for (const key of ['specialVehicle', 'tailLift', 'regulated']) {
      const values = [...new Set(draft.pickupPoints.map(point => point[key] || ''))]
      order[key] = values.length === 1 ? values[0] : '待确认：多地点要求不同'
    }
    recordGroundOrder(order, existing ? '订单修改' : '订单创建', existing ? '保存订单字段修改' : '航晟手工提交订单', time, before ? groundOrderChanges(before, draft) : [])
    if (!remarkOnly) {
      const partner = customers.find(row => row.id === draft.customerPartnerId)
      partner.businessContacts ||= []
      for (const row of draft.customerContacts.filter(row => row.name && row.phone && row.email)) {
        const contact = { name: row.name.trim(), phone: row.phone.trim(), emails: [row.email.trim()] }
        const known = [...partner.businessContacts, ...(partner.contacts || []).map(item => ({ name: item.name, phone: item.mobile || item.phone, emails: [item.email] }))]
        if (!known.some(item => item.name === contact.name && item.phone === contact.phone && item.emails?.includes(contact.emails[0]))) partner.businessContacts.push(contact)
      }
    }
    if (!existing) state.groundOrders.unshift(order)
    return find(order.id)
  }
  function closeGroundOrder(id) {
    const order = find(id)
    if (!groundOrderPermissions(order, getSession().role).close || state.groundWaybills.some(bill => bill.orderId === id)) throw new Error('仅未调度手工订单可无费用关闭；已调度关闭的费用与资格待确认')
    order.dispatchStatus = '已关闭'
    recordGroundOrder(order, '订单关闭', '未调度手工订单关闭，不产生费用')
    return order
  }
  function modifyGroundDispatch(id, payload) {
    const bill = state.groundWaybills.find(row => row.id === id), order = bill && find(bill.orderId)
    if (!['hangsheng', 'supervisor'].includes(getSession().role) || !order || order.source !== '航晟手工创建' || order.dispatchStatus !== '已调度' || bill.status !== '待提货' || bill.exceptionStatus === '异常中') throw new Error('仅无异常的待提货运单可修改调度；其他状态须取消重录，上游回传规则待确认')
    const errors = validateDispatchDraft(payload)
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    const fields = Object.keys(createDispatchDraft()), before = Object.fromEntries(fields.map(key => [key, clone(bill[key] ?? null)]))
    const update = Object.fromEntries(fields.map(key => [key, clone(payload[key] ?? createDispatchDraft()[key])]))
    const quote = getGroundQuotes(order, update.vehicleType).find(row => row.name === update.supplier)
    update.cost = quote?.cost ?? null
    Object.assign(bill, update, calculateGroundAllocation(order, update, state.groundWaybills.filter(row => row.orderId === order.id && row.status !== '已取消').length))
    const time = now()
    bill.dispatchUpdatedAt = time; bill.updatedAt = time; bill.dispatchedBy = getSession().name; bill.dispatchedById = getSession().accountId || getSession().role
    bill.costStatus = quote ? '合成报价匹配' : '待确认：未匹配报价'
    const labels = { vehicleType:'车型',supplier:'供应商',cost:'成本价格',plate:'车牌号',drivers:'司机',companyAddress:'公司地址',customsNo:'海关编号',vehicleWeight:'车自重',containerNo:'柜号',frameWeight:'架重',containerWeight:'柜重',customerPassword:'客户密码',remark:'备注',specificPieces:'特定件数',specificVolume:'特定体积',specificWeight:'特定重量',specificLength:'特定长度',specificWidth:'特定宽度',specificHeight:'特定高度' }
    recordGroundOrder(order, '修改调度', bill.waybillNo, time, fields.filter(key => JSON.stringify(before[key]) !== JSON.stringify(update[key])).map(key => ({ field: labels[key], before: before[key], after: update[key] })))
    const vehicle = { ...update, cost: null, ...Object.fromEntries(fields.filter(key => key.startsWith('specific')).map(key => [key, null])) }
    state.groundPlateHistory = [vehicle, ...state.groundPlateHistory.filter(row => row.plate !== vehicle.plate)]
    recordGroundDispatchMail(order, before.plate)
    return bill
  }
  return { saveGroundOrder, closeGroundOrder, modifyGroundDispatch, recordGroundOrder, recordGroundDispatchMail }
}
