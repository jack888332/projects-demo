// PRD 016 BBC客户订单管理：三单申报、订单处置、列表与详情。
export const BBC_NOW = '2026-09-08 14:30'
export const BBC_TODAY = '2026-09-08'
export const BBC_ORDER_STATUSES = ['待报关', '已经提交处理中', '海关入库', '海关退单', '发送海关失败', '已取消', '已作废']
export const BBC_WAYBILL_STATUSES = ['待报关', '已经提交处理中', '海关入库', '海关退单', '发送海关失败']
export const BBC_MANIFEST_STATUSES = ['待报关', '已经提交处理中', '放行', '海关退单', '发送海关失败']
export const BBC_WAREHOUSE_STATUSES = ['待下发', '库存不足', '已下发', '已出库', '订单已取消']
export const BBC_RETURN_STATUSES = ['申请成功', '申请失败', '待报关', '退货中', '退货成功', '退货失败', '海关入库']
export const BBC_DECLARABLE_STATUSES = ['待报关', '发送海关失败', '海关退单']
export const BBC_EXPRESS_COMPANIES = ['圆通速递', '顺丰速运', '中通快递']
export const BBC_DOCUMENTS = [
  { key: 'order', label: '订单申报' },
  { key: 'waybill', label: '运单申报' },
  { key: 'manifest', label: '清单申报' },
  { key: 'returnApply', label: '退货申报' },
]
// 详情敏感字段查看口令为原型演示值，不是生产鉴权。
export const BBC_VIEW_PASSWORD = 'demo123'

const text = value => String(value ?? '').trim()

export function bbcGoodsTotal(order) {
  return (order?.goods || []).reduce((total, row) => total + (Number(row.unitPrice) || 0) * (Number(row.quantity) || 0), 0)
}

export function bbcEstimatedTax(order) {
  return (order?.goods || []).reduce((total, row) => total + (Number(row.estimatedVat) || 0) + (Number(row.estimatedConsumptionTax) || 0), 0)
}

export function bbcAmountSummary(order) {
  const goodsTotal = bbcGoodsTotal(order)
  const freight = Number(order?.freight) || 0
  const insurance = Number(order?.insurance) || 0
  const prepaidTax = Number(order?.prepaidTax) || 0
  const deduction = Number(order?.nonCashDeduction) || 0
  return {
    goodsTotal: goodsTotal.toFixed(2), freight: freight.toFixed(2), insurance: insurance.toFixed(2), prepaidTax: prepaidTax.toFixed(2),
    nonCashDeduction: deduction.toFixed(2), payable: (goodsTotal + freight + insurance + prepaidTax - deduction).toFixed(2),
    estimatedTax: bbcEstimatedTax(order).toFixed(2), customsTax: order?.customsTax === '' || order?.customsTax == null ? '' : Number(order.customsTax).toFixed(2),
  }
}

export function isBbcTab(order, tab) {
  if (tab === '已发货') return order.warehouseStatus === '已出库'
  if (tab === '未发货') return order.warehouseStatus !== '已出库'
  if (tab === '消退订单') return Boolean(order.cancelReturnResult)
  if (tab === '客退订单') return Boolean(order.consumerReturnResult)
  return true
}

export function filterBbcOrders(orders, filters = {}) {
  const many = value => String(value || '').split(/\n+/).map(row => row.trim()).filter(Boolean)
  const exact = (list, values) => !values.length || values.includes(list)
  const fuzzy = (value, query) => !text(query) || String(value || '').toLowerCase().includes(text(query).toLowerCase())
  const range = (value, bounds) => {
    if (!Array.isArray(bounds) || !bounds.some(Boolean)) return true
    const day = String(value || '').slice(0, 10)
    return Boolean(day) && (!bounds[0] || day >= bounds[0]) && (!bounds[1] || day <= bounds[1])
  }
  return orders.filter(order =>
    exact(order.outboundOrderNo, many(filters.outboundOrderNo)) && exact(order.orderNo, many(filters.orderNo)) &&
    exact(order.expressNo, many(filters.expressNo)) && exact(order.nuclearNoteNos, many(filters.nuclearNoteNo)) && exact(order.ledgerNo, many(filters.ledgerNo)) &&
    range(order.orderTime, filters.orderRange) &&
    (!filters.orderStatus || order.orderStatus === filters.orderStatus) && (!filters.waybillStatus || order.waybillStatus === filters.waybillStatus) &&
    (!filters.manifestStatus || order.manifestStatus === filters.manifestStatus) && (!filters.outboundStatus || order.outboundStatus === filters.outboundStatus) &&
    (!filters.expressCompany || order.expressCompany === filters.expressCompany) && (!filters.warehouseStatus || order.warehouseStatus === filters.warehouseStatus) &&
    fuzzy(order.platform, filters.platform) && fuzzy(order.shop, filters.shop))
}

