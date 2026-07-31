# Portfolio Daily PnL Net Asset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calculate portfolio-level daily profit and return from total net asset movement, excluding only same-day deposits and withdrawals.

**Architecture:** Add one portfolio-service calculation unit that resolves the latest prior snapshot, same-day external cash flow, inception-day behavior, and missing-baseline behavior. Reuse it in portfolio dashboards, overview aggregation, and snapshot persistence while preserving position-level price-change metrics. Propagate nullable aggregate daily PnL through Web and Android types and render missing values as `--`.

**Tech Stack:** Python 3, SQLAlchemy, FastAPI service dictionaries, pytest, React 18, TypeScript, Vitest.

## Global Constraints

- Only `deposit` and `withdraw` are external capital flows.
- `adjustment`, `dividend`, and `interest` remain inside net asset movement.
- A portfolio created on the target Shanghai date with no prior snapshot returns `day_pnl = 0.0` and `day_pct = None`.
- An older portfolio with no prior snapshot returns `day_pnl = None` and `day_pct = None`.
- Position-level `day_pnl` and `day_pct` remain based on current price versus previous close.
- Do not add or migrate database tables and do not rewrite historical snapshots.
- Do not access or modify `var/db/liuli.sqlite3`.
- Obtain explicit approval before running the exact pytest command because it creates isolated temporary SQLite databases.

---

### Task 1: Calculate Single-Portfolio Daily Performance From Net Assets

**Files:**
- Modify: `invest_assistant/modules/portfolio/service.py:162-179,251-351,918-928`
- Test: `tests/unit/test_portfolio_realtime.py`

**Interfaces:**
- Produces:
  ```python
  def _portfolio_daily_performance(
      db: Session,
      portfolio: Portfolio,
      current_total: float,
      target_date: date | None = None,
  ) -> dict:
      # {
      #   "day_pnl": float | None,
      #   "day_pct": float | None,
      #   "adjusted_base": float | None,
      #   "status": "available" | "inception" | "missing_baseline" | "invalid_base",
      # }
  ```
- Consumes `PortfolioValueSnapshot.total_value`, `PortfolioCashFlow.flow_type`, `PortfolioCashFlow.flow_date`, and the existing `_today_shanghai()` helper.
- Keeps `_position_dict()` and `_summary()` position metrics unchanged.

- [ ] **Step 1: Write failing service tests for the agreed cash-flow classification**

  Add a test with target date `2026-07-31`, prior snapshot total `1000`, current position value `900`, and final cash `250`. Record same-day `deposit=100`, `withdraw=20`, `dividend=30`, `interest=10`, and an `adjustment` that sets final cash to `250`.

  Assert the current total is `1150`, net external flow is only `80`, and:

  ```python
  assert overview["summary"]["day_pnl"] == pytest.approx(70)
  assert overview["summary"]["day_pct"] == pytest.approx(70 / 1080 * 100)
  ```

  Set the position's previous close so its position-level daily PnL differs from `70`, then assert the position `day_pct` remains price-based.

- [ ] **Step 2: Write failing tests for inception and missing baselines**

  Add three cases with `_today_shanghai` fixed to `2026-07-31`:

  ```python
  assert new_today_overview["summary"]["day_pnl"] == 0.0
  assert new_today_overview["summary"]["day_pct"] is None

  assert older_without_snapshot["summary"]["day_pnl"] is None
  assert older_without_snapshot["summary"]["day_pct"] is None

  assert monday_overview["summary"]["day_pnl"] == pytest.approx(
      monday_current_total - friday_snapshot_total
  )
  ```

  Set `Portfolio.created_at` explicitly in each fixture so inception classification does not depend on the machine clock.

- [ ] **Step 3: Run the exact targeted test command after explicit user approval and verify RED**

  Run only after approval:

  ```powershell
  $env:TEMP='D:\code\ai\liuli-v2\.tmp\pytest-portfolio-daily-pnl'
  $env:TMP='D:\code\ai\liuli-v2\.tmp\pytest-portfolio-daily-pnl'
  python -m pytest -q tests/unit/test_portfolio_realtime.py -k "net_asset or inception or missing_baseline or previous_snapshot"
  ```

  Expected: FAIL because `get_overview()` still sums position price changes and has no missing-baseline state.

