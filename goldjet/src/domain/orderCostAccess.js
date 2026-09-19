export const COST_ENTRY_ROLES = ['service', 'business']
export const COST_EDIT_ROLES = ['service']
export const COST_APPROVAL_STAGES = { supervisor: '已提交', financeAccountant: '业务审批通过' }

export function orderCostCeiling(key, persona) {
  if (key !== 'costs') return null
  const read = [...COST_ENTRY_ROLES, ...Object.keys(COST_APPROVAL_STAGES)].includes(persona)
  const related = ['hangsheng', 'groundSupervisor', 'warehouseService', 'warehouseSupervisor', 'stationPallet'].includes(persona)
  return { menu: read, page: read || (related && persona !== 'stationPallet'), data: read || related, write: read }
}
