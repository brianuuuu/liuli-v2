# Android AI Suggestion Refresh And Position Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the pending AI recommendation list after a successful approval while returning the user to the same visual position.

**Architecture:** Capture a one-shot return anchor when a recommendation card opens, pass it through React Router state, and optimistically remove the approved row from every matching React Query infinite cache before returning. The list restores the anchor after rendering, clears the one-shot router state, and lets the invalidated pending query refetch in the background.

**Tech Stack:** React 18, React Router 6, TanStack React Query 5, TypeScript, Vitest, Testing Library, JSDOM.

## Global Constraints

- Only the Android H5 AI recommendation approval flow changes.
- Single-item rejection and batch rejection behavior remain unchanged.
- Keep the existing backend API, database, pagination, sorting, and query-key prefix.
- Do not run database tests or any command that modifies database data.
- Preserve already-loaded infinite-query pages and avoid a blank loading state on return.

---

### Task 1: Capture And Restore The Recommendation List Position

**Files:**
- Modify: `invest_assistant/ui/android/h5/src/pages/AiSuggestionsPanel.tsx`
- Test: `invest_assistant/ui/android/h5/tests/app.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type AiSuggestionReturnState = {
    scrollY: number;
    anchorId?: number;
    anchorOffset?: number;
  };
  ```
- Produces router detail state:
  ```ts
  {
    suggestion: AiTagSuggestion;
    returnState: AiSuggestionReturnState;
  }
  ```
- Consumes return router state:
  ```ts
  { aiSuggestionReturn?: AiSuggestionReturnState }
  ```

- [ ] **Step 1: Write the failing anchor-capture and restoration tests**

  Extend `app.test.tsx` with an integration test that serves two pending suggestions, fixes `window.scrollY` at `640`, and gives the second card an initial `getBoundingClientRect().top` of `180`. Click the first card, approve it, then make the returned second card report `top: 100`.

  Assert:

  ```ts
  await waitFor(() => expect(window.location.hash).toBe("#/tasks"));
  expect(screen.queryByText("第一条推荐词")).not.toBeInTheDocument();
  expect(await screen.findByText("第二条推荐词")).toBeInTheDocument();
  await waitFor(() => {
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 560,
      behavior: "auto"
    });
  });
  ```

  Add a fallback case whose anchor is absent after approval and assert:

  ```ts
  expect(window.scrollTo).toHaveBeenCalledWith({
    top: 640,
    behavior: "auto"
  });
  ```

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run:

  ```powershell
  npm.cmd test -- --run tests/app.test.tsx -t "restores the AI recommendation"
  ```

  Expected: FAIL because card navigation does not capture an anchor and the returned list does not call `scrollTo`.

- [ ] **Step 3: Add stable card identifiers and capture the return state**

  In `AiSuggestionsPanel.tsx`, export `AiSuggestionReturnState`, read the current route with `useLocation()`, and add the stable card attribute:

  ```tsx
  data-suggestion-id={item.id}
  ```

  Change `openReview` to derive the next loaded row from `rows`, read its card rectangle, and navigate with:

  ```ts
  const returnState: AiSuggestionReturnState = {
    scrollY: window.scrollY,
    anchorId: nextItem?.id,
    anchorOffset: nextCard?.getBoundingClientRect().top
  };
  navigate(`/tasks/suggestions/${item.id}`, {
    state: { suggestion: item, returnState }
  });
  ```

- [ ] **Step 4: Restore and consume the one-shot return state**

  In `AiSuggestionsPanel`, read `location.state.aiSuggestionReturn`. Once query data and the target card are rendered, schedule one animation frame.

  If the anchor exists, restore with:

  ```ts
  const top = window.scrollY
    + anchor.getBoundingClientRect().top
    - returnState.anchorOffset;
  window.scrollTo({ top, behavior: "auto" });
  ```

  Otherwise call:

  ```ts
  window.scrollTo({ top: returnState.scrollY, behavior: "auto" });
  ```

  Clear the one-shot state with:

  ```ts
  navigate("/tasks", { replace: true, state: null });
  ```

  Cancel a pending animation frame during effect cleanup.

- [ ] **Step 5: Run the focused tests and verify they pass**

  Run:

  ```powershell
  npm.cmd test -- --run tests/app.test.tsx -t "restores the AI recommendation"
  ```

  Expected: PASS for both anchor and fallback restoration.

