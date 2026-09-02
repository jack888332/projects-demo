import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { billingBillFixtures } from '../src/data/fixtures/billingBills.ts'
import { billingTaskFixtures } from '../src/data/fixtures/billingTasks.ts'

describe('billing task and bill fixture traceability', () => {
  const successfulGenerationTasks = billingTaskFixtures.filter(task => (
    task.status === 'SUCCESS' && task.taskType === 'BILL_GENERATE' && task.newBills.length > 0
  ))

  it('keeps every generated bill queryable with the frozen task snapshot', () => {
    successfulGenerationTasks.forEach((task) => {
      task.newBills.forEach((billNo) => {
        const bill = billingBillFixtures.find(candidate => candidate.billNo === billNo)
        expect(bill, `${task.taskNo} 缺少结果账单 ${billNo}`).toBeDefined()
        expect(bill).toMatchObject({
          type: task.billType,
          batchNo: task.batchNo,
          taskNo: task.taskNo,
          configSource: task.configSource,
          configNo: task.configNo,
          configVersion: task.configVersion,
          customerReferenceNo: task.customerReferenceNo,
          schemeKey: task.schemeKey,
          schemeName: task.schemeName,
          schemeType: task.schemeType,
          customerNo: task.customerNo,
        })
      })
    })
  })

  it('keeps referenced original bills queryable for supplement and replacement tasks', () => {
    successfulGenerationTasks
      .filter(task => ['SUPPLEMENT', 'REPLACE'].includes(task.generationMode))
      .forEach((task) => {
        task.originalBills.forEach((billNo) => {
          expect(
            billingBillFixtures.some(candidate => candidate.billNo === billNo),
            `${task.taskNo} 缺少原账单 ${billNo}`,
          ).toBe(true)
        })
      })
  })

  it('makes the target generation batch discoverable from the bill list data', () => {
    const batchBills = billingBillFixtures.filter(bill => bill.batchNo === 'BMSB-20260816-00012')
    expect(batchBills).toHaveLength(1)
    expect(batchBills[0]).toMatchObject({
      taskNo: 'BMS-20260816-00125',
      configNo: 'ARB-20260801-01',
      configVersion: 'V2',
      customerReferenceNo: 'AR-REF-OG0271-0002',
      schemeKey: 'BRANCH-02',
    })
    expect(billingTaskFixtures.find(task => task.taskNo === batchBills[0].taskNo)?.sourceShopSnapshots).toContain('STORE-XJZY / 星际货运(中转)')
  })

  it('uses the source-order store snapshot in new bill-number suffixes', () => {
    billingBillFixtures
      .filter(bill => bill.numberingRule === 'STORE_SNAPSHOT_MD5_V1')
      .forEach((bill) => {
        const key = bill.type === 'AR'
          ? `${bill.shopCode}${bill.sector}${bill.country}`
          : `${bill.shopCode}`
        const suffix = createHash('md5').update(key).digest('hex').slice(0, 4)
        expect(bill.billNo).toMatch(new RegExp(`${suffix}$`))
      })
  })
})
