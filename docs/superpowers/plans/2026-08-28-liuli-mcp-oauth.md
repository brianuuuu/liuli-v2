# 琉璃 MCP OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为琉璃 MCP 增加 ChatGPT 可用的 OAuth 2.1 authorization code + PKCE 认证，同时完整保留现有 Codex 静态 Bearer 访问。

**Architecture:** 在 `basic/mcp/oauth` 内实现持久化 OAuth Provider，复用现有用户登录和 MCP 工具白名单；FastMCP 启用 Provider 后，由 Provider 同时加载 OAuth access token 和旧静态 Bearer。主 FastAPI 提供标准根级 well-known 元数据，Caddy 只代理 HTTPS、MCP 和元数据，不再写死协议 JSON。

**Tech Stack:** Python 3.11、FastAPI/Starlette、MCP Python SDK 1.27.x、SQLAlchemy 2、Pydantic 2、Jinja2、cryptography/Fernet、pytest、Caddy、PostgreSQL/SQLite。

**Spec:** `docs/superpowers/specs/2026-08-28-liuli-mcp-oauth-design.md`

## Global Constraints

- 不切换分支；继续在当前分支开发。
- Git 提交注释必须使用中文。
- 不修改现有密码、Codex Token、业务工具、工具契约、Web、Android 或六个业务模块。
- 原 HTTP 地址 `http://115.29.176.240:8000/mcp/` 和静态 Bearer 必须继续可用。
- OAuth issuer/resource 固定为 `https://115-29-176-240.sslip.io/mcp`。
- OAuth access token 有效期 15 分钟；refresh token 有效期 30 天；授权码有效期 5 分钟；授权事务有效期 10 分钟。
- 强制 authorization code、PKCE S256、精确 redirect URI、精确 resource 和 `mcp` scope；DCR/CIMD 首期关闭。
- client secret 只以仓库外主密钥加密后的密文入库；授权码、access token、refresh token、request ID、CSRF 只存 SHA-256 哈希。
- 执行任何会修改数据库表的测试或命令前，先把 `var/db/liuli.sqlite3` 复制到 `var/db/recovery/`；不得运行会 drop、reset、truncate、clear 或 delete 任何数据库的测试。
- 所有测试使用全新内存 SQLite，不连接现有 SQLite/PostgreSQL，不删除测试数据库。
- 实际线上建表、创建 OAuth client 和修改 `mcp.clients` 前，再向用户列出精确命令并取得批准；执行前同时备份线上数据库和 Caddyfile。

---

### Task 1: OAuth 配置与 MCP 权限配置兼容层

**Files:**
- Modify: `invest_assistant/bootstrap/config.py`
- Modify: `invest_assistant/modules/basic/mcp/auth.py`
- Modify: `tests/unit/test_mcp_module.py`

**Interfaces:**
- Produces: `Settings.mcp_oauth_enabled: bool`、`Settings.mcp_oauth_issuer_url: str`、`Settings.mcp_oauth_resource_url: str`、`Settings.mcp_oauth_access_token_minutes: int`、`Settings.mcp_oauth_refresh_token_days: int`、`Settings.mcp_oauth_master_key_file: str`。
- Produces: `McpClientConfig.token: str | None`、`McpClientConfig.auth_modes: frozenset[str]`、`supports_auth_mode(client, mode) -> bool`。
- Preserves: 未设置 `auth_modes` 且包含 token 的旧条目默认 `static_bearer`。

- [ ] **Step 1: 备份本地 SQLite 文件**

运行只读检查并创建带时间戳的恢复副本；如果源文件不存在则明确记录“无需备份”，不要创建空数据库：

```powershell
$source = Resolve-Path 'var/db/liuli.sqlite3' -ErrorAction SilentlyContinue
if ($source) {
  New-Item -ItemType Directory -Force 'var/db/recovery' | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  Copy-Item -LiteralPath $source.Path -Destination "var/db/recovery/liuli-before-mcp-oauth-$stamp.sqlite3"
}
```

验收：源文件存在时，`var/db/recovery/` 中新增一份非零大小副本；后续测试仍只使用内存数据库。

- [ ] **Step 2: 写出权限配置兼容性失败测试**

在 `tests/unit/test_mcp_module.py` 增加：

