# liuli 数据库表设计说明书 v8

> 来源：从 `liuli_system_spec_v24.md` 中单独提取数据库表设计。
> 本版重点：标签模型调整为 `tag` 语言入口 + `stock/track/hotword` 业务实体 + relation 绑定关系。

---

## 1. 数据库设计总原则

```text
业务模块内聚优先；
数据库统一管理；
tag 是语言词项，不是业务主体；
stock / track / hotword 是业务实体；
实体通过 relation 绑定多个 tag；
source_tag 是信息流命中关系；
tag_heat_snapshot 是标签词热度；
实体热度通过绑定关系聚合；
不使用 stock_alias / track_alias / hotword_alias；
ai_tag_suggestion 替代 tag_candidate。
```

---

## 2. 本版表结构变更

```text
新增表：stock_tag_relation、track_tag_relation、hotword、hotword_tag_relation、ai_tag_suggestion
删除/停用：stock_alias、track_alias、hotword_alias、tag_candidate
修改核心表：tag
保留但调整口径：source_tag、tag_heat_snapshot、tag_edge_snapshot
```

---

## 3. 关键关系

```text
source_item → source_tag → tag
stock → stock_tag_relation → tag
track → track_tag_relation → tag
hotword → hotword_tag_relation → tag
stock → stock_track_relation → track
```

---

## 4. 表结构明细

> 本节集中展示主要数据表。每张表名后附简要说明；详细 DDL、索引、约束以迁移文件为准。

### 34.1 basic/auth

#### `user_account`：用户登录账户表，负责系统访问安全

| 字段            | 说明     |
| ------------- | ------ |
| id            | 主键     |
| username      | 登录用户名  |
| password_hash | 密码哈希   |
| display_name  | 显示名    |
| email         | 邮箱，可选  |
| status        | 状态     |
| last_login_at | 最近登录时间 |
| created_at    | 创建时间   |
| updated_at    | 更新时间   |

---

### 34.2 basic/stock_master

#### `stock`：A股股票基础主数据表，保存客观交易品种信息

| 字段         | 说明            |
| ---------- | ------------- |
| id         | 主键            |
| stock_code | 股票代码          |
| stock_name | 股票名称          |
| market     | 市场，如 A股、港股、美股 |
| exchange   | 交易所           |
| status     | 状态            |
| created_at | 创建时间          |
| updated_at | 更新时间          |

说明：

```text
stock 是系统内部标准股票主数据；
同步 A 股基础库时不批量生成 tag；
加入 stock_pool 后才 ensure 同名 tag 并写 stock_tag_relation。
```

---

### 34.3 basic/system_config

#### `system_config`：系统运行配置表，保存非敏感、可调整的业务配置

| 字段           | 说明                        |
| ------------ | ------------------------- |
| id           | 主键                        |
| config_key   | 配置键                       |
| config_value | 配置值                       |
| config_type  | 类型，如 string/int/bool/json |
| module_name  | 所属模块                      |
| description  | 描述                        |
| enabled      | 是否启用                      |
| created_at   | 创建时间                      |
| updated_at   | 更新时间                      |

---

### 34.4 basic/ai_audit

#### `ai_request_log`：AI 请求审计日志表，每一次 AI 请求一条记录

| 字段                  | 说明                                       |
| ------------------- | ---------------------------------------- |
| id                  | 主键                                       |
| request_id          | 本次 AI 请求唯一 ID                            |
| source_module       | 来源模块                                     |
| task_name           | AI 任务名                                   |
| provider            | AI 厂家，如 openai/qwen/kimi/deepseek/gemini |
| model_name          | 模型名                                      |
| prompt_version      | Prompt 版本                                |
| input_tokens        | 输入 Token 数                               |
| output_tokens       | 输出 Token 数                               |
| total_tokens        | 总 Token 数                                |
| context_window      | 模型最大上下文窗口                                |
| context_used_tokens | 本次实际上下文 Token                            |
| context_usage_ratio | 上下文使用比例                                  |
| input_chars         | 输入字符数                                    |
| output_chars        | 输出字符数                                    |
| messages_count      | messages 数量                              |
| input_hash          | 输入内容 Hash                                |
| output_hash         | 输出内容 Hash                                |
| raw_request_path    | 原始请求文件路径                                 |
| raw_response_path   | 原始响应文件路径                                 |
| latency_ms          | 请求耗时                                     |
| success             | 是否成功                                     |
| error_code          | 错误码                                      |
| error_message       | 错误信息                                     |
| cost_amount         | 估算成本                                     |
| currency            | 币种                                       |
| related_type        | 关联对象类型                                   |
| related_id          | 关联对象 ID                                  |
| created_at          | 创建时间                                     |

