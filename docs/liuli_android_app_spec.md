# 琉璃 Android App 技术规格

> 首次制定：2026-07-10
>
> 最后更新：2026-07-19
>
> 当前版本：v8.1
>
> 产品形态：原生 Android 薄壳 + 独立手机 H5
>
> 系统基线：`docs/liuli_system_spec.md`
>
> 默认服务器：`http://115.29.176.240:5174/`

## 0. 当前架构基线

- 在 `invest_assistant/ui/android/h5` 建立与桌面 Web 绝对隔离的 React + Vite + TypeScript 手机 H5。
- Android 仅保留系统安全区、固定五项底栏、单 WebView、服务器持久化、加载失败页和报告文件打开。
- 登录、二级导航、五个业务模块、普通详情、报告和设置全部由 H5 实现。
- 服务端口固定为 `8000 API｜5173 桌面 Web｜5174 手机 H5`，H5 由独立 Vite 进程从 5174 根路径提供。
- 不新增、不修改任何 REST 接口或数据库。

## 1. 产品定位

唯一用户是“专业投资者 + IT 极客”型个人用户：

- 需要高信息密度、明确来源、准确时间和快速跳转，不需要投资教学或大众化引导。
- 能理解服务器地址、接口错误、缓存、分页和手动重试。
- 接受侧载 APK、HTTP 个人服务器和截图驱动的快速 UI 迭代。
- 手机端业务组合独立于桌面 Web，不把桌面六模块页面直接缩小后塞入手机。

首版只支持 Android 16、小米 17、手机竖屏和手势导航。服务器加载 H5，因此联网冷启动是正常前提；WebView 缓存仅作为尽力而为的辅助，不承诺完整业务离线可用。

## 2. 工程与隔离边界

### 2.1 目录

```text
invest_assistant/ui/android/
├── app/                         # 原生 Android 薄壳
│   └── src/main/java/com/liuli/app/
│       ├── MainActivity.kt
│       ├── core/common/         # DataStore
│       ├── core/design/         # 原生底栏主题
│       └── hybrid/              # 五模块与 URL 模型
└── h5/                          # 独立手机 H5 工程
    ├── public/                  # H5 自有 Logo
    ├── src/
    │   ├── api/
    │   ├── app/
    │   ├── components/
    │   ├── native/
    │   ├── pages/
    │   ├── types/
    │   └── utils/
    └── tests/
```

绝对隔离规则：

1. H5 不导入 `invest_assistant/ui/web/src` 的组件、类型、样式、路由或 API Client。
2. H5 拥有独立 `package.json`、锁文件、TypeScript 配置、测试和构建产物。
3. 桌面 Web 不依赖 H5 源码。
4. 两套前端只共享同一组后端 REST 契约和 Logo 视觉，不共享前端实现。
5. H5 不向 `invest_assistant/ui/web/public` 写入产物；5173 和 5174 在源码、依赖、静态资源及运行进程上保持隔离。

### 2.2 技术栈

原生薄壳：

- Kotlin 1.9.24
- Jetpack Compose + Material 3
- Android WebView
- DataStore
- OkHttp（仅报告文件下载）
- FileProvider

独立 H5：

- React 18
- Vite 5
- TypeScript
- React Router HashRouter
- TanStack Query
- ECharts Core 按需图表
- React Markdown（仅报告）
- Vitest、Testing Library、Playwright
- 自建移动 CSS Token 和组件，不引入桌面 Ant Design

## 3. 原生 Android 外壳

### 3.1 固定底部导航

底部固定五项：

1. 看板
2. 笔记
3. 新闻
4. 预警
5. 我的

底栏内容高 `56dp`，额外消费系统手势导航安全区。图标和文字均由同一个 Compose 组件绘制，位置不受 H5 滚动和业务页面影响。

显示规则：

- H5 登录页：隐藏。
- 五个根页面：显示。
- 新闻、笔记、预警等普通详情：显示。
- 报告列表：显示。
- Markdown 报告阅读：隐藏。

### 3.2 单 WebView

- App 只创建一个 WebView，不为五个模块创建五个 WebView。
- 默认直接加载 `${server}`，默认值为 `http://115.29.176.240:5174/`。
- 原生底栏通过 JS 事件切换 HashRouter 路由，不重新加载 H5。
- WebView 开启 JavaScript 和 DOM Storage，关闭文件访问和内容访问。
- 当前 H5 Origin 的页面、资源和 `/api/` 留在 WebView；其他 Origin 的链接交给系统浏览器。

### 3.3 加载失败

