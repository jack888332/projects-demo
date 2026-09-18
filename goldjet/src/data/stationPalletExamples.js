import { stationOrderDraft } from '../domain/stationPallet.js'
import paperImage from './stationPaperImage.json'

export function createStationPalletSeed() {
  return { stationSequence: 3, stationEventSequence: 0, stationQuoteSequence:2, stationTaxRates:[0,6,9,13],
    stationInboundMessages:[
      {id:'STATION-MSG-NEW',sourceOrderNo:'UPSTREAM-PALLET-004',airOrderId:'AIR-260908-002',customer:'云帆供应链',waybillNo:'781-90002104',flight:'CZ9002',station:'CZ演示货站',pieces:20,weight:200,volume:1.2},
      {id:'STATION-MSG-DUPLICATE',sourceOrderNo:'UPSTREAM-PALLET-001',airOrderId:'AIR-260908-001',customer:'启航跨境贸易',waybillNo:'781-90000010',flight:'MU9001',station:'MU演示货站',pieces:42,weight:186.5,volume:1.28},
    ],
    stationQuotes:[
      {id:'SQ-DEMO-001',partnerId:'PT-00018',taxRate:6,currency:'CNY',subject:'打板费',amount:0.45,unit:'kg',chargeMethod:'常规',startDate:'2026-09-01',endDate:'2026-09-30',remark:'合成常规报价',updatedAt:'2026-09-08 09:00',updatedBy:'DEMO-stationPallet'},
      {id:'SQ-DEMO-002',partnerId:'PT-00019',taxRate:6,currency:'CNY',subject:'打板费',amount:0.6,unit:'kg',chargeMethod:'常规',startDate:'2026-09-01',endDate:'2026-09-30',remark:'合成常规报价',updatedAt:'2026-09-08 10:00',updatedBy:'DEMO-stationPallet'},
    ], stationPapers:[{id:'PAPER-DEMO-001',flight:'MU9001',flightDate:'2026-09-10',orderIds:['SP-DEMO-001'],sourceReference:'EXPLICIT-PAPER-021',images:[{...paperImage}],remark:'合成已收板纸，订单关联已显式给定',revision:1,completedAt:'2026-09-08 12:00',updatedAt:'2026-09-08 12:00',viewers:['周倩','李明','王晴'],noticeRecipients:['打板演示主管','周倩','李明','王晴'],history:[{event:'首次上传（合成已收）',time:'2026-09-08 12:00',actor:'DEMO-stationPallet',remark:'合成板纸'}]}], stationOrders: [
    {id:'SP-DEMO-001',orderNo:'DEMO-SP-260908-001',source:'upstream',sourceOrderNo:'UPSTREAM-PALLET-001',airOrderId:'AIR-260908-001',customer:'启航跨境贸易',flight:'MU9001',waybillNo:'781-90000010',station:'MU演示货站',pieces:42,weight:186.5,volume:1.28,status:'已打板',createdAt:'2026-09-08 09:00',cargoSource:'合成已接收托书货量'},
    {id:'SP-DEMO-002',orderNo:'DEMO-SP-260908-002',source:'local',partnerId:'PT-00019',customerOrderNo:'EXTERNAL-DEMO-021',flight:'CZ9002',station:'CZ演示货站',pieces:20,weight:200,volume:1.2,status:'待入站',createdAt:'2026-09-08 10:00',cargoSource:'手工委托'},
    {id:'SP-DEMO-003',orderNo:'DEMO-SP-260908-003',source:'upstream',sourceOrderNo:'UPSTREAM-PALLET-003',customer:'远洲电子商务',flight:'MU9001',waybillNo:'781-90000030',station:'MU演示货站',pieces:24,weight:96,volume:0.72,status:'已入站',createdAt:'2026-09-08 11:00',cargoSource:'合成已接收托书货量'},
  ].map(row => ({...stationOrderDraft(),businessType:'出口空运',...row,history:[{event:'创建打板订单',time:row.createdAt,actor:'DEMO-STATION-021',remark:'合成已收记录；保留来源状态，不代表冲突已解决'}]})) }
}

export function loadStationPalletExamples(state) {
  if(!state.costs.some(row=>row.id==='COST-STATION-DEMO-001'))state.costs.push({id:'COST-STATION-DEMO-001',stationOrderId:'SP-DEMO-001',feeItem:'打板费',direction:'应收',settlementParty:'启航跨境贸易',currency:'CNY',amount:60,status:'审批通过',source:'合成已收费用，非自动计费结果',updatedAt:'2026-09-08 13:00'})
}
