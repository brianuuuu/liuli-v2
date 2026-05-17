# Console Job Log Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将控制台任务中心运行记录从固定右侧面板改为右侧抽屉，支持单任务日志和全部日志。

**Architecture:** 不改后端。`JobsSection` 增加日志抽屉状态，复用 `JobRequestEventList` 和 `JobLogEventList`；全部执行日志通过并发调用现有 `listJobLogs(jobName)` 合并。

**Tech Stack:** React 18, TypeScript, Ant Design Drawer/Tabs, existing CSS variables.

---

## Files

- Modify: `invest_assistant/ui/web/src/pages/console/sections/JobsSection.tsx`
- Modify: `invest_assistant/ui/web/src/styles/global.css`
- Modify: `README.md`

## Tasks

- [x] Add this design spec and implementation plan.
- [x] Remove the fixed right-side run-record panel from `JobsSection`.
- [x] Add log drawer state for single-job and all-job modes.
- [x] Wire card `日志` action to open the single-job drawer.
- [x] Add toolbar `查看所有日志` button and aggregate all job logs with existing APIs.
- [x] Reuse event-list tabs inside the drawer.
- [x] Adjust CSS so job cards use full width and remove fixed side-panel layout.
- [x] Update README to describe log drawer behavior.
- [x] Run `npm.cmd run build`.
- [x] Browser smoke: verify full-width card grid, single-job drawer, and all-log drawer.
