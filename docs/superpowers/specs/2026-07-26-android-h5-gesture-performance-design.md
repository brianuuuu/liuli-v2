# Android H5 横滑手势性能设计

## 目标

在保留 Kotlin + Jetpack Compose 原生外壳、单 WebView 和现有 H5 业务页面的前提下，重构二级页面横滑内核，使小米 17 真机上的横滑操作持续跟手、松手自然吸附，并消除横滑引发的重复请求、加载闪烁和整页高频 React 重渲染。

本设计必须继续支持页面顶部、正文、加载态、空态以及 WebView 内容高度之外的空白区域起手横滑。任何实现不得退回只监听 pager 内容节点或依赖内容容器命中范围的旧模式。

## 已确认问题

当前 `HorizontalTabPager` 已将页面位移改为 CSS 变量，并使用 `requestAnimationFrame` 合并 motion 通知，但手势移动期间仍把 `PagerMotion` 写入根页面 React state。根页面、导航、pager 以及已挂载的当前页和相邻页因此跟随手指高频重渲染。

`SecondaryNavigation` 每次收到 motion 都在 `useLayoutEffect` 中读取标签的 `offsetLeft` 和 `offsetWidth`，随后更新 indicator state。这会在手势热路径中混合布局读取、状态写入和第二次 React 渲染。

pager 当前同时挂载当前页、上一页和下一页。切换后远端页面被卸载，新的相邻页面被挂载。页面内的 React Query observer 会随之重新建立，缓存过期时触发重新请求；这解释了横滑后刷新次数增加的现象。

Android 原生 `HorizontalSwipeDetector` 和 H5 分别跟踪同一个手势。H5 负责跟手位移，原生在 ACTION_UP 后通过 `evaluateJavascript` 发布最终方向，H5 同时设置 120ms 回弹兜底。主线程繁忙时，两条结束路径存在时序竞争，可能出现短暂回弹后再翻页。

公网 5174 当前由 Vite 开发服务器提供，包含 `@vite/client`、React Refresh 和开发版 React。开发运行时进一步放大 WebView 渲染成本，不应作为真机流畅度验收环境。

## 方案选择

采用单 WebView、单一 H5 手势状态机、合成层动画、有界页面缓存和生产静态运行时的组合方案。

不采用多 WebView、原生 ViewPager2 或将二级业务页面迁移为 Compose 页面。那些方案会增加内存、登录态、路由和业务状态同步成本，不符合当前单 WebView 约束和个人使用、快速落地的产品范围。

## 手势所有权

H5 是二级 pager 手势的唯一决策者。Android WebView 继续传递系统触摸事件，但原生层不再计算 previous、next 或 cancel，也不再为 pager 发送 `liuli:native-swipe`。

H5 在 `document` 捕获阶段接收 Pointer Event。监听范围与内容节点高度无关，因此即使触点位于 body 空白区域，也能建立候选手势。开始手势时通过 `document.elementFromPoint` 判断交互目标，输入框、文本编辑器、显式忽略区和确实可横向滚动的容器不参与 pager 手势。

状态机包含四个状态：

```text
idle -> pending -> dragging -> settling -> idle
```

- `pending`：记录起点和最近触点样本，不阻止竖向滚动。
- `dragging`：移动超过方向锁阈值且横向占优后进入；后续只更新 pager transform。
- `settling`：松手后按预测位置决定翻页或回弹。
- 新手势可以中断 settling，从当前视觉位置继续拖动。

候选参数以 CSS 像素和屏幕密度归一后计算：

- 方向锁距离：`8-12dp`。
- 横向优势比：约 `1.25`。
- 距离翻页阈值：视口宽度的 `20%-24%`。
- 快速甩动阈值：`650-750dp/s`，且方向必须与位移一致。
- 预测位置：当前位移加速度投影约 `180ms`。
- 边界阻尼：原始位移乘 `0.16-0.20`。

最终参数以小米 17 真机采样为准，不通过增加固定延迟掩盖掉帧。

## 渲染热路径

