export function createGroundServiceSeed() {
  return {
    groundServiceRecords: [], groundServiceSequence: 0,
    groundServiceRegistry: {
      inbounds: [{ number: 'IN-DEMO-019-01', warehouseId: 'WH-260908-006' }, { number: 'IN-DEMO-019-02', warehouseId: 'WH-260908-007' }],
      pallets: [{ number: 'PALLET-DEMO-019-01', warehouseId: 'WH-260908-006' }],
      consignments: [
        { number: '781-90000001', orderId: 'AIR-260908-001', pickupNo: 'PICKUP-DEMO-019-01', packages: ['PKG-019-A', 'PKG-019-B', 'PKG-019-C'] },
        { number: '781-90000002', orderId: 'AIR-260908-002', pickupNo: '', packages: ['PKG-019-D'] },
      ],
      arrivals: [
        { number: 'SEAL-DEMO-019-A', orderId: 'AIR-260908-001', kind: 'internal', wmsOutbound: true },
        { number: 'SEAL-DEMO-019-B', orderId: 'AIR-260908-001', kind: 'internal', wmsOutbound: true },
        { number: 'SEAL-DEMO-019-C', orderId: 'AIR-260908-002', kind: 'internal', wmsOutbound: false },
        { number: 'EXTERNAL-DEMO-019', orderId: 'AIR-260908-003', kind: 'external' },
      ],
    },
  }
}
