# 琉璃 MCP OAuth 设计

日期：2026-08-28
状态：待用户确认

## 1. 目标

为现有琉璃 MCP 增加一个自托管的 OAuth 2.1 授权服务器，使 ChatGPT 可以通过“自定义 MCP”表单完成登录和授权，同时保持以下兼容性：

- 现有 Codex 地址 `http://115.29.176.240:8000/mcp/` 和静态 Bearer Token 继续可用。
- 新地址 `https://115-29-176-240.sslip.io/mcp/` 同时接受 OAuth access token 和原有静态 Bearer Token。
- 不改变任何业务工具、工具名称、参数、返回结构或 `allowed_tools` 权限模型。
- 不修改现有用户密码、Codex Token 或业务数据。
- 不接入 Auth0、Cloudflare Access 等第三方身份服务。

本设计遵循 [MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) 的 OAuth 2.1、PKCE、受保护资源元数据和资源受众要求，并使用 MCP Python SDK 提供的 `OAuthAuthorizationServerProvider` 接口和内置授权路由。

## 2. 非目标

- 首期不实现动态客户端注册（DCR）和客户端 ID 元数据文档（CIMD）。ChatGPT 使用预注册的固定客户端。
- 不把 Web 登录 JWT 当作 MCP OAuth access token。
- 不增加用户注册、找回密码、第三方登录或通用 OAuth 管理后台。
- 不改变现有 Web、Android、API 和业务模块的认证方式。
- 不把客户端密钥、授权码、access token 或 refresh token 明文写入数据库、仓库、日志或 Caddyfile。

## 3. 方案选择

采用“同进程自托管授权服务器”方案：OAuth Provider 与 FastMCP 位于同一 Python 服务中，复用现有 `user_account` 和 `authenticate_user()` 完成用户名密码校验。

选择理由：

- 依赖和部署面最小，无额外服务和域名。
- MCP SDK 已负责协议端点、请求模型和 Bearer 中间件，项目只实现持久化、登录授权和令牌生命周期。
- 可以在一个 Provider 的 `load_access_token()` 中兼容 OAuth token 与旧静态 Bearer Token。
- OAuth 权限继续映射到现有 `mcp.clients` 工具白名单，不另建第二套工具授权系统。

未选择的方案：

- 第三方身份平台：成熟但增加外部依赖、配置面和长期成本。
- 仅由 Caddy 模拟 OAuth：Caddy 不适合承载授权码、PKCE、refresh rotation 和用户登录状态。
- 直接把现有 Web JWT 暴露给 ChatGPT：缺少 OAuth 授权码流程、客户端绑定、资源受众和 refresh token 生命周期。

## 4. 模块边界与文件位置

新增目录：

```text
invest_assistant/modules/basic/mcp/oauth/
├── __init__.py
├── models.py                 # OAuth 持久化模型
├── provider.py               # MCP SDK OAuthAuthorizationServerProvider 实现
├── service.py                # 授权码、PKCE、token、refresh、撤销业务逻辑
├── routes.py                 # 登录/同意页和标准根级元数据路由
├── security.py               # 随机凭据、加密/哈希、PKCE、CSRF、常量时间比较
├── cli.py                    # 固定 ChatGPT 客户端的创建/轮换/禁用命令
└── templates/
    └── authorize.html        # 登录与授权确认页
```

新增测试目录：

```text
tests/modules/basic/mcp/oauth/
├── test_security.py
├── test_service.py
├── test_provider.py
└── test_routes.py
```

仅对现有文件做必要接线：

- `invest_assistant/modules/basic/mcp/server.py`：启用 OAuth Provider，并保留静态 Bearer 回退。
- `invest_assistant/modules/basic/mcp/auth.py`：允许 OAuth-only 权限配置，不改变旧配置含义。
- `invest_assistant/bootstrap/config.py`：增加 OAuth 开关、issuer/resource URL 和有效期配置。
- `invest_assistant/bootstrap/database.py`：注册 OAuth 模型。
- `invest_assistant/bootstrap/app.py`：注册登录授权和根级元数据路由。
- `configure_liuli_mcp_https.sh`：由静态元数据改为反代应用元数据，并放行 OAuth 路径。
- `docs/liuli_mcp_design.md`：补充 ChatGPT OAuth 配置和运维说明。

