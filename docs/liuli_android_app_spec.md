# 琉璃 Android App 技术规格

> 首次制定：2026-07-10  
> 最后更新：2026-07-11  
> 当前版本：v6
> 状态：第一版实现基线  
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

- 能理解服务端、客户端缓存、分页、同步时间、HTTP 错误和本地草稿等技术概念。
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
- 多账号切换、账号间草稿隔离、访客模式和组织权限。
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

底部导航固定为四项：

```text
看板｜记录｜新闻｜预警
```

规则：

- 登录后默认进入“看板”。
- 底部导航只承载高频顶级目的地。
- 报告不是第五个底部模块。
- 设置通过顶部用户入口进入。
- 二级页面保留当前底部模块上下文；全屏编辑器和报告阅读器可隐藏底栏。

### 4.2 看板分页

看板内部使用顶部横向标签和左右滑动分页：

```text
今日｜市场｜赛道｜标的｜组合
```

实现使用 `ScrollableTabRow + HorizontalPager`：

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
/reports
/reports/{reportId}
/tracks/{trackId}
/stocks/{stockId}
/portfolios/{portfolioId}
/settings
/settings/change-password
/settings/server
```

返回规则：

- 二级详情返回时恢复来源页面、筛选条件和列表位置。
- 从新闻、报告或预警打开笔记编辑器，返回时回到原对象详情。
- Token 失效时清空受保护页面栈并进入 `/login`。
- 看板 AppBar 右侧固定提供账户按钮，打开包含“设置 / 修改密码 / 退出登录”的菜单；设置不占底部导航。
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
3. `/api/auth/me` 成功时更新用户摘要；返回 401 时清除旧登录态并进入登录页；断网、超时或 5xx 时保留登录态和当前页面，顶部显示离线状态。
4. 本地没有 Token 时进入登录页；登录页和服务器设置始终可离线打开。
5. 离线进入主壳层时，Room 草稿可查看和编辑；需要服务端的看板、新闻、报告和预警显示离线空状态或本进程已有缓存，不伪造数据。

### 5.2 今日看板

![今日看板](prototypes/liuli-android-v1/02-dashboard-today.png)

展示：

- 快速记录入口。
- 今日重要信息数量及前三条。
- 未读预警数量及高优先级预警。
- 最新报告及“查看全部”。
- 最近知识笔记和待续本地草稿。

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

支持：搜索、分组、标签、状态筛选；查看、新增、编辑、归档和恢复。笔记类型在列表项中展示，但当前列表 API 没有 `note_type` 查询参数，因此第一版不提供类型筛选。

首版不单独维护只读笔记详情组件：`/notes/{noteId}` 加载成功后使用与编辑页相同的内容布局，默认只读，点击 AppBar“编辑”后进入 `/notes/{noteId}/edit`。新增和编辑共用同一编辑器，避免为个人使用维护两套 Markdown 展示逻辑。

类型沿用系统知识库语义：

```text
market / stock / thesis / portfolio / alert / mistake / principle
```

界面显示中文名称，不改变服务端枚举值。顶部明确展示待续本地草稿。

### 5.8 笔记编辑

![笔记编辑](prototypes/liuli-android-v1/08-note-editor.png)

字段：类型、分组、标题、关联对象、标签和 Markdown 正文。

草稿规则：

- 输入变化后 `800ms` 防抖写入 Room。
- 新笔记使用本地 UUID；编辑服务端笔记时同时保存 `server_note_id`。
- POST/PUT 成功后删除对应本地草稿。
- 网络失败或应用被系统回收时保留草稿。
- 恢复草稿时展示最后保存时间。
- 不后台自动提交；用户手动点击提交。
- 不做版本冲突检测，个人场景按最后一次手动提交覆盖。

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

继承旧 Android：

- 日期分组与日期吸顶。
- 时间轴节点。
- 标签同行展示；其中可能包含 stock 类型标签，但第一版统一按标签处理。
- 下拉刷新、分页和新增数量提示。
- 刷新后恢复阅读锚点。
- 点击标签立即走服务端筛选。

不继承旧 Android：

- Flask `/api/news-center/records`。
- Cookie Session 和 `SharedPrefsCookieJar`。
- 固定 HTTP 地址和明文流量。
- 全局深色科技蓝和强发光。
- 新闻与设置双底栏结构。

数据规则：

- 每页 `30` 条，按 `publish_time DESC, id DESC`。
- 搜索、来源、类型、`important_only` 和 `tag_id` 全部传给服务端。
- 切换筛选使用 `flatMapLatest` 或等效取消机制，旧响应不得覆盖新状态。
- 普通列表和筛选列表分别保存滚动状态。
- 每条最多展示两个命中标签；被选中的标签优先保留。
- 第一版不把命中标签推导成标的或赛道实体，不提供从信息流直接跳转标的/赛道详情。

刷新锚点算法：

1. 刷新前记录首个可见 `source_item.id`。
2. 请求第一页。
3. 在新数据中定位旧锚点并恢复位置。
4. 锚点前新增条数即“新增 N 条”。
5. 找不到锚点时回到列表顶部，不使用旧 offset 猜测位置。

### 5.10 新闻详情

![新闻详情](prototypes/liuli-android-v1/10-news-detail.png)

展示标题、来源、时间、正文、命中标签、原文链接，以及 `related_type / related_id` 已明确指向的原始业务对象。

操作：点击标签筛选信息流、打开原文、打开明确关联的原始对象、写一条关联笔记。当 `related_type=report` 时可读取该报告；不存在明确关联时不展示关联报告区域。

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

报告是二级页面，可从今日看板进入完整列表，也可从市场、赛道、标的看板进入对应 `report_kind` 列表。当信息流的现有 `related_type=report` 时，新闻详情可以直接打开该报告。组合看板和普通对象详情不提供目标对象报告入口。

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

展示当前账号、主题、当前服务器地址、本地草稿、报告缓存、修改密码、退出登录和应用版本。主题提供“浅色 / 深色 / 跟随系统”三个明确选项。

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
- 修改服务器不删除 Room 草稿、主题选择和已经下载的报告缓存。
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
Room
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

其余依赖版本在创建工程时按当时稳定且互相兼容的版本锁定到 Gradle Version Catalog。工程 README 保存 AGP、Kotlin、Compose BOM、Hilt、Room、Retrofit、Markdown、Vico 和 SDK 的版本矩阵；后续升级依赖时同步更新矩阵。Markdown 首版锁定 `com.mikepenz:multiplatform-markdown-renderer-m3:0.39.0`，Vico 首版锁定 `com.patrykandpatrick.vico:compose-m3:3.2.3`；若与最终 Compose BOM 存在已证实的二进制冲突，可选择最近兼容稳定版本并在 README 记录原因。

渲染分工：

- Markdown 阅读和预览使用 `multiplatform-markdown-renderer-m3`；编辑器继续编辑原始 Markdown 文本，不引入富文本编辑器。
- 折线图、柱状图和折线柱状组合图使用 Vico，并统一封装在 `core/design/chart/`。
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
│       │   │   ├── ServerConfigRepository.kt
│       │   │   ├── ServerUrlInterceptor.kt
│       │   │   └── ApiService.kt
│       │   ├── database/
│       │   ├── auth/
│       │   ├── model/
│       │   ├── design/
│       │   └── common/
│       └── feature/
│           ├── login/
│           ├── dashboard/
│           ├── notes/
│           ├── news/
│           ├── alerts/
│           ├── reports/
│           ├── trackdetail/
│           ├── stockdetail/
│           ├── portfoliodetail/
│           └── settings/
├── build.gradle.kts
├── settings.gradle.kts
└── gradle/
```

