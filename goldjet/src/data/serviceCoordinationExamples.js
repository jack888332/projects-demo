import { PREALLOCATION_SUPPLIER } from '../domain/serviceCoordination.js'

// Deterministic synthetic preallocation execution records; no real customs interface is called.
export function createPreallocationSeed() {
  const receipt = (status, content) => ({ function: '预配申报', statusCode: status, content, receiptAt: '2026-09-06 11:20', receivedAt: '2026-09-06 11:21' })
  return {
    preallocationThresholdHours: 48,
    preallocationThresholdUpdatedAt: '2026-09-08 09:00',
    preallocationRecords: [
      {
        id: 'PRE-260908-001', orderId: 'AIR-260908-001', orderNo: 'GJ-AIR-260908-001', waybillNo: '781-90000010', customer: '启航跨境贸易',
        supplier: PREALLOCATION_SUPPLIER, createdAt: '2026-09-08 09:00', status: '进行中', serviceCompletedAt: '',
        shipper: '启航跨境贸易', consignee: 'DEMO CONSIGNEE',
        main: { sendStatus: '待发送', customsStatus: '待申报', sentAt: '', weight: 186.5, pieces: 42, receipt: null },
        houses: [
          { childNo: '01', sendStatus: '待发送', customsStatus: '待申报', sentAt: '', weight: 100, pieces: 20, receipt: null },
          { childNo: '02', sendStatus: '待发送', customsStatus: '待申报', sentAt: '', weight: 86.5, pieces: 22, receipt: null },
        ],
        history: [{ id: 'PRE-H1', event: '生成预配执行单', content: '大订单选择预配发送后形成执行单维度记录', actor: '系统', time: '2026-09-08 09:00' }],
      },
      {
        id: 'PRE-260908-002', orderId: 'AIR-260908-002', orderNo: 'GJ-AIR-260908-002', waybillNo: '', customer: '云帆供应链',
        supplier: PREALLOCATION_SUPPLIER, createdAt: '2026-09-08 10:20', status: '进行中', serviceCompletedAt: '',
        shipper: '云帆供应链', consignee: 'DEMO CONSIGNEE B',
        main: { sendStatus: '待发送', customsStatus: '待申报', sentAt: '', weight: 320, pieces: 68, receipt: null },
        houses: [],
        history: [{ id: 'PRE-H1', event: '生成预配执行单', content: '待发送到广州电子口岸', actor: '系统', time: '2026-09-08 10:20' }],
      },
      {
        id: 'PRE-260908-003', orderId: 'AIR-260908-003', orderNo: 'GJ-AIR-260908-003', waybillNo: '781-90000030', customer: '远洲电子商务',
        supplier: PREALLOCATION_SUPPLIER, createdAt: '2026-09-08 08:30', status: '进行中', serviceCompletedAt: '',
        shipper: '远洲电子商务', consignee: 'DEMO CONSIGNEE C',
        main: { sendStatus: '已发送', customsStatus: '待人工审核', sentAt: '2026-09-08 08:35', weight: 96, pieces: 24, receipt: { function: '预配申报', statusCode: '101', content: '已接收，待人工审核', receiptAt: '2026-09-08 08:36', receivedAt: '2026-09-08 08:36' } },
        houses: [],
        history: [{ id: 'PRE-H1', event: '发送', content: '主单已发送到广州电子口岸，等待人工审核', actor: '周倩', time: '2026-09-08 08:35' }],
      },
      {
        id: 'PRE-260906-004', orderId: 'AIR-260906-011', orderNo: 'GJ-AIR-260906-011', waybillNo: '781-90000050', customer: '星瀚品牌管理',
        supplier: PREALLOCATION_SUPPLIER, createdAt: '2026-09-06 09:00', status: '已完成', serviceCompletedAt: '2026-09-06 11:20',
        shipper: '星瀚品牌管理', consignee: 'DEMO CONSIGNEE D',
        main: { sendStatus: '已发送', customsStatus: '提运单放行', sentAt: '2026-09-06 09:05', weight: 138, pieces: 30, receipt: receipt('200', '提运单放行') },
        houses: [{ childNo: '01', sendStatus: '已发送', customsStatus: '提运单放行', sentAt: '2026-09-06 09:06', weight: 60, pieces: 12, receipt: receipt('200', '提运单放行') }],
        history: [{ id: 'PRE-H1', event: '发送', content: '主单与分单均已发送', actor: '周倩', time: '2026-09-06 09:06' }, { id: 'PRE-H2', event: '完成', content: '海关回执提运单放行，记录服务完成时间', actor: '系统', time: '2026-09-06 11:20' }],
      },
    ],
  }
}
