import {
  TRANSPORT_QUOTE_KINDS, TRANSPORT_QUOTE_NOW,
  normalizeTransportQuoteDraft, validateTransportQuoteDraft,
} from '../domain/transportQuotes.js'

const clone = value => JSON.parse(JSON.stringify(value))
const knownKind = kind => TRANSPORT_QUOTE_KINDS.includes(kind)

export function validateTransportQuoteBatch(kind, payloads, state) {
  if (!knownKind(kind)) return [{ index: 0, fields: { kind: '未知报价类别' } }]
  if (!Array.isArray(payloads) || !payloads.length) return [{ index: 0, fields: { rows: '请至少保留一条报价' } }]
  const drafts = payloads.map(payload => normalizeTransportQuoteDraft(kind, payload))
  const editingIds = drafts.map(row => row.id).filter(Boolean)
  const retained = state.transportQuotes.filter(row => !editingIds.includes(row.id))
  return drafts.flatMap((draft, index) => {
    const original = payloads[index]
    const existing = draft.id ? state.transportQuotes.find(row => row.id === draft.id && row.kind === kind) : null
    const otherDrafts = drafts.filter((row, rowIndex) => rowIndex !== index).map((row, rowIndex) => ({ ...row, id: row.id || `draft-${rowIndex}` }))
    const fields = validateTransportQuoteDraft(draft, [...retained, ...otherDrafts], state.partners, { existing })
    if (!original || typeof original !== 'object' || Array.isArray(original)) fields.rows = '报价行格式不正确'
    if (original?.kind && original.kind !== kind) fields.kind = '报价类别不能修改'
    if (draft.id && !existing) fields.id = '报价记录不存在或不属于当前类别'
    if (draft.id && editingIds.filter(id => id === draft.id).length > 1) fields.id = '不能重复保存同一报价'
    return Object.keys(fields).length ? [{ index, fields }] : []
  })
}

export function createTransportQuoteActions(state, getSession) {
  const requirePermission = kind => {
    if (!knownKind(kind)) throw new Error('未知报价类别')
    if (!['hangsheng', 'supervisor', 'admin'].includes(getSession().role)) throw new Error('仅航晟客服、主管或管理员可维护报价')
  }
  function saveTransportQuotes(kind, payloads) {
    requirePermission(kind)
    const rowErrors = validateTransportQuoteBatch(kind, payloads, state)
    if (rowErrors.length) {
      const first = rowErrors[0]
      throw Object.assign(new Error(`第 ${first.index + 1} 行：${Object.values(first.fields)[0]}`), {
        rowErrors, rowIndex: first.index, fields: first.fields,
      })
    }
    let sequence = state.transportQuoteSequence
    const records = payloads.map(payload => {
      const draft = normalizeTransportQuoteDraft(kind, payload)
      if (!draft.id) {
        do {
          sequence += 1
          draft.id = `TQ${kind === 'supplier' ? 'S' : 'C'}-${String(sequence).padStart(8, '0')}`
        } while (state.transportQuotes.some(row => row.id === draft.id))
      }
      return { ...clone(draft), updatedBy: getSession().name, updatedAt: TRANSPORT_QUOTE_NOW }
    })
    // Validate the complete batch before updating records or consuming identifiers.
    for (const record of records) {
      const existing = state.transportQuotes.find(row => row.id === record.id)
      if (existing) Object.assign(existing, record)
      else state.transportQuotes.push(record)
    }
    state.transportQuoteSequence = sequence
    return records.map(record => state.transportQuotes.find(row => row.id === record.id))
  }
  function deleteTransportQuotes(kind, ids) {
    requirePermission(kind)
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('请选择不重复的报价记录')
    if (ids.some(id => !state.transportQuotes.some(row => row.id === id && row.kind === kind))) throw new Error('报价记录不存在或不属于当前类别')
    state.transportQuotes = state.transportQuotes.filter(row => !ids.includes(row.id))
    return ids.length
  }
  return { saveTransportQuotes, deleteTransportQuotes }
}
