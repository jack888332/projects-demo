import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, nextTick, reactive } from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as waybills from '../src/domain/airWaybills.js'

const data = usePrototypeData()
const scopes = [], context = { props: {}, emit: vi.fn(), confirm: vi.fn(), push: vi.fn(), leave: [], update: [], mounted: [], unmounted: [] }
const feedback = { ElMessage: { success: vi.fn() }, ElMessageBox: { confirm: context.confirm } }
const modules = {
  vue: { ...vue, onMounted: fn => context.mounted.push(fn), onBeforeUnmount: fn => context.unmounted.push(fn) },
  'vue-router': { useRouter: () => ({ push: context.push }), onBeforeRouteLeave: guard => context.leave.push(guard), onBeforeRouteUpdate: guard => context.update.push(guard) },
  'element-plus': feedback,
  '@element-plus/icons-vue': new Proxy({}, { get: () => ({}) }),
  '../data/usePrototypeData.js': { usePrototypeData: () => data },
  '../domain/airWaybills.js': waybills,
}
function load(path) {
  const filename = new URL(path, import.meta.url), source = readFileSync(filename, 'utf8')
  const parsed = parse(source, { filename: filename.pathname })
  expect(parsed.errors).toEqual([])
  const script = compileScript(parsed.descriptor, { id: path })
  expect(compileTemplate({ source: parsed.descriptor.template.content, filename: filename.pathname, id: path, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
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
  return props => {
    context.props = reactive({ modelValue: true, selection: [], ...props })
    const scope = effectScope(); scopes.push(scope)
    return scope.run(() => run(...Object.values(imported)))
  }
}
const setupList = load('../src/views/AirWaybillsView.vue')
const setupSend = load('../src/components/AirWaybillSendDialog.vue')
const copy = value => JSON.parse(JSON.stringify(value))
function addOrder(overrides = {}) {
  const id = `AW-PAGE-${data.state.airOrders.length + 1}`
  data.state.airOrders.push({ ...copy(data.state.airOrders[0]), id, orderNo: id, orderStatus: '待出提单', waybillNo: `784-9000${String(data.state.airOrders.length).padStart(4, '0')}`,
    customer: '启航跨境贸易', departureDate: '2026-09-10', cutoffAt: '2026-09-10 16:00', waybill: { pieces: 4, grossWeight: 12.5, volume: 0.1 },
    waybillDocument: undefined, waybillTransmission: undefined, ...overrides })
  return data.state.airOrders.at(-1)
}
function addChild(order, overrides = {}) {
  const id = `AW-HOUSE-${data.state.airChildren.length + 1}`
  data.state.airChildren.push({ id, parentId: order.id, housebillNo: `HOUSE00000${data.state.airChildren.length + 10}`, orderStatus: '子订单完成', destination: order.destination, waybill: { pieces: 4, grossWeight: 12.5, volume: 0.1 }, ...overrides })
  return data.state.airChildren.at(-1)
}
function deferConfirmation() {
  let resolve
  context.confirm.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  return () => resolve('confirm')
}
beforeEach(() => {
  data.reset(); data.selectWorkbenchPersona('service')
  context.emit.mockReset(); context.push.mockReset(); context.confirm.mockReset().mockResolvedValue('confirm')
  context.leave = []; context.update = []; context.mounted = []; context.unmounted = []
  feedback.ElMessage.success.mockReset()
})
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('GJ-011 提单列表查询、选择和备注', () => {
  it('默认待出提单，查询显式提交，日期边界包含；重置全部清空而非恢复默认状态', () => {
    const first = addOrder(), issued = addOrder({ orderStatus: '已出提单', customer: '其他客户', departureDate: '2026-09-12' })
    const view = setupList()
    expect(view.TABLE.pageSize).toBe(50)
    expect(view.rows.value.map(row => row.id)).toEqual([first.id])
    view.filters.number = 'no-match'
    expect(view.rows.value.map(row => row.id)).toEqual([first.id])
    view.query(); expect(view.rows.value).toEqual([])
    Object.assign(view.filters, { number: first.orderNo.toLowerCase(), departure: ['2026-09-10', '2026-09-10'], cutoff: ['2026-09-10', '2026-09-10'] })
    view.query(); expect(view.rows.value.map(row => row.id)).toEqual([first.id])
    view.reset()
    expect(view.filters.status).toBe('')
    expect(view.applied.value).toEqual(view.emptyFilters())
    expect(view.rows.value.map(row => row.id)).toEqual([first.id, issued.id])
  })

  it('客户简称和操作人员模糊查询，订单和提单号命中任一项', () => {
    const order = addOrder({ assignees: { handler: '演示打单员' } })
    data.state.partners.find(row => row.name === order.customer).shortName = 'DEMO SHORT'
    const view = setupList()
    Object.assign(view.filters, { number: order.waybillNo.slice(-4), customer: 'demo sh', operator: '打单' })
    view.query(); expect(view.rows.value.map(row => row.id)).toEqual([order.id])
    expect(view.customerOptions.value[0].shortName).toBe('DEMO SHORT')
    view.filters.operator = '不匹配'; view.query(); expect(view.rows.value).toEqual([])
  })

  it('整票默认主单和所有分单，支持独立分单和跨页选择；查询清除旧选择', () => {
    const first = addOrder(), child = addChild(first), second = addOrder(), noNumber = addOrder({ waybillNo: '' })
    const view = setupList(), row = view.rows.value.find(item => item.id === first.id)
    view.toggleWhole(row, true)
    expect(view.selection.value).toEqual([{ orderId: first.id, childId: '' }, { orderId: first.id, childId: child.id }])
    view.toggle(first.id, '', false)
    expect(view.someSelected(row)).toBe(true); expect(view.wholeSelected(row)).toBe(false)
    view.toggleWhole(view.rows.value.find(item => item.id === second.id), true)
    expect(view.selection.value).toHaveLength(2)
    view.selectOnly(row, 'master')
    expect(view.selected(first.id)).toBe(true); expect(view.selected(first.id, child.id)).toBe(false)
    view.toggleWhole(view.rows.value.find(item => item.id === noNumber.id), true)
    expect(view.selected(noNumber.id)).toBe(false)
    view.query(); expect(view.selection.value).toEqual([])
  })

  it('备注256字符保存到同一owner，超限不保存；取消脏备注保留原记录和草稿', async () => {
    const order = addOrder({ waybillNote: '原备注' }), view = setupList()
    view.openNote(order); view.note.value = '字'.repeat(257); view.saveNote()
    expect(order.waybillNote).toBe('原备注'); expect(view.noteVisible.value).toBe(true)
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await view.closeNote()).toBe(false)
    expect(view.note.value).toHaveLength(257)
    view.note.value = '字'.repeat(256); view.saveNote()
    expect(order.waybillNote).toHaveLength(256); expect(view.noteVisible.value).toBe(false)
    view.openNote(order); view.note.value = '未保存'
    expect(await view.closeNote()).toBe(true)
    expect(order.waybillNote).toHaveLength(256)
  })

  it('角色变化使旧备注确认失效，当前角色不能修改备注', async () => {
    const order = addOrder({ waybillNote: '原备注' }), view = setupList()
    view.openNote(order); view.note.value = '未保存'
    const confirm = deferConfirmation(), pending = view.closeNote()
    data.selectWorkbenchPersona('operator'); confirm()
    expect(await pending).toBe(false)
    expect(view.allowed.value).toBe(false); expect(view.noteVisible.value).toBe(false)
    view.openNote(order); view.note.value = '越权修改'; view.saveNote()
    expect(order.waybillNote).toBe('原备注')
  })

  it('主分单链接保持同票上下文，下载初始无选择且明确返回配置缺失', () => {
    const order = addOrder(), child = addChild(order), view = setupList()
    view.edit(order, child.id)
    expect(context.push).toHaveBeenCalledWith({ path: `/fulfillment/airway-bills/${order.id}`, query: { child: child.id } })
    view.openDownload(); expect(view.downloadIds.value).toEqual([]); expect(view.downloadTypes.value).toEqual([])
    view.downloadIds.value = [order.id]; view.downloadTypes.value = ['提单（有格式）']; view.download()
    expect(view.downloadFeedback.value).toContain('当前不能生成业务文件')
    expect(order.orderStatus).toBe('待出提单')
  })

  it('提单列表不拿预计数据冒充实测，空值与无分单分别保留', () => {
    addOrder({ waybill: undefined, pieces: 999, grossWeight: 888, volume: 77 })
    const view = setupList(), row = view.rows.value[0]
    expect(row.mainCargo).toEqual({}); expect(row.childCount).toBe(0)
    expect(view.display(0)).toBe(0); expect(view.display(undefined)).toBe('未取得')
  })

  it('截单异常保留原文晚于当前的方向并使用同一虚拟时间轴', () => {
    const order = addOrder({ cutoffAt: '2026-09-08 15:00' }), view = setupList()
    expect(view.anomalous(order)).toBe(true)
    order.cutoffAt = '2026-09-08 14:30'; expect(view.anomalous(order)).toBe(false)
    order.cutoffAt = '2026-09-08 14:00'; expect(view.anomalous(order)).toBe(false)
    order.cutoffAt = '2026-09-08 16:00'; order.orderStatus = '已出提单'; expect(view.anomalous(order)).toBe(false)
  })

  it('列表日期筛选消费主数据截单天数派生结果，跨月前一天可正确命中', () => {
    const order = addOrder()
    order.booking.departureDate = '2026-10-01'; order.booking.cutoffTime = '16:00'
    data.state.airMaster.flights.find(row => row.code === order.booking.flight).cutoffDays = -1
    const view = setupList()
    expect(view.cutoff(view.rows.value[0])).toBe('2026-09-30 16:00')
    view.filters.cutoff = ['2026-09-30', '2026-09-30']; view.query()
    expect(view.rows.value.map(row => row.id)).toEqual([order.id])
    view.filters.cutoff = ['2026-10-01', '2026-10-01']; view.query(); expect(view.rows.value).toEqual([])
  })
})

describe('GJ-011 共享发送弹窗', () => {
  it('按所选票构建发送代码，忽略非所选单，虚拟时钟与其他模块一致', () => {
    const cz = addOrder(), mu = addOrder({ waybillNo: '781-12345678' }); addOrder({ waybillNo: '999-12345678' })
    const view = setupSend({ selection: [{ orderId: cz.id }, { orderId: mu.id }] })
    expect(view.codeRows.value.map(row => row.order.id)).toEqual([cz.id])
    expect(view.codes).toEqual({ [cz.id]: 'EAP', [mu.id]: '' })
    expect(view.clockText.value).toBe('2026-09-08 14:30:00')
    view.advance(); expect(view.clockText.value).toBe('2026-09-08 14:32:01')
  })

  it('分单独发必须已有主单成功，缺少必需货量也不能发送', () => {
    const order = addOrder(), child = addChild(order)
    const view = setupSend({ selection: [{ orderId: order.id, childId: child.id }] })
    expect(view.restriction.value).toContain('先成功发送主运单')
    const main = setupSend({ selection: [{ orderId: order.id }] })
    order.waybill.pieces = undefined
    expect(main.restriction.value).toContain('有效件数和重量')
  })

  it('真实owner先主后分返回结果、两分钟防重；推进121秒可重发', async () => {
    vi.useFakeTimers()
    const order = addOrder(), child = addChild(order), view = setupSend({ selection: [{ orderId: order.id, childId: child.id }, { orderId: order.id }] })
    expect(view.restriction.value).toBe('')
    const pending = view.send()
    expect(view.busy.value).toBe(true); expect(order.waybillTransmission.status).toBe('发送中')
    expect(await view.canClose()).toBe(false)
    await view.send(); await vi.runAllTimersAsync(); await pending
    expect(view.results.value.map(row => [row.childId, row.status])).toEqual([['', '成功'], [child.id, '成功']])
    expect(context.emit).toHaveBeenCalledWith('sent', view.results.value)
    expect(view.restriction.value).toContain('2 分钟内')
    view.advance(); expect(view.restriction.value).toBe('')
    const retry = view.send(); await vi.runAllTimersAsync(); await retry
    expect(view.results.value.every(row => row.status === '成功')).toBe(true)
  })

  it('主单模拟异常显示失败并列出未发送分单，异常重发不自造规则', async () => {
    vi.useFakeTimers()
    const order = addOrder(), child = addChild(order), view = setupSend({ selection: [{ orderId: order.id }, { orderId: order.id, childId: child.id }] })
    view.outcome.value = 'master-error'
    const pending = view.send(); await vi.runAllTimersAsync(); await pending
    expect(view.results.value[0]).toMatchObject({ status: '异常中' })
    expect(view.results.value[1]).toMatchObject({ skipped: true, error: '主运单未成功，未发送该分运单' })
    expect(child.waybillTransmission).toBeUndefined()
    expect(view.restriction.value).toContain('异常后的重发规则待确认')
  })

  it.each(['role', 'reset'])('等待回执期间%s变化不接收旧结果或发出sent事件', async change => {
    vi.useFakeTimers()
    const order = addOrder(), view = setupSend({ selection: [{ orderId: order.id }] })
    const pending = view.send()
    if (change === 'role') data.selectWorkbenchPersona('operator')
    else data.reset()
    await vi.runAllTimersAsync(); await pending
    expect(view.results.value).toEqual([])
    expect(context.emit.mock.calls.some(([event]) => event === 'sent')).toBe(false)
    expect(context.emit).toHaveBeenCalledWith('update:modelValue', false)
    expect(view.busy.value).toBe(false)
  })

  it('发送代码草稿取消可保留，旧关闭确认在角色变化后失效', async () => {
    const order = addOrder(), view = setupSend({ selection: [{ orderId: order.id }] })
    view.codes[order.id] = 'EAW'; expect(view.dirty.value).toBe(true)
    context.confirm.mockRejectedValueOnce('cancel'); expect(await view.close()).toBe(false)
    expect(view.codes[order.id]).toBe('EAW')
    const confirm = deferConfirmation(), pending = view.canClose()
    data.selectWorkbenchPersona('operator'); confirm(); expect(await pending).toBe(false)
    await nextTick(); expect(view.allowed.value).toBe(false)
  })

  it('同路由切换分单也保护发送代码草稿，取消不离开，确认后关闭旧弹窗', async () => {
    const order = addOrder(), view = setupSend({ selection: [{ orderId: order.id }] })
    view.codes[order.id] = 'EAW'
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.update[0]()).toBe(false)
    expect(context.emit).not.toHaveBeenCalledWith('update:modelValue', false)
    expect(await context.update[0]()).toBe(true)
    expect(context.emit).toHaveBeenCalledWith('update:modelValue', false)
  })
})
