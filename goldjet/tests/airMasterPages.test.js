import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, nextTick, reactive } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as airMasterData from '../src/domain/airMasterData.js'
import * as airMasterActions from '../src/data/airMasterActions.js'

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

// Execute the real setup source and shared owner; replace only router and browser adapters.
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
    '../domain/airMasterData.js': airMasterData,
    '../data/airMasterActions.js': airMasterActions,
  }
  const imported = { defineProps: () => context.props }
  let body = parsed.descriptor.scriptSetup.content
  const declarations = script.scriptSetupAst.filter(node => node.type === 'ImportDeclaration')
  for (const node of declarations) {
    const module = modules[node.source.value] || { default: {} }
    for (const specifier of node.specifiers) imported[specifier.local.name] = specifier.type === 'ImportDefaultSpecifier' ? module.default : module[specifier.imported.name]
  }
  for (const node of declarations.toReversed()) body = body.slice(0, node.start) + body.slice(node.end)
  const bindings = Object.keys(script.bindings).filter(key => !script.bindings[key].startsWith('props'))
  const run = new Function(...Object.keys(imported), `${body}\nreturn { ${bindings.join(', ')} }`)
  return (props = {}) => {
    context.props = reactive(props)
    const scope = effectScope()
    scopes.push(scope)
    return scope.run(() => run(...Object.values(imported)))
  }
}
const setupMaster = loadComponent('views/AirMasterDataView')
const setupTable = loadComponent('components/DataTableFrame')
const clone = value => JSON.parse(JSON.stringify(value))
const validDraft = kind => {
  const row = clone(data.state.airMaster[kind][0])
  delete row.id
  return {
    ...row,
    ...(kind === 'airlines' ? { code: 'Q1', name: '页面演示航空', prefix: '991' } : {}),
    ...(kind === 'ports' ? { code: 'DEM', name: '页面演示机场', englishName: 'Page Demo Airport' } : {}),
    ...(kind === 'flights' ? { code: 'MU9910' } : {}),
    ...(kind === 'pallets' ? { code: 'PAGE-DEMO' } : {}),
  }
}
function setup(kind = 'airlines') {
  context.route = reactive({ path: '/foundation/air-master-data', query: { tab: kind } })
  return setupMaster()
}
async function navigate(kind) {
  if (!await context.updateGuard()) return false
  context.route.query = { tab: kind }
  await nextTick()
  return true
}

