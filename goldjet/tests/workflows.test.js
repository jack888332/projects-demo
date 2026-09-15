import { describe, expect, it } from 'vitest'
import { WAREHOUSE_ACTIONS, WAREHOUSE_FLOW } from '../src/domain/workflows.js'

describe('仓储状态', () => {
  it('仓储流程以已完成为终态', () => {
    expect(WAREHOUSE_FLOW.at(-1)).toBe('已完成')
    expect(WAREHOUSE_ACTIONS.部分上架).toBe('完成上架')
    expect(WAREHOUSE_ACTIONS.已完成).toBeUndefined()
  })
})
