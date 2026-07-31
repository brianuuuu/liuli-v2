# Android Stock Material Direction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show confirmed stock materials with the same colored direction labels as track materials.

**Architecture:** Extend the existing private presentation map in `DashboardMaterialFeed` with stock direction aliases. Keep API filtering and pagination unchanged.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library.

## Global Constraints

- Continue requesting `status=confirmed`.
- Do not change backend enums or interfaces.
- Preserve track material behavior and pagination.

---

### Task 1: Add Stock Direction Aliases

**Files:**
- Modify: `invest_assistant/ui/android/h5/src/components/DashboardMaterialFeed.tsx`
- Test: `invest_assistant/ui/android/h5/tests/dashboard-material-feed.test.tsx`

**Interfaces:**
- Consumes `DashboardMaterialItem.direction`.
- Produces labels for `positive`, `negative`, `neutral`, `support`, and `weaken`.

- [ ] Write a failing component test asserting `positive` renders red “利好”, `negative` renders green “利空”, and `noise` renders no direction tag.
- [ ] Run `npm.cmd test -- tests/dashboard-material-feed.test.tsx` and verify RED because stock aliases are absent.
- [ ] Add `positive` and `negative` aliases to `directionPresentation`; leave unknown values absent.
- [ ] Run the focused test and `tests/api-client.test.ts -t "confirmed dashboard materials"`; verify GREEN and confirmed request parameters.
- [ ] Commit with `git commit -m "fix(android): align stock material direction labels"`.

### Task 2: Verify Android H5

**Files:**
- Verify only: `invest_assistant/ui/android/h5`.

**Interfaces:**
- Consumes Task 1.
- Produces verification evidence only.

- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd test`.
- [ ] Run `git diff --check`.
