import { BBC_EXPRESS_COMPANIES, BBC_NOW, declarationAllowed, declarationStateFor } from '../domain/bbcCustomerOrders.js'

const clone = value => JSON.parse(JSON.stringify(value))
const text = value => String(value ?? '').trim()

export function createBbcOrderActions(state, getSession) {
  const session = () => getSession()
  const canOperate = () => ['service', 'supervisor', 'business', 'customsService'].includes(session().role)
  const find = id => {
    const order = state.bbcCustomerOrders.find(row => row.id === id)
    if (!order) throw new Error('未找到 BBC 客户订单')
    return order
  }
  function appendReceipt(order, type, status, content, time = BBC_NOW) {
    order.receipts ||= []
    order.receipts.push({ id: `${order.id}-R${order.receipts.length + 1}`, type, status, time, content })
  }
  function trace(order, event, content, time = BBC_NOW) {
    order.events ||= []
    order.events.push({ id: `${order.id}-E${order.events.length + 1}`, event, content, actor: session().name || session().role, time })
  }
  function declareBbcOrders(ids, documents = ['order', 'waybill', 'manifest']) {
    if (!canOperate()) throw new Error('当前角色不能申报 BBC 客户订单')
    const results = { declared: [], skipped: [] }
    for (const id of ids) {
      const order = find(id)
      const state_ = declarationStateFor(order)
      if (!state_.ok) { results.skipped.push({ id, orderNo: order.orderNo, reason: state_.reason }); continue }
      const allowed = declarationAllowed(order)
      const sent = []
      for (const key of ['order', 'waybill', 'manifest']) {
        if (!documents.includes(key) || !allowed[key]) continue
        sent.push(key)
      }
      if (!sent.length) { results.skipped.push({ id, orderNo: order.orderNo, reason: '所选单据当前状态不允许申报' }); continue }
      for (const key of sent) {
        if (key === 'order') { order.orderStatus = '已经提交处理中'; appendReceipt(order, '订单申报', '已经提交处理中', '已发送订单申报（本地模拟）'); }
        if (key === 'waybill') { order.waybillStatus = '已经提交处理中'; appendReceipt(order, '运单申报', '已经提交处理中', '已发送运单申报（本地模拟）'); }
        if (key === 'manifest') { order.manifestStatus = '已经提交处理中'; appendReceipt(order, '清单申报', '已经提交处理中', '已发送清单申报（本地模拟）'); }
      }
      // 回执本地模拟：订单、运单返回海关入库，清单返回放行。
      if (sent.includes('order')) { order.orderStatus = '海关入库'; appendReceipt(order, '订单申报', '海关入库', '订单申报回执：海关入库（本地模拟）') }
      if (sent.includes('waybill')) { order.waybillStatus = '海关入库'; appendReceipt(order, '运单申报', '海关入库', '运单申报回执：海关入库（本地模拟）') }
      if (sent.includes('manifest') || (order.orderStatus === '海关入库' && order.waybillStatus === '海关入库')) { order.manifestStatus = '放行'; appendReceipt(order, '清单申报', '放行', '清单申报回执：放行（本地模拟）') }
      if (order.orderStatus === '海关入库' && order.waybillStatus === '海关入库' && order.manifestStatus === '放行' && order.warehouseStatus !== '已出库') {
        order.warehouseStatus = '已下发'
        trace(order, '下发WMS', '三单条件满足，仓库状态记为已下发（本地模拟）')
      }
      trace(order, '批量申报', `发送 ${sent.map(key => ({ order: '订单', waybill: '运单', manifest: '清单' })[key]).join('、')}申报`)
      results.declared.push({ id, orderNo: order.orderNo, documents: sent })
    }
    return results
  }
  function cancelBbcOrder(id) {
    if (!canOperate()) throw new Error('当前角色不能取消 BBC 客户订单')
    const order = find(id)
    if (order.warehouseStatus === '已出库') throw new Error('所选订单不能取消：已发货或已出库的精确排除口径待确认')
    if (['已取消', '已作废'].includes(order.orderStatus)) throw new Error('所选订单不能取消')
    order.orderStatus = '已取消'
    order.warehouseStatus = '订单已取消'
    order.waybillStatus = '待报关'
    order.manifestStatus = '待报关'
    order.cancelStatus = '撤销申请已发送（未验证成功）'
    appendReceipt(order, '撤销申报', '已发送', '已向海关发送撤销申请；发送不等于撤销成功（本地模拟）')
    trace(order, '取消订单', '同步 WMS 用于库内拦截并发送撤销申请；外部结果未回传')
    return order
  }
  function restoreBbcOrder(id) {
    if (!canOperate()) throw new Error('当前角色不能恢复 BBC 客户订单')
    const order = find(id)
    if (order.orderStatus !== '已取消') throw new Error('所选订单不能恢复')
    order.orderStatus = '待报关'
    order.warehouseStatus = '待下发'
    order.cancelStatus = ''
    trace(order, '恢复订单', '恢复为待报关并重新进入三单自动申报流程；后续由批量申报或自动规则执行')
    return order
  }
  function voidBbcOrder(id) {
    if (!canOperate()) throw new Error('当前角色不能作废 BBC 客户订单')
    const order = find(id)
    if (!['待报关', '已取消', '海关退单'].includes(order.orderStatus)) throw new Error('所选订单不能作废')
    order.orderStatus = '已作废'
    trace(order, '作废订单', '订单作废后不可恢复，仅能查看')
    return order
  }
  function modifyBbcOrder(id, patch) {
    if (!canOperate()) throw new Error('当前角色不能修改 BBC 客户订单')
    const order = find(id)
    if (!['待报关', '已取消'].includes(order.orderStatus)) throw new Error('仅待报关或已取消订单可修改信息')
    // 可修改字段与修改后的重报边界待确认，这里只开放已明确无争议的备注与收件资料。
    const before = { remark: order.remark, address: order.address, buyer: order.buyer, buyerPhone: order.buyerPhone }
    for (const key of ['remark', 'address', 'buyer', 'buyerPhone']) if (Object.hasOwn(patch || {}, key)) order[key] = text(patch[key])
    trace(order, '修改订单信息', `修改字段：${Object.keys(before).filter(key => before[key] !== order[key]).join('、') || '无变化'}；修改后重报边界待确认`)
    return order
  }
  function fetchBbcExpress(id, company) {
    if (!canOperate()) throw new Error('当前角色不能下快递')
    const order = find(id)
    if (!BBC_EXPRESS_COMPANIES.includes(company)) throw new Error('请选择快递公司')
    if (order.expressNo && order.waybillStatus !== '待报关') throw new Error('已有快递号的订单仅运单待报关时可下快递')
    order.expressHistory ||= []
    if (order.expressNo) order.expressHistory.push({ no: order.expressNo, company: order.expressCompany, invalidatedAt: BBC_NOW })
    const serial = ++state.bbcExpressSequence
    order.expressNo = `DEMO-BBC-EX-N${String(serial).padStart(2, '0')}`
    order.expressCompany = company
    trace(order, '下快递', `新单号 ${order.expressNo}；原号失效与重报处理未定义`)
    return order
  }
  function loadBbcExamples() {
    return clone({ orders: state.bbcCustomerOrders })
  }
  return { declareBbcOrders, cancelBbcOrder, restoreBbcOrder, voidBbcOrder, modifyBbcOrder, fetchBbcExpress, loadBbcExamples }
}
