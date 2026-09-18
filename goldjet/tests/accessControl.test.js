import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { canReadModule, canReadTarget, canSeeMenu, canWriteModule, rolePermissionDraft, saveRolePermissions, resetRolePermissions, accessState } from '../src/data/accessControl.js'
import { moduleCatalog } from '../src/domain/catalog.js'
import { getAirChildRestriction } from '../src/domain/airChildOrders.js'
import { canViewAirTrackingOrder } from '../src/domain/airTracking.js'

const data = usePrototypeData()
beforeEach(() => data.reset())
describe('角色权限配置', () => {
  it('超级管理员可看全部模块与他人数据，但不能代办业务', () => {
    data.selectWorkbenchPersona('superAdmin')
    for (const key of Object.keys(moduleCatalog)) { expect(canReadModule(key)).toBe(true); expect(canSeeMenu(key)).toBe(true) }
    expect(canWriteModule('permissions')).toBe(true)
    expect(canWriteModule('fleet')).toBe(false)
    expect(data.groundSession.readAll).toBe(true)
    expect(getAirChildRestriction({ creator: '其他客服' }, data.airChildSession.value, 'detail')).toBe('')
    expect(getAirChildRestriction({ creator: '其他客服' }, data.airChildSession.value, 'edit')).not.toBe('')
    expect(canViewAirTrackingOrder(data.state.airOrders[1], data.airSession)).toBe(true)
    expect(() => data.reviewCost(data.state.costs[0].id, true)).toThrow('未获')
  })
  it('分别配置菜单、页面、数据与操作，并在数据所有者拒绝写入', () => {
    data.selectWorkbenchPersona('superAdmin')
    const draft = rolePermissionDraft('hangsheng')
    draft.fleet.menu = false; draft.fleet.write = false; draft.airOrders.page = false; draft.costs.data = false
    saveRolePermissions('hangsheng', draft)
    data.selectWorkbenchPersona('hangsheng')
    expect(canSeeMenu('fleet')).toBe(false)
    expect(canReadModule('fleet')).toBe(true)
    expect(canReadModule('airOrders')).toBe(false)
    expect(canReadModule('costs')).toBe(false)
    const before = JSON.stringify(data.state.fleetDrivers)
    expect(() => data.saveDriver({})).toThrow('未获')
    expect(JSON.stringify(data.state.fleetDrivers)).toBe(before)
    expect(accessState.history).toHaveLength(1)
  })
  it('普通角色不能授权自己；超级管理员不能锁死自身；错误保存不产生部分修改', () => {
    expect(() => saveRolePermissions('service', rolePermissionDraft('service'))).toThrow('仅超级管理员')
    data.selectWorkbenchPersona('superAdmin')
    expect(() => saveRolePermissions('superAdmin', rolePermissionDraft('superAdmin'))).toThrow('不可关闭')
    const draft = rolePermissionDraft('service'); draft.fleet.menu = false; draft.costs.data = 'yes'
    expect(() => saveRolePermissions('service', draft)).toThrow('不完整')
    expect(rolePermissionDraft('service').fleet.menu).toBe(true)
  })
  it('恢复单角色默认与恢复演示数据清除配置', () => {
    data.selectWorkbenchPersona('superAdmin')
    const draft = rolePermissionDraft('service'); draft.fleet.page = false
    saveRolePermissions('service', draft); resetRolePermissions('service')
    expect(rolePermissionDraft('service').fleet.page).toBe(true)
    saveRolePermissions('service', draft); data.reset()
    expect(rolePermissionDraft('service').fleet.page).toBe(true)
    expect(accessState.history).toHaveLength(0)
    expect(data.airSession.readAll).toBe(false)
  })
  it('数据禁用同步拒绝下载和深链；恢复后原角色可重新办理', () => {
    data.selectWorkbenchPersona('superAdmin')
    data.loadDemoOverview()
    const before = data.state.airOrders.length
    data.loadDemoOverview()
    expect(data.state.airOrders).toHaveLength(before)
    const draft = rolePermissionDraft('customsService'); draft.declarations.data = false
    saveRolePermissions('customsService', draft)
    data.selectWorkbenchPersona('customsService')
    expect(canReadTarget({ path: '/fulfillment/declarations/DEMO/source' })).toBe(false)
    expect(() => data.getAirDeclarationFiles([])).toThrow('数据查看授权')
    expect(() => data.notifyAirDeclarationMaterials([])).toThrow('业务操作授权')
    data.selectWorkbenchPersona('superAdmin'); resetRolePermissions('customsService')
    data.selectWorkbenchPersona('customsService')
    const row = data.airDeclarations.value.find(row => row.materials.length)
    const target = [{ serviceId: row.id, materialId: row.materials[0].id }]
    expect(data.getAirDeclarationFiles(target)).toHaveLength(1)
    expect(data.notifyAirDeclarationMaterials(target)).toHaveLength(1)
  })
  it('超级管理员可下载合成报关原材料，但不能发送补齐通知', () => {
    data.selectWorkbenchPersona('superAdmin'); data.loadDemoOverview()
    const row = data.airDeclarations.value.find(row => row.materials.length)
    const target = [{ serviceId: row.id, materialId: row.materials[0].id }]
    expect(data.getAirDeclarationFiles(target)).toHaveLength(1)
    expect(() => data.notifyAirDeclarationMaterials(target)).toThrow('未获')
  })
})
