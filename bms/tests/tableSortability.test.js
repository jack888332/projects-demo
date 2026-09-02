import { describe, expect, it } from 'vitest'
import { resolveTableColumnSorting, tableHeaderSortState } from '../src/shared/components/tableSortability.js'

describe('table column sorting entry points', () => {
  it('always disables header sorting while keeping panel sorting enabled by default', () => {
    expect(resolveTableColumnSorting()).toEqual({
      headerSortable: false,
      panelSortable: true,
    })
  })

  it.each([
    { excluded: true },
    { frameSortingDisabled: true },
    { panelSortable: false },
  ])('can disable panel sorting without enabling header sorting: %o', (options) => {
    expect(resolveTableColumnSorting(options)).toEqual({
      headerSortable: false,
      panelSortable: false,
    })
  })

  it('shows a static header state only for the actively sorted direction', () => {
    expect(tableHeaderSortState(null)).toBeNull()
    expect(tableHeaderSortState('ascending')).toEqual({ className: 'is-ascending', ariaLabel: '当前升序' })
    expect(tableHeaderSortState('descending')).toEqual({ className: 'is-descending', ariaLabel: '当前降序' })
  })
})