不修改六个业务模块、Console 业务逻辑、前端和 Android 工程。

## 5. 外部 URL 与发现

固定外部地址：

| 用途 | URL |
|---|---|
| MCP resource | `https://115-29-176-240.sslip.io/mcp` |
| OAuth issuer | `https://115-29-176-240.sslip.io/mcp` |
| 授权端点 | `https://115-29-176-240.sslip.io/mcp/authorize` |
| Token 端点 | `https://115-29-176-240.sslip.io/mcp/token` |
| 撤销端点 | `https://115-29-176-240.sslip.io/mcp/revoke` |
| 受保护资源元数据 | `https://115-29-176-240.sslip.io/.well-known/oauth-protected-resource/mcp` |
| 授权服务器元数据 | `https://115-29-176-240.sslip.io/.well-known/oauth-authorization-server/mcp` |

FastMCP 挂载在 `/mcp` 后，SDK 自带的元数据地址会处于挂载目录内。为满足 RFC 8414 和 RFC 9728 的标准根级发现路径，主 FastAPI 应用额外提供两个只读 JSON 元数据路由。内容由同一配置函数生成，禁止在 Caddyfile 中重复写死。

Caddy 只负责 TLS 和反代：

- `/mcp`、`/mcp/*` 转发到 `127.0.0.1:8000`。
- 两个 `/.well-known/.../mcp` 地址转发到应用。
- 其他未授权路径仍返回 404。
- 保留现有上游 `Host`/`Origin` 兼容逻辑，或在应用允许新旧两个主机后逐步移除不必要的重写。
- `WWW-Authenticate` 中的 `resource_metadata` 必须始终是外部 HTTPS 地址。

## 6. 配置与向后兼容

新增设置：

```text
MCP_OAUTH_ENABLED=true
MCP_OAUTH_ISSUER_URL=https://115-29-176-240.sslip.io/mcp
MCP_OAUTH_RESOURCE_URL=https://115-29-176-240.sslip.io/mcp
MCP_OAUTH_ACCESS_TOKEN_MINUTES=15
MCP_OAUTH_REFRESH_TOKEN_DAYS=30
MCP_OAUTH_MASTER_KEY_FILE=/var/lib/liuli-mcp-oauth/master.key
```

服务器没有 `.env`，因此非敏感 URL、开关和主密钥文件路径继续由现有启动脚本导出。OAuth client secret 不进入环境变量；数据库仅保存密文。主密钥由 provision 命令首次生成到仓库外的 `/var/lib/liuli-mcp-oauth/master.key`，权限固定为 `0600`，不写入仓库、数据库或日志。现有 `MCP_PUBLIC_BASE_URL=http://115.29.176.240:8000` 保留，用于旧 HTTP 地址和传输安全兼容。

`mcp.clients` 的兼容扩展：

- 旧条目未声明 `auth_modes` 时，默认值仍为 `static_bearer`，行为完全不变。
- OAuth 权限条目显式使用 `"auth_modes": ["oauth"]`，允许没有 `token` 字段。
- OAuth client 数据库记录通过 `mcp_profile_name` 指向权限条目，例如 `chatgpt`。
- `authenticate_token()` 只检查允许 `static_bearer` 的条目。
- OAuth token 认证后，将 SDK `AccessToken.client_id` 设置为 `mcp_profile_name`，现有工具执行路径仍通过 `get_client_config()` 获取白名单。

推荐新增的权限配置只复制现有 Codex 所需工具列表，不共享或复制 Codex Token：

