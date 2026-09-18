import { validateDriverAttachment } from './fleetOperations.js'
import { getPalletAllocatedRows } from './airPallets.js'
export function stationPaperImagesError(images) {
  if(!Array.isArray(images)||images.length<1||images.length>9)return '板纸图片须至少1张、最多9张'
  for(const image of images){
    if(image.size>=6*1024*1024)return '板纸单张图片须小于6MB'
    const error=validateDriverAttachment(image);if(error)return error
  }
  return ''
}
export function stationPaperRows(state,persona,session){
  const rows=state.stationPapers||[]
  if(['stationPallet','superAdmin'].includes(persona))return rows
  return rows.filter(row=>row.viewers.includes(session.name))
}
export function stationPlans(state,persona,session){
  const groups=[...new Set(state.palletAllocations.map(row=>row.flightKey))]
  return groups.flatMap(key=>{
    const rows=getPalletAllocatedRows(state,['stationPallet','superAdmin'].includes(persona)?{readAll:true}:session,key)
    if(!rows.length)return []
    return [{key,flight:rows[0].flight,date:rows[0].date,rows,totalPieces:rows.reduce((sum,row)=>sum+row.cargo.pieces,0),totalWeight:rows.reduce((sum,row)=>sum+row.cargo.grossWeight,0),totalVolume:rows.reduce((sum,row)=>sum+row.cargo.volume,0)}]
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.flight.localeCompare(b.flight))
}
