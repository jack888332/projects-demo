import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, nextTick } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as airPallets from '../src/domain/airPallets.js'
import * as airCapacity from '../src/domain/airCapacity.js'

const data = usePrototypeData()
const context = { leaveGuard: null, updateGuard: null, mounted: [], unmounted: [], confirm: vi.fn() }
const feedback = { ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: context.confirm } }
const routerHooks = { onBeforeRouteLeave: callback => { context.leaveGuard = callback }, onBeforeRouteUpdate: callback => { context.updateGuard = callback } }
const scopes = []
const filename = new URL('../src/views/AirPalletView.vue', import.meta.url)
const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
const compiled = compileScript(parsed.descriptor, { id: 'AirPalletView' })
const template = parsed.descriptor.template.content
const clone = value => JSON.parse(JSON.stringify(value))
const flightKey = 'FLIGHT-MU9001:2026-09-10'

// Run actual page setup, domain rules and central actions with only UI adapters substituted.
function setup() {
  const modules = {
    vue: { ...vue, onMounted: callback => context.mounted.push(callback), onBeforeUnmount: callback => context.unmounted.push(callback) },
    'vue-router': routerHooks, 'element-plus': feedback, '@element-plus/icons-vue': new Proxy({}, { get: () => ({}) }),
    '../data/usePrototypeData.js': { usePrototypeData: () => data }, '../domain/airCapacity.js': airCapacity, '../domain/airPallets.js': airPallets,
  }
  const imported = {}
  let body = parsed.descriptor.scriptSetup.content
  const imports = compiled.scriptSetupAst.filter(node => node.type === 'ImportDeclaration')
  for (const node of imports) {
    const module = modules[node.source.value] || { default: {} }
    for (const item of node.specifiers) imported[item.local.name] = item.type === 'ImportDefaultSpecifier' ? module.default : module[item.imported.name]
  }
  for (const node of imports.toReversed()) body = body.slice(0, node.start) + body.slice(node.end)
  const run = new Function(...Object.keys(imported), `${body}\nreturn { ${Object.keys(compiled.bindings).join(', ')} }`)
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => run(...Object.values(imported)))
}
function order(overrides = {}) {
  return { id: 'AIR-PAL-001', orderNo: 'GJ-PAL-001', customer: '演示客户甲', creator: '周倩', owner: '李明', foamRatio: 0.3, origin: 'PVG', destination: 'CAN', flight: 'MU9001', departureDate: '2026-09-10', createDate: '2026-09-08', bookingStatus: '服务已完成', waybillNo: '781-90000010', grossWeight: 100, pieces: 10, volume: 25, specialCargo: '锂电池', ...overrides }
}
function select(view) { view.selectCandidates(view.rows.value.filter(row => row.eligible)); view.selectFlight(view.flightRows.value.find(row => row.key === flightKey)) }
function allocate(view) { select(view); expect(view.allocate()).toBe(true); return view.allocatedRows.value[0] }
function delayConfirm() { let resolve; context.confirm.mockImplementationOnce(() => new Promise(done => { resolve = done })); return value => resolve(value) }
async function splitDraft(view) { const row = allocate(view); await view.open('split', row); Object.assign(view.draft.value, { grossWeight: '40', pieces: '4', volume: '10', confirmedInsufficient: true }); return row }

beforeEach(() => {
  data.reset()
  data.selectWorkbenchPersona('operator')
  data.state.airOrders = [order()]
  context.confirm.mockReset().mockResolvedValue('confirm')
  context.leaveGuard = null; context.updateGuard = null; context.mounted = []; context.unmounted = []
  for (const callback of Object.values(feedback.ElMessage)) callback.mockReset()
})
afterEach(() => { for (const scope of scopes.splice(0)) scope.stop(); vi.unstubAllGlobals() })

