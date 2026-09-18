import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { groundExceptionErrors, groundExceptionCloseReason, groundImagesError } from '../src/domain/groundWaybills.js'
import { groundWaybillTerminal } from '../src/domain/groundOperations.js'
import { groundMonthlyRows } from '../src/domain/groundOrders.js'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const data = usePrototypeData(), draft = () => ({type:'预计延误',remark:'等待现场确认',images:[]})
beforeEach(() => { data.reset(); data.selectWorkbenchPersona('hangsheng') })
describe('GJ-016 异常记录与履约', () => {
  it('单异常无后续节点可关闭，恢复原节点并追加账户轨迹', () => {
    const bill = data.state.groundWaybills[0], order = data.state.groundOrders[2]
    const record = data.reportGroundException(bill.id,draft())
    expect(bill.status).toBe('异常中'); expect(bill.exceptionStatus).toBe('异常中')
    expect(order.dispatchStatus).toBe('已调度'); expect(order.statusPendingReason).toContain('待确认')
    expect(bill.trajectory.at(-1).actor).toBe('DEMO-hangsheng')
    data.closeGroundException(bill.id,record.id,'已联系现场')
    expect(bill.status).toBe('待提货'); expect(bill.exceptionStatus).toBe('异常已关闭')
    expect(bill.exceptions[0]).toMatchObject({status:'已关闭',closedBy:'DEMO-hangsheng',closeRemark:'已联系现场'})
    expect(bill.trajectory.at(-1).event).toBe('取消异常'); expect(order.statusPendingReason).toBe('')
    expect(() => data.closeGroundException(bill.id,record.id)).toThrow('已关闭')
  })
  it('未关闭异常不阻断节点；期间有后续节点时不能假定恢复结果', () => {
    const bill = data.state.groundWaybills[0]
    const record = data.reportGroundException(bill.id,draft())
    data.updateGroundWaybillStatus(bill.id,{status:'已卸货',time:'2026-09-08 18:00'})
    expect(bill.status).toBe('已卸货'); expect(bill.exceptionStatus).toBe('异常中')
    expect(groundExceptionCloseReason(bill,record)).toContain('新节点')
    const before = JSON.stringify(bill)
    expect(() => data.closeGroundException(bill.id,record.id)).toThrow('新节点')
    expect(JSON.stringify(bill)).toBe(before)
    expect(data.state.groundOrders[2].completedAt).toBeUndefined()
    expect(groundMonthlyRows(data.state.groundOrders)[0].totalCount).toBeNull()
  })
  it('已卸货仍可上报但不能重新开放状态管理；已取消拒绝上报', () => {
    const bill = data.state.groundWaybills[0]
    data.updateGroundWaybillStatus(bill.id,{status:'已卸货',time:'2026-09-08 18:00'})
    const record = data.reportGroundException(bill.id,draft())
    expect(groundWaybillTerminal(bill)).toBe(true)
    expect(() => data.updateGroundWaybillStatus(bill.id,{status:'待提货',time:'2026-09-08 18:00'})).toThrow('不能再修改')
    data.closeGroundException(bill.id,record.id); expect(bill.status).toBe('已卸货')
    bill.status = '已取消'; expect(() => data.reportGroundException(bill.id,draft())).toThrow('已取消')
  })
  it('多异常保留全部记录，恢复待确认；角色切换后写入口重新校验', () => {
    const bill = data.state.groundWaybills[0]
    const first = data.reportGroundException(bill.id,draft()); data.reportGroundException(bill.id,{...draft(),type:'货物破损'})
    expect(bill.exceptions).toHaveLength(2)
    expect(() => data.closeGroundException(bill.id,first.id)).toThrow('多条异常')
    data.selectWorkbenchPersona('groundSupervisor')
    expect(() => data.reportGroundException(bill.id,draft())).toThrow('仅航晟客服')
    expect(() => data.closeGroundException(bill.id,first.id)).toThrow('仅航晟客服')
    data.reset(); expect(data.state.groundWaybills[0].exceptions).toBeUndefined()
  })
  it('类别、备注及附件边界在写入前阻断，保持原状态', () => {
    expect(groundExceptionErrors({type:'',remark:'一',images:[]})).toMatchObject({type:expect.any(String),remark:expect.any(String)})
    expect(groundExceptionErrors({type:'其它',remark:'',images:[]})).toEqual({})
    expect(groundImagesError(Array(10).fill({}))).toContain('9张')
    expect(groundImagesError([{name:'x.jpg',type:'image/jpeg',size:7*1024*1024}])).toContain('6MB')
    const before = JSON.stringify(data.state.groundWaybills)
    expect(() => data.reportGroundException(data.state.groundWaybills[0].id,{...draft(),images:[{name:'x.exe'}]})).toThrow('格式')
    expect(JSON.stringify(data.state.groundWaybills)).toBe(before)
  })
})

