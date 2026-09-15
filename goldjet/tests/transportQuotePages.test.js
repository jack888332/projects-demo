import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, nextTick, reactive } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as transportQuotes from '../src/domain/transportQuotes.js'
import * as transportQuoteActions from '../src/data/transportQuoteActions.js'

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
    '../domain/transportQuotes.js': transportQuotes,
    '../data/transportQuoteActions.js': transportQuoteActions,
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
const setupQuotes = loadComponent('views/TransportQuotesView')
const setupTable = loadComponent('components/DataTableFrame')

function setup(kind = 'supplier') {
  context.route = reactive({ path: '/foundation/transport-quotes', query: { tab: kind } })
  return setupQuotes()
}
function validDraft(kind = 'supplier', variant = 0) {
  return {
    ...transportQuotes.createTransportQuoteDraft(kind),
    partnerId: kind === 'supplier' ? 'PT-00031' : 'PT-00018', taxRate: '6.25', currency: 'CNY',
    pickup: { province: '上海市', city: '上海市', district: '浦东新区', address: '合成提货地点' },
    delivery: { province: '江苏省', city: '苏州市', district: '吴中区', address: '合成卸货地点' },
    vehicleType: ['4.2车', '6.8车', '7.6车'][variant], transportType: '往返', regulated: '是',
    tailLift: '是', specialVehicle: '冷藏车', transitHours: '4.5', chargeMode: 'fixed',
    transportFee: '1280.50', startPrice: '800.50', waitingFee: '120.5', returnRate: '20.25',
    startDate: '2026-10-01', endDate: '2026-10-30', remark: '合成页面报价',
  }
}
function fillSingle(view, kind = 'supplier', variant = 0) {
  view.open('create')
  Object.assign(view.draftRows.value[0], validDraft(kind, variant))
  view.clearEmptyRows()
  return view.draftRows.value[0]
}

beforeEach(() => {
  data.reset()
  data.selectWorkbenchPersona('hangsheng')
  context.confirm.mockReset().mockResolvedValue('confirm')
  context.push.mockReset()
  context.mounted = []
  context.unmounted = []
  for (const fn of Object.values(feedback.ElMessage)) fn.mockReset()
})

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.unstubAllGlobals()
})