手指移动时不得调用 React `setState`、React Query API、路由 API 或原生 JS Bridge。

pager 使用最多一个待处理 `requestAnimationFrame`，每帧只把最新位移写入 pager 根元素的 CSS 自定义属性。当前页和目标页仅通过 `translate3d` 移动。拖动和吸附期间添加明确的 compositing 状态类，结束后移除 `will-change`，避免长期占用图层内存。

顶部导航通过 imperative motion sink 接收 `fromIndex`、`toIndex` 和 `progress`。标签几何信息仅在初次布局、标签集合变化和 `ResizeObserver` 通知时测量；手势帧只更新 indicator 的 transform 和 width，不执行 `useLayoutEffect`，也不向根页面发布 motion state。

吸附动画根据剩余距离和释放速度在 `140-240ms` 之间选择时长，使用 transform 合成动画。翻页完成后只提交一次 active key，保证一次有效手势最多产生一次业务状态变化。

## 页面生命周期和数据刷新

pager 维护最多三个页面实例的 LRU keep-alive：当前页面、最近页面和下一候选页面。已访问页面在缓存范围内不卸载，保留局部组件状态和滚动位置。超出缓存范围的页面可以卸载，但 React Query 数据继续留在 query cache。

页面实例和 `renderPage` 映射保持稳定，业务内容组件使用明确的 memo 边界。pager 自身状态变化不得迫使隐藏页面重新计算长列表、Markdown 或图表。

横滑不属于刷新动作，不能直接调用 `refetch` 或 `invalidateQueries`。查询采用 stale-while-revalidate：

- 缓存已有数据时，后台更新不得切回全屏 Loading。
- 页面重新挂载默认不因 mount 立即重复请求。
- 新闻等时效内容可以在进入页面后按 freshness policy 后台更新。
- 用户显式点击刷新或执行下拉刷新时才展示刷新反馈。
- 空闲预热使用 Query prefetch，不通过提前挂载全部业务页面制造并发请求。

页面滚动位置按 tab key 保存。页面重新激活时在布局稳定后恢复，不在手势移动帧读写文档滚动位置。

## 空白区域与交互冲突

空白区域横滑是本设计的硬约束：

- 事件监听器安装在 `document` 捕获阶段。
- 不通过 pager、父容器或正文 `getBoundingClientRect` 限制起手范围。
- body 高度不足、加载态、空态和正文下方空白都必须产生同样的候选手势。
- 浏览器模式和 Android WebView 模式使用同一个手势状态机。

冲突处理规则：

- 输入框、textarea、select、编辑器和 `[data-swipe-ignore="true"]` 永不被 pager 抢占。
- 真正可横向滚动的 `[data-horizontal-scroll="true"]` 优先消费其可滚动方向；滚动到边缘后是否交接 pager 不在第一阶段实现。
- 卡片按钮可以通过 `[data-swipe-allow="true"]` 允许横滑；一旦进入 dragging，抑制该次点击。
- 未形成横向优势的斜滑和竖滑完全交给浏览器纵向滚动。

## 生产运行时

本地开发继续使用 Vite dev server。服务器和真机验收改用 H5 `dist` 生产产物，5174 不得再返回 `/@vite/client`、React Refresh 或源码 TSX。

生产服务需要：

- 构建并提供 `invest_assistant/ui/android/h5/dist`。
- `/api` 反向代理到现有 8000 API。
- HashRouter 的根文档回退保持可用。
- 静态资源使用内容哈希和长期缓存，`index.html` 使用可更新缓存策略。
- 根启停脚本、Android README 和 `docs/liuli_android_app_spec.md` 同步区分开发与生产运行方式。

采用 Nginx、现有反向代理或等价的静态服务实现属于部署细节；不得使用 Vite dev server 作为生产方案，也不得因此改变 React、Vite、Kotlin、Compose 或单 WebView 技术栈。

## 组件边界

`HorizontalTabPager` 负责：

