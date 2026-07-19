# 琉璃 Android

面向 Android 16、小米 17 和个人投资研究场景的混合客户端。

- 原生 Android：系统安全区、固定五项底栏、单 WebView、服务器设置和报告文件打开。
- 独立 H5：登录、看板、笔记、新闻、预警、我的、详情和报告。
- 默认入口：`http://115.29.176.240:5173/mobile/`
- 不新增或修改后端接口。

## 工程边界

手机 H5 位于 `invest_assistant/ui/android/h5`，拥有独立依赖、路由、API、类型、样式和测试。它不导入桌面 Web 源码。桌面 Web 的 `public/mobile` 只保存被 Git 忽略的部署产物。

## H5 开发

```powershell
cd D:\code\ai\liuli-v2\invest_assistant\ui\android\h5
npm.cmd install
npm.cmd run dev
```

本地热更新地址为 `http://127.0.0.1:5174/mobile/`。生产构建与同步：

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
cd D:\code\ai\liuli-v2
node scripts\sync-mobile-h5.mjs
```

H5 开发服务默认把 `/api` 代理到 `http://115.29.176.240:5173`，可直接使用真实账号和数据。需要改用本机 API 时：

```powershell
$env:VITE_API_PROXY_TARGET='http://127.0.0.1:8000'
npm.cmd run dev
```

同步后由现有 `5173` Web 进程提供 `/mobile/`，服务器不增加常驻进程。

## Android 构建

```powershell
$env:JAVA_HOME='D:\env\android\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
cd D:\code\ai\liuli-v2\invest_assistant\ui\android
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug
```

Debug 包名为 `com.liuli.app.debug`，应用名为“琉璃 Dev”。

## H5 快速调试

```powershell
cd D:\code\ai\liuli-v2\invest_assistant\ui\android\h5
npm.cmd run dev
```

浏览器使用 `393 × 852` 手机视口访问 `http://127.0.0.1:5174/mobile/`。后续界面样式、模块内容和交互全部在 H5 浏览器中调试，不再启动 Android 模拟器反复看效果。

H5 样式调整后只需重新构建并同步静态文件，再在 App 中刷新或重启，不需要重新安装 APK。只有原生底栏、WebView 或桥接变化才重新编译 APK；原生层以单元测试、Lint 和 APK 构建作为日常验证，最终在小米 17 真机检查一次。
