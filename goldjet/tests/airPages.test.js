import { describe, expect, it } from 'vitest'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

describe('空运页面模板与脚本编译', () => {
  for (const path of ['src/views/AirOrdersView.vue', 'src/views/BookingView.vue', 'src/components/AirOrderCreateDialog.vue', 'src/AppShell.vue', 'src/views/DashboardView.vue', 'src/views/GroundDispatchView.vue', 'src/views/GroundWaybillsView.vue', 'src/views/PartnersView.vue', 'src/components/PartnerRecordFields.vue', 'src/components/PartnerAttachments.vue', 'src/components/BusinessMessages.vue', 'src/views/MessagesView.vue', 'src/views/AirMasterDataView.vue']) {
    it(path, async () => {
      const source = readFileSync(resolve(path), 'utf8')
      const parsed = parse(source, { filename: path })
      expect(parsed.errors).toEqual([])
      const script = compileScript(parsed.descriptor, { id: path })
      for (const node of script.scriptSetupAst || []) {
        if (node.type !== 'ImportDeclaration' || !node.source.value.includes('/domain/')) continue
        const module = await import(pathToFileURL(resolve(dirname(path), node.source.value)).href)
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') expect(module, `${path}: ${specifier.imported.name}`).toHaveProperty(specifier.imported.name)
        }
      }
      const template = compileTemplate({ source: parsed.descriptor.template.content, filename: path, id: path, compilerOptions: { bindingMetadata: script.bindings } })
      expect(template.errors).toEqual([])
    })
  }
})
