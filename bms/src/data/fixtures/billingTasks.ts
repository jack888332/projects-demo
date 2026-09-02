export type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'
export type TaskType = 'FEE_POOL' | 'BILL_GENERATE' | 'BILL_RECALCULATE'
export type GenerationMode = '' | 'PENDING' | 'FIRST' | 'SUPPLEMENT' | 'REPLACE'
export type BillType = '' | 'AR' | 'RF'
export type ConfigSource = 'CONFIG' | 'SYSTEM'
export type SchemeType = '默认方案' | '分支方案' | '不适用'

export interface BillingTaskFixture {
  id: number
  taskNo: string
  status: TaskStatus
  taskType: TaskType
  generationMode: GenerationMode
  triggerType: 'SCHEDULED' | 'MANUAL'
  batchNo: string
  batchCustomerCount: number
  batchTaskCount: number
  batchSkippedCount: number
  batchSkipSummary: string
  billType: BillType
  configSource: ConfigSource
  configNo: string
  configVersion: string
  schemeKey: string
  schemeName: string
  schemeType: SchemeType
  customerReferenceNo: string
  customerName: string
  customerNo: string
  memberCode: string
  shop: string
  customerGroup: string
  sourceShopSnapshots: string[]
  periodStart: string
  periodEnd: string
  period: string
  dataCutoff: string
  createdAt: string
  startedAt: string
  finishedAt: string
  duration: string
  operator: string
  failedStage: string
  error: string
  advice: string
  sourceCount: number
  pooledFeeCount: number
  billCount: number
  netChange: number
  resultConclusion: string
  resultVersion: string
  originalBills: string[]
  newBills: string[]
  scopeKey: string
  lockKey: string
  sourceSql: string
  recalculateScope: string
  closeResult: string
  deletedAt: string
  deletedBy: string
}

const baseTask: Omit<BillingTaskFixture, 'id' | 'taskNo' | 'periodStart' | 'periodEnd' | 'period'> = {
  status: 'SUCCESS',
  taskType: 'BILL_GENERATE',
  generationMode: '',
  triggerType: 'MANUAL',
  batchNo: '-',
  batchCustomerCount: 0,
  batchTaskCount: 0,
  batchSkippedCount: 0,
  batchSkipSummary: '',
  billType: '',
  configSource: 'SYSTEM',
  configNo: '-',
  configVersion: '-',
  schemeKey: '-',
  schemeName: '不适用',
  schemeType: '不适用',
  customerReferenceNo: '-',
  customerName: '-',
  customerNo: '-',
  memberCode: '-',
  shop: '-',
  customerGroup: '-',
  sourceShopSnapshots: [],
  dataCutoff: '-',
  createdAt: '-',
  startedAt: '-',
  finishedAt: '-',
  duration: '0秒',
  operator: 'system',
  failedStage: '',
  error: '',
  advice: '',
  sourceCount: 0,
  pooledFeeCount: 0,
  billCount: 0,
  netChange: 0,
  resultConclusion: '--',
  resultVersion: '--',
  originalBills: [],
  newBills: [],
  scopeKey: '',
  lockKey: '',
  sourceSql: '',
  recalculateScope: '',
  closeResult: '不涉及',
  deletedAt: '',
  deletedBy: '',
}

function task(input: Pick<BillingTaskFixture, 'id' | 'taskNo' | 'periodStart' | 'periodEnd'> & Partial<BillingTaskFixture>): BillingTaskFixture {
  const merged = { ...baseTask, ...input }
  return {
    ...merged,
    sourceShopSnapshots:input.sourceShopSnapshots || (merged.status === 'SUCCESS' && merged.shop !== '-' ? [merged.shop] : []),
    period: `${input.periodStart} 至 ${input.periodEnd}`,
  }
}

export const billingTaskSeedVersion = 2026090101

