import { createAirDraft, createBookingDraft } from '../domain/airOperations.js'
import { createAirSupplementDraft, createHouseBillDraft } from '../domain/airOrderSupplement.js'
import { calculateChargeWeight } from '../domain/chargeWeight.js'
import { GROUND_NOW } from '../domain/groundOperations.js'
import { buildAirDeclarationMaterialNotice, canManageAirDeclarations, deriveAirDeclarations, getAirDeclarationMaterialFile } from '../domain/airDeclarations.js'
import { appendAirNotification } from './airOrderActions.js'

const EXAMPLE = 'chapter012'
const array = value => Array.isArray(value) ? value : []

function receivedExamples() {
  const material = (id, name) => ({ id, name, fileName: `${name}.txt`, type: 'text/plain;charset=utf-8',
    content: `已收指令示例：${name}\n合成报关材料，仅用于本地下载演示。\n本文件不定义任何单证类型的必备材料或受理标准。\n` })
  const service = (id, documentType, attachments, cargo, createdAt) => ({
    id, type: 'customs', name: '报关', status: '待服务', customsStatus: '单证预审', createdAt,
    declarationExample: EXAMPLE, simulation: '已收指令示例；合成数据，未向外部系统发送报关指令', materialRequests: [],
    details: { choice: '我司报关', documentType, attachments, remark: '已收指令示例；不代表材料目录或上传受理规则已确认',
      phone: '000-00000120', goodsName: 'DEMO ELECTRONIC PARTS', ...cargo },
  })
  function order(id, orderType, destination, cargo, createdAt, waybillNo) {
    const result = {
      ...createAirDraft(), id, orderNo: `GJ-${id}`, orderType, businessType: '空运出口', customer: '启航跨境贸易',
      owner: '周倩', creator: '周倩', contact: '演示联系人', phone: '000-00000120', contactEmails: ['customs@example.invalid'],
      goodsName: '演示电子配件', product: 'MU-GENERAL', sellRate: 28, foamRatio: 0.5, ...cargo,
      origin: 'PVG', destination, route: `PVG - ${destination}`, departureDate: '2026-09-10', expectedDepartureDate: '2026-09-10',
      createdAt, createDate: createdAt.slice(0, 10), updatedAt: createdAt,
      orderStatus: '待出提单', bookingStatus: '服务已完成', bookingConfirmedAt: createdAt, bookingCompletedAt: createdAt,
      assignees: { operator: '李明', handler: '王晴', director: '航线总监' }, chargeWeight: calculateChargeWeight(cargo.grossWeight, cargo.volume),
      flight: 'MU9001', supplier: '东方航空', waybillNo, code: 'EAP', approval: null,
      declarationExample: EXAMPLE, source: '已收指令示例', bookingRequirement: '已收指令示例',
      childCount: orderType === '主单' ? 2 : 0, services: [{ id: `${id}-BOOKING`, type: 'booking', name: '订舱', status: '服务已完成' }],
    }
    result.booking = createBookingDraft({ departureDate: result.departureDate, booking: {
      airline: '东方航空', flight: 'MU9001', firstDestination: 'CAN', firstLeg: 'PVG - CAN', takeoffTime: '20:00', cutoffTime: '16:00',
      airCost: 24, guidePrice: 28, waybillType: '自营', secondLeg: 'CAN - NRT', secondDestination: 'NRT', thirdLeg: `NRT - ${destination}`,
      palletCompany: 'MU 货站打板', routeType: '国内中转',
    } })
    result.supplement = { ...createAirSupplementDraft(result), orderType, englishGoodsName: 'DEMO ELECTRONIC PARTS',
      shipper: 'SYNTHETIC SHIPPER\nDEMO ADDRESS', consignee: 'SYNTHETIC CONSIGNEE\nDEMO ADDRESS',
      groundServices: { preallocation: false, transfer: false, security: false, clearance: false, customs: orderType === '直单' },
    }
    return result
  }
  const directCargo = { pieces: 20, grossWeight: 100, volume: 0.8 }
  const direct = order('DEMO-CUSTOMS-DIRECT', '直单', 'LAX', directCargo, '2026-09-08 08:00', '781-90001201')
  const directService = service('DEMO-CUSTOMS-SERVICE-DIRECT', '代理出口报关', [
    material('DEMO-CUSTOMS-MATERIAL-D1', '演示材料一'), material('DEMO-CUSTOMS-MATERIAL-D2', '演示材料二'),
  ], directCargo, '2026-09-08 12:00')
  direct.services.push(directService)
  direct.supplement.customs = { ...directService.details, attachments: [...directService.details.attachments] }
  const main = order('DEMO-CUSTOMS-MAIN', '主单', 'FRA', { pieces: 30, grossWeight: 150, volume: 1.2 }, '2026-09-08 08:30', '781-90001202')
  const children = [1, 2].map(number => {
    const suffix = String(number).padStart(2, '0'), cargo = { pieces: 15, grossWeight: 75, volume: 0.6 }
    const customs = service(`DEMO-CUSTOMS-SERVICE-CHILD-${suffix}`, number === 1 ? '单证报关' : 'B2C报关',
      number === 1 ? [material('DEMO-CUSTOMS-MATERIAL-C1', '演示分单材料')] : [], cargo, `2026-09-08 12:${number}0`)
    return {
      ...createHouseBillDraft(main), id: `DEMO-CUSTOMS-CHILD-${suffix}`, orderNo: `GJ-DEMO-CUSTOMS-CHILD-${suffix}`,
      parentId: main.id, isChild: true, housebillNo: `DEMOCUST00${suffix}`, identifierSource: '合成演示编号',
      customer: main.customer, creator: '周倩', owner: '周倩', origin: main.origin, destination: main.destination,
      orderStatus: '子订单完成', cargoSource: '预计', ...cargo, currency: 'CNY', rate: 28,
      customs: { ...customs.details, attachments: [...customs.details.attachments] }, serviceRecords: [customs],
      createdAt: `2026-09-08 09:${number}0`, completedAt: customs.createdAt, updatedAt: customs.createdAt,
      declarationExample: EXAMPLE, source: '已收指令示例',
    }
  })
  return { orders: [direct, main], children }
}

