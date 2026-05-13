# liuli 系统规格说明书 v6

> 项目名称：`liuli`  
> 定位：个人投资辅助系统  
> 形态：Web + Android + 后端服务  
> 用户模式：单用户安全登录，业务上按个人投资系统设计  
> 架构原则：业务与数据分层，模块内聚优先，复用后置抽象，AI 作为业务工具，不做过度平台化  
> 本版重点更新：AI 配置不单独成中心化页面；配置归 `.env`、`system_config` 和模块内 `ai.py`；表结构汇总中为每张表增加简要说明

---

## 1. 系统目标

`liuli` 是一个面向个人投资者的投资辅助系统，用于把外部信息流、行情变化、公司公告、财报、舆情评论，转化为可跟踪、可复盘、可反哺 AI 的投资认知闭环。

系统核心不是直接给出买卖建议，而是辅助完成：

1. **发现好赛道**：持续更新、持续验证、持续证伪。
2. **发现好标的**：持续筛选、持续 PK、持续冒泡。
3. **发现好时机**：持续预警、持续跟踪、持续等待。
4. **调整资产结构**：持续复盘、持续优化、持续调整。

---

## 2. 核心投资闭环

```text
市场雷达
  ↓
赛道发现
  ↓
标的分析
  ↓
预警中心
  ↓
组合管理
  ↓
知识库沉淀
  ↓
Skills 提炼
  ↓
Agent 编排
  ↓
业务反哺
```

### 2.1 模块定位

| 模块 | 层级 | 作用 |
|---|---|---|
| 市场雷达 `market_radar` | 信号层 | 发现市场正在关注什么 |
| 赛道发现 `track_discovery` | 判断层 | 判断方向是否值得长期跟踪 |
| 标的分析 `stock_analysis` | 研究层 | 找出能承接赛道的公司 |
| 预警中心 `alert_center` | 时机层 | 跟踪价格、估值、事件、热度异动 |
| 组合管理 `portfolio` | 行动层 | 管理持仓、权重、风险暴露 |
| 知识库 `knowledge_base` | 认知沉淀层 | 沉淀经验，提炼 Skills，编排 Agent |
| 控制台 `console` | 后台管理层 | 管理数据源、任务、标签、配置、系统状态 |

---

## 3. 核心边界

### 3.1 系统要做什么

```text
1. 接入行情、新闻、公告财报、舆情评论等数据源。
2. 用标签把新闻流结构化。
3. 用热度统计展示市场注意力。
4. 用赛道假设管理投资者认知。
5. 用标的分析筛选高质量候选公司。
6. 用预警中心跟踪时机和风险。
7. 用组合管理持续调整资产结构。
8. 用知识库沉淀经验，并反哺 AI 分析能力。
```

### 3.2 系统不做什么

```text
1. 不直接输出买入/卖出指令。
2. 不做多人协作 SaaS。
3. 不做复杂租户隔离。
4. 不把 AI Gateway 过度抽象成中心化平台。
5. 不把市场热度误当成投资价值。
6. 不为了组件复用而过度拆分目录。
```

---

## 4. 核心架构原则

### 4.1 业务模块内聚优先

本项目采用 **业务模块内聚优先** 的代码组织方式。

原则：

```text
1. 一个业务能力尽量收敛在一个模块目录内。
2. 外部接口 client 优先贴近使用模块，不提前抽象到 services。
3. 只有当两个以上模块真实复用时，才上移到 services 或 shared。
4. shared 只放无业务含义的通用工具。
5. 不追求组件复用的形式优雅，优先保证 AI 编码时上下文集中、修改路径短、业务边界清晰。
```

一句话：

```text
先让功能在一个目录里长完整，再根据真实复用关系向外抽象。
```

### 4.2 modules、shared、services 的边界

```text
modules = 业务房间
shared  = 公共工具箱
services = 外部接口插座
```

| 目录 | 作用 | 是否有业务逻辑 | 是否有业务数据 |
|---|---|---:|---:|
| `modules` | 业务能力归属 | 有 | 有 |
| `shared` | 无业务工具 | 无 | 无 |
| `services` | 跨模块外部服务适配 | 很少 | 无 |

#### shared 存在的必要性

`shared` 用于承载无业务归属、跨模块稳定复用的基础工具，例如：

```text
时间工具
分页结构
统一响应格式
通用异常
日志辅助
金额/百分比格式化
少量全局枚举
文件路径基础工具
```

不应该放：

```text
标签抽取
巨潮拉取
财联社抓取
赛道评分
标的评分
财报解析
AI Prompt
股票匹配
预警规则
组合计算
```

#### services 存在的必要性

`services` 用于承载已经跨模块复用的外部接口适配，例如：

```text
Tushare
AkShare
AI 服务商
东方财富
财联社
巨潮
```

但不是所有外部接口都必须一开始放进 `services`。

判断规则：

```text
一个模块使用 → 放模块内部
两个以上模块稳定复用 → 上移 services
```

例如：

```text
cninfo_client 第一版只服务 disclosure_library，可放在 disclosure_library 内。
Tushare 高概率被 stock_master、stock_analysis、alert_center、portfolio 多模块使用，适合放 services/tushare。
```

---

## 5. Python 服务进程模型

第一版采用两个 Python 进程：

```text
1. API 进程：处理 Web / Android 请求
2. Worker 进程：后台执行定时任务和耗时任务
```

### 5.1 API 进程

API 进程负责：

```text
登录鉴权
页面数据查询
新增/编辑/删除
手动触发任务请求
读取任务结果
读取报告
读取新闻/标签/预警/组合数据
```

启动示例：

```bash
uvicorn invest_assistant.main:app --host 0.0.0.0 --port 8000 --workers 1
```

如果长期运行并切换到 MySQL/PostgreSQL，可改为：

```bash
uvicorn invest_assistant.main:app --host 0.0.0.0 --port 8000 --workers 2
```

API 进程不要直接执行重任务。

### 5.2 Worker 进程

Worker 进程负责：

```text
抓财联社新闻
抽取标签
聚合市场热度
聚合标签关系
同步股票基础库
拉取巨潮公告财报
下载 PDF
解析 PDF
生成报告
执行预警规则
知识沉淀 → Skills 提炼 → Agent 编排
```

启动示例：

```bash
python -m invest_assistant.worker
```

内部运行：

```text
APScheduler
job_center
各模块 jobs.py
```

### 5.3 API 与 Worker 协作方式

```text
Web / Android
     ↓
API 进程
     ↓
数据库 / 文件系统

Worker 进程
     ↓
定时抓取、解析、聚合、生成报告
     ↓
数据库 / var 文件目录
```

API 和 Worker 不直接互相调用，主要通过：

```text
数据库
var 文件目录
job_run_request
job_run_log
```

协作。

