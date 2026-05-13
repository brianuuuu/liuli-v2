# Liuli Phase 3 Disclosure Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the phase 3 disclosure library backend loop from `docs/liuli_system_spec_v6.md`: CNInfo metadata fetch adapter, file archiving, text/Markdown parsing, job registration, and market radar handoff.

**Architecture:** Keep CNInfo integration inside `invest_assistant/modules/basic/disclosure_library/` because the spec says it should only move to `services/cninfo` after cross-module reuse exists. The module owns repository queries, download/parse status changes, file paths under `var/`, and conversion to `market_radar.source_item`.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Pydantic v2, SQLite, requests/httpx standard library file IO, pytest.

---

## Scope

In scope:
- `repository.py` for idempotent disclosure metadata upsert, filters, and status helpers.
- `cninfo_client.py` module-local adapter with injectable HTTP client and robust JSON parsing.
- `parser.py` for deterministic text/Markdown extraction from local files, with clear failure state.
- API behavior for fetch/download/parse/to-source-item.
- Jobs: `disclosure_library.fetch_cninfo`, `disclosure_library.download_file`, `disclosure_library.parse_pdf`, `disclosure_library.to_market_radar`.

Out of scope:
- Moving CNInfo client to `services/`.
- Full PDF OCR.
- Frontend pages.
- Track discovery and stock analysis handoff beyond 501 placeholders.

## Tasks

- [ ] Add failing disclosure tests for metadata upsert, file download, parse output, and market radar handoff.
- [ ] Implement repository functions and path helpers.
- [ ] Implement CNInfo client adapter with clean error handling.
- [ ] Implement parser that reads bytes/text and writes `.txt` and `.md` artifacts.
- [ ] Update routes to call repository/client/parser and create source items.
- [ ] Update jobs to run real module functions.
- [ ] Run `pytest -q`, `python -m compileall invest_assistant`, and old-name scan.
