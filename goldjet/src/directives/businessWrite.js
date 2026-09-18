import { watchEffect } from 'vue'
import { canWriteModule } from '../data/accessControl.js'

// The module is declared by each command, never inferred from its text or DOM.
function observe(el, binding) {
    el.__permissionStop?.()
    el.__permissionStop = watchEffect(() => {
      const keys = Array.isArray(binding.value) ? binding.value : [binding.value]
      el.hidden = !keys.every(canWriteModule)
      el.style.setProperty('display', el.hidden ? 'none' : '', el.hidden ? 'important' : '')
    })
}

export const businessWrite = {
  mounted: observe,
  updated(el, binding) { if (binding.value !== binding.oldValue) observe(el, binding) },
  beforeUnmount(el) { el.__permissionStop?.() },
}
