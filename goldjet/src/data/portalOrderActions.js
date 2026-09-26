import {
  PORTAL_NOW, buildPortalFailureCsv, checkStockAvailability, createRequirementDraft, parseImportRows,
  portalPermissions, smallOrderEligibility, tallyIssues,
} from '../domain/portalOrders.js'
import { orderNoFor } from '../domain/integratedOrders.js'

const clone = value => JSON.parse(JSON.stringify(value))
const text = value => String(value ?? '').trim()

export function createPortalOrderActions(state, getSession) {
  const session = () => getSession() || { role: 'viewer', name: '' }
  const permission = () => portalPermissions(session().role)
  const now = () => new Date(Date.UTC(2026, 8, 8, 14, 30, ++state.portalSequence)).toISOString().slice(0, 19).replace('T', ' ')
  const findSmall = id => {
    const order = state.portalSmallOrders.find(row => row.id === id)
    if (!order) throw new Error('未找到小订单')
    return order
  }
  const findRequirement = id => {
    const requirement = state.portalRequirements.find(row => row.id === id)
    if (!requirement) throw new Error('未找到需求单')
    return requirement
  }
  const findReport = id => {
    const report = state.portalReports.find(row => row.id === id)
    if (!report) throw new Error('未找到仓库报告')
    return report
  }
  function trace(order, event, content) {
    order.history ||= []
    order.history.push({ id: `${order.id}-H${order.history.length + 1}`, event, content, actor: session().name || session().role, time: now() })
  }
  function assertPool() { if (!permission().pool) throw new Error('当前角色不能处置订单池') }
  function assertSmall() { if (!permission().smallOrder) throw new Error('当前角色不能处置小订单') }

  // ---- 订单池 ----
  function markPoolOrders(ids, mode) {
    assertPool()
    if (!['集货', '备货'].includes(mode)) throw new Error('请选择集货或备货')
    const orders = state.portalPoolOrders.filter(row => ids.includes(row.id))
    const invalid = orders.filter(row => row.customerCancelled)
    if (invalid.length) throw new Error('已取消订单不能标记，请先恢复')
    for (const order of orders) {
      order.mode = mode
      state.portalSmallOrders.push({ ...order, warehouseStatus: mode === '集货' ? '待出库' : '待下发', stockStatus: mode === '备货' ? '待检查' : '', presaleType: mode === '备货' ? '现货' : '', logistics: { flightArrived: '未到达', pickedUp: '未提货', clearanceStarted: '未开始', clearanceDone: '未完成', expressHandover: '未交接' } })
    }
    state.portalPoolOrders = state.portalPoolOrders.filter(row => !ids.includes(row.id))
    return orders.length
  }
  function setPoolCancelled(ids, cancelled) {
    assertPool()
    const orders = state.portalPoolOrders.filter(row => ids.includes(row.id))
    for (const order of orders) {
      if (cancelled && order.customerCancelled) continue
      if (!cancelled && !order.customerCancelled) continue
      order.customerCancelled = cancelled
    }
    return orders.length
  }
  function cancelPoolOrders(ids) { return setPoolCancelled(ids, true) }
  function restorePoolOrders(ids) { return setPoolCancelled(ids, false) }

  // ---- 小订单处置 ----
  function updatePalletNo(ids, palletNo) {
    assertSmall()
    const orders = state.portalSmallOrders.filter(row => ids.includes(row.id))
    const eligible = orders.filter(order => smallOrderEligibility(order).updatePallet)
    if (!eligible.length) throw new Error('没有可修改托盘号的订单：仅集货且尚未下发仓库的订单可修改')
    for (const order of eligible) { order.palletNo = text(palletNo); trace(order, '修改托盘号', `托盘号：${order.palletNo || '空'}`) }
    return eligible.length
  }
  function unbindRequirement(ids) {
    assertSmall()
    const orders = state.portalSmallOrders.filter(row => ids.includes(row.id) && row.requirementId)
    if (!orders.length) throw new Error('所选订单没有可解绑的入库需求')
    for (const order of orders) {
      const requirement = state.portalRequirements.find(row => row.id === order.requirementId)
      const confirmed = Boolean(requirement && ['已确认', '已完成'].includes(requirement.reportStatus))
      if (confirmed) throw new Error('目标需求的收货报告已确认，不能解绑')
      order.requirementId = ''
      trace(order, '解绑入库需求', '解除小订单与入库需求的关联')
    }
    return orders.length
  }
  function bindRequirement(ids, requirementId) {
    assertSmall()
    const requirement = findRequirement(requirementId)
    if (['已完成', '已取消'].includes(requirement.status)) throw new Error('目标需求不可绑定')
    if (requirement.reportStatus === '已确认') throw new Error('目标需求的收货报告已确认，不能绑定')
    const orders = state.portalSmallOrders.filter(row => ids.includes(row.id))
    const eligible = orders.filter(order => smallOrderEligibility(order).bind)
    if (!eligible.length) throw new Error('没有可绑定的订单：已入库、已绑定或已取消的订单不能绑定')
    for (const order of eligible) {
      order.requirementId = requirement.id
      trace(order, '绑定入库需求', `绑定 ${requirement.orderNo}`)
    }
    return eligible.length
  }
  function convertToStock(ids) {
    assertSmall()
    const orders = state.portalSmallOrders.filter(row => ids.includes(row.id))
    if (orders.some(order => !smallOrderEligibility(order).convertToStock)) throw new Error('仅未绑定入库需求且尚未下发仓库的集货订单可转备货')
    for (const order of orders) {
      order.mode = '备货'
      order.warehouseStatus = '待下发'
      order.stockStatus = '待检查'
      order.presaleType = '现货'
      trace(order, '集货转备货', '转换后进入备货列表；商品ID补齐与关务业务变更规则待确认')
    }
    return orders.length
  }
  function convertToPickup(ids) {
    assertSmall()
    const orders = state.portalSmallOrders.filter(row => ids.includes(row.id))
    if (orders.some(order => !smallOrderEligibility(order).convertToPickup)) throw new Error('仅下发仓库前且未取消的备货订单可转回集货')
    for (const order of orders) {
      order.mode = '集货'
      order.warehouseStatus = '待出库'
      order.stockStatus = ''
      order.presaleType = ''
      trace(order, '备货转回集货', '转换后进入集货列表；目标列表归属按当前业务类型保留')
    }
    return orders.length
  }
  function submitInbound(ids) {
    assertSmall()
    const orders = state.portalSmallOrders.filter(row => ids.includes(row.id))
    const eligible = orders.filter(order => smallOrderEligibility(order).submitInbound)
    if (!eligible.length) throw new Error('没有可提交入库的小订单')
    const platforms = new Set(eligible.map(order => order.platform).filter(Boolean))
    if (platforms.size > 1) throw new Error('提交入库须为同一电商平台的订单')
    const draft = createRequirementDraft(eligible[0].businessType, '集货')
    draft.id = `REQ-${String(++state.portalRequirementSequence).padStart(5, '0')}`
    draft.orderNo = `PR${PORTAL_NOW.slice(2, 4)}${PORTAL_NOW.slice(5, 7)}${PORTAL_NOW.slice(8, 10)}${String(state.portalRequirementSequence).padStart(5, '0')}`
    draft.smallOrderIds = eligible.map(order => order.id)
    draft.customer = eligible[0].company || eligible[0].shop || '门户客户（演示）'
    draft.createdAt = now()
    draft.status = '未提交'
    state.portalRequirements.unshift(draft)
    for (const order of eligible) { order.requirementId = draft.id; order.inboundNo = order.inboundNo || `IN-${draft.orderNo}` }
    trace(draft, '创建入库需求', `由 ${eligible.length} 笔小订单形成，等待补充包装汇总与服务`)
    return draft
  }
  function deleteSmallOrders(ids) {
    assertSmall()
    const orders = state.portalSmallOrders.filter(row => ids.includes(row.id))
    const eligible = orders.filter(order => smallOrderEligibility(order).delete)
    if (!eligible.length) throw new Error('没有可删除的订单：已提交需求或已出库的订单不能删除')
    state.portalSmallOrders = state.portalSmallOrders.filter(row => !eligible.some(order => order.id === row.id))
    return eligible.length
  }
  function cancelSmallOrders(ids) {
    assertSmall()
    const orders = state.portalSmallOrders.filter(row => ids.includes(row.id))
    const eligible = orders.filter(order => smallOrderEligibility(order).cancel)
    if (!eligible.length) throw new Error('没有可取消的订单')
    for (const order of eligible) {
      order.customerCancelled = true
      if (order.warehouseStatus === '已出库') {
        order.intercept = '拦截中'
        trace(order, '客户取消订单', '已发货且已放行：线下通知快递拦截；取消标记不代表包裹已拦截')
      } else if (['待拣货', '待打包', '待出库'].includes(order.warehouseStatus) && order.requirementId) {
        order.intercept = '拦截中'
        order.customsStatus = order.customsStatus === '待报关' ? '撤销申请已发送' : order.customsStatus
        trace(order, '客户取消订单', '同步取消标记并发送撤销申请/通知 WMS 终止；外部结果均为本地模拟')
      } else {
        trace(order, '客户取消订单', '未发货：通知 WMS 终止出库流程；库存释放按备货规则处理')
      }
    }
    return eligible.length
  }
  function restoreSmallOrders(ids) {
    assertSmall()
    const orders = state.portalSmallOrders.filter(row => ids.includes(row.id))
    const eligible = orders.filter(order => smallOrderEligibility(order).restore)
    for (const order of eligible) {
      order.customerCancelled = false
      order.intercept = '无'
      order.returnResult = order.returnResult === '退运中' ? '' : order.returnResult
      order.customsStatus = order.businessType === 'BC' ? '待报关' : order.customsStatus
      trace(order, '恢复订单', '恢复取消标记；BC 按待报关重置申报状态，CC 出库限制与再次锁定保护待确认')
    }
    if (!eligible.length) throw new Error('没有可恢复的订单：已出库或未取消的订单不能恢复')
    return eligible.length
  }
  function dispatchStockOrders(ids) {
    assertSmall()
    const orders = state.portalSmallOrders.filter(row => ids.includes(row.id)).slice().sort((a, b) => String(a.orderTime).localeCompare(String(b.orderTime)))
    const remaining = new Map()
    const dispatched = [], shortage = [], skipped = []
    for (const order of orders) {
      if (!smallOrderEligibility(order).dispatch) { skipped.push(order.orderNo); continue }
      const problems = checkStockAvailability(order, state.portalStock, remaining)
      if (problems.length) { order.stockStatus = '缺货'; shortage.push({ orderNo: order.orderNo, problems }); continue }
      for (const good of order.goods) {
        const entry = state.portalStock.find(item => item.warehouse === order.warehouse && item.barcode === good.barcode)
        const key = `${order.warehouse}|${good.barcode}`
        const available = remaining.get(key) ?? entry.good
        remaining.set(key, available - Number(good.quantity))
        entry.good = available - Number(good.quantity)
        entry.reserved = entry.reserved || []
        entry.reserved.push({ tag: order.id, warehouse: order.warehouse, barcode: good.barcode, goodQty: Number(good.quantity), defectQty: 0 })
      }
      order.stockStatus = '已锁库'
      order.warehouseStatus = '待拣货'
      order.lockedAt = now()
      trace(order, '锁库并下发', '全部商品库存充足，锁定库存并下发 WMS 通知仓管员（本地模拟）')
      dispatched.push(order.orderNo)
    }
    if (!dispatched.length && !shortage.length) throw new Error('没有可下发的订单：仅备货、待下发且未取消的订单可下发')
    return { dispatched, shortage, skipped }
  }
  function cancelStockOrders(ids) {
    assertSmall()
    const orders = state.portalSmallOrders.filter(row => ids.includes(row.id))
    const eligible = orders.filter(order => order.mode === '备货' && smallOrderEligibility(order).release)
    if (!eligible.length) throw new Error('没有可取消的备货订单：已出库订单须由仓库实物重新入库')
    for (const order of eligible) {
      for (const entry of state.portalStock) {
        const kept = []
        for (const record of entry.reserved || []) {
          if (record.tag !== order.id) { kept.push(record); continue }
          entry.good += record.goodQty
          entry.defective += record.defectQty
        }
        entry.reserved = kept
      }
      order.warehouseStatus = '已取消'
      order.customerCancelled = true
      order.stockStatus = '已释放'
      trace(order, '取消并释放库存', '未出库：库存中心释放锁定数量')
    }
    return eligible.length
  }
  function importSmallOrders({ mode, rowsText, palletNo = '', warehouse = '' }) {
    assertSmall()
    if (!['集货', '备货'].includes(mode)) throw new Error('请选择导入入口')
    if (mode === '备货' && !text(warehouse)) throw new Error('备货导入须选择出库仓库')
    const { orders, problems } = parseImportRows(rowsText)
    const existing = new Set([...state.portalSmallOrders.map(order => order.orderNo), ...state.portalPoolOrders.map(order => order.orderNo)])
    for (const order of orders) if (existing.has(order.orderNo)) problems.push({ orderNo: order.orderNo, reason: '订单号与订单中心已有订单重复' })
    if (problems.length) return { ok: false, problems: problems.slice(0, 10), totalProblems: problems.length, failureCsv: buildPortalFailureCsv(problems) }
    const created = []
    for (const order of orders) {
      const id = `SO-IMP-${String(++state.portalSmallOrderSequence).padStart(3, '0')}`
      const record = {
        id, orderNo: order.orderNo, businessType: order.orderNo.startsWith('CC') ? 'CC' : 'BC', mode,
        platform: order.platform || '', shop: order.shop || '', company: '', buyer: '导入订购人（演示）', buyerPhone: '', buyerIdNo: '', orderTime: now(), expressNo: '', expressCompany: '圆通速递',
        palletNo: mode === '集货' ? text(palletNo) : '', warehouse: text(warehouse) || '南沙保税仓 WH002', warehouseStatus: mode === '集货' ? '待出库' : '待下发',
        customsStatus: '待报关', intercept: '无', conversion: '', totalAmount: order.goods.reduce((total, good) => total + good.quantity * good.unitPrice, 0), estimatedTax: 0, customsTax: '',
        inboundNo: '', outboundNo: '', waybillNo: '', stockStatus: mode === '备货' ? '待检查' : '', presaleType: mode === '备货' ? '现货' : '',
        customerCancelled: false, returnResult: '', requirementId: '', taskNo: '', deadline: '',
        logistics: { flightArrived: '未到达', pickedUp: '未提货', clearanceStarted: '未开始', clearanceDone: '未完成', expressHandover: '未交接' },
        goods: order.goods.map((good, index) => ({ id: `G-${index + 1}`, productId: good.productId || '', barcode: '', name: good.name, spec: '', hsCode: '', quantity: good.quantity, unit: '件', unitPrice: good.unitPrice })),
      }
      state.portalSmallOrders.push(record)
      const poolEligible = record.goods.some(good => !good.productId)
      if (poolEligible) {
        record.mode = ''
        state.portalSmallOrders = state.portalSmallOrders.filter(row => row.id !== record.id)
        state.portalPoolOrders.push(record)
        trace(record, '导入订单池', '缺少备案商品ID或查不到备案，进入订单池等待客户标记')
      } else {
        trace(record, '导入小订单', `按 ${mode} 入口导入`)
      }
      created.push(record)
    }
    return { ok: true, created, poolCount: created.filter(record => !record.mode).length }
  }
  // ---- 需求单 ----
  function savePortalRequirement(payload, id = '') {
    if (!permission().requirement) throw new Error('当前角色不能维护需求单')
    const existing = id ? findRequirement(id) : null
    const draft = clone(payload || {})
    draft.services = (draft.services || []).map(service => ({ ...service, fields: service.fields || {} }))
    if (!existing) {
      draft.id = draft.id || `REQ-${String(++state.portalRequirementSequence).padStart(5, '0')}`
      draft.orderNo = draft.orderNo || `PR${PORTAL_NOW.slice(2, 4)}${PORTAL_NOW.slice(5, 7)}${PORTAL_NOW.slice(8, 10)}${String(state.portalRequirementSequence).padStart(5, '0')}`
      draft.status = '未提交'
      draft.createdAt = now()
      draft.history = []
      state.portalRequirements.unshift(draft)
      trace(draft, '保存需求', '保存为待提交')
      return draft
    }
    if (existing.status !== '未提交') throw new Error('仅未提交需求可编辑')
    Object.assign(existing, draft, { id: existing.id, orderNo: existing.orderNo, status: existing.status, history: existing.history })
    trace(existing, '保存需求', '保存当前内容')
    return existing
  }
  function submitPortalRequirement(id) {
    if (!permission().requirement) throw new Error('当前角色不能提交需求单')
    const requirement = findRequirement(id)
    if (requirement.status !== '未提交' && requirement.status !== '已拒接') throw new Error('当前状态不能提交')
    requirement.status = '待接单'
    requirement.submittedAt = now()
    // 门户与综合订单的服务生成时点冲突见分析清单 GJ-WORD-CROSS-C01：
    // 原型沿用综合订单路径，提交只形成待接单需求，由客服接单补充后生成服务。
    const serial = ++state.integratedOrderSequence
    const orderNo = orderNoFor(requirement.businessType === 'BBC' ? 'BBC' : requirement.businessType, serial)
    const order = {
      id: orderNo, orderNo, businessType: requirement.businessType === 'BBC' ? 'BBC' : requirement.businessType,
      businessMode: requirement.mode, financeOrg: '广州航晟物流有限公司', department: '华东业务部', serviceClerk: '客户门户', salesperson: '客户门户',
      transfer: false, remark: requirement.remark || '', customerPartnerId: '', customer: requirement.customer || '门户客户（演示）',
      contactName: '客户门户联系人', contactPhone: '000-00000000', contactEmail: 'portal@example.invalid', customerRemark: '',
      transportMode: requirement.transportMode, originPort: requirement.originPort || '', destinationPort: requirement.destinationPort || '', waybillNo: '',
      status: '待接单', source: '客户门户需求', creator: '客户门户', createdAt: now(),
      attachments: clone(requirement.attachments || []),
      houses: [{ key: `HOUSE-${requirement.id}`, houseNo: '', cargo: clone(requirement.goods || []) }],
      services: [], history: [{ id: 'H1', event: '需求创建', content: `客户门户需求 ${requirement.orderNo} 进入待接单`, actor: '客户门户', time: now() }],
      portalRequirementId: requirement.id,
    }
    state.integratedOrders.unshift(order)
    requirement.integratedOrderId = order.id
    trace(requirement, '提交需求', `形成运营平台待接单记录 ${order.orderNo}；服务生成时点与客服接单后的首次/增量下发待确认`)
    return { requirement, order }
  }
  function cancelPortalRequirement(id) {
    if (!permission().requirement) throw new Error('当前角色不能取消需求单')
    const requirement = findRequirement(id)
    if (requirement.status === '已完成' || requirement.status === '已取消') throw new Error('当前状态不能取消')
    requirement.status = '已取消'
    if (requirement.integratedOrderId) {
      const order = state.integratedOrders.find(row => row.id === requirement.integratedOrderId)
      if (order && order.status === '待接单') { order.status = '已取消'; order.history.push({ id: `${order.id}-H${order.history.length + 1}`, event: '需求取消', content: '客户门户需求取消', actor: session().name, time: now() }) }
    }
    trace(requirement, '取消需求', 'BC、CC 同步运营平台；BBC 同步时点待确认')
    return requirement
  }
  function deletePortalRequirement(id) {
    if (!permission().requirement) throw new Error('当前角色不能删除需求单')
    const requirement = findRequirement(id)
    if (requirement.status !== '未提交') throw new Error('仅未提交需求可删除')
    state.portalRequirements.splice(state.portalRequirements.indexOf(requirement), 1)
    return true
  }
  // ---- 仓库报告 ----
  function confirmReceiptReport(reportId, batchId) {
    if (!permission().report) throw new Error('当前角色不能确认报告')
    const report = findReport(reportId)
    const batch = (report.batches || []).find(row => row.id === batchId)
    if (!batch) throw new Error('未找到收货批次')
    if (batch.result === '正常') throw new Error('正常收货由系统自动确认，不要求客户重复操作')
    batch.confirmResult = '已确认'
    batch.confirmedAt = now()
    report.status = (report.batches || []).every(row => row.confirmResult === '已确认') ? '已确认' : '部分确认'
    trace(report, '确认收货', `批次 ${batch.batchNo} 确认；异常已核实`)
    return report
  }
  function rejectReceiptReport(reportId, batchId) {
    if (!permission().report) throw new Error('当前角色不能驳回报告')
    const report = findReport(reportId)
    const batch = (report.batches || []).find(row => row.id === batchId)
    if (!batch) throw new Error('未找到收货批次')
    batch.confirmResult = '已驳回'
    batch.rejectedAt = now()
    report.status = '已驳回'
    trace(report, '驳回收货', `批次 ${batch.batchNo} 驳回并通知仓库；拒收与驳回的关系待确认`)
    return report
  }
  function confirmTallyReport(reportId, batchId) {
    if (!permission().report) throw new Error('当前角色不能确认报告')
    const report = findReport(reportId)
    const batch = (report.batches || []).find(row => row.id === batchId)
    if (!batch) throw new Error('未找到理货批次')
    const issues = tallyIssues(batch)
    if (issues.length) throw new Error('异常商品须先填写处理方式')
    batch.confirmStatus = '已确认'
    batch.confirmedAt = now()
    const allConfirmed = (report.batches || []).every(row => row.confirmStatus === '已确认')
    report.status = allConfirmed ? '已完成' : '部分确认'
    trace(report, '理货确认', `批次 ${batch.batchNo} 已确认${allConfirmed ? '；全部预报商品理货完成，结束本次理货' : '；保留其他批次的独立处理结果'}`)
    return report
  }
  function rejectTallyReport(reportId, batchId) {
    if (!permission().report) throw new Error('当前角色不能驳回报告')
    const report = findReport(reportId)
    const batch = (report.batches || []).find(row => row.id === batchId)
    if (!batch) throw new Error('未找到理货批次')
    const issues = tallyIssues(batch)
    if (issues.length) throw new Error('异常商品须先填写处理方式')
    batch.confirmStatus = '已驳回'
    batch.rejectedAt = now()
    report.status = '已驳回'
    trace(report, '理货驳回', `批次 ${batch.batchNo} 驳回并同步仓库重新处理`)
    return report
  }
  function setShortageHandling(reportId, batchId, detailId, handling, action) {
    if (!permission().report) throw new Error('当前角色不能处理短溢货')
    const report = findReport(reportId)
    const batch = (report.batches || []).find(row => row.id === batchId)
    const detail = (batch?.details || []).find(row => row.id === detailId)
    if (!detail || detail.abnormalType !== '短溢') throw new Error('仅短溢货需要填写处理方式')
    if (!text(handling)) throw new Error('请填写处理方式')
    detail.handling = text(handling)
    detail.shortageResult = action === 'confirm' ? '已确认' : '已驳回'
    trace(report, action === 'confirm' ? '短溢货确认' : '短溢货驳回', `批次 ${batch.batchNo}：${detail.productName} ${action === 'confirm' ? '承认差异，仓库按处理方式处理' : '仓库按处理意见重新理货'}`)
    return report
  }
  function convertDamagedDetail(reportId, batchId, detailId) {
    if (!permission().report) throw new Error('当前角色不能执行破损转正品')
    const report = findReport(reportId)
    const batch = (report.batches || []).find(row => row.id === batchId)
    const detail = (batch?.details || []).find(row => row.id === detailId)
    if (!detail || detail.abnormalType !== '包装破损' || !(Number(detail.defectQty) > 0)) throw new Error('仅包装破损且有不良品数量的商品可转正品')
    detail.goodQty = (Number(detail.goodQty) || 0) + Number(detail.defectQty)
    detail.defectQty = 0
    detail.handling = '包装破损转正品'
    detail.tallyStatus = '正常'
    trace(report, '包装破损转正品', `批次 ${batch.batchNo}：${detail.productName} 破损数量计入正品`)
    return report
  }
  return {
    markPoolOrders, cancelPoolOrders, restorePoolOrders,
    updatePalletNo, unbindRequirement, bindRequirement, convertToStock, convertToPickup, submitInbound,
    deleteSmallOrders, cancelSmallOrders, restoreSmallOrders, dispatchStockOrders, cancelStockOrders, importSmallOrders,
    savePortalRequirement, submitPortalRequirement, cancelPortalRequirement, deletePortalRequirement,
    confirmReceiptReport, rejectReceiptReport, confirmTallyReport, rejectTallyReport,
    setShortageHandling, convertDamagedDetail,
  }
}
