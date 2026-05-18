# Liuli Stock Analysis Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Stock Analysis from generic tables into a usable workbench for stock pool, scores, notes, reports, compare groups, and stock detail research.

**Architecture:** Keep backend routes and tables unchanged. Extend `stockAnalysis.ts` with typed API functions, split page sections by secondary tab, and use the existing stock detail route for per-stock research. K-line and intraday charts are explicitly out of scope for this stage.

**Tech Stack:** React 18, TypeScript, Vite 5, Ant Design 6, ECharts via existing chart wrapper where useful, existing FastAPI stock-analysis endpoints.

---

### Task 1: Typed Stock Analysis Client

**Files:**
- Modify: `invest_assistant/ui/web/src/types/api.ts`
- Modify: `invest_assistant/ui/web/src/api/stockAnalysis.ts`

- [ ] Add types for stock pool item, research note, score snapshot, compare group.
- [ ] Add typed functions for create/update pool item, notes, scores, compare groups, and reports listing.

### Task 2: Split Stock Analysis Main Page

**Files:**
- Create: `invest_assistant/ui/web/src/pages/stock-analysis/sections/shared.tsx`
- Create: `invest_assistant/ui/web/src/pages/stock-analysis/sections/OverviewSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/stock-analysis/sections/PoolSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/stock-analysis/sections/ScoresSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/stock-analysis/sections/ReportsSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/stock-analysis/sections/CompareSection.tsx`
- Modify: `invest_assistant/ui/web/src/pages/stock-analysis/StockAnalysisPage.tsx`

- [ ] Keep secondary tab keys from `navigation.tsx`.
- [ ] Preserve the compact terminal workstation visual style.

### Task 3: Pool, Scores, Reports, Compare

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/stock-analysis/sections/PoolSection.tsx`
- Modify: `invest_assistant/ui/web/src/pages/stock-analysis/sections/ScoresSection.tsx`
- Modify: `invest_assistant/ui/web/src/pages/stock-analysis/sections/ReportsSection.tsx`
- Modify: `invest_assistant/ui/web/src/pages/stock-analysis/sections/CompareSection.tsx`

- [ ] Pool supports add/update pool item by stock id and links to detail page.
- [ ] Scores tab lets user select a stock id and create/list score snapshots.
- [ ] Reports tab shows current report endpoint state without fake data.
- [ ] Compare tab supports create/list compare groups.

### Task 4: Stock Detail Workbench

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/stock-analysis/StockDetailPage.tsx`

- [ ] Detail page loads notes and scores by stock id.
- [ ] Support creating research notes and score snapshots.
- [ ] Show score trend chart from real score snapshot data.

### Task 5: Verify And Document

**Files:**
- Modify: `README.md`

- [ ] Run `cd invest_assistant\ui\web; npm.cmd run build`.
- [ ] Stop local dev servers before backend tests if they share the default SQLite file.
- [ ] Run `pytest -q --basetemp=var/cache/pytest`.
- [ ] Browser-smoke Stock Analysis tabs and detail page rendering.
- [ ] Update README current Web status.
- [ ] Commit the completed implementation.
