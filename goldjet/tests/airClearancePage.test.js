import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { createAirSupplementDraft } from '../src/domain/airOrderSupplement.js'
import * as clearances from '../src/domain/airClearances.js'
import * as materials from '../src/domain/airServiceMaterials.js'

const data = usePrototypeData(), scopes = [], route = vue.reactive({ query: {} })
const modules = {
  vue: { ...vue, onBeforeUnmount: () => {} }, 'vue-router': { useRoute: () => route },
  'element-plus': { ElMessage: { success: vi.fn() } }, '@element-plus/icons-vue': new Proxy({}, { get: () => ({}) }),
  '../data/usePrototypeData.js': { usePrototypeData: () => data },
  '../domain/airClearances.js': clearances, '../domain/airServiceMaterials.js': materials,
}
const filename = new URL('../src/views/AirClearancesView.vue', import.meta.url)
const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
expect(parsed.errors).toEqual([])
const script = compileScript(parsed.descriptor, { id: 'clearance-page' })
expect(compileTemplate({ source: parsed.descriptor.template.content, filename: filename.pathname, id: 'clearance-page', compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
const imported = {}, imports = script.scriptSetupAst.filter(node => node.type === 'ImportDeclaration')
let body = parsed.descriptor.scriptSetup.content
for (const node of imports) {
  const module = modules[node.source.value] || { default: {} }
  for (const specifier of node.specifiers) imported[specifier.local.name] = specifier.type === 'ImportDefaultSpecifier' ? module.default : module[specifier.imported.name]
}
for (const node of imports.toReversed()) body = body.slice(0, node.start) + body.slice(node.end)
const run = new Function(...Object.keys(imported), `${body}\nreturn { ${Object.keys(script.bindings).join(', ')} }`)
function setup() { const scope = vue.effectScope(); scopes.push(scope); return scope.run(() => run(...Object.values(imported))) }
beforeEach(() => {
  data.reset(); route.query = {}
  const order = data.state.airOrders[0], draft = createAirSupplementDraft(order, data.state.airMaster)
  Object.assign(draft, { englishGoodsName: 'DEMO PARTS', shipper: 'DEMO SHIPPER', consignee: 'DEMO RECEIVER' })
  draft.groundServices.clearance = true
  draft.clearance.attachments = [new File(['first'], 'one.pdf'), new File(['second'], 'two.jpg')]
  data.saveAirSupplement(order.id, draft); data.selectWorkbenchPersona('overseasService')
  vi.stubGlobal('document', { body: { appendChild: vi.fn() }, createElement: () => ({ click: vi.fn(), remove: vi.fn() }) })
  let urlSequence = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:demo-${++urlSequence}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('GJ-013 页面、材料与共享状态', () => {
  it('待查询条件不改变列表；查询和重置清空选择', () => {
    const view = setup(), [row] = view.rows.value
    view.toggle(row.id, true); view.filters.customer = 'missing'
    expect(view.rows.value).toHaveLength(1); view.query()
    expect(view.rows.value).toEqual([]); expect(view.selected.value).toEqual([])
    view.resetQuery(); expect(view.rows.value).toHaveLength(1)
  })
  it('确认接单写回同一服务，结果选择仅显示待确认字段，不改数量或状态', () => {
    const view = setup(), [row] = view.rows.value
    view.openDetail(row); expect(view.confirmAcceptance()).toBe(false)
    view.prepareAcceptance(); expect(view.confirmAcceptance()).toBe(true)
    expect(view.detail.value.acceptance.actor).toBe('海外演示客服')
    expect(view.detail.value.serviceStatus).toBe('待服务')
    expect(view.prepareAcceptance()).toBe(false)
    view.pickup.value = true; view.resultChanged()
    expect(view.resultTime.value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(view.detail.value.waybillCargo.pieces).toBeNull()
  })
  it('单个与批量下载使用原文件且关闭时释放全部链接', () => {
    const view = setup(), [row] = view.rows.value
    view.openMaterials([row.id]); view.selectAllMaterials(true)
    expect(view.download()).toBe(true); expect(view.downloadLinks.value).toHaveLength(2)
    expect(URL.createObjectURL.mock.calls[0][0]).toBe(row.materials[0].content)
    const old = view.downloadLinks.value[0]
    view.materialsVisible.value = false
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
    const event = { preventDefault: vi.fn() }
    expect(view.retryDownload(old, event)).toBe(false); expect(event.preventDefault).toHaveBeenCalledOnce()
  })
  it('上游重传材料使旧选择及下载链接失效，不下载重排后的另一份文件', () => {
    const view = setup(), [row] = view.rows.value
    view.openMaterials([row.id]); view.selectAllMaterials(true); view.download()
    data.state.airOrders[0].services.find(service => service.type === 'clearance').details.attachments = [new File(['new'], 'new.pdf')]
    expect(view.selectedMaterials.value).toEqual([]); expect(view.downloadLinks.value).toEqual([])
    expect(view.download()).toBe(false); expect(view.materialRows.value[0].material.fileName).toBe('new.pdf')
  })
  it.each(['role', 'reset'])('%s变化关闭上下文并阻止数据、材料和接单访问', change => {
    const view = setup(), [row] = view.rows.value
    view.openDetail(row); view.prepareAcceptance(); view.openMaterials([row.id]); view.selectAllMaterials(true); view.download()
    if (change === 'role') data.selectWorkbenchPersona('customsService'); else data.reset()
    expect(view.allRows.value).toEqual([]); expect(view.detail.value).toBeUndefined()
    expect(view.detailVisible.value).toBe(false); expect(view.materialsVisible.value).toBe(false)
    expect(view.confirmAcceptance()).toBe(false); expect(view.download()).toBe(false)
    expect(view.downloadLinks.value).toEqual([])
  })
  it('深链定位同一指令；过期服务显示失败而非空成功', () => {
    route.query = { service: data.airClearances.value[0].id }
    const view = setup(); expect(view.detail.value.id).toBe(route.query.service)
    route.query = { service: 'missing' }; view.followLink()
    expect(view.failure.value).toContain('不存在'); expect(view.detailVisible.value).toBe(false)
  })
})
