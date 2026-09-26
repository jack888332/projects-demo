// PRD 015/016/017 共享的门户小订单、需求单、仓库报告、BBC客户订单与演示库存。
// 全部为固定合成数据；STOCK/托盘/快递号/平台店铺均为演示值。
export function createPortalOrderSeed() {
  const goods = (values) => values.map((row, index) => ({
    id: `G-${index + 1}`, productId: '', barcode: '', name: '', spec: '', hsCode: '', quantity: 1, unit: '件', unitPrice: 0, ...row,
  }))
  const smallOrders = [
    {
      id: 'SO-BC-001', orderNo: 'BC2609080001', businessType: 'BC', mode: '集货', platform: '拼多多', shop: '联盛优品海外专营店', company: 'DEMO 电商企业甲',
      buyer: '订购人甲', buyerPhone: '000-00005001', buyerIdNo: '000000000000000001', orderTime: '2026-09-08 09:00:00', expressNo: 'DEMO-BC-EX-01', expressCompany: '圆通速递',
      palletNo: 'PALLET-DEMO-01', warehouse: '南沙保税仓 WH002', warehouseStatus: '待出库', customsStatus: '待报关', intercept: '无', conversion: '',
      totalAmount: 268.5, estimatedTax: 26.85, customsTax: '', inboundNo: '', outboundNo: '', waybillNo: '', stockStatus: '', presaleType: '',
      customerCancelled: false, returnResult: '', requirementId: 'REQ-260908-001', taskNo: 'TASK-BC-001', deadline: '',
      logistics: { flightArrived: '未到达', pickedUp: '未提货', clearanceStarted: '未开始', clearanceDone: '未完成', expressHandover: '未交接' },
      goods: goods([{ productId: 'SKU-DEMO-101', barcode: '6900000000101', name: '合成护肤水（演示）', spec: '150ml', hsCode: '33049900', quantity: 2, unitPrice: 88.5 }]),
    },
    {
      id: 'SO-BC-002', orderNo: 'BC2609080002', businessType: 'BC', mode: '集货', platform: '拼多多', shop: '联冠通海外专营店', company: 'DEMO 电商企业乙',
      buyer: '订购人乙', buyerPhone: '000-00005002', buyerIdNo: '000000000000000002', orderTime: '2026-09-08 09:20:00', expressNo: '', expressCompany: '圆通速递',
      palletNo: '', warehouse: '南沙保税仓 WH002', warehouseStatus: '待出库', customsStatus: '待报关', intercept: '无', conversion: '',
      totalAmount: 158, estimatedTax: 15.8, customsTax: '', inboundNo: '', outboundNo: '', waybillNo: '', stockStatus: '', presaleType: '',
      customerCancelled: false, returnResult: '', requirementId: '', taskNo: 'TASK-BC-002', deadline: '',
      logistics: { flightArrived: '未到达', pickedUp: '未提货', clearanceStarted: '未开始', clearanceDone: '未完成', expressHandover: '未交接' },
      goods: goods([{ productId: 'SKU-DEMO-102', barcode: '6900000000102', name: '合成面膜（演示）', spec: '10片', hsCode: '33049900', quantity: 1, unitPrice: 158 }]),
    },
    {
      id: 'SO-BC-003', orderNo: 'BC2609080003', businessType: 'BC', mode: '备货', platform: '拼多多', shop: '联盛优品海外专营店', company: 'DEMO 电商企业甲',
      buyer: '订购人丙', buyerPhone: '000-00005003', buyerIdNo: '000000000000000003', orderTime: '2026-09-08 10:00:00', expressNo: 'DEMO-BC-EX-03', expressCompany: '圆通速递',
      palletNo: '', warehouse: '南沙保税仓 WH002', warehouseStatus: '待下发', customsStatus: '待报关', intercept: '无', conversion: '',
      totalAmount: 520.75, estimatedTax: 52.08, customsTax: '', inboundNo: 'IN-DEMO-260908-03', outboundNo: '', waybillNo: '', stockStatus: '有货', presaleType: '现货',
      customerCancelled: false, returnResult: '', requirementId: '', taskNo: 'TASK-BC-003', deadline: '',
      logistics: { flightArrived: '未到达', pickedUp: '未提货', clearanceStarted: '未开始', clearanceDone: '未完成', expressHandover: '未交接' },
      goods: goods([{ productId: 'SKU-DEMO-103', barcode: '6900000000103', name: '合成精华（演示）', spec: '30ml', hsCode: '33049900', quantity: 3, unitPrice: 173.58 }]),
    },
    {
      id: 'SO-BC-004', orderNo: 'BC2609080004', businessType: 'BC', mode: '备货', platform: '拼多多', shop: '联冠通海外专营店', company: 'DEMO 电商企业乙',
      buyer: '订购人丁', buyerPhone: '000-00005004', buyerIdNo: '000000000000000004', orderTime: '2026-09-08 10:30:00', expressNo: '', expressCompany: '圆通速递',
      palletNo: '', warehouse: '南沙保税仓 WH002', warehouseStatus: '已取消', customsStatus: '待报关', intercept: '无', conversion: '',
      totalAmount: 99, estimatedTax: 9.9, customsTax: '', inboundNo: 'IN-DEMO-260908-04', outboundNo: '', waybillNo: '', stockStatus: '缺货', presaleType: '现货',
      customerCancelled: true, returnResult: '', requirementId: '', taskNo: 'TASK-BC-004', deadline: '',
      logistics: { flightArrived: '未到达', pickedUp: '未提货', clearanceStarted: '未开始', clearanceDone: '未完成', expressHandover: '未交接' },
      goods: goods([{ productId: 'SKU-DEMO-104', barcode: '6900000000104', name: '合成洗面奶（演示）', spec: '120g', hsCode: '34013000', quantity: 1, unitPrice: 99 }]),
    },
    {
      id: 'SO-CC-001', orderNo: 'CC2609080001', businessType: 'CC', mode: '集货', platform: '', shop: '', company: '',
      buyer: '订购人戊', buyerPhone: '000-00005005', buyerIdNo: '000000000000000005', orderTime: '2026-09-08 11:00:00', expressNo: 'DEMO-CC-EX-01', expressCompany: '顺丰速运',
      palletNo: 'PALLET-DEMO-02', warehouse: '广州保税仓 WH001', warehouseStatus: '待出库', customsStatus: '待报关', intercept: '无', conversion: '',
      totalAmount: 366, estimatedTax: 36.6, customsTax: '', inboundNo: '', outboundNo: '', waybillNo: '', stockStatus: '', presaleType: '',
      customerCancelled: false, returnResult: '', requirementId: '', taskNo: 'TASK-CC-001', deadline: '',
      logistics: { flightArrived: '未到达', pickedUp: '未提货', clearanceStarted: '未开始', clearanceDone: '未完成', expressHandover: '未交接' },
      goods: goods([{ productId: 'SKU-DEMO-201', barcode: '6900000000201', name: '合成保健品（演示）', spec: '60粒', hsCode: '21069090', quantity: 2, unitPrice: 183 }]),
    },
    {
      id: 'SO-CC-002', orderNo: 'CC2609080002', businessType: 'CC', mode: '备货', platform: '', shop: '', company: '',
      buyer: '订购人己', buyerPhone: '000-00005006', buyerIdNo: '000000000000000006', orderTime: '2026-09-08 11:30:00', expressNo: '', expressCompany: '顺丰速运',
      palletNo: '', warehouse: '广州保税仓 WH001', warehouseStatus: '待下发', customsStatus: '待报关', intercept: '无', conversion: '',
      totalAmount: 219, estimatedTax: 21.9, customsTax: '', inboundNo: 'IN-DEMO-260908-06', outboundNo: '', waybillNo: '', stockStatus: '缺货', presaleType: '预售',
      customerCancelled: false, returnResult: '', requirementId: '', taskNo: 'TASK-CC-002', deadline: '',
      logistics: { flightArrived: '未到达', pickedUp: '未提货', clearanceStarted: '未开始', clearanceDone: '未完成', expressHandover: '未交接' },
      goods: goods([{ productId: 'SKU-DEMO-202', barcode: '6900000000202', name: '合成维生素（演示）', spec: '90片', hsCode: '21069090', quantity: 1, unitPrice: 219 }]),
    },
  ]
  const poolOrders = [
    {
      id: 'SO-POOL-001', orderNo: 'POOL2609080001', businessType: 'BC', mode: '', platform: '拼多多', shop: '联盛优品海外专营店', company: 'DEMO 电商企业甲',
      buyer: '订购人庚', buyerPhone: '000-00005007', orderTime: '2026-09-08 08:10:00', expressNo: 'DEMO-POOL-EX-01', warehouse: '南沙保税仓 WH002', palletNo: '', totalAmount: 128, estimatedTax: 12.8, customsStatus: '待报关', customerCancelled: false,
      goods: goods([{ productId: '', barcode: '', name: '未备案商品 A', quantity: 1, unitPrice: 128 }]),
    },
    {
      id: 'SO-POOL-002', orderNo: 'POOL2609080002', businessType: 'CC', mode: '', platform: '', shop: '', company: '',
      buyer: '订购人辛', buyerPhone: '000-00005008', orderTime: '2026-09-08 08:20:00', expressNo: '', warehouse: '广州保税仓 WH001', palletNo: '', totalAmount: 458, estimatedTax: 45.8, customsStatus: '待报关', customerCancelled: false,
      goods: goods([{ productId: 'SKU-DEMO-203', barcode: '6900000000203', name: '混合模式商品（演示）', quantity: 2, unitPrice: 229 }]),
    },
  ]
  const requirements = [
    {
      id: 'REQ-260908-001', orderNo: 'PR26090800001', requestType: '小订单需求', businessType: 'BC', mode: '集货', transportMode: '航空运输', customsZone: '南沙海关',
      warehouse: '南沙保税仓 WH002', originPort: '', destinationPort: '', expectedArrival: '', status: '进行中', createdBy: '客户门户', createdAt: '2026-09-08 09:10',
      smallOrderIds: ['SO-BC-001'], goods: [], services: [
        { key: 'trunk', label: '干线服务', selected: true, fields: { originPort: 'CAN', destinationPort: 'HKG', expectedArrival: '2026-09-10 08:00' } },
        { key: 'warehouse', label: '仓储服务', selected: true, fields: { warehouse: '南沙保税仓 WH002' } },
        { key: 'customs', label: '关务服务', selected: true, fields: {} },
        { key: 'transport', label: '运输服务', selected: false, fields: {} },
        { key: 'security', label: '货站安检', selected: false, fields: {} },
        { key: 'clearance', label: '清关派送', selected: false, fields: {} },
        { key: 'valueAdded', label: '增值服务', selected: false, fields: {} },
      ],
      attachments: [{ id: 'RA-01', type: '装箱单', name: '演示装箱单.pdf', size: 2048, uploader: '客户门户', uploadedAt: '2026-09-08 09:12' }],
      remark: '', goodsTitle: '合成日化货物',
    },
    {
      id: 'REQ-260908-002', orderNo: 'PR26090800002', requestType: '商品需求', businessType: 'BC', mode: '备货', transportMode: '航空运输', customsZone: '南沙海关',
      warehouse: '南沙保税仓 WH002', originPort: '', destinationPort: '', expectedArrival: '', status: '未提交', createdBy: '客户门户', createdAt: '2026-09-08 12:00',
      smallOrderIds: [], goods: [{ productId: 'SKU-DEMO-103', barcode: '6900000000103', name: '合成精华（演示）', spec: '30ml', quantity: 100, productionDate: '2026-08-01', expiryDate: '2028-08-01', batchNo: 'BATCH-DEMO-103', palletNo: '' }],
      services: [
        { key: 'trunk', label: '干线服务', selected: false, fields: {} },
        { key: 'warehouse', label: '仓储服务', selected: true, fields: { warehouse: '南沙保税仓 WH002' } },
        { key: 'customs', label: '关务服务', selected: true, fields: {} },
        { key: 'transport', label: '运输服务', selected: false, fields: {} },
        { key: 'security', label: '货站安检', selected: false, fields: {} },
        { key: 'clearance', label: '清关派送', selected: false, fields: {} },
        { key: 'valueAdded', label: '增值服务', selected: false, fields: {} },
      ],
      attachments: [], remark: '', goodsTitle: '合成精华',
    },
  ]
  const reports = [
    {
      id: 'RPT-260908-01', requirementId: 'REQ-260908-001', reportType: '收货', receiptNo: 'RCV-260908-001', warehouse: '南沙保税仓 WH002', inboundNo: 'IN-DEMO-260908-01',
      customer: '启航跨境贸易', businessType: 'BC', mode: '集货', wmsStatus: '待收货', notifiedPallets: 1, actualPallets: 1, normalPallets: 1, abnormalPallets: 0,
      status: '自动确认', createdAt: '2026-09-08 09:30', confirmedAt: '2026-09-08 09:30', rejectedAt: '', batches: [
        { id: 'RCV-B1', batchNo: 'BATCH-RCV-01', date: '2026-09-08', operator: '仓库演示员', checker: '仓库主管', result: '正常', abnormalType: '', vehicle: '沪A·DEMO1', driver: '演示司机甲', expectedQty: 1, actualQty: 1, abnormalQty: 0, unit: '托', images: 1, remark: '合成收货批次' },
      ],
    },
    {
      id: 'RPT-260908-02', requirementId: 'REQ-260908-001', reportType: '理货', receiptNo: 'TAL-260908-002', warehouse: '南沙保税仓 WH002', inboundNo: 'IN-DEMO-260908-01',
      customer: '启航跨境贸易', businessType: 'BC', mode: '集货', wmsStatus: '待理货', notifiedPallets: 1, actualPallets: 1, normalPallets: 0, abnormalPallets: 1,
      status: '待确认', createdAt: '2026-09-08 11:00', confirmedAt: '', rejectedAt: '', batches: [
        { id: 'TAL-B1', batchNo: 'BATCH-TAL-01', date: '2026-09-08', operator: '仓库演示员', checker: '仓库主管', confirmStatus: '待确认', confirmedAt: '', remark: '合成理货批次',
          collection: { vehicle: '沪A·DEMO1', containers: 1, packages: 2, volume: 0.42, weight: 12.6, size: '60×40×40' },
          details: [
            { id: 'TAL-D1', tallyStatus: '异常', palletNo: 'PALLET-DEMO-01', palletSize: '120×100', volume: 0.3, weight: 8.2, packageWeight: 2.1, packages: 1, packageSize: '60×40×40', ownPallet: '是', measuredAt: '2026-09-08 10:50', operator: '仓库演示员', images: 1, remark: '包装破损', abnormalType: '包装破损', handling: '', productBarcode: '6900000000101', productName: '合成护肤水（演示）', goodQty: 1, defectQty: 1, valueAdded: '', productionDate: '', expiryDate: '', batchNo: '' },
          ] },
      ],
    },
    {
      id: 'RPT-260908-03', requirementId: 'REQ-260908-002', reportType: '理货', receiptNo: 'TAL-260908-003', warehouse: '南沙保税仓 WH002', inboundNo: 'IN-DEMO-260908-02',
      customer: '云帆供应链', businessType: 'BC', mode: '备货', wmsStatus: '理货报告驳回', notifiedPallets: '', actualPallets: 2, normalPallets: 1, abnormalPallets: 1,
      status: '已驳回', createdAt: '2026-09-07 16:00', confirmedAt: '', rejectedAt: '2026-09-08 09:40', batches: [
        { id: 'TAL-B2', batchNo: 'BATCH-TAL-02', date: '2026-09-07', operator: '仓库演示员', checker: '仓库主管', confirmStatus: '已驳回', confirmedAt: '', remark: '短溢货待答复',
          collection: { vehicle: '沪B·DEMO2', containers: 2, packages: 4, volume: 0.8, weight: 24.1, size: '80×60×60' },
          details: [
            { id: 'TAL-D2', tallyStatus: '异常', palletNo: 'PALLET-DEMO-03', palletSize: '120×100', volume: 0.4, weight: 12, packageWeight: 3, packages: 2, packageSize: '80×60×60', ownPallet: '否', measuredAt: '2026-09-07 15:30', operator: '仓库演示员', images: 1, remark: '数量短溢', abnormalType: '短溢', handling: '按实收数量结算', productBarcode: '6900000000103', productName: '合成精华（演示）', goodQty: 8, defectQty: 0, valueAdded: '贴标', productionDate: '2026-08-01', expiryDate: '2028-08-01', batchNo: 'BATCH-DEMO-103' },
          ] },
      ],
    },
  ]
  const bbcCustomerOrders = [
    {
      id: 'BBC2609080001', orderNo: 'BBC2609080001', outboundOrderNo: 'OUT-DEMO-260908-001', expressNo: 'DEMO-BBC-EX-01', expressCompany: '圆通速递',
      nuclearNoteNos: ['HN-DEMO-001'], ledgerNo: 'LEDGER-BBC-01', platform: '拼多多', shop: '敦子眼睛旗舰店', company: 'DEMO BBC 电商企业', companyCode: '91310000DEMO0001X',
      buyer: '订购人壬', buyerPhone: '000-00006001', buyerIdNo: '000000000000000011', address: '广东省广州市演示地址 1 号', orderTime: '2026-09-05 09:00:00',
      paymentAmount: 328.5, estimatedTax: 32.85, customsTax: 30.2, presaleType: '现货', stockStatus: '有货', customerCancelled: false, returnDeadline: '2026-10-06',
      orderStatus: '海关入库', waybillStatus: '海关入库', manifestStatus: '放行', warehouseStatus: '已出库', outboundStatus: '已出区', cancelStatus: '', returnStatus: '', consumerReturnResult: '', cancelReturnResult: '',
      outboundOrderType: '', remark: '演示：已发货订单',
      goods: goods([
        { productId: 'SKU-BBC-301', barcode: '6900000000301', name: '合成墨镜（演示）', spec: '均码', hsCode: '90041000', originCountry: '意大利', quantity: 1, unitPrice: 328.5, estimatedVat: 42.7, estimatedConsumptionTax: 0, consumerReturnQty: 0, cancelReturnQty: 0 },
      ]),
      receipts: [{ id: 'R-1', type: '订单申报', status: '海关入库', time: '2026-09-05 10:10', content: '订单申报回执：海关入库（本地模拟）' }, { id: 'R-2', type: '运单申报', status: '海关入库', time: '2026-09-05 10:12', content: '运单申报回执：海关入库（本地模拟）' }, { id: 'R-3', type: '清单申报', status: '放行', time: '2026-09-05 10:20', content: '清单申报回执：放行（本地模拟）' }],
    },
    {
      id: 'BBC2609080002', orderNo: 'BBC2609080002', outboundOrderNo: '', expressNo: '', expressCompany: '圆通速递',
      nuclearNoteNos: [], ledgerNo: 'LEDGER-BBC-01', platform: '抖音', shop: 'MOOKLOOK海外旗舰店', company: 'DEMO BBC 电商企业', companyCode: '91310000DEMO0002X',
      buyer: '订购人癸', buyerPhone: '000-00006002', buyerIdNo: '000000000000000012', address: '广东省广州市演示地址 2 号', orderTime: '2026-09-08 08:30:00',
      paymentAmount: 158, estimatedTax: 15.8, customsTax: '', presaleType: '现货', stockStatus: '有货', customerCancelled: false, returnDeadline: '',
      orderStatus: '待报关', waybillStatus: '待报关', manifestStatus: '待报关', warehouseStatus: '待下发', outboundStatus: '', cancelStatus: '', returnStatus: '', consumerReturnResult: '', cancelReturnResult: '',
      outboundOrderType: '', remark: '演示：待批量申报订单',
      goods: goods([{ productId: 'SKU-BBC-302', barcode: '6900000000302', name: '合成口红（演示）', spec: '3g', hsCode: '33041000', originCountry: '法国', quantity: 2, unitPrice: 79, estimatedVat: 20.5, estimatedConsumptionTax: 0, consumerReturnQty: 0, cancelReturnQty: 0 }]),
      receipts: [],
    },
    {
      id: 'BBC2609080003', orderNo: 'BBC2609080003', outboundOrderNo: '', expressNo: '', expressCompany: '',
      nuclearNoteNos: [], ledgerNo: 'LEDGER-BBC-01', platform: '拼多多', shop: '敦子眼睛旗舰店', company: 'DEMO BBC 电商企业', companyCode: '91310000DEMO0001X',
      buyer: '订购人子', buyerPhone: '000-00006003', buyerIdNo: '000000000000000013', address: '广东省广州市演示地址 3 号', orderTime: '2026-09-08 09:10:00',
      paymentAmount: 199, estimatedTax: 19.9, customsTax: '', presaleType: '现货', stockStatus: '库存不足', customerCancelled: false, returnDeadline: '',
      orderStatus: '待报关', waybillStatus: '待报关', manifestStatus: '待报关', warehouseStatus: '库存不足', outboundStatus: '', cancelStatus: '', returnStatus: '', consumerReturnResult: '', cancelReturnResult: '',
      outboundOrderType: '', remark: '演示：库存不足不自动申报',
      goods: goods([{ productId: 'SKU-BBC-303', barcode: '6900000000303', name: '合成眼霜（演示）', spec: '15ml', hsCode: '33049900', originCountry: '日本', quantity: 1, unitPrice: 199, estimatedVat: 25.9, estimatedConsumptionTax: 0, consumerReturnQty: 0, cancelReturnQty: 0 }]),
      receipts: [],
    },
    {
      id: 'BBC2609080004', orderNo: 'BBC2609080004', outboundOrderNo: '', expressNo: 'DEMO-BBC-EX-04', expressCompany: '圆通速递',
      nuclearNoteNos: [], ledgerNo: 'LEDGER-BBC-01', platform: '抖音', shop: 'MOOKLOOK海外旗舰店', company: 'DEMO BBC 电商企业', companyCode: '91310000DEMO0002X',
      buyer: '订购人丑', buyerPhone: '000-00006004', buyerIdNo: '000000000000000014', address: '广东省广州市演示地址 4 号', orderTime: '2026-09-07 14:00:00',
      paymentAmount: 88, estimatedTax: 8.8, customsTax: '', presaleType: '现货', stockStatus: '有货', customerCancelled: true, returnDeadline: '2026-10-01',
      orderStatus: '海关退单', waybillStatus: '待报关', manifestStatus: '待报关', warehouseStatus: '待下发', outboundStatus: '', cancelStatus: '', returnStatus: '', consumerReturnResult: '', cancelReturnResult: '',
      outboundOrderType: '', remark: '演示：海关退单可重新申报、可作废',
      goods: goods([{ productId: 'SKU-BBC-304', barcode: '6900000000304', name: '合成手霜（演示）', spec: '50ml', hsCode: '33049900', originCountry: '德国', quantity: 1, unitPrice: 88, estimatedVat: 11.4, estimatedConsumptionTax: 0, consumerReturnQty: 0, cancelReturnQty: 0 }]),
      receipts: [{ id: 'R-4', type: '订单申报', status: '海关退单', time: '2026-09-07 15:00', content: '订单申报回执：海关退单，原因演示（本地模拟）' }],
    },
    {
      id: 'BBC2609080005', orderNo: 'BBC2609080005', outboundOrderNo: 'OUT-DEMO-260908-005', expressNo: 'DEMO-BBC-EX-05', expressCompany: '圆通速递',
      nuclearNoteNos: ['HN-DEMO-005'], ledgerNo: 'LEDGER-BBC-01', platform: '拼多多', shop: '敦子眼睛旗舰店', company: 'DEMO BBC 电商企业', companyCode: '91310000DEMO0001X',
      buyer: '订购人寅', buyerPhone: '000-00006005', buyerIdNo: '000000000000000015', address: '广东省广州市演示地址 5 号', orderTime: '2026-09-03 10:00:00',
      paymentAmount: 258, estimatedTax: 25.8, customsTax: 24.6, presaleType: '现货', stockStatus: '有货', customerCancelled: true, returnDeadline: '2026-10-06',
      orderStatus: '海关入库', waybillStatus: '海关入库', manifestStatus: '放行', warehouseStatus: '已出库', outboundStatus: '已出区', cancelStatus: '', returnStatus: '退货成功', consumerReturnResult: '进行中', cancelReturnResult: '',
      outboundOrderType: '', remark: '演示：客退进行中',
      goods: goods([{ productId: 'SKU-BBC-305', barcode: '6900000000305', name: '合成香水（演示）', spec: '30ml', hsCode: '33030000', originCountry: '法国', quantity: 1, unitPrice: 258, estimatedVat: 33.5, estimatedConsumptionTax: 0, consumerReturnQty: 1, cancelReturnQty: 0 }]),
      receipts: [{ id: 'R-5', type: '退货申请', status: '退货成功', time: '2026-09-06 11:00', content: '退货申请回执：退货成功（本地模拟）' }],
    },
    {
      id: 'BBC2609080006', orderNo: 'BBC2609080006', outboundOrderNo: 'OUT-DEMO-260908-006', expressNo: 'DEMO-BBC-EX-06', expressCompany: '圆通速递',
      nuclearNoteNos: ['HN-DEMO-006'], ledgerNo: 'LEDGER-BBC-01', platform: '抖音', shop: 'MOOKLOOK海外旗舰店', company: 'DEMO BBC 电商企业', companyCode: '91310000DEMO0002X',
      buyer: '订购人卯', buyerPhone: '000-00006006', buyerIdNo: '000000000000000016', address: '广东省广州市演示地址 6 号', orderTime: '2026-09-02 09:00:00',
      paymentAmount: 418, estimatedTax: 41.8, customsTax: 39.5, presaleType: '现货', stockStatus: '有货', customerCancelled: true, returnDeadline: '2026-10-05',
      orderStatus: '海关入库', waybillStatus: '海关入库', manifestStatus: '放行', warehouseStatus: '已出库', outboundStatus: '已出区', cancelStatus: '', returnStatus: '海关入库', consumerReturnResult: '', cancelReturnResult: '进行中',
      outboundOrderType: '', remark: '演示：消退进行中',
      goods: goods([{ productId: 'SKU-BBC-306', barcode: '6900000000306', name: '合成面霜（演示）', spec: '50ml', hsCode: '33049900', originCountry: '韩国', quantity: 1, unitPrice: 418, estimatedVat: 54.3, estimatedConsumptionTax: 0, consumerReturnQty: 0, cancelReturnQty: 1 }]),
      receipts: [{ id: 'R-6', type: '退货申请', status: '海关入库', time: '2026-09-06 15:00', content: '退货申请回执：海关入库（本地模拟）' }],
    },
  ]
  const stock = [
    { warehouse: '南沙保税仓 WH002', productId: 'SKU-DEMO-103', barcode: '6900000000103', name: '合成精华（演示）', good: 120, defective: 6, ledger: 126 },
    { warehouse: '南沙保税仓 WH002', productId: 'SKU-DEMO-101', barcode: '6900000000101', name: '合成护肤水（演示）', good: 80, defective: 2, ledger: 82 },
    { warehouse: '广州保税仓 WH001', productId: 'SKU-DEMO-201', barcode: '6900000000201', name: '合成保健品（演示）', good: 60, defective: 0, ledger: 0 },
    { warehouse: '广州保税仓 WH001', productId: 'SKU-DEMO-202', barcode: '6900000000202', name: '合成维生素（演示）', good: 40, defective: 1, ledger: 0 },
  ]
  const reverseOrders = [
    {
      id: 'VR-260908-001', orderNo: 'VR26090800001', category: '空运退运', businessType: '出口退运', customer: '启航跨境贸易', sourceOrderId: 'AIR-260908-001', sourceLabel: 'AIR-260908-001 / 01',
      status: '进行中', createdAt: '2026-09-08 10:00', submittedAt: '2026-09-08 10:05', creator: '周倩', customerCancelled: false, returnResult: '',
      transportMode: '空运', originPort: 'PVG', destinationPort: 'LAX', waybillNo: '781-90000010',
      goods: goods([{ productId: '', barcode: '', name: '合成演示货物甲', spec: '', hsCode: '', quantity: 5, unit: '件', unitPrice: 28, totalPrice: 140 }]),
      services: [{ key: 'warehouse', label: '仓储服务', selected: true, status: '进行中', generated: true, id: 'S11126090800001' }],
      attachments: [], remark: '演示：查验异常删单退运',
    },
    {
      id: 'VR-260908-002', orderNo: 'VR26090800002', category: 'BC/CC退运', businessType: 'BC进口退运', customer: '启航跨境贸易', sourceOrderId: 'SO-BC-004', sourceLabel: 'BC2609080004',
      status: '进行中', createdAt: '2026-09-08 11:00', submittedAt: '2026-09-08 11:05', creator: '周倩', customerCancelled: true, returnResult: '退运中',
      transportMode: '公路运输', originPort: 'CAN', destinationPort: 'HKG', waybillNo: '',
      goods: goods([{ productId: 'SKU-DEMO-104', barcode: '6900000000104', name: '合成洗面奶（演示）', spec: '120g', hsCode: '34013000', quantity: 1, unit: '件', unitPrice: 99, totalPrice: 99 }]),
      services: [{ key: 'warehouse', label: '仓储服务', selected: true, status: '已完成', generated: true, id: 'S11126090800002' }],
      attachments: [], remark: '演示：集货退运',
    },
    {
      id: 'VR-260908-003', orderNo: 'VR26090800003', category: 'BBC客退', businessType: 'BBC进口', customer: '华越国际商贸', sourceOrderId: 'BBC2609080005', sourceLabel: 'BBC2609080005',
      status: '进行中', createdAt: '2026-09-07 09:00', submittedAt: '2026-09-07 09:05', creator: '周倩', customerCancelled: true, returnResult: '进行中',
      transportMode: '公路运输', originPort: 'CAN', destinationPort: 'CAN', waybillNo: '',
      goods: goods([{ productId: 'SKU-BBC-305', barcode: '6900000000305', name: '合成香水（演示）', spec: '30ml', hsCode: '33030000', quantity: 1, unit: '件', unitPrice: 258, totalPrice: 258 }]),
      services: [{ key: 'transport', label: '运输服务', selected: true, status: '进行中', generated: true, id: 'S11126090800003' }],
      attachments: [], remark: '演示：客退大订单',
    },
    {
      id: 'VR-260908-004', orderNo: 'VR26090800004', category: 'BBC消退', businessType: 'BBC进口', customer: '华越国际商贸', sourceOrderId: 'BBC2609080006', sourceLabel: 'BBC2609080006',
      status: '已完成', createdAt: '2026-09-05 10:00', submittedAt: '2026-09-05 10:05', creator: '周倩', customerCancelled: true, returnResult: '已完成',
      transportMode: '公路运输', originPort: 'CAN', destinationPort: 'CAN', waybillNo: '',
      goods: goods([{ productId: 'SKU-BBC-306', barcode: '6900000000306', name: '合成面霜（演示）', spec: '50ml', hsCode: '33049900', quantity: 1, unit: '件', unitPrice: 418, totalPrice: 418 }]),
      services: [{ key: 'warehouse', label: '仓储服务', selected: true, status: '已完成', generated: true, id: 'S11126090800004' }],
      attachments: [], remark: '演示：消退完成',
    },
    {
      id: 'VR-260908-005', orderNo: 'VR26090800005', category: '退供', businessType: 'BC进口退供', customer: '启航跨境贸易', sourceOrderId: '', sourceLabel: '',
      status: '待接单', createdAt: '2026-09-08 13:00', submittedAt: '2026-09-08 13:05', creator: '客户门户', customerCancelled: false, returnResult: '',
      transportMode: '公路运输', originPort: 'CAN', destinationPort: 'HKG', waybillNo: '',
      goods: goods([{ productId: 'SKU-DEMO-103', barcode: '6900000000103', name: '合成精华（演示）', spec: '30ml', hsCode: '33049900', quantity: 20, unit: '件', unitPrice: 78, totalPrice: 1560, goodQty: 18, defectQty: 2, batchNo: 'BATCH-DEMO-103' }]),
      services: [{ key: 'warehouse', label: '仓储服务', selected: true, status: '待接单', generated: true, id: 'S11126090800005' }],
      attachments: [], remark: '演示：退供需求预占 WMS 库存',
    },
  ]
  const valueAdded = [
    {
      id: 'S11126090800011', orderNo: 'VR26090800001', serviceItem: '贴标', businessType: '普货', customer: '启航跨境贸易', salesperson: '周倩',
      supplier: '广东高捷', department: '仓库部', outsourced: '否', outsourcedSupplier: '', createdBy: '周倩', createdAt: '2026-09-08 10:06', updatedBy: '', updatedAt: '',
      status: '待接单', handler: '', startAt: '', finishAt: '', result: '', remark: '', attachments: [],
      goods: goods([{ productId: '', barcode: '', name: '合成演示货物甲', spec: '', hsCode: '', quantity: 5, unit: '件', unitPrice: 28 }]),
      upstreamAttachments: [{ id: 'VA-A1', name: '演示指令.pdf', uploadedAt: '2026-09-08 10:05', uploader: '周倩', size: 1024 }],
      history: [{ id: 'VA-H1', event: '生成服务', actor: '系统', content: '随主订单提交生成增值服务单', time: '2026-09-08 10:06' }],
    },
    {
      id: 'S11126090800012', orderNo: 'REQ-260908-001', serviceItem: '拆盒', businessType: 'BC', customer: '云帆供应链', salesperson: '陈楠',
      supplier: '广东高捷', department: '仓库部', outsourced: '是', outsourcedSupplier: '申捷车队', createdBy: '周倩', createdAt: '2026-09-08 11:10', updatedBy: '仓库演示客服', updatedAt: '2026-09-08 11:30',
      status: '进行中', handler: '仓库演示客服', startAt: '2026-09-08 11:20', finishAt: '', result: '', remark: '等待作业', attachments: [],
      goods: goods([{ productId: 'SKU-DEMO-101', barcode: '6900000000101', name: '合成护肤水（演示）', spec: '150ml', hsCode: '33049900', quantity: 2, unit: '件', unitPrice: 88.5 }]),
      upstreamAttachments: [],
      history: [{ id: 'VA-H1', event: '生成服务', actor: '系统', content: '随需求提交生成增值服务单', time: '2026-09-08 11:10' }, { id: 'VA-H2', event: '接单', actor: '仓库演示客服', content: '开始处理', time: '2026-09-08 11:30' }],
    },
    {
      id: 'S11126090800013', orderNo: 'VR-26090800004', serviceItem: '其他', businessType: 'BBC', customer: '华越国际商贸', salesperson: '李明',
      supplier: '广东高捷', department: '仓库部', outsourced: '否', outsourcedSupplier: '', createdBy: '周倩', createdAt: '2026-09-05 10:06', updatedBy: '仓库演示客服', updatedAt: '2026-09-06 16:00',
      status: '已完成', handler: '仓库演示客服', startAt: '2026-09-05 13:00', finishAt: '2026-09-06 16:00', result: '完成重新贴标', remark: '', attachments: [{ id: 'VA-F1', name: '处理结果照片.jpg', size: 2048 }],
      goods: goods([{ productId: 'SKU-BBC-306', barcode: '6900000000306', name: '合成面霜（演示）', spec: '50ml', hsCode: '33049900', quantity: 1, unit: '件', unitPrice: 418 }]),
      upstreamAttachments: [],
      history: [{ id: 'VA-H1', event: '生成服务', actor: '系统', content: '随主订单提交生成增值服务单', time: '2026-09-05 10:06' }, { id: 'VA-H2', event: '接单', actor: '仓库演示客服', content: '开始处理', time: '2026-09-05 13:00' }, { id: 'VA-H3', event: '完成服务', actor: '仓库演示客服', content: '保存信息并完成', time: '2026-09-06 16:00' }],
    },
  ]
  return {
    portalSmallOrders: smallOrders,
    portalPoolOrders: poolOrders,
    portalRequirements: requirements,
    portalReports: reports,
    bbcCustomerOrders,
    portalStock: stock,
    reverseOrders,
    valueAddedServices: valueAdded,
    portalSequence: 0,
    portalReportSequence: 0,
    portalStockSequence: 0,
    portalRequirementSequence: 2,
    portalSmallOrderSequence: 0,
    reverseOrderSequence: 5,
    reverseOrderEventSequence: 0,
    reverseServiceSequence: 5,
    valueAddedSequence: 3,
    bbcExpressSequence: 6,
  }
}
