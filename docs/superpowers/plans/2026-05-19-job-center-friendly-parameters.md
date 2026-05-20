# Job Center Friendly Parameters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw JSON-first job actions with a friendlier run/configuration flow while preserving the existing job center API shape.

**Architecture:** Expose each job definition's optional `params_schema` through `JobConfigRead`, then let the Web run modal render a no-parameter confirmation or a compact key-value parameter editor. Keep job execution payloads as `params: object` so backend dispatch remains unchanged.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, React, TypeScript, Ant Design, Vite.

---

### Task 1: Expose Job Parameter Schema

**Files:**
- Modify: `invest_assistant/modules/basic/job_center/schemas.py`
- Modify: `invest_assistant/modules/basic/job_center/service.py`
- Modify: `invest_assistant/ui/web/src/types/api.ts`
- Test: `tests/unit/test_job_center.py`

- [ ] Add a failing API test asserting `params_schema` is returned from `/api/jobs`.
- [ ] Add `params_schema` to the backend read schema and attach it from `JOB_REGISTRY`.
- [ ] Add `params_schema` to the Web `JobConfig` type.
- [ ] Run `pytest tests/unit/test_job_center.py -q`.

### Task 2: Replace Raw JSON-First Run Modal

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/console/sections/JobsSection.tsx`
- Modify: `invest_assistant/ui/web/src/styles/global.css`

- [ ] Replace the `运行参数 JSON` text area with a confirmation panel.
- [ ] Show "此任务无需参数" when no schema exists.
- [ ] Add an advanced key-value parameter editor that creates a JSON object internally.
- [ ] Keep a compact JSON preview for transparency, not as the primary input.
- [ ] Run `npm.cmd run build` in `invest_assistant/ui/web`.

### Task 3: Make Configuration Less Technical

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/console/sections/JobsSection.tsx`

- [ ] Change trigger type labels to Chinese.
- [ ] Add common Cron presets that populate `cron_expr`.
- [ ] Keep direct Cron editing available for advanced schedules.
- [ ] Run `npm.cmd run build` in `invest_assistant/ui/web`.

### Verification

- [ ] Run `pytest tests/unit/test_job_center.py -q`.
- [ ] Run `npm.cmd run build` from `invest_assistant/ui/web`.
- [ ] Browser smoke: open Console -> 任务中心, click `运行`, verify no raw JSON field is required for the default path.
