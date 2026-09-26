import {
  CONFIRM_SYNC_STATUSES, MANIFEST_NOW, MANIFEST_EDITABLE_STATUSES, createConfirmationDraft, createManifestDraft,
  manifestPermissions, validateConfirmationDraft, validateManifestDraft,
} from '../domain/manifestAndConfirmation.js'

const clone = value => JSON.parse(JSON.stringify(value))

export function createManifestConfirmActions(state, getSession) {
  const session = () => getSession() || { role: 'viewer', name: '' }
  const permission = () => manifestPermissions(session().role)
  function gate() { if (!permission().write) throw new Error('当前角色不能维护舱单与确报') }
  function findManifest(id) {
    const row = state.originalManifests.find(item => item.id === id)
    if (!row) throw new Error('未找到原始舱单')
    return row
  }
  function findConfirmation(id) {
    const row = state.cargoConfirmations.find(item => item.id === id)
    if (!row) throw new Error('未找到载货确报')
    return row
  }
  function trace(record, action, content) {
    record.logs ||= []
    record.logs.push({ id: `${record.id}-L${record.logs.length + 1}`, action, operator: session().name || session().role, content, time: MANIFEST_NOW })
  }
  function saveManifest(id, payload, { submit = false } = {}) {
    gate()
    const existing = id ? findManifest(id) : null
    if (existing && !MANIFEST_EDITABLE_STATUSES.includes(existing.status)) throw new Error('仅待报关、发送失败、海关退单的舱单可以修改')
    const draft = { ...createManifestDraft(), ...clone(payload || {}) }
    const errors = validateManifestDraft(draft, { submit })
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    let record = existing
    if (!record) {
      record = { ...draft, id: `OM-${String(++state.manifestSequence).padStart(3, '0')}`, createdBy: session().name, createdAt: MANIFEST_NOW, status: '待报关', syncStatus: '', receipts: [], logs: [] }
      state.originalManifests.unshift(record)
      trace(record, '新增舱单', `批次号 ${record.batchNo}`)
    } else {
      Object.assign(record, draft, { id: record.id, createdBy: record.createdBy, createdAt: record.createdAt, status: record.status, syncStatus: record.syncStatus, receipts: record.receipts, logs: record.logs })
      trace(record, '修改舱单', `批次号 ${record.batchNo}`)
    }
    if (submit) {
      record.status = '发送成功'
      record.syncStatus = '成功'
      record.receipts.push({ id: `${record.id}-R${record.receipts.length + 1}`, type: '舱单申报', status: '发送成功', content: '已保存并申报，同步陆运通成功（本地模拟）', time: MANIFEST_NOW })
      trace(record, '保存并申报', '先保存再申报，状态发送成功，同步成功')
    }
    return record
  }
  function resubmitManifestSync(id) {
    gate()
    const record = findManifest(id)
    if (record.syncStatus !== '失败') throw new Error('仅同步失败的舱单可以重新提交')
    record.syncStatus = '成功'
    trace(record, '重新提交同步', '同步失败单据重新提交后成功（本地模拟）')
    return record
  }
  function saveConfirmation(id, payload, { submit = false } = {}) {
    gate()
    const existing = id ? findConfirmation(id) : null
    const draft = { ...createConfirmationDraft(), ...clone(payload || {}) }
    const errors = validateConfirmationDraft(draft, { submit })
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    let record = existing
    if (!record) {
      record = { ...draft, id: `CC-${String(++state.confirmationSequence).padStart(3, '0')}`, createdBy: session().name, createdAt: MANIFEST_NOW, status: '待报关', syncStatus: '', receipts: [], logs: [] }
      state.cargoConfirmations.unshift(record)
      trace(record, '新增确报', `${record.type} · 批次号 ${record.batchNo}`)
    } else {
      Object.assign(record, draft, { id: record.id, createdBy: record.createdBy, createdAt: record.createdAt, status: record.status, syncStatus: record.syncStatus, receipts: record.receipts, logs: record.logs })
      trace(record, '修改确报', `${record.type} · 批次号 ${record.batchNo}`)
    }
    if (submit) {
      record.status = '发送成功'
      record.syncStatus = '成功'
      record.receipts.push({ id: `${record.id}-R${record.receipts.length + 1}`, type: '载货确报', status: '发送成功', content: '已保存并提交，同步陆运通成功（本地模拟）', time: MANIFEST_NOW })
      trace(record, '保存并提交', '先保存再提交同步陆运通')
    }
    return record
  }
  function deleteConfirmation(id) {
    gate()
    const record = findConfirmation(id)
    state.cargoConfirmations.splice(state.cargoConfirmations.indexOf(record), 1)
    return { deleted: true, note: '已同步删除陆运通数据（本地模拟）' }
  }
  function recordVehicleInfo(id, payload = {}) {
    gate()
    const record = findConfirmation(id)
    for (const key of ['vehicleCode', 'vehicleName', 'driverCode', 'driverName']) {
      if (Object.hasOwn(payload, key)) record[key] = String(payload[key] ?? '')
    }
    trace(record, '录入车辆信息', `运输工具 ${record.vehicleName || '未填'} / 驾驶员 ${record.driverName || '未填'}`)
    return record
  }
  return { saveManifest, resubmitManifestSync, saveConfirmation, deleteConfirmation, recordVehicleInfo }
}
