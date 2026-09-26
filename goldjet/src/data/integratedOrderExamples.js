import { createServiceRecord, INTEGRATED_DATE } from '../domain/integratedOrders.js'

// Deterministic synthetic seed; names, ports and figures are demo values only.
function cargo(values) {
  return values.map((row, index) => ({ id: `CGO-${index + 1}`, ...row }))
}

function house(houseNo, cargoRows) {
  return { key: houseNo || `HOUSE-${Math.random().toString(36).slice(2, 7)}`, houseNo, cargo: cargo(cargoRows) }
}

const timeline = (event, actor, content, clock) => ({ id: `${event}-${clock}`, event, actor, content, time: `${INTEGRATED_DATE} ${clock}` })

export function createIntegratedOrderSeed() {
  let serviceSequence = 0
  const nextServiceId = () => `SV${INTEGRATED_DATE.slice(2).replaceAll('-', '')}${String(++serviceSequence).padStart(5, '0')}`
  const service = (category, item, options = {}) => ({
    ...createServiceRecord(category, item, options.houseKey || ''),
    serviceType: options.serviceType || '我司服务', supplier: options.supplier || '', department: options.department || '',
    remark: '', generated: options.generated !== false, status: options.status || '待接单',
    fields: options.fields || {}, history: options.history || [], id: nextServiceId(),
  })
  const orders = [
    {
      id: 'G26090800001', orderNo: 'G26090800001', businessType: '普货', businessMode: '进口',
      financeOrg: '广州航晟物流有限公司', department: '华东业务部', serviceClerk: '周倩', salesperson: '周倩',
      transfer: false, transferOrg: '', transferDepartment: '', originalSalesperson: '', remark: '演示：普货进口一主一分。',
      customerPartnerId: 'PT-00018', customer: '启航跨境贸易', contactName: '赵敏', contactPhone: '000-00001018', contactEmail: 'customer18@example.invalid', customerRemark: '',
      transportMode: '空运', originPort: 'PVG', destinationPort: 'LAX', waybillNo: '999-90008801',
      status: '进行中', source: '直接建单', creator: '周倩', createdAt: '2026-09-08 09:10',
      attachments: [{ id: 'ATT-INT-01', type: '报关资料', name: '演示装箱单.pdf', size: 2048, uploader: '周倩', uploadedAt: '2026-09-08 09:12', visibility: ['customs'] }],
      houses: [house('GJ260900001', [
        { chineseName: '合成演示货物甲', englishName: 'DEMO CARGO A', specialCargo: '', expectedPieces: 42, expectedWeight: 186.5, expectedVolume: 1.28 },
      ])],
      services: [
        service('trunk', 'booking', { department: '空运产品部', supplier: '广东高捷', fields: { airlineCode: 'MU 东方航空', expectedArrivalDate: '2026-09-10' }, status: '进行中', history: [timeline('生成服务', '系统', '随订单提交生成订舱服务单', '09:11'), timeline('接单', '航线运营', '待确认航班', '09:20')] }),
        service('customs', 'customsDeclare', { houseKey: 'GJ260900001', department: '关务部', fields: { customsType: '代理报关', transfer: false }, history: [timeline('生成服务', '系统', '随订单提交生成国内报关服务单', '09:11')] }),
        service('warehouse', 'warehouse', { houseKey: 'GJ260900001', department: '仓库部', fields: { warehouseName: '广州保税仓 WH001', expectedInboundTime: '2026-09-09 10:00' }, status: '进行中', history: [timeline('生成服务', '系统', '随订单提交生成仓储服务单', '09:11'), timeline('接单', '仓库演示客服', '等待入仓', '09:25')] }),
      ],
      history: [
        { id: 'H1', event: '订单创建', content: '客服直接建单', actor: '周倩', time: '2026-09-08 09:10' },
        { id: 'H2', event: '提交订单', content: '生成未下发服务单，订单转进行中', actor: '周倩', time: '2026-09-08 09:11' },
      ],
    },
    {
      id: 'C26090800002', orderNo: 'C26090800002', businessType: 'BC', businessMode: '出口',
      financeOrg: '广州航晟物流有限公司', department: '华南业务部', serviceClerk: '周倩', salesperson: '陈楠',
      transfer: false, transferOrg: '', transferDepartment: '', originalSalesperson: '', remark: '演示：客户门户提交的需求单，待接单。',
      customerPartnerId: 'PT-00019', customer: '云帆供应链', contactName: '陈一', contactPhone: '000-00000001', contactEmail: 'customer19@example.invalid', customerRemark: '',
      transportMode: '空运', originPort: 'CAN', destinationPort: 'NRT', waybillNo: '',
      status: '待接单', source: '客户门户需求', creator: '客户门户', createdAt: '2026-09-08 08:40',
      attachments: [], houses: [house('', [{ hsCode: '84713000', productName: '演示电子配件', specModel: 'DEMO-1', quantity: 120, grossWeight: 96, netWeight: 88, originCountry: 'CN' }])],
      services: [], history: [{ id: 'H1', event: '需求创建', content: '客户门户提交需求单，等待所属部门客服接单', actor: '客户门户', time: '2026-09-08 08:40' }],
    },
    {
      id: 'C26090800003', orderNo: 'C26090800003', businessType: 'BBC', businessMode: '一线进境',
      financeOrg: '广州航晟物流有限公司', department: '华南业务部', serviceClerk: '周倩', salesperson: '李明',
      transfer: false, transferOrg: '', transferDepartment: '', originalSalesperson: '', remark: '演示：服务全部完成的只读订单。',
      customerPartnerId: 'PT-00021', customer: '华越国际商贸', contactName: '许三', contactPhone: '000-00000003', contactEmail: 'customer21@example.invalid', customerRemark: '',
      transportMode: '空运', originPort: 'SIN', destinationPort: 'CAN', waybillNo: '999-90008802',
      status: '已完成', source: '直接建单', creator: '周倩', createdAt: '2026-09-05 10:00',
      attachments: [], houses: [
        house('GJ260900003', [{ productId: 'SKU-DEMO-01', customsCode: '2106909090', brand: 'DEMO', barcode: '6900000000001', nameSpec: '合成保健品（演示）', quantity: 60, grossWeight: 45.2, netWeight: 40, originCountry: '澳大利亚' }]),
      ],
      services: [
        service('trunk', 'booking', { department: '空运产品部', supplier: '广东高捷', fields: { airlineCode: 'CZ 南方航空', expectedArrivalDate: '2026-09-06' }, status: '已完成', history: [timeline('生成服务', '系统', '随订单提交生成订舱服务单', '10:02'), timeline('完成', '航线操作', '航班已完成', '11:30')] }),
        service('ground', 'preclearance', { department: '关务部', supplier: '广州电子口岸管理公司', status: '已完成', history: [timeline('生成服务', '系统', '随订单提交生成预配服务单', '10:02'), timeline('完成', '报关演示客服', '预配完成', '12:05')] }),
        service('customs', 'customsClear', { houseKey: 'GJ260900003', department: '关务部', status: '已完成', history: [timeline('生成服务', '系统', '随订单提交生成国内清关服务单', '10:02'), timeline('完成', '报关演示客服', '清关完成', '13:40')] }),
        service('transport', 'transport', { houseKey: 'GJ260900003', department: '运输部', status: '已完成', fields: { pickupProvince: '广东省', pickupAddress: '广州机场演示货站', pickupTime: '2026-09-07 09:00', pickupContact: '提货联系人甲', pickupPhone: '000-00002001', deliveryProvince: '广东省', deliveryAddress: '广州保税仓演示库位', deliveryTime: '2026-09-07 14:00', deliveryContact: '收货联系人甲', deliveryPhone: '000-00003001' }, history: [timeline('生成服务', '系统', '随订单提交生成运输服务单', '10:02'), timeline('完成', '航晟客服', '送达完成', '14:20')] }),
      ],
      history: [
        { id: 'H1', event: '订单创建', content: '客服直接建单', actor: '周倩', time: '2026-09-05 10:00' },
        { id: 'H2', event: '提交订单', content: '生成未下发服务单，订单转进行中', actor: '周倩', time: '2026-09-05 10:02' },
        { id: 'H3', event: '服务完成', content: '全部服务已完成，订单自动转已完成', actor: '系统', time: '2026-09-07 14:20' },
      ],
    },
    {
      id: 'O26090800004', orderNo: 'O26090800004', businessType: '其他', businessMode: '其他',
      financeOrg: '上海高捷物流有限公司', department: '华东业务部', serviceClerk: '周倩', salesperson: '王晴',
      transfer: false, transferOrg: '', transferDepartment: '', originalSalesperson: '', remark: '演示：未提交草稿。',
      customerPartnerId: 'PT-00022', customer: '星瀚品牌管理', contactName: '江四', contactPhone: '000-00000004', contactEmail: 'customer22@example.invalid', customerRemark: '',
      transportMode: '', originPort: '', destinationPort: '', waybillNo: '',
      status: '未提交', source: '直接建单', creator: '周倩', createdAt: '2026-09-08 13:00',
      attachments: [], houses: [house('', [])], services: [],
      history: [{ id: 'H1', event: '订单创建', content: '保存为未提交草稿', actor: '周倩', time: '2026-09-08 13:00' }],
    },
  ]
  return orders
}

