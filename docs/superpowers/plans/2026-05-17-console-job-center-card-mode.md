# Console Job Center Card Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将控制台任务中心主列表改为紧凑卡片模式，并保留现有运维操作闭环。

**Architecture:** 不改后端 API 和数据模型。新增一个前端 `JobCard` 展示组件，`JobsSection` 负责数据加载、筛选、选中任务、弹窗和日志区。

**Tech Stack:** React 18, TypeScript, Ant Design, existing CSS variables.

---

## Files

- Create: `invest_assistant/ui/web/src/pages/console/sections/JobCard.tsx`
- Modify: `invest_assistant/ui/web/src/pages/console/sections/JobsSection.tsx`
- Modify: `invest_assistant/ui/web/src/styles/global.css`
- Modify: `README.md`

## Tasks

- [x] Add this design spec and implementation plan.
- [x] Create `JobCard.tsx` with status tags, compact metadata, and four actions.
- [x] Replace the job table in `JobsSection.tsx` with toolbar filters and a card grid.
- [x] Keep run/config/detail modals and run request/log tabs working with selected job in a right-side detail area.
- [x] Add focused card-grid CSS using existing `--ll-*` variables.
- [x] Update README to note task-center card mode.
- [x] Run `npm.cmd run build`.
- [x] Browser smoke: open Console -> 任务中心, verify cards, filters, and selected-job logs title.
