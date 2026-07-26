# Android H5 Smooth Pager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Android H5 pager's per-frame React/native dual gesture path with one document-level compositor-driven gesture engine that preserves blank-area swipes, avoids repeat page refreshes, and runs from production H5 assets on the Xiaomi 17.

**Architecture:** H5 owns one Pointer Event state machine and writes drag progress directly to pager and navigation DOM through an imperative motion sink. A three-entry LRU keeps recently visited pages and query data warm without pre-mounting every next page. Android retains the single WebView shell but removes its duplicate horizontal swipe detector; Linux serves the built H5 bundle rather than the Vite development runtime.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, TanStack React Query 5, Vite 5, Kotlin, Jetpack Compose, Android WebView, ADB/CDP.

## Global Constraints

- Keep Kotlin + Jetpack Compose, React + Vite, the single WebView, existing routes, and the five-item bottom navigation.
- Continue on the current branch; `AGENTS.md` forbids switching branches for the Liuli rewrite unless the user explicitly changes that instruction.
- The document capture listener must preserve swipes that start outside the measured pager/content surface, including the Tasks empty-state position around physical device `y=1700px`.
- Pointer-move frames must not call React state setters, React Query APIs, router APIs, or the Android JS bridge.
- Horizontal swipes must not directly refetch or invalidate queries.
- Cache at most three mounted pager pages; keep query data available after a page DOM is evicted.
- Local Windows development may keep Vite dev mode; Linux/server H5 port 5174 must serve a production build without `/@vite/client` or React Refresh.
- Do not add a second WebView, migrate business pages to Compose, change backend APIs, or modify any database.
- Do not run database tests or any command that clears, deletes, resets, drops, recreates, truncates, or modifies database data.
- Follow strict red-green-refactor TDD for every behavior change.

---

### Task 1: Introduce an imperative navigation motion sink

**Files:**
- Create: `invest_assistant/ui/android/h5/src/components/pagerMotion.ts`
- Modify: `invest_assistant/ui/android/h5/src/components/HorizontalTabPager.tsx`
- Modify: `invest_assistant/ui/android/h5/src/components/SecondaryNavigation.tsx`
- Modify: `invest_assistant/ui/android/h5/src/pages/DashboardPage.tsx`
- Modify: `invest_assistant/ui/android/h5/src/pages/NewsPage.tsx`
- Modify: `invest_assistant/ui/android/h5/src/pages/NotesPage.tsx`
- Modify: `invest_assistant/ui/android/h5/src/pages/TasksPage.tsx`
- Modify: `invest_assistant/ui/android/h5/tests/layout.test.tsx`

**Interfaces:**
- Produces:
  - `PagerMotion = { fromIndex: number; toIndex: number; progress: number; duration?: number }`
  - `PagerMotionSink = { setMotion(motion: PagerMotion | null): void }`
  - `SecondaryNavigation` accepts `ref?: ForwardedRef<PagerMotionSink>`.
- Consumes later: `HorizontalTabPager` receives `motionSink?: RefObject<PagerMotionSink | null>` in Task 2.

- [ ] **Step 1: Write a failing imperative-motion test**

Add a `createRef<PagerMotionSink>()` test to `layout.test.tsx`. Give the two tab buttons literal geometries of `(left=0,width=100)` and `(left=100,width=140)`, call:

```tsx
act(() => ref.current?.setMotion({ fromIndex: 0, toIndex: 1, progress: 0.5 }));
expect(indicator).toHaveStyle({
  transform: "translate3d(81.2px, 0, 0)",
  width: "57.6px"
});
```

Wrap `SecondaryNavigation` in a counting component and assert that calling `setMotion` does not increment its render count. This test catches reintroducing React state into the per-frame indicator path.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
cd invest_assistant/ui/android/h5
npm.cmd test -- tests/layout.test.tsx
```

Expected: FAIL because `SecondaryNavigation` does not expose a ref and still requires the `motion` prop.

- [ ] **Step 3: Add shared motion types and the imperative handle**

Create `pagerMotion.ts`:

```ts
export type PagerMotion = {
  fromIndex: number;
  toIndex: number;
  progress: number;
  duration?: number;
};

