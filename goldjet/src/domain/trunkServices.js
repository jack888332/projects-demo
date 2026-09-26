// PRD 023 空运-干线服务：委外空运与我司空运的查询、订舱及执行信息。
export const TRUNK_NOW = '2026-09-08 14:30'
export const TRUNK_MODES = ['委外空运', '我司空运']
export const TRUNK_STATUSES = ['待接单', '进行中', '已完成', '已取消', '已终止']
export const TRUNK_FOAM_RATIOS = ['全部', '0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1']
export const TRUNK_SPECIAL_CARGO = ['全部', '锂电池', '危险品', '鲜活', '枪械']
export const TRUNK_SUPPLIERS = ['东方航空', '南方航空', '全日空']
export const TRUNK_AIRLINES = ['MU 东方航空', 'CZ 南方航空', 'NH 全日空']

const text = value => String(value ?? '').trim()

export function trunkPermissions(role) {
  const operator = ['service', 'supervisor', 'business'].includes(role)
  return {
    book: operator, execute: operator, complete: operator, read: true,
  }
}

export function createTrunkDraft(mode = '委外空运') {
  const outsourced = mode === '委外空运'
  return {
    id: '', mode, serviceNo: '', orderId: '', orderNo: '', waybillNo: '', platformOrderNo: '', customer: '', businessType: '出口空运',
    status: '待接单', createdAt: '', acceptedAt: '', completedAt: '', node: '',
    supplier: '', airline: '', flight: '', actualDeparture: '',
    origin: '', destination: '', foamRatio: '全部', salesperson: '', departureDate: '', flightNo: '', specialCargo: '全部', waybillAttribute: '',
    cargo: { pieces: '', weight: '', volume: '', size: '', description: '' },
    cost: '', guidePrice: '', internalSettlementFoam: '', routeRemark: '', palletCompany: '',
    flights: outsourced ? [] : [{ departDate: '', flight: '', takeoffTime: '', arrivalTime: '' }],
    attachments: [],
  }
}

export function validateTrunkBooking(draft, { submit = false } = {}) {
  const errors = {}
  const value = draft || {}
  if (submit) {
    for (const [key, label] of [['supplier', '供应商'], ['waybillNo', '总运单号'], ['airline', '航司'], ['flight', '航班号'], ['actualDeparture', '实际出港时间']]) {
      if (!text(value[key])) errors[key] = `请填写${label}`
    }
    for (const [key, label] of [['cost', '成本'], ['guidePrice', '指导价']]) {
      if (text(value[key]) && (!(Number(value[key]) > 0) || !/^\d+(?:\.\d{1,2})?$/.test(String(value[key])))) errors[key] = `${label}须为正数并保留两位小数`
    }
    for (const [key, label] of [['foamRatio', '成本分泡'], ['internalSettlementFoam', '内部结算分泡']]) {
      if (text(value[key]) && !/^(?:0(?:\.\d)?|1(?:\.0)?)$/.test(String(value[key]))) errors[key] = `${label}须为 0 至 1、保留一位小数`
    }
    if (text(value.routeRemark).length > 256) errors.routeRemark = '航线备注最多 256 字'
    if (!value.flights?.length) errors.flights = '航班明细至少一行'
    value.flights?.forEach((row, index) => {
      if (!text(row.departDate)) errors[`flights.${index}.departDate`] = '请选择航班日期'
      if (!text(row.flight)) errors[`flights.${index}.flight`] = '请填写航班号'
    })
  }
  return errors
}

export function filterTrunkServices(rows, filters = {}, mode = '委外空运') {
  const fuzzy = (value, query) => !text(query) || String(value || '').toLowerCase().includes(text(query).toLowerCase())
  const inRange = (value, bounds) => {
    if (!Array.isArray(bounds) || !bounds.some(Boolean)) return true
    const date = String(value || '').slice(0, 10)
    return Boolean(date) && (!bounds[0] || date >= bounds[0]) && (!bounds[1] || date <= bounds[1])
  }
  return rows.filter(row => {
    if (row.mode !== mode) return false
    if (!fuzzy(row.waybillNo, filters.waybillNo)) return false
    if (!fuzzy(row.platformOrderNo, filters.platformOrderNo)) return false
    if (!fuzzy(row.serviceNo, filters.serviceNo)) return false
    if (!fuzzy(row.customer, filters.customer)) return false
    if (filters.businessType && row.businessType !== filters.businessType) return false
    if (mode === '我司空运') {
      if (!fuzzy(row.orderNo, filters.orderNo)) return false
      if (filters.origin && row.origin !== filters.origin) return false
      if (filters.destination && row.destination !== filters.destination) return false
      if (filters.salesperson && row.salesperson !== filters.salesperson) return false
      if (filters.foamRatio && filters.foamRatio !== '全部' && row.foamRatio !== filters.foamRatio) return false
      if (filters.specialCargo && filters.specialCargo !== '全部' && row.specialCargo !== filters.specialCargo) return false
      if (filters.flightNo && row.flightNo !== filters.flightNo.trim()) return false
      if (filters.airline && row.airline !== filters.airline) return false
      if (!inRange(row.departureDate, filters.departureRange)) return false
      if (!inRange(row.createdAt, filters.createdRange)) return false
    }
    return true
  })
}
