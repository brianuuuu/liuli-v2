# Android Dashboard Material Feeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Today pull-to-refresh, switch Market defaults and ranking types, and replace Track and Stock dashboard summaries with paginated material feeds.

**Architecture:** The existing Stock material response is enriched with stock name and code through its existing relation. Today reuses the page-scoped `PullToRefresh`; Track and Stock use separate `useInfiniteQuery` instances, while a shared `DashboardMaterialFeed` owns normalized material rendering and the `IntersectionObserver` load sentinel.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest, Testing Library, CSS, Vite, Playwright CLI.

## Global Constraints

- Market ranking types are exactly `all / track / stock`, displayed as `市场 / 赛道 / 标的`.
- Market defaults to `all + 7d`.
- Track and Stock material pages use `limit=10`.
- Direction mapping is `support=利好`, `weaken=利空`, `neutral=中性`; `noise` and missing values render no badge.
- Only Today gains top pull-to-refresh in this change.
- Keep backend paths and request parameters unchanged; only add optional `stock_name` and `stock_code` response fields.
- Do not modify database state, material ordering, or material status rules.
- Do not run database tests or commands that clear or modify database data.

---

### Task 1: Enrich Stock Material Responses

**Files:**
- Modify: `invest_assistant/modules/stock_analysis/schemas.py`
- Modify: `invest_assistant/modules/stock_analysis/service.py`
- Modify: `tests/unit/test_paged_list_contracts.py`

**Interfaces:**
- Produces optional `stock_name` and `stock_code` fields on existing `StockMaterialRead` responses.

- [ ] **Step 1: Write the failing isolated service test**

Extend the existing `tmp_path`-backed test in `test_paged_list_contracts.py`. Seed one Stock and one StockMaterial, call:

```py
page = stock_service.list_all_stock_materials_page(db, limit=10, offset=0)
assert page.items[0]["stock_name"] == "宁德时代"
assert page.items[0]["stock_code"] == "300750"
```

The test uses only the file under pytest `tmp_path`, calls `Base.metadata.create_all` on that new database, and never drops, resets, or opens `var/db/liuli.sqlite3`.

- [ ] **Step 2: Run the test and verify RED**

Create a unique repository-local `TEMP` and `TMP`, then run:

```powershell
pytest -q tests/unit/test_paged_list_contracts.py -k "stock_material"
```

Expected: FAIL because the two keys are absent.

- [ ] **Step 3: Implement the backward-compatible response**

Add to `StockMaterialRead`:

```py
stock_name: str | None = None
stock_code: str | None = None
```

In `_stock_materials_page`, load the Stock rows for the page's unique `stock_id` values in one query, build `stock_by_id`, and pass it to `_stock_material_dict`. Extend `_stock_material_dict` to emit the related name and code without adding per-row queries.

- [ ] **Step 4: Verify and commit Task 1**

```powershell
pytest -q tests/unit/test_paged_list_contracts.py -k "stock_material"
git add invest_assistant/modules/stock_analysis/schemas.py `
  invest_assistant/modules/stock_analysis/service.py `
  tests/unit/test_paged_list_contracts.py
git commit -m "feat(stock): include identity in material pages"
```

---

### Task 2: Shared Material Feed and Paginated API Types

**Files:**
- Create: `invest_assistant/ui/android/h5/src/components/DashboardMaterialFeed.tsx`
- Create: `invest_assistant/ui/android/h5/tests/dashboard-material-feed.test.tsx`
- Modify: `invest_assistant/ui/android/h5/src/types/api.ts`
- Modify: `invest_assistant/ui/android/h5/src/api/mobileApi.ts`
- Modify: `invest_assistant/ui/android/h5/src/styles.css`
- Modify: `invest_assistant/ui/android/h5/tests/styles.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export type TrackMaterial = {
    id: number;
    track_id: number;
    track_name?: string | null;
    direction?: string | null;
    material_title?: string | null;
    material_summary?: string | null;
    material_source_name?: string | null;
    material_time?: string | null;
  };

  export type StockMaterial = {
    id: number;
    stock_id: number;
    stock_name?: string | null;
    stock_code?: string | null;
    impact_direction?: string | null;
    material_title?: string | null;
    material_summary?: string | null;
    material_source_name?: string | null;
    material_time?: string | null;
  };

  trackMaterials(offset?: number, limit?: number): Promise<PageDto<TrackMaterial>>;
  stockMaterials(offset?: number, limit?: number): Promise<PageDto<StockMaterial>>;
  ```
- Produces:
  ```ts
  export type DashboardMaterialItem = {
    id: number;
    entityName: string;
    entityCode?: string | null;
    direction?: string | null;
    title?: string | null;
    summary?: string | null;
    sourceName?: string | null;
    materialTime?: string | null;
  };
  ```

- [ ] **Step 1: Write failing shared-component tests**

Create tests that render real `DashboardMaterialFeed` items and assert:

