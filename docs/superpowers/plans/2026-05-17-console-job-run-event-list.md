# Console Job Run Event List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用事件流列表替换控制台任务中心右侧运行记录中的嵌套表格。

**Architecture:** 不改后端 API。新增 `JobRunEventList.tsx`，封装运行请求和执行日志的列表渲染；`JobsSection.tsx` 继续负责数据加载和 Tabs。

**Tech Stack:** React 18, TypeScript, Ant Design, existing CSS variables.

---

## Files

- Create: `invest_assistant/ui/web/src/pages/console/sections/JobRunEventList.tsx`
- Modify: `invest_assistant/ui/web/src/pages/console/sections/JobsSection.tsx`
- Modify: `invest_assistant/ui/web/src/styles/global.css`
- Modify: `README.md`

## Tasks

- [x] Add this design spec and implementation plan.
- [x] Create `JobRunEventList.tsx` with `JobRequestEventList` and `JobLogEventList`.
- [x] Replace `Table` usage in the right-side run-record Tabs with event list components.
- [x] Add focused CSS for event rows, status dots, metric chips, and expanded details.
- [x] Update README to mention event-list run records.
- [x] Run `npm.cmd run build`.
- [x] Browser smoke: open Console -> 任务中心, verify right-side run records render as event lists and expandable rows.
