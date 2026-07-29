# 安卓看板仅展示审核通过材料设计

## 目标

安卓 H5 的赛道看板和标的看板只拉取审核通过的材料。现有材料状态中，“审核通过”对应 `confirmed`。

## 方案

- 仅调整安卓 H5 的 `mobileApi.trackMaterials` 和 `mobileApi.stockMaterials` 请求。
- 两个请求都固定传入 `status=confirmed`。
- 首屏与无限加载后续页使用相同筛选条件。
- 保持现有接口路径、分页大小、排序、缓存键、加载状态和材料卡片不变。
- 不修改后端默认筛选，避免影响 Web、审核页面及其他潜在调用方。

## 请求契约

```text
GET /api/track-discovery/materials?status=confirmed&offset=<offset>&limit=10
GET /api/stock-analysis/materials?status=confirmed&offset=<offset>&limit=10
```

参数顺序不构成接口契约，但 `status=confirmed`、当前偏移量和 `limit=10` 必须同时存在。

## 测试

- API 客户端测试验证赛道和标的材料请求均包含 `status=confirmed`。
- 看板集成测试验证首屏和第二页请求都保留该筛选条件。
- 运行 Android H5 全量测试、TypeScript 检查、生产构建和 `git diff --check`。
- 不运行数据库测试，不修改数据库。

## 非目标

- 不改变材料审核状态定义。
- 不改变后端接口默认值。
- 不增加状态切换控件。
- 不修改 Web 页面或其他安卓内容页。
