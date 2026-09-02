import { prototypeDb } from '../prototypeDb.js'
import type { Table } from 'dexie'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

interface DemoRecord<T> {
  key: string
  dataset: string
  position: number
  value: T
}

interface SettingRecord {
  key: string
  value: unknown
}

type PrototypeDb<T> = typeof prototypeDb & {
  demoRecords: Table<DemoRecord<T>, string>
  settings: Table<SettingRecord, string>
}

export interface DemoDatasetRepository<T> {
  list(): Promise<T[]>
  ensureSeed(seedRows: T[], seedVersion?: number): Promise<void>
  replace(rows: T[]): Promise<void>
}

export function createDemoDatasetRepository<T>(dataset: string): DemoDatasetRepository<T> {
  const db = prototypeDb as PrototypeDb<T>
  const versionKey = `demoDatasetVersion:${dataset}`
  const records = db.demoRecords.where('dataset').equals(dataset)

  return {
    async list() {
      const rows = await records.sortBy('position') as DemoRecord<T>[]
      return rows.map((record) => clone(record.value))
    },
    async ensureSeed(seedRows, seedVersion = 1) {
      const currentVersion = await db.settings.get(versionKey)
      const recordCount = await records.count()
      if (recordCount && Number(currentVersion?.value || 0) >= seedVersion) return

      await db.transaction('rw', db.demoRecords, db.settings, async () => {
        await records.delete()
        if (seedRows.length) {
          await db.demoRecords.bulkPut(seedRows.map((value, position) => ({
            key: `${dataset}:${position}`,
            dataset,
            position,
            value: clone(value),
          })))
        }
        await db.settings.put({ key: versionKey, value: seedVersion })
      })
    },
    async replace(rows) {
      await db.transaction('rw', db.demoRecords, async () => {
        await records.delete()
        if (rows.length) {
          await db.demoRecords.bulkPut(rows.map((value, position) => ({
            key: `${dataset}:${position}`,
            dataset,
            position,
            value: clone(value),
          })))
        }
      })
    },
  }
}
