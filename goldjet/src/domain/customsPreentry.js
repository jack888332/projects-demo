// PRD 028 §5.1 进口整合申报预录；只承载本切片的基本与商品信息。
// 涉检信息、集装箱信息、随附单证和其他申报模式留待后续切片。
import { createMaterialDraft } from './customsOperations.js'

const text = value => String(value ?? '').trim()
const clone = value => JSON.parse(JSON.stringify(value))

const field = (key, label, type = 'text', options = [], requiredness = 'default', readOnly = false, hint = '') => ({ key, label, type, options, requiredness, readOnly, hint })

export const CUSTOMS_PREENTRY_GROUPS = [
  {
    key: 'declaration', title: '申报标识与日期', fields: [
      field('declarationCustoms', '申报地海关', 'text', [], 'default', false, '读取资料录入的申报口岸；默认代码 5141 的适用范围按 CUSTOMS-B011 待确认。'),
      field('declarationStatus', '申报状态', 'readonly', [], 'pending', true, '申报后由系统返填。'),
      field('uniformNo', '统一编号', 'readonly', [], 'pending', true, '申报后由系统返填。'),
      field('preEntryNo', '预录入编号', 'readonly', [], 'pending', true, '申报后由系统返填。'),
      field('customsNo', '海关编号（回执）', 'readonly', [], 'pending', true, '预录入阶段尚无海关回执。'),
      field('entryCustoms', '进境关别', 'text', [], 'default', false, '从关务代码字典选择；本原型暂提供可编辑演示值。'),
      field('recordNo', '备案号', 'text', [], 'optional', false),
      field('contractNo', '合同协议号', 'text', [], 'optional', false),
      field('importDate', '进口日期', 'readonly', [], 'pending', true, '来源将其定义为发送单一窗口后自动填当前时间，是否为必填待确认。'),
      field('declarationDate', '申报日期', 'readonly', [], 'pending', true, '单一窗口申报后回填。'),
    ],
  },
  {
    key: 'domestic', title: '境内收发货人', fields: [
      field('domesticCreditCode', '社会信用代码', 'text', [], 'default', false, '18位。'),
      field('domesticCustomsCode', '海关代码', 'text', [], 'default', false, '10位；与资料录入“海关编号”的对应关系按 CUSTOMS-B008/B011 保留待确认。'),
      field('domesticInspectionCode', '检验检疫编码', 'text', [], 'optional', false, '可从社会信用代码或海关代码联动，数据字典未接入。'),
      field('domesticName', '企业名称（中文）', 'text', [], 'default', false),
    ],
  },
  {
    key: 'foreign', title: '境外收发货人', fields: [
      field('foreignCode', '发货人代码', 'text', [], 'optional', false, '来源于境外收发货人基础资料；本原型候选资料未接入。'),
      field('foreignName', '企业名称（外文）', 'text', [], 'default', false),
    ],
  },
  {
    key: 'consumer', title: '消费使用单位', fields: [
      field('consumerCreditCode', '社会信用代码', 'text', [], 'default', false, '18位。'),
      field('consumerCustomsCode', '海关代码', 'text', [], 'default', false, '10位。'),
      field('consumerInspectionCode', '检验检疫编码', 'text', [], 'optional', false),
      field('consumerName', '企业名称', 'text', [], 'default', false),
    ],
  },
  {
    key: 'declarant', title: '申报单位', fields: [
      field('declarantCreditCode', '社会信用代码', 'text', [], 'default', false, '来源默认值 91440000761575765M 的适用范围待确认（CUSTOMS-B011）。'),
      field('declarantCustomsCode', '海关代码', 'text', [], 'default', false, '来源默认值 4401983107 的适用范围待确认（CUSTOMS-B011）。'),
      field('declarantInspectionCode', '检验检疫编码', 'text', [], 'optional', false, '来源默认值 4400910435 的适用范围待确认（CUSTOMS-B011）。'),
      field('declarantName', '企业名称', 'text', [], 'default', false, '来源默认值广东高捷航运物流有限公司的适用范围待确认（CUSTOMS-B011）。'),
    ],
  },
  {
    key: 'transport', title: '运输与监管', fields: [
      field('transportMode', '运输方式', 'select', ['航空运输', '水路运输', '铁路运输', '公路运输', '邮件运输', '其他运输'], 'default', false, '候选取值以关务运输方式代码字典为准；原型使用有限演示候选。'),
      field('vehicleName', '运输工具名称', 'text', [], 'optional', false),
      field('voyageNo', '航次号', 'text', [], 'optional', false),
      field('waybillNo', '提运单号', 'text', [], 'pending', false, '必填性待确认；空运优先读取总运单号+“_”+分单号。'),
      field('supervisionMode', '监管方式', 'text', [], 'default', false),
      field('exemptionNature', '征免性质', 'text', [], 'optional', false),
      field('licenseNo', '许可证号', 'text', [], 'optional', false),
      field('startCountry', '启运国（地区）', 'text', [], 'default', false),
      field('transitPort', '经停港', 'text', [], 'optional', false),
      field('entryPort', '入境口岸', 'text', [], 'default', false),
      field('storageLocation', '货物存放地点', 'text', [], 'default', false),
      field('departurePort', '启运港', 'text', [], 'default', false),
    ],
  },
  {
    key: 'trade', title: '交易与费用', fields: [
      field('tradeMode', '成交方式', 'select', ['FOB', 'CIF', 'C&F', '其他'], 'default', false, '进口运保费限制按来源执行；出口限制待 CUSTOMS-B010 确认。'),
      field('tradeCountry', '贸易国别（地区）', 'text', [], 'default', false),
      field('freightType', '运费标志代码', 'select', ['1-率', '2-单价', '3-总价'], 'optional', false),
      field('freightValue', '运费/费率', 'text', [], 'optional', false, '率：0.0001～99；单价/总价各按来源精度输入。'),
      field('freightCurrency', '运费币制', 'text', [], 'optional', false, '标志代码为1-率时置灰；币制候选字典未接入。'),
      field('insuranceType', '保险费标志代码', 'select', ['1-率', '2-单价', '3-总价'], 'optional', false),
      field('insuranceValue', '保险费/费率', 'text', [], 'optional', false),
      field('insuranceCurrency', '保险费币制', 'text', [], 'optional', false),
      field('miscType', '杂费标志代码', 'select', ['1-率', '2-单价', '3-总价'], 'optional', false),
      field('miscValue', '杂费/费率', 'text', [], 'optional', false),
      field('miscCurrency', '杂费币制', 'text', [], 'optional', false),
    ],
  },
  {
    key: 'cargoSummary', title: '货物与补充资料', fields: [
      field('pieces', '件数', 'number', [], 'default', false),
      field('packageType', '包装种类', 'text', [], 'default', false),
      field('grossWeight', '毛重（kg）', 'number', [], 'default', false, '来源要求值不小于1；0到小于1时按来源填充为1。'),
      field('netWeight', '净重（kg）', 'number', [], 'default', false, '来源要求值不小于1；0到小于1时按来源填充为1。'),
      field('containerCount', '集装箱数', 'readonly', [], 'pending', true, '填报集装箱信息后自动返填；本切片尚未实现集装箱信息。'),
      field('supportingDocs', '随附单证', 'readonly', [], 'pending', true, '来源标为只读；具体来源与随附单证操作待后续切片。'),
      field('declarationType', '报关单类型', 'readonly', [], 'default', true),
      field('remarks', '备注', 'text', [], 'optional', false),
      field('markCode', '标记唛码', 'text', [], 'pending', false, '必填性待确认。'),
    ],
  },
]

