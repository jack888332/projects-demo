import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { usePrototypeData } from '../src/data/usePrototypeData.js'
import * as orders from '../src/domain/groundOrders.js'
import * as operations from '../src/domain/groundOperations.js'
import { deriveWorkbenchTasks, getWorkbenchQuickLinks } from '../src/domain/workbenchTasks.js'

const data = usePrototypeData(), scopes = [], route = vue.reactive({ query: {} })
const router = { replace: vi.fn(async value => { route.query = typeof value === 'string' ? {} : value.query || {} }), push: vi.fn() }
const modules = { vue: {...vue,onMounted:()=>{},onBeforeUnmount:()=>{}}, 'vue-router': { useRoute: () => route, useRouter: () => router, onBeforeRouteLeave: () => {}, onBeforeRouteUpdate: () => {} },
  'element-plus': { ElMessage: { error:vi.fn(), warning:vi.fn(), success:vi.fn() }, ElMessageBox:{confirm:vi.fn(async () => true)} },
  '@element-plus/icons-vue': {}, '../data/usePrototypeData.js':{usePrototypeData:() => data}, '../domain/groundOrders.js':orders, '../domain/groundOperations.js':operations }
function setup(file = 'GroundDispatchView.vue') {
  const parsed = parse(readFileSync(new URL('../src/views/' + file, import.meta.url), 'utf8')), script = compileScript(parsed.descriptor, {id:file})
  const imported = {}, imports = script.scriptSetupAst.filter(node => node.type === 'ImportDeclaration')
  let body = parsed.descriptor.scriptSetup.content
  for (const node of imports) for (const item of node.specifiers) {
    const module = modules[node.source.value] || {default:{}}
    imported[item.local.name] = item.type === 'ImportDefaultSpecifier' ? module.default : module[item.imported.name]
  }
  for (const node of imports.toReversed()) body = body.slice(0,node.start) + body.slice(node.end)
  const run = new Function(...Object.keys(imported), body + '\nreturn {' + Object.keys(script.bindings).join(',') + '}')
  const scope = vue.effectScope(); scopes.push(scope); return scope.run(() => run(...Object.values(imported)))
}
beforeEach(() => { data.reset(); data.selectWorkbenchPersona('hangsheng'); route.query = {} })
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))

