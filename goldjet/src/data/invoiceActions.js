import {canReadModule,canWriteModule,workbenchSession} from './accessControl.js'
import {backfillCandidates,backfillError} from '../domain/invoices.js'
import {FINANCE_BASIC_ACCOUNTS} from '../domain/financeBasicAccess.js'
export function createInvoiceActions(state){return {
  backfillInvoice(id,invoiceId){
    if(!canReadModule('invoices')||!canWriteModule('invoices')||workbenchSession.personaId!=='financeAccountant')throw new Error('仅财务会计可补录')
    const row=state.invoicing.applications.find(row=>row.id===id&&!row.deleted)
    if(!row||row.需要开票!=='否'||row.状态!=='新建')throw new Error('当前申请不允许补录')
    if(row.companyId!==FINANCE_BASIC_ACCOUNTS[workbenchSession.personaId]?.companyId)throw new Error('不能补录其他组织的申请')
    const invoice=backfillCandidates(state,row).find(item=>item.id===invoiceId),error=backfillError(row,invoice)
    if(error)throw new Error(error)
    row.invoiceId=invoice.id;row.状态='已补录';invoice.开票申请号=row.开票申请号
    for(const field of ['buyer','seller','goods','收件人','复核人','开票备注'])row[field]=JSON.parse(JSON.stringify(invoice[field]))
    return row
  },
}}