export const CUSTOMS_GOODS_COLUMNS = [
  ['itemNo', '项号', '系统自动生成'],
  ['productCode', '商品编号', 'editable'],
  ['inspectionName', '检验检疫名称', 'readonly'],
  ['productName', '商品名称', 'editable'],
  ['specModel', '规格型号', 'readonly'],
  ['quantity', '成交数量', 'editable'],
  ['unit', '成交计量单位', 'editable'],
  ['unitPrice', '单价', 'editable'],
  ['totalPrice', '总价', 'derived'],
  ['currency', '币制', 'editable'],
  ['legalQty1', '法定第一数量', 'pending'],
  ['legalUnit1', '法定第一计量单位', 'pending'],
  ['processingVersion', '加工成品单耗版本号', 'optional'],
  ['productNo', '货号', 'optional'],
  ['finalDestination', '最终目的国（地区）', 'optional'],
  ['legalQty2', '法定第二数量', 'pending'],
  ['legalUnit2', '法定第一计量单位（原文第二次出现）', 'pending'],
  ['originCountry', '原产国（地区）', 'optional'],
  ['originRegion', '原产地区', 'optional'],
  ['domesticDestination', '境内目的地', 'optional'],
  ['exemptionMode', '征免方式', 'optional'],
  ['inspectionSpec', '检验检疫货物规格', 'readonly'],
  ['cargoAttribute', '货物属性', 'readonly'],
  ['purpose', '用途', 'optional'],
]

