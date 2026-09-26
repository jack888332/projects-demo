import {
  BC_SERVICE_NOW, bcCostSummary, bcServiceEligibility, bcServicePermissions, calculateBcCostTotal,
  createBcCostRow, validateBcAttachment, validateBcCostRows,
} from '../domain/bcExportServices.js'

const clone = value => JSON.parse(JSON.stringify(value))
const text = value => String(value ?? '').trim()

export function createBcExportServiceActions(state, getSession) {
  const session = () => getSession() || { role: 'viewer', name: '' }
  const permission = () => bcServicePermissions(session().role)
  const find = id => {
    const service = state.customsServiceOrders.find(row => row.id === id)
    if (!service) throw new Error('未找到 BC 出口服务单')
    return service
  }
  function trace(service, action, result, content) {
    service.serviceRecords ||= []
    service.serviceRecords.push({ id: `${service.id}-R${service.serviceRecords.length + 1}`, event: action, result, content, actor: session().name || session().role, time: BC_SERVICE_NOW })
    service.logs ||= []
    service.logs.push({ id: `${service.id}-L${service.logs.length + 1}`, operator: session().name || session().role, action, content, time: BC_SERVICE_NOW })
  }
  function gate() { if (!permission().accept) throw new Error('当前角色不能执行 BC 出口服务作业') }
  function acceptBcExportServices(ids) {
    gate()
    const accepted = []
    for (const id of ids) {
      const service = find(id)
      if (service.status !== '待接单') continue
      service.status = '进行中'
      service.handler = session().name
      trace(service, '接单', '成功', '待接单转进行中')
      accepted.push(service)
    }
    if (!accepted.length) throw new Error('所选订单已被接单')
    return accepted
  }
  function transferBcExportServices(ids, { mode = 'department', target = '' } = {}) {
    gate()
    if (mode === 'person') throw new Error('指定人流转后是否仍需接单按 CUSTOMS-B018 待确认，当前只开放流转给所有报关员')
    const transferred = []
    for (const id of ids) {
      const service = find(id)
      if (service.status !== '进行中') continue
      service.status = '待接单'
      service.handler = ''
      trace(service, '流转', '成功', '流转给所有报关员，订单改为待接单并从当前列表移出')
      transferred.push(service)
    }
    if (!transferred.length) throw new Error('没有可流转的服务单')
    return transferred
  }
  function finishWith(ids, action) {
    gate()
    const label = { terminate: '终止服务', cancel: '取消服务', finish: '结束服务' }[action]
    const changed = []
    for (const id of ids) {
      const service = find(id)
      const check = bcServiceEligibility(service, action)
      if (!check.ok) continue
      if (action === 'terminate') {
        service.status = '已终止'
        const order = state.bcExportOrders.find(row => row.platformOrderNo && row.platformOrderNo === service.platformOrderNo)
        if (order) { order.blocked = true; trace(service, label, '成功', '被终止的服务单限制对应订单继续报关操作') }
        else trace(service, label, '成功', '服务单已终止')
      } else if (action === 'cancel') {
        service.status = '已取消'
        trace(service, label, '成功', '上游取消服务=是，服务单取消')
      } else {
        service.status = '已完成'
        trace(service, label, '成功', '手工结束服务，不替代海关回执（CUSTOMS-B045）')
      }
      changed.push(service)
    }
    if (!changed.length) throw new Error({ terminate: '没有可终止的服务单', cancel: '没有可取消的服务单', finish: '没有可结束的服务单' }[action])
    return changed
  }
  const terminateBcExportServices = ids => finishWith(ids, 'terminate')
  const cancelBcExportServices = ids => finishWith(ids, 'cancel')
  const finishBcExportServices = ids => finishWith(ids, 'finish')
  function uploadBcServiceAttachment(serviceId, file) {
    const service = find(serviceId)
    if (!permission().attach) throw new Error('当前角色不能上传附件')
    const errors = validateBcAttachment(file)
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0])
    service.attachments ||= []
    const attachment = { id: `${service.id}-A${service.attachments.length + 1}`, name: text(file.name), size: Number(file.size) || 0, uploader: session().name, uploadedAt: BC_SERVICE_NOW, dataUrl: file.dataUrl || '' }
    service.attachments.push(attachment)
    trace(service, '上传附件', '成功', attachment.name)
    return attachment
  }
  function deleteBcServiceAttachment(serviceId, attachmentId) {
    const service = find(serviceId)
    if (!permission().attach) throw new Error('当前角色不能删除附件')
    const index = (service.attachments || []).findIndex(row => row.id === attachmentId)
    if (index < 0) throw new Error('附件不存在')
    const [removed] = service.attachments.splice(index, 1)
    trace(service, '删除附件', '成功', removed.name)
    return removed
  }
  function saveBcServiceCosts(serviceId, rows) {
    const service = find(serviceId)
    if (!permission().cost) throw new Error('当前角色不能维护应收应付')
    const normalized = (rows || []).map(row => ({ ...createBcCostRow(), ...clone(row), total: calculateBcCostTotal(row) }))
    const errors = validateBcCostRows(normalized)
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    service.costs = normalized
    trace(service, '保存应收应付', '成功', `应收 ${bcCostSummary(normalized).receivable} / 应付 ${bcCostSummary(normalized).payable}`)
    return service.costs
  }
  function appointBcOutsourced(serviceId, supplier) {
    const service = find(serviceId)
    if (!permission().attach) throw new Error('当前角色不能设置委外')
    if (!text(supplier)) throw new Error('请选择委外供应商')
    service.outsourced = true
    service.outsourcedSupplier = text(supplier)
    trace(service, '委外服务', '成功', `选择委外供应商 ${text(supplier)}；供应商可在门户接单（本地模拟）`)
    return service
  }
  return { acceptBcExportServices, transferBcExportServices, terminateBcExportServices, cancelBcExportServices, finishBcExportServices, uploadBcServiceAttachment, deleteBcServiceAttachment, saveBcServiceCosts, appointBcOutsourced }
}
