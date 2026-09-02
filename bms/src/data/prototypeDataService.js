import { costSeed } from './costSeed.js'
import { notifyDemoDataChanged } from './events.js'
import { prototypeDb } from './prototypeDb.js'

const clone = (value) => JSON.parse(JSON.stringify(value))
const COST_SEED_VERSION = 1

export async function initializePrototypeData(force = false) {
  await prototypeDb.open()
  const version = await prototypeDb.settings.get('costSeedVersion')
  const supplierCount = await prototypeDb.suppliers.count()
  if (!force && supplierCount && Number(version?.value || 0) >= COST_SEED_VERSION) return

  await prototypeDb.transaction('rw', prototypeDb.tables, async () => {
    if (force) await Promise.all(prototypeDb.tables.map((table) => table.clear()))
    for (const [tableName, rows] of Object.entries(costSeed)) {
      if (rows.length) await prototypeDb.table(tableName).bulkPut(clone(rows))
    }
    await prototypeDb.settings.put({ key: 'costSeedVersion', value: COST_SEED_VERSION })
    await prototypeDb.operationLogs.add({ entityType: '系统', entityId: '统一原型', action: force ? '恢复初始模拟数据' : '初始化模拟数据', createdAt: new Date().toISOString() })
  })
}

export async function exportPrototypeData() {
  const data = {}
  for (const table of prototypeDb.tables) data[table.name] = await table.toArray()
  return { format: 'bms-unified-prototype', version: 4, exportedAt: new Date().toISOString(), data }
}

export async function importPrototypeData(payload) {
  if (payload?.format !== 'bms-unified-prototype' || !payload.data) throw new Error('文件不是有效的 BMS 原型数据')
  await prototypeDb.transaction('rw', prototypeDb.tables, async () => {
    for (const table of prototypeDb.tables) {
      await table.clear()
      const rows = payload.data[table.name]
      if (Array.isArray(rows) && rows.length) await table.bulkPut(rows)
    }
  })
  notifyDemoDataChanged()
}

export async function resetPrototypeData() {
  await initializePrototypeData(true)
  notifyDemoDataChanged()
}
