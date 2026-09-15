<script setup>
import { PARTNER_BASIC_FIELDS, PARTNER_BUSINESS_FIELDS, PARTNER_ROW_GROUPS, newPartnerRow, partnerAddress, partnerTerm } from '../domain/partnerPresentation.js'

const props = defineProps({
  model: { type: Object, required: true }, readonly: Boolean,
  locked: { type: Array, default: () => [] }, errors: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['credit-code-change'])
const isLocked = key => props.readonly || props.locked.includes(key)
const rowLocked = (group, row) => props.readonly || (props.model.id && props.model.type === '客户' && ['banks', 'contacts'].includes(group.key) && row.id)
const display = value => value === null || value === undefined || value === '' ? '未填写' : String(value)
function relationshipChanged() { props.model.creditCode = '' }
function countryChanged() { if (props.model.address.country !== '中国') Object.assign(props.model.address, { province: '', city: '', district: '' }) }
</script>

<template>
  <section v-for="group in [{ label:'基本信息', fields:PARTNER_BASIC_FIELDS }, { label:'业务信息', fields:PARTNER_BUSINESS_FIELDS }]" :key="group.label" class="partner-field-section">
    <h3>{{ group.label }}</h3>
    <div class="partner-field-grid">
      <el-form-item v-for="field in group.fields" :key="field.key" :label="field.label" :required="!readonly && (field.required || field.key === 'creditCode' && model.relationship === '境内机构')" :error="errors[field.key]">
        <div v-if="isLocked(field.key)" class="partner-readonly">{{ display(model[field.key]) }}</div>
        <el-select v-else-if="field.options" v-model="model[field.key]" :aria-label="field.label" @change="field.key === 'relationship' && relationshipChanged()"><el-option v-for="option in field.options" :key="option" :value="option" :label="String(option)" /></el-select>
        <el-input v-else v-model="model[field.key]" :maxlength="field.max" :aria-label="field.label" @blur="field.key === 'creditCode' && emit('credit-code-change')" />
      </el-form-item>
      <template v-if="group.label === '基本信息'">
        <el-form-item label="合作方编码"><div class="partner-readonly">{{ model.code || '保存后生成' }}</div></el-form-item>
        <el-form-item label="公司地址" class="partner-wide" required :error="errors.address || errors['address.country'] || errors['address.province'] || errors['address.city'] || errors['address.detail']">
          <div v-if="isLocked('address')" class="partner-readonly">{{ partnerAddress(model) || '未填写' }}</div>
          <div v-else class="partner-address">
            <el-input v-model="model.address.country" aria-label="国家" placeholder="国家" @change="countryChanged" />
            <el-input v-model="model.address.province" aria-label="省" placeholder="省" :disabled="model.address.country !== '中国'" />
            <el-input v-model="model.address.city" aria-label="市" placeholder="市" :disabled="model.address.country !== '中国'" />
            <el-input v-model="model.address.district" aria-label="区" placeholder="区（选填）" :disabled="model.address.country !== '中国'" />
            <el-input v-model="model.address.detail" aria-label="详细地址" placeholder="详细地址" class="partner-wide" />
          </div>
        </el-form-item>
        <el-form-item label="营业期限" required :error="errors.businessExpiry || errors.longTerm">
          <div v-if="isLocked('businessExpiry')" class="partner-readonly">{{ partnerTerm(model) }}</div>
          <template v-else><el-checkbox v-model="model.longTerm" @change="model.businessExpiry = ''">长期</el-checkbox><el-date-picker v-model="model.businessExpiry" :disabled="model.longTerm" value-format="YYYY-MM-DD" aria-label="营业期限" /></template>
        </el-form-item>
      </template>
    </div>
  </section>
  <section v-for="group in PARTNER_ROW_GROUPS" :key="group.key" class="partner-field-section">
    <div class="partner-section-heading"><h3>{{ group.label }}</h3><el-button v-if="!readonly" @click="model[group.key].push(newPartnerRow(group))">新增{{ group.label }}</el-button></div>
    <p v-if="!model[group.key].length" class="partner-empty">暂无{{ group.label }}</p>
    <div v-for="(row,index) in model[group.key]" :key="row.id || index" class="partner-child-row">
      <div class="partner-section-heading"><strong>{{ group.label }} {{ index + 1 }}</strong><el-button v-if="!readonly" type="danger" link @click="model[group.key].splice(index,1)">移除此行</el-button></div>
      <p v-if="!readonly && rowLocked(group,row)" class="partner-help">客户已保存行的字段编辑口径有冲突，暂只读；仍可新增或删除行。</p>
      <div class="partner-field-grid">
        <el-form-item v-for="field in group.fields" :key="field.key" :label="field.label" :required="!readonly && field.required" :error="errors[group.key+'.'+index+'.'+field.key]">
          <div v-if="rowLocked(group,row)" class="partner-readonly">{{ display(row[field.key]) }}</div>
          <el-select v-else-if="field.options" v-model="row[field.key]" :aria-label="group.label+(index+1)+field.label"><el-option v-for="value in field.options" :key="value" :value="value" /></el-select>
          <el-input v-else v-model="row[field.key]" :maxlength="field.max" :aria-label="group.label+(index+1)+field.label" />
        </el-form-item>
      </div>
    </div>
  </section>
</template>

<style scoped>
.partner-field-section { margin:20px 0; }
.partner-field-section h3 { margin:0 0 16px; font-size:16px; }
.partner-field-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr)); gap:0 20px; }
.partner-wide { grid-column:1 / -1; width:100%; }
.partner-address { width:100%; display:grid; grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr)); gap:8px; }
.partner-section-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; }
.partner-section-heading h3 { margin:0; }
.partner-child-row { padding:16px; border:1px solid var(--border); border-radius:6px; margin-bottom:12px; }
.partner-readonly { padding:6px 0; line-height:1.5; overflow-wrap:anywhere; white-space:pre-wrap; }
.partner-empty, .partner-help { color:var(--muted); font-size:13px; }
.partner-field-grid :deep(.el-select), .partner-field-grid :deep(.el-date-editor) { width:100%; }
</style>
