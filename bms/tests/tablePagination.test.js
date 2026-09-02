import { describe, expect, it } from 'vitest'
import { clampPage, pageCount, paginateRows, sortRows } from '../src/shared/components/tablePagination.js'

describe('table pagination', () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ id:index + 1, name:`第 ${index + 1} 行` }))

  it('calculates page counts and clamps invalid pages', () => {
    expect(pageCount(25, 10)).toBe(3)
    expect(clampPage(8, 25, 10)).toBe(3)
    expect(clampPage(0, 0, 20)).toBe(1)
  })

  it('returns the requested page using the selected page size', () => {
    expect(paginateRows(rows, 1, 10).map(row => row.id)).toEqual([1,2,3,4,5,6,7,8,9,10])
    expect(paginateRows(rows, 3, 10).map(row => row.id)).toEqual([21,22,23,24,25])
    expect(paginateRows(rows, 2, 20).map(row => row.id)).toEqual([21,22,23,24,25])
  })

  it('sorts the full result set before pagination', () => {
    const sorted = sortRows(rows, { prop:'id', order:'descending' })
    expect(paginateRows(sorted, 1, 10).map(row => row.id)).toEqual([25,24,23,22,21,20,19,18,17,16])
  })
})
