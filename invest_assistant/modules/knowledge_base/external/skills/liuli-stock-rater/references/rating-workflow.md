# Rating Workflow Reference

## Contents

1. Researcher context
2. Financial data window
3. Light data validation (step 3)
4. Announcement and news evidence
5. Brief peer comparison (step 7)
6. Rating sections
7. Disconfirmation review (step 9)
8. Trailing JSON
9. Research-feedback upload

## Researcher context

Build the context in this order:

```text
研究员元信息
简介 intro
价值观 soul
方法论 method
```

Use the single `knowledge_base.get_researcher_profile` response as both metadata and content. Include `id`, `researcher_code`, `display_name`, `status`, `profile_path`, `profile_hash`, `intro`, `soul`, `method`, and `profile_content` in the evidence scope when available. Do not call legacy standalone soul or method tools. Stop when `researcher_code` is absent.

## Local stock context

After loading the researcher, resolve the exact security through `stock_analysis.list_pool(q, limit)`. Use the returned `stock_id` rather than the pool row `id`. `get_stock_profile(stock_id, sections, history_limit)` supports `score/valuation/materials/disclosures/tracks/notes/tags`; request relevant sections explicitly (for example `materials/disclosures/score`). Default data is not the complete material archive. `score` and `valuation` return only `latest_score` and `latest_valuation`; neither default nor explicit sections provide `score_history` or `valuation_history`. Do not increase `history_limit` to retrieve those histories or treat their absence as an error. For returned material/disclosure and other list sections, inspect available `*_total` and `truncated`, and adjust `history_limit` only for relevant list coverage; do not invent pagination arguments. Prior ratings and valuations require date checks and must not substitute for fresh evidence. When a track comparison matters, use verified `track_ids` with `get_track_detail(track_id, sections, list_limit)`; materials and history likewise require explicit sections.

For historical research, search `report_library.list_reports(q=company name or report-title keyword, limit, offset)`, then call `read_report_content` with the actual returned report ID. Check report type, research date, cutoff, and body before comparing conclusions. Historical reports are research documents, not proof of imported score/valuation snapshots or a complete snapshot history; report gaps explicitly.

## Financial data window

Prefer annual statements for the latest 3–5 fiscal years plus the latest available quarter or interim period and matching prior-year periods. Use Tushare structured data before scraped or community data. Only use disclosures available by the stated cutoff; for historical ratings, exclude later restatements not then known.

Minimum coverage:

```text
stock_basic
income
balancesheet
cashflow
fina_indicator
daily_basic
```

Check, when supported by the available data:

- Revenue and profit trends.
- Gross margin, net margin, ROE, ROA, asset turnover, and debt ratio.
- Operating cash flow relative to net profit.
- Capital expenditure or fixed-asset intensity when relevant.
- PE, PB, PS, dividend yield, total market value, and circulating market value from `daily_basic`.

## Light data validation (step 3)

Perform the light checks in every full rating. Keep a compact record of issue, source/period, treatment, and effect on confidence; create a separate notebook only when requested or when complex reconciliation makes it useful.

- **Identity and revisions:** group records by company, period, report type, and statement scope. Separate consolidated and parent statements. Prefer a supported latest disclosed revision as of the cutoff using actual announcement/update metadata. Count rows before and after deduplication; do not arbitrarily choose between conflicting records with insufficient revision metadata.
- **Units:** inspect endpoint definitions. Tushare financial amounts are commonly yuan while daily market value and share fields may use ten-thousand units. Do not apply one multiplier to all endpoints. Reconcile price × shares with market value allowing documented display precision; describe an unexplained small difference as unresolved, not a proven rounding cause.
- **Periods:** distinguish cumulative income/cash flow from single-quarter figures. Derive Q2 as H1 minus Q1 only for matching scope, definitions, and revisions; do not subtract margins or ratios. Present relevant year-over-year and year-end comparisons together when they tell different stories, particularly for receivables, inventory, and contract liabilities.
- **Identities and meaning:** check assets = liabilities + equity and gross margin against revenue/cost where applicable. Resolve gross/net, expensed/total R&D, capitalization, cash/cash-equivalent, restricted-cash, and term-deposit differences through statement notes. A field-name mismatch or cash-equivalent gap alone is not proof of accounting misconduct or a liquidity problem.
- **Missing and unsuitable ratios:** preserve missing values as null. A loss-making company's missing PE is not zero or cheap; avoid cash-conversion ratios with negative or near-zero profit as a stand-alone quality conclusion. Adapt checks to sector accounting instead of imposing industrial-company ratios on financial firms.
- **Conflicting sources:** use Tushare as the structured starting point and dated official full text to resolve material definitions or corrections. Record both original and corrected values and their source when changing a figure. Treat news/Bigdata as supplementary; do not average incompatible values. If unresolved, withhold the metric from definitive scoring claims and identify affected dimensions.