describe('GJ-005 手工报价行和完整保存', () => {
  it.each(['supplier', 'customer'])('%s 新增默认十条独立草稿，空行删除后仍可继续新增', kind => {
    const view = setup(kind)
    view.open('create')
    expect(view.draftRows.value).toHaveLength(10)
    expect(view.draftRows.value.every(row => row.startDate === transportQuotes.TRANSPORT_QUOTE_TODAY)).toBe(true)
    expect(view.dirty.value).toBe(false)
    view.draftRows.value[0].pickup.province = '上海市'
    expect(view.draftRows.value[1].pickup.province).toBe('')
    view.clearEmptyRows()
    expect(view.draftRows.value).toHaveLength(1)
    expect(view.draftRows.value[0].pickup.province).toBe('上海市')
    view.deleteRow(0)
    expect(view.draftRows.value).toHaveLength(0)
    expect(view.draft.value).toBeUndefined()
    const before = JSON.stringify(data.state.transportQuotes)
    view.submit()
    expect(JSON.stringify(data.state.transportQuotes)).toBe(before)
    view.addRow()
    expect(view.draftRows.value).toHaveLength(1)
    expect(view.activeIndex.value).toBe(0)
  })

  it('复制与粘贴生成独立嵌套草稿，删除当前末行保持有效选中项', () => {
    const view = setup()
    view.open('create')
    Object.assign(view.draftRows.value[0], validDraft())
    view.copyRow(0)
    view.draftRows.value[0].pickup.address = '复制后的源行地址'
    view.pasteRow(1)
    expect(view.draftRows.value[1].pickup.address).toBe('合成提货地点')
    view.draftRows.value[1].pickup.address = '粘贴行独立改写'
    expect(view.clipboard.value.pickup.address).toBe('合成提货地点')
    expect(view.draftRows.value[0].pickup.address).toBe('复制后的源行地址')
    view.activeIndex.value = 9
    view.contextIndex.value = 9
    view.deleteRow(9)
    expect(view.activeIndex.value).toBe(8)
    expect(view.contextIndex.value).toBeNull()
    expect(view.draft.value).toBe(view.draftRows.value[8])
  })

  it.each(['supplier', 'customer'])('%s 保存完整报价到同一列表，编辑草稿不提前写入', async kind => {
    const view = setup(kind)
    const count = view.rows.value.length
    const payload = clone(fillSingle(view, kind))
    expect(view.rowErrors.value).toEqual([])
    expect(view.rows.value).toHaveLength(count)
    view.submit()
    expect(view.mode.value).toBe('')
    expect(view.rows.value).toHaveLength(count + 1)
    expect(feedback.ElMessage.success).toHaveBeenLastCalledWith('已提交成功！')
    const saved = data.state.transportQuotes.find(row => row.kind === kind && row.vehicleType === payload.vehicleType)
    expect(saved).toMatchObject({ ...payload, updatedBy: data.groundSession.name })
    expect(saved.id).toMatch(/^TQ[SC]-\d{8}$/)
    view.open('edit', saved)
    view.draft.value.remark = '已修改合成备注'
    view.draft.value.delivery.address = '已修改合成卸货地点'
    expect(saved.remark).toBe(payload.remark)
    expect(saved.delivery.address).toBe(payload.delivery.address)
    expect(view.rowErrors.value).toEqual([])
    view.submit()
    expect(saved).toMatchObject({ remark: '已修改合成备注', delivery: { address: '已修改合成卸货地点' } })
    expect(view.mode.value).toBe('')
    view.open('detail', saved)
    expect(view.readonly.value).toBe(true)
    expect(view.draft.value).toEqual(saved)
    view.draft.value.remark = '不应保存的详情修改'
    view.submit()
    expect(saved.remark).toBe('已修改合成备注')
    await view.close()
    view.submit()
    expect(saved.remark).toBe('已修改合成备注')
  })

  it('不完整行或批内重叠报价均整体拒绝，保留所有输入且不消耗编号', () => {
    const view = setup()
    view.open('create')
    Object.assign(view.draftRows.value[0], validDraft())
    const before = JSON.stringify(data.state.transportQuotes)
    const sequence = data.state.transportQuoteSequence
    expect(view.rowErrors.value).toHaveLength(9)
    view.submit()
    expect(JSON.stringify(data.state.transportQuotes)).toBe(before)
    view.clearEmptyRows()
    view.copyRow(0)
    view.addRow()
    view.pasteRow(1)
    expect(view.rowErrors.value).toHaveLength(2)
    expect(view.rowErrors.value.every(row => row.fields.endDate.includes('重复'))).toBe(true)
    view.submit()
    expect(view.mode.value).toBe('create')
    expect(view.draftRows.value).toHaveLength(2)
    expect(JSON.stringify(data.state.transportQuotes)).toBe(before)
    expect(data.state.transportQuoteSequence).toBe(sequence)
    view.draftRows.value[1].vehicleType = '6.8车'
    expect(view.rowErrors.value).toEqual([])
    view.submit()
    expect(data.state.transportQuotes).toHaveLength(JSON.parse(before).length + 2)
  })

  it.each(['supplier', 'customer'])('%s 修改时合作方、税率、币种、特种车受页面配置与所有者共同保护', kind => {
    const view = setup(kind)
    const [saved] = data.saveTransportQuotes(kind, [validDraft(kind)])
    view.open('edit', saved)
    expect(view.fields.value.filter(field => field.locked).map(field => field.key)).toEqual(['partnerId', 'taxRate', 'currency', 'specialVehicle'])
    const before = JSON.stringify(data.state.transportQuotes)
    view.draft.value.taxRate = '7'
    view.draft.value.currency = 'USD'
    view.draft.value.specialVehicle = '危险品'
    expect(view.errors.value).toMatchObject({ taxRate: expect.stringContaining('不可修改'), currency: expect.stringContaining('不可修改'), specialVehicle: expect.stringContaining('不可修改') })
    view.submit()
    expect(view.mode.value).toBe('edit')
    expect(JSON.stringify(data.state.transportQuotes)).toBe(before)
  })

  it('收费模式切换清除隐藏的互斥金额，选定模式的字段可完成保存', () => {
    const view = setup('customer')
    fillSingle(view, 'customer')
    view.draft.value.chargeMode = 'unit'
    view.changeChargeMode()
    expect(view.draft.value.transportFee).toBe('')
    view.draft.value.unitPrice = '2.35'
    view.draft.value.unit = '元/kg'
    expect(view.rowErrors.value).toEqual([])
    expect(view.priceFields.value.map(field => field.key)).toContain('unitPrice')
    view.draft.value.chargeMode = 'fixed'
    view.changeChargeMode()
    expect(view.draft.value).toMatchObject({ unitPrice: '', unit: '' })
    view.draft.value.transportFee = '1234.50'
    expect(view.rowErrors.value).toEqual([])
    view.submit()
    expect(data.state.transportQuotes.at(-1)).toMatchObject({ chargeMode: 'fixed', unitPrice: '', unit: '', transportFee: '1234.50' })
  })

  it('省市联动清理旧城市和区，候选与已生效合作方来自唯一数据源', () => {
    const view = setup()
    fillSingle(view)
    expect(view.partners.value.every(row => row.type === '供应商' && ['已生效', '有效'].includes(row.status))).toBe(true)
    const point = view.draft.value.pickup
    point.province = '江苏省'
    view.changeLocation(point, 'province')
    expect(point).toMatchObject({ province: '江苏省', city: '', district: '' })
    expect(view.cities(point).map(row => row.value)).toContain('苏州市')
    point.city = '苏州市'
    view.changeLocation(point, 'city')
    expect(view.districts(point).map(row => row.value)).toContain('吴中区')
    const partner = data.state.partners.find(row => row.id === view.draft.value.partnerId)
    partner.status = '已失效'
    expect(view.partners.value.some(row => row.id === partner.id)).toBe(false)
    expect(view.errors.value.partnerId).toContain('已生效')
  })
})

