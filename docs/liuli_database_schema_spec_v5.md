# liuli 数据库表设计说明书 v5

> 来源：从 `liuli_system_spec_v20.md` 中单独提取数据库表设计。  
> 目的：作为后端建表、SQLAlchemy Model、迁移脚本和 AI 编码实现的独立数据库参考文档。  
> 说明：本文件只描述主要表结构、表含义和关键建模口径；详细 DDL、索引、外键、唯一约束以迁移文件为准。

---

## 1. 数据库设计总原则

```text
业务模块内聚优先；
数据库统一管理；
表归属按模块划分；
查询逻辑贴近业务模块；
业务实体与标签投影分离；
候选状态由业务实体/业务池承载；
source_item 统一承接市场雷达信息流；
tag 是统计索引，不是用户主要创建对象；
portfolio 只承载实盘组合；
不把市场共现关系误当成研究确认关系。
```

---

## 2. 模块与表总览

| 模块 | 主要表 |
|---|---|
| basic/auth | user_account |
| basic/stock_master | stock, stock_alias |
| basic/system_config | system_config |
| basic/ai_audit | ai_request_log |
| basic/job_center | job_config, job_run_request, job_run_log |
| basic/report_library | report |
| basic/disclosure_library | company_disclosure |
| market_radar | tag, hotword_alias, source_item, source_tag, tag_heat_snapshot, tag_edge_snapshot, tag_candidate |
| track_discovery | track, track_alias, track_thesis, track_validation_indicator, track_evidence, track_status_history |
| stock_analysis | stock_pool, stock_research_note, stock_score_snapshot, stock_compare_group, stock_thesis, stock_track_relation |
| alert_center | alert_rule, alert_event |
| portfolio | portfolio, portfolio_group, portfolio_position |
| knowledge_base | knowledge_note, knowledge_skill, knowledge_agent, knowledge_feedback_log |

---

## 3. 关键建模口径

### 3.1 业务实体与标签投影

```text
stock  → tag(type=stock)
track  → tag(type=track)
hotword 只存在于 tag(type=hotword)
```

### 3.2 别名归一

```text
stock_alias   → stock → tag(type=stock)
track_alias   → track → tag(type=track)
hotword_alias → tag(type=hotword)
```

```text
alias_resolver 是服务，不是表；
负责把 stock_alias / track_alias / hotword_alias 统一解析成正式 tag。
```

### 3.3 source_item 是统一信息流条目

```text
source_item 不只包含新闻；
也包含公告摘要、政策、舆情、研报摘要等市场雷达输入。
```

公告原始文件归：

```text
company_disclosure
```

市场雷达分析条目归：

```text
source_item(source_type=announcement, related_type=company_disclosure, related_id=xxx)
```

### 3.4 候选对象不单独建候选表

```text
候选赛道 = track.status = candidate
候选标的 = stock_pool.status = candidate
```

不单独建：

```text
track_candidate
candidate_track
stock_candidate
candidate_stock
```

### 3.5 赛道建模

```text
track                 赛道主表
track_alias           赛道别名
tag(type=track)       赛道标签投影
track_thesis          赛道研究假设
stock_track_relation  标的-赛道确认关系
tag_edge_snapshot     市场自动共现信号
```

### 3.6 标的建模

```text
stock 新增/更新/停用
  ↓
自动同步 tag(type=stock)
```

公司简称、别名进入：

```text
stock_alias
```

候选、观察、重点跟踪等研究状态进入：

```text
stock_pool
```

### 3.7 组合建模

```text
portfolio_group 只服务实盘组合分组；
portfolio_position 只记录真实持仓；
标的候选/观察/重点跟踪状态由 stock_pool 承载。
```

### 3.8 候补标签保持极简

```text
tag_candidate 只是 tag 的待审核池；
suggested_type 只对应 stock / track / hotword；
不设计 category / suggested_category；
target_tag_id 可选，仅在 approved / merged 后填写。
```

---

## 4. 表结构明细

> 本节集中展示主要数据表。每张表名后附简要说明；详细 DDL、索引、约束以迁移文件为准。

### 34.1 basic/auth

#### `user_account`：用户登录账户表，负责系统访问安全

