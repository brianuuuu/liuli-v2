# 琉璃 Android

面向个人投资研究场景的 Android 16 客户端。首版直接消费现有琉璃 REST API，不要求后端新增或修改接口。

## 当前功能

- 四项底部导航：看板、记录、新闻、预警。
- 五个可左右滑动的看板：今日、市场、赛道、标的、组合。
- 登录、Token 会话、401 失效、断网保留会话和动态服务器地址。
- 浅色、深色、跟随系统主题。
- Room 笔记草稿、自动保存、失败保留和手动重试。
- 新闻日期时间线、搜索、重要筛选、详情和关联笔记入口。
- 预警列表、详情、已读、已处理和关联笔记入口。
- 市场/赛道/标的报告分类、Material 3 Markdown 阅读、FileProvider 外部打开和关联笔记入口。
- 独立设置页，可修改主题、服务器地址、密码，查看草稿并清理报告缓存。
- 强类型 DTO、Hilt、Navigation Compose、Repository/ViewModel/StateFlow 和五分钟看板缓存。

## 版本矩阵

| 项目 | 版本 |
| --- | --- |
| compileSdk / targetSdk / minSdk | 36 |
| Gradle | 8.13 |
| Android Gradle Plugin | 8.13.2 |
| Kotlin | 1.9.24 |
| Compose BOM | 2024.09.03 |
| Hilt | 2.51.1 |
| Room | 2.6.1 |
| Retrofit | 2.11.0 |
| OkHttp | 4.12.0 |
| Markdown Renderer M3 | 0.28.0 |
| Vico Compose M3 | 1.15.0 |

AGP 8.13.2 / Gradle 8.13 用于完整支持本机 API 36.1 SDK。Markdown 与 Vico 选用和 Kotlin 1.9.24 / 当前 Compose BOM 兼容的版本。

## 构建

PowerShell：

```powershell
$env:JAVA_HOME='D:\env\android\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug --no-daemon
```

Debug 包名为 `com.liuli.app.debug`，默认服务器为 `http://115.29.176.240:5173/`。
