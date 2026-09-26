import { TRUNK_NOW } from '../domain/trunkServices.js'

// 固定合成空运干线服务；来源订单、航班与时间为演示值。
export function createTrunkServiceSeed() {
  const service = (values) => ({
    id: '', serviceNo: '', orderId: '', orderNo: '', waybillNo: '', platformOrderNo: '', customer: '', businessType: '出口空运',
    status: '待接单', createdAt: '2026-09-08 09:00', acceptedAt: '', completedAt: '', node: '',
    supplier: '', airline: '', flight: '', actualDeparture: '',
    origin: '', destination: '', foamRatio: '全部', salesperson: '', departureDate: '', flightNo: '', specialCargo: '全部', waybillAttribute: '',
    cargo: { pieces: '', weight: '', volume: '', size: '', description: '' },
    cost: '', guidePrice: '', internalSettlementFoam: '', routeRemark: '', palletCompany: '', flights: [], attachments: [],
    history: [], ...values,
  })
  return {
    trunkServiceSequence: 4,
    trunkServices: [
      service({
        id: 'TS-260908-001', serviceNo: 'TV26090800001', mode: '委外空运', orderId: 'AIR-260908-002', orderNo: 'GJ-AIR-260908-002', customer: '云帆供应链', platformOrderNo: 'PDD-DEMO-260908-01',
        cargo: { pieces: 68, weight: 320, volume: 1.4, size: '120×100×110', description: '合成演示货物' }, history: [{ id: 'T1', event: '接单', actor: '系统', content: '来源订单选择委外空运后生成', time: '2026-09-08 09:00' }],
      }),
      service({
        id: 'TS-260908-002', serviceNo: 'TV26090800002', mode: '委外空运', orderId: 'AIR-260908-003', orderNo: 'GJ-AIR-260908-003', customer: '远洲电子商务', waybillNo: '',
        status: '进行中', acceptedAt: '2026-09-08 10:00', node: '已订舱', supplier: '东方航空', airline: 'MU 东方航空', flight: 'MU9001', actualDeparture: '2026-09-09',
        cargo: { pieces: 24, weight: 96, volume: 0.72, size: '', description: '合成演示货物' },
        history: [{ id: 'T1', event: '接单', actor: '航线运营', content: '确认航班并订舱', time: '2026-09-08 10:00' }],
      }),
      service({
        id: 'TS-260908-003', serviceNo: 'TV26090800003', mode: '我司空运', orderId: 'AIR-260908-001', orderNo: 'GJ-AIR-260908-001', customer: '启航跨境贸易', waybillNo: '781-90000010',
        origin: 'PVG', destination: 'LAX', foamRatio: '0.5', salesperson: '周倩', departureDate: '2026-09-10', flightNo: 'MU9001', specialCargo: '全部', waybillAttribute: '自营',
        status: '进行中', acceptedAt: '2026-09-08 09:30', node: '已订舱', supplier: '东方航空', airline: 'MU 东方航空', flight: 'MU9001',
        cost: '24.00', guidePrice: '28.00', internalSettlementFoam: '0.5', routeRemark: '优先晚班', palletCompany: 'MU 货站打板',
        cargo: { pieces: 42, weight: 186.5, volume: 1.28, size: '80×60×55', description: '合成演示货物' },
        flights: [{ departDate: '2026-09-10', flight: 'MU9001', takeoffTime: '20:00', arrivalTime: '08:00' }],
        history: [{ id: 'T1', event: '接单', actor: '航线运营', content: '订舱完成，等待干线到达', time: '2026-09-08 09:30' }],
      }),
      service({
        id: 'TS-260906-004', serviceNo: 'TV26090600004', mode: '我司空运', orderId: 'AIR-260906-011', orderNo: 'GJ-AIR-260906-011', customer: '星瀚品牌管理', waybillNo: '781-90000050',
        origin: 'PVG', destination: 'SIN', foamRatio: '全部', salesperson: '王晴', departureDate: '2026-09-08', flightNo: 'NH9003', specialCargo: '鲜活', waybillAttribute: '自营',
        status: '已完成', acceptedAt: '2026-09-06 09:10', completedAt: '2026-09-08 11:00', node: '干线到达', supplier: '全日空', airline: 'NH 全日空', flight: 'NH9003',
        cost: '20.00', guidePrice: '26.00', internalSettlementFoam: '0.4', routeRemark: '', palletCompany: '',
        cargo: { pieces: 30, weight: 138, volume: 0.58, size: '', description: '合成生鲜货物' },
        flights: [{ departDate: '2026-09-08', flight: 'NH9003', takeoffTime: '19:00', arrivalTime: '23:30' }],
        history: [{ id: 'T1', event: '接单', actor: '航线运营', content: '订舱完成', time: '2026-09-06 09:10' }, { id: 'T2', event: '完成', actor: '航线操作', content: '状态管理记录干线到达时间', time: '2026-09-08 11:00' }],
      }),
    ],
  }
}
