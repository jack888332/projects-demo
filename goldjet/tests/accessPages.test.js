import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const views = ['RolePermissions', 'Dashboard', 'Messages', 'AirCapacity', 'AirChildOrders', 'AirClearances', 'AirDeclarationSource', 'AirDeclarations', 'AirMasterData', 'AirOrderSupplement', 'AirOrders', 'AirPallet', 'AirSupplierRates', 'AirTracking', 'AirWaybillEdit', 'AirWaybills', 'AirWaybillTemplates', 'Booking', 'FinanceCosts', 'FleetManagement', 'FleetRecords', 'FleetVehicles', 'Fleet', 'GenericModule', 'GroundDispatch', 'GroundMonthly', 'GroundWaybills', 'Partners', 'TransportQuotes', 'WarehouseOrders', 'WarehouseQuotes']
const components = ['AirDeclarationMaterialsDialog', 'AirHouseBillDialog', 'AirOrderCreateDialog', 'AirOrderPriceDialog', 'AirServiceEditDialog', 'AirWaybillContactDialog', 'AirWaybillSendDialog', 'GroundOrderEditor', 'GroundWaybillDocuments', 'GroundWaybillExceptions']

describe('共享权限直接消费者可编译', () => {
  for (const file of ['AppShell.vue', ...views.map(name => `views/${name}View.vue`), ...components.map(name => `components/${name}.vue`)]) {
    it(file, () => {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
      const parsed = parse(source, { filename: file })
      expect(parsed.errors).toEqual([])
      const script = compileScript(parsed.descriptor, { id: file })
      const result = compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } })
      expect(result.errors).toEqual([])
    })
  }
})
