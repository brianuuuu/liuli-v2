# Android Page Pull-to-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable page-scoped pull-to-refresh interaction and use it to reorder and refresh the Android H5 portfolio dashboard.

**Architecture:** A business-agnostic `PullToRefresh` component owns touch direction locking, resistance, indicator state, and recovery. Each page supplies its own async refresh callback; the portfolio page supplies its current React Query `refetch`, so no global cache or unrelated dashboard is refreshed.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest, Testing Library, CSS, Vite, Playwright CLI.

## Global Constraints

- Pull-to-refresh is scoped to the current content page and must not refresh sibling dashboard tabs.
- The trigger distance is `64px`; resisted visual displacement is capped at `88px`.
- Horizontal gestures remain owned by `HorizontalTabPager`.
- Interactive elements and `[data-swipe-ignore="true"]` do not start pull-to-refresh.
- The portfolio order is: four asset metrics, 今日表现, 标的组合, 标的热力图, 组合选择.
- Remove the 标的组合 refresh button.
- Do not change backend APIs, database state, cache protocols, or portfolio calculations.
- Do not run database tests or any command that clears or modifies database data.

---

### Task 1: Reusable Page-Scoped Pull-to-Refresh

**Files:**
- Create: `invest_assistant/ui/android/h5/src/components/PullToRefresh.tsx`
- Create: `invest_assistant/ui/android/h5/tests/pull-to-refresh.test.tsx`
- Modify: `invest_assistant/ui/android/h5/src/styles.css`
- Modify: `invest_assistant/ui/android/h5/tests/styles.test.mjs`

**Interfaces:**
- Consumes: browser touch events and the current document scroll position.
- Produces:
  ```ts
  export type PullToRefreshProps = {
    children: ReactNode;
    onRefresh: () => Promise<unknown>;
    disabled?: boolean;
    ariaLabel?: string;
  };

  export function PullToRefresh(props: PullToRefreshProps): JSX.Element;
  ```

- [ ] **Step 1: Write failing gesture tests**

Create `tests/pull-to-refresh.test.tsx` with a deferred Promise helper and a touch helper:

```tsx
function touch(target: Element, type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) {
  const point = { identifier: 1, clientX: x, clientY: y, target };
  fireEvent[type](target, {
    touches: type === "touchEnd" ? [] : [point],
    changedTouches: [point]
  });
}
```

Cover these exact cases:

```tsx
it("refreshes once after a top-of-page vertical pull passes 64px", async () => {
  const refresh = deferred<void>();
  const onRefresh = vi.fn(() => refresh.promise);
  render(<PullToRefresh onRefresh={onRefresh}><div>内容</div></PullToRefresh>);
  const region = screen.getByLabelText("下拉刷新");

  touch(region, "touchStart", 120, 100);
  touch(region, "touchMove", 122, 190);
  expect(screen.getByText("释放刷新")).toBeInTheDocument();
  touch(region, "touchEnd", 122, 190);
  expect(onRefresh).toHaveBeenCalledOnce();
  expect(screen.getByText("正在刷新")).toBeInTheDocument();

  touch(region, "touchStart", 120, 100);
  touch(region, "touchMove", 120, 200);
  touch(region, "touchEnd", 120, 200);
  expect(onRefresh).toHaveBeenCalledOnce();

  refresh.resolve();
  await waitFor(() => expect(screen.queryByText("正在刷新")).not.toBeInTheDocument());
});
```

Also verify:

- a `50px` vertical pull does not refresh;
- a horizontal-dominant move does not refresh;
- `window.scrollY > 0` does not refresh;
- a gesture starting on a button or `[data-swipe-ignore="true"]` does not refresh;
- a rejected Promise shows `刷新失败，请重试`, preserves children, then clears the message.

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```powershell
cd invest_assistant/ui/android/h5
npm.cmd test -- --run tests/pull-to-refresh.test.tsx
```

Expected: FAIL because `../src/components/PullToRefresh` does not exist.

- [ ] **Step 3: Implement the shared component**

Create `PullToRefresh.tsx` with:

```ts
const TRIGGER_DISTANCE = 64;
const MAX_DISTANCE = 88;
const AXIS_LOCK_DISTANCE = 8;
const VERTICAL_BIAS = 1.2;
```

Use native listeners on the wrapper:

