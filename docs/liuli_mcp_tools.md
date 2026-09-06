# 琉璃对外 MCP 工具接口清单

> 代码位置：`invest_assistant/modules/basic/mcp/`——`server.py` 注册工具、`registry.py` 权限元数据、`service.py` 统一执行与返回信封、`projection.py` 返回投影、`auth.py` 客户端鉴权、`tools/*.py` 各业务包装。
> 本文按当前代码整理，接口以代码为准；设计背景见 `docs/liuli_mcp_design.md`。

## 1 接入方式

| 项 | 值 |
|---|---|
| 协议 | MCP Streamable HTTP（FastMCP） |
| 挂载路径 | 后端 `/mcp`（`bootstrap/app.py` 中 `app.mount("/mcp", mcp_asgi_app)`） |
| 服务名 | `liuli` |
| 传输参数 | `streamable_http_path="/"`、`json_response=True`、`stateless_http=False` |
| 鉴权 | 请求头 `Authorization: Bearer <token>`，required scope `mcp` |
| 对外地址 | 配置项 `mcp_public_base_url`，默认 `http://127.0.0.1:8000`；issuer、resource server URL 和允许的 host/origin 都由它推导 |

客户端配置存在 `system_config` 的 `mcp.clients`（该配置项必须 enabled），值是 JSON 对象，键为客户端名：

```json
{
  "codex": {
    "enabled": true,
    "token": "……",
    "allowed_tools": [
      "market_radar.search_source_items",
      "portfolio.get_overview"
    ],
    "max_result_limit": 50,
    "local_only": true
  }
}
```

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | bool | `true` | 关掉后该客户端所有调用都鉴权失败 |
| `token` | string | 必填 | Bearer token，缺失或非字符串的客户端条目会被直接忽略 |
| `allowed_tools` | string[] | `[]` | 工具白名单，**不在名单里的工具一律拒绝**，注册表里存在也不行 |
| `max_result_limit` | int | `50` | 该客户端单次返回条数上限，归一化到 1..100 |
| `local_only` | bool | `true` | 仅解析存储，代码里当前没有据此做来源校验，内网限制靠部署侧 |

鉴权链路：Bearer token → 常量时间比对匹配客户端 → `AccessToken.client_id` 记为客户端名 → 每次工具调用再按客户端名取配置 → 校验工具在 `allowed_tools` 内 → 执行。

## 2 通用约定

### 2.1 limit 生效规则

只读工具统一走 `execute_read_tool`：

- 上限取客户端 `max_result_limit`（1..100）；若工具在 `registry` 里声明了自己的 `max_result_limit`，取两者较大值——工具级配置只用于**放宽**，不会把客户端上限调低；
- 实际 limit = `min(请求 limit, 上限)`，下限 1；
- 请求没带 limit 时直接用上限；
- 请求 limit 超过上限时，返回里 `truncated` 为 `true`。

目前只有 `stock_analysis.get_daily_bars` 声明了工具级上限（800，约三年交易日）。

详情类工具（`get_track_detail`、`get_stock_profile`、`get_researcher_profile`、`read_report_content`、`portfolio.get_overview`）不接受 limit，它们用各自的 `sections` / `history_limit` / `list_limit` 控制体积。

### 2.2 返回信封

所有工具都返回一个 JSON 对象，按底层 service 的返回类型分三种形态：

| 形态 | 触发条件 | 字段 |
|---|---|---|
| 分页 | service 返回 `Page`（含 items/total/limit/offset/has_more） | `items`、`total`、`limit`、`offset`、`has_more`、`count`、`duration_ms`、`truncated` |
| 列表 | service 返回 list | `items`（已截到 limit）、`count`、`limit`、`duration_ms`、`truncated` |
| 单体 | dict 结果和全部写入工具 | `data`、`duration_ms`、`truncated` |

- `count`：本次实际返回条数
- `duration_ms`：服务端执行耗时（毫秒）
- `truncated`：还有更多数据，或本次被 limit / `sections` / `history_limit` 裁剪过
- 详情类工具裁剪列表字段时，会在 `data` 里补 `{字段}_total` 给出原始条数，并把外层 `truncated` 置为 `true`

