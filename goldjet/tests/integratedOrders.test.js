import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  cargoColumns, createHouseDraft, createIntegratedOrderDraft, customsItems, deriveOrderAutoComplete,
  deriveServiceSummary, integratedOrderPermissions, orderNoFor, servicePlan, validateIntegratedOrderDraft,
} from '../src/domain/integratedOrders.js'

const data = usePrototypeData()
const valid = () => ({
  ...createIntegratedOrderDraft(),
  businessType: '普货', businessMode: '进口', salesperson: '周倩', customerPartnerId: 'PT-00018', customer: '启航跨境贸易',
  contactName: '赵敏', contactPhone: '000-00001018', contactEmail: 'customer18@example.invalid',
  transportMode: '空运', originPort: 'PVG', destinationPort: 'LAX',
  houses: [{ ...createHouseDraft(), key: 'HOUSE-1', cargo: [{ id: 'C1', chineseName: '合成演示货物', englishName: '', specialCargo: '', expectedPieces: 10, expectedWeight: 20, expectedVolume: 0.5 }] }],
  services: [{ ...createServiceRecordFor('warehouse', 'warehouse'), houseKey: 'HOUSE-1', fields: { warehouseName: '广州保税仓 WH001', expectedInboundTime: '2026-09-09 10:00' }, department: '仓库部' }],
})
function createServiceRecordFor(category, item) {
  return { id: `${category}-${item}`, category, item, houseKey: '', serviceType: '我司服务', supplier: '', department: '', remark: '', generated: false, status: '待接单', history: [], fields: {} }
}

