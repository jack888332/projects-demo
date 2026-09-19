import { reactive } from 'vue'
import { moduleCatalog } from '../domain/catalog.js'
import { WORKBENCH_PERSONAS } from '../domain/workbenchTasks.js'
import { groundAccount } from '../domain/groundService.js'
import { financeBasicCeiling } from '../domain/financeBasicAccess.js'
import { orderCostCeiling } from '../domain/orderCostAccess.js'
import { reconciliationCeiling } from '../domain/reconciliationAccess.js'
import { financeApplicationCeiling } from '../domain/financeApplicationAccess.js'
import { financeExtensionCeiling } from '../domain/financeExtensionAccess.js'

export const workbenchSession = reactive({ personaId: 'service' })
export const accessState = reactive({ policies: {}, groundOperations: {}, revision: 0, history: [] })
const defaults = key => ({ menu: key !== 'permissions', page: key !== 'permissions', data: key !== 'permissions', write: key !== 'permissions' })
export const isSuperAdmin = () => workbenchSession.personaId === 'superAdmin'
export const stationAccessCeiling = key => ({ menu: ['dashboard','stationPallet','messages'].includes(key), page: ['dashboard','stationPallet','messages'].includes(key), data: ['dashboard','stationPallet','messages','costs'].includes(key), write: key === 'stationPallet' })

export function getModuleAccess(key, personaId = workbenchSession.personaId) {
  if (!Object.hasOwn(moduleCatalog, key)) return { menu: false, page: false, data: false, write: false }
  if (personaId === 'superAdmin') return { menu: true, page: true, data: true, write: key === 'permissions' }
  if (key === 'permissions') return { menu: false, page: false, data: false, write: false }
  const financeCeiling = financeExtensionCeiling(key,personaId) || financeApplicationCeiling(key,personaId) || reconciliationCeiling(key,personaId) || orderCostCeiling(key,personaId) || financeBasicCeiling(key,personaId)
  if (financeCeiling) return Object.fromEntries(Object.entries(financeCeiling).map(([field,allowed]) => [field,allowed && accessState.policies[personaId]?.[key]?.[field] !== false]))
  if (personaId === 'driver' && !['driver', 'groundService'].includes(key)) return { menu: false, page: false, data: false, write: false }
  if (['groundWarehouse', 'groundStation'].includes(personaId) && key !== 'groundService') return { menu: false, page: false, data: false, write: false }
  if (personaId === 'stationPallet') return Object.fromEntries(Object.entries(stationAccessCeiling(key)).map(([field,allowed]) => [field,allowed && accessState.policies[personaId]?.[key]?.[field] !== false]))
  return { ...defaults(key), ...accessState.policies[personaId]?.[key] }
}

export const canReadModule = (key, personaId) => {
  const rule = getModuleAccess(key, personaId)
  return rule.page && rule.data
}
export const canWriteModule = key => canReadModule(key) && getModuleAccess(key).write
export const canSeeMenu = key => getModuleAccess(key).menu && getModuleAccess(key).page
export const groundServicePermissions = personaId => accessState.groundOperations[personaId] ?? groundAccount(personaId)?.operations ?? []
export function saveGroundServicePermissions(personaId, operations) {
  if (!isSuperAdmin()) throw new Error('仅超级管理员可配置操作权限')
  const allowed = groundAccount(personaId)?.operations
  if (!allowed || !Array.isArray(operations) || operations.some(id => !allowed.includes(id))) throw new Error('不能扩张当前岗位的业务授权')
  const next = [...new Set(operations)]
  if (JSON.stringify(next) === JSON.stringify(groundServicePermissions(personaId))) return false
  accessState.groundOperations[personaId] = next
  accessState.revision++
  accessState.history.unshift({ id: accessState.revision, role: personaId, modules: ['groundService'], actor: '超级管理员', action: '配置地面操作项' })
  return true
}
export function canReadTarget(target) {
  const path = typeof target === 'string' ? target.split('?')[0] : target?.path
  if (!path) return false
  const key = Object.keys(moduleCatalog).sort((a, b) => moduleCatalog[b].path.length - moduleCatalog[a].path.length)
    .find(key => path === moduleCatalog[key].path || path.startsWith(moduleCatalog[key].path + '/'))
  if (key) return canReadModule(key)
  if (path === '/fulfillment/ground-monthly') return canReadModule('groundDispatch')
  if (path === '/fulfillment/airway-bill-templates') return canReadModule('airwayBills')
  return false
}

