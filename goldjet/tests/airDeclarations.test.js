import { beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { createAirDeclarationActions } from '../src/data/airDeclarationActions.js'
import {
  DECLARATION_STATUSES, buildAirDeclarationMaterialNotice, canManageAirDeclarations,
  deriveAirDeclarations, filterAirDeclarations, getAirDeclarationMaterialFile,
} from '../src/domain/airDeclarations.js'
import { createAirSupplementDraft, createHouseBillDraft } from '../src/domain/airOrderSupplement.js'

let state, session, owner
const snapshot = value => JSON.parse(JSON.stringify(value))
const material = (id, values = {}) => ({ id, name: `材料${id}`, fileName: `${id}.txt`, content: `真实合成文本${id}`, type: 'text/plain', ...values })
const targets = [
  { serviceId: 'SERVICE-D', materialId: 'M-D' },
  { serviceId: 'SERVICE-C', materialId: 'M-C' },
]
beforeEach(() => {
  state = reactive({ airOrders: [
    { id: 'DIRECT', orderNo: 'GJ-DIRECT', creator: '直单建单客服', assignedService: '跟单客服', customer: '客户甲', origin: 'PVG', destination: 'LAX',
      waybillNo: '781-12345678', departureDate: '2026-09-10', services: [
        { id: 'UNRELATED', type: 'warehouse', status: '待服务', details: {} },
        { id: 'SERVICE-D', type: 'customs', status: '待服务', createdAt: '2026-09-08 12:00', details: { choice: '我司报关', documentType: '代理出口报关', attachments: [material('M-D')] } },
      ] },
    { id: 'MAIN', orderNo: 'GJ-MAIN', creator: '主单建单客服', customer: '客户乙', origin: 'SZX', destination: 'FRA',
      waybillNo: '784-23456789', booking: { departureDate: '2026-09-11' }, services: [] },
  ], airChildren: [
    { id: 'CHILD', parentId: 'MAIN', housebillNo: 'HOUSE-001', creator: '分单建单客服', customer: '分单客户乙', origin: 'CAN', destination: 'AMS',
      serviceRecords: [{ id: 'SERVICE-C', type: 'customs', status: '服务中', customsStatus: '报关查验', createdAt: '2026-09-07 12:00',
        details: { choice: '我司报关', documentType: '单证报关', attachments: [material('M-C')] }, materialRequests: [] }] },
    { id: 'DETACHED', parentId: '', serviceRecords: [{ id: 'SERVICE-DETACHED', type: 'customs' }] },
  ], messages: [] })
  session = { role: 'customsService', name: '报关演示客服' }
  owner = createAirDeclarationActions(state, () => session)
})

describe('第012篇报关单投影与查询', () => {
  it('只投影既有报关服务，初始状态无写入，沿主/分单事实读取且按服务创建时间排序', () => {
    const before = snapshot(state), rows = deriveAirDeclarations(state)
    expect(rows.map(row => row.id)).toEqual(['SERVICE-C', 'SERVICE-D'])
    expect(rows[0]).toMatchObject({ orderId: 'MAIN', childId: 'CHILD', housebillNo: 'HOUSE-001', waybillNo: '784-23456789',
      creator: '分单建单客服', customer: '分单客户乙', origin: 'CAN', destination: 'AMS', departureDate: '2026-09-11', customsStatus: '报关查验', serviceStatus: '服务中',
      target: { path: '/fulfillment/air-orders/MAIN/supplement', query: { customs: 'SERVICE-C', child: 'CHILD' } } })
    expect(rows[1]).toMatchObject({ customsStatus: '单证预审', target: { path: '/fulfillment/air-orders/DIRECT/supplement', query: { customs: 'SERVICE-D' } } })
    expect(rows.every(row => row.blockReason.includes('待确认') && row.materialBlockReason.includes('待确认'))).toBe(true)
    expect(snapshot(state)).toEqual(before)
    expect(DECLARATION_STATUSES).toEqual(['单证预审', '报关审结', '报关查验', '放行', '已结关'])
    expect(deriveAirDeclarations({})).toEqual([])
  })
  it('八个筛选项共同生效，文本模糊查询忽略大小写，日期边界包含当日', () => {
    const rows = deriveAirDeclarations(state)
    const filters = { serviceNo: 'service-c', waybillNo: '2345', customer: ' 分单客户 ', origin: 'CAN', destination: 'AMS',
      departure: ['2026-09-11', '2026-09-11'], created: ['2026-09-07', '2026-09-07'], status: '报关查验' }
    expect(filterAirDeclarations(rows, filters).map(row => row.id)).toEqual(['SERVICE-C'])
    for (const key of ['serviceNo', 'waybillNo', 'customer', 'origin', 'destination', 'status']) expect(filterAirDeclarations(rows, { ...filters, [key]: 'NO MATCH' })).toEqual([])
    for (const key of ['departure', 'created']) expect(filterAirDeclarations(rows, { ...filters, [key]: ['2026-09-12', '2026-09-15'] })).toEqual([])
    expect(filterAirDeclarations(rows, { origin: '全部', destination: '全部', status: '全部', departure: null, created: [] })).toHaveLength(2)
    expect(filterAirDeclarations(rows, { departure: ['2026-09-12', '2026-09-10'] })).toEqual([])
    expect(filterAirDeclarations([{ ...rows[0], createdAt: '' }], { created: ['2026-09-07', '2026-09-07'] })).toEqual([])
  })
  it('仅报关行客服可操作，其他角色被 owner 再次拒绝', () => {
    expect(canManageAirDeclarations(session)).toBe(true)
    expect(canManageAirDeclarations()).toBe(false)
    for (const role of ['service', 'supervisor', 'operator', 'handler', 'hangsheng', 'waybillClerk']) {
      session.role = role
      expect(() => owner.getAirDeclarationFiles(targets)).toThrow('仅报关行客服')
      expect(() => owner.notifyAirDeclarationMaterials(targets)).toThrow('仅报关行客服')
      expect(() => owner.loadAirDeclarationExamples()).toThrow('仅报关行客服')
    }
    expect(state.messages).toEqual([])
  })
})

describe('第012篇报关材料下载与补齐通知', () => {
  it('单个与批量下载真实非空内容，保留原始 File，操作不改变业务状态', async () => {
    const file = new File(['已上传合成文件'], 'uploaded.pdf', { type: 'application/pdf' })
    state.airOrders[0].services[1].details.attachments.push(file)
    const before = snapshot(state), rows = deriveAirDeclarations(state)
    const files = owner.getAirDeclarationFiles([...targets, { serviceId: 'SERVICE-D', materialId: rows[1].materials[1].id }])
    expect(files.map(item => item.name)).toEqual(['M-D.txt', 'M-C.txt', 'uploaded.pdf'])
    expect(await files[0].blob.text()).toBe('真实合成文本M-D')
    expect(await files[2].blob.text()).toBe('已上传合成文件')
    expect(files[2].blob).toBe(file)
    expect(owner.getAirDeclarationFiles([targets[0]])).toHaveLength(1)
    expect(snapshot(state)).toEqual(before)
  })
  it('缺失文件、空文件和无文件名不伪造下载，未知、过期或重复批量目标全部拒绝', () => {
    const before = snapshot(state)
    for (const invalid of [[], [...targets, targets[0]], [...targets, { serviceId: 'MISSING', materialId: 'M' }], [...targets, { serviceId: 'SERVICE-C', materialId: 'REMOVED' }]]) {
      expect(() => owner.getAirDeclarationFiles(invalid)).toThrow()
      expect(() => owner.notifyAirDeclarationMaterials(invalid)).toThrow()
    }
    expect(snapshot(state)).toEqual(before)
    for (const entry of [{ fileName: '', content: 'x' }, { fileName: 'x.pdf', content: null }, { fileName: 'x.txt', content: '' }, { fileName: 'x.pdf', content: new Blob([]) }]) expect(() => getAirDeclarationMaterialFile(entry)).toThrow()
    state.airChildren[0].serviceRecords[0].details.attachments[0].content = null
    expect(() => owner.getAirDeclarationFiles(targets)).toThrow('没有可下载')
    expect(state.messages).toHaveLength(0)
  })
  it('准确使用直/分单建单客服与030正文，保存到原服务并生成本地消息、正确来源入口', () => {
    const requests = owner.notifyAirDeclarationMaterials(targets)
    expect(requests.map(row => [row.recipient, row.content])).toEqual([
      ['直单建单客服', '订单号：GJ-DIRECT的材料M-D有误，请补齐材料。'],
      ['分单建单客服', '分单号：HOUSE-001的材料M-C有误，请补齐材料。'],
    ])
    expect(state.airOrders[0].services[1].materialRequests[0]).toMatchObject({ materialId: 'M-D', materialName: '材料M-D', status: 'pending', recipient: '直单建单客服' })
    expect(state.airChildren[0].serviceRecords[0].materialRequests[0]).toMatchObject({ serviceId: 'SERVICE-C', materialId: 'M-C', status: 'pending' })
    expect(state.messages).toHaveLength(2)
    expect(state.messages[1]).toMatchObject({ recipient: '分单建单客服', status: '本地模拟', related: { path: '/fulfillment/air-orders/MAIN/supplement', query: { child: 'CHILD', customs: 'SERVICE-C' } } })
    expect(deriveAirDeclarations(state)[0].materialRequests).toHaveLength(1)
    expect(state.airChildren[0].serviceRecords[0]).toMatchObject({ customsStatus: '报关查验', status: '服务中' })
    expect(state.airOrders[0].services[1].customsStatus).toBeUndefined()
    expect(state.airDeclarationMaterialRequests).toBeUndefined()
    const repeat = owner.notifyAirDeclarationMaterials([targets[0]])
    expect(repeat[0].id).not.toBe(requests[0].id)
    expect(state.airOrders[0].services[1].materialRequests.every(row => row.status === 'pending')).toBe(true)
  })
  it('材料有名称但缺文件时可补齐；缺接收人不回退跟单/主单客服，整批保持原状', () => {
    state.airChildren[0].serviceRecords[0].details.attachments[0].content = null
    expect(owner.notifyAirDeclarationMaterials([targets[1]])[0].recipient).toBe('分单建单客服')
    state.airChildren[0].creator = ''
    const before = snapshot(state)
    expect(() => owner.notifyAirDeclarationMaterials(targets)).toThrow('建单客服未确定')
    expect(snapshot(state)).toEqual(before)
    const row = deriveAirDeclarations(state)[0]
    expect(() => buildAirDeclarationMaterialNotice({ ...row, creator: '周倩', housebillNo: '' }, row.materials[0])).toThrow('分单号缺失')
    expect(() => buildAirDeclarationMaterialNotice({ ...row, creator: '周倩' }, { name: '' })).toThrow('材料名称缺失')
  })
  it('重复服务/材料标识和损坏历史不能造成部分通知写入', () => {
    state.airChildren[0].serviceRecords[0].materialRequests = {}
    const before = snapshot(state)
    expect(() => owner.notifyAirDeclarationMaterials(targets)).toThrow('通知记录格式异常')
    expect(snapshot(state)).toEqual(before)
    state.airChildren[0].serviceRecords[0].materialRequests = []
    state.airChildren[0].serviceRecords[0].details.attachments.push(material('M-C'))
    expect(() => owner.notifyAirDeclarationMaterials(targets)).toThrow('材料已变化或标识不唯一')
    state.airChildren[0].serviceRecords.push({ id: 'SERVICE-D', type: 'customs' })
    expect(() => owner.notifyAirDeclarationMaterials([targets[0]])).toThrow('服务不存在或标识不唯一')
    expect(state.messages).toHaveLength(0)
  })
})

describe('第012篇显式载入的已收指令示例', () => {
  it('不自动注入；显式载入完整直/主单及两个分单，三条报关服务，保留既有数据且可重复调用', async () => {
    const before = snapshot(state)
    expect(deriveAirDeclarations(state).some(row => row.exampleLabel)).toBe(false)
    const result = owner.loadAirDeclarationExamples()
    expect(result).toMatchObject({ addedOrders: 2, addedChildren: 2, addedServices: 3 })
    expect(state.airOrders.slice(0, 2)).toEqual(before.airOrders)
    expect(state.airChildren.slice(0, 2)).toEqual(before.airChildren)
    expect(result.rows).toHaveLength(3)
    expect(result.rows.map(row => row.materials.length).sort()).toEqual([0, 1, 2])
    expect(result.rows.every(row => row.exampleLabel === '已收指令示例' && row.customsStatus === '单证预审' && row.serviceStatus === '待服务' && row.creator === '周倩')).toBe(true)
    const exampleOrder = state.airOrders.find(row => row.id === 'DEMO-CUSTOMS-DIRECT')
    expect(exampleOrder).toMatchObject({ orderType: '直单', orderStatus: '待出提单', bookingStatus: '服务已完成', owner: '周倩', contactEmails: ['customs@example.invalid'] })
    expect(exampleOrder.booking.thirdLeg).toBe('NRT - LAX')
    expect(createAirSupplementDraft(exampleOrder).customs.attachments).toHaveLength(2)
    const exampleChild = state.airChildren.find(row => row.id === 'DEMO-CUSTOMS-CHILD-01')
    expect(exampleChild.housebillNo).toMatch(/^[A-Za-z0-9]{12}$/)
    expect(createHouseBillDraft(exampleChild)).toMatchObject({ services: { customs: true }, customs: { documentType: '单证报关' }, englishGoodsName: 'DEMO ELECTRONIC PARTS' })
    const file = owner.getAirDeclarationFiles([{ serviceId: result.rows[0].id, materialId: result.rows[0].materials[0].id }])[0]
    expect(file.name.endsWith('.txt')).toBe(true)
    expect(await file.blob.text()).toContain('不定义任何单证类型的必备材料或受理标准')
    exampleOrder.supplement.marks = '保留用户修改'
    expect(owner.loadAirDeclarationExamples()).toMatchObject({ addedOrders: 0, addedChildren: 0, addedServices: 0 })
    expect(exampleOrder.supplement.marks).toBe('保留用户修改')
    expect(state.airOrders).toHaveLength(4)
    expect(state.airChildren).toHaveLength(4)
    expect(state.messages).toEqual([])
  })
  it('样例订单/分单/服务标识冲突均在任何写入之前拒绝', () => {
    for (const mutate of [
      () => state.airOrders.push({ id: 'DEMO-CUSTOMS-DIRECT', services: [] }),
      () => state.airChildren.push({ id: 'DEMO-CUSTOMS-CHILD-01', parentId: 'MAIN', serviceRecords: [] }),
      () => state.airOrders[0].services.push({ id: 'DEMO-CUSTOMS-SERVICE-DIRECT', type: 'customs' }),
    ]) {
      const original = snapshot(state)
      mutate()
      const before = snapshot(state)
      expect(() => owner.loadAirDeclarationExamples()).toThrow('冲突')
      expect(snapshot(state)).toEqual(before)
      Object.assign(state, original)
    }
  })
})
