export function financeExtensionCeiling(key, persona) {
  if(['bigscreen','ddpFlows'].includes(key))return {menu:false,page:false,data:false,write:false}
  if(key==='reports'){const read=['warehouseSupervisor','groundSupervisor','groundTransportSupervisor','financeSupervisor'].includes(persona);return {menu:read,page:read,data:read,write:false}}
  if(persona==='financeSupervisor'){const read=['dashboard','messages'].includes(key);return {menu:read,page:read,data:read,write:false}}
  if(key==='statementTemplates'){const read=['service','business'].includes(persona);return {menu:read,page:read,data:read,write:false}}
  if(key==='invoices'){const read=persona==='financeAccountant';return {menu:read,page:read,data:read,write:read}}
  if (key === 'reimbursements') {
    const read = ['financeClerk', 'financeAccountant'].includes(persona)
    return {menu:read,page:read,data:read,write:false}
  }
  if (key !== 'writeoffs') return null
  const read = ['finance', 'financeAccountant', 'financeCashier', 'financeInformation'].includes(persona)
  return { menu: read, page: read, data: read, write: false }
}
