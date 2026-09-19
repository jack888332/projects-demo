import { onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

export function useDraftNavigation(isDirty, leave, clearSelection) {
  onBeforeRouteLeave(leave)
  onBeforeRouteUpdate(async () => {
    if (!await leave()) return false
    clearSelection()
    return true
  })
  const unload = event => {
    if (!isDirty()) return
    event.preventDefault()
    event.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', unload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', unload))
}
