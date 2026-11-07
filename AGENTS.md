# AGENTS.md

## Project Constraints

- Keep this file entirely in English.
- The long-term system architecture should follow the current technical documentation in `docs/liuli_system_spec.md`.
- Do not reuse the old project's directory structure, module boundaries, table structure, or architecture design.
- The `old/` directory is only a functional reference for implementation details such as data fetching, API calls, parsing logic, historical scripts, prompts, and sample data.
- If old implementation details conflict with the new spec, the new spec wins.
- Migrated features must be reimplemented under the new system structure instead of copied from old code.
- Keep module boundaries clear, business logic cohesive, and code paths short.
- Keep documentation, code comments, and other explanatory text concise and organized; number items where helpful, aim for one sentence per point, and avoid repetitive or excessive explanations.
- Do not switch branches for the current Liuli rewrite work. Continue development in the current branch unless the user explicitly changes this instruction.
- Git commit messages must follow Conventional Commits: `<type>(<scope>): <subject>`; write the subject primarily in Chinese, retaining only necessary English technical terms.
- Before each commit, review the change for unnecessary code and remove confirmed unused code, duplicate implementations, obsolete branches, and needless abstractions; prefer reuse, keep cleanup within the change's scope, and preserve existing functionality.
- Manage the entire Alibaba Cloud production service with the project-root scripts: `bash start_ubuntu_pg.sh` to start and `bash stop.sh` to stop; do not split or replace these scripts or manually start or stop individual backend, Worker, Web, or H5 processes unless explicitly requested.
- Before running any command or test that deletes, drops, resets, recreates, truncates, or otherwise clears database data, confirm with the user first. This includes tests or helpers that call `drop_all`, `create_all` after dropping tables, `reset_db`, migration reset commands, or any command that might point at `var/db/liuli.sqlite3`.
- CRITICAL DATABASE BACKUP CONSTRAINT: Under all circumstances, BEFORE running any test, script, command, or helper that clears, truncates, deletes, or modifies a database table (including partial deletions like filtering on source_type), the agent MUST first create a backup copy of the database file `var/db/liuli.sqlite3` in `var/db/recovery/`. Failing to perform a backup before any table clear or delete operation is strictly UNACCEPTABLE.
- Do not run tests that clear any database, even an apparently isolated test database, unless the user has explicitly approved that exact command in the current conversation. Treat function names such as `reset_db`, `drop_all`, `truncate`, `delete_all`, `recreate`, and migration reset helpers as destructive until proven otherwise. Prefer non-destructive tests, static checks, targeted unit tests without database resets, or explain the verification gap instead of silently clearing data.
- Obtain explicit user approval of the proposed schema changes before adding, deleting, or modifying tables, columns, types, defaults, constraints, indexes, or corresponding `tools/migrations/*.sql` scripts; do not make incidental schema changes during feature development.

## Web And Mobile Constraints

- Do not add unnecessary slogans or explanatory text to Web or App interfaces, including Android H5 / APK; if the interface is unclear without such text, redesign its information structure, controls, and interactions instead of adding more explanation.
- Every UI change must support user, developer, and AI experience through intuitive interactions, maintainable code, and clear semantics and states; preserve existing functionality and check affected interactions and workflows for regressions.
- Web and Android must not change their technology stack without explicit user approval.
- Backend technology choices must strictly follow the current technical documentation in `docs/liuli_system_spec.md`.
- Web primary navigation is six business modules plus the Console operation panel:
  - Market Radar: `invest_assistant/modules/market_radar`
  - Track Discovery: `invest_assistant/modules/track_discovery`
  - Stock Analysis: `invest_assistant/modules/stock_analysis`
  - Alert Center: `invest_assistant/modules/alert_center`
  - Portfolio: `invest_assistant/modules/portfolio`
  - Knowledge Base: `invest_assistant/modules/knowledge_base`
- Console: `invest_assistant/modules/console`
- Console is an operation panel, not a business capability owner. Business capability ownership stays in the six business modules or `invest_assistant/modules/basic/*`.
- Console subpages should host supporting basic modules:
  - Job Center: `invest_assistant/modules/basic/job_center`
  - Report Library: `invest_assistant/modules/basic/report_library`
  - Disclosure Library: `invest_assistant/modules/basic/disclosure_library`
  - Stock Master: `invest_assistant/modules/basic/stock_master`
  - System Config: `invest_assistant/modules/basic/system_config`
  - Auth: `invest_assistant/modules/basic/auth`
- The confirmed Web chart stack is ECharts via `echarts` and `echarts-for-react`.
- Do not add `lightweight-charts` until K-line or intraday market charts are implemented.
- Web theme defaults to light mode and must implement light, dark, and follow-system theme switching in the first Web version. Functional debugging and visual acceptance focus on the light theme first; dark mode can be refined later.
- Tag words, business entities, and business bindings are different concepts:
  - `tag` is a language entry and discrete semantic anchor.
  - `stock`, `track`, and `hotword` are business entities.
  - Entity-tag ownership is expressed through `stock_tag_relation`, `track_tag_relation`, and `hotword_tag_relation`.
  - `stock_track_relation` remains the research-confirmed stock-to-track business binding.
  - Console can view/manage tag definitions, but must not become the main entity-tag binding workflow owner.