### 2.3 错误契约

调用失败时抛错，错误消息以机器可读前缀开头，客户端应据此决定是换工具还是换参数：

| 前缀 | 触发场景 |
|---|---|
| `[FORBIDDEN]` | 客户端未授权、工具不在 `allowed_tools`、工具未注册、工具读写类型与调用入口不符 |
| `[NOT_FOUND]` | 标的、赛道、组合、报告、研究员不存在，或报告文件缺失 |
| `[INVALID_ARGUMENT]` | 参数非法：未知 `sections`、未知 `window_type`、`source_module` 不在白名单、正文超限等 |
| `[INTERNAL]` | 其余服务端异常 |

**查不到对象一律抛 `[NOT_FOUND]`**，不会返回 `data: null`。

### 2.4 调用日志

每次调用无论成败都会写 MCP 调用日志：`client_name`、`tool_name`、`read_only`、`risk_level`、`sanitized_arguments`、`allowed_tools`、`service_name`、`duration_ms`、`status`、`result_count`、`result_size`、`truncated`；失败时另记原始的 `error_type`、`error_message`、`stack_trace`（记的是映射前的异常类型）。`markdown` 和 `content` 参数只记录字符数和字节数，不落原文。

## 3 工具总表

| 工具 | 读写 | 风险 | 返回形态 | 底层 service |
|---|---|---|---|---|
| `market_radar.search_source_items` | 只读 | low | 分页 | `market_radar.service.list_source_items_page` |
| `market_radar.get_hotwords` | 只读 | low | 分页 | `market_radar.service.list_hotwords_page` |
| `market_radar.get_tag_trend` | 只读 | low | 列表 | `market_radar.service.tag_trend` |
| `track_discovery.list_tracks` | 只读 | low | 列表 | `track_discovery.service.list_tracks` |
| `track_discovery.get_track_detail` | 只读 | low | 单体 | `track_discovery.service.get_track_detail` |
| `stock_analysis.list_pool` | 只读 | low | 列表 | `stock_analysis.service.list_pool` |
| `stock_analysis.get_stock_profile` | 只读 | low | 单体 | `stock_analysis.service.get_stock_detail` |
| `stock_analysis.get_daily_bars` | 只读 | low | 列表 | `stock_analysis.service.list_cached_stock_daily_bars` |
| `knowledge_base.get_researcher_profile` | 只读 | low | 单体 | `knowledge_base.service.get_researcher_profile_bundle` |
| `knowledge_base.upload_research_feedback` | 写入 | medium | 单体 | `knowledge_base.service.upload_research_feedback` |
| `report_library.list_reports` | 只读 | low | 分页 | `report_library.service.list_reports_page` |
| `report_library.read_report_content` | 只读 | medium | 单体 | `report_library.service.resolve_report_path` |
| `report_library.upload_markdown_report` | 写入 | medium | 单体 | `report_library.service.create_markdown_report_file_and_index` |
| `portfolio.list_position_changes` | 只读 | low | 列表 | `portfolio.service.list_position_changes` |
| `portfolio.get_overview` | 只读 | low | 单体 | `portfolio.service.get_overview` |

## 4 工具明细

### 4.1 market_radar.search_source_items

搜索已入库的信息流条目：新闻、公告、快讯、研报摘要等。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `q` | string \| null | `null` | 关键词，匹配标题和正文 |
| `source_name` | string \| null | `null` | 来源名称，精确匹配 |
| `source_type` | string \| null | `null` | 来源类型，精确匹配 |
| `important_only` | bool | `false` | 只看重要条目 |
| `tag_id` | int \| null | `null` | 按标签过滤 |
| `start_time` | string \| null | `null` | `YYYY-MM-DD` 或完整 ISO 时间，前者按当天零点 |
| `end_time` | string \| null | `null` | 同上 |
| `content_chars` | int | `300` | 正文截断字符数，`0` 表示返回全文 |
| `limit` | int | `50` | 受上限约束 |
| `offset` | int | `0` | 分页偏移 |