### 5.4 手动触发任务

控制台点击“立即执行”时：

```text
/console/jobs
  ↓
API 写入 job_run_request
  ↓
Worker 轮询 pending request
  ↓
执行对应 JobDefinition.handler
  ↓
写入 job_run_log
```

原则：

```text
API 负责响应用户；
Worker 负责搬砖干活。
```

---

## 6. 用户与权限

第一版只做安全登录鉴权。

```text
用户系统 = 访问安全层
不是业务协作层
不是权限管理系统
不是 SaaS 租户系统
```

### 6.1 功能

```text
登录
退出
修改密码
密码哈希
JWT / Session
接口鉴权
登录过期
登录失败限制，可后置
```

### 6.2 模块位置

```text
invest_assistant/modules/basic/auth/
├── models.py
├── schemas.py
├── service.py
├── router.py
├── security.py
└── dependencies.py
```

### 6.3 用户表

```sql
user_account
- id
- username
- password_hash
- display_name
- email
- status
- last_login_at
- created_at
- updated_at
```

第一版只需要一个默认用户。

---

## 7. 数据源体系

系统一级数据源分为四类。

| 数据源类型 | 作用 | 典型来源 |
|---|---|---|
| 行情数据 | 看价格、成交量、资金流、估值、技术状态 | AkShare、Tushare、东方财富 |
| 市场新闻 | 看市场注意力、事件驱动、热点变化 | 财联社、东方财富、证券时报、RSS |
| 公司公告财报 | 看公司真实变化、业绩兑现、风险披露 | 巨潮资讯、交易所、Tushare |
| 舆情评论 | 看市场叙事、观点扩散、情绪变化 | 雪球、股吧、微博、公众号、社群 |

一句话：

```text
行情看交易，新闻看注意力，公告财报看兑现，舆情看情绪。
```

---

## 8. 术语统一：只使用“赛道”

系统不引入“题材”作为新的标签类型。

统一三类标签：

```text
stock    标的标签
track    赛道标签
hotword  热点词标签
```

### 8.1 赛道标签 track

赛道不必都是长期产业方向，短期市场方向也可以算赛道。

例如：

```text
AI算力
智能汽车
先进封装
电子特气
低空经济
黄金避险
航运
军工
出口链
中特估
人民币升值受益
```

长期赛道、短期赛道都统一归到 `track`。

不再引入：

```text
theme
topic
subject
题材
```

如果后续需要区分长短期，不靠新增类型，而靠字段或分析判断：

```text
horizon = short / mid / long
```

或者由 `track_discovery` 判断：

```text
短期事件型赛道
中期景气型赛道
长期生产力赛道
```

---

## 9. 代码目录结构

项目根目录：

```text
liuli/
├── invest_assistant/       # 主程序代码
├── data/                   # 种子数据、样例数据、导入模板
├── docs/                   # 架构与系统文档
├── tools/                  # 手动脚本、调试脚本、运维工具
├── tests/                  # 自动化测试
├── var/                    # 运行时数据、日志、缓存、SQLite、报告文件、原始文件
├── pyproject.toml
├── README.md
└── .env.example
```

### 9.1 主程序结构

```text
invest_assistant/
├── __init__.py
├── main.py
├── worker.py

├── bootstrap/
│   ├── __init__.py
│   ├── config.py
│   ├── database.py
│   ├── logging.py
│   ├── scheduler.py
│   └── app.py

├── modules/
│   ├── basic/
│   │   ├── auth/
│   │   ├── stock_master/
│   │   ├── system_config/
│   │   ├── job_center/
│   │   ├── report_library/
│   │   └── disclosure_library/
│   │
│   ├── market_radar/
│   ├── track_discovery/
│   ├── stock_analysis/
│   ├── alert_center/
│   ├── portfolio/
│   ├── knowledge_base/
│   └── console/
│
├── services/
│   ├── market_data/
│   ├── news/
│   ├── disclosure/
│   ├── sentiment/
│   ├── akshare/
│   ├── tushare/
│   ├── cls/
│   ├── cninfo/              # 只有跨模块复用后才需要
│   └── ai/
│
└── shared/
    ├── enums.py
    ├── errors.py
    ├── time_utils.py
    ├── pagination.py
    ├── response.py
    ├── file_utils.py
    └── db_types.py
```

---

## 10. data、var、tools、tests

### 10.1 data

静态数据资产目录，可进 Git。

```text
data/
├── seed/
│   ├── stocks.csv
│   ├── tags.csv
│   ├── track_tags.csv
│   └── hotword_tags.csv
├── samples/
├── import/
└── export/
```

### 10.2 var

运行时数据目录，通常不进 Git。

```text
var/
├── db/
│   └── liuli.sqlite3
├── logs/
├── cache/
├── raw/
│   ├── news/
│   ├── disclosures/
│   └── financial_reports/
├── processed/
│   └── disclosures/
│       ├── markdown/
│       └── text/
├── reports/
│   ├── market_radar/
│   ├── track_discovery/
│   ├── stock_analysis/
│   ├── alert_center/
│   ├── portfolio/
│   └── knowledge_base/
└── exports/
```

### 10.3 tests

自动化测试目录。

```text
tests/
├── unit/
├── integration/
├── fixtures/
└── conftest.py
```

### 10.4 tools

人工操作脚本与调试工具。

```text
tools/
├── dev/
├── jobs/
├── debug/
└── export/
```

判断规则：

```text
能被 pytest 稳定重复执行的 → tests/
为了手动跑、调试、修数据的 → tools/
运行时生成的日志、缓存、数据库、报告 → var/
样例数据、种子数据、导入模板 → data/
```

---

## 11. 基础模块 basic

### 11.1 basic/auth

安全登录鉴权。

### 11.2 basic/stock_master

股票基础库，属于基础业务主数据模块。

定位：

```text
标的主数据 / 标的身份识别 / 代码名称映射
```

它负责回答：

```text
这个标的是谁？
代码是什么？
属于哪个市场？
不同数据源里的名称怎么统一？
新闻里提到的公司如何映射到 stock_id？
```

第一版字段：

```sql
stock
- id
- stock_code
- stock_name
- market
- exchange
- status
- created_at
- updated_at
```

后续扩展：

```text
stock_alias
stock_industry
stock_market_status
stock_sync_log
```

### 11.3 basic/system_config

系统配置模块，第一版保持轻量。

`.env` 放敏感和启动级配置：

```text
DATABASE_URL
TUSHARE_TOKEN
OPENAI_API_KEY
QWEN_API_KEY
SECRET_KEY
LOG_LEVEL
```

`system_config` 表放业务运行配置：

```text
数据源启停
抓取频率
热度窗口
预警阈值
标签抽取策略
AI任务使用哪个模型
```

表结构：