```python
def test_mcp_client_config_supports_oauth_profile_without_breaking_legacy_bearer():
    from invest_assistant.modules.basic.mcp.auth import (
        authenticate_token,
        get_client_config,
        supports_auth_mode,
    )

    Session = make_session()
    db = Session()
    add_config(db, "mcp.clients", json.dumps({
        "codex": {"enabled": True, "token": "legacy", "allowed_tools": ["portfolio.get_overview"]},
        "chatgpt": {"enabled": True, "auth_modes": ["oauth"], "allowed_tools": ["portfolio.get_overview"]},
    }))

    codex = authenticate_token(db, "legacy")
    chatgpt = get_client_config(db, "chatgpt")
    assert codex is not None and supports_auth_mode(codex, "static_bearer")
    assert chatgpt is not None and chatgpt.token is None
    assert supports_auth_mode(chatgpt, "oauth")
    assert authenticate_token(db, "") is None
```

- [ ] **Step 3: 运行目标测试并确认失败**

Run: `python -m pytest tests/unit/test_mcp_module.py::test_mcp_client_config_supports_oauth_profile_without_breaking_legacy_bearer -q`

Expected: FAIL，原因是 `supports_auth_mode` 不存在或 OAuth-only profile 被过滤。

- [ ] **Step 4: 实现最小配置兼容层**

在 `McpClientConfig` 中使用：

```python
token: str | None
auth_modes: frozenset[str] = frozenset({"static_bearer"})
```

解析规则固定为：

```python
raw_auth_modes = raw_client.get("auth_modes")
if raw_auth_modes is None:
    auth_modes = frozenset({"static_bearer"}) if token else frozenset()
else:
    auth_modes = frozenset(
        item for item in raw_auth_modes
        if isinstance(item, str) and item in {"static_bearer", "oauth"}
    )
if not token and "oauth" not in auth_modes:
    continue
```

`authenticate_token()` 只比较同时具备 token 和 `static_bearer` 的条目：

```python
if client.enabled and client.token and supports_auth_mode(client, "static_bearer"):
    if secrets.compare_digest(client.token, token):
        return client
```

在 `Settings` 增加设计稿中的六项设置，默认 `mcp_oauth_enabled=False`，issuer/resource 默认为空字符串，主密钥路径默认 `/var/lib/liuli-mcp-oauth/master.key`。

- [ ] **Step 5: 运行兼容测试**

Run: `python -m pytest tests/unit/test_mcp_module.py::test_mcp_client_config_supports_oauth_profile_without_breaking_legacy_bearer tests/unit/test_mcp_module.py::test_mcp_client_config_authenticates_enabled_client_and_allowed_tools -q`

Expected: 2 passed。

- [ ] **Step 6: 提交**

```bash
git add invest_assistant/bootstrap/config.py invest_assistant/modules/basic/mcp/auth.py tests/unit/test_mcp_module.py
git commit -m "功能：扩展 MCP OAuth 权限配置"
```

### Task 2: OAuth 安全原语与持久化模型

**Files:**
- Create: `invest_assistant/modules/basic/mcp/oauth/__init__.py`
- Create: `invest_assistant/modules/basic/mcp/oauth/security.py`
- Create: `invest_assistant/modules/basic/mcp/oauth/models.py`
- Create: `tests/modules/basic/mcp/oauth/__init__.py`
- Create: `tests/modules/basic/mcp/oauth/conftest.py`
- Create: `tests/modules/basic/mcp/oauth/test_security.py`
- Create: `tests/modules/basic/mcp/oauth/test_models.py`
- Modify: `invest_assistant/bootstrap/database.py`
- Modify: `pyproject.toml`

**Interfaces:**
- Produces: `generate_credential(byte_length: int = 32) -> str`、`hash_credential(value: str) -> str`、`verify_pkce_s256(verifier: str, challenge: str) -> bool`。
- Produces: `load_or_create_master_key(path: Path, *, create: bool) -> bytes`、`encrypt_client_secret(secret: str, key: bytes) -> str`、`decrypt_client_secret(ciphertext: str, key: bytes) -> str`。
- Produces ORM: `McpOAuthClient`、`McpOAuthAuthorizationRequest`、`McpOAuthAuthorizationCode`、`McpOAuthToken`。

- [ ] **Step 1: 增加显式加密依赖和内存数据库 fixture**

在 `pyproject.toml` dependencies 增加 `"cryptography>=42,<46"` 和 `"jinja2>=3.1,<4"`。`conftest.py` 使用共享内存引擎，不删除任何文件：