describe('GJ-015 页面投影与导航', () => {
  it('查询字段精确选择，状态默认未调度，编号与分单号不混查', () => {
    const view = setup()
    expect(view.rows.value).toHaveLength(3)
    view.filters.keyword = 'HAWB-DEMO-021'; expect(view.rows.value).toHaveLength(0)
    view.filters.searchKey = 'childNo'; expect(view.rows.value).toHaveLength(1)
    view.filters.keyword = 'HAWB-DEMO'; expect(view.rows.value).toHaveLength(0)
    Object.assign(view.filters, view.defaults(), {status:''}); expect(view.rows.value).toHaveLength(4)
  })
  it('运输/中转隔离与来源委托方显示，切换标签重置筛选/选中', async () => {
    data.state.groundOrders.push({...data.state.groundOrders[0],id:'TRANSFER-15',orderType:'中转订单',source:'空运系统API'})
    const view = setup(); expect(view.rows.value).toHaveLength(3)
    view.selectedIds.value = ['CAR-260908-021']; view.filters.customer = '启航跨境贸易'
    route.query = {tab:'transfer'}; await vue.nextTick()
    expect(view.rows.value.map(row=>row.id)).toEqual(['TRANSFER-15'])
    expect(view.filters.status).toBe(''); expect(view.selectedIds.value).toEqual([])
    expect(view.customerName(view.rows.value[0])).toBe('高捷物流集团-空运事业部')
  })
  it('修改调度使用既有运单、旧稿可见且终态按钮不可用', () => {
    const view = setup(), order = data.state.groundOrders[2], bill = data.state.groundWaybills[0]
    view.openDetail(order,'dispatch'); expect(view.bills.value).toHaveLength(1)
    expect(view.canModify(bill)).toBe(true); view.openModify(bill)
    expect(view.modifyingBillId.value).toBe(bill.id); expect(view.drafts.value[0].plate).toBe(bill.plate)
    bill.status = '提货中'; expect(view.canModify(bill)).toBe(false)
    expect(() => data.modifyGroundDispatch(bill.id,view.drafts.value[0])).toThrow('待提货')
    bill.status = '已卸货'; expect(view.canModify(bill)).toBe(false)
    const original = view.bills.value[0].dispatchUpdatedAt
    expect(view.orderCosts.value).toHaveLength(1)
    bill.updatedAt = '2026-09-10 15:00'; expect(view.bills.value[0].dispatchUpdatedAt).toBe(original)
  })
  it('重复客户单号深链不任取一笔；内部ID深链仍精确定位', async () => {
    const first = data.state.groundOrders[0]
    data.state.groundOrders.push({...first,id:'DUPLICATE-15'})
    route.query = {order:first.orderNo}; const view = setup()
    expect(view.routeError.value).toContain('多笔订单'); expect(view.detailVisible.value).toBe(false)
    route.query = {order:first.id}; await vue.nextTick()
    expect(view.selected.value.id).toBe(first.id); expect(view.detailVisible.value).toBe(true)
  })
  it('UPS仅精确配置主体显示，不因名称相似出现；更换客户清理隐藏过滤', async () => {
    const view = setup()
    view.filters.customer = 'UPS'; expect(view.showOrderType.value).toBe(false)
    data.state.groundUpsPartnerId = 'PT-00018'; view.filters.customer = '启航跨境贸易'
    expect(view.showOrderType.value).toBe(true); await vue.nextTick()
    view.filters.orderType = '空运部'; view.filters.customer = '云帆供应链'; await vue.nextTick()
    expect(view.filters.orderType).toBe('')
  })
  it('月报只对明确的陆运主管开放，切换角色清理已选月份', async () => {
    const view = setup('GroundMonthlyView.vue')
    expect(view.allowed.value).toBe(false); expect(view.rows.value).toEqual([])
    data.selectWorkbenchPersona('groundTransportSupervisor'); await vue.nextTick()
    expect(deriveWorkbenchTasks(data.state,'groundTransportSupervisor')).toEqual([])
    expect(getWorkbenchQuickLinks('groundTransportSupervisor')[0].target.path).toBe('/fulfillment/ground-monthly')
    expect(view.allowed.value).toBe(true); expect(view.rows.value[0]).toMatchObject({month:'2026-09',totalCount:0})
    view.month.value = '2026-09'; data.selectWorkbenchPersona('hangsheng'); await vue.nextTick()
    expect(view.rows.value).toEqual([]); expect(view.month.value).toBe('')
  })
})

describe('GJ-016 运单查询', () => {
  it('运输中转分列，封条号仅在中转中精确匹配', async () => {
    const bill = data.state.groundWaybills[0]
    data.state.groundOrders.push({...data.state.groundOrders[2],id:'TRANSFER-16',orderType:'中转订单'})
    data.state.groundWaybills.push({...bill,id:'BILL-16',waybillNo:'BILL-16',orderId:'TRANSFER-16',sealNo:'SEAL-16'})
    const view = setup('GroundWaybillsView.vue')
    expect(view.rows.value).toHaveLength(1)
    route.query = {tab:'transfer'}; await vue.nextTick()
    expect(view.rows.value[0].sealNo).toBe('SEAL-16')
    view.filters.keyword = 'SEAL'; expect(view.rows.value).toHaveLength(0)
    view.filters.keyword = 'SEAL-16'; expect(view.rows.value).toHaveLength(1)
  })
  it('重复业务单号不误关联，明确运单深链自动选择类型', async () => {
    const order = data.state.groundOrders[2], bill = data.state.groundWaybills[0]
    data.state.groundOrders.push({...order,id:'DUPLICATE-16'})
    route.query = {order:order.orderNo}; const view = setup('GroundWaybillsView.vue')
    expect(view.routeError.value).toContain('多笔订单'); expect(view.rows.value).toHaveLength(0)
    order.orderType = '中转订单'; route.query = {order:order.id,waybill:bill.id}; await vue.nextTick()
    expect(view.selected.value.id).toBe(bill.id); expect(view.listKind.value).toBe('transfer')
    expect(view.rows.value).toHaveLength(1)
  })
})
