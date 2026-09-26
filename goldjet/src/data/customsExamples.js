// PRD 028～032 共用的关务服务单、报关单与核放单固定合成数据。
// 日期跨 2026-07～09，用于查询、部门/成员统计与南沙月度序列；全部为演示值。
export function createCustomsSeed() {
  const declaration = values => ({ events: {}, cleared: false, customsType: '代理报关', currency: 'CNY', status: '已申报', customsStatus: '放行', typeLabel: '进口整合申报', note: '', copies: [], logs: [], ...values })
  const service = values => ({ status: '已完成', transportMode: '空运', orderType: '', parcelCount: 0, totalWaybillCount: 0, services: ['国内报关'], upstreamCancelled: false, handler: '', handlerRole: '', serviceRecords: [], attachments: [], logs: [], emails: [], inspections: [], ...values })
  const seal = values => ({ inspectNo: '', ...values })
  const declarations = [
    declaration({ id: 'CD-001', declarationNo: '514120260900001', serviceId: 'CS-260908-001', businessType: '普货进口', importExportFlag: '进口', transportMode: '空运', conveyanceName: 'MU9001', waybillNo: '781-90000101', domesticConsignor: '启航跨境贸易', creditCode: '91440101DEMO00001X', supervisionMode: '一般贸易', declarationCustoms: '广州白云机场海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '2026-09-05', cleared: true, customsType: '代理报关', grossWeight: 320, totalValue: 12500, orderNo: 'GJ-IMP-260908-001', houseNo: '', clerk: '张关', events: { sent: '张关', inspected: '张关' } }),
    declaration({ id: 'CD-002', declarationNo: '514120260900002', serviceId: 'CS-260908-002', businessType: '普货进口', importExportFlag: '进口', transportMode: '海运', conveyanceName: 'COSCO-DEMO', waybillNo: 'COSU-DEMO-002', domesticConsignor: '云帆供应链', creditCode: '91440101DEMO00002X', supervisionMode: '一般贸易', declarationCustoms: '南沙海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '2026-09-06', cleared: false, customsType: '代理报关', grossWeight: 860, totalValue: 3200, currency: 'USD', orderNo: 'GJ-IMP-260908-002', houseNo: 'H-IMP-002', clerk: '张关', events: { sent: '张关', amended: '张关' } }),
    declaration({ id: 'CD-003', declarationNo: '514120260900003', serviceId: 'CS-260907-003', businessType: '普货出口', importExportFlag: '出口', transportMode: '空运', conveyanceName: 'CZ9002', waybillNo: '784-90000303', domesticConsignor: '远洲电子商务', creditCode: '91440101DEMO00003X', supervisionMode: '一般贸易', declarationCustoms: '广州白云机场海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '2026-09-04', cleared: true, customsType: '单证报关', grossWeight: 210, totalValue: 9800, orderNo: 'GJ-EXP-260907-003', houseNo: '', clerk: '李务', events: { sent: '李务', deleted: '李务' } }),
    declaration({ id: 'CD-004', declarationNo: '514120260900004', serviceId: 'CS-260907-004', businessType: '普货出口', importExportFlag: '出口', transportMode: '陆运', conveyanceName: '粤A·DEMO4', waybillNo: 'TRUCK-DEMO-004', domesticConsignor: '华越国际商贸', creditCode: '91440101DEMO00004X', supervisionMode: '一般贸易', declarationCustoms: '黄埔海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '2026-09-07', cleared: false, customsType: '代理报关', grossWeight: 440, totalValue: 6100, orderNo: 'GJ-EXP-260907-004', houseNo: '', clerk: '李务', events: { sent: '李务' } }),
    declaration({ id: 'CD-005', declarationNo: '514120260900005', serviceId: 'CS-260906-005', businessType: 'BC出口', importExportFlag: '出口', transportMode: '空运', conveyanceName: 'CZ9002', waybillNo: '784-90000505', domesticConsignor: 'DEMO 电商企业甲', creditCode: '91440101DEMO00005X', supervisionMode: '跨境电商', declarationCustoms: '南沙海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '2026-09-03', cleared: true, customsType: '单证报关', grossWeight: 96, totalValue: 2680, orderNo: 'BC2609080001', houseNo: '', clerk: '王快', events: { sent: '王快', inspected: '王快' } }),
    declaration({ id: 'CD-006', declarationNo: '514120260900006', serviceId: 'CS-260906-006', businessType: 'BC进口', importExportFlag: '进口', transportMode: '空运', conveyanceName: 'MU9001', waybillNo: '781-90000606', domesticConsignor: 'DEMO 电商企业乙', creditCode: '91440101DEMO00006X', supervisionMode: '跨境电商', declarationCustoms: '南沙海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '2026-09-02', cleared: true, customsType: '代理报关', grossWeight: 158, totalValue: 5200, orderNo: 'BC2609080004', houseNo: '', clerk: '赵进', events: { sent: '赵进' } }),
    declaration({ id: 'CD-007', declarationNo: '514120260900007', serviceId: 'CS-260905-007', businessType: 'CC进口', importExportFlag: '进口', transportMode: '空运', conveyanceName: 'NH9003', waybillNo: '205-90000707', domesticConsignor: '订购人戊（演示）', creditCode: '', supervisionMode: '个人物品', declarationCustoms: '南沙海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '2026-09-01', cleared: true, customsType: '单证报关', grossWeight: 12, totalValue: 366, orderNo: 'CC2609080001', houseNo: '', clerk: '钱物', events: { sent: '钱物' } }),
    declaration({ id: 'CD-008', declarationNo: '514120260900008', serviceId: 'CS-260905-008', businessType: 'BBC进口', importExportFlag: '进口', transportMode: '空运', conveyanceName: 'CZ354', waybillNo: '784-90000808', domesticConsignor: 'DEMO BBC 电商企业', creditCode: '91440101DEMO00008X', supervisionMode: '保税电商', declarationCustoms: '南沙海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '2026-09-01', cleared: true, customsType: '单证报关', grossWeight: 45.2, totalValue: 328.5, orderNo: 'BBC2609080001', houseNo: '', clerk: '孙保', events: { sent: '孙保' } }),
    declaration({ id: 'CD-009', declarationNo: '514120260900009', serviceId: 'CS-260904-009', businessType: 'BBC进口', importExportFlag: '进口', transportMode: '陆运', conveyanceName: '粤Z·DEMO9', waybillNo: 'TRUCK-BBC-009', domesticConsignor: 'DEMO BBC 电商企业', creditCode: '91440101DEMO00008X', supervisionMode: '保税电商', declarationCustoms: '南沙海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '2026-09-02', cleared: true, customsType: '单证报关', grossWeight: 80, totalValue: 1240, orderNo: 'BBC2609080002', houseNo: '', clerk: '孙保', events: { sent: '孙保', amended: '孙保' } }),
    declaration({ id: 'CD-010', declarationNo: '514120260900010', serviceId: 'CS-260904-010', businessType: 'BBC进口', importExportFlag: '进口', transportMode: '空运', conveyanceName: 'CZ354', waybillNo: '784-90001010', domesticConsignor: 'DEMO BBC 电商企业', creditCode: '91440101DEMO00008X', supervisionMode: '保税电商', declarationCustoms: '南沙海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '2026-09-03', cleared: true, customsType: '单证报关', grossWeight: 66, totalValue: 990, orderNo: 'BBC2609080003', houseNo: '', clerk: '孙保', events: { sent: '孙保', inspected: '孙保' } }),
    declaration({ id: 'CD-011', declarationNo: '514120260800011', serviceId: 'CS-260805-011', businessType: 'BBC进口', importExportFlag: '进口', transportMode: '空运', conveyanceName: 'CZ354', waybillNo: '784-90001111', domesticConsignor: 'DEMO BBC 电商企业', creditCode: '91440101DEMO00008X', supervisionMode: '保税电商', declarationCustoms: '南沙海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '2026-08-12', cleared: true, customsType: '单证报关', grossWeight: 120, totalValue: 2100, orderNo: 'BBC2609080005', houseNo: '', clerk: '孙保', events: { sent: '孙保' } }),
    declaration({ id: 'CD-012', declarationNo: '514120260700012', serviceId: 'CS-260710-012', businessType: 'BBC进口', importExportFlag: '进口', transportMode: '海运', conveyanceName: 'COSCO-DEMO', waybillNo: 'COSU-BBC-012', domesticConsignor: 'DEMO BBC 电商企业', creditCode: '91440101DEMO00008X', supervisionMode: '保税电商', declarationCustoms: '南沙海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '2026-07-15', cleared: true, customsType: '单证报关', grossWeight: 200, totalValue: 3600, orderNo: 'BBC2609080006', houseNo: '', clerk: '孙保', events: { sent: '孙保', deleted: '孙保' } }),
  ]
  const services = [
    service({ id: 'CS-260908-001', serviceNo: 'CS26090800001', businessType: '普货进口', customer: '启航跨境贸易', transportMode: '空运', orderNo: 'GJ-IMP-260908-001', houseNo: '', clerk: '张关', department: '空运报关部', createdAt: '2026-09-02 09:00', completedAt: '2026-09-05 16:00', declarationIds: ['CD-001'] }),
    service({ id: 'CS-260908-002', serviceNo: 'CS26090800002', businessType: '普货进口', customer: '云帆供应链', transportMode: '海运', orderNo: 'GJ-IMP-260908-002', houseNo: 'H-IMP-002', clerk: '张关', department: '空运报关部', createdAt: '2026-09-03 09:00', completedAt: '2026-09-06 15:00', declarationIds: ['CD-002'] }),
    service({ id: 'CS-260907-003', serviceNo: 'CS26090700003', businessType: '普货出口', customer: '远洲电子商务', transportMode: '空运', orderNo: 'GJ-EXP-260907-003', houseNo: '', clerk: '李务', department: '空运报关部', createdAt: '2026-09-01 09:00', completedAt: '2026-09-04 14:00', declarationIds: ['CD-003'] }),
    service({ id: 'CS-260907-004', serviceNo: 'CS26090700004', businessType: '普货出口', customer: '华越国际商贸', transportMode: '陆运', orderNo: 'GJ-EXP-260907-004', houseNo: '', clerk: '李务', department: '空运报关部', status: '进行中', completedAt: '', declarationIds: ['CD-004'] }),
    service({ id: 'CS-260906-005', serviceNo: 'CS26090600005', businessType: 'BC出口', customer: '启航跨境贸易', transportMode: '空运', orderNo: 'BC2609080001', waybillNos: ['784-90000501', '784-90000502', '784-90000503'], houseNo: '', clerk: '王快', department: '出口快件部', parcelCount: 120, totalWaybillCount: 3, createdAt: '2026-09-01 10:00', completedAt: '2026-09-03 11:00', declarationIds: ['CD-005'] }),
    service({ id: 'CS-260906-006', serviceNo: 'CS26090600006', businessType: 'BC进口', customer: '云帆供应链', transportMode: '空运', orderNo: 'BC2609080004', waybillNos: ['781-90000601', '781-90000602'], houseNo: '', clerk: '赵进', department: '进口快件部', parcelCount: 80, totalWaybillCount: 2, createdAt: '2026-08-30 10:00', completedAt: '2026-09-02 10:00', declarationIds: ['CD-006'] }),
    service({ id: 'CS-260905-007', serviceNo: 'CS26090500007', businessType: 'CC进口', customer: 'CC 门户客户（演示）', transportMode: '空运', orderNo: 'CC2609080001', houseNo: '', clerk: '钱物', department: '个人物品报关部', parcelCount: 45, totalWaybillCount: 1, createdAt: '2026-08-28 10:00', completedAt: '2026-09-01 09:30', declarationIds: ['CD-007'] }),
    service({ id: 'CS-260905-008', serviceNo: 'CS26090500008', businessType: 'BBC进口', customer: '华越国际商贸', transportMode: '空运', orderNo: 'BBC2609080001', houseNo: '', clerk: '孙保', department: 'BBC报关部', orderType: '一线进境', createdAt: '2026-08-29 09:00', completedAt: '2026-09-01 14:00', declarationIds: ['CD-008'] }),
    service({ id: 'CS-260904-009', serviceNo: 'CS26090400009', businessType: 'BBC进口', customer: '华越国际商贸', transportMode: '陆运', orderNo: 'BBC2609080002', houseNo: '', clerk: '孙保', department: 'BBC报关部', orderType: '区间调拨', createdAt: '2026-09-01 09:00', completedAt: '2026-09-02 16:00', declarationIds: ['CD-009'] }),
    service({ id: 'CS-260904-010', serviceNo: 'CS26090400010', businessType: 'BBC进口', customer: '华越国际商贸', transportMode: '空运', orderNo: 'BBC2609080003', houseNo: '', clerk: '孙保', department: 'BBC报关部', orderType: '包裹出区', createdAt: '2026-09-02 09:00', completedAt: '2026-09-03 15:00', declarationIds: ['CD-010'] }),
    service({ id: 'CS-260903-011', serviceNo: 'CS26090300011', businessType: '普货进口', customer: '星瀚品牌管理', transportMode: '空运', orderNo: 'GJ-IMP-260903-011', houseNo: '', clerk: '张关', department: '空运报关部', status: '已取消', completedAt: '', declarationIds: [] }),
    service({ id: 'CS-260805-011', serviceNo: 'CS26080500011', businessType: 'BBC进口', customer: '华越国际商贸', transportMode: '空运', orderNo: 'BBC2609080005', houseNo: '', clerk: '孙保', department: 'BBC报关部', orderType: '一线进境', createdAt: '2026-08-10 09:00', completedAt: '2026-08-12 14:00', declarationIds: ['CD-011'] }),
    service({ id: 'CS-260710-012', serviceNo: 'CS26071000012', businessType: 'BBC进口', customer: '华越国际商贸', transportMode: '海运', orderNo: 'BBC2609080006', houseNo: '', clerk: '孙保', department: 'BBC报关部', orderType: '包裹出区', createdAt: '2026-07-12 09:00', completedAt: '2026-07-15 14:00', declarationIds: ['CD-012'] }),
    service({ id: 'CS-260903-013', serviceNo: 'CS26090300013', businessType: 'BBC进口', customer: '启航跨境贸易', transportMode: '陆运', orderNo: 'BBC2609080007', houseNo: '', clerk: '孙保', department: 'BBC报关部', orderType: '物料进区', createdAt: '2026-09-01 09:00', completedAt: '2026-09-03 10:00', declarationIds: [] }),
    service({ id: 'CS-260908-014', serviceNo: 'CS26090800014', businessType: '普货进口', customer: '远洲电子商务', transportMode: '空运', orderNo: 'GJ-IMP-260908-014', houseNo: '', clerk: '张关', department: '空运报关部', status: '进行中', handler: '报关演示客服', handlerRole: 'customsService', upstreamCancelled: true, completedAt: '', createdAt: '2026-09-08 09:30', declarationIds: [],
      goods: [
        { name: '合成演示货物戊', spec: 'DEMO-E', hsCode: '33049900', quantity: 12, unit: '件', unitPrice: 200 },
        { name: '合成演示货物己', spec: 'DEMO-F', hsCode: '33049900', quantity: 8, unit: '件', unitPrice: 200 },
      ],
      serviceRecords: [{ id: 'R-14-1', event: '接单', content: '待接单转进行中', actor: '报关演示客服', time: '2026-09-08 09:40' }], logs: [{ id: 'L-14-1', operator: '报关演示客服', action: '接单', content: '接单成功', time: '2026-09-08 09:40' }], attachments: [{ id: 'A-14-1', name: '演示报关资料.pdf', type: '报关资料', source: '上游订单', operator: '客服演示员', operatedAt: '2026-09-08 09:35', receipt: '' }] }),
    service({ id: 'CS-260908-015', serviceNo: 'CS26090800015', businessType: '普货进口', customer: '星瀚品牌管理', transportMode: '空运', orderNo: 'GJ-IMP-260908-015', houseNo: '', clerk: '李务', department: '空运报关部', status: '待接单', completedAt: '', createdAt: '2026-09-08 10:10', declarationIds: [], services: ['国内报关', '查验'], attachments: [{ id: 'A-15-1', name: '演示合同.pdf', type: '合同', source: '上游订单', operator: '客服演示员', operatedAt: '2026-09-08 10:05', receipt: '' }, { id: 'A-15-2', name: '演示发票.pdf', type: '发票', source: '上游订单', operator: '客服演示员', operatedAt: '2026-09-08 10:05', receipt: '' }] }),
    service({ id: 'CS-260908-016', serviceNo: 'CS26090800016', businessType: 'BC出口', customer: '启航跨境贸易', transportMode: '空运', orderNo: 'BC2609080016', clerk: '王快', department: '出口快件部', status: '待接单', completedAt: '', createdAt: '2026-09-08 11:00', declarationIds: [], services: ['订单申报', '清单申报', '总运单申报', '离境单申报'], platformOrderNo: 'XQD00000000016', ecommerceName: 'DEMO 商家甲', salesperson: '周倩', creator: '客服演示员', orderStatus: '进行中', upstreamCancelled: false, handler: '' }),
    service({ id: 'CS-260908-017', serviceNo: 'CS26090800017', businessType: 'BC出口', customer: '远洲电子商务', transportMode: '空运', orderNo: 'BC2609080017', clerk: '王快', department: '出口快件部', status: '进行中', completedAt: '', createdAt: '2026-09-08 11:20', declarationIds: [], services: ['订单申报', '清单申报'], platformOrderNo: 'XQD00000000017', ecommerceName: 'DEMO 商家乙', salesperson: '陈楠', creator: '客服演示员', orderStatus: '进行中', upstreamCancelled: true, handler: '报关演示客服', waybillNo: '781-90003017',
      attachments: [{ id: 'A-17-1', name: '报关资料.pdf', size: 2048, uploader: '报关演示客服', uploadedAt: '2026-09-08 11:25', dataUrl: '' }],
      costs: [{ id: 'C-17-1', settlementParty: '启航跨境贸易', status: '未结算', costItem: '报关服务费', attribute: '应收', quantity: '1', unit: '票', currency: 'CNY', unitPrice: '350.00', total: '350.00', collect: '否' }, { id: 'C-17-2', settlementParty: '申捷车队', status: '未结算', costItem: '查验服务费', attribute: '应付', quantity: '1', unit: '票', currency: 'CNY', unitPrice: '120.00', total: '120.00', collect: '否' }],
      serviceRecords: [{ id: 'R-17-1', event: '接单', result: '成功', content: '待接单转进行中', actor: '报关演示客服', time: '2026-09-08 11:25' }],
      logs: [{ id: 'L-17-1', operator: '报关演示客服', action: '接单', content: '接单成功', time: '2026-09-08 11:25' }] }),
    service({ id: 'CS-260908-018', serviceNo: 'CS26090800018', businessType: 'BC进口', customer: '云帆供应链', transportMode: '空运', orderNo: 'BC2609080018', clerk: '赵进', department: '进口快件部', status: '待接单', completedAt: '', createdAt: '2026-09-08 12:00', declarationIds: [], services: ['国内清关'], platformOrderNo: 'XQD00000000018', ecommerceName: 'DEMO 商家甲', salesperson: '周倩', creator: '客服演示员', orderStatus: '进行中', upstreamCancelled: false, handler: '' }),
    service({ id: 'CS-260908-019', serviceNo: 'CS26090800019', businessType: 'BC进口', customer: '远洲电子商务', transportMode: '空运', orderNo: 'BC2609080019', clerk: '赵进', department: '进口快件部', status: '进行中', completedAt: '', createdAt: '2026-09-08 12:20', declarationIds: [], services: ['国内清关', '换单'], platformOrderNo: 'XQD00000000019', ecommerceName: 'DEMO 商家乙', salesperson: '陈楠', creator: '客服演示员', orderStatus: '进行中', upstreamCancelled: true, handler: '报关演示客服', waybillNo: '781-90004019',
      attachments: [{ id: 'A-19-1', name: '进口报关资料.pdf', size: 1024, uploader: '报关演示客服', uploadedAt: '2026-09-08 12:25', dataUrl: '' }],
      costs: [{ id: 'C-19-1', settlementParty: '启航跨境贸易', status: '未结算', costItem: '清关服务费', attribute: '应收', quantity: '1', unit: '票', currency: 'CNY', unitPrice: '420.00', total: '420.00', collect: '否' }],
      serviceRecords: [{ id: 'R-19-1', event: '接单', result: '成功', content: '待接单转进行中', actor: '报关演示客服', time: '2026-09-08 12:25' }],
      logs: [{ id: 'L-19-1', operator: '报关演示客服', action: '接单', content: '接单成功', time: '2026-09-08 12:25' }] }),
  ]
  const puGongOperational = {
    'CS-260908-001': {
      status: '已完成', handler: '张关', handlerRole: 'customsService', services: ['国内报关', '换单'],
      goods: [
        { name: '合成演示货物甲', spec: 'DEMO-A', hsCode: '33049900', quantity: 42, unit: '件', unitPrice: 28 },
      ],
      serviceRecords: [
        { id: 'R-01-1', event: '接单', content: '待接单转进行中', actor: '张关', time: '2026-09-02 09:10' },
        { id: 'R-01-2', event: '审核资料', content: '审核通过', actor: '张关', time: '2026-09-02 10:00' },
        { id: 'R-01-3', event: '单证制作', content: '生成报关单、发票、装箱单、合同', actor: '张关', time: '2026-09-02 10:30' },
        { id: 'R-01-4', event: '发送单一窗口', content: '发送成功，海关编号 514120260900001', actor: '张关', time: '2026-09-03 09:00' },
        { id: 'R-01-5', event: '报关状态', content: '已结关', actor: '海关系统', time: '2026-09-05 16:00' },
      ],
      attachments: [
        { id: 'A-01-1', name: '上游装箱单.pdf', type: '装箱单', source: '上游订单', operator: '客服演示员', operatedAt: '2026-09-02 08:50', receipt: '' },
        { id: 'A-01-2', name: '报关单（预录）.pdf', type: '报关单', source: '单证制作', operator: '张关', operatedAt: '2026-09-02 10:30', receipt: '' },
        { id: 'A-01-3', name: '发票.pdf', type: '发票', source: '单证制作', operator: '张关', operatedAt: '2026-09-02 10:30', receipt: '' },
        { id: 'A-01-4', name: '装箱单.pdf', type: '装箱单', source: '单证制作', operator: '张关', operatedAt: '2026-09-02 10:30', receipt: '' },
        { id: 'A-01-5', name: '合同.pdf', type: '合同', source: '单证制作', operator: '张关', operatedAt: '2026-09-02 10:30', receipt: '' },
      ],
      logs: [
        { id: 'L-01-1', operator: '张关', action: '接单', content: '接单成功', time: '2026-09-02 09:10' },
        { id: 'L-01-2', operator: '张关', action: '审核资料', content: '审核通过', time: '2026-09-02 10:00' },
        { id: 'L-01-3', operator: '张关', action: '单证制作', content: '生成四类单证', time: '2026-09-02 10:30' },
        { id: 'L-01-4', operator: '张关', action: '发送单一窗口', content: '发送成功', time: '2026-09-03 09:00' },
      ],
      emails: [],
    },
    'CS-260908-002': {
      status: '已完成', handler: '报关演示客服', handlerRole: 'customsService', services: ['国内报关'],
      goods: [
        { name: '合成演示货物乙', spec: 'DEMO-B', hsCode: '84713000', quantity: 120, unit: '件', unitPrice: 26.67 },
        { name: '合成配件（演示）', spec: 'ACC-1', hsCode: '84733000', quantity: 40, unit: '个', unitPrice: 12 },
      ],
      serviceRecords: [
        { id: 'R-02-1', event: '接单', content: '待接单转进行中', actor: '张关', time: '2026-09-03 09:20' },
        { id: 'R-02-2', event: '审核资料', content: '审核不通过：装箱单数量与发票不一致', actor: '张关', time: '2026-09-03 10:10' },
      ],
      attachments: [{ id: 'A-02-1', name: '上游合同.pdf', type: '合同', source: '上游订单', operator: '客服演示员', operatedAt: '2026-09-03 09:00', receipt: '审核不通过：装箱单数量与发票不一致（2026-09-03 10:10）' }],
      logs: [
        { id: 'L-02-1', operator: '张关', action: '接单', content: '接单成功', time: '2026-09-03 09:20' },
        { id: 'L-02-2', operator: '张关', action: '审核资料', content: '审核不通过并发送邮件', time: '2026-09-03 10:10' },
      ],
      emails: [{ id: 'E-02-1', subject: 'H-IMP-002', body: '装箱单数量与发票不一致，请修改后重新上传。', signName: '张关', signPhone: '000-00000088', to: ['客户邮箱（演示）'], sentAt: '2026-09-03 10:10' }],
    },
    'CS-260907-003': {
      status: '已完成', handler: '李务', handlerRole: 'customsService', services: ['国内报关'],
      goods: [
        { name: '合成演示货物丙', spec: 'DEMO-C', hsCode: '33041000', quantity: 60, unit: '件', unitPrice: 163.33 },
      ],
      serviceRecords: [
        { id: 'R-03-1', event: '接单', content: '待接单转进行中', actor: '李务', time: '2026-09-01 09:10' },
        { id: 'R-03-2', event: '审核资料', content: '审核通过', actor: '李务', time: '2026-09-01 10:00' },
        { id: 'R-03-3', event: '发送单一窗口', content: '发送成功，海关编号 514120260900003', actor: '李务', time: '2026-09-02 09:00' },
      ],
      attachments: [{ id: 'A-03-1', name: '上游发票.pdf', type: '发票', source: '上游订单', operator: '客服演示员', operatedAt: '2026-09-01 08:50', receipt: '审核通过（2026-09-01 10:00）' }],
      logs: [{ id: 'L-03-1', operator: '李务', action: '接单', content: '接单成功', time: '2026-09-01 09:10' }],
      emails: [],
    },
    'CS-260907-004': {
      status: '进行中', handler: '报关演示客服', handlerRole: 'customsService', services: ['国内报关', '查验'], upstreamCancelled: true,
      goods: [
        { name: '合成演示货物丁', spec: 'DEMO-D', hsCode: '34013000', quantity: 24, unit: '件', unitPrice: 254.17 },
      ],
      serviceRecords: [{ id: 'R-04-1', event: '接单', content: '待接单转进行中', actor: '李务', time: '2026-09-07 09:10' }],
      attachments: [{ id: 'A-04-1', name: '上游报关草单.pdf', type: '报关单草单', source: '上游订单', operator: '客服演示员', operatedAt: '2026-09-07 09:00', receipt: '' }],
      logs: [{ id: 'L-04-1', operator: '李务', action: '接单', content: '接单成功', time: '2026-09-07 09:10' }],
      emails: [],
    },
  }
  for (const item of services) if (puGongOperational[item.id]) Object.assign(item, puGongOperational[item.id])
  const bcExportOperational = {
    'CS-260906-005': {
      platformOrderNo: 'XQD00000000005', ecommerceName: 'DEMO 商家甲', salesperson: '周倩', creator: '客服演示员', orderStatus: '已完成', channel: '单一窗口', upstreamCancelled: false, handler: '王快',
      costs: [{ id: 'C-05-1', settlementParty: '启航跨境贸易', status: '已结算', costItem: '报关服务费', attribute: '应收', quantity: '1', unit: '票', currency: 'CNY', unitPrice: '500.00', total: '500.00', collect: '否' }],
      serviceRecords: [{ id: 'R-05-1', event: '接单', result: '成功', content: '待接单转进行中', actor: '王快', time: '2026-09-01 10:10' }, { id: 'R-05-2', event: '结束服务', result: '成功', content: '服务已完成', actor: '王快', time: '2026-09-03 11:00' }],
      logs: [{ id: 'L-05-1', operator: '王快', action: '接单', content: '接单成功', time: '2026-09-01 10:10' }, { id: 'L-05-2', operator: '王快', action: '结束服务', content: '服务已完成', time: '2026-09-03 11:00' }],
    },
  }
  for (const item of services) if (bcExportOperational[item.id]) Object.assign(item, bcExportOperational[item.id])
  const declarationOperational = {
    'CD-001': { docNo: '20826090500001', customsNo: '514120260900001', customsStatus: '结关', typeLabel: '进口整合申报' },
    'CD-002': { docNo: '20826090600002', customsNo: '514120260900002', customsStatus: '审结', typeLabel: '进口整合申报' },
    'CD-003': { docNo: '20826090400003', customsNo: '514120260900003', customsStatus: '放行', typeLabel: '出口一次录入-人工提交' },
    'CD-004': { docNo: '20826090700004', customsNo: '', customsStatus: '退单', typeLabel: '进口整合申报' },
  }
  for (const item of declarations) if (declarationOperational[item.id]) Object.assign(item, declarationOperational[item.id])
  const operationalDrafts = [
    declaration({ id: 'CD-013', declarationNo: '', docNo: '20826090800013', serviceId: 'CS-260908-014', businessType: '普货进口', importExportFlag: '进口', transportMode: '空运', conveyanceName: 'MU9001', waybillNo: '781-90001401', domesticConsignor: '远洲电子商务', creditCode: '91440101DEMO00003X', supervisionMode: '一般贸易', declarationCustoms: '广州白云机场海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '', cleared: false, customsType: '代理报关', grossWeight: 120, totalValue: 2400, orderNo: 'GJ-IMP-260908-014', houseNo: '', clerk: '张关', status: '待复审', customsStatus: '待申报', typeLabel: '进口整合申报', events: {} }),
    declaration({ id: 'CD-014', declarationNo: '', docNo: '20826090800014', serviceId: 'CS-260908-014', businessType: '普货进口', importExportFlag: '进口', transportMode: '空运', conveyanceName: 'MU9001', waybillNo: '781-90001402', domesticConsignor: '远洲电子商务', creditCode: '91440101DEMO00003X', supervisionMode: '一般贸易', declarationCustoms: '广州白云机场海关', declarationUnit: '广东高捷报关有限公司', declarationDate: '', cleared: false, customsType: '代理报关', grossWeight: 80, totalValue: 1600, orderNo: 'GJ-IMP-260908-014', houseNo: '', clerk: '张关', status: '复审通过', customsStatus: '待申报', typeLabel: '进口整合申报', events: {} }),
  ]
  declarations.push(...operationalDrafts)
  const service014 = services.find(item => item.id === 'CS-260908-014')
  if (service014) service014.declarationIds = ['CD-013', 'CD-014']
  const sealDocuments = [
    seal({ id: 'SEAL-001', sealNo: '核放单-HN-001', serviceId: 'CS-260905-008', inspectNo: '查验-DEMO-001', date: '2026-09-01' }),
    seal({ id: 'SEAL-002', sealNo: '核放单-HN-002', serviceId: 'CS-260905-008', date: '2026-09-01' }),
    seal({ id: 'SEAL-003', sealNo: '核放单-HN-003', serviceId: 'CS-260904-009', date: '2026-09-02' }),
    seal({ id: 'SEAL-004', sealNo: '核放单-HN-004', serviceId: 'CS-260903-013', inspectNo: '查验-DEMO-002', date: '2026-09-03' }),
  ]
  return {
    customsServiceOrders: services,
    customsDeclarations: declarations,
    customsSealDocuments: sealDocuments,
    customsSequence: 0,
    customsDeclarationSequence: 15,
    customsInspectionSequence: 0,
    customsRecordSequence: 0,
  }
}
