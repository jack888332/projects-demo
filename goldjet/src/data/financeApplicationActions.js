import { canReadModule, canWriteModule, workbenchSession, accessState } from './accessControl.js'
import { canReadApplicationKind } from '../domain/financeApplicationAccess.js'
import { applicationDraft, applicationRows, applicationSources, applicationSelection, applicationTotals, requestedAmountError, receiptAccountSnapshot, applicationAttachmentError, applicationCsv, matchesApplicationQuery } from '../domain/financeApplications.js'
import { cloneCost } from '../domain/orderCosts.js'

export function captureApplicationContext(state, value, alive = () => true) {
  const book = state.financeApplications, statements = state.reconciliation, persona = workbenchSession.personaId, revision = accessState.revision, snapshot = JSON.stringify(value)
  return () => alive() && book === state.financeApplications && statements === state.reconciliation && persona === workbenchSession.personaId && revision === accessState.revision && snapshot === JSON.stringify(value)
}
export function createFinanceApplicationActions(state, getSession) {
  const db = () => state.financeApplications
  const stamp = () => new Date(Date.UTC(2026, 8, 8, 16, 0, ++db().eventSequence)).toISOString().slice(0, 19).replace('T', ' ')
  function read(kind) {
    if (!canReadModule('paymentRequests') || !canReadApplicationKind(kind, getSession().id)) throw new Error('当前岗位未获该申请数据查看授权')
  }
  function authorize(kind) {
    read(kind)
    if (!canWriteModule('paymentRequests') || getSession().id !== 'financeAccountant') throw new Error('当前岗位未获该申请操作授权')
    if (kind !== 'receipt') throw new Error('付款来源、发票及审批规则待确认（037、038、106、201、203）')
    return getSession()
  }
  function find(id) {
    const row = db().rows.find(row => row.id === id && !row.deleted)
    if (!row) throw new Error('申请不存在或已删除')
    authorize(row.kind)
    if (row.demoOnly) throw new Error('独立展示样本不参与业务写入')
    return row
  }
  function record(row, action, time, actor) {
    Object.assign(row, { updatedBy: actor.name, updatedAt: time })
    row.history.push({ action, actor: actor.name, time, opinion: row.approvalOpinion })
  }
  function notice(row, event, recipient, time, review = false) {
    db().notices.unshift({ id: `APP-NOTICE-${db().eventSequence}`, recipient, type: event,
      content: `${row.applicationNo} · ${row.settlementParty} · ${event}`, channel: '本地模拟', createdAt: time,
      related: { path: '/finance/payment-requests', query: { kind: row.kind, application: row.id, ...(review ? { view: 'approve' } : {}) } },
    })
  }
  function validateLive(row) {
    const current = new Map(applicationSources(state, row.kind).map(line => [line.id, line]))
    for (const line of row.lines) {
      const live = current.get(line.id)
      if (!live || live.availableAmount < 0 || ['sourceCostId', 'originalAmount', 'partyId', 'currency', 'taxRate'].some(key => live[key] !== line[key])) throw new Error('源明细或申请余额已变化，请重新核对')
    }
  }
  return {
    saveFinanceApplication(payload, submit = false) {
      const actor = authorize(payload.kind)
      const ids = payload.lines?.map(line => line.id), lines = applicationSelection(state, ids, payload.kind)
      const normalized = applicationDraft(state, ids, payload.kind, actor)
      const errors = {}
      payload.lines.forEach((line, index) => {
        const { requestedAmount, ...snapshot } = line
        if (JSON.stringify(snapshot) !== JSON.stringify(lines[index])) errors[line.id] = '源明细或可申请金额已变化，请重新选择'
        else if (requestedAmountError(line)) errors[line.id] = requestedAmountError(line)
      })
      const filesError = applicationAttachmentError(payload.attachments)
      if (filesError) errors.attachments = filesError
      const account = receiptAccountSnapshot(state, actor.id, normalized, payload.account?.id)
      if (JSON.stringify(account) !== JSON.stringify(payload.account)) errors.account = '账户资料已变化，请重新保存收款账户'
      if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
      if (db().sequence >= 99999) throw new Error('当日流水已用尽')
      const applicationNo = `RA${db().today.slice(2).replaceAll('-', '')}${String(db().sequence + 1).padStart(5, '0')}`
      if (db().rows.some(row => row.applicationNo === applicationNo)) throw new Error('申请批次号已占用，编号规则见204')
      const time = stamp()
      const savedLines = normalized.lines.map((line, index) => ({ ...line, requestedAmount: String(payload.lines[index].requestedAmount) }))
      const row = { ...normalized, id: applicationNo, applicationNo, lines: savedLines, ...applicationTotals(savedLines),
        status: submit ? '已提交' : '新建', account: cloneCost(account), attachments: cloneCost(payload.attachments), remark: String(payload.remark || '').trim(),
        createdById: actor.id, createdAt: time, submittedById: submit ? actor.id : '', submittedAt: submit ? time : '', history: [],
      }
      db().sequence++
      record(row, submit ? '保存并提交' : '保存', time, actor)
      db().rows.unshift(row)
      if (submit) notice(row, '收款申请待审批', 'financeAccountant', time, true)
      return row
    },
    submitFinanceApplication(id) {
      const row = find(id), actor = getSession()
      if (!['新建', '财务审批拒绝'].includes(row.status)) throw new Error('只有新建或财务审批拒绝的申请可以提交')
      validateLive(row)
      const time = stamp()
      Object.assign(row, { status: '已提交', submittedById: actor.id, submittedAt: time })
      record(row, '提交', time, actor); notice(row, '收款申请待审批', 'financeAccountant', time, true)
      return row
    },
    deleteFinanceApplication(id) {
      const row = find(id)
      if (!['新建', '财务审批拒绝'].includes(row.status)) throw new Error('只有新建或财务审批拒绝的申请可以删除')
      const time = stamp()
      row.deleted = true
      record(row, '删除', time, getSession())
    },
    reviewFinanceApplication(id, approved, opinion = '') {
      const row = find(id)
      if (row.status !== '已提交') throw new Error('只有已提交申请可以审批')
      if (typeof approved !== 'boolean') throw new Error('审批结果无效')
      validateLive(row)
      const time = stamp()
      Object.assign(row, { status: approved ? '财务审批通过' : '财务审批拒绝', approvalOpinion: String(opinion).trim(), approvedAt: time })
      record(row, row.status, time, getSession()); notice(row, row.status, row.submittedById, time)
      return row
    },
    exportFinanceApplications(kind, { pending = false, query = {}, ids = null } = {}) {
      read(kind)
      if (kind === 'payment' && pending) throw new Error('付款申请来源待确认（201）')
      if (kind === 'payment' && ids === null) throw new Error('付款申请仅支持导出勾选数据')
      let rows = (pending ? applicationSources(state, kind) : applicationRows(state, kind)).filter(row => matchesApplicationQuery(row, query))
      if (ids !== null) {
        if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !rows.some(row => row.id === id))) throw new Error('勾选数据已变化，请重新选择')
        rows = rows.filter(row => ids.includes(row.id))
      } else if (pending) throw new Error('待申请明细仅支持导出勾选数据')
      if (!rows.length) throw new Error('没有可导出的申请数据')
      return { name: `${kind === 'receipt' ? '收款' : '付款'}${pending ? '待申请明细' : '申请'}-${db().today}.csv`, content: applicationCsv(rows, pending), count: rows.length }
    },
  }
}