每个 feature 内按需要包含 `Screen / ViewModel / UiState / Repository interface`。网络 DTO 与 Room Entity 不直接暴露给 Compose。

### 6.3 状态管理

统一页面状态：

```kotlin
sealed interface LoadState<out T> {
    data object Idle : LoadState<Nothing>
    data object Loading : LoadState<Nothing>
    data class Content<T>(val value: T, val refreshing: Boolean = false) : LoadState<T>
    data class Empty(val message: String) : LoadState<Nothing>
    data class Error(val message: String, val cached: Boolean = false) : LoadState<Nothing>
}
```

规则：

- 首次加载使用骨架或居中加载。
- 有旧内容时刷新失败，继续展示旧内容并显示非阻塞错误条。
- 无旧内容且失败，显示错误状态和重试按钮。
- 空状态必须说明当前无数据，不能用示例数据填充运行页面。
- ViewModel 使用 `SavedStateHandle` 保存当前看板 Tab、详情 ID 和轻量筛选参数；进程被回收后列表重新请求，不持久化整页业务响应。
- 看板进程内缓存有效期为 5 分钟；有效期内返回页面先展示缓存，用户下拉刷新始终请求服务端。
- 应用从后台回到前台超过 5 分钟时只刷新当前可见根页面；预警仍遵守其独立的 60 秒刷新规则。
- 服务端时间统一按 ISO 8601 解析为 `Instant`，展示时转换为设备当前时区；无法解析的时间显示 `--`，不导致整页失败。
- 全局连接状态只区分 `Online / Offline / Checking`；它用于顶部状态提示，不替代每个页面自己的加载和错误状态。
- 离线状态不禁止进入路由：有 Token 时允许浏览 App 壳层和 Room 草稿，所有远程操作在触发时给出明确失败提示。

