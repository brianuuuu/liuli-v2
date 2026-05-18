# AGENTS.md

## Project Constraints

- The system architecture must follow `docs/liuli_system_spec_v6.md` as the single source of truth.
- Do not reuse the old project's directory structure, module boundaries, table structure, or architecture design.
- The `old/` directory is only a functional reference for implementation details such as data fetching, API calls, parsing logic, historical scripts, prompts, and sample data.
- If old implementation details conflict with the new spec, the new spec wins.
- Migrated features must be reimplemented under the new system structure instead of copied from old code.
- Keep module boundaries clear, business logic cohesive, and code paths short.
- Do not switch branches for the current Liuli rewrite work. Continue development in the current branch unless the user explicitly changes this instruction.

## Web And Mobile Constraints

- Web and Android must not change their technology stack without explicit user approval.
- Backend technology choices must strictly follow `docs/liuli_system_spec_v6.md`.
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
- Future Web UI work must follow `docs/superpowers/specs/2026-05-16-liuli-web-ui-spec.md` for typography, colors, layout, lines, tables, buttons, light theme, and dark theme constraints.
- Stock tags and stock-track tag bindings are different concepts:
  - `stock` tags are system-derived from stock lifecycle and must not be manually maintained in the Console tag library.
  - A stock can bind to multiple `track` tags as research judgment.
  - The primary stock-to-track binding entry is Stock Analysis.
  - Track Discovery provides the reverse maintenance entry by track tag.
  - Console can view/manage tag definitions, but must not be the stock-track binding workflow owner.
