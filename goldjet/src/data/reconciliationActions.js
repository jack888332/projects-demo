import { canWriteModule, canReadModule, workbenchSession, accessState } from './accessControl.js'
import { RECONCILIATION_CREATE_ROLES, RECONCILIATION_CONFIRM_ROLES } from '../domain/reconciliationAccess.js'
import { statementDraft, statementSelection, statementAttachmentError, statementDetails, matchesStatementQuery, statementCsv } from '../domain/reconciliation.js'
import { cloneCost } from '../domain/orderCosts.js'

export function captureReconciliationContext(state, value, alive = () => true) {
  const book = state.reconciliation, costs = state.orderCostBook, persona = workbenchSession.personaId, revision = accessState.revision
  const snapshot = JSON.stringify(value)
  return () => alive() && book === state.reconciliation && costs === state.orderCostBook && persona === workbenchSession.personaId && revision === accessState.revision && snapshot === JSON.stringify(value)
}
export function createReconciliationActions(state, getSession) {
  const db = () => state.reconciliation
  const stamp = () => new Date(Date.UTC(2026, 8, 8, 15, 0, ++db().eventSequence)).toISOString().slice(0, 19).replace('T', ' ')
  function authorize(roles) {
    const actor = getSession()
    if (!canWriteModule('reconciliation') || !roles.includes(actor.id)) throw new Error('当前岗位未获此对账操作授权')
    return actor
  }
  function find(id) {
    const row = db().statements.find(item => item.id === id && item.status !== '已删除')
    if (!row) throw new Error('对账单不存在或已删除')
    return row
  }
  function validateSources(statement) {
    const costs = new Map(state.costs.map(row => [row.id, row]))
    if (statement.lines.some(line => {
      const cost = costs.get(line.sourceCostId)
      return !cost || cost.deleted || cost.status !== '财务审批通过' || ['partyId', 'direction', 'currency', 'originalAmount', 'taxRate', 'quantity', 'unitPrice'].some(key => cost[key] !== line[key])
    })) throw new Error('源成本明细已变化，请核对后处理')
  }
  return {
    saveStatement(payload, confirm = false) {
      const actor = authorize(RECONCILIATION_CREATE_ROLES)
      const ids = payload.lines?.map(row => row.sourceCostId)
      const rows = statementSelection(state, ids, payload.statementDirection)
      const draft = statementDraft(state, ids, payload.statementDirection, actor)
      if (JSON.stringify(draft.lines) !== JSON.stringify(payload.lines)) throw new Error('源明细已变化，请返回待对账列表重新选择')
      const remark = String(payload.remark || '').trim()
      if (remark.length > 200) throw new Error('备注不超过200字')
      const error = statementAttachmentError(payload.attachments)
      if (error) throw new Error(error)
      if (db().sequence >= 99999) throw new Error('当日流水已用尽，不能生成重复单号')
      const time = stamp(), statementNo = `BL${db().today.slice(2).replaceAll('-', '')}${String(++db().sequence).padStart(5, '0')}`
      const row = { ...draft, id: statementNo, statementNo, remark, attachments: cloneCost(payload.attachments),
        createdAt: time, createdById: actor.id, updatedAt: time, updatedBy: actor.name,
        status: confirm ? '已确认' : '新建', confirmedAt: confirm ? time : '', confirmedBy: confirm ? actor.name : '',
        history: [{ action: confirm ? '保存并确认' : '保存', actor: actor.name, time }],
      }
      // Statements own references and immutable presentation snapshots, never replacement costs.
      row.lines = rows.map((source, index) => ({ ...cloneCost(source), id: `${statementNo}-${index + 1}`, sourceCostId: source.id, statementLineNo: index + 1 }))
      db().statements.unshift(row)
      return row
    },
    confirmStatement(id) {
      const actor = authorize(RECONCILIATION_CONFIRM_ROLES), row = find(id)
      if (row.status !== '新建') throw new Error('只有新建对账单可以确认')
      validateSources(row)
      const time = stamp()
      Object.assign(row, { status: '已确认', confirmedAt: time, confirmedBy: actor.name, updatedAt: time, updatedBy: actor.name })
      row.history.push({ action: '确认', actor: actor.name, time })
      return row
    },
    deleteStatement(id) {
      authorize(RECONCILIATION_CREATE_ROLES)
      if (find(id).status !== '新建') throw new Error('只有新建对账单可以删除')
      throw new Error('删除授权与源明细释放规则待确认（194、200），暂不删除')
    },
    sendStatementMail(id) {
      authorize(RECONCILIATION_CREATE_ROLES)
      if (find(id).status !== '新建') throw new Error('只有新建对账单可以发送邮件')
      throw new Error('邮件收件人、模板及发送结果规则待确认（197），未发送邮件')
    },
    exportStatementDetails(direction, query) {
      if (!canReadModule('reconciliation')) throw new Error('当前岗位未获对账数据查看授权')
      const rows = statementDetails(state, direction).filter(row => matchesStatementQuery(row, query, 'details'))
      if (!rows.length) throw new Error('当前查询没有可导出的明细')
      return { name: `${direction}对账单明细-${db().today}.csv`, content: statementCsv(rows), count: rows.length }
    },
  }
}
