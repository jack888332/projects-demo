const normalizeRelation = (relation = {}) => {
  const normalized = {
    store:relation.store || relation.shop || '',
    group:relation.group || relation.customerGroup || '',
    memberCode:relation.memberCode || relation.member || '',
  }
  if (relation.groupStore) normalized.groupStore = relation.groupStore
  return normalized
}

const sourceRelationsFor = (customer = {}) => {
  const source = customer.relations || customer.customerRelations || []
  return source.map(normalizeRelation)
}

export function validateCustomerIdentity(customer = {}) {
  const relations = sourceRelationsFor(customer)
  const stores = new Set(relations.map(item => item.store).filter(Boolean))
  const memberCodes = new Set(relations.map(item => item.memberCode).filter(Boolean))
  ;(customer.stores || customer.shops || []).filter(Boolean).forEach(value => stores.add(value))
  ;(customer.memberCodes || []).filter(Boolean).forEach(value => memberCodes.add(value))
  if (customer.store || customer.shop) stores.add(customer.store || customer.shop)
  if (customer.memberCode) memberCodes.add(customer.memberCode)
  const issues = []
  if (stores.size > 1) issues.push('同一会员存在多个当前所属店铺')
  if (memberCodes.size > 1) issues.push('客户与会员不是一一对应关系')
  if (relations.some(item => item.group && item.groupStore && item.groupStore !== item.store)) issues.push('客户组不属于会员当前所属店铺')
  return { valid:issues.length === 0, issues }
}

export function customerRelationsFor(customer = {}) {
  const source = sourceRelationsFor(customer)
  const store = customer.store || customer.shop || ''
  const group = customer.group || customer.customerGroup || ''
  const memberCode = customer.memberCode || ''
  const sourceIdentity = source.find(relation => (
    (!store || relation.store === store)
    && (!memberCode || relation.memberCode === memberCode)
  )) || source[0]
  const identity = {
    store:store || sourceIdentity?.store || '',
    group:group || sourceIdentity?.group || '',
    memberCode:memberCode || sourceIdentity?.memberCode || '',
  }
  return identity.store || identity.group || identity.memberCode ? [identity] : []
}

export function customerRelationSummary(customer = {}) {
  const relations = customerRelationsFor(customer)
  const identity = relations[0] || { store:'', group:'', memberCode:'' }
  return {
    relations,
    store:identity.store,
    group:identity.group,
    memberCode:identity.memberCode,
    stores:identity.store ? [identity.store] : [],
    groups:identity.group ? [identity.group] : [],
    memberCodes:identity.memberCode ? [identity.memberCode] : [],
  }
}

export function matchCustomerRelations(customer, { stores = [], groups = [] } = {}) {
  const summary = customerRelationSummary(customer)
  const storeValues = Array.isArray(stores) ? stores : stores ? [stores] : []
  const groupValues = Array.isArray(groups) ? groups : groups ? [groups] : []
  const matchedRelations = summary.relations.filter(relation => (
    (!storeValues.length || storeValues.includes(relation.store))
    && (!groupValues.length || groupValues.includes(relation.group))
  ))
  return {
    ...summary,
    matchedRelations:storeValues.length || groupValues.length ? matchedRelations : summary.relations,
    matches:!storeValues.length && !groupValues.length ? true : matchedRelations.length > 0,
  }
}