export function createGeneralWaybillSeed() {
  const attachment = { id: 'ATT-WB-01', name: '演示跨境电商附件.pdf', size: 4096, uploadedAt: '2026-09-08 09:30' }
  return [
    {
      id: 'WB-260908-001', waybillNo: '999-90008801', declarationType: '普货', importExportFlag: '进口', transportTool: '飞机',
      originPort: 'PVG', destinationPort: 'LAX', eta: '2026-09-10 08:00', etd: '2026-09-09 20:00', flightNo: 'MU9001',
      firstDestination: 'LAX', secondDestination: '', thirdDestination: '',
      chineseName: '合成演示货物甲', englishName: 'DEMO CARGO A', specialCargo: '', expectedPieces: 42, expectedWeight: 186.5, expectedVolume: 1.28,
      containers: [{ serial: 1, containerNo: 'DEMO-CTN-01', containerSpec: '1x20GP' }],
      billFields: { waybillNo: '999-90008801', importExportFlag: '进口', code: '', shipper: '启航跨境贸易', consignee: 'DEMO CONSIGNEE', marks: 'DEMO MARKS', customsDeclaredValue: 'USD 12000.00', iataCode: 'MU', issuingCarrier: 'MU 东方航空', issueDate: '2026-09-09', randomDocs: '随附发票箱单', handlingInformation: '演示 Handling Information', attribute: '销售单', salesOrderNo: 'SO-DEMO-001', purchaseOrderNo: '', invoiceNo: 'INV-DEMO-001' },
      status: '有效', createdBy: '周倩', createdAt: '2026-09-08 09:30', sourceOrderId: 'G26090800001',
      houses: [
        { id: 'HB-260908-001', houseNo: 'GJ260900001', originPort: 'PVG', firstDestination: 'LAX', secondDestination: '', thirdDestination: '', chineseName: '合成演示货物甲', englishName: 'DEMO CARGO A', handlingInformation: '演示分单', marks: 'DEMO', warehouseRequirement: '恒温', shipper: '启航跨境贸易', consignee: 'DEMO CONSIGNEE', expectedPieces: 42, expectedWeight: 186.5, expectedVolume: 1.28, status: '有效', inbound: null, billMeasured: null },
        { id: 'HB-260908-002', houseNo: 'GJ260900002', originPort: 'PVG', firstDestination: 'LAX', secondDestination: '', thirdDestination: '', chineseName: '合成演示货物乙', englishName: 'DEMO CARGO B', handlingInformation: '', marks: '', warehouseRequirement: '', shipper: '启航跨境贸易', consignee: 'DEMO CONSIGNEE', expectedPieces: 18, expectedWeight: 62.4, expectedVolume: 0.46, status: '已作废', voidedBy: '周倩', voidedAt: '2026-09-08 11:20', inbound: null, billMeasured: null },
      ],
    },
    {
      id: 'WB-260908-002', waybillNo: '999-90008802', declarationType: '跨境电商', importExportFlag: '进口', transportTool: '飞机',
      originPort: 'SIN', destinationPort: 'CAN', eta: '2026-09-06 07:30', etd: '2026-09-05 22:00', flightNo: 'CZ354',
      firstDestination: 'CAN', secondDestination: '', thirdDestination: '',
      chineseName: '合成保健品（演示）', englishName: 'DEMO SUPPLEMENT', specialCargo: '', expectedPieces: 60, expectedWeight: 45.2, expectedVolume: 0.36,
      containers: [], billFields: {},
      ecommerce: { importExportPortCode: 'CAN', customsDeclarationCode: '5165', supervisedPlaceCode: 'GZBS01', countryRegionCode: 'AU', countryRegionName: '澳大利亚', portCode: 'CAN', arrivalDate: '2026-09-06', totalPackageNo: 'PKG-DEMO-88', houseBillCount: 1, totalGrossWeight: 45.2, chargeableWeight: 60, palletCount: 1, reinforcedPalletCount: 0, palletizedPalletCount: 1, cartonCount: 12, volume: 0.36, boxSize: '60×40×40', containerType: '散货', attachments: [attachment] },
      status: '有效', createdBy: '周倩', createdAt: '2026-09-08 10:10', sourceOrderId: 'C26090800003',
      houses: [],
    },
    {
      id: 'WB-260908-003', waybillNo: '999-90008803', declarationType: '普货', importExportFlag: '出口', transportTool: '汽车',
      originPort: 'SZX', destinationPort: 'HKG', eta: '', etd: '2026-09-08 16:00', flightNo: '粤Z·DEMO3',
      firstDestination: 'HKG', secondDestination: '', thirdDestination: '',
      chineseName: '合成演示货物丙', englishName: 'DEMO CARGO C', specialCargo: '锂电池', expectedPieces: 24, expectedWeight: 310, expectedVolume: 2.1,
      containers: [], billFields: { waybillNo: '999-90008803', importExportFlag: '出口', code: '', shipper: '远洲电子商务', consignee: 'DEMO CONSIGNEE C', marks: '', customsDeclaredValue: 'CNY 20000.00', iataCode: '', issuingCarrier: '', issueDate: '2026-09-08', randomDocs: '', handlingInformation: '', attribute: '销售单', salesOrderNo: 'SO-DEMO-003', purchaseOrderNo: '', invoiceNo: '' },
      status: '已作废', voidedBy: '周倩', voidedAt: '2026-09-08 13:40', sourceOrderId: '',
      houses: [],
    },
  ]
}
