<script setup>
import { computed, nextTick, ref } from 'vue'
import dayjs from 'dayjs'
import { ArrowDown, CircleClose, Search } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: [String, Number, Array, Object], default: '' },
  label: { type: String, required: true },
  type: { type: String, default: 'select' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请填入' },
  searchPlaceholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  clearable: { type: Boolean, default: true },
  popoverWidth: { type: Number, default: 320 },
})

const emit = defineEmits(['update:modelValue', 'change'])
const panelVisible = ref(false)
const draft = ref('')
const optionSearch = ref('')
const periodMode = ref('month')
const periodDraft = ref([])
const referenceRef = ref(null)
const datePickerRef = ref(null)
const panelInputRef = ref(null)

const normalizedOptions = computed(() => props.options.map((item) => typeof item === 'object'
  ? { label: item.label, value: item.value, secondary: item.secondary || '' }
  : { label: String(item), value: item, secondary: '' }))
const selectedOption = computed(() => normalizedOptions.value.find((item) => item.value === props.modelValue))
const isDateRange = computed(() => props.type === 'date-range')
const isMonth = computed(() => props.type === 'month')
const isPeriodRange = computed(() => props.type === 'period-range')
const isDatePicker = computed(() => isDateRange.value || isMonth.value)
const hasValue = computed(() => {
  if (isPeriodRange.value) return Array.isArray(props.modelValue?.value) && props.modelValue.value.length === 2
  if (isDateRange.value) return Array.isArray(props.modelValue) && props.modelValue.length === 2
  return props.modelValue !== '' && props.modelValue !== null && props.modelValue !== undefined
})
const displayValue = computed(() => {
  if (!hasValue.value) return props.placeholder
  if (isPeriodRange.value) {
    const [start, end] = props.modelValue.value
    if (props.modelValue.mode === 'month') {
      const startLabel = dayjs(start).format('YYYY年MM月')
      const endLabel = dayjs(end).format('YYYY年MM月')
      return start === end ? startLabel : `${startLabel} - ${endLabel}`
    }
    return [start, end].map((value) => dayjs(value).format('YYYY/MM/DD')).join(' - ')
  }
  if (isDateRange.value) return props.modelValue.map((value) => dayjs(value).format('YYYY/MM/DD')).join(' - ')
  if (isMonth.value) return dayjs(props.modelValue).format('YYYY年MM月')
  return selectedOption.value?.label || String(props.modelValue)
})
const filteredOptions = computed(() => {
  const keyword = optionSearch.value.trim().toLowerCase()
  if (!keyword) return normalizedOptions.value
  return normalizedOptions.value.filter((item) => `${item.label}${item.value}${item.secondary}`.toLowerCase().includes(keyword))
})
const dateModel = computed({
  get: () => props.modelValue,
  set: (value) => update(value || []),
})

function update(value) {
  emit('update:modelValue', value)
  emit('change', value)
}
function preparePanel() {
  if (props.disabled || isDatePicker.value) return
  if (isPeriodRange.value) {
    periodMode.value = props.modelValue?.mode || 'month'
    periodDraft.value = Array.isArray(props.modelValue?.value) ? [...props.modelValue.value] : []
  }
  draft.value = props.type === 'text' && hasValue.value ? String(props.modelValue) : ''
  optionSearch.value = ''
}
function openPanel() {
  if (props.disabled) return
  if (isDatePicker.value) return datePickerRef.value?.handleOpen()
  preparePanel()
  panelVisible.value = true
}
async function focusPanelInput() {
  await nextTick()
  panelInputRef.value?.focus()
}
function clear(event) {
  event?.stopPropagation()
  if (isPeriodRange.value) update({ mode: props.modelValue?.mode || periodMode.value, value: [] })
  else update(isDateRange.value ? [] : '')
  panelVisible.value = false
  datePickerRef.value?.handleClose()
}
async function closeAndBlur() {
  panelVisible.value = false
  draft.value = ''
  optionSearch.value = ''
  await nextTick()
  referenceRef.value?.blur()
  window.getSelection()?.removeAllRanges()
}
async function applyText(event) {
  if (event?.isComposing) return
  const value = draft.value.trim()
  update(value)
  event?.target?.blur()
  await closeAndBlur()
}
async function selectOption(option) {
  update(option.value)
  await closeAndBlur()
}
function changePeriodMode(mode) {
  periodMode.value = mode
  periodDraft.value = []
}
async function applyPeriodRange(value) {
  if (!Array.isArray(value) || value.length !== 2) return
  update({ mode: periodMode.value, value: [...value] })
  await closeAndBlur()
}
function closeDatePicker() {
  datePickerRef.value?.handleClose()
  referenceRef.value?.blur()
}
</script>