```json
{
  "chatgpt": {
    "enabled": true,
    "auth_modes": ["oauth"],
    "allowed_tools": [],
    "max_result_limit": 50,
    "local_only": false,
    "note": "ChatGPT OAuth access"
  }
}
```

实际 `allowed_tools` 在部署时按用户确认的清单填写。

## 7. 数据模型

所有时间使用 UTC。授权事务 ID、CSRF、授权码和 access/refresh token 只保存 SHA-256 哈希；原始值使用至少 256 bit 的安全随机数，只在协议响应中返回一次。

MCP SDK 的内置 token endpoint 会从 Provider 读取原始 client secret 后执行常量时间比较，因此 client secret 不能使用不可逆哈希。它使用服务端主密钥加密后保存；Provider 的 `get_client()` 仅在请求内存中短暂解密并交给 SDK，响应结束后不缓存原文。这样保留 SDK 内置协议处理，同时避免数据库泄露直接暴露 client secret。

### `mcp_oauth_client`

- `id`：内部主键。
- `client_id`：公开客户端标识，唯一。
- `client_secret_ciphertext`：使用服务端主密钥加密的 client secret 密文。
- `client_name`：授权页展示名称。
- `mcp_profile_name`：映射到 `mcp.clients` 权限配置。
- `redirect_uris_json`：精确允许的回调 URI 列表。
- `grant_types_json`：固定包含 `authorization_code`、`refresh_token`。
- `scope`：固定允许 `mcp offline_access`。
- `enabled`、`created_at`、`updated_at`。

### `mcp_oauth_authorization_request`

- `request_id_hash`：浏览器事务随机 ID 的哈希，唯一。
- `client_id`、`redirect_uri`、`state`、`scope`、`resource`。
- `code_challenge`、`code_challenge_method`，仅接受 `S256`。
- `csrf_hash`：表单 CSRF 随机值哈希。
- `failed_attempts`：当前事务密码失败次数，达到 5 次后失效。
- `expires_at`、`consumed_at`、`created_at`。

### `mcp_oauth_authorization_code`

- `code_hash`：授权码哈希，唯一。
- `client_id`、`user_id`、`redirect_uri`、`scope`、`resource`。
- `code_challenge`、`code_challenge_method`。
- `expires_at`、`consumed_at`、`created_at`。

授权码有效期 5 分钟，只能成功兑换一次；兑换和标记 consumed 必须在同一数据库事务中完成。

### `mcp_oauth_token`

- `token_hash`：access/refresh token 哈希，唯一。
- `token_type`：`access` 或 `refresh`。
- `client_id`、`user_id`、`mcp_profile_name`、`scope`、`resource`。
- `refresh_family_id`、`parent_token_id`：refresh rotation 和重放检测。
- `expires_at`、`revoked_at`、`created_at`。

access token 有效期 15 分钟。请求 `offline_access` 时签发 30 天 refresh token。每次刷新都撤销旧 refresh token并签发新 token；若旧 token 被再次使用，则撤销同一 family 的全部有效 token。

## 8. 授权流程

1. ChatGPT 请求受保护的 MCP，服务返回 401，`WWW-Authenticate` 指向受保护资源元数据。
2. ChatGPT 读取资源元数据和授权服务器元数据，得到 `/mcp/authorize` 与 `/mcp/token`。
3. ChatGPT 发起 authorization code 请求，包含固定 `client_id`、精确 `redirect_uri`、`state`、`resource`、`scope=mcp offline_access`、PKCE `code_challenge` 和 `S256`。
4. Provider 校验全部参数，把短期授权事务写入数据库，再重定向到 `/mcp/oauth/login?request_id=...`。
5. 用户在琉璃页面输入现有用户名和密码。服务复用 `authenticate_user()`，不复制密码校验逻辑。
6. 页面明确展示客户端名称、回调域名、申请的 scope 和该 MCP profile 的工具清单；用户点击同意后生成一次性授权码。
7. 浏览器跳回 ChatGPT 精确回调地址，并携带 `code` 和原始 `state`。取消或失败按 OAuth 错误格式回调，但不泄露用户名是否存在。
8. ChatGPT 使用 client secret 和 PKCE verifier 到 `/mcp/token` 兑换 token。服务校验 client、回调地址、PKCE、resource、scope 和授权码状态。
9. ChatGPT 使用 access token 调用 `/mcp/`；Provider 将 OAuth token 映射到 `chatgpt` MCP profile。
10. access token 过期后，ChatGPT 使用 refresh token 刷新；无需用户再次输入密码，直到 refresh token 到期、被撤销或客户端被禁用。

