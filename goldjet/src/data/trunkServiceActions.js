import { TRUNK_NOW, createTrunkDraft, trunkPermissions, validateTrunkBooking } from '../domain/trunkServices.js'

const clone = value => JSON.parse(JSON.stringify(value))

export function createTrunkServiceActions(state, getSession) {
  const session = () => getSession() || { role: 'viewer', name: '' }
  const permission = () => trunkPermissions(session().role)
  const find = id => {
    const service = state.trunkServices.find(row => row.id === id)
    if (!service) throw new Error('未找到干线服务单')
    return service
  }
  function trace(service, event, content) {
    service.history ||= []
    service.history.push({ id: `${service.id}-H${service.history.length + 1}`, event, content, actor: session().name || session().role, time: TRUNK_NOW })
  }
  function bookTrunkService(id, payload) {
    if (!permission().book) throw new Error('当前角色不能订舱')
    const service = find(id)
    if (service.status !== '待接单') throw new Error('仅待接单的服务可订舱；进行中只能编辑执行信息')
    const draft = { ...createTrunkDraft(service.mode), ...clone(payload || {}) }
    const errors = validateTrunkBooking(draft, { submit: true })
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    for (const key of ['supplier', 'waybillNo', 'airline', 'flight', 'actualDeparture', 'cost', 'guidePrice', 'internalSettlementFoam', 'routeRemark', 'palletCompany', 'foamRatio', 'flights']) {
      if (Object.hasOwn(draft, key)) service[key] = clone(draft[key])
    }
    service.status = '进行中'
    service.acceptedAt = TRUNK_NOW
    service.node = '已订舱'
    trace(service, '订舱', `${service.supplier} ${service.flight}；提交使服务进行中、节点已订舱，不代表独立订舱对象审核通过`)
    return service
  }
  function saveTrunkExecution(id, payload) {
    if (!permission().execute) throw new Error('当前角色不能编辑执行信息')
    const service = find(id)
    if (service.status !== '进行中') throw new Error('仅进行中的服务可编辑执行信息')
    for (const key of ['waybillNo', 'airline', 'flight', 'actualDeparture', 'cost', 'guidePrice', 'internalSettlementFoam', 'routeRemark', 'palletCompany', 'flights', 'cargo']) {
      if (Object.hasOwn(payload || {}, key)) service[key] = clone(payload[key])
    }
    trace(service, '编辑执行信息', '保存执行信息；供应商可编辑性冲突按待确认保留')
    return service
  }
  function completeTrunkService(id) {
    if (!permission().complete) throw new Error('当前角色不能完成干线服务')
    const service = find(id)
    if (service.status !== '进行中') throw new Error('仅进行中的服务可记录干线到达')
    service.status = '已完成'
    service.node = '干线到达'
    service.completedAt = TRUNK_NOW
    trace(service, '干线到达', '状态管理记录干线到达时间；完成时间取该节点')
    return service
  }
  function cancelTrunkService(id) {
    if (!permission().complete) throw new Error('当前角色不能取消干线服务')
    const service = find(id)
    if (service.status !== '待接单') throw new Error('取消与终止的执行状态及计费影响由第036篇完整定义，原型仅开放待接单取消')
    service.status = '已取消'
    service.node = '已取消'
    trace(service, '取消服务', '待接单取消；取消不生成应收应付（计费时点待确认）')
    return service
  }
  return { bookTrunkService, saveTrunkExecution, completeTrunkService, cancelTrunkService }
}
