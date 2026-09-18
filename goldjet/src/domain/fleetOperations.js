import { GROUND_DATE } from './groundOperations.js'

// GJ-017: synthetic driver records share the prototype's ground-transport clock.
export const DRIVER_STATUSES = ['正常', '休假', '已离职']
export const DRIVER_LICENSE_CLASSES = ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4', 'C5', 'D', 'E', 'F', 'M', 'N', 'P']
export const DRIVER_EMPLOYMENT_TYPES = ['货物运输', '客车运输', '危险品运输']
export const DRIVER_EMPLOYMENT_FILTERS = [...DRIVER_EMPLOYMENT_TYPES, '其他']
export const DRIVER_ATTACHMENT_FIELDS = [
  { key: 'idCardFront', label: '身份证正面', required: true },
  { key: 'idCardBack', label: '身份证反面', required: true },
  { key: 'licenseImage', label: '驾驶证', required: true },
  { key: 'qualificationImage', label: '资质证', required: false },
]
export const DRIVER_ATTACHMENT_LIMIT = 6 * 1024 * 1024
export const FLEET_CERTIFICATE_SAMPLE = 'data:image/png;base64,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'

const clone = value => JSON.parse(JSON.stringify(value))
const text = value => String(value ?? '').trim()

export function createDriverSampleAttachment(field = 'licenseImage') {
  const label = DRIVER_ATTACHMENT_FIELDS.find(item => item.key === field)?.label || '证件'
  return { id: 'DEMO-' + field, name: '合成演示-' + label + '.png', type: 'image/png', size: atob(FLEET_CERTIFICATE_SAMPLE.split(',')[1]).length, dataUrl: FLEET_CERTIFICATE_SAMPLE }
}

export function createDriverDraft() {
  return {
    name: '', gender: '', identityNo: '', phone: '', idCardFront: null, idCardBack: null, licenseImage: null,
    licenseClasses: [], licenseExpiry: '', qualificationNo: '', employmentType: '', qualificationImage: null,
    qualificationExpiry: '', joinDate: GROUND_DATE, vehicle: '', drivingScore: '', remark: '', status: '正常',
  }
}

export function createFleetSeed() {
  const certificates = () => Object.fromEntries(DRIVER_ATTACHMENT_FIELDS.map(({ key }) => [key, createDriverSampleAttachment(key)]))
  return [
    { id: 'DRV-0001', ...createDriverDraft(), ...certificates(), name: '演示司机甲', gender: '男', identityNo: '000000000000000001', phone: '00000001001', licenseClasses: ['C1'], licenseExpiry: '2027-09-30', qualificationNo: 'ZG-DEMO-001', employmentType: '货物运输', qualificationExpiry: '2027-09-30', vehicle: '沪A·DEMO1', drivingScore: '12', remark: '合成司机资料', status: '正常', updatedAt: '2026-09-08 12:10', updatedBy: '陈楠' },
    { id: 'DRV-0002', ...createDriverDraft(), ...certificates(), name: '演示司机乙', gender: '男', identityNo: '000000000000000002', phone: '00000001002', licenseClasses: ['A2', 'B2'], licenseExpiry: '2026-10-05', qualificationNo: 'ZG-DEMO-002', employmentType: '货物运输', qualificationExpiry: '2027-01-05', vehicle: '沪B·DEMO2', drivingScore: '6', remark: '', status: '休假', updatedAt: '2026-09-07 16:20', updatedBy: '陈楠' },
    { id: 'DRV-0003', ...createDriverDraft(), ...certificates(), name: '演示司机丙', gender: '女', identityNo: '000000000000000003', phone: '00000001003', licenseClasses: ['C1'], licenseExpiry: '2028-03-18', qualificationNo: '', employmentType: '', qualificationExpiry: '2028-03-18', vehicle: '', drivingScore: '', remark: '未分配车辆', status: '已离职', updatedAt: '2026-08-28 09:40', updatedBy: '陈楠' },
  ]
}

