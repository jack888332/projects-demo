import { groundWaybillTerminal } from './groundOperations.js'
import { groundImagesError, groundRemarkError, GROUND_DOCUMENT_TYPES } from './groundWaybills.js'

export const DRIVER_EXCEPTION_TYPES = ['货物破损', '车辆事故', '预计延误', '无法联系', '其他']
export const DRIVER_NODES = [
  { from: '待提货', to: '提货中', label: '前往提货', event: '前往提货' },
  { from: '提货中', to: '到达提货点', label: '我已到达提货点', event: '到达提货点' },
  { from: '到达提货点', to: '已提货', label: '我已提货完毕', event: '提货完毕', document: '提货单据' },
  { from: '已提货', to: '到达卸货点', label: '我已到达卸货点', event: '到达卸货点' },
  { from: '到达卸货点', to: '已卸货', label: '我已卸货完毕', event: '卸货完毕', document: '卸货单据' },
]
export const driverNextNode = bill => DRIVER_NODES.find(node => node.from === driverStatus(bill))
export const driverTime = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
const timestamp = text => Date.parse(String(text).replace(' ', 'T') + (String(text).length === 16 ? ':00Z' : 'Z'))
export function driverWindow(bill, kind, now) {
  if (!groundWaybillTerminal(bill)) return { allowed: true, reason: '' }
  if (kind === 'exception' && driverStatus(bill) === '已取消') return { allowed: false, reason: '已取消运单异常上报资格待确认（154）' }
  const terminal = timestamp(driverTerminalTime(bill)), age = now - terminal
  if (!Number.isFinite(age) || age < 0) return { allowed: false, reason: '终态时间不完整，暂不能确认补报期限' }
  if (kind === 'exception') return { allowed: age <= 86400000, reason: age <= 86400000 ? '' : '卸货超过1天的异常上报资格待确认（154）' }
  if (age <= 3 * 86400000) return { allowed: true, reason: '' }
  if (bill.customer !== '高捷空运事业部' && age <= 7 * 86400000) return { allowed: false, reason: '第4～7天补传期限待确认（153）' }
  return { allowed: false, reason: '已超过单据补传期限' }
}
export function driverDocumentErrors(draft, validateRemark = true) {
  const errors = {}
  if (!GROUND_DOCUMENT_TYPES.includes(draft.type)) errors.type = '请选择单据类型'
  if (draft.type === '杂费单据') {
    if (!draft.feeItem) errors.feeItem = '请选择杂费类型'
    if (!/^\d+(?:\.\d{1,2})?$/.test(String(draft.amount || '')) || Number(draft.amount) <= 0) errors.amount = '杂费金额须为正数，最多2位小数'
    errors.pending = '杂费提交与入账时点待确认（140）'
  }
  const imageError = groundImagesError(draft.images, 15), remarkError = groundRemarkError(draft.remark)
  if (imageError) errors.images = imageError
  else if (['提货单据', '卸货单据'].includes(draft.type) && !draft.images.length) errors.images = '至少上传1张单据图片'
  if (validateRemark && remarkError) errors.remark = remarkError
  if (!['', '有', '无'].includes(draft.cargoDocuments || '')) errors.cargoDocuments = '随货资料仅可选有或无'
  return errors
}
export function driverEvent(row, bill) {
  if (row.event === '调度完成') return { event: '派发任务', status: '正常', actor: '航晟物流发布' }
  if (row.event === '修改调度') return { event: '派发任务', status: '修改', actor: '航晟物流发布' }
  if (row.event === '上报异常') return { event: row.event, status: '异常', actor: row.role === '司机' ? '司机上报' : '航晟物流上报' }
  if (['取消异常', '关闭异常'].includes(row.event)) return { event: '关闭异常', status: '正常', actor: '航晟物流关闭' }
  const expected = row.status === '到达提货点' ? bill.pickupTime : row.status === '到达卸货点' ? bill.deliveryTime : ''
  return { event: row.event, status: expected && timestamp(row.time) > timestamp(expected) ? '延误' : '正常', actor: row.role === '司机' ? '司机确认' : row.role === 'WMS' ? 'WMS' : '航晟物流确认' }
}
export function driverExceptions(bill, phone, readAll = false) {
  return (bill.exceptions || []).filter(row => readAll || row.actorPhone === phone).slice().sort((a,b) => Number(b.status === '异常中') - Number(a.status === '异常中') || a.reportedAt.localeCompare(b.reportedAt))
}
export function driverTrajectory(bill, phone, readAll = false) {
  return (bill.trajectory || []).filter(row => {
    if (readAll || !['上报异常','取消异常','关闭异常'].includes(row.event)) return true
    if (row.actorPhone === phone) return true
    return Boolean(row.exceptionId && driverExceptions(bill, phone).some(item => item.id === row.exceptionId))
  })
}

