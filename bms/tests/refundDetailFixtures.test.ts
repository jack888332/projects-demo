import { describe, expect, it } from 'vitest'
import { deductionDetailFixtures, refundDetailFixtures } from '../src/data/fixtures/billDetail.ts'
import { billingBillFixtures } from '../src/data/fixtures/billingBills.ts'

describe('refund detail demonstration data', () => {
  const billNo = 'PCB-OG0370-20260721-0a19'
  const bill = billingBillFixtures.find(item => item.billNo === billNo)
  const rows = refundDetailFixtures.filter(item => item.billNo === billNo)
  const deductions = deductionDetailFixtures.filter(item => item.billNo === billNo)
  const sum = (read: (row: typeof rows[number]) => number | null | undefined) => rows.reduce((total, row) => total + Number(read(row) || 0), 0)
  const buckets = bill?.refundCurrencyBuckets ?? []

  it('provides at least six order-level refund rows', () => {
    expect(rows.length).toBeGreaterThanOrEqual(6)
    expect(new Set(rows.map(row => row.order)).size).toBe(rows.length)
  })

  it('keeps every row and each settlement-currency bucket on the payable-refund amount chain', () => {
    rows.forEach((row) => {
      expect(row.provisionalRefund).toBe(row.payableRefund - row.specifiedDeduction)
      expect(row.actualRefund).toBeCloseTo(row.provisionalRefund * row.refundRate, 6)
      const rowDeductions = deductions
        .filter(item => item.order === row.order)
        .reduce((total, item) => total + item.deductionAmount, 0)
      expect(rowDeductions).toBe(row.specifiedDeduction)
    })

    expect(sum(row => row.payableRefund)).toBe(bill?.payableRefund)
    expect(sum(row => row.specifiedDeduction)).toBe(bill?.specifiedDeduction)
    expect(sum(row => row.provisionalRefund)).toBe(bill?.provisionalRefund)
    expect(sum(row => row.exchangeGainLoss)).toBeCloseTo(Number(bill?.exchangeGainLoss), 6)

    buckets.forEach((bucket) => {
      const bucketRows = rows.filter(row => row.settlementCurrency === bucket.currency)
      expect(bucketRows.reduce((total, row) => total + row.payableRefund * row.refundRate, 0)).toBeCloseTo(bucket.payable, 6)
      expect(bucketRows.reduce((total, row) => total + row.specifiedDeduction * row.refundRate, 0)).toBeCloseTo(bucket.deduction, 6)
      expect(bucketRows.reduce((total, row) => total + Number(row.actualRefund || 0), 0)).toBeCloseTo(bucket.actual, 6)
    })
  })

  it('demonstrates three settlement-currency buckets without cross-currency summing', () => {
    expect(buckets.map(bucket => bucket.currency)).toEqual(['CNY', 'USD', 'EUR'])
    expect(new Set(rows.map(row => row.settlementCurrency))).toEqual(new Set(['CNY', 'USD', 'EUR']))
    expect(buckets.every(bucket => bucket.pending === bucket.actual - bucket.paid)).toBe(true)
  })

  it('contains multiple named deduction fee columns', () => {
    expect(new Set(deductions.map(item => item.fee))).toEqual(new Set(['代收货款手续费', '超材费', '重出费']))
  })
})
