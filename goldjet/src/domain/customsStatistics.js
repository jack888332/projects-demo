// PRD 032 关务查询与统计：报关数据查询、部门汇总、成员工作量与南沙业务统计。
// 统计只投影既有服务单与报关单；日期按服务完成时间或报关申报日期归期，PRD 未唯一确定的日期字段与 CUSTOMS-B042/B043 保留待确认。
export const CUSTOMS_BUSINESS_TYPES = ['普货进口', '普货出口', 'BC出口', 'BC进口', 'CC进口', 'BBC进口']
export const NANSHA_TYPES = ['全部', '一线进区', '二线调拨', '包裹出区', '快递车辆', '物料']
export const CUSTOMS_DEPARTMENTS = {
  普货进口: '空运报关部', 普货出口: '空运报关部', BC出口: '出口快件部', BC进口: '进口快件部', CC进口: '个人物品报关部', BBC进口: 'BBC报关部',
}
export const NANSHA_ORDER_TYPES = {
  一线进区: ['一线进境'],
  二线调拨: ['区间调拨', '区内调拨', '简单加工', '保税展示'],
  包裹出区: ['包裹出区'],
  物料: ['物料进区'],
}

const text = value => String(value ?? '').trim()

export function customsStatisticsPermissions(role) {
  // 关务统计按 PRD 仅关务部总监可见；演示角色中暂无总监，暂由报关行客服与超级管理员查看并记录边界。
  const allowed = ['customsService', 'superAdmin'].includes(role)
  return { query: allowed, stats: allowed, read: true }
}

export function customsDepartmentClerks(state, businessType) {
  const department = CUSTOMS_DEPARTMENTS[businessType]
  return [...new Set((state.customsServiceOrders || []).filter(service => service.department === department).map(service => service.clerk).filter(Boolean))]
}

function withinRange(date, range) {
  if (!Array.isArray(range) || !range.some(Boolean)) return true
  const day = String(date || '').slice(0, 10)
  return Boolean(day) && (!range[0] || day >= range[0]) && (!range[1] || day <= range[1])
}

export function filterDeclarations(rows, filters = {}) {
  const fuzzy = (value, query) => !text(query) || String(value || '').toLowerCase().includes(text(query).toLowerCase())
  return rows.filter(row =>
    (!text(filters.declarationNo) || row.declarationNo === text(filters.declarationNo)) &&
    (!text(filters.waybillNo) || row.waybillNo === text(filters.waybillNo)) &&
    (!filters.importExportFlag || row.importExportFlag === filters.importExportFlag) &&
    fuzzy(row.declarationCustoms, filters.declarationCustoms) &&
    fuzzy(row.domesticConsignor, filters.domesticConsignor) &&
    fuzzy(row.declarationUnit, filters.declarationUnit) &&
    (!filters.cleared || String(row.cleared) === filters.cleared) &&
    withinRange(row.declarationDate, filters.declarationRange))
}

function completedServices(state, { range, businessType } = {}) {
  return (state.customsServiceOrders || []).filter(service =>
    service.businessType === businessType && service.status === '已完成' && withinRange(service.completedAt, range))
}

function linkedDeclarations(state, services) {
  const ids = new Set(services.flatMap(service => service.declarationIds || []))
  const seen = new Set()
  return (state.customsDeclarations || []).filter(declaration => ids.has(declaration.id) && !seen.has(declaration.declarationNo) && seen.add(declaration.declarationNo))
}

export function departmentSummary(state, query = {}) {
  const completed = completedServices(state, query)
  const declarations = linkedDeclarations(state, completed)
  const amounts = {}
  for (const declaration of declarations) amounts[declaration.currency] = (amounts[declaration.currency] || 0) + Number(declaration.totalValue || 0)
  const transport = { 空运: 0, 海运: 0, 陆运: 0 }
  for (const service of completed) if (Object.hasOwn(transport, service.transportMode)) transport[service.transportMode] += 1
  const all = (state.customsServiceOrders || []).filter(service => service.businessType === query.businessType && !['已取消', '已终止'].includes(service.status) && withinRange(service.completedAt || service.createdAt, query.range))
  const done = all.filter(service => service.status === '已完成').length
  const unfinished = all.length - done
  return {
    businessType: query.businessType,
    tickets: declarations.length,
    totalWaybills: new Set(completed.map(service => service.orderNo).filter(Boolean)).size,
    houseBills: new Set(completed.flatMap(service => (service.houseNo || '').split(/[、,]/).map(row => row.trim()).filter(Boolean))).size,
    totalWeight: Number(declarations.reduce((total, declaration) => total + Number(declaration.grossWeight || 0), 0).toFixed(2)),
    amounts: Object.entries(amounts).map(([currency, amount]) => ({ currency, amount: Number(amount.toFixed(2)) })),
    transport,
    completion: { completed: done, unfinished, ratio: all.length ? Number((done / all.length).toFixed(4)) : null, note: all.length ? '' : '无有效服务单，完成率分母为零待确认' },
  }
}

