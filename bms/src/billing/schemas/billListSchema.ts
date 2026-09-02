import { createListPageSchema } from '../../shared/schemas/listSchema'

export const createBillListSchema = (isReceivable: boolean) => createListPageSchema({
  filters: [
    { key: 'billNo', label: '账单编号', type: 'text' },
    { key: 'customer', label: '客户名称/编码', type: 'text' },
    { key: 'shop', label: '所属店铺', type: 'text' },
    { key: 'group', label: '所属客户组', type: 'select', options: ['华东大客户组', '台湾大客户组'] },
    { key: 'batchNo', label: '生成批次编号', type: 'text' },
    { key: 'taskNo', label: '任务编号', type: 'text' },
    { key: 'configNo', label: '配置编号', type: 'text' },
    { key: 'configVersion', label: '准确版本', type: 'text' },
    { key: 'configSource', label: '配置来源', type: 'select', options: [{ value: 'CONFIG', label: '客户配置' }, { value: 'SYSTEM', label: '系统配置' }] },
    { key: 'customerReferenceNo', label: '客户配置引用', type: 'text' },
    { key: 'schemeText', label: '方案名称/标识', type: 'text' },
    { key: 'schemeType', label: '方案类型', type: 'select', options: ['默认方案', '分支方案', '不适用'] },
    { key: 'country', label: isReceivable ? '运抵国' : '目的国', type: 'select', options: ['台湾', '中國臺灣'] },
    { key: 'periodType', label: '账期类型', type: 'select', options: ['日', '7天', '周', '月'] },
    { key: 'period', label: '账期', type: 'date-range' },
  ],
  metrics: [
    { key: 'total', label: '账单总数', tone: 'blue' },
    { key: 'pendingReview', label: '待审核账单', tone: 'amber' },
    { key: 'pendingSettlement', label: '待结清', tone: 'violet' },
  ],
  columns: [
    { key: 'billNo', label: '账单编号', width: 205 },
    { key: 'status', label: '账单状态', width: 100, slot: 'status' },
    { key: 'periodType', label: '账期类型', width: 90 },
    { key: 'customer', label: '客户名称', width: 160 },
  ],
  rowActions: [{ key: 'detail', label: '详情' }, { key: 'recalculate', label: '账单重算' }],
  toolbarActions: ['field-display'],
})