export const DRIVER_DEMO = Object.freeze({ phone: '00000001801', code: '180018', challenge: 'GJ18', location: '上海市浦东新区演示物流园（模拟定位）', travelMinutes: 25 })
export const driverStatus = bill => bill.status === '异常中' ? bill.fulfillmentStatus : bill.status
export const driverOwns = (bill, phone) => Boolean(phone) && (bill.drivers || []).some(driver => driver.phone === phone)
export const driverIdentifier = bill => bill.orderNo ? { label: '订单号', value: bill.orderNo } : bill.childNo ? { label: '子单号', value: bill.childNo } : { label: '批次号', value: bill.batchNo || '' }
export const driverTerminalTime = bill => bill.trajectory?.filter(row => row.status === driverStatus(bill) && ['已卸货', '卸货完毕', '已取消', '取消调度'].includes(row.event)).at(-1)?.time || ''
export function driverTasks(bills, phone, history = false, status = '全部', readAll = false) {
  return bills.filter(bill => (readAll || driverOwns(bill, phone)) && groundWaybillTerminal(bill) === history && (status === '全部' || driverStatus(bill) === status))
    .sort((a, b) => history ? driverTerminalTime(b).localeCompare(driverTerminalTime(a)) : (a.pickupTime || '\uffff').localeCompare(b.pickupTime || '\uffff'))
}
export function driverCargo(bill) {
  const present = value => value !== null && value !== undefined && value !== ''
  return [
    ...[['Weight', '重量（kg）'], ['Pieces', '件数（件）'], ['Volume', '体积（m³）']].map(([key, label]) => ({ label: `${present(bill[`specific${key}`]) ? '特定' : '平摊'}提货${label}`, value: bill[`expected${key}`] ?? '' })),
    { label: ['Length', 'Width', 'Height'].some(key => present(bill[`specific${key}`])) ? '特定提货尺寸' : '平摊特定提货尺寸', value: ['Length', 'Width', 'Height'].every(key => present(bill[`expected${key}`])) ? `${bill.expectedLength} × ${bill.expectedWidth} × ${bill.expectedHeight} cm` : '' },
  ]
}
export function driverExpected(bill) {
  const delivery = ['已提货', '到达卸货点'].includes(driverStatus(bill)) && bill.deliveryTime
  return { label: delivery ? '期望送达时间' : '期望提货时间', value: delivery ? bill.deliveryTime : bill.pickupTime }
}
export function driverAccount(bills, phone) {
  const owned = bills.filter(bill => driverOwns(bill, phone))
  const names = [...new Set(owned.map(bill => bill.drivers.find(driver => driver.phone === phone)?.name || ''))]
  const companies = [...new Set(owned.map(bill => bill.supplier || ''))]
  // When every candidate agrees, the undefined "latest" tie-breaker cannot change the answer.
  return { name: names.length === 1 ? names[0] : '', company: companies.length === 1 ? companies[0] : '', pending: names.length > 1 || companies.length > 1 }
}
export function driverLoginError(bills, phone) {
  if (!/^\d{11}$/.test(phone)) return '请输入11位数字手机号'
  if (!bills.some(bill => driverOwns(bill, phone))) return '该手机号尚未录入调度司机联系方式，请联系航晟客服'
  return ''
}
