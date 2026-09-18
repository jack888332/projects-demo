import { warehouseDraft } from '../domain/warehouseOrders.js'
import { createDispatchDraft, createGroundWaybill } from '../domain/groundOperations.js'

export function createWarehouseSeed() {
  const examples = [
    ['WH-260908-006', 'IN-DEMO-019-01', '高捷物流集团-空运事业部', '已入库', 'AIR-260908-001', 42, 186.5, 1.28],
    ['WH-260908-007', 'IN-DEMO-019-02', '云帆供应链', '待入库', '', '', '', ''],
    ['WH-260907-019', 'WH0012609070019', '远洲电子商务', '部分出库', '', 96, 480, 3.2],
    ['WH-260906-031', 'WH0012609060031', '星瀚品牌管理', '已出库', '', 240, 1200, 8],
    ['WH-260908-032', 'WH0012609080032', '启航跨境贸易', '待出库', '', 60, 300, 2],
    ['WH-260908-033', 'WH0012609080033', '华越国际商贸', '已取消', '', '', '', ''],
  ]
  return { warehouseSequence: 40, warehouseEventSequence: 0, warehouseDemoCode: 'WH001', warehouseReturnAddress: '上海市浦东新区演示路20号退件仓（合成地址）',
    warehouseOrders: examples.map(([id, inboundNo, customer, status, airOrderId, pieces, grossWeight, volume], index) => {
      const inboundAt = pieces ? '2026-09-08 09:00' : '', partial = status === '部分出库', out = status === '已出库', outPieces = out ? pieces : partial ? 20 : 0
      return { ...warehouseDraft(), id, inboundNo, customer, status, airOrderId, manual: !airOrderId, source: airOrderId ? '空运系统' : '航晟物流客服部',
        sourceCustomer: airOrderId ? '启航跨境贸易' : customer, sourceServiceId: airOrderId ? `${airOrderId}-WAREHOUSE` : '', customerOrderNo: airOrderId ? '' : `WH-CUSTOMER-${index + 1}`,
        contact: '仓储演示联系人', phone: '000-00002000', businessType: '出口空运', goodsName: '演示电子配件', warehouse: '航晟昆山仓库', location: 'A01',
        expectedPieces: pieces || 180, expectedWeight: grossWeight || 900, expectedVolume: volume || 6, pieces, grossWeight, volume, receivedAt: inboundAt, inboundAt,
        outboundAt: out || partial ? '2026-09-08 12:00' : '', completedAt: out ? '2026-09-08 12:00' : '', outPieces,
        weighing: '是', transfer: index === 3 ? '是' : '否', labeling: '否', palletize: 2, documents: '有',
        waybillNo: airOrderId ? '781-90000010' : '', createdAt: `2026-09-0${index === 3 ? 6 : 8} 08:${String(index * 5).padStart(2, '0')}`, remark: '合成仓库订单',
        expectedServiceActorId: airOrderId ? 'DEMO-service' : 'DEMO-hangsheng', services: {}, history: [{ id: `${id}-H1`, event: '创建仓库订单', remark: '合成仓库订单', actor: airOrderId ? '高捷物流集团-空运事业部' : '航晟物流客服部', time: `2026-09-0${index === 3 ? 6 : 8} 08:${String(index * 5).padStart(2, '0')}` }, ...(pieces ? [{ id: `${id}-H2`, event: '入库', remark: `${grossWeight} kg`, actor: 'WMS', time: inboundAt }] : [])],
        pallets: pieces ? [{ number: index === 0 ? 'PALLET-DEMO-019-01' : `PALLET-020-${index + 1}`, status, inPieces: pieces, inWeight: grossWeight, inVolume: volume, inboundAt, outPieces,
          outWeight: out ? grossWeight : partial ? 100 : 0, outVolume: out ? volume : partial ? 0.5 : 0, outboundAt: out || partial ? '2026-09-08 12:00' : '', driver: out || partial ? '演示司机' : '', plate: out || partial ? '沪DEMO20' : '', seal: out || partial ? `SEAL-020-${index}` : '', inImages: [], outImages: [] }] : [],
      }
    }),
  }
}

