# 琉璃 Android App 技术规格

> 首次制定：2026-07-10  
> 最后更新：2026-07-19
> 当前版本：v7.4
> 状态：第一版全量 UI 重构实现基线
> 产品形态：个人使用的 Android 原生客户端  
> 系统基线：`docs/liuli_system_spec.md`  
> 视觉基线：本文第 10 章、Web 现有 Logo 资产与 GitHub Primer 官方设计原则

## 0. 版本演变历史

### v1：产品与原型初稿（2026-07-10）

- 确定底部导航为“看板 / 记录 / 新闻 / 预警”。
- 确定看板横向分页为“今日 / 市场 / 赛道 / 标的 / 组合”。
- 报告降为二级入口，不占底部导航。
- 参考旧 Android 新闻时间线，形成浅色高保真原型。
- 初稿曾计划为 Android 扩展信息流关联实体和报告筛选接口。

### v2：现有接口对齐（2026-07-11）

- 第一版不因 Android 新增或修改任何后端接口。
- 删除信息流 `related_stocks / related_tracks` 扩展计划，只消费现有 `source_tags` 和 `related_type / related_id`。
- 删除报告关键词、来源模块、目标类型和目标对象筛选计划，只使用现有 `report_kind=market|track|stock`。
- 知识笔记列表只使用代码已有的 `status / group_id / tag_id / q` 筛选，不增加 `note_type` 查询参数。
- 预警事件只使用现有分页、统计、已读和处理接口，不增加状态筛选或处理备注请求体。
- 今日看板由现有业务接口并发组合，不新增移动端聚合接口，也不读取 Console 数据。
- Android 复用 Web Logo 的项目内镜像 `docs/assets/android/liuli-web-logo.svg`，不另行设计移动端 Logo；其上游原文件为 `invest_assistant/ui/web/public/favicon.svg`。
- 浅色、深色、跟随系统三种主题模式均纳入第一版实现与验收，不作为后续优化项。
- 将 Android UI 规范并入本文第 10 章：参考 GitHub Primer 的中性色阶、细边框、层级和语义色体系，但保留琉璃品牌与 A 股业务语义，并使用 Compose 原生组件实现。
- 本文档 v2 正文覆盖 v1 中与当前代码不一致的功能描述。

### v3：极度个人定制与实施闭环（2026-07-11）

- 产品进一步收紧为单用户、单服务地址、单台当前主流 Android 真机优先，不面向应用商店或大众分发。
- 默认设备基线提升为 Android 12（API 31）及以上，只对用户当前主力设备做最终适配和验收。
- 补齐设置入口、笔记查看规则、赛道/标的/组合简版详情及组合现有 API 映射。
- 补齐个人使用所需的构建、网络超时、重复提交、缓存、时间解析、草稿生命周期和进程恢复规则。
- 报告首版不引入 WebView；Markdown/文本在应用内阅读，PDF 等文件通过受控缓存和系统应用打开。
- 明确不实现多账户隔离、证书锁定、加密数据库、远程日志、埋点、崩溃上报、应用商店发布和大范围设备兼容。
- 本文档 v3 正文覆盖 v1、v2 中与个人定制边界不一致的通用化描述。

### v4：文档归档与用户定位（2026-07-11）

- Android Spec 从阶段性设计目录移动到 `docs/liuli_android_app_spec.md`，与 `docs/liuli_system_spec.md` 并列维护。
- Web Logo 原样复制到 `docs/assets/android/liuli-web-logo.svg`，与 Android Launcher Icon 参考图放在同一资产目录。
- 明确唯一目标用户为“专业投资者 + IT 极客”型个人用户。
- 将高信息密度、数据来源透明、状态可追溯、失败原因直给和高频操作短路径写入产品约束。
- 明确不面向投资新手、普通大众、团队协作和低技术认知用户，不增加教学、营销或通用化引导。
- 本文档 v4 正文覆盖此前版本中未明确用户能力与使用偏好的描述。

### v5：个人设备、动态服务器与离线进入（2026-07-11）

- 主力验收设备明确为小米 17，使用手势导航和手机竖屏布局。
- 默认服务器地址固定为 `http://115.29.176.240:5173/`，当前已验证该地址可访问现有 `/api` 鉴权路由。
- 服务器地址从构建期只读配置改为 DataStore 运行时配置，登录页和设置页均可修改。
- 允许个人部署使用 HTTP 明文地址，不再强制 Release 只能使用 HTTPS。
- 已有 Token 时冷启动不等待网络校验，先进入完整 App 壳层；断网时本地草稿可用，服务端页面显示离线状态。
- 无 Token 时进入登录页，但仍可离线进入服务器设置；修改地址后清除旧服务器会话并重新登录。
- 本文档 v5 正文覆盖 v1—v4 中“固定 HTTPS、构建期只读服务器地址、联网校验后才能进入应用”的旧规则。

### v6：真机系统、渲染库与双包名（2026-07-11）

- 小米 17 真机系统确认为 Android 16，对应 API 36；`minSdk / compileSdk / targetSdk` 均固定为 36。
- Markdown 阅读固定使用 `multiplatform-markdown-renderer` Material 3 模块，首版锁定 `0.39.0`。
- 折线图、柱状图和组合图固定使用 Vico Compose Material 3，首版锁定 `3.2.3`；环形分布和热度矩阵使用 Compose Canvas 自绘。
- Release 包名固定为 `com.liuli.app`；Debug 使用 `.debug` 后缀和“琉璃 Dev”应用名，可与正式版同时安装。
- 本文档 v6 正文覆盖此前版本中未确定 Android API Level、Markdown/图表实现和 Debug 包名的描述。

### v7：原型壳层与真实 Web 业务全量对齐（2026-07-18）

- 删除通用 `RemoteObjectScreen / RemoteListScreen` 和业务页面中的动态 `JsonObject` 展示；现有 REST 响应改为 Kotlinx Serialization 强类型 DTO。
- 以 15 张 v1 原型作为手机壳层，以当前 Web 与后端 Schema 作为业务内容基线，重做登录、五看板、记录、新闻、预警、报告和设置。
- 建立 `LiuliTheme / LiuliTokens / LiuliComponents`，落实 48dp AppBar、16dp 页面边距、8dp 卡片圆角、56dp 四项底栏、浅色/深色/跟随系统和真实 Material 图标。
- 根页面使用 Navigation Compose；五看板使用 `HorizontalPager`；赛道、标的、组合提供移动摘要详情，报告仍为二级路由。
- 引入 Hilt、`ApiSession`、`DashboardRepository`、`DashboardViewModel`、`StateFlow<UiState<T>>` 和五分钟进程缓存；刷新失败时保留旧内容。
- Room 仍只保存知识笔记草稿；记录页实现搜索、类型筛选、草稿状态、800ms 自动保存、提交失败保留和手动重试。
- 新闻实现日期吸顶时间线、节点、来源、标签、关联对象和详情；预警实现状态筛选、等级语义、已读、已处理和关联笔记。
- 报告实现现有三类筛选、Material 3 Markdown 阅读、应用缓存和 `FileProvider` 外部打开；设置补齐主题、服务器、草稿数、报告缓存、修改密码、退出和版本信息。
- 现有 Kotlin `1.9.24` / Compose BOM `2024.09.03` 与计划锁定的 Markdown `0.39.0`、Vico `3.2.3` 二进制不兼容，因此首版实际锁定兼容版本 Markdown `0.28.0`、Vico `1.15.0`，不为升级渲染库改动既有 Android 技术栈。
- v7 未新增、修改或调用任何 Android 专用后端接口，也未调用 `/api/console/*`。

### v7.1：模拟器实机尺寸视觉校准（2026-07-18）

- API 36.1 模拟器通过 WHPX 硬件加速启动，并以真实 `1080 × 2400 px / 420 dpi` 竖屏截图重新对照 15 张原型；此前 WMI 的固件虚拟化字段在 Hyper-V 接管后不可靠，以 Android Emulator `WHPX is installed and usable` 自检为准。
- 视觉 Token 从偏重的 GitHub 默认控件外观收敛为原型实际参数：页面底色 `#F3F6FA`、细边框 `#E2E8F0`、页面内容边距 `12dp`、普通卡片圆角 `10dp`、看板 Tab `40dp`、底栏内容 `56dp`。
- 登录页移除额外表单大卡片，恢复 `60dp` Web Logo、`46dp` 输入框与按钮、24dp 水平边距、简洁服务器入口和底部个人使用说明；浅色、深色均使用主题文字色，修复深色标题发黑。
- AppBar 使用 28dp Logo、18sp 主标题、9sp 副标题和 30dp 个人头像；底栏改为四等分自定义导航，选中态只突出图标轻背景、图标和文字。
- 今日、赛道、标的、记录、预警、报告和设置由“每行一张厚卡片”改为分组卡片加弱分隔线；新闻时间线去掉节点外层卡片，恢复日期吸顶、纵向轨道、菱形节点与正文扫描节奏。
- v7.1 仍只消费现有接口，不修改后端、数据库、REST 路径或字段。

### v7.2：主壳层精简与个人入口收口（2026-07-18）

