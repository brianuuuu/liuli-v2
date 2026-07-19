# 琉璃 Android Debug APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `invest_assistant/ui/android/` 创建符合 `docs/liuli_android_app_spec.md` 的 Android 16 原生客户端，完成核心个人投资流程并生成可安装的 Debug APK。

**Architecture:** 单 Activity + Jetpack Compose，按 `core` 与 `feature` 分层。Retrofit/OkHttp 访问现有 REST API，DataStore 保存服务器、Token 和主题，Room 保存笔记草稿；服务器地址通过拦截器动态切换。首个可交付版本实现四项底栏、五个看板、笔记、新闻、预警、报告、设置与离线进入，复杂详情按现有接口做只读摘要。

**Tech Stack:** Android 16/API 36、Kotlin、Compose Material 3、Navigation Compose、Hilt、Retrofit、OkHttp、Kotlinx Serialization、Room、DataStore、Coroutines/Flow、multiplatform-markdown-renderer M3、Vico Compose M3。

## Global Constraints

- 不新增或修改后端接口，不修改数据库。
- 默认服务器为 `http://115.29.176.240:5173/`，允许 App 内修改 HTTP/HTTPS 地址。
- Release applicationId 为 `com.liuli.app`，Debug 为 `com.liuli.app.debug`。
- `minSdk = compileSdk = targetSdk = 36`，Java 17。
- 复用 `docs/assets/android/liuli-web-logo.svg` 与 `android-launcher-icon-v1.png`。
- 当前仓库要求在现有分支工作，不创建或切换分支。
- 每个行为先写失败测试，再写最小实现；配置和生成资源用构建验证代替单元测试。

---

### Task 1: Android 工程与可编译主题壳层

**Files:**
- Create: `invest_assistant/ui/android/settings.gradle.kts`
- Create: `invest_assistant/ui/android/build.gradle.kts`
- Create: `invest_assistant/ui/android/gradle/libs.versions.toml`
- Create: `invest_assistant/ui/android/gradle/wrapper/*`
- Create: `invest_assistant/ui/android/app/build.gradle.kts`
- Create: `invest_assistant/ui/android/app/src/main/AndroidManifest.xml`
- Create: `invest_assistant/ui/android/app/src/main/java/com/liuli/app/LiuliApplication.kt`
- Create: `invest_assistant/ui/android/app/src/main/java/com/liuli/app/MainActivity.kt`
- Create: `invest_assistant/ui/android/app/src/main/java/com/liuli/app/core/design/*`
- Test: `invest_assistant/ui/android/app/src/test/java/com/liuli/app/core/design/ThemeModeTest.kt`

**Interfaces:**
- Produces: `ThemeMode`, `LiuliTheme`, `MainActivity`, Gradle `assembleDebug`。

- [ ] 写 `ThemeMode` 解析失败测试并运行，确认因类型不存在失败。
- [ ] 实现 LIGHT/DARK/SYSTEM 与 DataStore 可序列化字符串映射，运行测试通过。
- [ ] 创建 Compose Material 3 主题、Logo/Launcher 资源、Debug/Release 双包名和 Android 16 Manifest。
- [ ] 运行 `gradlew.bat testDebugUnitTest assembleDebug`，确认空壳 APK 可生成。

### Task 2: 动态服务器、鉴权与离线启动

**Files:**
- Create: `app/src/main/java/com/liuli/app/core/network/ServerConfigRepository.kt`
- Create: `app/src/main/java/com/liuli/app/core/network/ServerUrl.kt`
- Create: `app/src/main/java/com/liuli/app/core/network/ServerUrlInterceptor.kt`
- Create: `app/src/main/java/com/liuli/app/core/auth/AuthSession.kt`
- Create: `app/src/main/java/com/liuli/app/feature/login/*`
- Create: `app/src/main/java/com/liuli/app/feature/settings/ServerSettingsScreen.kt`
- Test: `app/src/test/java/com/liuli/app/core/network/ServerUrlTest.kt`
- Test: `app/src/test/java/com/liuli/app/core/auth/AuthSessionTest.kt`

**Interfaces:**
- Produces: `ServerUrl.normalize(String): Result<HttpUrl>`、`AuthSession.state: StateFlow<AuthState>`、`ApiService.login/me`。

- [ ] 写服务器去空格、补 `/`、HTTP/HTTPS、端口、非法 scheme 的失败测试。
- [ ] 实现服务器规范化与 DataStore 持久化，运行测试通过。
- [ ] 写“网络失败保留 Token、401 清除 Token”的失败测试。
- [ ] 实现 AuthSession、Bearer 拦截器、401 单次退出和离线启动，运行测试通过。
- [ ] 实现登录与服务器设置页面，使用 MockWebServer 验证登录契约。

### Task 3: 导航、四项底栏与五个看板

