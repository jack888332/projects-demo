// PRD 030 §8～§9：原始舱单申报与载货确报（中港车），本系统录入后同步陆运通。
export const MANIFEST_NOW = '2026-09-08 14:30'
export const MANIFEST_STATUSES = ['待报关', '发送成功', '发送失败', '海关退单', '海关放行', '海关删除']
export const MANIFEST_SYNC_STATUSES = ['成功', '失败', '进行中']
export const MANIFEST_EDITABLE_STATUSES = ['待报关', '发送失败', '海关退单']
export const CONFIRM_TYPES = ['进口载货承运确报', '出口载货承运确报', '进口空车承运确报', '出口空车承运确报', '进口空集装箱车承运确报']
export const CONFIRM_SYNC_STATUSES = ['成功', '失败', '进行中']
export const PORT_OPTIONS = ['5301 皇岗口岸', '5300 深圳', '5165 南沙', '4401 广州']
export const CUSTOMS_CLEARANCE_CODES = ['RD01 进出境直通', 'RD02 转关', 'RD03 其他']
export const PACKAGE_TYPES = ['CT 纸板箱', 'PL 托盘', 'BG 包', 'DR 桶']
export const TRAILER_TYPES = ['02 二轴', '03 三轴', '04 四轴及以上']
export const MANIFEST_GOODS_IMPORT_HEADERS = ['商品描述', '货物件数', '毛重（KG）', '包装类型', '危险品编号', '收货人（企业）', '发货人（企业）', '危险品联系人']
export const MANIFEST_GOODS_IMPORT_KEYS = ['description', 'pieces', 'weight', 'packageType', 'dangerNo', 'receiver', 'shipper', 'dangerContact']

const text = value => String(value ?? '').trim()

export function manifestPermissions(role) {
  const operator = role === 'customsService'
  return { write: operator, submit: operator, read: true }
}

export function createManifestDraft(manifest) {
  const base = {
    id: '', batchNo: '', messageId: '', port: '5301 皇岗口岸', transportMode: '3 公路运输', loadingTime: '2026-09-08 10:00:00',
    unloadCode: '5300 深圳', waybillNo: '', clearanceCode: 'RD01 进出境直通', goodsValue: '', currency: 'CNY', totalPieces: '', packageType: 'CT 纸板箱', totalWeight: '',
    freightPayMethod: '1 Direct payment', crossDestination: '', clientMessageId: '', containerNo: '', sizeType: 'DC20（22G0）', containerOwner: '', emptyEmpty: '1',
    status: '待报关', syncStatus: '', createdBy: '', createdAt: MANIFEST_NOW, receipts: [], logs: [],
    goods: [], ...manifest,
  }
  if (manifest) return base
  return { ...base, goods: [{ id: 'M-G1', description: '', pieces: '', weight: '', packageType: 'CT 纸板箱', dangerNo: '', receiver: '', shipper: '', dangerContact: '' }] }
}

