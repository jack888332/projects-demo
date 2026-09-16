import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, nextTick, reactive, unref } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as airCapacity from '../src/domain/airCapacity.js'

const data = usePrototypeData()
const route = reactive({ query: {} })
const context = { props: {}, leaveGuard: null, updateGuard: null, mounted: [], unmounted: [], confirm: vi.fn(), push: vi.fn(), emit: vi.fn() }
const feedback = { ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: context.confirm } }
const routerHooks = {
  useRoute: () => route,
  useRouter: () => ({ push: context.push }),
  onBeforeRouteLeave: guard => { context.leaveGuard = guard },
  onBeforeRouteUpdate: guard => { context.updateGuard = guard },
}
const scopes = []
const templates = {}
const clone = value => JSON.parse(JSON.stringify(value))

// Keep the actual setup and central owner; only browser, router and feedback adapters are replaced.
function loadComponent(relativePath) {
  const filename = new URL(`../src/${relativePath}.vue`, import.meta.url)
  const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
  expect(parsed.errors).toEqual([])
  const script = compileScript(parsed.descriptor, { id: relativePath })
  templates[relativePath] = parsed.descriptor.template.content
  expect(compileTemplate({ source: templates[relativePath], filename: filename.pathname, id: relativePath, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  const modules = {
    vue: { ...vue, onMounted: callback => context.mounted.push(callback), onBeforeUnmount: callback => context.unmounted.push(callback) },
    'vue-router': routerHooks,
    'element-plus': feedback,
    '@element-plus/icons-vue': new Proxy({}, { get: () => ({}) }),
    '../data/usePrototypeData.js': { usePrototypeData: () => data },
    '../domain/airCapacity.js': airCapacity,
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
    context.props = reactive(props)
    const scope = effectScope()
    scopes.push(scope)
    return scope.run(() => run(...Object.values(imported)))
  }
}
const setupCapacity = loadComponent('views/AirCapacityView')
const setupDetails = loadComponent('components/CapacityDetailsTable')
const setupTable = loadComponent('components/DataTableFrame')

function validDraft(overrides = {}) {
  return {
    ...airCapacity.createCapacityDraft(unref(data.capacitySession)),
    flightId: 'FLIGHT-MU9001', boardType: '临时板', startDate: '2026-10-01', endDate: '2026-10-31',
    operator: '李明', handler: '王晴',
    details: [{ weekday: 1, palletId: 'PALLET-DEMO-PMC', baseline: '1000', quantity: '3' }],
    ...overrides,
  }
}
async function fill(view, overrides = {}) {
  await view.open('create')
  Object.assign(view.draft.value, validDraft(overrides))
  return view.draft.value
}
function delayedConfirmation() {
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
  context.emit.mockReset()
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

describe('GJ-008 舱位产品字段与提交结果', () => {
  it('新增默认临时板、当前运营、一条空明细，所有维护及带出字段均可见', async () => {
    const view = setupCapacity()
    await view.open('create')
    expect(view.draft.value).toEqual(airCapacity.createCapacityDraft(unref(data.capacitySession)))
    expect(view.draft.value).toMatchObject({ boardType: '临时板', operator: '李明', handler: '', startDate: '', endDate: '', details: [{ weekday: '', palletId: '', baseline: '', quantity: '' }] })
    expect(Boolean(view.dirty.value)).toBe(false)
    expect(view.errors.value).toMatchObject({ flightId: expect.any(String), handler: expect.any(String), startDate: expect.any(String), endDate: expect.any(String), 'details.0.weekday': expect.any(String), 'details.0.palletId': expect.any(String) })
    expect(view.errors.value['details.0.baseline']).toBeUndefined()
    expect(view.errors.value['details.0.quantity']).toBeUndefined()
    for (const label of ['航司', '航班号', '目的港', '板类型', '周期日', '板型', '板体积 (m³)', '基准载重 (kg)', '数量', '有效开始日期', '有效结束日期', '创建时间', '航线运营', '航线操作']) {
      expect(templates['views/AirCapacityView']).toContain(label)
    }
    const before = JSON.stringify(data.state.capacityProducts)
    const sequence = data.state.capacitySequence
    expect(view.save()).toBe(false)
    expect(JSON.stringify(data.state.capacityProducts)).toBe(before)
    expect(data.state.capacitySequence).toBe(sequence)
    expect(templates['views/AirCapacityView']).toContain(':disabled="Object.keys(errors).length > 0"')
  })

  it('航班带出同一主数据中的航司目的港及所属板型，切换航班清除板型选择', async () => {
    const view = setupCapacity()
    await fill(view)
    expect(view.airlineOf(view.draft.value).code).toBe('MU')
    expect(view.flightOf(view.draft.value).destination).toBe(data.state.airMaster.flights.find(row => row.id === 'FLIGHT-MU9001').destination)
    expect(view.pallets.value.map(row => row.id)).toEqual(['PALLET-DEMO-PMC'])
    expect(view.palletOf('PALLET-DEMO-PMC').volume).toBe(10)
    view.draft.value.flightId = data.state.airMaster.flights.find(row => row.airlineCode === 'CZ').id
    view.changeFlight()
    expect(view.draft.value.details[0]).toMatchObject({ palletId: '', weekday: 1, baseline: '1000', quantity: '3' })
    expect(view.pallets.value).toEqual([])
    expect(view.errors.value['details.0.palletId']).toBeTruthy()
  })

  it('添加复制上一条明细但不共享对象，重复报错并可修正后提交', async () => {
    const view = setupCapacity()
    await fill(view)
    view.addDetail()
    expect(view.draft.value.details).toHaveLength(2)
    expect(view.draft.value.details[1]).toEqual(view.draft.value.details[0])
    expect(view.draft.value.details[1]).not.toBe(view.draft.value.details[0])
    expect(Object.values(view.errors.value)).toContain('数据重复，请重新录入')
    expect(view.save()).toBe(false)
    view.draft.value.details[1].weekday = 2
    view.draft.value.details[1].quantity = '4'
    expect(view.draft.value.details[0].quantity).toBe('3')
    expect(view.errors.value).toEqual({})
    expect(view.save()).toBe(true)
    expect(data.state.capacityProducts.at(-1).details.map(row => row.weekday)).toEqual([1, 2])
  })

  it('明细至少保留一行，基准载重与数量留空仍可提交', async () => {
    const view = setupCapacity()
    await fill(view, { details: [{ weekday: 1, palletId: 'PALLET-DEMO-PMC', baseline: '', quantity: '' }] })
    view.removeDetail(0)
    expect(view.draft.value.details).toHaveLength(1)
    view.addDetail()
    view.removeDetail(0)
    expect(view.draft.value.details).toHaveLength(1)
    expect(view.errors.value).toEqual({})
    expect(view.save()).toBe(true)
    expect(data.state.capacityProducts.at(-1).details[0]).toMatchObject({ baseline: '', quantity: '' })
  })

  it('无效输入同时显示错误且不写 owner，修正后保存完整字段和可信系统信息', async () => {
    const view = setupCapacity()
    await fill(view, { details: [{ weekday: 1, palletId: 'PALLET-DEMO-PMC', baseline: '1.5', quantity: '0' }], endDate: '2026-09-30' })
    expect(view.errors.value).toMatchObject({ endDate: expect.any(String), 'details.0.baseline': expect.any(String), 'details.0.quantity': expect.any(String) })
    const before = JSON.stringify(data.state.capacityProducts)
    expect(view.save()).toBe(false)
    expect(JSON.stringify(data.state.capacityProducts)).toBe(before)
    expect(view.draft.value.details[0].baseline).toBe('1.5')
    const payload = validDraft()
    Object.assign(view.draft.value, payload, { creator: '伪造', createdAt: '2099-01-01', remark: '不可从产品表单写备注', updatedBy: '伪造', updateSequence: 999 })
    expect(view.save()).toBe(true)
    const saved = data.state.capacityProducts.at(-1)
    expect(saved).toMatchObject({ ...payload, id: 'CAP-00000002', creator: '李明', createdAt: airCapacity.CAPACITY_NOW, updatedAt: airCapacity.CAPACITY_NOW, updatedBy: '李明', updateSequence: 2, remark: '' })
    expect(view.mode.value).toBe('')
    expect(view.rows.value[0].id).toBe(saved.id)
    expect(feedback.ElMessage.success).toHaveBeenLastCalledWith('已提交成功！')
  })

  it('一级航班板类型有效期重叠不生成第二条，跨板类型可独立保存', async () => {
    const view = setupCapacity()
    await fill(view, { startDate: '2026-09-02', endDate: '2026-09-20' })
    expect(view.errors.value.endDate).toBe('数据重复，请重新录入')
    expect(view.save()).toBe(false)
    view.draft.value.boardType = '合同板'
    expect(view.errors.value).toEqual({})
    expect(view.save()).toBe(true)
    expect(data.state.capacityProducts).toHaveLength(2)
  })

  it('保存 owner 失败保留草稿及错误，既有产品和序号不被部分更新', async () => {
    const view = setupCapacity()
    await fill(view)
    const before = JSON.stringify(data.state.capacityProducts)
    data.state.capacitySequence = Number.MAX_SAFE_INTEGER
    expect(view.save()).toBe(false)
    expect(view.failure.value).toContain('序号已用尽')
    expect(view.mode.value).toBe('create')
    expect(view.draft.value).toEqual(validDraft())
    expect(view.busy.value).toBe(false)
    expect(JSON.stringify(data.state.capacityProducts)).toBe(before)
    expect(data.state.capacitySequence).toBe(Number.MAX_SAFE_INTEGER)
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
  })

  it('编辑独立草稿仅改变允许字段，创建人与原备注保持原值', async () => {
    const row = data.saveCapacityProduct(validDraft())
    data.saveCapacityNote(row.id, '保留备注')
    const before = clone(row)
    const view = setupCapacity()
    await view.open('edit', row)
    Object.assign(view.draft.value, { startDate: '2026-10-02', endDate: '2026-11-01', handler: '陈琪', creator: '伪造', createdAt: '2099-01-01', remark: '伪造' })
    Object.assign(view.draft.value.details[0], { weekday: 3, quantity: '5', baseline: '1500' })
    expect(row).toEqual(before)
    expect(view.save()).toBe(true)
    expect(row).toMatchObject({ startDate: '2026-10-02', endDate: '2026-11-01', handler: '陈琪', creator: before.creator, createdAt: before.createdAt, remark: before.remark, details: [{ weekday: 3, palletId: 'PALLET-DEMO-PMC', quantity: '5', baseline: '1500' }] })
    expect(templates['views/AirCapacityView']).toContain(':disabled="busy || mode === \'edit\'"')
  })

  it('编辑不能绕过航班和板类型锁定，提交不覆盖原记录', async () => {
    const row = data.saveCapacityProduct(validDraft())
    const view = setupCapacity()
    await view.open('edit', row)
    const before = JSON.stringify(row)
    view.draft.value.flightId = data.state.airMaster.flights.find(item => item.id !== row.flightId).id
    view.draft.value.boardType = '合同板'
    expect(view.errors.value.flightId).toContain('不可修改航班')
    expect(view.errors.value.boardType).toContain('不可修改板类型')
    expect(view.save()).toBe(false)
    expect(JSON.stringify(row)).toBe(before)
  })

  it('只读详情克隆明细，没有提交和未授权删除写入口', async () => {
    const view = setupCapacity()
    const row = data.state.capacityProducts[0]
    await view.open('detail', row)
    const before = JSON.stringify(row)
    expect(view.isEditing.value).toBe(false)
    view.draft.value.details[0].quantity = '999'
    expect(view.save()).toBe(false)
    view.addDetail()
    view.removeDetail(0)
    expect(view.draft.value.details).toHaveLength(row.details.length)
    expect(JSON.stringify(row)).toBe(before)
    expect(data.deleteCapacityProduct).toBeUndefined()
    expect(templates['views/AirCapacityView']).toContain('<el-button link disabled>删除</el-button>')
  })

  it('他人绑定或已关联业务的产品保留详情，待确认编辑入口不会打开', async () => {
    const view = setupCapacity()
    const other = data.saveCapacityProduct(validDraft({ operator: '赵航' }))
    const referenced = data.state.capacityProducts[0]
    data.state.airOrders.push({ id: 'CAP-REF-1', booking: { flight: 'MU9001', departureDate: '2026-09-08' } })
    for (const row of [other, referenced]) {
      const before = JSON.stringify(row)
      expect(view.editRestriction(row)).toContain('待确认')
      await view.open('edit', row)
      expect(view.mode.value).toBe('')
      expect(() => data.saveCapacityProduct(clone(row))).toThrow('待确认')
      expect(JSON.stringify(row)).toBe(before)
      await view.open('detail', row)
      expect(view.mode.value).toBe('detail')
      await view.close()
    }
  })
})

describe('GJ-008 查询、实时容量与备注', () => {
  it('默认本人绑定，查询暂存后提交，全部航司取消绑定过滤且重置不丢草稿', async () => {
    const own = data.saveCapacityProduct(validDraft())
    const other = data.saveCapacityProduct(validDraft({ boardType: '合同板', operator: '赵航', handler: '陈琪' }))
    const view = setupCapacity()
    await fill(view, { startDate: '2026-12-01', endDate: '2026-12-31' })
    const draft = clone(view.draft.value)
    expect(view.rows.value.map(row => row.id)).toEqual([own.id, 'CAP-00000001'])
    Object.assign(view.filters.value, { airline: '', operator: '赵航', flight: 'MU9001', validDate: '2026-10-15', createDate: airCapacity.CAPACITY_NOW.slice(0, 10) })
    expect(view.rows.value).toHaveLength(2)
    view.queryProducts()
    expect(view.rows.value.map(row => row.id)).toEqual([other.id])
    view.filters.value.flight = 'MU900'
    expect(view.rows.value).toHaveLength(1)
    view.queryProducts()
    expect(view.rows.value).toEqual([])
    view.resetProducts()
    expect(view.filters.value).toEqual(view.applied.value)
    expect(view.filters.value.airline).toBe('bound')
    expect(view.rows.value.map(row => row.id)).toEqual([own.id, 'CAP-00000001'])
    expect(view.draft.value).toEqual(draft)
    expect(context.confirm).not.toHaveBeenCalled()
  })

  it('页签由 URL 派生，切换后保留单一真实导航状态', async () => {
    const view = setupCapacity()
    expect(view.activeTab.value).toBe('products')
    await view.switchTab('live')
    expect(context.push).toHaveBeenLastCalledWith({ query: { view: 'live' } })
    expect(view.activeTab.value).toBe('products')
    route.query = { view: 'live' }
    expect(view.activeTab.value).toBe('live')
    await view.switchTab('live')
    expect(context.push).toHaveBeenCalledOnce()
    await view.switchTab('products')
    expect(context.push).toHaveBeenLastCalledWith({ query: {} })
  })

  it('实时查询分阶段提交，航司航班始发地候选联动，错误日期不替换结果', () => {
    const view = setupCapacity()
    const initial = clone(view.liveApplied.value)
    const originalRows = view.liveRows.value.map(row => row.key)
    view.liveFilters.value.airline = 'CZ'
    expect(view.liveFlights.value.every(row => row.airlineCode === 'CZ')).toBe(true)
    const flight = view.liveFlights.value[0]
    view.liveFilters.value.flight = flight.code
    expect(view.liveOrigins.value).toEqual([flight.origin])
    expect(view.liveRows.value.map(row => row.key)).toEqual(originalRows)
    view.queryLive()
    expect(view.liveApplied.value.airline).toBe('CZ')
    expect(view.liveRows.value).toEqual([])
    view.liveFilters.value.startDate = '2026-09-20'
    view.queryLive()
    expect(view.queryError.value).toContain('出港日期范围')
    expect(view.liveApplied.value.startDate).toBe(initial.startDate)
    view.resetLive()
    expect(view.queryError.value).toBe('')
    expect(view.liveFilters.value).toEqual(initial)
    expect(view.liveApplied.value).toEqual(initial)
    expect(view.liveRows.value.map(row => row.key)).toEqual(originalRows)
  })

  it('不存在的日期不提交，未覆盖航班也不会靠主数据时刻伪造容量', () => {
    const view = setupCapacity()
    const before = clone(view.liveApplied.value)
    Object.assign(view.liveFilters.value, { startDate: '2026-02-30', endDate: '2026-03-02' })
    view.queryLive()
    expect(view.queryError.value).toContain('出港日期范围')
    expect(view.liveApplied.value).toEqual(before)
    data.state.airOrders = [{ id: 'CAP-UNCOVERED', orderNo: 'DEMO-008-UNCOVERED', waybillNo: '781-12345670', bookingStatus: '服务已完成', booking: { flight: 'UNKNOWN9001', departureDate: '2026-09-08' }, volume: 3 }]
    const row = view.liveRows.value.find(item => item.flight === 'UNKNOWN9001')
    expect(row).toMatchObject({ bookedVolume: 3, boardCount: null, totalVolume: null, remainingVolume: null })
    expect(row.capacityReason).toBeTruthy()
  })

  it('实时数量与容量来自产品，已订量只计提单绑定且订舱完成的主订单并采用最新货物阶段', () => {
    const view = setupCapacity()
    const order = { id: 'CAP-ORDER-1', orderNo: 'DEMO-008-1', waybillNo: '781-12345670', bookingStatus: '服务已完成', booking: { flight: 'MU9001', departureDate: '2026-09-08' }, volume: 7 }
    data.state.airOrders = [clone(order), { ...clone(order), id: 'CAP-ORDER-2', waybillNo: '' }, { ...clone(order), id: 'CAP-ORDER-3', bookingStatus: '待处理' }, { ...clone(order), id: 'CAP-ORDER-4', parentOrderId: order.id }]
    const row = () => view.liveRows.value.find(item => item.date === '2026-09-08')
    expect(row()).toMatchObject({ boardCount: 2, totalVolume: 20, bookedVolume: 7, remainingVolume: 13 })
    expect(row().bookedOrders).toHaveLength(1)
    data.state.airOrders[0].warehouse = { volume: 8 }
    expect(row()).toMatchObject({ bookedVolume: 8, remainingVolume: 12 })
    data.state.airOrders[0].station = { volume: 9, enteredAt: '2026-09-08 09:00' }
    expect(row()).toMatchObject({ bookedVolume: 9, remainingVolume: 11 })
    data.state.airOrders[0].station.volume = ''
    expect(row()).toMatchObject({ bookedVolume: null, remainingVolume: null })
    expect(row().volumeReason).toContain('入货站体积')
    expect(view.numberText(null)).toBe('待确认')
    expect(view.numberText(0)).toBe('0')
  })

  it('选填数量未填写不假定一板，未知总容量与零订单体积分开显示', () => {
    const view = setupCapacity()
    data.state.airOrders = []
    data.state.capacityProducts[0].details.forEach(detail => { detail.quantity = '' })
    const row = view.liveRows.value[0]
    expect(row).toMatchObject({ boardCount: null, totalVolume: null, bookedVolume: 0, remainingVolume: null })
    expect(row.capacityReason).toContain('数量未填写')
  })

  it('备注独立草稿保存回同一产品，查询投影立即更新且未保存不污染列表', async () => {
    const view = setupCapacity()
    const product = view.liveRows.value[0].products[0]
    await view.openNote(product)
    view.noteText.value = '  夜间航班需提前确认  '
    expect(data.state.capacityProducts[0].remark).toBe('')
    expect(view.liveRows.value[0].products[0].remark).toBe('')
    view.saveNote()
    expect(data.state.capacityProducts[0].remark).toBe('夜间航班需提前确认')
    expect(view.liveRows.value[0].products[0].remark).toBe('夜间航班需提前确认')
    expect(view.noteProduct.value).toBe(null)
    expect(feedback.ElMessage.success).toHaveBeenLastCalledWith('备注已保存')
  })

  it('他人绑定产品备注只读，不能经 owner 越权保存', async () => {
    const row = data.saveCapacityProduct(validDraft({ operator: '赵航' }))
    const view = setupCapacity()
    await view.openNote(row)
    expect(airCapacity.canEditCapacityNote(view.noteProduct.value, view.session.value)).toBe(false)
    view.noteText.value = '不可写'
    view.saveNote()
    expect(row.remark).toBe('')
    expect(() => data.saveCapacityNote(row.id, '不可写')).toThrow('仅当前绑定')
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
  })
})

describe('GJ-008 草稿、权限与对象生命周期保护', () => {
  it('取消关闭保留草稿，确认后丢弃；切换对象也不隐式保存', async () => {
    const view = setupCapacity()
    await fill(view)
    const before = JSON.stringify(data.state.capacityProducts)
    const draft = clone(view.draft.value)
    const done = vi.fn()
    context.confirm.mockRejectedValueOnce('cancel')
    await view.close(done)
    expect(view.draft.value).toEqual(draft)
    expect(done).not.toHaveBeenCalled()
    context.confirm.mockRejectedValueOnce('cancel')
    await view.open('detail', data.state.capacityProducts[0])
    expect(view.mode.value).toBe('create')
    await view.close(done)
    expect(done).toHaveBeenCalledOnce()
    expect(view.mode.value).toBe('')
    expect(JSON.stringify(data.state.capacityProducts)).toBe(before)
  })

  it('取消页签切换保留草稿，确认后才导航，浏览器离开使用同一保护', async () => {
    const windowAdapter = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('window', windowAdapter)
    const view = setupCapacity()
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    view.beforeUnload(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    await fill(view)
    view.beforeUnload(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe('')
    expect(context.leaveGuard).toBe(context.updateGuard)
    context.confirm.mockRejectedValueOnce('cancel')
    await view.switchTab('live')
    expect(context.push).not.toHaveBeenCalled()
    expect(view.mode.value).toBe('create')
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.leaveGuard()).toBe(false)
    await view.switchTab('live')
    expect(context.push).toHaveBeenCalledOnce()
    expect(view.mode.value).toBe('')
    context.mounted.forEach(callback => callback())
    context.unmounted.forEach(callback => callback())
    expect(windowAdapter.addEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
    expect(windowAdapter.removeEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
  })

  it.each([
    ['handler', true, true], ['business', false, true], ['service', false, false], ['finance', false, false],
  ])('%s 仅保留定义的产品及实时查询可见范围，不能保存运营草稿', async (persona, productRead, liveRead) => {
    const view = setupCapacity()
    await fill(view)
    const before = JSON.stringify(data.state.capacityProducts)
    data.selectWorkbenchPersona(persona)
    expect(view.save()).toBe(false)
    await nextTick()
    expect(view.mode.value).toBe('')
    expect(view.canMaintain.value).toBe(false)
    expect(view.canReadProducts.value).toBe(productRead)
    expect(view.canReadLive.value).toBe(liveRead)
    await view.open('create')
    await view.open('edit', data.state.capacityProducts[0])
    expect(view.mode.value).toBe('')
    expect(() => data.saveCapacityProduct(validDraft())).toThrow('仅航线运营')
    expect(() => data.saveCapacityNote(data.state.capacityProducts[0].id, '不可写')).toThrow('仅航线运营')
    expect(JSON.stringify(data.state.capacityProducts)).toBe(before)
    await view.open('detail', data.state.capacityProducts[0])
    expect(view.mode.value).toBe(productRead ? 'detail' : '')
  })

  it.each(['switch', 'leave'])('%s 确认期间切换角色使旧请求失效且不重复确认', async action => {
    const view = setupCapacity()
    await fill(view)
    const resolve = delayedConfirmation()
    const pending = action === 'switch' ? view.open('detail', data.state.capacityProducts[0]) : context.leaveGuard()
    expect(view.busy.value).toBe(true)
    await view.open('create')
    expect(context.confirm).toHaveBeenCalledOnce()
    data.selectWorkbenchPersona('handler')
    await nextTick()
    resolve('confirm')
    const result = await pending
    if (action === 'leave') expect(result).toBe(false)
    expect(view.mode.value).toBe('')
    expect(view.busy.value).toBe(false)
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
  })

  it.each(['switch', 'leave'])('%s 确认期间重置再恢复角色，不打开同 ID 的新对象', async action => {
    const view = setupCapacity()
    await fill(view)
    const resolve = delayedConfirmation()
    const pending = action === 'switch' ? view.open('detail', data.state.capacityProducts[0]) : context.leaveGuard()
    data.reset()
    await nextTick()
    data.selectWorkbenchPersona('operator')
    await nextTick()
    resolve('confirm')
    const result = await pending
    if (action === 'leave') expect(result).toBe(false)
    expect(view.mode.value).toBe('')
    expect(view.busy.value).toBe(false)
    expect(data.state.capacityProducts).toEqual(airCapacity.createCapacitySeed())
  })

  it('重置恢复确定产品及序号，销毁未保存产品和备注草稿', async () => {
    const view = setupCapacity()
    const row = data.saveCapacityProduct(validDraft())
    await view.openNote(row)
    view.noteText.value = '重置不保存'
    data.reset()
    await nextTick()
    expect(data.state.capacityProducts).toEqual(airCapacity.createCapacitySeed())
    expect(data.state.capacitySequence).toBe(1)
    expect(view.mode.value).toBe('')
    expect(view.noteProduct.value).toBe(null)
  })

  it('详情来源删除后关闭旧对象，旧引用不能重新打开', async () => {
    const view = setupCapacity()
    const row = data.state.capacityProducts[0]
    await view.open('detail', row)
    data.state.capacityProducts.splice(0, 1)
    await nextTick()
    expect(view.mode.value).toBe('')
    await view.open('detail', row)
    expect(view.mode.value).toBe('')
  })

  it('更换备注目标需要确认，取消保留当前备注草稿且确认不隐式写入', async () => {
    const view = setupCapacity()
    const first = data.state.capacityProducts[0]
    const second = data.saveCapacityProduct(validDraft())
    await view.openNote(first)
    view.noteText.value = '保留未保存备注'
    context.confirm.mockRejectedValueOnce('cancel')
    await view.openNote(second)
    expect(view.noteProduct.value.id).toBe(first.id)
    expect(view.noteText.value).toBe('保留未保存备注')
    await view.openNote(second)
    expect(view.noteProduct.value.id).toBe(second.id)
    expect(first.remark).toBe('')
  })
})

describe('GJ-008 表格边界和主数据引用保护', () => {
  it('二级明细固定二十条分页，替换数据后回第一页，空数量与零分开呈现', async () => {
    const rows = Array.from({ length: 43 }, (_, index) => ({ weekday: 1, palletId: 'PALLET-DEMO-PMC', baseline: '', quantity: index + 1 }))
    const table = setupDetails({ rows, master: data.state.airMaster })
    expect(table.visible.value).toEqual(rows.slice(0, 20))
    table.page.value = 3
    expect(table.visible.value).toEqual(rows.slice(40))
    context.props.rows = rows.slice(0, 2)
    await nextTick()
    expect(table.page.value).toBe(1)
    expect(table.visible.value).toEqual(rows.slice(0, 2))
    expect(table.value('')).toBe('未填写')
    expect(table.value(0)).toBe(0)
    expect(table.pallet('PALLET-DEMO-PMC').volume).toBe(10)
    expect(templates['components/CapacityDetailsTable']).toContain(':page-size="20"')
  })

  it('产品和实时列表均复用十条一级分页', () => {
    expect(templates['views/AirCapacityView'].match(/:page-sizes="\[10\]"/g)).toHaveLength(2)
    const rows = Array.from({ length: 23 }, (_, index) => ({ id: index + 1 }))
    const table = setupTable({ rows, pageSize: 10, pageSizes: [10], selectedCount: 0, selectable: false })
    expect(table.pageRows.value).toEqual(rows.slice(0, 10))
    table.page.value = 3
    expect(table.pageRows.value).toEqual(rows.slice(20))
  })

  it.each([
    ['flights', 'FLIGHT-MU9001', 'code', 'MU9999'],
    ['flights', 'FLIGHT-MU9001', 'airlineCode', 'CZ'],
    ['pallets', 'PALLET-DEMO-PMC', 'code', 'PMC-NEW'],
    ['pallets', 'PALLET-DEMO-PMC', 'airlineCode', 'CZ'],
    ['pallets', 'PALLET-DEMO-PMC', 'volume', 12],
  ])('舱位引用的 %s %s 不允许改写 %s', (kind, id, field, value) => {
    data.selectWorkbenchPersona('masterRoute')
    const row = data.state.airMaster[kind].find(item => item.id === id)
    const before = JSON.stringify(data.state.airMaster)
    const sequence = data.state.airMasterSequence
    expect(() => data.saveAirMaster(kind, { ...clone(row), [field]: value })).toThrow('舱位产品')
    expect(JSON.stringify(data.state.airMaster)).toBe(before)
    expect(data.state.airMasterSequence).toBe(sequence)
  })

  it.each([['flights', 'FLIGHT-MU9001'], ['pallets', 'PALLET-DEMO-PMC']])('舱位引用的 %s 不允许删除', (kind, id) => {
    data.selectWorkbenchPersona('masterRoute')
    const before = JSON.stringify(data.state.airMaster)
    expect(() => data.deleteAirMaster(kind, [id])).toThrow('舱位产品')
    expect(JSON.stringify(data.state.airMaster)).toBe(before)
  })
})
