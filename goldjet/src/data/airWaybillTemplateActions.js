import { canManageAirWaybillTemplates, validateAirWaybillTemplateDraft, validateAirWaybillTemplateFile } from '../domain/airWaybillTemplates.js'
import { GROUND_NOW } from '../domain/groundOperations.js'

export function createAirWaybillTemplateActions(state, getSession) {
  function requirePermission() {
    if (!canManageAirWaybillTemplates(getSession())) throw new Error('仅产品人员和技术人员可管理提单模板')
  }
  function saveAirWaybillTemplate(draft) {
    requirePermission()
    const errors = validateAirWaybillTemplateDraft(draft || {}, state)
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fields: errors })
    const sequence = (state.airWaybillTemplateSequence || 0) + 1
    const record = {
      id: `AIR-TEMPLATE-${String(sequence).padStart(4, '0')}`,
      airlineCode: draft.airlineCode, type: draft.type, file: draft.file,
      createdAt: GROUND_NOW, creator: getSession().name || '', status: '已上传',
    }
    state.airWaybillTemplates ||= []
    state.airWaybillTemplates.push(record)
    state.airWaybillTemplateSequence = sequence
    return record
  }
  function getAirWaybillTemplateFiles(ids) {
    if (!getSession().readAll) requirePermission()
    if (!Array.isArray(ids) || !ids.length) throw new Error('请至少选择一条模板')
    return [...new Set(ids)].map(id => {
      const record = (state.airWaybillTemplates || []).find(row => row.id === id)
      if (!record) throw new Error('所选模板已不存在，请重新选择')
      if (validateAirWaybillTemplateFile(record.file)) throw new Error(`“${record.type}”的模板原文件不可用，请重新上传`)
      return { id: record.id, file: record.file }
    })
  }
  return { saveAirWaybillTemplate, getAirWaybillTemplateFiles }
}