export const CUSTOMS_PRECLASSIFICATIONS = [
  { productCode: 'DEMO-HS-330499', productName: '合成化妆品（演示）', inspectionName: '化妆品', specModel: '面霜；容量：50ml（演示）' },
  { productCode: 'DEMO-HS-210690', productName: '合成食品补充剂（演示）', inspectionName: '食品', specModel: '胶囊；60粒（演示）' },
  { productCode: 'DEMO-HS-900410', productName: '合成太阳眼镜（演示）', inspectionName: '眼镜', specModel: '塑料框架；非偏光（演示）' },
]

export const CUSTOMS_GOODS_IMPORT_HEADERS = CUSTOMS_GOODS_COLUMNS.map(([, label]) => label)
export const CUSTOMS_GOODS_IMPORT_KEYS = CUSTOMS_GOODS_COLUMNS.map(([key]) => key)

export function createCustomsGoodsRow(itemNo = 1) {
  return {
    itemNo: String(itemNo), productCode: 'DEMO-HS-330499', inspectionName: '化妆品', productName: '合成化妆品（演示）',
    specModel: '面霜；容量：50ml（演示）', quantity: '1', unit: '件', unitPrice: '100.0000', totalPrice: '100.0000', currency: 'USD',
    legalQty1: '', legalUnit1: '', processingVersion: '', productNo: 'DEMO-ITEM-028', finalDestination: '美国', legalQty2: '', legalUnit2: '',
    originCountry: '中国', originRegion: '', domesticDestination: '广东广州', exemptionMode: '照章征税', inspectionSpec: '', cargoAttribute: '', purpose: '其他',
  }
}

export function createCustomsPreentryDraft(service, declaration) {
  if (declaration?.preentry) return clone(declaration.preentry)
  const isExport = service?.businessType === '普货出口'
  const transport = service?.transportMode === '海运' ? '水路运输' : service?.transportMode === '陆运' ? '公路运输' : '航空运输'
  const goods = declaration?.goods?.length ? clone(declaration.goods) : [createCustomsGoodsRow(1)]
  const sourceName = service?.customer || '演示经营单位'
  return {
    typeLabel: declaration?.typeLabel || '进口整合申报',
    importExportFlag: isExport ? '出口' : '进口',
    basic: {
      declarationCustoms: '5141', declarationStatus: '', uniformNo: '', preEntryNo: '', customsNo: '',
      entryCustoms: isExport ? '南沙海关（演示）' : '广州白云机场海关（演示）', recordNo: '', contractNo: 'DEMO-CONTRACT-028', importDate: '', declarationDate: '',
      domesticCreditCode: '91440000DEMO00014X', domesticCustomsCode: '4401DEMO14', domesticInspectionCode: 'CIQDEMO14', domesticName: sourceName,
      foreignCode: '', foreignName: 'DEMO OVERSEAS LTD',
      consumerCreditCode: '91440000DEMO00015X', consumerCustomsCode: '4401DEMO15', consumerInspectionCode: '', consumerName: sourceName,
      declarantCreditCode: '91440000761575765M', declarantCustomsCode: '4401983107', declarantInspectionCode: '4400910435', declarantName: '广东高捷航运物流有限公司',
      transportMode: transport, vehicleName: service?.waybillNo ? 'MU9001（演示）' : 'DEMO-FLIGHT-028', voyageNo: '', waybillNo: service?.waybillNo || 'DEMO-WAYBILL-028',
      supervisionMode: '一般贸易', exemptionNature: '一般征税', licenseNo: '', startCountry: '中国（演示）', transitPort: '',
      entryPort: isExport ? '南沙海关（演示）' : '广州白云机场海关（演示）', storageLocation: '演示监管仓库', departurePort: '广州白云机场（演示）',
      tradeMode: 'FOB', tradeCountry: '美国（演示）',
      freightType: '', freightValue: '', freightCurrency: '', insuranceType: '', insuranceValue: '', insuranceCurrency: '', miscType: '', miscValue: '', miscCurrency: '',
      pieces: '1', packageType: '纸箱', grossWeight: '1.00', netWeight: '1.00', containerCount: '', supportingDocs: '',
      declarationType: '通关无纸化', remarks: '', markCode: '',
    },
    goods,
    inspection: null,
    containers: null,
    supportingDocuments: null,
  }
}

