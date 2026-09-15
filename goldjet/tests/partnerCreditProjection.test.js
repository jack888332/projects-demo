import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { getPartnerCreditHistory } from '../src/domain/partnerOperations.js'
const data=usePrototypeData()
beforeEach(()=>data.reset())
describe('授信历史及被拒绝申请',()=>{
  it('跨部门历史聚合到客户；原额度按本次申请时间截断',()=>{
    const partner={creditCode:'DEMO-CUSTOMER'}
    const applications=[
      {id:'A',customerKey:partner.creditCode,partnerId:'department-A',status:'已生效',approvedAmount:100,createdAt:'2026-09-01 09:00',approvedAt:'2026-09-01 10:00'},
      {id:'B',customerKey:partner.creditCode,partnerId:'department-B',status:'已生效',approvedAmount:200,createdAt:'2026-09-01 09:30',approvedAt:'2026-09-01 11:00'},
      {id:'C',customerKey:partner.creditCode,partnerId:'department-B',status:'已生效',approvedAmount:50,createdAt:'2026-09-01 12:00',approvedAt:'2026-09-01 13:00'},
    ]
    expect(getPartnerCreditHistory(partner,applications).map(row=>[row.id,row.originalAmount])).toEqual([['C',300],['B',0],['A',0]])
  })
  it('拒绝后的申请人可以修改重提，其他角色不能修改或删除，已批复不再重提',()=>{
    const partner=data.state.partners.find(row=>row.name==='启航跨境贸易')
    data.selectWorkbenchPersona('businessSupervisor')
    const application=data.submitPartnerCredit(partner.id,{amount:100,attachments:[]})
    data.selectWorkbenchPersona('finance');data.reviewPartnerCredit(application.id,{approved:false,remark:'补充依据'})
    expect(()=>data.deletePartnerCredit(application.id)).toThrow('仅申请人')
    data.selectWorkbenchPersona('businessSupervisor')
    const retried=data.submitPartnerCredit(partner.id,{amount:200,attachments:[]},{applicationId:application.id})
    expect(retried).toMatchObject({id:application.id,status:'已提交',amount:200})
    data.selectWorkbenchPersona('finance');data.reviewPartnerCredit(application.id,{approved:true,amount:150})
    expect(partner.creditLimit).toBe(100150)
    data.selectWorkbenchPersona('businessSupervisor')
    expect(()=>data.submitPartnerCredit(partner.id,{amount:20},{applicationId:application.id})).toThrow('被拒绝')
  })
})
