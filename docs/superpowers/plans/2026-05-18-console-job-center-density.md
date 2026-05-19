# Console Job Center Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Console Job Center more compact and easier to scan while keeping the current job card workflow.

**Architecture:** This is a Web-only UI refinement. `JobsSection.tsx` owns filtering, summary metrics, and page-level actions; `JobCard.tsx` owns compact card rendering and card action grouping; `global.css` owns sizing, density, and light/dark styling.

**Tech Stack:** React, TypeScript, Ant Design, Vite, existing CSS variables in `global.css`.

---

## File Structure

- Modify `invest_assistant/ui/web/src/pages/console/sections/JobsSection.tsx`
  - Add summary metric calculations.
  - Replace status dropdown with segmented quick status filters.
  - Keep module and enabled filters.
  - Preserve sync, all logs, run, edit, detail, and drawer flows.

- Modify `invest_assistant/ui/web/src/pages/console/sections/JobCard.tsx`
  - Render compact card fields.
  - Keep `运行`, `配置`, `日志`, and `更多` visible as a coordinated low-weight action group.
  - Remove repeated heavy blue primary button styling.

- Modify `invest_assistant/ui/web/src/styles/global.css`
  - Add summary strip styles.
  - Tune toolbar spacing and wrapping.
  - Reduce card min width, min height, padding, and internal gaps.
  - Tune card sizing and coordinated action styles without adding a strong colored status rail.
  - Preserve dark-mode readability.

## Tasks

### Task 1: Add Summary And Toolbar State

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/console/sections/JobsSection.tsx`

- [ ] **Step 1: Add Segmented import**

Update the Ant Design import:

```tsx
import { Button, Drawer, Form, Input, InputNumber, Modal, Segmented, Select, Space, Switch, Tabs, message } from "antd";
```

- [ ] **Step 2: Add quick status state and summary metrics**

In `JobsSection`, replace `statusFilter` with:

```tsx
const [statusFilter, setStatusFilter] = useState<string>("all");
```

Add after `moduleOptions`:

```tsx
const jobSummary = useMemo(() => {
  const failed = jobs.data.filter((job) => job.last_status === "failed" || job.last_status === "error").length;
  const running = jobs.data.filter((job) => job.last_status === "running").length;
  const enabled = jobs.data.filter((job) => job.enabled).length;
  const lastRun = jobs.data
    .map((job) => job.last_run_at)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)))[0];
  return {
    total: jobs.data.length,
    enabled,
    running,
    failed,
    lastRun: lastRun ? formatTime(lastRun) : "-"
  };
}, [jobs.data]);
```

- [ ] **Step 3: Update filtering logic**

Inside `filteredJobs`, replace status matching with:

```tsx
const matchesStatus =
  statusFilter === "all" ||
  (statusFilter === "failed" && (status === "failed" || status === "error")) ||
  (statusFilter === "running" && status === "running") ||
  (statusFilter === "idle" && status === "未运行") ||
  (statusFilter === "completed" && (status === "success" || status === "completed"));
```

Then use:

```tsx
matchesStatus &&
```

instead of:

```tsx
(!statusFilter || status === statusFilter) &&
```

- [ ] **Step 4: Replace toolbar markup**

Before the toolbar, render:

```tsx
<div className="job-summary-strip">
  <div className="job-summary-item">
    <span>全部任务</span>
    <strong>{jobSummary.total}</strong>
  </div>
  <div className="job-summary-item">
    <span>启用</span>
    <strong>{jobSummary.enabled}</strong>
  </div>
  <div className="job-summary-item">
    <span>运行中</span>
    <strong>{jobSummary.running}</strong>
  </div>
  <div className="job-summary-item danger">
    <span>异常</span>
    <strong>{jobSummary.failed}</strong>
  </div>
  <div className="job-summary-item wide">
    <span>最近运行</span>
    <strong>{jobSummary.lastRun}</strong>
  </div>
</div>
```

Replace the status `Select` with:

```tsx
<Segmented
  size="small"
  value={statusFilter}
  onChange={(value) => setStatusFilter(String(value))}
  options={[
    { value: "all", label: "全部" },
    { value: "failed", label: "异常" },
    { value: "running", label: "运行中" },
    { value: "idle", label: "未运行" },
    { value: "completed", label: "已完成" }
  ]}
