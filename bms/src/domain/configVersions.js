import dayjs from 'dayjs'

export const historicalVersionStatuses = new Set(['历史', '已取消'])

export const isHistoricalVersion = version => historicalVersionStatuses.has(version?.versionStatus)

export const historicalVersionCount = versions => (versions || []).filter(isHistoricalVersion).length

export function pendingVersionLabel(version, effectiveAt) {
  if (!version) return ''
  const effectiveDate = dayjs(effectiveAt)
  if (!effectiveAt || !effectiveDate.isValid()) return `切换日期未记录，将切换为 ${version}`
  return `将在 ${effectiveDate.format('YYYY/MM/DD')} 切换为 ${version}`
}
