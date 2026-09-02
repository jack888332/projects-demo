export const UI_DEFAULTS = Object.freeze({
  viewport: Object.freeze({
    minimumWidth: 320,
    narrowMaxWidth: 760,
  }),
  interaction: Object.freeze({
    targetSize: 32,
    coarsePointerTargetSize: 44,
  }),
  overlay: Object.freeze({
    viewportInset: 16,
    narrowViewportInset: 8,
    dialogWidths: Object.freeze({
      small: 560,
      default: 760,
      large: 980,
      xlarge: 1500,
    }),
  }),
  table: Object.freeze({
    autoWidth: Object.freeze({
      enabled: true,
      maxWidth: 260,
      sampleSize: 100,
      fallbackWidth: 120,
    }),
  }),
  verification: Object.freeze({
    viewports: Object.freeze([
      Object.freeze({ name: '窄屏手机', width: 390, height: 844 }),
      Object.freeze({ name: '宽屏平板', width: 1024, height: 768 }),
      Object.freeze({ name: '宽屏桌面', width: 1440, height: 900 }),
    ]),
  }),
})

export function resolveViewportMode(width) {
  return Number(width) <= UI_DEFAULTS.viewport.narrowMaxWidth ? 'narrow' : 'wide'
}

export function uiDefaultsCss(defaults = UI_DEFAULTS) {
  const regularGutter = defaults.overlay.viewportInset * 2
  const narrowGutter = defaults.overlay.narrowViewportInset * 2
  const dialogWidths = defaults.overlay.dialogWidths
  return `:root {
  --ui-minimum-viewport-width: ${defaults.viewport.minimumWidth}px;
  --interactive-target-min: ${defaults.interaction.targetSize}px;
  --dialog-viewport-gutter: ${regularGutter}px;
  --dialog-width-small: ${dialogWidths.small}px;
  --dialog-width-default: ${dialogWidths.default}px;
  --dialog-width-large: ${dialogWidths.large}px;
  --dialog-width-xlarge: ${dialogWidths.xlarge}px;
}
@media (max-width: ${defaults.viewport.narrowMaxWidth}px) {
  :root { --dialog-viewport-gutter: ${narrowGutter}px; }
}
@media (pointer: coarse) {
  :root { --interactive-target-min: ${defaults.interaction.coarsePointerTargetSize}px; }
}`
}

export function applyUiDefaults(documentRoot = globalThis.document) {
  if (!documentRoot?.head) return null
  const styleId = 'prototype-ui-defaults'
  let style = documentRoot.getElementById(styleId)
  if (!style) {
    style = documentRoot.createElement('style')
    style.id = styleId
    documentRoot.head.prepend(style)
  }
  style.textContent = uiDefaultsCss()
  return style
}

export function applyViewportMode(documentRoot = globalThis.document, width = globalThis.window?.innerWidth) {
  const root = documentRoot?.documentElement
  const numericWidth = Number(width)
  if (!root?.dataset || !Number.isFinite(numericWidth)) return null
  const mode = resolveViewportMode(numericWidth)
  root.dataset.uiLayout = mode
  return mode
}

export function bindViewportMode(
  documentRoot = globalThis.document,
  viewportSource = globalThis.window,
) {
  if (!viewportSource?.addEventListener) return () => {}
  const update = () => applyViewportMode(documentRoot, viewportSource.innerWidth)
  update()
  viewportSource.addEventListener('resize', update, { passive: true })
  return () => viewportSource.removeEventListener('resize', update)
}
