<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowUp, Delete, Plus, Search } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'
import {
  CUSTOMS_GOODS_COLUMNS, CUSTOMS_PRECLASSIFICATIONS,
  CUSTOMS_PREENTRY_GROUPS, buildCustomsPreentryPreviews, calculateCustomsGoodsTotal,
  createCustomsGoodsRow, createCustomsPreentryDraft, customsGoodsCsvTemplate,
  customsPreentryAccess, normalizeCustomsPreentry, parseCustomsGoodsCsv, renumberCustomsGoods, validateCustomsPreentry,
} from '../domain/customsPreentry.js'

const route = useRoute(), router = useRouter()
const { state, declarationSession, saveCustomsPreentry } = usePrototypeData()
const service = computed(() => state.customsServiceOrders.find(row => row.id === route.params.serviceId))
const declaration = computed(() => route.params.declarationId ? state.customsDeclarations.find(row => row.id === route.params.declarationId) : null)
const draft = ref(null), baseline = ref(''), failure = ref(''), busy = ref(false)
const submitted = ref(false), activeTab = ref('basic'), previewVisible = ref(false), previewType = ref('报关单')
const importError = ref(''), preclassVisible = ref(false), preclassSearch = ref(''), preclassTargetId = ref('')
const selectedGoodsIds = ref([]), goodsTable = ref()
let nextGoodsSequence = 1
const text = value => String(value ?? '').trim()

const routeUnsupported = computed(() => Boolean(declaration.value && declaration.value.typeLabel !== '进口整合申报'))
const access = computed(() => {
  if (route.params.declarationId) return declaration.value ? customsPreentryAccess(declaration.value, declarationSession.value.role, declarationSession.value.name) : { edit: false, save: false, submit: false, readOnly: true }
  const canWrite = declarationSession.value.role === 'customsService' && service.value?.status === '进行中' && service.value?.handler === declarationSession.value.name
  return { edit: canWrite, save: canWrite, submit: canWrite, readOnly: !canWrite }
})
const editable = computed(() => access.value.edit && !busy.value && !routeUnsupported.value)
const validation = computed(() => draft.value ? validateCustomsPreentry(draft.value, { submit: submitted.value }) : {})
const dirty = computed(() => Boolean(draft.value) && JSON.stringify(draft.value) !== baseline.value)
const previewRows = computed(() => buildCustomsPreentryPreviews(draft.value || {})[previewType.value] || [])
const pageError = computed(() => !service.value ? '未找到关务服务订单' : route.params.declarationId && !declaration.value ? '未找到报关单' : '')

function hydrate() {
  failure.value = ''
  importError.value = ''
  selectedGoodsIds.value = []
  const owner = service.value
  if (!owner || (route.params.declarationId && !declaration.value)) { draft.value = null; baseline.value = ''; return }
  draft.value = createCustomsPreentryDraft(owner, declaration.value)
  draft.value.goods = (draft.value.goods || []).map((row, index) => ({ ...row, id: row.id || `GOODS-${String(index + 1).padStart(3, '0')}`, itemNo: String(index + 1) }))
  nextGoodsSequence = draft.value.goods.length + 1
  baseline.value = JSON.stringify(draft.value)
  submitted.value = false
  activeTab.value = 'basic'
}
watch([() => route.params.serviceId, () => route.params.declarationId, () => `${declarationSession.value.role}:${declarationSession.value.name}`], hydrate, { immediate: true })

