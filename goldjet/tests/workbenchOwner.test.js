import { beforeEach, describe, expect, it } from 'vitest'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import { deriveWorkbenchTasks, getWorkbenchSummary } from '../src/domain/workbenchTasks.js'
import { createDispatchDraft } from '../src/domain/groundOperations.js'

const data = usePrototypeData()
beforeEach(() => data.reset())
describe('工作台与唯一数据 owner 的衔接', () => {
  it('切换角色同步业务会话，离开角色不得保留写入权限', () => {
    data.selectWorkbenchPersona('operator')
    expect(data.airSession).toMatchObject({ role: 'operator', name: '李明' })
    expect(data.groundSession.role).toBe('viewer')
    data.selectWorkbenchPersona('hangsheng')
    expect(data.airSession.role).toBe('viewer')
    expect(data.groundSession).toMatchObject({ role: 'hangsheng', name: '陈楠' })
    data.selectWorkbenchPersona('finance')
    expect(data.groundSession.role).toBe('viewer')
  })

  it('调度完成同步待办、已处理与进度变化时间；无关字段更新不刷新时间', () => {
    data.selectWorkbenchPersona('hangsheng')
    const before = getWorkbenchSummary(deriveWorkbenchTasks(data.state, 'hangsheng'))
    const firstTime = data.state.workbenchProgress.hangsheng.updatedAt
    data.dispatchGroundOrders(['CAR-260908-021'], [{ ...createDispatchDraft(), vehicleType: '3T/4.2', supplier: '安航车队', plate: '沪A·DEMO1' }])
    expect(getWorkbenchSummary(deriveWorkbenchTasks(data.state, 'hangsheng'))).toMatchObject({ pending: before.pending - 1, completed: before.completed + 1 })
    expect(data.state.workbenchProgress.hangsheng.updatedAt).not.toBe(firstTime)
    const changedTime = data.state.workbenchProgress.hangsheng.updatedAt
    data.state.groundOrders[0].remark = '仅更新备注'
    expect(data.state.workbenchProgress.hangsheng.updatedAt).toBe(changedTime)
    data.reset()
    expect(data.workbenchSession.personaId).toBe('service')
    expect(data.state.workbenchProgress.hangsheng.updatedAt).toBe('2026-09-08 14:30:00')
    expect(getWorkbenchSummary(deriveWorkbenchTasks(data.state, 'hangsheng'))).toEqual(before)
  })
})