固定客户端通过以下命令维护：

```bash
python -m invest_assistant.modules.basic.mcp.oauth.cli provision-client
python -m invest_assistant.modules.basic.mcp.oauth.cli rotate-secret --client-id <id>
python -m invest_assistant.modules.basic.mcp.oauth.cli disable-client --client-id <id>
```

`provision-client` 交互读取 ChatGPT 表单显示的回调 URI和 MCP profile，确保仓库外主密钥文件存在并具有 `0600` 权限，再生成 client ID/secret；原始 secret 只输出一次，随后手工填入 ChatGPT 高级 OAuth 设置。回调 URI属于 ChatGPT 草稿实例数据，不硬编码或提交到仓库。

## 9. Provider 认证策略

FastMCP 在启用 OAuth 时只能传入 `auth_server_provider`，不能同时传 `token_verifier`。因此 Provider 自身承担两类 token 的加载：

1. 先按哈希查询有效 OAuth access token，检查未过期、未撤销、resource 精确匹配、包含 `mcp` scope、client 和 profile 均启用。
2. 未命中时调用现有 `authenticate_token()` 检查旧静态 Bearer Token。
3. 两者都失败则返回 `None`。

静态 Bearer 不参与 refresh、revoke 或 OAuth 客户端流程。禁用 OAuth client 只撤销该客户端 OAuth token，不影响 Codex 静态 Token。

## 10. 安全约束