function showRequired(item) { return item.requiredness === 'required' || item.requiredness === 'default' }
function updateBasic(item, value) { draft.value.basic[item.key] = value }
function feeControlDisabled(key) {
  if (draft.value?.importExportFlag !== '进口') return false
  const mode = draft.value?.basic?.tradeMode
  const mapped = key.startsWith('freight') ? ['freightType', 'freightValue', 'freightCurrency'] : key.startsWith('insurance') ? ['insuranceType', 'insuranceValue', 'insuranceCurrency'] : []
  const groupHasValue = mapped.some(field => text(draft.value?.basic?.[field]))
  const feePrefix = key.startsWith('freight') ? 'freight' : key.startsWith('insurance') ? 'insurance' : key.startsWith('misc') ? 'misc' : ''
  if (key.endsWith('Currency') && draft.value?.basic?.[`${feePrefix}Type`] === '1-率' && !text(draft.value?.basic?.[key])) return true
  if (key.startsWith('freight') && ['CIF', 'C&F'].includes(mode) && !groupHasValue) return true
  if (key.startsWith('insurance') && mode === 'CIF' && !groupHasValue) return true
  return false
}
function prepareForSave(isSubmit) {
  if (!editable.value || !draft.value || !service.value) return null
  submitted.value = isSubmit
  draft.value = normalizeCustomsPreentry(draft.value)
  if (isSubmit) {
    const errors = validateCustomsPreentry(draft.value, { submit: true })
    if (Object.keys(errors).length) {
      activeTab.value = Object.keys(errors).some(key => key.startsWith('goods.')) ? 'goods' : 'basic'
      failure.value = Object.values(errors).slice(0, 4).join('；')
      return null
    }
  }
  busy.value = true
  failure.value = ''
  try {
    const saved = saveCustomsPreentry(service.value.id, declaration.value?.id || '', JSON.parse(JSON.stringify(draft.value)), { submit: isSubmit })
    draft.value = createCustomsPreentryDraft(service.value, saved)
    draft.value.goods = (draft.value.goods || []).map((row, index) => ({ ...row, id: row.id || `GOODS-${String(index + 1).padStart(3, '0')}`, itemNo: String(index + 1) }))
    nextGoodsSequence = draft.value.goods.length + 1
    baseline.value = JSON.stringify(draft.value)
    submitted.value = false
    return saved
  } catch (error) {
    failure.value = error.message
    if (error.fields) {
      const errors = Object.values(error.fields)
      failure.value = errors.slice(0, 4).join('；')
      if (Object.keys(error.fields).some(key => key.startsWith('goods.'))) activeTab.value = 'goods'
    }
    return null
  } finally { busy.value = false }
}
async function save() {
  const saved = prepareForSave(false)
  if (!saved) return
  if (!route.params.declarationId) await router.replace({ path: `/fulfillment/customs-orders/${service.value.id}/preentry/${saved.id}` })
  ElMessage.success('预录内容已保存，可继续编辑')
}
async function submit() {
  const saved = prepareForSave(true)
  if (!saved) return
  ElMessage.success('已提交复审，单据状态为待复审')
  await router.push({ path: '/fulfillment/customs-orders', query: { serviceId: service.value.id, declarationId: saved.id } })
}
async function generatePreview() {
  const saved = prepareForSave(false)
  if (!saved) return
  if (!route.params.declarationId) await router.replace({ path: `/fulfillment/customs-orders/${service.value.id}/preentry/${saved.id}` })
  previewType.value = '报关单'
  previewVisible.value = true
  ElMessage.success('已保存当前内容并更新单证预览')
}
async function allowLeave() {
  if (busy.value || !dirty.value) return true
  try { await ElMessageBox.confirm('离开将丢弃当前尚未保存的预录内容。', '放弃修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true }
  catch { return false }
}
onBeforeRouteLeave(allowLeave)
onBeforeRouteUpdate(async (to, from) => to.params.serviceId === from.params.serviceId && to.params.declarationId === from.params.declarationId ? true : await allowLeave())
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

function addGoods() {
  const sequence = nextGoodsSequence++
  draft.value.goods.push({ ...createCustomsGoodsRow(sequence), id: `GOODS-${String(sequence).padStart(3, '0')}` })
}
async function deleteGoods() {
  if (!selectedGoodsIds.value.length) { ElMessage.warning('请勾选至少一条商品记录'); return }
  try { await ElMessageBox.confirm('删除所选商品信息后不可恢复。', '删除商品信息', { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' }) }
  catch { return }
  draft.value.goods = renumberCustomsGoods(draft.value.goods.filter(row => !selectedGoodsIds.value.includes(row.id)))
  selectedGoodsIds.value = []; goodsTable.value?.clearSelection()
}
function moveGoods(direction) {
  if (selectedGoodsIds.value.length !== 1) { ElMessage.warning('请选择一条商品信息后上移或下移'); return }
  const index = draft.value.goods.findIndex(row => row.id === selectedGoodsIds.value[0])
  const target = index + direction
  if (index < 0 || target < 0 || target >= draft.value.goods.length) return
  const next = [...draft.value.goods]
  ;[next[index], next[target]] = [next[target], next[index]]
  draft.value.goods = renumberCustomsGoods(next)
}
function openPreclassification(row) { preclassTargetId.value = row.id; preclassSearch.value = row.productName || ''; preclassVisible.value = true }
function selectPreclassification(item) {
  const row = draft.value.goods.find(good => good.id === preclassTargetId.value)
  if (!row) return
  row.productCode = item.productCode; row.productName = item.productName; row.inspectionName = item.inspectionName; row.specModel = item.specModel
  preclassVisible.value = false
}
function downloadGoodsTemplate() {
  const blob = new Blob([customsGoodsCsvTemplate()], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = '普货报关单商品信息模板（原型CSV）.csv'; link.click(); URL.revokeObjectURL(link.href)
}
async function importGoods(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.csv')) { importError.value = 'PRD未定义 Excel 文件扩展名与模板；本原型只接受明确标注的 CSV 演示模板。'; return }
  if (draft.value.goods.length) {
    try { await ElMessageBox.confirm('导入成功后会覆盖当前商品信息，是否继续？', '覆盖当前商品信息', { confirmButtonText: '选择文件并校验', cancelButtonText: '取消', type: 'warning' }) }
    catch { return }
  }
  const parsed = parseCustomsGoodsCsv(await file.text())
  if (!parsed.ok) { importError.value = parsed.error; return }
  draft.value.goods = parsed.rows.map((row, index) => ({ ...row, id: `IMPORT-${nextGoodsSequence++}`, itemNo: String(index + 1) }))
  importError.value = ''
  selectedGoodsIds.value = []
  ElMessage.success(`已原子覆盖商品明细（${parsed.rows.length} 行）；尚未保存到报关单`)
}
function printPreview() { window.print() }
</script>

<template>
  <div class="module-view customs-preentry">
    <PageHeader title="报关单预录 · 进口整合申报" :description="service ? `${service.serviceNo} · ${service.orderNo} · ${service.customer}` : ''">
      <template #actions><el-button @click="router.push({ path: '/fulfillment/customs-orders', query: { serviceId: service?.id || '', declarationId: declaration?.id || '' } })">返回服务详情</el-button></template>
    </PageHeader>
    <el-empty v-if="pageError" :description="pageError" />
    <template v-else-if="draft">
      <div class="preentry-context"><StatusTag :label="declaration?.status || '未保存'" /><span>服务订单 {{ service.serviceNo }}</span><span>订单 {{ service.orderNo }}</span><span>{{ service.businessType }} · {{ service.transportMode }}</span><span v-if="declaration">单据编号 {{ declaration.docNo }}</span><span v-if="dirty" class="dirty-note">有未保存的修改</span></div>
      <el-alert v-if="routeUnsupported" type="warning" :closable="false" title="此切片只实现进口整合申报；概要/一次录入、出口整合/转关申报按后续切片推进。" />
      <el-alert v-else-if="!access.edit" type="warning" :closable="false" title="当前报关单只读；只有当前接单人可维护新增状态的进口整合申报。" />
      <el-alert class="preentry-notice" type="info" :closable="false" title="当前切片实现进口整合申报的基本信息与商品信息（028 §5.1.1、§5.1.3）。涉检信息、集装箱、随附单证、概要/一次录入/出口/转关模式及正式 Excel 模板不在本切片。固定申报主体/口岸默认见 CUSTOMS-B011；疑似映射见 CUSTOMS-B008/B009。" />
      <el-alert v-if="failure" type="error" :closable="false" :title="failure" show-icon />
      <el-tabs v-model="activeTab">
        <el-tab-pane label="基本信息" name="basic">
          <el-form label-position="top" class="preentry-form" :disabled="!editable">
            <section v-for="group in CUSTOMS_PREENTRY_GROUPS" :key="group.key" class="preentry-section">
              <h2>{{ group.title }}</h2>
              <div class="preentry-grid">
                <el-form-item v-for="item in group.fields" :key="item.key" :label="item.label" :required="showRequired(item)" :error="validation[`basic.${item.key}`]">
                  <template v-if="item.type === 'readonly'"><el-input :model-value="draft.basic[item.key]" readonly :placeholder="item.hint || '由系统回填；当前为空'" :aria-label="item.label" /></template>
                  <template v-else-if="item.type === 'select'"><el-select :model-value="draft.basic[item.key]" clearable :disabled="!editable" :aria-label="item.label" @update:model-value="value => updateBasic(item, value)"><el-option v-for="value in item.options" :key="value" :label="value" :value="value" /></el-select></template>
                  <template v-else-if="item.type === 'date'"><el-date-picker v-model="draft.basic[item.key]" value-format="YYYY-MM-DD" :disabled="!editable || item.readOnly" :aria-label="item.label" /></template>
                  <template v-else><el-input v-model="draft.basic[item.key]" :readonly="item.readOnly || !editable" :disabled="!editable || feeControlDisabled(item.key)" :maxlength="item.maxLength" :placeholder="item.hint" :aria-label="item.label" /></template>
                  <small v-if="item.requiredness === 'pending' || item.hint" class="field-hint">{{ item.requiredness === 'pending' ? `必填性待确认。${item.hint || ''}` : item.hint }}</small>
                </el-form-item>
              </div>
            </section>
            <el-alert type="info" :closable="false" title="保存不校验必填项并留在当前页；提交审核校验本切片明确的必填字段，保存并转为待复审。保存后的页面去向引用 CUSTOMS-B001：按预录动作留在当前页面。" />
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="商品信息" name="goods">
          <div class="goods-toolbar">
            <el-button v-business-write="'customsOrders'" :disabled="!editable" :icon="Plus" @click="addGoods">新增一行</el-button>
            <el-button v-business-write="'customsOrders'" :disabled="!editable || !selectedGoodsIds.length" :icon="Delete" @click="deleteGoods">删除</el-button>
            <el-button v-business-write="'customsOrders'" :disabled="!editable || selectedGoodsIds.length !== 1 || draft.goods.findIndex(row => row.id === selectedGoodsIds[0]) <= 0" :icon="ArrowUp" @click="moveGoods(-1)">上移</el-button>
            <el-button v-business-write="'customsOrders'" :disabled="!editable || selectedGoodsIds.length !== 1 || draft.goods.findIndex(row => row.id === selectedGoodsIds[0]) >= draft.goods.length - 1" :icon="ArrowDown" @click="moveGoods(1)">下移</el-button>
            <el-button :disabled="!editable" @click="downloadGoodsTemplate">下载模板（原型 CSV）</el-button>
            <label class="upload-action" :class="{ disabled: !editable }">导入 CSV<input type="file" accept=".csv,text/csv" :disabled="!editable" @change="importGoods" /></label>
            <span class="selected-note">勾选 {{ selectedGoodsIds.length }} 行</span>
          </div>
          <el-alert v-if="importError" type="error" :closable="false" :title="importError" />
          <p class="field-hint">商品编号手工录入或从合成历史归类候选选择；规格型号、检验检疫名称由候选带入。法定数量/单位依据 CUSTOMS-B009 锁定为待确认。表格在自身数据区横向滚动。</p>
          <div class="goods-table-scroll">
            <el-table ref="goodsTable" :data="draft.goods" stripe row-key="id" aria-label="进口整合申报商品信息" @selection-change="items => selectedGoodsIds = items.map(item => item.id)">
              <el-table-column type="selection" width="46" fixed="left" />
              <el-table-column v-for="[key, label, behavior] in CUSTOMS_GOODS_COLUMNS" :key="key" :label="label" :width="key === 'itemNo' ? 75 : key === 'productName' || key === 'specModel' ? 190 : 150" :fixed="key === 'itemNo' ? 'left' : false">
                <template #default="{ row }">
                  <span v-if="behavior === 'system'">{{ row.itemNo }}</span><span v-else-if="behavior === 'derived'">{{ calculateCustomsGoodsTotal(row) }}</span>
                  <span v-else-if="behavior === 'pending'" class="field-hint">{{ row[key] || '待确认' }}</span>
                  <template v-else-if="key === 'inspectionName' || key === 'specModel'"><el-input :model-value="row[key]" readonly :placeholder="key === 'specModel' ? '选预归类后回填' : '由预归类带入'" /></template>
                  <template v-else-if="key === 'productCode' || key === 'productName'"><div class="goods-cell-input"><el-input v-model="row[key]" :readonly="!editable" :aria-label="`${label}-${row.itemNo}`" /><el-button v-if="key === 'productName'" link :disabled="!editable" @click="openPreclassification(row)">预归类</el-button></div></template>
                  <template v-else><el-input :model-value="row[key]" :readonly="!editable" :aria-label="`${label}-${row.itemNo}`" @update:model-value="value => row[key] = value" /></template>
                  <span v-if="validation[`goods.${draft.goods.indexOf(row)}.${key}`]" class="field-error">{{ validation[`goods.${draft.goods.indexOf(row)}.${key}`] }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <p v-if="validation.goods" class="field-error" role="alert">{{ validation.goods }}</p>
        </el-tab-pane>
      </el-tabs>
      <div class="preentry-actions">
        <el-button @click="router.push({ path: '/fulfillment/customs-orders', query: { serviceId: service.id, declarationId: declaration?.id || '' } })">返回服务详情</el-button>
        <el-button v-business-write="'customsOrders'" :disabled="!access.save || busy" :loading="busy" @click="save">保存</el-button>
        <el-button v-business-write="'customsOrders'" :disabled="!access.save || busy" @click="generatePreview">生成预览</el-button>
        <el-button v-business-write="'customsOrders'" type="primary" :disabled="!access.submit || busy" :loading="busy" @click="submit">提交审核</el-button>
      </div>
    </template>

    <el-dialog v-model="preclassVisible" title="历史成功归类（合成演示候选）" width="min(760px, 96vw)" align-center>
      <el-input v-model="preclassSearch" :prefix-icon="Search" placeholder="按商品名称或商品编号筛选" clearable />
      <el-table :data="preclassRows" size="small" class="preclass-table"><el-table-column prop="productCode" label="商品编号" width="150" /><el-table-column prop="productName" label="商品名称" min-width="180" /><el-table-column prop="inspectionName" label="检验检疫名称" width="140" /><el-table-column prop="specModel" label="规格型号/申报要素" min-width="190" /><el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" @click="selectPreclassification(row)">选择</el-button></template></el-table-column></el-table>
      <el-alert type="info" :closable="false" title="候选为合成演示资料，真实历史成功归类数据库未接入。" />
      <template #footer><el-button @click="preclassVisible = false">取消</el-button></template>
    </el-dialog>

    <el-dialog v-model="previewVisible" title="单证预览" width="min(880px, 96vw)" align-center>
      <el-tabs v-model="previewType"><el-tab-pane v-for="name in ['报关单', '发票', '装箱单', '合同']" :key="name" :label="name" :name="name"><div class="document-preview"><h2>{{ name }}</h2><p class="document-subtitle">进口整合申报 · {{ service?.serviceNo }} · {{ service?.orderNo }} · {{ declaration?.docNo }}</p><el-table :data="previewRows" size="small" border><el-table-column prop="label" label="字段" width="240" /><el-table-column prop="value" label="预览值" min-width="320"><template #default="{ row }">{{ row.value || '（空）' }}<span v-if="row.status" class="field-hint">　{{ row.status }}</span></template></el-table-column></el-table></div></el-tab-pane></el-tabs>
      <el-alert type="info" :closable="false" title="预览依据已保存内容更新；正式 Excel/打印模板与印章未在本切片实现。CUSTOMS-B008 的疑似字段映射显示为待确认。" />
      <template #footer><el-button @click="previewVisible = false">关闭</el-button><el-button @click="printPreview">打印预览</el-button><el-button disabled>下载 Excel（模板待确认）</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.customs-preentry { min-width: 0; }
.preentry-context { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-bottom: 12px; color: var(--muted); font-size: 13px; }
.preentry-context .dirty-note { color: var(--warning, #bd8a25); font-weight: 600; }
.preentry-notice { margin-bottom: 12px; }
.preentry-section { margin: 14px 0; padding: 18px; background: #fff; border: 1px solid var(--border); border-radius: 8px; }
.preentry-section h2 { margin: 0 0 14px; font-size: 16px; }
.preentry-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 16px; }
.preentry-grid :deep(.el-input), .preentry-grid :deep(.el-select), .preentry-grid :deep(.el-date-editor) { width: 100%; }
.field-hint { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; line-height: 1.5; }
.field-error { display: block; margin-top: 4px; color: var(--danger); font-size: 12px; }
.goods-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0; }
.goods-table-scroll { width: 100%; overflow-x: auto; }
.goods-table-scroll :deep(.el-table) { min-width: 2200px; }
.goods-cell-input { display: flex; gap: 4px; align-items: center; min-width: 0; }
.upload-action { display: inline-flex; position: relative; align-items: center; min-height: 32px; padding: 0 12px; border: 1px solid var(--border); border-radius: 4px; background: #fff; cursor: pointer; color: var(--text); font-size: 14px; }
.upload-action.disabled { opacity: .5; pointer-events: none; }
.upload-action input { position: absolute; inset: 0; opacity: 0; width: 100%; cursor: pointer; }
.selected-note { color: var(--muted); font-size: 12px; }
.preentry-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding: 14px 0; }
.preclass-table { margin: 12px 0; }
.document-preview { min-height: 360px; padding: 12px 18px; background: #fff; }
.document-preview h2 { text-align: center; margin: 8px 0 12px; }
.document-subtitle { text-align: center; color: var(--muted); margin: 0 0 18px; }
@media (max-width: 900px) { .preentry-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .preentry-grid { grid-template-columns: minmax(0, 1fr); } .preentry-section { padding: 12px; } }
@media print { .preentry-context, .preentry-notice, .el-tabs, .preentry-actions, .goods-toolbar { display: none !important; } .document-preview { padding: 0; } }
</style>
