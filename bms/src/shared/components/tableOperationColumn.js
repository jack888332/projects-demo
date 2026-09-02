const OPERATION_COLUMN_LABEL = '操作'
const OPERATION_COLUMN_MIN_WIDTH = 52

function numeric(value) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function horizontalPadding(element) {
  if (!element) return 0
  const style = getComputedStyle(element)
  return numeric(style.paddingLeft) + numeric(style.paddingRight)
}

function visibleContentWidth(container) {
  const children = [...(container?.children || [])]
    .filter((element) => getComputedStyle(element).display !== 'none')
  if (!children.length) return 0

  const rects = children.map((element) => element.getBoundingClientRect())
  const left = Math.min(...rects.map((rect) => rect.left))
  const right = Math.max(...rects.map((rect) => rect.right))
  const renderedWidth = Math.max(0, right - left)
  const scrollWidth = Math.max(...children.map((element) => element.scrollWidth || 0))
  return Math.max(renderedWidth, scrollWidth)
}

function operationColumnWidth(root) {
  const header = root?.querySelector('.el-table__header th.table-operation-column .cell')
  const headerContent = header?.querySelector('.prototype-table-header-content')
  const bodyCells = [...(root?.querySelectorAll('.el-table__body td.table-operation-column .cell') || [])]
  const bodyContents = bodyCells
    .map((cell) => cell.querySelector('.table-operation-content'))
    .filter(Boolean)
  const contentWidth = Math.max(
    headerContent?.getBoundingClientRect().width || 0,
    ...bodyContents.map(visibleContentWidth),
  )
  const padding = Math.max(horizontalPadding(header), ...bodyCells.map(horizontalPadding))
  return Math.max(OPERATION_COLUMN_MIN_WIDTH, Math.ceil(contentWidth + padding + 1))
}

function isOperationColumn(column) {
  return String(column?.label || '').trim() === OPERATION_COLUMN_LABEL
    || String(column?.className || '').split(/\s+/).includes('table-operation-column')
}

export function fitOperationColumn(table) {
  const root = table?.$el
  const store = table?.store
  const columns = store?.states?._columns?.value?.filter(isOperationColumn) || []
  if (!root || !columns.length) return false

  const width = operationColumnWidth(root)
  const changed = columns.some((column) => numeric(column.realWidth || column.width) !== width)
  if (!changed) return false

  columns.forEach((column) => {
    column.width = width
    column.minWidth = width
    column.realWidth = width
    column.realMinWidth = width
    column.resizable = false
    column._prototypeOperationWidth = width
  })
  store.updateColumns()
  store.scheduleLayout(false, true)
  return true
}