For deeper problems, optionally use Data Analytics `analyze-data-quality` and relevant diagnostic or notebook guidance. Request a bounded reconciliation task, not a replacement rating framework. Do not require the plugin to perform basic checks.

## Announcement and news evidence

Prioritize official evidence:

```text
CNINFO announcements
exchange filings
annual and interim reports
company official releases
```

Search Liuli `market_radar.search_source_items` first. For announcements, prefer:

```text
source_type = announcement
source_name = cninfo
q = company name or stock code
```

Use `start_time` / `end_time` (`YYYY-MM-DD` or ISO timestamps) for the evidence window, and `limit` / `offset` with `has_more` for pagination. Verify returned publication dates. Control initial text with `content_chars`; for a material item marked `content_truncated`, narrow the same search and set `content_chars=0`, matching the returned item ID. This reads all stored content, which may still be only an ingested summary; verify official source text for material claims. Do not confuse list-level `truncated` with item-level text truncation.

Use news and opinion as secondary evidence:

```text
Eastmoney and Sina Finance: recent company and industry news
Xueqiu and Zhihu: sentiment, debate, investor concerns, narrative shifts
```

Use community evidence to surface risks, consensus, controversy, and expectation changes. Do not use it to override structured financials or official announcements.

Trace each material assertion to the issuer, date, disclosure period, and primary text. Distinguish a product approval from sales/orders, a director appointment from an executive appointment, and a parent's business from assets or profits owned by the listed company. Use these checks within the existing announcement workflow.

Optionally route a specific evidence gap to the matching Bigdata skill, such as company brief, risk assessment, catalyst monitor, or earnings-quality screen. Verify the returned security is the exact issuer and exchange before using its data. Use a bounded query and, if useful, one language/alias retry; stop on empty coverage, unavailable entitlement, or no material incremental evidence. Do not run a full suite by default. State which capability actually ran and what it added. Missing estimates or price targets mean no supported consensus; opinion snippets are not analyst consensus. Reconcile material vendor financials against official definitions through step 3.

## Brief peer comparison (step 7)

Seek 1–2 listed peers with relevant products, customers, geography, and economics. Identify primary and secondary comparables and explain differences. Do not substitute a similarly named group company for an unlisted operating competitor.

Use a compact table with issuer/code, reporting period, revenue growth, gross margin, profitability/ROE, valuation date and usable multiple, and comparability caveats where data permits. Match periods and ratio definitions; do not silently compare annual and interim data or annualize interim ROE. Leave missing cells blank/null with an explanation. A loss-making issuer's PE may be inapplicable.

Use Public Equity Investing's relevant comparable-company methodology when available and helpful. Keep full peer-universe screening, normalized earnings, multiple distributions, and sensitivity valuation optional. Do not mechanically use peer median margins or multiples as the target's fair value. Explain which rating claim the comparison supports or weakens. When no defensible comparison is available, report the search/coverage gap and limit the affected conclusion rather than block the whole rating.

## Rating sections

Apply the profile method's dimensions and weights first. When it does not impose a stricter structure, use:

```text
商业模式与护城河
管理层
公司治理
战略与竞争格局
经营确定性
成长性
综合评分
估值区间
评级等级
最终 JSON
```

For each scored dimension, include:

- Score.
- Key evidence.
- Counter-evidence or uncertainty.
- Confidence level.

Judge the six dimensions independently. Do not set them all equal to the total score without dimension-specific evidence.

