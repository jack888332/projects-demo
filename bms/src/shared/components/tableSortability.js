export function resolveTableColumnSorting({
  excluded = false,
  frameSortingDisabled = false,
  panelSortable = true,
} = {}) {
  return {
    headerSortable: false,
    panelSortable: !excluded && !frameSortingDisabled && panelSortable !== false,
  }
}

export function tableHeaderSortState(order) {
  if (order === 'ascending') return { className: 'is-ascending', ariaLabel: '当前升序' }
  if (order === 'descending') return { className: 'is-descending', ariaLabel: '当前降序' }
  return null
}
