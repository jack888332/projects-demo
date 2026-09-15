import { AIR_PORTS, AIR_FLIGHTS, AIR_LEGS } from './airOperations.js'

const ISSUING_CARRIER = 'GUANGDONG GOLDJET INT’L LOGISTICS CO.,LTD'
const AIRCRAFT_TYPES = ['货机', '客机']
const CONTINENTS = ['北美洲', '大洋洲', '东南亚', '东欧', '非洲', '南美洲', '欧洲', '亚洲', '中东']

export const AIR_MASTER_FIELDS = {
  airlines: [
    { key: 'code', label: '航司代码', max: 2 },
    { key: 'supplierIds', label: '供应商名称', type: 'multiselect', required: true },
    { key: 'name', label: '公司名称', required: true, max: 50 },
    { key: 'prefix', label: '提单前缀', required: true, max: 3 },
    { key: 'printTitle', label: '提单打印抬头', max: 150 },
    { key: 'issuingCarrier', label: 'ISSUINGCAR', max: 150 },
    { key: 'iataCode', label: 'IATACode', max: 10 },
    { key: 'accountNo', label: 'AccountNo', max: 20 },
  ],
  ports: [
    { key: 'code', label: '三字代码', required: true, max: 3 },
    { key: 'name', label: '机场名（中文）', required: true, max: 50 },
    { key: 'englishName', label: '机场名（英文）', required: true, max: 50 },
    { key: 'country', label: '国家（英文）', type: 'select', required: true, max: 50 },
    { key: 'countryCode', label: '国家代码', required: true, max: 10 },
    { key: 'city', label: '城市（英文）', type: 'select', required: true, max: 10 },
    { key: 'cityCode', label: '城市代码', required: true, max: 10 },
    { key: 'continent', label: '洲', type: 'select', options: CONTINENTS, required: true },
  ],
  flights: [
    { key: 'station', label: '货站', type: 'select', required: true, max: 10 },
    { key: 'airlineCode', label: '航空代码', type: 'select', required: true, max: 10 },
    { key: 'origin', label: '始发地', type: 'select', required: true, max: 10 },
    { key: 'destination', label: '目的地', type: 'select', required: true, max: 10 },
    { key: 'code', label: '航班号', required: true, max: 10 },
    { key: 'weekdays', label: '班期', type: 'multiselect', options: [1, 2, 3, 4, 5, 6, 7], required: true },
    { key: 'takeoffTime', label: '起飞时刻', type: 'time', required: true },
    { key: 'arrivalTime', label: '到达时刻', type: 'time', required: true },
    { key: 'arrivalDay', label: '到达时间' },
    { key: 'cutoffTime', label: '截单时间', type: 'time', required: true },
    { key: 'cutoffDays', label: '截单天数', type: 'number', required: true, max: 10 },
    { key: 'model', label: '机型', required: true, max: 20 },
    { key: 'aircraftType', label: '飞机类型', type: 'select', options: AIRCRAFT_TYPES, required: true },
  ],
  pallets: [
    { key: 'airlineCode', label: '航司代码', type: 'select', required: true, max: 10 },
    { key: 'aircraftType', label: '飞机类型', type: 'select', options: AIRCRAFT_TYPES, required: true },
    { key: 'code', label: '板型', required: true, max: 10 },
    { key: 'alias', label: '别称', max: 10 },
    { key: 'volume', label: '体积', type: 'number', required: true, max: 10 },
    { key: 'dimensions', label: '板型尺寸（长×高×宽，m）', required: true, max: 50 },
    { key: 'maxWeight', label: '限重（t）', type: 'number', required: true, max: 10 },
  ],
}

export function createAirMasterDraft(kind) {
  if (!AIR_MASTER_FIELDS[kind]) throw new Error('未知空运主数据类别')
  const draft = Object.fromEntries(AIR_MASTER_FIELDS[kind].map(field => [field.key, field.type === 'multiselect' ? [] : '']))
  if (kind === 'airlines') draft.issuingCarrier = ISSUING_CARRIER
  return draft
}

