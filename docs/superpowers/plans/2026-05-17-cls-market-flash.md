# CLS Market Flash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接入财联社市场快讯到 `market_radar.source_item`，并把 Web 入口明确为“市场快讯”。

**Architecture:** 不新增配置项，不新增新闻中心模块。继续使用 `market_radar.fetch_news` 任务和 `source_item` 表，增加 AkShare 财联社数据标准化、增量去重和任务统计。

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Pydantic v2, SQLite, pytest, React 18, Vite, Ant Design.

---

## Files

- Modify: `invest_assistant/modules/market_radar/jobs.py`
- Modify: `invest_assistant/modules/market_radar/service.py`
- Modify: `invest_assistant/ui/web/src/app/navigation.tsx`
- Modify: `invest_assistant/ui/web/src/pages/market-radar/sections/SourcesSection.tsx`
- Modify: `README.md`
- Test: `tests/unit/test_market_radar.py`

## Tasks

- [ ] Add a failing pytest that monkeypatches the CLS fetcher and verifies duplicate runs insert only new `source_item` rows.
- [ ] Implement row normalization and duplicate detection in `market_radar`.
- [ ] Rename the Web secondary tab and card labels from “信息源” to “市场快讯”.
- [ ] Run focused pytest, full pytest, compileall, and frontend build.
- [ ] Commit the completed phase.
