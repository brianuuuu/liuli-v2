# Liuli V20 Spec Alignment Design

## Decision

Use `docs/liuli_system_spec_v20.md` as the latest project standard and `docs/liuli_database_schema_spec_v5.md` as the database field reference. Align the current in-development implementation to v20 without preserving old API compatibility or migrating old data.

This is a development-stage business design convergence, not a platform rewrite. Keep the current FastAPI, SQLAlchemy, React, Vite, Ant Design, ECharts, module directories, shared components, authentication, job center, report library, stock master, disclosure library, and other reusable framework pieces.

## Scope

The alignment covers business model, database model, API shape, Web secondary navigation, and page ownership for these v20 deltas:

- Web two-level menu follows v20.
- Market Radar uses `source_item` as the unified information feed.
- `tag` is a statistical/index projection, not a general CRUD label library.
- `/console/tags` becomes tag index governance.
- `/console/tag-candidates` is removed.
- `stock` master data and `stock_pool` research state are distinct.
- `track`, `track_alias`, and `tag(type=track)` are aligned with `track` as the business entity and tag as projection.
- `hotword_alias` is added.
- Portfolio only manages real portfolios and real positions.
- Track Discovery APIs are centered on `tracks`.

## Architecture

### Market Radar

Market Radar owns market signal ingestion, `source_item`, tag extraction, tag heat snapshots, tag edge snapshots, tag candidates, and hotword creation. `source_item` is the unified feed for news, announcements, policies, sentiment, and research summaries. `source_item.related_type` and `source_item.related_id` are optional links back to source business objects.

`tag` remains physically under Market Radar because it powers market statistics, but it is treated as an index layer:

- `tag(type=stock)` is projected from `stock`.
- `tag(type=track)` is projected from `track`.
- `tag(type=hotword)` is created through the Market Radar hotword workflow.

Market Radar tag candidate review remains in Market Radar. Console does not own candidate review.

### Track Discovery

Track Discovery is centered on `track`. A track has aliases, theses, validation indicators, evidence, and status history. `track_alias` resolves market language to a track. Each track has a one-to-one `tag(type=track)` projection used by Market Radar statistics.

Old thesis-first routes and UI concepts are replaced with track-first routes and pages. Theses remain important, but they are children of a track.

### Stock Analysis

`stock` remains objective stock master data under Stock Master. `stock_pool` is the research pool and carries candidate, watching, core, archived, and rejected state. Candidate stocks are represented by `stock_pool.status = candidate`.

Confirmed stock-to-track research judgment is `stock_track_relation(stock_id, track_id)`, not a stock-to-track-tag binding. Market Radar tag edges remain market co-occurrence signals, not research-confirmed relationships.

### Portfolio

Portfolio is real portfolio management only. It contains portfolios, real-position groups, real positions, trades, and reviews. Candidate, observing, and focus-tracking states stay in `stock_pool`.

`portfolio_group` is a real-position grouping model with group types such as `core`, `satellite`, `defensive`, `cash`, and `custom`.

### Console

Console remains an operations panel. It hosts system status, job center, data sources, stock master, tag index governance, disclosure library, system config, and AI audit logs.

`/console/tags` is tag index governance. It can view, filter, inspect bindings, inspect heat/index health, inspect alias hits, disable abnormal tags, and merge duplicates. It is not the main creation workflow for stock tags, track tags, or generic business labels.

`/console/tag-candidates` is removed from Web navigation and route handling.

## Web Navigation

The Web two-level menu follows v20:

- Dashboard: today overview, key alerts, watched objects, latest reports.
- Market Radar: market overview, feed, tag heat, tag candidates, hotwords, graph.
- Track Discovery: track overview, track library, track evidence, track comparison.
- Stock Analysis: stock overview, stock pool, stock events, stock comparison.
- Alert Center: alert events, alert rules, alert review.
- Portfolio: portfolio overview, real positions, trades, portfolio review.
- Knowledge Base: notes, review learnings, principles, Skills, Agents, feedback.
- Console: system status, job center, data sources, stock master, tag index, disclosures, system config, AI audit logs.

The existing tab-shell implementation can stay. Labels, keys, rendered sections, and API clients change to match v20.

## Data Flow

1. External information enters Market Radar as `source_item`.
2. Alias resolution maps `stock_alias`, `track_alias`, and `hotword_alias` to official tags.
3. Source-tag extraction writes `source_tag`.
4. Tag statistics write `tag_heat_snapshot` and `tag_edge_snapshot`.
5. Candidate tracks are `track.status = candidate`; candidate stocks are `stock_pool.status = candidate`.
6. Research confirmation writes `stock_track_relation`.
7. Real actions are managed through Portfolio real positions and reviews.

## API Strategy

Use v20 paths and remove old compatibility routes where they conflict:

- Keep `/api/market-radar/source-items`.
- Keep Market Radar tag heat, graph, and candidate review APIs.
- Add Market Radar hotword APIs for `tag(type=hotword)` and `hotword_alias`.
- Restrict direct tag creation to system projection and hotword creation flows.
- Add `/api/track-discovery/tracks` and child routes for aliases, theses, indicators, evidence, related stocks, and status.
- Align `/api/stock-analysis/pool` to `stock_pool`.
- Add `/api/stock-analysis/candidates` as a filtered stock pool query.
- Replace stock-track-tag binding APIs with stock-track relation APIs based on `track_id`.
- Add portfolio group routes and align positions with `group_id`.

## Testing

Testing focuses on behavior that proves v20 alignment:

- Model/table assertions for new and renamed tables.
- API tests for Market Radar source items, hotwords, tag candidates, Track Discovery tracks, Stock Analysis pool and relations, Portfolio groups and real positions.
- Web build test for v20 navigation labels and removal of `/console/tag-candidates`.
- Regression tests for app boot and existing basic modules.

## Rollout

This project is not live, so the implementation can change table names and APIs directly. No old endpoint compatibility layer, no migration scripts for old local data, and no effort to preserve old sample data is needed.

The work will be implemented in phases:

1. Backend models, schemas, and service primitives.
2. Backend API alignment and tests.
3. Web navigation, API clients, and page sections.
4. Test and documentation updates.
5. Full verification and commit on the current branch.
