import { validateDriverAttachment } from './fleetOperations.js'

export const GROUND_EXCEPTION_TYPES = ['货物破损', '车辆事故', '预计延误', '无法联系', '其它']
export const GROUND_DOCUMENT_TYPES = ['提货单据', '卸货单据', '杂费单据', '其他单据']
export function groundDocumentErrors(draft) {
  const errors = {}
  if (!GROUND_DOCUMENT_TYPES.includes(draft?.type)) errors.type = '请选择单据类型'
  if (draft?.type === '杂费单据') {
    if (!draft.feeItem) errors.feeItem = '请选择航晟车队成本科目'
    if (!/^\d+(?:\.\d{1,2})?$/.test(String(draft.amount || '')) || Number(draft.amount) <= 0) errors.amount = '杂费金额须为正数，最多2位小数'
    errors.pending = '杂费免审状态与入账时点待确认（140），暂不提交'
  }
  const remark = groundRemarkError(draft?.remark), images = groundImagesError(draft?.images)
  if (remark) errors.remark = remark
  if (images) errors.images = images
  return errors
}
export function groundRemarkError(value) {
  const length = [...String(value || '').trim()].length
  return length && (length < 2 || length > 500) ? '备注须为2～500个字符或留空' : ''
}
export function groundImagesError(images) {
  if (!Array.isArray(images) || images.length > 9) return '最多上传9张图片'
  for (const image of images) {
    const error = validateDriverAttachment(image)
    if (error) return error
  }
  if (new Set(images.map(image => image.dataUrl)).size !== images.length) return '重复图片的处理待确认，请移除相同内容的图片'
  return ''
}
export function groundExceptionErrors(draft) {
  const errors = {}
  if (!GROUND_EXCEPTION_TYPES.includes(draft?.type)) errors.type = '请选择异常类型'
  const remark = groundRemarkError(draft?.remark), images = groundImagesError(draft?.images)
  if (remark) errors.remark = remark
  if (images) errors.images = images
  return errors
}
export function groundExceptionCloseReason(bill, exception) {
  if (!bill || !exception || exception.status !== '异常中') return '异常已关闭或不存在'
  if (bill.status === '已取消') return '已取消运单的异常恢复规则待确认（034）'
  if ((bill.exceptions || []).filter(row => row.status === '异常中').length !== 1 || exception.multipleOpen) return '多条异常的恢复规则待确认（034）'
  if (bill.trajectory.length !== exception.trajectoryLength) return '异常上报后已有新节点，恢复规则待确认（034）'
  return ''
}
