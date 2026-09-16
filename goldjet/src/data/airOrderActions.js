import { AIR_PRICE_FIELDS, createAirPriceDraft, validateAirPrices } from '../domain/airOperations.js'
import { GROUND_NOW } from '../domain/groundOperations.js'

export function getAirPriceRestriction(order, session = {}) {
  if (!order) return '订单不存在'
  if (!['service', 'supervisor'].includes(session.role)) return '仅空运客服或客服主管可修改客户报价'
  if (session.role === 'service' && order.creator !== session.name) return '仅可修改本人创建的订单'
  if (!['待订舱', '待补录', '待出提单'].includes(order.orderStatus)) return '当前演示仅开放待订舱、待补录和待出提单的报价修改'
  if (order.orderType === '合成主订单') return '合成主订单报价取自子订单，主单直接改价的回写规则待确认'
  return ''
}

export function appendAirNotification(state, order, type, recipient, content, related) {
  if (!recipient) return
  state.messages.push({ id: `MSG-AIR-${state.messages.length + 1}`, type, recipient, recipientRole: '',
    createdAt: GROUND_NOW, channel: '企业微信（本地模拟）', status: '本地模拟', content,
    related: related || { path: '/fulfillment/air-orders', query: { order: order.id } },
  })
}

export function createAirOrderActions(state, getSession) {
  function saveAirOrderPrices(id, payload) {
    const order = state.airOrders.find(row => row.id === id)
    const restriction = getAirPriceRestriction(order, getSession())
    if (restriction) throw new Error(restriction)
    const errors = validateAirPrices(payload)
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    const previous = createAirPriceDraft(order), next = createAirPriceDraft(payload)
    if (AIR_PRICE_FIELDS.every(key => previous[key] === next[key])) return order
    const assignees = order.assignees || {}
    if (!assignees.operator || !assignees.handler) throw new Error('航线运营与操作接收人未确定，暂不能保存并发送报价修改通知')
    const display = value => value === undefined ? '未填写' : value
    const labels = { sellRate: '运费卖价', truckSellRate: '后段卡车卖价', foamRatio: '分泡' }
    const content = `订单号：${order.orderNo}，${AIR_PRICE_FIELDS.map(key => `${labels[key]}：${display(previous[key])} → ${display(next[key])}`).join('；')}。`
    Object.assign(order, next, { updatedAt: GROUND_NOW })
    order.events ||= []
    order.events.push({ at: GROUND_NOW, actor: getSession().name, text: content })
    for (const recipient of new Set([assignees.operator, assignees.handler])) appendAirNotification(state, order, '订单报价修改', recipient, content)
    return order
  }
  return { saveAirOrderPrices }
}
