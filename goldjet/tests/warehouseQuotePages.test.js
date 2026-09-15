import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, nextTick, reactive, unref } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as warehouseQuotes from '../src/domain/warehouseQuotes.js'
import * as warehouseQuoteActions from '../src/data/warehouseQuoteActions.js'

const data = usePrototypeData()
const context = { route: null, props: {}, leaveGuard: null, updateGuard: null, mounted: [], unmounted: [], confirm: vi.fn(), push: vi.fn() }
const feedback = { ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: context.confirm } }
const routerHooks = {
  useRoute: () => context.route,
  useRouter: () => ({ push: context.push }),
  onBeforeRouteLeave: guard => { context.leaveGuard = guard },
  onBeforeRouteUpdate: guard => { context.updateGuard = guard },
}
const scopes = []
const clone = value => JSON.parse(JSON.stringify(value))

// Run the actual setup and shared owner, replacing only router and browser adapters.
function loadComponent(relativePath) {
  const filename = new URL(`../src/${relativePath}.vue`, import.meta.url)
  const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
  expect(parsed.errors).toEqual([])
  const script = compileScript(parsed.descriptor, { id: relativePath })
  expect(compileTemplate({ source: parsed.descriptor.template.content, filename: filename.pathname, id: relativePath, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  const modules = {
    vue: { ...vue, onMounted: callback => context.mounted.push(callback), onBeforeUnmount: callback => context.unmounted.push(callback) },
    'vue-router': routerHooks,
    'element-plus': feedback,
    '@element-plus/icons-vue': new Proxy({}, { get: () => ({}) }),
    '../data/usePrototypeData.js': { usePrototypeData: () => data },
    '../domain/warehouseQuotes.js': warehouseQuotes,
    '../data/warehouseQuoteActions.js': warehouseQuoteActions,
  }
  const imported = { defineProps: () => context.props }
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
    context.props = reactive(props)
    const scope = effectScope()
    scopes.push(scope)
    return scope.run(() => run(...Object.values(imported)))
  }
}
const setupQuotes = loadComponent('views/WarehouseQuotesView')
const setupTable = loadComponent('components/DataTableFrame')

function setup() {
  context.route = reactive({ path: '/foundation/warehouse-quotes', query: {} })
  return setupQuotes()
}
function validDraft(overrides = {}) {
  return {
    ...warehouseQuotes.createWarehouseQuoteDraft(),
    partnerId: 'PT-00022', taxRate: '6.25', currency: 'CNY', subject: '改标签',
    amount: '12.50', unit: '次', chargeMethod: '其他',
    startDate: '2026-09-08', endDate: '2026-09-30', remark: '合成仓库报价备注',
    ...overrides,
  }
}
async function fill(view, overrides = {}) {
  await view.open('create')
  Object.assign(view.draft.value, validDraft(overrides))
  return view.draft.value
}

beforeEach(() => {
  data.reset()
  data.selectWorkbenchPersona('hangsheng')
  context.confirm.mockReset().mockResolvedValue('confirm')
  context.push.mockReset()
  context.leaveGuard = null
  context.updateGuard = null
  context.mounted = []
  context.unmounted = []
  for (const fn of Object.values(feedback.ElMessage)) fn.mockReset()
})

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.unstubAllGlobals()
})