| 字段 | 说明 |
|---|---|
| id | 主键 |
| username | 登录用户名 |
| password_hash | 密码哈希 |
| display_name | 显示名 |
| email | 邮箱，可选 |
| status | 状态 |
| last_login_at | 最近登录时间 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

---

### 34.2 basic/stock_master

#### `stock`：A股股票基础主数据表，保存客观交易品种信息

| 字段 | 说明 |
|---|---|
| id | 主键 |
| stock_code | 股票代码 |
| stock_name | 股票名称 |
| market | 市场，如 A股、港股、美股 |
| exchange | 交易所 |
| status | 状态 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `stock_alias`：股票别名表，用于维护简称、曾用名、英文名等映射

| 字段 | 说明 |
|---|---|
| id | 主键 |
| stock_id | 关联 stock |
| alias | 别名/简称/曾用名 |
| alias_type | 别名类型 |
| source | 来源 |
| created_at | 创建时间 |

---

### 34.3 basic/system_config

#### `system_config`：系统运行配置表，保存非敏感、可调整的业务配置

| 字段 | 说明 |
|---|---|
| id | 主键 |
| config_key | 配置键 |
| config_value | 配置值 |
| config_type | 类型，如 string/int/bool/json |
| module_name | 所属模块 |
| description | 描述 |
| enabled | 是否启用 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

---

### 34.4 basic/ai_audit

#### `ai_request_log`：AI 请求审计日志表，每一次 AI 请求一条记录

| 字段 | 说明 |
|---|---|
| id | 主键 |
| request_id | 本次 AI 请求唯一 ID |
| source_module | 来源模块 |
| task_name | AI 任务名 |
| provider | AI 厂家，如 openai/qwen/kimi/deepseek/gemini |
| model_name | 模型名 |
| prompt_version | Prompt 版本 |
| input_tokens | 输入 Token 数 |
| output_tokens | 输出 Token 数 |
| total_tokens | 总 Token 数 |
| context_window | 模型最大上下文窗口 |
| context_used_tokens | 本次实际上下文 Token |
| context_usage_ratio | 上下文使用比例 |
| input_chars | 输入字符数 |
| output_chars | 输出字符数 |
| messages_count | messages 数量 |
| input_hash | 输入内容 Hash |
| output_hash | 输出内容 Hash |
| raw_request_path | 原始请求文件路径 |
| raw_response_path | 原始响应文件路径 |
| latency_ms | 请求耗时 |
| success | 是否成功 |
| error_code | 错误码 |
| error_message | 错误信息 |
| cost_amount | 估算成本 |
| currency | 币种 |
| related_type | 关联对象类型 |
| related_id | 关联对象 ID |
| created_at | 创建时间 |

### 34.5 basic/job_center

#### `job_config`：任务配置表，保存任务启停、Cron、超时和运行状态

| 字段 | 说明 |
|---|---|
| id | 主键 |
| job_name | 全局唯一任务名 |
| module_name | 所属模块 |
| display_name | 展示名称 |
| description | 描述 |
| trigger_type | schedule/manual/both |
| cron_expr | Cron 表达式 |
| enabled | 是否启用 |
| timeout_seconds | 超时时间 |
| max_retries | 最大重试次数 |
| last_run_at | 最近执行时间 |
| last_status | 最近执行状态 |
| next_run_at | 下次执行时间 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `job_run_request`：任务手动触发请求表，记录控制台触发的待执行任务

| 字段 | 说明 |
|---|---|
| id | 主键 |
| job_name | 任务名 |
| params_json | 执行参数 |
| status | pending/running/success/failed/canceled |
| requested_by | 触发用户 |
| requested_at | 请求时间 |
| started_at | 开始时间 |
| finished_at | 结束时间 |
| error_message | 错误信息 |

#### `job_run_log`：任务执行日志表，记录每次任务运行结果和统计信息

| 字段 | 说明 |
|---|---|
| id | 主键 |
| job_name | 任务名 |
| module_name | 所属模块 |
| trigger_type | schedule/manual |
| status | success/failed |
| params_json | 参数 |
| result_json | 结果 |
| started_at | 开始时间 |
| finished_at | 结束时间 |
| duration_ms | 耗时 |
| fetched_count | 拉取数量 |
| processed_count | 处理数量 |
| inserted_count | 新增数量 |
| updated_count | 更新数量 |
| error_message | 错误信息 |

---

### 34.6 basic/report_library

