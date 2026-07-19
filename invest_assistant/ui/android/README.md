# 琉璃 Android

面向 Android 16、小米 17 和个人投资研究场景的混合客户端。

- 原生 Android：系统安全区、固定五项底栏、单 WebView、服务器设置和报告文件打开。
- 独立 H5：登录、看板、笔记、新闻、预警、我的、详情和报告。
- 默认入口：`http://115.29.176.240:5174/`
- 端口约定：`8000 API｜5173 桌面 Web｜5174 手机 H5`。
- 不新增或修改后端接口。

## 工程边界

手机 H5 位于 `invest_assistant/ui/android/h5`，拥有独立依赖、路由、API、类型、样式、测试和运行端口。它不导入桌面 Web 源码，也不向桌面 Web 的 `public` 目录复制产物。两套前端只共享后端 REST 契约和 Logo 视觉。

## H5 开发

```powershell
cd D:\code\ai\liuli-v2\invest_assistant\ui\android\h5
npm.cmd install
npm.cmd run dev
```

浏览器使用 `393 × 852` 手机视口访问 `http://127.0.0.1:5174/`。H5 默认将同源 `/api` 代理到本机 `http://127.0.0.1:8000`。需要临时连接其他 API 时，可在启动前设置：

```powershell
$env:VITE_API_PROXY_TARGET='http://115.29.176.240:8000'
npm.cmd run dev
```

类型、单元测试和生产构建验证：

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

生产服务器同样由根目录启停脚本常驻运行 5174 Vite 服务，不使用 Preview，也不再构建并同步到桌面 Web。

## 整体启停

Windows：

```powershell
cd D:\code\ai\liuli-v2
.\start.bat
.\stop.bat
```

Linux：

```bash
cd /home/liuli-v2
./start.sh
./stop.sh
```

`start.sh` 记录 `var/run/h5.pid`，日志写入 `var/logs/h5.log`。`start_ubuntu_pg.sh` 继续设置 PostgreSQL 环境后调用 `start.sh`，自动获得相同的 5174 启停逻辑。首次运行若 H5 没有 `node_modules`，启动脚本会自动安装依赖。

服务器部署需开放 TCP 5174，并一次性删除旧目录 `invest_assistant/ui/web/public/mobile`。

## Android 构建

```powershell
$env:JAVA_HOME='D:\env\android\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
cd D:\code\ai\liuli-v2\invest_assistant\ui\android
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug
```

Debug 包名为 `com.liuli.app.debug`，应用名为“琉璃 Dev”。H5 样式和业务改动只需刷新 5174 页面，不需要重装 APK；只有原生底栏、WebView 或桥接变化才重新编译 APK。日常视觉调试直接使用浏览器，不再启动 Android 模拟器。
