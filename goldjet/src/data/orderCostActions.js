import { canReadModule, canWriteModule, workbenchSession, accessState } from './accessControl.js'
import { COST_ENTRY_ROLES, COST_EDIT_ROLES, COST_APPROVAL_STAGES } from '../domain/orderCostAccess.js'
import { COST_EDITABLE, cloneCost, costAmounts, costDraft, costErrors, costOrders, managedCosts, lookupCostRate } from '../domain/orderCosts.js'
import { loadOrderCostExamples } from './orderCostExamples.js'

export function captureOrderCostContext(state, row, alive = () => true) {
  const book = state.orderCostBook, persona = workbenchSession.personaId, revision = accessState.revision, snapshot = JSON.stringify(row)
  return () => alive() && book === state.orderCostBook && persona === workbenchSession.personaId && revision === accessState.revision && snapshot === JSON.stringify(row)
}

export function createOrderCostActions(state, getSession) {
  const db = () => state.orderCostBook
  const stamp = () => new Date(Date.UTC(2026, 8, 8, 14, 30, ++db().eventSequence)).toISOString().slice(0, 19).replace('T', ' ')
  function authorize(roles) {
    const actor = getSession()
    if (!canWriteModule('costs') || !roles.includes(actor.id)) throw new Error('当前岗位未获此成本操作授权')
    return actor
  }
  function findOrder(id) {
    const order = costOrders(state).find(row => row.id === id)
    if (!order) throw new Error('订单不存在、尚未完成或归属资料不完整')
    return order
  }
  function findCost(id) {
    const row = managedCosts(state).find(row => row.id === id)
    if (!row) throw new Error('成本行不存在或已删除')
    return row
  }
  function editable(row) {
    if (!COST_EDITABLE.includes(row.status)) throw new Error('当前状态不可编辑、删除或提交')
  }
  function validate(errors) {
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
  }
  function normalized(order, payload, old, adjustment = false, source = old) {
    const draft = costDraft(state, payload.direction)
    for (const key of ['childNo', 'partyId', 'feeItemId', 'direction', 'quantity', 'unit', 'currency', 'taxRate', 'unitPrice', 'agreedRate', 'remark', 'responsibleId', 'adjustmentReason', 'adjustmentType']) {
      draft[key] = String(payload[key] ?? '').trim()
    }
    draft.attachments = cloneCost(payload.attachments || [])
    if (source && source.currency === draft.currency) {
      draft.spotRate = source.spotRate; draft.rateId = source.rateId
    } else {
      const rate = lookupCostRate(state, draft.currency, (old?.createdAt || db().today).slice(0, 10))
      draft.spotRate = rate.rate; draft.rateId = rate.id
    }
    validate(costErrors(state, order, draft, { adjustment, existing: !!old }))
    if (old && !adjustment && old.direction !== draft.direction) throw new Error('成本属性由所在应收/应付区域决定，不可跨栏修改')
    if (old && !adjustment && old.direction === '应付' && old.partyId !== draft.partyId) throw new Error('应付结算单位类型待确认（186），暂不更换结算单位')
    const party = state.partners.find(row => row.id === draft.partyId), item = state.financeCostItems.find(row => row.id === draft.feeItemId)
    return { ...draft, settlementParty: party.name, feeItem: item.name, ...costAmounts(draft) }
  }
  function rateReference(row) {
    if (state.financeBasics.rates.some(rate => rate.id === row.rateId) && !state.financeBasics.rateReferences.some(ref => ref.costId === row.id && ref.rateId === row.rateId)) state.financeBasics.rateReferences.push({ costId: row.id, rateId: row.rateId, source: '订单成本引用' })
  }
  function audit(row, action, actor, time, remark = '') {
    row.updatedBy = actor.name; row.updatedAt = time
    row.history ||= []
    row.history.push({ action, actor: actor.name, persona: actor.id, time, remark })
  }
  function notice(row, event, recipient, time) {
    db().notices.push({ id: `COST-NOTICE-${db().notices.length + 1}`, rowId: row.id, orderId: row.orderId, adjustmentId: row.adjustmentNo ? row.id : '', event, recipient, time, channel: '本地模拟，未发送企业微信' })
  }
  function saveOrderCost(orderId, id, payload) {
    const actor = authorize(id ? COST_EDIT_ROLES : COST_ENTRY_ROLES), order = findOrder(orderId), old = id ? findCost(id) : null
    if (old) { editable(old); if (old.orderId !== orderId) throw new Error('成本行不属于当前订单') }
    const draft = normalized(order, payload, old), time = stamp()
    let row = old
    if (row) Object.assign(row, draft)
    else {
      row = { ...draft, id: `COST-23-${++db().sequence}`, lineNo: Math.max(0, ...state.costs.filter(row => row.orderId === orderId && row.managementVersion === 23).map(row => row.lineNo)) + 1, managementVersion: 23, orderId, orderNo: order.orderNo, status: '新建', createdBy: actor.name, createdAt: time, approvalRemark: '', history: [] }
      state.costs.push(row)
    }
    audit(row, old ? '编辑成本' : '新增成本', actor, time)
    rateReference(row)
    return row
  }
  function deleteOrderCost(id) {
    const actor = authorize(COST_EDIT_ROLES), row = findCost(id)
    editable(row); row.deleted = true; audit(row, '删除成本', actor, stamp())
  }
  function selected(ids, adjustment = false) {
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('请重新选择有效且不重复的记录')
    return ids.map(id => {
      const row = adjustment ? db().adjustments.find(row => row.id === id && !row.deleted) : findCost(id)
      if (!row) throw new Error('调整单不存在或已删除')
      findOrder(row.orderId)
      return row
    })
  }
  function submitOrderCosts(ids, adjustment = false) {
    const actor = authorize(adjustment ? COST_EDIT_ROLES : COST_ENTRY_ROLES), rows = selected(ids, adjustment)
    for (const row of rows) { editable(row); normalized(findOrder(row.orderId), row, row, adjustment) }
    const time = stamp()
    for (const row of rows) {
      row.status = '已提交'; row.submittedAt = time; row.submittedById = actor.id; row.submittedBy = actor.name; row.businessApprovedAt = ''; row.financeApprovedAt = ''
      audit(row, '提交审批', actor, time); notice(row, '提交成本审批', 'supervisor', time)
    }
    return rows
  }
  function reviewOrderCosts(ids, approved, { adjustment = false, rowRemarks = {}, orderRemark = '' } = {}) {
    const actor = authorize(Object.keys(COST_APPROVAL_STAGES)), rows = selected(ids, adjustment)
    if (rows.some(row => row.status !== COST_APPROVAL_STAGES[actor.id])) throw new Error('存在不属于当前审批环节的记录，整批未处理')
    if (String(orderRemark).length > 200 || rows.some(row => String(rowRemarks[row.id] || '').length > 200)) throw new Error('审批备注不超过200字')
    if (new Set(rows.map(row => row.orderId)).size !== 1) throw new Error('请在同一订单内审批')
    if (adjustment && approved && actor.id === 'financeAccountant') throw new Error('调整单最终生效的冲销/替换口径待确认（188），暂不执行财务通过')
    const time = stamp(), financial = actor.id === 'financeAccountant'
    for (const row of rows) {
      row.status = `${financial ? '财务' : '业务'}审批${approved ? '通过' : '拒绝'}`
      row.approvalRemark = String(rowRemarks[row.id] || '').trim()
      if (approved) row[financial ? 'financeApprovedAt' : 'businessApprovedAt'] = time
      audit(row, row.status, actor, time, row.approvalRemark)
      if (!approved || !financial) notice(row, row.status, approved ? 'financeAccountant' : row.submittedById || row.createdBy, time)
      if (financial && approved) db().syncEvents.push({ id: `KINGDEE-DEMO-${db().syncEvents.length + 1}`, costId: row.id, orderId: row.orderId, postingDate: row.businessApprovedAt.slice(0, 10), documentType: row.direction === '应收' ? '应收单' : '应付单', amount: row.amount, status: '本地待同步', externalId: '', time })
    }
    if (financial && approved && !adjustment) {
      const orderRows = managedCosts(state).filter(row => row.orderId === rows[0].orderId)
      if (orderRows.every(row => row.status === '财务审批通过')) {
        for (const recipient of new Set(orderRows.map(row => row.submittedById || row.createdBy))) notice(rows[0], '订单全部成本审批通过', recipient, time)
      }
    }
    db().orderRemarks[rows[0].orderId] = String(orderRemark).trim()
    return rows
  }
  function saveCostAdjustment(sourceId, id, payload, submit = false) {
    const actor = authorize(COST_EDIT_ROLES), old = id ? selected([id], true)[0] : null
    if (old) editable(old)
    const source = old ? old.sourceSnapshot : findCost(sourceId)
    if (source.status !== '财务审批通过') throw new Error('只能基于财务审批通过的结算明细创建调整单')
    const order = findOrder(source.orderId)
    if (old && JSON.stringify(payload.attachments) !== JSON.stringify(old.attachments)) throw new Error('已有调整单附件只读，补传规则待确认（190）')
    const draft = normalized(order, payload, old, true, old || source), time = stamp()
    let row = old
    if (row) Object.assign(row, draft)
    else {
      const number = `ADJ260908${String(++db().adjustmentSequence).padStart(5, '0')}`
      row = { ...draft, id: number, adjustmentNo: number, childNo: number, sourceChildNo: source.childNo, sourceId: source.id, sourceSnapshot: cloneCost(source), orderId: order.id, orderNo: order.orderNo, documentType: '调整单', status: '新建', createdBy: actor.name, createdAt: time, history: [] }
      db().adjustments.push(row)
    }
    row.childNo = row.adjustmentNo
    audit(row, old ? '编辑调整单' : '新增调整单', actor, time)
    rateReference(row)
    if (submit) { row.status = '已提交'; row.submittedAt = time; row.submittedById = actor.id; row.submittedBy = actor.name; row.businessApprovedAt = ''; row.financeApprovedAt = ''; notice(row, '提交调整单审批', 'supervisor', time) }
    return row
  }
  function deleteCostAdjustment(id) {
    const actor = authorize(COST_EDIT_ROLES), row = selected([id], true)[0]
    editable(row); row.deleted = true; audit(row, '删除调整单', actor, stamp())
  }
  return {
    saveOrderCost, deleteOrderCost, submitOrderCosts, reviewOrderCosts, saveCostAdjustment, deleteCostAdjustment,
    loadOrderCostExamples: () => { if (!canReadModule('costs')) throw new Error('当前角色未获该数据查看授权'); loadOrderCostExamples(state) },
  }
}