### 6.4 网络与鉴权

- `BuildConfig.DEFAULT_SERVER_URL` 固定为 `http://115.29.176.240:5173/`；DataStore 中存在用户配置时优先使用用户配置。
- `ServerConfigRepository` 负责地址读取、规范化和持久化；`ServerUrlInterceptor` 根据内存中的当前配置改写每个请求的 scheme、host、port 和 base path，使修改地址不需要重启 App。
- 保存新服务器地址时先取消 OkHttp Dispatcher 中的在途请求，再更新当前配置；下一次请求立即使用新地址。
- 登录调用 `/api/auth/login`，保存 `access_token` 和 `token_type`。
- OkHttp Auth Interceptor 添加 `Authorization: Bearer <token>`。
- 启动时本地有 Token 就先进入 App，再异步调用 `/api/auth/me` 校验登录态；网络失败不清除 Token，只有明确 401 才清除。
- 连接超时 `10s`、读取超时 `30s`、写入超时 `30s`；报告下载使用独立客户端，读取超时 `120s`。
- GET 请求只对连接失败或明确可重试的 `502 / 503 / 504` 自动重试 1 次；POST、PUT 和所有状态变更请求不自动重试，由用户手动触发。
- 提交按钮在请求完成前禁用；笔记 POST 超时按“结果未知”处理，保留本地草稿并提示用户先刷新笔记列表再决定是否重试，避免重复创建。
- 任意受保护接口返回 401：通过单例 AuthSession 只执行一次清除 Token、取消在途请求、清空受保护导航栈并进入登录页；并发 401 不重复弹窗或重复导航。
- 400/422 显示服务端可读错误，404 使用页面级不存在状态，500/502/503/504 统一提示服务暂时不可用，网络断开和超时分别提示并允许重试。
- 不保存 Cookie，不在日志中输出密码和完整 Token。
- 允许 HTTP 和 HTTPS 服务器地址；当前个人服务器使用 HTTP 明文连接。此选择只服务个人部署，不增加证书或协议升级逻辑。
- 不做证书锁定、双向 TLS、设备绑定或 Token 二次加密；Token 保存于应用私有 DataStore，满足个人设备使用即可。

### 6.5 构建与安装