describe('GJ-006 完整报价字段与保存', () => {
  it('新增覆盖十个维护字段，默认生效日期且未填写时不消耗编号', async () => {
    const view = setup()
    await view.open('create')
    expect(unref(view.fields).map(field => field.key)).toEqual(Object.keys(warehouseQuotes.createWarehouseQuoteDraft()))
    expect(view.draft.value.startDate).toBe(warehouseQuotes.WAREHOUSE_QUOTE_TODAY)
    expect(view.dirty.value).toBe(false)
    expect(view.errors.value).toMatchObject({ partnerId: expect.any(String), taxRate: expect.any(String), currency: expect.any(String), subject: expect.any(String), amount: expect.any(String), unit: expect.any(String), chargeMethod: expect.any(String), endDate: expect.any(String) })
    const before = JSON.stringify(data.state.warehouseQuotes)
    const sequence = data.state.warehouseQuoteSequence
    expect(await view.save()).toBe(false)
    expect(JSON.stringify(data.state.warehouseQuotes)).toBe(before)
    expect(data.state.warehouseQuoteSequence).toBe(sequence)
    expect(view.mode.value).toBe('create')
  })

  it('十字段提交写入唯一列表，编辑草稿不提前影响已保存对象', async () => {
    const view = setup()
    const count = view.rows.value.length
    const payload = clone(await fill(view))
    expect(view.errors.value).toEqual({})
    expect(view.rows.value).toHaveLength(count)
    expect(await view.save()).toBe(true)
    expect(view.mode.value).toBe('')
    expect(view.rows.value).toHaveLength(count + 1)
    expect(feedback.ElMessage.success).toHaveBeenLastCalledWith('保存成功')
    const saved = data.state.warehouseQuotes.find(row => row.partnerId === payload.partnerId && row.subject === payload.subject)
    expect(saved).toMatchObject({ ...payload, manualDisabled: false, updatedBy: data.groundSession.name })
    expect(saved.id).toMatch(/^WQ-\d{8}$/)
    await view.open('edit', saved)
    Object.assign(view.draft.value, { subject: '拆托费', amount: '30.75', unit: '托', chargeMethod: '常规', startDate: '2026-09-09', endDate: '2026-10-15', remark: '' })
    expect(saved).toMatchObject(payload)
    expect(view.errors.value).toEqual({})
    expect(await view.save()).toBe(true)
    expect(saved).toMatchObject({ subject: '拆托费', amount: '30.75', unit: '托', chargeMethod: '常规', startDate: '2026-09-09', endDate: '2026-10-15', remark: '' })
    expect(warehouseQuotes.deriveWarehouseQuoteStatus(saved)).toBe('待生效')
  })

  it('客户、税率和币种在编辑配置与提交校验中共同锁定', async () => {
    const view = setup()
    const saved = data.saveWarehouseQuote(validDraft())
    await view.open('edit', saved)
    expect(unref(view.fields).filter(field => field.locked).map(field => field.key)).toEqual(['partnerId', 'taxRate', 'currency'])
    Object.assign(view.draft.value, { partnerId: 'PT-00019', taxRate: '7', currency: 'USD' })
    const before = JSON.stringify(data.state.warehouseQuotes)
    expect(view.errors.value).toMatchObject({ partnerId: expect.stringContaining('不可修改'), taxRate: expect.stringContaining('不可修改'), currency: expect.stringContaining('不可修改') })
    expect(await view.save()).toBe(false)
    expect(JSON.stringify(data.state.warehouseQuotes)).toBe(before)
    expect(view.mode.value).toBe('edit')
  })

  it('详情保留所有字段，但详情和已关闭表单均不能写回', async () => {
    const view = setup()
    const saved = data.saveWarehouseQuote(validDraft())
    const before = JSON.stringify(saved)
    await view.open('detail', saved)
    expect(view.readonly.value).toBe(true)
    expect(view.draft.value).toEqual(saved)
    view.draft.value.remark = '详情不应保存的改动'
    expect(await view.save()).toBe(false)
    expect(JSON.stringify(saved)).toBe(before)
    await view.close()
    expect(await view.save()).toBe(false)
    expect(JSON.stringify(saved)).toBe(before)
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
  })

  it('超限税率、金额小数和备注同时提示，修正后可保存', async () => {
    const view = setup()
    await fill(view, { taxRate: '100.01', amount: '1.234', remark: '测'.repeat(201) })
    const before = JSON.stringify(data.state.warehouseQuotes)
    expect(view.errors.value).toMatchObject({ taxRate: expect.any(String), amount: expect.any(String), remark: expect.any(String) })
    expect(await view.save()).toBe(false)
    expect(JSON.stringify(data.state.warehouseQuotes)).toBe(before)
    Object.assign(view.draft.value, { taxRate: '100.00', amount: '0', remark: '测'.repeat(200) })
    expect(view.errors.value).toEqual({})
    expect(await view.save()).toBe(true)
  })

  it('同客户同科目期间重叠拒绝，人工失效报价的去重范围标为待确认', async () => {
    const view = setup()
    const existing = data.state.warehouseQuotes[0]
    await fill(view, { partnerId: existing.partnerId, subject: existing.subject, startDate: '2026-09-15', endDate: '2026-10-15' })
    const before = JSON.stringify(data.state.warehouseQuotes)
    expect(view.errors.value.endDate).toBe('已存在报价，请勿重复添加')
    expect(await view.save()).toBe(false)
    const disabled = data.state.warehouseQuotes.find(row => row.manualDisabled)
    Object.assign(view.draft.value, { partnerId: disabled.partnerId, subject: disabled.subject })
    expect(view.errors.value.endDate).toContain('待确认')
    expect(await view.save()).toBe(false)
    expect(JSON.stringify(data.state.warehouseQuotes)).toBe(before)
  })

  it('免租期和日期相接待确认范围不被页面保存绕过', async () => {
    const view = setup()
    await fill(view, { subject: '免租期' })
    const before = JSON.stringify(data.state.warehouseQuotes)
    expect(view.errors.value.subject).toContain('待确认')
    expect(await view.save()).toBe(false)
    Object.assign(view.draft.value, { partnerId: 'PT-00018', subject: '卸载操作费', startDate: '2026-09-30', endDate: '2026-10-31' })
    expect(view.errors.value.endDate).toContain('待确认')
    expect(await view.save()).toBe(false)
    expect(JSON.stringify(data.state.warehouseQuotes)).toBe(before)
  })
})

