<script>
import { computed, defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, useAttrs } from 'vue'
import { ElTable as ElementTable, ElTableColumn as ElementTableColumn } from 'element-plus'
import 'element-plus/es/components/table/style/css'
import { paginateRows, sortRows } from '../components/tablePagination.js'
import { fitOperationColumn } from '../components/tableOperationColumn.js'
import { fittedContentWidth, independentTableProps, TABLE_AUTO_WIDTH_CONFIG, tableFillerWidth } from '../components/tableSizing.js'

function callListener(listener, ...args) {
  if (Array.isArray(listener)) listener.forEach(item => item?.(...args))
  else listener?.(...args)
}

function numeric(value) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isFillerColumn(column) {
  return String(column?.className || '').split(/\s+/).includes('prototype-table-filler-column')
}

function classNames(value) {
  return String(value || '').split(/\s+/).filter(Boolean)
}

function isAutoWidthColumn(column) {
  return classNames(column?.labelClassName).includes('prototype-auto-width-column')
}

function columnCells(root, column) {
  if (!root || !column?.id) return []
  return [...root.querySelectorAll(`th.${column.id} > .cell, td.${column.id} > .cell`)]
}

let measureHost

function ensureMeasureHost() {
  if (measureHost) return measureHost
  measureHost = document.createElement('div')
  measureHost.setAttribute('aria-hidden', 'true')
  measureHost.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;z-index:-1000'
  document.body.appendChild(measureHost)
  return measureHost
}

function horizontalPadding(element) {
  if (!element) return 0
  const style = getComputedStyle(element)
  return numeric(style.paddingLeft) + numeric(style.paddingRight)
}

function measureNaturalCellWidth(cell) {
  if (!cell) return 0
  const host = ensureMeasureHost()
  const clone = cell.cloneNode(true)
  clone.style.cssText += ';width:max-content;min-width:0;max-width:none;white-space:nowrap;overflow:visible;text-overflow:clip;'
  clone.querySelectorAll('*').forEach((node) => {
    node.style.cssText += ';white-space:nowrap;overflow:visible;text-overflow:clip;'
  })
  host.appendChild(clone)
  const width = Math.max(clone.scrollWidth, clone.offsetWidth)
  host.removeChild(clone)
  return width
}

const MAX_MEASURED_CELLS_PER_COLUMN = 60

function measuredColumnContentWidth(root, column) {
  const cells = columnCells(root, column)
  if (!cells.length) return 0
  const sampled = cells.length <= MAX_MEASURED_CELLS_PER_COLUMN
    ? cells
    : cells.slice(0, MAX_MEASURED_CELLS_PER_COLUMN)
  return Math.ceil(Math.max(...sampled.map((cell) => {
    return measureNaturalCellWidth(cell) + horizontalPadding(cell) + 2
  })))
}

