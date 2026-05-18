# Console Job Log Drawer Design

## Goal

让控制台任务中心主界面更干净：移除右侧固定运行记录面板，改为按需打开右侧抽屉查看单任务或全部任务日志。

## Scope

- 仅调整 Web 前端任务中心页面。
- 不新增后端接口，不修改数据库。
- 继续使用现有 `listRunRequests()` 和 `listJobLogs(jobName)`。
- 保留任务卡片、筛选、同步任务定义、运行、配置、详情。

## Interaction

### Main Page

- 主界面为全宽任务卡片网格。
- 顶部 `同步任务定义` 旁边新增 `查看所有日志`。
- 不再常驻显示运行记录面板。

### Single Job Logs

- 每张任务卡的 `日志` 按钮打开右侧抽屉。
- 抽屉标题：`运行记录：<任务显示名>`。
- 抽屉内使用现有事件流列表，并保留 `运行请求 / 执行日志` Tabs。
- 运行请求来自 `listRunRequests()` 后按 `job_name` 过滤。
- 执行日志来自 `listJobLogs(jobName)`。

### All Logs

- 顶部 `查看所有日志` 打开右侧抽屉。
- 抽屉标题：`所有任务日志`。
- 运行请求展示 `listRunRequests()` 全量结果。
- 执行日志通过对当前任务列表调用 `listJobLogs(jobName)` 后合并，并按 `started_at` 倒序展示。
- 第一版不增加统一日志后端接口；如果日志量变大，再补 `/api/jobs/logs`。

## Visual Rules

- 主界面不使用右侧固定卡片，卡片网格占据全部内容宽度。
- 抽屉宽度使用 720px，承载事件流列表。
- 事件流列表沿用 `JobRunEventList`，不回退表格。
- 抽屉内内容可滚动，避免撑开页面主体。

## Acceptance

- 任务中心主界面不再显示右侧运行记录面板。
- 顶部有 `查看所有日志` 按钮。
- 卡片 `日志` 按钮打开单任务日志抽屉。
- `查看所有日志` 打开全部日志抽屉。
- `npm.cmd run build` 通过。
