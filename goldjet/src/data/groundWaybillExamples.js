import { createDispatchDraft, createGroundWaybill, GROUND_NOW } from '../domain/groundOperations.js'

export function loadGroundWaybillExamples(state, session) {
  if (session.role !== 'hangsheng') throw new Error('仅航晟客服可载入运单合成示例')
  const id = 'DEMO-TRANSFER-016'
  const existing = state.groundWaybills.find(row => row.orderId === id)
  if (existing) return existing
  const point = address => ({province:'上海市',city:'上海市',district:'浦东新区',address,contact:'演示交接人',phone:'000-00001601'})
  const order = {id,orderNo:'GJ-DEMO-TRANSFER-016',childNo:'HAWB-DEMO-016',batchNo:'BATCH-DEMO-016',source:'空运API（合成已收记录）',orderType:'中转订单',businessType:'空运出口',customer:'启航跨境贸易',
    pieces:24,weight:238.5,volume:2.4,vehicleType:'3T/4.2',specialVehicle:'',regulated:'否',tailLift:'否',pickup:'浦东演示中转仓',delivery:'浦东演示货站',
    pickupPoints:[point('浦东演示中转仓')],deliveryPoints:[point('浦东演示货站')],pickupTime:GROUND_NOW,deliveryTime:'2026-09-08 17:30',dispatchStatus:'已调度',
    createdAt:'2026-09-08 10:00',updatedAt:GROUND_NOW,createDate:'2026-09-08',remark:'合成已收记录，不代表WMS接口已接入'}
  const bill = createGroundWaybill(order,{...createDispatchDraft(),vehicleType:'3T/4.2',supplier:'申捷车队',plate:'沪C·DEMO16',drivers:[{name:'演示中转司机',phone:'000-00001602',identity:''}]},
    {serial:++state.groundSequence,vehicleCount:1,actor:'WMS',time:'2026-09-08 13:40'})
  Object.assign(bill,{status:'已提货',fulfillmentStatus:'已提货',sealNo:'SEAL-DEMO-016',dispatchedById:'WMS',cargoDocuments:'有',expectedWeight:238.5,
    exampleSource:'合成已收记录，不代表WMS接口已接入',cost:null,costStatus:'未计算',documentSequence:1,
    documents:[{id:`${bill.id}-DOC1`,type:'杂费单据',remark:'合成司机待审批单据',feeItem:'停车费',amount:36.5,images:[],approvalStatus:'待审批',source:'司机',actor:'演示中转司机',createdAt:'2026-09-08 14:00',updatedAt:'2026-09-08 14:00'}]})
  bill.trajectory = [{id:`${bill.id}-T1`,event:'调度完成',status:'已提货',time:'2026-09-08 13:40',actor:'WMS',role:'WMS',remark:'合成已收记录'},
    {id:`${bill.id}-T2`,event:'已提货',status:'已提货',time:'2026-09-08 13:40',actor:'WMS',role:'WMS',remark:'合成出库重量238.50kg'}]
  state.groundOrders.push(order); state.groundWaybills.push(bill)
  return bill
}