- [ ] **Step 4: Implement the calculation unit**

  In `service.py`, query the latest snapshot strictly before `target_date`:

  ```python
  previous = db.scalar(
      select(PortfolioValueSnapshot)
      .where(
          PortfolioValueSnapshot.portfolio_id == portfolio.id,
          PortfolioValueSnapshot.snapshot_date < target_date,
      )
      .order_by(
          PortfolioValueSnapshot.snapshot_date.desc(),
          PortfolioValueSnapshot.id.desc(),
      )
  )
  ```

  Sum only exact-date deposits and withdrawals, with withdrawals negative:

  ```python
  net_external_flow = sum(
      amount if flow_type == "deposit" else -amount
      for flow_type, amount in rows
  )
  ```

  For a valid prior snapshot calculate:

  ```python
  day_pnl = current_total - float(previous.total_value or 0) - net_external_flow
  adjusted_base = float(previous.total_value or 0) + net_external_flow
  day_pct = day_pnl / adjusted_base * 100 if adjusted_base > 0 else None
  ```

  Convert `portfolio.created_at` to a Shanghai calendar date, treating a naive persisted datetime as UTC. Return inception zero only when that date equals `target_date`; otherwise return the missing-baseline state.

- [ ] **Step 5: Reuse the helper in `get_dashboard()`**

  Preserve `_summary(positions)` as `position_summary`, calculate current cash and total assets, and override only the portfolio summary fields:

  ```python
  performance = _portfolio_daily_performance(
      db,
      portfolio,
      float(position_summary["market_value"] or 0) + cash_amount,
  )
  summary = {
      **position_summary,
      "day_pnl": performance["day_pnl"],
      "day_pct": performance["day_pct"],
  }
  ```

  Keep every `positions[]` row unchanged.

- [ ] **Step 6: Reuse the helper in `get_overview()` and `upsert_value_snapshot()`**

  In `get_overview()`, calculate each portfolio independently. Aggregate `day_pnl` only when every older portfolio has a baseline. Aggregate `day_pct` only when every portfolio returns status `available` and the sum of `adjusted_base` is positive. Return `0.0 / None` for an empty portfolio set.

  Keep `upsert_value_snapshot()` calling `get_dashboard()` so stored `day_pnl` and `day_pct` use the same helper result instead of `_summary()` position totals.

- [ ] **Step 7: Run the approved targeted tests and verify GREEN**

  Run the same approved command from Step 3.

  Expected: all selected tests pass.

- [ ] **Step 8: Commit the backend calculation**

  ```powershell
  git add -- invest_assistant/modules/portfolio/service.py tests/unit/test_portfolio_realtime.py
  git commit -m "fix(portfolio): calculate daily pnl from net assets"
  ```

### Task 2: Propagate Nullable Portfolio PnL To Workbench And Clients

**Files:**
- Modify: `tests/unit/test_workbench_today.py`
- Modify: `invest_assistant/ui/web/src/types/api.ts:914-927`
- Modify: `invest_assistant/ui/web/src/api/console.ts:73-86`
- Modify: `invest_assistant/ui/android/h5/src/types/api.ts:82-96,156-168`
- Modify: `invest_assistant/ui/android/h5/src/pages/DashboardPage.tsx:76-77`
- Test: `invest_assistant/ui/android/h5/tests/app.test.tsx`

**Interfaces:**
- Consumes nullable `overview["summary"]["day_pnl"]` and `day_pct` from Task 1.
- Produces `day_pnl: number | null` in Web `PortfolioOverview`, Web `WorkbenchPortfolioToday`, Android `WorkbenchToday.portfolio_today`, and Android `PortfolioOverview.summary`.

- [ ] **Step 1: Write the failing workbench and Android display tests**

  Update the workbench fixture to create a prior-day `PortfolioValueSnapshot(total_value=1000)` so its existing `1100` current total still yields `day_pnl=100` and `day_pct=10` under the new algorithm.

  Add an Android integration response with:

  ```ts
  portfolio_today: {
    portfolio_count: 1,
    position_count: 1,
    total_value: 1000,
    position_market_value: 900,
    cash_amount: 100,
    day_pnl: null,
    day_pct: null
  }
  ```

  Assert the “今日组合” card renders `--` for both daily metrics and does not apply positive or negative tone classes.

