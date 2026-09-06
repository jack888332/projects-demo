import { describe, expect, it } from 'vitest'
import {
  adjustmentImpactByCurrency,
  isEffectiveBillAdjustment,
} from '../src/billing/data/adjustmentRecords.js'
import { billingAdjustmentFixtures } from '../src/data/fixtures/billingAdjustments.ts'
import { billingBillFixtures } from '../src/data/fixtures/billingBills.ts'

describe('shared billing amount-reversal records', () => {
  it('covers current-period and prior-period reversals for receivable and refund bills', () => {
    const billPrefix = { AR: 'ARB-', RF: 'PCB-', COST: 'CB-' }

    for (const billType of ['AR', 'RF']) {
      const records = billingAdjustmentFixtures.filter(record => record.billType === billType)

      expect(records.some(record => record.adjustmentPeriod === 'CURRENT')).toBe(true)
      expect(records.some(record => record.adjustmentPeriod === 'PRIOR')).toBe(true)
      expect(records.every(record => record.billTypeLabel)).toBe(true)
    }

    billingAdjustmentFixtures.forEach((record) => {
      expect(record.sourceBillNo.startsWith(billPrefix[record.billType])).toBe(true)
      expect(record.assignedBill.startsWith(billPrefix[record.billType])).toBe(true)
      expect(record.sourcePeriod).toMatch(/^\d{4}\/\d{2}\/\d{2} ~ \d{4}\/\d{2}\/\d{2}$/)
    })

    billingAdjustmentFixtures
      .filter(record => record.adjustmentPeriod === 'CURRENT')
      .forEach(record => expect(record.sourceBillNo).toBe(record.assignedBill))

    billingAdjustmentFixtures
      .filter(record => record.adjustmentPeriod === 'PRIOR')
      .forEach(record => expect(record.sourceBillNo).not.toBe(record.assignedBill))
  })

  it('only treats approved records with an assigned bill as effective', () => {
    expect(isEffectiveBillAdjustment({ status: '审核通过', assignedBill: 'ARB-001' })).toBe(true)
    expect(isEffectiveBillAdjustment({ status: '待审核', assignedBill: 'ARB-001' })).toBe(false)
    expect(isEffectiveBillAdjustment({ status: '审核驳回', assignedBill: 'ARB-001' })).toBe(false)
    expect(isEffectiveBillAdjustment({ status: '审核通过', assignedBill: '' })).toBe(false)
  })

  it('aggregates current and prior refund impacts by assigned bill and currency', () => {
    const impacts = adjustmentImpactByCurrency(
      billingAdjustmentFixtures,
      'PCB-OG0370-20260721-0a19',
    )

    expect(impacts).toEqual(expect.arrayContaining([
      { currency: 'CNY', current: 18, prior: -9, total: 9 },
      { currency: 'USD', current: null, prior: 4.8, total: 4.8 },
      { currency: 'EUR', current: -3.36, prior: null, total: -3.36 },
    ]))
  })

  it('reconciles the receivable bill snapshot with its current and prior impacts', () => {
    const billNo = 'ARB-OG0370-20260707-81FF'
    const bill = billingBillFixtures.find(record => record.billNo === billNo)
    const impact = adjustmentImpactByCurrency(billingAdjustmentFixtures, billNo).find(record => record.currency === 'CNY')

    expect(Number(bill?.amountBeforeReversal) + Number(impact?.current || 0) + Number(impact?.prior || 0)).toBeCloseTo(Number(bill?.amount), 6)
  })

  it('keeps negative carry and offset records outside the adjustment center data owner', () => {
    expect(billingAdjustmentFixtures.every(record => !record.no.startsWith('NC-'))).toBe(true)
    expect(billingAdjustmentFixtures.every(record => !record.adjustmentPeriodLabel.includes('负数承接'))).toBe(true)
  })
})