const REQUIRED_BASIC_FIELDS = [
  'declarationCustoms', 'entryCustoms',
  'domesticCreditCode', 'domesticCustomsCode', 'domesticName', 'foreignName',
  'consumerCreditCode', 'consumerCustomsCode', 'consumerName',
  'declarantCreditCode', 'declarantCustomsCode', 'declarantName',
  'transportMode', 'supervisionMode', 'startCountry', 'entryPort', 'storageLocation', 'departurePort',
  'tradeMode', 'tradeCountry', 'pieces', 'packageType', 'grossWeight', 'netWeight',
]

export function calculateCustomsGoodsTotal(row) {
  const quantity = Number(row?.quantity)
  const unitPrice = Number(row?.unitPrice)
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return ''
  return (quantity * unitPrice).toFixed(4)
}

export function renumberCustomsGoods(rows) {
  return (rows || []).map((row, index) => ({ ...row, itemNo: String(index + 1), totalPrice: calculateCustomsGoodsTotal(row) }))
}

export function normalizeCustomsPreentry(draft) {
  const normalized = clone(draft || {})
  for (const key of ['grossWeight', 'netWeight']) {
    const value = Number(normalized.basic?.[key])
    if (Number.isFinite(value) && value > 0 && value < 1) normalized.basic[key] = '1'
  }
  normalized.goods = renumberCustomsGoods(normalized.goods || [])
  return normalized
}

function validateFeeGroup(basic, prefix, errors) {
  const type = text(basic[`${prefix}Type`])
  const value = text(basic[`${prefix}Value`])
  const currency = text(basic[`${prefix}Currency`])
  if (!type && !value && !currency) return
  if (!type) errors[`${prefix}Type`] = '录入费用时请选择标志代码'
  if (!value) errors[`${prefix}Value`] = '录入费用时请填写费/费率'
  if (type === '1-率') {
    const rate = Number(value)
    if (!Number.isFinite(rate) || rate < 0.0001 || rate > 99) errors[`${prefix}Value`] = '费率须为 0.0001 至 99'
    if (currency) errors[`${prefix}Currency`] = '标志代码为 1-率时币制置灰，不需录入'
  } else if (['2-单价', '3-总价'].includes(type)) {
    const integerDigits = type === '2-单价' ? 10 : 12
    const pattern = new RegExp(`^\\d{1,${integerDigits}}(?:\\.\\d{1,4})?$`)
    if (value && !pattern.test(value)) errors[`${prefix}Value`] = `${type}整数最多 ${integerDigits} 位、小数最多 4 位`
    if (!currency) errors[`${prefix}Currency`] = '单价或总价费用须选择币制'
  }
}