describe('GJ-008 配板入口和查询', () => {
  it('页面脚本模板可编译，具备十三项共用筛选和三个十条分页结果区', () => {
    expect(parsed.errors).toEqual([])
    expect(compileTemplate({ source: template, filename: filename.pathname, id: 'AirPalletView', compilerOptions: { bindingMetadata: compiled.bindings } }).errors).toEqual([])
    const view = setup()
    expect(Object.keys(view.filters.value)).toEqual(['orderNo', 'waybillNo', 'customer', 'creator', 'foamRatio', 'origin', 'destination', 'owner', 'departureDate', 'createDate', 'flight', 'specialCargo', 'airline'])
    expect(template.match(/:page-sizes="\[10\]"/g)).toHaveLength(3)
    expect(view.sourceLabels.map(row => row.label)).toEqual(['预计', '入仓', '提单'])
    expect(view.cargoFields.map(row => row.key)).toEqual(['grossWeight', 'pieces', 'volume'])
    expect(view.airlines.value.map(row => row.code)).toEqual(['MU'])
    expect(view.flights.value.every(row => row.airlineCode === 'MU')).toBe(true)
    expect(view.rows.value.map(row => row.id)).toEqual(['AIR-PAL-001'])
  })

  it('文本模糊、航班精确、分泡比例及两日期范围都由查询提交后生效', () => {
    data.state.airOrders.push(order({ id: 'AIR-PAL-002', orderNo: 'GJ-PAL-002', customer: '另一客户', foamRatio: null }))
    const view = setup()
    Object.assign(view.filters.value, { orderNo: 'pal-001', waybillNo: '000010', customer: '客户甲', creator: '周', owner: '李', foamRatio: 0.3, origin: 'PVG', destination: 'CAN', departureDate: ['2026-09-10', '2026-09-10'], createDate: ['2026-09-08', '2026-09-08'], flight: 'MU9001', specialCargo: '锂电池', airline: 'MU' })
    expect(view.rows.value).toHaveLength(2)
    expect(view.query()).toBe(true)
    expect(view.rows.value.map(row => row.id)).toEqual(['AIR-PAL-001'])
    view.filters.value.flight = 'MU900'
    expect(view.rows.value).toHaveLength(1)
    view.query()
    expect(view.rows.value).toEqual([])
    view.resetQuery()
    view.filters.value.foamRatio = 0
    view.query()
    expect(view.rows.value).toEqual([])
    view.resetQuery()
    expect(view.rows.value).toHaveLength(2)
    expect(view.applied.value).toEqual(view.defaults())
  })

  it('日期错误保留已提交查询和结果，重置清除选择且不变更产品记录', () => {
    const view = setup()
    select(view)
    const before = clone(view.applied.value)
    const orders = JSON.stringify(data.state.airOrders)
    view.filters.value.departureDate = ['2026-02-30', '2026-03-02']
    expect(view.query()).toBe(false)
    expect(view.queryError.value).toContain('日期范围')
    expect(view.applied.value).toEqual(before)
    view.resetQuery()
    expect(view.candidateIds.value).toEqual([])
    expect(view.flightKey.value).toBe('')
    expect(JSON.stringify(data.state.airOrders)).toBe(orders)
  })

  it('未完成订舱及毛件体取值冲突均显式限制，不能混入可配板选择', () => {
    data.state.airOrders.push(order({ id: 'AIR-PAL-PENDING', bookingStatus: '服务中' }), order({ id: 'AIR-PAL-CONFLICT', warehouse: { grossWeight: 110, pieces: 10, volume: 25 } }))
    const view = setup()
    expect(view.rows.value.find(row => row.id === 'AIR-PAL-PENDING').reason).toContain('尚未完成')
    expect(view.rows.value.find(row => row.id === 'AIR-PAL-CONFLICT').reason).toContain('取值口径待确认')
    view.selectCandidates(view.rows.value)
    expect(view.candidateIds.value).toEqual(['AIR-PAL-001'])
  })
})

describe('GJ-008 配板与可恢复结果', () => {
  it('选择订单及同航班日期后写唯一配板 owner，汇总更新而原订单毛件体不变', () => {
    const view = setup()
    const before = JSON.stringify(data.state.airOrders)
    expect(view.allocate()).toBe(false)
    const row = allocate(view)
    expect(data.state.palletAllocations).toHaveLength(1)
    expect(row).toMatchObject({ orderId: 'AIR-PAL-001', flightKey, cargo: { grossWeight: 100, pieces: 10, volume: 25 } })
    expect(view.target.value).toMatchObject({ totalVolume: 20, allocatedGrossWeight: 100, allocatedPieces: 10, allocatedVolume: 25 })
    expect(view.target.value.profit.reason).toContain('待确认')
    expect(view.rows.value).toEqual([])
    expect(view.candidateIds.value).toEqual([])
    expect(JSON.stringify(data.state.airOrders)).toBe(before)
    expect(feedback.ElMessage.success).toHaveBeenLastCalledWith('已提交成功！')
  })

  it('跨航班日期配板未确认，不写入；序号耗尽保存失败保留选择和可见错误', () => {
    const view = setup()
    select(view)
    view.selectFlight(view.flightRows.value.find(row => row.date === '2026-09-11'))
    expect(view.allocationReason.value).toContain('跨出港日期')
    expect(view.allocate()).toBe(false)
    expect(data.state.palletAllocations).toEqual([])
    view.selectFlight(view.flightRows.value.find(row => row.key === flightKey))
    data.state.palletSequence = Number.MAX_SAFE_INTEGER
    expect(view.allocate()).toBe(false)
    expect(view.failure.value).toContain('序号已用尽')
    expect(view.candidateIds.value).toEqual(['AIR-PAL-001'])
    expect(data.state.palletAllocations).toEqual([])
  })

  it('卸下取消保持原配板，确认后订单回待配板且总量归零', async () => {
    const view = setup()
    const row = allocate(view)
    view.selectAllocated([row])
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await view.confirmAction('unload')).toBe(false)
    expect(view.allocatedRows.value).toHaveLength(1)
    expect(await view.confirmAction('unload')).toBe(true)
    expect(view.allocatedRows.value).toEqual([])
    expect(view.rows.value.map(row => row.id)).toEqual(['AIR-PAL-001'])
    expect(view.target.value).toMatchObject({ allocatedGrossWeight: 0, allocatedPieces: 0, allocatedVolume: 0 })
  })

  it('重配作用于当前航班全部结果而非当前已选择的子集', async () => {
    data.state.airOrders.push(order({ id: 'AIR-PAL-002', orderNo: 'GJ-PAL-002', volume: 3 }))
    const view = setup()
    allocate(view)
    expect(view.allocatedRows.value).toHaveLength(2)
    view.selectAllocated([view.allocatedRows.value[0]])
    expect(await view.confirmAction('reallocate')).toBe(true)
    expect(data.state.palletAllocations).toEqual([])
    expect(view.rows.value).toHaveLength(2)
    expect(context.confirm.mock.calls[0][0]).toContain('当前航班全部 2 条')
  })
})

