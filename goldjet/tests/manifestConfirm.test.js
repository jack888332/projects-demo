import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import {
  filterConfirmations, filterManifests, manifestGoodsCsvTemplate, parseManifestGoodsCsv,
  validateConfirmationDraft, validateManifestDraft,
} from '../src/domain/manifestAndConfirmation.js'

const data = usePrototypeData()
const manifest = id => data.state.originalManifests.find(row => row.id === id)
const confirmation = id => data.state.cargoConfirmations.find(row => row.id === id)
const manifestPayload = (values = {}) => ({
  batchNo: '3260908000004', waybillNo: '781-90006004', loadingTime: '2026-09-08 15:00:00', unloadCode: '5300 深圳',
  goodsValue: '100.00', totalPieces: '10', totalWeight: '20',
  goods: [{ id: 'M-G1', description: '演示商品', pieces: '10', weight: '20', packageType: 'CT 纸板箱', dangerNo: '', receiver: '', shipper: '', dangerContact: '' }],
  ...values,
})

describe('GJ-CUS-09 原始舱单申报与载货确报（030 §8～§9）', () => {
  beforeEach(() => { data.reset(); data.selectWorkbenchPersona('customsService') })

  it('筛选：批次号多值精确、装载时间精确、同步状态与确报类型', () => {
    expect(data.state.originalManifests).toHaveLength(3)
    const rows = data.state.originalManifests
    expect(filterManifests(rows, { batchNo: '3260908000001\n3260908000003' })).toHaveLength(2)
    expect(filterManifests(rows, { loadingTime: '2026-09-08 10:00:00' }).map(row => row.id)).toEqual(['OM-001'])
    expect(filterManifests(rows, { syncStatus: '失败' }).map(row => row.id)).toEqual(['OM-002'])
    expect(filterManifests(rows, { port: '5301 皇岗口岸', status: '海关退单' }).map(row => row.id)).toEqual(['OM-003'])
    expect(filterConfirmations(data.state.cargoConfirmations, { type: '进口载货承运确报' })).toHaveLength(2)
    expect(filterConfirmations(data.state.cargoConfirmations, { driverCode: 'D0001\nD0002' })).toHaveLength(2)
  })

  it('舱单校验：13位批次号、价值与件重格式、危险品联系人', () => {
    expect(validateManifestDraft({ batchNo: '123' })).toMatchObject({ batchNo: expect.stringContaining('13 位数字') })
    expect(validateManifestDraft({ batchNo: '3260908000001' })).toEqual({})
    expect(validateManifestDraft({ batchNo: '3260908000001', goodsValue: '12345678901234567' })).toMatchObject({ goodsValue: expect.any(String) })
    const submitErrors = validateManifestDraft({ batchNo: '3260908000001', loadingTime: '2026/09/08', goods: [] }, { submit: true })
    expect(submitErrors).toMatchObject({ loadingTime: expect.any(String), waybillNo: expect.any(String), goods: '至少一条商品信息' })
    const dangerErrors = validateManifestDraft({
      batchNo: '3260908000001',
      goods: [{ description: '演示商品', pieces: '10', weight: '20', dangerNo: 'DGR-01', dangerContact: '' }],
    }, { submit: true })
    expect(dangerErrors['goods.0.dangerContact']).toBeTruthy()
  })

  it('舱单保存、保存并申报与重新提交同步', () => {
    const record = data.saveManifest('', manifestPayload())
    expect(record).toMatchObject({ id: 'OM-004', status: '待报关', syncStatus: '', createdBy: '报关演示客服' })
    expect(record.logs.at(-1).action).toBe('新增舱单')
    const submitted = data.saveManifest(record.id, { ...record, goods: record.goods }, { submit: true })
    expect(submitted).toMatchObject({ status: '发送成功', syncStatus: '成功' })
    expect(submitted.receipts.at(-1)).toMatchObject({ type: '舱单申报', status: '发送成功' })
    expect(() => data.resubmitManifestSync(record.id)).toThrow('仅同步失败的舱单可以重新提交')
    const failed = manifest('OM-002')
    data.resubmitManifestSync(failed.id)
    expect(failed.syncStatus).toBe('成功')
    expect(failed.logs.at(-1).action).toBe('重新提交同步')
  })

  it('舱单修改资格：仅待报关、发送失败、海关退单可修改', () => {
    expect(() => data.saveManifest('OM-001', manifestPayload({ batchNo: '3260908000001' }))).toThrow('仅待报关、发送失败、海关退单的舱单可以修改')
    const returned = manifest('OM-003')
    data.saveManifest(returned.id, manifestPayload({ batchNo: returned.batchNo }), {})
    expect(returned.logs.at(-1).action).toBe('修改舱单')
    expect(returned.status).toBe('海关退单')
  })

  it('商品信息导入：模板表头精确匹配、任一错误整次失败', () => {
    expect(manifestGoodsCsvTemplate()).toContain('商品描述')
    expect(manifestGoodsCsvTemplate()).toContain('危险品联系人')
    const parsed = parseManifestGoodsCsv(`${manifestGoodsCsvTemplate()}"演示商品",10,20,"CT 纸板箱",,"DEMO 商家甲","DEMO 商家乙",\r\n`)
    expect(parsed.ok).toBe(true)
    expect(parsed.goods[0]).toMatchObject({ description: '演示商品', pieces: '10', weight: '20', receiver: 'DEMO 商家甲', shipper: 'DEMO 商家乙' })
    expect(parseManifestGoodsCsv('商品描述,货物件数\r\n"演示商品",10').ok).toBe(false)
    expect(parseManifestGoodsCsv(`${manifestGoodsCsvTemplate()}"演示商品",10,20,"CT 纸板箱","DGR-01",,,`).ok).toBe(false)
    expect(parseManifestGoodsCsv(`${manifestGoodsCsvTemplate()}"演示商品",10,20,"CT 纸板箱",,,`).ok).toBe(false)
  })

  it('确报保存、保存并提交、录入车辆信息与删除', () => {
    expect(validateConfirmationDraft({ batchNo: '123' })).toMatchObject({ batchNo: expect.any(String), type: '请选择确报类型' })
    const record = data.saveConfirmation('', { batchNo: '3260908000004', type: '进口载货承运确报', port: '5301 皇岗口岸' })
    expect(record).toMatchObject({ id: 'CC-004', status: '待报关', syncStatus: '' })
    const submitted = data.saveConfirmation(record.id, {
      ...record,
      vehicleCode: 'T009', vehicleName: '粤Z·DEMO9', driverCode: 'D0009', driverName: '演示司机壬',
    }, { submit: true })
    expect(submitted).toMatchObject({ status: '发送成功', syncStatus: '成功' })
    expect(submitted.receipts.at(-1)).toMatchObject({ type: '载货确报', status: '发送成功' })
    data.recordVehicleInfo(record.id, { vehicleCode: 'T010', driverName: '演示司机癸' })
    expect(record).toMatchObject({ vehicleCode: 'T010', driverName: '演示司机癸' })
    expect(record.logs.at(-1).action).toBe('录入车辆信息')
    data.deleteConfirmation(record.id)
    expect(confirmation(record.id)).toBeUndefined()
  })

  it('岗位边界与重置：其他角色只读、超级管理员只读、种子恢复', () => {
    data.selectWorkbenchPersona('operator')
    expect(() => data.saveManifest('', manifestPayload())).toThrow()
    data.selectWorkbenchPersona('superAdmin')
    expect(() => data.saveManifest('', manifestPayload())).toThrow()
    data.reset()
    expect(data.state.originalManifests).toHaveLength(3)
    expect(data.state.cargoConfirmations).toHaveLength(3)
    expect(manifest('OM-002')).toMatchObject({ syncStatus: '失败', status: '待报关' })
  })

  it('进口关务页接入舱单与确报页签', () => {
    const view = readFileSync(new URL('../src/views/BcImportCustomsView.vue', import.meta.url), 'utf8')
    expect(view).toContain('ManifestConfirmPanel')
    expect(view).toContain('舱单与确报')
  })

  it.each(['components/ManifestConfirmPanel.vue', 'views/BcImportCustomsView.vue'])('%s SFC可编译', file => {
    const parsed = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'))
    expect(parsed.errors).toEqual([])
    const script = compileScript(parsed.descriptor, { id: file })
    expect(compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  })
})
