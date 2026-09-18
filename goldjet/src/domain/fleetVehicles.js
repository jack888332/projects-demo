import { createDriverSampleAttachment, driverExpiryState, fleetTaskStatus, validateDriverAttachment } from './fleetOperations.js'
import { GROUND_DATE, GROUND_NOW } from './groundOperations.js'

export const VEHICLE_MODELS = ['1.5T', '4.2车', '6.8车', '7.6车', '3T', '5T', '8T', '10T', '12T', '20尺柜', '40尺柜', '40/45尺柜']
export const VEHICLE_TYPES = ['小型厢型货车', '轻型厢型货车', '中型厢型货车', '重型厢型货车']
export const VEHICLE_FILTER_TYPES = ['重型厢式货车', '中型厢式货车', '轻型厢式货车', '小型厢式货车']
export const VEHICLE_FIELDS = [
  { key: 'plate', label: '车牌号', required: true, max: 50 },
  { key: 'model', label: '车型', options: VEHICLE_MODELS, required: true },
  { key: 'dimensions', label: '外形尺寸（CM）', max: 18, placeholder: '长*宽*高' },
  { key: 'payload', label: '核载重量（KG）', required: true, numeric: true },
  { key: 'regulated', label: '监管类型', options: ['是', '否'], note: '未填写时的提交规则待确认' },
  { key: 'condition', label: '车况' },
  { key: 'registrationDate', label: '登记日期', type: 'date', required: true },
  { key: 'age', label: '车龄（年）', numeric: true },
  { key: 'mileage', label: '里程（万公里）', numeric: true, max: 20 },
  { key: 'inspectionDate', label: '预计年审时间', type: 'date', required: true },
  { key: 'vehicleType', label: '车辆类型', options: VEHICLE_TYPES, note: '未填写时的提交规则待确认；筛选候选名称映射待确认' },
  { key: 'insurer', label: '保险公司', section: 'insurance' },
  { key: 'insuranceType', label: '保险类型', section: 'insurance' },
  { key: 'coverage', label: '投保险种', max: 20, section: 'insurance' },
  { key: 'insuranceStart', label: '保险期始', type: 'date', section: 'insurance' },
  { key: 'insuranceEnd', label: '保险期止', type: 'date', section: 'insurance' },
]
export const canMaintainFleet = role => ['hangsheng', 'supervisor', 'admin'].includes(role)
export const fleetDateValid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value
const text = value => String(value ?? '').trim()

