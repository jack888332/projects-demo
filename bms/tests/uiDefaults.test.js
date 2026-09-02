import { describe, expect, it } from 'vitest'
import { applyViewportMode, UI_DEFAULTS, resolveViewportMode, uiDefaultsCss } from '../src/shared/config/uiDefaults.js'

describe('shared UI defaults', () => {
  it('keeps reusable viewport, interaction, overlay, and table values together', () => {
    expect(UI_DEFAULTS.viewport).toEqual({ minimumWidth: 320, narrowMaxWidth: 760 })
    expect(UI_DEFAULTS.interaction).toEqual({ targetSize: 32, coarsePointerTargetSize: 44 })
    expect(UI_DEFAULTS.overlay).toEqual({
      viewportInset: 16,
      narrowViewportInset: 8,
      dialogWidths: { small: 560, default: 760, large: 980, xlarge: 1500 },
    })
    expect(UI_DEFAULTS.table.autoWidth).toEqual({
      enabled: true,
      maxWidth: 260,
      sampleSize: 100,
      fallbackWidth: 120,
    })
    expect(UI_DEFAULTS.verification.viewports).toEqual([
      { name: '窄屏手机', width: 390, height: 844 },
      { name: '宽屏平板', width: 1024, height: 768 },
      { name: '宽屏桌面', width: 1440, height: 900 },
    ])
  })

  it('uses available width rather than a device name to resolve layout mode', () => {
    expect(resolveViewportMode(390)).toBe('narrow')
    expect(resolveViewportMode(760)).toBe('narrow')
    expect(resolveViewportMode(761)).toBe('wide')
    expect(resolveViewportMode(1024)).toBe('wide')
    const documentRoot = { documentElement: { dataset: {} } }
    expect(applyViewportMode(documentRoot, 390)).toBe('narrow')
    expect(documentRoot.documentElement.dataset.uiLayout).toBe('narrow')
    expect(applyViewportMode(documentRoot, 1024)).toBe('wide')
    expect(documentRoot.documentElement.dataset.uiLayout).toBe('wide')
  })

  it('publishes responsive overlay and pointer defaults as shared CSS variables', () => {
    const css = uiDefaultsCss()
    expect(css).toContain('@media (max-width: 760px)')
    expect(css).toContain('--dialog-viewport-gutter: 32px')
    expect(css).toContain('--dialog-viewport-gutter: 16px')
    expect(css).toContain('--dialog-width-small: 560px')
    expect(css).toContain('--dialog-width-xlarge: 1500px')
    expect(css).toContain('@media (pointer: coarse)')
    expect(css).toContain('--interactive-target-min: 44px')
  })
})
