import { PAYMENT_STATES, applicationTotals } from '../domain/financeApplications.js'

export function loadFinanceApplicationExamples(state) {
  if (state.financeApplications.rows.some(row => row.demoOnly)) return
  // Isolated presentation samples never occupy settlement lines or enter approval tasks.
  state.financeApplications.rows.push(...PAYMENT_STATES.map((status, index) => {
    const applicationNo = `RA2609079000${index + 1}`, time = '2026-09-07 16:00:00'
    const line = { id: `${applicationNo}-1`, sourceCostId: `DEMO-ONLY-PAYMENT-${index + 1}`,
      orderNo: `DEMO-PAYMENT-${index + 1}`, customer: '启航跨境贸易', orderCreator: '周倩', businessDate: '2026-09-05',
      childNo: `DEMO-PAYMENT-${index + 1}-01`, lineNo: 1, settlementParty: '东方航空', partyId: 'PT-00027',
      feeItem: '空运费', direction: '应付', taxRate: '6', quantity: '10', unit: '票', unitPrice: '100',
      originalAmount: 1000, currency: 'CNY', billNo: `DEMO-781-25000${index + 1}`, remark: '独立展示样本',
      statementNo: '独立展示样本', appliedAmount: 0, availableAmount: 1000, requestedAmount: '600',
    }
    return { id: applicationNo, applicationNo, kind: 'payment', status, demoOnly: true, lines: [line],
      ...applicationTotals([line]), partyId: line.partyId, settlementParty: line.settlementParty, companyId: 'FIN-DEMO-A',
      currency: 'CNY', period: null, createdById: 'service', createdBy: '周倩', createdAt: time, updatedBy: '周倩', updatedAt: time,
      remark: '独立展示样本，不占用结算明细', approvalOpinion: status.includes('拒绝') ? '请核对费用依据' : '',
      attachments: [], invoice: null, history: [{ action: '载入独立展示样本', actor: '演示管理员', time, opinion: '' }],
    }
  }))
}
