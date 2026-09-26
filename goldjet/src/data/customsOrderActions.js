import {
  CUSTOMS_NOW, createCustomsNo, createDocumentNo, createMaterialDraft, declarationEligibility,
  serviceOrderPermissions, validateDeclarationReview, validateLetterResult, validateReviewResult,
} from '../domain/customsOperations.js'
import { customsPreentryAccess, normalizeCustomsPreentry, validateCustomsPreentry } from '../domain/customsPreentry.js'

const clone = value => JSON.parse(JSON.stringify(value))
const text = value => String(value ?? '').trim()

export function createCustomsOrderActions(state, getSession) {
  const session = () => getSession() || { role: 'viewer', name: '' }
  const operator = () => customsOperator()
  function customsOperator() {
    const current = session()
    return current.role === 'customsService'
  }
  const findService = id => {
    const service = state.customsServiceOrders.find(row => row.id === id)
    if (!service) throw new Error('未找到关务服务订单')
    return service
  }
  const findDeclaration = id => {
    const declaration = state.customsDeclarations.find(row => row.id === id)
    if (!declaration) throw new Error('未找到报关单')
    return declaration
  }
  function trace(service, event, content) {
    const time = CUSTOMS_NOW
    service.serviceRecords ||= []
    service.serviceRecords.push({ id: `${service.id}-R${service.serviceRecords.length + 1}`, event, content, actor: session().name || session().role, time })
    service.logs ||= []
    service.logs.push({ id: `${service.id}-L${service.logs.length + 1}`, operator: session().name || session().role, action: event, content, time })
  }
  function gate(service) {
    if (!operator()) throw new Error('当前角色不能执行关务作业')
    if (serviceOrderPermissions(service, session().role, session().name).readOnly) throw new Error('已完成的关务服务订单只读')
    if (service.status === '进行中' && service.handler && service.handler !== session().name) throw new Error('仅当前接单人可操作；流转后原接单人只读')
    return service
  }
  // ---- 服务订单受理与流转 ----
  function acceptCustomsOrders(ids) {
    if (!operator()) throw new Error('当前角色不能接单')
    const accepted = []
    for (const id of ids) {
      const service = findService(id)
      if (service.status !== '待接单') continue
      service.status = '进行中'
      service.handler = session().name
      service.handlerRole = session().role
      trace(service, '接单', '待接单转进行中')
      accepted.push(service)
    }
    if (!accepted.length) throw new Error('所选订单已被接单')
    return accepted
  }
  function transferCustomsOrders(ids, { mode = 'department', target = '' } = {}) {
    if (!operator()) throw new Error('当前角色不能流转')
    const transferred = []
    for (const id of ids) {
      const service = findService(id)
      if (service.status !== '进行中' || service.handler !== session().name) continue
      if (mode === 'department') {
        service.status = '待接单'
        service.handler = ''
        service.handlerRole = ''
        trace(service, '流转', '流转给所有报关员，重置待接单')
      } else {
        if (!text(target)) throw new Error('请选择指定报关员')
        service.handler = target
        trace(service, '流转', `流转给指定人 ${target}，被指定人无需接单`)
      }
      transferred.push(service)
    }
    if (!transferred.length) throw new Error('所选订单不能流转')
    return transferred
  }
  function finishWith(ids, kind) {
    if (!operator()) throw new Error('当前角色不能执行该操作')
    const label = kind === 'terminate' ? '终止服务' : '取消服务'
    const changed = []
    for (const id of ids) {
      const service = findService(id)
      if (!service.upstreamCancelled || service.status !== '进行中') continue
      service.status = kind === 'terminate' ? '已终止' : '已取消'
      trace(service, label, kind === 'terminate' ? '终止服务不影响应收应付生成' : '取消服务不再生成应收应付')
      changed.push(service)
    }
    if (!changed.length) throw new Error(`所选订单不能${kind === 'terminate' ? '终止' : '取消'}${ids.some(id => { const service = findService(id); return !service.upstreamCancelled }) ? '：上游取消服务须为是' : ''}`)
    return changed
  }
  const terminateCustomsOrders = ids => finishWith(ids, 'terminate')
  const cancelCustomsOrders = ids => finishWith(ids, 'cancel')

  // ---- 审核资料 ----
  function reviewCustomsMaterials(serviceId, payload = {}) {
    const service = gate(findService(serviceId))
    const errors = validateReviewResult(payload)
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    const approved = Boolean(payload.approved)
    const receipt = `${approved ? '审核通过' : `审核不通过：${text(payload.reason)}`}（${CUSTOMS_NOW}）`
    for (const attachment of service.attachments || []) if (attachment.source === '上游订单') attachment.receipt = receipt
    if (!approved) {
      service.emails ||= []
      service.emails.push({
        id: `${service.id}-E${service.emails.length + 1}`, subject: service.houseNo || service.waybillNo || service.orderNo,
        body: text(payload.reason), signName: session().name, signPhone: '000-00000088',
        to: [...new Set(['客户邮箱（演示）', ...(payload.recipients || [])])], sentAt: CUSTOMS_NOW, attachments: (payload.attachments || []).map(row => row.name),
      })
    }
    trace(service, '审核资料', approved ? '审核通过' : `审核不通过并发送邮件：${text(payload.reason)}`)
    return service
  }
  // ---- 附件 ----
  function uploadCustomsAttachment(serviceId, file) {
    const service = gate(findService(serviceId))
    if (service.handler !== session().name) throw new Error('仅当前接单人可上传附件')
    if (!file?.name) throw new Error('请选择文件')
    const name = uniqueName(service.attachments, file.name)
    const attachment = { id: `${service.id}-A${(service.attachments?.length || 0) + 1}`, name, type: file.type || '其他', source: '当前服务订单', operator: session().name, operatedAt: CUSTOMS_NOW, receipt: '', dataUrl: file.dataUrl || '' }
    service.attachments ||= []
    service.attachments.push(attachment)
    trace(service, '上传附件', name)
    return attachment
  }
  function uniqueName(attachments = [], name) {
    if (!attachments.some(row => row.name === name)) return name
    const dot = name.lastIndexOf('.')
    const base = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    let index = 1
    while (attachments.some(row => row.name === `${base}(${index})${ext}`)) index += 1
    return `${base}(${index})${ext}`
  }
  function deleteCustomsAttachment(serviceId, attachmentId) {
    const service = gate(findService(serviceId))
    const attachment = (service.attachments || []).find(row => row.id === attachmentId)
    if (!attachment) throw new Error('附件不存在')
    if (attachment.source !== '当前服务订单' || attachment.operator !== session().name) throw new Error('只能删除自己上传的附件')
    service.attachments.splice(service.attachments.indexOf(attachment), 1)
    trace(service, '删除附件', attachment.name)
    return true
  }
  // ---- 单证制作 ----
  function generateCustomsDocuments(serviceId, draft = createMaterialDraft()) {
    const service = gate(findService(serviceId))
    const created = []
    for (const [key, label] of [['declaration', '报关单'], ['invoice', '发票'], ['packing', '装箱单'], ['contract', '合同']]) {
      const attachment = { id: `${service.id}-D${(service.attachments?.length || 0) + 1}`, name: `${label}.pdf`, type: label, source: '单证制作', operator: session().name, operatedAt: CUSTOMS_NOW, receipt: '', materialDraft: key === 'declaration' ? clone(draft) : null }
      service.attachments ||= []
      service.attachments.push(attachment)
      created.push(attachment)
    }
    trace(service, '单证制作', `按资料录入生成报关单、发票、装箱单、合同；提运单号 ${text(draft.waybillNo) || '空'}`)
    return created
  }
  // ---- 报关单操作 ----
  function linkService(declaration) { return state.customsServiceOrders.find(row => row.id === declaration.serviceId) }
  function createDeclaration(serviceId, typeLabel = '') {
    const service = gate(findService(serviceId))
    const serial = ++state.customsDeclarationSequence
    const declaration = {
      id: `CD-${String(serial).padStart(3, '0')}`, declarationNo: '', docNo: createDocumentNo(serial), serviceId,
      businessType: service.businessType, importExportFlag: service.businessType === '普货进口' ? '进口' : '出口',
      transportMode: service.transportMode, conveyanceName: '', waybillNo: service.waybillNo || '', domesticConsignor: service.customer,
      creditCode: '', supervisionMode: '一般贸易', declarationCustoms: '', declarationUnit: '广东高捷报关有限公司', declarationDate: '',
      cleared: false, customsType: '代理报关', grossWeight: 0, totalValue: 0, currency: 'CNY', orderNo: service.orderNo, houseNo: service.houseNo || '',
      clerk: session().name, status: '新增', customsStatus: '待申报', typeLabel: typeLabel || (service.businessType === '普货进口' ? '进口整合申报' : '出口一次录入-人工提交'),
      events: {}, copies: [], logs: [], note: '', letterRecord: null,
    }
    state.customsDeclarations.unshift(declaration)
    service.declarationIds ||= []
    service.declarationIds.push(declaration.id)
    trace(service, '新增报关单', `单据编号 ${declaration.docNo}`)
    return declaration
  }
  function saveCustomsPreentry(serviceId, declarationId, preentry, { submit = false } = {}) {
    const service = gate(findService(serviceId))
    let existing = declarationId ? findDeclaration(declarationId) : null
    if (existing && (existing.serviceId !== serviceId || !customsPreentryAccess(existing, session().role, session().name).save)) {
      throw new Error('仅当前接单人可维护新增状态的预录报关单')
    }
    const normalized = normalizeCustomsPreentry(preentry)
    const errors = validateCustomsPreentry(normalized, { submit })
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    const totalValue = normalized.goods.reduce((sum, row) => sum + (Number(row.totalPrice) || 0), 0)
    const grossWeight = Number(normalized.basic.grossWeight) || 0
    const firstCurrency = normalized.goods.find(row => text(row.currency))?.currency || 'CNY'
    if (!existing) {
      const serial = ++state.customsDeclarationSequence
      const declaration = {
        id: `CD-${String(serial).padStart(3, '0')}`, declarationNo: '', docNo: createDocumentNo(serial), serviceId,
        businessType: service.businessType, importExportFlag: service.businessType === '普货进口' ? '进口' : '出口',
        transportMode: service.transportMode, conveyanceName: normalized.basic.vehicleName || '', waybillNo: normalized.basic.waybillNo || '',
        domesticConsignor: normalized.basic.domesticName || service.customer, creditCode: normalized.basic.domesticCreditCode || '',
        supervisionMode: normalized.basic.supervisionMode || '', declarationCustoms: normalized.basic.declarationCustoms || '',
        declarationUnit: normalized.basic.declarantName || '', declarationDate: '', cleared: false,
        customsType: '代理报关', grossWeight, totalValue: Number(totalValue.toFixed(4)), currency: firstCurrency,
        orderNo: service.orderNo, houseNo: service.houseNo || '', clerk: session().name,
        status: submit ? '待复审' : '新增', customsStatus: '待申报', typeLabel: normalized.typeLabel || '进口整合申报',
        preentry: normalized, goods: clone(normalized.goods), events: {}, copies: [], logs: [], note: '', letterRecord: null,
      }
      state.customsDeclarations.unshift(declaration)
      service.declarationIds ||= []
      service.declarationIds.push(declaration.id)
      existing = declaration
    } else {
      Object.assign(existing, {
        preentry: normalized, goods: clone(normalized.goods), waybillNo: normalized.basic.waybillNo || '',
        domesticConsignor: normalized.basic.domesticName || service.customer, creditCode: normalized.basic.domesticCreditCode || '',
        supervisionMode: normalized.basic.supervisionMode || '', declarationCustoms: normalized.basic.declarationCustoms || '',
        declarationUnit: normalized.basic.declarantName || '', grossWeight, totalValue: Number(totalValue.toFixed(4)), currency: firstCurrency,
        status: submit ? '待复审' : '新增', typeLabel: normalized.typeLabel || existing.typeLabel || '进口整合申报',
      })
    }
    if (submit) {
      pushDeclarationLog(existing, '提交审核', `单据编号 ${existing.docNo}；状态变为待复审`)
      trace(service, '提交审核', `报关单 ${existing.docNo} 进入待复审`)
    }
    return existing
  }
  function declarationGate(id) {
    if (!operator()) throw new Error('当前角色不能执行报关单操作')
    const declaration = findDeclaration(id)
    const service = linkService(declaration)
    if (service?.handler && service.handler !== session().name) throw new Error('仅当前接单人可操作该服务的报关单')
    return { declaration, service }
  }
  function pushDeclarationLog(declaration, action, content) {
    declaration.logs ||= []
    declaration.logs.push({ id: `${declaration.id}-L${declaration.logs.length + 1}`, operator: session().name, action, content, time: CUSTOMS_NOW })
  }
  function submitDeclaration(id) {
    const { declaration, service } = declarationGate(id)
    if (!declarationEligibility(declaration).submit) throw new Error('仅新增状态的报关单可提交审核')
    declaration.status = '待复审'
    pushDeclarationLog(declaration, '提交审核', `单据编号 ${declaration.docNo}`)
    if (service) trace(service, '提交审核', `报关单 ${declaration.docNo} 进入待复审`)
    return declaration
  }
  function reviewDeclaration(id, payload = {}) {
    const { declaration, service } = declarationGate(id)
    if (!declarationEligibility(declaration).review) throw new Error('仅待复审的报关单可复审')
    const errors = validateDeclarationReview(payload)
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    declaration.status = payload.approved ? '复审通过' : '复审不通过'
    declaration.reviewNote = text(payload.reason)
    pushDeclarationLog(declaration, '复审', payload.approved ? '复审通过' : `复审不通过：${text(payload.reason)}`)
    if (service) trace(service, '复审', `报关单 ${declaration.docNo} ${payload.approved ? '复审通过' : '复审不通过'}`)
    return declaration
  }
  function sendDeclaration(id, icCard = '') {
    const { declaration, service } = declarationGate(id)
    if (!declarationEligibility(declaration).send) throw new Error('仅复审通过的报关单可发送单一窗口')
    if (!text(icCard)) throw new Error('请填写报关员 IC 卡号（基础数据-数据字典维护）')
    // 接口推送为本地模拟：先发送中，再返回成功并回填海关编号。
    declaration.status = '发送成功'
    declaration.customsStatus = '已申报'
    declaration.customsNo = declaration.customsNo || createCustomsNo(state.customsDeclarationSequence + 100)
    declaration.declarationNo = declaration.customsNo
    declaration.events = { ...(declaration.events || {}), sent: session().name }
    pushDeclarationLog(declaration, '发送单一窗口', `IC 卡 ${icCard}；本地模拟发送成功`)
    if (service) trace(service, '发送单一窗口', `报关单 ${declaration.docNo} 发送成功，海关编号 ${declaration.customsNo}`)
    return declaration
  }
  function copyDeclaration(id) {
    const { declaration, service } = declarationGate(id)
    if (!declarationEligibility(declaration).copy) throw new Error('当前报关单不能复制')
    const serial = ++state.customsDeclarationSequence
    const copy = { ...clone(declaration), id: `CD-${String(serial).padStart(3, '0')}`, docNo: createDocumentNo(serial), status: '新增', declarationNo: '', customsNo: '', customsStatus: '待申报', note: `复制自 ${declaration.docNo}`, copies: [], logs: [], letterRecord: null, events: {} }
    state.customsDeclarations.unshift(copy)
    service.declarationIds.push(copy.id)
    trace(service, '复制报关单', `复制 ${declaration.docNo} → ${copy.docNo}，状态为新增`)
    return copy
  }
  function voidDeclaration(id) {
    const { declaration, service } = declarationGate(id)
    if (!declarationEligibility(declaration).void) throw new Error('当前报关单无法被作废，如需删单，请选择“删单”操作')
    declaration.status = '已作废'
    pushDeclarationLog(declaration, '作废', '作废后单据状态为已作废')
    if (service) trace(service, '作废报关单', declaration.docNo)
    return declaration
  }
  function manageDeclarationCustomsStatus(id, customsStatus) {
    const { declaration, service } = declarationGate(id)
    if (!declarationEligibility(declaration).statusManage) throw new Error('当前状态不能进行报关状态管理操作')
    if (!customsStatus) throw new Error('请选择报关状态')
    declaration.customsStatus = customsStatus
    pushDeclarationLog(declaration, '报关状态管理', `手工选择 ${customsStatus}；海关有新状态时以最新为准`)
    if (service) trace(service, '报关状态管理', `${declaration.docNo} → ${customsStatus}`)
    return declaration
  }
  function recordDeclarationLetter(id, kind, content) {
    const { declaration, service } = declarationGate(id)
    if (!['退单', '挂单'].includes(kind)) throw new Error('仅退单或挂单处理')
    if (declaration.customsStatus !== kind) throw new Error(`当前状态不能进行${kind}处理`)
    if (declaration.letterRecord) throw new Error(`已有${kind}处理记录，请不要重复操作`)
    const errors = validateLetterResult(content)
    if (Object.keys(errors).length) throw new Error(errors.content)
    declaration.letterRecord = { kind, content: text(content), operator: session().name, time: CUSTOMS_NOW }
    pushDeclarationLog(declaration, `${kind}处理`, text(content))
    if (service) trace(service, `${kind}处理`, `${declaration.docNo}：${text(content)}`)
    return declaration
  }
  function arrangeCustomsInspection(serviceId, payload = {}) {
    const service = gate(findService(serviceId))
    if (!text(payload.inspector)) throw new Error('请选择查验员')
    if (!text(payload.declarationNo)) throw new Error('请填写报关单号')
    const inspection = { id: `CI-${String(++state.customsInspectionSequence).padStart(4, '0')}`, inspector: payload.inspector, declarationNo: payload.declarationNo, waybillNo: text(payload.waybillNo), createdAt: CUSTOMS_NOW, result: '' }
    service.inspections ||= []
    service.inspections.push(inspection)
    trace(service, '安排查验', `查验员 ${inspection.inspector}；报关单号 ${inspection.declarationNo}`)
    return inspection
  }
  return {
    acceptCustomsOrders, transferCustomsOrders, terminateCustomsOrders, cancelCustomsOrders,
    reviewCustomsMaterials, uploadCustomsAttachment, deleteCustomsAttachment, generateCustomsDocuments,
    createDeclaration, saveCustomsPreentry, submitDeclaration, reviewDeclaration, sendDeclaration, copyDeclaration, voidDeclaration,
    manageDeclarationCustomsStatus, recordDeclarationLetter, arrangeCustomsInspection,
  }
}