```python
@pytest.fixture()
def oauth_session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, expire_on_commit=False)
```

- [ ] **Step 2: 写安全原语失败测试**

覆盖以下具体断言：

```python
def test_client_secret_round_trip_never_contains_plaintext(tmp_path):
    key_path = tmp_path / "master.key"
    key = load_or_create_master_key(key_path, create=True)
    ciphertext = encrypt_client_secret("chatgpt-secret", key)
    assert "chatgpt-secret" not in ciphertext
    assert decrypt_client_secret(ciphertext, key) == "chatgpt-secret"

def test_pkce_accepts_only_matching_s256_verifier():
    verifier = "a" * 43
    challenge = pkce_s256_challenge(verifier)
    assert verify_pkce_s256(verifier, challenge)
    assert not verify_pkce_s256("b" * 43, challenge)
```

在 POSIX 条件测试中断言主密钥权限为 `0o600`；Windows 只断言文件内容是合法 Fernet key。

- [ ] **Step 3: 运行安全测试并确认失败**

Run: `python -m pytest tests/modules/basic/mcp/oauth/test_security.py -q`

Expected: collection FAIL，原因是 oauth security 模块不存在。

- [ ] **Step 4: 实现安全原语**

固定实现：

```python
def hash_credential(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def pkce_s256_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

def verify_pkce_s256(verifier: str, challenge: str) -> bool:
    return hmac.compare_digest(pkce_s256_challenge(verifier), challenge)
```

`load_or_create_master_key()` 在 `create=False` 且文件不存在、权限过宽或内容非法时抛出 `OAuthConfigurationError`；创建时使用独占创建并设 `0600`。加解密使用 `cryptography.fernet.Fernet`。

- [ ] **Step 5: 写模型约束失败测试**

测试四张表存在，并验证 `client_id`、各凭据哈希唯一；`McpOAuthToken.token_type` 仅允许 `access`/`refresh`，authorization code 和 request 均有 `expires_at`/`consumed_at`。

- [ ] **Step 6: 实现四个模型并注册 metadata**

字段严格按设计稿第 7 节实现。JSON 列为兼容 SQLite/PostgreSQL 使用 `Text` 存 JSON 数组；状态约束用 SQLAlchemy `CheckConstraint`；外键指向 `user_account.id` 和 `mcp_oauth_client.id`。在 `create_all_tables()` 中 import `oauth.models`。

- [ ] **Step 7: 运行 Task 2 测试**

Run: `python -m pytest tests/modules/basic/mcp/oauth/test_security.py tests/modules/basic/mcp/oauth/test_models.py -q`

Expected: all passed；测试只创建内存表。

- [ ] **Step 8: 提交**

```bash
git add pyproject.toml invest_assistant/bootstrap/database.py invest_assistant/modules/basic/mcp/oauth tests/modules/basic/mcp/oauth
git commit -m "功能：新增 MCP OAuth 安全模型"
```

### Task 3: 授权事务、授权码与令牌生命周期服务

**Files:**
- Create: `invest_assistant/modules/basic/mcp/oauth/service.py`
- Create: `tests/modules/basic/mcp/oauth/test_service.py`

**Interfaces:**
- Consumes: Task 1 `get_client_config()`/`supports_auth_mode()`；Task 2 ORM 和安全函数；现有 `authenticate_user()`。
- Produces: `create_authorization_request(db, client, params, now=None) -> PendingAuthorization`。
- Produces: `complete_authorization(db, request_id, csrf_token, username, password, approved, now=None) -> AuthorizationRedirect`。
- Produces: `load_code_record()`、`exchange_code()`、`load_refresh_record()`、`exchange_refresh()`、`load_access_record()`、`revoke_token_family()`。

- [ ] **Step 1: 定义并测试授权请求验证**

增加测试，固定验证：client 必须 enabled；redirect URI 与注册值逐字相等；`resource` 必须等于设置值；scope 必须包含 `mcp` 且只能来自 `{mcp, offline_access}`；PKCE challenge 存在且 method 视为 `S256`。合法请求返回原始 `request_id`、`csrf_token`，数据库只含它们的哈希。

- [ ] **Step 2: 运行授权请求测试并确认失败**

Run: `python -m pytest tests/modules/basic/mcp/oauth/test_service.py -k authorization_request -q`

