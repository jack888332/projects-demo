import {beforeEach,describe,it,expect} from 'vitest'
import {usePrototypeData} from '../src/data/usePrototypeData.js'
import {accessState,getModuleAccess,rolePermissionDraft,saveRolePermissions,resetRolePermissions,canReadTarget} from '../src/data/accessControl.js'
import {stationOrderDraft,stationOrderRows,stationOrderErrors} from '../src/domain/stationPallet.js'
import {stationQuoteDraft,stationQuoteRows} from '../src/domain/stationQuotes.js'
import {stationPaperImagesError,stationPlans,stationPaperRows} from '../src/domain/stationPapers.js'
const data=usePrototypeData(),draft=()=>({...stationOrderDraft(),partnerId:'PT-00018',businessType:'出口空运',weight:'200',customerOrderNo:'REPEAT'})
beforeEach(()=>{data.reset();data.selectWorkbenchPersona('stationPallet')})
describe('chapter021 station orders',()=>{
  it('creates unique local IDs without deduplicating customer reference or guessing initial state',()=>{
    const first=data.createStationOrder(draft()),second=data.createStationOrder(draft())
    expect(first.id).not.toBe(second.id);expect(first.customerOrderNo).toBe(second.customerOrderNo)
    expect(first.status).toBe('');expect(first.pieces).toBe('');expect(first.financeOrganization).toBe('广州航晟物流有限公司')
    expect(stationOrderRows(data.state)[0].id).toBe(second.id)
    expect(stationOrderRows(data.state)[0].statusLabel).toBe('初始状态待确认')
  })
  it('validates all mandatory fields and declared lengths, leaving optional values blank',()=>{
    expect(Object.keys(stationOrderErrors(stationOrderDraft(),data.state))).toEqual(expect.arrayContaining(['partnerId','businessType','weight']))
    const count=data.state.stationOrders.length
    expect(()=>data.createStationOrder({...draft(),phone:'abc'})).toThrow();expect(()=>data.createStationOrder({...draft(),weight:'NaN'})).toThrow()
    expect(data.state.stationOrders).toHaveLength(count)
    const row=data.createStationOrder({...draft(),phone:'00000002100',remark:'字段保留',flight:'MU9001',volume:'1.25',contact:'演示联系人'})
    expect(row.volume).toBe('1.25');expect(row.remark).toBe('字段保留')
  })
  it('rejects non-station and revoked writes including admin',()=>{
    for(const role of ['superAdmin','warehouseService','groundStation','operator']){data.selectWorkbenchPersona(role);expect(()=>data.createStationOrder(draft())).toThrow()}
    data.selectWorkbenchPersona('stationPallet');accessState.policies.stationPallet={stationPallet:{write:false}};expect(()=>data.createStationOrder(draft())).toThrow()
  })
  it('deletes only local waiting-in records and never advances unresolved states',()=>{
    expect(()=>data.deleteStationOrder('SP-DEMO-001')).toThrow('内部上游')
    const created=data.createStationOrder(draft());expect(()=>data.deleteStationOrder(created.id)).toThrow('120')
    const before=JSON.stringify(data.state.stationOrders);expect(()=>data.updateStationStatus(created.id,'已打板')).toThrow('120');expect(JSON.stringify(data.state.stationOrders)).toBe(before)
    data.deleteStationOrder('SP-DEMO-002');expect(data.state.stationOrders.some(row=>row.id==='SP-DEMO-002')).toBe(false)
  })
  it('saves regular quotes with equal dates and 500-character remarks; complex quotes never degrade to regular',()=>{
    const quote={...stationQuoteDraft(),partnerId:'PT-00018',taxRate:6,amount:'0.75',startDate:'2026-09-08',endDate:'2026-09-08',remark:'A'.repeat(500)}
    const row=data.saveStationQuote(quote)
    expect(stationQuoteRows(data.state)[0].id).toBe(row.id)
    expect(row.startDate).toBe(row.endDate);expect(row.remark).toHaveLength(500)
    expect(()=>data.saveStationQuote({...quote,chargeMethod:'梯度报价方式'})).toThrow('173')
    expect(()=>data.saveStationQuote({...quote,remark:'A'.repeat(501)})).toThrow()
    expect(()=>data.saveStationQuote({...quote,endDate:'2026-09-07'})).toThrow()
    expect(()=>data.saveStationQuote({...quote,currency:'USD'},row.id)).toThrow('173')
    data.saveStationQuote({...quote,amount:'0.8'},row.id);expect(row.amount).toBe('0.8')
    data.deleteStationQuote(row.id);expect(data.state.stationQuotes.some(item=>item.id===row.id)).toBe(false)
  })
  it('protects costs already referencing a quote and scopes the new persona',async()=>{
    expect(getModuleAccess('airOrders').page).toBe(false);expect(getModuleAccess('costs').write).toBe(false)
    expect(getModuleAccess('costs').data).toBe(true);expect(canReadTarget('/finance/costs')).toBe(false)
    const row=data.state.stationQuotes[0]
    data.state.costs.push({stationQuoteId:row.id,amount:5})
    expect(()=>data.deleteStationQuote(row.id)).toThrow('055');expect(()=>data.saveStationQuote({...row,amount:0.8},row.id)).toThrow('055')
  })
  it('lets admin narrow and restore station access without expanding the role ceiling',()=>{
    data.selectWorkbenchPersona('superAdmin')
    const draft=rolePermissionDraft('stationPallet');draft.stationPallet.write=false;draft.costs.data=false
    saveRolePermissions('stationPallet',draft)
    expect(getModuleAccess('stationPallet','stationPallet').write).toBe(false)
    expect(getModuleAccess('costs','stationPallet').data).toBe(false)
    const invalid=rolePermissionDraft('stationPallet');invalid.costs.page=true
    expect(()=>saveRolePermissions('stationPallet',invalid)).toThrow('不能扩张')
    resetRolePermissions('stationPallet')
    expect(getModuleAccess('stationPallet','stationPallet').write).toBe(true)
    expect(getModuleAccess('costs','stationPallet')).toEqual({menu:false,page:false,data:true,write:false})
  })
  it('receives explicit upstream payloads and rejects duplicate supplier order numbers atomically',()=>{
    const row=data.receiveStationOrder('STATION-MSG-NEW')
    expect(row.orderNo).toBe('UPSTREAM-PALLET-004');expect(row.weight).toBe(200);expect(row.status).toBe('');expect(row.financeOrganization).toBe('')
    const before=JSON.stringify(data.state.stationOrders)
    expect(()=>data.receiveStationOrder('STATION-MSG-NEW')).toThrow('已存在');expect(()=>data.receiveStationOrder('STATION-MSG-DUPLICATE')).toThrow('已存在')
    expect(JSON.stringify(data.state.stationOrders)).toBe(before)
  })
  it('modifies explicit existing papers, preserves completion time and emits one notice per configured recipient',()=>{
    const paper=data.state.stationPapers[0],draft=JSON.parse(JSON.stringify(paper)),status=data.state.stationOrders.map(row=>row.status),costs=JSON.stringify(data.state.costs)
    draft.remark='已补充新板纸'
    data.saveStationPaper(draft,paper.id)
    expect(paper.revision).toBe(2);expect(paper.completedAt).toBe('2026-09-08 12:00');expect(data.state.messages).toHaveLength(4)
    expect(data.state.messages[0].content).toBe('航班号：MU9001，板纸已修改，请留意变更！')
    expect(()=>data.saveStationPaper(draft,paper.id)).toThrow('已被修改')
    data.saveStationPaper(JSON.parse(JSON.stringify(paper)),paper.id);expect(data.state.messages).toHaveLength(4)
    expect(data.state.stationOrders.map(row=>row.status)).toEqual(status);expect(JSON.stringify(data.state.costs)).toBe(costs)
  })
  it('enforces strict image size and minimum count, locks flight, and blocks unresolved first uploads',()=>{
    const paper=JSON.parse(JSON.stringify(data.state.stationPapers[0])),image=paper.images[0]
    expect(stationPaperImagesError([])).toContain('至少1');expect(stationPaperImagesError(Array(10).fill(image))).toContain('最多9')
    expect(stationPaperImagesError([{...image,size:6*1024*1024}])).toContain('小于6MB')
    expect(()=>data.saveStationPaper({...paper,flight:'CZ9002'},paper.id)).toThrow('航班号不可变更')
    expect(()=>data.saveStationPaper(paper)).toThrow('119、172')
    expect(data.state.stationPapers).toHaveLength(1)
    expect(stationPaperRows(data.state,'handler',{name:'王晴'})).toHaveLength(1)
    expect(stationPaperRows(data.state,'handler',{name:'无关人员'})).toEqual([])
  })
  it('reads allocated cargo from the existing owner and respects route ownership',()=>{
    data.selectWorkbenchPersona('operator');data.allocateAirOrders(['AIR-260908-001'],'FLIGHT-MU9001:2026-09-10')
    const plans=stationPlans(data.state,'operator',data.airSession)
    expect(plans[0].rows[0].orderId).toBe('AIR-260908-001');expect(plans[0].totalWeight).toBe(186.5)
    expect(stationPlans(data.state,'operator',{role:'operator',name:'其他人员'})).toEqual([])
    data.unloadAirAllocations([data.state.palletAllocations[0].id]);expect(stationPlans(data.state,'stationPallet',{})).toEqual([])
  })
})