**Files:**
- Create: `app/src/main/java/com/liuli/app/navigation/*`
- Create: `app/src/main/java/com/liuli/app/feature/dashboard/*`
- Test: `app/src/test/java/com/liuli/app/feature/dashboard/DashboardReducerTest.kt`
- Test: `app/src/androidTest/java/com/liuli/app/navigation/MainNavigationTest.kt`

**Interfaces:**
- Produces: `AppDestination`、`DashboardTab`、`LiuliNavHost`、四项底栏与 HorizontalPager。

- [ ] 写底栏只含看板/记录/新闻/预警和看板五 Tab 的失败测试。
- [ ] 实现导航模型、Pager 状态与账户菜单，运行测试通过。
- [ ] 为今日/市场/赛道/标的/组合接入现有 API 摘要；单卡失败不阻断全页。
- [ ] 运行导航 UI 测试并构建 Debug。

### Task 4: Room 草稿与知识笔记

**Files:**
- Create: `app/src/main/java/com/liuli/app/core/database/*`
- Create: `app/src/main/java/com/liuli/app/feature/notes/*`
- Test: `app/src/test/java/com/liuli/app/feature/notes/NoteDraftPolicyTest.kt`
- Test: `app/src/androidTest/java/com/liuli/app/core/database/NoteDraftDaoTest.kt`

**Interfaces:**
- Produces: `NoteDraftEntity`、`NoteDraftDao`、`NoteRepository`、`NoteEditorViewModel`。

- [ ] 写 800ms 草稿保存、同 server_note_id upsert、失败保留测试。
- [ ] 实现 Room schema/DAO/repository 并运行测试通过。
- [ ] 实现笔记列表、只读详情、编辑、归档恢复和上下文创建。
- [ ] 验证断网和进程恢复不会丢失草稿。

### Task 5: 新闻时间线

**Files:**
- Create: `app/src/main/java/com/liuli/app/feature/news/*`
- Test: `app/src/test/java/com/liuli/app/feature/news/NewsRefreshAnchorTest.kt`

**Interfaces:**
- Produces: `NewsQuery`、`NewsTimelineViewModel`、刷新锚点与分页状态。

- [ ] 写筛选竞态、锚点恢复和新增数量失败测试。
- [ ] 实现服务端筛选、30 条分页、日期吸顶和时间线 UI，运行测试通过。
- [ ] 实现详情、标签筛选、原文 Intent 和关联笔记。

### Task 6: 预警、报告和简版对象详情

**Files:**
- Create: `app/src/main/java/com/liuli/app/feature/alerts/*`
- Create: `app/src/main/java/com/liuli/app/feature/reports/*`
- Create: `app/src/main/java/com/liuli/app/feature/trackdetail/*`
- Create: `app/src/main/java/com/liuli/app/feature/stockdetail/*`
- Create: `app/src/main/java/com/liuli/app/feature/portfoliodetail/*`
- Test: `app/src/test/java/com/liuli/app/feature/alerts/AlertTargetResolverTest.kt`
- Test: `app/src/test/java/com/liuli/app/feature/reports/ReportCachePolicyTest.kt`

**Interfaces:**
- Produces: 预警状态操作、规则目标映射、报告列表/阅读/下载和三类只读详情。

- [ ] 写预警 rule_id 目标映射和缺失规则测试，最小实现后跑绿。
- [ ] 写报告缓存 7 天/200MB 淘汰测试，最小实现后跑绿。
- [ ] 接入 Markdown renderer、FileProvider 下载打开和对象详情现有接口。

### Task 7: 图表、设置与视觉收尾

**Files:**
- Create: `app/src/main/java/com/liuli/app/core/design/chart/*`
- Modify: dashboard/detail/settings screens
- Test: `app/src/test/java/com/liuli/app/core/design/chart/ChartSemanticColorTest.kt`

**Interfaces:**
- Produces: Vico 折线/柱状/组合图、Canvas 环形图/热度图、完整设置页。

- [ ] 写涨红跌绿和预警语义色失败测试，最小实现后跑绿。
- [ ] 完成浅色/深色、设置、清缓存、修改密码和版本信息。
- [ ] 在 1220×2656 竖屏 Preview 检查主要页面裁切与手势导航安全区。

### Task 8: 全量验证与 Debug APK

**Files:**
- Create: `invest_assistant/ui/android/README.md`
- Output: `invest_assistant/ui/android/app/build/outputs/apk/debug/app-debug.apk`

**Interfaces:**
- Produces: 可安装 Debug APK、构建说明、版本矩阵和已知限制。

- [ ] 运行全部 JVM/Android 可执行测试与 `lintDebug`。
- [ ] 运行 `assembleDebug`，记录 APK 路径、大小和 SHA-256。
- [ ] 用 `apkanalyzer` 或 `aapt dump badging` 验证 applicationId、minSdk、targetSdk、权限和版本。
- [ ] 检查 Git diff，确保未修改后端接口、数据库和无关文件。