时间过滤按 `publish_time` 判断；`publish_time` 为空的条目回退用 `created_at`，不会被整段筛掉。

返回分页信封，`items[]` 每条：`id`、`source_type`、`source_name`、`title`、`content`、`source_url`、`publish_time`、`related_type`、`related_id`、`created_at`、`source_tags[]`。
正文被截断的条目额外带 `content_truncated: true` 和 `content_length`（原始字符数）。
`source_tags[]` 每项：`id`、`source_item_id`、`tag_id`、`trigger_text`、`confidence`、`extractor`、`created_at`、`tag`。
排序：`publish_time` 倒序、`id` 倒序。

### 4.2 market_radar.get_hotwords

查询市场雷达热词列表。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `status` | string \| null | `null` | 热词状态，如 `active` |
| `q` | string \| null | `null` | 名称模糊匹配 |
| `limit` | int | `50` | 受上限约束 |
| `offset` | int | `0` | 分页偏移 |

返回分页信封，`items[]` 每条：`id`、`name`、`description`、`status`、`tags[]`（标签绑定，含 `tag`、`source`、`status`）、`created_at`、`updated_at`。排序：`name` 升序。

### 4.3 market_radar.get_tag_trend

按标签 ID 查热度趋势。`tag_id` 必须已知，不要猜。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `tag_id` | int | 必填 | 标签 ID |
| `window_type` | string | `"7d"` | 统计窗口，取值 `24h` / `7d` / `30d`，非法值报 `[INVALID_ARGUMENT]` |
| `limit` | int | `50` | 取最近 N 条 |

**同一标签在三个窗口各有一条独立序列**，`heat_score` 量纲不同，跨窗口比较没有意义，所以必须按 `window_type` 取。

返回列表信封，`items[]` 为 `tag_heat_snapshot` 行：`id`、`tag_id`、`window_type`、`stat_time`、`trigger_count`、`source_count`、`heat_score`、`avg_count`、`rank_no`、`created_at`。取该窗口最近 limit 条，按 `stat_time` 升序返回。

### 4.4 track_discovery.list_tracks

查询赛道列表，用来拿到后续 `get_track_detail` 所需的 `track_id`。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `status` | string \| null | `null` | 赛道状态 |
| `q` | string \| null | `null` | 匹配名称、描述、当前观点 |
| `limit` | int | `50` | 受上限约束 |
| `offset` | int | `0` | 分页偏移 |

返回列表信封，`items[]` 每条：`id`、`name`、`description`、`status`、`track_score`、`current_view`、`stage`、`confidence_level`、`created_at`、`updated_at`、`tag`。排序：`updated_at` 倒序、`id` 倒序。

### 4.5 track_discovery.get_track_detail

按赛道 ID 取详情。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `track_id` | int | 必填 | 赛道 ID |
| `sections` | string[] \| null | `["stocks","tags"]` | 可选 `materials` / `snapshots` / `stocks` / `tags` / `heat`，未选中的整段不返回 |
| `list_limit` | int | `20` | 列表字段各自的条数上限 |

返回单体信封，`data` 恒含 `track`（字段同 4.4）、`summary`（`tag_count`、`material_count`、`pending_material_count`、`high_importance_material_count`、`bound_stock_count`、`latest_heat_score`、`last_updated_at`）和 `latest_snapshot`；其余按 `sections`：

| section | 字段 |
|---|---|
| `materials` | `materials` |
| `snapshots` | `analysis_snapshots` |
| `stocks` | `stocks` |
| `tags` | `tags`（只含 active 绑定） |
| `heat` | `heat_trends` |

`summary` 里的计数始终是全量口径，不受裁剪影响。赛道不存在抛 `[NOT_FOUND]`。

### 4.6 stock_analysis.list_pool

查询标的池，**这是拿 `stock_id` 的入口**。支持按证券代码、名称、拼音、简称模糊匹配。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `q` | string \| null | `null` | 关键词，匹配 `symbol`、`stock_code`、`stock_name`、`name_pinyin`、`name_abbr` |
| `limit` | int | `50` | 受上限约束 |