export function createVehicleDraft() {
  return { ...Object.fromEntries(VEHICLE_FIELDS.map(field => [field.key, ''])), driverIds: [], registrationImage: null, remark: '' }
}
export function createVehicleSeed() {
  return [
    { id: 'VEH-0001', plate: '沪A·DEMO1', model: '3T', vehicleType: '轻型厢型货车', payload: '3000', inspectionDate: '2026-10-05' },
    { id: 'VEH-0002', plate: '沪B·DEMO2', model: '8T', vehicleType: '重型厢型货车', payload: '8000', inspectionDate: '2027-03-01' },
  ].map(row => {
    const { driverIds, ...base } = createVehicleDraft()
    return { ...base, ...row, regulated: '否', registrationDate: '2023-05-12', age: '3', mileage: '8.50', condition: '正常',
      registrationImage: createDriverSampleAttachment('registrationImage'), insurer: '演示保险公司', insuranceType: '商业险', coverage: '车辆损失险',
      insuranceStart: '2026-01-01', insuranceEnd: '2026-12-31', remark: '合成车辆档案', updatedAt: GROUND_NOW, updatedBy: '陈楠' }
  })
}
export function vehicleDrivers(vehicle, state) {
  return vehicle ? state.fleetDrivers.filter(driver => driver.vehicle === vehicle.plate) : []
}
export function vehicleDraft(vehicle, state) {
  const draft = createVehicleDraft()
  for (const key of Object.keys(draft)) if (vehicle?.[key] !== undefined) draft[key] = JSON.parse(JSON.stringify(vehicle[key]))
  draft.driverIds = vehicleDrivers(vehicle, state).map(driver => driver.id)
  return draft
}
export function vehicleTasks(vehicle, state) {
  const bills = vehicle ? state.groundWaybills.filter(bill => bill.plate === vehicle.plate) : []
  return {
    running: bills.filter(bill => !['已卸货', '已取消', '已完成'].includes(fleetTaskStatus(bill))),
    history: bills.filter(bill => ['已卸货', '已完成'].includes(fleetTaskStatus(bill))),
  }
}
export function vehicleStatus(vehicle, state) { return vehicleTasks(vehicle, state).running.length ? '运输中' : '空闲中' }
export function vehicleHasHistory(vehicle, state) {
  return state.groundWaybills.some(bill => bill.plate === vehicle.plate) || ['fleetIncidents', 'fleetRepairs', 'fleetFuel'].some(key => (state[key] || []).some(row => row.vehicleId === vehicle.id))
}
export function validateVehicleDraft(draft, state, id = '') {
  const errors = {}, current = state.fleetVehicles.find(row => row.id === id)
  for (const field of VEHICLE_FIELDS) {
    const value = text(draft[field.key])
    if (field.required && !value) errors[field.key] = '请填写' + field.label
    if (field.max && value.length > field.max) errors[field.key] = `最多 ${field.max} 个字符`
    if (value && field.options && !field.options.includes(value)) errors[field.key] = '请选择有效候选项'
    if (value && field.type === 'date' && !fleetDateValid(value)) errors[field.key] = '请输入有效日期'
  }
  for (const key of ['regulated', 'vehicleType']) if (!text(draft[key])) errors[key] = '空值提交规则待确认，请先填写'
  for (const key of ['payload', 'age']) if (text(draft[key]) && !/^[1-9]\d*$/.test(text(draft[key]))) errors[key] = '请输入正整数'
  if (text(draft.mileage) && !/^\d+(\.\d{1,2})?$/.test(text(draft.mileage))) errors.mileage = '请输入最多两位小数的里程'
  if (text(draft.dimensions) && (!/^\d+(\.\d+)?\*\d+(\.\d+)?\*\d+(\.\d+)?$/.test(text(draft.dimensions)) || text(draft.dimensions).length < 15)) errors.dimensions = '格式为长*宽*高，长度15～18字符；长度口径待确认'
  if (draft.registrationImage) {
    const error = validateDriverAttachment(draft.registrationImage)
    if (error) errors.registrationImage = error
  }
  if (state.fleetVehicles.some(row => row.id !== id && row.plate === text(draft.plate))) errors.plate = '您提交的信息已存在，请重新检查！'
  if (current && text(draft.plate) !== current.plate && vehicleHasHistory(current, state)) errors.plate = '存在关联记录，车牌变更的历史处理规则待确认'
  if (!Array.isArray(draft.driverIds) || new Set(draft.driverIds).size !== draft.driverIds.length || draft.driverIds.some(driverId => !state.fleetDrivers.some(driver => driver.id === driverId && driver.status !== '已离职'))) errors.driverIds = '请选择未离职的司机，不可重复'
  if (draft.insuranceStart && draft.insuranceEnd && draft.insuranceStart > draft.insuranceEnd) errors.insuranceEnd = '保险期倒置的处理规则待确认'
  return errors
}
export function filterVehicles(state, filters = {}) {
  const keyword = text(filters.keyword)
  return state.fleetVehicles.filter(vehicle => !keyword || vehicle.plate.includes(keyword) || vehicleDrivers(vehicle, state).some(driver => driver.name.includes(keyword)))
    .filter(vehicle => ['model', 'regulated'].every(key => !filters[key] || vehicle[key] === filters[key]))
    .filter(vehicle => !filters.registrationDate || vehicle.registrationDate.startsWith(filters.registrationDate))
    .filter(vehicle => !filters.inspectionDate || vehicle.inspectionDate.startsWith(filters.inspectionDate))
    .slice().sort((a, b) => a.plate.localeCompare(b.plate, 'zh-Hans-u-co-pinyin'))
}
export function vehicleExpiryLabel(date) {
  const status = driverExpiryState(date, GROUND_DATE)
  return `${date || '未填写'}${status ? status === 'expired' ? ' · 已到期' : ' · 即将到期' : ''}`
}
