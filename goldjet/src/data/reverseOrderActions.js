import {
  REVERSE_NOW, airReturnEligibility, bcccReturnEligibility, createReverseOrderNo, releaseStock, reserveStock,
  reversePermissions, reverseServiceDraft, validateReturnSupplyRows, validateValueAddedComplete, valueAddedEligibility,
} from '../domain/reverseOrders.js'
import {
  bbcReturnDeadline, canApplyBbcReturn as canApplyBbcReturnOrder, canArrangeBbcCancelReturn,
  canArrangeBbcConsumerReturn, validateReturnQuantities as validateBbcReturnQuantities,
} from '../domain/bbcCustomerOrders.js'

const clone = value => JSON.parse(JSON.stringify(value))
const text = value => String(value ?? '').trim()

export function createReverseOrderActions(state, getSession) {
  const session = () => getSession() || { role: 'viewer', name: '' }
  const now = () => new Date(Date.UTC(2026, 8, 8, 14, 30, ++state.reverseOrderEventSequence)).toISOString().slice(0, 19).replace('T', ' ')
  const find = id => {
    const order = state.reverseOrders.find(row => row.id === id)
    if (!order) throw new Error('未找到逆向订单')
    return order
  }
  const findValue = id => {
    const service = state.valueAddedServices.find(row => row.id === id)
    if (!service) throw new Error('未找到增值服务单')
    return service
  }
  const permission = () => reversePermissions(session().role)
  function trace(order, event, content) {
    order.history ||= []
    order.history.push({ id: `${order.id}-H${order.history.length + 1}`, event, content, actor: session().name || session().role, time: now() })
  }
  function generateServices(order) {
    const generated = []
    for (const service of order.services || []) {
      if (!service.selected || service.generated) continue
      service.generated = true
      service.id = `SV${REVERSE_NOW.slice(2, 4)}${REVERSE_NOW.slice(5, 7)}${REVERSE_NOW.slice(8, 10)}${String(++state.reverseServiceSequence).padStart(5, '0')}`
      service.status = '待接单'
      generated.push(service)
    }
    return generated
  }
  function persist(draft) {
    if (!draft.id) {
      const serial = ++state.reverseOrderSequence
      const id = createReverseOrderNo(serial)
      draft.id = id
      draft.orderNo = id
      draft.createdAt = now()
      draft.creator = session().name
      draft.history = []
      state.reverseOrders.unshift(draft)
      trace(draft, '创建逆向订单', `${draft.category} · ${draft.businessType}`)
    } else {
      const existing = find(draft.id)
      Object.assign(existing, draft, { id: existing.id, orderNo: existing.orderNo, status: existing.status, creator: existing.creator, createdAt: existing.createdAt, history: existing.history })
      trace(existing, '保存逆向订单', '保存当前填写内容')
      return existing
    }
    return draft
  }
  function submit(order, { submit }) {
    if (submit) {
      order.status = '进行中'
      order.submittedAt = now()
      const generated = generateServices(order)
      trace(order, '提交逆向订单', generated.length ? `生成 ${generated.length} 个服务单` : '未选择需要下发的服务')
    }
    return order
  }
  function createAirReturnOrder({ orderId, houseKeys = [], payload = {}, submit: shouldSubmit = false }) {
    if (!permission().createReturn) throw new Error('当前角色不能发起退运')
    const source = state.airOrders.find(row => row.id === orderId)
    const eligibility = airReturnEligibility(source)
    if (!eligibility.ok) throw new Error(eligibility.message)
    const houses = state.airChildren.filter(row => row.parentId === orderId && (!houseKeys.length || houseKeys.includes(row.id)))
    const draft = {
      id: '', orderNo: '', category: '空运退运', businessType: '出口退运', customer: source.customer, sourceOrderId: source.id,
      sourceLabel: `${source.orderNo}${houses.length ? ` / ${houses.map(row => row.childNo || row.id).join('、')}` : ''}`,
      status: '未提交', transportMode: source.booking?.transportMode || '空运', originPort: payload.originPort || source.origin, destinationPort: payload.destinationPort || source.destination,
      waybillNo: payload.waybillNo || source.waybillNo || '', contactName: payload.contactName || '', contactPhone: payload.contactPhone || '', contactEmail: payload.contactEmail || '',
      remark: payload.remark || '', customerRemark: payload.customerRemark || '', customerCancelled: false, returnResult: '',
      goods: [{
        id: 'G-1', productId: '', barcode: '', name: houseKeys.length ? `空运分单货物（${houseKeys.length} 个分单）` : '空运货物（演示）', spec: '', hsCode: '',
        quantity: Number(payload.expectedPieces) || Number(source.pieces) || 0, unit: '件', unitPrice: '', totalPrice: '',
      }],
      services: clone(payload.services?.length ? payload.services : reverseServiceDraft('空运退运')), attachments: clone(payload.attachments || []),
    }
    const saved = persist(draft)
    return submitEffect(saved, shouldSubmit)
  }
  function submitEffect(order, shouldSubmit) {
    const target = find(order.id)
    if (shouldSubmit) submit(target, { submit: true })
    return target
  }
  function createBcccReturnOrder({ smallOrderIds = [], payload = {}, submit: shouldSubmit = false }) {
    if (!permission().createReturn) throw new Error('当前角色不能发起退运')
    const orders = state.portalSmallOrders.filter(row => smallOrderIds.includes(row.id))
    const eligibility = bcccReturnEligibility(orders)
    if (!eligibility.ok) throw new Error(eligibility.message)
    const [first] = orders
    const draft = {
      id: '', orderNo: '', category: 'BC/CC退运', businessType: `${first.businessType}进口退运`, customer: first.company || first.shop || '门户客户（演示）',
      sourceOrderId: orders.map(row => row.id).join(','), sourceLabel: orders.map(row => row.orderNo).join('、'),
      status: '未提交', transportMode: payload.transportMode || '公路运输', originPort: payload.originPort || 'CAN', destinationPort: payload.destinationPort || 'HKG',
      waybillNo: payload.waybillNo || '', remark: payload.remark || '', customerRemark: '', customerCancelled: true, returnResult: '',
      goods: orders.flatMap(order => (order.goods || []).map(row => ({ ...row, id: `${order.id}-${row.id}`, quantity: Number(row.quantity) || 0 }))),
      services: clone(payload.services?.length ? payload.services : reverseServiceDraft('BC/CC退运')), attachments: clone(payload.attachments || []),
    }
    const saved = persist(draft)
    for (const order of orders) order.returnResult = '退运中'
    return submitEffect(saved, shouldSubmit)
  }
  function createBbcReturnOrder({ bbcOrderId, kind = 'consumer', rows = [], payload = {}, submit: shouldSubmit = false }) {
    if (!permission().createReturn) throw new Error('当前角色不能发起退货')
    const order = state.bbcCustomerOrders.find(row => row.id === bbcOrderId)
    if (!order) throw new Error('未找到 BBC 客户订单')
    const check = kind === 'consumer' ? canArrangeBbcConsumerReturn(order) : canArrangeBbcCancelReturn(order)
    if (!check.ok) throw new Error(check.message)
    const errors = validateBbcReturnQuantities(rows.map(row => ({ ...row, quantity: row.selectedQuantity ?? row.quantity })))
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0])
    const selected = rows.filter(row => Number(row.selectedQuantity ?? row.quantity) > 0).map(row => ({ ...row, quantity: Number(row.selectedQuantity ?? row.quantity) }))
    if (!selected.length) throw new Error('全部商品数量为 0 时订单不参与本次退货，请至少选择一件商品')
    const draft = {
      id: '', orderNo: '', category: kind === 'consumer' ? 'BBC客退' : 'BBC消退', businessType: 'BBC进口', customer: order.company || 'BBC 客户（演示）',
      sourceOrderId: order.id, sourceLabel: order.orderNo, status: '未提交', transportMode: payload.transportMode || '公路运输',
      originPort: payload.originPort || 'CAN', destinationPort: payload.destinationPort || 'CAN', waybillNo: payload.waybillNo || '',
      remark: payload.remark || '', customerRemark: '', customerCancelled: true, returnResult: '进行中',
      goods: selected.map(row => ({ id: row.id, productId: row.productId, barcode: row.barcode, name: row.name, spec: '', hsCode: row.hsCode, quantity: row.quantity, unit: row.unit, unitPrice: Number((order.goods.find(good => good.id === row.id) || {}).unitPrice) || 0, totalPrice: '' })),
      services: clone(payload.services?.length ? payload.services : reverseServiceDraft(kind === 'consumer' ? 'BBC客退' : 'BBC消退')), attachments: clone(payload.attachments || []),
    }
    const saved = persist(draft)
    for (const row of selected) {
      const good = order.goods.find(item => item.id === row.id)
      if (!good) continue
      if (kind === 'consumer') good.consumerReturnQty = (Number(good.consumerReturnQty) || 0) + row.quantity
      else good.cancelReturnQty = (Number(good.cancelReturnQty) || 0) + row.quantity
    }
    if (kind === 'consumer') order.consumerReturnResult = '进行中'
    else order.cancelReturnResult = '进行中'
    order.outboundOrderType = kind === 'consumer' ? '客退' : '消退'
    order.outboundOrderNo ||= `OUT-${order.id}`
    return submitEffect(saved, shouldSubmit)
  }
  function applyBbcReturn(bbcOrderId) {
    if (!permission().createReturn) throw new Error('当前角色不能发送退货申请')
    const order = state.bbcCustomerOrders.find(row => row.id === bbcOrderId)
    if (!order) throw new Error('未找到 BBC 客户订单')
    if (['海关入库', '退货中', '退货成功'].includes(order.returnStatus)) throw new Error('该订单的退货申请已在处理中或已完成，不重复发送')
    const check = canApplyBbcReturnOrder(order)
    if (!check.ok) throw new Error(check.message)
    order.returnStatus = '海关入库'
    order.returnDeadline ||= bbcReturnDeadline(REVERSE_NOW.slice(0, 10))
    order.receipts ||= []
    order.receipts.push({ id: `${order.id}-R${order.receipts.length + 1}`, type: '退货申请', status: '海关入库', time: now(), content: '退货申请回执：海关入库（本地模拟）' })
    return order
  }
  function saveReverseOrder(id, payload) {
    const order = find(id)
    if (order.status !== '未提交') throw new Error('仅未提交的逆向订单可编辑')
    Object.assign(order, { ...clone(payload), id: order.id, orderNo: order.orderNo, status: order.status, history: order.history })
    trace(order, '保存逆向订单', '保存当前填写内容')
    return order
  }
  function submitReverseOrder(id) {
    const order = find(id)
    if (order.status !== '未提交') throw new Error('仅未提交的逆向订单可提交')
    order.status = '进行中'
    order.submittedAt = now()
    const generated = generateServices(order)
    trace(order, '提交逆向订单', generated.length ? `生成 ${generated.length} 个服务单` : '未选择需要下发的服务')
    return order
  }
  function cancelReverseOrder(id) {
    const order = find(id)
    if (!['待接单', '进行中'].includes(order.status)) throw new Error('当前状态不能取消')
    order.status = '已取消'
    trace(order, '取消逆向订单', '取消后按对应取消规则处理库存与外部拦截；本地取消不代表海关撤销或仓库拦截成功')
    return order
  }
  function deleteReverseOrder(id) {
    const order = find(id)
    if (order.status !== '未提交') throw new Error('仅未提交的逆向订单可删除')
    state.reverseOrders.splice(state.reverseOrders.indexOf(order), 1)
    return true
  }
  function createStockReturn({ entrance, businessType, warehouse, rows = [], payload = {}, submit: shouldSubmit = false }) {
    if (!permission().createStockReturn) throw new Error('当前角色不能发起退供或库存退运')
    const category = entrance === 'ops-bbc' || /BBC/.test(businessType) ? 'BBC库存退运' : '退供'
    const errors = validateReturnSupplyRows(rows, { warehouse, stock: state.portalStock })
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0])
    const draft = {
      id: '', orderNo: '', category, businessType, customer: payload.customer || '启航跨境贸易', sourceOrderId: '', sourceLabel: '',
      status: '未提交', transportMode: payload.transportMode || '公路运输', originPort: payload.originPort || 'CAN', destinationPort: payload.destinationPort || 'HKG',
      waybillNo: '', remark: payload.remark || '', warehouse, entrance, customerCancelled: false, returnResult: '',
      goods: rows.map((row, index) => ({ id: `R-${index + 1}`, productId: row.productId || '', barcode: row.barcode, name: row.name || '', spec: '', hsCode: row.hsCode || '', quantity: (Number(row.goodQty) || 0) + (Number(row.defectQty) || 0), unit: '件', unitPrice: '', goodQty: Number(row.goodQty) || 0, defectQty: Number(row.defectQty) || 0, batchNo: row.batchNo || '' })),
      services: clone(payload.services?.length ? payload.services : reverseServiceDraft(category)), attachments: [],
    }
    const saved = persist(draft)
    reserveStock(state.portalStock, warehouse, rows, saved.id)
    trace(saved, '预占库存', '提交时校验并预占对应库存；校验范围按入口区分')
    if (shouldSubmit) {
      saved.status = '待接单'
      saved.submittedAt = now()
      trace(saved, '提交需求', '需求提交后等待运营接单')
    }
    return saved
  }
  function cancelStockReturn(id) {
    const order = find(id)
    if (!['未提交', '待接单', '进行中'].includes(order.status)) throw new Error('当前状态不能取消')
    const warehouseService = (order.services || []).find(service => service.key === 'warehouse')
    const downstream = warehouseService?.generated ? warehouseService.status : ''
    // §5.2 取消与库存释放：门户待接单、运营无下游或下游待接单释放；进行中与已完成不释放。
    let release = false
    if (order.entrance !== 'ops-bbc') release = order.status === '待接单'
    else if (!downstream) release = true
    else release = downstream === '待接单'
    if (release && order.status !== '已完成') {
      releaseStock(state.portalStock, order.id)
      trace(order, '取消并释放库存', '按取消入口和下游服务状态释放预占库存')
    } else {
      trace(order, '取消不释放库存', '下游服务进行中或已完成，后续人工处理边界待确认')
    }
    order.status = '已取消'
    if (release && downstream === '待接单') warehouseService.status = '已取消'
    return order
  }
  // ---- 增值服务 ----
  function valueTrace(service, event, content) {
    service.history ||= []
    service.history.push({ id: `${service.id}-H${service.history.length + 1}`, event, content, actor: session().name || session().role, time: now() })
  }
  function acceptValueAdded(ids) {
    const role = session().role
    const accepted = []
    for (const id of ids) {
      const service = findValue(id)
      if (service.status !== '待接单') continue
      if (!valueAddedEligibility(service, role).accept) continue
      service.status = '进行中'
      service.handler = session().name
      service.handlerRole = role
      service.startAt ||= now()
      valueTrace(service, '接单', '待接单转进行中，由接单人处理')
      accepted.push(service)
    }
    if (!accepted.length) throw new Error('所选订单已被接单或当前角色不能接单')
    return accepted
  }
  function transferValueAdded(ids, { mode = 'department', target = '' } = {}) {
    const role = session().role
    const transferred = []
    for (const id of ids) {
      const service = findValue(id)
      if (service.status !== '进行中' || service.handler !== session().name) continue
      if (!valueAddedEligibility(service, role).transfer) continue
      if (mode === 'department') {
        service.status = '待接单'
        service.handler = ''
        service.handlerRole = ''
        valueTrace(service, '流转', '转给部门所有人员，重置待接单')
      } else {
        if (!text(target)) throw new Error('请选择指定处理人')
        service.handler = target
        valueTrace(service, '流转', `流转给指定人 ${target}`)
      }
      transferred.push(service)
    }
    if (!transferred.length) throw new Error('所选订单不能流转：仅处理本人接单且进行中的记录')
    return transferred
  }
  function saveValueAdded(id, payload) {
    const service = findValue(id)
    if (!valueAddedEligibility(service, session().role).edit) throw new Error('当前状态或角色不能维护处理信息')
    const before = clone(service)
    for (const key of ['outsourced', 'outsourcedSupplier', 'handler', 'startAt', 'finishAt', 'result', 'remark', 'attachments']) {
      if (Object.hasOwn(payload || {}, key)) service[key] = clone(payload[key])
    }
    service.updatedBy = session().name
    service.updatedAt = now()
    const changed = Object.keys(payload || {}).filter(key => JSON.stringify(before[key]) !== JSON.stringify(service[key]))
    valueTrace(service, '保存', `保存当前编辑信息${changed.length ? `（${changed.join('、')}）` : ''}；保存不改变状态且不校验必填项`)
    return service
  }
  function completeValueAdded(id) {
    const service = findValue(id)
    if (!valueAddedEligibility(service, session().role).complete) throw new Error('当前状态或角色不能完成服务')
    service.finishAt ||= now()
    const errors = validateValueAddedComplete(service)
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    service.status = '已完成'
    valueTrace(service, '完成服务', '保存当前信息并转为已完成')
    return service
  }
  function terminateValueAdded(ids) {
    const services = []
    for (const id of ids) {
      const service = findValue(id)
      if (!valueAddedEligibility(service, session().role).terminate) continue
      service.status = '已终止'
      valueTrace(service, '终止服务', '终止不影响应收应付生成（计费时点待确认）')
      services.push(service)
    }
    if (!services.length) throw new Error('所选订单不能终止')
    return services
  }
  function cancelValueAdded(ids) {
    const services = []
    for (const id of ids) {
      const service = findValue(id)
      if (!valueAddedEligibility(service, session().role).cancel) continue
      service.status = '已取消'
      valueTrace(service, '取消服务', '取消后不再生成应收应付')
      services.push(service)
    }
    if (!services.length) throw new Error('所选订单不能取消')
    return services
  }
  return {
    createAirReturnOrder, createBcccReturnOrder, createBbcReturnOrder, applyBbcReturn,
    saveReverseOrder, submitReverseOrder, cancelReverseOrder, deleteReverseOrder,
    createStockReturn, cancelStockReturn,
    acceptValueAdded, transferValueAdded, saveValueAdded, completeValueAdded, terminateValueAdded, cancelValueAdded,
  }
}
