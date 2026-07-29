# Android Portfolio Treemap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a thumb-friendly Android portfolio treemap that sizes holdings by market value and shows name, current price, and daily percentage change.

**Architecture:** Extend the existing read-only portfolio overview rows with the latest current price and quote time, without changing storage. Build treemap data and ECharts options in a pure Android helper, render them through a focused `PortfolioTreemap` component, and place the chart beneath the existing allocation card.

**Tech Stack:** Python 3, SQLAlchemy, FastAPI JSON serialization, React 18, TypeScript, ECharts 5, Vitest, Testing Library.

## Global Constraints

- Continue development on the current branch; do not create or switch branches.
- Do not modify or clear `var/db/liuli.sqlite3`.
- Do not run tests that call `drop_all`, reset, truncate, delete, or recreate a database.
- Keep the existing Web and Android technology stacks.
- Use the existing `GET /api/portfolios/overview` endpoint and ECharts dependency.
- Preserve portfolio selection, refresh, caching, ordering, and snapshot behavior.
- Do not add a second refresh action to the treemap card.

---

### Task 1: Extend portfolio overview allocation rows

**Files:**
- Modify: `invest_assistant/modules/portfolio/service.py`
- Modify: `invest_assistant/ui/android/h5/src/types/api.ts`
- Modify: `invest_assistant/ui/web/src/types/api.ts`
- Test: `tests/unit/test_portfolio_realtime.py`

**Interfaces:**
- Consumes: existing position fields `current_price` and `quote_time`.
- Produces: stock allocation rows with `current_price: float | None` and `quote_time: datetime | None`; serialized TypeScript fields are `number | null` and `string | null`.

- [ ] **Step 1: Write the failing single-portfolio assertions**

  Extend `test_cash_flows_update_cash_balance_and_overview_totals` so its position has a fixed quote time and the first `pie_items` row must return both fields:

  ```python
  position.current_price = 10
  position.previous_close = 9
  position.quote_time = datetime(2026, 7, 29, 10, 30)
  db.commit()

  assert overview["pie_items"][0]["current_price"] == 10
  assert overview["pie_items"][0]["quote_time"] == datetime(2026, 7, 29, 10, 30)
  ```

- [ ] **Step 2: Write the failing all-portfolio latest-quote test**

  Add a test that creates two portfolios holding the same stock, assigns prices `10` and `10.5` at `09:30` and `10:30`, calls `service.get_overview(db)`, and asserts:

  ```python
  assert len(overview["pie_items"]) == 1
  assert overview["pie_items"][0]["market_value"] == 2050
  assert overview["pie_items"][0]["current_price"] == 10.5
  assert overview["pie_items"][0]["quote_time"] == datetime(2026, 7, 29, 10, 30)
  ```

- [ ] **Step 3: Run the two tests and verify RED**

  Run:

  ```powershell
  pytest -q tests/unit/test_portfolio_realtime.py -k "cash_flows_update_cash_balance_and_overview_totals or overview_uses_latest_quote_for_merged_stock"
  ```

  Expected: both tests fail because allocation rows do not contain `current_price` or `quote_time`. The helper creates only a new `tmp_path` SQLite file and performs no reset/drop operation.

- [ ] **Step 4: Add latest-quote aggregation**

  In `get_overview`, initialize each stock aggregation entry with `current_price` and `quote_time`. For every position with a non-null current price:

  ```python
  candidate_price = position.get("current_price")
  candidate_quote_time = position.get("quote_time")
  if candidate_price is not None and (
      item["current_price"] is None
      or (
          candidate_quote_time is not None
          and (item["quote_time"] is None or candidate_quote_time > item["quote_time"])
      )
  ):
      item["current_price"] = float(candidate_price)
      item["quote_time"] = candidate_quote_time
  ```

  Add both values to stock rows returned by `_allocation_rows`. Leave the synthetic `type="total"` row unchanged.

- [ ] **Step 5: Update shared TypeScript contracts**

  Add optional nullable fields to the Android allocation item shape and Web `PortfolioOverviewAllocationRow`:

  ```ts
  current_price?: number | null;
  quote_time?: string | null;
  day_pct?: number | null;
  ```

  Retain every existing property and do not make the new fields required for older cached responses.

- [ ] **Step 6: Run the backend tests and verify GREEN**

  Run the command from Step 3. Expected: both selected tests pass.

