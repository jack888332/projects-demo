import { describe, expect, it } from 'vitest'
import { createMemoryBillingRepository } from '../src/data/repositories/billingRepository.ts'

describe('memory billing repository', () => {
  it('returns isolated copies and replaces the dataset', async () => {
    const repository = createMemoryBillingRepository([{ billNo: 'AR-001', status: '待审核' }])
    const first = await repository.get('AR-001')
    first!.status = '已结清'

    expect((await repository.get('AR-001'))?.status).toBe('待审核')

    await repository.replace([{ billNo: 'AR-002', status: '待结清' }])
    expect(await repository.get('AR-001')).toBeUndefined()
    expect((await repository.list()).map((row) => row.billNo)).toEqual(['AR-002'])
  })
})
