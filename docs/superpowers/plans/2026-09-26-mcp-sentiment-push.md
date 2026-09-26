# MCP 舆情批量导入计划

**目标：** 新增 MCP 写入工具，批量导入社交媒体舆情（雪球、微博、知乎上大V和自媒体的观点），写进市场雷达信息流，参与现有的标签命中、热度、图谱和材料生成链路。

**导入方式：** 外部程序定时批量导入，目前一天 1—2 次，后续可能每小时一次；总量一天最多约 100 条。每条舆情有四个字段：

| 字段 | 说明 |
|---|---|
| `platform` | 平台：`雪球` / `微博` / `知乎` |
| `author` | 作者，按平台显示名原样填写 |
| `date` | 发布日期 `YYYY-MM-DD`，没有具体时间 |
| `content` | 观点正文 |
| `important` | 可选，默认 false；标记值得重点关注的观点 |

**方案要点：** 舆情作为 `source_item` 的 `sentiment` 类型入库，不新建表；`source_item` 只新增一列 `author`；不进待办；Web 信息流和安卓资讯页都给舆情单独的展示样式，安卓新增“舆情”页签。

---

## 已确认的决策

| 问题 | 决定 | 理由 |
|---|---|---|
| 存在哪里 | `source_item`，`source_type="sentiment"` | spec 17.6 已定义 sentiment；复用去重、标签命中、材料生成、热度、图谱 |
| 平台 | 存 `source_name`，只允许 `雪球` / `微博` / `知乎` | 沿用现有来源筛选 |
| 作者 | 新增 `author` 列（可空 + 索引），不跨平台合并 | 作者是信息的出处，不是语义锚点；做成 tag 会污染热度榜、共现图谱和标签管理 |
| 原帖链接 | 没有，`source_url` 留空 | 导入数据不含链接 |
| 标题 | 服务端取正文第一行前 40 字生成 | 导入数据不含标题；只用于满足表结构和关键词搜索，Web 和安卓的舆情展示都不显示 |
| 时间 | `publish_time` 记导入时间 | 信息流排序和 24 小时热度按导入时间走，舆情一进来就能看到、就能计入热度 |
| `date` 的用途 | 只用于校验和限定去重范围，不单独入库 | 导入时间已经足够表达“什么时候进来的” |
| 去重 | 同平台、同作者、正文完全相同，且在 `date` 当天 00:00（北京时间）之后已导入过，视为重复 | 导入时间每次不同，不能比时间；同一帖子只可能在发布日期当天或之后被导入，范围有上限 |
| 材料生成 | 照常生成待审的标的/赛道材料 | 一天最多约 100 条，只有命中标的池或赛道标签的才会生成，不会淹没审核队列 |
| 是否进待办 | 不进 | 舆情没有需要处理的动作；相关内容经材料审核进入研究流程 |
| AI 推荐词任务 | 暂不纳入 | `_today_news_items` 仍只读 `news`；大V内容噪音大，先观察标签命中情况 |
| is_important | 取导入的 `important`，默认 false | 导入程序在筛选时最清楚哪些观点有分量；标重要的舆情进入“重要”页签 |

## 范围

**做：** spec 更新、数据库迁移、模型/schema、服务层导入与去重、MCP 工具、信息流接口按作者筛选、Web 信息流舆情展示、安卓资讯页“舆情”页签和舆情展示。

**不做：** 待办子页、AI 推荐词纳入舆情、平台侧的抓取或定时任务、大V预警规则（以后放 alert_center）。

## 约束

- 不跑任何会清空、重建数据库的测试或命令；验证用纯单元测试、结构测试和静态检查。
- 迁移只加列、加索引，不改不删已有数据。迁移在线上执行前先备份 `var/db/liuli.sqlite3` 到 `var/db/recovery/`（PostgreSQL 环境按运维流程先备份）。
- 新闻、公告等已有类型的写入和去重行为不变。

---

### 任务 1：更新 spec（v43）

**文件：** `docs/liuli_system_spec.md`

- 版本记录加 v43：说明舆情批量导入、`author` 列、sentiment 的时间和去重口径、MCP 工具、安卓舆情页签、不进待办的理由。
- 17.5 `source_item` 字段清单和 34 章表结构加 `author`，注释写明“仅 sentiment 使用，其他类型为空”。
- 17.6 补一段 sentiment 约定：四个导入字段、平台取值、标题生成、时间记导入时间、去重口径。
- MCP 工具清单补 `market_radar.import_sentiment_items`。

### 任务 2：迁移与模型

**文件：**
- 新建：`tools/migrations/2026-09-26_source_item_author.sql`
- 修改：`invest_assistant/modules/market_radar/models.py`
- 修改：`invest_assistant/modules/market_radar/schemas.py`

- 迁移：`ALTER TABLE source_item ADD COLUMN author VARCHAR(128) NULL;` 加上 `(source_type, author, publish_time)` 索引，SQLite 和 PostgreSQL 都能执行。
- `SourceItem` 加 `author: Mapped[str | None]`；`SourceItemCreate` 和读取 schema 加 `author: str | None = None`。

### 任务 3：服务层导入

**文件：** `invest_assistant/modules/market_radar/service.py`

