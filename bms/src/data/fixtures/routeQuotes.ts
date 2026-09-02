type RouteQuoteRule = { lower: number; upper: number; fee: number }
type RoutePriceRule = {
  ruleType: string
  lowerOperator: string
  upperOperator: string
  lower: number
  upper: number
  priceType: string
  price: number
  feeNature: string
}

export const createRule = (lower: number, upper: number, fee: number): RouteQuoteRule => ({ lower, upper, fee })

const createDarongDongwangRules = () => [
  createRule(1, 5000, 30), createRule(5001, 10000, 35),
  createRule(10001, 15000, 50), createRule(15001, 20000, 65),
  createRule(20001, 25000, 110), createRule(25001, 30000, 140),
  createRule(30001, 35000, 170), createRule(35001, 40000, 200),
  createRule(40001, 45000, 230), createRule(45001, 50000, 255),
  createRule(50001, 55000, 280), createRule(55001, 60000, 305),
  createRule(60001, 65000, 330), createRule(65001, 70000, 355),
  createRule(70001, 75000, 380), createRule(75001, 80000, 405),
  createRule(80001, 85000, 430), createRule(85001, 90000, 455),
  createRule(90001, 95000, 480), createRule(95001, 100000, 505),
]

export const createPriceRule = (lower: number, upper: number, price: number, overrides: Partial<RoutePriceRule> = {}): RoutePriceRule => ({
  ruleType: '计费重量',
  lowerOperator: '大于等于',
  upperOperator: '小于等于',
  lower,
  upper,
  priceType: '每千克',
  price,
  feeNature: '附加费用',
  ...overrides,
})

export const createBaseQuote = (overrides: Record<string, unknown> = {}) => {
  const quote = {
    id: '',
    shop: '天马运通供应链',
    name: '',
    warehouse: '台湾测试仓',
    warehouses: ['台湾测试仓'],
    status: '启用',
    businessTypes: ['重出订单'],
    quoteType: '代收货款手续费报价',
    group: '代收货款客户',
    groups: ['代收货款客户'],
    cargoTypes: ['普货'],
    transportModes: ['陆运'],
    carrier: '',
    carriers: [] as string[],
    destination: '中国台湾',
    destinations: ['中国台湾'],
    productDescription: '',
    updatedBy: '财务管理员',
    updatedAt: '2026-08-16 09:40',
    createdBy: '财务管理员',
    createdAt: '2026-08-16 09:40',
    startDate: '2026-08-01',
    endDate: '2029-12-31',
    permanent: true,
    priority: 0,
    displayPriority: 0,
    timeLimit: '',
    minPrice: '',
    recommendTags: [] as string[],
    forbiddenCategories: [] as string[],
    forbiddenDescription: '',
    lowerPackageCount: 1,
    lowerPackageCountUnit: '个',
    lowerWeight: 0.1,
    lowerWeightUnit: 'KG',
    routeStrategy: '当前线路报价指定唯一的承运商，承运商产品为默认产品',
    billingMode: '按代收货款金额分档',
    calculationMode: '多包裹单独算费',
    feeRoundingType: '实际费用',
    feeRounding: '无舍入',
    carryMode: '无进位',
    defaultRatio: 9000,
    defaultWeightFormula: 'V/K',
    priceCurrency: 'TWD',
    currency: 'TWD',
    version: 1,
    rules: [] as RouteQuoteRule[],
    priceRules: [] as RoutePriceRule[],
    ...overrides,
  }
  quote.groups = Array.isArray(overrides.groups) ? overrides.groups : quote.group ? [quote.group] : []
  quote.warehouses = Array.isArray(overrides.warehouses) ? overrides.warehouses : quote.warehouse ? [quote.warehouse] : []
  quote.destinations = Array.isArray(overrides.destinations) ? overrides.destinations : quote.destination ? [quote.destination] : []
  quote.carriers = Array.isArray(overrides.carriers) ? overrides.carriers : quote.carrier ? [quote.carrier] : []
  return quote
}

