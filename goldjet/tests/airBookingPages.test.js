import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, nextTick, reactive } from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as bookingDomain from '../src/domain/airOperations.js'
import * as presentation from '../src/domain/airBookingPresentation.js'

const data = usePrototypeData()
const route = reactive({ query: {} })
const context = { leave: null, update: null, mounted: [], unmounted: [], confirm: vi.fn(), push: vi.fn() }
const feedback = { ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: context.confirm } }
const scopes = []
const filename = new URL('../src/views/BookingView.vue', import.meta.url)
const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
expect(parsed.errors).toEqual([])
const script = compileScript(parsed.descriptor, { id: 'BookingView' })
const template = parsed.descriptor.template.content
expect(compileTemplate({ source: template, filename: filename.pathname, id: 'BookingView', compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
const modules = {
  vue: { ...vue, onMounted: callback => context.mounted.push(callback), onBeforeUnmount: callback => context.unmounted.push(callback) },
  'vue-router': { useRoute: () => route, useRouter: () => ({ push: context.push }), onBeforeRouteLeave: guard => { context.leave = guard }, onBeforeRouteUpdate: guard => { context.update = guard } },
  'element-plus': feedback,
  '@element-plus/icons-vue': new Proxy({}, { get: () => ({}) }),
  '../data/usePrototypeData.js': { usePrototypeData: () => data },
  '../domain/airOperations.js': bookingDomain,
  '../domain/airBookingPresentation.js': presentation,
}
const imported = {}
let body = parsed.descriptor.scriptSetup.content
const imports = script.scriptSetupAst.filter(node => node.type === 'ImportDeclaration')
for (const node of imports) {
  const module = modules[node.source.value] || { default: {} }
  for (const specifier of node.specifiers) imported[specifier.local.name] = specifier.type === 'ImportDefaultSpecifier' ? module.default : module[specifier.imported.name]
}
for (const node of imports.toReversed()) body = body.slice(0, node.start) + body.slice(node.end)
const bindings = Object.keys(script.bindings)
const run = new Function(...Object.keys(imported), `${body}\nreturn { ${bindings.join(', ')} }`)

// Use the real page, booking domain and central owner; only browser/router/feedback adapters are replaced.
function setup() {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => run(...Object.values(imported)))
}
const copy = value => JSON.parse(JSON.stringify(value))
function validDraft(overrides = {}) {
  return { ...bookingDomain.createBookingDraft(), airline: '东方航空', flight: 'MU9001', departureDate: '2026-09-10',
    firstDestination: 'CAN', firstLeg: 'PVG - CAN', takeoffTime: '20:00', cutoffTime: '16:00',
    airCost: 24, guidePrice: 28, waybillType: '自营', secondDestination: 'NRT', secondLeg: 'CAN - NRT',
    thirdLeg: 'NRT - LAX', routeType: '国内中转', ...overrides }
}
function addOrder(overrides = {}) {
  const id = `BOOK-PAGE-${data.state.airOrders.length + 1}`
  data.state.airOrders.push({ ...copy(data.state.airOrders[0]), id, orderNo: id, product: 'MU-GENERAL',
    orderStatus: '待订舱', bookingStatus: '待服务', booking: bookingDomain.createBookingDraft(), waybillNo: '',
    bookingConfirmedAt: '', bookingCompletedAt: '', approval: null,
    services: [{ id: `${id}-BOOKING`, name: '订舱', type: 'booking', status: '待服务' }], ...overrides })
  return data.state.airOrders.at(-1)
}
function deferConfirmation() {
  let resolve
  context.confirm.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  return value => resolve(value)
}
beforeEach(() => {
  data.reset()
  data.selectWorkbenchPersona('operator')
  route.query = {}
  context.confirm.mockReset().mockResolvedValue('confirm')
  context.push.mockReset()
  context.leave = null; context.update = null; context.mounted = []; context.unmounted = []
  Object.values(feedback.ElMessage).forEach(mock => mock.mockReset())
})
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals() })