- 只保留 `debug` 和 `release` 两种 Build Type，不建设渠道包、公众测试轨道和远程配置。
- `debug` 使用 `applicationIdSuffix = ".debug"` 和“琉璃 Dev”，`release` 使用 `com.liuli.app` 和“琉璃”；两者拥有独立 DataStore、Room、Token 和缓存，可同时安装且互不覆盖。
- `DEFAULT_SERVER_URL` 写入 BuildConfig，值为 `http://115.29.176.240:5173/`；它只是首次启动和“恢复默认”的值，运行时使用 DataStore 保存的服务器地址。
- `versionName` 使用 `major.minor.patch`，`versionCode` 单调递增；APK 命名为 `liuli-{versionName}-release.apk`。
- Release 开启 R8 和资源压缩，只保留 Retrofit/Kotlinx Serialization/Hilt 所需规则；禁止输出 HTTP Body、密码和完整 Token。
- 使用用户本人长期保存的一套签名密钥进行侧载安装，不规划应用商店签名、密钥轮换服务或多渠道签名。
- Manifest 首版只申请 `INTERNET`；设置 `android:usesCleartextTraffic="true"` 以支持当前 HTTP 服务器和用户后续填写的 HTTP 地址。不申请通知、定位、通讯录、相机、存储等无关权限。报告通过系统选择器和 `FileProvider` 打开，不申请广泛存储权限。

## 7. 本地数据

Room 首版只承载笔记草稿，不复制服务端业务数据库。

```text
note_draft
- local_id: String UUID, PK
- server_note_id: Long?
- title: String
- content: String
- note_type: String
- group_id: Long?
- related_module: String?
- related_id: Long?
- tags_text: String?
- tag_ids_json: String
- save_state: draft / submit_failed
- error_message: String?
- updated_at: Instant
```

约束：

- 当前产品只有一个固定用户，草稿不增加多账户字段；退出登录和 Token 过期时保留草稿，重新登录后继续展示。
- 同一个 `server_note_id` 最多存在一条活动草稿，保存时使用唯一索引或事务内 upsert，避免重复草稿。
- 新建草稿按 `local_id` 区分；提交结果未知时保持 `submit_failed` 和完整内容，不自动再次 POST。
- Room 从版本 1 开始导出 schema；后续字段变化必须提供 Migration，禁止通过 destructive migration 清空个人草稿。
- Room/DataStore 使用应用私有存储即可，不引入 SQLCipher 或额外密钥系统。
- `android:allowBackup=false`，避免 Token 和尚未提交的投资笔记进入系统云备份；用户需要长期保存的内容应手动提交到服务端。
- 数据库写入失败或磁盘空间不足时编辑器立即显示“本地草稿保存失败”，不得继续显示虚假的“已保存”。

DataStore 保存：

- Token。
- 当前服务器地址；不存在时回退 `BuildConfig.DEFAULT_SERVER_URL`。
- 主题模式。
- 当前用户摘要。
- 最近一次预警刷新时间。

看板、新闻、报告和预警首版只做进程内缓存；无网络时可保留本次进程已经加载的数据。冷启动离线时允许进入完整 App 壳层和 Room 草稿，但不承诺恢复上一次进程的看板、新闻、报告或预警内容。

清除规则：

- 主动退出或 401 只清除 Token 和当前用户摘要，不清除 Room 草稿、主题和报告缓存。
- 修改服务器地址额外清空内存业务缓存并保留新的服务器地址；不清除 Room 草稿、主题和报告文件缓存。
- 设置页提供“清理报告缓存”，不提供一键清空草稿；草稿只能逐条删除或提交成功后自动删除。
- 卸载应用或系统“清除数据”会删除全部本地草稿，首版不额外实现导出、恢复或跨设备同步。

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
| 笔记分组 | `GET /api/knowledge/note-groups` |
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
- 当前明确支持的移动端映射为 `related_type=report -> GET /api/reports/{id}`；其他类型没有确定的移动详情映射时只保留来源信息，不猜测路由。

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

`note_type` 是读写字段，但不是列表查询参数。第一版可以展示和编辑类型，不提供类型筛选。

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
- Launcher adaptive icon 的 foreground、登录页、AppBar 和关于页面共用该生成资源。
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
- Compose 页面、Dialog、BottomSheet、输入框、骨架屏、空状态、错误状态、Markdown 阅读器和图表全部使用主题 Token，业务 feature 不写死页面背景与正文颜色。
- 主题切换不得清空页面状态、看板分页位置、新闻滚动位置或笔记草稿。
- v1 浅色原型不构成深色延期依据；深色不可读、突兀白块或图表反色均属于第一版阻断问题。

