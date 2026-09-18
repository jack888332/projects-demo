import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as vue from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as tracking from '../src/domain/airTracking.js'

const data = usePrototypeData(), scopes = [], route = vue.reactive({ query: {} })
const modules = { vue, 'vue-router': { useRoute: () => route }, '@element-plus/icons-vue': {},
  '../data/usePrototypeData.js': { usePrototypeData: () => data }, '../domain/airTracking.js': tracking }
const filename = new URL('../src/views/AirTrackingView.vue', import.meta.url)
const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
expect(parsed.errors).toEqual([])
const script = compileScript(parsed.descriptor, { id: 'tracking-page' })
expect(compileTemplate({ source: parsed.descriptor.template.content, filename: filename.pathname, id: 'tracking-page', compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
const imported = {}, imports = script.scriptSetupAst.filter(node => node.type === 'ImportDeclaration')
let body = parsed.descriptor.scriptSetup.content
for (const node of imports) {
  const module = modules[node.source.value] || { default: {} }
  for (const specifier of node.specifiers) imported[specifier.local.name] = specifier.type === 'ImportDefaultSpecifier' ? module.default : module[specifier.imported.name]
}
for (const node of imports.toReversed()) body = body.slice(0, node.start) + body.slice(node.end)
const run = new Function(...Object.keys(imported), `${body}\nreturn { ${Object.keys(script.bindings).join(', ')} }`)
function setup() { const scope = vue.effectScope(); scopes.push(scope); return scope.run(() => run(...Object.values(imported))) }
beforeEach(() => { data.reset(); route.query = {} })
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))

describe('GJ-014 页面交互与上下文', () => {
  it('输入与已查询结果分开，空号反馈、精确查询及重置有效', () => {
    const view = setup(), order = data.state.airOrders[0]
    expect(view.query()).toBe(false)
    expect(view.failure.value).toContain('请输入')
    view.filters.number = order.orderNo
    expect(view.result.value.kind).toBe('idle')
    view.query(); expect(view.result.value.order.id).toBe(order.id)
    view.filters.number = 'unknown'
    expect(view.result.value.order.id).toBe(order.id)
    view.query(); expect(view.result.value.kind).toBe('not-found')
    view.filters.extra = 'draft'; view.resetQuery()
    expect(view.filters).toEqual({ number: '', extra: '' })
    expect(view.result.value.kind).toBe('idle')
  })
  it('示例两运单切换只改变自己的字段与轨迹，查询重置展开', () => {
    const view = setup()
    view.loadExamples()
    const result = view.result.value, [first, second] = result.transports
    view.transportExpanded.value = true
    view.expandedGroups[result.order.id] = true
    view.activeWaybill.value = second.id
    expect(view.transport.value.id).toBe(second.id)
    expect(view.transport.value.events).toHaveLength(1)
    expect(view.transportExpanded.value).toBe(false)
    expect(view.expandedGroups[result.order.id]).toBe(true)
    view.query()
    expect(view.transport.value.id).toBe(first.id)
    expect(view.expandedGroups).toEqual({})
  })
  it.each(['role', 'name', 'reset'])('%s变化立即清除旧查询，不能通过旧入口读取数据', change => {
    const view = setup()
    view.loadExamples()
    if (change === 'role') data.selectWorkbenchPersona('operator')
    else if (change === 'name') data.airSession.name = '另一客服'
    else data.reset()
    expect(view.result.value.order).toBeUndefined()
    expect(view.transport.value).toBeUndefined()
    expect(view.applied.value).toBe('')
    expect(view.filters.number).toBe('')
    if (change === 'role') { expect(view.query()).toBe(false); expect(view.loadExamples()).toBe(false) }
  })
  it('主订单深链查询且可重置；修改订舱和毛件体实时反映，不创建数据副本', () => {
    const order = data.state.airOrders[0]
    route.query.number = order.orderNo
    const view = setup()
    expect(view.result.value.order.id).toBe(order.id)
    order.booking.departureDate = '2026-12-02'; order.waybill = { pieces: 40 }
    expect(view.result.value.order).toMatchObject({ flight: 'MU9001/02.DEC', pieces: 40 })
    view.resetQuery()
    expect(view.result.value.kind).toBe('idle')
  })
  it('轨迹组件模板有效并呈现实际时间、状态和内容', () => {
    const file = new URL('../src/components/AirTrackingTimeline.vue', import.meta.url)
    const component = parse(readFileSync(file, 'utf8'), { filename: file.pathname })
    const compiled = compileScript(component.descriptor, { id: 'tracking-timeline' })
    expect(compileTemplate({ source: component.descriptor.template.content, filename: file.pathname, id: 'tracking-timeline', compilerOptions: { bindingMetadata: compiled.bindings } }).errors).toEqual([])
    expect(component.descriptor.template.content).toContain('event.status')
    expect(component.descriptor.template.content).toContain('event.time')
    expect(component.descriptor.template.content).toContain('event.content')
  })
})