export type PagerMotionSink = {
  setMotion: (motion: PagerMotion | null) => void;
};
```

Convert `SecondaryNavigation` to `forwardRef`. Cache tab geometry in a ref, update it only after mount, `activeKey`/`items` changes, and ResizeObserver notifications. Implement `setMotion` by assigning `indicator.style.width`, `indicator.style.transform`, and `indicator.style.transitionDuration` directly. Do not call `setState` inside `setMotion`.

- [ ] **Step 4: Remove root-page motion state**

For Dashboard, News, Notes, and Tasks:

```tsx
const navigationMotion = useRef<PagerMotionSink | null>(null);
```

Pass the ref to `SecondaryNavigation`. Until Task 2 adds the direct sink prop, adapt the existing pager callback without React state:

```tsx
onMotionChange={(motion) => navigationMotion.current?.setMotion(motion)}
```

Move the `PagerMotion` type import in `HorizontalTabPager` to `pagerMotion.ts`. Remove each root page's `useState<PagerMotion | null>` and the navigation `motion` prop. Preserve the existing `pager.current?.requestChange(key)` click path.

- [ ] **Step 5: Run focused and root-page tests**

Run:

```powershell
npm.cmd test -- tests/layout.test.tsx tests/app.test.tsx
npm.cmd run typecheck
```

Expected: PASS with no React act warnings.

- [ ] **Step 6: Commit the motion-sink boundary**

```powershell
git add invest_assistant/ui/android/h5/src/components/pagerMotion.ts invest_assistant/ui/android/h5/src/components/HorizontalTabPager.tsx invest_assistant/ui/android/h5/src/components/SecondaryNavigation.tsx invest_assistant/ui/android/h5/src/pages/DashboardPage.tsx invest_assistant/ui/android/h5/src/pages/NewsPage.tsx invest_assistant/ui/android/h5/src/pages/NotesPage.tsx invest_assistant/ui/android/h5/src/pages/TasksPage.tsx invest_assistant/ui/android/h5/tests/layout.test.tsx
git commit -m "refactor(android): move pager motion off React state"
```

### Task 2: Replace the dual touch/native flow with one Pointer Event state machine

**Files:**
- Create: `invest_assistant/ui/android/h5/src/components/pagerGesture.ts`
- Modify: `invest_assistant/ui/android/h5/src/components/HorizontalTabPager.tsx`
- Modify: `invest_assistant/ui/android/h5/tests/pager.test.tsx`

**Interfaces:**
- Consumes: `PagerMotionSink` from Task 1.
- Produces:
  - `resolvePagerTarget(currentIndex, itemCount, release): number`
  - `PagerRelease = { deltaX: number; deltaY: number; velocityX: number; viewportWidth: number }`
  - `HorizontalTabPager` prop `motionSink?: RefObject<PagerMotionSink | null>`.

- [ ] **Step 1: Write pure release-decision tests**

Add literal cases that prove:

```ts
expect(resolvePagerTarget(1, 3, {
  deltaX: -80, deltaY: 4, velocityX: 0, viewportWidth: 400
})).toBe(1);

expect(resolvePagerTarget(1, 3, {
  deltaX: -90, deltaY: 4, velocityX: 0, viewportWidth: 400
})).toBe(2);

expect(resolvePagerTarget(1, 3, {
  deltaX: -30, deltaY: 3, velocityX: -800, viewportWidth: 400
})).toBe(2);

expect(resolvePagerTarget(1, 3, {
  deltaX: -30, deltaY: 80, velocityX: -900, viewportWidth: 400
})).toBe(1);
```

Also cover first/last boundaries and velocity opposite to displacement.

- [ ] **Step 2: Write component RED tests for document-level Pointer Events**

Replace native-event-specific tests with Pointer Event tests that:

- start on `document.body` at `(300,500)` while the measured content surface ends at `y=180`;
- move to `(180,508)`;
- verify `--pager-drag-x: -120px`;
- release and advance the computed settle timer;
- expect exactly one `onChange("track")`;
- dispatch a later `liuli:native-swipe` event and prove it has no effect.

Add a render-count assertion:

```tsx
const renderPage = vi.fn((key: string) => <div>{key}</div>);
// Record count after mount, dispatch multiple pointermove events, flush RAF.
expect(renderPage).toHaveBeenCalledTimes(countAfterMount);
```

This test catches any future per-frame React render.

- [ ] **Step 3: Run pager tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/pager.test.tsx
```

