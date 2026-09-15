import {
  WAREHOUSE_QUOTE_NOW, getWarehouseQuoteAction, getWarehouseQuotePermissions,
  normalizeWarehouseQuoteDraft, validateWarehouseQuoteDraft,
} from '../domain/warehouseQuotes.js'

const clone = value => JSON.parse(JSON.stringify(value))

export function createWarehouseQuoteActions(state, getSession) {
  const requirePermission = () => {
    const permission = getWarehouseQuotePermissions(getSession().role)
    if (!permission.edit) throw new Error(permission.reason)
  }
  const findQuote = id => {
    const quote = state.warehouseQuotes.find(row => row.id === id)
    if (!quote) throw new Error('仓库报价记录不存在')
    return quote
  }
  function saveWarehouseQuote(payload) {
    requirePermission()
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Object.assign(new Error('报价格式不正确'), { fields: { quote: '报价格式不正确' } })
    const draft = normalizeWarehouseQuoteDraft(payload)
    const existing = draft.id ? findQuote(draft.id) : null
    const fields = validateWarehouseQuoteDraft(draft, state.warehouseQuotes, state.partners, { existing })
    if (Object.keys(fields).length) throw Object.assign(new Error(Object.values(fields)[0]), { fields })
    let sequence = Number.isSafeInteger(state.warehouseQuoteSequence) && state.warehouseQuoteSequence >= 0 ? state.warehouseQuoteSequence : 0
    if (!existing) {
      do {
        sequence += 1
        draft.id = `WQ-${String(sequence).padStart(8, '0')}`
      } while (state.warehouseQuotes.some(row => row.id === draft.id))
    }
    const record = {
      ...clone(draft), manualDisabled: existing?.manualDisabled === true,
      updatedBy: getSession().name, updatedAt: WAREHOUSE_QUOTE_NOW,
    }
    if (existing) Object.assign(existing, record)
    else state.warehouseQuotes.push(record)
    state.warehouseQuoteSequence = sequence
    return existing || record
  }
  function setWarehouseQuoteActive(id, active) {
    requirePermission()
    if (typeof active !== 'boolean') throw new Error('请选择启用或失效操作')
    const quote = findQuote(id)
    const result = getWarehouseQuoteAction(quote, active ? 'enable' : 'disable')
    if (!result.allowed) throw new Error(result.reason)
    quote.manualDisabled = !active
    quote.updatedBy = getSession().name
    quote.updatedAt = WAREHOUSE_QUOTE_NOW
    return quote
  }
  function deleteWarehouseQuote(id) {
    requirePermission()
    const quote = findQuote(id)
    state.warehouseQuotes = state.warehouseQuotes.filter(row => row.id !== quote.id)
    return 1
  }
  return { saveWarehouseQuote, setWarehouseQuoteActive, deleteWarehouseQuote }
}
