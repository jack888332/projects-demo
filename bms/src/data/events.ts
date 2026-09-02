export const DEMO_DATA_CHANGED_EVENT = 'bms-demo-data-changed'

export function notifyDemoDataChanged(): void {
  window.dispatchEvent(new CustomEvent(DEMO_DATA_CHANGED_EVENT))
}