### 34.5 basic/job_center

#### `job_config`：任务配置表，保存任务身份、展示信息、配置 JSON 和最近运行状态

| 字段           | 说明                                 |
| ------------ | ---------------------------------- |
| id           | 主键                                 |
| job_name     | 全局唯一任务名，例如 market_radar.fetch_news |
| module_name  | 所属模块                               |
| display_name | 展示名称                               |
| description  | 描述                                 |
| config_json  | 任务可执行配置，JSON                       |
| ext_json     | 展示、分类、标签等扩展信息，JSON                 |
| last_run_at  | 最近执行时间                             |
| last_status  | 最近执行状态                             |
| next_run_at  | 下次执行时间                             |
| created_at   | 创建时间                               |
| updated_at   | 更新时间                               |

说明：

```text
任务调度参数、启停、Cron、超时、重试、参数 Schema 等统一保存到 config_json；
展示标签、分类、排序等进入 ext_json；
最近错误信息通过 job_run_log 查询；
job_name 必须全局唯一。
```

#### `job_run_request`：任务手动触发请求表，记录控制台触发的待执行任务

| 字段            | 说明                                      |
| ------------- | --------------------------------------- |
| id            | 主键                                      |
| job_name      | 任务名                                     |
| params_json   | 执行参数                                    |
| status        | pending/running/success/failed/canceled |
| requested_by  | 触发用户                                    |
| requested_at  | 请求时间                                    |
| started_at    | 开始时间                                    |
| finished_at   | 结束时间                                    |
| error_message | 错误信息                                    |

#### `job_run_log`：任务执行日志表，记录每次任务运行结果和统计信息

| 字段              | 说明              |
| --------------- | --------------- |
| id              | 主键              |
| job_name        | 任务名             |
| module_name     | 所属模块            |
| trigger_type    | schedule/manual |
| status          | success/failed  |
| params_json     | 参数              |
| result_json     | 结果              |
| started_at      | 开始时间            |
| finished_at     | 结束时间            |
| duration_ms     | 耗时              |
| fetched_count   | 拉取数量            |
| processed_count | 处理数量            |
| inserted_count  | 新增数量            |
| updated_count   | 更新数量            |
| error_message   | 错误信息            |

---

### 34.6 basic/report_library

#### `report`：报告索引表，保存报告元数据和文件路径

| 字段            | 说明                                                 |
| ------------- | -------------------------------------------------- |
| id            | 主键                                                 |
| title         | 报告标题                                               |
| report_type   | daily/weekly/track/stock/portfolio/alert/knowledge |
| source_module | 来源模块                                               |
| target_type   | market/track/stock/portfolio/alert                 |
| target_id     | 目标对象 ID                                            |
| summary       | 摘要                                                 |
| file_format   | md/html/pdf                                        |
| file_path     | 报告文件路径                                             |
| generated_by  | ai/system/manual                                   |
| status        | 状态                                                 |
| publish_time  | 发布时间                                               |
| created_at    | 创建时间                                               |
| updated_at    | 更新时间                                               |

---

### 34.7 basic/disclosure_library

#### `company_disclosure`：公告财报索引表，保存公告/财报元数据、文件路径和解析状态

