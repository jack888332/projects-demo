import { costAmounts } from '../domain/orderCosts.js'

export function createOrderCostSeed() {
  return { orderCostBook: { orders: [], adjustments: [], orderRemarks: {}, sequence: 0, adjustmentSequence: 0, eventSequence: 0, today: '2026-09-08', syncEvents: [], notices: [], demoRates: [{ id: 'COST-DEMO-CNY', currency: 'CNY', date: '2026-09-08', rate: '1' }],
    partyBindings: ['PT-00018', 'PT-00019', 'PT-00027', 'PT-00031'].map(partnerId => ({ partnerId, companyId: 'FIN-DEMO-A' })),
    users: [{ id: 'service', name: '周倩', companyId: 'FIN-DEMO-A' }, { id: 'financeAccountant', name: '财务会计演示员', companyId: 'FIN-DEMO-A' }, { id: 'OTHER-DEMO', name: '异主体演示员', companyId: 'FIN-DEMO-B' }],
  } }
}
export function loadOrderCostExamples(state) {
  if (state.orderCostBook.orders.some(row => row.id === 'FIN-ORDER-DEMO-001')) return
  const orders = [1, 2].map((number, index) => ({ id: `FIN-ORDER-DEMO-00${number}`, orderNo: `FINDEMO26090${number}`, billNo: `DEMO-23000${number}`, customer: index ? '云帆供应链' : '启航跨境贸易', creator: '周倩', businessType: '合成地面服务', businessDate: `2026-09-0${number + 2}`, status: '已完成', companyId: 'FIN-DEMO-A', childNumbers: [`FINDEMO26090${number}-01`], source: '独立合成已完成订单，非在途业务订单' }))
  state.orderCostBook.orders.push(...orders)
  const states = ['新建', '已提交', '业务审批通过', '业务审批拒绝', '财务审批通过', '财务审批拒绝']
  for (const [index, status] of states.entries()) {
    const order = orders[index < 4 ? 0 : 1], receivable = index % 2 === 0
    const row = { id: `COST-23-DEMO-${index + 1}`, managementVersion: 23, lineNo: index + 1, orderId: order.id, orderNo: order.orderNo, childNo: index % 3 ? order.childNumbers[0] : order.orderNo, status, direction: receivable ? '应收' : '应付', partyId: receivable ? 'PT-00018' : 'PT-00027', settlementParty: receivable ? '启航跨境贸易' : '东方航空', feeItemId: 'COST-003', feeItem: '装卸成本', quantity: '10', unit: '票', currency: 'CNY', taxRate: '6', unitPrice: String(100 + index * 20), spotRate: '1', agreedRate: '1', rateId: 'COST-DEMO-CNY', attachments: [], remark: '合成结算样本', createdBy: '周倩', createdAt: '2026-09-08 09:00:00', updatedBy: '周倩', updatedAt: '2026-09-08 09:00:00', submittedAt: index ? '2026-09-08 10:00:00' : '', businessApprovedAt: [2, 4, 5].includes(index) ? '2026-09-08 11:00:00' : '', financeApprovedAt: index === 4 ? '2026-09-08 12:00:00' : '', approvalRemark: status.endsWith('拒绝') ? '请核对计费数量' : '', history: [] }
    state.costs.push({ ...row, ...costAmounts(row) })
  }
}