- [ ] **Step 2: Run the Android display test and verify RED**

  Run:

  ```powershell
  npm.cmd test -- tests/app.test.tsx -t "missing portfolio daily performance"
  ```

  Expected: FAIL because the current Android tone expression treats `null` as non-negative.

- [ ] **Step 3: Update nullable client types and Android rendering**

  Change only portfolio-level fields to `number | null`; keep `PortfolioSummary` position-level types unchanged.

  Replace Android's manual comparisons with the existing helper:

  ```tsx
  <b className={valueTone(portfolio.day_pnl)}>{formatSignedMoney(portfolio.day_pnl)}</b>
  <b className={valueTone(portfolio.day_pct)}>{formatSigned(portfolio.day_pct, "%")}</b>
  ```

  Web formatters and `trendClass()` already accept `null`, so no Web component markup change is required.

- [ ] **Step 4: Run client tests and type checks**

  ```powershell
  npm.cmd test -- tests/app.test.tsx -t "missing portfolio daily performance"
  npm.cmd run typecheck
  ```

  Run the first command and Android typecheck from `invest_assistant/ui/android/h5`, then run the Web production build from `invest_assistant/ui/web`:

  ```powershell
  npm.cmd run build
  ```

  Expected: the Android test, Android TypeScript check, and Web production build pass. The Web package has no standalone `typecheck` script.

- [ ] **Step 5: Run the approved workbench test and verify GREEN**

  Run only after approval:

  ```powershell
  $env:TEMP='D:\code\ai\liuli-v2\.tmp\pytest-portfolio-daily-pnl'
  $env:TMP='D:\code\ai\liuli-v2\.tmp\pytest-portfolio-daily-pnl'
  python -m pytest -q tests/unit/test_workbench_today.py -k "portfolio"
  ```

  Expected: the workbench portfolio test passes with the net-asset baseline.

- [ ] **Step 6: Commit interface propagation**

  ```powershell
  git add -- tests/unit/test_workbench_today.py invest_assistant/ui/web/src/types/api.ts invest_assistant/ui/web/src/api/console.ts invest_assistant/ui/android/h5/src/types/api.ts invest_assistant/ui/android/h5/src/pages/DashboardPage.tsx invest_assistant/ui/android/h5/tests/app.test.tsx
  git commit -m "fix(ui): handle unavailable portfolio daily pnl"
  ```

### Task 3: Verify Portfolio, Workbench, Web, And Android

**Files:**
- Verify only: repository test and build targets.

**Interfaces:**
- Consumes completed Tasks 1-2.
- Produces verification evidence only.

- [ ] **Step 1: Run the approved combined backend regression tests**

  Run only after explicit approval:

  ```powershell
  $env:TEMP='D:\code\ai\liuli-v2\.tmp\pytest-portfolio-daily-pnl'
  $env:TMP='D:\code\ai\liuli-v2\.tmp\pytest-portfolio-daily-pnl'
  python -m pytest -q tests/unit/test_portfolio_realtime.py tests/unit/test_workbench_today.py
  ```

  Expected: all selected backend tests pass; all SQLite files are created only under the dedicated temporary directory.

- [ ] **Step 2: Run Android H5 verification**

  From `invest_assistant/ui/android/h5` run:

  ```powershell
  npm.cmd test
  npm.cmd run typecheck
  npm.cmd run build
  ```

  Expected: all tests pass and both checks exit `0`.

- [ ] **Step 3: Run Web verification**

  From `invest_assistant/ui/web` run:

  ```powershell
  npm.cmd run build
  ```

  Expected: the command exits `0`; the standing Vite chunk-size warning is acceptable. The Web package has no standalone `typecheck` script.

- [ ] **Step 4: Check repository hygiene**

  ```powershell
  git diff --check
  git status --short
  ```

  Expected: no whitespace errors and no unrelated changes. Remove only the dedicated `.tmp/pytest-portfolio-daily-pnl` directory if it was created by the approved test command and is untracked; do not remove any other path.