#### `report`：报告索引表，保存报告元数据和文件路径

| 字段 | 说明 |
|---|---|
| id | 主键 |
| title | 报告标题 |
| report_type | daily/weekly/track/stock/portfolio/alert/knowledge |
| source_module | 来源模块 |
| target_type | market/track/stock/portfolio/alert |
| target_id | 目标对象 ID |
| summary | 摘要 |
| file_format | md/html/pdf |
| file_path | 报告文件路径 |
| generated_by | ai/system/manual |
| status | 状态 |
| publish_time | 发布时间 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

---

### 34.7 basic/disclosure_library

#### `company_disclosure`：公告财报索引表，保存公告/财报元数据、文件路径和解析状态

| 字段 | 说明 |
|---|---|
| id | 主键 |
| stock_id | 关联 stock |
| source | cninfo/exchange/tushare |
| disclosure_type | announcement/annual_report/quarterly_report/interim_report |
| title | 公告标题 |
| publish_time | 发布时间 |
| report_period | 报告期 |
| source_url | 来源 URL |
| file_path | 原始文件路径 |
| parsed_text_path | 解析文本路径 |
| parsed_markdown_path | 解析 Markdown 路径 |
| parse_status | 解析状态 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

---

### 34.8 market_radar

#### `tag`：标签主表，保存标的、赛道、热点词三类标签

| 字段 | 说明 |
|---|---|
| id | 主键 |
| name | 标签名称 |
| type | stock/track/hotword |
| stock_id | type=stock 时自动关联 stock；其他为空 |
| track_id | type=track 时自动关联 track；其他为空 |
| status | 状态 |
| created_at | 创建时间 |
| updated_at | 更新时间 |


#### `hotword_alias`：热点词别名表，用于将热点词别名归一到正式热点词标签

| 字段 | 说明 |
|---|---|
| id | 主键 |
| tag_id | 关联 tag，且 tag.type=hotword |
| alias | 热点词别名 |
| source | manual/ai/import |
| status | active/inactive |
| created_at | 创建时间 |
| updated_at | 更新时间 |

说明：

```text
stock_alias / track_alias 归各自业务实体；
hotword 没有独立实体，hotword_alias 直接关联 tag(type=hotword)。
```


#### `source_item`：信息流条目表，保存新闻、公告摘要、政策、舆情、研报摘要等市场雷达输入

| 字段 | 说明 |
|---|---|
| id | 主键 |
| source_type | news/announcement/policy/sentiment/research |
| source_name | 来源名称 |
| title | 标题 |
| content | 正文/摘要/AI摘要/关键段落 |
| source_url | 来源 URL |
| publish_time | 发布时间 |
| related_type | 可选：company_disclosure/report/manual |
| related_id | 可选：关联业务表 ID |
| created_at | 创建时间 |

#### `source_tag`：信息-标签触发表，记录每条信息触发了哪些标签

| 字段 | 说明 |
|---|---|
| id | 主键 |
| source_item_id | 信息源 ID |
| tag_id | 标签 ID |
| trigger_text | 触发文本 |
| confidence | 置信度 |
| extractor | rule/ai/manual |
| created_at | 创建时间 |

#### `tag_heat_snapshot`：标签热度快照表，按时间窗口保存标签热度

| 字段 | 说明 |
|---|---|
| id | 主键 |
| tag_id | 标签 ID |
| window_type | 1h/24h/7d/30d |
| stat_time | 统计时间 |
| trigger_count | 触发次数 |
| source_count | 信息源数量 |
| heat_score | 热度分 |
| avg_count | 平均次数 |
| change_ratio | 变化率 |
| rank_no | 排名 |
| created_at | 创建时间 |

#### `tag_edge_snapshot`：标签关系快照表，保存标的-赛道、标的-热点词关系强度

| 字段 | 说明 |
|---|---|
| id | 主键 |
| stock_tag_id | 标的标签 ID |
| related_tag_id | 关联标签 ID |
| related_tag_type | track/hotword |
| window_type | 1h/24h/7d/30d |
| stat_time | 统计时间 |
| cooccur_count | 共现次数 |
| source_count | 信息源数量 |
| weight | 关系权重 |
| latest_source_item_id | 最近触发信息源 |
| created_at | 创建时间 |

