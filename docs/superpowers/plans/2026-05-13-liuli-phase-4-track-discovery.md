# Liuli Phase 4 Track Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the phase 4 `track_discovery` backend loop from `docs/liuli_system_spec_v6.md`: track theses, validation indicators, evidence, related stocks, status history, market-radar candidates, and job registration.

**Architecture:** Keep judging-layer business logic inside `invest_assistant/modules/track_discovery/`. The module reads market radar heat/source data through local SQLAlchemy models and does not introduce `theme/topic/subject`. It does not perform stock analysis scoring or AI judgment.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Pydantic v2, SQLite, pytest.

---

## Scope

In scope:
- Tables: `track_thesis`, `track_validation_indicator`, `track_evidence`, `track_related_stock`, `track_status_history`.
- APIs under `/api/track-discovery` matching spec section 31.9.
- Candidate generation from latest `market_radar.tag_heat_snapshot` rows for `tag.type == "track"`.
- Evidence creation from `market_radar.source_item`.
- Jobs: `track_discovery.generate_candidates`, `track_discovery.collect_evidence`, `track_discovery.refresh_related_stocks`.

Out of scope:
- Stock analysis scoring.
- AI-generated thesis evaluation.
- Frontend pages.
- New tag terminology outside `track`.

## Tasks

- [ ] Add failing track discovery tests for thesis CRUD, indicators, evidence, related stocks, status history, and market-radar candidates.
- [ ] Implement SQLAlchemy models and Pydantic schemas.
- [ ] Implement service functions for all child resources and status transitions.
- [ ] Implement candidate generation from market radar heat snapshots.
- [ ] Implement router and register it in `bootstrap/app.py`.
- [ ] Implement job definitions.
- [ ] Run `pytest -q`, `python -m compileall invest_assistant`, and old-name scan.