返回列表信封，`items[]` 每条：`id`（标的池条目 ID）、`stock_id`、`status`、`source`、`reason`、`track_ids`、`tracks`、`symbol`、`stock_code`、`stock_name`、`created_at`、`updated_at`。排序：`updated_at` 倒序。

注意 `id` 是标的池条目 ID，`stock_id` 才是 `get_stock_profile` 和 `get_daily_bars` 要的那个；`track_ids` 可以直接拿去调 `track_discovery.get_track_detail`。范围限定在标的池内，不覆盖全量股票主表。

### 4.7 stock_analysis.get_stock_profile

按标的 ID 取本地画像。**不要把证券代码当 `stock_id`**，缺 ID 先用 `stock_analysis.list_pool` 查。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `stock_id` | int | 必填 | 标的主键 ID |
| `sections` | string[] \| null | `["score","valuation","tracks"]` | 可选 `score` / `valuation` / `materials` / `disclosures` / `tracks` / `notes` / `tags`，未选中的整段不返回 |
| `history_limit` | int | `20` | 各列表字段的条数上限 |

返回单体信封，`data` 恒含 `stock`（`id`、`symbol`、`stock_code`、`stock_name`、`market`、`exchange`、`status`、`created_at`、`updated_at`）、`pool`（标的池条目，无则 `null`）和 `summary`（`track_count`、`material_count`、`high_importance_material_count`、`note_count`、`last_updated_at`）；其余按 `sections`：

| section | 字段 | 裁剪方式 |
|---|---|---|
| `score` | `latest_score`、`score_history` | 历史取最近 `history_limit` 条（原序为时间升序） |
| `valuation` | `latest_valuation`、`valuation_history` | 同上 |
| `materials` | `materials` | 取最新 `history_limit` 条 |
| `disclosures` | `disclosures` | 取最新 `history_limit` 条 |
| `tracks` | `tracks` | 不裁剪 |
| `notes` | `notes` | 取最新 `history_limit` 条 |
| `tags` | `tags` | 取前 `history_limit` 条 |

`summary` 里的计数始终是全量口径。标的不存在抛 `[NOT_FOUND]`。

### 4.8 stock_analysis.get_daily_bars

读本地缓存的日 K，只读 `source=tushare`、`adj=qfq` 的数据，**不触发行情刷新**。`stock_id` 同样先用 `stock_analysis.list_pool` 查。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `stock_id` | int | 必填 | 标的主键 ID |
| `start_date` | string \| null | `null` | `YYYY-MM-DD` |
| `end_date` | string \| null | `null` | `YYYY-MM-DD` |
| `limit` | int | `50` | 取最近 N 个交易日，本工具上限放宽到 800 |

返回列表信封，`items[]` 每条：`id`、`stock_id`、`ts_code`、`trade_date`、`open`、`high`、`low`、`close`、`pre_close`、`change`、`pct_chg`、`vol`、`amount`、`ma5`、`ma20`、`ma60`、`ma250`。先按 `trade_date` 倒序取最近 limit 条，再反转成正序返回。超过 800 根请按日期分段取。标的不存在抛 `[NOT_FOUND]`。

### 4.9 knowledge_base.get_researcher_profile

读研究员 profile，含简介、价值观、方法论三段正文。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `researcher` | string | `"标的评级师"` | 支持展示名、`researcher_code`，纯数字时按 ID 匹配 |

返回单体信封，`data` 字段：`id`、`researcher_code`、`display_name`、`status`、`intro`、`soul`、`method`、`profile_path`、`profile_hash`、`profile_content`、`created_at`、`updated_at`。
研究员不存在抛 `[NOT_FOUND]`，`researcher` 为空抛 `[INVALID_ARGUMENT]`。

### 4.10 knowledge_base.upload_research_feedback

受控写入。先把 Markdown 写进报告库，再建 `knowledge_research_feedback` 索引。必须显式加入 `allowed_tools`。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `title` | string | 必填 | 报告标题 |
| `markdown` | string | 必填 | 报告正文，上限 1MB，不能含空字节 |
| `researcher_code` | string \| null | `null` | 必须是已存在的研究员，否则 `[INVALID_ARGUMENT]` |
| `skill_name` | string \| null | `null` | 产出该报告的 Skill |
| `business_module` | string \| null | `null` | 决定报告落盘目录，必须在模块白名单内；为空按 `knowledge_base` |
| `source` | string | `"mcp"` | 目前只允许 `mcp` |
| `status` | string | `"received"` | 允许 `received` / `parsed` / `imported` |

