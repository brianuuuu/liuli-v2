# Android Card Shadow and Markdown Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove shadows from ordinary Android H5 content cards and render GFM Markdown tables correctly with mobile-contained horizontal scrolling.

**Architecture:** Add a focused `MarkdownBody` component that owns the mobile Markdown parser configuration, then use it from the report reader. Keep the existing shared CSS boundary: ordinary cards consume the global `--shadow` token while floating controls keep their independent shadows.

**Tech Stack:** React 18, TypeScript, react-markdown 9, remark-gfm 4, Vitest, Testing Library, CSS.

## Global Constraints

- Modify only `invest_assistant/ui/android/h5`.
- Do not modify Web, Android native business code, backend interfaces, or the database.
- Wide tables must scroll inside the table region and must not create page-level horizontal overflow.
- Do not run database tests or commands that modify database data.

---

### Task 1: Render GFM Tables in the Mobile Report Reader

**Files:**
- Create: `invest_assistant/ui/android/h5/src/components/MarkdownBody.tsx`
- Create: `invest_assistant/ui/android/h5/tests/markdown.test.tsx`
- Modify: `invest_assistant/ui/android/h5/src/pages/DetailPages.tsx`
- Modify: `invest_assistant/ui/android/h5/package.json`
- Modify: `invest_assistant/ui/android/h5/package-lock.json`

**Interfaces:**
- Consumes: `content: string`
- Produces: `MarkdownBody({ content }: { content: string }): JSX.Element`

- [ ] **Step 1: Write the failing table-rendering test**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HashRouter } from "react-router-dom";
import { MobileApp } from "../src/app/MobileApp";
import { tokenStorageKey } from "../src/api/client";

describe("mobile Markdown report", () => {
  beforeEach(() => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/reports/7";
  });

  it("renders a GitHub Flavored Markdown table", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/content")) {
        return new Response("| 名称 | 数值 |\n| --- | ---: |\n| 信息总量 | 485 |");
      }
      return new Response(JSON.stringify({ id: 7, title: "测试报告" }), {
        headers: { "Content-Type": "application/json" }
      });
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QueryClientProvider client={queryClient}>
          <MobileApp />
        </QueryClientProvider>
      </HashRouter>
    );

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "名称" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "485" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- markdown.test.tsx`

Expected: FAIL because the current report reader emits the pipe-delimited source as paragraph text and no element with role `table` exists.

- [ ] **Step 3: Install and register the GFM parser**

Run: `npm.cmd install remark-gfm@^4.0.1`

Create `MarkdownBody.tsx`:

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownBody({ content }: { content: string }) {
  return <article className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></article>;
}
```

Replace the direct `ReactMarkdown` import and usage in `ReportReaderPage` with:

```tsx
import { MarkdownBody } from "../components/MarkdownBody";
```

```tsx
<MarkdownBody content={content.data ?? ""} />
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- markdown.test.tsx`

Expected: PASS with one rendered table test.

- [ ] **Step 5: Commit the Markdown renderer**

```powershell
git add -- invest_assistant/ui/android/h5/src/components/MarkdownBody.tsx invest_assistant/ui/android/h5/src/pages/DetailPages.tsx invest_assistant/ui/android/h5/tests/markdown.test.tsx invest_assistant/ui/android/h5/package.json invest_assistant/ui/android/h5/package-lock.json
git commit -m "fix(android): render markdown tables"
```

### Task 2: Remove Ordinary Content Card Shadows

**Files:**
- Modify: `invest_assistant/ui/android/h5/src/styles.css`
- Create: `invest_assistant/ui/android/h5/tests/styles.test.mjs`

**Interfaces:**
- Consumes: the global CSS custom property `--shadow`
- Produces: `--shadow: none` for ordinary content cards; independent floating-control shadows remain unchanged

- [ ] **Step 1: Write the failing shared-style test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile card elevation", () => {
  it("keeps ordinary content cards flat while floating actions remain elevated", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const lightTheme = styles.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(lightTheme).toMatch(/--shadow:\s*none;/);
    expect(styles).toMatch(/\.floating-button\s*\{[^}]*box-shadow:\s*(?!none)[^;}]+;/s);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- styles.test.mjs`

Expected: FAIL because the light-theme `--shadow` value is still `0 4px 18px rgba(17, 24, 39, .055)`.

- [ ] **Step 3: Flatten ordinary cards**

Change the light-theme token in `styles.css`:

```css
--shadow: none;
```

Keep the existing independent `.floating-button` shadow declaration unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- styles.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the style adjustment**

```powershell
git add -- invest_assistant/ui/android/h5/src/styles.css invest_assistant/ui/android/h5/tests/styles.test.mjs
git commit -m "style(android): flatten content cards"
```

### Task 3: Verify the Complete Mobile H5

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: the completed Markdown renderer and shared styles
- Produces: test, typecheck, and production-build evidence

- [ ] **Step 1: Run all H5 unit tests**

Run: `npm.cmd test`

Expected: all Vitest tests pass.

- [ ] **Step 2: Run TypeScript validation**

Run: `npm.cmd run typecheck`

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Build the production bundle**

Run: `npm.cmd run build`

Expected: exit code 0 and Vite emits `dist`.

- [ ] **Step 4: Check repository hygiene**

Run: `git diff --check`

Expected: no whitespace errors.
