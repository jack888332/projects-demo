export const receivableOrderFeeFixtures = [
  { businessNo: 'PF607701341575057408', lastMileNo: 'LJ00006908-1', firstMileNo: 'LJ00006908-1', freight: 126.36, deliverySurcharge: null, warehouseFee: 8.5, operationFee: null },
  { businessNo: 'PF607701341755412480', lastMileNo: 'LJ00006904-2', firstMileNo: 'LJ00006904-2', freight: 143.07, deliverySurcharge: null, warehouseFee: null, operationFee: 12 },
  { businessNo: 'PF607701342111928320', lastMileNo: 'LJ00006905', firstMileNo: 'LJ00006905', freight: 340.41, deliverySurcharge: null, warehouseFee: 16, operationFee: null },
  { businessNo: 'PF607701342355197952', lastMileNo: '1051653540', firstMileNo: '1051653540', freight: 30.75, deliverySurcharge: 18, warehouseFee: null, operationFee: null },
  { businessNo: 'PF607701342648799232', lastMileNo: '1051653562', firstMileNo: '1051653562', freight: 85.35, deliverySurcharge: null, warehouseFee: null, operationFee: 10 },
  { businessNo: 'PF607701342871097344', lastMileNo: '1051653573', firstMileNo: '1051653573', freight: 50.7, deliverySurcharge: 18, warehouseFee: 8.5, operationFee: null },
  { businessNo: 'PF607701343030480896', lastMileNo: '1051653455', firstMileNo: '1051653455', freight: 9.23, deliverySurcharge: 18, warehouseFee: null, operationFee: null },
  { businessNo: 'PF607701343168892928', lastMileNo: '1051653466', firstMileNo: '1051653466', freight: 732.81, deliverySurcharge: null, warehouseFee: 22, operationFee: 16 },
  { businessNo: 'PF607701343277944832', lastMileNo: 'LJ00006911', firstMileNo: 'LJ00006911', freight: 22.82, deliverySurcharge: 18, warehouseFee: null, operationFee: null },
  { businessNo: 'PF607701343441522688', lastMileNo: '1051653514', firstMileNo: '1051653514', freight: 135.92, deliverySurcharge: 18, warehouseFee: 12, operationFee: null },
  { businessNo: 'PF607701343588323328', lastMileNo: '1051653536', firstMileNo: '1051653536', freight: 158.93, deliverySurcharge: null, warehouseFee: null, operationFee: 10 },
  { businessNo: 'PF607701343865147392', lastMileNo: 'LJ00006903', firstMileNo: 'LJ00006903', freight: 416.13, deliverySurcharge: null, warehouseFee: 8.5, operationFee: null },
  { businessNo: 'PF607701344225857536', lastMileNo: 'LJ00006898-1', firstMileNo: 'LJ00006898-1', freight: 618.8, deliverySurcharge: null, warehouseFee: null, operationFee: 18 },
  { businessNo: 'PF607701344624316416', lastMileNo: 'LJ00006910-2', firstMileNo: 'LJ00006910-2', freight: 134.81, deliverySurcharge: null, warehouseFee: 12, operationFee: null },
]

export const refundDetailFixtures = [
  { billNo: 'PCB-OG0347-20260526-0a19', waybill: 'YT682941503GB', order: 'SO-260526-003952', signedAt: '2026/05/25 16:42', sourceCurrency: 'TWD', sourceAmount: 9780, codSurcharge: 0, payableRefund: 9780, specifiedDeduction: 0, provisionalRefund: 9780, refundRate: 1, settlementCurrency: 'TWD', actualRefund: 9780, returned: 2101, pending: 7679, state: '部分核销' },
  { billNo: 'PCB-OG0370-20260721-0a19', waybill: 'YT682941566TW', order: 'SO-260721-004221', signedAt: '2026/07/21 11:08', sourceCurrency: 'CNY', sourceAmount: 91640, codSurcharge: 0, payableRefund: 91640, specifiedDeduction: 3020, provisionalRefund: 88620, refundRate: 1, settlementCurrency: 'CNY', actualRefund: 88620, returned: 0, pending: 88620, state: '待核销' },
]

export const deductionDetailFixtures = [
  { billNo: 'PCB-OG0370-20260721-0a19', feeNo: 'FEE-COD-20260721-001', fee: '代收货款手续费', order: 'SO-260721-004221', waybill: 'YT682941566TW', originalCurrency: 'CNY', originalAmount: 3020, conversionRate: 1, sourceCurrency: 'CNY', deductionAmount: 3020, state: '已计入返款账单' },
]

export const billWriteoffFixtures = [
  { billNo: 'PCB-OG0347-20260526-0a19', no: 'WO-20260530-001', type: '返款核销', currency: 'TWD', amount: 2101, time: '2026/05/30 15:26', operator: '财务管理员' },
  { billNo: 'ARB-OG0360-20260601-81FF', no: 'WO-20260718-003', type: '应收核销', currency: 'CNY', amount: 8000, time: '2026/07/18 14:12', operator: '财务管理员' },
]

export const billAdjustmentLinkFixtures = [
  { billNo: 'ARB-OG0370-20260707-81FF', no: 'ADJ-AR-260715-001', type: '应收调账', status: '审核通过', fee: '派送附加费', objectNo: 'PF607701342355197952', currency: 'CNY', delta: 18, adjustedAt: '2026/07/15 10:24' },
  { billNo: 'PCB-OG0370-20260721-0a19', no: 'ADJ-RF-260728-004', type: '返款调账', status: '待审核', fee: '代收服务费', objectNo: 'SO-260721-004221', currency: 'CNY', delta: -320, adjustedAt: '2026/07/28 16:02' },
]