describe('GJ-005 草稿与权限边界', () => {
  it('取消放弃保留草稿，确认放弃不写入，重新打开还原已保存值', async () => {
    const view = setup()
    const saved = data.state.transportQuotes[0]
    view.open('edit', saved)
    view.draft.value.remark = '尚未保存的报价备注'
    const done = vi.fn()
    context.confirm.mockRejectedValueOnce('cancel')
    await view.close(done)
    expect(view.mode.value).toBe('edit')
    expect(view.draft.value.remark).toBe('尚未保存的报价备注')
    expect(done).not.toHaveBeenCalled()
    await view.close(done)
    expect(view.mode.value).toBe('')
    expect(done).toHaveBeenCalledOnce()
    view.open('edit', saved)
    expect(view.draft.value.remark).toBe(saved.remark)
    expect(view.dirty.value).toBe(false)
  })

  it('另一个打开意图不能覆盖活动草稿，编辑和详情没有批量行操作', () => {
    const view = setup()
    const saved = data.state.transportQuotes[0]
    view.open('edit', saved)
    view.draft.value.remark = '保持当前草稿'
    view.open('create')
    view.open('detail', data.state.transportQuotes[1])
    view.addRow()
    view.deleteRow(0)
    view.clearEmptyRows()
    view.copyRow(0)
    view.pasteRow(0)
    expect(view.mode.value).toBe('edit')
    expect(view.draftRows.value).toHaveLength(1)
    expect(view.draft.value).toMatchObject({ id: saved.id, remark: '保持当前草稿' })
    expect(view.clipboard.value).toBeNull()
  })

  it('路由更新、离开与浏览器卸载保护未保存报价；操作期间禁止离开', async () => {
    const view = setup()
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    view.beforeUnload(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    fillSingle(view)
    view.beforeUnload(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe('')
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.leaveGuard()).toBe(false)
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.updateGuard()).toBe(false)
    view.busy.value = true
    const confirmations = context.confirm.mock.calls.length
    await view.close()
    expect(await context.leaveGuard()).toBe(false)
    expect(await context.updateGuard()).toBe(false)
    expect(context.confirm).toHaveBeenCalledTimes(confirmations)
    expect(view.mode.value).toBe('create')
    view.busy.value = false
    expect(await context.updateGuard()).toBe(true)
    context.route.query = { tab: 'customer' }
    await nextTick()
    expect(view.mode.value).toBe('')
    expect(view.kind.value).toBe('customer')
  })

  it('挂载和销毁对称注册浏览器离开保护', () => {
    const browserWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('window', browserWindow)
    const view = setup()
    context.mounted.forEach(callback => callback())
    context.unmounted.forEach(callback => callback())
    expect(browserWindow.addEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
    expect(browserWindow.removeEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
  })

  it('角色改变清除草稿与隐藏选择，只读角色不能直接调用写操作', async () => {
    const view = setup()
    fillSingle(view)
    view.table.value = { clearSelection: vi.fn() }
    view.selectedIds.value = [data.state.transportQuotes[0].id]
    const before = JSON.stringify(data.state.transportQuotes)
    data.selectWorkbenchPersona('service')
    view.submit()
    await nextTick()
    expect(view.mode.value).toBe('')
    expect(view.selectedIds.value).toEqual([])
    expect(view.table.value.clearSelection).toHaveBeenCalled()
    view.open('create')
    view.open('edit', data.state.transportQuotes[0])
    await view.remove([data.state.transportQuotes[0].id])
    expect(view.mode.value).toBe('')
    expect(context.confirm).not.toHaveBeenCalled()
    expect(JSON.stringify(data.state.transportQuotes)).toBe(before)
    view.open('detail', data.state.transportQuotes[0])
    expect(view.mode.value).toBe('detail')
  })
})

describe('GJ-005 查询、删除和引用保护', () => {
  it.each(['supplier', 'customer'])('%s 查询先暂存条件，提交与重置同步结果和隐藏选择', async kind => {
    const view = setup(kind)
    data.saveTransportQuotes(kind, [validDraft(kind)])
    view.table.value = { clearSelection: vi.fn() }
    const count = view.rows.value.length
    view.filters.value.vehicleType = '4.2车'
    view.selectedIds.value = [view.rows.value[0].id]
    expect(view.rows.value).toHaveLength(count)
    view.query()
    await nextTick()
    expect(view.rows.value).toHaveLength(1)
    expect(view.rows.value[0].vehicleType).toBe('4.2车')
    expect(view.selectedIds.value).toEqual([])
    expect(view.table.value.clearSelection).toHaveBeenCalled()
    view.filters.value.keyword = '不匹配报价'
    expect(view.rows.value).toHaveLength(1)
    view.query()
    expect(view.rows.value).toHaveLength(0)
    view.resetQuery()
    expect(view.filters.value.keyword).toBe('')
    expect(view.applied.value.vehicleType).toBe('')
    expect(view.rows.value).toHaveLength(count)
  })

  it('客户报价ID精确匹配，供应商名称模糊匹配', async () => {
    const view = setup()
    const supplier = data.state.partners.find(row => row.id === view.rows.value[0].partnerId)
    view.filters.value.keyword = supplier.name.slice(0, 2)
    view.query()
    expect(view.rows.value).toHaveLength(1)
    context.route.query = { tab: 'customer' }
    await nextTick()
    const id = view.rows.value[0].id
    view.filters.value.keyword = id.slice(0, -1)
    view.query()
    expect(view.rows.value).toHaveLength(0)
    view.filters.value.keyword = id
    view.query()
    expect(view.rows.value.map(row => row.id)).toEqual([id])
  })

  it('批量删除取消不改变数据，确认后删除指定类别记录并清空选择', async () => {
    const view = setup()
    const created = data.saveTransportQuotes('supplier', [validDraft(), validDraft('supplier', 1)])
    const ids = created.map(row => row.id)
    view.selectedIds.value = ids
    view.table.value = { clearSelection: vi.fn() }
    const before = JSON.stringify(data.state.transportQuotes)
    context.confirm.mockRejectedValueOnce('cancel')
    await view.remove(ids)
    expect(JSON.stringify(data.state.transportQuotes)).toBe(before)
    expect(view.selectedIds.value).toEqual(ids)
    await view.remove(ids)
    expect(data.state.transportQuotes.some(row => ids.includes(row.id))).toBe(false)
    expect(data.state.transportQuotes.some(row => row.kind === 'customer')).toBe(true)
    expect(view.selectedIds.value).toEqual([])
    expect(view.table.value.clearSelection).toHaveBeenCalled()
    expect(feedback.ElMessage.success).toHaveBeenLastCalledWith('删除成功')
  })

  it.each(['kind', 'role'])('确认删除期间 %s 改变不能作用于新上下文', async change => {
    const view = setup()
    const id = view.rows.value[0].id
    let confirm
    context.confirm.mockImplementationOnce(() => new Promise(resolve => { confirm = resolve }))
    const pending = view.remove([id])
    expect(view.busy.value).toBe(true)
    await view.remove([id])
    expect(context.confirm).toHaveBeenCalledOnce()
    if (change === 'kind') context.route.query = { tab: 'customer' }
    else data.selectWorkbenchPersona('service')
    await nextTick()
    confirm('confirm')
    await pending
    expect(data.state.transportQuotes.some(row => row.id === id)).toBe(true)
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
    expect(view.busy.value).toBe(false)
  })

  it('删除使用确认前快照，等待期间原选择数组变化不扩大删除范围', async () => {
    const view = setup()
    const [created] = data.saveTransportQuotes('supplier', [validDraft()])
    const seedId = view.rows.value.find(row => row.id !== created.id).id
    const ids = [created.id]
    let confirm
    context.confirm.mockImplementationOnce(() => new Promise(resolve => { confirm = resolve }))
    const pending = view.remove(ids)
    ids.push(seedId)
    confirm('confirm')
    await pending
    expect(data.state.transportQuotes.some(row => row.id === created.id)).toBe(false)
    expect(data.state.transportQuotes.some(row => row.id === seedId)).toBe(true)
  })

  it('已移除或跨类别的批量目标整体拒绝；详情来源移除后关闭', async () => {
    const view = setup()
    const supplier = view.rows.value[0]
    const customer = data.state.transportQuotes.find(row => row.kind === 'customer')
    const before = JSON.stringify(data.state.transportQuotes)
    await view.remove([supplier.id, customer.id])
    expect(JSON.stringify(data.state.transportQuotes)).toBe(before)
    expect(feedback.ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('当前类别'))
    view.open('detail', supplier)
    await nextTick()
    view.selectedIds.value = [supplier.id]
    data.deleteTransportQuotes('supplier', [supplier.id])
    await nextTick()
    expect(view.mode.value).toBe('')
    expect(view.selectedIds.value).toEqual([])
    expect(feedback.ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('已不存在'))
  })

  it.each(['supplier', 'customer'])('%s 报价引用阻止合作方删除且不留下悬空引用', kind => {
    const view = setup(kind)
    fillSingle(view, kind)
    view.submit()
    const quote = data.state.transportQuotes.at(-1)
    data.selectWorkbenchPersona('finance')
    data.setPartnerActive(quote.partnerId, false)
    const before = JSON.stringify(data.state)
    expect(() => data.deletePartner(quote.partnerId)).toThrow('运输报价引用')
    expect(JSON.stringify(data.state)).toBe(before)
    expect(view.partyName(quote.partnerId)).not.toBe('档案不可用')
  })

  it('十条默认分页、页大小与结果收缩保持当前数据区一致', async () => {
    const rows = Array.from({ length: 23 }, (_, index) => ({ id: `QUOTE-${index + 1}` }))
    const table = setupTable({ rows, pageSize: 10, pageSizes: [10, 20, 50], selectedCount: 0, selectable: true })
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
