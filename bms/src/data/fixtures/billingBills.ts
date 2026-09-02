export type BillingBillConfigSource = 'CONFIG' | 'SYSTEM'
export type BillingBillSchemeType = '默认方案' | '分支方案' | '不适用'

export interface BillingBillTraceability {
  batchNo: string
  taskNo: string
  configSource: BillingBillConfigSource
  configNo: string
  configVersion: string
  customerReferenceNo: string
  schemeKey: string
  schemeName: string
  schemeType: BillingBillSchemeType
}

const configTrace = (input: Omit<BillingBillTraceability, 'configSource'>): BillingBillTraceability => ({
  configSource: 'CONFIG',
  ...input,
})

export const billingBillSeedVersion = 2026090101

export const billingBillFixtures = [
  {
    type: 'AR', billNo: 'ARB-OG0271-20260801-550c', status: '待审核', closeStatus: '未收口', issued: false,
    customer: '渣渣辉3号', customerNo: 'OG0271', memberCode: 'M-700127', shop: '星际货运(中转)', shopCode:'STORE-XJZY', group: '台湾大客户组', numberingRule:'STORE_SNAPSHOT_MD5_V1',
    ...configTrace({ batchNo: 'BMSB-20260816-00012', taskNo: 'BMS-20260816-00125', configNo: 'ARB-20260801-01', configVersion: 'V2', customerReferenceNo: 'AR-REF-OG0271-0002', schemeKey: 'BRANCH-02', schemeName: '分支方案 2', schemeType: '分支方案' }),
    country: '台湾', sector: '台湾中转业务', periodType: '半月', periodStart: '2026/08/01', periodEnd: '2026/08/15',
    sentAt: '-', dueAt: '2026/08/22', overdueDays: 0, notice: '-', currency: 'TWD', amount: 186430.6, paid: 0,
  },
  {
    type: 'AR', billNo: 'ARB-OG9012-20260801-41b7', status: '待审核', closeStatus: '未收口', issued: false,
    customer: 'TopKing Supply', customerNo: 'OG9012', memberCode: 'M-672019', shop: '义乌集运店', group: '华东同行组',
    ...configTrace({ batchNo: '-', taskNo: 'BMS-20260802-00080', configNo: 'BC-OG9012-D', configVersion: 'V8', customerReferenceNo: 'AR-REF-OG9012-0008', schemeKey: 'DEFAULT', schemeName: '默认方案', schemeType: '默认方案' }),
    country: '美国', sector: '跨境电商', periodType: '周', periodStart: '2026/08/01', periodEnd: '2026/08/07',
    sentAt: '-', dueAt: '2026/08/14', overdueDays: 0, notice: '-', currency: 'CNY', amount: 321450.38, paid: 0,
  },
  {
    type: 'AR', billNo: 'ARB-OG9012-20260801-8c2a', status: '待审核', closeStatus: '未收口', issued: false,
    customer: 'TopKing Supply', customerNo: 'OG9012', memberCode: 'M-672019', shop: '义乌集运店', group: '华东同行组',
    ...configTrace({ batchNo: '-', taskNo: 'BMS-20260802-00080', configNo: 'BC-OG9012-D', configVersion: 'V8', customerReferenceNo: 'AR-REF-OG9012-0008', schemeKey: 'DEFAULT', schemeName: '默认方案', schemeType: '默认方案' }),
    country: '英国', sector: '同行业务', periodType: '周', periodStart: '2026/08/01', periodEnd: '2026/08/07',
    sentAt: '-', dueAt: '2026/08/14', overdueDays: 0, notice: '-', currency: 'CNY', amount: 161676.2, paid: 0,
  },
  {
    type: 'AR', billNo: 'ARB-OG2388-20260727-a922', status: '待审核', closeStatus: '未收口', issued: false,
    customer: 'Hualei Express', customerNo: 'OG2388', memberCode: 'M-238801', shop: '广州同行店', group: '华南同行组',
    ...configTrace({ batchNo: '-', taskNo: 'BMS-20260727-00061', configNo: 'BC-OG2388-WEEK', configVersion: 'V5', customerReferenceNo: 'AR-REF-OG2388-0005', schemeKey: 'DEFAULT', schemeName: '默认方案', schemeType: '默认方案' }),
    country: '美国', sector: '同行业务', periodType: '周', periodStart: '2026/07/27', periodEnd: '2026/08/02',
    sentAt: '-', dueAt: '2026/08/09', overdueDays: 0, notice: '-', currency: 'CNY', amount: 128400, paid: 0,
  },
  {
    type: 'AR', billNo: 'ARB-OG2388-20260727-a922-S1', status: '待审核', closeStatus: '未收口', issued: false,
    customer: 'Hualei Express', customerNo: 'OG2388', memberCode: 'M-238801', shop: '广州同行店', group: '华南同行组',
    ...configTrace({ batchNo: '-', taskNo: 'BMS-20260802-00072', configNo: 'BC-OG2388-WEEK', configVersion: 'V6', customerReferenceNo: 'AR-REF-OG2388-0006', schemeKey: 'DEFAULT', schemeName: '默认方案', schemeType: '默认方案' }),
    country: '美国', sector: '同行业务', periodType: '周', periodStart: '2026/07/27', periodEnd: '2026/08/02',
    sentAt: '-', dueAt: '2026/08/09', overdueDays: 0, notice: '-', currency: 'CNY', amount: 32680.2, paid: 0,
  },
  {
    type: 'AR', billNo: 'ARB-OG4155-20260701-old', status: '已作废', closeStatus: '已收口', issued: false,
    customer: 'OceanGate Logistics', customerNo: 'OG4155', memberCode: 'M-700127', shop: '深圳集运店', group: '美国电商组',
    ...configTrace({ batchNo: '-', taskNo: 'BMS-20260731-00059', configNo: 'BC-OG4155-M-UK', configVersion: 'V12', customerReferenceNo: 'AR-REF-OG4155-0012', schemeKey: 'BRANCH-UK', schemeName: '英国业务方案', schemeType: '分支方案' }),
    country: '英国', sector: '跨境电商', periodType: '月', periodStart: '2026/07/01', periodEnd: '2026/07/31',
    sentAt: '-', dueAt: '-', overdueDays: 0, notice: '-', currency: 'CNY', amount: 351280.5, paid: 0,
    voidReason: '替换生成后原账单作废',
  },
  {
    type: 'AR', billNo: 'ARB-OG4155-20260701-new-a', status: '待审核', closeStatus: '未收口', issued: false,
    customer: 'OceanGate Logistics', customerNo: 'OG4155', memberCode: 'M-700127', shop: '深圳集运店', group: '美国电商组',
    ...configTrace({ batchNo: '-', taskNo: 'BMS-20260801-00068', configNo: 'BC-OG4155-M-UK', configVersion: 'V13', customerReferenceNo: 'AR-REF-OG4155-0013', schemeKey: 'BRANCH-UK', schemeName: '英国业务方案', schemeType: '分支方案' }),
    country: '英国', sector: '跨境电商', periodType: '月', periodStart: '2026/07/01', periodEnd: '2026/07/31',
    sentAt: '-', dueAt: '2026/08/07', overdueDays: 0, notice: '-', currency: 'CNY', amount: 210000, paid: 0,
  },
  {
    type: 'AR', billNo: 'ARB-OG4155-20260701-new-b', status: '待审核', closeStatus: '未收口', issued: false,
    customer: 'OceanGate Logistics', customerNo: 'OG4155', memberCode: 'M-700127', shop: '深圳集运店', group: '美国电商组',
    ...configTrace({ batchNo: '-', taskNo: 'BMS-20260801-00068', configNo: 'BC-OG4155-M-UK', configVersion: 'V13', customerReferenceNo: 'AR-REF-OG4155-0013', schemeKey: 'BRANCH-UK', schemeName: '英国业务方案', schemeType: '分支方案' }),
    country: '英国', sector: '同行业务', periodType: '月', periodStart: '2026/07/01', periodEnd: '2026/07/31',
    sentAt: '-', dueAt: '2026/08/07', overdueDays: 0, notice: '-', currency: 'CNY', amount: 140000, paid: 0,
  },
  {
    type: 'AR', billNo: 'ARB-OG0271-20260731-81FF', status: '待审核', closeStatus: '未收口', issued: false,
    customer: '渣渣辉3号', customerNo: 'OG0271', memberCode: '700127', shop: '星际货运(中转)', group: '华东大客户组',
    ...configTrace({ batchNo: '-', taskNo: 'BMS-20260731-0001', configNo: 'ARB-SCHEME-20260701-01', configVersion: 'V1', customerReferenceNo: 'AR-REF-OG0271-0001', schemeKey: 'DEFAULT', schemeName: '默认方案', schemeType: '默认方案' }),
    country: '台湾', sector: '默认业务板块', periodType: '日', periodStart: '2026/07/31', periodEnd: '2026/07/31',
    sentAt: '-', dueAt: '2026/08/03', overdueDays: 0, notice: '-', currency: 'CNY', amount: 68, paid: 0,
    secondCurrency: 'TWD', secondAmount: -721,
  },
  {
    type: 'AR', billNo: 'ARB-OG0370-20260707-81FF', status: '待审核', closeStatus: '已收口', issued: false,
    customer: 'JYK-深圳立杰海快', customerNo: 'OG0370', memberCode: '20260701-009', shop: '星际中转2', group: '台湾大客户组',
    ...configTrace({ batchNo: '-', taskNo: 'BMS-20260707-0012', configNo: 'ARB-SCHEME-20260701-02', configVersion: 'V11', customerReferenceNo: 'AR-REF-OG0370-0011', schemeKey: 'DEFAULT', schemeName: '默认方案', schemeType: '默认方案' }),
    country: '台湾', sector: '默认业务板块', periodType: '7天', periodStart: '2026/07/07', periodEnd: '2026/07/13',
    sentAt: '-', dueAt: '2026/07/20', overdueDays: 0, notice: '-', currency: 'CNY', amount: 3096.09, paid: 0,
  },
  {
    type: 'AR', billNo: 'ARB-OG0360-20260601-81FF', status: '待结清', closeStatus: '已收口', issued: true,
    customer: 'liujiaya1', customerNo: 'OG0360', shop: '测试专用', group: '华东大客户组',
    ...configTrace({ batchNo: '-', taskNo: 'BMS-20260630-0005', configNo: 'ARB-SCHEME-20260601-03', configVersion: 'V3', customerReferenceNo: 'AR-REF-OG0360-0003', schemeKey: 'DEFAULT', schemeName: '默认方案', schemeType: '默认方案' }),
    country: '-', sector: '-', periodType: '月', periodStart: '2026/06/01', periodEnd: '2026/06/30',
    sentAt: '2026/07/03', dueAt: '2026/06/30', overdueDays: 33, notice: '已通知', currency: 'CNY', amount: 11760.5,
    paid: 8000, secondCurrency: 'TWD', secondAmount: 23712,
  },
  {
    type: 'AR', billNo: 'ARB-OG0347-20260401-9A35', status: '已结清', closeStatus: '已收口', issued: true,
    customer: '测试1', customerNo: 'OG0347', shop: '星际中转2', group: '台湾大客户组',
    ...configTrace({ batchNo: 'BMSB-20260401-00002', taskNo: 'BMS-20260401-0002', configNo: 'ARB-SCHEME-20260401-01', configVersion: 'V2', customerReferenceNo: 'AR-REF-OG0347-0002', schemeKey: 'DEFAULT', schemeName: '默认方案', schemeType: '默认方案' }),
    country: '中國臺灣', sector: '默认业务板块', periodType: '周', periodStart: '2026/04/01', periodEnd: '2026/04/05',
    sentAt: '2026/04/08', dueAt: '2026/04/12', overdueDays: 0, notice: '已通知', currency: 'TWD', amount: 10678, paid: 10678,
  },
  {
    type: 'AR', billNo: 'ARB-OG0347-20260325-VOID', status: '已作废', closeStatus: '已收口', issued: false,
    customer: '测试1', customerNo: 'OG0347', shop: '星际中转2', group: '台湾大客户组',
    ...configTrace({ batchNo: 'BMSB-20260401-00002', taskNo: 'BMS-20260401-0002', configNo: 'ARB-SCHEME-20260401-01', configVersion: 'V2', customerReferenceNo: 'AR-REF-OG0347-0002', schemeKey: 'DEFAULT', schemeName: '默认方案', schemeType: '默认方案' }),
    country: '中國臺灣', sector: '默认业务板块', periodType: '周', periodStart: '2026/03/25', periodEnd: '2026/03/31',
    sentAt: '-', dueAt: '-', overdueDays: 0, notice: '-', currency: 'TWD', amount: 9860, paid: 0,
    voidReason: '替换生成后原账单作废',
  },
  {
    type: 'RF', billNo: 'PCB-OG0347-20260526-0a19', status: '待结清', closeStatus: '已收口', issued: true,
    customer: '测试1', customerNo: 'OG0347', memberCode: '20260228-002', shop: '星际中转2', shopCode:'STORE-XJZZ2', group: '台湾大客户组', numberingRule:'STORE_SNAPSHOT_MD5_V1',
    ...configTrace({ batchNo: '-', taskNo: 'RFB-TASK-20260526-0003', configNo: 'RFB-SCHEME-20260526-01', configVersion: 'V2', customerReferenceNo: 'RF-REF-OG0347-0002', schemeKey: 'REFUND', schemeName: '返款配置', schemeType: '不适用' }),
    country: 'TW', periodType: '半周', periodStart: '2026/05/26', periodEnd: '2026/05/29', truncatedPeriod: '否',
    dataCutoffAt: '2026/05/29 23:59:59', sentAt: '2026/05/30', notice: '已通知', refundMode: '回款返款',
    sourceCurrency: 'TWD', settlementCurrency: 'TWD', baseCurrency: 'CNY', currency: 'TWD', original: 9780,
    codSurcharge: 0, payableRefund: 9780, specifiedDeduction: 0, deduction: 0, provisionalRefund: 9780, refundRate: 1,
    actualRefund: 9780, amount: 9780, paid: 2101, baseRate: 4.2, baseRefundable: 41076, baseReturned: 8824.2,
    exchangeGainLoss: 0,
  },
  {
    type: 'RF', billNo: 'PCB-OG0370-20260721-0a19', status: '待审核', closeStatus: '未收口', issued: false,
    customer: 'JYK-深圳立杰海快', customerNo: 'OG0370', memberCode: '20260701-009', shop: '星际中转2', shopCode:'STORE-XJZZ2', group: '台湾大客户组', numberingRule:'STORE_SNAPSHOT_MD5_V1',
    ...configTrace({ batchNo: '-', taskNo: 'RFB-TASK-20260721-0006', configNo: 'RFB-SCHEME-20260701-02', configVersion: 'V5', customerReferenceNo: 'RF-REF-OG0370-0005', schemeKey: 'REFUND', schemeName: '返款配置', schemeType: '不适用' }),
    country: 'TW', periodType: '周', periodStart: '2026/07/21', periodEnd: '2026/07/27', truncatedPeriod: '否',
    dataCutoffAt: '2026/07/27 23:59:59', sentAt: '-', notice: '-', refundMode: '签收返款', sourceCurrency: 'CNY',
    settlementCurrency: 'CNY', baseCurrency: 'CNY', currency: 'CNY', original: 91640, codSurcharge: 0, payableRefund: 91640,
    specifiedDeduction: 3020, deduction: 3020, provisionalRefund: 88620, refundRate: 1, actualRefund: 88620,
    amount: 88620, paid: 0, baseRate: 1, exchangeGainLoss: 0,
  },
  {
    type: 'RF', billNo: 'PCB-OG0271-20260714-VOID-5aaa', status: '已作废', closeStatus: '已收口', issued: false,
    customer: '渣渣辉3号', customerNo: 'OG0271', memberCode: '700127', shop: '星际货运(中转)', shopCode:'STORE-XJZY', group: '华东大客户组', numberingRule:'STORE_SNAPSHOT_MD5_V1',
    ...configTrace({ batchNo: '-', taskNo: 'RFB-TASK-20260714-0002', configNo: 'RFB-SCHEME-20260701-01', configVersion: 'V4', customerReferenceNo: 'RF-REF-OG0271-0004', schemeKey: 'REFUND', schemeName: '返款配置', schemeType: '不适用' }),
    country: 'TW', periodType: '周', periodStart: '2026/07/14', periodEnd: '2026/07/20', sentAt: '-', notice: '-',
    refundMode: '回款返款', currency: 'TWD', original: 7380, deduction: 220, amount: 7160, paid: 0,
    voidReason: '替换生成后原账单作废',
  },
] satisfies Array<BillingBillTraceability & Record<string, unknown>>
