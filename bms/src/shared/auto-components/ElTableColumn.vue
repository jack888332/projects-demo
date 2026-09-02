<script>
import { defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElTableColumn as ElementTableColumn, ElTooltip } from 'element-plus'
import { canResizeTableColumn, independentColumnWidth, normalizeTableColumnAttrs } from '../components/tableSizing.js'
import { resolveTableColumnSorting, tableHeaderSortState } from '../components/tableSortability.js'
import SortDirectionIcon from '../components/SortDirectionIcon.vue'

const NON_DATA_TYPES = new Set(['selection', 'index', 'expand'])

const LABEL_SORT_KEYS = {
  供应商名称: ['name', 'supplier'],
  适用成本板块: ['boards', 'board'],
  板块账期配置: ['periodConfigs', 'cycles'],
  成本账单编号: ['id', 'billNo', 'no'],
  分摊集编号: ['id', 'no'],
  账单金额: ['amount'],
  已结清金额: ['settled'],
  金额: ['amount'],
  状态: ['status', 'state'],
  账单状态: ['status', 'state'],
  审核状态: ['status', 'reviewStatus'],
  成本完整性: ['status', 'completeness'],
  生效周期: ['effectStart', 'effective'],
  最近操作: ['updatedAt', 'operator'],
  '优先 / 兜底因子': ['factor', 'fallback'],
  纳入: ['selected'],
  费项: ['fee', 'feeCode'],
  结算币种: ['currency', 'mode'],
  固定币种: ['currency'],
  应收金额: ['receivable', 'amount'],
  已收金额: ['received'],
  应收未收: ['outstanding'],
  逾期未收: ['overdue'],
  待审核金额: ['pendingReview'],
  未收金额: ['amount', 'outstanding'],
  已核销金额: ['written', 'paid'],
  待核销金额: ['pending'],
  运费: ['freight'],
  派送附加费: ['deliverySurcharge', 'surcharge'],
  仓储费: ['warehouseFee', 'storageFee'],
  操作费: ['operationFee'],
  结算金额: ['amount', 'settlementAmount'],
  金额变幅: ['delta'],
  核销金额: ['amount'],
  原始货款: ['original'],
  应返货款: ['refundable'],
  已返货款: ['returned', 'refunded'],
  待返货款: ['pending'],
  扣减金额: ['amount'],
  锁定汇率: ['rate'],
  回款状态: ['recoveryStatus'],
  返款状态: ['refundStatus'],
  回款金额: ['recoveryAmount'],
  货币对: ['direction', 'pair'],
  汇率: ['rate', 'result'],
  任务状态: ['status'],
  任务类型: ['taskType', 'type'],
  账单生成方式: ['generationMode'],
  触发方式: ['triggerType', 'trigger'],
  账单配置: ['configCode', 'config'],
  导出进度: ['progress'],
  执行结果: ['result'],
  财务侧报表: ['finance'],
  系统侧报表: ['system'],
  '基础运费（财务侧）': ['financeFreight'],
  '基础运费（系统侧）': ['systemFreight'],
  '派送附加费（财务侧）': ['financeSurcharge'],
  '派送附加费（系统侧）': ['systemSurcharge'],
  货款原始币种: ['sourceCurrency'],
  货款结算币种: ['settlementCurrency'],
  客户收款账户: ['accountName', 'accountNo'],
  客户: ['customer', 'customerName', 'customerNo'],
  '拉取 / 命中': ['pulled', 'matched'],
}

const DYNAMIC_LABEL_SORT_KEYS = [
  [/结算币种金额$/, ['amount', 'original']],
  [/（财务侧）$/, ['finance']],
  [/（系统侧）$/, ['system']],
]

