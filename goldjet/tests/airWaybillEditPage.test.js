import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, nextTick, reactive } from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as waybills from '../src/domain/airWaybills.js'

const data = usePrototypeData()
const route = reactive({ params: { orderId: '' }, query: {} })
const context = { leave: null, update: null, mounted: [], unmounted: [], confirm: vi.fn(), push: vi.fn() }
const feedback = { ElMessage: { success: vi.fn() }, ElMessageBox: { confirm: context.confirm } }
const scopes = []
const filename = new URL('../src/views/AirWaybillEditView.vue', import.meta.url)
const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
expect(parsed.errors).toEqual([])
const script = compileScript(parsed.descriptor, { id: 'AirWaybillEditView' })
expect(compileTemplate({ source: parsed.descriptor.template.content, filename: filename.pathname, id: 'AirWaybillEditView', compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
const modules = {
  vue: { ...vue, onMounted: fn => context.mounted.push(fn), onBeforeUnmount: fn => context.unmounted.push(fn) },
  'vue-router': { useRoute: () => route, useRouter: () => ({ push: context.push }), onBeforeRouteLeave: fn => { context.leave = fn }, onBeforeRouteUpdate: fn => { context.update = fn } },
  'element-plus': feedback,
  '../data/usePrototypeData.js': { usePrototypeData: () => data },
  '../domain/airWaybills.js': waybills,
}
const imported = {}
let body = parsed.descriptor.scriptSetup.content
const imports = script.scriptSetupAst.filter(node => node.type === 'ImportDeclaration')
for (const node of imports) {
  const module = modules[node.source.value] || { default: {} }
  for (const specifier of node.specifiers) imported[specifier.local.name] = specifier.type === 'ImportDefaultSpecifier' ? module.default : module[specifier.imported.name]
}
for (const node of imports.toReversed()) body = body.slice(0, node.start) + body.slice(node.end)
const run = new Function(...Object.keys(imported), `${body}\nreturn { ${Object.keys(script.bindings).join(', ')} }`)
function setup() {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => run(...Object.values(imported)))
}
const copy = value => JSON.parse(JSON.stringify(value))
function addOrder() {
  const record = { ...copy(data.state.airOrders[0]), id: 'WB-PAGE-MAIN', orderNo: 'GJ-WB-PAGE-MAIN', orderStatus: '待出提单', waybillNo: '781-12345678',
    supplement: { shipper: 'SOURCE SHIPPER', consignee: 'SOURCE CONSIGNEE', englishGoodsName: 'DEMO PARTS' },
    waybill: { pieces: 12, grossWeight: 30, volume: 0.3 }, waybillDocument: undefined, waybillTransmission: undefined }
  data.state.airOrders.push(record)
  data.state.airChildren.push({ id: 'WB-PAGE-CHILD', parentId: record.id, housebillNo: 'HWB-DEMO-01', orderNo: 'GJ-HWB-DEMO-01', orderStatus: '子订单完成',
    shipper: 'HOUSE SHIPPER', consignee: 'HOUSE CONSIGNEE', englishGoodsName: 'HOUSE PARTS', waybill: { pieces: 4, grossWeight: 8, volume: 0.1 } })
  route.params = { orderId: record.id }
  return data.state.airOrders.at(-1)
}
function deferConfirmation() {
  let resolve
  context.confirm.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  return () => resolve('confirm')
}
beforeEach(() => {
  data.reset(); data.selectWorkbenchPersona('service')
  route.params = { orderId: '' }; route.query = {}
  context.confirm.mockReset().mockResolvedValue('confirm'); context.push.mockReset()
  context.leave = null; context.update = null; context.mounted = []; context.unmounted = []
  feedback.ElMessage.success.mockReset()
  context.push.mockImplementation(async target => {
    const to = { params: { orderId: target.path.split('/').at(-1) }, query: target.query || {} }
    const from = { params: { ...route.params }, query: { ...route.query } }
    if (await context.update(to, from) === false) return false
    route.params = to.params; route.query = to.query
    await nextTick()
    return true
  })
})
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals() })

