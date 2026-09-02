import { describe, expect, it } from 'vitest'
import { canResizeTableColumn, fittedContentWidth, independentColumnWidth, independentTableProps, normalizeTableColumnAttrs, TABLE_AUTO_WIDTH_CONFIG, tableFillerWidth } from '../src/shared/components/tableSizing.js'

describe('independent table sizing', () => {
  it('keeps list content sizing defaults in one shared configuration', () => {
    expect(TABLE_AUTO_WIDTH_CONFIG).toEqual({ enabled: true, maxWidth: 260, sampleSize: 100, fallbackWidth: 120 })
    expect(fittedContentWidth({ measuredWidth: 420, minimumWidth: 80 })).toBe(TABLE_AUTO_WIDTH_CONFIG.maxWidth)
  })

  it('normalizes template attribute aliases before calculating column widths', () => {
    const sortMethod = () => 0
    expect(normalizeTableColumnAttrs({
      label: '费项',
      'min-width': '180',
      'show-overflow-tooltip': false,
      'label-class-name': 'custom-header',
      'sort-method': sortMethod,
    })).toEqual({
      label: '费项',
      minWidth: '180',
      showOverflowTooltip: false,
      labelClassName: 'custom-header',
      sortMethod,
    })
  })

  it('keeps fit disabled even when a page attempts to enable it', () => {
    expect(independentTableProps({ fit: true, border: false, stripe: true })).toEqual({
      fit: false,
      border: false,
      stripe: true,
      allowDragLastColumn: true,
    })
  })

  it('preserves explicit widths and sizes unspecified columns from intrinsic content', () => {
    expect(independentColumnWidth({
      declaredWidth: 85,
      headerWidth: 74,
      contentWidth: 220,
    })).toBe(85)

    expect(independentColumnWidth({
      declaredMinWidth: 150,
      headerWidth: 132,
      contentWidth: 220,
    })).toBe(220)

    expect(independentColumnWidth({ headerWidth: 86 })).toBe(86)
    expect(independentColumnWidth({ contentWidth: 174, headerWidth: 86 })).toBe(174)
    expect(independentColumnWidth({})).toBe(120)
  })

  it('caps content-fitted widths while respecting the intrinsic minimum', () => {
    expect(fittedContentWidth({ measuredWidth: 174, minimumWidth: 86 })).toBe(174)
    expect(fittedContentWidth({ measuredWidth: 72, minimumWidth: 125 })).toBe(125)
    expect(fittedContentWidth({ measuredWidth: 420, minimumWidth: 125, maximumWidth: 260 })).toBe(260)
    expect(fittedContentWidth({ measuredWidth: 420, minimumWidth: 280, maximumWidth: 260 })).toBe(280)
  })

  it('only allows ordinary non-fixed columns to be resized', () => {
    expect(canResizeTableColumn()).toBe(true)
    expect(canResizeTableColumn({ fixed: 'right' })).toBe(true)
    expect(canResizeTableColumn({ excluded: true })).toBe(false)
    expect(canResizeTableColumn({ resizable: false })).toBe(false)
  })

  it('fills unused viewport space without stretching business columns', () => {
    expect(tableFillerWidth(1012, [48, 120, 120, 145, 130, 130, 165, 85, 52])).toBe(17)
    expect(tableFillerWidth(900, [48, 120, 120, 145, 130, 130, 165, 85, 52])).toBe(0)
  })
})
