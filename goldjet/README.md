# 高捷物流一期系统高保真原型

本原型与 `projects-doc/product-caliber/goldjet/segmented-prd` 共同以一期系统 Word 资料为事实来源。工程机制参考 `projects-demo/bms` 当前工作树，产品名称、路由、字段、状态、权限和演示数据均重新建立，没有复用 BMS 业务事实。

## 范围与要求追溯

| 要求 ID | 来源主题 | 原型落点 | 可观察结果 |
| --- | --- | --- | --- |
| `GJ-R-001` | 一期系统工作台与跨模块流程 | `/workspace` | 汇总空运、用车、仓储、财务和外部协同待办 |
| `GJ-R-002` | 空运订单创建、订舱、提单及履约 | `/fulfillment/air-orders` | 新建订单、计算计费重、提交订舱、审核并进入待补录 |
| `GJ-R-003` | 用车订单、调度与运单 | `/fulfillment/ground-dispatch` | 单笔或批量选择最低成本供应商并生成运单 |
| `GJ-R-004` | 仓库订单、收货、理货、确认和上架 | `/fulfillment/warehouse-orders` | 按源资料状态顺序推进仓储服务单 |
| `GJ-R-005` | 订单成本、审批与结算 | `/finance/costs` | 新增应收或应付费用并完成审批或拒绝处理 |
| `GJ-R-006` | 合作方档案与报价主数据 | `/foundation/partners` | 新建、停用和恢复客户或供应商档案 |
| `GJ-R-007` | 航司推送、消息与外部系统协同 | `/foundation/integrations` | 识别失败任务并执行确定性重试 |
| `GJ-R-008` | 其余一期模块 | 对应侧栏路由 | 查询、查看详情与新增演示记录 |

## 参考样本映射

参考仓库快照为 `projects-demo` Commit `7a9536e042239f8e9eaeed81d5b2d5e6a4b530e0` 的当前工作树；样本当时存在 `bms/src/billing/components/BillDetailPanel.vue`、`bms/src/billing/views/AdjustmentView.vue` 和 `bms/src/shared/styles/module-pages.css` 未提交修改。

- 复用：Vue 3、Vite、Vue Router、Element Plus、自动组件注册、顶部栏与侧栏布局方式、紧凑表格密度和 CSS token 分层。
- 配置或改名：应用名称、主导航、路由、主色、状态映射、分页大小与列表 schema。
- 重写：全部业务数据、状态迁移、费用与计费重规则、角色动作和页面文案。
- 未采用：BMS 账单与成本领域代码、IndexedDB 数据、导入导出格式、路由前缀和品牌资产。

## 演示边界

默认 profile 为 `desktop-browser`，画布 `1440 x 900`、简体中文、北京时间、精细指针和键盘输入；同一页面支持到 `390 x 844` 的窄画布重排。外部航司、WMS、消息送达和移动端硬件能力仅模拟浏览器内状态结果。资料未给出唯一规则的能力不会在原型中补造；WMS 连接超时会议纪要只体现为集成风险提示。

运行：`npm install` 后执行 `npm run dev`，默认访问 `http://localhost:10530/`。
