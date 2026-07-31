# Android News Pull-To-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the news count/refresh toolbar with current-tab pull-to-refresh.

**Architecture:** Wrap each `NewsTimeline` in the shared `PullToRefresh`. Before refetching, trim the current infinite-query cache to its first page so refresh preserves visible content while rebuilding pagination from page one.

**Tech Stack:** React 18, TanStack React Query 5, TypeScript, Vitest, Testing Library.

## Global Constraints

- Refresh only the active news tab.
- Preserve horizontal paging, details navigation, and load-more behavior.
- Do not change backend APIs or pagination fields.

---

### Task 1: Replace The Toolbar With Pull-To-Refresh

**Files:**
- Modify: `invest_assistant/ui/android/h5/src/pages/NewsPage.tsx`
- Modify: `invest_assistant/ui/android/h5/src/styles.css`
- Test: `invest_assistant/ui/android/h5/tests/app.test.tsx`

**Interfaces:**
- Consumes `PullToRefresh.onRefresh: () => Promise<unknown>` and query key `['news', tab]`.
- Produces one pull-refresh region per `NewsTimeline`.

- [ ] Write a failing integration test that verifies the count text and `刷新资讯` button are absent, performs a qualifying pull on the active tab, and asserts only that tab's request count increases.
- [ ] Extend the test with two loaded pages, refresh, then load more; assert the post-refresh next request uses offset `30`, not the stale third-page offset.
- [ ] Run the focused test and verify RED because `timeline-toolbar` still exists and no pull region is rendered.
- [ ] Import `useQueryClient` and `PullToRefresh`; trim only `['news', tab]` cache to `pages.slice(0, 1)` and matching `pageParams.slice(0, 1)`, then await `query.refetch()`.
- [ ] Remove `RefreshCw` and `timeline-toolbar` JSX and delete only toolbar-specific CSS selectors.
- [ ] Run the focused test, pull-to-refresh component tests, typecheck, and verify GREEN.
- [ ] Commit with `git commit -m "feat(android): add news pull to refresh"`.

### Task 2: Verify Android H5

**Files:**
- Verify only: `invest_assistant/ui/android/h5`.

**Interfaces:**
- Consumes Task 1.
- Produces verification evidence only.

- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `git diff --check`.
