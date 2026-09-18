import { groundImagesError, groundRemarkError } from './groundWaybills.js'

export const GROUND_SERVICE_OPERATIONS = [
  { id: 'document', label: '单证上传', number: '入仓号', target: '仓库', imagesRequired: true },
  { id: 'returnIn', label: '退件入库', number: '提单号', target: '仓库', batch: true, prerequisite: 'return' },
  { id: 'returnOut', label: '退件出库', number: '提单号', target: '仓库', batch: true, prerequisite: 'returnIn' },
  { id: 'outbound', label: '出库扫描', number: '托盘号', target: '仓库', imagesRequired: true },
  { id: 'arrival', label: '货站到达', number: '封条号 / 外部订单号', target: '空运' },
  { id: 'bookingDocument', label: '托书上传', number: '提单号', target: '空运', imagesRequired: true },
  { id: 'return', label: '电商退货', number: '提单号', target: '仓库', batch: true },
  { id: 'generalReturn', label: '普货退货', number: '主单号 / 分单号', target: '仓库' },
  { id: 'driverHandin', label: '司机交单', number: '提单号', target: '空运' },
]
export const GROUND_SERVICE_ACCOUNTS = [
  { persona: 'groundWarehouse', id: 'DEMO-GROUND-WH', name: '地面仓库演示员', phone: '00000001901', operations: ['document', 'returnIn', 'returnOut', 'outbound'] },
  { persona: 'groundStation', id: 'DEMO-GROUND-ST', name: '地面货站演示员', phone: '00000001902', operations: ['arrival', 'bookingDocument', 'return', 'generalReturn'] },
  { persona: 'driver', id: 'DEMO-GROUND-DRIVER', name: '演示司机十八', phone: '00000001801', operations: ['driverHandin'] },
]
export const groundOperation = id => GROUND_SERVICE_OPERATIONS.find(item => item.id === id)
export const groundAccount = persona => GROUND_SERVICE_ACCOUNTS.find(item => item.persona === persona)
export const groundServiceDraft = () => ({ number: '', images: [], remark: '', packages: [''], collectorName: '', collectorPhone: '', collectorPlate: '' })
export const groundRecord = (state, operation, number) => state.groundServiceRecords.find(row => row.operation === operation && row.number === number)
export const groundPackageDone = (state, operation, number, code) => state.groundServiceRecords.some(row => row.operation === operation && row.number === number && row.packages?.includes(code))

// Only explicit WMS/pickup fixtures establish external identifiers; never infer them from similar order numbers.
export function groundServiceMatches(state, operation, number) {
  const registry = state.groundServiceRegistry
  if (!number || !registry) return []
  if (operation === 'document') return registry.inbounds.filter(row => row.number === number)
  if (operation === 'outbound') return registry.pallets.filter(row => row.number === number)
  if (operation === 'arrival') return registry.arrivals.filter(row => row.number === number)
  if (['return', 'returnIn', 'returnOut', 'driverHandin', 'bookingDocument'].includes(operation)) {
    const explicit = registry.consignments.filter(row => row.number === number)
    if (explicit.length || operation !== 'bookingDocument') return explicit
    return state.airOrders.filter(row => !row.deleted && row.waybillNo === number && row.orderStatus !== '已作废').map(row => ({ number, orderId: row.id }))
  }
  if (operation === 'generalReturn') return [
    ...state.airOrders.filter(row => !row.deleted && row.orderStatus !== '已作废' && row.orderNo === number).map(row => ({ number, orderId: row.id })),
    ...state.airChildren.filter(row => !row.deleted && row.status !== '已作废' && row.childNo === number).map(row => ({ number, orderId: row.id })),
  ]
  return []
}

export function groundServiceErrors(state, operation, draft, existingId = '') {
  const errors = {}, config = groundOperation(operation)
  if (!config) return { operation: '操作类型无效' }
  const number = String(draft.number || '').trim(), matches = groundServiceMatches(state, operation, number)
  if (!number) errors.number = `请填写${config.number}`
  else if (config.batch && !/^\d{3}-\d{8}$/.test(number)) errors.number = '提单号须为11位数字，格式为123-12345678'
  else if (!matches.length) errors.number = '您所提交的单号无法匹配，请重新提交！'
  else if (matches.length > 1) errors.number = '单号匹配多个业务对象，归属待确认，暂不能提交'
  const matched = matches.length === 1 ? matches[0] : null
  if (matched && ['return', 'driverHandin'].includes(operation) && !matched.pickupNo) errors.number = '提单号与有效提货号的映射待确认（159）'
  if (operation === 'arrival' && matched?.kind === 'internal' && !matched.wmsOutbound) errors.number = '封条号尚未完成WMS出库，不能确认货站到达'
  if (operation === 'arrival' && matched && !['internal', 'external'].includes(matched.kind)) errors.number = '内部 / 外部订单来源待确认（160）'
  const imageError = groundImagesError(draft.images, 15), remarkError = groundRemarkError(draft.remark)
  if (imageError) errors.images = imageError
  else if (config.imagesRequired && !draft.images?.length) errors.images = '至少上传1张单据照片'
  if (remarkError) errors.remark = remarkError
  if (config.batch) {
    const packages = Array.isArray(draft.packages) ? draft.packages.map(value => String(value).trim()) : []
    if (!packages.some(Boolean)) errors.packages = '请至少录入一条有效包裹码'
    else if (matched) {
      const invalid = packages.flatMap((code, index) => code && (!matched.packages?.includes(code) || (config.prerequisite && !groundPackageDone(state, config.prerequisite, number, code))) ? [index] : [])
      if (invalid.length) { errors.packages = '您所提交的部分包裹码无效，请重新检查！'; errors.invalidRows = invalid }
    }
    if (existingId) errors.record = '电商退货、退件入库和退件出库不支持修改'
  }
  if (operation === 'returnOut') {
    if (draft.collectorName && (draft.collectorName.length < 2 || draft.collectorName.length > 40)) errors.collectorName = '提货人姓名须为2～40个字符'
    if (draft.collectorPhone && !/^[1-9]\d{6,19}$/.test(draft.collectorPhone)) errors.collectorPhone = '联系方式须为7～20位正整数'
    if (draft.collectorPlate && (draft.collectorPlate.length < 6 || draft.collectorPlate.length > 30)) errors.collectorPlate = '提货人车牌号须为6～30个字符'
  }
  const existing = state.groundServiceRecords.find(row => row.id === existingId)
  if (existingId && (!existing || existing.operation !== operation)) errors.record = '原操作记录不存在，请返回重新查询'
  const duplicate = !config.batch && groundRecord(state, operation, number)
  if (duplicate && duplicate.id !== existingId) errors.record = '该单号已存在记录，请返回查看并修改；不能覆盖另一条记录'
  if (existing && existing.number !== number && operation === 'arrival') errors.record = '已上报货站到达的改单及通知撤回规则待确认（161）'
  return errors
}

export function groundArrivalSummary(state, orderId) {
  const seals = state.groundServiceRegistry.arrivals.filter(row => row.kind === 'internal' && row.orderId === orderId)
  return { total: seals.length, arrived: seals.filter(row => groundRecord(state, 'arrival', row.number)).length }
}