Expected: FAIL，原因是 service API 不存在。

- [ ] **Step 3: 实现授权请求服务**

使用不可变返回类型：

```python
@dataclass(frozen=True)
class PendingAuthorization:
    request_id: str
    csrf_token: str
    expires_at: datetime

@dataclass(frozen=True)
class AuthorizationRedirect:
    redirect_url: str
    authorization_code: str | None
```

事务 TTL 为 10 分钟。`state` 原样保存和回传，但永不写日志。

- [ ] **Step 4: 定义并测试登录、同意和授权码消费**

覆盖：正确现有用户登录会生成 5 分钟授权码；拒绝返回 `error=access_denied`；用户名或密码错误统一失败并增加 `failed_attempts`；第 5 次失败使事务失效；request/CSRF 错误、过期、重复提交均失败；授权码并发第二次兑换失败。

- [ ] **Step 5: 实现授权完成和授权码交换**

`complete_authorization()` 复用 `authenticate_user()`。重定向用 `urllib.parse.urlencode` 生成，成功带 `code`/`state`，拒绝带 `error=access_denied`/`state`。`exchange_code()` 在一个事务中锁定并消费 code，校验 client、redirect URI、PKCE verifier、resource 后签发：

```python
OAuthToken(
    access_token=raw_access,
    token_type="Bearer",
    expires_in=15 * 60,
    scope=" ".join(scopes),
    refresh_token=raw_refresh if "offline_access" in scopes else None,
)
```

- [ ] **Step 6: 定义并测试 refresh rotation、重放和撤销**

覆盖：合法 refresh 生成新的 access/refresh 并撤销旧 refresh；请求 scope 只能缩小；旧 refresh 再次使用会撤销同一 `refresh_family_id` 的所有 token；client/profile/user 任一 disabled 使 access/refresh 无效；token resource 不匹配无效。

- [ ] **Step 7: 实现 token 生命周期**

access TTL 15 分钟、refresh TTL 30 天。`load_access_record()` 只返回未过期、未撤销、client/user/profile 全部有效且包含 `mcp` scope 的记录。`revoke_token_family()` 同时撤销同 family 的 access 和 refresh。

- [ ] **Step 8: 运行服务测试**

Run: `python -m pytest tests/modules/basic/mcp/oauth/test_service.py -q`

Expected: all passed。

- [ ] **Step 9: 提交**

```bash
git add invest_assistant/modules/basic/mcp/oauth/service.py tests/modules/basic/mcp/oauth/test_service.py
git commit -m "功能：实现 MCP OAuth 令牌生命周期"
```

### Task 4: MCP SDK OAuth Provider 与旧 Bearer 双认证

**Files:**
- Create: `invest_assistant/modules/basic/mcp/oauth/provider.py`
- Create: `tests/modules/basic/mcp/oauth/test_provider.py`

**Interfaces:**
- Consumes: Task 2 client secret 解密；Task 3 service；现有 `authenticate_token()`。
- Produces: `LiuliOAuthProvider(OAuthAuthorizationServerProvider[AuthorizationCode, RefreshToken, AccessToken])`。
- Produces: `build_oauth_provider(settings, session_factory=SessionLocal) -> LiuliOAuthProvider`。

- [ ] **Step 1: 写 client/provider 失败测试**

覆盖：`get_client()` 从密文解密并返回 `OAuthClientInformationFull`，auth method 使用客户端记录中的 `client_secret_basic` 或 `client_secret_post`；disabled client 返回 `None`；`register_client()` 抛 `NotImplementedError`；返回对象的 redirect URI、grant types、scope 和 secret 正确。

- [ ] **Step 2: 写双 token 加载失败测试**

```python
def test_provider_accepts_oauth_access_and_legacy_bearer(
    provider, raw_oauth_token: str
):
    oauth_access = asyncio.run(provider.load_access_token(raw_oauth_token))
    legacy_access = asyncio.run(provider.load_access_token("legacy-token"))
    assert oauth_access.client_id == "chatgpt"
    assert oauth_access.resource == OAUTH_RESOURCE
    assert legacy_access.client_id == "codex"
    assert legacy_access.scopes == ["mcp"]
```

同时断言随机错误 token 返回 `None`。

- [ ] **Step 3: 运行 Provider 测试并确认失败**

Run: `python -m pytest tests/modules/basic/mcp/oauth/test_provider.py -q`

