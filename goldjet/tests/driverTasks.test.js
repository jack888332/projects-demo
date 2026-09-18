import { beforeEach, describe, expect, it } from 'vitest'
import { driverTasks, driverIdentifier, driverCargo, driverAccount, DRIVER_DEMO, DRIVER_NODES, driverStatus, driverWindow, driverDocumentErrors, driverExceptions, driverTrajectory, driverEvent } from '../src/domain/driverTasks.js'
import { createDriverActions } from '../src/data/driverActions.js'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { canReadModule } from '../src/data/accessControl.js'
import { groundExceptionCloseReason } from '../src/domain/groundWaybills.js'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
const data = usePrototypeData()
beforeEach(() => { data.reset(); data.selectWorkbenchPersona('superAdmin'); data.loadDemoOverview() })
describe('第018篇登录与任务', () => {
  it('本人任务按状态划分，全部地点和独立货量保留；管理员全量预览', () => {
    const current = driverTasks(data.state.groundWaybills, DRIVER_DEMO.phone)
    expect(current).toHaveLength(1); expect(current[0].pickupPoints).toHaveLength(2)
    expect(driverTasks(data.state.groundWaybills, DRIVER_DEMO.phone, true)).toHaveLength(2)
    expect(driverTasks(data.state.groundWaybills, '', false, '全部', true).length).toBeGreaterThan(1)
    expect(driverTasks(data.state.groundWaybills, '')).toEqual([])
    expect(driverCargo(current[0])[0].label).toBe('平摊提货重量（kg）')
    expect(driverIdentifier({ childNo:'child' })).toEqual({label:'子单号',value:'child'})
    expect(driverAccount(data.state.groundWaybills, DRIVER_DEMO.phone).name).toBe('演示司机十八')
  })
  it('图形校验、60秒倒计时、验证码错误、未派车手机号及显式退出', async () => {
    let now = 0, saved = null
    const owner = createDriverActions(data.state, () => 'driver', {read:async()=>saved,write:async value=>{saved=value}}, () => now)
    expect(() => owner.sendDriverCode('123',DRIVER_DEMO.challenge)).toThrow('11位')
    expect(() => owner.sendDriverCode('00000009999',DRIVER_DEMO.challenge)).toThrow('尚未录入')
    expect(() => owner.sendDriverCode(DRIVER_DEMO.phone,'WRONG')).toThrow('图形')
    owner.sendDriverCode(DRIVER_DEMO.phone,DRIVER_DEMO.challenge)
    await expect(owner.loginDriver({phone:DRIVER_DEMO.phone,code:'wrong'})).rejects.toThrow('验证码错误，请重新输入！')
    expect(() => owner.sendDriverCode(DRIVER_DEMO.phone,DRIVER_DEMO.challenge)).toThrow('60秒')
    now = 60000; owner.sendDriverCode(DRIVER_DEMO.phone,DRIVER_DEMO.challenge)
    await owner.loginDriver({phone:DRIVER_DEMO.phone,code:DRIVER_DEMO.code})
    owner.leaveDriver(); await owner.enterDriver(); expect(owner.driverSession.phone).toBe(DRIVER_DEMO.phone)
    await owner.logoutDriver(); await owner.enterDriver(); expect(owner.driverSession.phone).toBe('')
    owner.sendDriverCode(DRIVER_DEMO.phone,DRIVER_DEMO.challenge)
    await owner.loginDriver({phone:DRIVER_DEMO.phone,code:DRIVER_DEMO.code,remember:false})
    owner.leaveDriver(); await owner.enterDriver(); expect(owner.driverSession.phone).toBe('')
  })
  it('司机角色不获得后台模块读取权，非司机不能登录', async () => {
    await expect(data.loginDriver({phone:DRIVER_DEMO.phone,method:'wechat'})).rejects.toThrow('司机演示角色')
    data.selectWorkbenchPersona('driver'); expect(canReadModule('driver')).toBe(true); expect(canReadModule('groundWaybills')).toBe(false)
    expect(data.groundSession.role).toBe('viewer')
  })
})
const image = {name:'proof.png',type:'image/png',size:8,dataUrl:'data:image/png;base64,iVBORw0KGgo='}
const payload = () => ({remark:'',images:[image],cargoDocuments:''})
const current = () => driverTasks(data.state.groundWaybills,DRIVER_DEMO.phone)[0]
async function driver() { data.selectWorkbenchPersona('driver'); await data.loginDriver({phone:DRIVER_DEMO.phone,method:'wechat'}) }
describe('第018篇履约、单据和异常', () => {
  it('五个节点串联，提卸货凭证自动进入同一运单；终态移动到历史并汇总订单', async () => {
    await driver(); const bill=current(), order=data.state.groundOrders.find(row=>row.id===bill.orderId)
    for(const node of DRIVER_NODES) data.confirmDriverNode(bill.id,node.from,payload())
    expect(bill.status).toBe('已卸货'); expect(bill.documents).toHaveLength(2)
    expect(bill.documents.map(row=>row.type)).toEqual(['提货单据','卸货单据'])
    expect(driverTasks(data.state.groundWaybills,DRIVER_DEMO.phone)).toHaveLength(0)
    expect(driverTasks(data.state.groundWaybills,DRIVER_DEMO.phone,true)[0].id).toBe(bill.id)
    expect(order.dispatchStatus).toBe('已完成'); expect(order.completedAt).toBe(bill.trajectory.at(-1).time)
    expect(() => data.confirmDriverNode(bill.id,'到达卸货点',payload())).toThrow('节点已变化')
  })
  it('缺少必传图片、重复确认和其他手机号不产生部分写入', async () => {
    await driver(); const bill=current()
    data.confirmDriverNode(bill.id,'待提货',payload())
    expect(() => data.confirmDriverNode(bill.id,'待提货',payload())).toThrow('节点已变化')
    data.confirmDriverNode(bill.id,'提货中',payload())
    const before=JSON.stringify(bill)
    expect(() => data.confirmDriverNode(bill.id,'到达提货点',{remark:'',images:[]})).toThrow('至少上传')
    expect(JSON.stringify(bill)).toBe(before)
    expect(() => data.uploadDriverDocument(data.state.groundWaybills[0].id,{type:'其他单据',remark:'',images:[]})).toThrow('无权')
    data.selectWorkbenchPersona('superAdmin')
    expect(() => data.confirmDriverNode(bill.id,'到达提货点',payload())).toThrow('司机身份')
  })
  it('司机图片上限15不改变后台9张限制，普通单据可新增且不改变履约节点', async () => {
    await driver(); const bill=current(), before=bill.status
    expect(driverDocumentErrors({type:'提货单据',images:[]}).images).toContain('至少')
    expect(driverDocumentErrors({type:'其他单据',images:Array(16).fill(image)}).images).toContain('15')
    expect(driverDocumentErrors({type:'杂费单据',images:[],feeItem:'停车费',amount:'1.234'}).amount).toContain('2位')
    expect(driverDocumentErrors({type:'其他单据',remark:'一',images:[]}).remark).toContain('2～500')
    data.uploadDriverDocument(bill.id,{type:'其他单据',remark:'补充说明',images:[]})
    data.uploadDriverDocument(bill.id,{...payload(),type:'提货单据',cargoDocuments:'有'})
    expect(bill.status).toBe(before); expect(bill.documents).toHaveLength(2); expect(bill.cargoDocuments).toBe('有')
    expect(() => data.uploadDriverDocument(bill.id,{type:'杂费单据',images:[],feeItem:'停车费',amount:'10'})).toThrow('140')
  })
  it('异常不阻断卸货；客服能看到同一记录，但期间推进后的关闭保留待确认', async () => {
    await driver(); const bill=current(), record=data.reportDriverException(bill.id,{type:'预计延误',remark:'排队等候',images:[]})
    expect(bill.status).toBe('待提货'); expect(bill.exceptionStatus).toBe('异常中')
    for(const node of DRIVER_NODES) data.confirmDriverNode(bill.id,node.from,payload())
    expect(driverStatus(bill)).toBe('已卸货'); expect(driverTasks(data.state.groundWaybills,DRIVER_DEMO.phone,true).some(row=>row.id===bill.id)).toBe(true)
    expect(groundExceptionCloseReason(bill,record)).toContain('新节点')
    expect(data.state.messages.at(-1).recipientRole).toBe('hangsheng')
    data.selectWorkbenchPersona('hangsheng'); expect(() => data.closeGroundException(bill.id,record.id)).toThrow('新节点')
  })
  it('单条司机异常无后续节点可由客服关闭并回显司机端；其他人的异常明细不泄漏', async () => {
    await driver(); const bill=current(), record=data.reportDriverException(bill.id,{type:'无法联系',remark:'现场确认',images:[]})
    data.selectWorkbenchPersona('hangsheng'); data.closeGroundException(bill.id,record.id,'已联系司机')
    expect(driverExceptions(bill,DRIVER_DEMO.phone)[0].status).toBe('已关闭')
    expect(driverTrajectory(bill,DRIVER_DEMO.phone).at(-1).event).toBe('取消异常')
    data.reportGroundException(bill.id,{type:'货物破损',remark:'客服记录',images:[]})
    expect(driverExceptions(bill,DRIVER_DEMO.phone)).toHaveLength(1)
    expect(driverTrajectory(bill,DRIVER_DEMO.phone).some(row=>row.remark.includes('客服记录'))).toBe(false)
  })
  it('历史期限含边界，争议路径阻断；单点ETA可计算，多点不猜目标', async () => {
    const terminal={status:'已卸货',customer:'其他客户',trajectory:[{event:'卸货完毕',status:'已卸货',time:'2026-09-08 14:30'},{event:'上报异常',status:'已卸货',time:'2026-09-08 15:30'}]}
    const base=Date.UTC(2026,8,8,14,30)
    expect(driverWindow(terminal,'document',base+3*86400000).allowed).toBe(true)
    expect(driverWindow(terminal,'document',base+3*86400000+1).reason).toContain('153')
    expect(driverWindow(terminal,'document',base+7*86400000+1).reason).toContain('超过')
    expect(driverWindow(terminal,'exception',base+86400000).allowed).toBe(true)
    expect(driverWindow(terminal,'exception',base+86400000+1).reason).toContain('154')
    expect(driverWindow({...terminal,status:'已取消'},'exception',base).reason).toContain('154')
    await driver(); const bill=current(); bill.pickupPoints=bill.pickupPoints.slice(0,1)
    data.confirmDriverNode(bill.id,'待提货',payload()); expect(bill.expectedArrival).toBe('2026-09-08 14:55')
    expect(driverEvent({event:'到达提货点',status:'到达提货点',time:bill.pickupTime,role:'司机'},bill).status).toBe('正常')
    expect(driverEvent({event:'到达卸货点',status:'到达卸货点',time:'2026-09-08 23:00',role:'司机'},bill).status).toBe('延误')
  })
  for(const file of ['views/DriverTasksView.vue','components/DriverTaskOperations.vue','components/GroundImagesField.vue']) it(`${file} 可编译`,()=>{
    const parsed=parse(readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file}); expect(parsed.errors).toEqual([])
    const script=compileScript(parsed.descriptor,{id:file})
    expect(compileTemplate({source:parsed.descriptor.template.content,filename:file,id:file,compilerOptions:{bindingMetadata:script.bindings}}).errors).toEqual([])
  })
})
