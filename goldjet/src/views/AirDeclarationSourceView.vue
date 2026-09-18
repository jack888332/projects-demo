<script setup>
import { computed, unref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import { AIR_DECLARATION_MATERIAL_BLOCK_REASON, canManageAirDeclarations, getAirDeclarationMaterialFile } from '../domain/airDeclarations.js'

const route = useRoute(), router = useRouter()
const { state, airDeclarations, airChildSession, declarationSession } = usePrototypeData()
const session = computed(() => unref(airChildSession) || {})
const customsStaff = computed(() => canManageAirDeclarations(unref(declarationSession)))
const candidate = computed(() => {
  const matches = (unref(airDeclarations) || []).filter(row => row.id === route.params.serviceId && row.childId)
  return matches.length === 1 ? matches[0] : null
})
const permitted = computed(() => candidate.value && (customsStaff.value || (
  ['service', 'supervisor'].includes(session.value.role)
  && candidate.value.creator === session.value.name
  && candidate.value.materialRequests.some(request => request.recipient === session.value.name)
)))
const declaration = computed(() => permitted.value ? candidate.value : null)
const child = computed(() => declaration.value ? state.airChildren.find(row => row.id === declaration.value.childId) || null : null)
const requests = computed(() => declaration.value ? declaration.value.materialRequests.filter(request => customsStaff.value || request.recipient === session.value.name) : [])
const materials = computed(() => (declaration.value?.materials || []).map(material => {
  try { const { blob } = getAirDeclarationMaterialFile(material); return { ...material, size: blob.size, available: true } }
  catch { return { ...material, size: null, available: false } }
}))
const sections = computed(() => {
  if (!child.value) return []
  const source = child.value
  const groups = [
    { title: '分单信息', source, fields: [['orderNo', '分单订单号'], ['housebillNo', '分单号'], ['customer', '客户'], ['creator', '建单客服'], ['orderStatus', '分单状态'], ['origin', '始发港'], ['destination', '目的港'], ['createdAt', '创建时间'], ['updatedAt', '更新时间']] },
    { title: '提单资料', source, fields: [['englishGoodsName', '英文品名'], ['marks', '唛头'], ['customsDeclaredValue', '海关申报价值'], ['shipper', '发货人'], ['consignee', '收货人']] },
    { title: '预计货物与计费', source, fields: [['pieces', '预计件数（件）'], ['grossWeight', '预计毛重（kg）'], ['volume', '预计体积（m³）'], ['currency', '币种'], ['freightTerms', '运费条款'], ['otherCharges', '杂费预付到付'], ['paymentMethod', '付费方式'], ['rate', '费率（公布运价）'], ['warehouseInstruction', '仓库操作要求'], ['warehouseOperations', '仓储操作']] },
    { title: '本次报关服务', source: declaration.value.details, fields: [['choice', '报关选择'], ['customsType', '报关类型'], ['documentType', '单证类型'], ['phone', '报关员电话'], ['pieces', '中转件数（件）'], ['grossWeight', '中转重量（kg）'], ['volume', '中转体积（m³）'], ['goodsName', '品名'], ['remark', '报关备注']] },
  ]
  if (source.services?.pickup) groups.push({ title: '分单提货信息', source: source.pickup || {}, fields: [['supplier', '提货供应商'], ['time', '提货时间'], ['region', '提货点省 / 市 / 区'], ['address', '提货点详细地址'], ['contact', '提货联系人'], ['phone', '提货电话'], ['arrivalAddress', '到货点'], ['arrivalContact', '到货联系人'], ['arrivalPhone', '到货电话'], ['vehicleType', '特种车'], ['remark', '提货备注']] })
  if (source.services?.clearance) groups.push({ title: '分单清关派送信息', source: source.clearance || {}, fields: [['secondDepartureDate', '二程出港日期'], ['expectedArrival', '预计到达时间'], ['deliveryAddress', '派送地址'], ['phone', '派送电话'], ['contact', '派送联系人'], ['remark', '清关派送备注']] })
  return groups
})
function display(value) {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return '未填写'
  if (Array.isArray(value)) return value.join('、')
  if (typeof value === 'object') return value.printText || '未填写'
  return value
}
function back() {
  return router.push(customsStaff.value && declaration.value
    ? { path: '/fulfillment/declarations', query: { service: declaration.value.id } }
    : { path: '/foundation/messages' })
}
</script>

<template>
  <div class="module-view declaration-source-view">
    <PageHeader title="分单报关来源" :description="child ? `${child.housebillNo || '分单号未填写'} · ${declaration.id}` : ''"><template #actions><el-button @click="back">{{ customsStaff && declaration ? '返回报关服务' : '返回消息通知' }}</el-button></template></PageHeader>
    <el-empty v-if="!child" description="报关服务不存在或当前角色无权查看" />
    <template v-else>
      <div class="source-context"><StatusTag :label="child.orderStatus" /><span>报关状态：{{ declaration.customsStatus }}</span><span>服务状态：{{ declaration.serviceStatus || '未提供' }}</span><span v-if="!declaration.orderId">{{ child.parentId ? '关联的主订单已不存在' : '该分单当前未关联主订单' }}</span></div>
      <el-alert v-if="declaration.notifyBlockReason" :title="declaration.notifyBlockReason" type="warning" :closable="false" class="source-warning" />
      <el-alert :title="AIR_DECLARATION_MATERIAL_BLOCK_REASON" type="info" :closable="false" />
      <section v-if="requests.length" class="source-section" aria-label="分单报关材料补齐通知">
        <h2>报关材料补齐通知</h2>
        <p class="source-hint">查看来源不会完成待办；要求补齐的材料更新并保存后任务才完成。</p>
        <div class="source-table"><el-table :data="requests" row-key="id" aria-label="当前分单报关材料通知"><el-table-column prop="materialName" label="材料名称" min-width="150" /><el-table-column prop="recipient" label="接收人" min-width="110" /><el-table-column prop="content" label="通知内容" min-width="300" /><el-table-column prop="createdAt" label="接收时间" min-width="170" /><el-table-column label="处理状态" width="105"><template #default><el-tag type="warning">未完成</el-tag></template></el-table-column></el-table></div>
      </section>
      <section v-for="section in sections" :key="section.title" class="source-section"><h2>{{ section.title }}</h2><dl class="source-fields"><div v-for="[key, label] in section.fields" :key="key"><dt>{{ label }}</dt><dd>{{ key === 'customsType' && !section.source[key] ? '与报关选择的对应关系待确认' : display(section.source[key]) }}</dd></div></dl></section>
      <section class="source-section" aria-label="分单已上传报关材料">
        <h2>已上传报关材料</h2>
        <p class="source-hint">本页只读；报关行客服可返回报关服务下载材料或发起补齐通知。</p>
        <div class="source-table"><el-table :data="materials" row-key="id" aria-label="分单报关材料清单" empty-text="尚无已上传材料"><el-table-column prop="name" label="材料名称" min-width="150" /><el-table-column prop="fileName" label="原文件名" min-width="200" /><el-table-column label="原文件" width="130"><template #default="{ row }">{{ row.available ? `${row.size} 字节` : '原文件不可用' }}</template></el-table-column></el-table></div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.declaration-source-view { min-width: 0; }
.source-context { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; font-size: 13px; }
.source-warning { margin-bottom: 12px; }
.source-section { margin: 16px 0; padding: 20px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); min-width: 0; }
.source-section h2 { margin: 0 0 16px; font-size: 17px; }
.source-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr)); gap: 18px 24px; margin: 0; }
.source-fields div { min-width: 0; }
.source-fields dt { margin-bottom: 6px; color: var(--muted); font-size: 12px; }
.source-fields dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
.source-table { max-width: 100%; overflow-x: auto; }
.source-hint { color: var(--muted); font-size: 13px; line-height: 1.7; }
</style>
