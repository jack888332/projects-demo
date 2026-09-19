import { recordsCsv } from '../domain/recordQuery.js'

export function downloadRecords(name, rows, columns) {
  const url = URL.createObjectURL(new Blob([recordsCsv(rows, columns)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
