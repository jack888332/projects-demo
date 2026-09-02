import { reactive } from 'vue'

const clone = (value) => {
  if (value instanceof Date) return new Date(value)
  if (Array.isArray(value)) return value.map(clone)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]))
  }
  return value
}

function replace(target, value) {
  Object.keys(target).forEach((key) => delete target[key])
  Object.assign(target, clone(value))
}

export function useStagedQuery(initialValue) {
  const initial = clone(initialValue)
  const query = reactive(clone(initial))
  const appliedQuery = reactive(clone(initial))

  const applyQuery = () => replace(appliedQuery, query)
  const resetQuery = () => {
    replace(query, initial)
    replace(appliedQuery, initial)
  }

  return { query, appliedQuery, applyQuery, resetQuery }
}
