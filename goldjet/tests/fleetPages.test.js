import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, nextTick, reactive } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as fleetOperations from '../src/domain/fleetOperations.js'

const data = usePrototypeData()
const context = { leaveGuard: null, updateGuard: null, push: vi.fn(), confirm: vi.fn(), emit: vi.fn(), props: {}, mounted: [], unmounted: [] }
const feedback = { ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: context.confirm } }
const routerHooks = {
  useRouter: () => ({ push: context.push }),
  onBeforeRouteLeave: guard => { context.leaveGuard = guard },
  onBeforeRouteUpdate: guard => { context.updateGuard = guard },
}
const scopes = []

// Run the actual setup source with browser/router adapters, retaining the real data owner.
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
    '@element-plus/icons-vue': { Plus: {}, Refresh: {}, Search: {}, Delete: {}, Upload: {} },
    '../data/usePrototypeData.js': { usePrototypeData: () => data },
    '../domain/fleetOperations.js': fleetOperations,
  }
  const imported = { defineProps: () => context.props, defineEmits: () => context.emit }
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
const setupFleet = loadComponent('views/FleetView')
const setupCertificate = loadComponent('components/FleetCertificateField')
const valid = () => ({
  ...fleetOperations.createDriverDraft(), name: '新增页面演示司机', gender: '女', identityNo: '000000000000000099', phone: '00000001099',
  idCardFront: fleetOperations.createDriverSampleAttachment('idCardFront'), idCardBack: fleetOperations.createDriverSampleAttachment('idCardBack'),
  licenseImage: fleetOperations.createDriverSampleAttachment('licenseImage'), licenseClasses: ['C1'],
  licenseExpiry: '2028-01-01', qualificationExpiry: '2028-01-01', employmentType: '货物运输', drivingScore: '12',
})
function fillValid(view) { Object.assign(view.form, valid()) }

beforeEach(() => {
  data.reset()
  data.selectWorkbenchPersona('groundSupervisor')
  context.confirm.mockReset().mockResolvedValue('confirm')
  context.push.mockReset()
  context.emit.mockReset()
  context.mounted = []
  context.unmounted = []
  for (const fn of Object.values(feedback.ElMessage)) fn.mockReset()
})
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.unstubAllGlobals()
})

