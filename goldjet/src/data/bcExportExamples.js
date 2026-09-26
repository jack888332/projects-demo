// PRD 029 BC出口关务订单、导入历史与回执的固定合成数据。
export function createBcExportSeed() {
  const order = values => ({
    id: '', orderNo: '', platformOrderNo: '', waybillNo: '', merchantName: '', expressNo: '', packageNo: '', amount: 0,
    orderStatus: '待报关', payStatus: '待报关', waybillStatus: '待报关', listStatus: '待报关', waybillDocStatus: '待报关', cancelListStatus: '待报关', arrivalStatus: '待报关', departureStatus: '待报关', summaryStatus: '待报关',
    exceptionResult: '无', customsZone: '南沙海关', supervisionMode: '9710', channel: '', batchNo: '', createdAt: '2026-09-08 09:00:00', receipts: [], logs: [],
    goods: [{ name: '合成出口商品（演示）', quantity: 1, unitPrice: 0 }], ...values,
  })
  const receipt = (type, status, content, time) => ({ id: '', type, status, content, time })
  return {
    bcExportSequence: 8,
    bcExportImportSequence: 2,
    bcExportOrders: [
      order({ id: 'BCO-260908-001', orderNo: 'BCO2609080001', merchantName: 'DEMO 商家甲', expressNo: 'DEMO-EXP-001', packageNo: 'PKG-001', amount: 2680, batchNo: '202609080001', createdAt: '2026-09-08 09:00:00', goods: [{ name: '合成日化品（演示）', quantity: 2, unitPrice: 1340 }] }),
      order({ id: 'BCO-260908-002', orderNo: 'BCO2609080002', platformOrderNo: 'PLT-BCO-002', merchantName: 'DEMO 商家甲', expressNo: 'DEMO-EXP-002', packageNo: 'PKG-002', amount: 1580, batchNo: '202609080001', createdAt: '2026-09-08 09:05:00' }),
      order({ id: 'BCO-260908-003', orderNo: 'BCO2609080003', platformOrderNo: 'PLT-BCO-003', merchantName: 'DEMO 商家乙', expressNo: 'DEMO-EXP-003', packageNo: 'PKG-003', amount: 990, orderStatus: '海关入库', payStatus: '海关入库', waybillStatus: '海关入库', batchNo: '202609080001', createdAt: '2026-09-08 09:10:00', receipts: [receipt('订单申报', '海关入库', '订单申报回执：海关入库（本地模拟）', '2026-09-08 09:30')] }),
      order({ id: 'BCO-260908-004', orderNo: 'BCO2609080004', platformOrderNo: 'PLT-BCO-004', waybillNo: '781-90003004', merchantName: 'DEMO 商家乙', expressNo: 'DEMO-EXP-004', packageNo: 'PKG-004', amount: 3200, orderStatus: '海关入库', payStatus: '海关入库', waybillStatus: '海关入库', listStatus: '待报关', batchNo: '202609080001', createdAt: '2026-09-08 09:15:00' }),
      order({ id: 'BCO-260908-005', orderNo: 'BCO2609080005', platformOrderNo: 'PLT-BCO-005', waybillNo: '781-90003005', merchantName: 'DEMO 商家丙', expressNo: 'DEMO-EXP-005', packageNo: 'PKG-005', amount: 4500, orderStatus: '海关入库', payStatus: '海关入库', waybillStatus: '海关入库', listStatus: '海关入库', waybillDocStatus: '待报关', channel: '单一窗口', batchNo: '202609080001', createdAt: '2026-09-08 09:20:00' }),
      order({ id: 'BCO-260908-006', orderNo: 'BCO2609080006', platformOrderNo: 'PLT-BCO-006', waybillNo: '781-90003006', merchantName: 'DEMO 商家丙', expressNo: 'DEMO-EXP-006', packageNo: 'PKG-006', amount: 2100, orderStatus: '海关入库', payStatus: '海关入库', waybillStatus: '海关入库', listStatus: '海关审结', waybillDocStatus: '海关入库', arrivalStatus: '海关入库', channel: '单一窗口', batchNo: '202609080001', createdAt: '2026-09-08 09:25:00' }),
      order({ id: 'BCO-260908-007', orderNo: 'BCO2609080007', platformOrderNo: 'PLT-BCO-007', waybillNo: '781-90003007', merchantName: 'DEMO 商家丁', expressNo: 'DEMO-EXP-007', packageNo: 'PKG-007', amount: 860, orderStatus: '海关入库', payStatus: '海关入库', waybillStatus: '海关入库', listStatus: '海关退单', waybillDocStatus: '海关入库', batchNo: '202609080002', createdAt: '2026-09-08 09:30:00', receipts: [receipt('清单申报', '海关退单', '清单申报回执：海关退单，原因演示（本地模拟）', '2026-09-08 10:00')] }),
    ],
    bcExportImportHistory: [
      { id: 'BCO-HIS-001', batchNo: '202609080001', mode: '9710', total: 7, success: 6, failed: 1, importedAt: '2026-09-08 09:00:00', problems: [{ orderNo: 'BCO2609080099', reason: '系统已存在该订单编号' }] },
      { id: 'BCO-HIS-002', batchNo: '202609080002', mode: '9610', total: 3, success: 1, failed: 2, importedAt: '2026-09-08 09:30:00', problems: [{ orderNo: 'BCO2609080201', reason: '商家备案名称为必填' }, { orderNo: 'BCO2609080202', reason: '同一文件内订单编号重复' }] },
    ],
  }
}
