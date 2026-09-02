import { prototypeDb } from '../prototypeDb.js'
import type { IndexableType } from 'dexie'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

export interface TableRepository<T extends Record<string, unknown>> {
  list(): Promise<T[]>
  get(key: IndexableType): Promise<T | undefined>
  put(row: T): Promise<IndexableType>
  update(key: IndexableType, changes: Partial<T>): Promise<number>
  remove(key: IndexableType): Promise<void>
  sync(previousRows: T[], nextRows: T[]): Promise<void>
}

export function createTableRepository<T extends Record<string, unknown>>(tableName: string): TableRepository<T> {
  const table = prototypeDb.table(tableName)
  const keyPath = table.schema.primKey.keyPath as string
  const keyOf = (row: T) => row[keyPath] as IndexableType

  return {
    list: () => table.toArray(),
    get: (key) => table.get(key),
    put: (row) => table.put(clone(row)),
    update: (key, changes) => table.update(key, clone(changes)),
    remove: (key) => table.delete(key),
    async sync(previousRows, nextRows) {
      const previous = new Map(previousRows.map((row) => [keyOf(row), row]))
      const next = new Map(nextRows.map((row) => [keyOf(row), row]))
      const changed = nextRows.filter((row) => JSON.stringify(previous.get(keyOf(row))) !== JSON.stringify(row))
      const removed = [...previous.keys()].filter((key) => !next.has(key))

      await prototypeDb.transaction('rw', table, async () => {
        if (changed.length) await table.bulkPut(clone(changed))
        if (removed.length) await table.bulkDelete(removed)
      })
    },
  }
}