模块白名单：`market_radar`、`track_discovery`、`stock_analysis`、`portfolio`、`knowledge_base`、`alert_center`、`report_library`。

返回单体信封，`data` 字段：`feedback_id`、`report_id`、`report_path`、`title`、`researcher_code`、`skill_name`、`business_module`、`source`、`status`、`content_size`。

### 4.11 report_library.list_reports

查报告库列表，用来拿 `read_report_content` 所需的 `report_id`。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `q` | string \| null | `null` | 标题模糊匹配 |
| `report_kind` | string \| null | `null` | 报告口径过滤，如 `market`、`track` |
| `limit` | int | `50` | 受上限约束 |
| `offset` | int | `0` | 分页偏移 |

返回分页信封，`items[]` 为 `report` 行：`id`、`title`、`report_type`、`source_module`、`target_type`、`target_id`、`summary`、`file_format`、`file_path`、`generated_by`、`status`、`publish_time`、`created_at`、`updated_at`。排序：`created_at` 倒序、`id` 倒序。

### 4.12 report_library.read_report_content

按报告 ID 读正文。路径由服务端从索引解析，客户端不能指定任意路径。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `report_id` | int | 必填 | 报告 ID |

返回单体信封，`data` 字段：`report_id`、`title`、`content`。报告记录或文件缺失抛 `[NOT_FOUND]`。

### 4.13 report_library.upload_markdown_report

受控写入。落盘到 `var/reports/{source_module}/YYYY-MM/mcp-upload-YYYYMMDD-HHMMSS.md`，同时建报告索引；客户端不能指定路径或文件名。必须显式加入 `allowed_tools`。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `title` | string | 必填 | 报告标题，不能为空 |
| `source_module` | string | 必填 | 归属模块，必须在白名单内（同 4.10），决定存储子目录 |
| `markdown` | string | 必填 | 报告正文，上限 1MB，不能含空字节 |

返回单体信封，`data` 字段：`report_id`、`title`、`source_module`、`file_path`（相对 `var/`）、`status`、`content_size`。索引记录固定 `report_type=mcp_upload`、`file_format=md`、`generated_by=mcp`，`summary` 取正文第一段。

### 4.14 portfolio.list_position_changes

查询调仓记录，供组合复盘按时间段回看持仓变动。

**本系统不记录买卖成交。** 调仓的定义就是个股持仓数量的变动，所以返回里只有调整前后的数量、增减量和调仓理由，没有成交价、方向和费用；现金变化由现金校准（`portfolio_cash_flow` 的 `adjustment`）单独维护，两者不互相推导，不要拿调仓记录去反推成交金额。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `portfolio_id` | int \| null | `null` | 指定组合，留空为全部组合 |
| `stock_id` | int \| null | `null` | 只看某个标的的调仓 |
| `start_date` | string \| null | `null` | `YYYY-MM-DD`，按调仓日期过滤 |
| `end_date` | string \| null | `null` | `YYYY-MM-DD` |
| `limit` | int | `100` | 本工具上限放宽到 200 |

返回列表信封，`items[]` 每条：`id`、`portfolio_id`、`portfolio_name`、`stock_id`、`stock_code`、`stock_name`、`quantity_before`、`quantity_after`、`quantity_delta`（正数加仓、负数减仓）、`change_date`、`note`（调仓理由）、`created_at`。按 `change_date` 倒序、`id` 倒序。

新建持仓是 `0 → N`，清仓和删除持仓是 `N → 0`。

### 4.15 portfolio.get_overview

组合总览。`portfolio_id` 为空时返回全组合汇总。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `portfolio_id` | int \| null | `null` | 指定组合，留空为全部；指定的组合不存在抛 `[NOT_FOUND]` |

返回单体信封，`data` 字段：