- [ ] **Step 7: Commit the interface extension**

  ```powershell
  git add tests/unit/test_portfolio_realtime.py invest_assistant/modules/portfolio/service.py invest_assistant/ui/android/h5/src/types/api.ts invest_assistant/ui/web/src/types/api.ts
  git commit -m "feat(portfolio): expose latest prices in allocation rows"
  ```

---

### Task 2: Build the treemap data and ECharts renderer

**Files:**
- Create: `invest_assistant/ui/android/h5/src/components/portfolioTreemap.ts`
- Create: `invest_assistant/ui/android/h5/src/components/PortfolioTreemap.tsx`
- Create: `invest_assistant/ui/android/h5/tests/portfolio-treemap.test.ts`

**Interfaces:**
- Consumes:

  ```ts
  export type PortfolioTreemapItem = {
    name: string;
    marketValue: number;
    weight?: number | null;
    currentPrice?: number | null;
    dayPct?: number | null;
  };
  ```

- Produces:

  ```ts
  export function buildPortfolioTreemapOption(
    items: PortfolioTreemapItem[],
    theme: "light" | "dark",
  ): EChartsCoreOption;

  export function PortfolioTreemap(
    props: { items: PortfolioTreemapItem[] },
  ): JSX.Element;
  ```

- [ ] **Step 1: Write failing pure-option tests**

  Add table-driven tests for:

  - positive values use a red fill and label `宁德时代\n¥286.50\n+2.35%`;
  - negative values use a green fill and `-1.20%`;
  - null price/change use neutral fill and `--`;
  - weight below `3` displays only the name, weight from `3` to below `8` displays name plus change, and weight at least `8` displays all three lines;
  - the option uses `type: "treemap"`, `roam: false`, `nodeClick: false`, hidden breadcrumbs, and descending order.

  Read the generated first series datum and assert literal labels and colors rather than reproducing the helper logic in the test.

- [ ] **Step 2: Run the helper test and verify RED**

  Run:

  ```powershell
  npm.cmd test -- tests/portfolio-treemap.test.ts
  ```

  from `invest_assistant/ui/android/h5`.

  Expected: fail because the helper module does not exist.

- [ ] **Step 3: Implement the pure option builder**

  Create stable light/dark red, green, and neutral palettes. Map each item to a treemap datum with:

  - `value = marketValue`;
  - a label selected from the `<3`, `3–<8`, and `>=8` weight thresholds;
  - `¥` price formatted to two decimals or `--`;
  - signed daily percentage formatted to two decimals or `--`;
  - tooltip text containing all three fields even when the visible label is shortened.

  Use restrained theme-specific colors and high-contrast label text. Do not add gradients or random colors.

- [ ] **Step 4: Implement the renderer component**

  Register `TreemapChart`, `TooltipComponent`, and `CanvasRenderer` with `echarts/core`. On mount and item changes:

  - read `document.documentElement.dataset.theme`;
  - initialize ECharts on the component ref;
  - set the generated option;
  - resize through `ResizeObserver`;
  - disconnect and dispose on cleanup.

  Return:

  ```tsx
  <div
    className="portfolio-treemap"
    ref={ref}
    aria-label="标的热力图"
    data-swipe-ignore="true"
  />
  ```

- [ ] **Step 5: Run the helper test and verify GREEN**

  Run the command from Step 2. Expected: all treemap helper tests pass without console warnings.

- [ ] **Step 6: Commit the chart unit**

  ```powershell
  git add invest_assistant/ui/android/h5/src/components/portfolioTreemap.ts invest_assistant/ui/android/h5/src/components/PortfolioTreemap.tsx invest_assistant/ui/android/h5/tests/portfolio-treemap.test.ts
  git commit -m "feat(android): add portfolio treemap chart"
  ```

---

### Task 3: Place the treemap below the allocation card

**Files:**
- Modify: `invest_assistant/ui/android/h5/src/pages/DashboardPage.tsx`
- Modify: `invest_assistant/ui/android/h5/src/styles.css`
- Modify: `invest_assistant/ui/android/h5/tests/app.test.tsx`
- Modify: `invest_assistant/ui/android/h5/tests/styles.test.mjs`

**Interfaces:**
- Consumes: `PortfolioTreemap`, `PortfolioOverview["pie_items"]`, and the existing portfolio overview query.
- Produces: Android DOM order `标的组合 → 标的热力图 → 总市值`.