#### `tag_candidate`：候选标签表，保存 AI/规则发现但尚未审核的新标签

| 字段 | 说明 |
|---|---|
| id | 主键 |
| name | 候选标签名称 |
| suggested_type | 建议类型：stock / track / hotword |
| source_item_id | 来源信息 |
| trigger_text | 原文触发词 |
| confidence | 置信度 |
| reason | 推荐原因 |
| target_tag_id | 可选；approved/merged 后指向正式 tag |
| status | pending/approved/rejected/merged |
| created_at | 创建时间 |
| updated_at | 更新时间 |

说明：

```text
tag_candidate 是正式标签 tag 的待审核池；
不设计 category / suggested_category；
target_tag_id 是可选字段，只有候补标签最终落到某个正式 tag 上时才填写。
```


---

### 34.9 track_discovery

#### `track`：赛道主表，保存赛道业务实体

| 字段 | 说明 |
|---|---|
| id | 主键 |
| name | 赛道正式名称 |
| description | 简要说明，可选 |
| status | candidate/active/paused/rejected/archived |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `track_alias`：赛道别名表，维护赛道简称、旧称、市场常用说法

| 字段 | 说明 |
|---|---|
| id | 主键 |
| track_id | 关联 track |
| alias | 赛道别名 |
| source | 来源：manual/ai/import |
| status | active/inactive |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `track_thesis`：赛道假设表，保存需要长期验证的赛道认知假设

| 字段 | 说明 |
|---|---|
| id | 主键 |
| track_id | 关联 track |
| user_id | 用户 ID |
| title | 赛道假设标题 |
| core_thesis | 核心假设 |
| underlying_change | 底层变化 |
| old_bottleneck | 旧瓶颈 |
| new_solution | 新解决方案 |
| value_chain_shift | 价值链变化 |
| time_horizon | 时间周期 |
| confidence_level | 置信度 |
| status | 状态 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `track_validation_indicator`：赛道验证指标表，保存判断赛道真伪和阶段的指标

| 字段 | 说明 |
|---|---|
| id | 主键 |
| thesis_id | 赛道假设 ID |
| name | 指标名称 |
| indicator_type | 指标类型 |
| data_source | 数据来源 |
| current_value | 当前值 |
| direction | 变化方向 |
| validation_meaning | 验证意义 |
| updated_at | 更新时间 |

#### `track_evidence`：赛道证据表，保存支持、削弱或中性的证据记录

| 字段 | 说明 |
|---|---|
| id | 主键 |
| thesis_id | 赛道假设 ID |
| source_item_id | 信息源 ID |
| evidence_direction | support/weaken/neutral/noise |
| evidence_strength | 证据强度 |
| summary | 摘要 |
| affected_segments | 影响环节 |
| related_stock_ids | 相关股票 |
| created_at | 创建时间 |


#### `track_status_history`：赛道状态历史表，记录赛道状态变化和原因

| 字段 | 说明 |
|---|---|
| id | 主键 |
| thesis_id | 赛道假设 ID |
| old_status | 原状态 |
| new_status | 新状态 |
| reason | 变更原因 |
| changed_at | 变更时间 |

---

### 34.10 stock_analysis

#### `stock_research_note`：标的研究笔记表，保存围绕具体公司的研究记录

| 字段 | 说明 |
|---|---|
| id | 主键 |
| stock_id | 股票 ID |
| note_type | 笔记类型 |
| title | 标题 |
| content | 内容 |
| related_track_id | 关联赛道 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `stock_score_snapshot`：标的评分快照表，保存某时点的公司多维评分

| 字段 | 说明 |
|---|---|
| id | 主键 |
| stock_id | 股票 ID |
| score_date | 评分日期 |
| track_id | 关联赛道 |
| growth_score | 成长性分 |
| valuation_score | 估值分 |
| moat_score | 壁垒分 |
| risk_score | 风险分 |
| total_score | 总分 |
| created_at | 创建时间 |

#### `stock_compare_group`：标的对比组表，用于同赛道公司横向 PK

| 字段 | 说明 |
|---|---|
| id | 主键 |
| name | 对比组名称 |
| track_id | 关联赛道 |
| stock_ids | 对比股票 |
| description | 描述 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `stock_thesis`：标的假设表，保存公司投资逻辑、验证指标和证伪条件