- 移除四个业务主模块顶部仅重复显示模块名称的 48dp AppBar，根页面内容直接从状态栏安全区下方开始；二级详情、编辑器、报告阅读和服务器设置仍保留带返回动作的 AppBar。
- 底部根导航调整为“看板 / 记录 / 新闻 / 预警 / 我的”；“我的”只承接账号、主题、服务器、草稿、缓存和版本设置，不成为业务能力所有者，报告仍是二级入口。
- Launcher、登录页和“我的-关于”统一使用由 Web `favicon.svg` 确定性转换的蓝色渐变六边形 Logo；adaptive icon 仅增加浅蓝蒙版背景，不重绘 Logo。
- 普通控件的主色限定为白、灰、蓝、黑，Material `secondary / tertiary` 和完成态全部映射为琉璃蓝；红、绿、橙仅用于风险、涨跌、成功和提醒语义，禁止出现默认紫色。
- 知识笔记定位为短文本记录，列表、详情和编辑均使用纯文本；新闻正文同样按服务端文本展示。Markdown Renderer 只用于报告阅读与报告文件打开。
- 市场看板使用现有热榜接口补齐四项指标、真实热度条和标签排行；赛道、标的看板补齐移动端四项摘要指标，不新增任何接口。

### v7.3：Flomo 式短笔记流（2026-07-19）

- “记录”根页改为独立的短笔记时间流：移除常驻大搜索框、“全部 / 论点 / 复盘”筛选、“知识笔记”区块标题、列表外层大框架和标题式笔记布局。
- 顶部只保留当前分组名称、下拉箭头和搜索图标；搜索时原位切换为紧凑搜索栏，不常驻占用列表空间。
- 笔记卡片按时间倒序展示时间、纯文本正文、标签和分组；不显示服务端派生标题和 `note_type`，详情页同样不显示“知识笔记”标题。
- 页面底部中央 `+` 打开接近 Flomo 的快速输入 Bottom Sheet；只编辑短文本、`#标签` 和分组，提交成功后刷新时间流。
- 支持“全部笔记 / 具体分组”切换，并通过现有分组接口新增和重命名分组；快速输入默认写入当前分组，也可在输入面板内切换。
- 移除 Room、本地草稿表、草稿自动保存、草稿恢复、设置页草稿统计和相关测试；笔记提交失败时只在当前输入面板保留内容并允许手动重试。
- 新闻、报告、预警及看板的关联笔记入口不再创建本地草稿，统一跳转到快速输入面板并携带现有 `related_module / related_id`。
- v7.3 只消费现有知识库笔记与分组接口，不新增或修改后端接口、数据库和 Schema。

### v7.4：笔记排版与新闻时间线精修（2026-07-19）

- 短笔记正文统一为接近 Flomo 阅读密度的 `17.5sp / 26sp`，详情与编辑输入为 `18sp`；标签提升到 `13sp`，不再与正文形成过大的字号落差。
- 笔记详情右上角提供编辑入口，复用快速输入面板修改正文和分组，并通过现有 `PUT /api/knowledge/notes/{id}` 保存；不新增移动端编辑接口。
- 新闻首屏从一次读取 50 条完整正文调整为 20 条，接近列表尾部时按 `offset` 自动加载下一页；筛选和搜索变化取消旧首屏协程，翻页结果写入前再次核对筛选快照。
- 新闻根页参考雪球 7×24：使用日期日历块、日期吸顶、左侧时间、虚线轨道和圆形节点，正文、来源、标签及写笔记/分享动作在同一纵向扫描流中展示。
- 新闻详情移除卡片套卡片，改为来源时间、标题、标签、纯文本正文、分享和关联笔记的单列阅读页。
- 兼容当前信息流接口实际出现的 ISO 与 `MM/dd/yyyy HH:mm:ss` 两种时间格式，修复日期分组和时间标签错位。
- 修复新闻与笔记根页把运行时 `ApiService` 代理作为 `LaunchedEffect` 键导致的重复首屏请求；筛选和手动刷新才允许重新读取第一页。
- v7.4 未新增或修改后端接口、数据库和 Schema。

## 1. 文档定位

本文档是琉璃 Android 首版的独立产品与技术规格，用于指导后续 Android 工程。第一版只消费当前已经存在的 REST API，不为 Android 新增或修改任何后端接口。

本文档不改变六个业务模块的能力归属，不把 Android 建设成缩小版 Web，也不把移动端能力放入 Console。旧平台 Android 工程仅作为新闻阅读交互参考，不复用旧 Flask API、Cookie 会话、包结构和页面组织。

## 2. 产品定位

### 2.1 用户定位：专业投资者 + IT 极客

琉璃 Android 的唯一目标用户是用户本人，其画像是“专业投资者 + IT 极客”的结合：既具备成熟的投资研究框架，也理解软件系统、数据源、接口、缓存、延迟和失败状态。产品不需要降低专业信息密度来照顾大众理解，也不需要用黑盒式包装隐藏技术事实。

投资侧特征：

- 以市场、赛道、标的、组合和预警为连续研究链路，不把新闻浏览当作孤立的信息消费。
- 关注事实来源、发布时间、数据更新时间、研究判断和持仓风险，要求结论能够回到原始材料或关联笔记。
- 高频使用场景包括盘前快速扫描、盘中碎片化确认、盘后复盘和随时记录研究判断。
- 已理解估值、收益、回撤、标签、赛道、预警和报告等专业概念，不需要投资基础教学、术语解释和风险教育弹窗。
- 需要快速区分“新信息、重要信息、待处理事项、已有判断和当前持仓影响”，避免被低价值内容打断。

IT 极客侧特征：

- 能理解服务端、客户端缓存、分页、同步时间和 HTTP 错误等技术概念。
- 偏好系统明确展示数据来源、更新时间、缓存状态、请求失败原因和手动重试入口，不接受用模糊提示掩盖异常。
- 接受直接配置个人服务器地址、手动侧载 APK、个人签名和少量技术化设置，不需要应用商店、账号注册和新手初始化向导。
- 偏好可预测、可复现、少魔法的交互；客户端不擅自推导服务端不存在的关联关系，也不在后台偷偷提交笔记或触发任务。
- 重视操作效率和系统一致性，愿意用较高信息密度换取更少的页面跳转和更完整的上下文。

由该画像产生的产品约束：

1. 默认使用紧凑但可读的布局，同屏优先呈现关键指标、更新时间、状态和下一步入口。
2. 重要数据必须尽可能展示来源、时间和当前筛选条件；缓存内容要标明更新时间，失败时保留旧内容并直说失败原因。
3. 首页不放营销文案、新手教程、推荐任务和通用资讯瀑布流；首屏服务于快速判断和行动。
4. 专业名词沿用系统既有业务语义，不为移动端重新发明一套简化概念。
5. 高频动作缩短路径：快速记录一步可达，新闻/报告/预警可直接创建带上下文的笔记，重要列表保留筛选与阅读位置。
6. 技术细节只在有助于判断时展示，例如数据更新时间、缓存、网络错误和版本；不把 Console 运维能力搬到 Android。
7. 不为不存在的第二类用户设计偏好开关、角色模式或可配置首页，所有取舍直接围绕用户本人的投资工作流固化。

非目标用户：

- 需要投资启蒙、术语教学、荐股提示或保姆式操作引导的投资新手。
- 只消费大众财经新闻、不维护研究笔记和投资组合的普通用户。
- 需要多人协作、审批、分享、社交、客户管理或机构权限的团队用户。
- 需要无障碍认证、大范围机型适配或应用商店标准化体验的公众用户。

### 2.2 第一版接口冻结原则

```text
不为 Android 新增接口；
不为 Android 修改接口路径、查询参数、请求体、响应字段或业务行为；
不新增移动端专用聚合接口；
Android 必须在现有 API 能力范围内完成首版。
```

当原型能力超出现有接口时，第一版应降级或隐藏对应交互，不能通过修改后端来补齐。后端未来因 Web 或业务模块自身演进自然增加能力后，Android 可以再消费，但 Android 不能成为接口变更的发起原因。

Android 是个人投资研究的随身客户端，负责：

1. 快速了解各业务模块的核心状态。
2. 浏览重要市场信息。
3. 随手记录研究判断并沉淀到知识库。
4. 阅读报告。
5. 查看并处理预警。

首版只服务于用户本人，默认连接一个可在设置中修改的个人公网服务，安装到用户的小米 17。设计与工程决策优先满足该设备上的操作效率、数据不丢失和阅读体验，不为潜在公众用户预留通用化能力。

首版不负责：

- 系统控制台、任务中心、数据源和标签治理。
- 赛道假设复杂编辑、标的横向 PK 和组合深度维护。
- 报告生成、研究员配置和外部 Skill 管理。
- 多用户、注册、租户、协作和复杂权限。
- FCM、后台轮询、实时系统通知。
- 完整离线同步和多设备冲突合并。
- 应用商店上架、公众分发、渠道包、灰度发布和远程配置。
- 多账号切换、访客模式和组织权限。
- Android 16 以下设备、平板、折叠屏、车机、电视和大范围厂商兼容。
- 证书锁定、EncryptedSharedPreferences、SQLCipher、生物识别锁、设备完整性校验等高成本安全增强。
- 用户行为埋点、广告统计、远程日志和第三方崩溃上报。

### 2.3 个人部署参数

| 项目 | 首版值 |
|---|---|
| 主力设备 | 小米 17 |
| 系统 | Android 16 / API 36，Xiaomi HyperOS 3 |
| 屏幕 | 6.3 英寸，`2656 × 1220`，约 `460 ppi` |
| 导航方式 | 全面屏手势导航 |
| 正式布局 | 手机竖屏 |
| 默认服务器 | `http://115.29.176.240:5173/` |
| 服务器配置 | App 内可修改，DataStore 持久化 |
| 安装方式 | 个人签名 Release APK 覆盖安装 |