```sql
system_config
- id
- config_key
- config_value
- config_type
- module_name
- description
- enabled
- created_at
- updated_at
```

---

## 12. basic/job_center 任务中心

### 12.1 定位

`job_center` 是轻量任务中心，属于基础业务支撑模块。

它负责：

```text
任务注册
任务启停
手动触发
任务状态
执行日志
失败记录
下次运行时间
```

它不负责：

```text
抓新闻的具体逻辑
解析财报的具体逻辑
抽标签的具体逻辑
生成报告的具体逻辑
```

一句话：

```text
job_center 管“任务怎么跑”，各业务模块管“任务具体干什么”。
```

### 12.2 目录结构

```text
modules/basic/job_center/
├── models.py          # job_config / job_run_request / job_run_log
├── schemas.py
├── service.py
├── router.py
├── types.py           # JobDefinition / JobResult
├── registry.py        # 收集各模块 JOBS
├── scheduler.py       # APScheduler 装配
├── dispatcher.py      # 执行任务、记录日志
└── worker.py          # worker 主循环，可选
```

### 12.3 任务基本要素

一个任务的基本要素：

```text
任务名称
所属模块
展示名称
任务描述
执行函数
触发方式
Cron 表达式
任务参数
是否启用
超时时间
重试次数
执行日志
```

对应任务定义：

```python
from dataclasses import dataclass
from typing import Callable, Literal, Any

TriggerType = Literal["schedule", "manual", "both"]

@dataclass
class JobDefinition:
    job_name: str
    module_name: str
    display_name: str
    description: str
    handler: Callable[..., Any]

    trigger_type: TriggerType = "manual"
    cron_expr: str | None = None
    enabled: bool = True

    timeout_seconds: int = 300
    max_retries: int = 0

    params_schema: dict | None = None
    tags: list[str] | None = None
```

### 12.4 任务命名规范

统一使用：

```text
模块名.动作名
```

示例：

```text
market_radar.fetch_news
market_radar.extract_tags
market_radar.aggregate_heat
market_radar.aggregate_edges

stock_master.sync_stock_basic

disclosure_library.fetch_cninfo
disclosure_library.parse_pdf

alert_center.evaluate_rules

knowledge_base.extract_skills
knowledge_base.compile_agents
```

### 12.5 任务执行结果规范

```python
from dataclasses import dataclass

@dataclass
class JobResult:
    success: bool
    message: str = ""
    fetched_count: int = 0
    processed_count: int = 0
    inserted_count: int = 0
    updated_count: int = 0
    skipped_count: int = 0
    extra: dict | None = None
```

### 12.6 业务模块任务注册

每个模块统一暴露 `JOBS` 列表。

例如：

```text
market_radar/jobs.py
stock_master/jobs.py
disclosure_library/jobs.py
alert_center/jobs.py
knowledge_base/jobs.py
```

`market_radar/jobs.py` 示例：

```python
from invest_assistant.modules.basic.job_center.types import JobDefinition

def fetch_news_job(**kwargs):
    ...

def extract_tags_job(**kwargs):
    ...

def aggregate_heat_job(**kwargs):
    ...

JOBS = [
    JobDefinition(
        job_name="market_radar.fetch_news",
        module_name="market_radar",
        display_name="抓取市场新闻",
        description="抓取财联社等市场新闻并写入 source_item",
        handler=fetch_news_job,
        trigger_type="both",
        cron_expr="*/1 * * * *",
        timeout_seconds=60,
        max_retries=2,
        tags=["news", "market_radar"],
    ),
    JobDefinition(
        job_name="market_radar.extract_tags",
        module_name="market_radar",
        display_name="抽取新闻标签",
        description="对未打标新闻抽取 stock / track / hotword 标签",
        handler=extract_tags_job,
        trigger_type="both",
        cron_expr="*/1 * * * *",
        timeout_seconds=180,
        max_retries=1,
        tags=["tag", "market_radar"],
    ),
]
```

### 12.7 任务中心注册表

`job_center/registry.py` 统一收集各模块任务：

```python
from invest_assistant.modules.market_radar.jobs import JOBS as MARKET_RADAR_JOBS
from invest_assistant.modules.basic.stock_master.jobs import JOBS as STOCK_MASTER_JOBS
from invest_assistant.modules.basic.disclosure_library.jobs import JOBS as DISCLOSURE_JOBS

ALL_JOBS = [
    *MARKET_RADAR_JOBS,
    *STOCK_MASTER_JOBS,
    *DISCLOSURE_JOBS,
]

JOB_REGISTRY = {
    job.job_name: job
    for job in ALL_JOBS
}
```

### 12.8 模块任务数量较多时怎么拆

少于 5 个任务：

```text
module/jobs.py
```

超过 5 个任务，或任务类型明显不同：

```text
module/jobs/
├── __init__.py
├── news_jobs.py
├── tag_jobs.py
├── aggregate_jobs.py
├── report_jobs.py
└── cleanup_jobs.py
```

`jobs/__init__.py` 对外统一导出：

```python
from .news_jobs import JOBS as NEWS_JOBS
from .tag_jobs import JOBS as TAG_JOBS
from .aggregate_jobs import JOBS as AGGREGATE_JOBS

JOBS = [
    *NEWS_JOBS,
    *TAG_JOBS,
    *AGGREGATE_JOBS,
]
```

对 `job_center` 来说，模块始终只暴露一个入口：

```python
from invest_assistant.modules.market_radar.jobs import JOBS as MARKET_RADAR_JOBS
```

### 12.9 新增任务流程

新增任务本质上做两件事：

```text
1. 在业务模块里注册任务定义
2. 让任务中心把任务同步到 job_config 表
```

标准流程：

```text
新增任务函数
↓
加入模块 JOBS
↓
重启 worker 或执行 sync_job_definitions
↓
job_center 自动写入/更新 job_config
↓
/console/jobs 页面出现新任务
```

不要手工直接改数据库表。

代码里的 `JobDefinition` 是任务定义源头；数据库里的 `job_config` 是运行时配置状态。

同步策略：

```text
如果 job_config 里没有这个 job_name → 新增
如果已经存在 → 更新 display_name / description / 默认 cron 等字段
但不要覆盖用户在控制台修改过的 enabled / cron_expr，除非明确要求重置
```

### 12.10 任务相关表

#### job_config

```sql
job_config
- id
- job_name
- module_name
- display_name
- description
- trigger_type
- cron_expr
- enabled
- timeout_seconds
- max_retries
- last_run_at
- last_status
- next_run_at
- created_at
- updated_at
```

#### job_run_request

```sql
job_run_request
- id
- job_name
- params_json
- status            -- pending / running / success / failed / canceled
- requested_by
- requested_at
- started_at
- finished_at
- error_message
```

#### job_run_log

