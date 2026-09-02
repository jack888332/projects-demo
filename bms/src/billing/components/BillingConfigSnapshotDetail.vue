<script setup>
import { computed } from 'vue'
import StatusTag from '../../shared/components/StatusTag.vue'

const props = defineProps({ config: { type:Object, required:true } })
const periodLabels = { DAY_1:'1 自然天', DAY_7:'7 自然天', DAY_10:'10 自然天', DAY_15:'15 自然天', HALF_WEEK:'半周', WEEK:'周', HALF_MONTH:'半月', MONTH:'月' }
const businessLabels = { PEER:'同行订单', CONSOLIDATION:'集运订单', ECOMMERCE:'电商订单' }
const countryLabels = { TW:'中国台湾', JP:'日本', US:'美国', VN:'越南', MY:'马来西亚' }
const warehouseLabels = { SZ:'深圳集运仓', DG:'东莞集运仓', YW:'义乌集运仓' }
const nodeLabels = { WEIGHT_OUTBOUND:'出库时间', ORDER_COMPLETED:'订单完结' }
const feeLabels = { FREIGHT:'运输费', OVERSIZE_FEE:'超材费', REISSUE_FEE:'重出费', COD_SERVICE_FEE:'代收货款手续费', OTHER_RECEIVABLE_FEE:'其他应收费项', FEE0024:'必要归集金额', FALLBACK:'其他费项' }
const refundModeLabels = { RECEIVED:'回款返款', SIGNED:'签收返款' }
const negativePolicyLabels = { NEXT_REFUND_BILL:'转入下期返款账单', MANUAL_PROCESS:'转人工处理' }
const listText = (values, labels = {}) => values?.length ? values.map(value => labels[value] || value).join('、') : '无'
const effectText = value => value?.length ? `${value[0]} 至 ${value[1]}` : '未记录'
const settlementCurrency = value => value === 'SOURCE_CURRENCY' ? '随原始币种' : value || '未记录'
const versionStatus = computed(() => props.config.versionStatus || (props.config.isCurrent ? '生效' : '历史'))
const publishedAt = computed(() => props.config.publishedAt || props.config.updatedAt || '未记录')
const effectiveAt = computed(() => versionStatus.value === '已取消' ? '未生效' : props.config.effectiveAt || props.config.effectStart || '未记录')
const schemes = computed(() => {
  const snapshot = props.config.schemeSnapshot
  if (!snapshot) return []
  return [
    { ...snapshot.defaultScheme, schemeType:'默认方案', condition:'无条件兜底' },
    ...(snapshot.branches || []).map((scheme, index) => ({ ...scheme, schemeType:`分支方案 ${index + 1}`, condition:`订单类型：${listText(scheme.businessTypes, businessLabels)}；目的国：${listText(scheme.targetCountries, countryLabels)}；集运仓：${listText(scheme.warehouses, warehouseLabels)}` })),
  ]
})
const terms = computed(() => props.config.schemeSnapshot?.terms || {})
const refund = computed(() => props.config.refundSnapshot || {})
const overdueFeeText = computed(() => terms.value.overdueFee === undefined ? '未记录' : `${Number(terms.value.overdueFee) * 100}%/天`)
</script>

