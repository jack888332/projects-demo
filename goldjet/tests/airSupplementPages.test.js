import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { effectScope, nextTick, reactive } from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as supplement from '../src/domain/airOrderSupplement.js'
import * as airOperations from '../src/domain/airOperations.js'
import * as serviceEditing from '../src/domain/airServiceEditing.js'
import * as childOrders from '../src/domain/airChildOrders.js'
import * as orderActions from '../src/data/airOrderActions.js'
import * as chargeWeight from '../src/domain/chargeWeight.js'

const data = usePrototypeData()
const route = reactive({ params: { orderId: '' }, query: {} })
const context = { props: {}, leave: null, update: null, mounted: [], unmounted: [], confirm: vi.fn(), push: vi.fn(), emit: vi.fn() }
const feedback = { ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: context.confirm } }
const scopes = []
const templates = {}

// Execute the real Vue setup and owner. Replace only router, lifecycle and feedback adapters.
function loadComponent(relativePath) {
  const filename = new URL(`../src/${relativePath}.vue`, import.meta.url)
  const parsed = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
  expect(parsed.errors).toEqual([])
  const script = compileScript(parsed.descriptor, { id: relativePath })
  templates[relativePath] = parsed.descriptor.template.content
  expect(compileTemplate({ source: templates[relativePath], filename: filename.pathname, id: relativePath, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  const modules = {
    vue: { ...vue, onMounted: callback => context.mounted.push(callback), onBeforeUnmount: callback => context.unmounted.push(callback) },
    'vue-router': { useRoute: () => route, useRouter: () => ({ push: context.push }), onBeforeRouteLeave: guard => { context.leave = guard }, onBeforeRouteUpdate: guard => { context.update = guard } },
    'element-plus': feedback,
    '@element-plus/icons-vue': new Proxy({}, { get: () => ({}) }),
    '../data/usePrototypeData.js': { usePrototypeData: () => data },
    '../domain/airOrderSupplement.js': supplement,
    '../domain/airOperations.js': airOperations,
    '../domain/airServiceEditing.js': serviceEditing,
    '../domain/airChildOrders.js': childOrders,
    '../data/airOrderActions.js': orderActions,
    '../domain/chargeWeight.js': chargeWeight,
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
const setupView = loadComponent('views/AirOrderSupplementView')
const setupHouse = loadComponent('components/AirHouseBillDialog')
const setupAttachments = loadComponent('components/AirClearanceAttachments')
const setupServiceFields = loadComponent('components/AirServiceFields')
const setupServiceEdit = loadComponent('components/AirServiceEditDialog')
const setupChildOrders = loadComponent('views/AirChildOrdersView')
const setupOrderCreate = loadComponent('components/AirOrderCreateDialog')
const setupPrice = loadComponent('components/AirOrderPriceDialog')
const complete = draft => Object.assign(draft, { englishGoodsName: 'DEMO PARTS', shipper: 'DEMO SHIPPER', consignee: 'DEMO CONSIGNEE' })
const completeHouse = draft => Object.assign(complete(draft), { pieces: 42, grossWeight: 186.5, volume: 1.28 })

beforeEach(() => {
  data.reset()
  route.params = { orderId: data.state.airOrders[0].id }
  route.query = {}
  context.confirm.mockReset().mockResolvedValue('confirm')
  context.push.mockReset()
  context.emit.mockReset()
  context.leave = null
  context.update = null
  context.mounted = []
  context.unmounted = []
  Object.values(feedback.ElMessage).forEach(fn => fn.mockReset())
})
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals() })

describe('GJ-009 补录页面及字段动作', () => {
  it('必填校验阻断写入，独立草稿提交回同一订单并返回主列表', () => {
    const view = setupView()
    const order = data.state.airOrders[0]
    expect(view.submit()).toBe(false)
    expect(order.supplement).toBeUndefined()
    expect(view.errors.value).toMatchObject({ englishGoodsName: expect.any(String), shipper: expect.any(String), consignee: expect.any(String) })
    complete(view.draft.value)
    expect(order.supplement).toBeUndefined()
    expect(view.submit()).toBe(true)
    expect(order.orderStatus).toBe('待出提单')
    expect(order.supplement.englishGoodsName).toBe('DEMO PARTS')
    expect(context.push).toHaveBeenLastCalledWith({ path: '/fulfillment/air-orders', query: { order: order.id } })
    expect(order.services.some(service => service.type === 'preallocation')).toBe(false)
  })

  it('类型切换保留服务输入，主单隐藏服务不参与提交，切回恢复选择', () => {
    const view = setupView()
    complete(view.draft.value)
    view.draft.value.groundServices.customs = true
    view.draft.value.groundServices.clearance = true
    view.draft.value.customs.remark = '保留报关说明'
    view.draft.value.clearance.deliveryAddress = '保留派送地址'
    expect(view.errors.value['customs.attachments']).toBeTruthy()
    view.draft.value.orderType = '主单'
    expect(view.effectiveDraft.value.groundServices).toMatchObject({ customs: false, clearance: false })
    expect(view.errors.value.groundServices).toBeUndefined()
    expect(view.errors.value['customs.attachments']).toBeUndefined()
    view.draft.value.orderType = '直单'
    expect(view.effectiveDraft.value.groundServices).toMatchObject({ customs: true, clearance: true })
    expect(view.draft.value.customs.remark).toBe('保留报关说明')
    expect(view.draft.value.clearance.deliveryAddress).toBe('保留派送地址')
  })

  it('报关与安检派生品名显示当前补录草稿，未提交不污染订单', () => {
    const view = setupView()
    view.draft.value.englishGoodsName = 'NEW DEMO GOODS'
    expect(view.effectiveDraft.value.security.goodsName).toBe('NEW DEMO GOODS')
    expect(view.effectiveDraft.value.customs.goodsName).toBe('NEW DEMO GOODS')
    expect(data.state.airOrders[0].englishGoodsName).not.toBe('NEW DEMO GOODS')
  })

  it('待出提单仅代码可独立保存，其他补录不能再次提交', () => {
    const order = data.state.airOrders[0]
    data.saveAirSupplement(order.id, complete(supplement.createAirSupplementDraft(order, data.state.airMaster)))
    const view = setupView()
    expect(view.restriction.value).toBeTruthy()
    expect(view.canEditCode.value).toBe(true)
    view.draft.value.code = 'EAW'
    expect(view.dirty.value).toBe(true)
    expect(view.saveCode()).toBe(true)
    expect(order.code).toBe('EAW')
    expect(order.supplement.code).toBe('EAW')
    expect(view.dirty.value).toBe(false)
    expect(view.submit()).toBe(false)
    expect(view.restrictionMessage.value).toContain('补录已提交')
  })

  it.each(['待补录', '待出提单'])('本人航晟客服可修改合成主单代码（%s），普通主单及他人订单仍受限', orderStatus => {
    const order = data.state.airOrders[0]
    data.selectWorkbenchPersona('hangsheng')
    Object.assign(order, { creator: '陈楠', orderType: '合成主订单', orderStatus })
    const view = setupView()
    expect(view.canEditCode.value).toBe(true)
    view.draft.value.code = 'EAW'
    expect(view.saveCode()).toBe(true)
    expect(order.code).toBe('EAW')
    order.orderType = '直单'
    expect(view.canEditCode.value).toBe(false)
    view.draft.value.code = 'EAP'
    expect(view.saveCode()).toBe(false)
    expect(() => data.saveAirOrderCode(order.id, 'EAP')).toThrow('仅本人')
    Object.assign(order, { orderType: '合成主订单', creator: '其他客服' })
    expect(view.canEditCode.value).toBe(false)
    expect(() => data.saveAirOrderCode(order.id, 'EAP')).toThrow('仅本人')
    expect(order.code).toBe('EAW')
  })

  it('分单候选限制同客户、本人、未关联且有效；合成主单只保留详情', () => {
    const order = data.state.airOrders[0]
    const child = { id: 'CH-A', customer: order.customer, creator: order.creator, parentId: '', orderStatus: '子订单暂存' }
    data.state.airChildren = [child, { ...child, id: 'CH-B', deleted: true }, { ...child, id: 'CH-C', creator: '他人' }, { ...child, id: 'CH-D', parentId: 'OTHER' }, { ...child, id: 'CH-E', orderStatus: '已取消' }]
    const view = setupView()
    expect(view.importCandidates.value.map(row => row.id)).toEqual(['CH-A'])
    order.orderType = '合成主订单'
    expect(view.houseManagementRestriction.value).toContain('只读')
    expect(view.openImport()).toBe(false)
    expect(view.openHouse()).toBe(false)
  })

  it('收发货人弹窗取消保留草稿，离开确认不保存且角色变更使旧确认失效', async () => {
    const view = setupView()
    expect(view.openParty('shipper')).toBe(true)
    view.partyText.value = '未保存发货人'
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await view.closeParty()).toBe(false)
    expect(view.party.value).toBe('shipper')
    expect(view.draft.value.shipper).toBe('')
    expect(view.saveParty()).toBe(true)
    let resolve
    context.confirm.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const leaving = context.leave()
    expect(view.busy.value).toBe(true)
    expect(await context.leave()).toBe(false)
    data.selectWorkbenchPersona('operator')
    await nextTick()
    resolve('confirm')
    expect(await leaving).toBe(false)
    expect(data.state.airOrders[0].supplement).toBeUndefined()
    expect(view.busy.value).toBe(false)
  })
})

describe('GJ-009 分单填写与草稿保护', () => {
  it('提货省市区控件补齐后可保存，特种车和所有提货信息保留', () => {
    const order = data.state.airOrders[0]
    const dialog = setupHouse({ modelValue: true, order, child: null })
    completeHouse(dialog.draft.value)
    dialog.draft.value.services.pickup = true
    Object.assign(dialog.draft.value.pickup, { time: '2026-09-09 08:30', address: '演示提货仓', contact: '陈甲', phone: '00000000000', vehicleType: '监管车' })
    expect(dialog.errors.value['pickup.region']).toBeTruthy()
    expect(dialog.save()).toBe(false)
    dialog.draft.value.pickup.region = ['上海市', '上海市', '浦东新区']
    expect(dialog.errors.value).toEqual({})
    expect(dialog.save()).toBe(true)
    expect(data.state.airChildren[0].pickup).toMatchObject({ region: ['上海市', '上海市', '浦东新区'], vehicleType: '监管车', contact: '陈甲' })
    const fields = setupServiceFields({ kind: 'pickup', model: dialog.draft.value, readModel: null, readonly: false, errors: {}, prefix: '分单' })
    expect(fields.fields.value.find(field => field.key === 'region')).toMatchObject({ required: true, region: true })
    expect(fields.fields.value.find(field => field.key === 'vehicleType').options).toEqual(['监管车', '非监管车', '气垫车', '平板车'])
  })

  it('杂费仅展示明确默认值，不能通过修改草稿引入未确认条款', () => {
    const dialog = setupHouse({ modelValue: true, order: data.state.airOrders[0], child: null })
    completeHouse(dialog.draft.value)
    dialog.draft.value.otherCharges = 'FREIGHT COLLECT'
    expect(dialog.errors.value.otherCharges).toContain('待确认')
    expect(dialog.save()).toBe(false)
    expect(data.state.airChildren).toEqual([])
    expect(templates['components/AirHouseBillDialog']).toContain(':model-value="draft.otherCharges" readonly')
  })

  it('关闭确认取消保留草稿，确认丢弃关闭弹窗不创建记录', async () => {
    const dialog = setupHouse({ modelValue: true, order: data.state.airOrders[0], child: null })
    completeHouse(dialog.draft.value)
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await dialog.close()).toBe(false)
    expect(dialog.draft.value.englishGoodsName).toBe('DEMO PARTS')
    const done = vi.fn()
    expect(await dialog.close(done)).toBe(true)
    expect(done).toHaveBeenCalledOnce()
    expect(context.emit).toHaveBeenCalledWith('update:modelValue', false)
    expect(data.state.airChildren).toEqual([])
  })
})

describe('GJ-009 清关材料输入', () => {
  it('有效实际文件进入同一草稿；超大、格式与重复文件拒绝且保留原队列', () => {
    const attachment = setupAttachments({ modelValue: [], readonly: false, error: '' })
    const valid = new File(['demo'], 'demo.pdf', { type: 'application/pdf', lastModified: 1 })
    const event = files => ({ target: { files, value: 'selected' } })
    expect(attachment.selectFiles(event([valid]))).toBe(true)
    expect(context.emit).toHaveBeenLastCalledWith('update:modelValue', [valid])
    context.props.modelValue = [valid]
    expect(attachment.selectFiles(event([valid]))).toBe(false)
    expect(attachment.failure.value).toContain('重复')
    expect(attachment.selectFiles(event([new File(['x'], 'bad.exe')]))).toBe(false)
    expect(attachment.selectFiles(event([new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.pdf')]))).toBe(false)
    expect(attachment.failure.value).toContain('20 MB')
    expect(context.props.modelValue).toEqual([valid])
    expect(attachment.remove(0)).toBe(true)
    expect(context.emit).toHaveBeenLastCalledWith('update:modelValue', [])
  })

  it('只读文件不接受移除或选择，补录保存保留同一个可读取File', async () => {
    const file = new File(['DEMO CLEARANCE'], 'clearance.pdf', { type: 'application/pdf', lastModified: 1 })
    const attachment = setupAttachments({ modelValue: [file], readonly: true, error: '' })
    expect(attachment.remove(0)).toBe(false)
    expect(attachment.selectFiles({ target: { files: [file], value: 'x' } })).toBe(false)
    expect(context.emit).not.toHaveBeenCalled()
    const view = setupView()
    complete(view.draft.value)
    view.draft.value.groundServices.clearance = true
    expect(view.errors.value['clearance.attachments']).toBeTruthy()
    view.draft.value.clearance.attachments = [file]
    expect(view.submit()).toBe(true)
    const saved = data.state.airOrders[0].supplement.clearance.attachments[0]
    expect(saved).toBe(file)
    expect(await saved.text()).toBe('DEMO CLEARANCE')
  })

  it('替换同名同大小文件仍标记未保存，主单与分单共享附件组件', () => {
    const order = data.state.airOrders[0]
    const file = new File(['aaa'], 'same.pdf', { lastModified: 1 })
    const draft = complete(supplement.createAirSupplementDraft(order, data.state.airMaster))
    draft.clearance.attachments = [file]
    order.supplement = draft
    const view = setupView()
    expect(view.dirty.value).toBe(false)
    view.draft.value.clearance.attachments[0] = new File(['bbb'], 'same.pdf', { lastModified: 1 })
    expect(view.dirty.value).toBe(true)
    expect(templates['views/AirOrderSupplementView']).toContain('<AirServiceFields')
    expect(templates['components/AirHouseBillDialog']).toContain('<AirServiceFields')
    expect(templates['components/AirServiceFields']).toContain('<AirClearanceAttachments')
  })
})

describe('GJ-009 待服务修改入口和独立草稿', () => {
  function waitingWarehouse() {
    const order = data.state.airOrders[0]
    const service = { id: 'SERVICE-WH-TEST', type: 'warehouse', name: '仓储', status: '待服务', details: { operations: ['打托'] } }
    order.services.push(service)
    return { order, service: order.services.at(-1) }
  }

  it('点修改前只读，修改草稿不会变更原服务，保存保持同一服务并记录本地重发', () => {
    const { order, service } = waitingWarehouse()
    const page = setupView()
    expect(page.serviceVisible.value).toBe(false)
    expect(page.openService(service)).toBe(true)
    const dialog = setupServiceEdit({ modelValue: true, order, service, child: null })
    expect(dialog.restriction.value).toBe('')
    dialog.draft.value.warehouseOperations = ['拆托', '改标签']
    expect(service.details.operations).toEqual(['打托'])
    expect(dialog.save()).toBe(true)
    expect(service).toMatchObject({ id: 'SERVICE-WH-TEST', status: '待服务', details: { operations: ['拆托', '改标签'] }, resendCount: 1 })
    expect(order.warehouseOperations).toEqual(['拆托', '改标签'])
    expect(order.services.filter(row => row.id === 'SERVICE-WH-TEST')).toHaveLength(1)
  })

  it('服务中不能打开或保存，完成分单可独立修改其待服务服务', () => {
    const { order, service } = waitingWarehouse()
    const page = setupView()
    service.status = '服务中'
    expect(page.serviceRestriction(service)).toContain('仅待服务')
    expect(page.openService(service)).toBe(false)
    const denied = setupServiceEdit({ modelValue: true, order, service, child: null })
    denied.draft.value.warehouseOperations = ['全部']
    expect(denied.save()).toBe(false)
    service.status = '待服务'
    const child = { ...completeHouse(supplement.createHouseBillDraft(order)), id: 'EDIT-CHILD', parentId: order.id, customer: order.customer, creator: order.creator, orderStatus: '子订单完成', serviceRecords: [{ ...service, id: 'CHILD-SERVICE' }] }
    data.state.airChildren.push(child)
    const stored = data.state.airChildren.at(-1)
    const house = setupHouse({ modelValue: true, order, child: stored })
    expect(house.restriction.value).toBeTruthy()
    expect(house.openService(stored.serviceRecords[0])).toBe(true)
    const dialog = setupServiceEdit({ modelValue: true, order, service: stored.serviceRecords[0], child: stored })
    dialog.draft.value.warehouseOperations = ['分拣']
    expect(dialog.save()).toBe(true)
    expect(stored.warehouseOperations).toEqual(['分拣'])
    expect(stored.orderStatus).toBe('子订单完成')
  })

  it('服务编辑关闭取消保留草稿，角色切换后旧确认不会保存或关闭新上下文', async () => {
    const { order, service } = waitingWarehouse()
    const dialog = setupServiceEdit({ modelValue: true, order, service, child: null })
    dialog.draft.value.warehouseOperations = ['分拣']
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await dialog.close()).toBe(false)
    expect(dialog.draft.value.warehouseOperations).toEqual(['分拣'])
    let resolve
    context.confirm.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = dialog.close()
    data.selectWorkbenchPersona('operator')
    await nextTick()
    resolve('confirm')
    expect(await pending).toBe(false)
    expect(dialog.save()).toBe(false)
    expect(service.details.operations).toEqual(['打托'])
  })

  it('完成补录后独立修改服务，同步只读字段且保留未保存代码', () => {
    const order = data.state.airOrders[0]
    data.saveAirSupplement(order.id, complete(supplement.createAirSupplementDraft(order, data.state.airMaster)))
    const service = order.services.find(row => row.type === 'transfer')
    const page = setupView()
    page.draft.value.code = 'EAW'
    expect(page.openService(service)).toBe(true)
    const draft = serviceEditing.createAirServiceEditDraft(order, service)
    draft.transfer.pickupPoint = '已修改提货点'
    data.saveAirServiceDetails(order.id, service.id, draft)
    page.serviceSaved()
    expect(page.draft.value.transfer.pickupPoint).toBe('已修改提货点')
    expect(page.draft.value.code).toBe('EAW')
    expect(page.dirty.value).toBe(true)
    page.draft.value.code = order.code
    expect(page.dirty.value).toBe(false)
  })
})

describe('GJ-009 独立子订单页面及主订单报价组件', () => {
  it('新建主单、子单和分单的空数值使用undefined，不用空字符串触发控件最小值', () => {
    const main = setupOrderCreate({ modelValue: true, kind: 'main', mode: 'create', order: null })
    for (const key of ['pieces', 'grossWeight', 'volume', 'length', 'width', 'height', 'sellRate', 'truckSellRate']) expect(main.draft[key]).toBeUndefined()
    const child = setupOrderCreate({ modelValue: true, kind: 'child', mode: 'create', order: null })
    for (const key of ['pieces', 'grossWeight', 'volume', 'length', 'width', 'height', 'sellRate', 'truckSellRate']) expect(child.draft[key]).toBeUndefined()
    expect(child.draft.services).toMatchObject({ booking: false, warehouse: true, pickup: false })
    expect(child.errors.value).toMatchObject({ pieces: expect.any(String), grossWeight: expect.any(String), volume: expect.any(String), sellRate: expect.any(String) })
    const house = setupHouse({ modelValue: true, order: data.state.airOrders[0], child: null })
    for (const key of ['pieces', 'grossWeight', 'volume', 'rate']) expect(house.draft.value[key]).toBeUndefined()
    expect(house.errors.value.rate).toBeUndefined()
    expect(house.errors.value.pieces).toBeTruthy()
  })

  it('主订单报价为空保持空，保存只改变报价并记录通知', () => {
    const order = data.state.airOrders[0]
    order.truckSellRate = ''
    const before = { pieces: order.pieces, grossWeight: order.grossWeight, volume: order.volume, flight: order.flight, bookingStatus: order.bookingStatus }
    const dialog = setupPrice({ modelValue: true, orderId: order.id })
    expect(dialog.draft.value.truckSellRate).toBeUndefined()
    const original = order.sellRate
    dialog.draft.value.sellRate = 31.25
    expect(order.sellRate).toBe(original)
    expect(dialog.save()).toBe(true)
    expect(order.sellRate).toBe(31.25)
    expect(order.truckSellRate).toBeUndefined()
    expect(order).toMatchObject(before)
    expect(data.state.messages.some(message => message.type === '订单报价修改' && message.content.includes('31.25'))).toBe(true)
  })

  it('报价取消关闭保留输入，越权角色不能保存报价', async () => {
    const order = data.state.airOrders[0]
    const dialog = setupPrice({ modelValue: true, orderId: order.id })
    const original = order.sellRate
    dialog.draft.value.sellRate = 33
    const done = vi.fn()
    context.confirm.mockRejectedValueOnce('cancel')
    await dialog.close(done)
    expect(done).not.toHaveBeenCalled()
    expect(dialog.draft.value.sellRate).toBe(33)
    expect(order.sellRate).toBe(original)
    data.selectWorkbenchPersona('operator')
    await nextTick()
    dialog.draft.value.sellRate = 35
    expect(dialog.save()).toBe(false)
    expect(order.sellRate).toBe(original)
  })

  it('子订单列表从共享owner筛选，航班精确、订单号模糊且越权条目不可见', () => {
    const child = { id: 'STANDALONE-001', orderNo: 'DEMO-CHILD-001', customer: '启航跨境贸易', creator: '周倩', sourceKind: 'standalone', orderStatus: '子订单完成', flight: 'MU9001', parentId: '' }
    data.state.airChildren = [child, { ...child, id: 'OTHER-002', orderNo: 'DEMO-CHILD-002', creator: '他人' }, { ...child, id: 'DELETED', deleted: true }]
    const view = setupChildOrders()
    expect(view.rows.value.map(row => row.id)).toEqual(['STANDALONE-001'])
    view.filters.orderNo = 'child-001'
    expect(view.rows.value).toHaveLength(1)
    view.filters.flight = 'MU900'
    expect(view.rows.value).toHaveLength(0)
    view.filters.flight = 'MU9001'
    expect(view.rows.value).toHaveLength(1)
    expect(view.selectable(view.rows.value[0])).toBe(true)
  })

  it('合成未保存内容取消关闭后仍在，确认关闭不写入主订单', async () => {
    const view = setupChildOrders()
    view.selection.value = ['SYNTHETIC-CHILD']
    expect(view.openConsolidation()).toBe(true)
    view.consolidation.origin = 'PVG'
    const before = data.state.airOrders.length
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await view.closeConsolidation()).toBe(false)
    expect(view.consolidateVisible.value).toBe(true)
    expect(view.consolidation.origin).toBe('PVG')
    expect(await view.closeConsolidation()).toBe(true)
    expect(view.consolidateVisible.value).toBe(false)
    expect(data.state.airOrders).toHaveLength(before)
  })

  it('报价等待离开确认时禁止重复确认，角色变更使旧确认失效', async () => {
    const dialog = setupPrice({ modelValue: true, orderId: data.state.airOrders[0].id })
    dialog.draft.value.sellRate = 39
    let resolve
    context.confirm.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = context.leave()
    expect(dialog.busy.value).toBe(true)
    expect(await context.leave()).toBe(false)
    expect(context.confirm).toHaveBeenCalledOnce()
    data.selectWorkbenchPersona('operator')
    resolve('confirm')
    expect(await pending).toBe(false)
    expect(dialog.busy.value).toBe(false)
  })

  it('同路由无关query不打断编辑，切换订单取消保留草稿，确认后加载对应对象', async () => {
    const source = { ...childOrders.createAirChildDraft(), id: 'CH-A', creator: '周倩', sourceKind: 'standalone', orderStatus: '子订单暂存', customer: '旧对象客户' }
    const destination = { ...source, id: 'CH-B', customer: '新对象客户' }
    const dialog = setupOrderCreate({ modelValue: true, kind: 'child', mode: 'edit', order: source })
    dialog.draft.customer = '未保存输入'
    expect(await context.update({ query: { tab: 'other' } }, { query: {} })).toBe(true)
    expect(context.confirm).not.toHaveBeenCalled()
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.update({ query: { order: destination.id } }, { query: {} })).toBe(false)
    expect(dialog.draft.customer).toBe('未保存输入')
    expect(await context.update({ query: { order: destination.id } }, { query: {} })).toBe(true)
    context.props.order = destination
    context.props.mode = 'detail'
    await nextTick()
    expect(dialog.draft.customer).toBe('新对象客户')
    expect(dialog.readOnly.value).toBe(true)
    expect(dialog.dirty.value).toBe(false)
  })

  it('已有新建任务的同一create深链不清空输入，报价切换新建任务需确认', async () => {
    const creation = setupOrderCreate({ modelValue: true, kind: 'child', mode: 'create', order: null })
    creation.draft.goodsName = '保留新建草稿'
    expect(await context.update({ query: { action: 'create' } }, { query: {} })).toBe(true)
    expect(context.confirm).not.toHaveBeenCalled()
    expect(creation.draft.goodsName).toBe('保留新建草稿')
    const price = setupPrice({ modelValue: true, orderId: data.state.airOrders[0].id })
    price.draft.value.sellRate = 39
    context.confirm.mockRejectedValueOnce('cancel')
    expect(await context.update({ query: { action: 'create' } }, { query: {} })).toBe(false)
    expect(price.draft.value.sellRate).toBe(39)
  })

  it('合成移除来源也触发离开保护，确认期间重置使旧请求失效', async () => {
    const view = setupChildOrders()
    view.selection.value = ['SOURCE-1', 'SOURCE-2']
    view.openConsolidation()
    view.consolidationIds.value = ['SOURCE-1']
    expect(view.isDirty.value).toBe(true)
    expect(await context.update({ query: { tab: 'other' } }, { query: {} })).toBe(true)
    expect(context.confirm).not.toHaveBeenCalled()
    let resolve
    context.confirm.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = context.update({ query: { action: 'create' } }, { query: {} })
    expect(view.busy.value).toBe(true)
    expect(await view.closeConsolidation()).toBe(false)
    data.reset()
    resolve('confirm')
    expect(await pending).toBe(false)
    expect(view.busy.value).toBe(false)
  })

  it.each(['price', 'create', 'consolidation'])('%s 草稿刷新保护只在有输入时生效并按生命周期注册清理', kind => {
    const windowAdapter = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('window', windowAdapter)
    const view = kind === 'price' ? setupPrice({ modelValue: true, orderId: data.state.airOrders[0].id })
      : kind === 'create' ? setupOrderCreate({ modelValue: true, kind: 'child', mode: 'create', order: null }) : setupChildOrders()
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    view.beforeUnload(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    if (kind === 'price') view.draft.value.sellRate = 39
    else if (kind === 'create') view.draft.goodsName = '有输入'
    else { view.selection.value = ['SOURCE']; view.openConsolidation(); view.consolidation.origin = 'PVG' }
    view.beforeUnload(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe('')
    context.mounted.forEach(callback => callback())
    context.unmounted.forEach(callback => callback())
    expect(windowAdapter.addEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
    expect(windowAdapter.removeEventListener).toHaveBeenCalledWith('beforeunload', view.beforeUnload)
  })
})