describe('GJ-010 订舱页面筛选和来源信息', () => {
  it('航司默认按实际人员绑定，待服务订单未填订舱航司时仍按产品正确命中', async () => {
    const mu = data.state.airMaster.flights.find(row => row.airlineCode === 'MU')
    const cz = data.state.airMaster.flights.find(row => row.airlineCode === 'CZ')
    data.state.capacityProducts = [
      { id: 'MU-OWN', flightId: mu.id, operator: '李明', handler: '其他操作' },
      { id: 'CZ-OWN', flightId: cz.id, operator: '其他运营', handler: '王晴' },
    ]
    const muOrder = addOrder(), czOrder = addOrder({ product: 'CZ-GENERAL' })
    const view = setup()
    expect(view.filters.airline).toEqual(['东方航空'])
    expect(muOrder.booking.airline).toBe('')
    expect(view.rows.value.map(row => row.id)).toContain(muOrder.id)
    expect(view.rows.value.map(row => row.id)).not.toContain(czOrder.id)
    data.selectWorkbenchPersona('handler')
    await nextTick()
    expect(view.filters.airline).toEqual(['南方航空'])
    expect(view.rows.value.map(row => row.id)).toContain(czOrder.id)
    expect(view.rows.value.map(row => row.id)).not.toContain(muOrder.id)
    view.filters.airline = []
    expect(view.rows.value.map(row => row.id)).toEqual(expect.arrayContaining([muOrder.id, czOrder.id]))
    view.resetFilters()
    expect(view.filters.airline).toEqual(['南方航空'])
  })

  it('文本模糊、航班精确、日期包含边界，重置只恢复筛选不丢订舱草稿', async () => {
    const order = addOrder({ booking: validDraft(), flight: 'MU9001', customer: 'DEMO CUSTOMER', departureDate: '2026-09-10', createDate: '2026-09-08' })
    const view = setup()
    await view.open(order)
    view.draft.remark = '保留未保存备注'
    Object.assign(view.filters, { airline: [], orderNo: 'book-page', customer: 'customer', flight: 'MU9001', departureDate: ['2026-09-10', '2026-09-10'], createDate: ['2026-09-08', '2026-09-08'] })
    expect(view.rows.value.map(row => row.id)).toEqual([order.id])
    view.filters.flight = 'MU900'
    expect(view.rows.value).toEqual([])
    view.resetFilters()
    expect(view.draft.remark).toBe('保留未保存备注')
    expect(view.dirty.value).toBe(true)
    expect(context.confirm).not.toHaveBeenCalled()
  })

  it('合成来源按每个子单截前三品名，完整品名可展开，忽略取消及删除的子单', async () => {
    const order = addOrder({ orderType: '合成主订单', booking: validDraft() })
    const base = { parentId: order.id, orderStatus: '子订单完成', customer: order.customer, pieces: 1, grossWeight: 2, volume: 0.1 }
    data.state.airChildren = [
      { ...base, id: 'SOURCE-A', orderNo: 'A', goodsName: '甲；乙; 丙；丁；戊', expectedArrival: '2026-09-12 10:00' },
      { ...base, id: 'SOURCE-B', orderNo: 'B', goodsName: 'A;B;C;D', expectedArrival: '2026-09-13 11:30' },
      { ...base, id: 'SOURCE-CANCELLED', goodsName: '不应展示', orderStatus: '已取消', expectedArrival: '2026-09-20 00:00' },
      { ...base, id: 'SOURCE-DELETED', goodsName: '不应展示', deleted: true },
      { ...base, id: 'SOURCE-OTHER', parentId: 'OTHER', goodsName: '其他主单' },
    ]
    const view = setup()
    await view.open(order)
    expect(view.sourceChildren.value.map(row => [row.orderNo, row.shortGoodsName, row.fullGoodsName])).toEqual([
      ['A', '甲；乙；丙…', '甲；乙；丙；丁；戊'], ['B', 'A；B；C…', 'A；B；C；D'],
    ])
    expect(view.latestArrival.value).toBe('2026-09-13 11:30')
    expect(template).toContain('<details v-if="row.fullGoodsName"')
    expect(template).toContain('<p>{{ row.fullGoodsName }}</p>')
    expect(template).toContain('预计送货时间')
    expect(template).toContain('来源待确认')
  })
})

