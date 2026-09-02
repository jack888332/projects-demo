export const BILLING_PATHS = {
  receivableSummary: '/billing/revenue-overview',
  receivable: '/billing/receivable-bills',
  refund: '/billing/refund-bills',
  remittance: '/billing/remittance',
  adjustments: '/billing/adjustments',
  config: '/billing/config',
  rates: '/billing/rates',
  tasks: '/billing/tasks',
  base: '/billing/base-config',
  exports: '/billing/exports',
  audit: '/billing/audit',
  compare: '/billing/report-compare',
  migration: '/billing/data-migration',
} as const

export const COST_PATHS = {
  overview: '/cost/overview',
  suppliers: '/cost/suppliers',
  bills: '/cost/bills',
  billImport: '/cost/bills/import',
  pool: '/cost/pool',
  rules: '/cost/rules',
  profit: '/cost/profit',
  fees: '/cost/fee-index',
} as const

export const BUSINESS_PATHS = {
  routeQuotes: '/business/route-quotes',
} as const

export const COST_BOARDS = ['派送成本', '清关成本', '海运成本', '空运成本', '租车成本'] as const
export const CURRENCIES = ['CNY', 'TWD', 'USD'] as const
export const ENABLE_STATUSES = ['启用', '停用'] as const
export const BILL_STATUSES = ['待结清', '已结清'] as const
export const TRIGGER_TYPES = { SCHEDULED: '定时', MANUAL: '手动' } as const
export const GENERATION_MODES = { FIRST: '首次生成', SUPPLEMENT: '补充生成', REPLACE: '替换生成' } as const
