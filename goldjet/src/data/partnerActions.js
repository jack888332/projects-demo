import { createPartnerDraft, normalizePartner, getPartnerPermissions, validatePartnerDraft, validateCreditAmount, getPartnerCustomerKey, getPartnerCreditTotal } from '../domain/partnerOperations.js'
import { PARTNER_SAMPLE_ATTACHMENT } from '../domain/partnerPresentation.js'

const clone = value => JSON.parse(JSON.stringify(value))
const round = value => Math.round(value * 100) / 100
const sample = () => ({ ...PARTNER_SAMPLE_ATTACHMENT, size: new TextEncoder().encode(PARTNER_SAMPLE_ATTACHMENT.content).length })
export function initializePartnerState(seed) {
  seed.organizationNames = ['高捷物流集团-空运事业部', '航晟物流']
  seed.partnerDepartments = ['华东业务部', '华南业务部', '空运产品部', '地面运输部']
  seed.partnerSequence = 40
  seed.partnerEventSequence = 0
  seed.creditApplications = []
  seed.messages = []
  seed.partners = seed.partners.map((value,index) => {
    const partner = normalizePartner({
      ...value, code: (value.type === '客户' ? 'C' : 'S') + value.id.slice(-5),
      relationship:'境内机构', creditCode:'DEMO' + String(index+1).padStart(14,'0'), shortName:value.name,
      address:{country:'中国',province:'上海市',city:'上海市',district:'浦东新区',detail:'合成演示地址 '+(index+1)+' 号'},
      longTerm:true,businessExpiry:'',category:'外部单位',taxRate:6,sales:'周倩',signedContract:'是',paymentDays:'30',
      servicePerson:'周倩',invoiceTitle:value.name,attachments:[sample()],
      contacts:[{id:value.id+'-CONTACT-1',type:'操作联系人',name:value.contact,phone:'00000000001',mobile:'00000000001',fax:'',email:'partner'+(index+1)+'@example.invalid',remark:'合成演示联系人'}],
      createdAt:'2026-09-01 09:00:00',creator:'周倩',updatedBy:'财务演示人员',history:[],approvals:[],
      usedCredit: Number.isFinite(value.creditLimit) ? value.creditLimit-value.availableCredit : 0,
    })
    if(partner.type==='客户' && Number.isFinite(value.creditLimit)) seed.creditApplications.push({
      id:'CREDIT-SEED-'+partner.id,partnerId:partner.id,customerKey:partner.creditCode,status:'已生效',
      amount:value.creditLimit,approvedAmount:value.creditLimit,department:partner.department,creator:'业务演示主管',
      createdAt:'2026-09-01 09:00:00',approvedAt:'2026-09-01 10:00:00',approvedBy:'财务演示人员',decision:'通过',remark:'合成期初授信',attachments:[sample()],
    })
    return partner
  })
  return seed
}