Expected: collection FAIL，原因是 provider 模块不存在。

- [ ] **Step 4: 实现 Provider 全部协议方法**

实现 SDK Protocol 的九个方法：`get_client`、`register_client`、`authorize`、`load_authorization_code`、`exchange_authorization_code`、`load_refresh_token`、`exchange_refresh_token`、`load_access_token`、`revoke_token`。`load_refresh_token()` 对数据库中已撤销但可识别的 refresh token 仍返回 SDK `RefreshToken`，让 `exchange_refresh_token()` 检测重放并撤销整个 family；过期或 client 不匹配仍返回 `None`。

`authorize()` 创建 pending request 后返回：

```python
f"{issuer_url}/oauth/login?request_id={quote(pending.request_id, safe='')}"
```

`load_access_token()` 顺序固定为 OAuth 哈希查询，然后旧静态 Bearer 回退；任何路径都不记录 raw token。ORM 记录转换为 SDK 类型时，`AccessToken.client_id` 使用 `mcp_profile_name`。

- [ ] **Step 5: 运行 Provider 测试**

Run: `python -m pytest tests/modules/basic/mcp/oauth/test_provider.py -q`

Expected: all passed。

- [ ] **Step 6: 提交**

```bash
git add invest_assistant/modules/basic/mcp/oauth/provider.py tests/modules/basic/mcp/oauth/test_provider.py
git commit -m "功能：接入 MCP OAuth Provider"
```

### Task 5: 授权页面与标准元数据路由

**Files:**
- Create: `invest_assistant/modules/basic/mcp/oauth/routes.py`
- Create: `invest_assistant/modules/basic/mcp/oauth/templates/authorize.html`
- Create: `tests/modules/basic/mcp/oauth/test_routes.py`

**Interfaces:**
- Consumes: Task 3 pending/complete service；Task 4 Provider 配置。
- Produces: `register_oauth_ui_routes(server: FastMCP, provider: LiuliOAuthProvider) -> None`。
- Produces: `oauth_metadata_router: APIRouter`，提供两个标准 well-known GET 路由。
- Produces: `build_authorization_server_metadata(settings) -> dict`、`build_protected_resource_metadata(settings) -> dict`。

- [ ] **Step 1: 写元数据路由失败测试**

断言：

```python
assert protected == {
    "resource": OAUTH_RESOURCE,
    "authorization_servers": [OAUTH_ISSUER],
    "scopes_supported": ["mcp", "offline_access"],
    "bearer_methods_supported": ["header"],
}
assert authorization["issuer"] == OAUTH_ISSUER
assert authorization["authorization_endpoint"] == f"{OAUTH_ISSUER}/authorize"
assert authorization["token_endpoint"] == f"{OAUTH_ISSUER}/token"
assert authorization["revocation_endpoint"] == f"{OAUTH_ISSUER}/revoke"
assert authorization["code_challenge_methods_supported"] == ["S256"]
assert "registration_endpoint" not in authorization
```

- [ ] **Step 2: 写授权 UI 安全失败测试**

覆盖 GET 登录页展示 client name、回调主机、scope、profile 工具清单；不展示 client secret、state、code challenge；POST 必须匹配 CSRF；响应包含 `Cache-Control: no-store`、CSP、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`；错误文案不区分用户不存在和密码错误。

- [ ] **Step 3: 运行路由测试并确认失败**

Run: `python -m pytest tests/modules/basic/mcp/oauth/test_routes.py -q`

Expected: collection FAIL，原因是 routes/template 不存在。

- [ ] **Step 4: 实现 well-known 元数据**

授权服务器 metadata 固定包含 authorization code/refresh token、`client_secret_basic`、`mcp offline_access`、S256 和 revoke，不包含 DCR。OAuth 关闭时路由返回 404；配置 URL 非 HTTPS（测试环境允许 localhost 除外）时应用启动校验失败。

- [ ] **Step 5: 实现登录与同意页面**

FastMCP custom routes：

```python
@server.custom_route("/oauth/login", methods=["GET"])
async def oauth_login(request: Request) -> Response:
    return await render_oauth_login(request, provider)

@server.custom_route("/oauth/authorize", methods=["POST"])
async def oauth_authorize(request: Request) -> Response:
    return await submit_oauth_authorization(request, provider)