Expected: FAIL because the current component listens to Touch Events, waits for `liuli:native-swipe`, and calls the React motion callback.

- [ ] **Step 4: Implement release math**

Create `pagerGesture.ts` with these fixed first-pass policies:

```ts
const AXIS_RATIO = 1.25;
const DISTANCE_FRACTION = 0.22;
const MIN_FLING_DISTANCE = 24;
const FLING_VELOCITY = 700;
const PROJECTION_SECONDS = 0.18;
```

Require horizontal dominance. Commit when `abs(deltaX) >= viewportWidth * 0.22`, or when distance is at least 24 CSS px and velocity is at least 700 CSS px/s in the same direction. Use projected displacement only to choose direction; clamp the result to adjacent pages.

- [ ] **Step 5: Implement one document capture state machine**

In `HorizontalTabPager`:

- install `pointerdown`, `pointermove`, `pointerup`, and `pointercancel` on `document` in capture phase;
- use refs for state, start point, recent samples, drag X, axis, active pointer id, animation frame, and settle timer;
- use `document.elementFromPoint` and the existing ignore/allow semantics;
- decide the axis after 8 CSS px and use ratio `1.25`;
- during drag, schedule at most one RAF that writes `--pager-drag-x` and calls `motionSink.current?.setMotion(...)`;
- do not call React state setters in `pointermove`;
- on release, compute velocity from samples within the latest 100ms;
- apply `0.18` edge resistance on the first/last page;
- settle in `140-240ms` according to remaining distance;
- suppress a card click for 500ms after entering dragging;
- publish one `onChange` only after a committed settle;
- clear the motion sink and all RAF/timers on cancel/unmount.

Remove all `window.LiuliNative` branches, native fallback timers, and the `liuli:native-swipe` listener from the pager.

- [ ] **Step 6: Run pager tests to GREEN**

Run:

```powershell
npm.cmd test -- tests/pager.test.tsx
npm.cmd run typecheck
```

Expected: all pager tests PASS; fake timers must explicitly flush RAF callbacks.

- [ ] **Step 7: Commit the single gesture engine**

```powershell
git add invest_assistant/ui/android/h5/src/components/pagerGesture.ts invest_assistant/ui/android/h5/src/components/HorizontalTabPager.tsx invest_assistant/ui/android/h5/tests/pager.test.tsx
git commit -m "refactor(android): use one compositor pager gesture"
```

### Task 3: Add a three-page LRU and non-refreshing remount policy

**Files:**
- Create: `invest_assistant/ui/android/h5/src/components/pagerCache.ts`
- Create: `invest_assistant/ui/android/h5/src/queryClient.ts`
- Modify: `invest_assistant/ui/android/h5/src/components/HorizontalTabPager.tsx`
- Modify: `invest_assistant/ui/android/h5/src/main.tsx`
- Modify: `invest_assistant/ui/android/h5/tests/pager.test.tsx`
- Modify: `invest_assistant/ui/android/h5/tests/app.test.tsx`

**Interfaces:**
- Produces:
  - `touchPagerCache<T>(keys: readonly T[], key: T, protectedKeys?: readonly T[]): T[]`
  - `createMobileQueryClient(): QueryClient`.
- Cache invariant: no more than three mounted keys; active and transition target cannot be evicted during a settle.

- [ ] **Step 1: Write failing LRU behavior tests**

Use literal sequences:

```ts
expect(touchPagerCache(["today"], "market")).toEqual(["today", "market"]);
expect(touchPagerCache(["today", "market", "track"], "stock"))
  .toEqual(["market", "track", "stock"]);
expect(touchPagerCache(["today", "market", "track"], "stock", ["today"]))
  .toEqual(["today", "track", "stock"]);
```

Add a pager integration test proving:

- only the active page renders initially;
- the target page mounts once the horizontal axis locks;
- returning to a page still in the three-entry cache preserves its local input state;
- no fourth page remains in the DOM.

- [ ] **Step 2: Write a failing query remount test**

Create a real `QueryClient` with `createMobileQueryClient`, render a small pager page that calls `useQuery`, navigate until the first page is evicted, then return. Assert its query function was called once because cached data is reused and mount does not automatically refetch.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/pager.test.tsx tests/app.test.tsx
```

Expected: FAIL because the cache helper/query factory do not exist and the current pager pre-mounts both neighbors.

- [ ] **Step 4: Implement the cache and query factory**

`touchPagerCache` moves the touched key to the end, removes the oldest unprotected key, and returns at most three unique keys.

`createMobileQueryClient` returns:

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false
    }
  }
});
```