const PrototypeTableHeaderLabel = defineComponent({
  name: 'PrototypeTableHeaderLabel',
  props: {
    label: { type: String, required: true },
    column: { type: Object, default: null },
  },
  setup(props) {
    const labelElement = ref(null)
    const truncated = ref(false)
    let resizeObserver

    function updateOverflow() {
      const element = labelElement.value
      truncated.value = Boolean(element && element.scrollWidth > element.clientWidth + 1)
    }

    onMounted(() => {
      nextTick(updateOverflow)
      if (typeof ResizeObserver !== 'undefined' && labelElement.value) {
        resizeObserver = new ResizeObserver(updateOverflow)
        resizeObserver.observe(labelElement.value)
      }
    })

    onBeforeUnmount(() => resizeObserver?.disconnect())
    watch(() => props.label, () => nextTick(updateOverflow))

    return () => h(ElTooltip, {
      content: props.label,
      disabled: !truncated.value,
      placement: 'top',
      showAfter: 0,
      hideAfter: 0,
      popperClass: 'prototype-table-header-tooltip',
    }, {
      default: () => h('span', {
        class: 'prototype-table-header-content',
      }, [
        h('span', {
          ref: labelElement,
          class: 'prototype-table-header-label',
        }, props.label),
        tableHeaderSortState(props.column?.order)
          ? h('span', {
              class: [
                'prototype-table-header-sort-state',
                tableHeaderSortState(props.column.order).className,
              ],
              role: 'img',
              'aria-label': tableHeaderSortState(props.column.order).ariaLabel,
            }, [h(SortDirectionIcon)])
          : null,
      ]),
    })
  },
})

function estimatedTextWidth(value) {
  return Array.from(String(value ?? '')).reduce((width, character) => {
    if (/\p{Script=Han}/u.test(character)) return width + 14
    if (/\s/.test(character)) return width + 4
    return width + 8
  }, 0)
}

function estimatedHeaderWidth(label) {
  return Math.ceil(estimatedTextWidth(label) + 28)
}

function displayText(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return value.join('、')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function estimatedCellWidth(value) {
  const lines = displayText(value).split(/\r?\n/)
  const textWidth = Math.max(0, ...lines.map(estimatedTextWidth))
  return Math.ceil(textWidth + 32)
}

function valueAtPath(row, path) {
  if (!path) return ''
  return String(path).split('.').reduce((value, key) => value?.[key], row)
}

function contentWidth(rows, prop, valueGetter, maxWidth, sampleSize) {
  const sampledRows = rows.slice(0, Math.max(1, sampleSize))
  const widest = sampledRows.reduce((width, row) => {
    const value = typeof valueGetter === 'function'
      ? valueGetter(row)
      : valueAtPath(row, valueGetter || prop)
    return Math.max(width, estimatedCellWidth(value))
  }, 0)
  return Math.min(widest, maxWidth)
}

function syntheticSortProperty(label) {
  const encoded = Array.from(label)
    .map((character) => character.codePointAt(0).toString(16))
    .join('_')
  return `__prototype_sort_${encoded}`
}

function numericWidth(value) {
  if (value == null || value === '') return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mergeClassName(value, className) {
  return [value, className].filter(Boolean).join(' ')
}

function sortKeysFor(label) {
  if (LABEL_SORT_KEYS[label]) return LABEL_SORT_KEYS[label]
  return DYNAMIC_LABEL_SORT_KEYS.find(([pattern]) => pattern.test(label))?.[1] || []
}

function rowValue(row, label, sortKey) {
  if (typeof sortKey === 'function') return sortKey(row)
  const candidates = sortKey ? [sortKey] : sortKeysFor(label)
  const key = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(row, candidate))
  return key ? row[key] : ''
}

function comparable(value) {
  if (value == null) return { kind: 0, value: '' }
  if (typeof value === 'boolean') return { kind: 1, value: Number(value) }
  if (typeof value === 'number') return { kind: 1, value }
  if (Array.isArray(value)) return { kind: 2, value: value.join('、') }
  if (typeof value === 'object') return { kind: 2, value: JSON.stringify(value) }

  const text = String(value).trim()
  const numeric = text.replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)(?:\s*[A-Za-z]{3}|\s*[%个份家笔条天秒])?$/)
  if (numeric) return { kind: 1, value: Number(numeric[1]) }
  return { kind: 2, value: text }
}