export function loadWarehouseExamples(state) {
  if (state.groundServiceRegistry.consignments.some(row => row.number === '781-90000200')) return
  const number = '781-90000200', codes = ['WH-RETURN-020-A', 'WH-RETURN-020-B']
  state.groundServiceRegistry.consignments.push({ number, orderId: 'AIR-260908-001', pickupNo: 'PICKUP-DEMO-020', packages: codes })
  for (const [index,operation] of ['return','returnIn','returnOut'].entries()) {
    const time = `2026-09-08 ${10+index}:00:00`, actorId = index === 0 ? 'DEMO-GROUND-ST' : 'DEMO-GROUND-WH'
    state.groundServiceRecords.push({ id:`GS-WH-020-${index}`,operation,number,orderId:'AIR-260908-001',warehouseId:'',images:[],packages:index === 2 ? [codes[0]] : codes,
      remark:'合成已收退货记录',collectorName:index === 2 ? '演示提货人' : '',collectorPhone:index === 2 ? '10000002000' : '',collectorPlate:index === 2 ? '沪DEMO20' : '',
      target:'仓库',updatedAt:time,revision:1,history:[{time,actorId,action:'提交',remark:'合成已收退货记录'}],transmission:'合成已收记录，未发送' })
  }
  for (const [index,direction,feeItem,amount] of [[1,'应收','仓储费',240],[2,'应付','装卸费',80],[3,'应收','打包费（打托）',60]]) {
    state.costs.push({id:`COST-WH-020-${index}`,warehouseOrderId:'WH-260906-031',orderNo:'WH0012609060031',feeItem,direction,settlementParty:direction === '应收' ? '星瀚品牌管理' : '演示仓储服务商',currency:'CNY',amount,status:'审批通过',businessApprovedAt:'2026-09-08 13:00',updatedAt:'2026-09-08 13:00',source:'合成已审批费用，非自动计费结果'})
  }
  const point = address => ({province:'上海市',city:'上海市',district:'浦东新区',address,contact:'演示仓库联系人',phone:'000-00002000'})
  const order = {id:'DEMO-WH-TRANSPORT-020',orderNo:'WH-TRANSPORT-020',customer:'云帆供应链',source:'合成已收运输订单',orderType:'',dispatchStatus:'已调度',pieces:12,weight:120,volume:1.5,
    length:60,width:40,height:50,pickup:'航晟演示仓库A区',delivery:'演示货站',pickupPoints:[point('航晟演示仓库A区')],deliveryPoints:[point('演示货站')],pickupTime:'2026-09-08 14:30',deliveryTime:'2026-09-08 16:30',createdAt:'2026-09-08 08:30',createDate:'2026-09-08',businessType:'陆运'}
  const bill = createGroundWaybill(order,{...createDispatchDraft(),plate:'沪DEMO20',vehicleType:'3T/4.2',supplier:'申捷车队',drivers:[{name:'演示司机二十',phone:'00000002000',identity:''}]},{serial:++state.groundSequence,vehicleCount:1,actor:'陈楠',time:'2026-09-08 10:00'})
  Object.assign(bill,{status:'到达提货点',fulfillmentStatus:'到达提货点',expectedArrival:'2026-09-08 14:30',expectedArrivalSource:'合成地图回执',remark:'合成仓库运输看板记录'})
  bill.trajectory.push({id:`${bill.id}-WH1`,event:'前往提货',status:'提货中',time:'2026-09-08 14:05',role:'司机',actor:'DRIVER-020',location:'上海市浦东新区演示大道'}, {id:`${bill.id}-WH2`,event:'到达提货点',status:'到达提货点',time:'2026-09-08 14:28',role:'司机',actor:'DRIVER-020',location:'航晟演示仓库A区'})
  state.groundOrders.push(order); state.groundWaybills.push(bill)
}
