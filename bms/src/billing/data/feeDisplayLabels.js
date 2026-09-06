export function sourceFeeDisplayName(name) {
  const sourceName = String(name || '').replace(/^扣减/, '')
  return sourceName === '代收货款手续费' ? '代收服务费' : sourceName
}

export function deductionFeeDisplayName(name) {
  return sourceFeeDisplayName(name)
}

export function isZeroFeeAmount(value) {
  return value !== null && value !== undefined && Number(value) === 0
}
