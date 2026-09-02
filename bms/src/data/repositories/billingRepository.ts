export interface BillingRecord extends Record<string, unknown> {
  billNo: string
}

export interface BillingRepository {
  list(): Promise<BillingRecord[]>
  get(billNo: string): Promise<BillingRecord | undefined>
  replace(rows: BillingRecord[]): Promise<void>
}

export function createIndexedDbBillingRepository(): BillingRepository {
  const dataset = import('./demoDatasetRepository')
    .then(({ createDemoDatasetRepository }) => createDemoDatasetRepository<BillingRecord>('billingBills'))
  return {
    async list() {
      return (await dataset).list()
    },
    async get(billNo) {
      return (await (await dataset).list()).find((row) => row.billNo === billNo)
    },
    async replace(rows) {
      await (await dataset).replace(rows)
    },
  }
}

export function createMemoryBillingRepository(seed: BillingRecord[] = []): BillingRepository {
  let records = structuredClone(seed)
  return {
    async list() { return structuredClone(records) },
    async get(billNo) {
      const record = records.find((row) => row.billNo === billNo)
      return record ? structuredClone(record) : undefined
    },
    async replace(rows) { records = structuredClone(rows) },
  }
}

let indexedDbRepository: BillingRepository | undefined
function getIndexedDbRepository() {
  indexedDbRepository ||= createIndexedDbBillingRepository()
  return indexedDbRepository
}

export const billingRepository: BillingRepository = {
  list: () => getIndexedDbRepository().list(),
  get: (billNo) => getIndexedDbRepository().get(billNo),
  replace: (rows) => getIndexedDbRepository().replace(rows),
}