/>
```

Update the search placeholder to:

```tsx
placeholder="搜索任务名 / 模块 / 描述"
```

- [ ] **Step 5: Run Web build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds. Existing Vite chunk-size warning is acceptable.

### Task 2: Compact Job Card Rendering

**Files:**
- Modify: `invest_assistant/ui/web/src/pages/console/sections/JobCard.tsx`

- [ ] **Step 1: Add Dropdown import**

Update imports:

```tsx
import { Button, Dropdown, Tag } from "antd";
import type { MenuProps } from "antd";
```

- [ ] **Step 2: Add status class helper**

Below `jobStatusColor`, add:

```tsx
function jobStatusClass(status?: string | null) {
  if (status === "success" || status === "completed") return "success";
  if (status === "failed" || status === "error") return "failed";
  if (status === "running") return "running";
  return "idle";
}
```

- [ ] **Step 3: Replace action rendering**

Inside `JobCard`, before `return`, add:

```tsx
const moreItems: MenuProps["items"] = [
  { key: "detail", label: "详情" }
];
```

Replace the `<article>` className with:

```tsx
<article className={`job-card ${selected ? "selected" : ""} ${jobStatusClass(job.last_status)}`} onClick={() => onSelect(job)}>
```

Replace the actions block with:

```tsx
<div className="job-card-actions" onClick={(event) => event.stopPropagation()}>
  <Button size="small" className="job-card-action primary-soft" onClick={() => onRun(job)}>
    {job.last_status === "failed" || job.last_status === "error" ? "重试" : "运行"}
  </Button>
  <Button size="small" className="job-card-action" onClick={() => onEdit(job)}>配置</Button>
  <Button size="small" className="job-card-action" onClick={() => onLogs(job)}>日志</Button>
  <Dropdown
    trigger={["click"]}
    menu={{
      items: moreItems,
      onClick: ({ key }) => {
        if (key === "detail") onDetail(job);
      }
    }}
  >
    <Button size="small" className="job-card-action">更多</Button>
  </Dropdown>
</div>
```

- [ ] **Step 4: Shorten metadata**

Replace the metadata block with:

```tsx
<div className="job-card-meta">
  <span>模块 <strong>{job.module_name}</strong></span>
  <span>最近 <strong>{formatTime(job.last_run_at)}</strong></span>
  <span>触发 <strong>{job.trigger_type || "manual"}</strong></span>
  <span>启用 <strong>{job.enabled ? "是" : "否"}</strong></span>
</div>
```

- [ ] **Step 5: Run Web build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds.

### Task 3: Tune Density CSS

**Files:**
- Modify: `invest_assistant/ui/web/src/styles/global.css`

- [ ] **Step 1: Add summary strip CSS**

Add near existing `.job-center-layout` styles:

```css
.job-summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(112px, 1fr)) minmax(160px, 1.35fr);
  gap: 8px;
}

.job-summary-item {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid var(--ll-border);
  border-radius: 6px;
  background: var(--ll-panel);
}

.job-summary-item span {
  color: var(--ll-muted);
  font-size: 12px;
}

.job-summary-item strong {
  overflow: hidden;
  color: var(--ll-text);
  font-size: 17px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-summary-item.danger strong {
  color: #dc2626;
}
```

- [ ] **Step 2: Replace card grid and card sizing**

Update existing styles:

```css
.job-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}

.job-card {
  display: flex;
  min-height: 158px;
  flex-direction: column;
  gap: 9px;
  overflow: hidden;
  padding: 12px;
  border: 1px solid var(--ll-border);
  border-radius: 7px;
  background: var(--ll-panel);
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}
```

- [ ] **Step 3: Replace metadata and action CSS**

Update:

```css
.job-card-desc {
  display: -webkit-box;
  min-height: 36px;
  margin: 0;
  overflow: hidden;
  color: #475569;
  font-size: 12px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.job-card-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px 9px;
  color: var(--ll-muted);
  font-size: 12px;
}

.job-card-meta span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-card-meta strong {
  color: var(--ll-text);
  font-weight: 600;
}

.job-card-actions {
  display: flex;
  gap: 7px;
  margin-top: auto;
  padding-top: 1px;
}

.job-card-action {
  height: 25px;
  padding: 0 8px;
  border-color: var(--ll-border);
  color: var(--ll-text);
  font-size: 12px;
}

.job-card-action.primary-soft {
  border-color: rgba(37, 99, 235, 0.35);
  background: var(--ll-accent-soft);
  color: var(--ll-accent);
  font-weight: 700;
}
```

- [ ] **Step 4: Add responsive fallback**

Add:

```css
@media (max-width: 1180px) {
  .job-summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .job-summary-item.wide {
    grid-column: span 2;
  }
}
```

- [ ] **Step 5: Run Web build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds.

### Task 4: Browser Smoke And Final Verification

**Files:**
- Verify: `invest_assistant/ui/web`

- [ ] **Step 1: Start or reuse the Web dev server**

Run from `invest_assistant/ui/web`:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

Expected: Vite prints a localhost URL.

- [ ] **Step 2: Open Console Job Center**

Use the browser to open the dev URL and navigate to Console -> 任务中心.

Expected:

- Summary strip is visible.
- Toolbar controls align in one strip.
- Cards are shorter than the original but remain comfortable, near a four-column layout on the screenshot-sized desktop viewport.
- `运行`, `配置`, `日志`, and `更多` are visually coordinated.
- `运行` is not a saturated blue primary block.

- [ ] **Step 3: Build verification**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds. Existing chunk-size warning is acceptable.

- [ ] **Step 4: Commit implementation**

Run:

```powershell
git add invest_assistant/ui/web/src/pages/console/sections/JobsSection.tsx invest_assistant/ui/web/src/pages/console/sections/JobCard.tsx invest_assistant/ui/web/src/styles/global.css docs/superpowers/plans/2026-05-18-console-job-center-density.md
git commit -m "feat: refine job center density"
```

Expected: commit succeeds.
