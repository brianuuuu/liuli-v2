# Top Task Status Latest Job Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the most recent job name and run time inside the existing top status bar task control.

**Architecture:** Keep this Web-only. Move the task status label calculation from `TopStatusBar.tsx` into a small pure helper so the latest-job selection and formatting can be tested without rendering React or Ant Design. `TopStatusBar.tsx` continues to own polling and presentation.

**Tech Stack:** React, TypeScript, Vite, Ant Design, Node with local esbuild for focused helper tests.

---

### Task 1: Task Status Text Helper

**Files:**
- Create: `invest_assistant/ui/web/src/components/layout/taskStatus.ts`
- Create: `invest_assistant/ui/web/src/components/layout/taskStatus.test.mjs`
- Modify: `invest_assistant/ui/web/src/components/layout/TopStatusBar.tsx`
- Modify: `invest_assistant/ui/web/src/styles/global.css`

- [ ] **Step 1: Write the failing test**

Add a focused test that imports the helper after esbuild transpilation and asserts a finished job appears as `最近: 名称 · MM-DD HH:mm`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node invest_assistant/ui/web/src/components/layout/taskStatus.test.mjs`

Expected: FAIL because `taskStatus.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `taskStatus.ts` with `getTaskStatus`, preserving current running/pending/failed priority and appending latest job details when `last_run_at` exists.

- [ ] **Step 4: Wire UI**

Import `getTaskStatus` in `TopStatusBar.tsx`, remove the local helper, and slightly increase `.status-chip` width so the extra text has room while still truncating.

- [ ] **Step 5: Verify**

Run: `node invest_assistant/ui/web/src/components/layout/taskStatus.test.mjs`

Run: `npm.cmd run build` from `invest_assistant/ui/web`.