- 新增 `import_sentiment_items(db, items, now=None) -> dict`：
  - 逐条校验：`platform` 在白名单内；`author`、`content` 非空；`date` 是 `YYYY-MM-DD`，且不晚于北京时间今天。
  - 去重：按 `source_type="sentiment" + source_name + author + publish_time >= date 当天 00:00（北京时间）` 查候选，再比对完整正文。
  - 不重复的：正文去掉首尾空白，超过 2000 字截断；标题取正文第一行前 40 字，超出部分加省略号；`publish_time` 取导入时间；调用现有的 `create_source_item` 入库（标签命中、材料生成照常）。
  - 单条失败不影响同批其他条目。
  - 返回 `{"created": n, "duplicated": n, "failed": [{"index": i, "reason": "..."}], "ids": [...]}`。
- sentiment 去重在 `import_sentiment_items` 里完成，`find_duplicate_source_item` 不改，其他类型不受影响。
- `list_source_items_page` 和 `_source_item_filter_conditions` 加 `author` 精确筛选。

**测试：** 新增纯函数测试，覆盖日期校验、标题生成、正文截断、平台校验和字段组装；去重查询用编译出的 SQL 断言，不连库。

### 任务 4：MCP 工具

**文件：**
- 修改：`invest_assistant/modules/basic/mcp/registry.py`
- 修改：`invest_assistant/modules/basic/mcp/tools/market_radar.py`
- 修改：`invest_assistant/modules/basic/mcp/server.py`

- 注册 `market_radar.import_sentiment_items`：`read_only: False`，`risk_level: medium`，服务函数 `market_radar.service.import_sentiment_items`。
- 工具签名只暴露 `items`，每条包含 `platform`、`author`、`date`、`content` 和可选的 `important`，字段说明写在参数 schema 里；`source_type` 在平台侧写死，调用方不能传。
- 单次最多 200 条，超出直接拒绝。
- 工具描述：

  ```text
  批量导入雪球、微博、知乎上的大V观点到市场雷达信息流，每次最多 200 条。
  每条填 platform（雪球/微博/知乎）、author、date（YYYY-MM-DD）、content（最长 2000 字）。
  important 可选，标记值得重点关注的观点。
  同平台同作者同正文的重复导入会被跳过，可以整批重导。
  受控写入工具，需加入 allowed_tools。
  ```

- `search_source_items` 同步加 `author` 参数，方便按大V回看。
- 默认不开放：需要在系统配置的 MCP 客户端 `allowed_tools` 里显式加上。

**测试：** 扩展现有 MCP 注册表和权限测试，断言工具已注册为写入工具、未授权的客户端调用会被拒绝。

### 任务 5：Web 信息流

**文件：**
- 修改：`invest_assistant/ui/web/src/types/api.ts`
- 修改：`invest_assistant/ui/web/src/api/marketRadar.ts`
- 修改：`invest_assistant/ui/web/src/pages/market-radar/sections/FlashSection.tsx`

- `SourceItem` 类型加 `author`。
- **舆情条目换样式**（与安卓一致）：头部是时间 · 作者（加粗）· 平台，加一个“舆情”标记；不显示标题，直接显示正文；时间线圆点用单独的颜色，和新闻、公告区分。
- **点作者名筛选**：点作者名，信息流只显示这位作者的内容，筛选区显示当前作者，可清除。
- 右侧筛选区：来源选项加上雪球、微博、知乎；新增“作者”输入框，走服务端筛选。
- 详情抽屉：舆情显示作者和平台，不显示标题。
- 类型标签显示中文（新闻、舆情、公告……），不显示 `sentiment` 这类英文值。

**测试：** 仿照 `flashServerFilters.test.mjs` 加结构测试：舆情条目不渲染标题、渲染作者；作者筛选参数会传给接口。

### 任务 6：安卓资讯页“舆情”页签

**文件：**
- 修改：`invest_assistant/ui/android/h5/src/types/api.ts`
- 修改：`invest_assistant/ui/android/h5/src/api/mobileApi.ts`
- 修改：`invest_assistant/ui/android/h5/src/pages/NewsPage.tsx`

1. **页签**：`全部 · 舆情 · 重要 · 公告 · 个股`，舆情排第二；“全部”照常包含舆情，用卡片样式区分。
2. **舆情卡片**：第一行是作者（加粗）· 平台，右侧是时间；下面直接显示正文，最多 4 行，点开看全文；不显示标题。“舆情”页签和“全部”里都用这个样式。
3. **按作者筛选**：点卡片上的作者名，舆情页只显示这位作者的内容，顶部出现“作者：xxx ✕”，点 ✕ 恢复全部。

**测试：** 在 `tests/app.test.tsx` 加断言：页签顺序；“全部”里的舆情用舆情卡片样式；舆情卡片显示作者和正文、不显示标题；点作者名后请求带上 `author`，点 ✕ 后恢复。

### 任务 7：联调验证

- 先备份数据库。
- 本地起服务后，用 MCP 客户端导入一批样例：三个平台都有，其中包括同一作者同一天的多条。然后整批重导一次。检查返回的计数（第二次应该全部判为重复）、Web 和安卓的展示、标签命中和材料生成。