- [ ] **Step 6: Commit the position behavior**

  ```powershell
  git add -- invest_assistant/ui/android/h5/src/pages/AiSuggestionsPanel.tsx invest_assistant/ui/android/h5/tests/app.test.tsx
  git commit -m "feat(android): restore AI suggestion list position"
  ```

### Task 2: Remove The Approved Row And Revalidate The Pending List

**Files:**
- Modify: `invest_assistant/ui/android/h5/src/pages/AiSuggestionReviewPage.tsx`
- Modify: `invest_assistant/ui/android/h5/tests/app.test.tsx`

**Interfaces:**
- Consumes detail router state:
  ```ts
  {
    suggestion?: AiTagSuggestion;
    returnState?: AiSuggestionReturnState;
  }
  ```
- Produces list router state:
  ```ts
  { aiSuggestionReturn: AiSuggestionReturnState }
  ```
- Uses existing cache prefix: `["ai-tag-suggestions"]`.

- [ ] **Step 1: Extend the failing approval integration test**

  Record all `GET /api/market-radar/ai-tag-suggestions` calls in the two-item test from Task 1. After approval, assert that:

  ```ts
  expect(screen.queryByText("第一条推荐词")).not.toBeInTheDocument();
  expect(await screen.findByText("第二条推荐词")).toBeInTheDocument();
  expect(pendingListGetCount).toBeGreaterThan(1);
  expect(screen.getByText("待审核 1")).toBeInTheDocument();
  ```

  Keep the existing single-rejection test and assert it still returns without using `aiSuggestionReturn`.

- [ ] **Step 2: Run the focused approval and rejection tests and verify the new assertions fail**

  Run:

  ```powershell
  npm.cmd test -- --run tests/app.test.tsx -t "recommendation"
  ```

  Expected: the new approval refresh/cache assertions FAIL while the existing rejection assertion remains green.

- [ ] **Step 3: Split successful approval from the existing rejection finish path**

  Keep the existing rejection `finish` callback unchanged. Add an approval-only callback that:

  ```ts
  client.setQueriesData<InfiniteData<PageDto<AiTagSuggestion>>>(
    { queryKey: ["ai-tag-suggestions"] },
    (data) => removeApprovedSuggestion(data, id)
  );
  window.sessionStorage.removeItem(aiSuggestionSessionKey(id));
  await client.invalidateQueries({
    queryKey: ["ai-tag-suggestions"],
    refetchType: "none"
  });
  navigate("/tasks", {
    replace: true,
    state: returnState ? { aiSuggestionReturn: returnState } : null
  });
  ```

  `removeApprovedSuggestion` returns `undefined` unchanged, returns data unchanged when the ID is absent, and otherwise filters the ID from every page while setting each page’s `total` to `Math.max(0, page.total - 1)`. Preserve `offset`, `limit`, `has_more`, `pageParams`, and item order.

  Attach the new callback only to `approve.onSuccess`.

- [ ] **Step 4: Run the focused recommendation tests and verify they pass**

  Run:

  ```powershell
  npm.cmd test -- --run tests/app.test.tsx -t "recommendation"
  ```

  Expected: PASS, including immediate row removal, corrected total, a post-approval pending-list GET, anchor restoration, fallback restoration, and unchanged rejection behavior.

- [ ] **Step 5: Commit the approval refresh behavior**

  ```powershell
  git add -- invest_assistant/ui/android/h5/src/pages/AiSuggestionReviewPage.tsx invest_assistant/ui/android/h5/tests/app.test.tsx
  git commit -m "fix(android): refresh AI suggestions after approval"
  ```

### Task 3: Verify The Android H5

**Files:**
- Verify: `invest_assistant/ui/android/h5`

**Interfaces:**
- Consumes the completed Tasks 1-2 implementation.
- Produces verification evidence only.

- [ ] **Step 1: Run the Android H5 full test suite**

  ```powershell
  npm.cmd test
  ```

  Expected: all Vitest tests pass.

- [ ] **Step 2: Run TypeScript validation**

  ```powershell
  npm.cmd run typecheck
  ```

  Expected: exit code `0`.

- [ ] **Step 3: Run the production build**

  ```powershell
  npm.cmd run build
  ```

  Expected: exit code `0`; the existing Vite chunk-size warning is acceptable.

- [ ] **Step 4: Check patch hygiene and repository status**

  ```powershell
  git diff --check
  git status --short
  ```

  Expected: no whitespace errors and no unrelated changes.
