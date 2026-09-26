// PRD 028 普货关务作业：服务订单受理与流转、详情与单证记录、资料审核、单证制作与报关单操作。
// 本篇首个切片的单据状态机如下；改单/删单/退运/落装/改配与预录/复审界面细节见后续切片。
export const CUSTOMS_NOW = '2026-09-08 14:30'
export const CUSTOMS_ORDER_TYPES = ['普货进口', '普货出口']
export const CUSTOMS_SERVICE_STATUSES = ['待接单', '进行中', '已完成', '已终止', '已取消']
export const DECLARATION_STATUSES = ['新增', '待复审', '复审通过', '复审不通过', '发送中', '发送成功', '发送异常', '已发送', '已申报', '已作废', '已改单', '已删单']
export const DECLARATION_CUSTOMS_STATUSES = ['待申报', '已申报', '审结', '查验', '放行', '结关', '退单', '挂单']
export const DECLARATION_TYPES = ['进口整合申报', '进口概要申报', '出口一次录入-人工提交', '出口一次录入-辅助提交', '进口转关申报']
export const CUSTOMS_MATERIAL_SOURCES = ['上游订单', '当前服务订单', '单证制作']
export const DOCUMENT_ATTACHMENT_TYPES = [['declaration', '报关单'], ['invoice', '发票'], ['packing', '装箱单'], ['contract', '合同']]

const text = value => String(value ?? '').trim()
const splitLines = value => String(value ?? '').split(/\r?\n/).map(row => row.trim()).filter(Boolean)

export function customsOperationPermissions(role) {
  return {
    operate: role === 'customsService',
    review: role === 'customsService',
    read: true,
  }
}

export function deriveCustomsStatus(state, service) {
  const rows = (service?.declarationIds || []).map(id => (state.customsDeclarations || []).find(row => row.id === id)).filter(Boolean)
  // 最新报关状态：按申报日期优先，未申报的草稿按单据编号顺序；没有国内报关时留空。
  const declared = rows.filter(row => row.customsStatus && row.customsStatus !== '待申报')
  const pool = declared.length ? declared : rows
  return pool.slice().sort((left, right) => String(left.declarationDate || left.docNo || '').localeCompare(String(right.declarationDate || right.docNo || ''))).at(-1)?.customsStatus || ''
}

export function filterCustomsOrders(rows, filters = {}, { statusOf = row => row.customsStatus } = {}) {
  const multi = (value, values) => !values.length || values.includes(value)
  return rows.filter(row =>
    (!text(filters.serviceNo) || multi(row.serviceNo, splitLines(filters.serviceNo))) &&
    (!text(filters.orderNo) || multi(row.orderNo, splitLines(filters.orderNo))) &&
    (!text(filters.waybillNo) || multi(row.waybillNo, splitLines(filters.waybillNo))) &&
    (!text(filters.houseNo) || multi(row.houseNo, splitLines(filters.houseNo))) &&
    (!filters.serviceItems?.length || filters.serviceItems.some(item => (row.services || []).includes(item))) &&
    (!text(filters.customer) || String(row.customer || '').includes(text(filters.customer))) &&
    (!text(filters.salesperson) || row.salesperson === text(filters.salesperson)) &&
    (!filters.customsStatuses?.length || (filters.customsStatuses.includes('无') ? !statusOf(row) : filters.customsStatuses.includes(statusOf(row)))) &&
    (!filters.range?.length || (row.createdAt || '').slice(0, 10) >= filters.range[0] && (row.createdAt || '').slice(0, 10) <= (filters.range[1] || '9999-12-31')))
}

export function serviceOrderPermissions(order, role, actorName = '') {
  const operator = role === 'customsService'
  return {
    accept: operator && order?.status === '待接单',
    transfer: operator && order?.status === '进行中' && order?.handler === actorName,
    terminate: operator && order?.status === '进行中' && Boolean(order?.upstreamCancelled),
    cancel: operator && order?.status === '进行中' && Boolean(order?.upstreamCancelled),
    readOnly: ['已完成', '已终止', '已取消'].includes(order?.status),
  }
}