export function createAirDeclarationActions(state, getSession) {
  function requireRole() {
    if (!canManageAirDeclarations(getSession())) throw new Error('仅报关行客服可操作报关材料')
  }
  function resolveTargets(targets) {
    requireRole()
    if (!Array.isArray(targets) || !targets.length) throw new Error('请选择需要处理的材料')
    const rows = deriveAirDeclarations(state), seen = new Set()
    return targets.map(target => {
      const key = JSON.stringify([target?.serviceId, target?.materialId])
      if (seen.has(key)) throw new Error('不可重复选择同一材料')
      seen.add(key)
      const matches = rows.filter(row => row.id === target?.serviceId)
      if (matches.length !== 1) throw new Error('报关服务不存在或标识不唯一，请刷新后重试')
      const row = matches[0], materials = row.materials.filter(material => material.id === target?.materialId)
      if (materials.length !== 1) throw new Error('所选材料已变化或标识不唯一，请刷新后重试')
      const order = state.airOrders.find(item => item.id === row.orderId)
      const child = row.childId ? state.airChildren.find(item => item.id === row.childId && item.parentId === order.id) : null
      const service = (child ? child.serviceRecords : order.services).find(item => item.id === row.id && item.type === 'customs')
      return { row, material: materials[0], order, service }
    })
  }
  function getAirDeclarationFiles(targets) {
    return resolveTargets(targets).map(({ material }) => getAirDeclarationMaterialFile(material))
  }
  function notifyAirDeclarationMaterials(targets) {
    const prepared = resolveTargets(targets).map(target => ({ ...target, ...buildAirDeclarationMaterialNotice(target.row, target.material) }))
    if ((state.messages !== undefined && !Array.isArray(state.messages)) || prepared.some(({ service }) => service.materialRequests !== undefined && !Array.isArray(service.materialRequests))) throw new Error('通知记录格式异常，未发送任何补齐通知')
    const pendingIds = new Set(deriveAirDeclarations(state).flatMap(row => row.materialRequests.map(request => request.id)))
    const requests = prepared.map(({ row, material, recipient, content }) => {
      let sequence = 1, id
      do { id = `${row.id}-MATERIAL-REQUEST-${sequence++}` } while (pendingIds.has(id))
      pendingIds.add(id)
      return { id, serviceId: row.id, recipient, createdAt: GROUND_NOW, materialId: material.id, materialName: material.name, content, status: 'pending' }
    })
    state.messages ||= []
    prepared.forEach(({ row, order, service }, index) => {
      service.materialRequests ||= []
      service.materialRequests.push(requests[index])
      appendAirNotification(state, order, '报关材料补齐', requests[index].recipient, requests[index].content, row.target)
    })
    return requests
  }
  function loadAirDeclarationExamples() {
    requireRole()
    if ((state.airOrders !== undefined && !Array.isArray(state.airOrders)) || (state.airChildren !== undefined && !Array.isArray(state.airChildren))) throw new Error('订单记录格式异常，未载入示例')
    const { orders, children } = receivedExamples()
    const currentOrders = array(state.airOrders), currentChildren = array(state.airChildren)
    for (const [examples, current] of [[orders, currentOrders], [children, currentChildren]]) {
      for (const example of examples) {
        const matches = current.filter(row => row.id === example.id)
        if (matches.length > 1 || matches.some(row => row.declarationExample !== EXAMPLE)) throw new Error('报关示例标识与现有记录冲突，未载入示例')
      }
    }
    const currentServices = [...currentOrders, ...currentChildren].flatMap(entity => [...array(entity.services), ...array(entity.serviceRecords)].map(service => ({ entity, service })))
    const exampleServices = [...orders, ...children].flatMap(entity => [...array(entity.services), ...array(entity.serviceRecords)].map(service => ({ entity, service })))
    for (const { entity, service } of exampleServices) {
      const matches = currentServices.filter(row => row.service.id === service.id)
      if (matches.length > 1 || matches.some(row => row.entity.id !== entity.id || row.entity.declarationExample !== EXAMPLE)) throw new Error('报关示例服务标识与现有记录冲突，未载入示例')
    }
    const addedOrders = orders.filter(order => !currentOrders.some(row => row.id === order.id))
    const addedChildren = children.filter(child => !currentChildren.some(row => row.id === child.id))
    state.airOrders ||= []
    state.airChildren ||= []
    state.airOrders.push(...addedOrders)
    state.airChildren.push(...addedChildren)
    return { addedOrders: addedOrders.length, addedChildren: addedChildren.length,
      addedServices: addedOrders.flatMap(order => order.services).filter(service => service.type === 'customs').length + addedChildren.flatMap(child => child.serviceRecords).length,
      rows: deriveAirDeclarations(state).filter(row => row.exampleLabel),
    }
  }
  return { loadAirDeclarationExamples, getAirDeclarationFiles, notifyAirDeclarationMaterials }
}
