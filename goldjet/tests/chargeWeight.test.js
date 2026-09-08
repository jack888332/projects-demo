import { describe, expect, it } from 'vitest'
import { calculateChargeWeight, roundChargeWeight } from '../src/domain/chargeWeight.js'

describe('空运计费重', () => {
  it('按 0.5 kg 倍数向上处理', () => {
    expect(roundChargeWeight(214.3)).toBe(214.5)
    expect(roundChargeWeight(214.6)).toBe(215)
  })

  it('取体积重量与毛重中的较大值', () => {
    expect(calculateChargeWeight(186.5, 1.286)).toBe(214.5)
    expect(calculateChargeWeight(320, 1.4)).toBe(320)
  })

  it('不接受负数形成负计费重', () => {
    expect(calculateChargeWeight(-10, -1)).toBe(0)
  })
})
