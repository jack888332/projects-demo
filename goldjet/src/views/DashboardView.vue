<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Bell, Box, Coin, Promotion, Van } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import StatusTag from '../components/StatusTag.vue'
import { usePrototypeData } from '../data/usePrototypeData.js'

const router = useRouter()
const { state, dashboard } = usePrototypeData()

const metrics = computed(() => [
  { label: '空运待处理', value: dashboard.value.pendingAir, unit: '票', tone: 'blue', path: '/fulfillment/air-orders', icon: Promotion },
  { label: '用车未调度', value: dashboard.value.undispatched, unit: '单', tone: 'amber', path: '/fulfillment/ground-dispatch', icon: Van },
  { label: '仓储作业中', value: dashboard.value.warehousePending, unit: '单', tone: 'green', path: '/fulfillment/warehouse-orders', icon: Box },
  { label: '费用待审批', value: dashboard.value.costPending, unit: '笔', tone: 'violet', path: '/finance/costs', icon: Coin },
  { label: '接口失败', value: dashboard.value.integrationFailures, unit: '项', tone: 'red', path: '/foundation/integrations', icon: Bell },
])

const tasks = computed(() => [
  ...state.airOrders.filter((item) => item.bookingStatus === '待审核').map((item) => ({ module: '订舱审核', no: item.orderNo, subject: `${item.route} · ${item.customer}`, status: item.bookingStatus, path: '/fulfillment/air-orders' })),
  ...state.groundOrders.filter((item) => item.dispatchStatus === '未调度').slice(0, 2).map((item) => ({ module: '用车调度', no: item.orderNo, subject: `${item.pickup} → ${item.delivery}`, status: item.dispatchStatus, path: '/fulfillment/ground-dispatch' })),
  ...state.costs.filter((item) => item.status === '待审批').slice(0, 2).map((item) => ({ module: '费用审批', no: item.orderNo, subject: `${item.direction} · ${item.feeItem} · ${item.amount.toLocaleString()} ${item.currency}`, status: item.status, path: '/finance/costs' })),
  ...state.integrations.filter((item) => item.status === '失败').slice(0, 1).map((item) => ({ module: '外部协同', no: item.businessNo, subject: `${item.system} · ${item.action}`, status: item.status, path: '/foundation/integrations' })),
])

const flowStages = [
  { label: '订单受理', detail: '主订单与子订单', path: '/fulfillment/air-orders' },
  { label: '订舱与制单', detail: '订舱审核与提单', path: '/fulfillment/booking' },
  { label: '运输作业', detail: '配板、用车与仓储', path: '/fulfillment/ground-dispatch' },
  { label: '申报与交付', detail: '报关、清关与跟踪', path: '/fulfillment/declarations' },
  { label: '财务结算', detail: '成本、对账与核销', path: '/finance/costs' },
]
</script>

<template>
  <div class="dashboard-view">
    <PageHeader title="一期运营工作台" eyebrow="2026 年 9 月 8 日 · 上海" description="空运、地面运输、仓储和财务结算的当前待办">
      <template #actions><el-button type="primary" :icon="Promotion" @click="router.push('/fulfillment/air-orders')">新建空运订单</el-button></template>
    </PageHeader>

    <section class="metric-grid" aria-label="运营指标">
      <button v-for="item in metrics" :key="item.label" :class="['metric-card', item.tone]" @click="router.push(item.path)">
        <span class="metric-icon"><el-icon><component :is="item.icon" /></el-icon></span>
        <span class="metric-copy"><small>{{ item.label }}</small><strong>{{ item.value }}<em>{{ item.unit }}</em></strong></span>
        <el-icon class="metric-arrow"><ArrowRight /></el-icon>
      </button>
    </section>

    <section class="flow-band">
      <div class="section-title"><h2>端到端履约链路</h2><span>从订单受理到财务结算</span></div>
      <div class="flow-rail">
        <button v-for="(stage, index) in flowStages" :key="stage.label" @click="router.push(stage.path)">
          <span class="flow-index">{{ index + 1 }}</span>
          <strong>{{ stage.label }}</strong><small>{{ stage.detail }}</small>
          <el-icon v-if="index < flowStages.length - 1"><ArrowRight /></el-icon>
        </button>
      </div>
    </section>

    <div class="dashboard-columns">
      <section class="dashboard-section task-section">
        <div class="section-title"><h2>我的待办</h2><span>{{ tasks.length }} 项</span></div>
        <div class="task-list">
          <button v-for="task in tasks" :key="`${task.module}-${task.no}`" @click="router.push(task.path)">
            <span class="task-module">{{ task.module }}</span>
            <span class="task-main"><strong>{{ task.no }}</strong><small>{{ task.subject }}</small></span>
            <StatusTag :label="task.status" />
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>
      </section>

      <section class="dashboard-section exception-section">
        <div class="section-title"><h2>异常与风险</h2><span>需人工关注</span></div>
        <button class="risk-row" @click="router.push('/foundation/integrations')">
          <span class="risk-dot danger" />
          <span><strong>WMS 理货报告同步失败</strong><small>连接超时，已重试 3 次</small></span>
          <StatusTag label="失败" />
        </button>
        <button class="risk-row" @click="router.push('/foundation/integrations')">
          <span class="risk-dot warning" />
          <span><strong>航司提单推送等待处理</strong><small>GJ-AIR-260907-018</small></span>
          <StatusTag label="待确认" />
        </button>
        <button class="risk-row" @click="router.push('/finance/costs')">
          <span class="risk-dot warning" />
          <span><strong>报关服务费审批拒绝</strong><small>缺少费用依据</small></span>
          <StatusTag label="审批拒绝" />
        </button>
      </section>
    </div>
  </div>
</template>