| 字段 | 说明 |
|---|---|
| id | 主键 |
| stock_id | 股票 ID |
| thesis_text | 标的假设 |
| key_logic | 核心逻辑 |
| validation_indicators | 验证指标 |
| falsification_conditions | 证伪条件 |
| status | 状态 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `stock_pool`：标的研究池，保存候选、观察、核心等研究状态

| 字段 | 说明 |
|---|---|
| id | 主键 |
| stock_id | 股票 ID |
| status | candidate/watching/core/archived/rejected |
| source | 来源：manual/ai/market_radar/track_discovery |
| reason | 入池原因 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `stock_track_relation`：标的-赛道绑定表，保存研究确认后的标的所属赛道关系

| 字段 | 说明 |
|---|---|
| id | 主键 |
| stock_id | 标的 ID |
| track_id | 赛道 ID |
| relation_type | 关系类型：core/related/watch |
| source | 来源：manual/ai/market_radar |
| confidence | 置信度，可选 |
| note | 备注 |
| status | active/inactive |
| created_at | 创建时间 |
| updated_at | 更新时间 |

---

### 34.11 alert_center

#### `alert_rule`：预警规则表，保存价格、热度、公告、组合等触发条件

| 字段 | 说明 |
|---|---|
| id | 主键 |
| user_id | 用户 ID |
| rule_type | 规则类型 |
| target_type | 目标类型 |
| target_id | 目标 ID |
| condition_json | 触发条件 |
| enabled | 是否启用 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `alert_event`：预警事件表，保存规则触发后的具体提醒记录

| 字段 | 说明 |
|---|---|
| id | 主键 |
| rule_id | 规则 ID |
| event_time | 事件时间 |
| event_level | 级别 |
| title | 标题 |
| message | 消息 |
| status | 状态 |
| created_at | 创建时间 |

---

### 34.12 portfolio

#### `portfolio`：投资组合表，保存实盘组合名称、基准货币等组合元信息

| 字段 | 说明 |
|---|---|
| id | 主键 |
| user_id | 用户 ID |
| name | 组合名称 |
| base_currency | 基准货币 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `portfolio_group`：实盘组合分组表，区分核心仓、卫星仓、防守仓、现金仓等实盘仓位角色

| 字段 | 说明 |
|---|---|
| id | 主键 |
| portfolio_id | 组合 ID |
| name | 分组名称 |
| group_type | core/satellite/defensive/cash/custom |
| target_weight | 目标权重，可选 |
| max_stock_count | 个股数量配置项，可选 |
| sort_order | 排序 |
| note | 备注 |
| status | active/inactive |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `portfolio_position`：实盘持仓表，保存组合内真实持仓数量和成本

| 字段 | 说明 |
|---|---|
| id | 主键 |
| portfolio_id | 组合 ID |
| group_id | 实盘分组 ID |
| stock_id | 股票 ID |
| quantity | 实盘持仓数量 |
| cost_price | 成本价 |
| current_price | 当前价，可选 |
| market_value | 市值，可计算 |
| target_weight | 个股目标权重，可选 |
| note | 备注 |
| status | 状态 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

---

### 34.13 knowledge_base

#### `knowledge_note`：知识笔记表，保存心得、复盘、原则、错误案例等认知材料

| 字段 | 说明 |
|---|---|
| id | 主键 |
| title | 标题 |
| content | 内容 |
| note_type | thesis/stock/portfolio/alert/market/mistake/principle |
| related_module | 关联模块 |
| related_id | 关联对象 |
| tags | 标签 |
| status | 状态 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `knowledge_skill`：知识 Skill 表，将经验提炼为可复用分析准则

| 字段 | 说明 |
|---|---|
| id | 主键 |
| title | Skill 标题 |
| skill_type | Skill 类型 |
| principle | 分析准则 |
| description | 描述 |
| input_schema | 输入结构 |
| output_schema | 输出结构 |
| prompt_template | Prompt 模板 |
| status | 状态 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `knowledge_agent`：知识 Agent 表，将多个 Skills 编排为可执行分析流程

| 字段 | 说明 |
|---|---|
| id | 主键 |
| name | Agent 名称 |
| target_module | 目标模块 |
| description | 描述 |
| skills_json | 编排的 Skills |
| workflow_json | 工作流 |
| status | 状态 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `knowledge_feedback_log`：业务反哺日志表，记录 Agent/Skill 对业务模块的反哺结果