describe('GJ-017 司机页面实际编辑流程', () => {
  it('编辑基本信息、准驾车型及附件时只改变独立草稿', () => {
    const view = setupFleet()
    const driver = data.state.fleetDrivers[0]
    const before = JSON.stringify(driver)
    view.openForm(driver)
    expect(view.dirty.value).toBe(false)
    view.form.name = '草稿姓名'
    view.form.licenseClasses.push('B2')
    view.form.licenseImage.name = '草稿附件.png'
    expect(view.dirty.value).toBe(true)
    expect(JSON.stringify(driver)).toBe(before)
  })

  it('有效表单通过实际 owner 保存，列表与附件同步且不保留草稿引用', () => {
    const view = setupFleet()
    view.filters.keyword = '无匹配'
    view.query()
    view.openForm()
    fillValid(view)
    expect(view.errors.value).toEqual({})
    view.submit()
    const saved = data.state.fleetDrivers.find(row => row.id === view.selectedId.value)
    expect(saved).toMatchObject({ name: '新增页面演示司机', status: '正常', phone: '00000001099', updatedBy: '陈楠' })
    expect(fleetOperations.validateDriverAttachment(saved.idCardFront)).toBe('')
    expect(fleetOperations.validateDriverAttachment(saved.idCardBack)).toBe('')
    expect(fleetOperations.validateDriverAttachment(saved.licenseImage)).toBe('')
    expect(view.dialogVisible.value).toBe(false)
    expect(view.rows.value).toHaveLength(4)
    expect(view.filters.keyword).toBe('')
    view.form.licenseImage.name = '保存后的草稿改动.png'
    expect(saved.licenseImage.name).not.toBe(view.form.licenseImage.name)
    expect(feedback.ElMessage.success).toHaveBeenCalledWith('提交成功')
  })

  it('无效表单和只读角色的提交都不写入记录', async () => {
    const view = setupFleet()
    const before = JSON.stringify(data.state.fleetDrivers)
    view.openForm()
    fillValid(view)
    view.form.phone = '错误号码'
    view.submit()
    expect(view.errors.value.phone).toBeTruthy()
    expect(JSON.stringify(data.state.fleetDrivers)).toBe(before)
    view.form.phone = '00000001099'
    data.selectWorkbenchPersona('groundTransportSupervisor')
    view.submit()
    await nextTick()
    expect(view.canEdit.value).toBe(false)
    expect(view.dialogVisible.value).toBe(false)
    expect(JSON.stringify(data.state.fleetDrivers)).toBe(before)
    view.openForm()
    expect(view.dialogVisible.value).toBe(false)
  })

  it('取消放弃保留输入，确认放弃关闭表单且再次打开读取保存值', async () => {
    const view = setupFleet()
    const driver = data.state.fleetDrivers[0]
    const originalName = driver.name
    const done = vi.fn()
    view.openForm(driver)
    view.form.name = '未保存姓名'
    context.confirm.mockRejectedValueOnce('cancel')
    await view.closeForm(done)
    expect(view.dialogVisible.value).toBe(true)
    expect(view.form.name).toBe('未保存姓名')
    expect(done).not.toHaveBeenCalled()
    await view.closeForm(done)
    expect(view.dialogVisible.value).toBe(false)
    expect(done).toHaveBeenCalledOnce()
    expect(driver.name).toBe(originalName)
    view.openForm(driver)
    expect(view.form.name).toBe(originalName)
    expect(view.dirty.value).toBe(false)
  })

  it('图片读取期间阻止保存、关闭及离开，完成读取后才能提交', async () => {
    const view = setupFleet()
    view.openForm()
    fillValid(view)
    const before = JSON.stringify(data.state.fleetDrivers)
    view.uploads.idCardFront = true
    expect(view.uploading.value).toBe(true)
    view.submit()
    await view.closeForm()
    expect(await context.leaveGuard()).toBe(false)
    expect(await context.updateGuard()).toBe(false)
    expect(view.dialogVisible.value).toBe(true)
    expect(JSON.stringify(data.state.fleetDrivers)).toBe(before)
    expect(context.confirm).not.toHaveBeenCalled()
    view.uploads.idCardFront = false
    view.submit()
    expect(view.dialogVisible.value).toBe(false)
    expect(data.state.fleetDrivers).toHaveLength(4)
  })

  it('浏览器离开提示只在未保存或图片读取时触发', () => {
    const view = setupFleet()
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    view.beforeUnload(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    view.openForm()
    view.form.name = '未保存姓名'
    view.beforeUnload(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe('')
  })
})

describe('GJ-017 查询和司机任务', () => {
  it('姓名和手机号精确匹配，编辑筛选不提前改变列表，重置恢复全部', () => {
    const view = setupFleet()
    const driver = data.state.fleetDrivers[0]
    view.filters.keyword = driver.name.slice(0, -1)
    expect(view.rows.value).toHaveLength(3)
    view.query()
    expect(view.rows.value).toHaveLength(0)
    view.filters.keyword = driver.name
    expect(view.rows.value).toHaveLength(0)
    view.query()
    expect(view.rows.value.map(row => row.id)).toEqual([driver.id])
    view.filters.keyword = driver.phone
    view.query()
    expect(view.rows.value.map(row => row.id)).toEqual([driver.id])
    view.filters.keyword = driver.identityNo
    view.query()
    expect(view.rows.value).toHaveLength(0)
    view.resetQuery()
    expect(view.rows.value).toHaveLength(3)
  })

  it('详情读取真实运单、分离历史任务、保留待确认指标并发出可用深链', () => {
    const view = setupFleet()
    const driver = data.state.fleetDrivers.find(row => row.name === '演示司机甲')
    const running = data.state.groundWaybills.find(row => row.drivers.some(person => person.name === driver.name))
    data.state.groundWaybills.push({ ...running, id: 'HISTORY-1', waybillNo: 'HISTORY-001', status: '已卸货', receivable: null })
    view.openDetail(driver)
    expect(view.selected.value.id).toBe(driver.id)
    expect(view.taskRows.value.map(row => row.id)).toContain(running.id)
    expect(view.taskRows.value.map(row => row.id)).not.toContain('HISTORY-1')
    view.taskTab.value = 'history'
    expect(view.taskRows.value.map(row => row.id)).toEqual(['HISTORY-1'])
    for (const key of ['completed', 'year', 'month', 'week', 'amount']) expect(view.summary.value[key]).toBeNull()
    expect(view.summary.value.statisticsReason).toContain('待确认')
    expect(view.display(0)).toBe('0')
    expect(view.display(null)).toBe('未填写')
    view.openTask(running)
    expect(context.push).toHaveBeenLastCalledWith({ path: '/fulfillment/ground-waybills', query: { waybill: running.id } })
    view.openOrder(running)
    expect(context.push).toHaveBeenLastCalledWith({ path: '/fulfillment/ground-dispatch', query: { order: running.orderId, action: 'detail' } })
    view.openOrder({ orderNo: 'CAR-DEMO' })
    expect(context.push).toHaveBeenLastCalledWith({ path: '/fulfillment/ground-dispatch', query: { order: 'CAR-DEMO', action: 'detail' } })
  })
})

describe('GJ-017 证件组件选择和移除', () => {
  it('有效合成图片经读取和解码后才向表单提交文件对象', async () => {
    const sample = fleetOperations.createDriverSampleAttachment()
    vi.stubGlobal('FileReader', class {
      readAsDataURL() { this.result = sample.dataUrl; this.onload() }
    })
    vi.stubGlobal('Image', class { set src(value) { expect(value).toBe(sample.dataUrl); this.onload() } })
    const field = setupCertificate({ modelValue: null, label: '驾驶证', readonly: false })
    const event = { target: { files: [sample], value: sample.name } }
    await field.selectFile(event)
    expect(event.target.value).toBe('')
    expect(field.loading.value).toBe(false)
    expect(field.failure.value).toBe('')
    expect(context.emit.mock.calls.map(([name]) => name)).toEqual(['busy', 'update:modelValue', 'busy'])
    expect(context.emit).toHaveBeenNthCalledWith(1, 'busy', true)
    expect(context.emit).toHaveBeenLastCalledWith('busy', false)
    const attachment = context.emit.mock.calls.find(([name]) => name === 'update:modelValue')[1]
    expect(fleetOperations.validateDriverAttachment(attachment)).toBe('')
    expect(attachment.dataUrl).toBe(sample.dataUrl)
  })

  it('超限或错误扩展名在读取之前被拒绝', async () => {
    const reader = vi.fn()
    vi.stubGlobal('FileReader', reader)
    const field = setupCertificate({ modelValue: null, label: '驾驶证', readonly: false })
    for (const file of [{ name: 'demo.png', size: fleetOperations.DRIVER_ATTACHMENT_LIMIT + 1 }, { name: 'demo.gif', size: 1 }]) {
      await field.selectFile({ target: { files: [file], value: file.name } })
      expect(field.failure.value).toContain('不超过 6 MB')
    }
    expect(reader).not.toHaveBeenCalled()
    expect(context.emit).not.toHaveBeenCalled()
  })

  it('解码失败不提交附件，并结束上传占用', async () => {
    const sample = fleetOperations.createDriverSampleAttachment()
    vi.stubGlobal('FileReader', class { readAsDataURL() { this.result = sample.dataUrl; this.onload() } })
    vi.stubGlobal('Image', class { set src(_value) { this.onerror() } })
    const field = setupCertificate({ modelValue: null, label: '驾驶证', readonly: false })
    await field.selectFile({ target: { files: [sample], value: sample.name } })
    expect(field.failure.value).toContain('图片内容无法读取')
    expect(context.emit.mock.calls).toEqual([['busy', true], ['busy', false]])
  })

  it('只读或已有图片时不接受另一个文件，删除取消保留附件', async () => {
    const sample = fleetOperations.createDriverSampleAttachment()
    const field = setupCertificate({ modelValue: sample, label: '驾驶证', readonly: true })
    await field.selectFile({ target: { files: [sample], value: sample.name } })
    expect(context.emit).not.toHaveBeenCalled()
    context.props.readonly = false
    await field.selectFile({ target: { files: [sample], value: sample.name } })
    expect(context.emit).not.toHaveBeenCalled()
    context.confirm.mockRejectedValueOnce('cancel')
    await field.remove()
    expect(context.emit).not.toHaveBeenCalled()
    await field.remove()
    expect(context.emit).toHaveBeenCalledWith('update:modelValue', null)
  })
})
