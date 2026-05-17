# Market Radar Data Source And Flash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在市场雷达下拆分 `数据源` 和 `快讯` 两个二级入口，快讯使用老平台风格时间轴展示新闻信息。

**Architecture:** 不改后端表结构，不恢复旧 `news_center`。`数据源` 继续使用现有 `SourcesSection` 表格；新增 `FlashSection` 作为 `source_item` 的新闻阅读视图。

**Tech Stack:** React 18, Vite, Ant Design, existing FastAPI APIs.

---

## Tasks

- [x] Rename market-radar `sources` tab label from `市场快讯` to `数据源`.
- [x] Add a new `flashes` tab labeled `快讯`.
- [x] Remove `同步财联社` from `SourcesSection`; keep only manual data-source management.
- [x] Create `FlashSection.tsx` with timeline feed, filters, important toggle, sync button, and detail drawer.
- [x] Add focused CSS in `global.css` matching current Liuli UI variables.
- [x] Update README to describe `数据源 / 快讯` split.
- [x] Run `npm.cmd run build`, full pytest, compileall, and browser smoke.