<template>
  <div class="billing-snapshot-detail">
    <el-descriptions :column="4" border>
      <el-descriptions-item label="版本状态"><StatusTag :label="versionStatus" /></el-descriptions-item>
      <el-descriptions-item label="发布时间">{{ publishedAt }}</el-descriptions-item>
      <el-descriptions-item label="生效时间">{{ effectiveAt }}</el-descriptions-item>
      <el-descriptions-item label="发布人">{{ props.config.operator || '未记录' }}</el-descriptions-item>
      <el-descriptions-item label="变更原因" :span="versionStatus === '已取消' ? 2 : 4">{{ props.config.changeReason || '未记录' }}</el-descriptions-item>
      <el-descriptions-item v-if="versionStatus === '已取消'" label="取消时间">{{ props.config.cancelledAt || '未记录' }}</el-descriptions-item>
      <el-descriptions-item v-if="versionStatus === '已取消'" label="取消原因">{{ props.config.cancelReason || '未记录' }}</el-descriptions-item>
    </el-descriptions>

    <template v-if="props.config.type === 'AR'">
      <section class="snapshot-section">
        <header><h3>应收方案详情</h3><span>共 {{ schemes.length }} 个方案</span></header>
        <article v-for="scheme in schemes" :key="scheme.schemeKey" class="snapshot-scheme">
          <div class="snapshot-scheme-title"><strong>{{ scheme.schemeType }}</strong><span>{{ scheme.schemeKey }}</span><StatusTag :label="scheme.enabled === false ? '停用' : '启用'" /></div>
          <p>{{ scheme.condition }}</p>
          <el-descriptions :column="4" border>
            <el-descriptions-item label="原始币种">{{ scheme.sourceCurrency || '未记录' }}</el-descriptions-item>
            <el-descriptions-item label="履约节点">{{ nodeLabels[scheme.node] || scheme.node || '未记录' }}</el-descriptions-item>
            <el-descriptions-item label="账期类型">{{ periodLabels[scheme.period] || scheme.period || '未记录' }}</el-descriptions-item>
            <el-descriptions-item label="账单发出时间">账期结束后 {{ scheme.sendAfterDays ?? '未记录' }} 天</el-descriptions-item>
            <el-descriptions-item label="方案生效周期" :span="4">{{ effectText(scheme.effectPeriod) }}</el-descriptions-item>
          </el-descriptions>
          <el-table :data="scheme.feeRules || []" border class="snapshot-rule-table">
            <el-table-column label="费项" min-width="160"><template #default="scope">{{ scope.row.fallback ? '其他费项（兜底）' : feeLabels[scope.row.feeCode] || scope.row.feeCode }}</template></el-table-column>
            <el-table-column label="结算币种" min-width="130"><template #default="scope">{{ settlementCurrency(scope.row.settlementCurrency) }}</template></el-table-column>
            <el-table-column label="规则类型" width="100"><template #default="scope">{{ scope.row.fallback ? '末行兜底' : '指定费项' }}</template></el-table-column>
          </el-table>
        </article>
      </section>
      <section class="snapshot-section">
        <header><h3>信用与合同条款</h3></header>
        <el-descriptions :column="3" border>
          <el-descriptions-item label="信用评级">{{ terms.creditRating || '未记录' }}</el-descriptions-item>
          <el-descriptions-item label="信用期限">{{ terms.creditTerm === undefined ? '未记录' : `${terms.creditTerm} 天` }}</el-descriptions-item>
          <el-descriptions-item label="逾期滞纳金">{{ overdueFeeText }}</el-descriptions-item>
          <el-descriptions-item label="垫资额度上限">{{ terms.advanceLimit ? `${terms.advanceLimit} CNY` : '未记录' }}</el-descriptions-item>
          <el-descriptions-item label="合同编号">{{ terms.contractNo || '未记录' }}</el-descriptions-item>
          <el-descriptions-item label="合同文件">{{ listText((terms.contractFiles || []).map(file => file.name)) }}</el-descriptions-item>
        </el-descriptions>
      </section>
    </template>

    <template v-else>
      <section class="snapshot-section">
        <header><h3>返款条款详情</h3></header>
        <el-descriptions :column="3" border>
          <el-descriptions-item label="启用状态">{{ refund.enabled === false ? '停用' : '启用' }}</el-descriptions-item>
          <el-descriptions-item label="返款模式">{{ refundModeLabels[refund.refundMode] || refund.refundMode || '未记录' }}</el-descriptions-item>
          <el-descriptions-item label="账期类型">{{ periodLabels[refund.billingPeriodType] || refund.billingPeriodType || '未记录' }}</el-descriptions-item>
          <el-descriptions-item label="半周起始日">{{ refund.billingPeriodType === 'HALF_WEEK' ? listText(refund.startDays) : '不适用' }}</el-descriptions-item>
          <el-descriptions-item label="账单发出时间">账期结束后 {{ refund.sendAfterDays ?? '未记录' }} 天</el-descriptions-item>
          <el-descriptions-item label="负数金额处理">{{ negativePolicyLabels[refund.negativePolicy] || refund.negativePolicy || '未记录' }}</el-descriptions-item>
          <el-descriptions-item label="必要归集金额" :span="3">{{ listText(refund.requiredFees, feeLabels) }}</el-descriptions-item>
          <el-descriptions-item label="直接扣减费项" :span="3">{{ listText(refund.directDeductFees, feeLabels) }}</el-descriptions-item>
          <el-descriptions-item label="条款生效周期" :span="3">{{ effectText(refund.effectPeriod) }}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="refund.currencyRules || []" border class="snapshot-rule-table">
          <el-table-column label="货款原始币种" min-width="140"><template #default="scope">{{ scope.row.fallback ? '其他币种（兜底）' : scope.row.sourceCurrency || '未记录' }}</template></el-table-column>
          <el-table-column prop="settlementCurrency" label="货款结算币种" min-width="140" />
          <el-table-column prop="accountName" label="客户收款账户" min-width="160" />
          <el-table-column prop="accountNo" label="账户号码" min-width="150" />
        </el-table>
      </section>
    </template>

    <div class="snapshot-note">该版本为只读完整快照，不随后续版本发布、客户引用变化或账单处理结果改变。</div>
  </div>
</template>

<style scoped>
.billing-snapshot-detail{display:grid;gap:12px}.snapshot-section{border:1px solid var(--border);background:#fff}.snapshot-section>header{min-height:44px;padding:0 14px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border);background:#f7f8fa}.snapshot-section h3{margin:0;font-size:var(--section-title-font-size)}.snapshot-section>header span,.snapshot-scheme-title span,.snapshot-scheme>p{color:#727e90;font-size:var(--font-size-sm)}.snapshot-scheme{padding:12px 14px;border-bottom:1px solid var(--border)}.snapshot-scheme:last-child{border-bottom:0}.snapshot-scheme-title{display:flex;align-items:center;gap:12px}.snapshot-scheme>p{margin:8px 0 10px}.snapshot-rule-table{margin-top:10px}.snapshot-note{color:#727e90;font-size:var(--font-size-sm)}@media(max-width:760px){.snapshot-scheme-title{align-items:flex-start;flex-direction:column;gap:4px}}
</style>