- `touchstart` stores the first touch only when the page is at the top, refresh is idle, the component is enabled, and the target does not match `button, input, textarea, select, a, [contenteditable], [data-swipe-ignore="true"]`.
- `touchmove` waits for `8px`, then locks to vertical only when `deltaY > 0` and `abs(deltaY) > abs(deltaX) * 1.2`.
- A horizontal lock cancels only this component; it never calls `preventDefault`, allowing `HorizontalTabPager` to continue.
- A vertical lock calls `preventDefault` from a `{ passive: false }` listener and calculates:

```ts
const resistedDistance = Math.min(MAX_DISTANCE, deltaY * 0.55);
```

- `touchend` starts refresh only when the raw vertical drag distance is at least `64px`; resistance affects presentation, not the trigger threshold.
- While refreshing, ignore new gestures.
- Await `onRefreshRef.current()`. On success, return to idle; on rejection show the error state for `1200ms`, then return to idle.
- Clean up listeners and timers on unmount.
- Keep the latest callback in a ref so query rerenders do not rebuild listeners.

Render:

```tsx
<div
  ref={rootRef}
  className={`pull-to-refresh pull-to-refresh--${status}`}
  style={{ "--pull-distance": `${distance}px` } as CSSProperties}
  aria-label={ariaLabel}
>
  <div className="pull-to-refresh__indicator" role="status" aria-live="polite">
    {status === "refreshing" ? <RefreshCw className="pull-to-refresh__spinner" size={15} /> : null}
    {status === "ready" ? "释放刷新" :
      status === "refreshing" ? "正在刷新" :
      status === "error" ? "刷新失败，请重试" :
      status === "pulling" ? "下拉刷新" : ""}
  </div>
  <div className="pull-to-refresh__content">{children}</div>
</div>
```

- [ ] **Step 4: Add focused styles and style assertions**

Add CSS that keeps the indicator in normal page scope without permanent layout space:

```css
.pull-to-refresh { --pull-distance: 0px; position: relative; min-width: 0; }
.pull-to-refresh__indicator {
  position: absolute;
  z-index: 1;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  height: 40px;
  align-items: center;
  justify-content: center;
  transform: translate3d(0, calc(var(--pull-distance) - 40px), 0);
  color: var(--muted);
  font-size: 12px;
  pointer-events: none;
}
.pull-to-refresh__content {
  min-width: 0;
  transform: translate3d(0, var(--pull-distance), 0);
}
.pull-to-refresh--refreshing .pull-to-refresh__content,
.pull-to-refresh--error .pull-to-refresh__content,
.pull-to-refresh--idle .pull-to-refresh__content {
  transition: transform 180ms cubic-bezier(.2, .8, .2, 1);
}
.pull-to-refresh__spinner { animation: pull-to-refresh-spin .8s linear infinite; }
@keyframes pull-to-refresh-spin { to { transform: rotate(360deg); } }
```

Add a style test that asserts relative wrapper positioning, absolute `40px` indicator, CSS-variable content transform, spinner animation, and no fixed/sticky positioning.

- [ ] **Step 5: Run focused tests and type checking**

Run:

```powershell
npm.cmd test -- --run tests/pull-to-refresh.test.tsx tests/styles.test.mjs
npm.cmd run typecheck
```

Expected: all selected tests pass and TypeScript exits `0`.

- [ ] **Step 6: Commit the shared component**

```powershell
git add invest_assistant/ui/android/h5/src/components/PullToRefresh.tsx `
  invest_assistant/ui/android/h5/tests/pull-to-refresh.test.tsx `
  invest_assistant/ui/android/h5/src/styles.css `
  invest_assistant/ui/android/h5/tests/styles.test.mjs
