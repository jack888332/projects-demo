import { canReadModule, canWriteModule } from './accessControl.js'
import { warehouseDraft, warehouseErrors, warehouseCustomers, warehousePermissions, WAREHOUSE_DATE, WAREHOUSE_SERVICES } from '../domain/warehouseOrders.js'

const clone = value => JSON.parse(JSON.stringify(value))
export function createWarehouseOrderActions(state, getPersona) {
  const find = id => { const order = state.warehouseOrders.find(row => row.id === id); if (!order) throw new Error('仓库订单不存在'); return order }
  const now = () => new Date(Date.UTC(2026, 8, 8, 14, 30, ++state.warehouseEventSequence)).toISOString().slice(0, 19).replace('T', ' ')
  const authorize = (action, order) => {
    if (!canWriteModule('warehouseOrders') || !warehousePermissions(getPersona(), order)[action]) throw new Error('当前角色或订单状态不允许此操作')
    if (action === 'create' && !canWriteModule('airOrders')) throw new Error('当前角色未获空运建单入口授权')
  }
  const record = (order, event, remark, actor = getPersona(), time = now()) => {
    order.history.push({ id: `${order.id}-H${order.history.length + 1}`, event, remark, actor, time }); order.updatedAt = time
  }
  function saveWarehouseOrder(payload, id = '') {
    const existing = id ? find(id) : null
    authorize(existing ? 'edit' : 'create', existing)
    const draft = warehouseDraft(payload)
    for (const key of Object.keys(draft)) if (typeof draft[key] === 'string') draft[key] = draft[key].trim()
    const errors = warehouseErrors(draft, state.warehouseOrders, warehouseCustomers(state, getPersona()), existing)
    if (existing && existing.status !== '待入库' && draft.customer !== existing.customer) errors.customer = '入库后客户不可修改'
    if (existing?.pallets?.length && ['pieces','grossWeight','volume'].some(key => String(draft[key]) !== String(existing[key]))) errors.grossWeight = '已有WMS入库记录，手工实际量与托盘反馈覆盖关系待确认（164）'
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    if (existing) {
      Object.assign(existing, clone(draft)); if (Object.hasOwn(payload,'waybillNo')) existing.waybillNo = String(payload.waybillNo || '').trim()
      record(existing, '订单信息更新', '本地更新记录，未发送WMS')
      return existing
    }
    const serial = state.warehouseSequence + 1, inboundNo = `${state.warehouseDemoCode}${WAREHOUSE_DATE.slice(2).replaceAll('-', '')}${String(serial).padStart(4, '0')}`
    if (!state.warehouseDemoCode || serial > 9999) throw new Error('仓库代码或流水不可用')
    if (state.warehouseOrders.some(row => row.inboundNo === inboundNo)) throw new Error('您创建的入仓号已存在，请重新输入！')
    const isAir = ['service', 'supervisor'].includes(getPersona())
    const order = { ...clone(draft), id: inboundNo, inboundNo, manual: true, source: isAir ? '空运事业部手工' : '航晟物流客服部', sourceCustomer: draft.customer,
      customer: isAir ? '高捷物流-空运部' : draft.customer, expectedServiceActorId: `DEMO-${getPersona()}`, status: '待入库', createdAt: now(), services: {}, pallets: [], history: [], outPieces: 0 }
    record(order, '创建仓库订单', order.remark, isAir ? '高捷物流-空运部' : '航晟物流客服部', order.createdAt)
    state.warehouseSequence = serial; state.warehouseOrders.unshift(order)
    state.groundServiceRegistry.inbounds.push({ number: inboundNo, warehouseId: order.id })
    return find(order.id)
  }
  function saveWarehouseServices(id, values) {
    const order = find(id); authorize('services', order)
    for (const [key, label] of WAREHOUSE_SERVICES) {
      const value = values[key]
      if (value !== '' && value != null && (!Number.isFinite(Number(value)) || !(key === 'weightTo' ? /^\d+(\.\d{1,2})?$/.test(String(value)) : /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value))))) throw new Error(`${label}实际数量格式不正确`)
    }
    const time = now()
    order.services = Object.fromEntries(WAREHOUSE_SERVICES.map(([key]) => [key, { actual: values[key] ?? '', actor: `DEMO-${getPersona()}`, time }]))
    record(order, '服务数量更新', '已保存仓库实际服务数量', getPersona(), time)
    return order
  }
  function simulateWarehouseReceipt(id, event) {
    const order = find(id); authorize('simulate', order)
    if (event.kind === 'cancel') {
      if (order.status !== '待入库') throw new Error('仅待入库订单可接受上游取消')
      order.status = '已取消'; record(order, '上游取消', '本地模拟取消成功', order.source); return order
    }
    if (event.kind === 'inbound') {
      if (!['待入库', '已入库'].includes(order.status)) throw new Error('当前状态的追加入库规则待确认')
      if (!event.palletNo?.trim() || state.warehouseOrders.some(row => row.pallets.some(pallet => pallet.number === event.palletNo.trim()))) throw new Error('请填写未使用的托盘号')
      if (!Number.isSafeInteger(Number(event.pieces)) || Number(event.pieces) <= 0 || ['weight', 'volume'].some(key => !Number.isFinite(Number(event[key])) || Number(event[key]) <= 0)) throw new Error('本次模拟入库须提供有效正数毛件体，件数为整数')
      if (!order.pallets.length && ['pieces','grossWeight','volume'].some(key => order[key] !== '' && order[key] != null)) throw new Error('已有手工实际货量，WMS首次反馈覆盖关系待确认（164），未修改数据')
      const time = now(), pallet = { number: event.palletNo.trim(), status: '已入库', inPieces: Number(event.pieces), inWeight: Number(event.weight), inVolume: Number(event.volume), inboundAt: time, outPieces: 0, outWeight: 0, outVolume: 0, outImages: [], inImages: [] }
      order.pallets.push(pallet)
      order.status = '已入库'; order.inboundAt ||= time; order.receivedAt = order.inboundAt
      for (const [key, source] of [['pieces', 'inPieces'], ['grossWeight', 'inWeight'], ['volume', 'inVolume']]) order[key] = Number(order.pallets.reduce((sum, row) => sum + row[source], 0).toFixed(2))
      record(order, '入库', `${pallet.inWeight} kg；托盘 ${pallet.number}`, 'WMS', time)
      state.groundServiceRegistry.pallets.push({ number: pallet.number, warehouseId: order.id })
      const air = state.airOrders.find(row => row.id === order.airOrderId), service = air?.services.find(row => row.id === order.sourceServiceId)
      if (service?.status === '待服务') service.status = '服务中'
      return order
    }
    if (event.kind === 'outboundInstruction') {
      if (!['已入库', '部分出库'].includes(order.status)) throw new Error('仅已入库或部分出库订单可接收出库指令')
      const remaining = order.pallets.reduce((sum, row) => sum + row.inPieces - row.outPieces, 0)
      if (!Number.isSafeInteger(Number(event.pieces)) || Number(event.pieces) <= 0 || Number(event.pieces) > remaining) throw new Error(`出库件数须为1～${remaining}的整数`)
      order.outboundInstruction = { pieces: Number(event.pieces), weight: event.weight ?? '', time: now(), transmission: '本地模拟，未发送WMS' }
      order.status = '待出库'; record(order, '接收出库指令', `出库${event.pieces}件；总重量${event.weight || '未提供'} kg`, order.source, order.outboundInstruction.time); return order
    }
    if (event.kind === 'reweigh') {
      throw new Error('重新称重的替换范围及累计规则待确认（GJ-PRD-164），未修改库存或费用')
    }
    if (event.kind === 'outbound') throw new Error('部分出库与全部出库条件重叠，WMS出库终态判定待确认（GJ-PRD-036），未修改库存或费用')
    throw new Error('未支持的模拟事件')
  }
  function receiveWarehouseUpstream(airOrderId, inboundNo) {
    authorize('simulate')
    if (!canReadModule('airOrders')) throw new Error('当前角色无空运数据查看授权')
    const air = state.airOrders.find(row => row.id === airOrderId && !row.deleted)
    const service = air?.services.find(row => row.type === 'warehouse')
    if (!air || !service) throw new Error('请选择有仓储服务的主订单')
    if (!inboundNo?.trim()) throw new Error('请提供上游入仓号；不能用空运单号推断')
    if (state.warehouseOrders.some(row => row.inboundNo === inboundNo.trim())) throw new Error('您创建的入仓号已存在，请重新输入！已有入仓号仅可更新原订单')
    if (state.warehouseOrders.some(row => row.sourceServiceId === service.id)) throw new Error('此仓储服务已有仓库订单')
    const order = { ...warehouseDraft(), id: `WH-UP-${++state.warehouseSequence}`, inboundNo: inboundNo.trim(), source: '空运系统', airOrderId: air.id, sourceServiceId: service.id,
      manual: false, customer: '高捷物流集团-空运事业部', sourceCustomer: air.customer, businessType: '出口空运', contact: air.contact, phone: air.phone, goodsName: air.goodsName,
      expectedPieces: air.pieces, expectedWeight: air.grossWeight, expectedVolume: air.volume, length: air.length, width: air.width, height: air.height, waybillNo: air.waybillNo,
      requestedOperations: clone(air.warehouseOperations || []), status: '待入库', createdAt: now(), history: [], pallets: [], services: {}, outPieces: 0, remark: air.remark || '' }
    record(order, '创建仓库订单', '接收上游仓储服务（本地模拟）', order.customer, order.createdAt)
    state.warehouseOrders.unshift(order); state.groundServiceRegistry.inbounds.push({ number: order.inboundNo, warehouseId: order.id })
    return order
  }
  return { saveWarehouseOrder, saveWarehouseServices, simulateWarehouseReceipt, receiveWarehouseUpstream }
}
