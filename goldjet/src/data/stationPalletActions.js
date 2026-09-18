import { canWriteModule } from './accessControl.js'
import { stationRights, stationOrderDraft, stationOrderErrors, stationDeleteReason } from '../domain/stationPallet.js'
import { stationQuoteDraft, stationQuoteErrors } from '../domain/stationQuotes.js'
import { stationPaperImagesError } from '../domain/stationPapers.js'

export function createStationPalletActions(state, getPersona) {
  const authorize = () => { if (!canWriteModule('stationPallet') || !stationRights(getPersona()).manage) throw new Error('仅获授权的货站打板人员可操作') }
  const now = () => new Date(Date.UTC(2026,8,8,14,30,++state.stationEventSequence)).toISOString().slice(0,19).replace('T',' ')
  function createStationOrder(payload) {
    authorize()
    const draft = stationOrderDraft(payload)
    for (const key of Object.keys(draft)) draft[key] = String(draft[key] ?? '').trim()
    const fields = stationOrderErrors(draft,state)
    if (Object.keys(fields).length) throw Object.assign(new Error(Object.values(fields)[0]),{fields})
    const id = `DEMO-SP-260908-${String(++state.stationSequence).padStart(3,'0')}`, time = now()
    const order = {...draft,id,orderNo:id,source:'local',status:'',cargoSource:'手工委托',createdAt:time,history:[{event:'创建打板订单',time,actor:'DEMO-stationPallet',remark:'初始状态待确认（GJ-PRD-120）'}]}
    state.stationOrders.unshift(order)
    return order
  }
  function deleteStationOrder(id) {
    authorize()
    const row = state.stationOrders.find(row => row.id === id), reason = stationDeleteReason(row)
    if (reason) throw new Error(reason)
    if (state.costs.some(cost => cost.stationOrderId === id)) throw new Error('订单已有费用，删除影响待确认，暂不删除')
    state.stationOrders = state.stationOrders.filter(row => row.id !== id)
  }
  function updateStationStatus() { authorize(); throw new Error('打板状态集合、顺序及完成计费口径待确认（GJ-PRD-120），未修改数据') }
  function receiveStationOrder(messageId) {
    authorize()
    const message=state.stationInboundMessages.find(row=>row.id===messageId)
    if(!message?.sourceOrderNo)throw new Error('上游打板单号缺失，不能推导订单编号（172）')
    if(state.stationOrders.some(row=>row.sourceOrderNo===message.sourceOrderNo))throw new Error('创建失败：已存在此打板单号的打板订单')
    const id=`DEMO-SP-260908-${String(++state.stationSequence).padStart(3,'0')}`,time=now()
    const row={...stationOrderDraft({financeOrganization:''}),...JSON.parse(JSON.stringify(message)),id,orderNo:message.sourceOrderNo,source:'upstream',status:'',cargoSource:'本地模拟上游消息',createdAt:time,history:[{event:'接收上游打板订单',time,actor:'本地消息模拟',remark:'已保存显式消息字段；初始状态待确认（120）'}]}
    state.stationOrders.unshift(row);return row
  }
  function saveStationQuote(payload,id='') {
    authorize()
    const existing=id?state.stationQuotes.find(row=>row.id===id):null
    if(id&&!existing)throw new Error('报价不存在')
    const draft=stationQuoteDraft(payload)
    for(const key of Object.keys(draft))if(typeof draft[key]==='string')draft[key]=draft[key].trim()
    const fields=stationQuoteErrors(draft,state,existing)
    if(Object.keys(fields).length)throw Object.assign(new Error(Object.values(fields)[0]),{fields})
    const row={...draft,id:existing?.id||`SQ-DEMO-${String(++state.stationQuoteSequence).padStart(3,'0')}`,updatedAt:now(),updatedBy:'DEMO-stationPallet'}
    if(existing)Object.assign(existing,row);else state.stationQuotes.push(row)
    return existing||row
  }
  function deleteStationQuote(id) {
    authorize()
    if(!state.stationQuotes.some(row=>row.id===id))throw new Error('报价不存在')
    if(state.costs.some(row=>row.stationQuoteId===id))throw new Error('已关联费用，报价删除影响待确认（055）')
    state.stationQuotes=state.stationQuotes.filter(row=>row.id!==id)
  }
  function saveStationPaper(payload,id='') {
    authorize()
    const row=id?state.stationPapers.find(item=>item.id===id):null
    if(id&&!row)throw new Error('板纸记录不存在')
    if(!String(payload.flight||'').trim())throw new Error('请填写航班号')
    const imageError=stationPaperImagesError(payload.images);if(imageError)throw new Error(imageError)
    if(!row)throw new Error('首次上传的扫码入口与航班批次关联待确认（119、172），未保存板纸或推进订单')
    if(payload.flight!==row.flight)throw new Error('修改板纸时航班号不可变更')
    if(payload.revision!==row.revision)throw new Error('板纸已被修改，请重新打开当前记录')
    if(JSON.stringify(payload.images)===JSON.stringify(row.images)&&String(payload.remark||'')===row.remark)return row
    const time=now()
    row.images=JSON.parse(JSON.stringify(payload.images));row.remark=String(payload.remark||'');row.updatedAt=time;row.revision++
    row.history.push({event:'修改板纸',time,actor:'DEMO-stationPallet',remark:row.remark})
    for(const recipient of new Set(row.noticeRecipients))state.messages.push({id:`MSG-STATION-${row.id}-${row.revision}-${state.messages.length+1}`,type:'板纸修改通知',recipient,recipientRole:'',createdAt:time,channel:'企业微信（本地模拟）',status:'本地模拟，未发送',content:`航班号：${row.flight}，板纸已修改，请留意变更！`,related:{path:'/fulfillment/station-pallet',query:{tab:'papers',paper:row.id}}})
    return row
  }
  return {createStationOrder,deleteStationOrder,updateStationStatus,receiveStationOrder,saveStationQuote,deleteStationQuote,saveStationPaper}
}
