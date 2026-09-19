export const RECONCILIATION_CREATE_ROLES = ['service', 'business', 'financeClerk']
export const RECONCILIATION_CONFIRM_ROLES = ['service']

export function reconciliationCeiling(key, persona) {
  if (key !== 'reconciliation') return null
  const allowed = RECONCILIATION_CREATE_ROLES.includes(persona)
  return { menu: allowed, page: allowed, data: allowed, write: allowed }
}