### 10.4 色彩系统

#### 10.4.1 功能 Token

| Token | 浅色 | 深色 | 用途 |
|---|---:|---:|---|
| `canvas` | `#FFFFFF` | `#0D1117` | 页面背景 |
| `canvasSubtle` | `#F6F8FA` | `#161B22` | 次级区域、列表分组 |
| `canvasInset` | `#EFF2F5` | `#010409` | 内嵌区、代码块、图表底层 |
| `borderDefault` | `#D0D7DE` | `#30363D` | 卡片、输入框、分隔线 |
| `borderMuted` | `#D8DEE4` | `#21262D` | 弱分隔线 |
| `fgDefault` | `#1F2328` | `#F0F6FC` | 主要文字 |
| `fgMuted` | `#59636E` | `#9198A1` | 辅助文字、图标 |
| `accent` | `#2563EB` | `#58A6FF` | 品牌、主操作、选中状态 |
| `accentMuted` | `#EFF6FF` | `rgba(56,139,253,0.15)` | 选中轻背景、信息提示 |
| `success` | `#1A7F37` | `#3FB950` | 成功、健康、完成 |
| `successMuted` | `#DAFBE1` | `rgba(46,160,67,0.15)` | 成功轻背景 |
| `attention` | `#9A6700` | `#D29922` | 警告、待处理 |
| `attentionMuted` | `#FFF8C5` | `rgba(187,128,9,0.15)` | 警告轻背景 |
| `danger` | `#CF222E` | `#F85149` | 错误、危险操作、高等级预警 |
| `dangerMuted` | `#FFEBE9` | `rgba(248,81,73,0.15)` | 错误轻背景 |
| `done` | `#8250DF` | `#A371F7` | 已归档、特殊完成态 |
| `doneMuted` | `#F5F0FF` | `rgba(163,113,247,0.15)` | 特殊完成轻背景 |

#### 10.4.2 业务语义 Token

- A 股行情固定为 `marketUp = danger`、`marketDown = success`、`marketFlat = fgMuted`，即涨红跌绿；不得直接把通用“正向/负向”颜色套到行情方向。
- 预警等级固定为高 `danger`、中 `attention`、低 `accent`，并同时显示等级文字或图标。
- 成功、排队中、失败、已完成分别使用 `success / attention / danger / done`，同时保留明确文本。
- 未读通过字重、标记和语义说明共同表达；草稿通过“草稿”文字与图标表达；颜色不得成为唯一信息载体。
- 图表系列色从受控的主题调色板取值；涨跌、基准、选中和告警色不得在不同图表中交换语义。

### 10.5 排版

- 使用 Android 系统字体栈：拉丁字符采用 Roboto，中文采用设备系统 CJK 字体；首版不内置自定义字体。
- AppBar 标题：`20sp / 600`；页面区块标题：`16sp / 600`；卡片标题：`14sp / 600`。
- 正文：`14sp / 20sp`；辅助文字：`12sp / 16sp`；短标签与图表轴标签最低 `11sp`。
- 核心指标：`24sp / 700`，数字使用等宽数字特性时不得影响中文回退字体。
- 按用户主力手机当前字体和显示大小验收；布局仍避免明显的固定高度裁切，但不为超大字体建立额外适配分支。
- 层级优先通过字号、字重和间距建立，避免大面积彩色标题或全大写英文。

### 10.6 间距、尺寸与安全区

- 采用 `4dp` 基础网格，标准间距为 `4 / 8 / 12 / 16 / 20 / 24 / 32dp`。
- 页面左右安全间距统一为 `16dp`；高密度列表内部可使用 `12dp`，但文字不得贴边。
- 页面区块间距为 `16–24dp`，同组元素为 `4–12dp`。
- AppBar 内容高度 `48dp`；底部导航内容高度约 `56dp`，并额外消费系统导航安全区。
- 可点击目标最小 `48 × 48dp`；紧凑图标可保持 `20–24dp` 视觉尺寸，但点击区域不能缩小。
- 页面必须处理状态栏、导航栏、显示挖孔和横屏 inset，不以固定设备高度定位底部操作。
- 第一版只正式支持手机竖屏；横屏保持不崩溃即可，不单独设计横屏、平板或折叠屏布局。

