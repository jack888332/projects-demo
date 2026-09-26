import { COORDINATION_NOW, PREALLOCATION_CUSTOMS_STATUSES, preallocationPermissions } from '../domain/serviceCoordination.js'

const clone = value => JSON.parse(JSON.stringify(value))

export function createServiceCoordinationActions(state, getSession) {
  const now = () => COORDINATION_NOW
  const find = id => {
    const record = state.preallocationRecords.find(row => row.id === id)
    if (!record) throw new Error('未找到预配执行记录')
    return record
  }
  const permission = () => preallocationPermissions(getSession().role)
  function trace(record, event, content) {
    record.history ||= []
    record.history.push({ id: `${record.id}-H${record.history.length + 1}`, event, content, actor: getSession().name || getSession().role, time: now() })
  }
  function savePreallocationThreshold(hours) {
    if (!permission().threshold) throw new Error('当前角色不能设置截单预警阈值')
    const value = Number(hours)
    if (!Number.isInteger(value) || value < 1 || value > 168) throw new Error('预警小时数须为 1～168 的整数')
    state.preallocationThresholdHours = value
    state.preallocationThresholdUpdatedAt = now()
    return value
  }
  function sendPreallocation(id, targets = {}) {
    if (!permission().send) throw new Error('当前角色不能发送预配')
    const record = find(id)
    if (record.status !== '进行中') throw new Error('仅进行中的预配服务可发送')
    const rows = []
    if (targets.main !== false) rows.push(record.main)
    for (const childNo of targets.houseNos || []) {
      const house = record.houses.find(row => row.childNo === childNo)
      if (house) rows.push(house)
    }
    const pending = rows.filter(row => ['待发送', '发送失败'].includes(row.sendStatus))
    if (!pending.length) throw new Error('所选记录均为已发送或发送中，未定义重试规则')
    for (const row of pending) {
      row.sendStatus = '已发送'
      row.customsStatus = '接收申报'
      row.sentAt = now()
      row.receipt = { function: '预配申报', statusCode: '100', content: '接收申报成功（浏览器内本地模拟，不是真实回执）', receiptAt: now(), receivedAt: now() }
    }
    const all = [record.main, ...record.houses]
    trace(record, '发送', `发送 ${pending.length} 条记录到广州电子口岸（本地模拟）`)
    if (all.every(row => ['接收申报', '提运单放行'].includes(row.customsStatus))) {
      record.status = '已完成'
      record.serviceCompletedAt = now()
      trace(record, '完成', '全部海关状态为接收申报或提运单放行，记录服务完成时间')
    }
    return record
  }
  function cancelPreallocation(id) {
    if (!permission().cancel) throw new Error('当前角色不能取消预配服务')
    const record = find(id)
    if (record.status !== '进行中') throw new Error('仅进行中的预配服务可取消')
    record.status = '已取消'
    trace(record, '取消', '取消不生成该服务商品的应收应付；外部已申报后的撤回与计价时点待确认')
    return record
  }
  function terminatePreallocation(id) {
    if (!permission().terminate) throw new Error('当前角色不能终止预配服务')
    const record = find(id)
    if (record.status !== '进行中') throw new Error('仅进行中的预配服务可终止')
    record.status = '已终止'
    trace(record, '终止', '终止应生成应收应付；计费金额与重复结算保护待确认，本原型不写费用')
    return record
  }
  function loadPreallocationExamples() {
    if (getSession().role !== 'superAdmin') throw new Error('仅超级管理员可准备演示数据')
    return clone(state.preallocationRecords)
  }
  return { savePreallocationThreshold, sendPreallocation, cancelPreallocation, terminatePreallocation, loadPreallocationExamples }
}
