export const WRITEOFF_STATES = ['新建', '已打回', '已提交']
export const WRITEOFF_COLUMNS = [['writeoffNo','核销号',180],['status','状态',110],['settlementParty','结算单位',180],['originalAmount','核销金额(原币)'],['currency','原币币种',100],['localAmount','核销金额(本位币)'],['difference','长短款',120],['actualDate','收付款日期',130],['bankName','银行名称'],['accountName','账户名称'],['accountNo','银行账号'],['actualCurrency','收付款币种',130],['operator','核销人'],['date','核销日期',130],['syncStatus','金蝶同步状态'],['syncMessage','金蝶同步说明',220]]
export const WRITEOFF_LINES = [['applicationNo','申请批次号',180],['orderNo','订单号',180],['businessDate','业务日期',130],['requestedAmount','申请金额(原币)'],['availableAmount','可核销金额(原币)'],['currency','原币币种',100],['businessRate','业务汇率'],['writeoffAmount','本次核销金额(原币)',185],['localAmount','本次核销金额(本位币)',185],['requestedBank','申请收款银行'],['requestedAccount','申请收款账户'],['requestedAccountNo','申请收款银行账号']]
export const WRITEOFF_PENDING = [...WRITEOFF_LINES.slice(0,6),['settlementParty','结算单位',180],['taxRate','税率(%)',100],...WRITEOFF_LINES.slice(9),['billNo','提单号'],['applicant','申请人'],['applicationDate','申请日期',130]]
export function writeoffSources(state, kind) {
  return state.financeApplications.rows.filter(row => !row.deleted && !row.demoOnly && row.kind === kind && row.status === '财务审批通过').flatMap(app => app.lines.map(line => ({
    ...line, id: `${app.id}:${line.id}`, applicationId: app.id, applicationNo: app.applicationNo, applicationDate: app.createdAt.slice(0,10), applicant: app.createdBy,
    requestedAmount: Number(line.requestedAmount), availableAmount: null, businessRate: line.exchangeRate ?? line.businessRate ?? null,
    requestedBank: app.account?.bankName, requestedAccount: app.account?.accountName, requestedAccountNo: app.account?.accountNo,
    companyId: app.companyId,
  }))).sort((a,b) => a.applicationDate.localeCompare(b.applicationDate) || String(a.orderNo||'').localeCompare(String(b.orderNo||'')))
}
export function writeoffPreview(lines) {
  if (!lines.length) throw new Error('请选择申请明细')
  if (new Set(lines.map(row=>row.partyId)).size !== 1 || new Set(lines.map(row=>row.currency)).size !== 1) throw new Error('只能选择相同结算单位、相同币种的明细')
  if (new Set(lines.map(row=>row.companyId)).size !== 1) throw new Error('跨公司归属待确认（107）')
  return { lines: JSON.parse(JSON.stringify(lines)).map(row=>({...row,writeoffAmount:''})), party: lines[0].settlementParty, currency: lines[0].currency, companyId:lines[0].companyId, agency:false, agencyCompany:'', accountId:'', actualDate:'', actualAmount:'' }
}
export function writeoffCalculation(draft, rates, accounts) {
  const account = accounts.find(row=>row.id===draft.accountId), currency = account?.currency
  const candidates = rates.filter(row=>row.status==='已生效'&&row.sourceCurrency===currency&&row.targetCurrency==='CNY'&&row.period===draft.actualDate.slice(0,7))
  const spotRate = currency==='CNY'?1:candidates.length===1?Number(candidates[0].rate):null
  const valid = value=>value!==''&&value!=null&&Number.isFinite(Number(value))
  const actualLocal = valid(draft.actualAmount)&&spotRate!=null?Number(draft.actualAmount)*spotRate:null
  const localAmount = draft.lines.every(row=>valid(row.writeoffAmount)&&valid(row.businessRate))?draft.lines.reduce((sum,row)=>sum+Number(row.writeoffAmount)*Number(row.businessRate),0):null
  return { account, spotRate, actualLocal, localAmount, difference:actualLocal!=null&&localAmount!=null?actualLocal-localAmount:null, purchase:currency&&currency!==draft.currency?{bank:'虚拟银行',account:'虚拟账号',number:'888888',currency:'人民币',amount:actualLocal}:null }
}
export function createWriteoffSeed() {
  return { writeoffs: { rows: ['receipt','payment'].flatMap(kind=>WRITEOFF_STATES.map((status,index)=>({
    id:`DEMO-${kind}-WO-${index}`,writeoffNo:`${kind==='receipt'?'AR':'AP'}2609089000${index+1}`,kind,status,demoOnly:true,companyId:'FIN-DEMO-A',
    settlementParty:kind==='receipt'?'启航跨境贸易':'东方航空',currency:'CNY',originalAmount:600,localAmount:600,difference:0,
    actualDate:'2026-09-08',actualAmount:600,spotRate:1,actualLocal:600,bankName:'演示银行甲',accountName:'合成公司甲基本户',accountNo:'00000010001',actualCurrency:'CNY',
    operator:'财务会计演示员',date:'2026-09-08',agency:false,company:'合成公司甲',syncStatus:'未发送',syncMessage:'演示样本，无外部同步',
    lines:[{id:`DEMO-${kind}-WO-L${index}`,applicationNo:'DEMO-RA26090890001',orderNo:'DEMO-ORDER-26',businessDate:'2026-09-05',requestedAmount:1000,availableAmount:null,currency:'CNY',businessRate:1,writeoffAmount:600,localAmount:600,requestedBank:'演示银行甲',requestedAccount:'合成公司甲基本户',requestedAccountNo:'00000010001'}],
  }))) } }
}
