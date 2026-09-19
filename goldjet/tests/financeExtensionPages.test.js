import { describe, it, expect } from 'vitest'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('GJ-026 to GJ-033 affected Vue components compile', () => {
  for (const path of [
    ...['FinanceWriteoffs', 'FinanceExpenses', 'FinanceInvoices', 'StatementTemplates', 'Messages', 'Reports', 'OperationsScreen', 'DdpFlows', 'Dashboard'].map(name => `src/views/${name}View.vue`),
    ...['RecordQueryTable', 'OperationsChart', 'BusinessMessages'].map(name => `src/components/${name}.vue`),
  ]) {
    it(path, () => {
      const { descriptor, errors } = parse(readFileSync(resolve(path), 'utf8'), { filename: path })
      expect(errors).toEqual([])
      const script = compileScript(descriptor, { id: path })
      const template = compileTemplate({ source: descriptor.template.content, filename: path, id: path, compilerOptions: { bindingMetadata: script.bindings } })
      expect(template.errors).toEqual([])
    })
  }
})