### 10.7 圆角、边框与层级

- 小组件圆角 `6dp`，输入框和普通卡片 `8dp`，Dialog、BottomSheet 和大容器 `12dp`。
- 胶囊形只用于短状态、筛选 Chip 和数量 Badge，不用于顶部看板 Tab。
- 卡片和输入框使用 `1dp borderDefault`；弱分组使用 `borderMuted`。
- 普通卡片默认无投影。阴影只用于 Dialog、BottomSheet、浮动按钮和确有遮挡关系的浮层。
- 禁止在卡片内部继续堆叠同等视觉权重的卡片；优先使用分区标题和分隔线。

### 10.8 核心组件规范

- **AppBar**：左侧返回或 Logo，中间标题，右侧最多两个高频动作；溢出动作进入菜单。
- **看板分页**：`HorizontalPager` 与顶部可横向滚动 Tab 同步；选中项使用 `accent` 文字和 `2dp` 下划线，不使用胶囊选中块。
- **底部导航**：始终四项；图标、文字和选中状态同时变化；报告不得出现为第五项。
- **卡片与列表**：标题、核心值、辅助信息、动作按固定层级排列；整行可点击时不再放含义相同的箭头按钮。
- **按钮**：主按钮使用 `accent` 实底，次按钮使用透明底加边框，危险按钮使用 `danger`；同一区域最多一个主按钮。
- **标签与筛选**：业务标签使用中性或轻语义背景；可交互筛选必须有选中、按下、禁用和清除状态。
- **输入框**：常驻可见 Label；错误信息放在字段下方并说明修复方式；仅占位符不能替代 Label。
- **状态反馈**：首屏使用骨架屏，局部刷新保留旧内容并显示轻量进度；空状态说明原因和下一步；错误状态提供明确重试动作。
- **新闻时间线**：日期吸顶、节点、时间、来源、标签和关联对象保持纵向扫描节奏；未读不能只靠节点颜色区分。
- **Markdown 阅读器**：标题、正文、引用、列表、表格、代码块和链接全部使用主题 Token；宽表允许横向滚动，正文不整体横滚。
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
designsystem/
├── LiuliTheme.kt
├── LiuliColors.kt
├── LiuliTypography.kt
├── LiuliSpacing.kt
├── LiuliShapes.kt
└── components/
```

- `LiuliTheme` 根据 resolved theme 创建 Material `ColorScheme`，并通过 `CompositionLocal` 暴露 Material 未覆盖的业务语义色和间距。
- 原始色值只允许出现在 `LiuliColors.kt`；feature 只能引用 `MaterialTheme` 或 `LiuliTheme` 的语义属性。
- `LiuliTypography`、`LiuliSpacing` 和 `LiuliShapes` 是唯一尺寸来源；页面不得复制一套局部规范。
- 复用 Material 3 的语义、状态和无障碍行为，再用琉璃 Token 调整外观；不自行重写基础点击、焦点或输入行为。
- Preview 与截图测试必须分别渲染 light、dark；`SYSTEM` 只负责解析后复用其中一套，不维护第三套颜色。
- 深色模式避免大面积纯黑，`#010409` 只用于内嵌层；禁止硬编码白色卡片、黑色正文或给 Logo 加 tint。

## 11. 测试策略

### 11.1 Android 单元测试