describe('GJ-ORD-01 综合订单管理', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('service') })

  it('业务类型联动模式、货物模板与关务服务项', () => {
    expect(orderNoFor('普货', 1)).toBe('G26090800001')
    expect(orderNoFor('BC', 2)).toBe('C26090800002')
    expect(orderNoFor('其他', 3)).toBe('O26090800003')
    expect(customsItems({ businessType: '普货', businessMode: '进口' }).map(item => item.key)).toEqual(['customsDeclare', 'customsExchange', 'customsInspect'])
    expect(customsItems({ businessType: 'BC', businessMode: '出口' }).map(item => item.key)).toEqual(['customsDeclare'])
    expect(customsItems({ businessType: 'BBC', businessMode: '区间调拨' }).map(item => item.key)).toEqual(['customsDeclare'])
    expect(cargoColumns({ businessType: 'BBC', businessMode: '一线进境' }).map(([key]) => key)).toContain('productId')
    expect(cargoColumns({ businessType: 'CC', businessMode: '进口' }).map(([key]) => key)).toContain('hsCode')
  })

  it('服务联动随运输方式收敛，订舱才显示航司代码', () => {
    const air = servicePlan({ businessType: '普货', businessMode: '进口', transportMode: '空运' })
    expect(air.find(group => group.key === 'trunk').items[0]).toMatchObject({ key: 'booking', airlineCode: true })
    const road = servicePlan({ businessType: '普货', businessMode: '进口', transportMode: '陆运' })
    expect(road.find(group => group.key === 'trunk').items[0].key).toBe('crossTruck')
    expect(servicePlan({ businessType: 'BBC', businessMode: '一线进境', transportMode: '' }).find(group => group.key === 'customs').items[0].key).toBe('customsClear')
  })

  it('草稿校验与提交必填，保存不生成服务单', () => {
    expect(validateIntegratedOrderDraft(valid())).toEqual({})
    expect(validateIntegratedOrderDraft({ ...valid(), customer: '' })).toHaveProperty('customer')
    expect(validateIntegratedOrderDraft({ ...valid(), contactEmail: 'bad' })).toHaveProperty('contactEmail')
    expect(validateIntegratedOrderDraft({ ...valid(), businessType: 'BBC', businessMode: '进口' })).toHaveProperty('businessMode')
    expect(validateIntegratedOrderDraft({ ...valid(), businessType: '其他', businessMode: '其他', transportMode: '', originPort: '', destinationPort: '' })).toEqual({})
    const order = data.saveIntegratedOrder(valid())
    expect(order).toMatchObject({ orderNo: 'G26090800005', status: '未提交', creator: '周倩', source: '直接建单' })
    expect(order.services.every(record => !record.generated)).toBe(true)
    expect(data.state.integratedOrders[0].history.at(-1).event).toBe('订单创建')
  })

  it('提交生成未下发服务单并转进行中，客自处理不生成', () => {
    const draft = valid()
    const custom = createServiceRecordFor('customs', 'customsDeclare')
    custom.houseKey = 'HOUSE-1'; custom.department = '关务部'; custom.fields = { customsType: '代理报关' }
    const selfHandled = { ...createServiceRecordFor('valueAdded', 'labeling'), houseKey: 'HOUSE-1', serviceType: '客自处理', department: '仓库部' }
    draft.services = [...draft.services, custom, selfHandled]
    const order = data.saveIntegratedOrder(draft)
    data.submitIntegratedOrder(order.id)
    expect(order.status).toBe('进行中')
    expect(order.services.filter(record => record.generated)).toHaveLength(2)
    expect(order.services.find(record => record.serviceType === '客自处理')).toMatchObject({ generated: false })
    expect(order.services.find(record => record.item === 'customsDeclare').id).toMatch(/^SV260908\d{5}$/)
    expect(deriveServiceSummary(order, 'warehouse')).toBe('待服务')
    // 手动下发只补尚未生成的服务记录
    const generated = data.dispatchIntegratedServices(order.id)
    expect(generated).toHaveLength(0)
  })

  it('接单、拒接入口、取消、删除、流转与自动完成判据', () => {
    const order = data.state.integratedOrders.find(row => row.status === '待接单')
    data.acceptIntegratedOrder(order.id)
    expect(order.status).toBe('已接单')
    expect(integratedOrderPermissions(order, 'viewer').accept).toBe(false)
    data.transferIntegratedOrder(order.id, { transferOrg: '上海高捷物流有限公司', transferDepartment: '华南业务部' })
    expect(order).toMatchObject({ transfer: true, transferDepartment: '华南业务部', originalSalesperson: '陈楠' })
    data.cancelIntegratedOrder(order.id)
    expect(order.status).toBe('已取消')
    const draft = data.state.integratedOrders.find(row => row.status === '未提交')
    data.deleteIntegratedOrder(draft.id)
    expect(data.state.integratedOrders.some(row => row.id === draft.id)).toBe(false)
    const completed = data.state.integratedOrders.find(row => row.status === '已完成')
    expect(deriveOrderAutoComplete(completed)).toBe(true)
    expect(deriveServiceSummary(completed, 'customs')).toBe('服务完成')
    expect(deriveOrderAutoComplete(data.state.integratedOrders.find(row => row.id === 'G26090800001'))).toBe(false)
  })

  it('运行中只允许维护货物、服务、附件与总运单号；状态与客户保持只读', () => {
    const order = data.state.integratedOrders.find(row => row.id === 'G26090800001')
    const payload = { ...JSON.parse(JSON.stringify(order)), customer: '伪造客户', waybillNo: '999-90009999', houses: order.houses.map(house => ({ ...house, cargo: [{ id: 'C9', chineseName: '新货物' }] })) }
    data.saveIntegratedOrder(payload, order.id)
    expect(order).toMatchObject({ customer: '启航跨境贸易', businessType: '普货', waybillNo: '999-90009999' })
    expect(order.houses[0].cargo[0].chineseName).toBe('新货物')
    expect(order.history.at(-1).event).toBe('订单编辑')
  })

  it('上游取消服务：待接单转已取消、进行中保留状态；附件可见性与20M限制', () => {
    const order = data.state.integratedOrders.find(row => row.id === 'G26090800001')
    const waiting = order.services.find(record => record.status === '待接单')
    const running = order.services.find(record => record.status === '进行中')
    data.cancelIntegratedService(order.id, waiting.id)
    expect(waiting).toMatchObject({ status: '已取消', upstreamCancelled: true })
    data.cancelIntegratedService(order.id, running.id)
    expect(running).toMatchObject({ status: '进行中', upstreamCancelled: true })
    const attachment = data.addIntegratedAttachment(order.id, { name: '演示附件.pdf', size: 1024, type: '报关资料', dataUrl: 'data:application/pdf;base64,AA==' })
    data.updateIntegratedAttachmentVisibility(order.id, attachment.id, ['customs', 'warehouse'])
    expect(attachment.visibility).toEqual(['customs', 'warehouse'])
    expect(() => data.addIntegratedAttachment(order.id, { name: '过大附件.pdf', size: 21 * 1024 * 1024 })).toThrow('20M')
    data.removeIntegratedAttachment(order.id, attachment.id)
    expect(order.attachments).toHaveLength(1)
  })

  it('岗位与超级管理员只读边界，重置恢复种子', () => {
    data.selectWorkbenchPersona('operator')
    expect(() => data.saveIntegratedOrder(valid())).toThrow()
    data.selectWorkbenchPersona('superAdmin')
    expect(integratedOrderPermissions(data.state.integratedOrders[0], 'superAdmin').edit).toBe(false)
    expect(() => data.cancelIntegratedOrder('G26090800001')).toThrow()
    data.reset()
    expect(data.state.integratedOrders).toHaveLength(4)
    expect(data.state.integratedOrderSequence).toBe(4)
  })

  it.each(['views/IntegratedOrdersView.vue', 'components/IntegratedOrderEditor.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