```tsx
expect(screen.getByText("半导体")).toBeInTheDocument();
expect(screen.getByText("利好")).toHaveClass("material-direction--positive");
expect(screen.getByText("利空")).toHaveClass("material-direction--negative");
expect(screen.getByText("中性")).toHaveClass("material-direction--neutral");
expect(screen.queryByText("噪声")).not.toBeInTheDocument();
expect(screen.getByText("来源 A · 2026/07/29 10:00")).toBeInTheDocument();
```

Use a controllable `IntersectionObserver` fake. Invoke its callback twice with `isIntersecting=true` while loading is initially false and assert the component's immediate request guard calls `onLoadMore` once. Rerender through loading true and back to false, then verify a later intersection can call it again.

Also cover:

- no `IntersectionObserver` renders a `加载更多` button;
- next-page error preserves items and renders `重试加载`;
- `hasNextPage=false` renders `没有更多材料`;
- empty items render `暂无最新材料`.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
cd invest_assistant/ui/android/h5
npm.cmd test -- --run tests/dashboard-material-feed.test.tsx
```

Expected: module resolution fails because `DashboardMaterialFeed.tsx` does not exist.

- [ ] **Step 3: Add API types and client methods**

Add `TrackMaterial` and `StockMaterial` to `types/api.ts`. Add:

```ts
trackMaterials: (offset = 0, limit = 10) =>
  apiClient.get<PageDto<TrackMaterial>>("/api/track-discovery/materials", { offset, limit }),
stockMaterials: (offset = 0, limit = 10) =>
  apiClient.get<PageDto<StockMaterial>>("/api/stock-analysis/materials", { offset, limit }),
