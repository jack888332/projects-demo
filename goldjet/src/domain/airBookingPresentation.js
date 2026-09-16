import { AIR_PRODUCTS } from './airOperations.js'

// These bindings filter the list; they do not grant or restrict booking permissions.
export function getBookingAirlineFilter(products, master, session) {
  const names = rows => [...new Set(rows.map(row => {
    const flight = master.flights.find(item => item.id === row.flightId)
    return master.airlines.find(item => item.code === flight?.airlineCode)?.name
  }).filter(Boolean))]
  return {
    options: names(products),
    defaults: ['operator', 'handler'].includes(session.role) ? names(products.filter(row => row[session.role] === session.name)) : [],
  }
}

export function getOrderBookingAirline(order) {
  return order.booking?.airline || order.airline || AIR_PRODUCTS.find(row => row.id === order.product)?.airline || ''
}

export function getBookingSourceChildren(order, children) {
  if (order?.orderType !== '合成主订单') return []
  return children.filter(row => row.parentId === order.id && !row.deleted && row.orderStatus !== '已取消').map(row => {
    const names = String(row.goodsName || '').split(/[;；]/).map(value => value.trim()).filter(Boolean)
    return { ...row, shortGoodsName: names.slice(0, 3).join('；') + (names.length > 3 ? '…' : ''), fullGoodsName: names.join('；') }
  })
}