describe('GJ-011 提单编辑页面保存与上下文', () => {
  it('补料与毛件体带入独立草稿，暂存只写当前提单并保持预计值', () => {
    const order = addOrder(), expected = { pieces: order.pieces, grossWeight: order.grossWeight, volume: order.volume }
    const view = setup()
    expect(view.draft.value.shipper.printText).toBe('SOURCE SHIPPER')
    expect(view.draft.value.dimensions).toHaveLength(10)
    expect(view.dirty.value).toBe(false)
    view.draft.value.englishGoodsName = 'CHANGED PARTS'
    view.draft.value.pieces = 15
    expect(order.waybillDocument).toBeUndefined()
    expect(order.waybill.pieces).toBe(12)
    expect(view.save(false)).toBe(true)
    expect(order.waybillDocument.englishGoodsName).toBe('CHANGED PARTS')
    expect(order.waybill.pieces).toBe(15)
    expect(order).toMatchObject({ ...expected, orderStatus: '待出提单' })
    expect(view.dirty.value).toBe(false)
  })

  it('提交将主订单变为已出提单，后续修改按未定义边界禁用', () => {
    const order = addOrder(), view = setup()
    expect(view.save(true)).toBe(true)
    expect(order.orderStatus).toBe('已出提单')
    expect(order.waybillIssuedBy).toBe(data.airSession.name)
    expect(view.editable.value).toBe(false)
    view.draft.value.englishGoodsName = 'AFTER ISSUE'
    expect(view.save(false)).toBe(false)
    expect(order.waybillDocument.englishGoodsName).not.toBe('AFTER ISSUE')
  })

  it('分单暂存使用分单owner，提交沿用主订单出单结果', () => {
    const order = addOrder()
    route.query = { child: 'WB-PAGE-CHILD' }
    const view = setup(), child = data.state.airChildren.find(row => row.id === 'WB-PAGE-CHILD')
    expect(view.draft.value.shipper.printText).toBe('HOUSE SHIPPER')
    view.draft.value.pieces = 9
    expect(view.save(false)).toBe(true)
    expect(child.waybill.pieces).toBe(9)
    expect(order.waybill.pieces).toBe(12)
    expect(order.waybillDocument).toBeUndefined()
    expect(view.save(true)).toBe(true)
    expect(order.orderStatus).toBe('已出提单')
  })

  it('校验失败不写入；配板owner拒绝修改时显示失败并保留草稿', () => {
    const order = addOrder(), view = setup()
    view.draft.value.origin = 'INVALID'
    expect(view.save(false)).toBe(false)
    expect(order.waybillDocument).toBeUndefined()
    view.draft.value.origin = order.origin
    data.state.palletAllocations.push({ id: 'WB-PAGE-ALLOCATED', orderId: order.id })
    view.draft.value.pieces = 99
    expect(view.save(false)).toBe(false)
    expect(view.failure.value).toContain('配板')
    expect(view.draft.value.pieces).toBe(99)
    expect(order.waybill.pieces).toBe(12)
    expect(view.dirty.value).toBe(true)
  })

  it('主分单切换经真实路由guard，取消保留草稿，确认后载入分单已保存值', async () => {
    const order = addOrder(), view = setup()
    view.draft.value.englishGoodsName = 'UNSAVED MAIN'
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await view.switchBill('WB-PAGE-CHILD')).toBe(false)
    expect(route.query.child).toBeUndefined()
    expect(view.draft.value.englishGoodsName).toBe('UNSAVED MAIN')
    expect(await view.switchBill('WB-PAGE-CHILD')).toBe(true)
    expect(view.draft.value.englishGoodsName).toBe('HOUSE PARTS')
    expect(view.dirty.value).toBe(false)
    expect(order.waybillDocument).toBeUndefined()
    expect(await view.switchBill('')).toBe(true)
    expect(view.draft.value.englishGoodsName).toBe('DEMO PARTS')
  })

  it('同对象无关query变化不丢弃草稿，联系人草稿也参与离开保护', async () => {
    addOrder(); const view = setup()
    view.contactDirty.value = true
    const from = { params: { ...route.params }, query: {} }, to = { params: { ...route.params }, query: { tab: 'info' } }
    expect(await context.update(to, from)).toBe(true)
    expect(context.confirm).not.toHaveBeenCalled()
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.leave()).toBe(false)
    expect(view.contactDirty.value).toBe(true)
  })

  it.each(['role', 'reset'])('放弃确认期间%s变化使旧确认失效，不切换主分单', async change => {
    addOrder(); const view = setup()
    view.draft.value.englishGoodsName = 'UNSAVED'
    const confirm = deferConfirmation()
    const pending = view.switchBill('WB-PAGE-CHILD')
    expect(await view.allowLeave()).toBe(false)
    if (change === 'role') data.selectWorkbenchPersona('operator')
    else data.reset()
    await nextTick()
    confirm()
    expect(await pending).toBe(false)
    expect(route.query.child).toBeUndefined()
    expect(view.busy.value).toBe(false)
  })

  it('联系人保存回调仅写当前party草稿，暂存前不污染提单；错误回调保留原草稿', () => {
    const order = addOrder(), view = setup()
    view.openContact('shipper')
    const complete = vi.fn()
    const contact = waybills.createAirWaybillContact({ name: 'DEMO NAME', alias: 'DEMO-A', printText: 'PRINTED CONTACT' })
    view.saveContact({ contextKey: view.contextKey.value, contact, saveAsCommonContact: true }, complete)
    expect(complete).toHaveBeenLastCalledWith({ ok: true })
    expect(data.state.airWaybillContacts).toHaveLength(1)
    expect(view.draft.value.shipper.printText).toBe('PRINTED CONTACT')
    expect(order.waybillDocument).toBeUndefined()
    expect(order.supplement.shipper).toBe('SOURCE SHIPPER')
    view.saveContact({ contextKey: view.contextKey.value, contact: { ...contact, printText: 'DUPLICATE' }, saveAsCommonContact: true }, complete)
    expect(complete).toHaveBeenLastCalledWith({ ok: false, message: '常用联系人别称已存在' })
    expect(view.draft.value.shipper.printText).toBe('PRINTED CONTACT')
    expect(view.save(false)).toBe(false)
    view.contactVisible.value = false
    expect(view.save(false)).toBe(true)
    expect(order.waybillDocument.shipper.printText).toBe('PRINTED CONTACT')
  })

  it('旧party与旧主分单context的联系人回调不写入新对象', async () => {
    addOrder(); const view = setup(), complete = vi.fn()
    view.openContact('shipper')
    const contextKey = view.contextKey.value
    view.openContact('consignee')
    view.saveContact({ contextKey, contact: waybills.createAirWaybillContact('STALE'), saveAsCommonContact: false }, complete)
    expect(complete).toHaveBeenLastCalledWith({ ok: false, message: expect.stringContaining('已变化') })
    expect(view.draft.value.consignee.printText).toBe('SOURCE CONSIGNEE')
    const secondKey = view.contextKey.value
    route.query = { child: 'WB-PAGE-CHILD' }; await nextTick()
    view.saveContact({ contextKey: secondKey, contact: waybills.createAirWaybillContact('STALE'), saveAsCommonContact: false }, complete)
    expect(complete).toHaveBeenLastCalledWith({ ok: false, message: expect.stringContaining('已变化') })
    expect(view.draft.value.consignee.printText).toBe('HOUSE CONSIGNEE')
  })

  it('发送后维护限制取当前主分单entity，未发送分单仍可编辑', async () => {
    const order = addOrder(), child = data.state.airChildren.find(row => row.id === 'WB-PAGE-CHILD')
    order.waybillTransmission = { status: '成功' }
    route.query = { child: child.id }
    const view = setup()
    expect(view.restriction.value).toBe('')
    expect(view.editable.value).toBe(true)
    order.waybillTransmission = { status: '待发送' }
    child.waybillTransmission = { status: '成功' }
    expect(view.restriction.value).toContain('发送后修改')
    expect(view.editable.value).toBe(false)
  })

  it('刷新保护覆盖草稿和发送中状态，组件卸载移除监听', () => {
    const listeners = new Map()
    vi.stubGlobal('window', { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name) } })
    const order = addOrder(), view = setup()
    context.mounted.forEach(fn => fn())
    const event = { preventDefault: vi.fn() }
    listeners.get('beforeunload')(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    view.draft.value.englishGoodsName = 'UNSAVED'
    listeners.get('beforeunload')(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    view.hydrate(); order.waybillTransmission = { status: '发送中' }
    listeners.get('beforeunload')(event)
    expect(event.preventDefault).toHaveBeenCalledTimes(2)
    context.unmounted.forEach(fn => fn())
    expect(listeners.has('beforeunload')).toBe(false)
  })
})