<template>
  <div
    class="condition-filter"
    :class="{ active: hasValue, disabled }"
  >
    <div
      v-if="isDatePicker"
      ref="referenceRef"
      class="condition-filter-reference"
      role="button"
      :tabindex="disabled ? -1 : 0"
      :aria-label="label"
      :aria-disabled="disabled"
      @click="openPanel"
      @keydown.enter.space.prevent="openPanel"
    >
      <span class="condition-filter-label">{{ label }}</span>
      <span class="condition-filter-value" :title="hasValue ? displayValue : undefined">{{ displayValue }}</span>
      <el-icon v-if="hasValue && clearable" class="condition-filter-clear" role="button" :tabindex="disabled ? -1 : 0" :aria-label="`清除${label}`" title="清除" @click.stop="clear" @keydown.enter.space.stop.prevent="clear"><CircleClose /></el-icon>
      <el-icon v-else class="condition-filter-arrow"><ArrowDown /></el-icon>
    </div>
    <el-date-picker
      v-if="isDatePicker"
      ref="datePickerRef"
      v-model="dateModel"
      class="condition-date-anchor"
      style="position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; pointer-events: none;"
      :type="isMonth ? 'month' : 'daterange'"
      :format="isMonth ? 'YYYY年MM月' : undefined"
      :value-format="isMonth ? 'YYYY-MM' : undefined"
      popper-class="condition-date-popper"
      :editable="false"
      :disabled="disabled"
      tabindex="-1"
      aria-hidden="true"
      @change="closeDatePicker"
    />

    <el-popover
      v-else
      v-model:visible="panelVisible"
    :disabled="disabled"
    placement="bottom-start"
    :width="popoverWidth"
    trigger="click"
    :show-after="0"
    :hide-after="0"
    transition=""
    popper-class="condition-filter-popper"
    @show="focusPanelInput"
  >
      <template #reference>
        <div
          ref="referenceRef"
          class="condition-filter-reference"
          role="button"
          :tabindex="disabled ? -1 : 0"
          :aria-label="label"
          :aria-disabled="disabled"
          @click="preparePanel"
          @keydown.enter.space.prevent="openPanel"
        >
          <span class="condition-filter-label">{{ label }}</span>
          <span class="condition-filter-value" :title="hasValue ? displayValue : undefined">{{ displayValue }}</span>
          <el-icon v-if="hasValue && clearable" class="condition-filter-clear" role="button" :tabindex="disabled ? -1 : 0" :aria-label="`清除${label}`" title="清除" @click.stop="clear" @keydown.enter.space.stop.prevent="clear"><CircleClose /></el-icon>
          <el-icon v-else class="condition-filter-arrow"><ArrowDown /></el-icon>
        </div>
      </template>

      <div class="condition-filter-panel">
        <template v-if="isPeriodRange">
          <div class="condition-period-modes" role="tablist" aria-label="账期范围类型">
            <button type="button" :class="{ active: periodMode === 'month' }" @click="changePeriodMode('month')">月份范围</button>
            <button type="button" :class="{ active: periodMode === 'date' }" @click="changePeriodMode('date')">日期范围</button>
          </div>
          <el-date-picker
            v-model="periodDraft"
            class="condition-period-picker"
            :type="periodMode === 'month' ? 'monthrange' : 'daterange'"
            :format="periodMode === 'month' ? 'YYYY年MM月' : 'YYYY/MM/DD'"
            :value-format="periodMode === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            :editable="false"
            :teleported="false"
            @change="applyPeriodRange"
          />
        </template>
        <el-input
          v-else-if="type === 'text'"
          ref="panelInputRef"
          v-model="draft"
          :prefix-icon="Search"
          :placeholder="searchPlaceholder || `输入${label}`"
          clearable
          @keyup.enter.stop="applyText"
        />
        <el-input
          v-else-if="normalizedOptions.length > 6"
          ref="panelInputRef"
          v-model="optionSearch"
          :prefix-icon="Search"
          :placeholder="`搜索${label}`"
          clearable
        />
        <div v-if="normalizedOptions.length" class="condition-filter-options">
          <button
            v-for="option in filteredOptions"
            :key="option.value"
            type="button"
            :class="{ active: modelValue === option.value }"
            @click="selectOption(option)"
          >
            <strong>{{ option.label }}</strong>
            <small v-if="option.secondary">{{ option.secondary }}</small>
          </button>
          <div v-if="!filteredOptions.length" class="condition-filter-empty">未找到匹配项</div>
        </div>
      </div>
    </el-popover>
  </div>
