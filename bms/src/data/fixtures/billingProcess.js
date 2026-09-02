export const billingProcessFixtures = {
  fees: [
    { code: 'FREIGHT_BASE', name: '基础运费', type: '应收类', scenes: '集运订单、同行订单', object: '业务订单', sources: 'OFP订单费项', status: '启用', references: 8, integrity: '完整' },
    { code: 'COD_RETURN', name: '应返货款', type: '代付类', scenes: 'COD返款', object: '尾程包裹', sources: '订单费项报表', status: '启用', references: 4, integrity: '完整' },
    { code: 'COD_SERVICE', name: '代收服务费', type: '应收扣减类', scenes: 'COD返款', object: '尾程包裹', sources: 'OFP包裹费', status: '启用', references: 3, integrity: '完整' },
    { code: 'CLAIM_REFERENCE', name: '理赔参考金额', type: '非费项', scenes: '理赔核对', object: '业务订单', sources: '理赔单', status: '停用', references: 1, integrity: '待完善' },
  ],
  scenes: [
    { scene: '集运订单', fee: '基础运费', dataset: 'OFP_ORDER_FEE', table: 'sale_order_fee_detail', amountField: 'base_freight', currencyField: 'currency', timing: '跟随账单配置', priority: 10, status: '启用', integrity: '完整' },
    { scene: 'COD返款', fee: '应返货款', dataset: 'OFP_PACKAGE_FEE', table: 'sale_order_package_fee', amountField: 'recovery_money', currencyField: 'cod_currency', timing: '签收时间', priority: 10, status: '启用', integrity: '完整' },
    { scene: 'COD返款', fee: '代收服务费', dataset: 'OFP_PACKAGE_FEE', table: 'sale_order_package_fee', amountField: 'service_fee', currencyField: 'fee_currency', timing: '新增时间', priority: 20, status: '启用', integrity: '完整' },
  ],
  sources: [
    { code: 'OFP_ORDER_FEE', name: 'OFP订单费用数据集', system: 'OFP', database: 'ofp_ofdb1', table: 'sale_order_fee_detail', relation: 'sale_order_no', nodes: '出库、订单完结', timing: '履约节点', window: '账期 + 2天', pageSize: 1000, status: '启用', references: 12 },
    { code: 'OFP_PACKAGE_FEE', name: 'OFP包裹费用数据集', system: 'OFP', database: 'ofp_ofdb1', table: 'sale_order_package_fee', relation: 'tracking_no', nodes: '签收', timing: '签收/新增', window: '最近30天', pageSize: 1000, status: '启用', references: 6 },
    { code: 'OFP_CLAIM', name: 'OFP理赔数据集', system: 'OFP', database: 'ofp_ofdb1', table: 'claim_order', relation: 'sale_order_no', nodes: '理赔完成', timing: '理赔完成时间', window: '最近90天', pageSize: 500, status: '停用', references: 1 },
  ],
  templates: [
    { no: 'CUR-TPL-001', name: '欧美客户默认模板', default: 'USD', mapping: '基础运费→USD；操作费→USD；附加费→CNY', status: '启用', operator: '谭清辉', updatedAt: '2026-08-01 15:42' },
    { no: 'CUR-TPL-002', name: '英国客户模板', default: 'GBP', mapping: '全部应收费项→GBP', status: '启用', operator: '郑雅雯', updatedAt: '2026-07-28 11:05' },
  ],
  exports: [
    { no: 'EXP-20260802-0018', billType: '应收账单', purpose: '导出给客户', format: '不适用', scope: '任务编号筛选 / BMS-20260707-0012', fileType: '压缩包', bills: 8, processed: 8, success: 7, failed: 1, status: '部分成功', progress: 100, creator: '谭清辉', createdAt: '2026-08-02 10:02', finishedAt: '2026-08-02 10:05', expiresAt: '2026-08-03 10:05' },
    { no: 'EXP-20260802-0017', billType: '应收账单', purpose: '导出给内部', format: '合并式', scope: '列表勾选', fileType: '表格文件', bills: 12, processed: 12, success: 12, failed: 0, status: '导出成功', progress: 100, creator: '郑雅雯', createdAt: '2026-08-02 09:46', finishedAt: '2026-08-02 09:48', expiresAt: '2026-08-03 09:48' },
    { no: 'EXP-20260802-0016', billType: '返款账单', purpose: '导出给客户', format: '不适用', scope: '配置编号筛选 / RFB-SCHEME-20260701-02-v5', fileType: '表格文件', bills: 10, processed: 6, success: 6, failed: 0, status: '导出中', progress: 62, creator: '谭清辉', createdAt: '2026-08-02 09:31', finishedAt: '--', expiresAt: '--' },
    { no: 'EXP-20260802-0015', billType: '返款账单', purpose: '导出给客户', format: '不适用', scope: '任务编号筛选 / RFB-TASK-20260721-0006', fileType: '压缩包', bills: 5, processed: 0, success: 0, failed: 0, status: '待执行', progress: 0, creator: '谭清辉', createdAt: '2026-08-02 09:26', finishedAt: '--', expiresAt: '--' },
    { no: 'EXP-20260801-0041', billType: '应收账单', purpose: '导出给内部', format: '拆分式', scope: '列表勾选', fileType: '表格文件', bills: 6, processed: 6, success: 0, failed: 6, status: '导出失败', progress: 100, creator: '郑雅雯', createdAt: '2026-08-01 17:10', finishedAt: '2026-08-01 17:12', expiresAt: '--' },
  ],
  exportItems: [
    { taskNo: 'EXP-20260802-0018', billNo: 'ARB-OG0370-20260707-81FF', result: '成功', output: '客户账单.xlsx', reason: '--' },
    { taskNo: 'EXP-20260802-0018', billNo: 'ARB-OG0271-20260731-81FF', result: '失败', output: '--', reason: '客户邮箱及导出通知信息不完整' },
    { taskNo: 'EXP-20260801-0041', billNo: 'ARB-OG0360-20260601-81FF', result: '失败', output: '--', reason: '费项明细文件生成失败' },
  ],
  audits: [
    { module: '账单配置', objectType: '客户账单配置', objectNo: 'BC-OG4155-AR@V13', action: '启用新版本', operator: '谭清辉', time: '2026-08-02 09:28:16', reason: '英国线路改为月结', result: '成功', relation: 'OG4155', impactCny: 0, impactUsd: 0, objectCount: 1, before: '{"version":"V12","status":"生效"}', after: '{"version":"V13","status":"生效"}' },
    { module: '应收账单', objectType: '应收账单', objectNo: 'ARB-OG9012-20260725-41b7', action: '审核通过', operator: '郑雅雯', time: '2026-08-02 09:14:08', reason: '金额与汇率核对完成', result: '成功', relation: 'OG9012', impactCny: 18.42, impactUsd: -2.56, objectCount: 1, before: '{"status":"待审核"}', after: '{"status":"待结清","notification":"已通知"}' },
    { module: '调账中心', objectType: '调账记录', objectNo: 'ADJ-c412-9071', action: '审核通过', operator: '陈嘉明', time: '2026-08-02 08:52:41', reason: '服务费率更正凭证有效', result: '成功', relation: 'RFB-OG9012-20260721-a11f', impactCny: 22.99, impactUsd: 3.2, objectCount: 2, before: '{"status":"待审核"}', after: '{"status":"审核通过"}' },
    { module: '汇率配置', objectType: '基准汇率', objectNo: 'CAD-CNY@20260802', action: '确认生效', operator: '谭清辉', time: '2026-08-02 08:40:03', reason: '汇率值超出允许范围', result: '阻断', relation: 'CAD/CNY', impactCny: 0, impactUsd: 0, objectCount: 1, before: '{}', after: '{}' },
  ],
  comparisons: [
    { order: 'SO-260731-004188', shippedAt: '2026-08-02 09:48', closedAt: '2026-08-03 11:20', finance: true, system: true, financeFees: 4, systemFees: 4, financeAmounts: { 运费: 126.36, 派送费: 18, 超材费: 12, 仓租费: 8 }, systemAmounts: { 运费: 126.36, 派送费: 18, 超材费: 12, 报关费: 20 }, currency: 'CNY' },
    { order: 'SO-260731-004221', shippedAt: '2026-08-02 09:42', closedAt: '2026-08-03 10:55', finance: true, system: false, financeFees: 3, systemFees: 0, financeAmounts: { 运费: 421.8, 派送费: 0, 仓租费: 15 }, systemAmounts: {}, currency: 'USD' },
    { order: 'SO-260730-003952', shippedAt: '2026-08-01 17:20', closedAt: '2026-08-02 14:06', finance: true, system: true, financeFees: 3, systemFees: 4, financeAmounts: { 运费: 198.5, 派送费: 18.5, 超材费: 9 }, systemAmounts: { 运费: 198.5, 派送费: 0, 超材费: 9, 报关费: 22 }, currency: 'CAD' },
    { order: 'SO-260730-003811', shippedAt: '2026-08-01 16:51', closedAt: '2026-08-02 09:35', finance: false, system: true, financeFees: 0, systemFees: 3, financeAmounts: {}, systemAmounts: { 运费: 316, 派送费: 0, 报关费: 18 }, currency: 'AUD' },
  ],
  migrationPreviewStats: [
    { label: '来源订单', value: 2, tone: 'blue' },
    { label: '源扩展', value: 2, tone: 'slate' },
    { label: '源附加费', value: 6, tone: 'amber' },
    { label: '源包裹费', value: 8, tone: 'violet' },
    { label: '源费用明细', value: 36, tone: 'blue' },
    { label: '源理赔单', value: 1, tone: 'green' },
  ],
  migrationResultStats: [
    { label: '已写入订单', value: '2', tone: 'green' },
    { label: '写入扩展 / 附加费', value: '2 / 6', tone: 'green' },
    { label: '写入包裹费 / 理赔', value: '8 / 1', tone: 'green' },
    { label: '费用明细成功 / 失败', value: '35 / 1', tone: 'red' },
  ],
  migrationResults: [
    { object: '费用明细 FEE-260731-0098', result: '失败', reason: '目标费项编码不存在' },
    { object: '订单 SO-260731-004188-MIG', result: '成功', reason: '--' },
  ],
}
