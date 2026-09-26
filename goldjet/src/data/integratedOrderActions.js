import {
  INTEGRATED_DATE, INTEGRATED_NOW, createHouseDraft, deriveOrderAutoComplete,
  houseNoFor, integratedOrderPermissions, orderNoFor, validateIntegratedOrderDraft,
} from '../domain/integratedOrders.js'

const clone = value => JSON.parse(JSON.stringify(value))
const text = value => String(value ?? '').trim()

export function createIntegratedOrderActions(state, getSession) {
  const now = () => new Date(Date.UTC(2026, 8, 8, 14, 30, ++state.integratedOrderEventSequence)).toISOString().slice(0, 19).replace('T', ' ')
  const find = id => {
    const order = state.integratedOrders.find(row => row.id === id)
    if (!order) throw new Error('综合订单不存在')
    return order
  }
  const permission = order => integratedOrderPermissions(order, getSession().role)
  function assertWrite(order, field) {
    if (!permission(order)[field]) throw new Error('当前角色、状态或建单人资格不允许该操作')
  }
  function record(order, event, content, time = now(), changes = []) {
    order.history ||= []
    order.history.push({ id: `${order.id}-H${order.history.length + 1}`, event, content, changes: clone(changes), actor: getSession().name || getSession().role, time })
    order.updatedAt = time
  }
  function nextServiceNo(time = INTEGRATED_DATE) {
    return `SV${time.slice(2).replaceAll('-', '')}${String(++state.integratedServiceSequence).padStart(5, '0')}`
  }
  // Submit and manual dispatch share one generator; 客自处理 keeps the record without a downstream service order.
  function generateServices(order, time = now()) {
    const generated = []
    for (const record of order.services || []) {
      if (record.generated || record.serviceType === '客自处理') continue
      record.id = nextServiceNo()
      record.generated = true
      record.status = '待接单'
      record.history ||= []
      record.history.push({ id: `${record.id}-T1`, event: '生成服务', actor: '系统', content: '按服务下发规则生成服务单', time })
      generated.push(record)
    }
    return generated
  }
  function refreshAutoComplete(order, time = now()) {
    if (order.status === '进行中' && deriveOrderAutoComplete(order)) {
      order.status = '已完成'
      record(order, '服务完成', '全部服务已完成，订单自动转已完成', time)
    }
  }
  function saveIntegratedOrder(payload, id = '') {
    const existing = id ? find(id) : null
    if (existing ? !permission(existing).edit : !permission(null).create) throw new Error('当前角色不允许保存综合订单')
    const draft = normalizeDraft(payload)
    const errors = validateIntegratedOrderDraft(draft, { submit: false })
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    const before = existing ? clone(existing) : null
    const time = now()
    if (!existing) {
      const serial = ++state.integratedOrderSequence
      const orderNo = orderNoFor(draft.businessType, serial)
      const order = {
        ...draft, id: orderNo, orderNo,
        creator: getSession().name, createdAt: time, status: '未提交',
        source: '直接建单', history: [], services: draft.services || [], attachments: draft.attachments || [],
        serviceClerk: getSession().name,
      }
      assignHouseKeys(order)
      order.houses.forEach(house => { house.houseNo = house.houseNo || '' })
      record(order, '订单创建', '保存为未提交草稿', time)
      state.integratedOrders.unshift(order)
      return order
    }
    // 运行中只允许按 §4.3 维护货物、服务和附件，基本信息与客户信息保持只读。
    const scope = permission(existing).editScope
    if (scope === 'running') {
      existing.houses = draft.houses.map(house => ({ key: house.key, houseNo: house.houseNo, cargo: house.cargo }))
      existing.services = draft.services
      existing.attachments = draft.attachments
      existing.waybillNo = text(draft.waybillNo) || existing.waybillNo
    } else {
      Object.assign(existing, draft, { id: existing.id, orderNo: existing.orderNo, status: existing.status, creator: existing.creator, source: existing.source, createdAt: existing.createdAt, history: existing.history })
    }
    record(existing, '订单编辑', scope === 'running' ? '维护货物、服务与附件' : '保存订单字段修改', time, changeSummary(before, existing))
    return existing
  }
  function normalizeDraft(payload) {
    const draft = clone(payload || {})
    draft.houses = (draft.houses?.length ? draft.houses : [createHouseDraft()]).map(house => ({ ...house, key: house.key || `HOUSE-${Math.random().toString(36).slice(2, 8)}`, cargo: house.cargo || [] }))
    draft.services = (draft.services || []).map(record => ({ ...record, history: record.history || [], fields: record.fields || {} }))
    draft.attachments = draft.attachments || []
    for (const key of Object.keys(draft)) if (typeof draft[key] === 'string') draft[key] = draft[key].trim()
    return draft
  }
  function assignHouseKeys(order) {
    order.houses.forEach(house => { house.key = house.key || `HOUSE-${Math.random().toString(36).slice(2, 8)}` })
  }
  function changeSummary(before, after) {
    const labels = { businessType: '业务类型', businessMode: '业务模式', financeOrg: '财务组织', department: '所属部门', salesperson: '业务员', customer: '客户名称', contactName: '联系人', contactPhone: '联系电话', contactEmail: '联系人邮箱', transportMode: '运输方式', originPort: '始发港', destinationPort: '目的港', waybillNo: '总运单号', remark: '备注' }
    return Object.entries(labels).filter(([key]) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(([key, label]) => ({ field: label, before: before[key], after: after[key] }))
  }
  function submitIntegratedOrder(id) {
    const order = find(id)
    assertWrite(order, 'submit')
    const errors = validateIntegratedOrderDraft(order, { submit: true })
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    const time = now()
    let serial = state.integratedHouseSequence
    order.houses.forEach(house => { if (!house.houseNo) house.houseNo = houseNoFor(++serial) })
    state.integratedHouseSequence = serial
    order.status = '进行中'
    const generated = generateServices(order, time)
    record(order, '提交订单', `生成 ${generated.length} 个未下发服务单，订单转进行中`, time)
    refreshAutoComplete(order, time)
    return order
  }
  function acceptIntegratedOrder(id) {
    const order = find(id)
    assertWrite(order, 'accept')
    order.status = '已接单'
    record(order, '接单', '所属部门客服确认需求', now())
    return order
  }
  function deleteIntegratedOrder(id) {
    const order = find(id)
    assertWrite(order, 'delete')
    state.integratedOrders.splice(state.integratedOrders.indexOf(order), 1)
    return true
  }
  function transferIntegratedOrder(id, payload) {
    const order = find(id)
    assertWrite(order, 'transfer')
    if (!text(payload?.transferOrg) || !text(payload?.transferDepartment)) throw new Error('请选择流转组织和流转部门')
    order.transfer = true
    order.transferOrg = payload.transferOrg
    order.transferDepartment = payload.transferDepartment
    order.originalSalesperson = payload.originalSalesperson || order.salesperson
    record(order, '订单流转', `流转至 ${payload.transferOrg} / ${payload.transferDepartment}；目标接单方式待确认`, now())
    return order
  }
  function cancelIntegratedOrder(id) {
    const order = find(id)
    assertWrite(order, 'cancel')
    order.status = '已取消'
    record(order, '取消订单', '进行中订单取消', now())
    return order
  }
  function dispatchIntegratedServices(id) {
    const order = find(id)
    assertWrite(order, 'edit')
    if (!['已接单', '进行中'].includes(order.status)) throw new Error('仅已保存且未完成的服务记录可下发')
    const generated = generateServices(order)
    record(order, '下发服务', generated.length ? `下发 ${generated.length} 个服务记录` : '没有尚未下发的服务记录', now())
    return generated
  }
  function cancelIntegratedService(id, serviceId) {
    const order = find(id)
    assertWrite(order, 'edit')
    const record_ = (order.services || []).find(row => row.id === serviceId)
    if (!record_ || !record_.generated) throw new Error('未找到可取消的下游服务单')
    if (!['待接单', '进行中'].includes(record_.status)) throw new Error('仅待接单或进行中的服务单可标记上游取消')
    const time = now()
    if (record_.status === '待接单') record_.status = '已取消'
    record_.upstreamCancelled = true
    record_.history.push({ id: `${record_.id}-T${record_.history.length + 1}`, event: '上游取消服务', actor: getSession().name, content: '上游取消服务标记为是', time })
    record(order, '上游取消服务', `${record_.id} 标记上游取消服务`, time)
    refreshAutoComplete(order, time)
    return record_
  }
  function addIntegratedAttachment(id, file) {
    const order = find(id)
    if (!permission(order).edit) throw new Error('当前状态不允许维护附件')
    if (!file || !text(file.name)) throw new Error('请选择附件文件')
    if (Number(file.size) > 20 * 1024 * 1024) throw new Error('单个附件不能超过 20M')
    const attachment = { id: `ATT-INT-${state.integratedOrders.length + 1}-${order.attachments.length + 1}`, type: file.type || '其他', name: file.name, size: Number(file.size) || 0, uploader: getSession().name, uploadedAt: now(), visibility: [], dataUrl: file.dataUrl || '' }
    order.attachments.push(attachment)
    record(order, '上传附件', attachment.name, INTEGRATED_NOW)
    return attachment
  }
  function removeIntegratedAttachment(id, attachmentId) {
    const order = find(id)
    if (!permission(order).edit) throw new Error('当前状态不允许维护附件')
    const index = order.attachments.findIndex(row => row.id === attachmentId)
    if (index < 0) throw new Error('附件不存在')
    const [removed] = order.attachments.splice(index, 1)
    // 删除原附件后，下游服务可见性由同一记录派生，不再单独保留投影。
    record(order, '删除附件', removed.name, INTEGRATED_NOW)
    return removed
  }
  function updateIntegratedAttachmentVisibility(id, attachmentId, visibility) {
    const order = find(id)
    if (!permission(order).edit) throw new Error('当前状态不允许调整附件可见性')
    const attachment = order.attachments.find(row => row.id === attachmentId)
    if (!attachment) throw new Error('附件不存在')
    attachment.visibility = [...new Set(visibility || [])]
    record(order, '调整附件可见性', `${attachment.name}：${attachment.visibility.join('、') || '不向服务类型公开'}`, INTEGRATED_NOW)
    return attachment
  }
  return {
    saveIntegratedOrder, submitIntegratedOrder, acceptIntegratedOrder, deleteIntegratedOrder,
    transferIntegratedOrder, cancelIntegratedOrder, dispatchIntegratedServices, cancelIntegratedService,
    addIntegratedAttachment, removeIntegratedAttachment, updateIntegratedAttachmentVisibility,
  }
}