| 字段 | 说明 |
|---|---|
| id | 主键 |
| agent_id | Agent ID |
| target_module | 目标模块 |
| target_id | 目标对象 |
| feedback_type | 反馈类型 |
| result_summary | 结果摘要 |
| effectiveness | 有效性 |
| created_at | 创建时间 |

---

---

## AI Agent 轻量编排与工具注册表

### 定位

第一版不引入重型开源 Agent 框架。Agent 能力由 `knowledge_base` 内部实现轻量编排。

核心链路：

```text
知识沉淀
  ↓
Skills 提炼
  ↓
Agent 编排
  ↓
工具调用
  ↓
AI 请求审计
  ↓
业务反哺
```

核心对象：

```text
SkillDefinition
AgentDefinition
ToolRegistry
AgentRunner
knowledge_feedback_log
ai_request_log
```

### 为什么第一版自己写

`liuli` 的 Agent 任务大多是垂直、可控、可审计的业务分析流程：

```text
赛道证据分析 Agent
标的研报生成 Agent
财报摘要 Agent
预警解释 Agent
知识复盘 Agent
Skills 提炼 Agent
```

这些任务更像：

```text
业务工作流 + Skills + 工具调用 + AI 请求审计
```

而不是：

```text
通用多智能体协作系统
```

所以第一版不要引入 CrewAI、AutoGen、LangGraph 等重型框架，避免目录分散、调试复杂、审计链路不清。

### Agent 目录归属

Agent 编排属于 `knowledge_base`，不是全局底座。

```text
modules/knowledge_base/
├── skill_service.py
├── agent_service.py
├── agent_runner.py
├── tool_registry.py
├── feedback_service.py
├── ai.py
├── agents/
└── tools/
```

### 多个业务 Agent 描述文件

系统不是只有一个 Agent，而是：

```text
一个 AgentRunner
多个 AgentDefinition
多个 Skill
多个 Tool
```

多个业务 Agent 的描述文件统一放在：

```text
modules/knowledge_base/agents/*.yaml
```

示例：

```text
modules/knowledge_base/agents/
├── market_summary_agent.yaml
├── track_evidence_agent.yaml
├── stock_research_agent.yaml
├── disclosure_summary_agent.yaml
├── alert_explain_agent.yaml
├── portfolio_review_agent.yaml
├── knowledge_reflection_agent.yaml
└── skill_extraction_agent.yaml
```

不建议分散放到各业务模块：

```text
market_radar/agents/
stock_analysis/agents/
track_discovery/agents/
```

原因：

```text
Agent 是 knowledge_base 的编排能力；
业务模块只提供 service 能力和工具函数；
AgentRunner 统一执行；
tool_registry 统一暴露工具；
ai_audit 统一审计 AI 请求。
```

正确关系：

```text
knowledge_base/agents/*.yaml
    ↓
agent_runner
    ↓
tool_registry
    ↓
调用 market_radar / stock_analysis / track_discovery 等模块能力
```

### Agent 描述文件示例

```yaml
name: stock_research_agent
display_name: 标的研究 Agent
target_module: stock_analysis
description: 根据赛道、公告、财报、市场热度和知识库规则生成标的研究分析。

skills:
  - stock_quality_analysis
  - valuation_safety_check
  - track_relevance_check
  - risk_identification

tools:
  - stock_analysis.get_stock_profile
  - disclosure_library.search_disclosures
  - market_radar.get_stock_tag_edges
  - track_discovery.get_related_thesis
  - knowledge_base.search_notes

workflow:
  - step: collect_stock_info
  - step: collect_disclosures
  - step: collect_market_heat
  - step: apply_skills
  - step: generate_structured_analysis

output_schema:
  type: object
  fields:
    summary: string
    key_logic: string
    risks: array
    follow_up_indicators: array
```

### Agent YAML 与数据库的关系

```text
YAML 文件 = 内置 Agent 默认定义
knowledge_agent 表 = 运行时 Agent 配置
```

启动或手动同步时：

```text
modules/knowledge_base/agents/*.yaml
    ↓
sync_agent_definitions
    ↓
knowledge_agent
```

原则类似 job_center：