```

模板只有用户名、密码、同意、取消、隐藏 request ID/CSRF；工具清单逐项 HTML 转义。POST 调用 `complete_authorization()` 并返回 303 到其 redirect URL。所有 HTML/错误响应统一添加设计稿安全头。

- [ ] **Step 6: 运行路由测试**

Run: `python -m pytest tests/modules/basic/mcp/oauth/test_routes.py -q`

Expected: all passed。

- [ ] **Step 7: 提交**

```bash
git add invest_assistant/modules/basic/mcp/oauth/routes.py invest_assistant/modules/basic/mcp/oauth/templates tests/modules/basic/mcp/oauth/test_routes.py
git commit -m "功能：新增 MCP OAuth 授权页面"
```

### Task 6: FastMCP 和 FastAPI 接线

**Files:**
- Modify: `invest_assistant/modules/basic/mcp/server.py`
- Modify: `invest_assistant/bootstrap/app.py`
- Modify: `tests/unit/test_mcp_module.py`
- Create: `tests/modules/basic/mcp/oauth/test_integration.py`

**Interfaces:**
- Consumes: Task 4 `build_oauth_provider()`；Task 5 UI 注册与 metadata router。
- Produces: OAuth 开启时 FastMCP 使用 `auth_server_provider`；关闭时继续使用 `SystemConfigTokenVerifier`。
- Preserves: `create_mcp_asgi_app()` 和工具注册接口不变。

- [ ] **Step 1: 写模式切换失败测试**

monkeypatch settings，断言 OAuth 关闭时 `_auth_server_provider is None` 且 legacy verifier 存在；OAuth 开启时 Provider 存在且 FastMCP 未同时收到 token verifier。断言 allowed hosts/origins 同时包含旧 IP host 与新 sslip.io host。OAuth 开启但 issuer/resource、有效主密钥或至少一个映射到 enabled OAuth profile 的 enabled client 任一缺失时，启动校验必须失败。

- [ ] **Step 2: 写端到端协议失败测试**

使用内存数据库和 `TestClient` 完成：

1. GET 根级 protected metadata。
2. GET `/mcp/authorize`，跟随到登录页。
3. POST 用户名/密码/同意，捕获 callback code/state。
4. POST `/mcp/token`，使用 client_secret_basic 和 PKCE verifier。
5. POST `/mcp/` 发送 MCP `initialize`，断言 200 和 `serverInfo.name == "liuli"`。
6. 使用旧静态 Bearer 再次 initialize，断言仍为 200。
7. 无 token 请求断言 401 且 `WWW-Authenticate` 指向 HTTPS protected metadata。

- [ ] **Step 3: 运行接线测试并确认失败**

Run: `python -m pytest tests/modules/basic/mcp/oauth/test_integration.py tests/unit/test_mcp_module.py -k "oauth or transport_security or bearer" -q`

Expected: FAIL，原因是 server/app 尚未启用 Provider 和 metadata router。

- [ ] **Step 4: 实现 FastMCP 模式切换**

构建参数使用互斥分支：

```python
auth_kwargs = (
    {"auth_server_provider": build_oauth_provider(settings)}
    if settings.mcp_oauth_enabled
    else {"token_verifier": SystemConfigTokenVerifier()}
)
server = FastMCP(
    name="liuli",
    instructions=MCP_INSTRUCTIONS,
    streamable_http_path="/",
    stateless_http=False,
    json_response=True,
    transport_security=transport_security,
    **auth_kwargs,
    auth=AuthSettings(
        issuer_url=issuer_url,
        resource_server_url=resource_url,
        required_scopes=[MCP_SCOPE],
        client_registration_options=ClientRegistrationOptions(
            enabled=False,
            valid_scopes=["mcp", "offline_access"],
            default_scopes=["mcp"],
        ),
        revocation_options=RevocationOptions(enabled=settings.mcp_oauth_enabled),
    ),
)
```

OAuth 开启后调用 `register_oauth_ui_routes(server, provider)`。transport security 合并旧 base URL 和 OAuth issuer/resource 的 host/origin。

- [ ] **Step 5: 注册根级 metadata router 和 OAuth models**

`create_app()` 在 mount `/mcp` 前 include `oauth_metadata_router`。OAuth 关闭时不要求主密钥文件存在；开启时缺失/权限错误必须启动失败。

- [ ] **Step 6: 运行接线和现有 MCP 回归测试**

Run: `python -m pytest tests/modules/basic/mcp/oauth/test_integration.py tests/unit/test_mcp_module.py -q`

Expected: all passed。

- [ ] **Step 7: 提交**

```bash
git add invest_assistant/modules/basic/mcp/server.py invest_assistant/bootstrap/app.py tests/unit/test_mcp_module.py tests/modules/basic/mcp/oauth/test_integration.py
git commit -m "功能：启用 MCP OAuth 双认证"
```

### Task 7: 固定客户端运维 CLI

**Files:**
- Create: `invest_assistant/modules/basic/mcp/oauth/cli.py`
- Create: `tests/modules/basic/mcp/oauth/test_cli.py`

**Interfaces:**
- Consumes: Task 1 profile config；Task 2 client model/主密钥；Task 3 token 撤销。
- Produces: `python -m invest_assistant.modules.basic.mcp.oauth.cli provision-client|rotate-secret|disable-client`。

- [ ] **Step 1: 写 CLI 失败测试**

覆盖：provision 验证 callback 为 HTTPS 或 localhost、验证 profile 存在且支持 oauth、分别保存 `client_secret_basic`/`client_secret_post`、生成 client ID/secret、数据库不含原始 secret、输出 secret 一次；rotate 会撤销该 client 全部 token并输出新 secret；disable 置 enabled false 并撤销 token；任何命令输出都不包含 master key 或旧 secret。

- [ ] **Step 2: 运行 CLI 测试并确认失败**

Run: `python -m pytest tests/modules/basic/mcp/oauth/test_cli.py -q`

Expected: collection FAIL，原因是 cli 模块不存在。

- [ ] **Step 3: 实现 argparse CLI**

命令参数固定为：

```text
provision-client --name "ChatGPT" --redirect-uri "$CHATGPT_CALLBACK_URI" --profile chatgpt --token-auth-method client_secret_basic
rotate-secret --client-id "$MCP_OAUTH_CLIENT_ID"
disable-client --client-id "$MCP_OAUTH_CLIENT_ID"
```

未传参数时允许安全交互输入；`--token-auth-method` 仅允许 `client_secret_basic`/`client_secret_post` 且默认前者；secret 使用 `generate_credential(32)`，加密后提交；原始 secret 只在成功 commit 后打印一次。失败时 rollback，禁止打印凭据。

- [ ] **Step 4: 运行 CLI 测试**

Run: `python -m pytest tests/modules/basic/mcp/oauth/test_cli.py -q`

Expected: all passed。

- [ ] **Step 5: 提交**

```bash
git add invest_assistant/modules/basic/mcp/oauth/cli.py tests/modules/basic/mcp/oauth/test_cli.py
git commit -m "运维：新增 MCP OAuth 客户端命令"
```

### Task 8: Caddy、启动配置和运维文档

**Files:**
- Modify: `configure_liuli_mcp_https.sh`
- Modify: `start_ubuntu_pg.sh`
- Modify: `docs/liuli_mcp_design.md`
- Create: `tests/unit/test_mcp_oauth_operations.py`

**Interfaces:**
- Consumes: 应用根级 well-known 路由和 OAuth issuer/resource。
- Produces: 幂等 Caddy managed block、OAuth 环境配置、ChatGPT 表单填写/回退说明。
- Preserves: `restore_liuli_mcp_https.sh` 恢复原始 Caddyfile 的行为。

- [ ] **Step 1: 写运维静态失败测试**

测试读取 shell/docs 文本并断言：Caddy 不再 `respond` 写死 OAuth JSON；matcher 包含两个标准 well-known 路径和 `/mcp*`；全部反代 127.0.0.1:8000；启动脚本包含五个非敏感 OAuth 设置和主密钥路径；文档不包含 client secret、Token、callback 实例值。

- [ ] **Step 2: 运行运维测试并确认失败**

Run: `python -m pytest tests/unit/test_mcp_oauth_operations.py -q`

Expected: FAIL，原因是 Caddy 仍返回静态 metadata 且启动脚本没有 OAuth 设置。

- [ ] **Step 3: 更新 Caddy managed block 和验收逻辑**

matcher 精确为：

```caddyfile
@liuli_mcp path /mcp /mcp/* /.well-known/oauth-protected-resource/mcp /.well-known/oauth-authorization-server/mcp
handle @liuli_mcp {
    reverse_proxy 127.0.0.1:8000
}
```

保留现有 Host/Origin 兼容所需的 header_up 和 HTTPS `WWW-Authenticate` 修正。配置脚本的 metadata 检查改为断言应用响应：resource/issuer 均为 HTTPS MCP URL，authorization/token/revoke endpoint完整，且没有 registration endpoint。

- [ ] **Step 4: 更新启动脚本和文档**

`start_ubuntu_pg.sh` 导出设计稿五项 OAuth设置和 `/var/lib/liuli-mcp-oauth/master.key` 路径，不写任何 secret。文档给出 ChatGPT 字段：服务器 URL、OAuth、自定义客户端 ID/secret、基础 scope `mcp offline_access`，Auth/Token URL由发现自动填充；写明旧 Codex 地址、回退步骤、client rotate/disable 和证书自动续期。

- [ ] **Step 5: 运行运维测试和 shell 语法检查**

Run: `python -m pytest tests/unit/test_mcp_oauth_operations.py -q`

Run on Linux or WSL: `bash -n configure_liuli_mcp_https.sh restore_liuli_mcp_https.sh start_ubuntu_pg.sh`

Expected: tests passed；bash 语法检查 exit 0。

- [ ] **Step 6: 提交**

```bash
git add configure_liuli_mcp_https.sh start_ubuntu_pg.sh docs/liuli_mcp_design.md tests/unit/test_mcp_oauth_operations.py
git commit -m "运维：配置 MCP OAuth HTTPS 入口"
```

### Task 9: 全量非破坏性验证与线上执行前检查点

**Files:**
- Verify only; no code changes unless a failure identifies a scoped defect.

**Interfaces:**
- Consumes: Tasks 1-8 complete implementation。
- Produces: 本地验证证据、线上精确命令清单和明确回退点。

- [ ] **Step 1: 确认工作区和数据库备份**

Run: `git status --short`

Run: `Get-ChildItem var/db/recovery/liuli-before-mcp-oauth-*.sqlite3 | Sort-Object LastWriteTime -Descending | Select-Object -First 1 FullName,Length,LastWriteTime`

Expected: 仅有计划内改动或工作区干净；源数据库存在时恢复副本非零。

- [ ] **Step 2: 运行 OAuth/MCP 目标测试**

Run: `python -m pytest tests/modules/basic/mcp/oauth tests/unit/test_mcp_module.py tests/unit/test_mcp_oauth_operations.py -q`

Expected: all passed；无测试连接或删除现有数据库。

- [ ] **Step 3: 运行静态与仓库检查**

Run: `python -m compileall -q invest_assistant/modules/basic/mcp invest_assistant/bootstrap`

Run: `git diff --check`

Run: `git grep -n -E "(client_secret|access_token|refresh_token).*(DG9t|Bearer [A-Za-z0-9_-]{20,})" -- ':!docs/superpowers/specs/*' ':!docs/superpowers/plans/*'`

Expected: compileall exit 0；diff check clean；凭据扫描无命中。

- [ ] **Step 4: 本地协议 smoke test**

使用专用内存/临时进程配置启动应用，执行 well-known、authorization code + PKCE、OAuth initialize、legacy Bearer initialize、refresh rotation、revoke。不要指向 `var/db/liuli.sqlite3` 或线上 PostgreSQL。

Expected: 两类 initialize 都为 200；无 token 为 401；refresh 后旧 refresh 失效；revoke 后 access 失效。

- [ ] **Step 5: 请求线上数据库修改批准**

向用户展示并等待批准以下类型的精确命令，不在同一步执行：线上数据库备份、Caddyfile备份、依赖安装、应用启动触发四张新表创建、`mcp.clients.chatgpt` 配置、主密钥和 OAuth client provision、Caddy configure/reload、协议验收。命令必须使用服务器实际 PostgreSQL备份方式；同时按 AGENTS 约束备份 `/home/liuli-v2/var/db/liuli.sqlite3`（存在时）。

- [ ] **Step 6: 最终实现提交**

如 Step 1-4 没有额外修复，不创建空提交；如有修复，重新运行受影响测试并提交：

```bash
git add -p
git commit -m "修复：完善 MCP OAuth 验收问题"
```

- [ ] **Step 7: 进入线上发布检查点**

停止本地实施并报告：提交列表、测试结果、未执行的线上命令、数据库/Caddy 回退位置。只有用户批准 Step 5 的精确命令后，才远程部署和修改线上状态。
