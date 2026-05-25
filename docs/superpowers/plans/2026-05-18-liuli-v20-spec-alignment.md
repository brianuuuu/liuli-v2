# Liuli V20 Spec Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Align the in-development Liuli v2 implementation with `liuli_system_spec_v20.md` and `liuli_database_schema_spec_v5.md` without old API compatibility or data migration.
**Migration policy (current phase):** No formal migration in this phase. Legacy tables are only deprecated and must no longer receive writes (`stock_alias` / `track_alias` / `hotword_alias` / `tag_candidate`).

**Architecture:** Preserve the current FastAPI, SQLAlchemy, React, Vite, Ant Design, ECharts, module directories, and reusable components. Change conflicting business models, APIs, Web menus, and tests directly to the v20 business design: `source_item` feed, tag index governance, track-first discovery, `stock_pool`, real portfolio groups, and hotword aliases.

**Tech Stack:** Python 3, FastAPI, SQLAlchemy 2, Pydantic, pytest, React 18, Vite, Ant Design, ECharts.

---

## File Structure

- Modify `invest_assistant/modules/market_radar/models.py`: add `HotwordAlias`, add `Tag.track_id`, remove `Tag.category`, add `SourceItem.related_type/related_id`, align `TagCandidate`.
- Modify `invest_assistant/modules/market_radar/schemas.py`: expose v20 fields and add hotword schemas.
- Modify `invest_assistant/modules/market_radar/service.py`: add tag index governance helpers, hotword creation, candidate approval with v20 fields.
- Modify `invest_assistant/modules/market_radar/router.py`: restrict ordinary tag creation, add hotword and tag governance endpoints.
- Modify `invest_assistant/modules/track_discovery/models.py`: add `Track` and `TrackAlias`; move child tables from thesis-first to track-first where needed.
- Modify `invest_assistant/modules/track_discovery/schemas.py`: add track-first schemas and retain child resource schemas.
- Modify `invest_assistant/modules/track_discovery/service.py`: implement track CRUD, alias CRUD, thesis/evidence/indicator children, candidate query by `track.status`.
- Modify `invest_assistant/modules/track_discovery/router.py`: add `/tracks` routes and remove tag-binding ownership.
- Modify `invest_assistant/modules/stock_analysis/models.py`: rename table to `stock_pool`, add `source/reason`, replace `StockTrackTagBinding` with `StockTrackRelation`.
- Modify `invest_assistant/modules/stock_analysis/schemas.py`: align pool and relation schemas.
- Modify `invest_assistant/modules/stock_analysis/service.py`: implement stock pool updates, candidate filter, stock-track relation APIs.
- Modify `invest_assistant/modules/stock_analysis/router.py`: add `/candidates`, replace track-tag routes with track relation routes.
- Modify `invest_assistant/modules/portfolio/models.py`: add `PortfolioGroup`; extend `PortfolioPosition` with `group_id/current_price/market_value/target_weight/note/status`.
- Modify `invest_assistant/modules/portfolio/schemas.py`, `service.py`, `router.py`: add group routes and aligned position payloads.
- Modify `invest_assistant/ui/web/src/app/navigation.tsx`: align v20 menu keys and labels and remove console tag candidates.
- Modify Web API clients and page sections under `invest_assistant/ui/web/src/api` and `invest_assistant/ui/web/src/pages`: align labels, routes, and key data flows.
- Modify tests under `tests/unit` and `tests/integration`: replace outdated v6/v15 assumptions with v20 assertions.

## Tasks

### Task 1: Backend Model Alignment

**Files:**
- Modify: `invest_assistant/modules/market_radar/models.py`
- Modify: `invest_assistant/modules/track_discovery/models.py`
- Modify: `invest_assistant/modules/stock_analysis/models.py`
- Modify: `invest_assistant/modules/portfolio/models.py`

- [x] Add v20 SQLAlchemy models and table fields.
- [x] Remove v20-conflicting table names and fields from model declarations.
- [x] Run `python -m compileall invest_assistant/modules`.

### Task 2: Backend Schema And Service Alignment

**Files:**
- Modify: `invest_assistant/modules/market_radar/schemas.py`
- Modify: `invest_assistant/modules/market_radar/service.py`
- Modify: `invest_assistant/modules/track_discovery/schemas.py`
- Modify: `invest_assistant/modules/track_discovery/service.py`
- Modify: `invest_assistant/modules/stock_analysis/schemas.py`
- Modify: `invest_assistant/modules/stock_analysis/service.py`
- Modify: `invest_assistant/modules/portfolio/schemas.py`
- Modify: `invest_assistant/modules/portfolio/service.py`

- [x] Align payloads and response models with v20.
- [x] Implement hotword aliases and tag index governance helpers.
- [x] Implement track-first service flows.
- [x] Implement `stock_pool` and `stock_track_relation` flows.
- [x] Implement portfolio groups and real-position fields.
- [x] Run focused pytest after each module is aligned.

### Task 3: Backend Router Alignment

**Files:**
- Modify: `invest_assistant/modules/market_radar/router.py`
- Modify: `invest_assistant/modules/track_discovery/router.py`
- Modify: `invest_assistant/modules/stock_analysis/router.py`
- Modify: `invest_assistant/modules/portfolio/router.py`

- [x] Expose v20 endpoint shapes.
- [x] Remove conflicting old workflow endpoints from active frontend use.
- [x] Ensure errors are explicit for invalid tag/track/stock relationships.
- [x] Run API unit tests.

### Task 4: Web Navigation And API Client Alignment

**Files:**
- Modify: `invest_assistant/ui/web/src/app/navigation.tsx`
- Modify: `invest_assistant/ui/web/src/api/marketRadar.ts`
- Modify: `invest_assistant/ui/web/src/api/trackDiscovery.ts`
- Modify: `invest_assistant/ui/web/src/api/stockAnalysis.ts`
- Modify: `invest_assistant/ui/web/src/api/portfolio.ts`
- Modify: `invest_assistant/ui/web/src/types/api.ts`

- [x] Update primary and secondary menu labels to v20.
- [x] Remove `tag-candidates` from console navigation.
- [x] Add hotword, track, stock relation, and portfolio group client functions.
- [x] Run TypeScript build to catch route/type drift.

### Task 5: Web Page Alignment

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/market-radar/**`
- Modify: `invest_assistant/ui/web/src/pages/track-discovery/**`
- Modify: `invest_assistant/ui/web/src/pages/stock-analysis/**`
- Modify: `invest_assistant/ui/web/src/pages/portfolio/**`
- Modify: `invest_assistant/ui/web/src/pages/console/**`

- [x] Rename and adjust Market Radar sections to market overview, feed, tag heat, candidates, hotwords, graph.
- [x] Convert Track Discovery page to tracks as the main object.
- [x] Convert Stock Analysis relation UI to track relations by `track_id`.
- [x] Add portfolio group and real-position fields to portfolio UI.
- [x] Convert Console Tags to tag index governance and remove tag-candidates page branch.

### Task 6: Tests And Verification

**Files:**
- Modify: `tests/unit/test_market_radar.py`
- Modify: `tests/unit/test_track_discovery.py`
- Modify: `tests/unit/test_remaining_phases.py`
- Modify: `tests/integration/test_app_boot.py`

- [x] Update tests for v20 table and API shape.
- [x] Add assertions for removed console tag candidates navigation and v20 menus.
- [x] Run `pytest`.
- [x] Run `python -m compileall invest_assistant`.
- [x] Run `npm.cmd run build` from `invest_assistant/ui/web`.
- [x] Commit all implementation changes on the current branch.