| 字段                   | 说明                                                         |
| -------------------- | ---------------------------------------------------------- |
| id                   | 主键                                                         |
| stock_id             | 关联 stock                                                   |
| source               | cninfo/exchange/tushare                                    |
| disclosure_type      | announcement/annual_report/quarterly_report/interim_report |
| title                | 公告标题                                                       |
| publish_time         | 发布时间                                                       |
| report_period        | 报告期                                                        |
| source_url           | 来源 URL                                                     |
| file_path            | 原始文件路径                                                     |
| parsed_text_path     | 解析文本路径                                                     |
| parsed_markdown_path | 解析 Markdown 路径                                             |
| parse_status         | 解析状态                                                       |
| created_at           | 创建时间                                                       |
| updated_at           | 更新时间                                                       |

---

### 34.8 market_radar

#### `tag`：标签词表，保存可被信息流识别的语言词项

| 字段         | 说明                             |
| ---------- | ------------------------------ |
| id         | 主键                             |
| name       | 标签词                            |
| type       | stock/track/hotword/general，可选 |
| status     | active/archived/rejected       |
| source     | ai/rule/manual/system，可选       |
| created_at | 创建时间                           |
| updated_at | 更新时间                           |

说明：

```text
tag 是语言入口，不是业务主体；
stock / track / hotword 才是业务实体。
```

#### `hotword`：市场热词实体表

| 字段          | 说明              |
| ----------- | --------------- |
| id          | 主键              |
| name        | 市场热词名称          |
| description | 描述              |
| status      | active/archived |
| created_at  | 创建时间            |
| updated_at  | 更新时间            |

#### `stock_tag_relation`：标的-标签绑定表

| 字段         | 说明                  |
| ---------- | ------------------- |
| id         | 主键                  |
| stock_id   | 关联 stock            |
| tag_id     | 关联 tag              |
| source     | manual/ai/system，可选 |
| status     | active/inactive     |
| created_at | 创建时间                |
| updated_at | 更新时间                |

#### `track_tag_relation`：赛道-标签绑定表

| 字段         | 说明                  |
| ---------- | ------------------- |
| id         | 主键                  |
| track_id   | 关联 track            |
| tag_id     | 关联 tag              |
| source     | manual/ai/system，可选 |
| status     | active/inactive     |
| created_at | 创建时间                |
| updated_at | 更新时间                |

#### `hotword_tag_relation`：市场热词-标签绑定表

| 字段         | 说明                  |
| ---------- | ------------------- |
| id         | 主键                  |
| hotword_id | 关联 hotword          |
| tag_id     | 关联 tag              |
| source     | manual/ai/system，可选 |
| status     | active/inactive     |
| created_at | 创建时间                |
| updated_at | 更新时间                |

#### `ai_tag_suggestion`：AI 推荐词表，保存 AI 从信息流中推荐、等待人工审核的词

| 字段             | 说明                        |
| -------------- | ------------------------- |
| id             | 主键                        |
| suggested_text | AI 原始推荐词                  |
| final_tag_name | 人工修正后的正式标签名，可空            |
| score          | AI 推荐强度                   |
| reason         | AI 推荐理由                   |
| status         | pending/approved/rejected |
| final_tag_id   | 最终创建或绑定的 tag_id，可空        |
| ext_json       | 扩展信息，可选                   |
| created_at     | 创建时间                      |
| updated_at     | 更新时间                      |

说明：

```text
ai_tag_suggestion 替代旧 tag_candidate；
AI 只推荐词，不判断 stock / track / hotword；
业务归属由人工审核后通过 relation 表表达。
```

#### `source_item`：信息流条目表，保存新闻、公告摘要、政策、舆情、研报摘要等市场雷达输入

| 字段           | 说明                                          |
| ------------ | ------------------------------------------- |
| id           | 主键                                          |
| source_type  | news/announcement/policy/sentiment/research |
| source_name  | 来源名称                                        |
| title        | 标题                                          |
| content      | 正文/摘要/AI摘要/关键段落                             |
| source_url   | 来源 URL                                      |
| publish_time | 发布时间                                        |
| related_type | 可选：company_disclosure/report/manual         |
| related_id   | 可选：关联业务表 ID                                 |
| created_at   | 创建时间                                        |