export default defineComponent({
  name: 'PrototypeTable',
  inheritAttrs: false,
  setup(_, { expose, slots }) {
    const attrs = useAttrs()
    const tableRef = ref(null)
    const pagination = inject('prototypeTablePagination', null)
    const tableAutoWidth = inject('prototypeTableAutoWidth', null)
    const sortState = ref(null)
    const fillerWidth = ref(0)
    let fittedDataSignature
    let operationContentObserver
    let businessContentObserver
    let tableResizeObserver
    let mutationObserver
    let animationFrame = 0
    let fillerAnimationFrame = 0
    const observedOperationTargets = new Set()
    const observedBusinessTargets = new Set()

    provide('prototypeTableRows', computed(() => attrs.data))

    function currentDataSignature() {
      const data = attrs.data
      if (data == null) return ''
      try {
        return JSON.stringify(data)
      } catch {
        return `rows:${data.length ?? 0}`
      }
    }

    function operationContentTargets(root) {
      return [
        ...(root?.querySelectorAll('.table-operation-column .prototype-table-header-content') || []),
        ...(root?.querySelectorAll('.table-operation-content > *') || []),
      ]
    }

    function observeOperationContent(root) {
      if (!operationContentObserver) return
      const nextTargets = new Set(operationContentTargets(root))
      observedOperationTargets.forEach((element) => {
        if (nextTargets.has(element)) return
        operationContentObserver.unobserve(element)
        observedOperationTargets.delete(element)
      })
      nextTargets.forEach((element) => {
        if (observedOperationTargets.has(element)) return
        operationContentObserver.observe(element)
        observedOperationTargets.add(element)
      })
    }

    function businessContentTargets(root) {
      const columns = tableRef.value?.store?.states?._columns?.value || []
      return columns
        .filter(column => isAutoWidthColumn(column) && !column._prototypeUserSized)
        .flatMap(column => columnCells(root, column))
    }

    function observeBusinessContent(root) {
      if (!businessContentObserver) return
      const nextTargets = new Set(businessContentTargets(root))
      observedBusinessTargets.forEach((element) => {
        if (nextTargets.has(element)) return
        businessContentObserver.unobserve(element)
        observedBusinessTargets.delete(element)
      })
      nextTargets.forEach((element) => {
        if (observedBusinessTargets.has(element)) return
        businessContentObserver.observe(element)
        observedBusinessTargets.add(element)
      })
    }

    function fitBusinessColumns() {
      const table = tableRef.value
      const root = table?.$el
      const store = table?.store
      const autoWidthConfig = tableAutoWidth?.value
      if (!root || !store || autoWidthConfig?.enabled === false) return false

      const columns = store.states?._columns?.value || []
      const autoWidthColumns = columns.filter(column => isAutoWidthColumn(column) && !column._prototypeUserSized)
      if (!autoWidthColumns.length) return false

      const signature = currentDataSignature()
      if (signature === fittedDataSignature) return false
      if (!autoWidthColumns.some(column => columnCells(root, column).length > 0)) return false

      const maximumWidth = autoWidthConfig?.maxWidth || TABLE_AUTO_WIDTH_CONFIG.maxWidth
      let changed = false

      autoWidthColumns.forEach((column) => {
        const minimumWidth = numeric(column._prototypeAutoMinWidth || column.minWidth || column.realMinWidth)
        if (!column._prototypeAutoMinWidth) column._prototypeAutoMinWidth = minimumWidth
        const width = fittedContentWidth({
          measuredWidth: measuredColumnContentWidth(root, column),
          minimumWidth: column._prototypeAutoMinWidth,
          maximumWidth,
        })
        if (numeric(column.width || column.realWidth) === width) return
        column.width = width
        column.minWidth = width
        column.realWidth = width
        column.realMinWidth = width
        column._prototypeAutoWidth = width
        changed = true
      })

      fittedDataSignature = signature
      if (!changed) return false
      store.updateColumns()
      store.scheduleLayout(false, true)
      return true
    }

    function scheduleBusinessColumnFit() {
      const root = tableRef.value?.$el
      observeBusinessContent(root)
      fitBusinessColumns()
      scheduleTableFiller()
    }

    function scheduleOperationColumnFit() {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(() => nextTick(() => {
        const root = tableRef.value?.$el
        observeOperationContent(root)
        fitOperationColumn(tableRef.value)
        scheduleTableFiller()
      }))
    }

    function updateTableFiller() {
      const table = tableRef.value
      const root = table?.$el
      const columns = table?.store?.states?._columns?.value || []
      if (!root || !columns.length) return

      const columnWidths = columns
        .filter(column => !isFillerColumn(column))
        .map(column => numeric(column.realWidth || column.width || column.minWidth || 80))
      const gutterWidth = table.layout?.scrollY?.value ? numeric(table.layout?.gutterWidth) : 0
      const nextWidth = tableFillerWidth(root.clientWidth - gutterWidth, columnWidths)
      if (fillerWidth.value !== nextWidth) fillerWidth.value = nextWidth
    }

    function scheduleTableFiller() {
      cancelAnimationFrame(fillerAnimationFrame)
      fillerAnimationFrame = requestAnimationFrame(() => nextTick(updateTableFiller))
    }

    function scheduleTableMeasurements() {
      syncPanelSortability()
      scheduleBusinessColumnFit()
      scheduleOperationColumnFit()
      scheduleTableFiller()
    }

    function syncPanelSortability() {
      const columns = tableRef.value?.store?.states?._columns?.value || []
      columns.forEach((column) => {
        if (column.type !== 'default' || String(column.label || '').trim() === '操作') return
        const classes = classNames(column.labelClassName)
        column._prototypePanelSortable = !classes.includes('prototype-panel-sort-disabled')
      })
    }

    onMounted(() => {
      fitBusinessColumns()
      scheduleTableMeasurements()
      const root = tableRef.value?.$el
      if (!root) return
      operationContentObserver = new ResizeObserver(scheduleOperationColumnFit)
      observeOperationContent(root)
      businessContentObserver = new ResizeObserver(scheduleBusinessColumnFit)
      observeBusinessContent(root)
      tableResizeObserver = new ResizeObserver(scheduleTableFiller)
      tableResizeObserver.observe(root)
      mutationObserver = new MutationObserver(scheduleTableMeasurements)
      mutationObserver.observe(root, { childList: true, subtree: true, characterData: true })
    })

    onBeforeUnmount(() => {
      cancelAnimationFrame(animationFrame)
      cancelAnimationFrame(fillerAnimationFrame)
      operationContentObserver?.disconnect()
      businessContentObserver?.disconnect()
      tableResizeObserver?.disconnect()
      observedOperationTargets.clear()
      observedBusinessTargets.clear()
      mutationObserver?.disconnect()
    })

    const displayedRows = computed(() => {
      const rows = sortRows(attrs.data, sortState.value)
      if (!pagination?.value?.enabled) return rows
      return paginateRows(rows, pagination.value.currentPage, pagination.value.pageSize)
    })

    function handleSortChange(payload) {
      sortState.value = payload?.order
        ? { prop: payload.prop || payload.column?.property, order: payload.order, sortMethod: payload.column?.sortMethod }
        : null
      pagination?.value?.reset?.()
      callListener(attrs.onSortChange, payload)
      scheduleTableMeasurements()
    }

    function handleHeaderDragend(newWidth, oldWidth, column, event) {
      if (isAutoWidthColumn(column)) {
        column._prototypeUserSized = true
        column._prototypeAutoWidth = null
      }
      callListener(attrs.onHeaderDragend, newWidth, oldWidth, column, event)
      observeBusinessContent(tableRef.value?.$el)
      scheduleTableFiller()
    }

    const forward = method => (...args) => tableRef.value?.[method]?.(...args)
    expose({
      clearSelection: forward('clearSelection'),
      getSelectionRows: forward('getSelectionRows'),
      clearSort: () => {
        sortState.value = null
        const table = tableRef.value
        const columns = table?.store?.states?.columns?.value || []
        columns.forEach((column) => { column.order = null })
        if (table?.store?.states?.sortingColumn) table.store.states.sortingColumn.value = null
        if (table?.store?.states?.sortProp) table.store.states.sortProp.value = null
        if (table?.store?.states?.sortOrder) table.store.states.sortOrder.value = null
        pagination?.value?.reset?.()
      },
      setCurrentRow: forward('setCurrentRow'),
      sort: (prop, order, sortMethod) => {
        sortState.value = order ? { prop, order, sortMethod } : null
        const table = tableRef.value
        const column = table?.store?.states?.columns?.value?.find(item => item.property === prop)
        ;(table?.store?.states?.columns?.value || []).forEach((item) => {
          item.order = item === column && order ? order : null
        })
        if (table?.store?.states?.sortingColumn) table.store.states.sortingColumn.value = order ? column : null
        if (table?.store?.states?.sortProp) table.store.states.sortProp.value = order ? prop : null
        if (table?.store?.states?.sortOrder) table.store.states.sortOrder.value = order || null
        pagination?.value?.reset?.()
      },
      toggleAllSelection: forward('toggleAllSelection'),
      toggleRowExpansion: forward('toggleRowExpansion'),
      toggleRowSelection: forward('toggleRowSelection'),
    })

    const tableSlots = () => ({
      ...slots,
      default: () => {
        const children = slots.default?.() || []
        if (!fillerWidth.value) return children
        return [
          ...children,
          h(ElementTableColumn, {
            key: 'prototype-table-filler',
            label: '',
            width: fillerWidth.value,
            sortable: false,
            resizable: false,
            className: 'prototype-table-filler-column',
            labelClassName: 'prototype-table-filler-column',
          }),
        ]
      },
    })

    return () => h(ElementTable, {
      ...independentTableProps(attrs),
      ref: tableRef,
      data: displayedRows.value,
      onSortChange: handleSortChange,
      onHeaderDragend: handleHeaderDragend,
    }, tableSlots())
  },
})
</script>
