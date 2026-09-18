import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, reactive } from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import * as declarations from '../src/domain/airDeclarations.js'
import { createAirDeclarationActions } from '../src/data/airDeclarationActions.js'

const state = reactive({ airOrders: [], airChildren: [], messages: [], airOrderEventSequence: 0 })
const session = reactive({ role: 'customsService', name: '演示报关客服' })
const owner = createAirDeclarationActions(state, () => session)
const data = { state, declarationSession: session, ...owner }
const context = { props: {}, emit: vi.fn(), unmounted: [] }
const feedback = { ElMessage: { success: vi.fn() } }
const scopes = []
const filename = new URL('../src/components/AirDeclarationMaterialsDialog.vue', import.meta.url)
const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
expect(parsed.errors).toEqual([])
const script = compileScript(parsed.descriptor, { id: 'AirDeclarationMaterialsDialog' })
const template = parsed.descriptor.template.content
expect(compileTemplate({ source: template, filename: filename.pathname, id: 'AirDeclarationMaterialsDialog', compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
const modules = { vue: { ...vue, onBeforeUnmount: fn => context.unmounted.push(fn) }, 'element-plus': feedback, '../data/usePrototypeData.js': { usePrototypeData: () => data }, '../domain/airDeclarations.js': declarations }
const imported = { defineProps: () => context.props, defineEmits: () => context.emit }
let body = parsed.descriptor.scriptSetup.content
const imports = script.scriptSetupAst.filter(node => node.type === 'ImportDeclaration')
for (const node of imports) for (const specifier of node.specifiers) imported[specifier.local.name] = modules[node.source.value][specifier.imported.name]
for (const node of imports.toReversed()) body = body.slice(0, node.start) + body.slice(node.end)
const bindings = Object.keys(script.bindings).filter(key => !script.bindings[key].startsWith('props'))
const run = new Function(...Object.keys(imported), `${body}\nreturn { ${bindings.join(', ')} }`)
function setup(props = {}) {
  context.props = reactive({ modelValue: true, selectedIds: ['DECL-MAIN', 'DECL-HOUSE'], mode: 'materials', ...props,
    get declarations() { return declarations.deriveAirDeclarations(state) },
  })
  const scope = effectScope(); scopes.push(scope)
  return scope.run(() => run(...Object.values(imported)))
}
const material = (id, name, content = `DEMO ${name}`) => ({ id, name, fileName: `${name}.txt`, content, type: 'text/plain;charset=utf-8' })
const customs = (id, attachments) => ({ id, type: 'customs', name: '报关', status: '待服务', createdAt: '2026-09-08 12:00', details: { choice: '我司报关', documentType: '单证报关', attachments }, materialRequests: [] })
function seed() {
  state.airOrders = [{ id: 'MAIN', orderNo: 'ORDER-DEMO-01', customer: '演示客户', creator: '演示建单客服', orderType: '直单', origin: 'PVG', destination: 'LAX', orderStatus: '待出提单',
    services: [customs('DECL-MAIN', [material('A', '商业发票'), material('B', '装箱单')])] }]
  state.airChildren = [{ id: 'CHILD', parentId: 'MAIN', orderNo: 'CHILD-DEMO-01', housebillNo: 'HOUSE-DEMO-01', creator: '演示分单客服', orderStatus: '子订单完成',
    serviceRecords: [customs('DECL-HOUSE', [material('C', '分单材料')])] }]
  state.messages = []; state.airOrderEventSequence = 0
}
beforeEach(() => { seed(); session.role = 'customsService'; session.name = '演示报关客服'; context.emit.mockReset(); context.unmounted = []; feedback.ElMessage.success.mockReset() })
afterEach(() => { context.unmounted.forEach(fn => fn()); scopes.splice(0).forEach(scope => scope.stop()); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('GJ-012 报关材料弹窗', () => {
  it('显示选定服务的全部材料并跨服务多选，无材料服务不生成虚构下载项', () => {
    state.airOrders[0].services.push(customs('DECL-EMPTY', []))
    const view = setup({ selectedIds: ['DECL-MAIN', 'DECL-HOUSE', 'DECL-EMPTY'] })
    expect(view.selectedDeclarations.value).toHaveLength(3)
    expect(view.materials.value.map(row => row.material.name).sort()).toEqual(['商业发票', '装箱单', '分单材料'].sort())
    view.selectAll(true)
    expect(view.selectedTargets.value).toHaveLength(3)
    expect(view.selectedTargets.value).toEqual(expect.arrayContaining([{ serviceId: 'DECL-MAIN', materialId: 'A' }, { serviceId: 'DECL-MAIN', materialId: 'B' }, { serviceId: 'DECL-HOUSE', materialId: 'C' }]))
    view.toggle(view.materialKey('DECL-MAIN', 'B'), false)
    expect(view.selectedTargets.value).toHaveLength(2)
    expect(view.allSelected.value).toBe(false)
    expect(template).toContain('尚无已上传材料')
    expect(template).toContain('v-if="fileAvailable(material)"')
  })

  it('无原文件隐藏下载并阻断批量下载，但有材料名称仍可请求补齐', () => {
    state.airOrders[0].services[0].details.attachments[0].content = null
    const view = setup(), item = view.materials.value.find(row => row.materialId === 'A')
    expect(view.fileAvailable(item.material)).toBe(false)
    view.selectAll(true)
    expect(view.downloadError.value).toContain('不可下载')
    expect(view.download()).toBe(false)
    expect(view.prepareNotification([{ serviceId: 'DECL-MAIN', materialId: 'A' }])).toBe(true)
    expect(view.pendingNotices.value[0].content).toContain('商业发票')
  })

  it('单个及批量下载预检后产生真实文件，保留名称MIME和内容', async () => {
    const view = setup(), anchors = [], blobs = []
    vi.useFakeTimers()
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { blobs.push(blob); return `blob:material/${blobs.length}` })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('document', { body: { appendChild: vi.fn() }, createElement: () => { const anchor = { click: vi.fn(), remove: vi.fn() }; anchors.push(anchor); return anchor } })
    expect(view.download([{ serviceId: 'DECL-MAIN', materialId: 'A' }])).toBe(true)
    expect(anchors[0].download).toBe('商业发票.txt')
    expect(blobs[0]).toBeInstanceOf(File)
    expect(blobs[0].name).toBe('商业发票.txt')
    expect(await blobs[0].text()).toBe('DEMO 商业发票')
    expect(blobs[0].type).toContain('text/plain')
    view.selectAll(true)
    expect(view.download()).toBe(true)
    expect(anchors.slice(1).map(anchor => anchor.download).sort()).toEqual(['商业发票.txt', '装箱单.txt', '分单材料.txt'].sort())
    expect(anchors.every(anchor => anchor.click.mock.calls.length === 1 && anchor.remove.mock.calls.length === 1)).toBe(true)
    const before = anchors.length
    expect(view.download([{ serviceId: 'DECL-MAIN', materialId: 'A' }, { serviceId: 'DECL-MAIN', materialId: 'MISSING' }])).toBe(false)
    expect(anchors).toHaveLength(before)
    vi.runAllTimers()
    expect(revoke).not.toHaveBeenCalled()
    expect(view.downloadLinks.value.map(file => file.name).sort()).toEqual(['商业发票.txt', '装箱单.txt', '分单材料.txt'].sort())
    view.close()
    expect(revoke).toHaveBeenCalledTimes(4)
    expect(view.downloadLinks.value).toEqual([])
  })

  it('自动点击失败仍保留可点击原文件链接，原生重试不阻止默认下载，关闭后旧链接失效', () => {
    const view = setup()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:material/retry')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const remove = vi.fn()
    vi.stubGlobal('document', { body: { appendChild: vi.fn() }, createElement: () => ({ click: () => { throw new Error('浏览器未自动下载') }, remove }) })
    expect(view.download([{ serviceId: 'DECL-MAIN', materialId: 'A' }])).toBe(false)
    expect(view.failure.value).toContain('文件链接重试')
    expect(remove).toHaveBeenCalledOnce()
    expect(view.downloadLinks.value).toHaveLength(1)
    const link = view.downloadLinks.value[0], event = { preventDefault: vi.fn() }
    expect(link).toMatchObject({ name: '商业发票.txt', url: 'blob:material/retry' })
    expect(template).toContain(':href="file.url"')
    expect(template).toContain(':download="file.name"')
    expect(view.retryDownload(link, event)).toBe(true)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
    view.close()
    expect(revoke).toHaveBeenCalledWith(link.url)
    expect(view.retryDownload(link, event)).toBe(false)
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it.each(['role', 'reset', 'unmount'])('下载URL保留到%s时统一释放', change => {
    const view = setup()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(`blob:material/${change}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('document', { body: { appendChild: vi.fn() }, createElement: () => ({ click: vi.fn(), remove: vi.fn() }) })
    expect(view.download([{ serviceId: 'DECL-MAIN', materialId: 'A' }])).toBe(true)
    expect(revoke).not.toHaveBeenCalled()
    if (change === 'role') session.role = 'viewer'
    if (change === 'reset') seed()
    if (change === 'unmount') context.unmounted.forEach(fn => fn())
    expect(revoke).toHaveBeenCalledExactlyOnceWith(`blob:material/${change}`)
    expect(view.downloadLinks.value).toEqual([])
  })

  it('批量链接全部建立前不触发下载，建立失败清理半成品URL', () => {
    const view = setup(), click = vi.fn()
    vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:material/partial').mockImplementationOnce(() => { throw new Error('无法创建文件链接') })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('document', { body: { appendChild: vi.fn() }, createElement: () => ({ click, remove: vi.fn() }) })
    view.selectAll(true)
    expect(view.download()).toBe(false)
    expect(click).not.toHaveBeenCalled()
    expect(view.downloadLinks.value).toEqual([])
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:material/partial')
    expect(view.failure.value).toBe('无法创建文件链接')
  })

  it('补齐通知预览使用030精确正文及建单客服，取消不写入，确认形成真实本地历史', () => {
    const view = setup({ mode: 'notify' })
    view.toggle(view.materialKey('DECL-MAIN', 'A'), true)
    view.toggle(view.materialKey('DECL-HOUSE', 'C'), true)
    expect(view.prepareNotification()).toBe(true)
    expect(view.pendingNotices.value).toHaveLength(2)
    expect(view.pendingNotices.value.map(row => [row.recipient, row.content])).toEqual(expect.arrayContaining([
      ['演示建单客服', '订单号：ORDER-DEMO-01的商业发票有误，请补齐材料。'],
      ['演示分单客服', '分单号：HOUSE-DEMO-01的分单材料有误，请补齐材料。'],
    ]))
    expect(state.messages).toHaveLength(0)
    expect(view.cancelNotification()).toBe(true)
    expect(view.pending.value).toHaveLength(0)
    expect(state.messages).toHaveLength(0)
    view.prepareNotification()
    expect(view.confirmNotification()).toBe(true)
    expect(state.messages).toHaveLength(2)
    expect(view.history.value).toHaveLength(2)
    expect(view.result.value).toContain('2 条')
    expect(view.confirmNotification()).toBe(false)
    expect(state.messages).toHaveLength(2)
  })

  it('缺接收人或分单号时通知不能进入确认，不产生部分结果', () => {
    state.airChildren[0].creator = ''
    const view = setup()
    view.selectAll(true)
    expect(view.notifyError.value).toBeTruthy()
    expect(view.prepareNotification()).toBe(false)
    expect(state.messages).toHaveLength(0)
    state.airChildren[0].creator = '演示分单客服'
    state.airChildren[0].housebillNo = ''
    expect(view.prepareNotification()).toBe(false)
    expect(view.failure.value).toBeTruthy()
    expect(state.messages).toHaveLength(0)
  })

  it('确认期间接收人或材料名变化必须重新确认，旧内容不会发送', () => {
    const view = setup()
    view.prepareNotification([{ serviceId: 'DECL-MAIN', materialId: 'A' }])
    state.airOrders[0].creator = '新的建单客服'
    expect(view.confirmNotification()).toBe(false)
    expect(view.failure.value).toContain('已变化')
    expect(state.messages).toHaveLength(0)
    view.cancelNotification(); view.prepareNotification([{ serviceId: 'DECL-MAIN', materialId: 'A' }])
    state.airOrders[0].services[0].details.attachments[0].name = '更新材料名称'
    expect(view.confirmNotification()).toBe(false)
    expect(state.messages).toHaveLength(0)
  })

  it('确认期间服务取消阻止补齐通知，历史原文件仍可读取', () => {
    const view = setup()
    expect(view.prepareNotification([{ serviceId: 'DECL-MAIN', materialId: 'A' }])).toBe(true)
    state.airOrders[0].services[0].status = '服务已取消'
    expect(view.pendingError.value).toBeTruthy()
    expect(view.confirmNotification()).toBe(false)
    expect(state.messages).toHaveLength(0)
    view.cancelNotification()
    view.toggle(view.materialKey('DECL-MAIN', 'A'), true)
    expect(view.notifyError.value).toBeTruthy()
    expect(view.downloadError.value).toBe('')
  })

  it.each(['role', 'reset', 'selection'])('确认期间%s变化会清理旧选择，旧确认不会发通知', change => {
    const view = setup()
    view.prepareNotification([{ serviceId: 'DECL-MAIN', materialId: 'A' }])
    if (change === 'role') session.role = 'viewer'
    if (change === 'reset') seed()
    if (change === 'selection') context.props.selectedIds = ['DECL-HOUSE']
    expect(view.pending.value).toHaveLength(0)
    expect(view.confirmNotification()).toBe(false)
    expect(state.messages).toHaveLength(0)
    if (change !== 'selection') expect(context.emit).toHaveBeenCalledWith('update:modelValue', false)
  })

  it('viewer与关闭状态不可下载或通知，关闭清理本地选择', () => {
    const view = setup()
    view.selectAll(true); expect(view.selectedTargets.value).toHaveLength(3)
    session.role = 'viewer'
    expect(view.download([{ serviceId: 'DECL-MAIN', materialId: 'A' }])).toBe(false)
    expect(view.prepareNotification([{ serviceId: 'DECL-MAIN', materialId: 'A' }])).toBe(false)
    session.role = 'customsService'; context.props.modelValue = false
    expect(view.selectAll(true)).toBe(false)
    expect(view.download([{ serviceId: 'DECL-MAIN', materialId: 'A' }])).toBe(false)
    context.props.modelValue = true
    view.selectAll(true); const done = vi.fn()
    expect(view.close(done)).toBe(true)
    expect(done).toHaveBeenCalledOnce()
    expect(view.selectedTargets.value).toHaveLength(0)
    expect(context.emit).toHaveBeenCalledWith('update:modelValue', false)
  })
})