#### `source_tag`：信息-标签触发表，记录每条信息命中的标签词

| 字段             | 说明             |
| -------------- | -------------- |
| id             | 主键             |
| source_item_id | 信息源 ID         |
| tag_id         | 标签词 ID         |
| trigger_text   | 触发文本           |
| confidence     | 置信度            |
| extractor      | rule/ai/manual |
| created_at     | 创建时间           |

#### `tag_heat_snapshot`：标签词热度快照表，按时间窗口保存标签词热度

| 字段            | 说明            |
| ------------- | ------------- |
| id            | 主键            |
| tag_id        | 标签词 ID        |
| window_type   | 1h/24h/7d/30d |
| stat_time     | 统计时间          |
| trigger_count | 触发次数          |
| source_count  | 信息源数量         |
| heat_score    | 热度分           |
| avg_count     | 平均次数          |
| change_ratio  | 变化率           |
| rank_no       | 排名            |
| created_at    | 创建时间          |

说明：

```text
tag_heat_snapshot 是标签词热度；
stock / track / hotword 的实体热度需要通过绑定关系聚合。
```

#### `tag_edge_snapshot`：标签关系快照表，保存标签词之间的信息流共现关系

| 字段                    | 说明            |
| --------------------- | ------------- |
| id                    | 主键            |
| stock_tag_id          | 标的标签词 ID      |
| related_tag_id        | 关联标签词 ID      |
| related_tag_type      | track/hotword |
| window_type           | 1h/24h/7d/30d |
| stat_time             | 统计时间          |
| cooccur_count         | 共现次数          |
| source_count          | 信息源数量         |
| weight                | 关系权重          |
| latest_source_item_id | 最近触发信息源       |
| created_at            | 创建时间          |

说明：

```text
tag_edge_snapshot 是信息流自动关联，不是业务绑定；
stock_track_relation 才是标的-赛道的研究确认关系。
```

---

### 34.9 track_discovery

#### `track`：赛道主表，保存赛道业务实体

| 字段             | 说明                               |
| -------------- | -------------------------------- |
| id             | 主键                               |
| name           | 赛道正式名称                           |
| description    | 简要说明，可选                          |
| status         | candidate/active/paused/archived |
| priority_level | high/medium/low，可选               |
| archive_reason | 归档原因，可选                          |
| created_at     | 创建时间                             |
| updated_at     | 更新时间                             |

#### `track_thesis`：赛道假设表，保存需要长期验证的赛道认知假设

| 字段                | 说明       |
| ----------------- | -------- |
| id                | 主键       |
| track_id          | 关联 track |
| user_id           | 用户 ID    |
| title             | 赛道假设标题   |
| core_thesis       | 核心假设     |
| underlying_change | 底层变化     |
| old_bottleneck    | 旧瓶颈      |
| new_solution      | 新解决方案    |
| value_chain_shift | 价值链变化    |
| time_horizon      | 时间周期     |
| confidence_level  | 置信度      |
| status            | 状态       |
| created_at        | 创建时间     |
| updated_at        | 更新时间     |

#### `track_validation_indicator`：赛道验证指标表，保存判断赛道真伪和阶段的指标

| 字段                 | 说明      |
| ------------------ | ------- |
| id                 | 主键      |
| thesis_id          | 赛道假设 ID |
| name               | 指标名称    |
| indicator_type     | 指标类型    |
| data_source        | 数据来源    |
| current_value      | 当前值     |
| direction          | 变化方向    |
| validation_meaning | 验证意义    |
| updated_at         | 更新时间    |

#### `track_evidence`：赛道证据表，保存支持、削弱或中性的证据记录

| 字段                 | 说明                           |
| ------------------ | ---------------------------- |
| id                 | 主键                           |
| thesis_id          | 赛道假设 ID                      |
| source_item_id     | 信息源 ID                       |
| evidence_direction | support/weaken/neutral/noise |
| evidence_strength  | 证据强度                         |
| summary            | 摘要                           |
| affected_segments  | 影响环节                         |
| related_stock_ids  | 相关股票                         |
| created_at         | 创建时间                         |

