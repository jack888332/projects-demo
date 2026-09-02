import { computed, ref } from 'vue'

export function useLinkedQueryAreas({
  areas,
  defaultArea,
  submitMode = 'all',
  buttonPlacement = 'last-changed',
}) {
  const entries = Object.entries(areas || {})
  const fallbackArea = defaultArea && areas?.[defaultArea] ? defaultArea : entries[0]?.[0] || ''
  const activeArea = ref(fallbackArea)

  function touch(area) {
    if (!areas?.[area] || buttonPlacement !== 'last-changed') return
    activeArea.value = area
  }

  function isSubmitArea(area) {
    return activeArea.value === area
  }

  function submit() {
    const targets = submitMode === 'active'
      ? entries.filter(([area]) => area === activeArea.value)
      : entries
    targets.forEach(([, config]) => config.apply?.())
  }

  function reset() {
    entries.forEach(([, config]) => config.reset?.())
  }

  return {
    activeArea: computed(() => activeArea.value),
    touch,
    isSubmitArea,
    submit,
    reset,
  }
}
