export function normalizedPageSize(pageSize) {
  const value = Number(pageSize)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 20
}

export function pageCount(total, pageSize) {
  return Math.max(1, Math.ceil(Math.max(0, Number(total) || 0) / normalizedPageSize(pageSize)))
}

export function clampPage(currentPage, total, pageSize) {
  const value = Math.max(1, Math.floor(Number(currentPage) || 1))
  return Math.min(value, pageCount(total, pageSize))
}

export function paginateRows(rows, currentPage, pageSize) {
  if (!Array.isArray(rows)) return rows
  const size = normalizedPageSize(pageSize)
  const page = clampPage(currentPage, rows.length, size)
  const start = (page - 1) * size
  return rows.slice(start, start + size)
}

export function sortRows(rows, sortState) {
  if (!Array.isArray(rows) || !sortState?.order) return rows
  const direction = sortState.order === 'descending' ? -1 : 1
  const { prop, sortMethod } = sortState
  return [...rows].sort((left, right) => {
    if (typeof sortMethod === 'function') return sortMethod(left, right) * direction
    const leftValue = prop ? left?.[prop] : ''
    const rightValue = prop ? right?.[prop] : ''
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction
    return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'zh-CN', { numeric: true }) * direction
  })
}
