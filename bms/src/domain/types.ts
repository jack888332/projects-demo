export type Currency = 'CNY' | 'TWD' | 'USD'
export type EnabledStatus = '启用' | '停用'
export type CostBoard = '派送成本' | '清关成本' | '海运成本' | '空运成本' | '租车成本'

export interface SupplierPeriodConfig {
  board: string
  cycle: string
  cycleAnchor?: string
  effectiveStart: string
  effectiveEnd?: string
}

export interface Supplier {
  code: string
  name: string
  boards: string[]
  periodConfigs: SupplierPeriodConfig[]
  currency: Currency
  bills: number
  pending: string
  settled: string
  state: EnabledStatus
  updated: string
}

export interface CostBill {
  id: string
  supplier: string
  board: CostBoard
  period: string
  amount: string
  currency: Currency
  settled: string
  state: '待结清' | '已结清'
  rows: number
  direct: number
  indirect: number
  unresolved: number
  file: string
  created: string
}

export interface AllocationRule {
  id: string
  board: CostBoard
  fee: string
  supplier: string
  scope: string
  factor: string
  fallback: string
  rounding: string
  effective: string
  status: EnabledStatus
}

