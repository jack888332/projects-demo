import { onBeforeUnmount } from 'vue'
import { accessState, workbenchSession } from './accessControl.js'

export function captureFinanceContext(state, row, isAlive = () => true) {
  const database=state.financeBasics,costs=state.financeCostItems,persona=workbenchSession.personaId,revision=accessState.revision,snapshot=JSON.stringify(row)
  return () => isAlive() && database===state.financeBasics && costs===state.financeCostItems && persona===workbenchSession.personaId && revision===accessState.revision && snapshot===JSON.stringify(row)
}

export function useFinanceContext(state) {
  let alive=true
  onBeforeUnmount(()=>{alive=false})
  return row=>captureFinanceContext(state,row,()=>alive)
}
