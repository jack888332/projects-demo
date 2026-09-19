export const APPLICATION_READ_ROLES = ['service', 'supervisor', 'financeAccountant', 'business', 'finance']
export function financeApplicationCeiling(key, persona) {
  if (key !== 'paymentRequests') return null
  const read = APPLICATION_READ_ROLES.includes(persona)
  return { menu: read, page: read, data: read, write: persona === 'financeAccountant' }
}
export const canReadApplicationKind = (kind, persona) => ['receipt', 'payment'].includes(kind) &&
  (persona === 'superAdmin' || (kind === 'receipt' ? persona === 'financeAccountant' : APPLICATION_READ_ROLES.includes(persona)))
