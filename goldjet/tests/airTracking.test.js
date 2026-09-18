import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { createAirSupplementDraft } from '../src/domain/airOrderSupplement.js'
import { canQueryAirTracking, formatTrackingFlight, queryAirTracking, sortTrackingEvents, trackingNodeShape, trackingTime, visibleTrackingEvents } from '../src/domain/airTracking.js'

const data = usePrototypeData()
const query = number => queryAirTracking(data.state, data.airSession, number)
beforeEach(() => data.reset())

describe('GJ-014 在途跟踪只读投影', () => {
  it('只允许空运客服按本人订单号或提单号精确查询，不按内部 ID、前缀或空号全查', () => {
    const order = data.state.airOrders[0]
    expect(query(order.orderNo).kind).toBe('ready')
    expect(query(` ${order.waybillNo} `).order.id).toBe(order.id)
    expect(query(order.id).kind).toBe('not-found')
    expect(query('781-').kind).toBe('not-found')
    expect(query(' ').kind).toBe('idle')
    expect(query(data.state.airOrders[1].orderNo).kind).toBe('not-found')
    data.selectWorkbenchPersona('supervisor')
    expect(canQueryAirTracking(data.airSession)).toBe(false)
    expect(query(order.orderNo)).toEqual({ kind: 'denied' })
  })
  it('重复可见提单不任取一条；无权数据不泄露到冲突提示', () => {
    const order = data.state.airOrders[0]
    data.state.airOrders[1].waybillNo = order.waybillNo
    expect(query(order.waybillNo).kind).toBe('ready')
    data.state.airOrders[1].creator = '周倩'
    expect(query(order.waybillNo)).toEqual({ kind: 'ambiguous' })
    data.state.airOrders[1].deleted = true
    expect(query(order.waybillNo).kind).toBe('ready')
  })
  it('毛件体使用已保存提单值，缺值留空，零值保留；不取预计量和未保存草稿', () => {
    const order = data.state.airOrders[0]
    expect(query(order.orderNo).order).toMatchObject({ pieces: '', grossWeight: '', volume: '', sellRate: '' })
    order.waybill = { pieces: 0, grossWeight: 10, volume: null }
    order.waybillDraft = { pieces: 999 }
    expect(query(order.orderNo).order).toMatchObject({ pieces: 0, grossWeight: 10, volume: '', flight: 'MU9001/10.SEP' })
    expect(query(order.orderNo).contacts).toMatchObject({ station: 'MU演示货站', handler: '王晴', operator: '李明' })
    expect(query(order.orderNo).contacts.cutoffAt).toBeUndefined()
  })
  it.each([
    ['CZ327', '2026-12-02', 'CZ327/02.DEC'], ['MU9001', '2026-01-09', 'MU9001/09.JAN'],
    ['CZ327', '2026-02-30', 'CZ327'], ['CZ327', '', 'CZ327'], ['', '2026-12-02', ''],
  ])('航班拼接 %s %s', (flight, date, expected) => expect(formatTrackingFlight(flight, date)).toBe(expected))
  it('节点样式只覆盖已定义状态，不把待服务、待审核、取消或异常当作完成', () => {
    expect(trackingNodeShape(false, '')).toBe('square')
    expect(trackingNodeShape(true, '服务已完成')).toBe('hollow')
    expect(trackingNodeShape(true, '服务中')).toBe('solid')
    for (const status of ['待服务', '待审核', '服务已取消', '异常结束']) expect(trackingNodeShape(true, status)).toBe('')
  })
  it('按实际时间倒序，秒参与排序、显示到分钟；无效/缺失时间留空并置后', () => {
    const events = [
      { id: 'A', time: '2026-09-08 10:00' }, { id: 'B', time: '2026-09-08 10:00:31' },
      { id: 'C', time: '' }, { id: 'D', time: '2026-02-30 10:00' }, { id: 'E', time: '2026-09-08 12:00' },
    ]
    const sorted = sortTrackingEvents(events)
    expect(sorted.map(row => row.id)).toEqual(['E', 'B', 'A', 'C', 'D'])
    expect(sorted[1].time).toBe('2026-09-08 10:00')
    expect(sorted[4].time).toBe('')
    expect(visibleTrackingEvents(sorted)).toHaveLength(2)
    expect(visibleTrackingEvents(sorted, true)).toHaveLength(5)
    expect(events[0].id).toBe('A')
    expect(trackingTime('2026-09-08 24:00')).toBe('')
  })
  it('读取同一订舱时间，不把亏损申请当作已确认航班', () => {
    const order = data.state.airOrders[0], events = query(order.orderNo).groups[0].events
    expect(events.map(row => row.content)).toEqual(['订舱完成', '航班已确认', '订舱服务创建'])
    expect(query(data.state.airOrders[3].orderNo).groups[0].events.map(row => row.content)).toEqual(['订舱服务创建'])
  })
  it('补录生成服务后即时出现；重发/接单记录不伪造历史服务状态', () => {
    const order = data.state.airOrders[0], draft = createAirSupplementDraft(order, data.state.airMaster)
    Object.assign(draft, { englishGoodsName: 'DEMO PARTS', shipper: 'DEMO SHIPPER', consignee: 'DEMO RECEIVER' })
    draft.groundServices.clearance = true
    draft.clearance.attachments = [new File(['demo'], 'demo.pdf')]
    data.saveAirSupplement(order.id, draft)
    const clearance = order.services.find(row => row.type === 'clearance')
    clearance.transmissions = [{ id: 'R1', sentAt: '2026-09-08 15:00' }]
    data.selectWorkbenchPersona('overseasService')
    data.acceptAirClearance(clearance.id)
    data.selectWorkbenchPersona('service')
    const result = query(order.orderNo)
    expect(result.groups[0].nodes.find(row => row.id === clearance.id).status).toBe('待服务')
    expect(result.groups[0].events.find(row => row.content.includes('接单')).status).toBe('')
    expect(result.groups[0].events.find(row => row.content.includes('本地重发')).status).toBe('')
    expect(result.order.pieces).toBe('')
  })
  it('同类分单服务保持来源隔离，不展示其他客服或已删除分单', () => {
    const order = data.state.airOrders[0]
    data.state.airChildren.push(...['周倩', '李明'].map((creator, index) => ({ id: `CHILD-${index}`, creator, parentId: order.id,
      housebillNo: `H${index}`, services: { clearance: true }, serviceRecords: [{ id: `S${index}`, type: 'clearance', name: '清关派送', status: '服务中', createdAt: '2026-09-08 12:00' }] })))
    expect(query(order.orderNo).groups.map(row => row.id)).toEqual([order.id, 'CHILD-0'])
    data.state.airChildren[0].deleted = true
    expect(query(order.orderNo).groups).toHaveLength(1)
  })
  it('未生成记录的已选服务不画成未选择；未定义选择不凭空补节点', () => {
    const order = data.state.airOrders[0]
    expect(query(order.orderNo).groups[0].nodes).toHaveLength(2)
    order.supplement = { groundServices: { preallocation: true, clearance: false } }
    expect(query(order.orderNo).groups[0].nodes.find(row => row.name === '预配发送')).toMatchObject({ shape: '', status: '已选择，尚无服务记录' })
    expect(query(order.orderNo).groups[0].nodes.find(row => row.name === '清关派送').shape).toBe('square')
  })
  it('仅以明确的空运主订单关联取运输记录，不匹配客户、订单号相似或无关联运单', () => {
    const order = data.state.airOrders[0]
    data.state.groundOrders[2].orderNo = order.orderNo
    data.state.groundOrders[2].customer = order.customer
    expect(query(order.orderNo).transports).toHaveLength(0)
    data.state.groundOrders[2].airOrderId = order.id
    expect(query(order.orderNo).transports).toHaveLength(1)
  })
  it('示例幂等、不覆盖已有记录；两运单独立，运单动作回显到同一来源', () => {
    const order = data.loadAirTrackingExamples(), first = query(order.orderNo)
    const count = data.state.airOrders.length
    data.loadAirTrackingExamples()
    expect(data.state.airOrders).toHaveLength(count)
    expect(first.transports.map(row => row.events.length)).toEqual([3, 1])
    expect(first.transports[0].length).toBe(80)
    expect(first.transports[1].driver).toBe('演示司机乙 / 演示司机丙')
    expect(first.groups[0].events.filter(row => row.service === '仓储').every(row => row.abnormal)).toBe(true)
    const id = first.transports[1].id
    data.selectWorkbenchPersona('hangsheng')
    data.updateGroundWaybillStatus(id, { status: '已提货', time: '2026-09-08 13:30', remark: '第二车已装货' })
    data.selectWorkbenchPersona('service')
    expect(query(order.orderNo).transports[1].events[0]).toMatchObject({ status: '已提货', content: '已提货；第二车已装货' })
    expect(query(order.orderNo).transports[0].events).toHaveLength(3)
    data.reset()
    expect(query(order.orderNo).kind).toBe('not-found')
  })
})