```sql
job_run_log
- id
- job_name
- module_name
- trigger_type      -- schedule / manual
- status            -- success / failed
- params_json
- result_json
- started_at
- finished_at
- duration_ms
- fetched_count
- processed_count
- inserted_count
- updated_count
- error_message
```

### 12.11 控制台入口

页面路径：

```text
/console/jobs
```

功能：

```text
查看任务列表
启用/停用任务
立即执行任务
修改 cron
查看最近执行日志
查看失败原因
同步任务定义
```

边界：

```text
页面路径：/console/jobs
代码归属：basic/job_center
具体任务逻辑：各模块 jobs.py
```

---

## 13. basic/report_library

`report_library` 是报告归档库 / 报告阅读入口，不是第六大业务模块。

它只负责：

```text
统一保存报告元数据
统一查询报告
统一展示报告列表
统一提供 Android/Web 阅读接口
```

它不负责生成报告。报告由各业务模块自己生成。

关系：

```text
market_radar/report_generator.py
track_discovery/report_generator.py
stock_analysis/report_generator.py
alert_center/report_generator.py
portfolio/report_generator.py
knowledge_base/report_generator.py
        ↓
modules/basic/report_library
        ↓
Web / Android 报告页读取
```

核心表：

```sql
report
- id
- title
- report_type        -- daily / weekly / track / stock / portfolio / alert / knowledge
- source_module      -- market_radar / track_discovery / stock_analysis / portfolio
- target_type        -- market / track / stock / portfolio / alert
- target_id
- summary
- file_format        -- md / html / pdf
- file_path          -- var/reports/xxx/xxx.md
- generated_by       -- ai / system / manual
- status
- publish_time
- created_at
- updated_at
```

报告文件本体放：

```text
var/reports/
├── market_radar/
├── track_discovery/
├── stock_analysis/
├── alert_center/
├── portfolio/
└── knowledge_base/
```

一句话：

```text
report_library 管“报告索引”，var/reports 管“报告文件本体”。
```

---

## 14. basic/disclosure_library

公告财报库，属于基础事实数据模块。

它负责：

```text
公告元数据入库
财报元数据入库
PDF 文件保存路径
PDF 转 Markdown / Text 的路径
公告类型分类
关联 stock_id
同步状态
解析状态
```

第一版可把巨潮接口适配放在模块内：

```text
modules/basic/disclosure_library/
├── models.py
├── schemas.py
├── service.py
├── router.py
├── repository.py
├── jobs.py
├── parser.py
└── cninfo_client.py        # 巨潮接口适配，先放这里
```

等巨潮接口被多个模块直接复用，再上移：

```text
services/cninfo/client.py
```

核心表：

```sql
company_disclosure
- id
- stock_id
- source              -- cninfo / exchange / tushare
- disclosure_type     -- announcement / annual_report / quarterly_report / interim_report
- title
- publish_time
- report_period
- source_url
- file_path
- parsed_text_path
- parsed_markdown_path
- parse_status
- created_at
- updated_at
```

文件本体放：

```text
var/raw/disclosures/
├── announcements/
└── financial_reports/
```

解析后文本放：

```text
var/processed/disclosures/
├── markdown/
└── text/
```

控制台入口：

```text
/console/disclosures
```

---

## 15. 市场雷达 market_radar

### 15.1 定位

市场雷达是信号层，负责把新闻流、公告流、舆情流转化为市场注意力结构。

它回答：

```text
市场现在在关注什么？
哪些标签突然升温？
哪些标的被哪些热点词带出来？
哪些标的被哪些赛道反复提及？
```

它不判断：

```text
这个赛道好不好
这个公司值不值得买
这个热点是否能持续
```

### 15.2 核心数据流

```text
财联社新闻 / 市场新闻 / 公告标题 / 舆情评论
  ↓
source_item
  ↓
标签抽取
  ↓
source_tag
  ↓
tag_heat_snapshot
  ↓
tag_edge_snapshot
  ↓
热度榜 / 趋势图 / 关系图
```

### 15.3 标签体系

| 类型 | 含义 | 示例 |
|---|---|---|
| stock | 标的标签 | 小米集团、比亚迪、中际旭创 |
| track | 赛道标签 | AI算力、智能汽车、军工、黄金避险 |
| hotword | 热点词标签 | 特朗普、马斯克、美伊冲突、关税、降息 |

### 15.4 核心表

```sql
tag
- id
- name
- type              -- stock / track / hotword
- category          -- hotword 子类，可选
- stock_id          -- type=stock 时关联 stock
- status
- created_at
- updated_at
```

```sql
source_item
- id
- source_type       -- news / announcement / policy / financial / sentiment
- source_name
- title
- content
- source_url
- publish_time
- created_at
```

```sql
source_tag
- id
- source_item_id
- tag_id
- trigger_text
- confidence
- extractor         -- rule / ai / manual
- created_at
```

```sql
tag_heat_snapshot
- id
- tag_id
- window_type       -- 1h / 24h / 7d / 30d
- stat_time
- trigger_count
- source_count
- heat_score
- avg_count
- change_ratio
- rank_no
- created_at
```

```sql
tag_edge_snapshot
- id
- stock_tag_id
- related_tag_id
- related_tag_type  -- track / hotword
- window_type
- stat_time
- cooccur_count
- source_count
- weight
- latest_source_item_id
- created_at
```

### 15.5 关系边规则

只保存两类关系：

```text
stock - hotword
stock - track
```

不保存：

```text
hotword - track
hotword - hotword
track - track
stock - stock
```

意义：

```text
标签负责记录市场提到了什么；
关系线只回答：哪个标的被哪个赛道/热点词带出来。
```

### 15.6 页面

```text
/market-radar
/market-radar/graph
/market-radar/tags/[id]
```

---

## 16. 赛道发现 track_discovery

### 16.1 定位

赛道发现是判断层，用于管理投资者的赛道认知假设。

它回答：

```text
这个方向是不是值得长期跟踪？
它是概念期、验证期、兑现期，还是过热期？
我的赛道判断有没有被证据增强或削弱？
```

### 16.2 内容

```text
赛道假设
验证指标
支持/削弱证据
赛道阶段判断
相关标的候选
状态变化历史
复盘记录
```

### 16.3 核心表

```sql
track_thesis
- id
- user_id
- title
- core_thesis
- underlying_change
- old_bottleneck
- new_solution
- value_chain_shift
- time_horizon
- confidence_level
- status
- created_at
- updated_at
```

```sql
track_validation_indicator
- id
- thesis_id
- name
- indicator_type
- data_source
- current_value
- direction
- validation_meaning
- updated_at
```

```sql
track_evidence
- id
- thesis_id
- source_item_id
- evidence_direction   -- support / weaken / neutral / noise
- evidence_strength
- summary
- affected_segments
- related_stock_ids
- created_at
```

