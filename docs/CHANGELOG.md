# liuli 版本迭代记录

> 现行系统规格：`docs/liuli_system_spec.md`。本文件只记录"改了什么、为什么改、影响哪里"，正文规格以 spec 为准。
> MVP 阶段（v7–v48）的演进记录见 `docs/archive/liuli_system_spec_mvp.md` 第 0 节。

## 记录规则

- 新版本追加在最上方，格式：`## x.y.z — YYYY-MM-DD`。
- 版本号规则见 spec 0.1：修复与微调升修订号，新功能/新表新列/新接口/行为变更升次版本，架构与不兼容重构升主版本。
- 每条记录写清：**变更**、**原因**、**影响**（Web / Android / MCP / 数据库）。
- 线上 PostgreSQL 有列变更时，必须写明迁移脚本 `tools/migrations/YYYY-MM-DD_<name>.sql`；只新增表则注明"由 create_all 建表，无迁移脚本"。
- 同一次提交里同步更新 spec 对应章节和顶部"当前版本"。

---

## 1.0.0 — 2026-10-08

MVP 阶段结束，发布正式版。

**变更**

- 旧规格 `docs/liuli_system_spec.md`（v7–v48，约 5800 行）归档为 `docs/archive/liuli_system_spec_mvp.md`，冻结不再维护。
- 按当前代码重写 `docs/liuli_system_spec.md`，只描述现状，不再在正文里保留演进过程；版本演进改记在本文件。
- 表结构（54 张）由 SQLAlchemy 模型元数据生成；API 按各模块 `router.py` 整理；任务清单按 `JOB_REGISTRY` 整理。
- 明确线上基线是阿里云 RDS PostgreSQL，SQLite 只是本地开发便利；明确 schema 管理规则（新表 create_all，列变更走 `tools/migrations/*.sql`）。

**按代码核实后修正的旧规格描述**

- Android 是"原生薄壳 + 独立手机 H5"，底栏为看板 / 资讯 / 笔记 / 待办 / 我的，不是旧文档里的纯原生"记录 / 新闻 / 报告 / 预警"。
- Web 二级菜单是模块页内页签，不是 `/market-radar/feed` 这类独立子路径；页签名称按 `navigation.tsx` 更新（如"热度榜"、工作台"操作面板"）。
- AI 当前只接入 DeepSeek（`services/deepseek`），不存在 `services/ai/*` 多厂商 client。
- 对外 MCP 已不含 OAuth，只用 `mcp.clients` Bearer Token；`local_only` 字段保留但未生效；MCP 工具已全部上线，不再是"规划中"。
- `lightweight-charts` 已用于标的详情 K 线。
- 预警规则实际生效的只有 `heat` 与 `job_failure`，另有微操风险警示直接生成事件。
- API 汇总补入代码中已有、旧文档缺失的接口（组合全局视图、调仓来源对比、微操建议候选、标的趋势快照、笔记分组排序、研究回流更新删除、AI 按日用量等），删除代码中不存在的 `GET /api/knowledge/research-feedback/{id}`。
- 删除 `job_config` 旧版摊平字段描述、`ai_usage_daily_snapshot` 等未建设设计、MVP 开发顺序等过期内容。

**影响**：仅文档，无代码与数据库变更。
