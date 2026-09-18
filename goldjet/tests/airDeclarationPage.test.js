import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, reactive } from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as declarations from '../src/domain/airDeclarations.js'

const data = usePrototypeData(), scopes = []
const route = reactive({ query: {} }), push = vi.fn()
const modules = {
  vue, 'vue-router': { useRoute: () => route, useRouter: () => ({ push }) },
  'element-plus': { ElMessage: { success: vi.fn() } },
  '@element-plus/icons-vue': new Proxy({}, { get: () => ({}) }),
  '../data/usePrototypeData.js': { usePrototypeData: () => data },
  '../domain/airDeclarations.js': declarations,
}
const filename = new URL('../src/views/AirDeclarationsView.vue', import.meta.url)
const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
expect(parsed.errors).toEqual([])
const script = compileScript(parsed.descriptor, { id: 'declarations-page' })
expect(compileTemplate({ source: parsed.descriptor.template.content, filename: filename.pathname, id: 'declarations-page', compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
const imported = {}, imports = script.scriptSetupAst.filter(node => node.type === 'ImportDeclaration')
let body = parsed.descriptor.scriptSetup.content
for (const node of imports) {
  const module = modules[node.source.value] || { default: {} }
  for (const specifier of node.specifiers) imported[specifier.local.name] = specifier.type === 'ImportDefaultSpecifier' ? module.default : module[specifier.imported.name]
}
for (const node of imports.toReversed()) body = body.slice(0, node.start) + body.slice(node.end)
const run = new Function(...Object.keys(imported), `${body}\nreturn { ${Object.keys(script.bindings).join(', ')} }`)
function setup() { const scope = effectScope(); scopes.push(scope); return scope.run(() => run(...Object.values(imported))) }
beforeEach(() => { data.reset(); data.selectWorkbenchPersona('customsService'); route.query = {}; push.mockReset() })
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))

describe('GJ-012 报关页面与中央 owner', () => {
  it('样例显式载入且幂等，不将报关角色扩张为空运编辑角色', () => {
    const view = setup(), original = data.state.airOrders.length
    expect(view.rows.value).toEqual([])
    view.loadExamples()
    expect(view.rows.value).toHaveLength(3)
    expect(data.state.airOrders).toHaveLength(original + 2)
    view.loadExamples()
    expect(data.state.airOrders).toHaveLength(original + 2)
    expect(data.airSession.role).toBe('viewer')
  })
  it('查询应用草稿、日期和模糊条件；重置清空筛选和跨页选择', () => {
    const view = setup(); view.loadExamples()
    const row = view.rows.value.find(item => !item.childId)
    view.toggle(row.id, true)
    view.filters.serviceNo = row.id
    expect(view.rows.value).toHaveLength(3)
    view.query()
    expect(view.rows.value.map(item => item.id)).toEqual([row.id])
    expect(view.selected.value).toEqual([])
    view.filters.created = ['2099-01-01', '2099-01-02']; view.query()
    expect(view.rows.value).toEqual([])
    view.resetQuery(); expect(view.rows.value).toHaveLength(3)
  })
  it('选择跨页保留，整页操作不影响其他页；空材料不能冒充可下载项', () => {
    const view = setup(); view.loadExamples()
    const [first, second, third] = view.rows.value
    view.togglePage([first, second], true); view.toggle(third.id, true)
    expect(view.selected.value).toHaveLength(3)
    view.togglePage([first, second], false)
    expect(view.selected.value).toEqual([third.id])
    const empty = view.rows.value.find(item => !item.materials.length)
    view.selected.value = [empty.id]; expect(view.hasSelectedMaterials.value).toBe(false)
  })
  it('深链定位同一服务；来源与提单链接保持分单上下文', () => {
    data.loadAirDeclarationExamples()
    const row = data.airDeclarations.value.find(item => item.childId)
    route.query = { service: row.id }
    const view = setup()
    expect(view.detail.value.id).toBe(row.id)
    expect(view.rows.value.map(item => item.id)).toEqual([row.id])
    view.source(row); expect(push).toHaveBeenLastCalledWith({ ...row.target, query: { ...row.target.query, inspect: 'service' } })
    view.waybill(row); expect(push).toHaveBeenLastCalledWith({ path: `/fulfillment/airway-bills/${row.orderId}`, query: { child: row.childId } })
  })
  it.each(['role', 'reset'])('%s变化关闭旧详情/材料窗口、清除选择，不能保留操作权限', change => {
    const view = setup(); view.loadExamples(); const row = view.rows.value[0]
    view.toggle(row.id, true); view.openDetail(row); view.openMaterials([row.id], 'notify')
    if (change === 'role') data.selectWorkbenchPersona('service'); else data.reset()
    expect(view.detailVisible.value).toBe(false)
    expect(view.materialsVisible.value).toBe(false)
    expect(view.selected.value).toEqual([])
    expect(view.allowed.value).toBe(false)
    expect(() => data.loadAirDeclarationExamples()).toThrow()
  })
  it('过期深链提供原因，不显示不存在的记录', () => {
    route.query = { service: 'removed' }; const view = setup()
    expect(view.failure.value).toContain('不存在')
    expect(view.detailVisible.value).toBe(false)
  })
  it('先打开示例深链再载入数据，仍定位指定服务；未知链接不冒充成功', () => {
    route.query = { service: 'DEMO-CUSTOMS-SERVICE-CHILD-01' }
    const view = setup()
    expect(view.failure.value).toContain('不存在')
    view.loadExamples()
    expect(view.failure.value).toBe('')
    expect(view.detailVisible.value).toBe(true)
    expect(view.rows.value.map(row => row.id)).toEqual([route.query.service])
    route.query = { service: 'removed' }
    view.loadExamples()
    expect(view.failure.value).toContain('不存在')
    expect(view.detailVisible.value).toBe(false)
  })
  it('移单后的服务仍能定位，未关联提单不跳转空订单；取消来源提示禁止新通知', () => {
    const view = setup(); view.loadExamples()
    const child = data.state.airChildren.find(row => row.id === 'DEMO-CUSTOMS-CHILD-01')
    child.parentId = ''
    const row = view.allRows.value.find(item => item.childId === child.id)
    expect(row.orderId).toBe('')
    expect(view.waybill(row)).toBe(false)
    expect(push).not.toHaveBeenCalled()
    child.orderStatus = '已取消'
    view.toggle(row.id, true)
    expect(view.selectedNotifyReason.value).toBeTruthy()
    expect(view.hasSelectedMaterials.value).toBe(true)
  })
})