```sql
track_related_stock
- id
- thesis_id
- stock_id
- role
- relevance_score
- evidence_count
- heat_score
- status
- created_at
- updated_at
```

```sql
track_status_history
- id
- thesis_id
- old_status
- new_status
- reason
- changed_at
```

### 16.4 页面

```text
/track-discovery
/track-discovery/[id]
/track-discovery/candidates
```

---

## 17. 标的分析 stock_analysis

### 17.1 定位

标的分析是研究层，用于发现能够承接好赛道的公司。

它回答：

```text
这个公司是否真正受益？
它在同赛道里竞争力如何？
估值、成长性、风险如何？
是否值得进入观察池或核心储备池？
```

### 17.2 内容

```text
标的池
同赛道横向 PK
公司核心逻辑
财务质量
估值区间
成长性
竞争格局
风险点
研究笔记
评分快照
冒泡排序
```

### 17.3 核心表

```text
stock_research_note
stock_score_snapshot
stock_compare_group
stock_risk_point
stock_thesis
stock_analysis_report
```

### 17.4 页面

```text
/stock-analysis
/stock-analysis/[stock_id]
/stock-analysis/compare
/stock-analysis/pool
```

---

## 18. 预警中心 alert_center

### 18.1 定位

预警中心是时机层，用于发现好时机和风险异动。

它回答：

```text
什么时候需要注意？
什么变化触发了观察？
价格、估值、公告、热度、资金是否出现异常？
```

### 18.2 预警类型

```text
价格预警
估值预警
资金预警
新闻热度预警
标签关系预警
公告事件预警
赛道状态变化预警
组合风险预警
```

### 18.3 核心表

```sql
alert_rule
- id
- user_id
- rule_type
- target_type
- target_id
- condition_json
- enabled
- created_at
- updated_at
```

```sql
alert_event
- id
- rule_id
- event_time
- event_level
- title
- message
- status
- created_at
```

### 18.4 页面

```text
/alerts
/alerts/rules
/alerts/events
```

---

## 19. 组合管理 portfolio

### 19.1 定位

组合管理是行动层，用于管理持仓、权重、风险暴露和复盘调整。

它回答：

```text
我的资产结构是否合理？
持仓是否过度集中？
赛道权重是否偏离认知？
调仓之后是否改善组合质量？
```

### 19.2 内容

```text
组合
持仓
成本
权重
收益
风险暴露
赛道分布
调仓记录
组合复盘
```

### 19.3 核心表

```sql
portfolio
- id
- user_id
- name
- base_currency
- created_at
- updated_at
```

```sql
portfolio_position
- id
- portfolio_id
- stock_id
- quantity
- cost_price
- created_at
- updated_at
```

### 19.4 页面

```text
/portfolio
/portfolio/[id]
/portfolio/review
```

---

## 20. 知识库 knowledge_base

### 20.1 定位

知识库不是普通笔记库，而是把个人经验转化为 AI 分析能力的认知加工厂。

核心链路：

```text
知识沉淀 → Skills 提炼 → Agent 编排 → 业务反哺
```

### 20.2 内部阶段

| 阶段 | 性质 | 说明 |
|---|---|---|
| 知识沉淀 | 记录 | 个人心得、复盘、研究经验 |
| Skills 提炼 | 规则化 | 把经验提炼成分析准则、判断模板、证伪条件 |
| Agent 编排 | 能力化 | 把多个 Skills 组合成可执行分析流程 |
| 业务反哺 | 应用 | Agent 被市场雷达、赛道发现、标的分析、预警中心、组合管理调用 |

### 20.3 目录

```text
knowledge_base/
├── models.py
├── schemas.py
├── service.py
├── router.py
├── note_service.py
├── skill_service.py
├── agent_service.py
├── feedback_service.py
└── ai.py
```

### 20.4 核心表

```sql
knowledge_note
- id
- title
- content
- note_type          -- thesis / stock / portfolio / alert / market / mistake / principle
- related_module
- related_id
- tags
- status
- created_at
- updated_at
```

```sql
knowledge_skill
- id
- title
- skill_type
- principle
- description
- input_schema
- output_schema
- prompt_template
- status
- created_at
- updated_at
```

```sql
knowledge_agent
- id
- name
- target_module
- description
- skills_json
- workflow_json
- status
- created_at
- updated_at
```

```sql
knowledge_feedback_log
- id
- agent_id
- target_module
- target_id
- feedback_type
- result_summary
- effectiveness
- created_at
```

### 20.5 页面

```text
/knowledge
/knowledge/notes
/knowledge/skills
/knowledge/agents
/knowledge/reviews
```

---

## 21. 控制台 console

### 21.1 定位

控制台是后台管理入口，统一管理配置、任务、标签、股票基础库和系统状态。

它不做投资分析，只做系统运营管理。

AI 配置不单独做控制台入口，第一版统一放在 `.env`、`system_config` 和各模块 `ai.py` 中；控制台最多保留 AI 调用日志查看入口。

核心规则：

```text
页面路径 = 用户从哪里操作
代码目录 = 能力归哪个业务模块
console 是操作面板，不是业务能力归属地
```

### 21.2 页面路径

```text
/console
/console/data-sources
/console/jobs
/console/tags
/console/tag-candidates
/console/stocks
/console/disclosures
/console/ai-logs
/console/system-config
/console/system-status
```

### 21.3 典型归属

```text
/console/tags
→ 页面在 console
→ 标签业务归 market_radar

/console/stocks
→ 页面在 console
→ 股票主数据归 basic/stock_master

/console/disclosures
→ 页面在 console
→ 公告财报能力归 basic/disclosure_library

/console/jobs
→ 页面在 console
→ 任务能力归 basic/job_center
```

### 21.4 console 目录

```text
console/
├── __init__.py
├── router.py
├── schemas.py
├── service.py
├── dashboard.py
└── pages/
    ├── data_sources.py
    ├── jobs.py
    ├── tags.py
    ├── tag_candidates.py
    ├── stocks.py
    ├── disclosures.py
    ├── ai_logs.py
    └── system_status.py
```

---

## 22. Web 页面结构

```text
web/
├── app/
│   ├── login/
│   ├── market-radar/
│   ├── track-discovery/
│   ├── stock-analysis/
│   ├── alerts/
│   ├── portfolio/
│   ├── knowledge/
│   └── console/
```

### 22.1 业务前台

```text
/market-radar
/track-discovery
/stock-analysis
/alerts
/portfolio
/knowledge
```

### 22.2 系统后台

```text
/console
/console/data-sources
/console/jobs
/console/tags
/console/tag-candidates
/console/stocks
/console/disclosures
/console/system-config
/console/system-status
```

### 22.3 标签 CRUD 界面

```text
/console/tags
/console/tag-candidates
```