export const billingTaskFixtures: BillingTaskFixture[] = [
  task({
    id: 8, taskNo: 'BMS-20260816-00125', batchNo: 'BMSB-20260816-00012', batchCustomerCount: 2,
    batchTaskCount: 2, batchSkippedCount: 4, batchSkipSummary: '4 个方案范围尚无已结束账期，未创建任务',
    generationMode: 'FIRST', billType: 'AR', configSource: 'CONFIG', configNo: 'ARB-20260801-01',
    configVersion: 'V2', schemeKey: 'BRANCH-02', schemeName: '分支方案 2', schemeType: '分支方案',
    customerReferenceNo: 'AR-REF-OG0271-0002', customerName: '渣渣辉3号', customerNo: 'OG0271',
    memberCode: 'M-700127', shop: '星际货运(中转)', customerGroup: '台湾大客户组',
    sourceShopSnapshots: ['STORE-XJZY / 星际货运(中转)'],
    periodStart: '2026-08-01', periodEnd: '2026-08-15', dataCutoff: '2026-08-16 09:30:00',
    createdAt: '2026-08-16 09:30:01', startedAt: '2026-08-16 09:30:08', finishedAt: '2026-08-16 09:31:39',
    duration: '1分31秒', operator: '谭清辉', sourceCount: 968, pooledFeeCount: 2914, billCount: 1,
    netChange: 186430.6, resultConclusion: '首次生成', resultVersion: 'RV-20260816-00091',
    newBills: ['ARB-OG0271-20260801-550c'],
    scopeKey: 'OG0271|AR|BRANCH-02|2026-08-01/2026-08-15|ARB-20260801-01@V2',
    lockKey: 'OG0271|AR|BRANCH-02|2026-08-01/2026-08-15|BILL_GENERATE',
    sourceSql: 'SELECT ... FROM sale_order_fee_detail WHERE customer_no = :customerNo AND fee_created_at <= :dataCutoff;',
  }),
  task({
    id: 9, taskNo: 'BMS-20260816-00126', status: 'FAILED', batchNo: 'BMSB-20260816-00012', batchCustomerCount: 2,
    batchTaskCount: 2, batchSkippedCount: 4, batchSkipSummary: '4 个方案范围尚无已结束账期，未创建任务',
    generationMode: 'FIRST', billType: 'AR', configSource: 'CONFIG', configNo: 'ARB-20260801-01',
    configVersion: 'V2', schemeKey: 'BRANCH-02', schemeName: '分支方案 2', schemeType: '分支方案',
    customerReferenceNo: 'AR-REF-OG0347-0002', customerName: '测试1', customerNo: 'OG0347',
    memberCode: 'M-204801', shop: '台湾集运店', customerGroup: '台湾大客户组',
    periodStart: '2026-08-01', periodEnd: '2026-08-15', dataCutoff: '2026-08-16 09:30:00',
    createdAt: '2026-08-16 09:30:01', startedAt: '2026-08-16 09:30:09', finishedAt: '2026-08-16 09:30:52',
    duration: '43秒', operator: '谭清辉', failedStage: 'BILL_CALCULATE', sourceCount: 412,
    pooledFeeCount: 1386, resultConclusion: '生成失败', resultVersion: '--',
    scopeKey: 'OG0347|AR|BRANCH-02|2026-08-01/2026-08-15|ARB-20260801-01@V2',
    lockKey: 'OG0347|AR|BRANCH-02|2026-08-01/2026-08-15|BILL_GENERATE',
    error: '2 条费项缺少结算币种，无法完成账单计算。', advice: '补齐费项币种后按本任务快照重新执行。',
    sourceSql: 'SELECT ... FROM sale_order_fee_detail WHERE customer_no = :customerNo AND fee_created_at <= :dataCutoff;',
  }),
  task({
    id: 1, taskNo: 'BMS-20260802-00081', status: 'FAILED', generationMode: 'SUPPLEMENT', triggerType: 'SCHEDULED',
    billType: 'AR', configSource: 'CONFIG', configNo: 'BC-OG4155-M-US', configVersion: 'V12',
    schemeKey: 'BRANCH-US', schemeName: '美国业务方案', schemeType: '分支方案',
    customerReferenceNo: 'AR-REF-OG4155-0012', customerName: 'OceanGate Logistics', customerNo: 'OG4155',
    memberCode: 'M-700127', shop: '深圳集运店', customerGroup: '美国电商组', periodStart: '2026-08-01', periodEnd: '2026-08-01',
    dataCutoff: '2026-08-02 02:00:00', createdAt: '2026-08-02 02:00:01', startedAt: '2026-08-02 02:10:03',
    finishedAt: '2026-08-02 02:12:29', duration: '2分26秒', failedStage: 'BILL_CALCULATE', sourceCount: 1864,
    pooledFeeCount: 6421, originalBills: ['ARB-OG4155-20260801-f31a'],
    scopeKey: 'OG4155|AR|BRANCH-US|2026-08-01/2026-08-01|BC-OG4155-M-US@V12',
    lockKey: 'OG4155|AR|BRANCH-US|2026-08-01/2026-08-01|BILL_GENERATE',
    error: '11条费项缺少业务板块，无法完成拆单。', advice: '核对来源数据完整性，修复后按原任务快照重新执行。',
    sourceSql: 'SELECT ... FROM sale_order_fee_detail WHERE customer_no = :customerNo AND bms_reviewed = 0;',
  }),
  task({
    id: 2, taskNo: 'BMS-20260802-00080', generationMode: 'FIRST', billType: 'AR', configSource: 'CONFIG',
    configNo: 'BC-OG9012-D', configVersion: 'V8', schemeKey: 'DEFAULT', schemeName: '默认方案', schemeType: '默认方案',
    customerReferenceNo: 'AR-REF-OG9012-0008', customerName: 'TopKing Supply', customerNo: 'OG9012',
    memberCode: 'M-672019', shop: '义乌集运店', customerGroup: '华东同行组',
    periodStart: '2026-08-01', periodEnd: '2026-08-07', dataCutoff: '2026-08-02 09:30:00', createdAt: '2026-08-02 09:30:02',
    startedAt: '2026-08-02 09:31:11', finishedAt: '2026-08-02 09:34:45', duration: '3分34秒', operator: '谭清辉',
    sourceCount: 2540, pooledFeeCount: 8220, billCount: 2, netChange: 483126.58, resultConclusion: '首次生成',
    resultVersion: 'RV-20260802-00317', newBills: ['ARB-OG9012-20260801-41b7', 'ARB-OG9012-20260801-8c2a'],
    scopeKey: 'OG9012|AR|DEFAULT|2026-08-01/2026-08-07|BC-OG9012-D@V8',
    lockKey: 'OG9012|AR|DEFAULT|2026-08-01/2026-08-07|BILL_GENERATE',
    sourceSql: 'SELECT ... FROM sale_order_fee_detail WHERE customer_no = :customerNo;',
  }),
  task({
    id: 3, taskNo: 'BMS-20260802-00079', status: 'RUNNING', taskType: 'FEE_POOL', triggerType: 'SCHEDULED',
    configNo: 'BC-ADDITIONAL-INCR', configVersion: 'V5', periodStart: '2026-08-02', periodEnd: '2026-08-02',
    dataCutoff: '2026-08-02 10:00:00', createdAt: '2026-08-02 10:00:01', startedAt: '2026-08-02 10:00:06',
    duration: '8分12秒', sourceCount: 12640, pooledFeeCount: 11806, resultConclusion: '执行中', resultVersion: '--',
    scopeKey: 'SYSTEM|FEE_POOL|2026-08-02', lockKey: 'SYSTEM|FEE_POOL|2026-08-02',
    sourceSql: 'SELECT ... FROM sale_order_fee_detail WHERE fee_created_at <= :dataCutoff;',
  }),
  task({
    id: 4, taskNo: 'BMS-20260802-00077', status: 'PENDING', taskType: 'BILL_RECALCULATE', generationMode: 'PENDING',
    billType: 'AR', configSource: 'CONFIG', configNo: 'BC-OG2048-W', configVersion: 'V9', schemeKey: 'DEFAULT',
    schemeName: '默认方案', schemeType: '默认方案', customerReferenceNo: 'AR-REF-OG2048-0009',
    customerName: 'NorthWind Cargo', customerNo: 'OG2048', memberCode: 'M-204801', shop: '上海集运店', customerGroup: '美国电商组',
    periodStart: '2026-07-21', periodEnd: '2026-07-27', createdAt: '2026-08-02 09:48:18', originalBills: ['ARB-OG2048-20260721-9c01'],
    recalculateScope: '原账单全部费项', resultConclusion: '待执行', resultVersion: '--',
    scopeKey: 'OG2048|AR|DEFAULT|2026-07-21/2026-07-27|BC-OG2048-W@V9',
    lockKey: 'OG2048|AR|DEFAULT|2026-07-21/2026-07-27|BILL_RECALCULATE',
  }),
  task({
    id: 5, taskNo: 'BMS-20260802-00072', generationMode: 'SUPPLEMENT', billType: 'AR', configSource: 'CONFIG',
    configNo: 'BC-OG2388-WEEK', configVersion: 'V6', schemeKey: 'DEFAULT', schemeName: '默认方案', schemeType: '默认方案',
    customerReferenceNo: 'AR-REF-OG2388-0006', customerName: 'Hualei Express', customerNo: 'OG2388',
    memberCode: 'M-238801', shop: '广州同行店', customerGroup: '华南同行组', periodStart: '2026-07-27',
    periodEnd: '2026-08-02', dataCutoff: '2026-08-02 08:35:00', createdAt: '2026-08-02 08:35:03', duration: '51秒',
    sourceCount: 784, pooledFeeCount: 2680, billCount: 1, netChange: 32680.2, resultConclusion: '补充生成',
    resultVersion: 'RV-20260802-00296', originalBills: ['ARB-OG2388-20260727-a922'], newBills: ['ARB-OG2388-20260727-a922-S1'],
    scopeKey: 'OG2388|AR|DEFAULT|2026-07-27/2026-08-02|BC-OG2388-WEEK@V6',
    lockKey: 'OG2388|AR|DEFAULT|2026-07-27/2026-08-02|BILL_GENERATE',
  }),
  task({
    id: 6, taskNo: 'BMS-20260801-00068', generationMode: 'REPLACE', billType: 'AR', configSource: 'CONFIG',
    configNo: 'BC-OG4155-M-UK', configVersion: 'V13', schemeKey: 'BRANCH-UK', schemeName: '英国业务方案',
    schemeType: '分支方案', customerReferenceNo: 'AR-REF-OG4155-0013', customerName: 'OceanGate Logistics',
    customerNo: 'OG4155', memberCode: 'M-700127', shop: '深圳集运店', customerGroup: '美国电商组',
    periodStart: '2026-07-01', periodEnd: '2026-07-31', dataCutoff: '2026-08-01 18:19:00', createdAt: '2026-08-01 18:19:03',
    duration: '5分38秒', sourceCount: 3188, pooledFeeCount: 2931, billCount: 2, netChange: -1280.5, resultConclusion: '替换生成',
    resultVersion: 'RV-20260801-00981', originalBills: ['ARB-OG4155-20260701-old'], newBills: ['ARB-OG4155-20260701-new-a', 'ARB-OG4155-20260701-new-b'],
    scopeKey: 'OG4155|AR|BRANCH-UK|2026-07-01/2026-07-31|BC-OG4155-M-UK@V13',
    lockKey: 'OG4155|AR|BRANCH-UK|2026-07-01/2026-07-31|BILL_GENERATE',
  }),
  task({
    id: 7, taskNo: 'BMS-20260801-00064', status: 'FAILED', taskType: 'FEE_POOL', triggerType: 'SCHEDULED',
    configNo: 'BC-ADDITIONAL-INCR', configVersion: 'V5', periodStart: '2026-08-01', periodEnd: '2026-08-01',
    dataCutoff: '2026-08-01 23:00:00', createdAt: '2026-08-01 23:00:01', duration: '2分31秒', failedStage: 'SOURCE_SCAN',
    error: '来源库连接超时。', advice: '等待连接恢复后由调度服务重新拉取。', resultConclusion: '扫描失败', resultVersion: '--',
    scopeKey: 'SYSTEM|FEE_POOL|2026-08-01', lockKey: 'SYSTEM|FEE_POOL|2026-08-01',
    sourceSql: 'SELECT ... FROM sale_order_fee_detail WHERE fee_created_at <= :dataCutoff;',
  }),
]