export function validateManifestDraft(draft, { submit = false } = {}) {
  const errors = {}
  if (!text(draft?.batchNo)) errors.batchNo = '货物运输批次号必填'
  else if (!/^[1-9]\d{12}$/.test(text(draft.batchNo))) errors.batchNo = '批次号为 13 位数字且首位 1-9（原始 1-4、预配 5-9）'
  if (text(draft?.waybillNo) && !/^[0-9A-Za-z-]{3,35}$/.test(text(draft.waybillNo))) errors.waybillNo = '提运单号为 3 到 35 位数字、字母或连字符'
  if (text(draft?.goodsValue) && (!/^\d+(?:\.\d{1,2})?$/.test(String(draft.goodsValue)) || String(draft.goodsValue).length > 16)) errors.goodsValue = '货物价值最多 16 位并精确到 2 位小数'
  if (text(draft?.totalPieces) && !/^\d{1,8}$/.test(String(draft.totalPieces))) errors.totalPieces = '货物总件数最多 8 位数字'
  if (text(draft?.totalWeight) && !/^\d{1,14}$/.test(String(draft.totalWeight))) errors.totalWeight = '货物总重最多 14 位数字'
  if (submit) {
    for (const [field, label] of [['waybillNo', '总运/提单号'], ['loadingTime', '货物装载时间'], ['unloadCode', '卸货地代码'], ['goodsValue', '货物价值'], ['totalPieces', '货物总件数'], ['totalWeight', '货物总重']]) {
      if (!text(draft?.[field])) errors[field] = `${label}必填`
    }
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text(draft?.loadingTime))) errors.loadingTime = '装载时间格式为 YYYY-MM-DD hh:mm:ss'
    draft?.goods?.forEach((row, index) => {
      if (!text(row.description)) errors[`goods.${index}.description`] = '商品描述必填'
      if (!text(row.pieces)) errors[`goods.${index}.pieces`] = '货物件数必填'
      else if (!/^\d{1,8}$/.test(String(row.pieces))) errors[`goods.${index}.pieces`] = '货物件数最多 8 位数字'
      if (text(row.weight) && !/^\d{1,14}(?:\.\d{1,3})?$/.test(String(row.weight))) errors[`goods.${index}.weight`] = '毛重最多 14 位数字并精确到 3 位小数'
      if (text(row.dangerNo) && !text(row.dangerContact)) errors[`goods.${index}.dangerContact`] = '填写危险品编号时危险品联系人必须填写'
    })
    if (!draft?.goods?.length) errors.goods = '至少一条商品信息'
  }
  return errors
}

export function filterManifests(rows, filters = {}) {
  const exact = (value, input) => {
    if (!text(input)) return true
    const list = String(input).split(/\r?\n/).map(row => row.trim()).filter(Boolean)
    if (Array.isArray(value)) return value.some(item => list.includes(item))
    return list.includes(value)
  }
  const range = (value, bounds) => {
    if (!Array.isArray(bounds) || !bounds.some(Boolean)) return true
    const time = String(value || '')
    return Boolean(time) && (!bounds[0] || time >= bounds[0]) && (!bounds[1] || time <= `${bounds[1]} 23:59:59`)
  }
  return rows.filter(row =>
    exact(row.batchNo, filters.batchNo) && exact(row.waybillNo, filters.waybillNo) && exact(row.containerNo, filters.containerNo) &&
    (!filters.port || row.port === filters.port) && (!filters.unloadCode || row.unloadCode === filters.unloadCode) &&
    (!filters.clearanceCode || row.clearanceCode === filters.clearanceCode) &&
    (!filters.loadingTime || exact(row.loadingTime, filters.loadingTime)) &&
    (!filters.createdBy || row.createdBy === filters.createdBy) &&
    range(row.createdAt, filters.createdRange) &&
    (!filters.status || row.status === filters.status) && (!filters.syncStatus || row.syncStatus === filters.syncStatus))
}

export function createConfirmationDraft(confirmation) {
  const base = {
    id: '', batchNo: '', type: '进口载货承运确报', port: '5301 皇岗口岸', confirmTime: '2026-09-08 10:00:00', customsRemark: '', companyRemark: '',
    vehicleCode: '', vehicleName: '', driverCode: '', driverName: '',
    trailers: [], containers: [], status: '待报关', syncStatus: '', createdBy: '', createdAt: MANIFEST_NOW, receipts: [], logs: [],
  }
  if (confirmation) return { ...base, ...confirmation }
  return { ...base, trailers: [{ id: 'T-1', vehicleCode: '', plate: '', type: '02 二轴', weight: '' }], containers: [] }
}

export function validateConfirmationDraft(draft, { submit = false } = {}) {
  const errors = {}
  if (!text(draft?.batchNo)) errors.batchNo = '货物运输批次号必填'
  else if (!/^[1-9]\d{12}$/.test(text(draft.batchNo))) errors.batchNo = '批次号为 13 位数字且首位 1-9'
  if (!CONFIRM_TYPES.includes(draft?.type)) errors.type = '请选择确报类型'
  if (submit) {
    for (const [field, label] of [['vehicleCode', '运输工具代码'], ['vehicleName', '运输工具名称'], ['driverCode', '驾驶员代码'], ['driverName', '驾驶员名称']]) {
      if (!text(draft?.[field])) errors[field] = `${label}必填`
    }
  }
  return errors
}

