import {
  BC_IMPORT_CHANNELS, BC_IMPORT_NOW, bcBindEligibility, bcClearanceUpdate, bcConvertEligibility,
  bcDeclarationEligibility, bcDispatchEligibility, bcImportPermissions, bcUnbindEligibility, bcWaybillEntryEligibility,
} from '../domain/bcImportOrders.js'

const clone = value => JSON.parse(JSON.stringify(value))

export function createBcImportOrderActions(state, getSession) {
  const session = () => getSession() || { role: 'viewer', name: '' }
  const permission = () => bcImportPermissions(session().role)
  const find = id => {
    const order = state.bcImportOrders.find(row => row.id === id)
    if (!order) throw new Error('未找到 BC 进口订单')
    return order
  }
  function gate() { if (!permission().operate) throw new Error('当前角色不能执行 BC 进口关务作业') }
  function receipt(order, type, status, content) {
    order.receipts ||= []
    order.receipts.push({ id: `${order.id}-R${order.receipts.length + 1}`, type, status, content, time: BC_IMPORT_NOW })
  }
  function trace(order, action, content) {
    order.logs ||= []
    order.logs.push({ id: `${order.id}-L${order.logs.length + 1}`, action, operator: session().name || session().role, content, time: BC_IMPORT_NOW })
  }
  function dispatchBcImportOrders(ids) {
    gate()
    const dispatched = [], skipped = []
    for (const id of ids) {
      const order = find(id)
      const check = bcDispatchEligibility(order)
      if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
      order.warehouseStatus = '已下发'
      order.stockStatus = '已锁库'
      trace(order, '下发仓库', '现货有货，校验通过后下发仓库出库')
      dispatched.push(order)
    }
    if (!dispatched.length) throw new Error(`没有可下发的订单！${skipped[0]?.reason ? `（${skipped[0].reason}）` : ''}`)
    return { dispatched, skipped }
  }
  function bindBcImportOrders(ids, { waybillNo = '', outboundNo = '' } = {}) {
    gate()
    if (!String(waybillNo || '').trim()) throw new Error('请填写总运单号')
    const bound = [], skipped = []
    for (const id of ids) {
      const order = find(id)
      const check = bcBindEligibility(order)
      if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
      order.waybillNo = String(waybillNo).trim()
      order.outboundNo = outboundNo || order.outboundNo || `OUT-${order.orderNo}`
      order.bound = true
      order.shipped = true
      trace(order, '绑定干线', `绑定出库订单并填写总运单号 ${order.waybillNo}；相同总运单号的客户订单共享干线`)
      // 同一出库单号的其他订单同步绑定，保持“一个客户订单绑定干线即整组绑定”。
      for (const sibling of state.bcImportOrders) {
        if (sibling.id !== order.id && sibling.outboundNo && sibling.outboundNo === order.outboundNo && !sibling.waybillNo) {
          sibling.waybillNo = order.waybillNo
          sibling.bound = true
          sibling.shipped = true
          trace(sibling, '绑定干线', `随出库单号 ${order.outboundNo} 同步绑定总运单号 ${order.waybillNo}`)
        }
      }
      bound.push(order)
    }
    if (!bound.length) throw new Error(`没有可操作的订单！${skipped[0]?.reason ? `（${skipped[0].reason}）` : ''}`)
    return { bound, skipped }
  }
  function enterBcImportWaybills(ids, payload = {}) {
    gate()
    const entered = [], skipped = []
    for (const id of ids) {
      const order = find(id)
      const check = bcWaybillEntryEligibility(order)
      if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
      order.waybillEntered = true
      order.waybillFields = {
        waybillNo: payload.waybillNo || order.waybillNo,
        departurePort: payload.departurePort || 'CAN',
        expectedDeparture: payload.expectedDeparture || BC_IMPORT_NOW.slice(0, 10),
        cargoName: (order.goods[0] || {}).name || '合成进口货物',
        pallets: (order.goods || []).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0),
        volume: payload.volume || '0.5',
        grossWeight: payload.grossWeight || '12.5',
      }
      trace(order, '提单录入', `按出库单号带出总运单字段：${order.waybillFields.waybillNo} / ${order.waybillFields.cargoName}`)
      // 录入提货后自动进行订单申报与运单申报，默认通道广州电子口岸（本地模拟）。
      for (const [action, field, label] of [['order', 'orderStatus', '订单申报'], ['waybill', 'waybillStatus', '运单申报']]) {
        if (order.customerCancelled) continue
        order.channel = order.channel || BC_IMPORT_CHANNELS[0]
        order[field] = '海关入库'
        receipt(order, action, '海关入库', `${label}回执：海关入库，通道 ${order.channel}，报送类型 ${order[field] === '海关入库' ? '新增' : '新增'}（本地模拟）`)
      }
      trace(order, '自动申报', '录入提货后自动订单申报与运单申报（本地模拟）')
      entered.push(order)
    }
    if (!entered.length) throw new Error(`没有可录入提单的订单！${skipped[0]?.reason ? `（${skipped[0].reason}）` : ''}`)
    return { entered, skipped }
  }
  function declareBcImportOrders(ids, action, options = {}) {
    gate()
    const changed = [], skipped = []
    const groups = new Map()
    for (const id of ids) {
      const order = find(id)
      const key = order.waybillNo || order.id
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(order)
    }
    // 相同总运单号的订单一并申报。
    for (const [key, group] of [...groups]) {
      if (!group[0].waybillNo) continue
      for (const sibling of state.bcImportOrders) {
        if (sibling.waybillNo === key && !group.includes(sibling)) group.push(sibling)
      }
    }
    for (const [, group] of groups) {
      for (const order of group) {
        const check = bcDeclarationEligibility(order, action)
        if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
        const type = options.channel ? `（通道 ${options.channel}）` : ''
        if (action === 'order') {
          const next = order.orderStatus === '待报关' ? '新增' : '变更'
          order.orderStatus = '海关入库'
          order.channel = options.channel || order.channel || BC_IMPORT_CHANNELS[0]
          receipt(order, 'order', '海关入库', `订单申报回执：海关入库，报送类型 ${next}${type}（本地模拟）`)
        } else if (action === 'waybill') {
          order.waybillStatus = '海关入库'
          order.channel = options.channel || order.channel || BC_IMPORT_CHANNELS[0]
          receipt(order, 'waybill', '海关入库', `运单申报回执：海关入库${type}（本地模拟）`)
        } else if (action === 'list') {
          order.listStatus = '海关入库'
          receipt(order, 'list', '海关入库', `清单申报回执：海关入库（本地模拟）`)
        } else if (action === 'cancelList') {
          order.cancelListStatus = '海关入库'
          receipt(order, 'cancelList', '海关入库', `撤销清单申报回执：海关入库，原因 ${options.reason || '未填写'}（本地模拟）`)
        } else if (action === 'return') {
          order.returnStatus = '海关审结'
          order.returnResult = '进行中'
          receipt(order, 'return', '海关审结', `退货申报回执：海关审结，原因 ${options.reason || '未填写'}（本地模拟）；可进行退运处理`)
        } else if (action === 'deleteOrder') {
          order.orderStatus = '待报关'
          receipt(order, 'deleteOrder', '海关入库', '删除订单申报回执：海关入库，状态恢复待报关（本地模拟）')
        } else if (action === 'deleteWaybill') {
          order.waybillStatus = '待报关'
          receipt(order, 'deleteWaybill', '海关入库', '删除运单申报回执：海关入库，状态恢复待报关（本地模拟）')
        } else if (action === 'deleteCancel') {
          order.cancelListStatus = '待报关'
          receipt(order, 'deleteCancel', '海关审结', '删除撤销申报回执：海关审结，状态恢复待报关（本地模拟）')
        } else {
          throw new Error('未定义的申报动作')
        }
        trace(order, { order: '订单申报', waybill: '运单申报', list: '清单申报', cancelList: '撤销清单申报', return: '退货申报', deleteOrder: '删除订单申报', deleteWaybill: '删除运单申报', deleteCancel: '删除撤销申报' }[action], order.waybillNo ? `同总运单 ${order.waybillNo}` : '单票')
        changed.push(order)
      }
    }
    if (!changed.length) throw new Error(`没有可申报的订单！${skipped[0]?.reason ? `（${skipped[0].reason}）` : ''}`)
    return { changed, skipped }
  }
  function convertBcToCc(ids) {
    gate()
    const converted = [], skipped = []
    for (const id of ids) {
      const order = find(id)
      const check = bcConvertEligibility(order, order.goods)
      if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
      order.conversion = '作废'
      const moved = {
        ...clone(order), id: `CCI-${String(++state.ccImportSequence).padStart(3, '0')}`,
        outboundNo: '', waybillNo: '', shipped: false, bound: false, waybillEntered: false, warehouseStatus: '待下发', stockStatus: '有货',
        orderStatus: '待报关', waybillStatus: '待报关', listStatus: '待报关', cancelListStatus: '待报关', returnStatus: '待报关', returnResult: '',
        estimatedTax: null, customsTax: '', conversion: '作废', receipts: [], logs: [],
      }
      trace(moved, 'BC转CC', '从原总运单与出库平台订单解绑，转入CC进口未发货列表；预估税金按行邮税号重算待确认，库存不动')
      state.ccImportOrders.unshift(moved)
      state.bcImportOrders.splice(state.bcImportOrders.indexOf(order), 1)
      converted.push(moved)
    }
    if (!converted.length) throw new Error(`没有可转换的订单！${skipped[0]?.reason ? `（${skipped[0].reason}）` : ''}`)
    return { converted, skipped }
  }
  function unbindBcImportOrders(ids) {
    gate()
    const unbound = [], skipped = []
    for (const id of ids) {
      const order = find(id)
      const check = bcUnbindEligibility(order)
      if (!check.ok) { skipped.push({ orderNo: order.orderNo, reason: check.reason }); continue }
      order.waybillNo = ''
      order.waybillFields = null
      order.bound = false
      order.waybillEntered = false
      order.shipped = false
      trace(order, '从总运单解绑', '从原总运单与出库平台订单解绑，回到未发货列表；客服可重新生成出库平台订单')
      unbound.push(order)
    }
    if (!unbound.length) throw new Error(`没有可解绑的订单！${skipped[0]?.reason ? `（${skipped[0].reason}）` : ''}`)
    return { unbound, skipped }
  }
  function updateBcClearance(ids, update = {}) {
    gate()
    const orders = ids.map(id => find(id))
    const waybills = new Set(orders.map(order => order.waybillNo).filter(Boolean))
    if (waybills.size > 1) throw new Error('请选择相同提单号的订单！')
    const changed = [], skipped = []
    for (const order of orders) {
      if (order.customerCancelled) { skipped.push({ orderNo: order.orderNo, reason: '客户取消订单为是，已过滤' }); continue }
      const result = bcClearanceUpdate(order, update)
      if (!result.ok) { skipped.push({ orderNo: order.orderNo, reason: result.reason }); continue }
      order.logistics = result.logistics
      trace(order, '补充清关信息', `货站提货 ${order.logistics.pickedUp} / 开始清关 ${order.logistics.clearanceStarted} / 完成清关 ${order.logistics.clearanceDone}；新录入覆盖旧数据`)
      changed.push(order)
    }
    if (!changed.length) throw new Error(`没有可补充清关信息的订单！${skipped[0]?.reason ? `（${skipped[0].reason}）` : ''}`)
    return { changed, skipped }
  }
  return { dispatchBcImportOrders, bindBcImportOrders, enterBcImportWaybills, declareBcImportOrders, convertBcToCc, unbindBcImportOrders, updateBcClearance }
}