Read the actual profile's score scales, conditional weights, and investment-level thresholds at runtime. Do not hardcode a prior company's profile response or infer missing branches of its method. Check arithmetic and JSON/report agreement after step 9. Clearly define whether a valuation range is price per share or equity value, its units, date, method, and assumptions; use null when the evidence does not support a range.

## Disconfirmation review (step 9)

Challenge at least three material claims before finalizing the rating. Use columns: claim, strongest available opposing evidence, evidence that would invalidate/reverse the claim, next verification point, and rating implication. Include both favorable and adverse claims. If no opposing evidence is found, state that gap rather than fabricate it.

Make verification points concrete, for example the next disclosed interim/annual result or an identified order, margin, cash-flow, or product-delivery metric. Separate observed facts from assumptions and future triggers. Do not invent an event date or create monitoring automatically. Revise only the dimensions whose evidence changed; an unchanged rating is a valid result. A full Public Equity Investing thesis tracker or independent audit is optional and must not replace the profile's scoring rules.

## Trailing JSON

Use the profile method's schema when present. If it has no strict schema, use:

```json
{
  "company_code": "",
  "company_name": "",
  "report_time": "",
  "data_cutoff": "",
  "researcher_code": "<value from researcher profile>",
  "business_moat_score": null,
  "management_score": null,
  "governance_score": null,
  "strategy_score": null,
  "certainty_score": null,
  "growth_score": null,
  "total_score": null,
  "investment_level": "",
  "core_logic": "",
  "primary_risk": "",
  "valuation_range": {
    "low": null,
    "base": null,
    "high": null,
    "currency": "CNY"
  },
  "key_assumptions": [],
  "major_risks": [],
  "evidence_sources": [],
  "confidence": ""
}
```

Use `null` for missing numeric values. Never fabricate unavailable data.

The trailing JSON is the source for later score import. For `标的评级报告`, keep these import fields at the top level and populate them when evidence permits: `company_code`, all six `*_score` fields, `total_score`, `investment_level`, `core_logic`, and `primary_risk`.

## Research-feedback upload

After the Markdown report is complete, call `knowledge_base.upload_research_feedback`. Derive every required metadata value from the current execution:

- `researcher_code`: non-empty value from the current researcher profile response.
- `skill_name`: `liuli-stock-rater` from the current skill frontmatter.
- `business_module`: `stock_analysis`, the verified module for this stock-rating workflow. Do not use `stock` or infer a new module label.

Do not embed a fallback researcher code or replace denied tools. Stop and mark the report as not uploaded if the upload tool is unavailable or not allowlisted, or any required value is missing. An explicit user request for an offline run or no upload skips the write; label that step accordingly. For new uploads use `source="mcp"` and `status="received"`; accepted status values are only `received/parsed/imported`, not `draft`. An unpersisted draft request skips uploading. A receipt does not prove score import.

Use the strict title format `公司名称-YYYY-MM-DD-标的评级报告` and this payload shape:

```json
{
  "title": "公司名称-YYYY-MM-DD-标的评级报告",
  "markdown": "完整 Markdown 报告正文",
  "researcher_code": "<value from researcher profile>",
  "skill_name": "liuli-stock-rater",
  "business_module": "stock_analysis"
}
```

The feedback table is an index only. The report body belongs in the report-library Markdown file. Do not ask the tool or database to persist a second copy in `knowledge_research_feedback`.

Confirm upload only when the response contains all of:

```text
feedback_id
report_id
report_path
status
```

If any field is absent, describe the upload as unconfirmed. Present the receipt separately after upload so the uploaded Markdown still ends with its score JSON and remains identical to the final report supplied to the user. Do not re-upload merely to append a receipt.

An explicit validation rejection before a write may be corrected using documented accepted metadata and retried. A timeout or incomplete receipt may have persisted the report: use `report_library.list_reports(q=exact title, limit, offset)` then `read_report_content(report_id=returned report ID)` to inspect the matching body before retrying, or leave it unconfirmed. Never guess IDs. A listing error (including server-side serialization failure) is not an empty result and does not justify repeating a write; a matching report alone does not prove the feedback index or score import succeeded. Do not require report-library listing as a prerequisite for a normal upload, and never bypass a read/write tool's access denial.