export const routeQuoteFixtures = [
  createBaseQuote({
    id: 'cod-tw-darong',
    name: '中国台湾代收手续费-大荣 / 东网',
    carriers: ['大荣', '东网'],
    productDescription: '中国台湾代收货款固定手续费',
    updatedAt: '2026-08-16 09:40',
    createdAt: '2026-08-16 09:40',
    version: 2,
    rules: createDarongDongwangRules(),
  }),
  createBaseQuote({
    id: 'cod-tw-xinzhu',
    name: '中国台湾代收手续费-新竹',
    carrier: '新竹',
    productDescription: '中国台湾代收货款固定手续费',
    updatedAt: '2026-08-16 09:42',
    createdAt: '2026-08-16 09:42',
    version: 1,
    rules: [
      createRule(1, 10000, 30), createRule(10001, 20000, 125),
      createRule(20001, 50000, 155), createRule(50001, 100000, 310),
    ],
  }),
  createBaseQuote({
    id: 'delivery-tw-standard',
    name: '中国台湾标准派送报价',
    quoteType: '派送报价',
    group: '标准线路',
    businessTypes: ['集运', '电商订单'],
    carrier: '大荣',
    billingMode: '实重于抛重二者取其大',
    calculationMode: '多包裹单独算费',
    feeRounding: '0.1舍入',
    carryMode: '0.5进位',
    priceCurrency: 'TWD',
    productDescription: '按实重与抛重较大值计算中国台湾派送费',
    rules: [],
    priceRules: [createPriceRule(0, 5, 95), createPriceRule(5, 10, 150)],
    updatedAt: '2026-08-16 09:45',
    createdAt: '2026-08-16 09:45',
  }),
  createBaseQuote({
    id: 'additional-tw-weight',
    name: '中国台湾派送附加费报价',
    quoteType: '派送附加费报价',
    group: '附加费报价',
    businessTypes: ['中转/预报'],
    carrier: '新竹',
    billingMode: '仅按重量计费(KG)',
    calculationMode: '多包裹单独算费',
    feeRounding: '0.2舍入',
    carryMode: '1进位',
    priceCurrency: 'TWD',
    productDescription: '按包裹重量计算派送附加费',
    rules: [],
    priceRules: [createPriceRule(0, 10, 35), createPriceRule(10, 30, 60)],
    updatedAt: '2026-08-16 09:47',
    createdAt: '2026-08-16 09:47',
  }),
  createBaseQuote({
    id: 'oversize-tw-volume',
    name: '中国台湾超材报价',
    quoteType: '超材报价',
    group: '超材规则',
    businessTypes: ['集运'],
    carrier: '东网',
    billingMode: '按材积(材)',
    calculationMode: '多包裹合并算费',
    feeRounding: '0.3舍入',
    carryMode: '0.3进位',
    priceCurrency: 'TWD',
    productDescription: '按材积计算超材费用',
    rules: [],
    priceRules: [
      createPriceRule(0, 2, 80, { ruleType: '材积', priceType: '每材' }),
      createPriceRule(2, 5, 160, { ruleType: '材积', priceType: '每材' }),
    ],
    updatedAt: '2026-08-16 09:49',
    createdAt: '2026-08-16 09:49',
  }),
  createBaseQuote({
    id: 'service-tw-order',
    name: '中国台湾系统服务报价',
    quoteType: '系统服务报价',
    group: '系统服务',
    businessTypes: ['电商订单'],
    carrier: '新竹',
    billingMode: '按数量（个）',
    calculationMode: '订单个数',
    feeRounding: '无舍入',
    carryMode: '无进位',
    priceCurrency: 'TWD',
    productDescription: '按业务订单数量计算系统服务费',
    rules: [],
    priceRules: [
      createPriceRule(1, 1, 20, { ruleType: '数量', priceType: '每个' }),
      createPriceRule(2, 10, 18, { ruleType: '数量', priceType: '每个' }),
    ],
    updatedAt: '2026-08-16 09:51',
    createdAt: '2026-08-16 09:51',
  }),
]
