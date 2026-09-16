import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, nextTick, reactive } from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import * as waybills from '../src/domain/airWaybills.js'

const context = { props: {}, emit: vi.fn(), confirm: vi.fn(), mounted: [], unmounted: [] }
const scopes = []
const feedback = { ElMessage: { success: vi.fn() }, ElMessageBox: { confirm: context.confirm } }
const filename = new URL('../src/components/AirWaybillContactDialog.vue', import.meta.url)
const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
expect(parsed.errors).toEqual([])
const script = compileScript(parsed.descriptor, { id: 'AirWaybillContactDialog' })
expect(compileTemplate({ source: parsed.descriptor.template.content, filename: filename.pathname, id: 'AirWaybillContactDialog', compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
const modules = {
  vue: { ...vue, onMounted: fn => context.mounted.push(fn), onBeforeUnmount: fn => context.unmounted.push(fn) },
  'element-plus': feedback,
  '../domain/airWaybills.js': waybills,
}
const imported = { defineProps: () => context.props, defineEmits: () => context.emit, defineExpose: () => {} }
let body = parsed.descriptor.scriptSetup.content
const imports = script.scriptSetupAst.filter(node => node.type === 'ImportDeclaration')
for (const node of imports) for (const specifier of node.specifiers) imported[specifier.local.name] = modules[node.source.value][specifier.imported.name]
for (const node of imports.toReversed()) body = body.slice(0, node.start) + body.slice(node.end)
const bindings = Object.keys(script.bindings).filter(key => !script.bindings[key].startsWith('props'))
const run = new Function(...Object.keys(imported), `${body}\nreturn { ${bindings.join(', ')} }`)
function setup(props = {}) {
  context.props = reactive({ visible: true, modelValue: {}, contextKey: 'ORDER-A:master:shipper', contacts: [], readOnly: false, ...props })
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => run(...Object.values(imported)))
}
function deferConfirmation() {
  let resolve
  context.confirm.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  return () => resolve('confirm')
}
function handleEvent(event, implementation) {
  context.emit.mockImplementation((name, ...args) => { if (name === event) return implementation(...args) })
}
const contact = { id: 'CONTACT-A', ...waybills.createAirWaybillContact({ name: 'DEMO NAME', address: 'DEMO ADDRESS', phone: '123', postcode: '001', country: 'DEMO COUNTRY', countryCode: 'XX', province: 'DEMO PROVINCE', city: 'DEMO CITY', alias: 'Alpha', printText: 'PRINT\nAREA' }) }
beforeEach(() => {
  context.emit.mockReset()
  context.confirm.mockReset().mockResolvedValue('confirm')
  context.mounted = []; context.unmounted = []
  feedback.ElMessage.success.mockReset()
})
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals() })