export function declarationEligibility(declaration) {
  const status = declaration?.status
  return {
    submit: status === '新增',
    review: status === '待复审',
    send: status === '复审通过',
    copy: !['已作废', '已删单'].includes(status),
    void: ['待复审', '复审通过', '复审不通过', '已发送', '已改单', '已作废', '已删单'].includes(status),
    statusManage: ['已发送', '发送成功', '已申报', '已改单', '已作废', '已删单'].includes(status),
    letterRecord: ['退单', '挂单'].includes(declaration?.customsStatus) && !declaration?.letterRecord,
    inspect: ['已申报', '已删单'].includes(status) || Boolean(declaration?.serviceHasInspection),
    finishBlocked: ['已完成'].includes(status),
  }
}

export function validateReviewResult({ approved, reason }) {
  const errors = {}
  if (!approved && !text(reason)) errors.reason = '审核不通过须填写原因'
  return errors
}

export function validateDeclarationReview({ approved, reason }) {
  const errors = {}
  if (!approved && !text(reason)) errors.reason = '复审不通过须填写原因'
  return errors
}

export function validateLetterResult(content) {
  return text(content) ? {} : { content: '请填写处理内容' }
}

export function createDocumentNo(sequence, date = CUSTOMS_NOW) {
  // 单据编号规则 208+YYDDMM+5位流水（CUSTOMS-B007 记录日月顺序差异，原型按来源原值）。
  return `208${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}${String(sequence).padStart(5, '0')}`
}

export function createCustomsNo(sequence, date = CUSTOMS_NOW) {
  return `5141${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}${String(sequence).padStart(5, '0')}`
}

export function createMaterialDraft(order) {
  const imp = order?.businessType === '普货进口'
  return {
    declarationDate: CUSTOMS_NOW.slice(0, 10), contact: '张关', port: '5141', operatorUnit: '广东高捷报关有限公司', operatorAddress: '广州市演示地址 1 号', operatorPhone: '020-00000001', operatorFax: '020-00000002',
    foreignUnit: 'DEMO OVERSEAS LTD', foreignAddress: 'DEMO ADDRESS', foreignPhone: '000-00000003', foreignFax: '000-00000004',
    customsNo: '91510183MA6AFAQG23', entryPort: imp ? '广州白云机场海关' : '南沙海关', contractNo: 'CONTRACT-DEMO-028', recordNo: '', exemptionNature: '一般征税', contractDate: '2026-09-01', licenseNo: '', supervisionMode: imp ? '一般贸易' : '一般贸易', contractPlace: '广州', approvalNo: '', tradeMode: 'CIF', shipmentPeriod: '2026-09', containerNo: '', settlementMode: '电汇', invoiceNo: 'INV-DEMO-028', destinationPort: order?.destinationPort || 'LAX', exemptionMode: '照章征税', waybillNo: order?.waybillNo || '781-90000001', destinationCountry: '美国', currency: 'USD', manufacturer: 'DEMO MANUFACTURER', transportMode: '航空运输', conveyanceName: 'MU9001', domesticSource: '广州', freight: '120.00', packageType: '纸箱', attachmentsNote: '发票、装箱单、合同', insurance: '20.00', miscFee: '0.00', trademark: 'DEMO', remark: '', markCode: 'DEMO-MARK',
  }
}

export function requiredMaterialWarning(draft) {
  const warnings = []
  for (const [key, label] of [['declarationDate', '申报日期'], ['operatorUnit', '经营单位'], ['customsNo', '海关编号'], ['waybillNo', '提运单号'], ['invoiceNo', '发票号']]) {
    if (!text(draft?.[key])) warnings.push(`${label}为空`)
  }
  return warnings
}
