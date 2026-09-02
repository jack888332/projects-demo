export interface FilterSchema {
  key: string
  label: string
  type?: 'text' | 'select' | 'date-range'
  options?: string[] | Array<{ value: string; label: string }>
}

export interface MetricSchema {
  key: string
  label: string
  tone?: string
}

export interface ColumnSchema {
  key: string
  label: string
  width?: number
  minWidth?: number
  align?: 'left' | 'center' | 'right'
  slot?: string
}

export interface RowActionSchema {
  key: string
  label: string
  danger?: boolean
}

export interface ListPageSchema {
  filters: FilterSchema[]
  metrics: MetricSchema[]
  columns: ColumnSchema[]
  rowActions: RowActionSchema[]
  toolbarActions?: string[]
}

export const createListPageSchema = (schema: ListPageSchema): ListPageSchema => schema
