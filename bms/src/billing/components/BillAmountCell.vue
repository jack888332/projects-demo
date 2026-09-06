<script setup>
defineProps({
  rows: { type: Array, default: () => [] },
})

function money(value) {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function amountText(item, row) {
  const amount = Number(item.amount || 0)
  if ((item.displayEmpty ?? row.displayEmpty) && amount === 0) return '--'
  const sign = row.signed && amount > 0 ? '+' : ''
  return `${sign}${money(amount)} ${item.currency}`
}
</script>

<template>
  <dl class="bill-list-amounts">
    <div v-for="row in rows" :key="row.key" class="bill-list-amount-row">
      <dt>{{ row.label }}</dt>
      <dd>
        <span
          v-for="(item, index) in row.values"
          :key="`${item.currency}-${index}`"
          :class="[
            'bill-list-amount-tag',
            row.tone === 'pending' && 'is-pending',
            row.signed && Number(item.amount || 0) < 0 && 'is-negative',
          ]"
        >
          {{ amountText(item, row) }}
        </span>
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.bill-list-amounts {
  margin: 0;
  display: grid;
  gap: 5px;
  color: #717d90;
  font-size: var(--font-size-sm);
}

.bill-list-amount-row {
  min-width: 0;
  display: grid;
  grid-template-columns: 124px minmax(0, 1fr);
  align-items: center;
  gap: 4px;
}

.bill-list-amount-row dt {
  text-align: left;
  white-space: nowrap;
}

.bill-list-amount-row dd {
  min-width: 0;
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 5px;
}

.bill-list-amount-tag {
  box-sizing: border-box;
  width: 128px;
  min-height: 24px;
  padding: 1px 8px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 128px;
  border: 1px solid #d9e4f7;
  border-radius: 4px;
  color: #293850;
  background: #f8fbff;
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
  line-height: 20px;
  text-align: right;
  white-space: nowrap;
}

.bill-list-amount-tag.is-pending {
  border-color: #f1cf98;
  background: #fffaf2;
}

.bill-list-amount-tag.is-negative {
  border-color: #efb8b8;
  color: #c53b3b;
  background: #fff8f8;
}
</style>