第一版在 `/console/tags` 内用弹窗完成新增、编辑、停用、删除。

### 22.4 公告财报界面

```text
/console/disclosures
```

功能：

```text
公告财报列表
手动拉取
拉取任务
解析状态
文件归档
重新解析
加入赛道证据
加入标的分析
```

### 22.5 任务中心界面

```text
/console/jobs
```

功能：

```text
查看任务列表
启用/停用任务
立即执行任务
修改 cron
查看最近执行日志
查看失败原因
同步任务定义
```

---

## 23. Android App 定位

Android 是随身记录本 + 重大新闻浏览器 + 报告阅读器 + 预警终端，不是完整研究工作台。

### 23.1 Android 主要内容

底部导航建议：

```text
记录 | 新闻 | 报告 | 预警
```

#### 记录

对应 `knowledge_base`。

```text
快速记一条心得
记录市场观察
记录标的评论
记录赛道想法
记录组合反思
记录错误复盘
```

#### 新闻

对应 `market_radar`。

```text
浏览重大新闻
查看新闻关联标签
查看关联标的
查看关联赛道
收藏 / 标记待研究
一键写评论
```

#### 报告

对应 `basic/report_library`。

```text
市场日报
市场周报
AI研报
赛道报告
标的报告
组合报告
预警复盘报告
专题研究
```

#### 预警

对应 `alert_center`。

```text
查看预警列表
查看预警详情
标记已读
标记已处理
写处理备注
跳转相关新闻/标的/赛道
```

### 23.2 Android 不优先做

```text
标签库维护
数据源管理
任务调度
赛道假设复杂编辑
标的横向PK
组合深度分析
关系图大屏展示
系统控制台
```

### 23.3 Android 技术建议

```text
Kotlin
Jetpack Compose
Retrofit / OkHttp
Room
Hilt
Kotlin Coroutines / Flow
Vico 或 MPAndroidChart
```

---

## 24. AI 使用原则

不做复杂全局 AI Gateway。

原则：

```text
业务优先，数据优先，AI 后置。
每个模块自己决定用哪个 AI。
AI 是模块内部工具，不反客为主。
```

### 24.1 AI client 放 services

```text
services/ai/
├── openai_client.py
├── qwen_client.py
├── kimi_client.py
├── deepseek_client.py
└── gemini_client.py
```

### 24.2 每个模块内部有自己的 ai.py

```text
market_radar/ai.py
track_discovery/ai.py
stock_analysis/ai.py
knowledge_base/ai.py
```

### 24.3 AI 配置不单独做配置中心

第一版不单独建设 AI 配置页面，也不做中心化 AI Gateway。

AI 配置分三层：

```text
.env
- 放 API Key、基础密钥、默认模型等敏感或启动级配置

system_config
- 放可调整的业务运行参数，例如某模块是否启用 AI、默认任务模型名、调用开关

模块内 ai.py
- 放该模块具体 Prompt、输出结构、模型调用逻辑
```

不单独保留：

```text
```

如后续需要排查调用问题，可以保留：

```text
/console/ai-logs
```

用于查看 AI 调用日志、失败原因和耗时。

---

## 25. SQL 管理原则

建议：

```text
统一迁移，分模块归属。
```

### 25.1 建表迁移统一维护

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

### 25.2 查询 SQL 模块内维护

```text
modules/market_radar/sql/
├── heat_rankings.sql
├── aggregate_heat.sql
└── aggregate_edges.sql
```

原则：

```text
数据库是统一的；
业务归属是分模块的；
查询逻辑贴近业务模块。
```

---

## 26. 数据库选型

### 26.1 MVP 阶段

推荐：

```text
SQLite
FastAPI
SQLAlchemy
APScheduler
Next.js
ECharts
```

适合本地验证、单人使用、快速迭代。

必须开启：

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
```

SQLite 阶段建议：

```text
API workers = 1 或 2
写任务集中在 worker
API 尽量读多写少
```

### 26.2 长期运行

推荐：

```text
MySQL 8.x 或 PostgreSQL
```

选择建议：

```text
本地验证：SQLite
长期运行：MySQL
复杂分析：PostgreSQL
```

---

## 27. 技术选型建议

### 27.1 后端

```text
Python
FastAPI
SQLAlchemy
APScheduler
Pydantic
```

### 27.2 Web

```text
Next.js
React
Tailwind CSS
ECharts
```

### 27.3 Android

```text
Kotlin
Jetpack Compose
Retrofit
Room
Hilt
```

### 27.4 数据源

```text
AkShare
Tushare
财联社
巨潮资讯
东方财富
AI 服务
```

---

## 28. MVP 开发顺序

### 阶段 1：系统骨架

```text
项目目录
FastAPI 启动
Worker 进程
SQLite 数据库
登录鉴权
控制台基础页面
stock_master 极简版
system_config 极简版
job_center 极简版
```

### 阶段 2：市场雷达

```text
source_item
tag
source_tag
tag_heat_snapshot
tag_edge_snapshot
财联社新闻接入
规则标签抽取
热度榜
关系图
market_radar.jobs 注册
```

### 阶段 3：公告财报库

```text
company_disclosure
巨潮公告/财报拉取
PDF 文件归档
文本/Markdown 解析
/console/disclosures 管理入口
disclosure_library.jobs 注册
```

### 阶段 4：赛道发现

```text
track_thesis
验证指标
证据链
状态变化
从 market_radar 引用热度数据
从 disclosure_library 引用公告财报证据
```

### 阶段 5：标的分析

```text
标的池
研究笔记
同赛道 PK
评分快照
冒泡排序
财报分析
```

### 阶段 6：预警中心

```text
预警规则
预警事件
热度预警
价格预警
公告事件预警
alert_center.jobs 注册
```

### 阶段 7：组合管理

```text
组合
持仓
权重
收益
风险暴露
组合复盘
```

### 阶段 8：知识库反哺

```text
知识沉淀
Skills 提炼
Agent 编排
业务反哺
knowledge_base.jobs 注册
```

---

## 29. 关键设计判断

### 29.1 market_radar 和 track_discovery 分开

```text
market_radar = 信号层
track_discovery = 判断层
```

市场雷达负责发现“热闹”，赛道发现负责判断“热闹是不是方向”。

### 29.2 stock_master 是基础模块

```text
stock_master 是基础业务主数据模块，不是 shared 工具模块。
```

### 29.3 job_center 是基础任务中心

```text
job_center 管任务生命周期；
各业务模块管任务具体逻辑。
```

### 29.4 shared 克制使用

```text
shared 放无业务含义的通用工具；
不要放业务逻辑、外部接口、AI prompt、解析器、标签逻辑。
```

### 29.5 services 后置抽象

```text
一个模块使用 → 放模块内部
两个以上模块稳定复用 → 上移 services
```

### 29.6 knowledge_base 独立于 portfolio

```text
portfolio 管资产结构；
knowledge_base 管认知结构。
```

### 29.7 report_library 放 basic，文件放 var

```text
modules/basic/report_library 管报告索引；
var/reports 管报告文件本体；
各业务模块自己生成报告。
```

### 29.8 disclosure_library 放 basic

```text
modules/basic/disclosure_library 管公告财报归档、解析、索引；
cninfo_client 第一版可放 disclosure_library 内；
var/raw/disclosures 管 PDF/原文文件本体。
```

### 29.9 控制台是操作面板

```text
console 是操作面板，不是业务能力归属地。
```

### 29.10 API 和 Worker 分离

```text
API 负责响应用户；
Worker 负责后台任务；
二者通过数据库、任务表和 var 文件目录协作。
```

---


---

## 31. API 汇总

> 本节集中展示系统主要 API。具体请求/响应字段以后以 OpenAPI 文档为准。  
> 约定：所有业务接口默认以 `/api` 开头；除登录接口外，均需要鉴权。

### 31.1 鉴权 API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | 登录，返回 Token / Session |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/auth/me` | 获取当前用户信息 |
| POST | `/api/auth/change-password` | 修改密码 |

