import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, reactive } from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import * as templates from '../src/domain/airWaybillTemplates.js'
import { createAirWaybillTemplateActions } from '../src/data/airWaybillTemplateActions.js'

const state = reactive({ airMaster: { airlines: [{ id: 'MU', code: 'MU', name: '演示航司' }, { id: 'CA', code: 'CA', name: '演示国航' }] }, airWaybillTemplates: [], airWaybillTemplateSequence: 0 })
const session = reactive({ role: 'product', name: '演示产品人员' })
const owner = createAirWaybillTemplateActions(state, () => session)
const context = { confirm: vi.fn(), leave: null, mounted: [], unmounted: [] }
const feedback = { ElMessage: { success: vi.fn() }, ElMessageBox: { confirm: context.confirm } }
const data = { state, airTemplateSession: session, ...owner }
const scopes = []
const filename = new URL('../src/views/AirWaybillTemplatesView.vue', import.meta.url)
const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
expect(parsed.errors).toEqual([])
const script = compileScript(parsed.descriptor, { id: 'AirWaybillTemplatesView' })
expect(compileTemplate({ source: parsed.descriptor.template.content, filename: filename.pathname, id: 'AirWaybillTemplatesView', compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
const modules = {
  vue: { ...vue, onMounted: fn => context.mounted.push(fn), onBeforeUnmount: fn => context.unmounted.push(fn) },
  'vue-router': { onBeforeRouteLeave: fn => { context.leave = fn } },
  'element-plus': feedback,
  '../data/usePrototypeData.js': { usePrototypeData: () => data },
  '../domain/airWaybillTemplates.js': templates,
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
const makeFile = (name = '演示提单.doc', content = '{\\rtf1\\ansi Goldjet demo template}') => new File([content], name, { type: 'application/msword', lastModified: 100 })
const payload = (overrides = {}) => ({ airlineCode: 'MU', type: templates.AIR_WAYBILL_TEMPLATE_TYPES[0], file: makeFile(), ...overrides })
function deferConfirmation() {
  let resolve
  context.confirm.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  return () => resolve('confirm')
}
beforeEach(() => {
  state.airWaybillTemplates = []; state.airWaybillTemplateSequence = 0
  session.role = 'product'; session.name = '演示产品人员'
  context.confirm.mockReset().mockResolvedValue('confirm')
  context.leave = null; context.mounted = []; context.unmounted = []
  feedback.ElMessage.success.mockReset()
})
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('GJ-011 提单模板原文件所有者', () => {
  it('产品与技术人员保存真实原文件为已上传，名称、MIME及内容保持原样', async () => {
    const input = payload()
    const result = owner.saveAirWaybillTemplate(input)
    expect(result).toMatchObject({ id: 'AIR-TEMPLATE-0001', airlineCode: 'MU', type: input.type, status: '已上传' })
    expect(result.file).toBe(input.file)
    session.role = 'technical'
    const second = owner.saveAirWaybillTemplate(payload({ type: '托运书' }))
    expect(second.id).toBe('AIR-TEMPLATE-0002')
    const files = owner.getAirWaybillTemplateFiles([second.id, result.id, result.id])
    expect(files.map(row => row.id)).toEqual([second.id, result.id])
    expect(files[1].file.name).toBe(input.file.name)
    expect(files[1].file.type).toBe(input.file.type)
    expect(await files[1].file.text()).toBe(await input.file.text())
    expect(state.airWaybillTemplates.every(row => row.status === '已上传')).toBe(true)
  })

  it('仅接受四种扩展名，20MB包含边界；失败不添加记录或消耗ID', () => {
    for (const ext of ['DOC', 'docx', 'xlsx', 'xls']) expect(templates.validateAirWaybillTemplateFile(makeFile(`演示.${ext}`))).toBe('')
    expect(templates.validateAirWaybillTemplateFile(makeFile('演示.pdf'))).toContain('仅支持')
    expect(templates.validateAirWaybillTemplateFile({ name: '伪文件.doc', size: 10 })).toContain('原文件不可用')
    const exact = new File([new Uint8Array(templates.AIR_WAYBILL_TEMPLATE_MAX_BYTES)], 'exact.doc')
    const over = new File([exact, 'x'], 'over.doc')
    expect(templates.validateAirWaybillTemplateFile(exact)).toBe('')
    expect(templates.validateAirWaybillTemplateFile(over)).toContain('20 MB')
    expect(() => owner.saveAirWaybillTemplate(payload({ file: over }))).toThrow('20 MB')
    expect(state.airWaybillTemplateSequence).toBe(0)
    expect(state.airWaybillTemplates).toEqual([])
  })

  it('必填来源、模板类型与重复组合校验由owner执行，原记录不会被覆盖', () => {
    expect(() => owner.saveAirWaybillTemplate({})).toThrow('航司')
    expect(() => owner.saveAirWaybillTemplate(payload({ airlineCode: 'UNKNOWN' }))).toThrow('航司')
    expect(() => owner.saveAirWaybillTemplate(payload({ type: '任意类型' }))).toThrow('类型')
    const saved = owner.saveAirWaybillTemplate(payload())
    expect(() => owner.saveAirWaybillTemplate(payload())).toThrow('重复上传')
    expect(state.airWaybillTemplates).toHaveLength(1)
    expect(state.airWaybillTemplates[0].file).toBe(saved.file)
    expect(state.airWaybillTemplateSequence).toBe(1)
  })

  it('非产品/技术人员不能通过owner上传或下载，缺失原文件的批量请求整体失败', () => {
    const saved = owner.saveAirWaybillTemplate(payload())
    session.role = 'customerService'
    expect(() => owner.saveAirWaybillTemplate(payload({ type: '托运书' }))).toThrow('仅产品人员和技术人员')
    expect(() => owner.getAirWaybillTemplateFiles([saved.id])).toThrow('仅产品人员和技术人员')
    session.role = 'technical'
    expect(() => owner.getAirWaybillTemplateFiles([])).toThrow('至少选择')
    expect(() => owner.getAirWaybillTemplateFiles([saved.id, 'MISSING'])).toThrow('不存在')
    state.airWaybillTemplates[0].file = { name: 'lost.doc', size: 10 }
    expect(() => owner.getAirWaybillTemplateFiles([saved.id])).toThrow('原文件不可用')
  })
})

describe('GJ-011 提单模板页面', () => {
  it('文件选择、错误、移除和保存均对应实际File，错误不清掉有效草稿', async () => {
    const view = setup()
    await view.open()
    const file = makeFile()
    const event = { target: { files: [file], value: 'localfile' } }
    expect(view.selectFile(event)).toBe(true)
    expect(event.target.value).toBe('')
    expect(view.draft.value.file).toBe(file)
    expect(view.selectFile({ target: { files: [makeFile('invalid.pdf')], value: 'invalid' } })).toBe(false)
    expect(view.draft.value.file).toBe(file)
    expect(view.fileFailure.value).toContain('仅支持')
    expect(view.removeFile()).toBe(true)
    expect(view.draft.value.file).toBeNull()
    expect(view.save()).toBe(false)
    expect(state.airWaybillTemplates).toHaveLength(0)
    view.selectFile({ target: { files: [file], value: '' } })
    Object.assign(view.draft.value, { airlineCode: 'MU', type: '托运书' })
    expect(view.save()).toBe(true)
    expect(view.visible.value).toBe(false)
    expect(state.airWaybillTemplates[0].file).toBe(file)
    expect(view.rows.value).toHaveLength(1)
  })

  it('查询按已应用条件筛选，重置清除选择但保留未保存上传草稿', async () => {
    const mu = owner.saveAirWaybillTemplate(payload())
    const ca = owner.saveAirWaybillTemplate(payload({ airlineCode: 'CA', type: '托运书' }))
    const view = setup()
    await view.open()
    view.draft.value.airlineCode = 'MU'
    view.filters.value.airlineCode = 'CA'
    expect(view.rows.value.map(row => row.id)).toEqual([mu.id, ca.id])
    view.query()
    expect(view.rows.value.map(row => row.id)).toEqual([ca.id])
    view.filters.value.status = '已完成'; view.query()
    expect(view.rows.value).toEqual([])
    view.selectedIds.value = [ca.id]
    view.resetQuery()
    expect(view.selectedIds.value).toEqual([])
    expect(view.rows.value).toHaveLength(2)
    expect(view.draft.value.airlineCode).toBe('MU')
    expect(view.dirty.value).toBe(true)
  })

  it('脏草稿取消及路由离开需要确认，否定保持输入', async () => {
    const view = setup()
    await view.open(); view.draft.value.type = '托运书'
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await view.close()).toBe(false)
    expect(view.visible.value).toBe(true)
    expect(view.draft.value.type).toBe('托运书')
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.leave()).toBe(false)
    expect(await view.close()).toBe(true)
    expect(view.visible.value).toBe(false)
    expect(state.airWaybillTemplates).toEqual([])
  })

  it.each(['role', 'reset'])('确认期间%s变化使旧操作失效', async change => {
    const view = setup()
    await view.open(); view.draft.value.type = '托运书'
    const confirm = deferConfirmation()
    const pending = view.close()
    expect(await view.close()).toBe(false)
    if (change === 'role') session.role = 'viewer'
    else state.airWaybillTemplates = []
    confirm()
    expect(await pending).toBe(false)
    expect(view.busy.value).toBe(false)
    expect(view.visible.value).toBe(false)
    expect(state.airWaybillTemplates).toEqual([])
  })

  it('批量下载通过owner预检并创建保留原文件名的下载；失败不触发部分下载', async () => {
    const a = owner.saveAirWaybillTemplate(payload())
    const b = owner.saveAirWaybillTemplate(payload({ airlineCode: 'CA', file: makeFile('第二份.doc') }))
    const view = setup()
    const anchors = []
    vi.useFakeTimers()
    const createURL = vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => `blob:demo/${blob.name}`)
    const revokeURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('document', { body: { appendChild: vi.fn() }, createElement: () => {
      const anchor = { click: vi.fn(), remove: vi.fn() }; anchors.push(anchor); return anchor
    } })
    expect(view.download([a.id, 'MISSING'])).toBe(false)
    expect(anchors).toEqual([])
    expect(view.download([a.id, b.id])).toBe(true)
    expect(createURL.mock.calls.map(([file]) => file)).toEqual([a.file, b.file])
    expect(anchors.map(anchor => anchor.download)).toEqual([a.file.name, b.file.name])
    expect(anchors.every(anchor => anchor.click.mock.calls.length === 1 && anchor.remove.mock.calls.length === 1)).toBe(true)
    vi.runAllTimers()
    expect(revokeURL).toHaveBeenCalledTimes(2)
  })

  it('viewer无查询结果及写入口，刷新保护随上传草稿启停', async () => {
    const listeners = new Map()
    vi.stubGlobal('window', { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name) } })
    const view = setup()
    context.mounted.forEach(fn => fn())
    const event = { preventDefault: vi.fn() }
    listeners.get('beforeunload')(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    await view.open(); view.draft.value.file = makeFile()
    listeners.get('beforeunload')(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    session.role = 'viewer'
    expect(view.rows.value).toEqual([])
    expect(await view.open()).toBe(false)
    expect(view.save()).toBe(false)
    expect(view.download([])).toBe(false)
    context.unmounted.forEach(fn => fn())
    expect(listeners.has('beforeunload')).toBe(false)
  })
})