#### `track_status_history`：赛道状态历史表，记录赛道状态变化和原因

| 字段         | 说明      |
| ---------- | ------- |
| id         | 主键      |
| thesis_id  | 赛道假设 ID |
| old_status | 原状态     |
| new_status | 新状态     |
| reason     | 变更原因    |
| changed_at | 变更时间    |

---

### 34.10 stock_analysis

#### `stock_research_note`：标的研究笔记表，保存围绕具体公司的研究记录

| 字段               | 说明    |
| ---------------- | ----- |
| id               | 主键    |
| stock_id         | 股票 ID |
| note_type        | 笔记类型  |
| title            | 标题    |
| content          | 内容    |
| related_track_id | 关联赛道  |
| created_at       | 创建时间  |
| updated_at       | 更新时间  |

#### `stock_score_snapshot`：标的评分快照表，保存某时点的公司多维评分

| 字段              | 说明    |
| --------------- | ----- |
| id              | 主键    |
| stock_id        | 股票 ID |
| score_date      | 评分日期  |
| track_id        | 关联赛道  |
| growth_score    | 成长性分  |
| valuation_score | 估值分   |
| moat_score      | 壁垒分   |
| risk_score      | 风险分   |
| total_score     | 总分    |
| created_at      | 创建时间  |

#### `stock_compare_group`：标的对比组表，用于同赛道公司横向 PK

| 字段          | 说明    |
| ----------- | ----- |
| id          | 主键    |
| name        | 对比组名称 |
| track_id    | 关联赛道  |
| stock_ids   | 对比股票  |
| description | 描述    |
| created_at  | 创建时间  |
| updated_at  | 更新时间  |

#### `stock_thesis`：标的假设表，保存公司投资逻辑、验证指标和证伪条件

| 字段                       | 说明    |
| ------------------------ | ----- |
| id                       | 主键    |
| stock_id                 | 股票 ID |
| thesis_text              | 标的假设  |
| key_logic                | 核心逻辑  |
| validation_indicators    | 验证指标  |
| falsification_conditions | 证伪条件  |
| status                   | 状态    |
| created_at               | 创建时间  |
| updated_at               | 更新时间  |

#### `stock_pool`：标的研究池，保存候选、观察、重点跟踪等研究状态

| 字段         | 说明                                        |
| ---------- | ----------------------------------------- |
| id         | 主键                                        |
| stock_id   | 股票 ID                                     |
| status     | candidate/watching/focused/archived       |
| source     | 来源：manual/ai/market_radar/track_discovery |
| reason     | 入池原因                                      |
| created_at | 创建时间                                      |
| updated_at | 更新时间                                      |

#### `stock_track_relation`：标的-赛道绑定表，保存研究确认后的标的所属赛道关系

| 字段            | 说明                        |
| ------------- | ------------------------- |
| id            | 主键                        |
| stock_id      | 标的 ID                     |
| track_id      | 赛道 ID                     |
| relation_type | 关系类型：core/related/watch   |
| source        | 来源：manual/ai/market_radar |
| confidence    | 置信度，可选                    |
| note          | 备注                        |
| status        | active/inactive           |
| created_at    | 创建时间                      |
| updated_at    | 更新时间                      |

---

### 34.11 alert_center

#### `alert_rule`：预警规则表，保存价格、热度、公告、组合等触发条件

| 字段             | 说明    |
| -------------- | ----- |
| id             | 主键    |
| user_id        | 用户 ID |
| rule_type      | 规则类型  |
| target_type    | 目标类型  |
| target_id      | 目标 ID |
| condition_json | 触发条件  |
| enabled        | 是否启用  |
| created_at     | 创建时间  |
| updated_at     | 更新时间  |

#### `alert_event`：预警事件表，保存规则触发后的具体提醒记录

| 字段          | 说明    |
| ----------- | ----- |
| id          | 主键    |
| rule_id     | 规则 ID |
| event_time  | 事件时间  |
| event_level | 级别    |
| title       | 标题    |
| message     | 消息    |
| status      | 状态    |
| created_at  | 创建时间  |

