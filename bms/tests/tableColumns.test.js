import { describe, expect, it, vi } from 'vitest'
import {
  applyTableColumnOrder,
  applyTableSort,
  filterTableColumnsByKeyword,
  normalizeTableColumnOrder,
  readTableColumns,
} from '../src/shared/components/tableColumns.js'

function tableRoot(table) {
  return {
    matches: selector => selector === '.el-table',
    __vueParentComponent: { exposed: table },
  }
}

describe('table column ordering', () => {
  it('keeps the operation column fixed at the far right after data columns are reordered', () => {
    const expand = { type: 'expand', label: '' }
    const operation = {
      type: 'default',
      label: '操作',
      fixed: false,
      resizable: true,
      className: 'table-operation-column',
    }
    const source = [
      expand,
      { type: 'default', label: '配置' },
      operation,
      { type: 'default', label: '状态' },
      { type: 'default', label: '最近发布' },
    ]

    const result = normalizeTableColumnOrder(source, ['最近发布', '配置', '状态'])

    expect(result.map((column) => column.label)).toEqual(['', '最近发布', '配置', '状态', '操作'])
    expect(result.at(-1)).toBe(operation)
    expect(operation.fixed).toBe('right')
    expect(operation.resizable).toBe(false)
  })

  it('normalizes fixed-column groups and keeps the operation column last', () => {
    const source = [
      { type: 'default', label: '客户', property: 'customer' },
      { type: 'default', label: '账单编号', fixed: true },
      { type: 'default', label: '状态' },
      { type: 'default', label: '操作', fixed: 'right', className: 'table-operation-column' },
      { type: 'selection', label: '', fixed: true },
    ]

    const result = normalizeTableColumnOrder(source, ['客户', '状态'])

    expect(result.map((column) => column.label)).toEqual(['账单编号', '', '客户', '状态', '操作'])
  })

  it('reorders columns without redistributing their rendered widths', () => {
    const source = [
      { id: 'config', type: 'default', label: '配置', realWidth: 380, minWidth: 240 },
      { id: 'status', type: 'default', label: '状态', realWidth: 120, minWidth: 90 },
      { id: 'business-action', type: 'default', label: '审核', fixed: 'right', width: 96, realWidth: 96 },
      {
        id: 'operation',
        type: 'default',
        label: '操作',
        fixed: 'right',
        width: 220,
        realWidth: 220,
        _prototypeOperationWidth: 52,
        className: 'table-operation-column',
      },
    ]
    const states = {
      _columns: { value: source },
      columns: { value: source },
      fixedColumns: { value: [] },
      rightFixedColumns: { value: source.filter(column => column.fixed === 'right') },
    }
    const store = {
      states,
      updateColumns: vi.fn(() => {
        states.columns.value = [...states._columns.value]
        states.rightFixedColumns.value = states._columns.value.filter(column => column.fixed === 'right')
      }),
      scheduleLayout: vi.fn(),
    }
    const layout = {
      fixedWidth: { value: 0 },
      rightFixedWidth: { value: 0 },
      notifyObservers: vi.fn(),
    }
    const table = { store, layout }
    const root = tableRoot(table)

    expect(applyTableColumnOrder(root, ['状态', '配置'])).toBe(true)
    expect(states.columns.value.map(column => column.label)).toEqual(['状态', '配置', '审核', '操作'])
    expect(states.columns.value.map(column => column.realWidth)).toEqual([120, 380, 96, 52])
    expect(states.columns.value.at(-1).width).toBe(52)
    expect(layout.rightFixedWidth.value).toBe(148)
    expect(store.updateColumns).toHaveBeenCalledOnce()
    expect(store.scheduleLayout).not.toHaveBeenCalled()
  })

  it('keeps panel data sorting independent from disabled header sorting', () => {
    const configuration = {
      type: 'default',
      label: '配置',
      property: 'configuration',
      sortable: false,
      _prototypePanelSortable: true,
      order: null,
    }
    const status = {
      type: 'default',
      label: '状态',
      property: 'status',
      sortable: false,
      _prototypePanelSortable: false,
      order: null,
    }
    const columns = [configuration, status]
    const states = {
      _columns: { value: columns },
      columns: { value: columns },
      sortingColumn: { value: null },
    }
    const table = {
      store: { states },
      sort: vi.fn((property, order) => {
        const column = columns.find(item => item.property === property)
        states.sortingColumn.value = column
        column.order = order
      }),
      clearSort: vi.fn(() => {
        states.sortingColumn.value = null
        columns.forEach(column => { column.order = null })
      }),
    }
    const root = tableRoot(table)

    expect(readTableColumns(root)).toEqual([
      { label: '配置', reorderable: true, sortable: true, order: null },
      { label: '状态', reorderable: true, sortable: false, order: null },
    ])

    expect(applyTableSort(root, '配置', 'ascending')).toBe(true)
    expect(table.sort).toHaveBeenCalledWith('configuration', 'ascending')
    expect(readTableColumns(root)[0].order).toBe('ascending')

    expect(applyTableSort(root, '状态', 'ascending')).toBe(false)
    expect(table.sort).toHaveBeenCalledTimes(1)

    expect(applyTableSort(root, null, null)).toBe(true)
    expect(table.clearSort).toHaveBeenCalledOnce()
    expect(readTableColumns(root)[0].order).toBeNull()
  })

  it('moves the single active sort marker when panel sorting changes columns', () => {
    const first = {
      type: 'default',
      label: '客户',
      property: 'customer',
      _prototypePanelSortable: true,
      className: '',
      order: null,
    }
    const second = {
      type: 'default',
      label: '状态',
      property: 'status',
      _prototypePanelSortable: true,
      className: '',
      order: null,
    }
    const columns = [first, second]
    const states = {
      _columns: { value: columns },
      columns: { value: columns },
      sortingColumn: { value: null },
    }
    const table = {
      store: { states },
      sort: vi.fn((property, order) => {
        states.sortingColumn.value = columns.find(item => item.property === property)
        states.sortingColumn.value.order = order
      }),
      clearSort: vi.fn(() => { states.sortingColumn.value = null }),
    }
    const root = tableRoot(table)

    expect(applyTableSort(root, '客户', 'ascending')).toBe(true)
    expect(first.className).toContain('prototype-sorted-column')
    expect(first.order).toBe('ascending')

    expect(applyTableSort(root, '客户', 'descending')).toBe(true)
    expect(first.className).toContain('prototype-sorted-column')
    expect(first.order).toBe('descending')
    expect(second.order).toBeNull()

    expect(applyTableSort(root, '状态', 'descending')).toBe(true)
    expect(first.className).not.toContain('prototype-sorted-column')
    expect(first.order).toBeNull()
    expect(second.className).toContain('prototype-sorted-column')
    expect(second.order).toBe('descending')

    expect(applyTableSort(root, null, null)).toBe(true)
    expect(second.className).not.toContain('prototype-sorted-column')
    expect(second.order).toBeNull()
  })

  it('does not leave a visual sort state when the table sorting API is unavailable', () => {
    const column = {
      type: 'default',
      label: '客户',
      property: 'customer',
      _prototypePanelSortable: true,
      className: '',
      order: null,
    }
    const table = {
      store: {
        states: {
          _columns: { value: [column] },
          columns: { value: [column] },
          sortingColumn: { value: null },
        },
      },
    }

    expect(applyTableSort(tableRoot(table), '客户', 'ascending')).toBe(false)
    expect(column.order).toBeNull()
    expect(column.className).not.toContain('prototype-sorted-column')
  })

  it('filters panel columns by keyword without mutating the source list', () => {
    const columns = [
      { label: '客户（会员）', reorderable: true, sortable: true },
      { label: '账单编号', reorderable: true, sortable: false },
      { label: '状态', reorderable: true, sortable: true },
    ]

    expect(filterTableColumnsByKeyword(columns, '账')).toEqual([columns[1]])
    expect(filterTableColumnsByKeyword(columns, ' 状态 ')).toEqual([columns[2]])
    expect(filterTableColumnsByKeyword(columns, '')).toBe(columns)
    expect(columns).toHaveLength(3)
  })
})
