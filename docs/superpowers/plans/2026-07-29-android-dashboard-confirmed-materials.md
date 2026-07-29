# Android Dashboard Confirmed Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Android H5 Track and Stock dashboards request only materials whose review status is `confirmed`.

**Architecture:** Keep the existing backend routes and dashboard infinite queries unchanged. Add the fixed `status=confirmed` query parameter at the two Android API client methods so every initial and subsequent page shares the same filter.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest, Vite.

## Global Constraints

- “审核通过”对应材料状态 `confirmed`。
- Only Android H5 Track and Stock dashboard material requests change.
- Keep endpoint paths, `limit=10`, offsets, sorting, cache keys, loading states, and material cards unchanged.
- Do not change backend defaults, Web pages, database schema, or database data.
- Do not run database tests.

---

### Task 1: Filter Dashboard Material Requests

**Files:**
- Modify: `invest_assistant/ui/android/h5/tests/api-client.test.ts`
- Modify: `invest_assistant/ui/android/h5/tests/app.test.tsx`
- Modify: `invest_assistant/ui/android/h5/src/api/mobileApi.ts`

**Interfaces:**
- Consumes:
  ```ts
  trackMaterials(offset?: number, limit?: number): Promise<PageDto<TrackMaterial>>
  stockMaterials(offset?: number, limit?: number): Promise<PageDto<StockMaterial>>
  ```
- Produces the same TypeScript signatures, with both requests adding `status=confirmed`.

- [ ] **Step 1: Write failing API client tests**

Add one test that calls both methods with non-zero offsets and asserts the emitted URLs contain all three literal parameters:

```ts
await mobileApi.trackMaterials(10, 10);
await mobileApi.stockMaterials(20, 10);

expect(requests[0].url).toContain("/api/track-discovery/materials");
expect(requests[0].url).toContain("status=confirmed");
expect(requests[0].url).toContain("offset=10");
expect(requests[0].url).toContain("limit=10");
expect(requests[1].url).toContain("/api/stock-analysis/materials");
expect(requests[1].url).toContain("status=confirmed");
expect(requests[1].url).toContain("offset=20");
expect(requests[1].url).toContain("limit=10");
```

- [ ] **Step 2: Strengthen dashboard pagination assertions**

In the existing Track and Stock material-feed tests, require both initial and second-page material request URLs to contain `status=confirmed`. This catches a future change that applies the filter only to one page.

- [ ] **Step 3: Run focused tests and verify RED**

```powershell
cd invest_assistant/ui/android/h5
npm.cmd test -- --run tests/api-client.test.ts tests/app.test.tsx -t "requests only confirmed dashboard materials|shows the track material feed|shows the stock material feed"
```

Expected: FAIL because current material URLs omit `status=confirmed`.

- [ ] **Step 4: Implement the fixed filter**

Change only the two request query objects:

```ts
trackMaterials: (offset = 0, limit = 10) =>
  apiClient.get<PageDto<TrackMaterial>>(
    "/api/track-discovery/materials",
    { status: "confirmed", offset, limit }
  ),
stockMaterials: (offset = 0, limit = 10) =>
  apiClient.get<PageDto<StockMaterial>>(
    "/api/stock-analysis/materials",
    { status: "confirmed", offset, limit }
  ),
```

- [ ] **Step 5: Verify GREEN**

```powershell
npm.cmd test -- --run tests/api-client.test.ts tests/app.test.tsx
npm.cmd run typecheck
```

Expected: both test files and TypeScript checks pass.

- [ ] **Step 6: Run full verification**

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
cd ../../../..
git diff --check
git status --short --branch
```

Do not run backend or database tests.

- [ ] **Step 7: Commit**

```powershell
git add -- `
  invest_assistant/ui/android/h5/src/api/mobileApi.ts `
  invest_assistant/ui/android/h5/tests/api-client.test.ts `
  invest_assistant/ui/android/h5/tests/app.test.tsx
git commit -m "fix(android): filter approved dashboard materials"
```
