import { canReadModule, canWriteModule, isSuperAdmin, groundServicePermissions } from './accessControl.js'
import { groundAccount, groundOperation, groundServiceErrors, groundServiceMatches, groundServiceDraft, groundArrivalSummary } from '../domain/groundService.js'

const clone = value => JSON.parse(JSON.stringify(value))
export function createGroundServiceActions(state, getSession, getPersona) {
  function authorize(operation, write = false) {
    if (!canReadModule('groundService') || (write && !canWriteModule('groundService'))) throw new Error('当前角色未获地面服务操作授权')
    if (isSuperAdmin() && !write) return
    const account = groundAccount(getPersona())
    if (!account || account.phone !== getSession().phone || !groundServicePermissions(getPersona()).includes(operation)) throw new Error('请使用获授权的地面服务账户登录')
  }
  function getGroundServiceRecords(operation) {
    authorize(operation)
    return state.groundServiceRecords.filter(row => row.operation === operation)
  }
  function submitGroundService(operation, payload, existingId = '', revision = 0) {
    authorize(operation, true)
    const draft = Object.fromEntries(Object.keys(groundServiceDraft()).map(key => [key, clone(payload[key] ?? groundServiceDraft()[key])]))
    draft.number = String(draft.number).trim()
    const errors = groundServiceErrors(state, operation, draft, existingId)
    const existing = state.groundServiceRecords.find(row => row.id === existingId)
    if (existing && existing.revision !== revision) errors.record = '记录已变化，请重新打开后修改'
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    const config = groundOperation(operation), account = groundAccount(getPersona())
    if (config.batch) draft.packages = [...new Set(draft.packages.map(value => value.trim()).filter(Boolean))]
    else draft.packages = []
    const matched = groundServiceMatches(state, operation, draft.number)[0]
    const beforeArrival = operation === 'arrival' ? groundArrivalSummary(state, matched.orderId) : null
    const serial = state.groundServiceSequence + 1
    const time = new Date(Date.UTC(2026, 8, 8, 14, 30, serial)).toISOString().slice(0, 19).replace('T', ' ')
    const entry = { actorId: account.id, action: existing ? '修改' : '提交', time, number: draft.number, previousNumber: existing?.number || '', images: clone(draft.images), remark: draft.remark }
    const result = { id: existing?.id || `GS-019-${serial}`, operation, ...draft, target: config.target, orderId: matched.orderId || '', warehouseId: matched.warehouseId || '', revision: (existing?.revision || 0) + 1, updatedAt: time, history: [...(existing?.history || []), entry], transmission: '本地模拟，未发送' }
    state.groundServiceSequence = serial
    if (existing) Object.assign(existing, result)
    else state.groundServiceRecords.unshift(result)
    if (operation === 'arrival') {
      const after = groundArrivalSummary(state, matched.orderId)
      if (!existing && (matched.kind === 'external' || (after.total > 0 && after.arrived === after.total && beforeArrival.arrived < beforeArrival.total))) {
        state.messages.push({ id: `MSG-GS-${serial}`, type: '货站到达', recipient: '', recipientRole: 'waybillClerk', createdAt: time, channel: '空运（本地模拟）', status: '本地模拟', content: `${matched.orderId}：${matched.kind === 'external' ? '外部订单已到达货站' : '全部封条号已到达货站'}`, related: { path: '/fulfillment/ground-service', query: { operation: 'arrival', record: result.id } } })
      }
    }
    return existing || state.groundServiceRecords[0]
  }
  return { getGroundServiceRecords, submitGroundService }
}