export function rolePermissionDraft(personaId) {
  return Object.fromEntries(Object.keys(moduleCatalog).map(key => [key, { ...getModuleAccess(key, personaId) }]))
}

export function saveRolePermissions(personaId, draft) {
  if (!isSuperAdmin()) throw new Error('仅超级管理员可配置角色权限')
  if (personaId === 'superAdmin') throw new Error('超级管理员的全量查看和权限管理权限不可关闭')
  if (!WORKBENCH_PERSONAS.some(role => role.id === personaId)) throw new Error('角色不存在')
  const next = {}
  for (const key of Object.keys(moduleCatalog)) {
    const rule = draft?.[key]
    if (!rule || ['menu', 'page', 'data', 'write'].some(field => typeof rule[field] !== 'boolean')) throw new Error('权限配置不完整')
    if (key === 'permissions' && (rule.menu || rule.page || rule.data || rule.write)) throw new Error('权限管理仅向超级管理员开放')
    const financeCeiling = financeExtensionCeiling(key,personaId) || financeApplicationCeiling(key,personaId) || reconciliationCeiling(key,personaId) || orderCostCeiling(key,personaId) || financeBasicCeiling(key,personaId)
    if (financeCeiling && Object.entries(rule).some(([field,value]) => value && !financeCeiling[field])) throw new Error('不能扩张财务模块的岗位权限')
    if (personaId === 'driver' && !['driver', 'groundService'].includes(key) && Object.values(rule).some(Boolean)) throw new Error('司机仅可访问本人司机端任务和已授权地面操作，不能授权后台模块')
    if (['groundWarehouse', 'groundStation'].includes(personaId) && key !== 'groundService' && Object.values(rule).some(Boolean)) throw new Error('地面服务岗位不能授权后台模块')
    if (personaId === 'stationPallet' && Object.entries(rule).some(([field,value]) => value && !stationAccessCeiling(key)[field])) throw new Error('不能扩张货站打板岗位的模块权限')
    next[key] = { menu: rule.menu, page: rule.page, data: rule.data, write: rule.write }
  }
  const before = rolePermissionDraft(personaId)
  const changed = Object.keys(next).filter(key => JSON.stringify(before[key]) !== JSON.stringify(next[key]))
  if (!changed.length) return false
  accessState.policies[personaId] = next
  accessState.revision++
  accessState.history.unshift({ id: accessState.revision, role: personaId, modules: changed, actor: '超级管理员', action: '保存权限' })
  return true
}

export function resetRolePermissions(personaId) {
  const draft = Object.fromEntries(Object.keys(moduleCatalog).map(key => [key, financeExtensionCeiling(key,personaId) || financeApplicationCeiling(key,personaId) || reconciliationCeiling(key,personaId) || orderCostCeiling(key,personaId) || financeBasicCeiling(key,personaId) || (personaId === 'stationPallet' ? stationAccessCeiling(key) : (personaId === 'driver' && !['driver', 'groundService'].includes(key)) || (['groundWarehouse', 'groundStation'].includes(personaId) && key !== 'groundService') ? { menu: false, page: false, data: false, write: false } : defaults(key))]))
  return saveRolePermissions(personaId, draft)
}

export function resetAccessControl() {
  accessState.policies = {}
  accessState.groundOperations = {}
  accessState.history = []
  accessState.revision++
}

// Denials are enforced at the data owner as well as at the rendered command.
export function guardModuleActions(keys, actions) {
  return guardAccess(keys, actions, canWriteModule, '当前角色未获该业务操作授权')
}

export function guardModuleReads(keys, actions) {
  return guardAccess(keys, actions, canReadModule, '当前角色未获该数据查看授权')
}

function guardAccess(keys, actions, permits, message) {
  const modules = Array.isArray(keys) ? keys : [keys]
  return Object.fromEntries(Object.entries(actions).map(([name, action]) => [name, (...args) => {
    if (!modules.every(key => permits(key))) throw new Error(message)
    return action(...args)
  }]))
}
