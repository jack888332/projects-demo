export const STATION_ORDER_FIELDS = [
  ['customerOrderNo', '客户订单号', 'text'], ['flight', '航班号', 'text'],
  ['partnerId', '客户', 'customer', true], ['financeOrganization', '财务组织名称', 'text', true],
  ['contact', '客户联系人', 'text', false, 50, 2], ['phone', '联系电话', 'phone', false, 20, 8],
  ['businessType', '业务类型', 'text', true], ['weight', '委托重量（kg）', 'number', true, 10],
  ['pieces', '委托数量（件）', 'number', false, 10], ['volume', '委托体积（m³）', 'number', false, 10],
  ['goodsName', '委托中文品名', 'text', false, 40, 2], ['station', '货站', 'text', false, 80, 2],
  ['remark', '备注', 'textarea', false, 500],
]
export const STATION_ORDER_COLUMNS = [['customer','客户',200],['orderNo','订单号',205],['waybillNo','提单号',165],['flight','航班号',120],['station','货站',170],['statusLabel','状态',160],['pieces','数量（件）',110],['weight','重量（kg）',120],['volume','体积（m³）',130]]
export const stationOrderDraft = (row = {}) => Object.fromEntries(STATION_ORDER_FIELDS.map(([key]) => [key, row[key] ?? (key === 'financeOrganization' ? '广州航晟物流有限公司' : '')]))
export const stationRights = persona => ({ manage: persona === 'stationPallet', orders: ['stationPallet','superAdmin'].includes(persona), papers: ['stationPallet','superAdmin','service','supervisor','operator','handler'].includes(persona), plans: ['stationPallet','superAdmin','operator','handler'].includes(persona) })
export const stationCustomers = state => state.partners.filter(row => row.type === '客户' && row.status !== '已删除')
export function stationOrderErrors(draft, state) {
  const errors = {}
  for (const [key,label,type,required,max,min] of STATION_ORDER_FIELDS) {
    const value = String(draft[key] ?? '').trim()
    if (required && !value) errors[key] = '请完成必要信息的填写！'
    if (!value) continue
    if (max && (value.length > max || min && value.length < min)) errors[key] = `${label}长度须为${min || 1}～${max}个字符`
    if (type === 'phone' && !/^\d{8,20}$/.test(value)) errors[key] = '联系电话须为8～20位数字'
    if (type === 'number' && (!/^-?\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))) errors[key] = `${label}须为有效数值`
  }
  if (!stationCustomers(state).some(row => row.id === draft.partnerId)) errors.partnerId = '请选择客户档案'
  return errors
}
export const stationOrderRows = state => state.stationOrders.map(row => ({...row, customer: state.partners.find(partner => partner.id === row.partnerId)?.name || row.customer || '', statusLabel: row.status || '初始状态待确认'})).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
export const stationDeleteReason = row => !row ? '打板订单不存在' : row.source !== 'local' ? '内部上游创建的订单不可删除' : row.status !== '待入站' ? '仅已明确为待入站的本地订单可删除（120）' : ''
export const stationOrderCosts = (state, id) => state.costs.filter(row => row.stationOrderId === id)