Move main.tsx construction to this factory.

- [ ] **Step 5: Integrate the LRU at gesture boundaries**

Initialize mounted keys with only `activeKey`. On axis lock or navigation click, add the target key before moving it. On settle completion, touch the new active key and preserve current/target keys during eviction. Render cached sections by stable key; hidden cached pages remain absolute and pointer-disabled. Preserve existing scroll-position map.

Do not update the LRU on each pointermove.

- [ ] **Step 6: Run focused tests to GREEN**

Run:

```powershell
npm.cmd test -- tests/pager.test.tsx tests/app.test.tsx
npm.cmd run typecheck
```

Expected: PASS; query functions are not repeated on cached remount.

- [ ] **Step 7: Commit lifecycle and freshness changes**

```powershell
git add invest_assistant/ui/android/h5/src/components/pagerCache.ts invest_assistant/ui/android/h5/src/queryClient.ts invest_assistant/ui/android/h5/src/components/HorizontalTabPager.tsx invest_assistant/ui/android/h5/src/main.tsx invest_assistant/ui/android/h5/tests/pager.test.tsx invest_assistant/ui/android/h5/tests/app.test.tsx
git commit -m "perf(android): cache pager pages without remount refresh"
```

### Task 4: Move drag/settle visuals fully onto compositor-friendly styles

**Files:**
- Modify: `invest_assistant/ui/android/h5/src/styles.css`
- Modify: `invest_assistant/ui/android/h5/tests/styles.test.mjs`

**Interfaces:**
- Consumes pager classes `is-dragging` and `is-settling`.
- Produces no TypeScript interface.

- [ ] **Step 1: Write a failing behavior-oriented style guard**

Extend the existing pager style test to require both dragging and settling states to opt into `will-change: transform`, while the idle page rule must not keep `will-change`. Require transform transitions only in `is-settling`.

- [ ] **Step 2: Run the style test and verify RED**

Run:

```powershell
npm.cmd test -- tests/styles.test.mjs
```

Expected: FAIL because `is-dragging` has no compositing rule.

- [ ] **Step 3: Implement the style states**

Use:

```css
.horizontal-tab-pager.is-dragging .horizontal-tab-pager__page,
.horizontal-tab-pager.is-settling .horizontal-tab-pager__page {
  will-change: transform;
}

.horizontal-tab-pager.is-settling .horizontal-tab-pager__page {
  transition: transform var(--pager-settle-duration) cubic-bezier(.2, .8, .2, 1);
}
```

Keep `contain: layout paint`, `translate3d`, background coverage, pointer-event isolation, and full-height surface rules that protect blank-area swipes.

- [ ] **Step 4: Run style and pager tests**

Run:

