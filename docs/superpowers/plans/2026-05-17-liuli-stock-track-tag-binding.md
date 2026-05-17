# Liuli Stock Track Tag Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the clarified stock/tag relationship: stock tags are system-synced from stock lifecycle, while stock-to-track tag bindings are research judgments maintained primarily in Stock Analysis and secondarily from Track Discovery.

**Architecture:** Keep `tag.type=stock` as the system-derived stock identity tag. Add a focused `stock_track_tag_binding` model under `stock_analysis` for research bindings between `stock.id` and `tag.id` where `tag.type=track`. Expose stock-first endpoints in `stock_analysis` and track-tag-first reverse endpoints in `track_discovery`; both use one shared stock-analysis service.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React 18, Ant Design 6, existing typed API clients.

---

### Task 1: Backend Model And Stock Tag Sync

**Files:**
- Modify: `invest_assistant/modules/stock_analysis/models.py`
- Modify: `invest_assistant/modules/stock_analysis/schemas.py`
- Modify: `invest_assistant/modules/stock_analysis/service.py`
- Modify: `invest_assistant/modules/basic/stock_master/service.py`

- [ ] Add `StockTrackTagBinding` with unique `(stock_id, track_tag_id)`.
- [ ] Add schemas for create/read/update.
- [ ] Sync `tag(type=stock, stock_id=stock.id)` during stock import/update.

### Task 2: Backend Routes

**Files:**
- Modify: `invest_assistant/modules/stock_analysis/router.py`
- Modify: `invest_assistant/modules/track_discovery/router.py`

- [ ] Add stock-first routes under `/api/stock-analysis/stocks/{stock_id}/track-tags`.
- [ ] Add reverse routes under `/api/track-discovery/track-tags/{tag_id}/stocks`.
- [ ] Reject non-track tags for track binding.

### Task 3: Tests

**Files:**
- Modify: `tests/unit/test_remaining_phases.py`

- [ ] Assert stock import auto-syncs stock tag.
- [ ] Assert stock-analysis can bind stock to multiple track tags.
- [ ] Assert track-discovery reverse endpoint lists and creates the same binding.

### Task 4: Web API And UI

**Files:**
- Modify: `invest_assistant/ui/web/src/types/api.ts`
- Modify: `invest_assistant/ui/web/src/api/stockAnalysis.ts`
- Modify: `invest_assistant/ui/web/src/api/trackDiscovery.ts`
- Modify: `invest_assistant/ui/web/src/pages/stock-analysis/StockDetailPage.tsx`
- Modify: `invest_assistant/ui/web/src/pages/track-discovery/TrackDiscoveryPage.tsx`

- [ ] Add typed APIs for stock-track tag bindings.
- [ ] Add binding management to Stock Detail as the primary entry.
- [ ] Add reverse track tag binding management to Track Discovery.

### Task 5: Documentation And Verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`

- [ ] Record the constraint in `AGENTS.md`.
- [ ] Update README status.
- [ ] Run frontend build and backend tests.
- [ ] Browser-smoke Stock Analysis and Track Discovery binding sections.
- [ ] Commit the completed implementation.
