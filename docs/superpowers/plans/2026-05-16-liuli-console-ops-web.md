# Liuli Console Ops Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable Web control-console loop for jobs, stock master, system config, report library, and disclosure library.

**Architecture:** Keep the backend unchanged unless a missing endpoint blocks the Web flow. Extend focused API client files under `invest_assistant/ui/web/src/api`, split console sections by responsibility, and keep `ConsoleSections` as a tab router only. Use the existing Ant Design, common table/card/header components, and the Web UI spec.

**Tech Stack:** React 18, TypeScript, Vite 5, Ant Design 6, axios, existing FastAPI endpoints.

---

### Task 1: Extend Console API Clients

**Files:**
- Modify: `invest_assistant/ui/web/src/api/jobs.ts`
- Modify: `invest_assistant/ui/web/src/api/stocks.ts`
- Modify: `invest_assistant/ui/web/src/api/systemConfig.ts`
- Modify: `invest_assistant/ui/web/src/api/reports.ts`
- Modify: `invest_assistant/ui/web/src/api/disclosures.ts`
- Modify: `invest_assistant/ui/web/src/types/api.ts`

- [ ] Add typed client functions for job update, run requests, job logs, stock import/update/aliases, config create/update, report create/update/delete/content, disclosure create/update/download/parse/source conversion.
- [ ] Keep endpoint paths aligned with existing FastAPI routers.
- [ ] Run `cd invest_assistant\ui\web; npm.cmd run build` and fix TypeScript errors.

### Task 2: Split Console Sections

**Files:**
- Create: `invest_assistant/ui/web/src/pages/console/sections/JobsSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/console/sections/StocksSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/console/sections/SystemConfigSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/console/sections/ReportsSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/console/sections/DisclosuresSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/console/sections/TagsSection.tsx`
- Create: `invest_assistant/ui/web/src/pages/console/sections/StatusSection.tsx`
- Modify: `invest_assistant/ui/web/src/pages/console/sections.tsx`

- [ ] Move existing status/tag/candidate code into focused files.
- [ ] Keep `sections.tsx` as a small dispatcher keyed by console tab.
- [ ] Preserve the current light visual style and dark-mode token compatibility.

### Task 3: Job Center Usability

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/console/sections/JobsSection.tsx`

- [ ] Show job display name, module, trigger type, enabled state, last status, last run, next run.
- [ ] Support enable/disable and basic schedule fields through the existing `PUT /api/jobs/{job_name}` endpoint.
- [ ] Support manual run with JSON params through `POST /api/jobs/{job_name}/run`.
- [ ] Show run requests and selected job logs in the same tab.

### Task 4: Stock Master Usability

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/console/sections/StocksSection.tsx`

- [ ] Show stock code, name, market, exchange, status, updated time.
- [ ] Support keyword search through `GET /api/stocks/search`.
- [ ] Support single/batch import through `POST /api/stocks/import`.
- [ ] Support stock update through `PUT /api/stocks/{stock_id}`.
- [ ] Show aliases for selected stock and allow alias creation.

### Task 5: Config, Report, Disclosure Usability

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/console/sections/SystemConfigSection.tsx`
- Modify: `invest_assistant/ui/web/src/pages/console/sections/ReportsSection.tsx`
- Modify: `invest_assistant/ui/web/src/pages/console/sections/DisclosuresSection.tsx`

- [ ] System config supports create/edit, enabled toggle, and module filter.
- [ ] Report library supports create/edit/delete and content preview when a file exists.
- [ ] Disclosure library supports keyword fetch, manual create/edit, download, parse, and convert to market radar source item.

### Task 6: Verify And Document

**Files:**
- Modify: `README.md`

- [ ] Run `pytest -q --basetemp=var/cache/pytest`.
- [ ] Run `cd invest_assistant\ui\web; npm.cmd run build`.
- [ ] Update README current Web status if the console scope changed.
- [ ] Commit the completed implementation.
