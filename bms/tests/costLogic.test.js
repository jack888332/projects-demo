import { describe, expect, test } from 'vitest'
import { formatAmount, matchesKeyword, normalizeCostBoard, numericAmount, sumAmounts } from '../src/domain/costLogic.js'

describe('成本领域逻辑', () => {
  test('金额文本可转换并汇总', () => {
    expect(numericAmount('1,234.500 CNY')).toBe(1234.5)
    expect(numericAmount('-154,082.000 TWD')).toBe(-154082)
    expect(sumAmounts([{ amount: '1,200.000' }, { amount: '-200.000' }])).toBe(1000)
    expect(formatAmount(1000)).toBe('1,000.000')
  })

  test('成本板块名称统一追加成本后缀', () => {
    expect(normalizeCostBoard('派送')).toBe('派送成本')
    expect(normalizeCostBoard('派送成本')).toBe('派送成本')
    expect(normalizeCostBoard('')).toBe('')
  })

  test('关键词可跨业务字段匹配', () => {
    const row = { id: 'APB-001', supplier: '东风', file: '台湾端派送.xlsx' }
    expect(matchesKeyword(row, '东风', ['id', 'supplier', 'file'])).toBe(true)
    expect(matchesKeyword(row, 'apb', ['id', 'supplier', 'file'])).toBe(true)
    expect(matchesKeyword(row, '福广', ['id', 'supplier', 'file'])).toBe(false)
  })
})
