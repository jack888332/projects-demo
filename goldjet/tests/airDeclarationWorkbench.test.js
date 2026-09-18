import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as workbench from '../src/domain/workbenchTasks.js'
import * as supplement from '../src/domain/airOrderSupplement.js'
import * as serviceEditing from '../src/domain/airServiceEditing.js'
import * as declarations from '../src/domain/airDeclarations.js'
import * as accessControl from '../src/data/accessControl.js'
import * as catalog from '../src/domain/catalog.js'

const data = usePrototypeData()
const route = vue.reactive({ path: '/dashboard', params: {}, query: {} })
const context = { props: {}, leave: null, update: null, push: vi.fn(), replace: vi.fn(), confirm: vi.fn(), emit: vi.fn() }
const scopes = [], templates = {}

// Run the real page setup and central owner; replace only browser/router feedback adapters.
function loadPage(relativePath) {
  const filename = new URL(`../src/${relativePath}.vue`, import.meta.url)
  const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
  expect(parsed.errors).toEqual([])
  const script = compileScript(parsed.descriptor, { id: relativePath })
  templates[relativePath] = parsed.descriptor.template.content
  expect(compileTemplate({ source: parsed.descriptor.template.content, filename: filename.pathname, id: relativePath, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  const modules = {
    vue: { ...vue, onMounted: () => {}, onBeforeUnmount: () => {} },
    'vue-router': { useRoute: () => route, useRouter: () => ({ push: context.push, replace: context.replace }), onBeforeRouteLeave: guard => { context.leave = guard }, onBeforeRouteUpdate: guard => { context.update = guard } },
    'element-plus': { ElMessage: { success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: context.confirm } },
    '@element-plus/icons-vue': new Proxy({}, { get: () => ({}) }),
    '../data/usePrototypeData.js': { usePrototypeData: () => data },
    '../domain/workbenchTasks.js': workbench,
    '../domain/airOrderSupplement.js': supplement,
    '../domain/airServiceEditing.js': serviceEditing,
    '../domain/airDeclarations.js': declarations,
    '../data/accessControl.js': accessControl,
    '../domain/catalog.js': catalog,
  }
  const imported = { defineProps: () => context.props, defineEmits: () => context.emit }
  let body = parsed.descriptor.scriptSetup.content
  const imports = script.scriptSetupAst.filter(node => node.type === 'ImportDeclaration')
  for (const node of imports) {
    const module = modules[node.source.value] || { default: {} }
    for (const specifier of node.specifiers) imported[specifier.local.name] = specifier.type === 'ImportDefaultSpecifier' ? module.default : module[specifier.imported.name]
  }
  for (const node of imports.toReversed()) body = body.slice(0, node.start) + body.slice(node.end)
  const bindings = Object.keys(script.bindings).filter(key => !script.bindings[key].startsWith('props'))
  const run = new Function(...Object.keys(imported), `${body}\nreturn { ${bindings.join(', ')} }`)
  return (props = {}) => {
    context.props = vue.reactive(props)
    const scope = vue.effectScope(); scopes.push(scope)
    return scope.run(() => run(...Object.values(imported)))
  }
}
const setupDashboard = loadPage('views/DashboardView')
const setupSupplement = loadPage('views/AirOrderSupplementView')
const setupHouse = loadPage('components/AirHouseBillDialog')
const setupSource = loadPage('views/AirDeclarationSourceView')
const materialTasks = persona => workbench.deriveWorkbenchTasks(data.state, persona).filter(row => row.type === 'air-customs-materials')

function notifyExamples() {
  data.selectWorkbenchPersona('customsService')
  data.loadAirDeclarationExamples()
  const rows = data.airDeclarations.value.filter(row => row.materials.length)
  data.notifyAirDeclarationMaterials(rows.map(row => ({ serviceId: row.id, materialId: row.materials[0].id })))
  data.selectWorkbenchPersona('service')
  return { direct: rows.find(row => !row.childId), house: rows.find(row => row.childId) }
}
function enterSource(row) {
  route.path = row.target.path
  route.params = row.childId ? { serviceId: row.id } : { orderId: row.orderId }
  route.query = { ...row.target.query }
  return row.childId ? setupSource() : setupSupplement()
}
beforeEach(() => {
  data.reset()
  route.path = '/dashboard'; route.params = {}; route.query = {}
  context.push.mockReset(); context.replace.mockReset(); context.confirm.mockReset().mockResolvedValue('confirm'); context.emit.mockReset()
})
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))

describe('GJ-012 报关材料通知与客服工作台来源页', () => {
  it('报关角色独立隔离，快捷入口指向实际报关页', () => {
    data.selectWorkbenchPersona('customsService')
    expect(data.declarationSession.value).toEqual({ role: 'customsService', name: '报关演示客服', readAll: false })
    expect(data.airChildSession.value.role).toBe('viewer')
    expect(workbench.getWorkbenchQuickLinks('customsService')).toEqual([expect.objectContaining({ target: { path: '/fulfillment/declarations' }, disabled: false })])
    data.selectWorkbenchPersona('service')
    expect(() => data.loadAirDeclarationExamples()).toThrow('仅报关行客服')
  })

  it('真实通知生成本人直单/分单待办；只给建单客服或同名主管，操作入口不会完成任务', () => {
    const { direct, house } = notifyExamples()
    for (const persona of ['service', 'supervisor']) {
      const tasks = materialTasks(persona)
      expect(tasks).toHaveLength(2)
      expect(tasks.every(task => task.handler === '周倩' && task.creator === '周倩' && !task.completed)).toBe(true)
      expect(tasks.map(task => task.subject)).toEqual(['报关服务进行中，请补齐材料', '报关服务进行中，请补齐材料'])
      expect(tasks.find(task => task.serviceId === direct.id).target).toEqual(direct.target)
      expect(tasks.find(task => task.serviceId === house.id)).toMatchObject({ no: house.housebillNo, target: house.target })
    }
    for (const persona of ['operator', 'customsService', { scope: 'air', role: 'service', name: '其他客服' }, { scope: 'finance', role: 'service', name: '周倩' }]) expect(materialTasks(persona)).toEqual([])
    const dashboard = setupDashboard(), task = dashboard.tasks.value.find(row => row.type === 'air-customs-materials')
    dashboard.process(task)
    expect(context.push).toHaveBeenCalledWith(task.target)
    expect(materialTasks('service').every(row => !row.completed)).toBe(true)
    expect(dashboard.taskLabels['air-customs-materials']).toBe('报关材料')
  })

  it('直单深链展示服务通知与时间，返回准确报关服务且保持未完成', () => {
    const { direct } = notifyExamples(), view = enterSource(direct)
    expect(view.customsDeclaration.value.id).toBe(direct.id)
    expect(view.childVisible.value).toBe(false)
    expect(view.customsRequests.value).toEqual([expect.objectContaining({ recipient: '周倩', createdAt: expect.any(String), materialName: '演示材料一', content: `订单号：${direct.orderNo}的演示材料一有误，请补齐材料。` })])
    view.returnToCustoms()
    expect(context.push).toHaveBeenCalledWith({ path: '/fulfillment/declarations', query: { service: direct.id } })
    expect(materialTasks('service').every(row => !row.completed)).toBe(true)
  })

  it.each(['直单', '分单'])('报关客服可独立只读查看%s来源，未发送通知也能定位且不获得写权限', async kind => {
    data.selectWorkbenchPersona('customsService')
    data.loadAirDeclarationExamples()
    const row = data.airDeclarations.value.find(item => kind === '分单' ? item.childId : !item.childId)
    const view = enterSource({ ...row, target: { ...row.target, query: { ...row.target.query, inspect: 'service' } } })
    if (kind === '分单') {
      expect(view.declaration.value.id).toBe(row.id)
      expect(view.child.value.id).toBe(row.childId)
      expect(view.requests.value).toEqual([])
      expect(view.sections.value.find(section => section.title === '本次报关服务').source.documentType).toBe(row.documentType)
      view.back()
    } else {
      expect(view.sourceDeclaration.value.id).toBe(row.id)
      expect(view.customsDeclaration.value).toBeNull()
      expect(view.customsRequests.value).toEqual([])
      expect(view.customsLinkError.value).toBe('')
      expect(view.childVisible.value).toBe(false)
      expect(view.canSubmit.value).toBe(false)
      expect(view.canEditCode.value).toBe(false)
      expect(view.submit()).toBe(false)
      view.returnToCustoms()
    }
    expect(context.push).toHaveBeenCalledWith({ path: '/fulfillment/declarations', query: { service: row.id } })
    data.selectWorkbenchPersona('operator')
    await vue.nextTick()
    expect(kind === '分单' ? view.declaration.value : view.sourceDeclaration.value).toBeNull()
    data.selectWorkbenchPersona('customsService')
    await vue.nextTick()
    expect(kind === '分单' ? Boolean(view.child.value) : view.openCustomsSource()).toBe(true)
    data.reset()
    await vue.nextTick()
    expect(kind === '分单' ? view.declaration.value : view.sourceDeclaration.value).toBeNull()
  })

  it('分单深链只展示该分单及服务，本人通知可见，不提供主单或兄弟分单入口', () => {
    const { house } = notifyExamples(), view = enterSource(house)
    expect(view.child.value.id).toBe(house.childId)
    expect(view.requests.value[0].content).toBe(`分单号：${house.housebillNo}的演示分单材料有误，请补齐材料。`)
    expect(view.materials.value[0]).toMatchObject({ name: '演示分单材料', available: true })
    const details = view.sections.value.flatMap(section => section.fields.map(([key]) => section.source[key])).filter(value => value !== undefined)
    const parent = data.state.airOrders.find(row => row.id === house.orderId), sibling = data.state.airChildren.find(row => row.parentId === parent.id && row.id !== house.childId)
    expect(details).not.toContain(parent.orderNo)
    expect(details).not.toContain(sibling.housebillNo)
    expect(view.save).toBeUndefined()
    expect(view.submit).toBeUndefined()
    view.back(); expect(context.push).toHaveBeenLastCalledWith({ path: '/foundation/messages' })
    expect(materialTasks('service').every(row => !row.completed)).toBe(true)
  })

  it('角色切换与重置同步清理分单及通知，不保留旧角色可见数据', async () => {
    const { house } = notifyExamples(), view = enterSource(house)
    data.selectWorkbenchPersona('operator')
    expect(view.declaration.value).toBeNull()
    expect(view.child.value).toBeNull()
    expect(view.requests.value).toEqual([])
    expect(view.materials.value).toEqual([])
    data.selectWorkbenchPersona('customsService')
    expect(view.declaration.value.id).toBe(house.id)
    data.selectWorkbenchPersona('service')
    expect(view.child.value.id).toBe(house.childId)
    data.reset()
    expect(view.declaration.value).toBeNull()
    expect(view.child.value).toBeNull()
    expect(materialTasks('service')).toEqual([])
  })

  it('主分单创建人不同时，分单建单客服仍可查看本人通知，不能读取他人主单', () => {
    const { house } = notifyExamples()
    const parent = data.state.airOrders.find(row => row.id === house.orderId)
    parent.creator = '另一建单客服'
    const view = enterSource(house)
    expect(view.declaration.value.id).toBe(house.id)
    expect(view.child.value.creator).toBe('周倩')
    expect(view.requests.value).toHaveLength(1)
    route.params = { orderId: parent.id }; route.query = {}
    const supplementView = setupSupplement()
    expect(supplementView.order.value).toBeUndefined()
    expect(supplementView.canSubmit.value).toBe(false)
  })

  it('分单移出主单后服务/消息/待办来源仍可访问，旧链接转址且不扩主单权限', async () => {
    const { house } = notifyExamples(), originalParentId = house.orderId
    const parent = data.state.airOrders.find(row => row.id === house.orderId)
    parent.orderStatus = '待补录'; parent.creator = '另一建单客服'
    data.selectWorkbenchPersona('supervisor')
    data.moveAirHouseBill(parent.id, house.childId)
    data.selectWorkbenchPersona('service')
    const moved = data.airDeclarations.value.find(row => row.id === house.id)
    expect(moved.orderId).toBe('')
    expect(moved.target).toEqual(house.target)
    const view = enterSource(moved)
    expect(view.child.value.id).toBe(house.childId)
    expect(view.requests.value).toHaveLength(1)
    expect(materialTasks('service').find(row => row.serviceId === house.id).target).toEqual(moved.target)
    route.params = { orderId: originalParentId }; route.query = { customs: house.id, child: house.childId }
    const old = setupSupplement()
    expect(old.order.value).toBeUndefined()
    expect(old.customsDeclaration.value).toBeNull()
    expect(context.replace).toHaveBeenLastCalledWith(moved.target)
    expect(old.canSubmit.value).toBe(false)
    context.replace.mockClear()
    route.query = { customs: house.id, child: 'WRONG-CHILD' }
    await vue.nextTick()
    expect(old.legacyCustomsSource.value).toBeNull()
    expect(context.replace).not.toHaveBeenCalled()
  })

  it('未被通知的客服、他人客服与错服务不能读取分单来源；同名主管可读本人通知', () => {
    data.selectWorkbenchPersona('customsService'); data.loadAirDeclarationExamples()
    const house = data.airDeclarations.value.find(row => row.childId && row.materials.length)
    data.selectWorkbenchPersona('service')
    const view = enterSource(house)
    expect(view.declaration.value).toBeNull()
    data.selectWorkbenchPersona('customsService')
    data.notifyAirDeclarationMaterials([{ serviceId: house.id, materialId: house.materials[0].id }])
    data.selectWorkbenchPersona('supervisor')
    expect(view.declaration.value.id).toBe(house.id)
    Object.assign(data.airSession, { role: 'service', name: '其他客服' })
    expect(view.declaration.value).toBeNull()
    expect(view.sections.value).toEqual([])
    data.selectWorkbenchPersona('service')
    route.params = { serviceId: 'MISSING' }
    expect(view.declaration.value).toBeNull()
  })

  it('历史转址不展示主单header；取消或失效母单来源可只读查历史并明确限制', () => {
    const { house } = notifyExamples(), view = enterSource(house)
    const child = data.state.airChildren.find(row => row.id === house.childId)
    child.parentId = 'MISSING-PARENT'
    expect(view.declaration.value.orderId).toBe('')
    expect(view.declaration.value.notifyBlockReason).toBeTruthy()
    expect(view.child.value.parentId).toBe('MISSING-PARENT')
    expect(view.requests.value).toHaveLength(1)
    child.parentId = ''; child.orderStatus = '已取消'
    expect(view.declaration.value.notifyBlockReason).toBeTruthy()
    expect(view.requests.value).toHaveLength(1)
    expect(templates['views/AirDeclarationSourceView']).toContain("child.parentId ? '关联的主订单已不存在' : '该分单当前未关联主订单'")
    expect(templates['views/AirDeclarationSourceView']).toContain('v-if="declaration.notifyBlockReason"')
    expect(templates['views/AirOrderSupplementView']).toContain('order && !legacyCustomsSource')
    expect(templates['views/AirOrderSupplementView']).toContain('<template v-if="!legacyCustomsSource" #actions>')
  })

  it('切换通知来源保护未保存内容，取消保留，确认后才清理；无关查询不清草稿', async () => {
    const { direct } = notifyExamples(), view = enterSource(direct)
    view.draft.value.code = 'EAW'
    const from = { params: { ...route.params }, query: { ...route.query } }
    expect(await context.update({ ...from, query: { ...from.query, tab: 'other' } }, from)).toBe(true)
    expect(context.confirm).not.toHaveBeenCalled()
    const to = { ...from, query: { ...from.query, inspect: 'service' } }
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.update(to, from)).toBe(false)
    expect(view.draft.value.code).toBe('EAW')
    expect(await context.update(to, from)).toBe(true)
    expect(view.draft.value.code).toBe('EAP')
    expect(view.dirty.value).toBe(false)
  })

  it('等待离开确认期间重置使旧回调失效，不对新数据放行', async () => {
    const { direct } = notifyExamples(), view = enterSource(direct)
    view.draft.value.code = 'EAW'
    let resolve
    context.confirm.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const leaving = context.leave()
    data.reset()
    await vue.nextTick()
    resolve('confirm')
    expect(await leaving).toBe(false)
    expect(view.order.value).toBeUndefined()
    expect(view.busy.value).toBe(false)
  })
})
