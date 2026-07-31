# 安卓标的看板材料方向对齐设计

## 目标

让安卓 H5 标的看板的“最新材料”与赛道看板使用一致的材料卡片和方向标签，只展示审核通过的材料，并正确显示利好、利空和中性。

## 当前问题

赛道材料的方向枚举为 `support / weaken / neutral / noise`，标的材料的方向枚举为 `positive / negative / neutral / noise`。公共 `DashboardMaterialFeed` 当前只识别赛道枚举，因此标的材料虽然已经通过 `status=confirmed` 筛选，`positive / negative` 仍不会显示方向标签。

## 展示规则

公共材料组件统一识别两套后端枚举：

- `support`、`positive`：显示“利好”，使用 `positive` 色调。
- `weaken`、`negative`：显示“利空”，使用 `negative` 色调。
- `neutral`：显示“中性”，使用中性色调。
- `noise`、空值和未知值：不显示方向标签。

标的卡片继续显示标的名称、代码、材料标题、摘要、来源和时间。赛道卡片结构、分页和方向展示不发生变化。

## 数据与接口

继续调用：

```http
GET /api/stock-analysis/materials?status=confirmed&offset={offset}&limit=10
```

不修改后端审核状态、材料排序、分页结构或 `impact_direction` 字段。方向兼容在公共 Android 材料组件内部完成，不增加新的对外接口。

## 状态与分页

- 初次加载、错误重试、空数据和上滑加载更多继续复用 `DashboardMaterialFeed` 现有行为。
- 加载更多失败时保留已有材料，并显示卡片底部重试按钮。
- 标的与赛道查询缓存继续相互独立。

## 测试

- 验证标的请求始终包含 `status=confirmed`。
- 验证 `positive` 显示红色“利好”。
- 验证 `negative` 显示绿色“利空”。
- 验证 `neutral` 显示中性标签。
- 验证 `noise` 和未知值不显示方向标签。
- 验证赛道已有 `support / weaken` 映射不回归。

## 非目标

- 不修改 Web 材料页面。
- 不修改材料审核流程或后端枚举。
- 不增加新的材料筛选、排序或卡片交互。