export function validateCustomsPreentry(draft, { submit = false } = {}) {
  const errors = {}
  if (!draft?.basic) return { basic: '缺少预录基本信息' }
  if (!submit) return {}
  if (!Array.isArray(draft.goods) || !draft.goods.length) errors.goods = '至少添加一行商品信息'
  for (const key of REQUIRED_BASIC_FIELDS) {
    const field = CUSTOMS_PREENTRY_GROUPS.flatMap(group => group.fields).find(item => item.key === key)
    if (!text(draft.basic[key])) errors[`basic.${key}`] = `请填写${field?.label || key}`
  }
  const pieces = Number(draft.basic.pieces), gross = Number(draft.basic.grossWeight), net = Number(draft.basic.netWeight)
  if (!Number.isFinite(pieces) || pieces <= 0 || !Number.isInteger(pieces)) errors['basic.pieces'] = '件数须为正整数'
  if (!Number.isFinite(gross) || gross <= 0) errors['basic.grossWeight'] = '毛重须大于 0'
  if (!Number.isFinite(net) || net <= 0) errors['basic.netWeight'] = '净重须大于 0'
  draft.goods.forEach((row, index) => {
    for (const [key, label] of [['productCode', '商品编号'], ['productName', '商品名称'], ['quantity', '成交数量'], ['unit', '成交计量单位']]) {
      if (!text(row[key])) errors[`goods.${index}.${key}`] = `第 ${index + 1} 行请填写${label}`
    }
    const quantity = Number(row.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) errors[`goods.${index}.quantity`] = `第 ${index + 1} 行成交数量须大于 0`
    if (text(row.unitPrice) && (!Number.isFinite(Number(row.unitPrice)) || Number(row.unitPrice) < 0 || !/^\d+(?:\.\d{1,4})?$/.test(String(row.unitPrice)))) errors[`goods.${index}.unitPrice`] = `第 ${index + 1} 行单价最多保留 4 位小数`
  })
  const mode = text(draft.basic.tradeMode)
  if (draft.importExportFlag === '进口') {
    const freightEntered = ['freightType', 'freightValue', 'freightCurrency'].some(key => text(draft.basic[key]))
    const insuranceEntered = ['insuranceType', 'insuranceValue', 'insuranceCurrency'].some(key => text(draft.basic[key]))
    if (mode === 'CIF' && (freightEntered || insuranceEntered)) errors.tradeMode = '成交方式为 CIF 时不允许录入运费和保险费'
    if (mode === 'C&F' && freightEntered) errors.freightValue = '进口 C&F 不允许录入运费（来源规则）'
  }
  validateFeeGroup(draft.basic, 'freight', errors)
  validateFeeGroup(draft.basic, 'insurance', errors)
  validateFeeGroup(draft.basic, 'misc', errors)
  return errors
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

export function parseCustomsGoodsCsv(source) {
  const rows = parseCsv(source)
  if (!rows.length) return { ok: false, error: '导入文件为空', rows: [] }
  const headers = rows[0].map(text)
  if (headers.length !== CUSTOMS_GOODS_IMPORT_HEADERS.length || headers.some((header, index) => header !== CUSTOMS_GOODS_IMPORT_HEADERS[index])) {
    return { ok: false, error: '导入字段须与当前商品信息模板一致；法定第一计量单位重复列名按原列顺序解析（B009待确认）', rows: [] }
  }
  const imported = []
  for (let index = 1; index < rows.length; index += 1) {
    const values = rows[index]
    if (values.length !== headers.length) return { ok: false, error: `第 ${index} 行字段数与表头不一致，未覆盖当前商品信息`, rows: [] }
    const record = Object.fromEntries(CUSTOMS_GOODS_IMPORT_KEYS.map((key, fieldIndex) => [key, text(values[fieldIndex])]))
    record.itemNo = String(imported.length + 1)
    record.legalUnit2 = text(values[16])
    if (!record.productCode || !record.productName || !record.quantity || !record.unit) return { ok: false, error: `第 ${index} 行商品编号、商品名称、成交数量、成交计量单位必填，未覆盖当前商品信息`, rows: [] }
    if (!Number.isFinite(Number(record.quantity)) || Number(record.quantity) <= 0) return { ok: false, error: `第 ${index} 行成交数量须大于 0，未覆盖当前商品信息`, rows: [] }
    if (record.unitPrice && (!Number.isFinite(Number(record.unitPrice)) || Number(record.unitPrice) < 0 || !/^\d+(?:\.\d{1,4})?$/.test(record.unitPrice))) return { ok: false, error: `第 ${index} 行单价最多保留 4 位小数，未覆盖当前商品信息`, rows: [] }
    record.totalPrice = calculateCustomsGoodsTotal(record)
    imported.push(record)
  }
  return { ok: true, rows: imported }
}

export function customsGoodsCsvTemplate() {
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  return '\ufeff' + CUSTOMS_GOODS_IMPORT_HEADERS.map(escape).join(',') + '\r\n'
}

function previewLine(label, value, status = '') { return { label, value: value ?? '', status } }

export function buildCustomsPreentryPreviews(draft) {
  const basic = draft?.basic || {}
  const goods = draft?.goods || []
  const goodsRows = goods.map(row => ({
    itemNo: row.itemNo, productCode: row.productCode, productName: row.productName, specModel: row.specModel,
    quantity: row.quantity, unit: row.unit, unitPrice: row.unitPrice, totalPrice: calculateCustomsGoodsTotal(row), currency: row.currency,
  }))
  return {
    报关单: [
      previewLine('境内发货人', basic.domesticName), previewLine('境内收发货人代码', basic.declarantCustomsCode, '来源对应关系待 CUSTOMS-B008 确认'),
      previewLine('申报地海关', basic.declarationCustoms), previewLine('进境关别', basic.entryCustoms), previewLine('运输方式', basic.transportMode),
      previewLine('运输工具名称及航次号', `${basic.vehicleName || ''} ${basic.voyageNo || ''}`), previewLine('提运单号', basic.waybillNo),
      previewLine('监管方式', basic.supervisionMode), previewLine('征免性质', '', '来源字段映射疑似误引，待 CUSTOMS-B008 确认'),
      previewLine('贸易国别（地区）', basic.tradeCountry), previewLine('件数 / 毛重 / 净重', `${basic.pieces || ''} / ${basic.grossWeight || ''} / ${basic.netWeight || ''}`),
      previewLine('随附单证及编号', '', '来源待确认，不自行推断'),
      ...goodsRows.map((row, index) => previewLine(`商品 ${index + 1}`, `${row.productCode} · ${row.productName} · ${row.quantity} ${row.unit} · ${row.currency} ${row.totalPrice}`)),
    ],
    发票: [previewLine('商号', basic.foreignName), ...goodsRows.map((row, index) => previewLine(`货物 ${index + 1}`, `${row.productName} ${row.specModel}`)), ...goodsRows.map((row, index) => previewLine(`金额 ${index + 1}`, `${row.quantity} ${row.unit} × ${row.unitPrice} = ${row.totalPrice} ${row.currency}`)), previewLine('唛头', basic.markCode)],
    装箱单: [previewLine('客户', basic.foreignName), previewLine('合同协议号', basic.contractNo), previewLine('包装件数 / 成交数量', `${basic.pieces} / ${goods.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)}`), previewLine('总毛重 / 总净重（kg）', `${basic.grossWeight} / ${basic.netWeight}`), previewLine('唛头', basic.markCode), ...goodsRows.map((row, index) => previewLine(`货物 ${index + 1}`, `${row.productName} ${row.specModel}`))],
    合同: [previewLine('卖方', basic.foreignName), previewLine('买方', basic.domesticName, '合同地址/电话/传真映射待 CUSTOMS-B008 确认'), previewLine('合同号码', basic.contractNo), previewLine('签约地点', basic.contractPlace), previewLine('装运期', basic.shipmentPeriod), previewLine('装运口岸和目的地', basic.departurePort), previewLine('付款条件', basic.settlementMode), ...goodsRows.map((row, index) => previewLine(`货物 ${index + 1}`, `${row.productName} ${row.quantity} ${row.unit} · ${row.totalPrice} ${row.currency}`))],
  }
}

export function customsPreentryAccess(declaration, role, actorName = '') {
  const editable = ['新增'].includes(declaration?.status) && role === 'customsService' && (!declaration?.clerk || declaration.clerk === actorName)
  return { edit: editable, save: editable, submit: editable, readOnly: !editable }
}
