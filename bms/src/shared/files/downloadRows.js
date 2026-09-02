function escapeCsvCell(value) {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : []
}

export function downloadRows(rows, fileName = 'BMS数据') {
  const source = normalizeRows(rows)
  const headers = [...new Set(source.flatMap((row) => Object.keys(row || {})))]
  const csvRows = [headers, ...source.map((row) => headers.map((key) => row?.[key]))]
  const content = csvRows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName}.csv`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  window.setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(url)
  }, 1000)
}
