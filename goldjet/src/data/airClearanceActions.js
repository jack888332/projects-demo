import { airClearanceSources, canManageAirClearances, clearanceOperationTime, deriveAirClearances } from '../domain/airClearances.js'
import { getAirServiceMaterialFile } from '../domain/airServiceMaterials.js'

export function createAirClearanceActions(state, getSession, getNow = clearanceOperationTime) {
  function authorize() {
    if (!canManageAirClearances(getSession())) throw new Error('仅海外部客服可处理清关派送指令')
  }
  function resolve(id) {
    const matches = airClearanceSources(state).filter(row => row.service.id === id)
    if (matches.length !== 1) throw new Error('清关派送服务不存在或标识不唯一，请重新查询')
    return matches[0]
  }
  function acceptAirClearance(id) {
    authorize()
    const { service } = resolve(id)
    const row = deriveAirClearances(state).find(row => row.id === id)
    if (row.acceptanceBlockReason) throw new Error(row.acceptanceBlockReason)
    const acceptance = { actor: getSession().name, time: getNow() }
    service.acceptance = acceptance
    return acceptance
  }
  function getAirClearanceFiles(targets) {
    authorize()
    if (!Array.isArray(targets) || !targets.length) throw new Error('请选择要下载的材料')
    const seen = new Set(), rows = deriveAirClearances(state)
    return targets.map(target => {
      if (!target || typeof target.serviceId !== 'string' || typeof target.materialId !== 'string') throw new Error('材料选择无效')
      const key = JSON.stringify([target.serviceId, target.materialId])
      if (seen.has(key)) throw new Error('不能重复选择同一材料')
      seen.add(key); resolve(target.serviceId)
      const materials = rows.find(row => row.id === target.serviceId).materials.filter(row => row.id === target.materialId)
      if (materials.length !== 1) throw new Error('材料不存在或标识不唯一，请重新选择')
      return getAirServiceMaterialFile(materials[0])
    })
  }
  return { acceptAirClearance, getAirClearanceFiles }
}