describe('GJ-011 提单联系人编辑', () => {
  it('十个字段建立独立草稿，原补料文字仅填入展示区，空字段保持空', () => {
    const view = setup({ modelValue: 'DEMO PRINT' })
    expect(Object.keys(view.draft.value)).toEqual(waybills.AIR_WAYBILL_CONTACT_FIELDS)
    expect(view.draft.value).toEqual(waybills.createAirWaybillContact('DEMO PRINT'))
    expect(view.dirty.value).toBe(false)
    view.draft.value.name = 'EDITED'
    expect(context.props.modelValue).toBe('DEMO PRINT')
    expect(view.dirty.value).toBe(true)
  })

  it('别称模糊搜索；使用常用联系人带入全部字段且不直接修改源记录', () => {
    const view = setup({ contacts: [contact, { ...contact, id: 'B', alias: 'Beta' }] })
    view.aliasQuery.value = ' lpH '
    expect(view.filteredContacts.value.map(row => row.id)).toEqual(['CONTACT-A'])
    view.saveAsCommonContact.value = true
    expect(view.useContact(contact)).toBe(true)
    expect(view.draft.value).toEqual(waybills.createAirWaybillContact(contact))
    expect(view.saveAsCommonContact.value).toBe(false)
    view.draft.value.printText = 'CHANGED'
    expect(contact.printText).toBe('PRINT\nAREA')
  })

  it('清空填写区及展示区只改草稿，取消保留输入，确认关闭才退出', async () => {
    const view = setup({ modelValue: contact })
    expect(view.clear()).toBe(true)
    expect(Object.values(view.draft.value).every(value => value === '')).toBe(true)
    expect(context.props.modelValue.printText).toBe('PRINT\nAREA')
    context.confirm.mockRejectedValueOnce('cancel')
    const done = vi.fn()
    expect(await view.requestClose(done)).toBe(false)
    expect(done).not.toHaveBeenCalled()
    expect(context.emit).not.toHaveBeenCalledWith('update:visible', false)
    expect(await view.requestClose(done)).toBe(true)
    expect(done).toHaveBeenCalledOnce()
    expect(context.emit).toHaveBeenCalledWith('update:visible', false)
    expect(context.emit.mock.calls.some(([event]) => event === 'save')).toBe(false)
  })

  it('保存交给父页owner，失败保留完整输入，成功才关闭', async () => {
    const view = setup({ modelValue: contact })
    view.draft.value.alias = 'NEW ALIAS'
    view.saveAsCommonContact.value = true
    let payload
    handleEvent('save', (value, complete) => { payload = value; complete({ ok: false, message: '别称已存在' }) })
    expect(await view.save()).toBe(false)
    expect(payload).toEqual({ contact: waybills.createAirWaybillContact({ ...contact, alias: 'NEW ALIAS' }), saveAsCommonContact: true, contextKey: 'ORDER-A:master:shipper' })
    expect(view.failure.value).toBe('别称已存在')
    expect(view.draft.value.alias).toBe('NEW ALIAS')
    expect(view.dirty.value).toBe(true)
    expect(context.emit).not.toHaveBeenCalledWith('update:visible', false)
    handleEvent('save', (_, complete) => complete({ ok: true }))
    expect(await view.save()).toBe(true)
    expect(view.dirty.value).toBe(false)
    expect(context.emit).toHaveBeenCalledWith('update:visible', false)
  })

  it('父页保存未完成时拒绝重复保存、清空和使用；上下文改变后旧完成不关闭新弹窗', async () => {
    const view = setup({ modelValue: contact, contacts: [contact] })
    let complete
    handleEvent('save', (_, done) => { complete = done })
    const pending = view.save()
    expect(view.busy.value).toBe(true)
    expect(await view.save()).toBe(false)
    expect(view.clear()).toBe(false)
    expect(view.useContact(contact)).toBe(false)
    expect(await view.requestClose()).toBe(false)
    context.props.contextKey = 'ORDER-B:house:consignee'
    complete({ ok: true })
    expect(await pending).toBe(false)
    expect(view.busy.value).toBe(false)
    expect(context.emit).not.toHaveBeenCalledWith('update:visible', false)
  })

  it('删除需确认，取消不发送删除；成功后已使用的草稿保持不变', async () => {
    const view = setup({ contacts: [contact] })
    view.useContact(contact)
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await view.deleteContact(contact)).toBe(false)
    expect(context.emit.mock.calls.some(([event]) => event === 'deleteContact')).toBe(false)
    handleEvent('deleteContact', (id, complete) => {
      expect(id).toBe(contact.id)
      context.props.contacts = []
      complete({ ok: true })
    })
    expect(await view.deleteContact(contact)).toBe(true)
    expect(view.draft.value.printText).toBe(contact.printText)
    expect(view.filteredContacts.value).toEqual([])
    expect(feedback.ElMessage.success).toHaveBeenCalledWith('常用联系人已删除')
  })

  it.each(['context', 'readOnly', 'removed'])('删除确认等待期间%s变化使旧确认失效', async change => {
    const view = setup({ contacts: [contact] })
    const confirm = deferConfirmation()
    const pending = view.deleteContact(contact)
    expect(await view.deleteContact(contact)).toBe(false)
    if (change === 'context') context.props.contextKey = 'ORDER-B'
    if (change === 'readOnly') context.props.readOnly = true
    if (change === 'removed') context.props.contacts = []
    confirm()
    expect(await pending).toBe(false)
    expect(context.emit.mock.calls.some(([event]) => event === 'deleteContact')).toBe(false)
  })

  it('只读态保留可查看字段并阻止全部写动作', async () => {
    const view = setup({ modelValue: contact, contacts: [contact], readOnly: true })
    expect(view.draft.value.printText).toBe(contact.printText)
    expect(view.clear()).toBe(false)
    expect(view.useContact(contact)).toBe(false)
    expect(await view.deleteContact(contact)).toBe(false)
    expect(await view.save()).toBe(false)
    expect(await view.requestClose()).toBe(true)
    expect(context.confirm).not.toHaveBeenCalled()
  })

  it('拒绝旧关闭确认；刷新保护仅在可见且有草稿时触发', async () => {
    const listeners = new Map()
    vi.stubGlobal('window', { addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: (event, fn) => { if (listeners.get(event) === fn) listeners.delete(event) } })
    const view = setup({ modelValue: contact })
    context.mounted.forEach(fn => fn())
    const unload = { preventDefault: vi.fn() }
    listeners.get('beforeunload')(unload)
    expect(unload.preventDefault).not.toHaveBeenCalled()
    view.draft.value.printText = 'CHANGED'
    listeners.get('beforeunload')(unload)
    expect(unload.preventDefault).toHaveBeenCalledOnce()
    expect(unload.returnValue).toBe('')
    const confirm = deferConfirmation()
    const pending = view.requestClose()
    context.props.contextKey = 'ORDER-B'
    confirm()
    expect(await pending).toBe(false)
    expect(context.emit).not.toHaveBeenCalledWith('update:visible', false)
    await nextTick()
    expect(view.dirty.value).toBe(false)
    context.unmounted.forEach(fn => fn())
    expect(listeners.has('beforeunload')).toBe(false)
  })
})
