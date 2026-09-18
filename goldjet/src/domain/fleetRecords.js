import { AIR_PICKUP_REGIONS } from './airOperations.js'
import { fleetDateValid, canMaintainFleet } from './fleetVehicles.js'
import { GROUND_NOW } from './groundOperations.js'

export const FLEET_RECORD_KINDS = {
  incidents: { label: '违章事故', stateKey: 'fleetIncidents', dateLabel: '事故违章日期', issue: 'GJ-PRD-151', blocker: '事故日期的格式与15～18字符长度冲突，提交待确认（151）' },
  repairs: { label: '维修记录', stateKey: 'fleetRepairs', dateLabel: '维修日期', issue: 'GJ-PRD-148', blocker: '已有车牌重复校验与车辆候选冲突，提交待确认（148）' },
  fuel: { label: '油耗记录', stateKey: 'fleetFuel', dateLabel: '加油日期', issue: 'GJ-PRD-148、150', blocker: '车牌重复校验及油耗计算规则待确认，暂不能提交（148、150）' },
}
export const REPAIR_UNITS = ['个', '台', '张', '部', '对', '辆', '只', '条', '件', '把', '其他']
export const FLEET_RECORD_FIELDS = {
  incidents: [
    { key: 'type', label: '类型', options: ['违章', '事故'], required: true },
    { key: 'cause', label: '发生原因', multiline: true },
    { key: 'responsibility', label: '责任认定', multiline: true },
    { key: 'insuranceClaim', label: '保险理赔（元）', decimal: true },
    { key: 'penalty', label: '处罚金额（元）', decimal: true },
  ],
  repairs: [{ key: 'shop', label: '维修厂', options: ['风驰'], required: true }],
  fuel: [
    { key: 'cardNo', label: '油卡号', required: true, max: 19 },
    { key: 'odometer', label: '当前行驶总里程（KM）', required: true, decimal: true },
    { key: 'liters', label: '加油油量（L）', required: true, decimal: true },
    { key: 'distance', label: '加油里程（KM）', readonly: true },
    { key: 'consumption', label: '百公里油耗（L）', readonly: true },
    { key: 'price', label: '油价（元/L）', decimal: true, note: '与支付金额的输入优先级待确认，当前不自动互算' },
    { key: 'topup', label: '充值金额（元）', decimal: true },
    { key: 'paid', label: '支付金额（元）', decimal: true },
    { key: 'balance', label: '油卡结存（元）', readonly: true },
    { key: 'handler', label: '经手人' },
  ],
}
export const FLEET_RECORD_COLUMNS = {
  incidents: [['plate', '车牌号', 145], ['date', '违章事故日期', 145], ['type', '类型', 85], ['location', '发生地点', 230], ['driver', '司机', 135], ['cause', '发生原因', 200], ['responsibility', '责任认定', 180], ['insuranceClaim', '保险理赔（元）', 140], ['penalty', '处罚金额（元）', 140], ['remark', '备注', 200]],
  repairs: [['plate', '车牌号', 145], ['shop', '维修厂', 120], ['date', '维修日期', 135], ['items', '维修项目及价格清单', 320], ['total', '维修总价（元）', 140], ['remark', '备注', 220]],
  fuel: [['plate', '车牌号', 145], ['cardNo', '油卡卡号', 205], ['date', '日期', 135], ['distance', '加油里程（KM）', 145], ['liters', '油量（L）', 110], ['travelDistance', '行驶里程（KM）', 145], ['consumption', '百公里油耗（L）', 155], ['paid', '支付金额（元）', 140], ['balance', '油卡结存（元）', 140], ['price', '油价（元/L）', 130], ['handler', '经手人', 130], ['remark', '备注', 200]],
}
export const canViewFleetRecords = (role, kind) => kind === 'incidents' ? canMaintainFleet(role) : role === 'supervisor'
export const newRepairItem = () => ({ subject: '', quantity: '', unit: '', price: '' })
export function createFleetRecordDraft(kind) {
  return { vehicleId: '', date: '', ...Object.fromEntries(FLEET_RECORD_FIELDS[kind].map(field => [field.key, ''])),
    ...(kind === 'incidents' ? { driverId: '', region: [], address: '' } : {}),
    ...(kind === 'repairs' ? { items: [newRepairItem()] } : {}), remark: '' }
}
export function fleetRecordDraft(kind, record) {
  const draft = createFleetRecordDraft(kind)
  for (const key of Object.keys(draft)) if (record?.[key] !== undefined) draft[key] = JSON.parse(JSON.stringify(record[key]))
  return draft
}
export function createFleetRecordSeeds() {
  const common = { vehicleId: 'VEH-0001', updatedBy: '陈楠', updatedAt: GROUND_NOW, remark: '合成既有台账，非本轮提交结果' }
  return {
    fleetIncidents: [{ ...createFleetRecordDraft('incidents'), ...common, id: 'INC-0001', date: '2026-09-02', type: '违章', driverId: 'DRV-0001', region: ['上海市', '上海市', '浦东新区'], address: '演示路18号', cause: '合成违停记录', responsibility: '演示责任说明', insuranceClaim: '0.00', penalty: '100.00' }],
    fleetRepairs: [{ ...createFleetRecordDraft('repairs'), ...common, id: 'REP-0001', date: '2026-09-03', shop: '风驰', items: [{ subject: '演示轮胎', quantity: '2.00', unit: '条', price: '350.00' }] }],
    fleetFuel: [{ ...createFleetRecordDraft('fuel'), ...common, id: 'FUEL-0001', date: '2026-09-04', cardNo: '0000000000000000017', odometer: '85000.00', liters: '80.00', paid: '600.00', topup: '1000.00', price: '7.50', handler: '演示经手人' }],
  }
}
const text = value => String(value ?? '').trim()
const decimal = value => /^\d+(\.\d{1,2})?$/.test(text(value))
const cents = value => { const [whole, part = ''] = text(value).split('.'); return BigInt(whole) * 100n + BigInt(part.padEnd(2, '0')) }
const money = value => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
export function repairAmounts(items = []) {
  const amounts = items.map(item => {
    if (!decimal(item.quantity) || !decimal(item.price)) return null
    const product = cents(item.quantity) * cents(item.price)
    return product % 100n ? null : money(product / 100n)
  })
  return { amounts, total: !amounts.length || amounts.some(value => value === null) ? null : money(amounts.reduce((sum, value) => sum + cents(value), 0n)) }
}
export function validateFleetRecord(kind, draft, state) {
  const errors = {}
  if (!state.fleetVehicles.some(vehicle => vehicle.id === draft.vehicleId)) errors.vehicleId = '请选择车辆档案中的车牌号'
  if (!fleetDateValid(draft.date)) errors.date = '请选择有效日期'
  for (const field of FLEET_RECORD_FIELDS[kind]) {
    const value = text(draft[field.key])
    if (field.required && !value) errors[field.key] = '请填写' + field.label
    if (field.options && value && !field.options.includes(value)) errors[field.key] = '请选择有效候选项'
    if (field.decimal && value && !decimal(value)) errors[field.key] = '请输入最多两位小数；负值处理待确认'
  }
  if (kind === 'incidents') {
    if (!state.fleetDrivers.some(driver => driver.id === draft.driverId && driver.status !== '已离职')) errors.driverId = '请选择未离职的司机'
    let candidates = AIR_PICKUP_REGIONS
    if (!Array.isArray(draft.region) || draft.region.length !== 3) errors.region = '请选择省、市、区'
    else for (const part of draft.region) { const region = candidates.find(row => row.value === part); if (!region) { errors.region = '请选择有效的省、市、区'; break } candidates = region.children || [] }
    if (!text(draft.address)) errors.address = '请填写详细发生地点'
  }
  if (kind === 'repairs') {
    if (!Array.isArray(draft.items) || !draft.items.length) errors.items = '请添加维修科目'
    else for (const [index, item] of draft.items.entries()) {
      if (!text(item.subject) || !REPAIR_UNITS.includes(item.unit) || !decimal(item.quantity) || !decimal(item.price)) errors.items = `第${index + 1}行需填写科目、数量、单位和单价，数值最多两位小数`
    }
  }
  if (kind === 'fuel' && !/^\d{19}$/.test(text(draft.cardNo))) errors.cardNo = '油卡号须为19位数字'
  return errors
}
export function fleetRecordRows(kind, state, filters = {}) {
  return state[FLEET_RECORD_KINDS[kind].stateKey]
    .filter(row => ['vehicleId', 'date', 'driverId', 'type'].every(key => !filters[key] || row[key] === filters[key]))
    .filter(row => !filters.updatedDate || row.updatedAt?.startsWith(filters.updatedDate))
    .filter(row => !text(filters.keyword) || [row.cardNo, row.handler].some(value => text(value).includes(text(filters.keyword))))
    .slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}
export function fleetRecordCell(kind, record, key, state) {
  if (key === 'plate') return state.fleetVehicles.find(vehicle => vehicle.id === record.vehicleId)?.plate || '关联车辆不存在'
  if (key === 'driver') return state.fleetDrivers.find(driver => driver.id === record.driverId)?.name || '关联司机不存在'
  if (key === 'location') return [...(record.region || []), record.address].filter(Boolean).join(' / ')
  if (key === 'total') return repairAmounts(record.items).total ?? '舍入口径待确认'
  if (kind === 'fuel' && ['distance', 'travelDistance', 'consumption', 'balance'].includes(key)) return '口径待确认'
  return record[key] === '' || record[key] == null ? '未填写' : record[key]
}