---

### 34.12 portfolio

#### `portfolio`：投资组合表，保存实盘组合名称、基准货币等组合元信息

| 字段            | 说明    |
| ------------- | ----- |
| id            | 主键    |
| user_id       | 用户 ID |
| name          | 组合名称  |
| base_currency | 基准货币  |
| created_at    | 创建时间  |
| updated_at    | 更新时间  |

#### `portfolio_group`：实盘组合分组表，区分核心仓、卫星仓、防守仓、现金仓等实盘仓位角色

| 字段              | 说明                                   |
| --------------- | ------------------------------------ |
| id              | 主键                                   |
| portfolio_id    | 组合 ID                                |
| name            | 分组名称                                 |
| group_type      | core/satellite/defensive/cash/custom |
| target_weight   | 目标权重，可选                              |
| max_stock_count | 个股数量配置项，可选                           |
| sort_order      | 排序                                   |
| note            | 备注                                   |
| status          | active/inactive                      |
| created_at      | 创建时间                                 |
| updated_at      | 更新时间                                 |

#### `portfolio_position`：实盘持仓表，保存组合内真实持仓数量和成本

| 字段            | 说明        |
| ------------- | --------- |
| id            | 主键        |
| portfolio_id  | 组合 ID     |
| group_id      | 实盘分组 ID   |
| stock_id      | 股票 ID     |
| quantity      | 实盘持仓数量    |
| cost_price    | 成本价       |
| current_price | 当前价，可选    |
| market_value  | 市值，可计算    |
| target_weight | 个股目标权重，可选 |
| note          | 备注        |
| status        | 状态        |
| created_at    | 创建时间      |
| updated_at    | 更新时间      |

---

### 34.13 knowledge_base

#### `knowledge_note`：知识笔记表，保存心得、复盘、原则、错误案例等认知材料

| 字段             | 说明                                                    |
| -------------- | ----------------------------------------------------- |
| id             | 主键                                                    |
| title          | 标题                                                    |
| content        | 内容                                                    |
| note_type      | thesis/stock/portfolio/alert/market/mistake/principle |
| related_module | 关联模块                                                  |
| related_id     | 关联对象                                                  |
| tags           | 标签                                                    |
| status         | 状态                                                    |
| created_at     | 创建时间                                                  |
| updated_at     | 更新时间                                                  |

#### `knowledge_skill`：知识 Skill 表，将经验提炼为可复用分析准则

| 字段              | 说明        |
| --------------- | --------- |
| id              | 主键        |
| title           | Skill 标题  |
| skill_type      | Skill 类型  |
| principle       | 分析准则      |
| description     | 描述        |
| input_schema    | 输入结构      |
| output_schema   | 输出结构      |
| prompt_template | Prompt 模板 |
| status          | 状态        |
| created_at      | 创建时间      |
| updated_at      | 更新时间      |

#### `knowledge_agent`：知识 Agent 表，将多个 Skills 编排为可执行分析流程

| 字段            | 说明         |
| ------------- | ---------- |
| id            | 主键         |
| name          | Agent 名称   |
| target_module | 目标模块       |
| description   | 描述         |
| skills_json   | 编排的 Skills |
| workflow_json | 工作流        |
| status        | 状态         |
| created_at    | 创建时间       |
| updated_at    | 更新时间       |

#### `knowledge_feedback_log`：业务反哺日志表，记录 Agent/Skill 对业务模块的反哺结果

| 字段             | 说明       |
| -------------- | -------- |
| id             | 主键       |
| agent_id       | Agent ID |
| target_module  | 目标模块     |
| target_id      | 目标对象     |
| feedback_type  | 反馈类型     |
| result_summary | 结果摘要     |
| effectiveness  | 有效性      |
| created_at     | 创建时间     |

---

---

---

## 5. 一句话总结

```text
信息流产生语言信号，AI 推荐词负责发现未知词，tag 承载语言词项，stock / track / hotword 承载业务实体，relation 表负责把语言绑定到业务对象。
```