```powershell
npm.cmd test -- tests/styles.test.mjs tests/pager.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the compositor states**

```powershell
git add invest_assistant/ui/android/h5/src/styles.css invest_assistant/ui/android/h5/tests/styles.test.mjs
git commit -m "perf(android): isolate pager transform layers"
```

### Task 5: Remove the native duplicate swipe recognizer

**Files:**
- Modify: `invest_assistant/ui/android/app/src/main/java/com/liuli/app/MainActivity.kt`
- Delete: `invest_assistant/ui/android/app/src/main/java/com/liuli/app/hybrid/HorizontalSwipeDetector.kt`
- Delete: `invest_assistant/ui/android/app/src/test/java/com/liuli/app/hybrid/HorizontalSwipeDetectorTest.kt`

**Interfaces:**
- Removes `SwipeOutcome`, `HorizontalSwipeDetector`, and `liuli:native-swipe`.
- Preserves all `LiuliNative` methods for navigation state, theme, server, downloads, and logout.

- [ ] **Step 1: Re-run the single-owner H5 contract before native deletion**

Run:

```powershell
cd invest_assistant/ui/android/h5
npm.cmd test -- tests/bridge.test.ts tests/pager.test.tsx
```

Expected: PASS. Task 2's previously-red pager test proves a later `liuli:native-swipe` event cannot change the page; that behavioral guard makes native deletion safe. Do not add a source-text-only test for deleted code.

- [ ] **Step 2: Remove Android touch interception**

Delete the `VelocityTracker`, `HorizontalSwipeDetector`, and `SwipeOutcome` imports/state. Remove WebView `setOnTouchListener` and its `evaluateJavascript("liuli:native-swipe")` call. Do not change WebView settings, bottom navigation, back handling, loading behavior, or the existing JS interface.

Delete the detector source and its obsolete unit test.

- [ ] **Step 3: Run Android unit, lint, and assembly verification**

Run:

```powershell
$env:JAVA_HOME='D:\env\android\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
cd invest_assistant/ui/android
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug
```

Expected: `BUILD SUCCESSFUL`; remaining Android tests pass without the deleted detector.

- [ ] **Step 4: Commit native ownership cleanup**

```powershell
git add -A invest_assistant/ui/android/app/src/main/java/com/liuli/app invest_assistant/ui/android/app/src/test/java/com/liuli/app
git commit -m "refactor(android): remove duplicate native pager detector"
```

### Task 6: Serve production H5 assets on Linux port 5174

**Files:**
- Modify: `invest_assistant/ui/android/h5/package.json`
- Modify: `invest_assistant/ui/android/h5/vite.config.ts`
- Modify: `start.sh`
- Modify: `stop.sh`
- Modify: `invest_assistant/ui/android/README.md`
- Modify: `docs/liuli_android_app_spec.md`
- Create: `invest_assistant/ui/android/h5/tests/runtime.test.mjs`

**Interfaces:**
- Produces npm script `serve`: `vite preview`.
- Linux start contract: build H5, then serve `dist` on `0.0.0.0:5174`.
- Windows `start.bat` remains the local-development Vite dev path.

- [ ] **Step 1: Write a failing runtime integration test**

Use Node's child process API from `runtime.test.mjs` to start:

```text
npm.cmd run serve -- --host 127.0.0.1 --port 15174
```

against an existing `dist`, wait until the port responds, request `/`, and assert:

- status 200;
- HTML references hashed `/assets/` files;
- HTML does not contain `/@vite/client` or `react-refresh`;
- a request to `/api/auth/me` reaches a controlled local proxy target configured through `VITE_API_PROXY_TARGET`.

Terminate only the child process created by the test.

- [ ] **Step 2: Run build plus runtime test and verify RED**

Run:

```powershell
cd invest_assistant/ui/android/h5
npm.cmd run build
node --test tests/runtime.test.mjs
```

Expected: FAIL because `serve` and the preview proxy are not configured.

- [ ] **Step 3: Add preview runtime and shared proxy configuration**

Add:

```json
"serve": "vite preview"
```

Factor the proxy target in `vite.config.ts` once and apply the same `/api` proxy to `server.proxy` and `preview.proxy`. Set `preview.port = 5174` and `strictPort = true`.

- [ ] **Step 4: Change Linux lifecycle scripts**

In `start.sh`, after dependency installation:

```bash
cd "$H5_DIR"
npm run build
nohup npm run serve -- --host 0.0.0.0 --port 5174 > "$LOG_DIR/h5.log" 2>&1 &
```

Update `stop.sh` H5 command patterns from dev-only matching to include `npm run serve`, `vite preview`, and port 5174. Preserve exact PID-file and port ownership safeguards.

- [ ] **Step 5: Update authoritative Android docs**

In README and `docs/liuli_android_app_spec.md`, state:

- Windows/local development uses `npm run dev`;
- Linux/server start builds `dist` and runs the production bundle on 5174;
- `/api` remains proxied to 8000;
- production responses must not contain Vite client/React Refresh;
- the single WebView and frontend technology stack are unchanged.

- [ ] **Step 6: Run runtime and shell syntax checks**

Run:

```powershell
cd invest_assistant/ui/android/h5
npm.cmd run build
node --test tests/runtime.test.mjs
npm.cmd test
npm.cmd run typecheck
```

If WSL or bash is available, also run:

```bash
bash -n start.sh stop.sh
```

Expected: production HTML guard and proxy integration PASS; no test starts or modifies a database.

- [ ] **Step 7: Commit production runtime**

```powershell
git add invest_assistant/ui/android/h5/package.json invest_assistant/ui/android/h5/vite.config.ts invest_assistant/ui/android/h5/tests/runtime.test.mjs start.sh stop.sh invest_assistant/ui/android/README.md docs/liuli_android_app_spec.md
git commit -m "perf(android): serve built H5 assets on Linux"
```

### Task 7: Full verification and Xiaomi 17 before/after acceptance

**Files:**
- Modify if measured thresholds require it: `invest_assistant/ui/android/h5/src/components/pagerGesture.ts`
- Modify with final measured values: `docs/superpowers/specs/2026-07-26-android-h5-gesture-performance-design.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces final automated and true-device evidence.