// All schedules, capacities and bindings below are synthetic demo configuration, not an official aviation feed.
// Only this seed adapter consumes the legacy constants. Catalog readers use the supplied master object.
export function createAirMasterSeed() {
  const countries = [
    { name: 'China', code: 'CN' }, { name: 'Japan', code: 'JP' }, { name: 'USA', code: 'US' },
    { name: 'Germany', code: 'DE' }, { name: 'Netherlands', code: 'NL' }, { name: 'Singapore', code: 'SG' },
  ]
  const cities = [
    { name: 'Shanghai', code: 'SHA', countryCode: 'CN' }, { name: 'Guangzhou', code: 'CAN', countryCode: 'CN' },
    { name: 'Shenzhen', code: 'SZX', countryCode: 'CN' }, { name: 'Tokyo', code: 'TYO', countryCode: 'JP' },
    { name: 'LosAngeles', code: 'LAX', countryCode: 'US' }, { name: 'Frankfurt', code: 'FRA', countryCode: 'DE' },
    { name: 'Amsterdam', code: 'AMS', countryCode: 'NL' }, { name: 'Singapore', code: 'SIN', countryCode: 'SG' },
  ]
  const stations = [
    { id: 'ST-MU', name: 'MU演示货站', palletCompany: 'MU 货站打板' },
    { id: 'ST-CZ', name: 'CZ演示货站', palletCompany: 'CZ 航晟打板' },
    { id: 'ST-NH', name: 'NH演示货站', palletCompany: '' },
  ]
  const airlines = [
    { code: 'MU', name: '东方航空', supplierIds: ['PT-00027'], prefix: '781' },
    { code: 'CZ', name: '南方航空', supplierIds: ['PT-00028'], prefix: '784' },
    { code: 'NH', name: '全日空', supplierIds: ['PT-00029'], prefix: '205' },
  ].map(row => ({ ...createAirMasterDraft('airlines'), ...row, id: `AIRLINE-${row.code}`, printTitle: `${row.name} · 合成提单抬头` }))
  const ports = AIR_PORTS.map((row, index) => {
    const city = cities[index]
    const country = countries.find(item => item.code === city.countryCode)
    return {
      ...createAirMasterDraft('ports'), ...row, id: `PORT-${row.code}`, englishName: `${city.name} Demo Airport`,
      country: country.name, countryCode: country.code, city: city.name, cityCode: city.code,
      continent: row.code === 'LAX' ? '北美洲' : ['FRA', 'AMS'].includes(row.code) ? '欧洲' : '亚洲',
    }
  })
  const flights = AIR_FLIGHTS.map(row => {
    const airline = airlines.find(item => item.name === row.airline)
    return {
      ...createAirMasterDraft('flights'), id: `FLIGHT-${row.code}`, code: row.code, airlineCode: airline.code,
      origin: row.origin, destination: row.destination, station: `ST-${airline.code}`, weekdays: [1, 3, 5, 7],
      takeoffTime: row.takeoffTime, arrivalTime: '23:00', arrivalDay: '', cutoffTime: row.cutoffTime,
      cutoffDays: 0, model: 'A330-DEMO', aircraftType: '货机',
    }
  })
  for (const [index, leg] of AIR_LEGS.entries()) {
    const [origin, destination] = leg.split(' - ')
    if (flights.some(row => row.origin === origin && row.destination === destination)) continue
    flights.push({
      ...createAirMasterDraft('flights'), id: `FLIGHT-NH91${index}`, code: `NH91${index}`, airlineCode: 'NH',
      origin, destination, station: 'ST-NH', weekdays: [2, 4, 6], takeoffTime: '08:00', arrivalTime: '12:00',
      arrivalDay: '', cutoffTime: '04:00', cutoffDays: 0, model: 'B777-DEMO', aircraftType: '货机',
    })
  }
  const pallets = [{
    ...createAirMasterDraft('pallets'), id: 'PALLET-DEMO-PMC', code: 'PMC-DEMO', airlineCode: 'MU', aircraftType: '货机',
    alias: '演示主舱板', volume: 10, dimensions: '3.18×1.53×2.44', maxWeight: 5,
  }]
  return { airlines, ports, flights, pallets, countries, cities, stations }
}

export function getAirMasterPermission(kind, role) {
  const known = Object.hasOwn(AIR_MASTER_FIELDS, kind)
  if (!known || !['admin', 'routeStaff', 'financeStaff'].includes(role)) return { create: false, edit: false, delete: false, reason: '当前角色没有此类空运主数据的维护权限' }
  if (role === 'financeStaff' && kind !== 'airlines') return { create: false, edit: false, delete: false, reason: '财务专员仅维护航司资料' }
  if (role === 'admin' && ['airlines', 'pallets'].includes(kind)) return { create: true, edit: true, delete: false, reason: '角色表未列出管理员对此类主数据的删除权限，删除场景未补充授权，暂不开放' }
  return { create: true, edit: true, delete: true, reason: '' }
}

const clean = value => String(value ?? '').trim()
const empty = value => value === null || value === undefined || clean(value) === '' || (Array.isArray(value) && !value.length)
const time = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(clean(value))
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right)