</template>

<style scoped>
.condition-filter { position: relative; box-sizing: border-box; width: max-content; min-width: 0; max-width: 100%; height: 32px; min-height: 32px; padding: 0; display: inline-flex; flex: 0 0 auto; align-items: center; overflow: hidden; border: 1px solid #cfd4de; border-radius: 2px; color: #232b3b; background: #fff; transition: border-color .16s ease, background-color .16s ease, box-shadow .16s ease; }
.condition-filter:hover { border-color: var(--primary-border); }
.condition-filter:focus-within { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-focus-ring); }
.condition-filter.active { border-color: var(--primary); background: var(--primary-soft); }
.condition-filter.disabled { opacity: .5; cursor: not-allowed; }
.condition-filter.disabled .condition-filter-reference { cursor: not-allowed; }
.condition-filter-label { flex: 0 0 auto; white-space: nowrap; }
.condition-filter-reference { width: max-content; min-width: 0; max-width: 100%; min-height: 30px; padding: 0 var(--space-3); display: flex; flex: 1 1 auto; align-items: center; gap: var(--space-3); overflow: hidden; outline: none; cursor: pointer; }
.condition-filter-value { min-width: 0; flex: 0 1 auto; overflow: hidden; color: #7b8494; text-overflow: ellipsis; white-space: nowrap; }
.condition-filter.active .condition-filter-value { color: var(--primary-strong); font-weight: var(--font-weight-semibold); }
.condition-filter-arrow, .condition-filter-clear { flex: 0 0 auto; color: #8a93a2; }
.condition-filter-clear:hover { color: var(--primary); }
.condition-date-anchor { position: absolute !important; inset: 0; width: 100% !important; height: 100%; opacity: 0 !important; pointer-events: none; }
.condition-filter-panel { display: grid; gap: var(--space-3); }
.condition-period-modes { padding: 2px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px; border: 1px solid var(--border); border-radius: 2px; background: #f4f5f8; }
.condition-period-modes button { min-height: 30px; padding: 0 var(--space-3); border: 0; border-radius: 1px; color: #596274; background: transparent; cursor: pointer; }
.condition-period-modes button.active { color: var(--primary-strong); background: #fff; font-weight: var(--font-weight-semibold); }
.condition-period-picker { width: 100% !important; }
.condition-filter-options { max-height: 260px; overflow-y: auto; border-top: 0; }
.condition-filter-options button { width: 100%; min-height: 42px; padding: var(--space-2) var(--space-3); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); border: 0; color: #30394b; background: #fff; text-align: left; cursor: pointer; }
.condition-filter-options button:hover, .condition-filter-options button.active { color: var(--primary); background: var(--primary-soft); }
.condition-filter-options button strong { overflow: hidden; font-size: var(--content-font-size); font-weight: var(--font-weight-semibold); text-overflow: ellipsis; white-space: nowrap; }
.condition-filter-options button small { flex: 0 0 auto; color: #7b8494; font-size: var(--font-size-sm); }
.condition-filter-empty { padding: var(--space-5); color: #7b8494; text-align: center; }
</style>

<style>
.condition-filter-popper,
.condition-date-popper {
  transition: none !important;
  animation: none !important;
}
</style>