describe('GJ-008 分批、撤回与备注', () => {
  it('分批需完整正值及经验确认，超量或跨日期不能提交', async () => {
    const view = setup()
    const row = allocate(view)
    await view.open('split', row)
    expect(view.draft.value).toMatchObject({ grossWeight: '', pieces: '', volume: '', flight: 'MU9001', date: '2026-09-10', confirmedInsufficient: false })
    expect(Object.keys(view.splitErrors.value)).toEqual(expect.arrayContaining(['grossWeight', 'pieces', 'volume', 'confirmedInsufficient']))
    expect(view.save()).toBe(false)
    Object.assign(view.draft.value, { grossWeight: 100, pieces: 2.5, volume: 5, flight: 'MU9001', date: '2026-09-11', confirmedInsufficient: true })
    expect(view.splitErrors.value).toMatchObject({ grossWeight: expect.any(String), pieces: expect.any(String), flight: expect.stringContaining('待确认') })
    expect(view.save()).toBe(false)
    expect(data.state.palletAllocations).toHaveLength(1)
  })

  it('分批产生相同订单与提单号新行并保持原订单；撤回恢复同一原配板毛件体', async () => {
    const view = setup()
    const before = JSON.stringify(data.state.airOrders)
    const parent = await splitDraft(view)
    expect(view.save()).toBe(true)
    expect(view.dialog.value).toBe('')
    const child = view.allocatedRows.value.find(row => row.isSplit)
    expect(child).toMatchObject({ parentAllocationId: parent.id, orderNo: parent.orderNo, waybillNo: parent.waybillNo, cargo: { grossWeight: 40, pieces: 4, volume: 10 } })
    expect(data.state.palletAllocations.find(row => row.id === parent.id).cargo).toEqual({ grossWeight: 60, pieces: 6, volume: 15 })
    expect(view.target.value).toMatchObject({ allocatedGrossWeight: 100, allocatedPieces: 10, allocatedVolume: 25 })
    expect(view.reallocateReason.value).toContain('先撤回')
    expect(JSON.stringify(data.state.airOrders)).toBe(before)
    expect(await view.confirmAction('withdraw', child)).toBe(true)
    expect(view.allocatedRows.value).toHaveLength(1)
    expect(view.allocatedRows.value[0].cargo).toEqual(parent.cargo)
    expect(JSON.stringify(data.state.airOrders)).toBe(before)
  })

  it('未超过容量不进入分批，已经分批的原行不能再分批或卸下', async () => {
    const view = setup()
    data.state.airOrders[0].volume = 10
    const row = allocate(view)
    expect(view.splitReason(row)).toContain('未超过')
    await view.open('split', row)
    expect(view.dialog.value).toBe('')
    data.state.palletAllocations[0].cargo.volume = 25
    await view.open('split', row)
    Object.assign(view.draft.value, { grossWeight: 40, pieces: 4, volume: 10, confirmedInsufficient: true })
    expect(view.save()).toBe(true)
    expect(view.splitReason(row)).toContain('单次分批')
    view.selectAllocated([row])
    expect(view.unloadReason.value).toContain('先撤回')
  })

  it('备注独立草稿，取消保留输入，保存后同一结果行即时更新', async () => {
    const view = setup()
    const row = allocate(view)
    await view.open('note', row)
    view.draft.value.remark = '  晚班优先装载  '
    expect(data.state.palletAllocations[0].remark).toBe('')
    context.confirm.mockRejectedValueOnce('cancel')
    await view.close()
    expect(view.dialog.value).toBe('note')
    expect(view.draft.value.remark).toBe('  晚班优先装载  ')
    expect(view.save()).toBe(true)
    expect(view.allocatedRows.value[0].remark).toBe('晚班优先装载')
    expect(view.dialog.value).toBe('')
  })

  it('切换备注或分批目标遵循同一个草稿保护，不能暗中提交或丢弃', async () => {
    data.state.airOrders.push(order({ id: 'AIR-PAL-002', orderNo: 'GJ-PAL-002' }))
    const view = setup()
    allocate(view)
    const [first, second] = view.allocatedRows.value
    await view.open('note', first)
    view.draft.value.remark = '未保存'
    context.confirm.mockRejectedValueOnce('cancel')
    await view.open('split', second)
    expect(view.editingId.value).toBe(first.id)
    expect(view.dialog.value).toBe('note')
    await view.open('split', second)
    expect(view.editingId.value).toBe(second.id)
    expect(data.state.palletAllocations[0].remark).toBe('')
  })
})

