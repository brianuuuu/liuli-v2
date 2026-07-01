# liuli 对外 MCP 服务设计

> 来源：`docs/liuli_system_spec.md` v26 对外 MCP 设计章节。
> 本文件是 MCP 实现前的独立设计摘录；系统长期规格仍以 `docs/liuli_system_spec.md` 为准。

## 定位

对外 MCP 是 liuli 把受控业务能力暴露给 Codex 的协议层。

```text
Codex / MCP Client
  ↓ Streamable HTTP + Bearer Token
basic/mcp
  ↓ tool wrapper
各业务模块 service
  ↓
数据库 / var 文件 / 外部 client
```

它和知识库对外研究资产是配合关系：

| 能力 | 归属 | 方向 | 第一版形态 |
|---|---|---|---|
| 对外研究资产 | `modules/knowledge_base` | 外部 AI 执行器读取 Skill、研究员文件并回流报告 | 文件 + 数据库索引 |
| 对外 MCP 服务 | `modules/basic/mcp` | Codex 等外部 MCP Client 调 liuli 业务能力 | Streamable HTTP MCP |

## 为什么放 basic/mcp

```text
MCP 不是市场雷达、赛道发现、标的分析、组合管理任一业务模块；
MCP 也不是 Console 页面能力；
MCP 是对外协议适配和权限边界，属于基础支撑模块；
services 只放外部接口 client，不放系统对外暴露能力的协议层。
```

因此目录归属为：

```text
invest_assistant/modules/basic/mcp/
```

不要放：

```text
invest_assistant/mcp/
invest_assistant/modules/console/
invest_assistant/services/
invest_assistant/modules/knowledge_base/
```

## 目录结构

```text
modules/basic/mcp/
├── __init__.py
├── server.py              # 创建 MCP server，设置 instructions，注册 tools
├── auth.py                # MCP Bearer Token 校验
├── registry.py            # MCP 工具清单、风险等级、只读标记、allowlist
├── debug_logger.py        # MCP 开发期详细调试日志，写入 var/logs/mcp_debug.log
├── service.py             # DB session 包装、工具调用分发、统一异常边界
├── schemas.py             # MCP tool 入参/出参 Pydantic 类型
└── tools/
    ├── market_radar.py
    ├── track_discovery.py
    ├── stock_analysis.py
    ├── report_library.py
    └── portfolio.py
```

第一版不新增 MCP 专用表。MCP 的外部 client/token 配置复用现有 `system_config`：

```text
config_key = mcp.clients
config_type = json
module_name = mcp
enabled = true
```

`config_value` 推荐保存 client map，便于个人系统在“系统配置”页面直接维护 Codex、opencode 等调用方：

```json
{
  "codex": {
    "enabled": true,
    "token": "long-random-token",
    "allowed_tools": [
      "market_radar.search_source_items",
      "track_discovery.get_track_detail",
      "stock_analysis.get_stock_profile",
      "report_library.read_report_content",
      "portfolio.get_overview",
      "report_library.upload_markdown_report"
    ],
    "max_result_limit": 50,
    "local_only": true,
    "note": "Codex local access"
  },
  "opencode": {
    "enabled": true,
    "token": "another-long-random-token",
    "allowed_tools": [
      "market_radar.search_source_items",
      "stock_analysis.get_stock_profile"
    ],
    "max_result_limit": 50,
    "local_only": true
  }
}
```

`basic/mcp/auth.py` 只读取 `system_config.mcp.clients` 并解析启用的 client；Bearer Token 命中某个启用 client 后，再按该 client 的 `allowed_tools` 和全局工具 registry 做交集校验。个人单用户系统第一版允许 token 明文保存在 `system_config`，后续如需要过期时间、撤销历史、hash 存储或细粒度审计，再新增 MCP 专用表。

后续只有出现以下需求时，才考虑增加 MCP 表：

```text
动态启停 MCP 工具
token 过期、撤销历史或 hash 存储
记录 MCP 调用审计
统计 Codex 使用频率
```

## 传输与鉴权

第一版使用 Streamable HTTP：

```text
/mcp
```

规则：

```text
MCP 入口不挂在 /api 下；
MCP 使用独立 Bearer Token；
不复用 Web 登录态和浏览器 Cookie；
liuli 服务端从系统配置 `mcp.clients` 读取可接受 token；
Codex、opencode 等客户端可继续用本机环境变量保存自己的 bearer token；
默认只监听本机或受控网络入口。
```

Codex 配置示例：