describe('GJ-016 单据与中转共享来源', () => {
  it('普通单据新增修改删除不改变运单、货物资料或财务，ID删除后不复用', () => {
    const bill = data.state.groundWaybills[0], beforeCosts = JSON.stringify(data.state.costs)
    const first = data.saveGroundDocument(bill.id,{type:'提货单据',remark:'现场提货',images:[]})
    expect(first).toMatchObject({actor:'DEMO-hangsheng',approvalStatus:'',feeItem:'',amount:null})
    data.saveGroundDocument(bill.id,{type:'其他单据',remark:'补充凭据',images:[]},first.id)
    expect(bill.documents).toHaveLength(1); expect(bill.documents[0].remark).toBe('补充凭据')
    data.deleteGroundDocument(bill.id,first.id)
    const second = data.saveGroundDocument(bill.id,{type:'卸货单据',remark:'',images:[]})
    expect(second.id).not.toBe(first.id); expect(bill.status).toBe('待提货'); expect(bill.cargoDocuments).toBe('')
    expect(JSON.stringify(data.state.costs)).toBe(beforeCosts)
    data.selectWorkbenchPersona('groundSupervisor')
    expect(() => data.deleteGroundDocument(bill.id,second.id)).toThrow('仅航晟客服')
  })
  it('杂费写入和通过金额待确认不落账，明确的驳回留账户及备注，不能重审或删除', () => {
    const bill = data.loadGroundWaybillExamples(), document = bill.documents[0], before = JSON.stringify(data.state.costs)
    expect(() => data.saveGroundDocument(bill.id,{type:'杂费单据',feeItem:'停车费',amount:12,images:[]})).toThrow('待确认')
    expect(() => data.reviewGroundDocument(bill.id,document.id,{result:'通过'})).toThrow('待确认')
    expect(() => data.reviewGroundDocument(bill.id,document.id,{result:'通过并修改金额',newAmount:25})).toThrow('待确认')
    expect(() => data.deleteGroundDocument(bill.id,document.id)).toThrow('不提供删除')
    expect(() => data.saveGroundDocument(bill.id,{type:'其他单据',images:[]},document.id)).toThrow('不提供修改')
    data.reviewGroundDocument(bill.id,document.id,{result:'驳回',remark:'凭证不足\n待核实'})
    expect(data.state.groundWaybills.find(row => row.id === bill.id).documents[0]).toMatchObject({approvalStatus:'驳回',actor:'DEMO-hangsheng',approvalRemark:'凭证不足\n待核实'})
    expect(() => data.reviewGroundDocument(bill.id,document.id,{result:'驳回'})).toThrow('仅待审批')
    expect(JSON.stringify(data.state.costs)).toBe(before)
  })
  it('合成中转幂等、双WMS轨迹、精确关系，重置清除；不冒充外部接口', () => {
    const bill = data.loadGroundWaybillExamples(), count = data.state.groundWaybills.length
    expect(bill).toMatchObject({status:'已提货',sealNo:'SEAL-DEMO-016',dispatchedBy:'WMS',expectedWeight:238.5})
    expect(bill.trajectory.map(row=>row.event)).toEqual(['调度完成','已提货'])
    expect(data.state.groundOrders.find(row=>row.id===bill.orderId).orderType).toBe('中转订单')
    data.loadGroundWaybillExamples(); expect(data.state.groundWaybills).toHaveLength(count)
    data.reset(); expect(data.state.groundWaybills.find(row=>row.id===bill.id)).toBeUndefined()
    expect(() => data.loadGroundWaybillExamples()).toThrow('仅航晟客服')
  })
  it('改动SFC均可编译', () => {
    for (const file of ['components/GroundImagesField.vue','components/GroundWaybillDocuments.vue','components/GroundWaybillExceptions.vue','views/GroundWaybillsView.vue']) {
      const {descriptor,errors} = parse(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'))
      expect(errors).toEqual([])
      const script = compileScript(descriptor,{id:file})
      expect(compileTemplate({source:descriptor.template.content,filename:file,id:file,compilerOptions:{bindingMetadata:script.bindings}}).errors).toEqual([])
    }
  })
})
