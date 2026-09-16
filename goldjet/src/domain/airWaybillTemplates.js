export const AIR_WAYBILL_TEMPLATE_TYPES = [
  '提单（有格式）', '中性提单（有格式）', '中性提单（无格式）', '中性提单（TPE）',
  '中性提单（电池）', 'UPS提单（有格式）', 'UPS提单（无格式）', '舱单',
  '分单（有格式）', '分单（无格式）', '托运书',
]
export const AIR_WAYBILL_TEMPLATE_ACCEPT = '.doc,.docx,.xlsx,.xls'
export const AIR_WAYBILL_TEMPLATE_MAX_BYTES = 20 * 1024 * 1024

export function canManageAirWaybillTemplates(session = {}) {
  return ['product', 'technical'].includes(session.role)
}

export function createAirWaybillTemplateDraft() {
  return { airlineCode: '', type: '', file: null }
}

export function validateAirWaybillTemplateFile(file) {
  if (!file) return '请选择模板文件'
  if (typeof File === 'undefined' || !(file instanceof File)) return '模板原文件不可用，请重新选择'
  if (!/\.(doc|docx|xlsx|xls)$/i.test(file.name)) return '仅支持 DOC、DOCX、XLSX、XLS 格式'
  if (file.size > AIR_WAYBILL_TEMPLATE_MAX_BYTES) return '单个文件不能超过 20 MB'
  return ''
}

export function validateAirWaybillTemplateDraft(draft, state) {
  const errors = {}
  if (!(state.airMaster?.airlines || []).some(row => row.code === draft.airlineCode)) errors.airlineCode = '请选择航司管理中的航司代码'
  if (!AIR_WAYBILL_TEMPLATE_TYPES.includes(draft.type)) errors.type = '请选择模板类型'
  const fileError = validateAirWaybillTemplateFile(draft.file)
  if (fileError) errors.file = fileError
  if (draft.airlineCode && draft.type && (state.airWaybillTemplates || []).some(row => row.airlineCode === draft.airlineCode && row.type === draft.type)) {
    errors.duplicate = '该航司已有同类型模板；重复上传的版本或替换规则待确认'
  }
  return errors
}

export function filterAirWaybillTemplates(rows = [], filters = {}) {
  return rows.filter(row => (!filters.airlineCode || row.airlineCode === filters.airlineCode)
    && (!filters.type || row.type === filters.type)
    && (!filters.status || row.status === filters.status))
}
