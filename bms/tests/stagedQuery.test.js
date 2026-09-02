import { describe, expect, it } from 'vitest'
import { useStagedQuery } from '../src/shared/composables/useStagedQuery.js'

describe('useStagedQuery', () => {
  it('only updates applied conditions after submit', () => {
    const { query, appliedQuery, applyQuery } = useStagedQuery({ keyword: '', period: [] })

    query.keyword = 'OceanGate'
    query.period = ['2026-08-01', '2026-08-31']

    expect(appliedQuery).toMatchObject({ keyword: '', period: [] })
    applyQuery()
    expect(appliedQuery).toMatchObject({ keyword: 'OceanGate', period: ['2026-08-01', '2026-08-31'] })
  })

  it('resets draft and applied conditions together', () => {
    const { query, appliedQuery, applyQuery, resetQuery } = useStagedQuery({ keyword: '', status: '' })

    query.keyword = '账单'
    query.status = '启用'
    applyQuery()
    resetQuery()

    expect(query).toMatchObject({ keyword: '', status: '' })
    expect(appliedQuery).toMatchObject({ keyword: '', status: '' })
  })

  it('keeps date values intact when conditions are applied', () => {
    const { query, appliedQuery, applyQuery } = useStagedQuery({ period: [] })
    const start = new Date(2026, 7, 1)

    query.period = [start, new Date(2026, 7, 31)]
    applyQuery()

    expect(appliedQuery.period[0]).toBeInstanceOf(Date)
    expect(appliedQuery.period[0]).not.toBe(start)
    expect(appliedQuery.period[0].getTime()).toBe(start.getTime())
  })
})
