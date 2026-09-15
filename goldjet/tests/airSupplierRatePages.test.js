import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, nextTick, reactive, unref } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as airSupplierRates from '../src/domain/airSupplierRates.js'

const data = usePrototypeData()
const context = { props: {}, leaveGuard: null, updateGuard: null, mounted: [], unmounted: [], confirm: vi.fn(), push: vi.fn(), emit: vi.fn() }
const feedback = { ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: context.confirm } }
const routerHooks = {
  useRouter: () => ({ push: context.push }),
  onBeforeRouteLeave: guard => { context.leaveGuard = guard },
  onBeforeRouteUpdate: guard => { context.updateGuard = guard },
}
const scopes = []
const templates = {}
const clone = value => JSON.parse(JSON.stringify(value))

// Exercise real setup and the central owner; replace only browser, router and feedback adapters.
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
    '../domain/airSupplierRates.js': airSupplierRates,
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
const setupRates = loadComponent('views/AirSupplierRatesView')
const setupMethod = loadComponent('components/AirRateMethodDialog')
const setupTable = loadComponent('components/DataTableFrame')

function validDraft(overrides = {}) {
  return {
    ...airSupplierRates.createAirSupplierRateDraft(),
    partnerId: 'PT-00028', serviceType: '订舱', feeItemId: 'FC-0001', billingUnit: '提单计费重(kg)',
    chargeMethod: '常规方式', unitPrice: '15.25', taxRate: '6', currency: 'CNY',
    startDate: '2026-09-01', endDate: '2026-10-31', contractNo: 'DEMO-007-01',
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
  data.selectWorkbenchPersona('supervisor')
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

describe('GJ-007 完整字段和唯一保存结果', () => {
  it('展示十一个维护字段和三个系统字段，新增默认税率为零且无预设日期', async () => {
    const view = setupRates()
    await view.open('create')
    expect(unref(view.fields).map(field => field.key)).toEqual(Object.keys(airSupplierRates.createAirSupplierRateDraft()).filter(key => key !== 'details'))
    expect(view.columns.map(field => field.key)).toEqual([...view.fields.map(field => field.key), 'creator', 'updatedAt'])
    expect(templates['views/AirSupplierRatesView']).toContain('<el-table-column label="状态"')
    expect(view.draft.value).toMatchObject({ taxRate: 0, startDate: '', endDate: '', details: [] })
    expect(view.dirty.value).toBe(false)
    expect(view.errors.value).toMatchObject({ partnerId: expect.any(String), serviceType: expect.any(String), feeItemId: expect.any(String), billingUnit: expect.any(String), chargeMethod: expect.any(String), currency: expect.any(String), startDate: expect.any(String), endDate: expect.any(String) })
    expect(view.errors.value.taxRate).toBeUndefined()
    const before = JSON.stringify(data.state.airSupplierRates)
    const sequence = data.state.airSupplierRateSequence
    expect(view.save()).toBe(false)
    expect(view.submitted.value).toBe(true)
    expect(JSON.stringify(data.state.airSupplierRates)).toBe(before)
    expect(data.state.airSupplierRateSequence).toBe(sequence)
  })

  it('新增遵循用户确认的已生效状态，并从当前操作者生成系统字段', async () => {
    const view = setupRates()
    const before = view.rows.value.length
    const payload = clone(await fill(view))
    Object.assign(view.draft.value, { creator: '伪造创建人', status: '失效', updatedAt: '2099-01-01', updatedBy: '伪造修改人', updateSequence: 999 })
    expect(view.rows.value).toHaveLength(before)
    expect(view.errors.value).toEqual({})
    expect(view.save()).toBe(true)
    expect(view.mode.value).toBe('')
    expect(view.rows.value).toHaveLength(before + 1)
    const saved = view.rows.value[0]
    expect(saved).toMatchObject({ ...payload, status: '已生效', creator: data.airSession.name, updatedBy: data.airSession.name, updatedAt: airSupplierRates.AIR_RATE_NOW })
    expect(saved.id).toBe('ASR-00000007')
    expect(saved.updateSequence).toBe(7)
    expect(view.status(saved)).toBe('已生效')
    expect(feedback.ElMessage.success).toHaveBeenLastCalledWith('新增供应商价格规则成功')
  })

  it('编辑使用独立草稿，十一字段可修改且创建人和状态不被伪造覆盖', async () => {
    const view = setupRates()
    const saved = data.saveAirSupplierRate(validDraft())
    const before = clone(saved)
    await view.open('edit', saved)
    Object.assign(view.draft.value, validDraft({ partnerId: 'PT-00029', serviceType: '报关', feeItemId: 'FC-0006', billingUnit: '分单数(个)', unitPrice: '200.50', taxRate: '13', currency: 'USD', startDate: '2026-09-02', endDate: '2026-11-30', contractNo: '' }), { creator: '冒名', status: '失效' })
    expect(saved).toEqual(before)
    expect(view.dirty.value).toBe(true)
    expect(view.errors.value).toEqual({})
    expect(view.save()).toBe(true)
    expect(saved).toMatchObject({ partnerId: 'PT-00029', serviceType: '报关', feeItemId: 'FC-0006', billingUnit: '分单数(个)', unitPrice: '200.50', taxRate: '13', currency: 'USD', startDate: '2026-09-02', endDate: '2026-11-30', contractNo: '', creator: before.creator, status: before.status })
    expect(feedback.ElMessage.success).toHaveBeenLastCalledWith('编辑供应商价格规则成功')
  })

  it('详情草稿独立且无写入或删除规则入口', async () => {
    const view = setupRates()
    const row = data.state.airSupplierRates[0]
    const before = JSON.stringify(row)
    await view.open('detail', row)
    expect(view.readonly.value).toBe(true)
    expect(view.editing.value).toBe(false)
    expect(view.draft.value).toEqual(row)
    view.draft.value.unitPrice = '999'
    expect(view.save()).toBe(false)
    expect(JSON.stringify(row)).toBe(before)
    expect(view.remove).toBeUndefined()
    expect(data.deleteAirSupplierRate).toBeUndefined()
    expect(templates['views/AirSupplierRatesView']).not.toMatch(/>删除<|@click="remove/)
    await view.close()
    expect(view.save()).toBe(false)
  })

  it('税率整数、单价两位小数和合同编号长度错误同时保留输入，修正后保存', async () => {
    const view = setupRates()
    await fill(view, { taxRate: '6.5', unitPrice: '1.234', contractNo: 'X'.repeat(21) })
    expect(view.errors.value).toMatchObject({ taxRate: expect.any(String), unitPrice: expect.any(String), contractNo: expect.any(String) })
    const before = JSON.stringify(data.state.airSupplierRates)
    expect(view.save()).toBe(false)
    expect(JSON.stringify(data.state.airSupplierRates)).toBe(before)
    expect(view.draft.value.unitPrice).toBe('1.234')
    Object.assign(view.draft.value, { taxRate: 0, unitPrice: 0, contractNo: 'X'.repeat(20) })
    expect(view.errors.value).toEqual({})
    expect(view.save()).toBe(true)
  })

  it('新增重叠及过期规则编辑被同一校验阻止', async () => {
    const view = setupRates()
    await fill(view, { partnerId: 'PT-00027' })
    const before = JSON.stringify(data.state.airSupplierRates)
    expect(view.errors.value.endDate).toContain('重叠')
    expect(view.save()).toBe(false)
    await view.open('edit', data.state.airSupplierRates.find(row => row.endDate < airSupplierRates.AIR_RATE_TODAY))
    view.draft.value.endDate = '2026-10-31'
    expect(view.errors.value.endDate).toContain('超期')
    expect(view.save()).toBe(false)
    expect(JSON.stringify(data.state.airSupplierRates)).toBe(before)
  })

  it('来源档案缺失不会沿用失效的选项继续保存', async () => {
    const view = setupRates()
    await fill(view)
    data.state.partners.splice(data.state.partners.findIndex(row => row.id === view.draft.value.partnerId), 1)
    data.state.financeCostItems.splice(data.state.financeCostItems.findIndex(row => row.id === view.draft.value.feeItemId), 1)
    expect(view.errors.value).toMatchObject({ partnerId: expect.any(String), feeItemId: expect.any(String) })
    expect(view.save()).toBe(false)
    expect(view.partyName(view.draft.value.partnerId)).toBe('档案不可用')
    expect(view.feeName(view.draft.value.feeItemId)).toBe('成本项目不可用')
  })
})

describe('GJ-007 查询、计费方式与状态', () => {
  it('五项查询暂存后提交，供应商和成本类型按名称模糊匹配且不丢编辑草稿', async () => {
    const view = setupRates()
    await fill(view)
    const draft = clone(view.draft.value)
    Object.assign(view.filters.value, { supplier: '东方', feeItem: '运费', status: '已生效', billingUnit: '提单计费重(kg)', serviceType: '订舱' })
    expect(view.rows.value).toHaveLength(6)
    view.query()
    expect(view.applied.value).toEqual(view.filters.value)
    expect(view.rows.value.map(row => row.id)).toEqual(['ASR-00000001'])
    view.filters.value.supplier = '不匹配'
    expect(view.rows.value).toHaveLength(1)
    view.query()
    expect(view.rows.value).toHaveLength(0)
    view.resetQuery()
    expect(Object.keys(view.filters.value)).toHaveLength(5)
    expect(Object.values(view.filters.value).every(value => value === '')).toBe(true)
    expect(view.applied.value).toEqual(view.filters.value)
    expect(view.rows.value).toHaveLength(6)
    expect(view.draft.value).toEqual(draft)
    expect(view.mode.value).toBe('create')
    expect(context.confirm).not.toHaveBeenCalled()
  })

  it('计费方式切换清空单价和明细并展示编辑差异警告', async () => {
    const view = setupRates()
    await view.open('edit', data.state.airSupplierRates[0])
    view.draft.value.details = [{ unitPrice: 100 }]
    view.draft.value.chargeMethod = '梯度报价'
    view.changeMethod()
    expect(view.draft.value).toMatchObject({ unitPrice: '', details: [] })
    expect(view.methodChanged.value).toBe(true)
    expect(templates['views/AirSupplierRatesView']).toContain('与之前的计费方式不一致，请确认后继续操作')
    expect(view.errors.value.details).toContain('待确认')
    expect(view.save()).toBe(false)
    view.draft.value.chargeMethod = '常规方式'
    view.changeMethod()
    expect(view.methodChanged.value).toBe(false)
    expect(view.errors.value.unitPrice).toBeTruthy()
  })

  it.each([
    ['梯度报价', ['startValue', 'endValue', 'description']],
    ['航晟运输报价', ['pickup', 'delivery', 'vehicleType', 'regulated', 'specialVehicle', 'tailLift']],
    ['首加续报价', ['startValue', 'additionalValue', 'billingUnit', 'description']],
  ])('%s 使用真实明细schema，来源字段只读且未确认写入口不能提交', async (method, sources) => {
    const view = setupRates()
    await fill(view, { chargeMethod: method, unitPrice: '' })
    view.showMethod()
    const dialog = setupMethod({ context: view.methodDialog.value })
    expect(view.methodDialog.value).toMatchObject({ method, readonly: false, rows: [], partnerName: '南方航空', feeItemName: '运费成本' })
    expect(dialog.fields.value.filter(field => field.source).map(field => field.key)).toEqual(sources)
    expect(dialog.reason.value).toContain('待确认')
    expect(dialog.rows.value).toEqual([])
    expect(templates['components/AirRateMethodDialog']).toContain(':readonly="field.source"')
    expect(templates['components/AirRateMethodDialog']).toContain(':disabled="!field.source"')
    expect(templates['components/AirRateMethodDialog']).toContain('type="primary" disabled>提交')
    const before = JSON.stringify(data.state.airSupplierRates)
    expect(view.save()).toBe(false)
    view.methodDialog.value = null
    expect(view.errors.value.details).toBe(dialog.reason.value)
    expect(view.save()).toBe(false)
    expect(JSON.stringify(data.state.airSupplierRates)).toBe(before)
  })

  it('只读计费详情克隆明细，首加续单位继承父规则且未知来源和未配置不同', () => {
    const view = setupRates()
    const row = data.state.airSupplierRates.find(item => item.chargeMethod === '首加续报价')
    row.details = [{ startValue: 10, unitPrice: 3 }]
    view.showMethod(row, true)
    const dialog = setupMethod({ context: view.methodDialog.value })
    expect(view.methodDialog.value.readonly).toBe(true)
    dialog.rows.value[0].unitPrice = 99
    expect(row.details[0].unitPrice).toBe(3)
    expect(dialog.value({}, { key: 'billingUnit', source: true })).toBe(row.billingUnit)
    expect(dialog.value({}, { key: 'additionalValue', source: true })).toBe('来源待确认')
    expect(dialog.value({}, { key: 'unitPrice' })).toBe('未配置')
    expect(dialog.value({ unitPrice: 0 }, { key: 'unitPrice' })).toBe('0')
  })

  it('失效需确认，启用恢复同一记录；编辑时启停均不能执行', async () => {
    const view = setupRates()
    const row = data.state.airSupplierRates[0]
    context.confirm.mockRejectedValueOnce('cancel')
    await view.toggle(row, 'disable')
    expect(row.status).toBe('已生效')
    await view.toggle(row, 'disable')
    expect(row.status).toBe('失效')
    await view.toggle(row, 'enable')
    expect(row.status).toBe('已生效')
    await view.open('edit', row)
    const calls = context.confirm.mock.calls.length
    expect(view.actionFor(row, 'disable')).toMatchObject({ allowed: false, reason: expect.stringContaining('先保存或取消') })
    await view.toggle(row, 'disable')
    await view.toggle(row, 'enable')
    expect(row.status).toBe('已生效')
    expect(context.confirm).toHaveBeenCalledTimes(calls)
  })

  it('超期及非普通报价启用阻断，不弹出会误导的确认框', async () => {
    const view = setupRates()
    for (const row of data.state.airSupplierRates.filter(item => item.endDate < airSupplierRates.AIR_RATE_TODAY || item.chargeMethod !== '常规方式')) {
      const before = JSON.stringify(row)
      await view.toggle(row, 'enable')
      expect(JSON.stringify(row)).toBe(before)
    }
    expect(context.confirm).not.toHaveBeenCalled()
    expect(feedback.ElMessage.warning).toHaveBeenCalled()
  })
})

describe('GJ-007 草稿保护、权限和来源一致性', () => {
  it('新增或切换目标可取消保留草稿，确认后丢弃且不隐式保存', async () => {
    const view = setupRates()
    await fill(view)
    const draft = clone(view.draft.value)
    const before = JSON.stringify(data.state.airSupplierRates)
    context.confirm.mockRejectedValueOnce('cancel')
    await view.open('edit', data.state.airSupplierRates[0])
    expect(view.mode.value).toBe('create')
    expect(view.draft.value).toEqual(draft)
    await view.open('create')
    expect(view.draft.value).toEqual(airSupplierRates.createAirSupplierRateDraft())
    expect(view.dirty.value).toBe(false)
    Object.assign(view.draft.value, draft)
    await view.open('edit', data.state.airSupplierRates[0])
    expect(view.mode.value).toBe('edit')
    expect(view.draft.value).toEqual(data.state.airSupplierRates[0])
    expect(JSON.stringify(data.state.airSupplierRates)).toBe(before)
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
  })

  it('取消关闭保留草稿，确认丢弃后回到已保存值', async () => {
    const view = setupRates()
    const row = data.state.airSupplierRates[0]
    await view.open('edit', row)
    view.draft.value.contractNo = '未保存编号'
    const done = vi.fn()
    context.confirm.mockRejectedValueOnce('cancel')
    await view.close(done)
    expect(view.draft.value.contractNo).toBe('未保存编号')
    expect(done).not.toHaveBeenCalled()
    await view.close(done)
    expect(done).toHaveBeenCalledOnce()
    expect(view.mode.value).toBe('')
    await view.open('edit', row)
    expect(view.draft.value.contractNo).toBe(row.contractNo)
  })

  it('浏览器离开、路由离开及路由更新使用同一个草稿保护', async () => {
    const windowAdapter = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('window', windowAdapter)
    const view = setupRates()
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    view.beforeUnload(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    await fill(view)
    view.beforeUnload(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe('')
    expect(context.leaveGuard).toBe(context.updateGuard)
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.leaveGuard()).toBe(false)
    expect(await context.updateGuard()).toBe(true)
    context.mounted.forEach(callback => callback())
    context.unmounted.forEach(callback => callback())
    expect(windowAdapter.addEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
    expect(windowAdapter.removeEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
  })

  it.each(['service', 'groundSupervisor', 'hangsheng', 'finance'])('%s 无空运客服主管维护权限，原草稿不能越权保存且仍可只读查看', async persona => {
    const view = setupRates()
    await fill(view)
    const before = JSON.stringify(data.state.airSupplierRates)
    data.selectWorkbenchPersona(persona)
    expect(view.save()).toBe(false)
    await nextTick()
    expect(view.mode.value).toBe('')
    expect(view.permission.value).toMatchObject({ create: false, edit: false, toggle: false })
    await view.open('create')
    await view.open('edit', data.state.airSupplierRates[0])
    await view.toggle(data.state.airSupplierRates[0], 'disable')
    expect(view.mode.value).toBe('')
    expect(context.confirm).not.toHaveBeenCalled()
    expect(JSON.stringify(data.state.airSupplierRates)).toBe(before)
    expect(() => data.saveAirSupplierRate(validDraft())).toThrow('仅客服主管')
    await view.open('detail', data.state.airSupplierRates[0])
    expect(view.readonly.value).toBe(true)
  })

  it.each(['switch', 'leave', 'toggle'])('%s 确认期间切换角色取消旧请求，忙碌状态不重复执行', async action => {
    const view = setupRates()
    if (action !== 'toggle') await fill(view)
    const resolve = delayedConfirmation()
    const before = JSON.stringify(data.state.airSupplierRates)
    const pending = action === 'switch' ? view.open('edit', data.state.airSupplierRates[0]) : action === 'leave' ? context.leaveGuard() : view.toggle(data.state.airSupplierRates[0], 'disable')
    expect(view.busy.value).toBe(true)
    await view.open('create')
    await view.toggle(data.state.airSupplierRates[0], 'disable')
    expect(context.confirm).toHaveBeenCalledOnce()
    data.selectWorkbenchPersona('groundSupervisor')
    await nextTick()
    resolve('confirm')
    const result = await pending
    if (action === 'leave') expect(result).toBe(false)
    expect(view.mode.value).toBe('')
    expect(view.busy.value).toBe(false)
    expect(JSON.stringify(data.state.airSupplierRates)).toBe(before)
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
  })

  it.each(['switch', 'leave', 'toggle'])('%s 确认期间重置再恢复原角色，不操作同ID的新来源', async action => {
    const view = setupRates()
    if (action !== 'toggle') await fill(view)
    const resolve = delayedConfirmation()
    const pending = action === 'switch' ? view.open('edit', data.state.airSupplierRates[0]) : action === 'leave' ? context.leaveGuard() : view.toggle(data.state.airSupplierRates[0], 'disable')
    data.reset()
    await nextTick()
    data.selectWorkbenchPersona('supervisor')
    await nextTick()
    const before = JSON.stringify(data.state.airSupplierRates)
    resolve('confirm')
    const result = await pending
    if (action === 'leave') expect(result).toBe(false)
    expect(view.mode.value).toBe('')
    expect(view.busy.value).toBe(false)
    expect(JSON.stringify(data.state.airSupplierRates)).toBe(before)
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
  })

  it('详情来源移除后关闭旧对象；旧行引用不能重新打开', async () => {
    const view = setupRates()
    const row = data.state.airSupplierRates[0]
    await view.open('detail', row)
    data.state.airSupplierRates.splice(0, 1)
    await nextTick()
    expect(view.mode.value).toBe('')
    expect(view.selectedId.value).toBe('')
    expect(feedback.ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('已不存在'))
    await view.open('edit', row)
    expect(view.mode.value).toBe('')
  })

  it('供应商档案导航保留类型上下文，已引用档案删除被阻止', () => {
    const view = setupRates()
    const partner = { ...clone(data.state.partners.find(row => row.id === 'PT-00031')), id: 'PT-TEST-007', name: '报价引用检查供应商' }
    data.state.partners.push(partner)
    const saved = data.saveAirSupplierRate(validDraft({ partnerId: partner.id }))
    view.goPartners()
    expect(context.push).toHaveBeenCalledWith({ path: '/foundation/partners', query: { type: '供应商' } })
    data.selectWorkbenchPersona('finance')
    data.setPartnerActive(saved.partnerId, false)
    const before = JSON.stringify(data.state.partners)
    expect(() => data.deletePartner(saved.partnerId)).toThrow('空运供应商价格引用')
    expect(JSON.stringify(data.state.partners)).toBe(before)
  })

  it('演示重置恢复确定的六条价格与费用来源并关闭方法浮层', async () => {
    const view = setupRates()
    data.saveAirSupplierRate(validDraft())
    await fill(view, { chargeMethod: '梯度报价' })
    view.showMethod()
    expect(view.methodDialog.value).toBeTruthy()
    data.reset()
    await nextTick()
    expect(data.state.airSupplierRates).toEqual(airSupplierRates.createAirSupplierRateSeed())
    expect(data.state.financeCostItems).toEqual(airSupplierRates.createFinanceCostItemSeed())
    expect(data.state.airSupplierRateSequence).toBe(6)
    expect(view.mode.value).toBe('')
    expect(view.methodDialog.value).toBe(null)
  })

  it('复用十条默认分页，页大小或查询结果变化时回到有效页', async () => {
    const rows = Array.from({ length: 23 }, (_, index) => ({ id: `AIR-RATE-${index + 1}` }))
    expect(templates['views/AirSupplierRatesView']).toContain('<DataTableFrame :key="JSON.stringify(applied)" :rows="rows">')
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
