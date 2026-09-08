export function roundChargeWeight(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return 0
  return Math.ceil((number - Number.EPSILON) * 2) / 2
}

export function calculateChargeWeight(grossWeight, volume) {
  const gross = Math.max(0, Number(grossWeight) || 0)
  const volumeWeight = Math.max(0, Number(volume) || 0) * 166.66
  return roundChargeWeight(Math.max(gross, volumeWeight))
}