设备尺寸和 HyperOS 信息参考[小米 17 官方规格](https://www.mi.com/global/product/xiaomi-17/specs/)。Android 16 对应 API 36，参见 [Android SDK Platform release notes](https://developer.android.com/tools/releases/platforms)。创建工程和真机联调时仍记录实际 `SDK_INT`、字体大小与显示大小。

## 3. 原型总览

![琉璃 Android v1 原型总览](prototypes/liuli-android-v1/00-overview.png)

原型源文件：

- `docs/prototypes/liuli-android-v1/prototype.html`
- `docs/prototypes/liuli-android-v1/styles.css`
- `docs/prototypes/liuli-android-v1/prototype.js`

基准画布为 `360 × 800 dp`，单页导出图为 `1080 × 2400 px`。原型属于 v1 视觉参考，不再继续迭代；当原型文字、Logo、主题或交互与 v4 正文、当前路由和 Schema 冲突时，以 v4 正文和当前代码为准。v1 原型只展示浅色主题且使用了临时文字标识，这不代表实现范围；第一版实现必须复用 Web Logo，并同时通过浅色、深色和跟随系统验收。

## 4. 信息架构

### 4.1 底部导航

底部导航固定为五项：

```text
看板｜记录｜新闻｜预警｜我的
```

规则：

- 登录后默认进入“看板”。
- 底部导航只承载高频顶级目的地。
- “我的”是个人账号与本机设置入口，不是业务模块。
- 报告不占底部模块。
- 二级页面保留当前底部模块上下文；全屏编辑器和报告阅读器可隐藏底栏。

### 4.2 看板分页

看板内部使用顶部横向标签和左右滑动分页：

```text
今日｜市场｜赛道｜标的｜组合
```

实现使用五等分自定义 Tab Row + `HorizontalPager`：

- 点击标签与滑动分页双向同步。
- 冷启动固定打开“今日”。
- 同一应用会话内保留各页滚动位置。
- 分页首次可见时加载数据；不可见页面不提前请求。
- 看板只展示摘要、排行、少量图表和详情入口，不直接执行复杂业务维护。

### 4.3 路由

```text
/login
/dashboard?tab=today|market|track|stock|portfolio
/notes
/notes/new
/notes/{noteId}
/notes/{noteId}/edit
/news
/news/{sourceItemId}
/alerts
/alerts/{alertEventId}
/my
/reports
/reports/{reportId}
/tracks/{trackId}
/stocks/{stockId}
/portfolios/{portfolioId}
/settings/change-password
/settings/server
```

返回规则：

- 二级详情返回时恢复来源页面、筛选条件和列表位置。
- 从新闻、报告或预警打开笔记编辑器，返回时回到原对象详情。
- Token 失效时清空受保护页面栈并进入 `/login`。
- 四个业务根页面不显示重复模块名称 AppBar；“我的”根页承载账号、主题、服务器、缓存、修改密码和退出登录。
- `/settings/server` 不要求登录，可从登录页和已登录设置页进入；其余业务路由仍要求本地存在 Token。

## 5. 页面规格

### 5.1 登录

![登录](prototypes/liuli-android-v1/01-login.png)

内容：应用标识、用户名、密码、登录按钮、当前服务器地址和服务器设置入口。

状态：

- 初始：按钮仅在用户名和密码非空时启用。
- 提交中：按钮显示加载状态，禁止重复提交。
- 失败：在表单下方展示服务端错误或网络错误。
- 成功：保存 Token，读取 `/api/auth/me` 后进入今日看板。
- 无网络：登录按钮仍可点击并显示明确网络错误；用户可以进入 `/settings/server` 修改地址，不需要先登录。

启动规则：

1. 启动时先读取 DataStore，不用网络请求阻塞启动画面。
2. 已有 Token 时立即进入主 App 壳层，并在后台调用 `/api/auth/me`。
3. `/api/auth/me` 成功时更新用户摘要；返回 401 时清除旧登录态并进入登录页；断网、超时或 5xx 时保留登录态和当前页面，今日卡片显示离线状态。
4. 本地没有 Token 时进入登录页；登录页和服务器设置始终可离线打开。
5. 离线进入主壳层时，已加载的进程缓存仍可浏览；看板、记录、新闻、报告和预警没有可用缓存时显示离线或错误状态，不伪造数据。

### 5.2 今日看板

![今日看板](prototypes/liuli-android-v1/02-dashboard-today.png)

展示：

- 快速记录入口。
- 今日重要信息数量及前三条。
- 未读预警数量及高优先级预警。
- 最新报告及“查看全部”。
- 最近知识笔记。

今日看板由已有业务 API 并发组合，不新增跨模块 SQL 聚合接口。单块请求失败时只影响该块，其他卡片继续展示。

### 5.3 市场看板

![市场看板](prototypes/liuli-android-v1/03-dashboard-market.png)

展示：信息流数量、活跃热词、标签命中、升温方向、市场热度图和 `tag.type=hotword` 的标签排行。

交互：

- 排行接口返回的是 tag 热度，不是 hotword 业务实体；点击排行项直接使用返回的 `tag.id` 进入带 `tag_id` 筛选的新闻时间线。
- 排名窗口支持 `24h / 7d / 30d`，默认 `7d`。
- Android 不展示信息源同步或任务状态，因为这些数据当前只由 Console 提供。

### 5.4 赛道看板

![赛道看板](prototypes/liuli-android-v1/04-dashboard-track.png)

展示：跟踪赛道、今日材料、待判断材料、升温赛道、热度排行和最新材料。

交互：点击排行或材料进入赛道简版详情；Android 首版不编辑赛道状态、标签绑定和分析快照。

### 5.5 标的看板

![标的看板](prototypes/liuli-android-v1/05-dashboard-stock.png)

展示：研究标的、候选标的、最高评分、待处理材料、评分排行、重点标的趋势和最新材料。

交互：点击标的进入简版详情，可阅读评分、估值和最新材料；首版不维护对比组、赛道绑定和评分快照，也不按目标对象查询关联报告。

### 5.6 组合看板

![组合看板](prototypes/liuli-android-v1/06-dashboard-portfolio.png)

展示：组合选择、总资产、当日收益、年度收益、现金、最大回撤、市值曲线和资产分布。

规则：

- 默认展示所有组合聚合值。
- 可切换单个组合。
- 行情为服务端缓存，只显示更新时间。
- Android 不直接调用行情服务，不触发全局刷新任务。
- 首版不新增、删除或调整持仓。

### 5.7 知识笔记列表

![知识笔记](prototypes/liuli-android-v1/07-notes-list.png)

记录页采用 Flomo 式短笔记时间流：

- 顶部左侧为当前分组名称和下拉箭头，右侧为搜索图标；不显示“知识笔记”页面标题。
- 默认展示“全部笔记”，可以切换到具体分组；分组下拉提供“编辑分组”入口。
- 搜索图标点击后在顶部原位展开紧凑搜索输入，不常驻显示大搜索框。
- 列表不显示“全部 / 论点 / 复盘”或 `note_type` 筛选。
- 每条卡片只展示创建时间、正文、标签和所属分组；不展示服务端为兼容 Web 自动派生的标题。
- 正文使用 `17.5sp / 26sp`，标签使用 `13sp / 18sp`，时间使用 `13.5sp`；标签不能退化成难以阅读的小号辅助文字。
- 卡片点击进入纯文本详情，详情顶部只有返回、时间和编辑动作，不显示“知识笔记”标题。
- 页面不嵌套列表大卡片，不使用表格、分组区块标题或桌面式工具栏。

### 5.8 笔记编辑

![笔记编辑](prototypes/liuli-android-v1/08-note-editor.png)

页面中央 `+` 打开快速输入 Bottom Sheet，字段只包含：

- 当前分组，可在面板内切换为未分组或任一现有分组。
- 纯文本正文，不提供独立标题、类型、Markdown、富文本、图片或语音附件。
- `#标签` 快捷输入；客户端把正文中的标签同步到现有 `tags` 字段，不新增标签接口。
- 从详情点击编辑时复用同一面板，预填正文和分组，保存时调用现有 `PUT /api/knowledge/notes/{id}`。

提交规则：

- 用户点击发送后直接调用现有 `POST /api/knowledge/notes`，服务端继续从首行派生兼容 Web 的标题，Android 不展示该标题。
- 提交中禁用发送按钮；成功后关闭面板并刷新时间流。
- 失败时保留当前面板内容并显示中文错误，用户手动重试；关闭面板或进程被系统回收后不保留本地草稿。
- 不做后台自动提交、离线队列、版本冲突或重复提交补偿。
- 来自新闻、报告、预警、赛道、标的和组合的入口复用同一面板，并写入现有关联字段。

上下文创建映射：

| 来源 | `related_module` | `related_id` |
|---|---|---:|
| 新闻 | `market_radar` | `source_item.id` |
| 报告 | `report_library` | `report.id` |
| 预警 | `alert_center` | `alert_event.id` |
| 赛道 | `track_discovery` | `track.id` |
| 标的 | `stock_analysis` | `stock.id` |
| 组合 | `portfolio` | `portfolio.id` |

### 5.9 新闻时间线

![新闻时间线](prototypes/liuli-android-v1/09-news-timeline.png)

根页采用雪球 7×24 式单列时间轴：

- 顶部为紧凑的“只看重要”、搜索和刷新控制，不放常驻大搜索框。
- 日期使用日历块和 `yyyy.MM.dd` 文本，并在滚动时吸顶。
- 每条左侧显示 `HH:mm`、虚线轨道和圆形节点；右侧依次显示来源、重要状态、标题、正文摘要、标签、写笔记和分享。
- 不给每条新闻增加外层卡片，依靠时间轴、留白和字号建立层级。
- 标题使用 `17sp / 25sp`，正文摘要使用 `16sp / 25sp`，列表最多展示三行标题和五行正文。

数据规则：

- 每页 `20` 条，按服务端既有 `publish_time DESC, id DESC` 顺序。
- 当前界面只发送 `q / important_only / limit / offset`；不在客户端对当前页二次筛选。
- 搜索输入延迟 `350ms`；切换搜索或重要筛选时 Compose 协程取消旧首屏请求。
- 翻页请求记录发起时的查询和重要筛选值，返回时不一致则丢弃，避免旧页混入新筛选。
- 刷新时已有内容继续可见，只显示轻量刷新进度；失败不清空已加载内容。
- 每条最多展示三个命中标签。
- 第一版不把命中标签推导成标的或赛道实体，不提供从信息流直接跳转标的/赛道详情。

时间解析兼容服务端当前实际响应中的 ISO 8601 和 `MM/dd/yyyy HH:mm:ss`；日期分组统一为 `yyyy-MM-dd`，时间统一为 `HH:mm`。无法解析时进入“日期未知”，不通过固定字符串下标伪造时间。

### 5.10 新闻详情

![新闻详情](prototypes/liuli-android-v1/10-news-detail.png)

展示来源、时间、标题、命中标签、纯文本正文，以及已有 `related_type / related_id` 信息。正文不套卡片、不使用 Markdown 渲染。

操作：系统分享面板分享标题和已有原文 URL；基于当前 `source_item.id` 写关联笔记。首版详情不猜测未实现的业务对象路由。

### 5.11 预警列表

![预警列表](prototypes/liuli-android-v1/11-alerts-list.png)

展示事件级别、标题、摘要、时间、未读状态和处理状态。支持列表刷新、标记已读和全部已读。

首版只在以下时机请求新预警：

- 进入预警页。
- 下拉刷新。
- 应用从后台回到前台且距离上次刷新超过 60 秒。

不注册 WorkManager，不发送系统通知。

### 5.12 预警详情

![预警详情](prototypes/liuli-android-v1/12-alert-detail.png)

支持标记已读、标记已处理、进入关联对象和写处理记录。若需要进入关联对象，Android 先通过现有 `GET /api/alerts/rules` 将 `event.rule_id` 映射到规则的 `target_type / target_id`；规则不存在或目标为空时不显示跳转入口。

处理记录不写入 `alert_event`：

1. 创建 `related_module=alert_center` 的知识笔记。
2. 笔记创建成功后，用户可单独标记预警已处理。
3. 两个动作互不隐式绑定，避免笔记失败时错误改变预警状态。

### 5.13 报告列表

![报告列表](prototypes/liuli-android-v1/13-reports-list.png)

报告是二级页面，可从今日看板进入完整列表，也可从市场、赛道、标的看板进入对应 `report_kind` 列表。组合看板、新闻详情和普通对象详情当前不提供报告入口。

第一版只使用现有 `report_kind=market / track / stock` 服务端筛选，不提供关键词、组合、预警、知识或目标对象筛选。列表展示标题、摘要、来源模块、文件格式和时间；时间优先使用 `publish_time`，为空时回退到 `created_at`。

### 5.14 报告阅读

![报告阅读](prototypes/liuli-android-v1/14-report-reader.png)

- Markdown 在应用内阅读。
- 服务端 `/content` 返回的 Markdown、HTML 或其他文本统一作为纯文本/Markdown 兼容内容阅读，首版不引入 WebView、不执行 HTML 脚本。
- PDF 及其他二进制文件通过带 Bearer Token 的 `/download` 请求保存到应用 Cache，再通过 `FileProvider` 只读 URI 和系统 Intent 打开。
- 下载文件名优先读取响应头，缺失时使用报告标题和服务端格式生成；同一报告重复打开可复用未过期缓存。
- 缓存文件保留 7 天或总量达到 200MB 时清理最旧文件；清理不影响服务端报告。
- 下载失败保留当前报告页面并提供重试；设备没有可处理该 MIME 类型的应用时显示明确提示。
- 页面提供“基于报告写笔记”。
- 报告阅读器隐藏底部导航，返回后恢复报告列表或来源详情位置。

### 5.15 设置

![设置](prototypes/liuli-android-v1/15-settings.png)

展示当前账号、主题、当前服务器地址、报告缓存、修改密码、退出登录和应用版本。主题提供“浅色 / 深色 / 跟随系统”三个明确选项。

服务器地址可点击进入 `/settings/server` 修改。已登录状态修改服务器后必须结束旧服务器会话并重新登录。

入口固定为所有看板 AppBar 右侧账户菜单；新闻、记录和预警根页面可在 AppBar 右侧复用同一账户按钮。详情页不重复放置设置入口。

### 5.16 赛道简版详情

路由：`/tracks/{trackId}`。调用现有 `GET /api/track-discovery/tracks/{id}/detail`，展示赛道名称、状态、热度、核心标签、最新材料和现有详情响应中的研究摘要。支持打开材料、按标签进入新闻及创建关联笔记；首版不编辑赛道、不触发 AI 分析。

加载失败且无缓存时显示重试；404 显示“赛道已不存在”并允许返回。返回后恢复赛道看板位置。

### 5.17 标的简版详情

路由：`/stocks/{stockId}`。调用现有 `GET /api/stock-analysis/stocks/{id}/detail`，展示名称、代码、状态、评分、估值摘要、趋势和最新材料。支持打开材料、按标签进入新闻及创建关联笔记；首版不编辑标的、不维护对比组、不刷新行情。

加载失败且无缓存时显示重试；404 显示“标的已不存在”并允许返回。返回后恢复标的看板位置。

### 5.18 组合简版详情

路由：`/portfolios/{portfolioId}`。组合列表使用现有 `GET /api/portfolios`，详情以 `GET /api/portfolios/{id}/dashboard` 为主，并按需要读取 `GET /api/portfolios/{id}` 和带 `portfolio_id` 的价值快照。展示组合名称、总资产、现金、收益、回撤、持仓摘要、市值曲线和更新时间。

支持切换回组合总览和创建关联笔记；首版不新增、删除或调整组合、现金和持仓，不调用刷新行情接口。404 显示“组合已不存在”并允许返回。

### 5.19 修改密码

路由：`/settings/change-password`。输入旧密码、新密码和确认密码，客户端先校验非空与两次新密码一致，再调用现有 `POST /api/auth/change-password`。成功后保留当前 Token 和页面状态并返回设置页；旧密码错误使用服务端信息提示，不自动退出登录。

### 5.20 服务器设置

路由：`/settings/server`，不要求登录。页面展示当前地址、默认地址、输入框、“恢复默认”和“保存并重新登录”。默认值为：

```text
http://115.29.176.240:5173/
```

规则：

- 接受 `http://` 或 `https://`，必须包含有效主机；端口和子路径允许存在。
- 保存前去除首尾空格并统一补齐末尾 `/`；不自动把 HTTP 改成 HTTPS。
- 地址未变化时直接返回，不清除会话。
- 地址变化后保存到 DataStore，取消全部在途请求，清空内存业务缓存、Token 和当前用户摘要，然后回到登录页。
- 修改服务器不删除主题选择和已经下载的报告缓存。
- “恢复默认”只把输入框恢复为默认地址，仍需用户点击保存。
- 不新增服务端探活接口；用户保存后直接执行登录，登录响应即为最终连通性验证。

## 6. Android 技术架构

### 6.1 技术栈

```text
Kotlin
Jetpack Compose + Material 3
Navigation Compose
Hilt
Retrofit + OkHttp
Kotlinx Serialization
Kotlin Coroutines + Flow
DataStore
multiplatform-markdown-renderer M3
Vico Compose M3
```

基线：

- 单 Activity。
- `minSdk 36 / compileSdk 36 / targetSdk 36`，只支持 Android 16，不为更早系统编写兼容分支。
- Java 17。
- Release 包名 `com.liuli.app`，应用名“琉璃”。
- Debug 通过 `applicationIdSuffix = ".debug"` 使用 `com.liuli.app.debug`，应用名“琉璃 Dev”。
- Android 品牌图形使用 `docs/assets/android/liuli-web-logo.svg`；该文件必须与上游 `invest_assistant/ui/web/public/favicon.svg` 保持完全一致。
- 最终适配基准为用户当前主力手机的分辨率、系统版本和系统字体设置；模拟器只用于快速开发，不建立公众设备矩阵。

依赖统一锁定在 Gradle Version Catalog。v7.4 实际版本为 AGP `8.13.2`、Gradle `8.13`、Kotlin `1.9.24`、Compose BOM `2024.09.03`、Hilt `2.51.1`、Retrofit `2.11.0`、Markdown Renderer M3 `0.28.0`、Vico Compose M3 `1.15.0`。AGP/Gradle 升级用于完整支持 API `36.1` 的 D8 与 Lint，不改变应用技术栈。计划中的 Markdown `0.39.0` 使用 Kotlin `2.3.0`，Vico `3.2.3` 也需要升级 Kotlin/Compose 链；本轮选用已通过当前工程编译验证的兼容版本。

渲染分工：

- 只有报告阅读使用 `multiplatform-markdown-renderer-m3`；知识笔记和新闻正文使用 Compose `Text / TextField` 展示、编辑纯文本，不提供 Markdown 预览或富文本编辑。
- 折线图使用 Vico，并通过 `core/design/LiuliComponents.kt` 的 `MiniLineChart` 统一封装；后续新增柱状图和折线柱状组合图继续复用该设计层入口。
- 组合资产环形图和市场热度矩阵使用 Compose Canvas 自绘，因为它们结构简单且不属于 Vico 的笛卡尔图主能力。
- 页面不得直接依赖第三方图表颜色和排版默认值，必须映射到第 10 章的琉璃 Token。
- 选型来源：[multiplatform-markdown-renderer](https://github.com/mikepenz/multiplatform-markdown-renderer)、[Vico](https://github.com/patrykandpatrick/vico)。

### 6.2 目录

```text
invest_assistant/ui/android/
├── app/
│   └── src/main/java/com/liuli/app/
│       ├── LiuliApplication.kt
│       ├── MainActivity.kt
│       ├── navigation/
│       ├── core/
│       │   ├── network/
│       │   │   ├── ApiClient.kt
│       │   │   ├── ApiSession.kt
│       │   │   ├── ApiService.kt
│       │   │   ├── BusinessDtos.kt
│       │   │   └── ServerEndpoint.kt
│       │   ├── design/
│       │   └── common/
│       └── feature/
│           ├── login/
│           ├── dashboard/
│           ├── notes/
│           ├── news/
│           ├── alerts/
│           ├── reports/
│           └── settings/
├── build.gradle.kts
├── settings.gradle.kts
└── gradle/
```

看板 feature 使用 `Screen / ViewModel / Repository` 分层；其余首版页面保持模块化 Screen，并消费强类型 DTO。Android 不建立本地业务数据库；后续复杂状态增长时再按同一模式拆出各自 ViewModel，不为个人客户端预建空接口层。

### 6.3 状态管理

统一页面状态：

```kotlin
sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class Content<T>(val data: T, val refreshing: Boolean = false) : UiState<T>
    data class Empty(val message: String) : UiState<Nothing>
    data class Error(val message: String, val canRetry: Boolean = true) : UiState<Nothing>
}
```

规则：

- 首次加载使用骨架或居中加载。
- 有旧内容时刷新失败，继续展示旧内容并显示非阻塞错误条。
- 无旧内容且失败，显示错误状态和重试按钮。
- 空状态必须说明当前无数据，不能用示例数据填充运行页面。
- Navigation Compose 对五个根路由启用 `saveState / restoreState`；看板 Pager 保存当前 Tab，进程被回收后业务列表重新请求，不持久化整页业务响应。
- 看板进程内缓存有效期为 5 分钟；有效期内返回页面先展示缓存，用户下拉刷新始终请求服务端。
- 返回页面时先检查五分钟进程缓存；过期后由当前可见看板重新加载，用户点击刷新始终请求服务端。
- 服务端时间统一按 ISO 8601 解析为 `Instant`，展示时转换为设备当前时区；无法解析的时间显示 `--`，不导致整页失败。
- 全局连接状态只区分 `Online / Offline / Checking`；它用于今日卡片的轻量状态提示，不替代每个页面自己的加载和错误状态。
- 离线状态不禁止进入路由：有 Token 时允许浏览 App 壳层和本进程缓存，所有远程操作在触发时给出明确失败提示。

### 6.4 网络与鉴权

- `BuildConfig.DEFAULT_SERVER_URL` 固定为 `http://115.29.176.240:5173/`；DataStore 中存在用户配置时优先使用用户配置。
- `AppPreferences` 负责服务器地址、Token 和主题的 DataStore 持久化；`ServerEndpoint` 负责 URL 规范化。
- `ApiSession` 以 `server + token` 作为实例键；地址或 Token 变化时清空进程业务缓存并重建 Retrofit/OkHttp 实例，下一次请求立即使用新配置。
- 登录调用 `/api/auth/login`，保存 `access_token`；当前后端固定使用 Bearer，因此不单独持久化 `token_type`。
- OkHttp Auth Interceptor 添加 `Authorization: Bearer <token>`。
- 启动时本地有 Token 就先进入 App，再异步调用 `/api/auth/me` 校验登录态；网络失败不清除 Token，只有明确 401 才清除。
- 连接超时 `10s`、读取超时 `30s`、写入超时 `30s`；报告正文成功后写入应用缓存，通过 `FileProvider` 只读打开。
- 首版不做隐式网络重试；GET、POST、PUT 和状态变更失败保留当前页面或输入面板，由用户明确点击刷新/重试，避免个人投资操作产生不可见的重复请求。
- 提交按钮在请求完成前禁用；笔记 POST 超时按“结果未知”处理，当前输入面板暂时保留正文并提示用户先刷新列表再决定是否重试；关闭面板后不做本地持久化。
- 任意带 Token 请求返回 401：`ApiSession` 通过原子门控只发送一次失效事件，根页面清除 Token 并进入登录页；并发 401 不重复处理。
- 400/422 显示服务端可读错误，404 使用页面级不存在状态，500/502/503/504 统一提示服务暂时不可用，网络断开和超时分别提示并允许重试。
- 不保存 Cookie，不在日志中输出密码和完整 Token。
- 允许 HTTP 和 HTTPS 服务器地址；当前个人服务器使用 HTTP 明文连接。此选择只服务个人部署，不增加证书或协议升级逻辑。
- 不做证书锁定、双向 TLS、设备绑定或 Token 二次加密；Token 保存于应用私有 DataStore，满足个人设备使用即可。

### 6.5 构建与安装

- 只保留 `debug` 和 `release` 两种 Build Type，不建设渠道包、公众测试轨道和远程配置。
- `debug` 使用 `applicationIdSuffix = ".debug"` 和“琉璃 Dev”，`release` 使用 `com.liuli.app` 和“琉璃”；两者拥有独立 DataStore、Token 和缓存，可同时安装且互不覆盖。
- `DEFAULT_SERVER_URL` 写入 BuildConfig，值为 `http://115.29.176.240:5173/`；它只是首次启动和“恢复默认”的值，运行时使用 DataStore 保存的服务器地址。
- `versionName` 使用 `major.minor.patch`，`versionCode` 单调递增；APK 命名为 `liuli-{versionName}-release.apk`。
- Release 开启 R8 和资源压缩，只保留 Retrofit/Kotlinx Serialization/Hilt 所需规则；禁止输出 HTTP Body、密码和完整 Token。
- 使用用户本人长期保存的一套签名密钥进行侧载安装，不规划应用商店签名、密钥轮换服务或多渠道签名。
- Manifest 首版只申请 `INTERNET`；设置 `android:usesCleartextTraffic="true"` 以支持当前 HTTP 服务器和用户后续填写的 HTTP 地址。不申请通知、定位、通讯录、相机、存储等无关权限。报告通过系统选择器和 `FileProvider` 打开，不申请广泛存储权限。

## 7. 本地数据

Android v7.4 不建立 Room 或其他本地业务数据库，不保存笔记草稿、服务端列表副本或离线操作队列。需要长期保留的笔记必须由用户点击发送并成功写入服务端。

DataStore 保存：

- Token。
- 当前服务器地址；不存在时回退 `BuildConfig.DEFAULT_SERVER_URL`。
- 主题模式。
- 当前用户摘要。

看板、记录、新闻、报告和预警只做进程内状态或缓存；无网络时可保留本次进程已经加载的数据。冷启动离线时允许进入完整 App 壳层，但不承诺恢复上一次进程的业务内容。

清除规则：

- 主动退出或 401 只清除 Token 和当前用户摘要，不清除主题和报告缓存。
- 修改服务器地址额外清空内存业务缓存并保留新的服务器地址；不清除主题和报告文件缓存。
- 设置页只提供“清理报告缓存”，没有草稿管理入口。
- 卸载应用或系统“清除数据”会删除 DataStore 和报告缓存；服务端笔记不受影响。

## 8. 现有 API 映射

| 页面/能力 | 现有 API |
|---|---|
| 登录 | `POST /api/auth/login` |
| 退出 | `POST /api/auth/logout`；客户端同时清除本地 Token |
| 当前用户 | `GET /api/auth/me` |
| 修改密码 | `POST /api/auth/change-password` |
| 今日重要信息 | `GET /api/market-radar/source-items?important_only=true&limit=3` |
| 今日未读预警 | `GET /api/alerts/events/stats`、`GET /api/alerts/events` |
| 今日最新报告 | `GET /api/reports?limit=3` |
| 今日最近笔记 | `GET /api/knowledge/notes?limit=3` |
| 市场统计 | `GET /api/market-radar/overview`、`GET /api/market-radar/source-items/daily-stats` |
| 市场排行 | `GET /api/market-radar/rankings?type={type}&window={window}`；`type` 必填，`window` 默认 `24h` |
| 市场热词统计 | `GET /api/market-radar/hotwords/stats` |
| 赛道看板 | `GET /api/track-discovery/dashboard` |
| 赛道详情 | `GET /api/track-discovery/tracks/{id}/detail` |
| 标的看板 | `GET /api/stock-analysis/dashboard` |
| 标的详情 | `GET /api/stock-analysis/stocks/{id}/detail` |
| 组合看板 | `GET /api/portfolios/overview`、`GET /api/portfolios/value-snapshots` |
| 组合选择 | `GET /api/portfolios` |
| 组合详情 | `GET /api/portfolios/{id}`、`GET /api/portfolios/{id}/dashboard`；价值曲线继续使用 `GET /api/portfolios/value-snapshots?portfolio_id={id}` |
| 笔记列表/详情 | `GET /api/knowledge/notes`、`GET /api/knowledge/notes/{id}` |
| 笔记分组 | `GET /api/knowledge/note-groups`、`POST /api/knowledge/note-groups`、`PUT /api/knowledge/note-groups/{id}` |
| 笔记标签选择 | `GET /api/market-radar/tags`；笔记关系仍由知识库 API 读写 |
| 笔记新增/更新 | `POST /api/knowledge/notes`、`PUT /api/knowledge/notes/{id}` |
| 笔记归档/恢复 | `POST /api/knowledge/notes/{id}/archive`、`POST /api/knowledge/notes/{id}/restore` |
| 新闻列表/详情 | `GET /api/market-radar/source-items`、`GET /api/market-radar/source-items/{id}` |
| 报告列表/详情 | `GET /api/reports`、`GET /api/reports/{id}` |
| 报告正文/下载 | `GET /api/reports/{id}/content`、`GET /api/reports/{id}/download` |
| 预警统计/列表 | `GET /api/alerts/events/stats`、`GET /api/alerts/events` |
| 预警规则目标映射 | `GET /api/alerts/rules` |
| 预警详情 | `GET /api/alerts/events/{id}` |
| 已读/全部已读 | `POST /api/alerts/events/{id}/read`、`POST /api/alerts/events/read-all` |
| 已处理 | `POST /api/alerts/events/{id}/handle` |

Android 不调用 `/api/console/*`、Job API 或 MCP。

## 9. 现有接口约束下的能力边界

### 9.1 信息流

- 只读取现有 `SourceItemRead.source_tags`。
- `source_tags[].tag` 统一作为命中标签展示和 `tag_id` 筛选入口。
- 不增加 `related_stocks` 或 `related_tracks` 响应字段。
- 不在 Android 端通过多接口拼接推导标的或赛道，避免错误表达业务绑定。
- 只有现有 `related_type / related_id` 明确指向对象时，详情页才显示原始对象入口。
- v7.4 新闻详情只展示现有 `related_type / related_id` 文本，不猜测或打开尚未接入的移动详情路由。

列表只使用当前已有查询参数：

```text
limit / offset / q / source_name / source_type / important_only / tag_id
```

`important_only` 是现有 service 基于关键词构造的服务端过滤条件，`SourceItemRead` 中不存在 `is_important` 字段。Android 只传查询参数，不保存或读取不存在的重要标志字段。

### 9.2 报告

- 只使用现有 `GET /api/reports` 的 `limit`、`offset` 和 `report_kind`。
- `report_kind` 只使用当前允许的 `market / track / stock`。
- 不增加关键词、来源模块、目标类型或目标 ID 查询参数。
- 报告正文和下载继续使用现有 `/content` 与 `/download`。

### 9.3 预警处理记录

`POST /api/alerts/events/{id}/handle` 保持无请求体。处理判断通过现有 `POST /api/knowledge/notes` 单独保存，不修改 `alert_event` 表或 API。

`GET /api/alerts/events` 只有 `limit / offset`，没有状态、级别或目标筛选。第一版按时间展示全部事件，通过样式区分 unread、read、handled；不在分页结果上做会造成统计失真的客户端筛选。

### 9.4 知识笔记

`GET /api/knowledge/notes` 只使用当前参数：

```text
status / group_id / tag_id / q / limit / offset
```

`note_type` 是服务端兼容字段，但不是列表查询参数。Android v7.4 创建和更新短笔记时写空值，不展示也不筛选该字段。

分组切换和编辑只使用现有 `note-groups` 列表、新增和更新接口；Android 不新增移动端分组模型。列表按 `group_id` 请求服务端，快速输入面板将当前分组写入现有 `KnowledgeNoteCreate.group_id`。

笔记正文和分组编辑使用现有 `PUT /api/knowledge/notes/{id}`；更新时保留当前关联字段、状态和已有 `tag_ids`，不引入本地版本或冲突接口。

### 9.5 看板数据

- 今日看板并发调用现有业务接口，不新增移动端聚合接口。
- 单个接口失败只降级对应卡片。
- Android 不调用 Console、Job 或 MCP 接口弥补数据缺口。

### 9.6 报告入口

- 今日看板：`GET /api/reports?limit=3`。
- 市场看板：进入 `report_kind=market` 的报告列表。
- 赛道看板：进入 `report_kind=track` 的报告列表。
- 标的看板：进入 `report_kind=stock` 的报告列表。
- 组合看板：不显示报告入口，因为当前 `report_kind` 不支持 portfolio。
- 不按 `target_id` 声称报告与某个标的或赛道存在可靠绑定。

## 10. Android UI 规范

### 10.1 设计定位与参考边界

Android 端形成独立的琉璃移动 UI，不机械复制 Web，也不复刻 GitHub Mobile。视觉气质参考 GitHub Primer：中性背景、克制的层级、细边框、清晰状态和高信息密度；交互和组件实现遵循 Android Compose / Material 3 习惯。

规则：

- Primer 只作为颜色组织、层级、可访问性和密度参考，不引入 Primer React 组件或 Web CSS。
- 琉璃 Logo、蓝色品牌主色、A 股涨跌色、业务状态和信息架构保持自身语义。
- 页面优先依靠背景层级、`1dp` 边框和间距区分结构，不依靠大阴影、装饰渐变或多层嵌套卡片。
- 功能页面只能消费语义 Token，禁止直接使用基础色值；基础色仅能在设计系统模块中用于构造语义 Token。
- 同一语义在浅色、深色和跟随系统模式下保持一致，不以简单反色代替深色设计。

官方参考：

- [Primer Color usage](https://primer.style/product/getting-started/foundations/color-usage/)：基础、功能和组件 Token 的分层，以及 neutral、accent、success、attention、danger、done 等语义角色。
- [Primer Primitives](https://github.com/primer/primitives)：浅色、深色、排版和间距原语的组织方式。
- [Primer Accessibility Foundations](https://primer.style/accessibility/foundations/accessibility-fundamentals/)：WCAG 2.2 AA、对比度、非纯颜色表达和辅助技术要求。

### 10.2 Logo 复用

Web 当前在 `AppLayout.tsx` 中直接使用 `/favicon.svg`。为让 Android Spec 和后续工程使用稳定的同目录资产，Web Logo 已原样镜像为：

```text
docs/assets/android/liuli-web-logo.svg
```

其上游原文件和已确认的 Android Launcher Icon 视觉参考图分别为：

```text
invest_assistant/ui/web/public/favicon.svg
docs/assets/android/android-launcher-icon-v1.png
```

`liuli-web-logo.svg` 必须是上游 `favicon.svg` 的逐字节副本。该 PNG 用于后续 Android 工程的桌面效果和安全区参考；正式 adaptive icon 仍应从 `docs/assets/android/liuli-web-logo.svg` 拆分或确定性生成 foreground/background 资源，不能用单张带底色 PNG 代替所有密度和蒙版资源。

规则：

- 不重新绘制 Android 专用 Logo，不使用文字“琉”代替正式 Logo。
- 保留 SVG 的 `64 × 64 viewBox`、六边形路径、三条白色结构线、蓝色渐变和透明背景。
- Android 工程创建时，通过 Android Studio SVG Import 或等价的确定性转换生成 `res/drawable/liuli_logo.xml`；生成后不得独立手改图形路径和颜色。
- Launcher adaptive icon 的 foreground、登录页和“我的-关于”共用该生成资源。
- Web Logo 发生变化时，先用新的 `favicon.svg` 覆盖同步 `docs/assets/android/liuli-web-logo.svg`，校验两者哈希一致后再重新生成 Android 资源，禁止两端分别维护。
- Logo 本体在浅色和深色模式下保持原始蓝白配色，不做主题 tint；只允许外围容器背景和描边随主题变化。

### 10.3 第一版主题模式

第一版必须同时实现：

```kotlin
enum class ThemeMode {
    LIGHT,
    DARK,
    SYSTEM,
}
```

行为：

- 首次启动默认 `SYSTEM`。
- 用户选择保存到 DataStore，应用重启后恢复。
- `SYSTEM` 监听系统深浅色变化并实时更新，不要求重启 Activity。
- 设置页可切换浅色、深色、跟随系统。
- 状态栏、导航栏及其图标明暗随 resolved theme 更新。
- Compose 页面、Dialog、BottomSheet、输入框、骨架屏、空状态、错误状态、报告 Markdown 阅读器和图表全部使用主题 Token，业务 feature 不写死页面背景与正文颜色。
- 主题切换不得清空页面状态、看板分页位置、新闻滚动位置或当前仍打开的快速输入文本。
- v1 浅色原型不构成深色延期依据；深色不可读、突兀白块或图表反色均属于第一版阻断问题。

### 10.4 色彩系统

#### 10.4.1 功能 Token

| Token | 浅色 | 深色 | 用途 |
|---|---:|---:|---|
| `canvas` | `#FFFFFF` | `#111820` | 卡片、输入框和主要面板 |
| `canvasSubtle` | `#F3F6FA` | `#0D141C` | 页面背景、列表分组 |
| `canvasInset` | `#F8FAFC` | `#18212B` | 内嵌区、代码块、图表底层 |
| `borderDefault` | `#E2E8F0` | `#2B3745` | 卡片、输入框、分隔线 |
| `borderMuted` | `#EEF2F7` | `#202B37` | 弱分隔线 |
| `fgDefault` | `#0F172A` | `#F1F5F9` | 主要文字 |
| `fgMuted` | `#64748B` | `#94A3B8` | 辅助文字、图标 |
| `accent` | `#2563EB` | `#60A5FA` | 品牌、主操作、选中状态 |
| `accentMuted` | `#EFF6FF` | `#172A46` | 选中轻背景、信息提示 |
| `success` | `#059669` | `#34D399` | 成功、健康、完成 |
| `successMuted` | `#ECFDF5` | `#13342C` | 成功轻背景 |
| `attention` | `#EA580C` | `#FB923C` | 警告、待处理 |
| `attentionMuted` | `#FFF7ED` | `#3B2418` | 警告轻背景 |
| `danger` | `#DC2626` | `#F87171` | 错误、危险操作、高等级预警 |
| `dangerMuted` | `#FFF1F2` | `#3B1C24` | 错误轻背景 |
| `done` | `#2563EB` | `#60A5FA` | 已归档、完成态；与品牌蓝统一 |
| `doneMuted` | `#EFF6FF` | `#172A46` | 完成态轻背景 |

#### 10.4.2 业务语义 Token

- A 股行情固定为 `marketUp = danger`、`marketDown = success`、`marketFlat = fgMuted`，即涨红跌绿；不得直接把通用“正向/负向”颜色套到行情方向。
- 预警等级固定为高 `danger`、中 `attention`、低 `accent`，并同时显示等级文字或图标。
- 成功、排队中、失败、已完成分别使用 `success / attention / danger / done`，同时保留明确文本。
- 普通控件只使用白、灰、蓝、黑，Material `secondary / tertiary` 和完成态均映射到品牌蓝，禁止出现默认紫色。
- 未读通过字重、标记和语义说明共同表达；草稿通过“草稿”文字与图标表达；颜色不得成为唯一信息载体。
- 图表系列色从受控的主题调色板取值；涨跌、基准、选中和告警色不得在不同图表中交换语义。

### 10.5 排版

- 使用 Android 系统字体栈：拉丁字符采用 Roboto，中文采用设备系统 CJK 字体；首版不内置自定义字体。
- AppBar 标题：`18sp / 700`；页面区块标题：`13sp / 800`；卡片标题：`12–13sp / 600`。
- 正文：`12–13sp / 18–19sp`；辅助文字：`10.5sp / 16sp`；短标签与图表轴标签为 `8–10sp`。
- 核心指标：`19–25sp / 800`，数字使用等宽数字特性时不得影响中文回退字体。
- 按用户主力手机当前字体和显示大小验收；布局仍避免明显的固定高度裁切，但不为超大字体建立额外适配分支。
- 层级优先通过字号、字重和间距建立，避免大面积彩色标题或全大写英文。

### 10.6 间距、尺寸与安全区

- 采用 `4dp` 基础网格，标准间距为 `4 / 8 / 12 / 16 / 20 / 24 / 32dp`。
- 页面左右内容间距统一为 `12dp`；登录页表单使用 `24dp`，详情正文可按内容使用 `12–16dp`。
- 页面区块间距为 `8–12dp`，同组元素为 `4–8dp`；依靠分组标题和卡片边界保持层级。
- AppBar 内容高度 `48dp`；底部导航内容高度约 `56dp`，并额外消费系统导航安全区。
- 可点击目标最小 `48 × 48dp`；紧凑图标可保持 `20–24dp` 视觉尺寸，但点击区域不能缩小。
- 页面必须处理状态栏、导航栏、显示挖孔和横屏 inset，不以固定设备高度定位底部操作。
- 第一版只正式支持手机竖屏；横屏保持不崩溃即可，不单独设计横屏、平板或折叠屏布局。

### 10.7 圆角、边框与层级

- 小组件圆角 `5–8dp`，输入框 `11dp`，普通卡片 `10dp`，Dialog、BottomSheet 和大容器 `12dp`。
- 胶囊形只用于短状态、筛选 Chip 和数量 Badge，不用于顶部看板 Tab。
- 卡片和输入框使用 `1dp borderDefault`；弱分组使用 `borderMuted`。
- 普通卡片默认无投影。阴影只用于 Dialog、BottomSheet、浮动按钮和确有遮挡关系的浮层。
- 禁止在卡片内部继续堆叠同等视觉权重的卡片；优先使用分区标题和分隔线。

### 10.8 核心组件规范

- **AppBar**：只用于二级详情、编辑器、报告阅读和服务器设置；左侧返回，中间标题，右侧最多两个高频动作。五个根页面不显示重复模块标题栏。
- **看板分页**：`HorizontalPager` 与顶部可横向滚动 Tab 同步；选中项使用 `accent` 文字和 `2dp` 下划线，不使用胶囊选中块。
- **底部导航**：始终五项；图标、文字和选中状态同时变化；第五项固定为“我的”，报告不得占用底部入口。
- **卡片与列表**：标题、核心值、辅助信息、动作按固定层级排列；整行可点击时不再放含义相同的箭头按钮。
- **按钮**：主按钮使用 `accent` 实底，次按钮使用透明底加边框，危险按钮使用 `danger`；同一区域最多一个主按钮。
- **标签与筛选**：业务标签使用中性或轻语义背景；可交互筛选必须有选中、按下、禁用和清除状态。
- **输入框**：常驻可见 Label；错误信息放在字段下方并说明修复方式；仅占位符不能替代 Label。
- **状态反馈**：首屏使用骨架屏，局部刷新保留旧内容并显示轻量进度；空状态说明原因和下一步；错误状态提供明确重试动作。
- **新闻时间线**：日期吸顶、节点、时间、来源、标签和关联对象保持纵向扫描节奏；未读不能只靠节点颜色区分。
- **报告 Markdown 阅读器**：标题、正文、引用、列表、表格、代码块和链接全部使用主题 Token；宽表允许横向滚动，正文不整体横滚。知识笔记和新闻不得调用该组件。
- **图表**：背景透明或使用 `canvas`，网格线使用 `borderMuted`，轴文字使用 `fgMuted`；点击数据点应提供文本值，不能只显示颜色图例。

### 10.9 动效与反馈

- 按压、颜色和小范围展开反馈为约 `150ms`；状态切换和分页反馈为 `200–250ms`；浮层进入退出不超过 `300ms`。
- 不使用装饰性循环动画、夸张视差或大面积渐变动画。
- 刷新、提交和重试必须有进行中状态，避免重复触发；操作完成后优先局部更新，不闪回页面顶部。
- 尊重系统动画缩放与减少动态效果设置；动画被关闭时功能和状态表达仍完整。

### 10.10 个人可读性

- 不做正式 WCAG 认证、TalkBack 专项适配和超大字体矩阵；只按用户本人的视力、系统字体设置和主力手机验收。
- 正文、关键指标、涨跌、预警和按钮在浅色、深色下必须清楚可读，避免低对比灰字和仅靠颜色区分状态。
- 表单保留可见 Label 和明确错误文案；软键盘不得遮挡当前字段或提交操作。
- 可点击目标原则上保持 `48 × 48dp`，这是个人高频操作的易用性要求，不作为全设备兼容认证。
- 图表提供数值 Tooltip 或摘要，确保个人复盘时能读取准确数值。

### 10.11 Compose 设计系统落地

Android 工程建立单一设计系统入口：

```text
core/design/
├── LiuliTheme.kt
├── LiuliTokens.kt
├── LiuliComponents.kt
└── ThemeMode.kt
```

- `LiuliTheme` 根据 resolved theme 创建 Material `ColorScheme`，并通过 `CompositionLocal` 暴露 Material 未覆盖的业务语义色和间距。
- 原始色值只允许出现在 `LiuliTokens.kt`；feature 只能引用 `MaterialTheme`、`LocalLiuliColors` 或明确的品牌白色。
- `LiuliTheme`、`LiuliTokens` 和 `LiuliComponents` 是统一视觉入口；页面不得复制一套局部规范。
- 复用 Material 3 的语义、状态和无障碍行为，再用琉璃 Token 调整外观；不自行重写基础点击、焦点或输入行为。
- Preview 与截图测试必须分别渲染 light、dark；`SYSTEM` 只负责解析后复用其中一套，不维护第三套颜色。
- 深色模式避免大面积纯黑，页面使用 `#0D141C`、卡片使用 `#111820`；禁止硬编码白色卡片、黑色正文或给 Logo 加 tint。

## 11. 测试策略

### 11.1 Android 单元测试

- 登录成功、失败、Token 失效。
- 构建配置验证 Release 为 `com.liuli.app`、Debug 为 `com.liuli.app.debug`，两者应用名和数据目录互不混用。
- 启动时有 Token 先进入 App、异步 `/me` 成功更新用户、网络失败保留离线会话、401 返回登录页。
- 服务器地址去空格、scheme/host 校验、端口和子路径保留、末尾 `/` 补齐及恢复默认。
- 修改服务器后取消请求、清除旧 Token/用户/内存缓存，同时保留主题和报告缓存。
- `LIGHT / DARK / SYSTEM` 解析、DataStore 恢复和系统主题变化。
- 浅色与深色功能 Token、业务语义 Token 和 Material `ColorScheme` 映射正确。
- A 股涨红跌绿、预警等级和通用成功/失败状态不发生语义混用。
- 看板首次可见懒加载和重复进入不重复请求。
- 5 分钟缓存、前后台刷新，以及 ISO 8601 / `MM/dd/yyyy HH:mm:ss` 时间转换。
- 新闻 20 条分页、筛选取消、翻页筛选快照和刷新保留旧内容。
- 笔记 `#标签` 提取去重、分组 DTO 解析、分组筛选参数和快速提交请求字段。
- 并发 401 只触发一次会话清理，所有失败请求只允许用户手动重试。
- 预警已读和处理状态更新。
- 预警规则列表对 `rule_id` 的目标映射，以及规则缺失时隐藏跳转入口。

### 11.2 网络契约测试

使用 MockWebServer 覆盖：

- Bearer Header。
- `ServerEndpoint` 对 HTTP/HTTPS、端口和 base path 的地址规范化，以及 `ApiSession` 在配置变化后重建客户端。
- `Page<T>` 的 `items/total/limit/offset/has_more`。
- 401、404、422、500、超时和非 JSON 错误。
- 401 单次失效事件，以及笔记 POST 超时后的“结果未知”提示。
- 信息流 `source_tags` 缺失时按空列表处理，不读取不存在的关联实体字段。
- 报告正文纯文本和下载文件响应。
- 组合列表、组合详情、组合 dashboard 和带 `portfolio_id` 的价值快照。

### 11.3 短笔记单元测试

- `#标签` 从正文提取、去重且无标签时不发送 `tags`。
- 笔记响应正确解析 `group_id / group / tags_text / tags`。
- 分组列表、新增和重命名请求只使用现有接口字段。
- 笔记编辑使用现有 PUT 路径，并保留分组、关联字段、状态和已有标签 ID。
- 快速输入未填写正文时发送按钮禁用，提交中不可重复触发。

### 11.4 Compose UI 测试

- 底栏只存在看板、记录、新闻、预警、我的五项。
- 记录页不显示常驻大搜索框、类型筛选、“知识笔记”标题、本地草稿区或列表外层大框架。
- 当前分组可切换，分组可新增和重命名；快速输入面板可选择分组并直接提交服务端。
- 笔记详情可打开纯文本编辑面板，保存后更新详情与列表。
- 看板存在五个横向分页且点击与滑动同步。
- 报告只能作为二级页面进入，且只出现 market、track、stock 三类筛选。
- 新闻、报告和预警均能进入关联笔记编辑器。
- “我的”根页可以修改主题、服务器和密码，清理报告缓存并退出登录。
- 登录页和已登录设置页均能进入服务器设置；无网络时服务器设置仍可保存，保存后回到登录页。
- 有 Token 的冷启动断网场景进入完整 App 壳层，远程页面显示离线状态；快速输入提交失败时当前面板保留内容。
- 赛道、标的和组合简版详情能从对应看板进入并正确返回原位置。
- 加载、空、失败、缓存内容加错误条四类状态可见。
- 浅色、深色两套 Compose 截图测试覆盖登录、五个看板、笔记、新闻、预警、报告和设置；跟随系统分别在 light/dark 系统配置下复用同一断言。
- 核心组件截图矩阵覆盖二级 AppBar、底部导航、Tab、卡片、按钮、输入框、标签、骨架屏、空状态、错误重试、时间线、报告 Markdown 和图表。
- 报告 Markdown 的标题、列表、引用、代码块、表格和链接在 `multiplatform-markdown-renderer-m3` 下使用琉璃主题；知识笔记和新闻保持纯文本；Vico 折线/柱状/组合图及 Canvas 环形图/热度矩阵颜色语义一致。
- 主题切换前后页面状态和滚动位置保持不变。
- 登录页、“我的-关于”和 Launcher 使用由 `docs/assets/android/liuli-web-logo.svg` 生成的同一 Logo 资源，且两种主题下不被 tint。
- 在用户主力手机当前字体和显示大小下检查文字、图表、表单和 `48 × 48dp` 高频操作区域，不建立额外设备和无障碍矩阵。
- 静态扫描或架构测试禁止 feature 直接声明原始颜色，原始色值仅存在于设计系统模块。

### 11.5 主力真机验证

- 只在用户的 Android 16 / API 36 小米 17 完成正式验收，模拟器使用 API 36 镜像进行开发过程检查。
- 覆盖默认地址 `http://115.29.176.240:5173/` 登录、冷启动、前后台切换、进程回收、断网进入、修改服务器后重新登录、主题切换、短笔记提交/分组切换和报告下载与系统应用打开。
- 覆盖小米 17 实际使用的浅色/深色、字体大小、显示大小和手势导航。
- 不建立 Android 旧版本、平板、折叠屏、多厂商或应用商店兼容测试矩阵。

### 11.6 后端验证

- Android 契约测试直接基于当前路由和 Schema，不建立移动端扩展响应。
- 报告只验证现有 `report_kind`、分页、正文和下载行为。
- 既有 Web 调用和全部后端接口保持不变。
- 后端测试必须使用隔离数据库；执行任何清表、重建或删除类测试前，仍需按仓库约束取得用户当轮明确批准。

### 11.7 v7.4 当前验证记录（2026-07-19）

- `testDebugUnitTest`：23 项通过，0 失败；覆盖设计尺寸、主题、服务器 URL、强类型 DTO、Bearer Header、503、401 单次失效、五分钟缓存、双格式时间解析、笔记分组/标签契约、笔记 PUT 更新路径、短笔记标签提取、五导航/五看板模型和网络底层错误中文化。
- `lintDebug`：通过，0 error、26 warning；保留项为依赖版本提示、Compose 参数顺序和 minSdk 36 下 adaptive icon 目录提示，不阻断个人 Debug 包。
- `assembleDebug`：通过；包名 `com.liuli.app.debug`，版本 `0.1.0-debug`，`minSdk / targetSdk / compileSdk = 36`。
- Debug APK：`invest_assistant/ui/android/app/build/outputs/apk/debug/app-debug.apk`；SHA256 `162047D82B3DBAFABFF0F956952F2CC13B7CC1CD6D43D73510A800B3CFCCF2E5`。
- 本轮没有运行数据库测试、清表脚本或直接数据库命令；模拟器通过既有 REST POST 完成一次新闻关联笔记链路验收，生成笔记 `#29`。
- API 36.1 模拟器已通过 WHPX 硬件加速启动；最终 Debug APK 覆盖安装并保留登录状态。笔记字号/标签、详情编辑面板、新闻日期时间轴、20 条首屏、新闻详情和详情隐藏底栏均使用真实服务端数据完成视觉与交互检查，应用崩溃/ANR 为 0。
- 修复前日志显示新闻第一页在响应后重复请求；修复后进入新闻页只发送一次 `limit=20&offset=0` 请求，模拟器实测 HTTP 200 约 `1.0s` 返回。
- 笔记当前版本不再使用 Room 或本地草稿；输入内容只在快速输入面板存活期间保留，提交时调用既有笔记接口。
- 模拟器网络曾出现 OkHttp `unexpected end of stream`，服务端恢复后重试加载成功；最终客户端已将 IOException、超时和 HTTP 错误映射为中文提示，不向界面暴露传输层英文。
- 小米 17 真机触控、挖孔和 HyperOS 桌面图标蒙版仍需连接设备后完成最终验收。

## 12. 验收标准

1. 底部只出现看板、记录、新闻、预警、我的；报告不占底部入口。
2. 看板可在今日、市场、赛道、标的、组合之间点击或滑动切换。
3. 报告可从今日、市场、赛道和标的看板进入，但不占底部入口。
4. 知识笔记可独立管理，并能从新闻、报告和预警带上下文创建。
5. 快速输入提交失败时当前面板保留内容并允许重试；关闭面板或进程回收后不承诺保留未提交文本。
6. 新闻保留日期吸顶、时间轴、服务端筛选和刷新失败保留已有内容。
7. 预警只做应用内刷新，不产生后台通知。
8. 所有页面提供明确的加载、空、失败和重试状态。
9. Android 只调用受鉴权 REST API，不读取数据库、服务端文件目录或 MCP。
10. 第一版不新增或修改任何后端接口、参数、响应字段和业务行为。
11. 登录页、“我的-关于”和 Launcher 复用 `docs/assets/android/liuli-web-logo.svg` 的图形，不出现临时文字 Logo 或另一套品牌图形；该 SVG 与 Web 上游 `favicon.svg` 保持一致。
12. 浅色、深色、跟随系统三种模式均可用；所有页面、图表和 Markdown 阅读器在两种 resolved theme 下可读且无突兀反色块。
13. Android UI 遵循第 10 章的语义 Token、排版、间距、圆角、组件和动效规范，feature 不直接使用原始色值。
14. 用户主力手机当前字体、显示大小和导航方式下，文字、图表、表单与关键操作清晰可用；不要求大众无障碍和多设备适配认证。
15. 设置入口、笔记时间流/详情/快速输入、赛道/标的/组合简版详情和修改密码路由完整可达，返回后恢复来源位置。
16. 并发 401、网络重试、POST 结果未知、5 分钟缓存和进程恢复按本文规则工作，不造成隐式重复提交。
17. PDF 等文件通过应用缓存和 `FileProvider` 打开，不申请广泛存储权限；缓存可以从设置页手动清理。
18. 默认服务器为 `http://115.29.176.240:5173/`；登录页和设置页可修改，修改后旧服务器 Token 与内存缓存清除，并要求重新登录。
19. 已有 Token 时断网冷启动可以进入完整 App 壳层；远程页面明确显示离线状态，网络失败不误清 Token。
20. Release APK 在 Android 16 / API 36 小米 17 上完成默认 HTTP 服务器、手势导航和个人投资主流程验收；不要求更早 Android、应用商店、平板或多厂商兼容。
21. Release 与 Debug 分别使用 `com.liuli.app` 和 `com.liuli.app.debug`，可以同时安装且本地数据完全隔离。
22. 报告 Markdown、Vico 和 Compose Canvas 按第 6.1 节分工渲染；知识笔记和新闻为纯文本；所有颜色、排版和交互映射到琉璃设计 Token。

## 13. 后续实施阶段

1. Android 工程、主题、导航、鉴权和网络底座。
2. 五个看板及简版对象详情。
3. Flomo 式短笔记时间流、快速输入和分组切换/编辑。
4. 新闻时间线、现有条件筛选和详情。
5. 预警列表、详情、状态操作和关联记录。
6. 现有报告分类筛选、Markdown 阅读和 PDF 外部打开。
7. 完整测试、Release 签名、公网联调和 APK 交付。