describe('GJ-006 草稿处理与权限', () => {
  it('切换记录选择保存后，先提交原草稿再打开目标', async () => {
    const view = setup()
    await fill(view)
    const target = data.state.warehouseQuotes[0]
    const count = data.state.warehouseQuotes.length
    await view.open('edit', target)
    expect(context.confirm).toHaveBeenCalledOnce()
    expect(data.state.warehouseQuotes).toHaveLength(count + 1)
    expect(view.mode.value).toBe('edit')
    expect(view.selectedId.value).toBe(target.id)
    expect(view.draft.value).toEqual(target)
  })

  it('切换记录选择不保存后丢弃草稿，选择继续编辑则保持原草稿', async () => {
    const view = setup()
    await fill(view)
    const original = clone(view.draft.value)
    const target = data.state.warehouseQuotes[0]
    const before = JSON.stringify(data.state.warehouseQuotes)
    context.confirm.mockRejectedValueOnce('close')
    await view.open('edit', target)
    expect(view.mode.value).toBe('create')
    expect(view.draft.value).toEqual(original)
    context.confirm.mockRejectedValueOnce('cancel')
    await view.open('edit', target)
    expect(view.mode.value).toBe('edit')
    expect(view.selectedId.value).toBe(target.id)
    expect(view.draft.value).toEqual(target)
    expect(JSON.stringify(data.state.warehouseQuotes)).toBe(before)
  })

  it('切换选择保存但校验失败时留在原草稿，不打开另一个对象', async () => {
    const view = setup()
    await fill(view, { amount: '' })
    const before = JSON.stringify(data.state.warehouseQuotes)
    await view.open('edit', data.state.warehouseQuotes[0])
    expect(view.mode.value).toBe('create')
    expect(view.draft.value.amount).toBe('')
    expect(view.errors.value.amount).toBeTruthy()
    expect(JSON.stringify(data.state.warehouseQuotes)).toBe(before)
  })

  it('新增意图可在明确丢弃当前输入后重置独立草稿', async () => {
    const view = setup()
    await fill(view)
    context.confirm.mockRejectedValueOnce('cancel')
    await view.open('create')
    expect(view.mode.value).toBe('create')
    expect(view.draft.value).toEqual(warehouseQuotes.createWarehouseQuoteDraft())
    expect(view.dirty.value).toBe(false)
    expect(data.state.warehouseQuotes).toHaveLength(4)
  })

  it('切换草稿确认期间重置数据，旧保存意图不能写入重置后的数据源', async () => {
    const view = setup()
    await fill(view)
    let confirm
    context.confirm.mockImplementationOnce(() => new Promise(resolve => { confirm = resolve }))
    const pending = view.open('edit', data.state.warehouseQuotes[0])
    data.reset()
    await nextTick()
    data.selectWorkbenchPersona('hangsheng')
    await nextTick()
    const before = JSON.stringify(data.state.warehouseQuotes)
    confirm('confirm')
    await pending
    expect(JSON.stringify(data.state.warehouseQuotes)).toBe(before)
    expect(view.mode.value).toBe('')
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
  })

  it('取消关闭保留输入，确认丢弃后重新打开读取已保存值', async () => {
    const view = setup()
    const saved = data.state.warehouseQuotes[0]
    await view.open('edit', saved)
    view.draft.value.remark = '未保存的仓库报价'
    const done = vi.fn()
    context.confirm.mockRejectedValueOnce('cancel')
    await view.close(done)
    expect(view.mode.value).toBe('edit')
    expect(view.draft.value.remark).toBe('未保存的仓库报价')
    expect(done).not.toHaveBeenCalled()
    await view.close(done)
    expect(view.mode.value).toBe('')
    expect(done).toHaveBeenCalledOnce()
    await view.open('edit', saved)
    expect(view.draft.value.remark).toBe(saved.remark)
    expect(view.dirty.value).toBe(false)
  })

  it('浏览器卸载和路由离开保护脏草稿，确认执行期间禁止再次操作', async () => {
    const view = setup()
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    view.beforeUnload(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    await fill(view)
    view.beforeUnload(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe('')
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.leaveGuard()).toBe(false)
    view.busy.value = true
    const calls = context.confirm.mock.calls.length
    await view.close()
    expect(await context.leaveGuard()).toBe(false)
    expect(context.confirm).toHaveBeenCalledTimes(calls)
    expect(view.mode.value).toBe('create')
    view.busy.value = false
    expect(await context.leaveGuard()).toBe(true)
  })

  it('浏览器离开监听注册与销毁对称', () => {
    const browserWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('window', browserWindow)
    const view = setup()
    context.mounted.forEach(callback => callback())
    context.unmounted.forEach(callback => callback())
    expect(browserWindow.addEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
    expect(browserWindow.removeEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
  })

  it('路由离开确认期间数据源重置，即使恢复原角色也取消旧离开意图', async () => {
    const view = setup()
    await fill(view)
    let confirm
    context.confirm.mockImplementationOnce(() => new Promise(resolve => { confirm = resolve }))
    const pending = context.leaveGuard()
    data.reset()
    await nextTick()
    data.selectWorkbenchPersona('hangsheng')
    await nextTick()
    confirm('confirm')
    expect(await pending).toBe(false)
    expect(view.busy.value).toBe(false)
  })

  it.each(['hangsheng', 'groundSupervisor'])('%s 可维护，角色切换后旧草稿不能提交', async persona => {
    data.selectWorkbenchPersona(persona)
    const view = setup()
    await fill(view)
    const before = JSON.stringify(data.state.warehouseQuotes)
    data.selectWorkbenchPersona('service')
    expect(await view.save()).toBe(false)
    await nextTick()
    expect(view.mode.value).toBe('')
    await view.open('create')
    await view.open('edit', data.state.warehouseQuotes[0])
    await view.toggle(data.state.warehouseQuotes[0])
    await view.remove(data.state.warehouseQuotes[0])
    expect(view.mode.value).toBe('')
    expect(context.confirm).not.toHaveBeenCalled()
    expect(JSON.stringify(data.state.warehouseQuotes)).toBe(before)
    await view.open('detail', data.state.warehouseQuotes[0])
    expect(view.mode.value).toBe('detail')
  })
})

describe('GJ-006 查询、状态、删除与上下文', () => {
  it('客户与科目查询先暂存，提交和重置同步控制同一结果区', () => {
    const view = setup()
    const count = view.rows.value.length
    view.filters.value.partnerId = 'PT-00018'
    view.filters.value.subject = '卸载操作费'
    expect(view.rows.value).toHaveLength(count)
    view.query()
    expect(view.applied.value).toEqual({ partnerId: 'PT-00018', subject: '卸载操作费' })
    expect(view.rows.value.map(row => row.id)).toEqual(['WQ-00000001'])
    view.filters.value.subject = '改标签'
    expect(view.rows.value).toHaveLength(1)
    view.query()
    expect(view.rows.value).toHaveLength(0)
    view.resetQuery()
    expect(view.filters.value).toEqual({ partnerId: '', subject: '' })
    expect(view.applied.value).toEqual({ partnerId: '', subject: '' })
    expect(view.rows.value).toHaveLength(count)
  })

  it('停用取消不改状态，确认失效后可再次启用同一记录', async () => {
    const view = setup()
    const saved = data.state.warehouseQuotes[0]
    const before = JSON.stringify(saved)
    context.confirm.mockRejectedValueOnce('cancel')
    await view.toggle(saved)
    expect(JSON.stringify(saved)).toBe(before)
    await view.toggle(saved)
    expect(saved.manualDisabled).toBe(true)
    expect(warehouseQuotes.deriveWarehouseQuoteStatus(saved)).toBe('失效')
    await view.toggle(saved)
    expect(saved.manualDisabled).toBe(false)
    expect(warehouseQuotes.deriveWarehouseQuoteStatus(saved)).toBe('生效')
    expect(view.busy.value).toBe(false)
  })

  it('未来和过期报价不能通过直接调用绕过启停条件', async () => {
    const view = setup()
    const future = data.state.warehouseQuotes.find(row => warehouseQuotes.deriveWarehouseQuoteStatus(row) === '待生效')
    const expired = data.state.warehouseQuotes.find(row => row.endDate < warehouseQuotes.WAREHOUSE_QUOTE_TODAY)
    const before = JSON.stringify(data.state.warehouseQuotes)
    await view.toggle(future)
    await view.toggle(expired)
    expect(JSON.stringify(data.state.warehouseQuotes)).toBe(before)
    expect(context.confirm).not.toHaveBeenCalled()
  })

  it('删除取消不写入，确认只移除目标记录', async () => {
    const view = setup()
    const saved = data.saveWarehouseQuote(validDraft())
    const before = JSON.stringify(data.state.warehouseQuotes)
    context.confirm.mockRejectedValueOnce('cancel')
    await view.remove(saved)
    expect(JSON.stringify(data.state.warehouseQuotes)).toBe(before)
    await view.remove(saved)
    expect(data.state.warehouseQuotes.some(row => row.id === saved.id)).toBe(false)
    expect(data.state.warehouseQuotes).toHaveLength(4)
    expect(feedback.ElMessage.success).toHaveBeenLastCalledWith('删除成功')
  })

  it.each(['remove', 'toggle'])('%s 确认期间切换到同样可维护的角色，旧请求不能写入新上下文', async action => {
    const view = setup()
    const saved = data.state.warehouseQuotes[0]
    let confirm
    context.confirm.mockImplementationOnce(() => new Promise(resolve => { confirm = resolve }))
    const before = JSON.stringify(data.state.warehouseQuotes)
    const pending = view[action](saved)
    expect(view.busy.value).toBe(true)
    await view[action](saved)
    expect(context.confirm).toHaveBeenCalledOnce()
    data.selectWorkbenchPersona('groundSupervisor')
    await nextTick()
    confirm('confirm')
    await pending
    expect(JSON.stringify(data.state.warehouseQuotes)).toBe(before)
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
    expect(view.busy.value).toBe(false)
  })

  it.each(['remove', 'toggle'])('%s 确认期间重置并回到原角色，旧请求不能修改同ID的新记录', async action => {
    const view = setup()
    const saved = data.state.warehouseQuotes[0]
    let confirm
    context.confirm.mockImplementationOnce(() => new Promise(resolve => { confirm = resolve }))
    const pending = view[action](saved)
    data.reset()
    await nextTick()
    data.selectWorkbenchPersona('hangsheng')
    await nextTick()
    const before = JSON.stringify(data.state.warehouseQuotes)
    expect(data.state.warehouseQuotes[0]).not.toBe(saved)
    confirm('confirm')
    await pending
    expect(JSON.stringify(data.state.warehouseQuotes)).toBe(before)
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
    expect(view.busy.value).toBe(false)
  })

  it('详情来源移除后关闭旧对象并告知记录已不存在', async () => {
    const view = setup()
    const saved = data.state.warehouseQuotes[0]
    await view.open('detail', saved)
    data.deleteWarehouseQuote(saved.id)
    await nextTick()
    expect(view.mode.value).toBe('')
    expect(view.selectedId.value).toBe('')
    expect(feedback.ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('已不存在'))
  })

  it('仓库报价引用阻止删除客户档案，不产生悬空客户引用', () => {
    const view = setup()
    const quote = data.saveWarehouseQuote(validDraft())
    data.selectWorkbenchPersona('finance')
    data.setPartnerActive(quote.partnerId, false)
    const before = JSON.stringify(data.state)
    expect(() => data.deletePartner(quote.partnerId)).toThrow('仓库报价引用')
    expect(JSON.stringify(data.state)).toBe(before)
    expect(view.partyName(quote.partnerId)).not.toBe('档案不可用')
  })

  it('演示重置恢复四条确定报价并清除编辑草稿', async () => {
    const view = setup()
    data.saveWarehouseQuote(validDraft())
    await view.open('edit', data.state.warehouseQuotes[0])
    view.draft.value.remark = '重置前的草稿'
    data.reset()
    await nextTick()
    expect(data.state.warehouseQuotes).toEqual(warehouseQuotes.createWarehouseQuoteSeed())
    expect(data.state.warehouseQuoteSequence).toBe(4)
    expect(view.mode.value).toBe('')
    expect(view.rows.value).toHaveLength(4)
  })

  it('复用十条默认分页，页大小和结果缩小时保持有效页码', async () => {
    const rows = Array.from({ length: 23 }, (_, index) => ({ id: `WAREHOUSE-QUOTE-${index + 1}` }))
    const table = setupTable({ rows, pageSize: 10, pageSizes: [10, 20, 50], selectedCount: 0, selectable: false })
    expect(table.pageRows.value).toEqual(rows.slice(0, 10))
    table.page.value = 3
    expect(table.pageRows.value).toEqual(rows.slice(20))
    table.size.value = 20
    await nextTick()
    expect(table.page.value).toBe(1)
    expect(table.pageRows.value).toHaveLength(20)
    table.page.value = 2
    context.props.rows = rows.slice(0, 3)
    await nextTick()
    expect(table.page.value).toBe(1)
    expect(table.pageRows.value).toEqual(rows.slice(0, 3))
  })
})