### 31.2 控制台 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/console/dashboard` | 控制台首页汇总 |
| GET | `/api/console/system-status` | 系统状态 |
| GET | `/api/console/data-sources` | 数据源状态列表 |
| GET | `/api/console/ai-logs` | AI 调用日志 |
| GET | `/api/console/system-config` | 系统配置列表 |
| PUT | `/api/console/system-config/{config_key}` | 更新系统配置 |

### 31.3 任务中心 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/jobs` | 查询任务配置列表 |
| GET | `/api/jobs/{job_name}` | 查询任务详情 |
| POST | `/api/jobs/sync-definitions` | 从代码中的 `JOBS` 同步任务定义到 `job_config` |
| POST | `/api/jobs/{job_name}/run` | 手动触发任务，写入 `job_run_request` |
| PUT | `/api/jobs/{job_name}` | 更新任务配置，如启停、cron、超时 |
| GET | `/api/jobs/{job_name}/logs` | 查询任务执行日志 |
| GET | `/api/jobs/run-requests` | 查询手动触发请求列表 |

### 31.4 股票基础库 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/stocks` | 股票基础库列表 |
| GET | `/api/stocks/{stock_id}` | 股票详情 |
| GET | `/api/stocks/search` | 按代码/名称/别名搜索股票 |
| POST | `/api/stocks/import` | 导入股票基础数据 |
| PUT | `/api/stocks/{stock_id}` | 修正股票基础信息 |
| GET | `/api/stocks/{stock_id}/aliases` | 查询股票别名 |
| POST | `/api/stocks/{stock_id}/aliases` | 新增股票别名 |

### 31.5 系统配置 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/system-config` | 查询系统配置 |
| GET | `/api/system-config/{config_key}` | 查询单项配置 |
| PUT | `/api/system-config/{config_key}` | 修改单项配置 |
| POST | `/api/system-config` | 新增配置项 |

### 31.6 公告财报库 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/disclosures` | 公告/财报列表 |
| GET | `/api/disclosures/{id}` | 公告/财报详情 |
| POST | `/api/disclosures/fetch` | 手动拉取巨潮公告/财报，生成任务请求 |
| POST | `/api/disclosures/{id}/download` | 下载或重新下载原始文件 |
| POST | `/api/disclosures/{id}/parse` | 解析 PDF/原文为文本或 Markdown |
| GET | `/api/disclosures/{id}/file` | 读取原始文件 |
| GET | `/api/disclosures/{id}/parsed` | 读取解析后的文本/Markdown |
| POST | `/api/disclosures/{id}/to-source-item` | 将重大公告写入 `source_item`，供市场雷达使用 |
| POST | `/api/disclosures/{id}/to-track-evidence` | 加入赛道证据 |
| POST | `/api/disclosures/{id}/to-stock-analysis` | 加入标的分析材料 |

### 31.7 报告库 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/reports` | 报告列表，支持按类型、模块、日期筛选 |
| GET | `/api/reports/{id}` | 报告详情 |
| GET | `/api/reports/{id}/content` | 读取报告文件内容 |
| GET | `/api/reports/{id}/download` | 下载报告文件 |
| POST | `/api/reports` | 新增报告索引 |
| PUT | `/api/reports/{id}` | 更新报告元数据 |
| DELETE | `/api/reports/{id}` | 删除报告索引，可选是否删除文件 |

### 31.8 市场雷达 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/market-radar/overview` | 市场雷达总览 |
| GET | `/api/market-radar/source-items` | 新闻/信息源列表 |
| GET | `/api/market-radar/source-items/{id}` | 信息源详情 |
| GET | `/api/market-radar/tags` | 标签列表 |
| POST | `/api/market-radar/tags` | 新增标签 |
| PUT | `/api/market-radar/tags/{tag_id}` | 编辑标签 |
| DELETE | `/api/market-radar/tags/{tag_id}` | 删除/停用标签 |
| GET | `/api/market-radar/tags/{tag_id}` | 标签详情 |
| GET | `/api/market-radar/tags/{tag_id}/trend` | 标签热度趋势 |
| GET | `/api/market-radar/tags/{tag_id}/sources` | 触发该标签的信息源 |
| GET | `/api/market-radar/rankings` | 热度榜，参数：`type=stock/track/hotword`、`window=1h/24h/7d/30d` |
| GET | `/api/market-radar/graphs/stock-track` | 标的-赛道关系图 |
| GET | `/api/market-radar/graphs/stock-hotword` | 标的-热点词关系图 |
| GET | `/api/market-radar/tag-candidates` | 候选标签列表 |
| POST | `/api/market-radar/tag-candidates/{id}/approve` | 审核通过候选标签 |
| POST | `/api/market-radar/tag-candidates/{id}/reject` | 拒绝候选标签 |
| POST | `/api/market-radar/tag-candidates/{id}/merge` | 合并到已有标签 |

### 31.9 赛道发现 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/track-discovery/theses` | 赛道假设列表 |
| POST | `/api/track-discovery/theses` | 新增赛道假设 |
| GET | `/api/track-discovery/theses/{id}` | 赛道假设详情 |
| PUT | `/api/track-discovery/theses/{id}` | 编辑赛道假设 |
| DELETE | `/api/track-discovery/theses/{id}` | 删除/归档赛道假设 |
| GET | `/api/track-discovery/theses/{id}/indicators` | 验证指标 |
| POST | `/api/track-discovery/theses/{id}/indicators` | 新增验证指标 |
| GET | `/api/track-discovery/theses/{id}/evidence` | 证据列表 |
| POST | `/api/track-discovery/theses/{id}/evidence` | 新增证据 |
| GET | `/api/track-discovery/theses/{id}/related-stocks` | 相关标的候选 |
| POST | `/api/track-discovery/theses/{id}/related-stocks` | 新增相关标的 |
| POST | `/api/track-discovery/theses/{id}/status` | 更新赛道状态，写入状态历史 |
| GET | `/api/track-discovery/candidates` | 从市场雷达升温信号中生成的候选赛道 |