export function bbcOrderEligibility(order) {
  const status = order?.orderStatus
  const cancelled = status === '已取消'
  return {
    cancel: !['已出库'].includes(order?.warehouseStatus) && !['已取消', '已作废'].includes(status),
    restore: cancelled,
    void: ['待报关', '已取消', '海关退单'].includes(status),
    modify: ['待报关', '已取消'].includes(status),
    express: order?.expressNo ? order.waybillStatus === '待报关' : !['已取消', '已作废'].includes(status),
    declare: !['已取消', '已作废'].includes(status),
  }
}

export function declarationAllowed(order) {
  return {
    order: BBC_DECLARABLE_STATUSES.includes(order.orderStatus),
    waybill: BBC_DECLARABLE_STATUSES.includes(order.waybillStatus),
    manifest: BBC_DECLARABLE_STATUSES.includes(order.manifestStatus),
  }
}

export function declarationStateFor(order) {
  const allowed = declarationAllowed(order)
  if (order.presaleType === '预售') return { ok: false, reason: '预售订单不自动申报', documents: allowed }
  if (['库存不足', '订单已取消'].includes(order.warehouseStatus)) return { ok: false, reason: order.warehouseStatus === '库存不足' ? 'WMS 库存不足，暂不申报' : '订单已取消', documents: allowed }
  if (!Object.values(allowed).some(Boolean)) return { ok: false, reason: '单据状态不允许自动申报', documents: allowed }
  return { ok: true, reason: '', documents: allowed }
}

export function bbcReturnDeadline(releaseDate, days = 30) {
  if (!releaseDate) return ''
  const date = new Date(`${releaseDate}T00:00:00Z`)
  if (!Number.isFinite(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function canApplyBbcReturn(order, today = BBC_TODAY) {
  if (!order?.customerCancelled) return { ok: false, message: '所选订单客户取消标识必须为是，不能发送退货申请' }
  if (!order.returnDeadline) return { ok: false, message: '该订单缺少清单放行日期，退货截止日期待确认' }
  if (order.returnDeadline < today) return { ok: false, message: `已超过清关放行起 30 天的退货申请期限（截止 ${order.returnDeadline}）` }
  return { ok: true, message: '' }
}

export function canArrangeBbcConsumerReturn(order) {
  return order?.customerCancelled ? { ok: true, message: '' } : { ok: false, message: '安排客退要求客户取消订单为是' }
}

export function canArrangeBbcCancelReturn(order) {
  return order?.returnStatus === '海关入库' ? { ok: true, message: '' } : { ok: false, message: '需完成退货申请申报（退货状态为海关入库）才能安排消退' }
}

// PRD 017 §4.1：每行退货数量为 0 到原始数量之间的整数；全部为 0 的订单不参与本次退货。
export function validateReturnQuantities(rows) {
  const errors = {}
  for (const [index, row] of (rows || []).entries()) {
    const value = row.quantity
    const original = Number(row.originalQuantity) || 0
    if (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > original) {
      errors[row.id || index] = `第 ${index + 1} 行数量须为 0 到 ${original} 之间的整数`
    }
  }
  return errors
}

export function selectedReturnRows(rows) {
  return (rows || []).filter(row => Number(row.quantity) > 0)
}

export function bbcOrderNoFor(sequence) {
  return `BBC${BBC_TODAY.slice(2).replaceAll('-', '')}${String(sequence).padStart(4, '0')}`
}