export function createPartnerActions(state, getSession) {
  const find = id => { const partner=state.partners.find(row=>row.id===id && row.status!=='已删除'); if(!partner) throw new Error('合作方不存在'); return partner }
  const now = () => new Date(Date.UTC(2026,8,8,14,30,++state.partnerEventSequence)).toISOString().slice(0,19).replace('T',' ')
  const requireAction = (partner,action) => { if(!getPartnerPermissions(partner,getSession().role)[action]) throw new Error('当前角色或档案状态不允许执行此操作') }
  const check = errors => { if(Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]),{fields:errors}) }
  const record = (partner,action,time,remark='') => {
    partner.history ||= []; partner.history.push({id:partner.id+'-H'+(partner.history.length+1),actor:getSession().name,time,action,remark})
    partner.updatedAt=time;partner.updatedBy=getSession().name
  }
  function notify(partner,kind,time,{amount,application}={}) {
    const credit = Boolean(application), approved=kind==='审批通过', rejected=kind==='审批拒绝'
    const label=credit?'客户额度':partner.type
    const object=application || partner
    const message={
      id:'MSG-'+String(state.messages.length+1).padStart(5,'0'),type:label+kind,createdAt:time,
      channel:approved?'首页工作台站内消息':'企业微信',status:'本地模拟',
      recipient:kind==='已提交'?'财务演示人员':object.creator,
      recipientRole:kind==='已提交'?'finance':'',
      related:{path:'/foundation/partners',query:{partner:partner.id,type:partner.type,mode:credit?'credit':kind==='已提交'?'approve':'detail',...(credit && kind==='已提交'?{application:application.id}:{})}},
    }
    message.content=approved ? credit ? '尊敬的用户，您提交的客户额度申请已批复，批复金额为'+Number(amount).toFixed(2)+'，请及时查看！' : '尊敬的用户，您提交的'+label+'申请'+partner.code+'、'+partner.name+'已审批通过！'
      : rejected ? '尊敬的用户，您申请的'+label+partner.code+'、'+partner.name+'已被审批拒绝，请尽快处理！'
      : '尊敬的用户，您有一个新的'+label+'申请需审批：'+partner.code+'、'+partner.name+'，请尽快处理！'
    state.messages.push(message)
  }
  function submitInternal(partner,time) {
    partner.status='已提交';partner.approvals ||= []
    partner.approvals.push({id:partner.id+'-APP-'+(partner.approvals.length+1),status:'已提交',creator:getSession().name,createdAt:time})
    record(partner,'已提交',time,partner.type+'新建提交');notify(partner,'已提交',time)
  }
  function savePartner(payload,{submit=false}={}) {
    const session=getSession(), existing=payload.id ? find(payload.id) : null
    requireAction(existing,existing?'edit':'create')
    if(submit && existing) requireAction(existing,'submit')
    const draft={...createPartnerDraft(payload.type),...clone(payload)}
    draft.department=existing?.department || session.department
    check(validatePartnerDraft(draft,state.partners,{existing,organizationNames:state.organizationNames,department:draft.department}))
    const time=now(),serial=existing ? null : ++state.partnerSequence
    const id=existing?.id || 'PT-'+String(serial).padStart(5,'0')
    const editable = Object.fromEntries(Object.keys(createPartnerDraft(draft.type)).map(key=>[key,clone(draft[key])]))
    const partner = existing || {id,code:(draft.type==='客户'?'C':'S')+String(serial).padStart(5,'0'),status:'新建',department:draft.department,creator:session.name,createdAt:time,history:[],approvals:[],creditLimit:0,availableCredit:0,usedCredit:0}
    // The system identity/status/credit fields cannot be overwritten by the form payload.
    delete editable.code
    Object.assign(partner,editable)
    for(const key of ['banks','contacts','recipients']) partner[key].forEach((row,index)=>{row.id ||= id+'-'+key+'-'+time.replace(/\D/g,'')+'-'+index})
    record(partner,existing?'保存修改':'保存',time)
    if(submit) submitInternal(partner,time)
    if(!existing) state.partners.push(partner)
    return find(id)
  }
  function submitPartner(id) {
    const partner=find(id);requireAction(partner,'submit')
    check(validatePartnerDraft(partner,state.partners,{existing:partner,organizationNames:state.organizationNames,department:partner.department}))
    submitInternal(partner,now());return partner
  }
  function reviewPartner(id,{approved,remark=''}) {
    const partner=find(id);requireAction(partner,'approve')
    if(!approved) throw new Error(getPartnerPermissions(partner,getSession().role).rejectionReason)
    if(remark.length>256) throw new Error('审批备注最多 256 个字符')
    const time=now();partner.status='已生效'
    if(partner.type==='客户') {
      partner.creditLimit=totalCredit(partner)
      partner.availableCredit=round(partner.creditLimit-(partner.usedCredit || 0))
    }
    Object.assign(partner.approvals.at(-1),{status:'审批通过',decidedAt:time,actor:getSession().name,remark})
    record(partner,'审批通过',time,remark);notify(partner,'审批通过',time);return partner
  }
  function setPartnerActive(id,active) {
    const partner=find(id);requireAction(partner,active?'activate':'deactivate')
    partner.status=active?'已生效':'已失效';record(partner,active?'生效':'失效',now());return partner
  }
  function deletePartner(id) {
    const partner=find(id);requireAction(partner,'delete')
    if (state.airMaster?.airlines.some(row => row.supplierIds.includes(id))) throw new Error('该供应商已被航司主数据引用；删除后的关联处理待确认，暂不能删除')
    if (state.transportQuotes?.some(row => row.partnerId === id)) throw new Error('该合作方已被运输报价引用；删除后的关联处理待确认，暂不能删除')
    if (state.warehouseQuotes?.some(row => row.partnerId === id)) throw new Error('该合作方已被仓库报价引用；删除后的关联处理待确认，暂不能删除')
    if (state.airSupplierRates?.some(row => row.partnerId === id)) throw new Error('该合作方已被空运供应商价格引用；删除后的关联处理待确认，暂不能删除')
    const used=[...state.airOrders,...state.groundOrders,...state.warehouseOrders].some(row=>row.customerId===id || row.customer===partner.name || row.supplier===partner.name)
      || state.groundWaybills.some(row=>row.supplier===partner.name || row.customer===partner.name)
      || state.costs.some(row=>row.settlementParty===partner.name)
    if(used) throw new Error('该合作方存在订单或结算明细，不能删除')
    partner.status='已删除';record(partner,'删除',now());return partner
  }
  const customerKey = getPartnerCustomerKey
  const totalCredit = partner => getPartnerCreditTotal(partner,state.creditApplications)
  function submitPartnerCredit(id,payload,{applicationId}={}) {
    const partner=find(id);requireAction(partner,'requestCredit')
    const previous=applicationId?state.creditApplications.find(row=>row.id===applicationId):null
    if(applicationId && (!previous || previous.partnerId!==id || previous.status!=='财务审批拒绝' || previous.creator!==getSession().name)) throw new Error('仅申请人可修改并重新提交被拒绝的额度申请')
    check(validateCreditAmount(payload.amount,totalCredit(partner)))
    const attachments=clone(payload.attachments || [])
    if(attachments.some(file=>!['text/plain','image/png','image/jpeg'].includes(file.type) || file.size>20*1024*1024)) throw new Error('额度附件应为文本或图片，且不超过20M')
    const time=now(),session=getSession()
    const values={id:previous?.id || 'CREDIT-'+String(state.creditApplications.length+1).padStart(5,'0'),partnerId:id,customerKey:customerKey(partner),status:'已提交',amount:Number(payload.amount),department:session.department,creator:session.name,createdAt:time,updatedAt:time,updatedBy:session.name,attachments,approvedAmount:null,remark:'',approvedAt:'',approvedBy:'',decision:''}
    const application=previous || values
    if(previous) Object.assign(previous,values)
    else state.creditApplications.push(application)
    record(partner,'额度申请已提交',time);notify(partner,'已提交',time,{application});return application
  }
  function deletePartnerCredit(id) {
    const application=state.creditApplications.find(row=>row.id===id)
    if(!application || application.status!=='财务审批拒绝' || application.creator!==getSession().name || getSession().role!=='businessSupervisor') throw new Error('仅申请人可删除被拒绝的额度申请')
    application.status='已删除';record(find(application.partnerId),'删除额度申请',now());return application
  }
  function reviewPartnerCredit(id,{approved,amount,remark=''}) {
    const application=state.creditApplications.find(row=>row.id===id)
    if(!application || application.status!=='已提交' || getSession().role!=='finance') throw new Error('仅财务可审批已提交的额度申请')
    const partner=find(application.partnerId),current=totalCredit(partner)
    if(approved) check(validateCreditAmount(amount,current))
    if(remark.length>240) throw new Error('额度审批备注最多 240 个字符')
    const time=now()
    Object.assign(application,{status:approved?'已生效':'财务审批拒绝',approvedAmount:approved?Number(amount):null,approvedBy:getSession().name,approvedAt:time,decision:approved?'通过':'拒绝',remark,updatedAt:time,updatedBy:getSession().name})
    // creditApplications is authoritative; these are projections for existing order consumers.
    for(const related of state.partners.filter(row=>row.type==='客户' && customerKey(row)===customerKey(partner))) {
      related.creditLimit=totalCredit(related);related.availableCredit=round(related.creditLimit-(related.usedCredit || 0))
    }
    record(partner,approved?'额度审批通过':'额度审批拒绝',time,remark);notify(partner,approved?'审批通过':'审批拒绝',time,{amount,application});return application
  }
  return {savePartner,submitPartner,reviewPartner,setPartnerActive,deletePartner,submitPartnerCredit,reviewPartnerCredit,deletePartnerCredit}
}