```text
代码/文件里的定义是默认源头；
数据库里的 knowledge_agent 是运行时状态。
```

后续可在 `/knowledge/agents` 增加同步按钮，但第一版不需要复杂控制台编辑。



### 工具注册表位置

工具注册表放在：

```text
modules/knowledge_base/tool_registry.py
```

不要放：

```text
shared/
services/
console/
```

原因：

```text
shared 放无业务工具；
services 放外部接口适配；
tool_registry 是 Agent 调用内部业务能力的注册入口，归 knowledge_base。
```

### 工具命名规范

统一采用：

```text
模块名.动作名
```

示例：

```text
market_radar.get_tag_heat
market_radar.search_source_items
market_radar.get_stock_tag_edges
disclosure_library.search_disclosures
track_discovery.get_thesis
stock_analysis.get_stock_profile
stock_analysis.get_stock_report
portfolio.get_position_summary
alert_center.create_alert
knowledge_base.create_note
```

### 工具注册表不是简单函数字典

`tool_registry.py` 里不应该只是：

```python
TOOL_REGISTRY = {
    "market_radar.get_tag_heat": get_tag_heat,
}
```

而应该是：

```text
工具名 → ToolDefinition
```

`ToolDefinition` 至少包含：

```text
工具名
工具描述
入参 schema
出参 schema
handler
所属模块
工具类型
是否只读
风险等级
超时时间
```

### ToolDefinition 结构

第一版建议：

```python
from dataclasses import dataclass
from typing import Callable, Any

@dataclass
class ToolDefinition:
    name: str
    description: str
    handler: Callable[..., Any]

    input_schema: dict
    output_schema: dict | None = None

    tool_type: str = "python"   # 第一版只支持 python
    module_name: str = ""
    read_only: bool = True
    risk_level: str = "low"     # low / medium / high
    timeout_seconds: int = 30
```

### 工具注册表示例

```python
TOOL_REGISTRY = {
    "market_radar.get_tag_heat": ToolDefinition(
        name="market_radar.get_tag_heat",
        module_name="market_radar",
        description="查询某个标签在指定时间窗口内的热度趋势",
        handler=get_tag_heat_tool,
        tool_type="python",
        input_schema={
            "type": "object",
            "properties": {
                "tag_id": {
                    "type": "integer",
                    "description": "标签 ID"
                },
                "window": {
                    "type": "string",
                    "enum": ["1h", "24h", "7d", "30d"],
                    "description": "统计窗口"
                }
            },
            "required": ["tag_id", "window"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "tag_id": {"type": "integer"},
                "points": {"type": "array"}
            }
        },
        read_only=True,
        risk_level="low",
        timeout_seconds=30,
    )
}
```

### Agent YAML 只声明工具白名单

Agent 描述文件中只声明当前 Agent 允许使用哪些工具，不重复写参数 schema。

例如：

```yaml
name: stock_research_agent
target_module: stock_analysis

tools:
  - stock_analysis.get_stock_profile
  - disclosure_library.search_disclosures
  - market_radar.get_stock_tag_edges
  - track_discovery.get_related_thesis
  - knowledge_base.search_notes
```

执行时：

```text
agent_runner 读取 Agent YAML
  ↓
获取 tools 白名单
  ↓
从 TOOL_REGISTRY 读取 ToolDefinition
  ↓
拿到 handler、input_schema、output_schema、read_only、risk_level
  ↓
执行工具调用
```

### 不同 Agent 的工具集合不同

系统只有一个全局工具池：

```text
TOOL_REGISTRY = 系统全部可用工具池
```

但每个 Agent 在自己的 YAML 中声明不同的工具白名单：

```text
Agent YAML tools = 当前 Agent 允许调用的工具子集
```

例如：

```yaml
# market_summary_agent.yaml
tools:
  - market_radar.get_tag_heat
  - market_radar.search_source_items
  - market_radar.get_hot_tracks
```

```yaml
# alert_explain_agent.yaml
tools:
  - alert_center.get_alert_event
  - market_radar.get_tag_heat
  - market_radar.search_source_items
  - stock_analysis.get_stock_profile
```

原则：

```text
工具注册表全局唯一；
不同 Agent 的工具白名单不同。
```

### 第一版只支持 Python 函数工具

第一版 `tool_registry.py` 只注册系统内部 Python 函数。

