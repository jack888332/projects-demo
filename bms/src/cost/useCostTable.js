import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DEMO_DATA_CHANGED_EVENT } from '../data/events.js'
import { createTableRepository } from '../data/repositories/tableRepository.js'

const clone = (value) => JSON.parse(JSON.stringify(value))

export function useCostTable(tableName) {
  const repository = createTableRepository(tableName)
  const rows = ref([])
  const ready = ref(false)
  let persistedRows = []
  let saveTimer = null

  async function hydrate() {
    window.clearTimeout(saveTimer)
    ready.value = false
    rows.value = await repository.list()
    persistedRows = clone(rows.value)
    ready.value = true
  }

  async function persist() {
    const snapshot = clone(rows.value)
    await repository.sync(persistedRows, snapshot)
    persistedRows = snapshot
  }

  function schedulePersist() {
    if (!ready.value) return
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => persist().catch(console.error), 80)
  }

  watch(rows, schedulePersist, { deep: true })
  onMounted(() => {
    hydrate().catch(console.error)
    window.addEventListener(DEMO_DATA_CHANGED_EVENT, hydrate)
  })
  onBeforeUnmount(() => {
    window.clearTimeout(saveTimer)
    if (ready.value) persist().catch(console.error)
    window.removeEventListener(DEMO_DATA_CHANGED_EVENT, hydrate)
  })

  return rows
}