### 31.10 标的分析 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/stock-analysis/pool` | 标的池 |
| POST | `/api/stock-analysis/pool` | 加入标的池 |
| PUT | `/api/stock-analysis/pool/{id}` | 更新标的池状态 |
| GET | `/api/stock-analysis/stocks/{stock_id}` | 标的分析主页 |
| GET | `/api/stock-analysis/stocks/{stock_id}/notes` | 研究笔记 |
| POST | `/api/stock-analysis/stocks/{stock_id}/notes` | 新增研究笔记 |
| GET | `/api/stock-analysis/stocks/{stock_id}/scores` | 评分快照 |
| POST | `/api/stock-analysis/stocks/{stock_id}/scores` | 新增评分快照 |
| GET | `/api/stock-analysis/compare-groups` | 对比组列表 |
| POST | `/api/stock-analysis/compare-groups` | 新建同赛道 PK 对比组 |
| GET | `/api/stock-analysis/reports` | 标的研报列表 |

### 31.11 预警中心 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/alerts/rules` | 预警规则列表 |
| POST | `/api/alerts/rules` | 新增预警规则 |
| PUT | `/api/alerts/rules/{id}` | 修改预警规则 |
| DELETE | `/api/alerts/rules/{id}` | 删除/停用预警规则 |
| GET | `/api/alerts/events` | 预警事件列表 |
| GET | `/api/alerts/events/{id}` | 预警事件详情 |
| POST | `/api/alerts/events/{id}/read` | 标记已读 |
| POST | `/api/alerts/events/{id}/handle` | 标记已处理并写处理备注 |

### 31.12 组合管理 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/portfolios` | 组合列表 |
| POST | `/api/portfolios` | 新建组合 |
| GET | `/api/portfolios/{id}` | 组合详情 |
| PUT | `/api/portfolios/{id}` | 更新组合 |
| GET | `/api/portfolios/{id}/positions` | 持仓列表 |
| POST | `/api/portfolios/{id}/positions` | 新增/调整持仓 |
| PUT | `/api/portfolios/{id}/positions/{position_id}` | 修改持仓 |
| DELETE | `/api/portfolios/{id}/positions/{position_id}` | 删除持仓 |
| GET | `/api/portfolios/{id}/review` | 组合复盘 |
| POST | `/api/portfolios/{id}/review` | 新增组合复盘 |

### 31.13 知识库 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/knowledge/notes` | 知识笔记列表 |
| POST | `/api/knowledge/notes` | 新增知识笔记 |
| GET | `/api/knowledge/notes/{id}` | 笔记详情 |
| PUT | `/api/knowledge/notes/{id}` | 编辑笔记 |
| DELETE | `/api/knowledge/notes/{id}` | 删除/归档笔记 |
| GET | `/api/knowledge/skills` | Skills 列表 |
| POST | `/api/knowledge/skills` | 新增 Skill |
| PUT | `/api/knowledge/skills/{id}` | 编辑 Skill |
| GET | `/api/knowledge/agents` | Agent 列表 |
| POST | `/api/knowledge/agents` | 新增 Agent 编排 |
| PUT | `/api/knowledge/agents/{id}` | 编辑 Agent |
| POST | `/api/knowledge/agents/{id}/run` | 运行 Agent，反哺业务模块 |
| GET | `/api/knowledge/feedback-logs` | 业务反哺记录 |

---

## 32. 表结构汇总

> 本节集中展示主要数据表。每张表名后附简要说明；详细 DDL、索引、约束以迁移文件为准。

### 32.1 basic/auth

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

### 32.2 basic/stock_master

#### `stock`：股票/标的主数据表，统一不同数据源中的标的身份

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

### 32.3 basic/system_config

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

### 32.4 basic/job_center

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

### 32.5 basic/report_library

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

### 32.6 basic/disclosure_library

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

### 32.7 market_radar

#### `tag`：标签主表，保存标的、赛道、热点词三类标签

| 字段 | 说明 |
|---|---|
| id | 主键 |
| name | 标签名称 |
| type | stock/track/hotword |
| category | 分类，可选 |
| stock_id | type=stock 时关联 stock |
| status | 状态 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `source_item`：信息源表，保存新闻、公告、政策、舆情等原始信息

| 字段 | 说明 |
|---|---|
| id | 主键 |
| source_type | news/announcement/policy/financial/sentiment |
| source_name | 来源名称 |
| title | 标题 |
| content | 正文 |
| source_url | 来源 URL |
| publish_time | 发布时间 |
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
| suggested_type | 建议类型 |
| category | 分类 |
| source_item_id | 来源信息 |
| confidence | 置信度 |
| reason | 推荐原因 |
| status | pending/approved/rejected/merged |
| created_at | 创建时间 |
| updated_at | 更新时间 |

---

### 32.8 track_discovery

#### `track_thesis`：赛道假设表，保存需要长期验证的赛道认知假设

| 字段 | 说明 |
|---|---|
| id | 主键 |
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

#### `track_related_stock`：赛道相关标的表，保存赛道下的候选承接公司

| 字段 | 说明 |
|---|---|
| id | 主键 |
| thesis_id | 赛道假设 ID |
| stock_id | 股票 ID |
| role | 赛道角色 |
| relevance_score | 相关度 |
| evidence_count | 证据数量 |
| heat_score | 热度 |
| status | 状态 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

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

### 32.9 stock_analysis

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

---

### 32.10 alert_center

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

### 32.11 portfolio

#### `portfolio`：投资组合表，保存组合名称、基准货币等组合元信息

| 字段 | 说明 |
|---|---|
| id | 主键 |
| user_id | 用户 ID |
| name | 组合名称 |
| base_currency | 基准货币 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

#### `portfolio_position`：组合持仓表，保存组合内具体标的和持仓成本

| 字段 | 说明 |
|---|---|
| id | 主键 |
| portfolio_id | 组合 ID |
| stock_id | 股票 ID |
| quantity | 数量 |
| cost_price | 成本价 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

---

### 32.12 knowledge_base

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

## 33. 一句话总结

`liuli` 的本质是：

```text
用市场雷达感知变化，
用赛道发现判断方向，
用标的分析筛选公司，
用预警中心等待时机，
用组合管理调整结构，
用知识库沉淀认知，
再通过 Skills 和 Agent 反哺业务分析，
最终形成个人投资认知与行动闭环。
```