export function normalizeDriver(value = {}) {
  const result = createDriverDraft()
  for (const key of Object.keys(result)) {
    if (value[key] !== undefined) result[key] = value[key] === null ? null : clone(value[key])
  }
  for (const key of Object.keys(result)) {
    if (!DRIVER_ATTACHMENT_FIELDS.some(field => field.key === key) && key !== 'licenseClasses') result[key] = text(result[key])
  }
  result.identityNo = result.identityNo.toUpperCase()
  result.licenseClasses = Array.isArray(value.licenseClasses) ? [...value.licenseClasses] : []
  return result
}

export function validateDriverAttachment(file) {
  if (!file || typeof file !== 'object') return '请选择图片文件'
  const formats = { jpg: ['image/jpeg'], png: ['image/png'], bmp: ['image/bmp', 'image/x-ms-bmp'] }
  const extension = String(file.name || '').split('.').pop().toLowerCase()
  if (!formats[extension]?.includes(file.type)) return '图片格式仅支持 jpg、png、bmp'
  if (!Number.isInteger(file.size) || file.size <= 0) return '图片为空或文件大小无效'
  if (file.size > DRIVER_ATTACHMENT_LIMIT) return '图片大小不能超过 6MB'
  const match = /^data:(image\/(?:png|jpeg|bmp|x-ms-bmp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(file.dataUrl || '')
  if (!match || match[1] !== file.type) return '图片内容缺失或格式不匹配，请重新选择'
  let bytes
  try { bytes = atob(match[2]) } catch { return '图片内容无法读取，请重新选择' }
  const signature = extension === 'png' ? [137, 80, 78, 71, 13, 10, 26, 10] : extension === 'jpg' ? [255, 216, 255] : [66, 77]
  if (bytes.length !== file.size || !signature.every((byte, index) => bytes.charCodeAt(index) === byte)) return '图片内容与文件信息不匹配，请重新选择'
  return ''
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function validateDriverDraft(value, drivers = [], { existingId = '', vehicles, waybills = [] } = {}) {
  const v = value || {}, errors = {}
  const required = [['name', '请输入姓名'], ['gender', '请选择性别'], ['identityNo', '请输入身份证/驾驶证号码'], ['phone', '请输入联系方式'], ['licenseExpiry', '请选择驾驶证期限'], ['joinDate', '请选择入职日期']]
  for (const [field, message] of required) if (!text(v[field])) errors[field] = message
  if (text(v.name).length > 50) errors.name = '姓名不能超过 50 个字符'
  if (text(v.gender) && !['男', '女'].includes(v.gender)) errors.gender = '请选择男或女'
  if (text(v.identityNo) && !/^(?:\d{15}|\d{17}[\dXx])$/.test(text(v.identityNo))) errors.identityNo = '证件号码须为 15 位数字或 18 位号码（末位可为 X）'
  if (text(v.phone) && !/^\d{11}$/.test(text(v.phone))) errors.phone = '联系方式须为 11 位数字'
  if (!Array.isArray(v.licenseClasses) || !v.licenseClasses.length) errors.licenseClasses = '请选择至少一个准驾车型'
  else if (v.licenseClasses.some(item => !DRIVER_LICENSE_CLASSES.includes(item)) || new Set(v.licenseClasses).size !== v.licenseClasses.length) errors.licenseClasses = '准驾车型必须从候选项选择且不可重复'
  if (text(v.qualificationNo).length > 20) errors.qualificationNo = '从业资格号不能超过 20 个字符'
  if (text(v.employmentType) && !DRIVER_EMPLOYMENT_TYPES.includes(v.employmentType)) errors.employmentType = '请选择有效的从业类别'
  if (!DRIVER_STATUSES.includes(v.status)) errors.status = '请选择有效的司机状态'
  if (text(v.drivingScore) && !/^[1-9]\d{0,19}$/.test(text(v.drivingScore))) errors.drivingScore = '当前驾驶分数须为不超过 20 位的正整数'
  // The PRD disagrees on whether this date is optional; only the shared valid path is enabled.
  if (!text(v.qualificationExpiry)) errors.qualificationExpiry = '资质证有效日期的空值规则待确认，请先填写日期'
  for (const field of ['licenseExpiry', 'qualificationExpiry', 'joinDate']) {
    if (text(v[field]) && !validDate(text(v[field]))) errors[field] = '请输入有效日期，格式为 YYYY-MM-DD'
  }
  for (const { key, label, required: attachmentRequired } of DRIVER_ATTACHMENT_FIELDS) {
    if (!v[key] && attachmentRequired) errors[key] = '请上传' + label
    else if (v[key]) {
      const error = validateDriverAttachment(v[key])
      if (error) errors[key] = error
    }
  }
  const duplicate = drivers.find(item => item.id !== existingId && item.status === '正常' && text(item.identityNo).toUpperCase() === text(v.identityNo).toUpperCase())
  if (duplicate) errors.identityNo = '您提交的信息已存在，请重新检查！'
  const current = drivers.find(item => item.id === existingId)
  if (current && (text(v.name) !== current.name || text(v.identityNo).toUpperCase() !== current.identityNo) && waybills.some(bill => bill.drivers?.some(person => person.name === current.name || person.identity && text(person.identity).toUpperCase() === current.identityNo))) errors.name = '存在关联任务，司机身份变更的历史处理规则待确认'
  if (vehicles) {
    if (text(v.vehicle) && !vehicles.some(vehicle => vehicle.plate === text(v.vehicle))) errors.vehicle = '请选择车辆档案中的车牌号'
    if (v.status === '已离职' && text(v.vehicle)) errors.vehicle = '已分配司机的离职处理待确认，请先解除车辆分配'
  } else if (text(v.vehicle) !== text(current?.vehicle)) errors.vehicle = '车辆档案候选未接入，暂不能更改分配车辆'
  return errors
}

export function filterDrivers(drivers = [], filters = {}) {
  const keyword = text(filters.keyword)
  const collator = new Intl.Collator('zh-Hans-u-co-pinyin')
  return drivers.filter(driver => !keyword || driver.name === keyword || driver.phone === keyword)
    .filter(driver => !filters.status || driver.status === filters.status)
    .filter(driver => !filters.licenseClass || driver.licenseClasses.includes(filters.licenseClass))
    .filter(driver => !filters.employmentType || driver.employmentType === filters.employmentType)
    .slice().sort((left, right) => Number(left.status === '已离职') - Number(right.status === '已离职') || collator.compare(left.name, right.name) || String(left.id).localeCompare(String(right.id)))
}

export function driverExpiryState(value, today = GROUND_DATE) {
  if (!validDate(value) || !validDate(today)) return ''
  if (value < today) return 'expired'
  const cutoff = new Date(today + 'T00:00:00Z')
  const day = cutoff.getUTCDate()
  cutoff.setUTCDate(1)
  cutoff.setUTCMonth(cutoff.getUTCMonth() + 1)
  cutoff.setUTCDate(Math.min(day, new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate()))
  return value <= cutoff.toISOString().slice(0, 10) ? 'expiring' : ''
}

export function deriveDriverTaskSummary(driver, state) {
  const candidates = state?.fleetDrivers || (driver ? [driver] : [])
  const matches = person => person.identity
    ? candidates.filter(row => text(row.identityNo).toUpperCase() === text(person.identity).toUpperCase())
    : candidates.filter(row => row.name === person.name)
  const bills = driver ? (state?.groundWaybills || []).filter(item => (item.drivers || []).some(person => {
    const found = matches(person)
    return found.length === 1 && found[0].id === driver.id
  })) : []
  const ambiguous = driver && (state?.groundWaybills || []).some(item => item.drivers?.some(person => {
    const found = matches(person)
    return found.length > 1 && found.some(row => row.id === driver.id)
  }))
  const running = bills.filter(item => !['已取消', '已卸货', '已完成'].includes(fleetTaskStatus(item)))
  const history = bills.filter(item => ['已卸货', '已完成'].includes(fleetTaskStatus(item)))
  return {
    running, history, completed: null, year: null, month: null, week: null, amount: null,
    associationReason: ambiguous ? '部分运单无法唯一关联司机，暂未计入任务列表（146）' : '',
    statisticsReason: '完成口径待确认：司机统计使用“已完成”，运输运单仅有“已卸货”；应收统计是否含取消运单也存在冲突，且应收金额来源尚未接入。',
  }
}

export function fleetTaskStatus(bill) { return bill.status === '异常中' ? bill.fulfillmentStatus || bill.status : bill.status }
