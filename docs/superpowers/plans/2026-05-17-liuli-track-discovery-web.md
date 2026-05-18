# Liuli Track Discovery Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Track Discovery from generic tables into a usable workbench for candidate tracks, tracked theses, evidence, validation indicators, related stocks, and status changes.

**Architecture:** Keep backend routes and tables unchanged. Extend `trackDiscovery.ts` with typed API functions, split page sections by secondary tab, and reuse the existing detail route for focused thesis work. Market Radar remains the upstream signal source; Track Discovery owns thesis validation and evidence.

**Tech Stack:** React 18, TypeScript, Vite 5, Ant Design 6, existing FastAPI track-discovery endpoints.

---

### Task 1: Typed Track Discovery Client

**Files:**
- Modify: `invest_assistant/ui/web/src/types/api.ts`
- Modify: `invest_assistant/ui/web/src/api/trackDiscovery.ts`

- [ ] Add types for thesis, market candidate, indicator, evidence, related stock, and status change.
- [ ] Add typed functions for create/update/archive thesis, status change, indicators, evidence, related stocks, and candidate listing.

### Task 2: Split Track Discovery Main Page

**Files:**
- Create: `invest_assistant/ui/web/src/pages/track-discovery/sections/shared.tsx`
- Create: `invest_assistant/ui/web/src/pages/track-discovery/sections/OverviewSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/track-discovery/sections/CandidatesSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/track-discovery/sections/ThesesSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/track-discovery/sections/EvidenceSection.tsx`
- Modify: `invest_assistant/ui/web/src/pages/track-discovery/TrackDiscoveryPage.tsx`

- [ ] Keep the page layout consistent with Web UI spec.
- [ ] Keep secondary tabs from `navigation.tsx`: overview, candidates, theses, evidence.

### Task 3: Candidate And Thesis Workflows

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/track-discovery/sections/CandidatesSection.tsx`
- Modify: `invest_assistant/ui/web/src/pages/track-discovery/sections/ThesesSection.tsx`

- [ ] Candidates tab lists Market Radar track candidates by window.
- [ ] Candidate rows can create a thesis prefilled from tag and heat data.
- [ ] Theses tab supports create, edit, archive, and status change.
- [ ] Theses table links to `/track-discovery/theses/:id`.

### Task 4: Thesis Detail Workbench

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/track-discovery/TrackDetailPage.tsx`

- [ ] Detail page loads thesis by id.
- [ ] Show core thesis fields, status, confidence, horizon.
- [ ] Support edit and status change.
- [ ] Show and create validation indicators.
- [ ] Show and create evidence.
- [ ] Show and create related stocks.

### Task 5: Evidence Overview

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/track-discovery/sections/EvidenceSection.tsx`

- [ ] Evidence tab asks user to select a thesis from a compact selector.
- [ ] Show evidence, indicators, and related stock counts for the selected thesis.
- [ ] Provide quick entry for new evidence.

### Task 6: Verify And Document

**Files:**
- Modify: `README.md`

- [ ] Run `cd invest_assistant\ui\web; npm.cmd run build`.
- [ ] Run `pytest -q --basetemp=var/cache/pytest`.
- [ ] Browser-smoke Track Discovery tabs and detail page rendering.
- [ ] Update README current Web status.
- [ ] Commit the completed implementation.