```

Keep the existing dashboard client methods for compatibility.

- [ ] **Step 4: Implement the shared material feed**

`DashboardMaterialFeed` props:

```ts
type Props = {
  items: DashboardMaterialItem[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  onLoadMore: () => void;
};
```

Requirements:

- normalize direction with a literal mapping object;
- use `formatDateTime` for time and `--` for missing title/entity/source-time;
- render summaries only when non-empty;
- observe one bottom sentinel;
- call `onLoadMore` only when intersecting, `hasNextPage=true`, loading false, and next-page error false;
- disconnect the observer on rerender and unmount;
- show manual `加载更多` when `IntersectionObserver` is unavailable;
- show `重试加载` when the next page failed.

- [ ] **Step 5: Add continuous-list styles**

Add `.dashboard-material-list`, `.dashboard-material-item`, entity row, direction badge, title, two-line summary, metadata, and load-sentinel styles. Use borders and theme variables only; do not add shadows or gradients.

Add style assertions for:

- continuous list with zero gap;
- item-to-item divider;
- summary `-webkit-line-clamp: 2`;
- positive red, negative green, neutral muted colors;
- entity/title `min-width: 0` and ellipsis/wrapping.

- [ ] **Step 6: Verify and commit Task 2**

```powershell
npm.cmd test -- --run tests/dashboard-material-feed.test.tsx tests/styles.test.mjs
npm.cmd run typecheck
git add invest_assistant/ui/android/h5/src/components/DashboardMaterialFeed.tsx `
  invest_assistant/ui/android/h5/tests/dashboard-material-feed.test.tsx `
  invest_assistant/ui/android/h5/src/types/api.ts `
  invest_assistant/ui/android/h5/src/api/mobileApi.ts `
  invest_assistant/ui/android/h5/src/styles.css `
  invest_assistant/ui/android/h5/tests/styles.test.mjs
git commit -m "feat(android): add paginated material feed"
```

---

### Task 3: Today and Market Dashboard Behavior

**Files:**
- Modify: `invest_assistant/ui/android/h5/src/pages/DashboardPage.tsx`
- Modify: `invest_assistant/ui/android/h5/src/api/mobileApi.ts`
- Modify: `invest_assistant/ui/android/h5/tests/app.test.tsx`

**Interfaces:**
- Consumes: existing `PullToRefresh`.
- Produces: Today refresh of its two queries and Market defaults of `all + 7d`.

- [ ] **Step 1: Write failing integration tests**

Add an app test that pulls `aria-label="今日看板下拉刷新"` from `y=100` to `y=230` and verifies exactly one additional call each to:

```text
/api/console/workbench-today
/api/reports?offset=0&limit=4
```

Assert no market ranking, track materials, stock materials, or portfolio overview request is added.

Update the market test to require:

```ts
expect(initialUrl).toContain("type=all");
expect(initialUrl).toContain("window=7d");
expect(screen.getByRole("button", { name: "标的" })).toHaveAttribute("aria-pressed", "false");
```

Click 标的 and verify `type=stock&window=7d`. Assert 标签 no longer appears.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm.cmd test -- --run tests/app.test.tsx -t "refreshes only the today dashboard|places market heat filters"
```

Expected: Today has no pull region; Market still defaults to `24h` and renders 标签.

- [ ] **Step 3: Implement Today pull refresh**

Wrap the Today page stack:

```tsx
<PullToRefresh
  ariaLabel="今日看板下拉刷新"
  onRefresh={async () => {
    const [marketResult, reportsResult] = await Promise.all([market.refetch(), reports.refetch()]);
    if (marketResult.isError) throw marketResult.error;
    if (reportsResult.isError) throw reportsResult.error;
  }}
>
  <div className="page-stack">...</div>
</PullToRefresh>
```

Do not change initial loading or card rendering.

- [ ] **Step 4: Update Market state and type**

Change:

```ts
export type MarketRankingType = "all" | "track" | "stock";
const [rankingWindow, setRankingWindow] = useState<MarketRankingWindow>("7d");
```

Render `["stock", "标的"]` instead of `["hotword", "标签"]`.

- [ ] **Step 5: Verify and commit Task 3**

```powershell
npm.cmd test -- --run tests/app.test.tsx tests/pull-to-refresh.test.tsx
npm.cmd run typecheck
git add invest_assistant/ui/android/h5/src/pages/DashboardPage.tsx `
  invest_assistant/ui/android/h5/src/api/mobileApi.ts `
  invest_assistant/ui/android/h5/tests/app.test.tsx
git commit -m "feat(android): refresh today and update market filters"
```

---

### Task 4: Track and Stock Infinite Material Dashboards

**Files:**
- Modify: `invest_assistant/ui/android/h5/src/pages/DashboardPage.tsx`
- Modify: `invest_assistant/ui/android/h5/tests/app.test.tsx`

**Interfaces:**
- Consumes:
  ```ts
  mobileApi.trackMaterials(offset, 10)
  mobileApi.stockMaterials(offset, 10)
  DashboardMaterialFeed
  ```
- Produces query keys `["track-materials"]` and `["stock-materials"]`.

- [ ] **Step 1: Write failing Track and Stock tests**

For Track, return a first page with `has_more=true` and a second page for `offset=10`. Verify:

- only 最新材料 remains;
- 升温赛道, 重点赛道, 赛道热度 are absent;
- track name, title, summary, source/time, and 利好 render;
- invoking the observer requests `limit=10&offset=10` and appends the second page.

For Stock, verify:

- 标的池, 重点标的, 评分排行 are absent;
- stock name/code, title, summary, source/time, and 利空 render;
- the second page appends after observer intersection.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm.cmd test -- --run tests/app.test.tsx -t "shows the track material feed|shows the stock material feed"
```

Expected: old dashboard cards render and material endpoints are not requested.

- [ ] **Step 3: Implement Track infinite query**

Use:

```ts
const query = useInfiniteQuery({
  queryKey: ["track-materials"],
  initialPageParam: 0,
  queryFn: ({ pageParam }) => mobileApi.trackMaterials(pageParam, 10),
  getNextPageParam: (lastPage) =>
    lastPage.has_more ? lastPage.offset + lastPage.items.length : undefined,
  staleTime: 300_000
});
```

Flatten pages and map `direction`, `track_name`, title, summary, source, and time into `DashboardMaterialItem`. Render one `SectionCard title="最新材料"`.

- [ ] **Step 4: Implement Stock infinite query**

Use the same pagination shape with query key `["stock-materials"]` and `mobileApi.stockMaterials`. Map `impact_direction` to `direction`, plus stock name and code.

For initial errors render the existing `ErrorState` inside the 最新材料 card. For later-page errors pass `isFetchNextPageError` and `fetchNextPage` to the shared feed so loaded rows remain visible.

- [ ] **Step 5: Verify and commit Task 4**

```powershell
npm.cmd test -- --run tests/app.test.tsx tests/dashboard-material-feed.test.tsx tests/styles.test.mjs
npm.cmd run typecheck
git add invest_assistant/ui/android/h5/src/pages/DashboardPage.tsx `
  invest_assistant/ui/android/h5/tests/app.test.tsx
git commit -m "feat(android): show infinite dashboard materials"
```

---

### Task 5: Full Verification

**Files:**
- Verify only unless a concrete failure requires a TDD fix.

- [ ] **Step 1: Run full Android H5 checks**

```powershell
cd invest_assistant/ui/android/h5
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

- [ ] **Step 2: Check repository state**

```powershell
git diff --check
git status --short --branch
```

Confirm no database, build, or temporary browser artifacts are tracked.

- [ ] **Step 3: Real-browser acceptance**

Use Playwright CLI with read-only mocked API responses.

At `320px`, `360px`, `407px`, and `412px`:

- confirm no horizontal overflow;
- confirm Market initially selects 市场 + 7d and 标的 requests `type=stock`;
- confirm Track and Stock each show only 最新材料;
- trigger the bottom observer by scrolling and verify one next-page request;
- confirm Today pull adds exactly one workbench and one reports request;
- confirm horizontal dashboard swipes still work.

Repeat at `407px` in dark theme and require zero console errors.

- [ ] **Step 4: Record final evidence**

Report exact test counts, type/build exits, viewport results, commits, and clean Git status. Do not run database tests.
