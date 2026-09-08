import { describe, expect, it } from 'vitest'
import { resolveAirTransition, WAREHOUSE_ACTIONS, WAREHOUSE_FLOW } from '../src/domain/workflows.js'

describe('空运订单与仓储状态', () => {
  it('订舱待审核优先进入审核通过和待补录', () => {
    expect(resolveAirTransition({ orderStatus: '待确认', bookingStatus: '待审核' })).toEqual({
      label: '审核通过', nextOrderStatus: '待补录', nextBookingStatus: '审核通过',
    })
  })

  it('仓储流程以已完成为终态', () => {
    expect(WAREHOUSE_FLOW.at(-1)).toBe('已完成')
    expect(WAREHOUSE_ACTIONS.部分上架).toBe('完成上架')
    expect(WAREHOUSE_ACTIONS.已完成).toBeUndefined()
  })
})
