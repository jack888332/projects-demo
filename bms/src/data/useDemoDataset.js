import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DEMO_DATA_CHANGED_EVENT } from './events.js'
import { createDemoDatasetRepository } from './repositories/demoDatasetRepository.js'

const clone = (value) => JSON.parse(JSON.stringify(value))

export function useDemoDataset(dataset, seedRows, seedVersion = 1) {
  const repository = createDemoDatasetRepository(dataset)
  const rows = ref([])
  const ready = ref(false)
  let saveTimer = null

  async function readDataset() {
    rows.value = await repository.list()
  }

  async function seedDataset() {
    await repository.ensureSeed(seedRows, seedVersion)
  }

  async function hydrate() {
    window.clearTimeout(saveTimer)
    ready.value = false
    await seedDataset()
    await readDataset()
    ready.value = true
  }

  async function persist() {
    await repository.replace(clone(rows.value))
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