- [ ] **Step 1: Run complete non-database verification**

Run:

```powershell
cd invest_assistant/ui/android/h5
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
node --test tests/runtime.test.mjs

$env:JAVA_HOME='D:\env\android\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
cd ..
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug

cd D:\code\ai\liuli-v2
git diff --check
git status --short
```

Expected: all commands PASS and only intended tracked files are modified.

- [ ] **Step 2: Install the latest Debug APK**

Run:

```powershell
adb install -r invest_assistant/ui/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am force-stop com.liuli.app.debug
adb shell am start -W -n com.liuli.app.debug/com.liuli.app.MainActivity
```

Confirm `dumpsys package com.liuli.app.debug` shows the new update time.

- [ ] **Step 3: Connect the phone to production H5 assets**

Run the built H5 runtime locally on 5174 with `VITE_API_PROXY_TARGET=http://115.29.176.240:8000`, then:

```powershell
adb reverse tcp:5174 tcp:5174
$appPid = (adb shell pidof com.liuli.app.debug).Trim()
adb forward tcp:9223 "localabstract:webview_devtools_remote_$appPid"
```

Connect CDP to the forwarded WebView and evaluate:

```js
window.LiuliNative.setServer("http://127.0.0.1:5174/")
```

Restart the app and verify the root HTML contains hashed `/assets/` URLs and no `/@vite/client`.

- [ ] **Step 4: Repeat the exact warm-cache profile**

On Dashboard Market/Track, execute 20 alternating swipes at physical `y=650px`. Capture:

- main-frame navigations and API requests through WebView CDP;
- `Performance.getMetrics` deltas for LayoutCount, RecalcStyleCount, ScriptDuration, TaskDuration, JSHeapUsedSize, and Nodes;
- `adb shell dumpsys gfxinfo com.liuli.app.debug reset` before and the summary after.

Acceptance:

- zero main-frame reloads;
- zero API requests after warm cache;
- one tab commit per gesture;
- RecalcStyleCount and ScriptDuration materially below the recorded 757 / 2.45s baseline;
- p95 materially below 17ms and no frozen frames.

- [ ] **Step 5: Repeat cold cross-tab and blank-area profiles**

Cold-start, wait for Today, swipe to Portfolio and back exactly eight times. Confirm hidden-neighbor preloading no longer requests pages before they become the actual target, cache size never exceeds three, and memory/layout deltas are below the 18.2MB / 383-layout baseline.

Open Tasks Alerts empty state and swipe right from physical `(180,1700)` to `(1050,1700)`. Confirm it reaches AI Suggestions. Also manually verify vertical scrolling, near-diagonal movement, editor exclusion, horizontal nav scrolling, and card-click suppression.

- [ ] **Step 6: Tune only from measured evidence**

If the device rejects too many short flings, adjust only `FLING_VELOCITY` within `650-750`. If it commits too easily, adjust only `DISTANCE_FRACTION` within `0.20-0.24`. For any change, first update the literal unit test, watch it fail, change the constant, rerun focused tests, and repeat the same device gesture.

- [ ] **Step 7: Record final evidence and commit**

Append the after-values and comparison to the design document without weakening acceptance criteria.

```powershell
git add docs/superpowers/specs/2026-07-26-android-h5-gesture-performance-design.md invest_assistant/ui/android/h5/src/components/pagerGesture.ts
git commit -m "test(android): record smooth pager device acceptance"
```

## Completion Gate

- Every behavior change has a test that was observed failing before production code changed.
- H5 full tests, typecheck, build, production-runtime integration, Android unit tests, lint, assemble, and `git diff --check` all pass.
- True-device blank-area swipe still succeeds.
- True-device warm and cold profiles improve against the recorded baselines; functional success alone is insufficient.
- Production H5 HTML does not contain Vite development runtime markers.
- No database test or database mutation command was run.