export interface SourceScanFixture {
  dataset: string
  method: '全量' | '增量'
  range: string
  previousWatermark: string
  cutoff: string
  pulled: number
  matched: number
  result: '成功' | '失败'
  failure: string
}

const scan = (overrides: Partial<SourceScanFixture> = {}): SourceScanFixture => ({
  dataset: '订单费用明细', method: '增量', range: '(上次成功水位, 本次数据截止点]', previousWatermark: '2026-08-01 00:00:00',
  cutoff: '2026-08-02 00:00:00', pulled: 0, matched: 0, result: '成功', failure: '--', ...overrides,
})

export const sourceScansByTaskId: Record<number, SourceScanFixture[]> = {
  8: [scan({ method: '全量', range: '[2026-08-01, 2026-08-16 09:30:00]', pulled: 968, matched: 968, cutoff: '2026-08-16 09:30:00' })],
  9: [scan({ method: '全量', range: '[2026-08-01, 2026-08-16 09:30:00]', pulled: 412, matched: 410, cutoff: '2026-08-16 09:30:00' })],
  1: [scan({ pulled: 1864, matched: 1849, cutoff: '2026-08-02 02:00:00' })],
  2: [scan({ method: '全量', range: '[2026-08-01, 2026-08-02 09:30:00]', pulled: 2540, matched: 2540, cutoff: '2026-08-02 09:30:00' })],
  3: [scan({ dataset: '订单附加费', pulled: 12640, matched: 11806, cutoff: '2026-08-02 10:00:00' })],
  5: [scan({ dataset: '同行订单费用明细', pulled: 784, matched: 768, cutoff: '2026-08-02 08:35:00' })],
  6: [scan({ method: '全量', range: '[2026-07-01, 2026-08-01 18:19:00]', previousWatermark: '配置版本变化，原水位失效', pulled: 3188, matched: 2931, cutoff: '2026-08-01 18:19:00' })],
  7: [scan({ dataset: '订单附加费', pulled: 0, matched: 0, cutoff: '2026-08-01 23:00:00', result: '失败', failure: '来源库连接超时' })],
}
