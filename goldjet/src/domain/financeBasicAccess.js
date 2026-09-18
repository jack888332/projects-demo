export const FINANCE_BASIC_MODULES = ['exchangeRates', 'costItems', 'departmentCosts', 'invoiceEntities', 'bankAccounts']
export const FINANCE_BASIC_ACCOUNTS = {
  financeAccountant: { role: 'accountant', companyId: 'FIN-DEMO-A', organizationId:'FIN-DEMO-ORG-A', departmentId:'FIN-DEMO-D1', departmentIds: ['FIN-DEMO-D1'] },
  financeAdmin: { role: 'admin' },
  financeClerk: { role:'finance' },
  financeInformation: { role:'information', companyId:'FIN-DEMO-A', departmentIds:['FIN-DEMO-D1'] },
  business: { role:'business', companyId:'FIN-DEMO-A', departmentIds:['FIN-DEMO-D1'] },
}
const readRoles = { exchangeRates: ['financeAccountant'], costItems: ['financeAdmin'], departmentCosts:['financeAccountant','business','financeInformation'], invoiceEntities:['financeClerk','business'], bankAccounts:['financeAccountant'] }
const writeRoles = readRoles
export function financeBasicCeiling(key, persona) {
  if (!FINANCE_BASIC_MODULES.includes(key)) {
    if (!FINANCE_BASIC_ACCOUNTS[persona] || persona === 'business') return null
    const read = ['dashboard','messages'].includes(key)
    return { menu: read, page: read, data: read, write: false }
  }
  const read = (readRoles[key] || []).includes(persona)
  return { menu: read, page: read, data: read, write: (writeRoles[key] || []).includes(persona) }
}