- document 级手势状态机。
- 位移、速度、目标索引和吸附动画。
- 页面 LRU 和滚动位置。
- 向 motion sink 发布非 React 的视觉进度。

`SecondaryNavigation` 负责：

- 标签按钮和 active 语义。
- 缓存标签几何信息。
- 以 imperative transform 跟随 pager。
- 点击标签时调用 pager 的统一 settle 接口。

业务根页面负责：

- 保存最终 active key。
- 提供稳定的 tab 定义和页面工厂。
- 不保存逐帧 motion。

Android 原生层负责：

- 单 WebView、底部导航、系统返回和现有业务桥接。
- 不拥有 H5 二级 pager 的手势方向与动画状态。

## 测试设计

H5 单元和组件测试至少覆盖：

- 正文、加载态、空态和 body 空白区域均可起手横滑。
- 空白区域测试必须让触点位于 pager 或其父内容区域的测量范围之外。
- 竖滑和近对角线手势不翻页。
- 输入、编辑器和横向滚动区域不被抢占。
- 卡片横滑后抑制 click。
- 位移阈值和速度阈值分别可以完成翻页。
- 边界手势回弹且不改变 active key。
- 一次有效手势只提交一次 onChange。
- settling 可被新手势接管。
- motion 帧不触发根页面 React render。
- 热缓存页面往返不重复执行 queryFn。
- LRU 淘汰后恢复页面滚动位置。
- 原生 `liuli:native-swipe` 事件不再是 pager 所需契约。

静态和构建验证：

- H5 Vitest、TypeScript typecheck 和生产 build。
- Android `testDebugUnitTest`、lint 和 assembleDebug。
- `git diff --check`。
- 不运行数据库测试，不执行任何数据库修改或清理。

## 真机基线与验收

使用小米 17 和 Debug APK 采集改造前、改造后的同路径数据。真机必须连接生产 H5 资源，不能用 Vite dev server 结果冒充最终性能。

统一动作：

1. 冷启动后进入看板，等待首屏稳定。
2. 每组在同一组相邻 tab 间连续往返横滑 20 次。
3. 分别测试正文、长列表、空态和正文下方空白区域。
4. 重复测试资讯、笔记和待办。
5. 同时记录页面请求、主文档导航、onChange 次数和 Android 帧数据。

通过标准：

- 空白区域横滑成功率与正文区域一致。
- 连续横滑期间没有主文档 reload。
- 热缓存后横滑不产生重复 API 请求。
- 不出现先回弹再翻页的双阶段动画。
- 一次有效手势只产生一次 tab change。
- Frozen frames 为零，慢帧比例目标低于 `5%`。
- 主要手势帧控制在 `16.7ms` 内；高刷新率设备进一步记录 `8.3ms` 帧目标，但不以牺牲正确性为代价。
- 竖向滚动、斜滑、按钮点击和横向标签滚动没有明显误判。
- 每个 tab 的滚动位置可以恢复。

ADB 采样至少包括 `dumpsys gfxinfo` 的重置与前后快照；必要时增加 Perfetto 或 WebView DevTools trace，以定位主线程长任务、布局和网络请求，而不是只凭主观手感判断完成。

## 实施顺序

1. 建立渲染次数、空白区域、请求次数和原生事件契约的失败测试。
2. 移除根页面逐帧 motion state，建立 imperative motion sink。
3. 将 pager 收敛为单一 Pointer Event 状态机。
4. 删除原生 pager 方向判定和 `liuli:native-swipe` 桥接。
5. 实现有界页面缓存、稳定页面边界和 Query freshness policy。
6. 将服务器 5174 改为生产静态运行时，并同步规格和启停文档。
7. 完成自动化验证。
8. 在小米 17 上采集前后基线，依据 trace 微调阈值和吸附参数。

## 非目标

- 不改变五项底部导航和现有路由语义。
- 不迁移业务页面到原生 Compose。
- 不增加多个 WebView。
- 不修改后端接口或数据库。
- 不用固定延迟、无限延长缓存或关闭所有数据更新来掩盖性能问题。