git commit -m "feat(android): add page-scoped pull refresh"
```

---

### Task 2: Reorder and Refresh the Portfolio Dashboard

**Files:**
- Modify: `invest_assistant/ui/android/h5/src/pages/DashboardPage.tsx:1-190`
- Modify: `invest_assistant/ui/android/h5/src/styles.css:240-280`
- Modify: `invest_assistant/ui/android/h5/tests/app.test.tsx:733-830`

**Interfaces:**
- Consumes:
  ```ts
  PullToRefresh({
    onRefresh: () => Promise<unknown>,
    ariaLabel?: string
  })
  ```
- Produces: a portfolio dashboard whose pull gesture refetches only `["portfolio-overview", portfolioId]`.

- [ ] **Step 1: Update the portfolio integration test and verify RED**

Change the existing portfolio test to assert this DOM order:

```ts
expect(totalValue.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
expect(today.compareDocumentPosition(allocation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
expect(allocation.compareDocumentPosition(treemap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
expect(treemap.compareDocumentPosition(selector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
```

Replace the old refresh-button assertion with:

```ts
expect(screen.queryByLabelText("刷新标的组合")).not.toBeInTheDocument();
const pullRegion = screen.getByLabelText("组合页下拉刷新");
```

After selecting `成长组合`, perform a vertical pull from `y=100` to `y=230` on `pullRegion`, release it, and verify the overview request with `portfolio_id=7` occurs one additional time. Assert no workbench, ranking, track, or stock endpoint gains a request.

Run:

```powershell
npm.cmd test -- --run tests/app.test.tsx -t "places the compact target portfolio"
```

Expected: FAIL because the current order is selector-first, the old refresh button still exists, and no pull region is rendered.

- [ ] **Step 2: Reorder the portfolio JSX**

In `PortfolioDashboard`:

1. Import `PullToRefresh`.
2. Remove the `RefreshCw` import if no other dashboard section uses it.
3. Wrap the portfolio page stack:

```tsx
<PullToRefresh
  ariaLabel="组合页下拉刷新"
  onRefresh={async () => {
    const result = await overview.refetch();
    if (result.isError) throw result.error;
  }}
>
  <div className="page-stack portfolio-dashboard-mobile">
    {/* metrics, today, allocation, treemap, selector */}
  </div>
</PullToRefresh>
```

4. Move the existing `.metric-grid` to the top.
5. Keep 今日表现 second.
6. Render 标的组合 without the `action` prop.
7. Keep 标的热力图 fourth.
8. Move the unchanged combination selector card to the bottom.

Do not change `portfolioId`, the query key, `pieItems`, chart data mapping, or empty-state text.

- [ ] **Step 3: Remove obsolete refresh-button CSS**

Delete:

```css
.portfolio-refresh { ... }
.portfolio-refresh:active { ... }
.portfolio-refresh .is-spinning { ... }
@keyframes portfolio-refresh-spin { ... }
```

Add a style assertion that the stylesheet no longer contains `.portfolio-refresh`.

- [ ] **Step 4: Run portfolio and gesture tests**

Run:

```powershell
npm.cmd test -- --run tests/app.test.tsx tests/pull-to-refresh.test.tsx tests/styles.test.mjs
npm.cmd run typecheck
```

Expected: selected tests pass and TypeScript exits `0`.

- [ ] **Step 5: Commit portfolio integration**

```powershell
git add invest_assistant/ui/android/h5/src/pages/DashboardPage.tsx `
  invest_assistant/ui/android/h5/src/styles.css `
  invest_assistant/ui/android/h5/tests/app.test.tsx `
  invest_assistant/ui/android/h5/tests/styles.test.mjs
git commit -m "feat(android): refresh portfolio with pull gesture"
```

---

### Task 3: Full Verification and Responsive Acceptance

**Files:**
- Verify only; modify implementation or tests only when a verification failure identifies a concrete defect.

**Interfaces:**
- Consumes: the completed shared component and portfolio integration.
- Produces: fresh evidence that the feature works across the supported Android H5 widths and themes.

- [ ] **Step 1: Run Android H5 full tests**

```powershell
cd invest_assistant/ui/android/h5
npm.cmd test
```

Expected: every Vitest file and test passes.

- [ ] **Step 2: Run TypeScript and production build**

```powershell
npm.cmd run typecheck
npm.cmd run build
```

Expected: both commands exit `0`; the standing Vite chunk-size warning, if present, is informational.

- [ ] **Step 3: Check repository differences**

From the repository root:

```powershell
git diff --check
git status --short --branch
```

Expected: no whitespace errors and no unexpected database, build, or browser-artifact changes.

- [ ] **Step 4: Verify real browser behavior**

Use Playwright CLI against the Android H5 development server with mocked read-only API responses.

At `320px`, `360px`, `407px`, and `412px`:

- confirm `document.documentElement.scrollWidth === window.innerWidth`;
- confirm the first portfolio content is `总市值`;
- confirm `组合选择` is below `标的热力图`;
- confirm a horizontal swipe still changes dashboard tabs;
- return to 组合, scroll to the top, pull past `64px`, and confirm exactly one portfolio overview request is added;
- scroll below the top and confirm the same pull does not add a request.

Repeat the `407px` check in dark theme and confirm the browser console has no errors.

- [ ] **Step 5: Final verification summary**

Record exact passing test counts, build exit status, checked viewport widths, theme result, and current Git commit IDs. Do not run database tests.
