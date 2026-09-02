function resolveTableInstance(root) {
  const rootElement = root?.$el || root
  const tableElement = rootElement?.matches?.('.el-table')
    ? rootElement
    : rootElement?.querySelector?.('.el-table')
  let instance = tableElement?.__vueParentComponent

  while (instance) {
    const table = instance.exposed || instance.proxy
    if (table?.store?.states?._columns) return table
    instance = instance.parent
  }

  return null
}

function columnLabel(column) {
  return String(column?.label || '').trim()
}

function isConfigurable(column) {
  const label = columnLabel(column)
  return Boolean(label && label !== '操作' && column.type === 'default')
}

function isReorderable(column) {
  return isConfigurable(column) && !column.fixed
}

function isOperationColumn(column) {
  const classes = String(column?.className || '').split(/\s+/).filter(Boolean)
  return columnLabel(column) === '操作' || classes.includes('table-operation-column')
}

function isPanelSortable(column) {
  return isConfigurable(column) && column._prototypePanelSortable !== false
}

function renderedColumnWidth(column) {
  const preferredWidth = isOperationColumn(column)
    ? column?._prototypeOperationWidth
    : column?.realWidth
  const width = Number.parseFloat(preferredWidth ?? column?.width ?? column?.minWidth)
  return Number.isFinite(width) && width > 0 ? width : null
}

function preserveRenderedWidths(columns) {
  return new Map(columns.map((column) => [column, renderedColumnWidth(column)]))
}

function restoreRenderedWidths(columns, widths) {
  columns.forEach((column) => {
    const width = widths.get(column)
    if (!width) return
    column.realWidth = width
    if (!isOperationColumn(column)) return
    column.width = width
    column.minWidth = width
    column.realMinWidth = width
    column._prototypeOperationWidth = width
  })
}

function totalWidth(columns) {
  return columns.reduce((sum, column) => sum + (renderedColumnWidth(column) || 0), 0)
}

function syncFixedColumnWidths(table) {
  const store = table?.store
  const layout = table?.layout
  if (!store || !layout) return

  if (layout.fixedWidth) layout.fixedWidth.value = totalWidth(store.states.fixedColumns?.value || [])
  if (layout.rightFixedWidth) layout.rightFixedWidth.value = totalWidth(store.states.rightFixedColumns?.value || [])
  layout.notifyObservers?.('columns')
}

export function normalizeTableColumnOrder(source, labels) {
  const reorderable = source.filter(isReorderable)
  const byLabel = new Map(reorderable.map((column) => [columnLabel(column), column]))
  const ordered = labels.map((label) => byLabel.get(label)).filter(Boolean)
  const included = new Set(ordered)
  ordered.push(...reorderable.filter((column) => !included.has(column)))

  let orderedIndex = 0
  const slotted = source.map((column) => (isReorderable(column) ? ordered[orderedIndex++] : column))
  const operationColumns = slotted.filter(isOperationColumn)
  operationColumns.forEach((column) => {
    column.fixed = 'right'
    column.resizable = false
  })

  const leftFixedColumns = slotted.filter((column) => !isOperationColumn(column) && (column.fixed === true || column.fixed === 'left'))
  const normalColumns = slotted.filter((column) => !isOperationColumn(column) && !column.fixed)
  const rightFixedColumns = slotted.filter((column) => !isOperationColumn(column) && column.fixed === 'right')

  return [...leftFixedColumns, ...normalColumns, ...rightFixedColumns, ...operationColumns]
}

const SORTED_COLUMN_CLASS = 'prototype-sorted-column'

function markSortedColumn(columns, selectedColumn) {
  columns.forEach((column) => {
    const classNames = new Set(String(column.className || '').split(/\s+/).filter(Boolean))
    if (column === selectedColumn) classNames.add(SORTED_COLUMN_CLASS)
    else classNames.delete(SORTED_COLUMN_CLASS)
    column.className = [...classNames].join(' ')
  })
}

export function readTableColumnOrder(root) {
  const table = resolveTableInstance(root)
  const columns = table?.store?.states?.columns?.value || []
  return columns.filter(isReorderable).map(columnLabel)
}

export function readTableColumns(root) {
  const table = resolveTableInstance(root)
  const columns = table?.store?.states?.columns?.value || []
  const sortingColumn = table?.store?.states?.sortingColumn?.value

  return columns.filter(isConfigurable).map((column) => ({
    label: columnLabel(column),
    reorderable: isReorderable(column),
    sortable: isPanelSortable(column),
    order: sortingColumn === column ? (column.order || null) : null,
  }))
}

export function filterTableColumnsByKeyword(columns, keyword = '') {
  const normalized = String(keyword).trim().toLowerCase()
  if (!normalized) return columns
  return columns.filter((column) => columnLabel(column).toLowerCase().includes(normalized))
}

export function applyTableSort(root, label, order) {
  const table = resolveTableInstance(root)
  if (!table) return false
  const store = table.store
  const columns = store?.states?.columns?.value || []

  if (!label || !order) {
    if (typeof table.clearSort !== 'function') return false
    markSortedColumn(columns, null)
    columns.forEach((column) => { column.order = null })
    table.clearSort()
    return true
  }

  const column = columns.find((item) => columnLabel(item) === label)
  if (!column?.property || !isPanelSortable(column)) return false
  if (typeof table.sort !== 'function') return false

  markSortedColumn(columns, column)
  columns.forEach((item) => { item.order = item === column ? order : null })
  table.sort(column.property, order)
  return true
}

export function applyTableColumnOrder(root, labels) {
  const table = resolveTableInstance(root)
  const store = table?.store
  const source = [...(store?.states?._columns?.value || [])]
  if (!source.length) return false

  const renderedWidths = preserveRenderedWidths(source)
  const next = normalizeTableColumnOrder(source, labels)
  restoreRenderedWidths(next, renderedWidths)
  store.states._columns.value = next
  store.updateColumns()
  syncFixedColumnWidths(table)
  return true
}
