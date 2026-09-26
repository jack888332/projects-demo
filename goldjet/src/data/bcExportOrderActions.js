import {
  BC_EXPORT_NOW, BC_DECLARE_TYPES, bcExportPermissions, buildBcFailureCsv, createBcExportBatchNo,
  declarationEligibility, deletionEligibility, exceptionEligibility, parseBcImportRows,
} from '../domain/bcExportOrders.js'

const clone = value => JSON.parse(JSON.stringify(value))
const text = value => String(value ?? '').trim()

export function createBcExportOrderActions(state, getSession) {
  const session = () => getSession() || { role: 'viewer', name: '' }
  const permission = () => bcExportPermissions(session().role)
  const find = id => {
    const order = state.bcExportOrders.find(row => row.id === id)
    if (!order) throw new Error('未找到 BC 出口订单')
    return order
  }
  function receipt(order, type, status, content) {
    order.receipts ||= []
    order.receipts.push({ id: `${order.id}-R${order.receipts.length + 1}`, type, status, content, time: BC_EXPORT_NOW })
  }
  function trace(order, action, content) {
    order.logs ||= []
    order.logs.push({ id: `${order.id}-L${order.logs.length + 1}`, action, operator: session().name || session().role, content, time: BC_EXPORT_NOW })
  }
  function gate() { if (!permission().declare) throw new Error('当前角色不能执行 BC 出口申报') }
  // 批量申报：逐条复核资格，未通过自动过滤并反馈原因。
  function declareBcExportOrders(ids, action, options = {}) {
    gate()
    const [typeLabel, statusField] = BC_DECLARE_TYPES[action] || []
    if (!typeLabel) throw new Error('未定义的申报动作')
    const sent = [], skipped = []
    for (const id of ids) {
      const order = find(id)
      if (order.id !== id) continue
      if (action === 'waybillDoc' && text(options.waybillNo)) order.waybillNo = text(options.waybillNo)
      const check = declarationEligibility(order, action)
      if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
      if (options.channel) order.channel = options.channel
      if (action === 'cancelList') {
        order.cancelListStatus = '海关入库'
        receipt(order, '撤销清单申报', '海关入库', `撤单原因：${text(options.reason) || '未填写'}（本地模拟）`)
      } else if (action === 'list') {
        order.listStatus = '海关入库'
        receipt(order, '清单申报', '海关入库', `申报业务类型：${text(options.businessType) || '未选择'}（本地模拟）`)
      } else if (action === 'summary') {
        order.summaryStatus = '海关审结'
        receipt(order, '汇总申报', '海关审结', '汇总申报回执：海关审结（本地模拟）')
      } else {
        order[statusField] = '海关入库'
        receipt(order, typeLabel, '海关入库', `${typeLabel}回执：海关入库（本地模拟）`)
      }
      trace(order, typeLabel, `通道 ${order.channel || '未选择'}；状态更新为海关入库`)
      sent.push({ orderNo: order.orderNo })
    }
    if (!sent.length) throw new Error(`没有可${typeLabel}的订单：${skipped[0]?.reason || ''}`)
    return { sent, skipped }
  }
  function enterBcWaybillNo(ids, waybillNo) {
    gate()
    if (!text(waybillNo)) throw new Error('请填写总运单号')
    const changed = []
    for (const id of ids) {
      const order = find(id)
      if (!['海关入库', '海关审结'].includes(order.listStatus) && !text(order.platformOrderNo)) continue
      order.waybillNo = text(waybillNo)
      trace(order, '总运单录入', `统一录入总运单号 ${text(waybillNo)}；同号最多与无号订单的挑选规则按待确认保留`)
      changed.push(order)
    }
    if (!changed.length) throw new Error('没有可录入总运单号的订单')
    return changed
  }
  // 异常处理：删除类申报（状态回退待报关）。
  function deleteBcDeclarations(ids, action) {
    gate()
    const changed = [], skipped = []
    for (const id of ids) {
      const order = find(id)
      const check = deletionEligibility(order, action)
      if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
      const map = { deleteOrder: ['orderStatus', '订单申报'], deletePay: ['payStatus', '支付单申报'], deleteWaybill: ['waybillStatus', '运单申报'], deleteCancel: ['cancelListStatus', '撤销清单申报'], deleteWaybillDoc: ['waybillDocStatus', '总运单申报'], deleteDeparture: ['departureStatus', '离境单申报'], deleteSummary: ['summaryStatus', '汇总申报'] }
      const [field, label] = map[action]
      order[field] = action === 'deleteSummary' ? '待报关' : '待报关'
      receipt(order, `删除${label}`, '海关入库', `删除报文已发送，回执海关入库后状态改为待报关（本地模拟）`)
      trace(order, `删除${label}`, '删除申报（本地模拟）')
      changed.push(order)
    }
    if (!changed.length) throw new Error(`没有可删除的订单：${skipped[0]?.reason || ''}`)
    return { changed, skipped }
  }
  function recordBcException(ids, action, payload = {}) {
    gate()
    const changed = [], skipped = []
    if (action === 'batchNewOrders') {
      for (const id of ids) {
        const order = find(id)
        const serial = ++state.bcExportSequence
        const copy = {
          ...clone(order), id: `BCO-${BC_EXPORT_NOW.slice(2, 4)}${BC_EXPORT_NOW.slice(5, 7)}${BC_EXPORT_NOW.slice(8, 10)}-${String(serial).padStart(3, '0')}`, orderNo: `${order.orderNo}A`,
          platformOrderNo: '', waybillNo: '', orderStatus: '待报关', payStatus: '待报关', waybillStatus: '待报关', listStatus: '待报关', waybillDocStatus: '待报关', cancelListStatus: '待报关', arrivalStatus: '待报关', departureStatus: '待报关', summaryStatus: '待报关',
          exceptionResult: '无', receipts: [], logs: [], createdAt: BC_EXPORT_NOW, batchNo: order.batchNo,
        }
        trace(copy, '批量生成新订单', `由 ${order.orderNo} 生成，编号追加 A；唯一性处理待确认`)
        state.bcExportOrders.unshift(copy)
        changed.push(copy)
      }
      if (!changed.length) throw new Error('没有可生成新订单的记录')
      return { changed, skipped }
    }
    if (action === 'deleteOrders') {
      if (!ids.length) throw new Error('请勾选订单或先查询')
      for (const id of ids) {
        const order = find(id)
        const check = exceptionEligibility(order, 'deleteOrder')
        if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
        state.bcExportOrders.splice(state.bcExportOrders.indexOf(order), 1)
      }
      return { changed: [], skipped }
    }
    if (action === 'modifyWaybill') {
      if (!text(payload.waybillNo)) throw new Error('请填写总运单号')
      for (const id of ids) {
        const order = find(id)
        const check = exceptionEligibility(order, 'modifyWaybill')
        if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
        order.waybillNo = text(payload.waybillNo)
        trace(order, '修改总运单', `统一修改为 ${text(payload.waybillNo)}`)
        changed.push(order)
      }
      if (!changed.length) throw new Error(`没有可修改总运单的订单：${skipped[0]?.reason || ''}`)
      return { changed, skipped }
    }
    for (const id of ids) {
      const order = find(id)
      const check = exceptionEligibility(order, action)
      if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
      if (action === 'discard') {
        if (!text(payload.reason)) throw new Error('请填写弃货原因')
        order.exceptionResult = '弃货'
        trace(order, '记录弃货', text(payload.reason))
      } else if (action === 'returnScene') {
        order.exceptionResult = '退单退场'
        order.returnAttachments = [{ name: `${text(payload.fileName) || '退货申请表'}${BC_EXPORT_NOW.replaceAll('-', '').replaceAll(':', '').replace(' ', '')}`, uploadedAt: BC_EXPORT_NOW }]
        trace(order, '退单退场', `上传退货申请表；文件名追加时间戳`)
      } else if (action === 'deleteScene') {
        order.exceptionResult = '删单退场'
        trace(order, '删单退场', `删单退场页打开；总运单号 ${order.waybillNo || '未填写'}（原型记录结果，真实删单待接关务作业）`)
      }
      changed.push(order)
    }
    if (!changed.length) throw new Error(`没有可执行该异常处理的订单：${skipped[0]?.reason || ''}`)
    return { changed, skipped }
  }
  function importBcExportOrders({ mode = '9710', rowsText = '' } = {}) {
    if (!permission().import) throw new Error('当前角色不能导入 BC 出口订单')
    const existing = state.bcExportOrders.map(order => order.orderNo)
    const { orders, problems } = parseBcImportRows(rowsText, existing)
    const batchNo = createBcExportBatchNo(++state.bcExportImportSequence, BC_EXPORT_NOW)
    const created = []
    for (const row of orders) {
      const serial = ++state.bcExportSequence
      const record = {
        id: `BCO-IMP-${String(serial).padStart(3, '0')}`, ...row, supervisionMode: mode, batchNo,
        orderStatus: '待报关', payStatus: '待报关', waybillStatus: '待报关', listStatus: '待报关', waybillDocStatus: '待报关', cancelListStatus: '待报关', arrivalStatus: '待报关', departureStatus: '待报关', summaryStatus: '待报关',
        exceptionResult: '无', channel: '', createdAt: BC_EXPORT_NOW, receipts: [], logs: [],
        goods: [{ name: '导入合成商品（演示）', quantity: 1, unitPrice: row.amount }],
      }
      state.bcExportOrders.unshift(record)
      trace(record, '导入', `批次 ${batchNo} · 模式 ${mode}`)
      created.push(record)
    }
    const history = { id: `BCO-HIS-${String(++state.bcExportImportSequence).padStart(3, '0')}`, batchNo, mode, total: orders.length + problems.length, success: created.length, failed: problems.length, importedAt: BC_EXPORT_NOW, problems }
    state.bcExportImportHistory.unshift(history)
    return { ok: created.length > 0, created, problems, history, failureCsv: problems.length ? buildBcFailureCsv(problems) : '' }
  }
  return { declareBcExportOrders, enterBcWaybillNo, deleteBcDeclarations, recordBcException, importBcExportOrders }
}