- 所有公开 OAuth 和 MCP 端点只能通过可信 HTTPS 对 ChatGPT 暴露。
- 仅支持 authorization code，不支持 implicit、password 或 client credentials grant。
- 强制 PKCE `S256`，不接受 `plain` 或缺少 challenge。
- `redirect_uri` 必须和预注册值逐字匹配；禁止通配符和前缀匹配。
- `resource` 必须精确等于外部 HTTPS MCP resource，token 不能用于其他 API。
- `state` 原样回传；授权事务使用一次性 request ID 和 CSRF 值，表单只允许 POST。
- client secret 由 SDK 在内存中做常量时间比较；授权码和 token 按哈希查询，其他敏感比较使用常量时间比较。日志只记录 client ID、profile、结果和内部记录 ID，不记录凭据或密文。
- 登录错误统一显示“用户名或密码错误”；单个授权事务最多失败 5 次且 10 分钟过期。
- 授权页设置 `Cache-Control: no-store`、`Content-Security-Policy`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`。
- OAuth client 被禁用、profile 被禁用或用户状态不再 active 时，已有 access/refresh token立即失效。
- 不向 ChatGPT 授予超出 `mcp.clients.chatgpt.allowed_tools` 的权限。

## 11. 错误处理

- 授权请求参数非法：返回标准 `invalid_request` 或 `unauthorized_client`；只有在 redirect URI 已确认安全时才重定向错误。
- 用户拒绝：回调 `access_denied` 和原始 `state`。
- 授权码过期、已消费或 PKCE 不匹配：token 端点返回 `invalid_grant`，不说明具体失败字段。
- client secret 错误：返回 `invalid_client`，不回显 client 数据。
- refresh token 重放：撤销 token family，返回 `invalid_grant`。
- 数据库错误：事务回滚，返回协议兼容的通用服务错误，凭据不进入堆栈日志。
- OAuth 未启用或未配置 client 时：应用启动失败并给出明确配置错误，不悄悄降级为无认证；显式关闭 OAuth 时继续使用原静态 Bearer 模式。

## 12. 测试与验收

### 单元测试

- 安全随机值、主密钥文件权限、client secret 加密解密、哈希、PKCE S256、CSRF 和常量时间校验。
- 客户端禁用、回调 URI 精确匹配、scope/resource 校验。
- 授权码 5 分钟过期、一次性消费和并发二次消费。
- access token 到期/撤销、refresh rotation、旧 refresh 重放导致 family 撤销。
- OAuth profile 和旧静态 Bearer 的双路径认证。
- 用户/client/profile 任一禁用后 token 立即失效。

### 协议集成测试

- 标准两个 well-known 地址返回一致、完整的 HTTPS 元数据。
- 未认证 MCP 返回 401 和正确的 `resource_metadata`。
- 完整 authorization code + PKCE 流程得到 access/refresh token。
- 使用 access token 发送 MCP `initialize` 返回 200，`serverInfo.name == "liuli"`。
- 旧静态 Bearer 发送同一 `initialize` 仍返回 200。
- 无 token、错误 token、错误 resource、错误 callback、错误 PKCE 全部被拒绝。

测试使用全新临时 SQLite 文件或内存数据库，不连接、不清空、不删除生产数据库。执行任何可能修改已有数据库的命令前，必须遵守 `AGENTS.md`：先取得用户对精确命令的批准，并先备份 `var/db/liuli.sqlite3` 到 `var/db/recovery/`。

### 线上验收

1. 先备份线上数据库和 Caddyfile。
2. 部署代码但保持 `MCP_OAUTH_ENABLED=false`，验证旧 HTTP/HTTPS Bearer。
3. 生成仓库外 `0600` 主密钥文件，创建 `chatgpt` profile 和固定 OAuth client，记录一次性 client ID/secret。
4. 更新 Caddy和启动配置，启用 OAuth并重启服务。
5. 用 `curl` 验证两个 well-known 地址、TLS、401 challenge 和旧 Bearer initialize。
6. 在 ChatGPT 表单填写 client ID/secret、`mcp offline_access`，完成网页登录和工具扫描。
7. 重启琉璃服务后再次调用 ChatGPT，验证持久化 refresh token 能恢复访问。
8. 撤销 ChatGPT client 后确认 ChatGPT 失效、Codex 仍可用。

## 13. 发布与回退

发布必须分阶段，避免 OAuth 配置错误影响现有客户端：

- 第一阶段：新增模型、Provider 和路由，OAuth 默认关闭；运行非破坏性验证。
- 第二阶段：备份数据库后创建新表和 OAuth client；不修改旧 token。
- 第三阶段：切换 Caddy 元数据到应用生成内容并启用 OAuth；立即执行双协议验收。

回退顺序：

1. 设置 `MCP_OAUTH_ENABLED=false` 并重启，FastMCP 恢复现有静态 token verifier。
2. 使用 `restore_liuli_mcp_https.sh` 或部署前备份恢复 Caddyfile。
3. 不删除 OAuth 表；保留数据便于排障，已签发 OAuth token在关闭模式下不会被接受。
4. Codex Token、`mcp.clients.codex` 和业务数据始终不变。

## 14. 完成标准

以下条件全部满足才视为完成：

- ChatGPT 自定义 MCP 可以自动发现 OAuth 地址、完成登录、扫描工具并调用工具。
- OAuth access token、refresh token、重启恢复和撤销行为通过验收。
- 原 Codex HTTP 静态 Bearer 和新 HTTPS 静态 Bearer 均通过 MCP initialize。
- Caddy 自动 HTTPS 和证书续期不受影响。
- 仓库、数据库和日志中不存在任何明文 OAuth secret/token/code。
- 无业务模块、工具契约、密码、Codex Token 或现有权限发生非预期改变。