```toml
[mcp_servers.liuli]
url = "http://127.0.0.1:8000/mcp"
bearer_token_env_var = "LIULI_MCP_TOKEN"
tool_timeout_sec = 60
default_tools_approval_mode = "prompt"
```

## 第一版工具范围

第一版默认暴露只读查询工具：

```text
market_radar.search_source_items
market_radar.get_hotwords
market_radar.get_tag_trend
track_discovery.list_tracks
track_discovery.get_track_detail
stock_analysis.get_stock_profile
stock_analysis.get_daily_bars
report_library.list_reports
report_library.read_report_content
portfolio.get_overview
```

受控写入工具必须显式加入对应 client 的 `allowed_tools` 后才能调用。第一版仅允许以下受控写入工具：

```text
report_library.upload_markdown_report
```

`report_library.upload_markdown_report` 只接收 Markdown 文本、报告标题和 `source_module`，固定写入 `var/reports/{source_module}/YYYY-MM/`，同时创建 `report` 索引；不允许客户端指定任意路径或文件名。

不暴露：

```text
删除数据
清空数据
直接 SQL
任意文件读取
Shell / subprocess
任务中心任意 job 触发
修改组合、预警、标签、赛道、标的
任意文件上传
```

## 工具实现规则

```text
MCP tool wrapper 只做协议层工作；
入参校验用 schemas.py；
业务查询调用对应模块 service；
返回结果必须裁剪字段和数量；
错误统一映射成 MCP tool error；
每次调用必须写入 mcp_debug.log，便于开发期排查 client、tool、入参、耗时、异常；
文件读取必须走 report_library / disclosure_library 等受控 service；
任何写入类工具必须单独设计、显式标注 read_only=False 和 risk_level，并由 client allowed_tools 单独放开。
```

正确依赖：

```text
basic/mcp/tools/market_radar.py
    ↓
modules/market_radar/service.py
```

错误依赖：

```text
market_radar 依赖 basic/mcp
basic/mcp 直接访问表模型并拼业务查询
basic/mcp 直接读取 var 下任意文件
```

## Server Instructions

MCP server 初始化时必须提供 server-wide instructions，前 512 字符要自包含。

第一版 instructions 应包含：

```text
本 MCP 服务只暴露 liuli 的受控投资研究数据查询能力。默认工具均为只读，禁止下单建议、禁止绕过业务模块直接写库、禁止读取任意文件。优先使用 market_radar、track_discovery、stock_analysis、report_library、portfolio 的查询工具，并在回答中区分事实数据、系统推断和外部参考。
```

## 开发期调试日志

MCP 第一版必须提供独立开发期调试日志，不复用 `api.log`、`worker.log`、`job_run_log` 或 AI 审计日志。

```text
log_path = var/logs/mcp_debug.log
max_bytes = 10 * 1024 * 1024
backup_count = 5
rotation_names = mcp_debug.log.1 ... mcp_debug.log.5
```

滚动规则：

```text
当前文件达到 10MB 后滚动；
mcp_debug.log.1 保存最近一次滚出的文件；
mcp_debug.log.5 为最旧归档；
超过 5 个归档时覆盖最旧文件；
命名必须保持 mcp_debug.log.1 这种格式。
```

记录内容：

```text
request_id / created_at；
client_name，不记录 bearer token 明文；
remote_addr / user_agent / protocol；
tool_name / read_only / risk_level；
sanitized_arguments；
allowed_tools 命中结果；
调用的业务 service 名称；
duration_ms / status；
result_count / result_size / truncated；
error_type / error_message / stack_trace。
```

配置：

```text
config_key = mcp.debug_log.enabled
config_type = boolean
module_name = mcp
开发期默认 true，稳定后可在系统配置中关闭。
```

该日志定位为本机开发排障材料，不是长期审计数据。第一版不做 Console 页面展示；后续如果需要查询、统计、留存策略或多用户审计，再新增 MCP 调用审计表。

## 安全与审计

第一版要求：

```text
默认只读；
Bearer Token 必填；
开发期写入独立 mcp_debug.log，10MB 单文件、5 个归档滚动；
工具 allowlist 代码注册；
单次返回数量有上限；
文件内容读取限制在业务 service 允许的目录；
系统配置列表展示 mcp.clients 时应遮罩 token 值，编辑弹窗可维护完整 JSON；
不把数据库连接、API Key、Token、原始敏感配置暴露给 Codex。
```

后续增强：

```text
MCP 调用审计表
按工具统计使用次数
按工具配置风险等级
Console 仅展示 MCP 状态和调用审计，不承载 MCP 业务实现
高风险写入工具执行前增加人工确认
```