```text
tool_type = python
```

不支持：

```text
任意 HTTP Tool
任意本地系统命令
Shell / subprocess
MCP
远程插件市场
外部工具市场
```

原因：

```text
1. 系统内部模块都在同一个后端内，直接调 Python 函数更简单；
2. 避免 HTTP 鉴权、序列化、错误处理复杂化；
3. 避免 Agent 拿到本地系统权限；
4. 工具调用链更容易审计；
5. 更符合业务模块内聚优先原则。
```

### 工具调用链路

```text
AgentRunner
  ↓
ToolRegistry
  ↓
Tool wrapper function
  ↓
业务模块 service
  ↓
数据库 / 文件 / 外部 client
```

例如巨潮公告财报：

```text
Agent
  ↓
disclosure_library.search_disclosures 工具
  ↓
disclosure_library/service.py
  ↓
disclosure_library/cninfo_client.py
```

例如行情数据：

```text
Agent
  ↓
stock_analysis.get_price_history 工具
  ↓
stock_analysis/service.py
  ↓
services/akshare/client.py 或 market_data service
```

Agent 不直接知道巨潮 HTTP 接口，也不直接访问 AkShare/Tushare。

### 本地文件读取规则

Agent 不直接读写任意文件系统。

如需读取文件，必须包装成受控 Python 工具函数，例如：

```text
report_library.read_report_content
disclosure_library.read_parsed_markdown
knowledge_base.search_notes
```

允许读取范围应限制在：

```text
var/reports
var/processed/disclosures
data/seed
```

并由业务模块 service 负责路径校验。

### 工具安全原则

```text
Agent 只拿业务工具，不拿系统权限。
```

第一版默认工具应尽量只读：

```text
read_only = True
risk_level = low
```

如果后续出现写入类工具，如创建预警、写入知识笔记、生成报告索引，需要显式标注：

```text
read_only = False
risk_level = medium / high
```

并在 `agent_runner` 中加入权限校验和执行日志。

### 工具依赖方向

正确依赖：

```text
knowledge_base.tool_registry
    ↓
调用其他模块 service
```

错误依赖：

```text
market_radar 依赖 knowledge_base.tool_registry
stock_analysis 依赖 knowledge_base.tool_registry
```

规则：

```text
业务模块提供能力；
knowledge_base 包装能力并注册为 Agent 工具；
业务模块不反向依赖 knowledge_base。
```

### 是否需要工具表

第一版不需要工具表，采用代码注册：

```text
tool_registry.py
```

后续如果需要在控制台动态启停工具，再考虑增加：

```sql
agent_tool
- id
- tool_name
- module_name
- description
- input_schema
- output_schema
- enabled
- created_at
- updated_at
```

### 后续开源框架接入原则

保留统一接口：

```python
class AgentRunner:
    def run(self, agent_name: str, input_data: dict) -> dict:
        ...
```

如果后续出现以下需求，再考虑将 `agent_runner.py` 底层替换为 LangGraph：

```text
多步骤状态机
长任务可恢复
人工确认节点
复杂工具调用循环
Agent 状态持久化
执行过程可中断/恢复
```

一句话：

```text
先自己写轻量 Agent 编排，保持业务可控；等复杂度真实出现，再把 LangGraph 接到底层。
```

---

## 5. 数据库实现建议

### 5.1 SQLite MVP

MVP 阶段使用 SQLite，必须开启：

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
```

### 5.2 SQLAlchemy Model

建议按模块维护 Model 文件：

```text
modules/basic/auth/models.py
modules/basic/stock_master/models.py
modules/basic/job_center/models.py
modules/basic/ai_audit/models.py
modules/market_radar/models.py
modules/track_discovery/models.py
modules/stock_analysis/models.py
modules/alert_center/models.py
modules/portfolio/models.py
modules/knowledge_base/models.py
```

### 5.3 迁移脚本

建表迁移统一维护：

```text
migrations/
└── versions/
```

或者第一版 SQLite 可用：

```text
sql/
├── schema/
├── seed/
└── views/
```

---

## 6. 一句话总结

```text
数据库表固化 liuli 的投资认知模型：
信息流 → 标签 → 候选分流 → 赛道实体 → 标的实体 → 研究确认关系 → 预警 → 实盘组合 → 知识沉淀 → AI 反哺。
```