- 登录成功、失败、Token 失效。
- 构建配置验证 Release 为 `com.liuli.app`、Debug 为 `com.liuli.app.debug`，两者应用名和数据目录互不混用。
- 启动时有 Token 先进入 App、异步 `/me` 成功更新用户、网络失败保留离线会话、401 返回登录页。
- 服务器地址去空格、scheme/host 校验、端口和子路径保留、末尾 `/` 补齐及恢复默认。
- 修改服务器后取消请求、清除旧 Token/用户/内存缓存，同时保留草稿、主题和报告缓存。
- `LIGHT / DARK / SYSTEM` 解析、DataStore 恢复和系统主题变化。
- 浅色与深色功能 Token、业务语义 Token 和 Material `ColorScheme` 映射正确。
- A 股涨红跌绿、预警等级和通用成功/失败状态不发生语义混用。
- 看板首次可见懒加载和重复进入不重复请求。
- 5 分钟缓存、前后台刷新和 ISO 8601 时间转换。
- 新闻分页、筛选取消、刷新锚点和新增数量。
- 笔记草稿防抖保存、恢复、提交成功清理、失败保留。
- 并发 401 只触发一次会话清理，GET 最多重试一次，POST/PUT 不自动重试。
- 预警已读和处理状态更新。
- 预警规则列表对 `rule_id` 的目标映射，以及规则缺失时隐藏跳转入口。

### 11.2 网络契约测试

使用 MockWebServer 覆盖：

- Bearer Header。
- `ServerUrlInterceptor` 对 HTTP/HTTPS、端口和 base path 的地址改写。
- `Page<T>` 的 `items/total/limit/offset/has_more`。
- 401、404、422、500、超时和非 JSON 错误。
- `502 / 503 / 504` 的 GET 单次重试，以及笔记 POST 超时后的“结果未知”状态。
- 信息流 `source_tags` 缺失时按空列表处理，不读取不存在的关联实体字段。
- 报告正文纯文本和下载文件响应。
- 组合列表、组合详情、组合 dashboard 和带 `portfolio_id` 的价值快照。

### 11.3 Room 测试

- 新建草稿。
- 同一 `local_id` 更新。
- 关联 `server_note_id`。
- 同一 `server_note_id` 的草稿 upsert 不产生重复记录。
- 进程重启后恢复。
- 提交失败记录错误。
- 成功提交删除本地草稿。
- Room Migration 保留已有草稿，不使用 destructive migration。

### 11.4 Compose UI 测试

- 底栏只存在四项。
- 看板存在五个横向分页且点击与滑动同步。
- 报告只能作为二级页面进入，且只出现 market、track、stock 三类筛选。
- 新闻、报告和预警均能进入关联笔记编辑器。
- AppBar 账户菜单可以进入设置、修改密码和退出登录。
- 登录页和已登录设置页均能进入服务器设置；无网络时服务器设置仍可保存，保存后回到登录页。
- 有 Token 的冷启动断网场景进入完整 App 壳层，草稿可编辑，远程页面显示离线状态。
- 赛道、标的和组合简版详情能从对应看板进入并正确返回原位置。
- 加载、空、失败、缓存内容加错误条四类状态可见。
- 浅色、深色两套 Compose 截图测试覆盖登录、五个看板、笔记、新闻、预警、报告和设置；跟随系统分别在 light/dark 系统配置下复用同一断言。
- 核心组件截图矩阵覆盖 AppBar、底部导航、Tab、卡片、按钮、输入框、标签、骨架屏、空状态、错误重试、时间线、Markdown 和图表。
- Markdown 标题、列表、引用、代码块、表格和链接在 `multiplatform-markdown-renderer-m3` 下使用琉璃主题；Vico 折线/柱状/组合图及 Canvas 环形图/热度矩阵颜色语义一致。
- 主题切换前后页面状态、滚动位置和本地草稿保持不变。
- 登录页、AppBar、关于页和 Launcher 使用由 `docs/assets/android/liuli-web-logo.svg` 生成的同一 Logo 资源，且两种主题下不被 tint。
- 在用户主力手机当前字体和显示大小下检查文字、图表、表单和 `48 × 48dp` 高频操作区域，不建立额外设备和无障碍矩阵。
- 静态扫描或架构测试禁止 feature 直接声明原始颜色，原始色值仅存在于设计系统模块。

### 11.5 主力真机验证