describe('GJ-010 订舱页面草稿和异步确认', () => {
  it('脏草稿关闭取消保留输入，确认关闭不写订单，再打开载入已保存值', async () => {
    const order = addOrder({ booking: validDraft() })
    const original = copy(order)
    const view = setup()
    await view.open(order)
    view.draft.remark = '未保存'
    context.confirm.mockRejectedValueOnce('cancel')
    const done = vi.fn()
    await view.close(done)
    expect(done).not.toHaveBeenCalled()
    expect(view.visible.value).toBe(true)
    expect(view.draft.remark).toBe('未保存')
    await view.close(done)
    expect(done).toHaveBeenCalledOnce()
    expect(order).toEqual(original)
    await view.open(order)
    expect(view.draft.remark).toBe(original.booking.remark)
    expect(view.dirty.value).toBe(false)
  })

  it('切换对象和路由共用草稿确认，同对象query变化不额外确认', async () => {
    const first = addOrder({ booking: validDraft() }), second = addOrder({ booking: validDraft() })
    const view = setup()
    await view.open(first)
    view.draft.remark = '旧单未保存'
    context.confirm.mockRejectedValueOnce('cancel')
    await view.open(second)
    expect(view.selected.value).toBe(first)
    expect(view.draft.remark).toBe('旧单未保存')
    expect(await context.update({ query: { order: first.id, tab: 'detail' } }, { query: { order: first.id } })).toBe(true)
    expect(context.confirm).toHaveBeenCalledOnce()
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.leave()).toBe(false)
    await view.open(second)
    expect(view.selected.value).toBe(second)
    expect(view.draft.remark).toBe(second.booking.remark)
  })

  it.each(['role', 'reset'])('亏损确认期间%s变化使旧提交失效，不写入订单或发送消息', async change => {
    const order = addOrder()
    const view = setup()
    await view.open(order)
    Object.assign(view.draft, validDraft({ airCost: 30, allowLoss: true }))
    view.approvalReason.value = '演示申请理由'
    expect(view.decision.value.kind).toBe('approval')
    expect(view.blocked.value).toBe(false)
    const resolve = deferConfirmation(), original = copy(order)
    const pending = view.submit()
    expect(view.busy.value).toBe(true)
    await view.submit()
    expect(context.confirm).toHaveBeenCalledOnce()
    if (change === 'role') data.selectWorkbenchPersona('handler')
    else data.reset()
    await nextTick()
    const messages = copy(data.state.messages)
    resolve('confirm')
    await pending
    expect(order).toEqual(original)
    expect(data.state.messages).toEqual(messages)
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
    expect(view.busy.value).toBe(false)
  })

  it('亏损确认取消保留草稿及理由，确认后同一owner生成审批', async () => {
    const order = addOrder()
    const view = setup()
    await view.open(order)
    Object.assign(view.draft, validDraft({ airCost: 30, allowLoss: true }))
    view.approvalReason.value = '合同板不足基准载重'
    context.confirm.mockRejectedValueOnce('cancel')
    await view.submit()
    expect(view.visible.value).toBe(true)
    expect(view.approvalReason.value).toBe('合同板不足基准载重')
    expect(order.approval).toBeNull()
    await view.submit()
    expect(order).toMatchObject({ orderStatus: '待审核', bookingStatus: '待审核', approval: { reason: '合同板不足基准载重' } })
    expect(data.state.messages.at(-1).content).toContain('合同板不足基准载重')
    expect(view.visible.value).toBe(false)
  })

  it('浏览器刷新保护按草稿状态触发，生命周期移除同一监听', async () => {
    const windowAdapter = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('window', windowAdapter)
    const view = setup(), order = addOrder({ booking: validDraft() })
    await view.open(order)
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    view.beforeUnload(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    view.draft.remark = '需要保护的备注'
    view.beforeUnload(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe('')
    context.mounted.forEach(callback => callback()); context.unmounted.forEach(callback => callback())
    expect(windowAdapter.addEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
    expect(windowAdapter.removeEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
  })
})

describe('GJ-010 航晟会话与审批按钮契约', () => {
  it('航晟真实会话能完成订舱，操作员字段仍保持只读契约', async () => {
    const order = addOrder()
    data.selectWorkbenchPersona('hangsheng')
    const view = setup()
    await view.open(order)
    expect(view.session.value).toEqual({ role: 'hangsheng', name: '陈楠' })
    expect(view.actionLabel.value).toBe('订舱完成')
    expect(view.fieldDisabled('airCost')).toBe(false)
    Object.assign(view.draft, validDraft())
    await view.submit()
    expect(order).toMatchObject({ orderStatus: '待补录', bookingStatus: '服务已完成' })
    data.selectWorkbenchPersona('handler')
    await nextTick()
    await view.open(order)
    expect(view.fieldDisabled('airCost')).toBe(true)
    expect(view.fieldDisabled('secondLeg')).toBe(true)
    expect(view.fieldDisabled('waybillType')).toBe(true)
  })

  it('逐级审批只当前角色显示通过按钮，后级提前操作不改变订单', async () => {
    const order = addOrder({ sellRate: 0.3, chargeWeight: 300 })
    data.saveAirBooking(order.id, validDraft({ airCost: 50, allowLoss: true }), { confirmedApproval: true, approvalReason: '多级审核演示' })
    data.selectWorkbenchPersona('divisionGeneral')
    const view = setup()
    await view.open(order)
    expect(view.canApprove.value).toBe(false)
    expect(view.actionLabel.value).toBe('')
    const before = copy(order)
    await view.approve()
    expect(order).toEqual(before)
    expect(context.confirm).not.toHaveBeenCalled()
    for (const [role, next] of [['director', 'deputyGeneral'], ['deputyGeneral', 'divisionGeneral'], ['divisionGeneral', '']]) {
      data.selectWorkbenchPersona(role)
      await nextTick()
      await view.open(order)
      expect(view.canApprove.value).toBe(true)
      await view.approve()
      expect(bookingDomain.getBookingApproval(order).currentRole).toBe(next)
      expect(view.canApprove.value).toBe(false)
    }
    expect(order.orderStatus).toBe('待补录')
    expect(order.bookingStatus).toBe('待审核')
    expect(order.approval.serviceStatePending).toBe(true)
    expect(template).toContain('v-if="canApprove"')
  })

  it.each(['role', 'reset'])('通过确认期间%s变化使旧审批失效', async change => {
    const order = addOrder({ sellRate: 0.3, chargeWeight: 300 })
    data.saveAirBooking(order.id, validDraft({ airCost: 50, allowLoss: true }), { confirmedApproval: true })
    data.selectWorkbenchPersona('director')
    const view = setup()
    await view.open(order)
    const resolve = deferConfirmation(), before = copy(order)
    const pending = view.approve()
    if (change === 'role') data.selectWorkbenchPersona('deputyGeneral')
    else data.reset()
    await nextTick()
    const messages = copy(data.state.messages)
    resolve('confirm')
    await pending
    expect(order).toEqual(before)
    expect(data.state.messages).toEqual(messages)
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
  })
})