beforeEach(() => {
  data.reset()
  data.selectWorkbenchPersona('masterAdmin')
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

describe('GJ-004 主数据页面保存与只读边界', () => {
  it.each(['airlines', 'ports', 'flights', 'pallets'])('%s 从新增草稿提交到同一管理列表，并可再次编辑', async kind => {
    const view = setup(kind)
    const count = view.rows.value.length
    view.open('create')
    Object.assign(view.draft, validDraft(kind))
    expect(view.errors.value).toEqual({})
    expect(view.dirty.value).toBe(true)
    expect(view.rows.value).toHaveLength(count)
    await view.save()
    expect(view.mode.value).toBe('')
    expect(view.rows.value).toHaveLength(count + 1)
    expect(feedback.ElMessage.success).toHaveBeenLastCalledWith('提交成功')
    const saved = view.rows.value.at(-1)
    const field = kind === 'airlines' ? 'printTitle' : kind === 'ports' ? 'englishName' : kind === 'flights' ? 'model' : 'alias'
    const original = saved[field]
    view.open('edit', saved)
    const changed = kind === 'pallets' ? '已改演示板' : 'Page edited demo'
    view.draft[field] = changed
    expect(saved[field]).toBe(original)
    expect(view.errors.value).toEqual({})
    await view.save()
    expect(saved[field]).toBe(changed)
    expect(view.mode.value).toBe('')
    expect(feedback.ElMessage.success).toHaveBeenLastCalledWith('提交修改成功')
  })

  it('多选草稿独立于已保存记录，未通过校验不消费编号或保存', async () => {
    const view = setup()
    const row = data.state.airMaster.airlines[0]
    const before = JSON.stringify(data.state.airMaster)
    view.open('edit', row)
    view.draft.supplierIds.push('UNKNOWN')
    view.draft.prefix = ''
    expect(row.supplierIds).not.toContain('UNKNOWN')
    expect(view.errors.value).toHaveProperty('supplierIds')
    expect(view.errors.value).toHaveProperty('prefix')
    await view.save()
    expect(view.mode.value).toBe('edit')
    expect(JSON.stringify(data.state.airMaster)).toBe(before)
    expect(data.state.airMasterSequence).toBe(0)
  })

  it('已引用字段的修改在页面提前呈现错误，而不是保存后才失败', async () => {
    const view = setup()
    const row = data.state.airMaster.airlines[0]
    view.open('edit', row)
    view.draft.code = 'Q1'
    expect(view.errors.value.code).toContain('引用')
    await view.save()
    expect(row.code).toBe('MU')
    expect(view.mode.value).toBe('edit')
  })

  it('详情和已关闭表单不能调用保存写回数据', async () => {
    const view = setup()
    const row = data.state.airMaster.airlines[0]
    const original = row.printTitle
    view.open('detail', row)
    expect(view.readonly.value).toBe(true)
    view.draft.printTitle = 'Unexpected detail edit'
    await view.save()
    expect(row.printTitle).toBe(original)
    expect(view.mode.value).toBe('detail')
    await view.close()
    await view.save()
    expect(row.printTitle).toBe(original)
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
  })

  it('只读角色不能打开新增、编辑或删除，角色改变后旧草稿也不能提交', async () => {
    const view = setup('ports')
    const row = data.state.airMaster.ports[0]
    view.open('edit', row)
    view.draft.englishName = 'Unsaved airport'
    data.selectWorkbenchPersona('service')
    const before = JSON.stringify(data.state.airMaster)
    await view.save()
    await nextTick()
    expect(view.mode.value).toBe('')
    view.open('create')
    view.open('edit', row)
    await view.remove([row.id])
    expect(view.mode.value).toBe('')
    expect(JSON.stringify(data.state.airMaster)).toBe(before)
    expect(context.confirm).not.toHaveBeenCalled()
    view.open('detail', row)
    expect(view.mode.value).toBe('detail')
  })

  it('国家改变清除旧城市和城市代码，并只提供新国家的城市候选', () => {
    const view = setup('ports')
    view.open('create')
    view.draft.country = 'China'
    view.change({ key: 'country' })
    expect(view.draft.countryCode).toBe('CN')
    view.draft.city = 'Shanghai'
    view.change({ key: 'city' })
    expect(view.draft.cityCode).toBe('SHA')
    view.draft.country = 'Japan'
    view.change({ key: 'country' })
    expect(view.draft).toMatchObject({ countryCode: 'JP', city: '', cityCode: '' })
    expect(view.options({ key: 'city' })).toEqual([{ value: 'Tokyo', label: 'Tokyo' }])
    view.draft.city = 'Tokyo'
    view.change({ key: 'city' })
    expect(view.draft.cityCode).toBe('TYO')
  })
})

describe('GJ-004 草稿取消和离开保护', () => {
  it('取消放弃保留草稿，确认放弃关闭且不改变已保存记录', async () => {
    const view = setup()
    const row = data.state.airMaster.airlines[0]
    const done = vi.fn()
    view.open('edit', row)
    view.draft.printTitle = 'Unsaved title'
    context.confirm.mockRejectedValueOnce('cancel')
    await view.close(done)
    expect(view.mode.value).toBe('edit')
    expect(view.draft.printTitle).toBe('Unsaved title')
    expect(done).not.toHaveBeenCalled()
    await view.close(done)
    expect(view.mode.value).toBe('')
    expect(done).toHaveBeenCalledOnce()
    view.open('edit', row)
    expect(view.draft.printTitle).toBe(row.printTitle)
    expect(view.dirty.value).toBe(false)
  })

  it('未关闭当前编辑时另一个打开意图不能覆盖草稿', () => {
    const view = setup()
    const [first, second] = data.state.airMaster.airlines
    view.open('edit', first)
    view.draft.printTitle = 'Unsaved title'
    view.open('edit', second)
    expect(view.selected.value.id).toBe(first.id)
    expect(view.draft.printTitle).toBe('Unsaved title')
    view.open('create')
    expect(view.mode.value).toBe('edit')
    expect(view.selected.value.id).toBe(first.id)
  })

  it('分类切换取消保留当前草稿，确认后切换并清除筛选和选择', async () => {
    const view = setup()
    view.inputKeyword.value = '东方'
    view.keyword.value = '东方'
    view.selectedIds.value = ['AIRLINE-MU']
    view.open('create')
    view.draft.name = 'Unsaved airline'
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await navigate('ports')).toBe(false)
    expect(view.kind.value).toBe('airlines')
    expect(view.draft.name).toBe('Unsaved airline')
    expect(await navigate('ports')).toBe(true)
    expect(view.kind.value).toBe('ports')
    expect(view.mode.value).toBe('')
    expect(view.inputKeyword.value).toBe('')
    expect(view.keyword.value).toBe('')
    expect(view.selectedIds.value).toEqual([])
  })

  it('关闭、路由离开及浏览器离开在未保存或操作中保持一致', async () => {
    const view = setup()
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    view.beforeUnload(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    view.open('create')
    view.draft.name = 'Unsaved airline'
    view.beforeUnload(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe('')
    view.busy.value = true
    await view.close()
    expect(await context.leaveGuard()).toBe(false)
    expect(await context.updateGuard()).toBe(false)
    expect(view.mode.value).toBe('create')
    expect(context.confirm).not.toHaveBeenCalled()
    view.busy.value = false
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.leaveGuard()).toBe(false)
    expect(await context.leaveGuard()).toBe(true)
  })
})

describe('GJ-004 查询、批量删除与分页', () => {
  it('输入先留在待查询条件，查询及重置同步清除表格选择', async () => {
    const view = setup()
    view.table.value = { clearSelection: vi.fn() }
    const count = view.rows.value.length
    view.inputKeyword.value = '  东方  '
    expect(view.rows.value).toHaveLength(count)
    view.selectedIds.value = ['AIRLINE-MU']
    view.query()
    await nextTick()
    expect(view.keyword.value).toBe('东方')
    expect(view.rows.value.map(row => row.code)).toEqual(['MU'])
    expect(view.selectedIds.value).toEqual([])
    expect(view.table.value.clearSelection).toHaveBeenCalled()
    view.inputKeyword.value = '不匹配的机场'
    expect(view.rows.value.map(row => row.code)).toEqual(['MU'])
    view.query()
    expect(view.rows.value).toHaveLength(0)
    view.resetQuery()
    expect(view.inputKeyword.value).toBe('')
    expect(view.keyword.value).toBe('')
    expect(view.rows.value).toHaveLength(count)
  })

  it('批量删除取消不修改；确认后删除全部目标并清空选择', async () => {
    data.selectWorkbenchPersona('masterFinance')
    const view = setup()
    const first = data.saveAirMaster('airlines', validDraft('airlines'))
    const second = data.saveAirMaster('airlines', { ...validDraft('airlines'), code: 'Q2', name: '另一页面航空', prefix: '992' })
    const targets = [first.id, second.id]
    view.selectedIds.value = targets
    view.table.value = { clearSelection: vi.fn() }
    const before = JSON.stringify(data.state.airMaster)
    context.confirm.mockRejectedValueOnce('cancel')
    await view.remove(targets)
    expect(JSON.stringify(data.state.airMaster)).toBe(before)
    expect(view.selectedIds.value).toEqual(targets)
    await view.remove(targets)
    expect(data.state.airMaster.airlines.some(row => targets.includes(row.id))).toBe(false)
    expect(view.selectedIds.value).toEqual([])
    expect(view.table.value.clearSelection).toHaveBeenCalled()
    expect(feedback.ElMessage.success).toHaveBeenLastCalledWith('删除成功')
  })

  it('批量包含引用记录时整体失败且用户收到原因', async () => {
    data.selectWorkbenchPersona('masterFinance')
    const view = setup()
    const created = data.saveAirMaster('airlines', validDraft('airlines'))
    const before = JSON.stringify(data.state.airMaster)
    await view.remove([created.id, 'AIRLINE-MU'])
    expect(JSON.stringify(data.state.airMaster)).toBe(before)
    expect(feedback.ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('引用'))
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
    expect(view.busy.value).toBe(false)
  })

  it.each(['kind', 'role'])('删除等待确认时 %s 改变不能作用于新的页面上下文', async change => {
    data.selectWorkbenchPersona('masterFinance')
    const view = setup()
    const created = data.saveAirMaster('airlines', validDraft('airlines'))
    let confirm
    context.confirm.mockImplementationOnce(() => new Promise(resolve => { confirm = resolve }))
    const pending = view.remove([created.id])
    expect(view.busy.value).toBe(true)
    await view.remove([created.id])
    expect(context.confirm).toHaveBeenCalledOnce()
    if (change === 'kind') context.route.query = { tab: 'ports' }
    else data.selectWorkbenchPersona('service')
    await nextTick()
    confirm('confirm')
    await pending
    expect(data.state.airMaster.airlines.some(row => row.id === created.id)).toBe(true)
    expect(feedback.ElMessage.success).not.toHaveBeenCalled()
    expect(view.busy.value).toBe(false)
  })

  it('确认期间原选择数组改变不能改变已确认的删除对象', async () => {
    data.selectWorkbenchPersona('masterFinance')
    const view = setup()
    const created = data.saveAirMaster('airlines', validDraft('airlines'))
    const ids = [created.id]
    let confirm
    context.confirm.mockImplementationOnce(() => new Promise(resolve => { confirm = resolve }))
    const pending = view.remove(ids)
    ids.push('AIRLINE-MU')
    confirm('confirm')
    await pending
    expect(data.state.airMaster.airlines.some(row => row.id === created.id)).toBe(false)
    expect(data.state.airMaster.airlines.some(row => row.id === 'AIRLINE-MU')).toBe(true)
    expect(feedback.ElMessage.success).toHaveBeenLastCalledWith('删除成功')
  })

  it('角色改变及数据源移除行时同步清除隐藏选择', async () => {
    const view = setup()
    view.table.value = { clearSelection: vi.fn() }
    view.selectedIds.value = ['AIRLINE-MU']
    data.selectWorkbenchPersona('service')
    await nextTick()
    expect(view.selectedIds.value).toEqual([])
    expect(view.table.value.clearSelection).toHaveBeenCalled()
    data.selectWorkbenchPersona('masterFinance')
    await nextTick()
    view.selectedIds.value = ['AIRLINE-MU']
    data.state.airMaster.airlines = data.state.airMaster.airlines.filter(row => row.id !== 'AIRLINE-MU')
    await nextTick()
    expect(view.selectedIds.value).toEqual([])
  })

  it('详情来源被移除时关闭旧对象并给出明确反馈', async () => {
    const view = setup()
    view.open('detail', data.state.airMaster.airlines[0])
    await nextTick()
    data.state.airMaster.airlines = data.state.airMaster.airlines.filter(row => row.id !== 'AIRLINE-MU')
    await nextTick()
    expect(view.mode.value).toBe('')
    expect(view.selectedId.value).toBe('')
    expect(feedback.ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('已不存在'))
  })

  it('复用表格的页码、页大小和结果收缩保持当前数据区一致', async () => {
    const rows = Array.from({ length: 23 }, (_, index) => ({ id: `ROW-${index + 1}` }))
    const table = setupTable({ rows, pageSize: 10, pageSizes: [10, 20, 50], selectedCount: 0, selectable: true })
    expect(table.total.value).toBe(23)
    expect(table.pageRows.value.map(row => row.id)).toEqual(rows.slice(0, 10).map(row => row.id))
    table.page.value = 3
    expect(table.pageRows.value.map(row => row.id)).toEqual(['ROW-21', 'ROW-22', 'ROW-23'])
    table.size.value = 20
    await nextTick()
    expect(table.page.value).toBe(1)
    expect(table.pageRows.value).toHaveLength(20)
    table.page.value = 2
    context.props.rows = rows.slice(0, 2)
    await nextTick()
    expect(table.page.value).toBe(1)
    expect(table.total.value).toBe(2)
    expect(table.pageRows.value.map(row => row.id)).toEqual(['ROW-1', 'ROW-2'])
  })
})
