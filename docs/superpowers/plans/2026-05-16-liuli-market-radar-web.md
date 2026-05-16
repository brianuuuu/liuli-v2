# Liuli Market Radar Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Market Radar from generic tables into a usable business workbench for source signals, tag heat, candidate review, trends, and stock-track relations.

**Architecture:** Keep backend routes and tables unchanged. Extend the existing `marketRadar.ts` client with typed functions, split the Market Radar Web sections by tab, and use ECharts only through `ChartCard`. Control-console ownership remains separate; Market Radar pages can display and operate business data owned by `market_radar`.

**Tech Stack:** React 18, TypeScript, Vite 5, Ant Design 6, ECharts via `echarts-for-react`, existing FastAPI market radar endpoints.

---

### Task 1: Typed Market Radar Client

**Files:**
- Modify: `invest_assistant/ui/web/src/types/api.ts`
- Modify: `invest_assistant/ui/web/src/api/marketRadar.ts`

- [ ] Add `MarketTag`, `SourceItem`, `TagHeat`, `TagCandidate`, and graph response types.
- [ ] Add typed functions for source creation, filtered tag lists, tag trend, stock-track graph, and stock-hotword graph.
- [ ] Keep existing control-console tag APIs compatible.

### Task 2: Split Market Radar Sections

**Files:**
- Create: `invest_assistant/ui/web/src/pages/market-radar/sections/shared.tsx`
- Create: `invest_assistant/ui/web/src/pages/market-radar/sections/OverviewSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/market-radar/sections/RankingsSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/market-radar/sections/SourcesSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/market-radar/sections/TagsSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/market-radar/sections/CandidatesSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/market-radar/sections/GraphSection.tsx`
- Modify: `invest_assistant/ui/web/src/pages/market-radar/sections.tsx`

- [ ] Keep `sections.tsx` as a dispatcher only.
- [ ] Preserve the existing secondary tab keys from `navigation.tsx`.

### Task 3: Overview And Rankings Workbench

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/market-radar/sections/OverviewSection.tsx`
- Modify: `invest_assistant/ui/web/src/pages/market-radar/sections/RankingsSection.tsx`

- [ ] Overview shows source count, active tags, pending candidates, latest ranking timestamp.
- [ ] Overview shows top hotword/track/stock lists and a heat bar chart from real ranking data.
- [ ] Rankings tab supports window and type switching, with table columns for rank, tag, heat score, trigger/source count, change ratio, stat time.
- [ ] Tag row selection shows trend chart using `GET /tags/{tag_id}/trend`.

### Task 4: Sources, Tags, Candidates

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/market-radar/sections/SourcesSection.tsx`
- Modify: `invest_assistant/ui/web/src/pages/market-radar/sections/TagsSection.tsx`
- Modify: `invest_assistant/ui/web/src/pages/market-radar/sections/CandidatesSection.tsx`

- [ ] Sources tab supports manual source item creation and detail drawer.
- [ ] Tags tab supports type/status filtering and trend preview.
- [ ] Candidates tab supports create, approve, merge, reject, and status filtering.
- [ ] Stock tags remain read-only in Market Radar editing flows.

### Task 5: Relation Graph

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/market-radar/sections/GraphSection.tsx`

- [ ] Graph tab uses `/graphs/stock-track` and `/graphs/stock-hotword`.
- [ ] Supports relation type and window switching.
- [ ] Shows real graph nodes/edges when available; empty state otherwise.

### Task 6: Verify And Document

**Files:**
- Modify: `README.md`

- [ ] Run `cd invest_assistant\ui\web; npm.cmd run build`.
- [ ] Run `pytest -q --basetemp=var/cache/pytest`.
- [ ] Browser-smoke the Market Radar tab rendering.
- [ ] Update README current Web status.
- [ ] Commit the completed implementation.