export function validateAirMasterDraft(kind, draft, master, partners = [], { existing = null } = {}) {
  if (!AIR_MASTER_FIELDS[kind]) return { kind: '未知空运主数据类别' }
  const errors = {}
  for (const field of AIR_MASTER_FIELDS[kind]) {
    const value = draft[field.key]
    if (field.required && empty(value)) errors[field.key] = `请填写${field.label}`
    else if (!empty(value) && field.max && clean(value).length > field.max) errors[field.key] = `${field.label}最多 ${field.max} 个字符`
    else if (field.options && !empty(value)) {
      const values = field.type === 'multiselect' ? value : [value]
      if (!Array.isArray(values) || values.some(item => !field.options.includes(item))) errors[field.key] = `请选择有效的${field.label}`
    }
  }
  const others = (master[kind] || []).filter(row => row.id !== existing?.id)
  const uniqueFields = kind === 'airlines' ? ['code', 'name'] : kind === 'ports' ? ['code', 'name', 'englishName'] : ['code']
  for (const field of uniqueFields) {
    if (!empty(draft[field]) && others.some(row => clean(row[field]) === clean(draft[field]))) errors[field] = `${AIR_MASTER_FIELDS[kind].find(item => item.key === field).label}不能重复`
  }
  if (kind === 'airlines') {
    if (!empty(draft.code) && !/^[A-Z0-9]{2}$/.test(clean(draft.code))) errors.code = '航司代码须为两位大写字母或数字'
    if (clean(draft.name).length < 2) errors.name = '公司名称为 2～50 个字符'
    if (!/^\d{3}$/.test(clean(draft.prefix))) errors.prefix = '提单前缀须为 3 位数字'
    else if (others.some(row => clean(row.prefix) === clean(draft.prefix))) errors.prefix = '提单前缀存在可重复与不可重复两种口径，重复前缀路径待确认'
    if (!Array.isArray(draft.supplierIds) || draft.supplierIds.length === 0) errors.supplierIds = '请选择至少一个供应商档案'
    else if (new Set(draft.supplierIds).size !== draft.supplierIds.length || draft.supplierIds.some(id => !partners.some(row => row.id === id && row.type === '供应商' && ['已生效', '有效'].includes(row.status)))) errors.supplierIds = '供应商必须来自已生效的供应商档案，且不能重复选择'
  }
  if (kind === 'ports') {
    if (!/^[A-Z]{3}$/.test(clean(draft.code))) errors.code = '空港代码须为三位大写字母'
    const country = (master.countries || []).find(row => row.name === draft.country)
    const city = (master.cities || []).find(row => row.name === draft.city && row.countryCode === draft.countryCode)
    if (!country) errors.country = '请选择国家代码表中的国家'
    else if (draft.countryCode !== country.code) errors.countryCode = '国家代码必须由所选国家带出'
    if (!city) errors.city = '请选择对应国家下的城市'
    else if (draft.cityCode !== city.code) errors.cityCode = '城市代码必须由所选城市带出'
  }
  if (['flights', 'pallets'].includes(kind) && !(master.airlines || []).some(row => !empty(row.code) && row.code === draft.airlineCode)) errors.airlineCode = '请选择航司主数据中的航司代码'
  if (kind === 'flights') {
    if (!(master.stations || []).some(row => row.id === draft.station)) errors.station = '请选择货站配置中的货站'
    for (const field of ['origin', 'destination']) if (!(master.ports || []).some(row => row.code === draft[field])) errors[field] = '请选择空港主数据中的三字代码'
    if (!Array.isArray(draft.weekdays) || !draft.weekdays.length || new Set(draft.weekdays).size !== draft.weekdays.length) errors.weekdays = '班期须选择周一至周日，且不能重复'
    for (const field of ['takeoffTime', 'arrivalTime', 'cutoffTime']) if (!time(draft[field])) errors[field] = '请使用 HH:MM 时刻格式'
    if (empty(draft.cutoffDays) || !Number.isInteger(Number(draft.cutoffDays)) || Number(draft.cutoffDays) > 0) errors.cutoffDays = '截单天数须为非正整数'
    if ((!empty(draft.arrivalDay) || !empty(existing?.arrivalDay)) && !equal(draft.arrivalDay, existing?.arrivalDay)) errors.arrivalDay = '到达时间存在 0/1 与日期时间两种口径，该字段编辑待确认'
  }
  if (kind === 'pallets') {
    for (const field of ['volume', 'maxWeight']) if (empty(draft[field]) || !Number.isFinite(Number(draft[field])) || Number(draft[field]) <= 0) errors[field] = '请输入大于 0 的数值'
    const dimensions = clean(draft.dimensions).split(/[×xX]/).map(value => clean(value))
    if (dimensions.length !== 3 || dimensions.some(value => !/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0)) errors.dimensions = '板型尺寸按长×高×宽填写，三个尺寸均以 m 表示'
  }
  return errors
}

export function deriveAirCatalog(master) {
  const ports = (master.ports || []).map(({ code, name }) => ({ code, name }))
  const flights = (master.flights || []).flatMap(row => {
    const airline = (master.airlines || []).find(item => item.code === row.airlineCode)
    if (!airline || !ports.some(item => item.code === row.origin) || !ports.some(item => item.code === row.destination)) return []
    const station = (master.stations || []).find(item => item.id === row.station)
    return [{
      code: row.code, airline: airline.name, origin: row.origin, destination: row.destination,
      firstDestination: row.destination, firstLeg: `${row.origin} - ${row.destination}`,
      takeoffTime: row.takeoffTime, cutoffTime: row.cutoffTime, palletCompany: station?.palletCompany || '',
    }]
  })
  return { ports, flights, legs: [...new Set(flights.map(row => row.firstLeg))] }
}
