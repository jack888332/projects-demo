import { describe, expect, it } from 'vitest'
import { deductionFeeDisplayName, isZeroFeeAmount, sourceFeeDisplayName } from '../src/billing/data/feeDisplayLabels.js'

describe('billing deduction fee display labels', () => {
  it('keeps the fee name separate from the deduction tag', () => {
    expect(deductionFeeDisplayName('满减活动优惠金额')).toBe('满减活动优惠金额')
    expect(deductionFeeDisplayName('超材费')).toBe('超材费')
    expect(deductionFeeDisplayName('扣减理赔费')).toBe('理赔费')
  })

  it('uses the refund-facing service fee name without changing the source name', () => {
    expect(sourceFeeDisplayName('代收货款手续费')).toBe('代收服务费')
    expect(deductionFeeDisplayName('代收货款手续费')).toBe('代收服务费')
  })

  it('distinguishes a zero fee amount from an empty or non-zero amount', () => {
    expect(isZeroFeeAmount(0)).toBe(true)
    expect(isZeroFeeAmount('0')).toBe(true)
    expect(isZeroFeeAmount(null)).toBe(false)
    expect(isZeroFeeAmount(0.01)).toBe(false)
  })
})
