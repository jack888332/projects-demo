import { describe, expect, it } from 'vitest'
import { billingConfigFixtures, billingConfigVersionFixtures } from '../src/data/fixtures/billingConfigs.ts'
import { billingRateConfigFixtures } from '../src/data/fixtures/billingRates.ts'
import { historicalVersionCount, pendingVersionLabel } from '../src/domain/configVersions.js'

const versionSequence = (currentVersion, pendingVersion = '') => Array.from(
  { length:Math.max(Number(currentVersion.slice(1)), Number(pendingVersion.slice(1)) || 0) },
  (_, index) => `V${index + 1}`,
)

describe('configuration version history fixtures', () => {
  it('formats the pending version label with its scheduled effective date', () => {
    expect(pendingVersionLabel('V3', '2026-09-05')).toBe('将在 2026/09/05 切换为 V3')
    expect(pendingVersionLabel('', '2026-09-05')).toBe('')
  })

  it('counts only historical and cancelled versions in the library total', () => {
    expect(historicalVersionCount([
      { versionStatus:'生效' },
      { versionStatus:'待生效' },
      { versionStatus:'历史' },
      { versionStatus:'已取消' },
    ])).toBe(2)
  })

  it('keeps every published billing configuration version and its complete snapshot', () => {
    billingConfigFixtures.forEach((config) => {
      const versions = billingConfigVersionFixtures.filter(version => version.configId === config.id)
      expect(versions.map(version => version.version).sort()).toEqual(versionSequence(config.version, config.pendingVersion).sort())
      versions.forEach((version) => {
        expect(version.publishedAt).toBeTruthy()
        expect(version.effectiveAt).toBeTruthy()
        expect(version.changeReason).toBeTruthy()
        if (config.type === 'AR') {
          expect(version.schemeSnapshot?.defaultScheme).toBeTruthy()
          expect(version.schemeSnapshot?.terms).toBeTruthy()
        } else {
          expect(version.refundSnapshot?.currencyRules?.length).toBeGreaterThan(0)
        }
      })
    })
  })

  it('keeps every published rate configuration version and its rule details', () => {
    billingRateConfigFixtures.forEach((config) => {
      expect(config.versions.map(version => version.version).sort()).toEqual(versionSequence(config.currentVersion).sort())
      config.versions.forEach((version) => {
        expect(version.publishedAt).toBeTruthy()
        expect(version.effectiveAt).toBeTruthy()
        expect(version.changeReason).toBeTruthy()
        expect(version.rules.length).toBeGreaterThan(0)
      })
    })
  })
})