describe('GJ-008 配板权限和生命周期', () => {
  it.each(['business', 'service', 'finance'])('%s 不可写配板，角色切换关闭草稿并清除选择', async persona => {
    const view = setup()
    const row = allocate(view)
    await view.open('note', row)
    view.draft.value.remark = '不能越权保存'
    data.selectWorkbenchPersona(persona)
    expect(view.save()).toBe(false)
    await nextTick()
    expect(view.dialog.value).toBe('')
    expect(view.canRead.value).toBe(persona === 'handler')
    expect(view.candidateIds.value).toEqual([])
    expect(view.flightKey.value).toBe('')
    expect(data.state.palletAllocations[0].remark).toBe('')
    expect(() => data.saveAirAllocationNote(row.id, '不可写')).toThrow()
  })

  it('航线操作可执行本人航线配板和卸下，但备注仍保持只读', async () => {
    const view = setup()
    const row = allocate(view)
    data.selectWorkbenchPersona('handler')
    await nextTick()
    view.selectFlight(view.flightRows.value.find(row => row.key === flightKey))
    expect(view.allocatedRows.value).toHaveLength(1)
    expect(view.writeReason.value).toBe('')
    await view.open('note', row)
    expect(view.dialog.value).toBe('note')
    view.draft.value.remark = '不可写'
    expect(view.save()).toBe(false)
    await view.close()
    view.selectAllocated([row])
    expect(await view.confirmAction('unload')).toBe(true)
    select(view)
    expect(view.allocate()).toBe(true)
    expect(data.state.palletAllocations[0]).toMatchObject({ operator: '李明', handler: '王晴' })
  })

  it.each(['role', 'reset'])('卸下确认期间 %s 变化取消旧请求且 busy 阻止重复执行', async change => {
    const view = setup()
    const row = allocate(view)
    view.selectAllocated([row])
    const resolve = delayConfirm()
    const pending = view.confirmAction('unload')
    expect(view.busy.value).toBe(true)
    expect(await view.confirmAction('unload')).toBe(false)
    expect(context.confirm).toHaveBeenCalledOnce()
    if (change === 'reset') data.reset()
    else data.selectWorkbenchPersona('handler')
    await nextTick()
    if (change === 'reset') data.selectWorkbenchPersona('operator')
    await nextTick()
    const before = JSON.stringify(data.state.palletAllocations)
    resolve('confirm')
    expect(await pending).toBe(false)
    expect(JSON.stringify(data.state.palletAllocations)).toBe(before)
    expect(view.busy.value).toBe(false)
  })

  it('路由离开和浏览器卸载保护未保存分批，确认丢弃不会更改已配数据', async () => {
    const adapter = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('window', adapter)
    const view = setup()
    await splitDraft(view)
    const before = JSON.stringify(data.state.palletAllocations)
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    view.beforeUnload(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(context.leaveGuard).toBe(context.updateGuard)
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.leaveGuard()).toBe(false)
    expect(await context.updateGuard()).toBe(true)
    expect(JSON.stringify(data.state.palletAllocations)).toBe(before)
    context.mounted.forEach(callback => callback()); context.unmounted.forEach(callback => callback())
    expect(adapter.addEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
    expect(adapter.removeEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
  })

  it('来源移除或 reset 关闭旧备注，旧配板对象不能重新打开', async () => {
    const view = setup()
    const row = allocate(view)
    await view.open('note', row)
    data.state.palletAllocations = []
    await nextTick()
    expect(view.dialog.value).toBe('')
    await view.open('note', row)
    expect(view.dialog.value).toBe('')
    data.reset()
    await nextTick()
    expect(data.state.palletAllocations).toEqual([])
    expect(data.state.palletSequence).toBe(0)
  })
})
