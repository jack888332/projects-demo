export const billingBaseRateFixtures = [
  { pair: 'USD / CNY', direction: 'USD -> CNY', rate: 7.1846, source: '手动导入', sourceAt: '2026-08-02 09:00', status: '生效', current: '是' },
  { pair: 'GBP / CNY', direction: 'GBP -> CNY', rate: 9.4628, source: '手动添加', sourceAt: '2026-08-02 09:12', status: '生效', current: '是' },
  { pair: 'CAD / CNY', direction: 'CAD -> CNY', rate: 5.2184, source: '手动导入', sourceAt: '2026-08-02 09:00', status: '待确认', current: '否' },
  { pair: 'AUD / CNY', direction: 'CNY -> AUD', rate: 0.2146, source: '手动添加', sourceAt: '2026-08-01 16:20', status: '停用', current: '否' },
]

// 每个客户在同一时段只有一条特调配置引用；任务创建时再锁定配置当时生效的准确版本。
export const billingRateFixtures = [
  { id:'RR-001', customerCode:'OG4155', customerName:'OceanGate Logistics', memberCode:'M-415501', store:'星际货运(中转)', group:'台湾大客户组', relations:[{ store:'星际货运(中转)', group:'台湾大客户组', memberCode:'M-415501' }], configId:'RC-001', configVersion:'V2', effectiveFrom:'2026-08-01', effectiveTo:'长期' },
  { id:'RR-002', customerCode:'OG9012', customerName:'TopKing Supply', memberCode:'M-901201', store:'星际中转2', group:'日本同行组', relations:[{ store:'星际中转2', group:'日本同行组', memberCode:'M-901201' }], configId:'RC-002', configVersion:'V3', effectiveFrom:'2026-07-01', effectiveTo:'长期' },
  { id:'RR-003', customerCode:'OG2048', customerName:'NorthWind Cargo', memberCode:'M-204801', store:'台湾集运店', group:'美国电商组', relations:[{ store:'台湾集运店', group:'美国电商组', memberCode:'M-204801' }], configId:'RC-003', configVersion:'V1', effectiveFrom:'2026-07-15', effectiveTo:'长期' },
  { id:'RR-004', customerCode:'OG0271', customerName:'渣渣辉3号', memberCode:'M-700127', store:'星际货运(中转)', group:'台湾大客户组', relations:[{ store:'星际货运(中转)', group:'台湾大客户组', memberCode:'M-700127' }], configId:'RC-001', configVersion:'V2', effectiveFrom:'2026-06-01', effectiveTo:'长期' },
  { id:'RR-005', customerCode:'OG0370', customerName:'JYK-深圳立杰海快', memberCode:'M-672019', store:'星际中转2', group:'日本同行组', relations:[{ store:'星际中转2', group:'日本同行组', memberCode:'M-672019' }], configId:null, configVersion:null, effectiveFrom:null, effectiveTo:null },
]

export const billingRateConfigFixtures = [
  {
    id:'RC-001', no:'RATE-CONFIG-20260801-01', name:'台湾客户特调', currentVersion:'V2', status:'启用', updatedAt:'2026-08-01 10:18',
    versions:[
      { version:'V2', rules:[
        { direction:'USD -> CNY', method:'百分比缩放', adjustDirection:'上浮', adjustValue:1.5 },
        { direction:'GBP -> CNY', method:'固定汇率差', adjustDirection:'下浮', adjustValue:0.02 },
      ], publishedAt:'2026-08-01 10:18', effectiveAt:'2026-08-01', changeReason:'调整台湾客户货币对规则' },
      { version:'V1', rules:[{ direction:'CAD -> CNY', method:'固定汇率差', adjustDirection:'上浮', adjustValue:0.01 }], publishedAt:'2026-06-01 09:20', effectiveAt:'2026-06-01', changeReason:'首次发布' },
    ],
  },
  {
    id:'RC-002', no:'RATE-CONFIG-20260701-02', name:'日本同行结算特调', currentVersion:'V3', status:'启用', updatedAt:'2026-08-12 14:06',
    versions:[
      { version:'V3', rules:[{ direction:'GBP -> CNY', method:'固定汇率差', adjustDirection:'下浮', adjustValue:0.02 }], publishedAt:'2026-08-12 14:06', effectiveAt:'2026-08-12', changeReason:'调整英镑固定汇率差' },
      { version:'V2', rules:[{ direction:'GBP -> CNY', method:'固定汇率差', adjustDirection:'下浮', adjustValue:0.01 }], publishedAt:'2026-07-18 11:30', effectiveAt:'2026-07-18', changeReason:'百分比调整改为固定汇率差' },
      { version:'V1', rules:[{ direction:'GBP -> CNY', method:'百分比缩放', adjustDirection:'下浮', adjustValue:0.1 }], publishedAt:'2026-07-01 08:55', effectiveAt:'2026-07-01', changeReason:'首次发布' },
    ],
  },
  {
    id:'RC-003', no:'RATE-CONFIG-20260715-03', name:'固定约定汇率', currentVersion:'V1', status:'启用', updatedAt:'2026-07-15 11:05',
    versions:[
      { version:'V1', rules:[{ direction:'GBP -> CNY', method:'固定汇率值', adjustDirection:'直接指定', adjustValue:9.6 }], publishedAt:'2026-07-15 11:05', effectiveAt:'2026-07-15', changeReason:'首次发布' },
    ],
  },
  {
    id:'RC-004', no:'RATE-CONFIG-20260820-04', name:'美元反向结算特调', currentVersion:'V1', status:'启用', updatedAt:'2026-08-20 16:40',
    versions:[
      { version:'V1', rules:[{ direction:'CNY -> USD', method:'百分比缩放', adjustDirection:'下浮', adjustValue:0.5 }], publishedAt:'2026-08-20 16:40', effectiveAt:'2026-08-20', changeReason:'首次发布' },
    ],
  },
]
