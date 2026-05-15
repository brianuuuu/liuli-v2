# Liuli Phases 5-8 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining MVP backend stages from `docs/liuli_system_spec_v6.md`: stock analysis, alert center, portfolio, and knowledge base feedback.

**Architecture:** Continue on the current branch without switching branches. Keep each business capability inside its own module directory, use phase 1 auth/database/job-center primitives, and do not change Web or Android technology stacks.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Pydantic v2, SQLite, pytest.

---

## Scope

In scope:
- Stage 5 `stock_analysis`: pool, notes, score snapshots, compare groups, stock thesis.
- Stage 6 `alert_center`: alert rules, alert events, rule evaluation job with deterministic heat/event checks.
- Stage 7 `portfolio`: portfolios, positions, review records, simple weight/cost summary.
- Stage 8 `knowledge_base`: notes, skills, agents, feedback logs, jobs for skill extraction and agent compilation placeholders.

Out of scope:
- Frontend pages.
- AI provider calls.
- Brokerage/trading operations.
- Advanced valuation engines or portfolio optimization.

## Tasks

- [ ] Add failing tests for all remaining module APIs and job registrations.
- [ ] Implement `stock_analysis` models, schemas, service, router, jobs.
- [ ] Implement `alert_center` models, schemas, service, router, jobs.
- [ ] Implement `portfolio` models, schemas, service, router.
- [ ] Implement `knowledge_base` models, schemas, service, router, jobs.
- [ ] Register models in bootstrap database, routers in app, jobs in registry.
- [ ] Run `pytest -q`, `python -m compileall invest_assistant`, and old-name scan.