主文档加载失败时隐藏底栏并显示最小原生失败页：

- 当前服务器地址。
- 保存并重试。
- 恢复默认服务器。

修改服务器后 DataStore 保存新地址并重建 WebView。服务器加载模式不提供原生业务离线页。
升级时若 DataStore 中仍是旧公网默认值 `http://115.29.176.240:5173/`，原生层按
新默认值 5174 读取；其他用户自定义地址不迁移。

### 3.4 报告文件

H5 报告页通过桥接请求原生下载。原生从 WebView `localStorage` 读取当前 Token，通过 OkHttp 下载到应用报告缓存，再使用 FileProvider 打开或分享。

## 4. H5 路由与原生桥接

### 4.1 路由

```text
/login
/dashboard
/notes
/notes/:id
/news
/news/:id
/alerts
/alerts/:id
/me
/reports
/reports/:id
```

实际地址使用 HashRouter，例如：

```text
http://115.29.176.240:5174/#/news
```

### 4.2 JS Bridge

H5 可调用：

```text
LiuliNative.setNavigationState(section, showBottomBar)
LiuliNative.setTheme(mode)
LiuliNative.setServer(url)
LiuliNative.openDownloadedFile(url, filename)
LiuliNative.logout()
```

原生切换模块时向 H5 派发：

```text
liuli:navigate { section }
```

H5 是路由真相来源；每次路由变化必须同步当前父模块和底栏显隐。

## 5. H5 视觉系统

### 5.1 根页面统一骨架

五个根模块必须使用同一个 `MobilePageFrame`：

- H5 顶部从原生状态栏安全区下方开始。
- 二级导航总高固定 `44px`。
- 顶部间距 `8px`，导航内容高 `36px`。
- 不使用外边框或单项圆角背景。
- 选中项为蓝色文字、较高字重和 `2px` 短下划线。
- 浅色顶部固定白色，深色顶部固定黑色。
- 所有模块正文从同一垂直坐标开始。

色彩限定为白、灰、蓝、黑。红、绿、橙只用于涨跌和风险语义，禁止出现默认紫色。

### 5.2 页面密度

- 页面水平边距 `12px`。
- 卡片间距 `10px`。
- 普通卡片圆角 `10px`，笔记卡片圆角 `12px`。
- 正文通常为 `13–16px`；笔记正文 `16px / 1.65`，标签 `14px`。
- 点击控件目标高度通常不低于 `44px`。
- H5 不重复显示无价值的原生模块标题栏。

## 6. 五个模块

### 6.1 看板

二级导航：

```text
今日｜市场｜赛道｜标的｜组合
```

支持点击与左右滑动。根页面查询保留五分钟缓存，刷新失败时 TanStack Query 保留旧数据。

- 今日：重要新闻、未读预警、最新报告、最近笔记。
- 市场：信息量、标签量、热度排行。
- 赛道：升温赛道、重点赛道、热度排行和最新材料。
- 标的：标的池、重点标的和评分排行。
- 组合：总资产、现金、今日收益和资产趋势。

### 6.2 笔记

- 二级导航直接显示“全部”和服务端笔记分组，可横向滚动。
- 支持编辑分组、新增分组和归档分组。
- 列表采用 Flomo 式短文本卡片，不显示派生标题和 `note_type`。
- 新增和编辑均为纯文本，不提供 Markdown、图片、语音和本地草稿。
- 标签字号与正文接近，不形成夸张层级。
- 提交失败时保留当前输入面板内容并允许重试。

### 6.3 新闻

二级导航：

```text
全部｜重要｜公告｜个股
```

现有接口参数映射：

- 重要：`important_only=true`
- 公告：`source_type=announcement`
- 个股：`source_name=东方财富`

新闻采用日期吸顶、左侧时间轨道和节点的 7×24 时间线。二级 Tab 支持点击和左右滑动；分页每次读取 30 条；切换筛选时通过 `AbortSignal` 取消旧请求，旧结果不得覆盖新筛选结果；按 ID 去重并保存 TanStack Query 缓存。

### 6.4 预警

二级导航：

```text
全部｜未读｜已处理
```

现有 `/api/alerts/events` 没有状态参数，因此按现有分页加载后在客户端筛选。二级 Tab 支持点击和左右滑动；每次只允许一个翻页请求，禁止切换 Tab 触发重复请求循环。

详情支持现有标记已读和已处理接口，不增加处理备注字段。

### 6.5 我的

二级导航显示单项“设置”，保持与其他模块相同的 `44px` 顶部结构。

