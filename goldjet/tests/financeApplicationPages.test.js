import { describe, it, expect } from 'vitest'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
describe('GJ-025 affected Vue components compile', () => {
  for (const path of ['src/views/FinanceApplicationsView.vue', 'src/components/finance/ApplicationFilters.vue', 'src/components/finance/ApplicationLines.vue', 'src/views/MessagesView.vue']) {
    it(path, () => {
      const { descriptor, errors } = parse(readFileSync(resolve(path), 'utf8'), { filename: path })
      expect(errors).toEqual([])
      const script = compileScript(descriptor, { id: path })
      const template = compileTemplate({ source: descriptor.template.content, filename: path, id: path, compilerOptions: { bindingMetadata: script.bindings } })
      expect(template.errors).toEqual([])
    })
  }
})