- [ ] **Step 1: Extend the chart mock and write the failing page test**

  Mock `PortfolioTreemap` so it exposes received names, prices, and changes through an element labelled `标的热力图`. Extend the existing portfolio fixture with:

  ```ts
  {
    label: "宁德时代",
    market_value: 72000,
    weight: 40,
    current_price: 286.5,
    day_pct: 1.2,
    quote_time: "2026-07-29T10:30:00"
  }
  ```

  Assert:

  - the headings occur in the required order;
  - the chart receives `宁德时代`, `286.5`, and `1.2`;
  - selecting another portfolio still makes only the existing `/api/portfolios/overview?portfolio_id=...` request;
  - an empty `pie_items` response shows `暂无标的热力图数据`.

- [ ] **Step 2: Add the failing layout source test**

  Assert that `.portfolio-treemap` has `width: 100%`, `min-width: 0`, and `height: 240px`, and that its card introduces no fixed, sticky, or absolute positioning.

- [ ] **Step 3: Run the page and style tests and verify RED**

  Run:

  ```powershell
  npm.cmd test -- tests/app.test.tsx tests/styles.test.mjs
  ```

  Expected: fail because the treemap card and styles do not exist.

- [ ] **Step 4: Integrate the lazy chart**

  Add a lazy import for `PortfolioTreemap`. Immediately after the existing allocation result, render:

  ```tsx
  <SectionCard title="标的热力图">
    {pieItems.length ? (
      <Suspense fallback={<LoadingState />}>
        <PortfolioTreemap items={pieItems.map((item) => ({
          name: item.label,
          marketValue: item.market_value,
          weight: item.weight,
          currentPrice: item.current_price,
          dayPct: item.day_pct,
        }))} />
      </Suspense>
    ) : <EmptyState title="暂无标的热力图数据" />}
  </SectionCard>
  ```

  Do not add another query, refresh button, sort, or cache key.

- [ ] **Step 5: Add compact responsive styles**

  Add only:

  ```css
  .portfolio-treemap {
    width: 100%;
    min-width: 0;
    height: 240px;
  }
  ```

  ECharts owns the internal rectangles; do not add card shadows, gradients, or horizontal scrolling.

- [ ] **Step 6: Run the page and style tests and verify GREEN**

  Run the command from Step 3. Expected: all selected tests pass.

- [ ] **Step 7: Commit the page integration**

  ```powershell
  git add invest_assistant/ui/android/h5/src/pages/DashboardPage.tsx invest_assistant/ui/android/h5/src/styles.css invest_assistant/ui/android/h5/tests/app.test.tsx invest_assistant/ui/android/h5/tests/styles.test.mjs
  git commit -m "feat(android): show portfolio holdings treemap"
  ```

---

### Task 4: Full verification

**Files:**
- Verify only; do not modify database files.

**Interfaces:**
- Consumes: all preceding commits.
- Produces: a verified Android production build and checked shared interface.

- [ ] **Step 1: Run the safe targeted backend tests**

  Run:

  ```powershell
  pytest -q tests/unit/test_portfolio_realtime.py -k "cash_flows_update_cash_balance_and_overview_totals or overview_uses_latest_quote_for_merged_stock"
  ```

  Confirm the test helper points only to pytest `tmp_path` and the command performs no drop/reset/delete.

- [ ] **Step 2: Run the full Android H5 test suite**

  ```powershell
  npm.cmd test
  ```

  from `invest_assistant/ui/android/h5`.

- [ ] **Step 3: Run TypeScript and production build checks**

  ```powershell
  npm.cmd run typecheck
  npm.cmd run build
  ```

  Expected: both commands exit `0`.

- [ ] **Step 4: Check 320/360/407/412px rendering**

  Start the local H5 dev server with mocked read-only API responses, inspect light and dark themes at all four CSS viewport widths, and verify:

  - `document.documentElement.scrollWidth <= window.innerWidth`;
  - the treemap is exactly `240px` high;
  - the chart remains between “标的组合” and “总市值”;
  - labels remain legible and no chart content covers the bottom navigation.

- [ ] **Step 5: Inspect the final diff**

  ```powershell
  git diff HEAD~3 --check
  git status --short
  ```

  Expected: no whitespace errors and no database, build output, Playwright artifact, or unrelated file changes.

