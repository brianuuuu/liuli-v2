# Liuli Phase 2 Market Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the phase 2 `market_radar` backend loop from `docs/liuli_system_spec_v6.md`: source items, tags, rule extraction, heat snapshots, relation snapshots, candidate tags, APIs, and job registration.

**Architecture:** Keep all market-radar business logic inside `invest_assistant/modules/market_radar/`. Reuse only phase 1 shared primitives and job center contracts. Do not modify Web or Android technology stacks, and do not import from `old/`.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Pydantic v2, SQLite, pytest, APScheduler job definitions.

---

## Scope

In scope:
- Tables: `tag`, `source_item`, `source_tag`, `tag_heat_snapshot`, `tag_edge_snapshot`, `tag_candidate`.
- APIs under `/api/market-radar`: overview, source items, tags, rankings, trends, graphs, candidate review.
- Jobs: `market_radar.fetch_news`, `market_radar.extract_tags`, `market_radar.aggregate_heat`, `market_radar.aggregate_edges`.
- Deterministic rule extraction based on tag name and stock alias/name matching.
- Heat and stock-to-track/hotword relation aggregation for `1h`, `24h`, `7d`, and `30d`.
- A CLS fetch helper that uses AkShare if installed and returns a clean failure result if unavailable or failing.

Out of scope:
- Frontend pages.
- AI tag extraction.
- Sentiment sources beyond the `source_item` schema.
- Track discovery judgment logic.
- Old `news_center` tables or old target/tag binding tables.

## Tasks

- [ ] Add failing market radar API tests for tag CRUD, source item creation, rule extraction job, heat rankings, graph edges, and candidate review.
- [ ] Implement SQLAlchemy models and Pydantic schemas in `market_radar`.
- [ ] Implement service functions for tag/source CRUD and candidate review.
- [ ] Implement rule extraction from `source_item` into `source_tag`.
- [ ] Implement heat and edge aggregation snapshots.
- [ ] Implement router and register it in `bootstrap/app.py`.
- [ ] Implement `market_radar.jobs` with four `JobDefinition` entries.
- [ ] Run `pytest -q`, `python -m compileall invest_assistant`, and an old-name import scan.