- 账号取自 `/api/auth/me`，只显示真实 `username`，不使用 `display_name` 覆盖登录账号。
- 不显示设备、BU 或硬编码 brian。
- 支持浅色、深色和跟随系统。
- 支持服务器地址、报告中心、修改密码、退出和版本信息。

## 7. 登录、鉴权与网络

- H5 调用现有 `POST /api/auth/login`。
- Token 保存于当前 H5 Origin 的 `localStorage`，Key 为 `liuli.mobile.auth.token`。
- 所有 API 请求附带 `Authorization: Bearer <token>`。
- 401 清除 Token、派发未授权事件并回到 H5 登录页。
- 请求默认同源访问 `/api`，不依赖桌面 Web API Client。
- Android 不保存业务 Token；更换服务器 Origin 后自然要求重新登录。

## 8. REST API 映射

| 页面 | 现有接口 |
| --- | --- |
| 登录/账号/密码 | `/api/auth/login`、`/api/auth/me`、`/api/auth/change-password` |
| 市场看板 | `/api/market-radar/overview`、`/api/market-radar/rankings` |
| 新闻 | `/api/market-radar/source-items`、`/api/market-radar/source-items/{id}` |
| 赛道看板 | `/api/track-discovery/dashboard` |
| 标的看板 | `/api/stock-analysis/dashboard` |
| 组合看板 | `/api/portfolios/overview`、`/api/portfolios/value-snapshots` |
| 笔记与分组 | `/api/knowledge/notes`、`/api/knowledge/note-groups` |
| 预警 | `/api/alerts/events`、`/read`、`/handle` |
| 报告 | `/api/reports`、`/api/reports/{id}`、`/content` |

禁止调用 `/api/console/*`，禁止为手机端新增聚合接口、筛选参数或数据库字段。

## 9. 构建与部署

### 9.1 H5 本地开发

```powershell
cd invest_assistant/ui/android/h5
npm.cmd install
npm.cmd run dev
```

开发与服务器常驻端口均为 `5174`。H5 的 `/api` 默认代理到本机
`http://127.0.0.1:8000`；需要临时改用其他 API 时，可在启动前设置
`VITE_API_PROXY_TARGET`。该变量只影响 Vite 代理。

### 9.2 H5 构建验证与运行

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

构建结果只保留在 H5 自身 `dist`，用于验证可生产构建；不复制到桌面 Web。

根目录 `start.bat` 和 `start.sh` 分别启动 API 8000、桌面 Web 5173 和手机
H5 5174。Windows 使用独立 H5 窗口；Linux 使用 `var/run/h5.pid` 与
`var/logs/h5.log` 管理 H5 进程。`stop.bat` 和 `stop.sh` 同时停止三个端口，
Linux 停止脚本还通过 PID、命令模式和端口执行兜底清理。

`start_ubuntu_pg.sh` 只负责设置 PostgreSQL 环境并调用 `start.sh`，不重复维护
H5 启动逻辑。首次运行若 H5 依赖不存在，启动脚本自动安装依赖。服务器需要开放
TCP 5174，并一次性删除旧的 `invest_assistant/ui/web/public/mobile` 目录。

### 9.3 Android 构建

```powershell
$env:JAVA_HOME='D:\env\android\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
cd invest_assistant/ui/android
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug
```

## 10. 测试与验收

H5 自动化：

- 五模块顺序、看板 Tab 顺序和父模块映射。
- 新闻筛选参数与预警本地筛选。
- API Query、Token Header 和 401。
- JS Bridge 缺失时的浏览器兼容。
- 登录、新闻根页统一二级导航、报告隐藏底栏。
- TypeScript 类型检查和生产构建。

Android 自动化：

- 5174 根地址生成，不拼接 `/mobile/`。
- 五项底栏顺序与路由。
- 登录和报告阅读底栏显隐规则。
- `testDebugUnitTest`、`lintDebug`、`assembleDebug`。

视觉验收：

- 日常视觉调试固定使用 H5 浏览器手机视口，不再启动 Android 模拟器反复调样式。
- 基准视口为 `393 × 852 CSS px`，同时检查浅色和深色五个根模块。
- 二级导航顶部、总高和正文起点完全一致。
- 原生底栏只做静态编译和桥接模型验证；最终真机安装时确认它不随 H5 滚动且不与内容重叠。
- 普通详情保留底栏，报告阅读隐藏底栏。
- 笔记纯文本、新闻时间线、预警筛选和 admin 账号展示符合本规格。

本阶段不运行数据库测试、不修改数据库，也不新增或修改后端接口。