export function memberSummary(state, query = {}) {
  const completed = completedServices(state, query)
  const clerks = query.clerk ? [query.clerk] : customsDepartmentClerks(state, query.businessType)
  const crossBorder = query.businessType !== '普货进口' && query.businessType !== '普货出口'
  const rows = clerks.map(clerk => {
    const mine = completed.filter(service => service.clerk === clerk)
    const declarations = linkedDeclarations(state, mine)
    if (crossBorder) {
      const waybills = new Set(mine.flatMap(service => service.waybillNos?.length ? service.waybillNos : [service.orderNo]).filter(Boolean)).size
      return {
        clerk,
        parcels: mine.reduce((total, service) => total + Number(service.parcelCount || 0), 0),
        totalWaybills: waybills,
      }
    }
    const metrics = {}
    for (const customsType of ['单证报关', '代理报关']) {
      const group = declarations.filter(declaration => declaration.customsType === customsType)
      const errors = group.filter(declaration => declaration.events?.amended || declaration.events?.deleted).length
      metrics[`${customsType}`] = group.length
      metrics[`${customsType}Error`] = errors
      metrics[`${customsType}Rate`] = group.length ? Number((errors / group.length).toFixed(4)) : null
    }
    const countEvent = key => declarations.filter(declaration => declaration.events?.[key] === clerk).length
    return { clerk, ...metrics, sends: countEvent('sent'), deletes: countEvent('deleted'), amends: countEvent('amended'), deletedReturns: countEvent('deletedReturn'), inspections: countEvent('inspected'), loads: countEvent('loaded'), reconfigure: countEvent('reconfigured') }
  })
  return { rows, variant: crossBorder ? 'crossBorder' : 'general', zeroDenominator: rows.some(row => row['单证报关Rate'] === null || row['代理报关Rate'] === null) }
}

export function nanshaStatistics(state, { fromMonth, toMonth, businessType = '全部' } = {}) {
  const months = []
  if (fromMonth && toMonth) {
    let [year, month] = fromMonth.split('-').map(Number)
    const [endYear, endMonth] = toMonth.split('-').map(Number)
    while (year < endYear || (year === endYear && month <= endMonth)) {
      months.push(`${year}-${String(month).padStart(2, '0')}`)
      month += 1
      if (month > 12) { month = 1; year += 1 }
    }
  }
  const services = (state.customsServiceOrders || []).filter(service => service.businessType === 'BBC进口' && service.status === '已完成')
  const sealDocuments = state.customsSealDocuments || []
  function monthKey(service) { return String(service.completedAt || '').slice(0, 7) }
  const rangeServices = months.length ? services.filter(service => months.includes(monthKey(service))) : services
  function sealsFor(servicesInScope) {
    const ids = new Set(servicesInScope.map(service => service.id))
    return sealDocuments.filter(seal => ids.has(seal.serviceId))
  }
  function typeCount(type, servicesOfMonth) {
    const target = NANSHA_ORDER_TYPES[type]
    if (!target) return { count: 0, inspections: 0 }
    const matched = servicesOfMonth.filter(service => target.includes(service.orderType))
    const inspections = matched.filter(service => linkedDeclarations(state, [service]).some(declaration => declaration.events?.inspected)).length
    return { count: matched.length, inspections }
  }
  function rowFor(type, servicesOfMonth) {
    if (type === '快递车辆') {
      const seals = sealsFor(servicesOfMonth)
      return { count: seals.length, inspections: seals.filter(seal => seal.inspectNo).length }
    }
    return typeCount(type, servicesOfMonth)
  }
  if (businessType === '全部') {
    const composition = ['一线进区', '二线调拨', '包裹出区', '快递车辆', '物料'].map(type => {
      const value = rowFor(type, rangeServices).count
      return { type, value }
    })
    const total = composition.reduce((sum, item) => sum + item.value, 0)
    for (const item of composition) item.ratio = total ? Number((item.value / total).toFixed(4)) : null
    return { type: '全部', months: [], composition, total: total || 0, ratioNote: total ? '' : '合计为零，占比待确认' }
  }
  const rows = months.map(month => {
    const servicesOfMonth = services.filter(service => monthKey(service) === month)
    const value = rowFor(businessType, servicesOfMonth)
    return { month, count: value.count, inspections: value.inspections, total: value.count + value.inspections }
  })
  return { type: businessType, rows, months, total: rows.reduce((sum, row) => sum + row.total, 0) || 0 }
}
