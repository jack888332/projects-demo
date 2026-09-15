import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, nextTick, reactive } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import * as groundOperations from '../src/domain/groundOperations.js'

const context = { route: null, data: null, updateGuard: null, leaveGuard: null, confirm: vi.fn(), replace: vi.fn() }
const routerHooks = {
  useRoute: () => context.route,
  useRouter: () => ({ replace: context.replace, push: vi.fn() }),
  onBeforeRouteLeave: guard => { context.leaveGuard = guard },
  onBeforeRouteUpdate: guard => { context.updateGuard = guard },
}
const feedback = {
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: context.confirm },
}

// Execute each real setup body with router/data adapters; no DOM test framework is installed.
function loadView(name) {
  const filename = new URL(`../src/views/${name}.vue`, import.meta.url)
  const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
  expect(parsed.errors).toEqual([])
  const script = compileScript(parsed.descriptor, { id: name })
  expect(compileTemplate({ source: parsed.descriptor.template.content, filename: filename.pathname, id: name, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  const modules = { vue, 'vue-router': routerHooks, 'element-plus': feedback, '../data/usePrototypeData.js': { usePrototypeData: () => context.data }, '../domain/groundOperations.js': groundOperations }
  const imported = {}
  let body = parsed.descriptor.scriptSetup.content
  const declarations = script.scriptSetupAst.filter(node => node.type === 'ImportDeclaration')
  for (const node of declarations) {
    const module = modules[node.source.value] || { default: {} }
    for (const specifier of node.specifiers) imported[specifier.local.name] = specifier.type === 'ImportDefaultSpecifier' ? module.default : module[specifier.imported.name]
  }
  for (const node of declarations.toReversed()) body = body.slice(0, node.start) + body.slice(node.end)
  const run = new Function(...Object.keys(imported), `${body}\nreturn { ${Object.keys(script.bindings).join(', ')} }`)
  return () => run(...Object.values(imported))
}
const GroundDispatchView = loadView('GroundDispatchView')
const GroundWaybillsView = loadView('GroundWaybillsView')

let scope
function setup(view, query = {}) {
  context.route = reactive({ query })
  scope = effectScope()
  return scope.run(view)
}
async function navigate(query) {
  if (!await context.updateGuard()) return false
  context.route.query = query
  await nextTick()
  return true
}

beforeEach(() => {
  const groundOrders = [
    { id: 'ORDER-1', orderNo: 'CAR-001', dispatchStatus: '已调度', pickupTime: '2026-09-01 10:00', updatedAt: '2026-09-01 09:00' },
    { id: 'ORDER-2', orderNo: 'CAR-002', dispatchStatus: '未调度', pickupTime: '2026-09-02 10:00', updatedAt: '2026-09-02 09:00' },
  ]
  for (const order of groundOrders) {
    order.pickupPoints = [{ province: '上海', city: '上海' }]
    order.deliveryPoints = [{ province: '江苏', city: '苏州' }]
  }
  context.data = {
    state: reactive({
      groundOrders,
      groundWaybills: [
        { id: 'BILL-1', waybillNo: 'D001', orderId: 'ORDER-1', orderNo: 'CAR-001', status: '待提货', pickupTime: '2026-09-01 10:00', createdAt: '2026-09-01 09:00' },
        { id: 'BILL-2', waybillNo: 'D002', orderId: 'ORDER-2', orderNo: 'CAR-002', status: '已卸货', pickupTime: '2026-09-02 10:00', createdAt: '2026-09-02 09:00' },
      ],
    }),
    groundSession: reactive({ role: 'supervisor', name: '演示主管' }),
    dispatchGroundOrders: vi.fn(),
    updateGroundWaybillStatus: vi.fn(),
  }
  context.confirm.mockReset().mockResolvedValue('confirm')
  context.replace.mockReset().mockImplementation(async () => { context.route.query = {}; await nextTick() })
})
afterEach(() => scope?.stop())

describe('第017篇司机任务详情深链', () => {
  it.each(['BILL-1', 'D001'])('运单 id 或业务编号 %s 直接打开详情并清除默认日期', reference => {
    const view = setup(GroundWaybillsView, { waybill: reference })
    expect(view.selected.value.id).toBe('BILL-1')
    expect(view.detailVisible.value).toBe(true)
    expect(view.filters.pickupDate).toBe('')
    expect(view.rows.value.map(row => row.id)).toEqual(['BILL-1'])
  })

  it.each(['ORDER-1', 'CAR-001'])('订单 id 或业务编号 %s 直接打开详情', reference => {
    const view = setup(GroundDispatchView, { order: reference, action: 'detail' })
    expect(view.selected.value.id).toBe('ORDER-1')
    expect(view.detailVisible.value).toBe(true)
    expect(view.visible.value).toBe(false)
    expect(view.rows.value.map(row => row.id)).toEqual(['ORDER-1'])
  })

  it('关联订单筛选支持 id 与编号，不把订单链接误作运单详情', async () => {
    const view = setup(GroundWaybillsView, { order: 'ORDER-1' })
    expect(view.rows.value.map(row => row.id)).toEqual(['BILL-1'])
    expect(view.detailVisible.value).toBe(false)
    await navigate({ order: 'CAR-002' })
    expect(view.rows.value.map(row => row.id)).toEqual(['BILL-2'])
  })

  it('原有工作台 action=dispatch 仍打开未调度订单的派车草稿', async () => {
    const view = setup(GroundDispatchView, { order: 'ORDER-2', action: 'dispatch' })
    await nextTick()
    expect(view.visible.value).toBe(true)
    expect(view.targetIds.value).toEqual(['ORDER-2'])
    expect(view.detailVisible.value).toBe(false)
  })

  it('同路由从订单详情进入另一订单调度不会误报记录丢失', async () => {
    const view = setup(GroundDispatchView, { order: 'ORDER-1', action: 'detail' })
    await navigate({ order: 'ORDER-2', action: 'dispatch' })
    expect(view.visible.value).toBe(true)
    expect(view.routeError.value).toBe('')
  })

  it('失效运单或关联关系不匹配有持久反馈，并能恢复全部列表', async () => {
    const view = setup(GroundWaybillsView, { waybill: 'D001' })
    await navigate({ waybill: 'MISSING' })
    expect(view.routeError.value).toContain('未找到对应运输运单')
    expect(view.detailVisible.value).toBe(false)
    await navigate({ order: 'ORDER-2', waybill: 'D001' })
    expect(view.routeError.value).toContain('未找到对应运输运单')
    await view.showAll()
    expect(view.routeError.value).toBe('')
    expect(view.rows.value).toHaveLength(2)
  })

  it('失效订单不会继续显示之前对象的详情', async () => {
    const view = setup(GroundDispatchView, { order: 'ORDER-1', action: 'detail' })
    await navigate({ order: 'MISSING', action: 'detail' })
    expect(view.routeError.value).toContain('未找到对应运输订单')
    expect(view.detailVisible.value).toBe(false)
    expect(view.selected.value).toBeUndefined()
    await view.showAll()
    expect(view.rows.value).toHaveLength(2)
  })

  it.each([
    [GroundWaybillsView, { waybill: 'D001' }, 'groundWaybills'],
    [GroundDispatchView, { order: 'ORDER-1', action: 'detail' }, 'groundOrders'],
  ])('已打开详情的来源记录消失时关闭详情并保留反馈', async (component, query, collection) => {
    const view = setup(component, query)
    context.data.state[collection] = []
    await nextTick()
    expect(view.detailVisible.value).toBe(false)
    expect(view.routeError.value).toContain('未找到')
  })

  it('取消同路由切换保留运单状态草稿；确认后才打开下一详情', async () => {
    context.data.groundSession.role = 'hangsheng'
    const view = setup(GroundWaybillsView, { waybill: 'D001' })
    view.manage(context.data.state.groundWaybills[0])
    view.draft.remark = '未保存备注'
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await navigate({ waybill: 'D002' })).toBe(false)
    expect(context.route.query.waybill).toBe('D001')
    expect(view.statusVisible.value).toBe(true)
    expect(view.draft.remark).toBe('未保存备注')
    expect(await navigate({ waybill: 'D002' })).toBe(true)
    expect(view.statusVisible.value).toBe(false)
    expect(view.selected.value.id).toBe('BILL-2')
  })

  it('取消同路由切换保留派车草稿；确认后才打开目标订单', async () => {
    const view = setup(GroundDispatchView, { order: 'ORDER-2', action: 'dispatch' })
    await nextTick()
    view.drafts.value[0].plate = '沪A-DEMO'
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await navigate({ order: 'CAR-001', action: 'detail' })).toBe(false)
    expect(view.visible.value).toBe(true)
    expect(view.drafts.value[0].plate).toBe('沪A-DEMO')
    expect(await navigate({ order: 'CAR-001', action: 'detail' })).toBe(true)
    expect(view.visible.value).toBe(false)
    expect(view.selected.value.id).toBe('ORDER-1')
  })
})

describe('运输运单状态管理的页面权限', () => {
  it.each(['supervisor', 'admin', 'viewer', 'service'])('%s 只能查看，不能打开或提交状态管理', role => {
    context.data.groundSession.role = role
    const view = setup(GroundWaybillsView, { waybill: 'D001' })
    const bill = context.data.state.groundWaybills[0]
    expect(view.canManage.value).toBe(false)
    expect(view.detailVisible.value).toBe(true)
    expect(view.managementPermissionReason).toBe('仅航晟客服可管理运单状态')
    view.manage(bill)
    expect(view.statusVisible.value).toBe(false)
    view.statusId.value = bill.id
    Object.assign(view.draft, { status: '已提货', time: '2026-09-08 14:30', remark: '' })
    expect(view.error.value).toBe('')
    view.submit()
    expect(context.data.updateGroundWaybillStatus).not.toHaveBeenCalled()
    expect(bill.status).toBe('待提货')
  })

  it('航晟客服可以打开并保存状态；角色改变后立即禁止提交', async () => {
    context.data.groundSession.role = 'hangsheng'
    const view = setup(GroundWaybillsView, { waybill: 'D001' })
    const bill = context.data.state.groundWaybills[0]
    context.data.updateGroundWaybillStatus.mockImplementation((id, change) => Object.assign(context.data.state.groundWaybills.find(row => row.id === id), change))
    expect(view.canManage.value).toBe(true)
    view.manage(bill)
    expect(view.statusVisible.value).toBe(true)
    view.draft.status = '已提货'
    view.submit()
    expect(context.data.updateGroundWaybillStatus).toHaveBeenCalledOnce()
    expect(bill.status).toBe('已提货')
    expect(view.statusVisible.value).toBe(false)
    view.manage(bill)
    context.data.groundSession.role = 'supervisor'
    view.submit()
    await nextTick()
    expect(view.statusVisible.value).toBe(false)
    expect(context.data.updateGroundWaybillStatus).toHaveBeenCalledOnce()
  })

  it('航晟客服也不能对终态运单打开状态管理', () => {
    context.data.groundSession.role = 'hangsheng'
    const view = setup(GroundWaybillsView, { waybill: 'D002' })
    view.manage(context.data.state.groundWaybills[1])
    expect(view.statusVisible.value).toBe(false)
  })
})
