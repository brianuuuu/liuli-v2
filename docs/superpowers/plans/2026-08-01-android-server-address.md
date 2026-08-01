# Android Server Address and Ranking Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the Android market ranking movement label and make the current server address readable and directly editable on the Me page.

**Architecture:** Keep the existing native bridge and derive the active server from the H5 origin. Add a local edit-state boundary inside `MePage`, with behavior protected by the existing app integration suite and compact layout protected by stylesheet tests.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, CSS, existing Android JavaScript bridge.

## Global Constraints

- Android H5 only; do not modify backend APIs, native persistence, ranking calculations, or databases.
- The ranking label is exactly `位次变化`; values remain `+3`, `-2`, `--`, and `new`.
- The save label must remain horizontal at 320px through 412px CSS viewport widths.

---

### Task 1: Protect the copy and server edit behavior

**Files:**
- Modify: `invest_assistant/ui/android/h5/tests/app.test.tsx`
- Modify: `invest_assistant/ui/android/h5/tests/styles.test.mjs`

**Interfaces:**
- Consumes: `window.location.origin` and `window.LiuliNative.setServer(url)`.
- Produces: integration expectations for `位次变化`, the server display button, edit input, and save action.

- [ ] **Step 1: Write failing tests**

Add assertions that the ranking renders `位次变化` and no longer renders `升降位次`. Add a Me-page test that sees `http://localhost`, clicks the server row, edits the input, and saves a trimmed URL through `setServer`. Add stylesheet assertions for ellipsis and `white-space: nowrap` on the save button.

- [ ] **Step 2: Verify the tests fail for the missing behavior**

Run: `npm.cmd test -- --maxWorkers=1 --minWorkers=1 tests/app.test.tsx tests/styles.test.mjs`

Expected: FAIL because the old label and always-visible empty input are still rendered.

### Task 2: Implement the two-state server row

**Files:**
- Modify: `invest_assistant/ui/android/h5/src/pages/DashboardPage.tsx`
- Modify: `invest_assistant/ui/android/h5/src/pages/MePage.tsx`
- Modify: `invest_assistant/ui/android/h5/src/styles.css`

**Interfaces:**
- Consumes: `nativeBridge.setServer(url: string)`.
- Produces: normal and edit states within the existing settings card.

- [ ] **Step 1: Implement minimal behavior**

Rename the label, initialize the server draft from `window.location.origin`, add an `editingServer` boolean, render a button-like display row when false, and render the input plus save button when true. Trim the value before calling the bridge.

- [ ] **Step 2: Add compact styling**

Use a flexible, `min-width: 0` address body; single-line ellipsis for the URL; and a fixed, non-wrapping save action. Reuse existing color and border variables.

- [ ] **Step 3: Verify focused tests pass**

Run: `npm.cmd test -- --maxWorkers=1 --minWorkers=1 tests/app.test.tsx tests/styles.test.mjs`

Expected: PASS.

### Task 3: Verify and commit

**Files:**
- Verify all files above.

**Interfaces:**
- Consumes: completed implementation.
- Produces: a production-buildable Android H5 change on the current branch.

- [ ] **Step 1: Run full verification**

Run `npm.cmd test -- --maxWorkers=1 --minWorkers=1`, `npm.cmd run typecheck`, `npm.cmd run build`, and `git diff --check` from `invest_assistant/ui/android/h5` as appropriate.

- [ ] **Step 2: Review scope and commit**

Confirm no backend, native persistence, or database files changed, then commit the implementation and tests.
