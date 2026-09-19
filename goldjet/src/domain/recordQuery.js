export const fieldValue = (row, key) => key.split('.').reduce((value, part) => value?.[part], row)
export const displayValue = value => value == null || value === '' ? '未提供' : String(value)
export const columnsFromLabels = labels => labels.split('、').map(label => [label, label, Math.max(120, label.length * 17)])
export function filterRecords(rows, query, filters) {
  return rows.filter(row => filters.every(([key, , type = 'text', , sourceKey]) => {
    const value = query[key], actual = fieldValue(row, sourceKey || key)
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return true
    if (type === 'range') return actual != null && (!value[0] || String(actual).slice(0, 10) >= value[0]) && (!value[1] || String(actual).slice(0, 10) <= value[1])
    if (type === 'min' || type === 'max') return actual != null && Number.isFinite(Number(actual)) && (type === 'min' ? Number(actual) >= Number(value) : Number(actual) <= Number(value))
    if (type === 'select') return String(actual) === value
    return String(actual ?? '').toLowerCase().includes(String(value).trim().toLowerCase())
  }))
}
export function recordsCsv(rows, columns) {
  const cell = value => '"' + String(value ?? '').replace(/^[\s]*[=+\-@]/, match => "'" + match).replaceAll('"', '""') + '"'
  return '\uFEFF' + [columns.map(([, label]) => cell(label)).join(','), ...rows.map(row => columns.map(([key]) => cell(fieldValue(row, key))).join(','))].join('\r\n')
}