- 只在用户的 Android 16 / API 36 小米 17 完成正式验收，模拟器使用 API 36 镜像进行开发过程检查。
- 覆盖默认地址 `http://115.29.176.240:5173/` 登录、冷启动、前后台切换、进程回收、断网进入、修改服务器后重新登录、主题切换、笔记草稿、报告下载与系统应用打开。
- 覆盖小米 17 实际使用的浅色/深色、字体大小、显示大小和手势导航。
- 不建立 Android 旧版本、平板、折叠屏、多厂商或应用商店兼容测试矩阵。

### 11.6 后端验证

- Android 契约测试直接基于当前路由和 Schema，不建立移动端扩展响应。
- 报告只验证现有 `report_kind`、分页、正文和下载行为。
- 既有 Web 调用和全部后端接口保持不变。
- 后端测试必须使用隔离数据库；执行任何清表、重建或删除类测试前，仍需按仓库约束取得用户当轮明确批准。

## 12. 验收标准

1. 底部只出现看板、记录、新闻、预警。
2. 看板可在今日、市场、赛道、标的、组合之间点击或滑动切换。
3. 报告可从今日、市场、赛道、标的看板以及明确 `related_type=report` 的新闻详情进入，但不占底部入口。
4. 知识笔记可独立管理，并能从新闻、报告和预警带上下文创建。
5. 编辑笔记时切后台或断网不会丢失内容。
6. 新闻保留日期吸顶、时间轴、服务端筛选和刷新位置恢复。
7. 预警只做应用内刷新，不产生后台通知。
8. 所有页面提供明确的加载、空、失败和重试状态。
9. Android 只调用受鉴权 REST API，不读取数据库、服务端文件目录或 MCP。
10. 第一版不新增或修改任何后端接口、参数、响应字段和业务行为。
11. 登录页、应用栏、关于页和 Launcher 复用 `docs/assets/android/liuli-web-logo.svg` 的图形，不出现临时文字 Logo 或另一套品牌图形；该 SVG 与 Web 上游 `favicon.svg` 保持一致。
12. 浅色、深色、跟随系统三种模式均可用；所有页面、图表和 Markdown 阅读器在两种 resolved theme 下可读且无突兀反色块。
13. Android UI 遵循第 10 章的语义 Token、排版、间距、圆角、组件和动效规范，feature 不直接使用原始色值。
14. 用户主力手机当前字体、显示大小和导航方式下，文字、图表、表单与关键操作清晰可用；不要求大众无障碍和多设备适配认证。
15. 设置入口、笔记只读到编辑、赛道/标的/组合简版详情和修改密码路由完整可达，返回后恢复来源位置。
16. 并发 401、网络重试、POST 结果未知、5 分钟缓存、进程恢复和 Room Migration 按本文规则工作，不造成重复提交或草稿丢失。
17. PDF 等文件通过应用缓存和 `FileProvider` 打开，不申请广泛存储权限；缓存可以从设置页手动清理。
18. 默认服务器为 `http://115.29.176.240:5173/`；登录页和设置页可修改，修改后旧服务器 Token 与内存缓存清除，并要求重新登录。
19. 已有 Token 时断网冷启动可以进入完整 App 壳层并编辑 Room 草稿；远程页面明确显示离线状态，网络失败不误清 Token。
20. Release APK 在 Android 16 / API 36 小米 17 上完成默认 HTTP 服务器、手势导航和个人投资主流程验收；不要求更早 Android、应用商店、平板或多厂商兼容。
21. Release 与 Debug 分别使用 `com.liuli.app` 和 `com.liuli.app.debug`，可以同时安装且本地数据完全隔离。
22. Markdown、Vico 和 Compose Canvas 按第 6.1 节分工渲染，所有颜色、排版和交互映射到琉璃设计 Token。

## 13. 后续实施阶段

1. Android 工程、主题、导航、鉴权和网络底座。
2. 五个看板及简版对象详情。
3. 知识笔记和 Room 本地草稿。
4. 新闻时间线、现有条件筛选和详情。
5. 预警列表、详情、状态操作和关联记录。
6. 现有报告分类筛选、Markdown 阅读和 PDF 外部打开。
7. 完整测试、Release 签名、公网联调和 APK 交付。
