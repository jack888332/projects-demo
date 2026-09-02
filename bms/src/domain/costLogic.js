export function numericAmount(value) {
  return Number(String(value ?? 0).replaceAll(',', '').replace(/[A-Z]/g, '').trim()) || 0
}

export function formatAmount(value, decimals = 3) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function normalizeCostBoard(value = '') {
  return value && !value.endsWith('成本') ? `${value}成本` : value
}

export function matchesKeyword(row, keyword, fields) {
  const normalized = keyword.trim().toLowerCase()
  return !normalized || fields.some((field) => String(row[field] || '').toLowerCase().includes(normalized))
}

export function sumAmounts(rows, field = 'amount') {
  return rows.reduce((total, row) => total + numericAmount(row[field]), 0)
}