export function filterConfirmations(rows, filters = {}) {
  const exact = (value, input) => {
    if (!text(input)) return true
    const list = String(input).split(/\r?\n/).map(row => row.trim()).filter(Boolean)
    return list.includes(value)
  }
  const range = (value, bounds) => {
    if (!Array.isArray(bounds) || !bounds.some(Boolean)) return true
    const time = String(value || '')
    return Boolean(time) && (!bounds[0] || time >= bounds[0]) && (!bounds[1] || time <= `${bounds[1]} 23:59:59`)
  }
  return rows.filter(row =>
    exact(row.batchNo, filters.batchNo) && exact(row.driverCode, filters.driverCode) && exact(row.driverName, filters.driverName) &&
    (!filters.type || row.type === filters.type) && (!filters.port || row.port === filters.port) &&
    (!filters.vehicleCode || row.vehicleCode === filters.vehicleCode) && (!filters.vehicleName || row.vehicleName === filters.vehicleName) &&
    (!filters.createdBy || row.createdBy === filters.createdBy) &&
    range(row.confirmTime, filters.confirmRange) && range(row.createdAt, filters.createdRange))
}

function parseCsv(source) {
  const rows = []
  let row = [], cell = '', quoted = false
  const input = String(source || '').replace(/^\ufeff/, '')
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i += 1 }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += char
  }
  row.push(cell.replace(/\r$/, ''))
  if (row.some(value => value !== '') || rows.length === 0) rows.push(row)
  return rows.filter(values => values.some(value => String(value).trim() !== ''))
}

// PRD 030 §8.3 导入商品信息：正式模板未定义，原型使用明确标注的列顺序与 CSV 文件，任一错误整次失败、不覆盖当前内容（问题235同口径）。
export function parseManifestGoodsCsv(source, nextId = 1) {
  const rows = parseCsv(source)
  if (!rows.length) return { ok: false, error: '导入文件为空', goods: [] }
  const headers = rows[0].map(text)
  if (headers.length !== MANIFEST_GOODS_IMPORT_HEADERS.length || headers.some((header, index) => header !== MANIFEST_GOODS_IMPORT_HEADERS[index])) {
    return { ok: false, error: '导入字段须与原始舱单商品信息模板一致，未覆盖当前商品信息', goods: [] }
  }
  const goods = []
  for (let index = 1; index < rows.length; index += 1) {
    const values = rows[index]
    if (values.length !== headers.length) return { ok: false, error: `第 ${index} 行字段数与表头不一致，未覆盖当前商品信息`, goods: [] }
    const record = Object.fromEntries(MANIFEST_GOODS_IMPORT_KEYS.map((key, fieldIndex) => [key, text(values[fieldIndex])]))
    record.id = `M-G${nextId + goods.length}`
    if (!record.description || !record.pieces) return { ok: false, error: `第 ${index} 行商品描述、货物件数必填，未覆盖当前商品信息`, goods: [] }
    if (!/^\d{1,8}$/.test(record.pieces)) return { ok: false, error: `第 ${index} 行货物件数须为最多 8 位数字，未覆盖当前商品信息`, goods: [] }
    if (record.weight && !/^\d{1,14}(?:\.\d{1,3})?$/.test(record.weight)) return { ok: false, error: `第 ${index} 行毛重最多 14 位数字并精确到 3 位小数，未覆盖当前商品信息`, goods: [] }
    if (record.dangerNo && !record.dangerContact) return { ok: false, error: `第 ${index} 行填写危险品编号时危险品联系人必填，未覆盖当前商品信息`, goods: [] }
    goods.push(record)
  }
  return { ok: true, goods }
}

export function manifestGoodsCsvTemplate() {
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  return '\ufeff' + MANIFEST_GOODS_IMPORT_HEADERS.map(escape).join(',') + '\r\n'
}