function compareValues(left, right) {
  const a = comparable(left)
  const b = comparable(right)
  if (a.kind !== b.kind) return a.kind - b.kind
  if (a.kind === 1) return a.value - b.value
  return String(a.value).localeCompare(String(b.value), 'zh-CN', { numeric: true })
}

export default defineComponent({
  name: 'PrototypeTableColumn',
  inheritAttrs: false,
  props: {
    sortKey: { type: [String, Function], default: '' },
    autoWidthKey: { type: [String, Function], default: '' },
    panelSortable: { type: Boolean, default: true },
  },
  setup(props, { attrs, slots }) {
    const columnDataSort = inject('prototypeTableColumnDataSort', null)
    const tableAutoWidth = inject('prototypeTableAutoWidth', null)
    const tableRows = inject('prototypeTableRows', null)

    return () => {
      const columnAttrs = normalizeTableColumnAttrs(attrs)
      const label = typeof columnAttrs.label === 'string' ? columnAttrs.label : ''
      const excluded = NON_DATA_TYPES.has(columnAttrs.type) || label === '操作'
      const frameSortingDisabled = columnDataSort?.value === false
      const sorting = resolveTableColumnSorting({
        excluded,
        frameSortingDisabled,
        panelSortable: props.panelSortable,
      })
      const forwarded = { ...columnAttrs, sortable: sorting.headerSortable }
      const resizable = canResizeTableColumn({ excluded, fixed: columnAttrs.fixed, resizable: columnAttrs.resizable })

      forwarded.resizable = resizable

      if (!excluded) {
        const headerWidth = estimatedHeaderWidth(label)
        const declaredWidth = numericWidth(columnAttrs.width)
        const declaredMinWidth = numericWidth(columnAttrs.minWidth)
        const autoWidthConfig = tableAutoWidth?.value
        const widthRows = tableRows?.value?.length ? tableRows.value : (autoWidthConfig?.rows || [])
        const measuredContentWidth = autoWidthConfig?.enabled !== false && widthRows.length
          ? contentWidth(
              widthRows,
              columnAttrs.prop,
              props.autoWidthKey,
              autoWidthConfig.maxWidth,
              autoWidthConfig.sampleSize,
            )
          : 0

        forwarded.showOverflowTooltip = columnAttrs.showOverflowTooltip ?? true
        forwarded.width = independentColumnWidth({
          declaredWidth,
          declaredMinWidth,
          headerWidth,
          contentWidth: measuredContentWidth,
        })
        if (declaredWidth) delete forwarded.minWidth
        else forwarded.minWidth = Math.max(declaredMinWidth, headerWidth)
        const sizingClass = resizable && !declaredWidth ? 'prototype-auto-width-column' : ''
        const resizeClass = resizable ? 'prototype-resizable-column' : ''
        const panelSortClass = sorting.panelSortable ? '' : 'prototype-panel-sort-disabled'
        forwarded.labelClassName = mergeClassName(
          columnAttrs.labelClassName,
          [resizeClass, sizingClass, panelSortClass].filter(Boolean).join(' '),
        )
      }

      if (sorting.panelSortable && !columnAttrs.prop && !columnAttrs.sortMethod) {
        forwarded.prop = syntheticSortProperty(label)
        forwarded.sortMethod = (left, right) => compareValues(
          rowValue(left, label, props.sortKey),
          rowValue(right, label, props.sortKey),
        )
      }

      const forwardedSlots = label && !slots.header
        ? {
            ...slots,
            header: ({ column }) => h(PrototypeTableHeaderLabel, {
              label,
              column,
            }),
          }
        : slots

      return h(ElementTableColumn, forwarded, forwardedSlots)
    }
  },
})
</script>
