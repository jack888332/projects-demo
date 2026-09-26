import {
  CC_ATTACHMENT_TYPES, CC_IMPORT_NOW, ccAttachmentEligibility, ccConvertEligibility, ccDeclarationEligibility,
  ccImportPermissions, ccWaybillChangeEligibility, duplicateReceivers, missingAttachments,
} from '../domain/ccImportOrders.js'

const clone = value => JSON.parse(JSON.stringify(value))

export function createCcImportOrderActions(state, getSession) {
  const session = () => getSession() || { role: 'viewer', name: '' }
  const permission = () => ccImportPermissions(session().role)
  const find = id => {
    const order = state.ccImportOrders.find(row => row.id === id)
    if (!order) throw new Error('未找到 CC 进口订单')
    return order
  }
  function gate() { if (!permission().operate) throw new Error('当前角色不能执行 CC 进口关务作业') }
  function receipt(order, type, status, content) {
    order.receipts ||= []
    order.receipts.push({ id: `${order.id}-R${order.receipts.length + 1}`, type, status, content, time: CC_IMPORT_NOW })
  }
  function trace(order, action, content) {
    order.logs ||= []
    order.logs.push({ id: `${order.id}-L${order.logs.length + 1}`, action, operator: session().name || session().role, content, time: CC_IMPORT_NOW })
  }
  function refreshAttachmentStatus(order) {
    order.attachmentStatus = missingAttachments(order).length ? ((order.attachments || []).length ? '部分完成' : '待加工') : '已完成'
  }
  function dispatchCcImportOrders(ids) {
    gate()
    const dispatched = [], skipped = []
    for (const id of ids) {
      const order = find(id)
      if (order.mode !== '备货' || order.warehouseStatus !== '待下发' || order.stockStatus !== '有货' || order.customerCancelled) {
        skipped.push({ orderNo: order.orderNo, reason: order.customerCancelled ? '客户取消订单为是' : '没有可下发的订单' })
        continue
      }
      order.warehouseStatus = '已下发'
      order.stockStatus = '已锁库'
      trace(order, '下发仓库', '校验通过后下发仓库出库')
      dispatched.push(order)
    }
    if (!dispatched.length) throw new Error('没有可下发的订单！')
    return { dispatched, skipped }
  }
  function bindCcImportOrders(ids, { waybillNo = '', outboundNo = '' } = {}) {
    gate()
    if (!String(waybillNo || '').trim()) throw new Error('请填写总运单号')
    const bound = []
    for (const id of ids) {
      const order = find(id)
      if (order.waybillNo) continue
      order.waybillNo = String(waybillNo).trim()
      order.outboundNo = outboundNo || order.outboundNo || `OUT-${order.orderNo}`
      order.bound = true
      order.shipped = true
      trace(order, '绑定干线', `绑定总运单号 ${order.waybillNo}；相同总运单号订单共享干线`)
      bound.push(order)
    }
    if (!bound.length) throw new Error('没有可操作的订单！')
    return { bound }
  }
  function enterCcImportWaybills(ids, payload = {}) {
    gate()
    const entered = [], skipped = []
    for (const id of ids) {
      const order = find(id)
      if (!order.waybillNo || order.waybillEntered) { skipped.push({ orderNo: order.orderNo, reason: !order.waybillNo ? '还没有绑定干线' : '已录入提单' }); continue }
      order.waybillEntered = true
      order.waybillFields = { waybillNo: payload.waybillNo || order.waybillNo, departurePort: payload.departurePort || 'CAN', expectedDeparture: payload.expectedDeparture || '2026-09-09', cargoName: (order.goods[0] || {}).name || '合成进口货物', pallets: (order.goods || []).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0), volume: payload.volume || '0.4', grossWeight: payload.grossWeight || '9.6' }
      trace(order, '提单录入', `按出库单号带出总运单字段：${order.waybillFields.waybillNo}`)
      // 录入提货后自动舱单申报；空运自动快件申报，附件未完成则等待加工。
      order.manifestStatus = '海关入库'
      receipt(order, 'manifest', '海关入库', '舱单申报回执：海关入库（本地模拟）')
      if (!missingAttachments(order).length) {
        order.expressStatus = '海关入库'
        receipt(order, 'express', '海关入库', '快件申报回执：海关入库（本地模拟）')
      } else trace(order, '自动快件申报等待附件', `缺少 ${missingAttachments(order).map(item => item.label).join('、')}`)
      entered.push(order)
    }
    if (!entered.length) throw new Error('没有可录入提单的订单！')
    return { entered, skipped }
  }
  function processCcAttachments(ids, type) {
    gate()
    const orders = ids.map(id => find(id))
    const check = ccAttachmentEligibility(orders, type)
    if (!check.ok) throw new Error(check.reason)
    const [, label, target] = CC_ATTACHMENT_TYPES.find(([key]) => key === type)
    const generated = []
    for (const order of orders) {
      order.attachments ||= []
      if (!order.attachments.some(row => row.type === type)) {
        order.attachments.push({ id: `${order.id}-A${order.attachments.length + 1}`, type, label, status: '已完成', generatedAt: CC_IMPORT_NOW, retainUntil: '2026-10-08' })
      }
      refreshAttachmentStatus(order)
      trace(order, `${label}`, `接口生成附件压缩包（目标 ${target} 类），保留 30 天至 2026-10-08（本地模拟）`)
      generated.push(order)
    }
    return { generated, label }
  }
  function declareCcImportOrders(ids, action, options = {}) {
    gate()
    const changed = [], skipped = []
    const groups = new Map()
    for (const id of ids) {
      const order = find(id)
      const key = order.waybillNo || order.id
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(order)
    }
    for (const [key, group] of [...groups]) {
      if (group[0].waybillNo) for (const sibling of state.ccImportOrders) if (sibling.waybillNo === key && !group.includes(sibling)) group.push(sibling)
      for (const order of group) {
        const check = ccDeclarationEligibility(order, action)
        if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
        if (action === 'attachments') {
          order.attachmentStatus = '已完成'
          receipt(order, 'attachments', '海关入库', '附件申报回执：海关入库（本地模拟）')
          trace(order, '附件申报', order.waybillNo ? `同总运单 ${order.waybillNo}` : '单票')
        } else if (action === 'express') {
          order.expressStatus = '海关入库'
          receipt(order, 'express', '海关入库', '快件申报回执：海关入库（本地模拟）')
          trace(order, '快件申报', order.waybillNo ? `同总运单 ${order.waybillNo}` : '单票')
        }
        changed.push(order)
      }
    }
    if (!changed.length) throw new Error(`没有可申报的订单！${skipped[0]?.reason ? `（${skipped[0].reason}）` : ''}`)
    return { changed, skipped }
  }
  function convertCcToBc(ids) {
    gate()
    const converted = [], skipped = []
    for (const id of ids) {
      const order = find(id)
      const check = ccConvertEligibility(order)
      if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
      order.conversion = '作废'
      const moved = { ...clone(order), id: `BCI-CONV-${String(++state.bcImportSequence).padStart(3, '0')}`, outboundNo: '', waybillNo: '', shipped: false, bound: false, waybillEntered: false, warehouseStatus: '待下发', stockStatus: '有货', expressStatus: '待报关', manifestStatus: '待报关', attachmentStatus: '待加工', returnResult: '', estimatedTax: null, receipts: [], logs: [], conversion: '作废' }
      trace(moved, 'CC转BC', '从原总运单与出库平台订单解绑，转入BC进口未发货列表；预估税金重算待确认，库存不动')
      state.bcImportOrders.unshift(moved)
      state.ccImportOrders.splice(state.ccImportOrders.indexOf(order), 1)
      converted.push(moved)
    }
    if (!converted.length) throw new Error(`没有可转换的订单！${skipped[0]?.reason ? `（${skipped[0].reason}）` : ''}`)
    return { converted, skipped }
  }
  function changeCcWaybillNo(ids, waybillNo) {
    gate()
    if (!String(waybillNo || '').trim()) throw new Error('请填写新的提单号')
    const changed = [], skipped = []
    for (const id of ids) {
      const order = find(id)
      const check = ccWaybillChangeEligibility(order)
      if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
      order.waybillNo = String(waybillNo).trim()
      trace(order, '更改提单号', `修改为 ${order.waybillNo}`)
      changed.push(order)
    }
    if (!changed.length) throw new Error('没有可修改的订单！')
    return { changed, skipped }
  }
  function receiverDuplicateCheck(id) {
    gate()
    const order = find(id)
    const rows = duplicateReceivers(state.ccImportOrders, order)
    trace(order, '收件人信息重复校验', `同提单号相同收件人订单 ${rows.length} 笔`)
    return rows
  }
  function voidCcDeclaration(ids) {
    gate()
    const changed = [], skipped = []
    for (const id of ids) {
      const order = find(id)
      const check = ccDeclarationEligibility(order, 'void')
      if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
      order.voidStatus = '已作废'
      receipt(order, 'void', '已作废', '报关单作废（本地模拟）')
      trace(order, '作废报关单', '按放行状态集作废')
      changed.push(order)
    }
    if (!changed.length) throw new Error('没有可作废的订单！')
    return { changed, skipped }
  }
  function startCcReturn(ids) {
    gate()
    const changed = [], skipped = []
    for (const id of ids) {
      const order = find(id)
      const check = ccDeclarationEligibility(order, 'return')
      if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
      order.returnResult = '退运中'
      trace(order, '发起退运', '过滤可退运订单后跳转退运页（原型记录结果，退运单归逆向订单篇）')
      changed.push(order)
    }
    if (!changed.length) throw new Error('没有可退运的订单！')
    return { changed, skipped }
  }
  return { dispatchCcImportOrders, bindCcImportOrders, enterCcImportWaybills, processCcAttachments, declareCcImportOrders, convertCcToBc, changeCcWaybillNo, receiverDuplicateCheck, voidCcDeclaration, startCcReturn }
}