- `scope`：`single` 或 `all`
- `portfolio_id`：本次查询的组合 ID，全部时为 `null`
- `portfolio_options`：可选组合列表，含 `id`、`name`、`base_currency` 等
- `summary`：`portfolio_count`、`position_count`、`position_market_value`、`cash_amount`、`total_value`、`day_pnl`、`day_pct`、`year_pnl`
- `allocation_rows`：持仓分布明细，含 `stock_id`、`stock_code`、`label`、`quantity`、`market_value`、`previous_market_value`、`day_pnl`、`current_price`、`quote_time`
- `pie_items`：`allocation_rows` 中市值大于 0 的非汇总行

行情不可用时 `day_pnl`、`day_pct` 可能为 `null`。

## 5 ID 从哪来

按 ID 取数的工具都要求真实主键，不允许猜，也不能把证券代码当 `stock_id`。各类 ID 的获取路径：

| ID | 入口 | 说明 |
|---|---|---|
| `stock_id` | `stock_analysis.list_pool` | 主入口，支持代码、名称、拼音、简称模糊匹配 |
| `stock_id` | `track_discovery.get_track_detail` → `stocks[].stock_id` | 间接，限已绑定该赛道的标的 |
| `stock_id` | `portfolio.get_overview` → `allocation_rows[].stock_id` | 间接，限当前持仓 |
| `track_id` | `track_discovery.list_tracks` → `items[].id` | 主入口，支持 `q` 关键词 |
| `track_id` | `stock_analysis.list_pool` → `items[].track_ids` | 顺带拿到，标的已绑定的赛道 |
| `tag_id` | `market_radar.search_source_items` → `items[].source_tags[].tag_id` | 目前没有独立的标签查询工具 |
| `tag_id` | `market_radar.get_hotwords` → `items[].tags[].tag.id` | 同上 |
| `tag_id` | `track_discovery.list_tracks` → `items[].tag.id` | 赛道绑定的标签 |
| `tag_id` | `stock_analysis.get_stock_profile` → `tags[].tag.id` | 标的绑定的标签，需要 `sections` 里带上 `tags` |
| `report_id` | `report_library.list_reports` → `items[].id` | 主入口，支持标题关键词 |
| `portfolio_id` | `portfolio.get_overview` → `portfolio_options[].id` | 不传则返回全组合汇总 |
| `portfolio_id` | `portfolio.list_position_changes` → `items[].portfolio_id` | 顺带拿到，含组合名 |

`tag_id` 只服务 `market_radar.get_tag_trend` 一个工具，暂不单独开列表入口：热词、赛道、标的的返回里都会带出各自绑定的标签，而热度趋势的典型问法本来就是围绕热词，`market_radar.get_hotwords` 支持 `q` 关键词，两步即可拿到。若以后确有“按标签名直接查趋势”的固定场景，更合适的做法是给 `get_tag_trend` 增加 `tag_name` 参数由服务端解析，而不是把语言层的 `tag` 全表暴露给外部 client。

## 6 约束提醒

- 默认工具均为只读；两个写入工具（`knowledge_base.upload_research_feedback`、`report_library.upload_markdown_report`）只做受控入库，模块名走白名单、正文 1MB 上限、拒绝空字节，不允许任意路径或任意文件。
- MCP 层不绕过业务模块直接写库，全部经各模块 service；返回裁剪只做在 MCP 包装层（`projection.py`），业务 service 的返回结构对 Web 和 H5 保持不变。
- 详情类工具默认返回精简集，材料、公告、笔记、标签、历史序列都要用 `sections` 显式索取，避免一次把外部上下文打满。
- 详情类工具需要真实主键 ID，缺 ID 时先用对应的列表或搜索工具查，不要猜 ID，也不要把证券代码当 `stock_id`。
- 返回内容以中文为主，客户端按 UTF-8 解码。
- 新增工具必须同时登记 `registry.TOOL_REGISTRY`（`read_only`、`risk_level`、`service_name`，需要放宽条数时加 `max_result_limit`）、`server.MCP_TOOL_DESCRIPTIONS` 和 `_register_tools`，否则执行期会因未注册被拒。
