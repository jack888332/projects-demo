import { costAmounts, cloneCost } from '../domain/orderCosts.js'

export function loadReconciliationExamples(state) {
  if (state.orderCostBook.orders.some(row => row.id === 'FIN-ORDER-24-DEMO')) return
  const order = { id: 'FIN-ORDER-24-DEMO', orderNo: 'FINDEMO240908', billNo: 'DEMO-240001', customer: '启航跨境贸易', creator: '周倩', businessType: '合成地面服务', businessDate: '2026-09-05', status: '已完成', companyId: 'FIN-DEMO-A', childNumbers: ['FINDEMO240908-01'], source: '独立合成对账订单' }
  state.orderCostBook.orders.push(order)
  const values = [
    ['应收', 'PT-00018', '启航跨境贸易', 'CNY', '120'],
    ['应收', 'PT-00018', '启航跨境贸易', 'USD', '20'],
    ['应收', 'PT-00019', '云帆供应链', 'CNY', '90'],
    ['应付', 'PT-00027', '东方航空', 'CNY', '80'],
    ['应收', 'PT-00018', '启航跨境贸易', 'CNY', '50'],
    ['应付', 'PT-00031', '申捷车队', 'CNY', '60'],
  ]
  const costs = values.map(([direction, partyId, settlementParty, currency, unitPrice], index) => {
    const row = { id: `COST-24-DEMO-${index + 1}`, managementVersion: 23, lineNo: index + 1, orderId: order.id, orderNo: order.orderNo, childNo: order.childNumbers[0], status: '财务审批通过', direction, partyId, settlementParty, feeItemId: 'COST-003', feeItem: '装卸成本', quantity: '10', unit: '票', currency, taxRate: '6', unitPrice, spotRate: currency === 'USD' ? '7.0500' : '1', agreedRate: currency === 'USD' ? '7.0500' : '1', attachments: [], remark: '合成对账样本', createdBy: '周倩', createdAt: '2026-09-07 09:00:00', updatedBy: '财务会计演示员', updatedAt: '2026-09-07 12:00:00', businessApprovedAt: '2026-09-07 11:00:00', financeApprovedAt: '2026-09-07 12:00:00', history: [] }
    return { ...row, ...costAmounts(row) }
  })
  state.costs.push(...costs)
  for (const [index, source] of [costs[4], costs[5]].entries()) {
    const statementNo = `BL2609070000${index + 1}`, time = '2026-09-08 12:30:00'
    state.reconciliation.statements.push({ id: statementNo, statementNo, statementDirection: source.direction, status: index ? '已确认' : '新建', partyId: source.partyId, settlementParty: source.settlementParty, companyId: order.companyId, period: null, createdBy: '周倩', createdById: 'service', createdAt: '2026-09-07 15:00:00', updatedBy: '周倩', updatedAt: time, confirmedBy: index ? '周倩' : '', confirmedAt: index ? time : '', remark: '独立合成对账单', attachments: [], history: [{ action: index ? '保存并确认' : '保存', actor: '周倩', time }], lines: [{ ...cloneCost(order), ...cloneCost(source), orderCreator: order.creator, id: `${statementNo}-1`, sourceCostId: source.id, statementLineNo: 1 }] })
  }
}
