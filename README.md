# liuli

`liuli` 是一个面向个人投资者的投资辅助系统，用于把外部信息流、行情变化、公司公告、财报、舆情评论，转化为可跟踪、可复盘、可反哺 AI 的投资认知闭环。

当前项目以 [docs/liuli_system_spec_v6.md](docs/liuli_system_spec_v6.md) 为唯一系统架构依据。

## 当前状态

已完成的后端 MVP 模块：

- `basic/auth`：登录鉴权、默认管理员用户。
- `basic/stock_master`：股票基础库。
- `basic/system_config`：系统配置。
- `basic/job_center`：任务定义同步、任务启停、手动运行、日志。
- `basic/report_library`：报告索引与读取入口。
- `basic/disclosure_library`：公告财报库、巨潮入口、下载/解析/业务引用接口。
- `market_radar`：市场雷达、财联社市场快讯、标签、候选标签、热度、关系图、任务注册。
- `track_discovery`：赛道发现、证据链、指标、关联标的。
- `stock_analysis`：标的池、研究笔记、评分、对比、报告入口。
- `alert_center`：预警规则、预警事件、处理流程、市场热度规则评估任务。
- `portfolio`：组合、持仓、复盘。
- `knowledge_base`：笔记、Skills、Agents、反馈日志。
- `console`：系统运营管理入口，不承载业务能力归属。

已完成的 Web 首版：

- React 18 + Vite 5 + Ant Design 6 + ECharts。
- 左侧一级导航：总览、市场雷达、赛道发现、标的分析、预警中心、组合管理、知识库、控制台。
- 内容区顶部横向二级 Tabs。
- 浅色、深色、跟随系统主题能力，当前以浅色验收为主。
- 控制台基础运维闭环：任务中心、股票基础库、系统配置、报告库、公告财报库、标签库、候选标签。
- 市场雷达业务工作台：总览、热度榜、市场快讯、标签、候选标签、标的关系图。
- 赛道发现业务工作台：候选赛道、赛道列表、证据链、赛道详情、验证指标、关联标的。
- 标的分析业务工作台：标的池、评分快照、研究笔记、分析报告、对比组、标的详情。
- 标的-赛道标签绑定：`stock` 标签由标的生命周期自动同步；标的可绑定多个 `track` 标签，主入口在标的分析，赛道发现提供反向维护入口。
- 方案 C 紧凑终端工具台视觉规范。

尚未完成或后续深化：

- 各业务模块的深度工作台布局。
- 赛道、标的、组合等复杂详情页深化。
- 更多新增/编辑/审核/运行表单。
- 图表基于真实数据结构进一步细化。
- 深色模式视觉精调。
- Web 路由懒加载与大 chunk 拆包。
- K 线/分时图，后续需要时再引入 `lightweight-charts`。
- Android 端实现。

## 目录说明

```text
invest_assistant/
├── bootstrap/             # 配置、数据库、日志、应用启动、调度器
├── modules/
│   ├── basic/             # 基础支撑模块
│   ├── market_radar/
│   ├── track_discovery/
│   ├── stock_analysis/
│   ├── alert_center/
│   ├── portfolio/
│   ├── knowledge_base/
│   └── console/           # 操作面板，不拥有业务能力
├── ui/web/                # Web 前端
└── worker.py              # Worker 入口
```

运行时数据放在 `var/`：

```text
var/db/
var/logs/
var/cache/
var/raw/
var/processed/
var/reports/
var/exports/
```

`old/` 目录只作为功能实现参考，不作为新架构、目录、表结构或模块边界依据。

## 本地运行

推荐直接使用根目录脚本：

```powershell
.\start.bat
```

启动后访问：

- Web: <http://127.0.0.1:5173>
- API Health: <http://127.0.0.1:8000/api/health>

停止服务：

```powershell
.\stop.bat
```

默认登录账号：

```text
admin / admin123
```

## 手动启动

启动 API：

```powershell
python -m uvicorn invest_assistant.main:app --host 127.0.0.1 --port 8000
```

启动 Worker：

```powershell
python -m invest_assistant.worker
```

启动 Web：

```powershell
cd invest_assistant\ui\web
npm.cmd install --no-audit --no-fund
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

## 验证

后端测试：

```powershell
pytest -q --basetemp=var/cache/pytest
```

前端构建：

```powershell
cd invest_assistant\ui\web
npm.cmd run build
```

当前已知情况：

- 后端测试应为 25 passed。
- Web build 会出现 Vite 大 chunk 警告，当前不阻塞；后续通过路由懒加载拆包处理。

## Web UI 规范

后续 Web UI 开发必须遵守：

- [docs/superpowers/specs/2026-05-16-liuli-web-ui-spec.md](docs/superpowers/specs/2026-05-16-liuli-web-ui-spec.md)

核心约束：

- 当前视觉采用方案 C：紧凑终端工具台。
- 字体、色彩、线条、表格、按钮、卡片、Tabs、浅色/深色模式都按 UI Spec 实现。
- 不要把所有按钮做成胶囊。
- 不要用假数据填页面。
- 不要把 `console` 当成业务能力归属地。
- `stock` 标的标签由股票基础库同步，不允许手动维护。

## 架构与计划文档

关键文档：

- [docs/liuli_system_spec_v6.md](docs/liuli_system_spec_v6.md)：系统架构唯一依据。
- [docs/superpowers/specs/2026-05-14-liuli-web-design.md](docs/superpowers/specs/2026-05-14-liuli-web-design.md)：Web 设计文档。
- [docs/superpowers/specs/2026-05-16-liuli-web-ui-spec.md](docs/superpowers/specs/2026-05-16-liuli-web-ui-spec.md)：Web UI 规范。
- [docs/superpowers/plans/2026-05-14-liuli-web-frontend.md](docs/superpowers/plans/2026-05-14-liuli-web-frontend.md)：Web 实施计划。

## 开发维护规则

- 后续新增功能、重要页面、重要模块、启动方式、运行方式、技术栈变化、重大架构调整，必须同步更新本 README。
- Web UI 相关改动必须同步检查 UI Spec；如果视觉规范发生变化，先更新 UI Spec，再改实现。
- 后端架构、模块边界、表结构、API 命名必须以 `docs/liuli_system_spec_v6.md` 为准。
- Web 和 Android 不切换技术栈，除非用户明确确认。
- 不再切换分支；当前重写工作在当前分支持续推进，除非用户明确改变该要求。
