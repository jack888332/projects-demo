export const billTypeOptions = [
  { label: '应收账单', value: 'AR' },
  { label: '返款账单', value: 'RF' },
  { label: '成本账单', value: 'COST' },
]

export const adjustmentPeriodOptions = [
  { label: '本期账单金额冲正', value: 'CURRENT' },
  { label: '往期账单金额冲正', value: 'PRIOR' },
  { label: '成本冲正', value: 'COST' },
]

export function isEffectiveBillAdjustment(record) {
  return record?.status === '审核通过' && Boolean(record?.assignedBill)
}

export function adjustmentImpactByCurrency(records, assignedBill) {
  const impacts = new Map()

  records
    .filter(record => record.assignedBill === assignedBill && isEffectiveBillAdjustment(record))
    .forEach((record) => {
      const currency = record.afterCurrency || record.beforeCurrency
      if (!currency) return
      const current = impacts.get(currency) || { currency, current: null, prior: null, total: 0 }
      const amount = Number(record.afterDelta ?? record.delta ?? 0)

      if (record.adjustmentPeriod === 'CURRENT') current.current = Number(current.current || 0) + amount
      if (record.adjustmentPeriod === 'PRIOR') current.prior = Number(current.prior || 0) + amount
      current.total += amount
      impacts.set(currency, current)
    })

  return [...impacts.values()]
}
